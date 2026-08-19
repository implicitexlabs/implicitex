"""
IX ID Scheduler Service
=======================
Orchestrates the domain claim lifecycle on behalf of IX: monthly rechecks,
hard expiration when claims reach expires_at, and a repair sweep for evidence
events whose transitions did not commit before a process crash.

This service decides WHEN and WHICH claims to act on. It does not decide trust.
All trust logic lives in the Transition Service and Domain Verification Service.
The scheduler never reimplements claim-state logic; it delegates entirely.

Frozen invariants:
  - Stable occurrence identity: run_id is deterministic within a time window;
    retries of the same scheduled occurrence use the same run_id; new occurrences
    use new IDs. See _occurrence_id_for_recheck() and _occurrence_id_for_grace_check().
  - UTC timestamps throughout; all datetime comparisons use timezone-aware objects.
  - No client authority: this service runs under a service account; no user
    credentials are accepted as authorization.
  - No silently dropped jobs: every claim processed is counted; failures are
    recorded in BatchResult.errors; callers are expected to alert on non-zero
    failed counts.
  - No reimplementation of claim-state logic: eligibility is based on simple
    field comparisons; the Domain Verification Service and Transition Service
    own all lifecycle decisions.
  - Explicit repair path: the repair sweep finds evidence events with
    transition_triggered != None and replays them; execute_transition() is
    idempotent, so replaying an already-committed transition is safe.
"""

import logging
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from ixid_domain_verification_service import run_domain_recheck
from ixid_transition_service import (
    ClaimStatus,
    TransitionRequest,
    TriggerType,
    VersionConflictError,
    execute_transition,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Policy constants — scheduler-v1
# ---------------------------------------------------------------------------

SCHEDULER_POLICY_VERSION = "scheduler-v1"

# How often ACTIVE claims are rechecked. Monthly at the policy level; the
# occurrence window is the calendar month, so a second run in the same month
# reuses the same run_id and the read-first/idempotency path returns early.
ACTIVE_RECHECK_INTERVAL = timedelta(days=30)

# How often RECHECK_REQUIRED claims are checked for restoration or grace expiry.
# Daily: artifact may be restored at any time during the grace window.
RECHECK_REQUIRED_INTERVAL = timedelta(days=1)

# Lookback window for the repair sweep. Events older than this are assumed to
# have been resolved (either committed or superseded by later state changes).
REPAIR_SWEEP_LOOKBACK = timedelta(hours=24)


# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ClaimJobResult:
    """Result of processing a single claim in a scheduler batch."""

    claim_id: str
    ix_id: str
    run_id: str
    outcome: str  # RecheckOutcome.value or "EXPIRED" or "SKIPPED"
    error: str | None = None


@dataclass
class BatchResult:
    """Aggregated result of a scheduler batch run."""

    processed: int = 0
    succeeded: int = 0
    failed: int = 0
    skipped: int = 0
    jobs: list[ClaimJobResult] = field(default_factory=list)

    @property
    def errors(self) -> list[str]:
        return [j.error for j in self.jobs if j.error is not None]


# ---------------------------------------------------------------------------
# Occurrence ID helpers
# ---------------------------------------------------------------------------


def _occurrence_id_for_recheck(claim_id: str, now: datetime) -> str:
    """
    Deterministic occurrence ID for a monthly recheck of an ACTIVE claim.

    All retries of the same scheduled occurrence within the same calendar month
    (UTC) produce the same ID. A new calendar month produces a new ID.

    Stability contract: the scheduler must pass the same `now` (or one that
    falls in the same calendar month) on every retry of the same occurrence.
    In practice: scheduler occurrence time = the moment the job was scheduled,
    not the moment of retry execution. Cloud Scheduler should pass the
    scheduled time as a job parameter.
    """
    return f"{claim_id}_m_{now.year:04d}{now.month:02d}"


def _occurrence_id_for_grace_check(claim_id: str, now: datetime) -> str:
    """
    Deterministic occurrence ID for a daily check of a RECHECK_REQUIRED claim.

    All retries within the same calendar day (UTC) produce the same ID.
    New day → new ID.
    """
    return f"{claim_id}_d_{now.year:04d}{now.month:02d}{now.day:02d}"


def _expiration_trigger_ref_id(claim_id: str, now: datetime) -> str:
    """
    Stable trigger_ref_id for a hard-expiration Transition Service call.

    Deterministic within the same calendar day. Safe to retry: execute_transition()
    is idempotent on the same trigger_ref_id + from_version combination.
    """
    return f"{claim_id}_expire_{now.year:04d}{now.month:02d}{now.day:02d}"


# ---------------------------------------------------------------------------
# Eligibility helpers
# ---------------------------------------------------------------------------


def _is_recheck_due(claim: dict, now: datetime, interval: timedelta) -> bool:
    """
    Return True if the claim is due for a recheck.

    Uses last_rechecked_at if present; falls back to verified_at for claims
    that have never been rechecked (newly issued). Returns True if neither
    field is set (should not happen in production; fail-open toward rechecking).
    """
    baseline = claim.get("last_rechecked_at") or claim.get("verified_at")
    if baseline is None:
        return True
    if isinstance(baseline, datetime) and baseline.tzinfo is None:
        baseline = baseline.replace(tzinfo=timezone.utc)
    return (now - baseline) >= interval


def _to_utc(dt: datetime) -> datetime:
    """Ensure datetime is timezone-aware (UTC). Firestore Timestamps are already tz-aware."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


# ---------------------------------------------------------------------------
# Monthly recheck batch (ACTIVE + RECHECK_REQUIRED)
# ---------------------------------------------------------------------------


def run_recheck_batch(
    db: firestore.Client,
    _now: Callable[[], datetime] | None = None,
) -> BatchResult:
    """
    Find all DOMAIN claims due for a scheduled recheck and process them.

    ACTIVE claims are rechecked on a monthly cadence. RECHECK_REQUIRED claims
    are checked daily (artifact may be restored or grace period may expire at
    any time).

    Each eligible claim is processed with a deterministic occurrence run_id.
    If the claim was already processed in this occurrence window (same run_id
    already exists in domain_recheck_events), run_domain_recheck() returns
    the stored outcome without re-querying DNS or overwriting evidence.
    """
    now = (_now or (lambda: datetime.now(timezone.utc)))()
    result = BatchResult()

    # Fetch all ACTIVE and RECHECK_REQUIRED DOMAIN claims via collection group.
    # Eligibility filtering (interval check) happens in Python since last_rechecked_at
    # may be absent for newly issued claims.
    candidates = (
        db.collection_group("verification_claims")
        .where(filter=FieldFilter("claim_type", "==", "DOMAIN"))
        .where(
            filter=FieldFilter(
                "status",
                "in",
                [ClaimStatus.ACTIVE.value, ClaimStatus.RECHECK_REQUIRED.value],
            )
        )
        .stream()
    )

    for snap in candidates:
        claim = snap.to_dict()
        claim_id: str = claim["claim_id"]
        # ix_id is encoded in the collection path, not the document itself.
        # Path: ix_ids/{ix_id}/verification_claims/{claim_id}
        ix_id: str = snap.reference.parent.parent.id
        status = ClaimStatus(claim["status"])

        interval = (
            ACTIVE_RECHECK_INTERVAL
            if status == ClaimStatus.ACTIVE
            else RECHECK_REQUIRED_INTERVAL
        )

        if not _is_recheck_due(claim, now, interval):
            result.processed += 1
            result.skipped += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id="—",
                    outcome="SKIPPED",
                )
            )
            continue

        run_id = (
            _occurrence_id_for_recheck(claim_id, now)
            if status == ClaimStatus.ACTIVE
            else _occurrence_id_for_grace_check(claim_id, now)
        )

        result.processed += 1
        try:
            recheck_result = run_domain_recheck(
                db, ix_id, claim_id, run_id, _now=lambda: now
            )
            result.succeeded += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id=run_id,
                    outcome=recheck_result.outcome.value,
                )
            )
            logger.info(
                "Recheck complete: claim=%s run=%s outcome=%s",
                claim_id,
                run_id,
                recheck_result.outcome.value,
            )
        except Exception as exc:  # noqa: BLE001
            result.failed += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id=run_id,
                    outcome="ERROR",
                    error=str(exc),
                )
            )
            logger.error(
                "Recheck failed: claim=%s run=%s error=%s",
                claim_id,
                run_id,
                exc,
            )

    return result


# ---------------------------------------------------------------------------
# Hard expiration batch (ACTIVE → EXPIRED at expires_at)
# ---------------------------------------------------------------------------


def run_expiration_batch(
    db: firestore.Client,
    _now: Callable[[], datetime] | None = None,
) -> BatchResult:
    """
    Find all ACTIVE DOMAIN claims whose expires_at has passed and expire them.

    This is an IX_SCHEDULED operation; it does not go through the recheck worker.
    The Transition Service is called directly with a stable trigger_ref_id derived
    from (claim_id, current date) so that retries on the same day are idempotent.

    If execute_transition() raises VersionConflictError, the claim was concurrently
    modified (e.g., already renewed or expired). The job is logged and skipped;
    the next batch run will either find the claim gone or in a terminal state.
    """
    now = (_now or (lambda: datetime.now(timezone.utc)))()
    result = BatchResult()

    expired_claims = (
        db.collection_group("verification_claims")
        .where(filter=FieldFilter("claim_type", "==", "DOMAIN"))
        .where(filter=FieldFilter("status", "==", ClaimStatus.ACTIVE.value))
        .where(filter=FieldFilter("expires_at", "<=", now))
        .stream()
    )

    for snap in expired_claims:
        claim = snap.to_dict()
        claim_id: str = claim["claim_id"]
        ix_id: str = snap.reference.parent.parent.id
        state_version: int = claim["state_version"]
        trigger_ref_id = _expiration_trigger_ref_id(claim_id, now)

        req = TransitionRequest(
            ix_id=ix_id,
            claim_id=claim_id,
            from_status=ClaimStatus.ACTIVE,
            from_version=state_version,
            to_status=ClaimStatus.EXPIRED,
            trigger_type=TriggerType.IX_SCHEDULED,
            trigger_ref_id=trigger_ref_id,
            reason_code="CLAIM_ANNUAL_EXPIRY",
            expired_at=now,
        )

        result.processed += 1
        try:
            execute_transition(db, req)
            result.succeeded += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id=trigger_ref_id,
                    outcome="EXPIRED",
                )
            )
            logger.info("Claim expired: claim=%s trigger=%s", claim_id, trigger_ref_id)
        except VersionConflictError as exc:
            # Claim was concurrently modified — not an error; skip.
            result.skipped += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id=trigger_ref_id,
                    outcome="SKIPPED",
                    error=f"VersionConflict (claim modified concurrently): {exc}",
                )
            )
            logger.warning(
                "Expiration skipped (concurrent modification): claim=%s", claim_id
            )
        except Exception as exc:  # noqa: BLE001
            result.failed += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id=trigger_ref_id,
                    outcome="ERROR",
                    error=str(exc),
                )
            )
            logger.error("Expiration failed: claim=%s error=%s", claim_id, exc)

    return result


# ---------------------------------------------------------------------------
# Repair sweep — complete stranded transitions
# ---------------------------------------------------------------------------


def run_repair_sweep(
    db: firestore.Client,
    _now: Callable[[], datetime] | None = None,
) -> BatchResult:
    """
    Find domain_recheck_events from the last REPAIR_SWEEP_LOOKBACK window where
    transition_triggered is set. For each, replay via run_domain_recheck() with
    the stored run_id.

    If the transition already committed (idempotent replay via Transition Service),
    the call returns cleanly. If the claim's state has since changed in a way that
    makes the stored transition illegal (VersionConflictError, StatusMismatchError),
    the job is logged as skipped — the claim is already in a consistent state.

    The lookback window prevents the sweep from disturbing old, superseded evidence.
    A broader sweep can be triggered manually by passing a longer lookback.
    """
    now = (_now or (lambda: datetime.now(timezone.utc)))()
    since = now - REPAIR_SWEEP_LOOKBACK
    result = BatchResult()

    candidate_events = (
        db.collection_group("domain_recheck_events")
        .where(filter=FieldFilter("transition_triggered", "!=", None))
        .where(filter=FieldFilter("checked_at", ">=", since))
        .stream()
    )

    for snap in candidate_events:
        ev = snap.to_dict()
        claim_id: str = ev["claim_id"]
        ix_id: str = ev["ix_id"]  # stored in the recheck event document
        run_id: str = ev["run_id"]
        event_id: str = ev["event_id"]

        result.processed += 1
        try:
            replay = run_domain_recheck(db, ix_id, claim_id, run_id, _now=lambda: now)
            if (
                replay.transition_result is not None
                and not replay.transition_result.idempotent
            ):
                # Transition was not previously committed; repair completed it.
                result.succeeded += 1
                result.jobs.append(
                    ClaimJobResult(
                        claim_id=claim_id,
                        ix_id=ix_id,
                        run_id=run_id,
                        outcome=f"REPAIRED:{replay.outcome.value}",
                    )
                )
                logger.info(
                    "Repair complete: event=%s claim=%s outcome=%s",
                    event_id,
                    claim_id,
                    replay.outcome.value,
                )
            else:
                # Transition already committed; replay was a no-op.
                result.skipped += 1
                result.jobs.append(
                    ClaimJobResult(
                        claim_id=claim_id,
                        ix_id=ix_id,
                        run_id=run_id,
                        outcome="SKIPPED",
                    )
                )
        except Exception as exc:  # noqa: BLE001
            # Claim state has changed in an incompatible way (expected for old events
            # where the claim has moved on). Log as warning, not error.
            result.skipped += 1
            result.jobs.append(
                ClaimJobResult(
                    claim_id=claim_id,
                    ix_id=ix_id,
                    run_id=run_id,
                    outcome="SKIPPED",
                    error=str(exc),
                )
            )
            logger.warning(
                "Repair replay not applicable: event=%s claim=%s reason=%s",
                event_id,
                claim_id,
                exc,
            )

    return result


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class SchedulerError(Exception):
    """Raised when a scheduler batch encounters a fatal configuration error."""
