"""
IX ID Domain Verification Service
====================================
Issues and validates DNS TXT challenges for DOMAIN verification claims.
Policy version: domain-v1. DNS TXT evidence only. No .well-known, no AI.

All claim creation and lifecycle transitions flow exclusively through
ixid_transition_service.py. This service orchestrates the domain-specific
ceremony; the Transition Service owns the claim state machine.

Confirmed-negative protocol (arch spec §4.3):
  Two independent resolver observations + minimum 1-hour delay required
  before ACTIVE → RECHECK_REQUIRED. A single DNS failure never starts
  the grace clock. DNS errors are operational telemetry; they are not
  observations of artifact absence.

Renewal: a fresh challenge + independent DNS proof creates a new DOMAIN
  claim; the prior claim transitions to SUPERSEDED through the Transition
  Service.
"""

import calendar
import logging
import secrets
import uuid
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from enum import Enum
from typing import Protocol, runtime_checkable

from google.api_core import exceptions as api_exceptions
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from ixid_transition_service import (
    ClaimRecord,
    ClaimStatus,
    TransitionRequest,
    TransitionResult,
    TriggerType,
    build_operation_id,
    create_claim,
    execute_transition,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Policy constants — domain-v1
# ---------------------------------------------------------------------------

VERIFICATION_POLICY_VERSION = "domain-v1"
CHALLENGE_TTL = timedelta(hours=48)
CLAIM_VALIDITY_MONTHS = 12  # calendar months; use _add_claim_validity()
GRACE_PERIOD = timedelta(days=14)
RECHECK_NAMESERVERS = ["8.8.8.8", "1.1.1.1"]
CONFIRMED_NEGATIVE_MIN_DELAY = timedelta(hours=1)
TXT_RECORD_PREFIX = "ixid-verify="


def _add_claim_validity(dt: datetime) -> datetime:
    """
    Add CLAIM_VALIDITY_MONTHS calendar months to dt, clamping to the last
    day of the target month. Preserves hour/minute/second/microsecond.

    Examples:
      2026-01-31 + 12m = 2027-01-31
      2026-02-28 + 12m = 2027-02-28
      2026-01-31 +  1m = 2026-02-28  (clamped from 31 to last day of Feb)
    """
    month_0 = dt.month + CLAIM_VALIDITY_MONTHS - 1
    year = dt.year + month_0 // 12
    month = month_0 % 12 + 1
    last_day = calendar.monthrange(year, month)[1]
    return dt.replace(year=year, month=month, day=min(dt.day, last_day))


# ---------------------------------------------------------------------------
# DNS resolver abstraction
# ---------------------------------------------------------------------------


class DnsResolutionStatus(str, Enum):
    RESOLVED = "RESOLVED"  # DNS query completed; records may be empty
    ERROR = "ERROR"  # DNS query failed; no reliable statement about artifact presence


@dataclass(frozen=True)
class DnsObservation:
    """
    Structured result of a DNS TXT resolution attempt.

    RESOLVED means the DNS query succeeded and the records list is authoritative
    for the domain at the time of the query. ABSENT artifact is a meaningful
    observation only when resolution_status == RESOLVED.

    ERROR means the DNS query itself failed (timeout, SERVFAIL, network
    unreachable, etc.). An ERROR observation provides no information about
    artifact presence or absence and must not participate in the confirmed-
    negative chain.
    """

    resolution_status: DnsResolutionStatus
    records: list[str] = field(default_factory=list)  # meaningful only when RESOLVED
    error_code: str | None = None  # set when status == ERROR


@runtime_checkable
class DnsResolver(Protocol):
    """Observe TXT records for a domain. Returns a structured DnsObservation."""

    def observe_txt(self, domain: str) -> DnsObservation: ...


class SystemDnsResolver:
    """Production resolver: uses system nameservers via dnspython."""

    def observe_txt(self, domain: str) -> DnsObservation:
        try:
            import dns.exception  # type: ignore[import]
            import dns.resolver  # type: ignore[import]

            try:
                answers = dns.resolver.resolve(domain, "TXT")
                records = [rdata.to_text().strip('"') for rdata in answers]
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.RESOLVED, records=records
                )
            except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
                # Authoritative negative responses — TXT record genuinely absent
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.RESOLVED, records=[]
                )
            except dns.exception.Timeout:
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.ERROR,
                    error_code="TIMEOUT",
                )
            except dns.resolver.SERVFAIL:  # type: ignore[attr-defined]
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.ERROR,
                    error_code="SERVFAIL",
                )
            except Exception:  # noqa: BLE001 — catch remaining dnspython exceptions
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.ERROR,
                    error_code="RESOLUTION_ERROR",
                )
        except ImportError:
            return DnsObservation(
                resolution_status=DnsResolutionStatus.ERROR,
                error_code="RESOLVER_UNAVAILABLE",
            )


class NameserverDnsResolver:
    """Resolver targeting a specific nameserver for independent recheck observations."""

    def __init__(self, nameserver: str) -> None:
        self.nameserver = nameserver

    def observe_txt(self, domain: str) -> DnsObservation:
        try:
            import dns.exception  # type: ignore[import]
            import dns.resolver  # type: ignore[import]

            try:
                resolver = dns.resolver.Resolver()
                resolver.nameservers = [self.nameserver]
                answers = resolver.resolve(domain, "TXT")
                records = [rdata.to_text().strip('"') for rdata in answers]
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.RESOLVED, records=records
                )
            except (dns.resolver.NXDOMAIN, dns.resolver.NoAnswer):
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.RESOLVED, records=[]
                )
            except dns.exception.Timeout:
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.ERROR,
                    error_code="TIMEOUT",
                )
            except dns.resolver.SERVFAIL:  # type: ignore[attr-defined]
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.ERROR,
                    error_code="SERVFAIL",
                )
            except Exception:  # noqa: BLE001 — catch remaining dnspython exceptions
                return DnsObservation(
                    resolution_status=DnsResolutionStatus.ERROR,
                    error_code="RESOLUTION_ERROR",
                )
        except ImportError:
            return DnsObservation(
                resolution_status=DnsResolutionStatus.ERROR,
                error_code="RESOLVER_UNAVAILABLE",
            )


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ChallengeStatus(str, Enum):
    PENDING = "PENDING"
    CONSUMED = "CONSUMED"
    EXPIRED = "EXPIRED"


class RecheckOutcome(str, Enum):
    PRESENT = "PRESENT"  # artifact confirmed present; no lifecycle change
    RESTORED = "RESTORED"  # RECHECK_REQUIRED → ACTIVE
    TRANSIENT_FAILURE = (
        "TRANSIENT_FAILURE"  # artifact absent (single observation); no lifecycle change
    )
    CONFIRMED_NEGATIVE = "CONFIRMED_NEGATIVE"  # ACTIVE → RECHECK_REQUIRED
    GRACE_ONGOING = "GRACE_ONGOING"  # RECHECK_REQUIRED, artifact absent, within grace
    GRACE_EXPIRED = "GRACE_EXPIRED"  # RECHECK_REQUIRED → EXPIRED
    DNS_ERROR = (
        "DNS_ERROR"  # resolver failed; no artifact statement; no lifecycle change
    )


# Stored values for primary_result / secondary_result fields in recheck events.
# Three-way — distinct from the two-way PRESENT/ABSENT of earlier design.
_RCHECK_RESULT_PRESENT = "PRESENT"
_RCHECK_RESULT_ABSENT = "ABSENT"
_RCHECK_RESULT_ERROR = "ERROR"


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ChallengeIssuance:
    challenge_id: str
    domain: str
    txt_record_value: str  # the full value to set in DNS TXT
    expires_at: datetime


@dataclass(frozen=True)
class DomainVerificationOutcome:
    success: bool
    claim_id: str | None
    evidence_ref: str | None
    error_code: str | None


@dataclass(frozen=True)
class RecheckResult:
    outcome: RecheckOutcome
    recheck_event_id: str
    transition_result: TransitionResult | None


# ---------------------------------------------------------------------------
# Challenge issuance
# ---------------------------------------------------------------------------


def issue_challenge(
    db: firestore.Client,
    ix_id: str,
    domain: str,
    account_uid: str,
    _now: Callable[[], datetime] | None = None,
) -> ChallengeIssuance:
    """
    Issue a single-use DNS TXT challenge for domain verification.

    The returned txt_record_value must be placed as a TXT record on the
    root domain. The challenge is valid for CHALLENGE_TTL (48h) and may
    only be consumed once by verify_domain().

    This function always issues a fresh challenge. Prior PENDING challenges
    for the same (ix_id, domain) pair remain valid until they expire
    naturally or are consumed.
    """
    now = (_now or (lambda: datetime.now(timezone.utc)))()
    expires_at = now + CHALLENGE_TTL

    # 256-bit token, URL-safe base64 without padding
    token = secrets.token_urlsafe(32)
    txt_value = f"{TXT_RECORD_PREFIX}{token}"
    challenge_id = str(uuid.uuid4())

    challenge_doc: dict[str, object] = {
        "challenge_id": challenge_id,
        "ix_id": ix_id,
        "domain": domain,
        "account_uid": account_uid,
        "challenge_token": token,
        "txt_record_value": txt_value,
        "issued_at": now,
        "expires_at": expires_at,
        "status": ChallengeStatus.PENDING.value,
        "consumed_at": None,
        "verification_record_id": None,
    }

    (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_challenges")
        .document(challenge_id)
        .set(challenge_doc)
    )

    logger.info("Issued domain challenge %s for %s/%s", challenge_id, ix_id, domain)
    return ChallengeIssuance(
        challenge_id=challenge_id,
        domain=domain,
        txt_record_value=txt_value,
        expires_at=expires_at,
    )


# ---------------------------------------------------------------------------
# Domain verification
# ---------------------------------------------------------------------------


def verify_domain(
    db: firestore.Client,
    ix_id: str,
    challenge_id: str,
    account_uid: str,
    supersedes: str | None = None,
    resolver: DnsResolver | None = None,
    _now: Callable[[], datetime] | None = None,
) -> DomainVerificationOutcome:
    """
    Attempt to verify domain ownership by confirming the DNS TXT challenge.

    Steps:
    1. Read and validate challenge (PENDING, unexpired, owned by account_uid)
    2. Observe TXT records for the domain using the provided resolver
    3. If DNS ERROR: return DNS_RESOLUTION_ERROR; challenge stays PENDING
    4. If challenge token found atomically:
       a. Write domain_verification_record (append-only evidence)
       b. Mark challenge CONSUMED
       c. Call create_claim() with evidence reference
    5. If not found: return failure; challenge stays PENDING (can retry)

    supersedes: set to prior claim_id when called from renew_domain_claim().
    """
    now = (_now or (lambda: datetime.now(timezone.utc)))()
    dns = resolver or SystemDnsResolver()

    challenge_ref = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_challenges")
        .document(challenge_id)
    )
    snap = challenge_ref.get()

    if not snap.exists:
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code="CHALLENGE_NOT_FOUND",
        )

    ch = snap.to_dict()

    if ch.get("account_uid") != account_uid:
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code="CHALLENGE_OWNERSHIP_MISMATCH",
        )

    if ch.get("status") == ChallengeStatus.CONSUMED.value:
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code="CHALLENGE_ALREADY_CONSUMED",
        )

    # Wall-clock expiry check (covers both PENDING and legacy EXPIRED status)
    expires_at = ch.get("expires_at")
    if expires_at is not None:
        exp_dt: datetime = (
            expires_at
            if isinstance(expires_at, datetime) and expires_at.tzinfo is not None
            else (
                expires_at.replace(tzinfo=timezone.utc)
                if isinstance(expires_at, datetime)
                else expires_at
            )
        )
        if now >= exp_dt:
            return DomainVerificationOutcome(
                success=False,
                claim_id=None,
                evidence_ref=None,
                error_code="CHALLENGE_EXPIRED",
            )

    domain: str = ch["domain"]
    token: str = ch["challenge_token"]
    expected_txt: str = ch["txt_record_value"]

    # Observe DNS TXT records — structured result distinguishes absence from error
    observation = dns.observe_txt(domain)

    if observation.resolution_status == DnsResolutionStatus.ERROR:
        logger.warning(
            "DNS resolution error during verification for %s (challenge %s): %s",
            domain,
            challenge_id,
            observation.error_code,
        )
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code="DNS_RESOLUTION_ERROR",
        )

    # Resolution succeeded — check for token in returned records
    txt_records = observation.records
    matching = next(
        (r for r in txt_records if r == expected_txt or token in r),
        None,
    )

    if matching is None:
        logger.info(
            "Challenge token not found in DNS TXT for %s (challenge %s)",
            domain,
            challenge_id,
        )
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code="TXT_RECORD_NOT_FOUND",
        )

    # Token confirmed. Derive stable IDs before the transaction.
    verified_at = now
    claim_expires_at = _add_claim_validity(verified_at)
    claim_id = f"domain_{uuid.uuid4().hex}"
    record_id = f"dvr_{challenge_id}"  # deterministic: survives retries

    evidence_doc_ref = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_verification_records")
        .document(record_id)
    )

    # Atomic: consume challenge + write evidence record
    transaction = db.transaction()

    @firestore.transactional
    def _commit(txn: firestore.Transaction) -> None:
        # Re-read challenge inside transaction to prevent TOCTOU
        ch_snap = challenge_ref.get(transaction=txn)
        if not ch_snap.exists:
            raise DomainVerificationError("CHALLENGE_NOT_FOUND")
        ch2 = ch_snap.to_dict()
        if ch2.get("status") != ChallengeStatus.PENDING.value:
            raise DomainVerificationError(
                f"CHALLENGE_STATUS_CHANGED:{ch2.get('status')}"
            )
        evidence_doc: dict[str, object] = {
            "record_id": record_id,
            "ix_id": ix_id,
            "domain": domain,
            "challenge_id": challenge_id,
            "challenge_token": token,
            "verification_policy_version": VERIFICATION_POLICY_VERSION,
            "verified_at": verified_at,
            "claim_expires_at": claim_expires_at,
            "resolver_type": type(dns).__name__,
            "txt_records_observed": txt_records,
            "matching_txt_record": matching,
            "observation_completed_at": now,
        }
        txn.set(evidence_doc_ref, evidence_doc)
        txn.update(
            challenge_ref,
            {
                "status": ChallengeStatus.CONSUMED.value,
                "consumed_at": now,
                "verification_record_id": record_id,
            },
        )

    try:
        _commit(transaction)
    except DomainVerificationError as exc:
        return DomainVerificationOutcome(
            success=False, claim_id=None, evidence_ref=None, error_code=str(exc)
        )

    # Create claim through the Transition Service (owns all claim writes)
    claim_record = ClaimRecord(
        ix_id=ix_id,
        claim_id=claim_id,
        claim_type="DOMAIN",
        subject=domain,
        evidence_type="DNS_TXT",
        evidence_ref=record_id,
        verified_at=verified_at,
        expires_at=claim_expires_at,
        verification_policy_version=VERIFICATION_POLICY_VERSION,
        assurance_level="STANDARD",
        verifier="IX_AUTOMATED",
        supersedes=supersedes,
    )
    create_claim(db, claim_record)

    logger.info("Domain claim created: %s for %s/%s", claim_id, ix_id, domain)
    return DomainVerificationOutcome(
        success=True,
        claim_id=claim_id,
        evidence_ref=record_id,
        error_code=None,
    )


# ---------------------------------------------------------------------------
# Recheck worker
# ---------------------------------------------------------------------------


def run_domain_recheck(
    db: firestore.Client,
    ix_id: str,
    claim_id: str,
    run_id: str,
    resolvers: list[DnsResolver] | None = None,
    _now: Callable[[], datetime] | None = None,
) -> RecheckResult:
    """
    Execute one recheck cycle for a DOMAIN claim.

    DNS error semantics
    -------------------
    A DnsObservation with resolution_status == ERROR means the resolver could
    not produce a trustworthy answer (timeout, SERVFAIL, network failure, etc.).
    Such observations are recorded as primary_result/secondary_result == "ERROR"
    and produce outcome DNS_ERROR. They do NOT participate in the confirmed-
    negative chain. Two timeouts an hour apart must not produce CONFIRMED_NEGATIVE.

    Idempotency
    -----------
    The recheck event document (event_id = {claim_id}_{run_id}) is written
    exactly once. If the event already exists for this run_id, the stored
    outcome is returned without re-executing the DNS check. This is the
    read-first pattern from the Transition Service, applied to observational
    evidence. Retries are safe; re-observation does not overwrite prior evidence.

    ACTIVE — confirmed-negative detection:
      A single ABSENT observation produces TRANSIENT_FAILURE. Two ABSENT
      observations separated by at least CONFIRMED_NEGATIVE_MIN_DELAY using
      different resolvers produces CONFIRMED_NEGATIVE → ACTIVE → RECHECK_REQUIRED.

    RECHECK_REQUIRED — restoration or grace expiry:
      PRESENT artifact: RECHECK_REQUIRED → ACTIVE.
      ABSENT after grace_expires_at: RECHECK_REQUIRED → EXPIRED.
      ABSENT within grace: GRACE_ONGOING.
      ERROR: DNS_ERROR (no lifecycle change; retry is appropriate).

    run_id must be unique per invocation.
    """
    now = (_now or (lambda: datetime.now(timezone.utc)))()
    dns_resolvers: list[DnsResolver] = resolvers or [
        NameserverDnsResolver(ns) for ns in RECHECK_NAMESERVERS
    ]

    event_id = f"{claim_id}_{run_id}"
    recheck_ref = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_recheck_events")
        .document(event_id)
    )

    # ── Idempotency: read-first ──────────────────────────────────────────────
    # If the event already exists, replay without re-querying DNS.
    # _replay_recheck_event() also re-runs any pending transition that did not
    # commit (crash between evidence write and execute_transition()).
    stored_snap = recheck_ref.get()
    if stored_snap.exists:
        return _replay_recheck_event(
            db, ix_id, claim_id, event_id, stored_snap.to_dict()
        )

    # ── Read current claim ───────────────────────────────────────────────────
    claim_ref = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("verification_claims")
        .document(claim_id)
    )
    claim_snap = claim_ref.get()
    if not claim_snap.exists:
        raise DomainRecheckError(f"Claim not found: {claim_id}")

    claim = claim_snap.to_dict()
    domain: str = claim.get("subject", "")
    if not domain:
        raise DomainRecheckError(f"Claim {claim_id} has no subject (domain)")

    current_status = ClaimStatus(claim["status"])
    state_version: int = claim["state_version"]

    token = _get_claim_token_for_recheck(db, ix_id, claim_id)
    if token is None:
        raise DomainRecheckError(
            f"Cannot retrieve original challenge token for claim {claim_id}"
        )

    recheck_event: dict[str, object] = {
        "event_id": event_id,
        "claim_id": claim_id,
        "ix_id": ix_id,
        "domain": domain,
        "run_id": run_id,
        "checked_at": now,
        "outcome": None,
        "transition_triggered": None,
    }

    def _create_event(outcome: RecheckOutcome) -> RecheckResult | None:
        """
        Set outcome and create the evidence event (append-only).

        Returns None when this worker successfully created the document.
        Returns a RecheckResult when another worker already committed the event
        (AlreadyExists): the stored document is authoritative; this caller
        replays from it without overwriting anything.

        Evidence-before-transition invariant: for transition-triggering outcomes,
        the caller must populate all transition reconstruction fields in
        recheck_event BEFORE calling _create_event(), then call
        execute_transition() AFTER _create_event() returns None.
        Crash between create() and execute_transition() is recovered by
        _replay_recheck_event() on the next call with the same run_id.
        """
        recheck_event["outcome"] = outcome.value
        try:
            recheck_ref.create(recheck_event)
            return None
        except api_exceptions.AlreadyExists:
            stored = recheck_ref.get().to_dict()
            return _replay_recheck_event(db, ix_id, claim_id, event_id, stored)

    # ── ACTIVE: confirmed-negative detection ─────────────────────────────────
    if current_status == ClaimStatus.ACTIVE:
        primary = dns_resolvers[0]
        primary_obs = primary.observe_txt(domain)

        recheck_event["primary_resolver"] = type(primary).__name__

        if primary_obs.resolution_status == DnsResolutionStatus.ERROR:
            recheck_event["primary_result"] = _RCHECK_RESULT_ERROR
            recheck_event["primary_error_code"] = primary_obs.error_code
            logger.warning(
                "DNS error on primary recheck for %s (claim %s): %s",
                domain,
                claim_id,
                primary_obs.error_code,
            )
            replay = _create_event(RecheckOutcome.DNS_ERROR)
            if replay is not None:
                return replay
            return RecheckResult(
                outcome=RecheckOutcome.DNS_ERROR,
                recheck_event_id=event_id,
                transition_result=None,
            )

        primary_present = any(token in r for r in primary_obs.records)
        recheck_event["primary_txt_records_observed"] = primary_obs.records
        recheck_event["primary_result"] = (
            _RCHECK_RESULT_PRESENT if primary_present else _RCHECK_RESULT_ABSENT
        )

        if primary_present:
            replay = _create_event(RecheckOutcome.PRESENT)
            if replay is not None:
                return replay
            return RecheckResult(
                outcome=RecheckOutcome.PRESENT,
                recheck_event_id=event_id,
                transition_result=None,
            )

        # Primary ABSENT — look for a qualifying prior ABSENT observation
        prior = _find_prior_absence(db, ix_id, claim_id, now)

        if prior is None:
            # First genuine absence: record for future second check
            replay = _create_event(RecheckOutcome.TRANSIENT_FAILURE)
            if replay is not None:
                return replay
            return RecheckResult(
                outcome=RecheckOutcome.TRANSIENT_FAILURE,
                recheck_event_id=event_id,
                transition_result=None,
            )

        # Prior qualifying absence exists — do second independent resolution
        secondary = dns_resolvers[1] if len(dns_resolvers) > 1 else dns_resolvers[0]
        secondary_obs = secondary.observe_txt(domain)

        recheck_event["secondary_resolver"] = type(secondary).__name__
        recheck_event["prior_absence_event_id"] = prior.get("event_id")

        if secondary_obs.resolution_status == DnsResolutionStatus.ERROR:
            # Second resolver failed — cannot confirm absence; do not trigger RECHECK_REQUIRED
            recheck_event["secondary_result"] = _RCHECK_RESULT_ERROR
            recheck_event["secondary_error_code"] = secondary_obs.error_code
            logger.warning(
                "DNS error on secondary recheck for %s (claim %s): %s",
                domain,
                claim_id,
                secondary_obs.error_code,
            )
            replay = _create_event(RecheckOutcome.DNS_ERROR)
            if replay is not None:
                return replay
            return RecheckResult(
                outcome=RecheckOutcome.DNS_ERROR,
                recheck_event_id=event_id,
                transition_result=None,
            )

        secondary_present = any(token in r for r in secondary_obs.records)
        recheck_event["secondary_txt_records_observed"] = secondary_obs.records
        recheck_event["secondary_result"] = (
            _RCHECK_RESULT_PRESENT if secondary_present else _RCHECK_RESULT_ABSENT
        )

        if secondary_present:
            replay = _create_event(RecheckOutcome.PRESENT)
            if replay is not None:
                return replay
            return RecheckResult(
                outcome=RecheckOutcome.PRESENT,
                recheck_event_id=event_id,
                transition_result=None,
            )

        # Both ABSENT (RESOLVED) + delay elapsed → confirmed negative.
        # Build TransitionRequest and compute deterministic operation_id BEFORE
        # creating the evidence event (evidence-before-transition invariant).
        grace_expires_at = now + GRACE_PERIOD
        transition_req = TransitionRequest(
            ix_id=ix_id,
            claim_id=claim_id,
            from_status=ClaimStatus.ACTIVE,
            from_version=state_version,
            to_status=ClaimStatus.RECHECK_REQUIRED,
            trigger_type=TriggerType.IX_RECHECK,
            trigger_ref_id=run_id,
            reason_code="DOMAIN_CONFIRMED_NEGATIVE",
            recheck_required_at=now,
            grace_expires_at=grace_expires_at,
            last_rechecked_at=now,
        )
        operation_id = build_operation_id(transition_req)

        # Embed reconstruction params so crash recovery can replay the transition.
        recheck_event["transition_triggered"] = "ACTIVE_TO_RECHECK_REQUIRED"
        recheck_event["transition_operation_id"] = operation_id
        recheck_event["transition_from_status"] = ClaimStatus.ACTIVE.value
        recheck_event["transition_from_version"] = state_version
        recheck_event["transition_to_status"] = ClaimStatus.RECHECK_REQUIRED.value
        recheck_event["transition_trigger_type"] = TriggerType.IX_RECHECK.value
        recheck_event["transition_trigger_ref_id"] = run_id
        recheck_event["transition_reason_code"] = "DOMAIN_CONFIRMED_NEGATIVE"
        recheck_event["transition_recheck_required_at"] = now
        recheck_event["transition_grace_expires_at"] = grace_expires_at
        recheck_event["transition_last_rechecked_at"] = now

        # Evidence persisted; transition executed after.
        replay = _create_event(RecheckOutcome.CONFIRMED_NEGATIVE)
        if replay is not None:
            return replay
        transition_result = execute_transition(db, transition_req)
        return RecheckResult(
            outcome=RecheckOutcome.CONFIRMED_NEGATIVE,
            recheck_event_id=event_id,
            transition_result=transition_result,
        )

    # ── RECHECK_REQUIRED: restoration or grace expiry ────────────────────────
    if current_status == ClaimStatus.RECHECK_REQUIRED:
        primary = dns_resolvers[0]
        primary_obs = primary.observe_txt(domain)

        recheck_event["primary_resolver"] = type(primary).__name__

        if primary_obs.resolution_status == DnsResolutionStatus.ERROR:
            recheck_event["primary_result"] = _RCHECK_RESULT_ERROR
            recheck_event["primary_error_code"] = primary_obs.error_code
            logger.warning(
                "DNS error during RECHECK_REQUIRED check for %s (claim %s): %s",
                domain,
                claim_id,
                primary_obs.error_code,
            )
            replay = _create_event(RecheckOutcome.DNS_ERROR)
            if replay is not None:
                return replay
            return RecheckResult(
                outcome=RecheckOutcome.DNS_ERROR,
                recheck_event_id=event_id,
                transition_result=None,
            )

        primary_present = any(token in r for r in primary_obs.records)
        recheck_event["primary_txt_records_observed"] = primary_obs.records
        recheck_event["primary_result"] = (
            _RCHECK_RESULT_PRESENT if primary_present else _RCHECK_RESULT_ABSENT
        )

        if primary_present:
            # Restore claim within grace period.
            transition_req = TransitionRequest(
                ix_id=ix_id,
                claim_id=claim_id,
                from_status=ClaimStatus.RECHECK_REQUIRED,
                from_version=state_version,
                to_status=ClaimStatus.ACTIVE,
                trigger_type=TriggerType.IX_RECHECK,
                trigger_ref_id=run_id,
                reason_code="DOMAIN_ARTIFACT_RESTORED",
                last_rechecked_at=now,
            )
            operation_id = build_operation_id(transition_req)

            recheck_event["transition_triggered"] = "RECHECK_REQUIRED_TO_ACTIVE"
            recheck_event["transition_operation_id"] = operation_id
            recheck_event["transition_from_status"] = ClaimStatus.RECHECK_REQUIRED.value
            recheck_event["transition_from_version"] = state_version
            recheck_event["transition_to_status"] = ClaimStatus.ACTIVE.value
            recheck_event["transition_trigger_type"] = TriggerType.IX_RECHECK.value
            recheck_event["transition_trigger_ref_id"] = run_id
            recheck_event["transition_reason_code"] = "DOMAIN_ARTIFACT_RESTORED"
            recheck_event["transition_last_rechecked_at"] = now

            replay = _create_event(RecheckOutcome.RESTORED)
            if replay is not None:
                return replay
            transition_result = execute_transition(db, transition_req)
            return RecheckResult(
                outcome=RecheckOutcome.RESTORED,
                recheck_event_id=event_id,
                transition_result=transition_result,
            )

        # Artifact absent — check whether grace period has elapsed
        raw_grace = claim.get("grace_expires_at")
        grace_dt: datetime | None = None
        if isinstance(raw_grace, datetime):
            grace_dt = (
                raw_grace
                if raw_grace.tzinfo is not None
                else raw_grace.replace(tzinfo=timezone.utc)
            )

        if grace_dt is not None and now >= grace_dt:
            # Grace expired → hard expiry.
            transition_req = TransitionRequest(
                ix_id=ix_id,
                claim_id=claim_id,
                from_status=ClaimStatus.RECHECK_REQUIRED,
                from_version=state_version,
                to_status=ClaimStatus.EXPIRED,
                trigger_type=TriggerType.IX_SCHEDULED,
                trigger_ref_id=run_id,
                reason_code="DOMAIN_GRACE_PERIOD_EXPIRED",
                expired_at=now,
            )
            operation_id = build_operation_id(transition_req)

            recheck_event["transition_triggered"] = "RECHECK_REQUIRED_TO_EXPIRED"
            recheck_event["transition_operation_id"] = operation_id
            recheck_event["transition_from_status"] = ClaimStatus.RECHECK_REQUIRED.value
            recheck_event["transition_from_version"] = state_version
            recheck_event["transition_to_status"] = ClaimStatus.EXPIRED.value
            recheck_event["transition_trigger_type"] = TriggerType.IX_SCHEDULED.value
            recheck_event["transition_trigger_ref_id"] = run_id
            recheck_event["transition_reason_code"] = "DOMAIN_GRACE_PERIOD_EXPIRED"
            recheck_event["transition_expired_at"] = now

            replay = _create_event(RecheckOutcome.GRACE_EXPIRED)
            if replay is not None:
                return replay
            transition_result = execute_transition(db, transition_req)
            return RecheckResult(
                outcome=RecheckOutcome.GRACE_EXPIRED,
                recheck_event_id=event_id,
                transition_result=transition_result,
            )

        # Absent but within grace — no lifecycle change
        recheck_event["grace_expires_at"] = grace_dt
        replay = _create_event(RecheckOutcome.GRACE_ONGOING)
        if replay is not None:
            return replay
        return RecheckResult(
            outcome=RecheckOutcome.GRACE_ONGOING,
            recheck_event_id=event_id,
            transition_result=None,
        )

    # Terminal states: no recheck applicable
    raise DomainRecheckError(
        f"Claim {claim_id} is in terminal state {current_status.value}; recheck not applicable"
    )


# ---------------------------------------------------------------------------
# Renewal workflow
# ---------------------------------------------------------------------------


def renew_domain_claim(
    db: firestore.Client,
    ix_id: str,
    old_claim_id: str,
    challenge_id: str,
    account_uid: str,
    resolver: DnsResolver | None = None,
    _now: Callable[[], datetime] | None = None,
) -> DomainVerificationOutcome:
    """
    Perform a full domain renewal: fresh challenge proof → new DOMAIN claim →
    old claim transitioned to SUPERSEDED.

    The old claim must be ACTIVE or RECHECK_REQUIRED. Terminal states
    (EXPIRED, SUPERSEDED, REVOKED) are rejected.

    A fresh challenge is required — renewal cannot reuse the challenge from
    the original verification ceremony. This is intentional: the original
    challenge token may have been public for up to 12 months; a fresh nonce
    ensures the renewal proves current domain control, not cached control.
    """
    claim_ref = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("verification_claims")
        .document(old_claim_id)
    )
    old_snap = claim_ref.get()
    if not old_snap.exists:
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code="OLD_CLAIM_NOT_FOUND",
        )

    old_claim = old_snap.to_dict()
    old_status = ClaimStatus(old_claim["status"])
    old_version: int = old_claim["state_version"]

    if old_status not in (ClaimStatus.ACTIVE, ClaimStatus.RECHECK_REQUIRED):
        return DomainVerificationOutcome(
            success=False,
            claim_id=None,
            evidence_ref=None,
            error_code=f"OLD_CLAIM_NOT_RENEWABLE:{old_status.value}",
        )

    # Verify the new challenge and create the new claim (with supersedes link)
    outcome = verify_domain(
        db=db,
        ix_id=ix_id,
        challenge_id=challenge_id,
        account_uid=account_uid,
        supersedes=old_claim_id,
        resolver=resolver,
        _now=_now,
    )

    if not outcome.success:
        return outcome

    # New claim created — supersede the old one
    new_claim_id = outcome.claim_id
    supersede_req = TransitionRequest(
        ix_id=ix_id,
        claim_id=old_claim_id,
        from_status=old_status,
        from_version=old_version,
        to_status=ClaimStatus.SUPERSEDED,
        trigger_type=TriggerType.IX_RENEWAL,
        # trigger_ref_id is the new claim ID: stable, unique, survives retries
        trigger_ref_id=new_claim_id or f"renewal_{challenge_id}",
        reason_code="RENEWED_BY_NEW_CLAIM",
        superseded_by=new_claim_id,
    )
    execute_transition(db, supersede_req)

    return outcome


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _get_claim_token_for_recheck(
    db: firestore.Client,
    ix_id: str,
    claim_id: str,
) -> str | None:
    """
    Retrieve the original challenge token for a domain claim from its
    domain_verification_record (referenced via the claim's evidence_ref).

    This token is what the account controller placed in DNS at verification
    time and must continue to be present for the claim to pass rechecks.
    """
    claim_ref = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("verification_claims")
        .document(claim_id)
    )
    claim_snap = claim_ref.get()
    if not claim_snap.exists:
        return None

    evidence_ref = claim_snap.to_dict().get("evidence_ref")
    if not evidence_ref:
        return None

    dvr_snap = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_verification_records")
        .document(str(evidence_ref))
        .get()
    )
    if not dvr_snap.exists:
        return None

    return dvr_snap.to_dict().get("challenge_token")  # type: ignore[return-value]


def _find_prior_absence(
    db: firestore.Client,
    ix_id: str,
    claim_id: str,
    now: datetime,
) -> dict | None:
    """
    Find a prior TRANSIENT_FAILURE recheck event for this claim where:
      - primary_result == "ABSENT"  (DNS resolved; artifact genuinely absent)
      - outcome == TRANSIENT_FAILURE
      - checked_at is at least CONFIRMED_NEGATIVE_MIN_DELAY before now

    DNS_ERROR events (primary_result == "ERROR") are never returned. Two
    DNS failures are not two absence observations.

    Production note: the compound query requires a composite Firestore index.
    The emulator evaluates it without an index.
    """
    events = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_recheck_events")
        .where(filter=FieldFilter("claim_id", "==", claim_id))
        .where(filter=FieldFilter("primary_result", "==", _RCHECK_RESULT_ABSENT))
        .where(
            filter=FieldFilter("outcome", "==", RecheckOutcome.TRANSIENT_FAILURE.value)
        )
        .stream()
    )
    for ev_snap in events:
        ev = ev_snap.to_dict()
        checked_at = ev.get("checked_at")
        if checked_at is None:
            continue
        checked_dt: datetime = (
            checked_at
            if isinstance(checked_at, datetime) and checked_at.tzinfo is not None
            else (
                checked_at.replace(tzinfo=timezone.utc)
                if isinstance(checked_at, datetime)
                else checked_at
            )
        )
        if now - checked_dt >= CONFIRMED_NEGATIVE_MIN_DELAY:
            return ev
    return None


# ---------------------------------------------------------------------------
# Recheck replay helpers
# ---------------------------------------------------------------------------


def _replay_recheck_event(
    db: firestore.Client,
    ix_id: str,
    claim_id: str,
    event_id: str,
    stored: dict,
) -> RecheckResult:
    """
    Return a RecheckResult from a previously committed recheck event.

    If the stored event records a pending transition (transition_triggered is set),
    reconstruct and re-run execute_transition() to ensure the Transition Service
    operation commits. execute_transition() is itself idempotent, so replaying it
    on an already-committed operation is safe.

    This is the crash recovery path: if the process died after create() but
    before execute_transition(), the next call with the same run_id arrives here
    and completes the transition without overwriting the evidence event.
    """
    if stored.get("claim_id") != claim_id:
        raise DomainRecheckError(
            f"Run ID collision: event {event_id} belongs to claim "
            f"{stored.get('claim_id')}, not {claim_id}"
        )

    logger.info(
        "Idempotent recheck replay: run_id event=%s, outcome=%s, "
        "transition_triggered=%s",
        event_id,
        stored.get("outcome"),
        stored.get("transition_triggered"),
    )

    transition_result: TransitionResult | None = None
    if stored.get("transition_triggered") is not None:
        # Evidence event committed but transition may not have — re-run idempotently.
        transition_req = _reconstruct_transition_req(ix_id, stored)
        transition_result = execute_transition(db, transition_req)

    return RecheckResult(
        outcome=RecheckOutcome(stored["outcome"]),
        recheck_event_id=event_id,
        transition_result=transition_result,
    )


def _reconstruct_transition_req(ix_id: str, stored: dict) -> TransitionRequest:
    """
    Rebuild a TransitionRequest from the reconstruction fields stored in a
    recheck event. These fields are written before the evidence event is
    created so that crash recovery can always replay the transition.
    """
    return TransitionRequest(
        ix_id=ix_id,
        claim_id=stored["claim_id"],
        from_status=ClaimStatus(stored["transition_from_status"]),
        from_version=stored["transition_from_version"],
        to_status=ClaimStatus(stored["transition_to_status"]),
        trigger_type=TriggerType(stored["transition_trigger_type"]),
        trigger_ref_id=stored["transition_trigger_ref_id"],
        reason_code=stored["transition_reason_code"],
        # Optional lifecycle fields — present only when relevant to the transition
        recheck_required_at=stored.get("transition_recheck_required_at"),
        grace_expires_at=stored.get("transition_grace_expires_at"),
        expired_at=stored.get("transition_expired_at"),
        last_rechecked_at=stored.get("transition_last_rechecked_at"),
    )


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class DomainVerificationError(Exception):
    """Raised inside Firestore transactions to signal a recoverable verification failure."""


class DomainRecheckError(Exception):
    """Raised when a recheck cannot proceed due to missing or invalid claim state."""
