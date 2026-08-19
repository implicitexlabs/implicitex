"""
Domain Verification Service — integration tests.

Requires the Firestore emulator:
  FIRESTORE_EMULATOR_HOST=localhost:8080 python -m pytest tests/test_ixid_domain_verification_service.py -v

Covers:
  - Challenge issuance
  - Successful DNS TXT verification
  - Challenge rejection: expired, already-consumed, wrong owner, token not found
  - DNS error during verification (distinct from token-not-found)
  - Confirmed-negative recheck: transient failure → confirmed negative → RECHECK_REQUIRED
  - DNS errors do not advance confirmed-negative chain
  - Restoration during grace: RECHECK_REQUIRED → ACTIVE
  - Grace period expiry: RECHECK_REQUIRED → EXPIRED
  - Scheduled hard expiration: ACTIVE → EXPIRED via direct transition
  - Renewal: fresh challenge → new DOMAIN claim, old → SUPERSEDED
  - Recheck idempotency: read-first; same run_id returns stored result without re-observing
"""

import os
import threading
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from ixid_domain_verification_service import (
    TXT_RECORD_PREFIX,
    ChallengeStatus,
    DnsObservation,
    DnsResolutionStatus,
    RecheckOutcome,
    issue_challenge,
    renew_domain_claim,
    run_domain_recheck,
    verify_domain,
)
from ixid_transition_service import (
    ClaimStatus,
    TransitionRequest,
    TriggerType,
    execute_transition,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db() -> firestore.Client:
    emulator = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not emulator:
        pytest.skip("FIRESTORE_EMULATOR_HOST not set; skipping integration tests")
    return firestore.Client(project="ix-id-test")


def _fresh_ix_id() -> str:
    return f"testhandle_{uuid.uuid4().hex[:8]}"


def _make_now(offset: timedelta = timedelta(0)) -> datetime:
    return datetime.now(timezone.utc) + offset


def _all_recheck_events(db: firestore.Client, ix_id: str, claim_id: str) -> list[dict]:
    return [
        s.to_dict()
        for s in db.collection("ix_ids")
        .document(ix_id)
        .collection("domain_recheck_events")
        .where(filter=FieldFilter("claim_id", "==", claim_id))
        .stream()
    ]


def _read_claim(db: firestore.Client, ix_id: str, claim_id: str) -> dict:
    snap = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("verification_claims")
        .document(claim_id)
        .get()
    )
    assert snap.exists, f"Claim {claim_id} not found"
    return snap.to_dict()


# ---------------------------------------------------------------------------
# Fake DNS resolver — injected in all tests
# ---------------------------------------------------------------------------


class FakeDnsResolver:
    """
    Controllable DNS resolver for tests.

    Always returns RESOLVED status with the provided records.
    ABSENT artifact = empty records list.
    """

    def __init__(self, txt_records: list[str] | None = None) -> None:
        self._records: list[str] = txt_records or []

    def set_records(self, records: list[str]) -> None:
        self._records = records

    def observe_txt(self, domain: str) -> DnsObservation:
        return DnsObservation(
            resolution_status=DnsResolutionStatus.RESOLVED,
            records=list(self._records),
        )


class FakeErrorDnsResolver:
    """
    DNS resolver that simulates a resolution failure (timeout, SERVFAIL, etc.).
    Always returns ERROR status — never ABSENT.
    """

    def __init__(self, error_code: str = "TIMEOUT") -> None:
        self._error_code = error_code

    def observe_txt(self, domain: str) -> DnsObservation:
        return DnsObservation(
            resolution_status=DnsResolutionStatus.ERROR,
            records=[],
            error_code=self._error_code,
        )


# ---------------------------------------------------------------------------
# TestChallengeIssuance
# ---------------------------------------------------------------------------


class TestChallengeIssuance:
    def test_issue_challenge_returns_token_and_expiry(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")

        assert issuance.challenge_id
        assert issuance.domain == "example.com"
        assert issuance.txt_record_value.startswith(TXT_RECORD_PREFIX)
        assert issuance.expires_at > datetime.now(timezone.utc)

    def test_challenge_document_written_as_pending(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")

        snap = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_challenges")
            .document(issuance.challenge_id)
            .get()
        )
        assert snap.exists
        ch = snap.to_dict()
        assert ch["status"] == ChallengeStatus.PENDING.value
        assert ch["consumed_at"] is None
        assert ch["verification_record_id"] is None
        assert ch["account_uid"] == "user_abc"

    def test_two_challenges_for_same_domain_both_valid(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        a = issue_challenge(db, ix_id, "example.com", "user_abc")
        b = issue_challenge(db, ix_id, "example.com", "user_abc")
        assert a.challenge_id != b.challenge_id
        assert a.txt_record_value != b.txt_record_value


# ---------------------------------------------------------------------------
# TestDomainVerification
# ---------------------------------------------------------------------------


class TestDomainVerification:
    def test_successful_verification_creates_claim_and_evidence(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])

        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )

        assert outcome.success
        assert outcome.claim_id is not None
        assert outcome.error_code is None

        # Claim document exists and is ACTIVE
        claim = _read_claim(db, ix_id, outcome.claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value
        assert claim["claim_type"] == "DOMAIN"
        assert claim["subject"] == "example.com"
        assert claim["evidence_type"] == "DNS_TXT"
        assert claim["state_version"] == 0

        # CLAIM_CREATED event was written
        events = list(
            db.collection("ix_ids")
            .document(ix_id)
            .collection("verification_claims")
            .document(outcome.claim_id)
            .collection("events")
            .stream()
        )
        created_events = [
            e.to_dict()
            for e in events
            if e.to_dict().get("event_type") == "CLAIM_CREATED"
        ]
        assert len(created_events) == 1
        ev = created_events[0]
        assert ev["subject"] == "example.com"
        assert ev["evidence_type"] == "DNS_TXT"

        # Evidence record written
        dvr_snap = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_verification_records")
            .document(outcome.evidence_ref)
            .get()
        )
        assert dvr_snap.exists
        dvr = dvr_snap.to_dict()
        assert dvr["domain"] == "example.com"
        assert dvr["challenge_id"] == issuance.challenge_id

        # Challenge marked CONSUMED
        ch_snap = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_challenges")
            .document(issuance.challenge_id)
            .get()
        )
        assert ch_snap.to_dict()["status"] == ChallengeStatus.CONSUMED.value

    def test_txt_record_not_found_returns_failure_challenge_stays_pending(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver = FakeDnsResolver([])  # no TXT records

        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )

        assert not outcome.success
        assert outcome.error_code == "TXT_RECORD_NOT_FOUND"

        # Challenge still PENDING (not consumed on failure)
        ch = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_challenges")
            .document(issuance.challenge_id)
            .get()
            .to_dict()
        )
        assert ch["status"] == ChallengeStatus.PENDING.value

    def test_expired_challenge_rejected(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        # Issue a challenge with a past expiry by using a past _now
        past = lambda: _make_now(timedelta(hours=-49))
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc", _now=past)

        resolver = FakeDnsResolver([issuance.txt_record_value])
        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )

        assert not outcome.success
        assert outcome.error_code == "CHALLENGE_EXPIRED"

    def test_consumed_challenge_rejected(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])

        # First call succeeds
        first = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )
        assert first.success

        # Second call with same challenge_id is rejected
        second = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )
        assert not second.success
        assert second.error_code == "CHALLENGE_ALREADY_CONSUMED"

    def test_ownership_mismatch_rejected(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])

        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_XYZ", resolver=resolver
        )
        assert not outcome.success
        assert outcome.error_code == "CHALLENGE_OWNERSHIP_MISMATCH"

    def test_nonexistent_challenge_rejected(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        outcome = verify_domain(db, ix_id, "no-such-challenge", "user_abc")
        assert not outcome.success
        assert outcome.error_code == "CHALLENGE_NOT_FOUND"


# ---------------------------------------------------------------------------
# TestDomainRecheck
# ---------------------------------------------------------------------------


class TestDomainRecheck:
    def _setup_active_claim(
        self, db: firestore.Client, ix_id: str, domain: str = "example.com"
    ) -> str:
        """Issue challenge, verify successfully, return claim_id."""
        issuance = issue_challenge(db, ix_id, domain, "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])
        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )
        assert outcome.success, f"Setup failed: {outcome.error_code}"
        return outcome.claim_id  # type: ignore[return-value]

    def test_recheck_present_no_lifecycle_change(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        # Get the token the service expects
        from ixid_domain_verification_service import _get_claim_token_for_recheck

        token = _get_claim_token_for_recheck(db, ix_id, claim_id)
        assert token is not None

        resolver = FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])
        result = run_domain_recheck(
            db, ix_id, claim_id, run_id="run1", resolvers=[resolver, resolver]
        )

        assert result.outcome == RecheckOutcome.PRESENT
        assert result.transition_result is None

        # Claim still ACTIVE
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value

    def test_single_absence_is_transient_no_lifecycle_change(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        result = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[empty_resolver, empty_resolver],
        )

        assert result.outcome == RecheckOutcome.TRANSIENT_FAILURE
        assert result.transition_result is None

        # Claim still ACTIVE
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value

    def test_confirmed_negative_transitions_to_recheck_required(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        t0 = _make_now()

        # Run 1: first absence → TRANSIENT_FAILURE
        result1 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0,
        )
        assert result1.outcome == RecheckOutcome.TRANSIENT_FAILURE

        # Run 2: 70 minutes later, second absence → CONFIRMED_NEGATIVE
        t1 = t0 + timedelta(minutes=70)
        result2 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run2",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t1,
        )
        assert result2.outcome == RecheckOutcome.CONFIRMED_NEGATIVE
        assert result2.transition_result is not None
        assert result2.transition_result.to_status == ClaimStatus.RECHECK_REQUIRED

        # Claim is now RECHECK_REQUIRED
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.RECHECK_REQUIRED.value
        assert claim["state_version"] == 1

    def test_second_absence_within_delay_is_transient(
        self, db: firestore.Client
    ) -> None:
        """Two absences 30 minutes apart must not trigger confirmed-negative."""
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        t0 = _make_now()

        # Run 1: first absence
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0,
        )

        # Run 2: only 30 minutes later — delay not elapsed
        t1 = t0 + timedelta(minutes=30)
        result2 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run2",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t1,
        )
        assert result2.outcome == RecheckOutcome.TRANSIENT_FAILURE

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value  # no transition

    def test_restoration_during_grace_transitions_to_active(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        t0 = _make_now()

        # Drive claim to RECHECK_REQUIRED
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0,
        )
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run2",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0 + timedelta(hours=2),
        )

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.RECHECK_REQUIRED.value

        # Controller restores DNS TXT record
        from ixid_domain_verification_service import _get_claim_token_for_recheck

        token = _get_claim_token_for_recheck(db, ix_id, claim_id)
        assert token is not None
        present_resolver = FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])

        result = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run3",
            resolvers=[present_resolver],
            _now=lambda: t0 + timedelta(days=3),
        )
        assert result.outcome == RecheckOutcome.RESTORED
        assert result.transition_result is not None
        assert result.transition_result.to_status == ClaimStatus.ACTIVE

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value
        assert (
            claim["state_version"] == 2
        )  # created(0) → recheck_required(1) → active(2)

    def test_grace_expiry_transitions_to_expired(self, db: firestore.Client) -> None:
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        t0 = _make_now()

        # Drive to RECHECK_REQUIRED
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0,
        )
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run2",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0 + timedelta(hours=2),
        )

        # Recheck within grace (7 days) — GRACE_ONGOING
        result_mid = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run3",
            resolvers=[empty_resolver],
            _now=lambda: t0 + timedelta(days=7),
        )
        assert result_mid.outcome == RecheckOutcome.GRACE_ONGOING

        # Recheck after grace expires (15 days > 14-day GRACE_PERIOD)
        result_expired = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run4",
            resolvers=[empty_resolver],
            _now=lambda: t0 + timedelta(days=15),
        )
        assert result_expired.outcome == RecheckOutcome.GRACE_EXPIRED
        assert result_expired.transition_result is not None
        assert result_expired.transition_result.to_status == ClaimStatus.EXPIRED

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.EXPIRED.value

    def test_recheck_idempotency_read_first_returns_stored_outcome(
        self, db: firestore.Client
    ) -> None:
        """
        Read-first idempotency: a retry with the same run_id returns the stored
        outcome without performing a second DNS observation or writing a new event.

        This is the same pattern as the Transition Service. The stored event is
        never overwritten; its evidence is preserved exactly as first written.
        """
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        t0 = _make_now()

        # First call: TRANSIENT_FAILURE, event written
        result1 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run_idem",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0,
        )
        assert result1.outcome == RecheckOutcome.TRANSIENT_FAILURE

        # Second call with same run_id: reads stored event, returns same outcome
        # — even if the resolver would now behave differently (we pass PRESENT)
        from ixid_domain_verification_service import _get_claim_token_for_recheck

        token = _get_claim_token_for_recheck(db, ix_id, claim_id)
        present_resolver = FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])
        result2 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run_idem",
            resolvers=[present_resolver, present_resolver],
            _now=lambda: t0,
        )
        # Must return TRANSIENT_FAILURE (stored), not PRESENT (what current DNS would say)
        assert result2.outcome == RecheckOutcome.TRANSIENT_FAILURE
        assert result2.transition_result is None  # no transition on replay

        # Exactly one recheck event for this run_id
        events = _all_recheck_events(db, ix_id, claim_id)
        assert [e["run_id"] for e in events].count("run_idem") == 1


# ---------------------------------------------------------------------------
# TestDomainRecheckDnsErrors
# ---------------------------------------------------------------------------


class TestDomainRecheckDnsErrors:
    """
    DNS resolution errors must not advance the confirmed-negative chain.
    A timeout, SERVFAIL, or unreachable resolver is operational telemetry —
    not an observation of artifact absence.
    """

    def _setup_active_claim(
        self, db: firestore.Client, ix_id: str, domain: str = "example.com"
    ) -> str:
        issuance = issue_challenge(db, ix_id, domain, "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])
        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )
        assert outcome.success
        return outcome.claim_id  # type: ignore[return-value]

    def test_dns_error_on_initial_check_returns_dns_error_outcome(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        error_resolver = FakeErrorDnsResolver("TIMEOUT")
        result = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="err1",
            resolvers=[error_resolver, error_resolver],
        )

        assert result.outcome == RecheckOutcome.DNS_ERROR
        assert result.transition_result is None

        # Claim still ACTIVE — error observation must not start grace clock
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value

        # Recheck event records the error, not an absence
        events = _all_recheck_events(db, ix_id, claim_id)
        assert len(events) == 1
        assert events[0]["primary_result"] == "ERROR"
        assert events[0]["outcome"] == RecheckOutcome.DNS_ERROR.value

    def test_two_resolver_errors_do_not_create_confirmed_negative(
        self, db: firestore.Client
    ) -> None:
        """Two DNS errors an hour apart must not transition ACTIVE → RECHECK_REQUIRED."""
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        error_resolver = FakeErrorDnsResolver("TIMEOUT")
        t0 = _make_now()

        # Error run 1
        result1 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="err1",
            resolvers=[error_resolver, error_resolver],
            _now=lambda: t0,
        )
        assert result1.outcome == RecheckOutcome.DNS_ERROR

        # Error run 2 — more than 1 hour later
        result2 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="err2",
            resolvers=[error_resolver, error_resolver],
            _now=lambda: t0 + timedelta(hours=2),
        )
        assert result2.outcome == RecheckOutcome.DNS_ERROR

        # Claim still ACTIVE — two errors never produce confirmed-negative
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value

    def test_absent_then_error_does_not_create_confirmed_negative(
        self, db: firestore.Client
    ) -> None:
        """ABSENT + ERROR (≥1h later) must not produce CONFIRMED_NEGATIVE."""
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        empty_resolver = FakeDnsResolver([])
        error_resolver = FakeErrorDnsResolver("SERVFAIL")
        t0 = _make_now()

        # Run 1: artifact absent (RESOLVED, empty) → TRANSIENT_FAILURE
        result1 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0,
        )
        assert result1.outcome == RecheckOutcome.TRANSIENT_FAILURE

        # Run 2: 70 minutes later, secondary resolver ERRORS — must not confirm negative
        # Primary is ABSENT (would qualify), but secondary returns ERROR
        result2 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run2",
            resolvers=[
                empty_resolver,
                error_resolver,
            ],  # primary ABSENT, secondary ERROR
            _now=lambda: t0 + timedelta(minutes=70),
        )
        assert result2.outcome == RecheckOutcome.DNS_ERROR

        # Claim still ACTIVE
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value

    def test_error_then_absent_does_not_create_confirmed_negative(
        self, db: firestore.Client
    ) -> None:
        """ERROR + ABSENT (≥1h later) must not produce CONFIRMED_NEGATIVE."""
        ix_id = _fresh_ix_id()
        claim_id = self._setup_active_claim(db, ix_id)

        error_resolver = FakeErrorDnsResolver("TIMEOUT")
        empty_resolver = FakeDnsResolver([])
        t0 = _make_now()

        # Run 1: DNS ERROR → DNS_ERROR outcome (not stored as TRANSIENT_FAILURE)
        result1 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run1",
            resolvers=[error_resolver, error_resolver],
            _now=lambda: t0,
        )
        assert result1.outcome == RecheckOutcome.DNS_ERROR

        # Run 2: 70 minutes later, primary is now ABSENT
        # But there is no prior ABSENT TRANSIENT_FAILURE event (only a DNS_ERROR)
        # so this becomes TRANSIENT_FAILURE (first genuine absence)
        result2 = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id="run2",
            resolvers=[empty_resolver, empty_resolver],
            _now=lambda: t0 + timedelta(minutes=70),
        )
        assert result2.outcome == RecheckOutcome.TRANSIENT_FAILURE

        # Claim still ACTIVE — error run does not count as prior absence
        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value

    def test_dns_error_during_verification_returns_error_code(
        self, db: firestore.Client
    ) -> None:
        """DNS errors during initial verification return DNS_RESOLUTION_ERROR, not TXT_RECORD_NOT_FOUND."""
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        error_resolver = FakeErrorDnsResolver("TIMEOUT")

        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=error_resolver
        )

        assert not outcome.success
        assert outcome.error_code == "DNS_RESOLUTION_ERROR"

        # Challenge still PENDING — not consumed on DNS error
        ch = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_challenges")
            .document(issuance.challenge_id)
            .get()
            .to_dict()
        )
        assert ch["status"] == ChallengeStatus.PENDING.value


# ---------------------------------------------------------------------------
# TestScheduledHardExpiration
# ---------------------------------------------------------------------------


class TestScheduledHardExpiration:
    def test_expires_at_reached_transitions_to_expired(
        self, db: firestore.Client
    ) -> None:
        """
        When a claim's expires_at is reached, the scheduler calls the Transition
        Service directly for ACTIVE → EXPIRED. This is an IX_SCHEDULED trigger,
        not handled by the recheck worker.
        """
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])
        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )
        assert outcome.success

        claim_id = outcome.claim_id
        claim = _read_claim(db, ix_id, ix_id if claim_id is None else claim_id)
        state_version = claim["state_version"]

        # Scheduler detects expires_at has passed and calls Transition Service directly
        expiry_req = TransitionRequest(
            ix_id=ix_id,
            claim_id=claim_id,  # type: ignore[arg-type]
            from_status=ClaimStatus.ACTIVE,
            from_version=state_version,
            to_status=ClaimStatus.EXPIRED,
            trigger_type=TriggerType.IX_SCHEDULED,
            trigger_ref_id="scheduler_run_001",
            reason_code="CLAIM_ANNUAL_EXPIRY",
            expired_at=datetime.now(timezone.utc),
        )
        result = execute_transition(db, expiry_req)

        assert result.to_status == ClaimStatus.EXPIRED
        claim = _read_claim(db, ix_id, claim_id)  # type: ignore[arg-type]
        assert claim["status"] == ClaimStatus.EXPIRED.value


# ---------------------------------------------------------------------------
# TestDomainRenewal
# ---------------------------------------------------------------------------


class TestDomainRenewal:
    def test_renewal_creates_new_claim_and_supersedes_old(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()

        # Establish original claim
        issuance1 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver1 = FakeDnsResolver([issuance1.txt_record_value])
        outcome1 = verify_domain(
            db, ix_id, issuance1.challenge_id, "user_abc", resolver=resolver1
        )
        assert outcome1.success
        old_claim_id = outcome1.claim_id

        # Issue fresh challenge for renewal
        issuance2 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver2 = FakeDnsResolver([issuance2.txt_record_value])

        renewal = renew_domain_claim(
            db,
            ix_id,
            old_claim_id=old_claim_id,  # type: ignore[arg-type]
            challenge_id=issuance2.challenge_id,
            account_uid="user_abc",
            resolver=resolver2,
        )

        assert renewal.success
        assert renewal.claim_id != old_claim_id
        new_claim_id = renewal.claim_id

        # New claim is ACTIVE with supersedes pointing to old
        new_claim = _read_claim(db, ix_id, new_claim_id)  # type: ignore[arg-type]
        assert new_claim["status"] == ClaimStatus.ACTIVE.value
        assert new_claim["supersedes"] == old_claim_id

        # Old claim is SUPERSEDED with superseded_by pointing to new
        old_claim = _read_claim(db, ix_id, old_claim_id)  # type: ignore[arg-type]
        assert old_claim["status"] == ClaimStatus.SUPERSEDED.value
        assert old_claim["superseded_by"] == new_claim_id

    def test_renewal_new_challenge_consumed_old_challenge_intact(
        self, db: firestore.Client
    ) -> None:
        ix_id = _fresh_ix_id()

        issuance1 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver1 = FakeDnsResolver([issuance1.txt_record_value])
        outcome1 = verify_domain(
            db, ix_id, issuance1.challenge_id, "user_abc", resolver=resolver1
        )
        assert outcome1.success

        issuance2 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver2 = FakeDnsResolver([issuance2.txt_record_value])
        renew_domain_claim(
            db,
            ix_id,
            old_claim_id=outcome1.claim_id,  # type: ignore[arg-type]
            challenge_id=issuance2.challenge_id,
            account_uid="user_abc",
            resolver=resolver2,
        )

        # Only the renewal challenge was consumed; the original is still CONSUMED
        # (it was consumed by the original verify_domain call)
        ch1 = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_challenges")
            .document(issuance1.challenge_id)
            .get()
            .to_dict()
        )
        ch2 = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_challenges")
            .document(issuance2.challenge_id)
            .get()
            .to_dict()
        )
        assert ch1["status"] == ChallengeStatus.CONSUMED.value
        assert ch2["status"] == ChallengeStatus.CONSUMED.value

    def test_renewal_of_recheck_required_claim_succeeds(
        self, db: firestore.Client
    ) -> None:
        """A claim in RECHECK_REQUIRED can still be renewed (within grace window)."""
        ix_id = _fresh_ix_id()

        issuance1 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver1 = FakeDnsResolver([issuance1.txt_record_value])
        outcome1 = verify_domain(
            db, ix_id, issuance1.challenge_id, "user_abc", resolver=resolver1
        )
        assert outcome1.success
        old_claim_id = outcome1.claim_id

        # Drive claim to RECHECK_REQUIRED
        empty = FakeDnsResolver([])
        t0 = _make_now()
        run_domain_recheck(
            db,
            ix_id,
            old_claim_id,
            "r1",  # type: ignore[arg-type]
            resolvers=[empty, empty],
            _now=lambda: t0,
        )
        run_domain_recheck(
            db,
            ix_id,
            old_claim_id,
            "r2",  # type: ignore[arg-type]
            resolvers=[empty, empty],
            _now=lambda: t0 + timedelta(hours=2),
        )

        old_claim = _read_claim(db, ix_id, old_claim_id)  # type: ignore[arg-type]
        assert old_claim["status"] == ClaimStatus.RECHECK_REQUIRED.value

        # Renewal with fresh challenge succeeds even from RECHECK_REQUIRED
        issuance2 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver2 = FakeDnsResolver([issuance2.txt_record_value])
        renewal = renew_domain_claim(
            db,
            ix_id,
            old_claim_id=old_claim_id,  # type: ignore[arg-type]
            challenge_id=issuance2.challenge_id,
            account_uid="user_abc",
            resolver=resolver2,
        )

        assert renewal.success
        old_after = _read_claim(db, ix_id, old_claim_id)  # type: ignore[arg-type]
        assert old_after["status"] == ClaimStatus.SUPERSEDED.value

    def test_renewal_of_terminal_claim_rejected(self, db: firestore.Client) -> None:
        """EXPIRED claim cannot be renewed through renew_domain_claim."""
        ix_id = _fresh_ix_id()

        issuance1 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver1 = FakeDnsResolver([issuance1.txt_record_value])
        outcome1 = verify_domain(
            db, ix_id, issuance1.challenge_id, "user_abc", resolver=resolver1
        )
        assert outcome1.success
        old_claim_id = outcome1.claim_id

        # Force expire through Transition Service
        claim = _read_claim(db, ix_id, old_claim_id)  # type: ignore[arg-type]
        execute_transition(
            db,
            TransitionRequest(
                ix_id=ix_id,
                claim_id=old_claim_id,  # type: ignore[arg-type]
                from_status=ClaimStatus.ACTIVE,
                from_version=claim["state_version"],
                to_status=ClaimStatus.EXPIRED,
                trigger_type=TriggerType.IX_SCHEDULED,
                trigger_ref_id="scheduler_force_expire",
                reason_code="CLAIM_ANNUAL_EXPIRY",
                expired_at=datetime.now(timezone.utc),
            ),
        )

        issuance2 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver2 = FakeDnsResolver([issuance2.txt_record_value])
        result = renew_domain_claim(
            db,
            ix_id,
            old_claim_id=old_claim_id,  # type: ignore[arg-type]
            challenge_id=issuance2.challenge_id,
            account_uid="user_abc",
            resolver=resolver2,
        )

        assert not result.success
        assert "OLD_CLAIM_NOT_RENEWABLE" in result.error_code  # type: ignore[operator]

    def test_renewal_claim_chain_is_complete(self, db: firestore.Client) -> None:
        """
        After renewal, both the old and new claims must satisfy the Transition
        Completeness invariant (to_version chain is gapless).
        """
        ix_id = _fresh_ix_id()

        issuance1 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver1 = FakeDnsResolver([issuance1.txt_record_value])
        outcome1 = verify_domain(
            db, ix_id, issuance1.challenge_id, "user_abc", resolver=resolver1
        )
        old_claim_id = outcome1.claim_id

        issuance2 = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver2 = FakeDnsResolver([issuance2.txt_record_value])
        renewal = renew_domain_claim(
            db,
            ix_id,
            old_claim_id=old_claim_id,  # type: ignore[arg-type]
            challenge_id=issuance2.challenge_id,
            account_uid="user_abc",
            resolver=resolver2,
        )
        new_claim_id = renewal.claim_id

        for cid in (old_claim_id, new_claim_id):
            claim = _read_claim(db, ix_id, cid)  # type: ignore[arg-type]
            all_events = [
                s.to_dict()
                for s in db.collection("ix_ids")
                .document(ix_id)
                .collection("verification_claims")
                .document(cid)
                .collection("events")
                .stream()
            ]
            trans_events = sorted(
                [e for e in all_events if e.get("event_type") != "CLAIM_CREATED"],
                key=lambda e: e["to_version"],
            )

            if trans_events:
                # Version chain is gapless
                for i in range(1, len(trans_events)):
                    assert (
                        trans_events[i]["from_version"]
                        == trans_events[i - 1]["to_version"]
                    )
                # Event log matches materialized claim
                last = trans_events[-1]
                assert last["to_version"] == claim["state_version"]
                assert last["to_status"] == claim["status"]


# ---------------------------------------------------------------------------
# TestRecheckEvidenceProtocol
# ---------------------------------------------------------------------------


class BarrierResolver:
    """
    DNS resolver that rendezvouses at a threading.Barrier inside observe_txt().

    Both workers pass the initial recheck_ref.get() (read-first check) before
    this resolver is called. By synchronizing here, we guarantee both workers have
    already observed that the event does not exist before either reaches
    recheck_ref.create() — deterministically exercising the AlreadyExists path
    rather than hoping a scheduling accident lands in the right window.
    """

    def __init__(self, barrier: threading.Barrier, observation: DnsObservation) -> None:
        self._barrier = barrier
        self._observation = observation

    def observe_txt(self, domain: str) -> DnsObservation:
        self._barrier.wait(timeout=5)
        return self._observation


class TestRecheckEvidenceProtocol:
    """
    Adversarial tests for the create-only write and evidence-before-transition
    invariants:

      1. Concurrent workers with the same run_id must converge on a single event.
         The AlreadyExists path is exercised deterministically using BarrierResolver.

      2. Crash recovery: if the process dies after creating the evidence event but
         before execute_transition(), the next call with the same run_id detects
         the stored reconstruction params and completes the transition — proven
         via monkeypatching execute_transition() to raise on its first invocation.
    """

    def _make_active_claim(self, db: firestore.Client) -> tuple[str, str, str]:
        """Return (ix_id, claim_id, challenge_token)."""
        ix_id = _fresh_ix_id()
        issuance = issue_challenge(db, ix_id, "example.com", "user_abc")
        resolver = FakeDnsResolver([issuance.txt_record_value])
        outcome = verify_domain(
            db, ix_id, issuance.challenge_id, "user_abc", resolver=resolver
        )
        assert outcome.success
        dvr = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_verification_records")
            .document(outcome.evidence_ref)
            .get()
            .to_dict()
        )
        token: str = dvr["challenge_token"]
        return ix_id, outcome.claim_id, token  # type: ignore[return-value]

    def _drive_to_recheck_required(
        self, db: firestore.Client, ix_id: str, claim_id: str
    ) -> None:
        """Issue two ABSENT observations ≥1h apart to move claim to RECHECK_REQUIRED."""
        empty = FakeDnsResolver([])
        t0 = _make_now()
        run_domain_recheck(
            db, ix_id, claim_id, "setup_r1", resolvers=[empty, empty], _now=lambda: t0
        )
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            "setup_r2",
            resolvers=[empty, empty],
            _now=lambda: t0 + timedelta(hours=2),
        )
        assert (
            _read_claim(db, ix_id, claim_id)["status"]
            == ClaimStatus.RECHECK_REQUIRED.value
        )

    def test_concurrent_same_run_id_creates_only_once(
        self, db: firestore.Client
    ) -> None:
        """
        Deterministically exercises the AlreadyExists concurrency path.

        BarrierResolver synchronizes both workers inside observe_txt(). Since DNS
        observation happens after the initial recheck_ref.get() read, this guarantees
        the following sequence:

          A: initial GET → event absent
          B: initial GET → event absent
                    ↓ (resolver barrier releases both)
          A: create() → succeeds       (wins; TRANSIENT_FAILURE stored)
          B: create() → AlreadyExists  (reads A's document; returns A's outcome)

        Both callers must return the same outcome. Exactly one event must exist.
        Document content must be what the winner wrote, not what the loser would
        have written.
        """
        ix_id, claim_id, token = self._make_active_claim(db)
        run_id = f"concurrent_{uuid.uuid4().hex[:8]}"

        dns_barrier = threading.Barrier(2)
        absent_obs = DnsObservation(
            resolution_status=DnsResolutionStatus.RESOLVED, records=[]
        )
        present_obs = DnsObservation(
            resolution_status=DnsResolutionStatus.RESOLVED,
            records=[f"{TXT_RECORD_PREFIX}{token}"],
        )

        results: list[RecheckOutcome] = []
        errors: list[Exception] = []
        lock = threading.Lock()

        def worker(observation: DnsObservation) -> None:
            resolver = BarrierResolver(dns_barrier, observation)
            try:
                result = run_domain_recheck(
                    db, ix_id, claim_id, run_id, resolvers=[resolver]
                )
                with lock:
                    results.append(result.outcome)
            except Exception as exc:  # noqa: BLE001
                with lock:
                    errors.append(exc)

        t_a = threading.Thread(target=worker, args=(absent_obs,))
        t_b = threading.Thread(target=worker, args=(present_obs,))
        t_a.start()
        t_b.start()
        t_a.join(timeout=10)
        t_b.join(timeout=10)

        assert not errors, f"Worker raised: {errors}"
        assert len(results) == 2

        # Both callers must agree on outcome — the winner's stored result is authoritative.
        assert results[0] == results[1], (
            f"Workers diverged: {results[0]} vs {results[1]}"
        )

        # Exactly one recheck event must exist for this run_id.
        all_events = _all_recheck_events(db, ix_id, claim_id)
        run_events = [e for e in all_events if e.get("run_id") == run_id]
        assert len(run_events) == 1, (
            f"Expected 1 event for run_id={run_id}, found {len(run_events)}"
        )

    def test_crash_recovery_completes_pending_transition(
        self, db: firestore.Client, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """
        Proves the evidence-before-transition ordering using a patched
        execute_transition() that raises on its first invocation.

        Sequence:
          1. run_domain_recheck() observes PRESENT, builds transition params,
             creates the evidence event (create() succeeds).
          2. Patched execute_transition() raises — simulating a crash.
             → Evidence event exists; claim still RECHECK_REQUIRED.

        Recovery:
          3. Same run_id → read-first path → _replay_recheck_event() →
             execute_transition() (second call; patch now delegates to real fn).
          4. Claim is ACTIVE. Evidence event content is unchanged.

        The evidence event is the durable record of intent. It exists before IX
        acts on it, and it must not change when the transition completes on replay.
        """
        ix_id, claim_id, token = self._make_active_claim(db)
        self._drive_to_recheck_required(db, ix_id, claim_id)

        run_id = f"crash_{uuid.uuid4().hex[:8]}"
        event_id = f"{claim_id}_{run_id}"
        present_resolver = FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])

        import ixid_domain_verification_service as svc

        real_execute_transition = svc.execute_transition
        first_call: dict = {"done": False}

        def crash_on_first(db, req):  # type: ignore[no-untyped-def]
            if not first_call["done"]:
                first_call["done"] = True
                raise RuntimeError("simulated crash after evidence write")
            return real_execute_transition(db, req)

        monkeypatch.setattr(svc, "execute_transition", crash_on_first)

        # First invocation: evidence created, then execute_transition() raises.
        with pytest.raises(RuntimeError, match="simulated crash"):
            run_domain_recheck(
                db, ix_id, claim_id, run_id, resolvers=[present_resolver]
            )

        # Crash state assertions.
        event_snap = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_recheck_events")
            .document(event_id)
            .get()
        )
        assert event_snap.exists, (
            "Evidence event must have been created before the crash"
        )
        stored = event_snap.to_dict()
        assert stored["outcome"] == RecheckOutcome.RESTORED.value
        assert stored["transition_triggered"] == "RECHECK_REQUIRED_TO_ACTIVE"
        assert (
            _read_claim(db, ix_id, claim_id)["status"]
            == ClaimStatus.RECHECK_REQUIRED.value
        ), "Claim must remain unchanged after crash"

        # Recovery: same run_id; patch now delegates to real execute_transition.
        result = run_domain_recheck(
            db,
            ix_id,
            claim_id,
            run_id,
            resolvers=[FakeDnsResolver([])],  # irrelevant — read-first path taken
        )

        assert result.outcome == RecheckOutcome.RESTORED
        assert result.transition_result is not None, (
            "Recovery must complete the pending transition"
        )
        assert result.transition_result.to_status == ClaimStatus.ACTIVE
        assert _read_claim(db, ix_id, claim_id)["status"] == ClaimStatus.ACTIVE.value

        # Evidence event content must be identical to what was stored before the crash.
        recovered = (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_recheck_events")
            .document(event_id)
            .get()
            .to_dict()
        )
        assert recovered["outcome"] == stored["outcome"]
        assert recovered["transition_triggered"] == stored["transition_triggered"]
        assert recovered["transition_operation_id"] == stored["transition_operation_id"]
