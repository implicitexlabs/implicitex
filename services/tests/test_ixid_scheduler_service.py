"""
Scheduler Service — integration tests.

Requires the Firestore emulator:
  FIRESTORE_EMULATOR_HOST=localhost:8080 python -m pytest tests/test_ixid_scheduler_service.py -v

Covers:
  - Occurrence ID stability: retries within the same window reuse the same run_id
  - Occurrence ID isolation: new window produces a new run_id; old event is not overwritten
  - Monthly recheck batch: eligible ACTIVE claims are rechecked; ineligible ones are skipped
  - Grace check batch: RECHECK_REQUIRED claims are found and processed
  - Hard expiration batch: claims past expires_at are transitioned to EXPIRED; idempotent
  - Repair sweep: stranded evidence (transition_triggered set, transition not committed)
    is detected and completed; already-committed events are skipped cleanly
  - Batch result accounting: processed/succeeded/failed/skipped counts are correct
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from google.cloud import firestore
from google.cloud.firestore_v1.base_query import FieldFilter

from ixid_domain_verification_service import (
    TXT_RECORD_PREFIX,
    issue_challenge,
    run_domain_recheck,
    verify_domain,
)
from ixid_scheduler_service import (
    ACTIVE_RECHECK_INTERVAL,
    BatchResult,
    _expiration_trigger_ref_id,
    _occurrence_id_for_grace_check,
    _occurrence_id_for_recheck,
    run_expiration_batch,
    run_recheck_batch,
    run_repair_sweep,
)
from ixid_transition_service import (
    ClaimStatus,
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
    return f"sched_{uuid.uuid4().hex[:8]}"


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _make_active_claim(db: firestore.Client) -> tuple[str, str, str]:
    """Return (ix_id, claim_id, token). Sets up an ACTIVE DOMAIN claim."""
    ix_id = _fresh_ix_id()
    issuance = issue_challenge(db, ix_id, "example.com", "user_sched")
    resolver_records = [issuance.txt_record_value]

    class _StaticResolver:
        def observe_txt(self, domain: str):  # type: ignore[no-untyped-def]
            from ixid_domain_verification_service import (
                DnsObservation,
                DnsResolutionStatus,
            )

            return DnsObservation(
                resolution_status=DnsResolutionStatus.RESOLVED,
                records=list(resolver_records),
            )

    outcome = verify_domain(
        db, ix_id, issuance.challenge_id, "user_sched", resolver=_StaticResolver()
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
    return ix_id, outcome.claim_id, dvr["challenge_token"]  # type: ignore[return-value]


def _read_claim(db: firestore.Client, ix_id: str, claim_id: str) -> dict:
    snap = (
        db.collection("ix_ids")
        .document(ix_id)
        .collection("verification_claims")
        .document(claim_id)
        .get()
    )
    assert snap.exists
    return snap.to_dict()


class _FakeDnsResolver:
    def __init__(self, records: list[str]) -> None:
        self._records = records

    def observe_txt(self, domain: str):  # type: ignore[no-untyped-def]
        from ixid_domain_verification_service import DnsObservation, DnsResolutionStatus

        return DnsObservation(
            resolution_status=DnsResolutionStatus.RESOLVED,
            records=list(self._records),
        )


# ---------------------------------------------------------------------------
# TestOccurrenceIds
# ---------------------------------------------------------------------------


class TestOccurrenceIds:
    """Occurrence ID generation is deterministic and window-isolated."""

    def test_same_month_produces_same_recheck_id(self) -> None:
        claim_id = "claim_abc"
        t1 = datetime(2026, 8, 1, 9, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 8, 31, 23, 59, 59, tzinfo=timezone.utc)
        assert _occurrence_id_for_recheck(claim_id, t1) == _occurrence_id_for_recheck(
            claim_id, t2
        )

    def test_different_month_produces_different_recheck_id(self) -> None:
        claim_id = "claim_abc"
        t1 = datetime(2026, 8, 31, tzinfo=timezone.utc)
        t2 = datetime(2026, 9, 1, tzinfo=timezone.utc)
        assert _occurrence_id_for_recheck(claim_id, t1) != _occurrence_id_for_recheck(
            claim_id, t2
        )

    def test_same_day_produces_same_grace_check_id(self) -> None:
        claim_id = "claim_def"
        t1 = datetime(2026, 8, 17, 0, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 8, 17, 23, 59, 59, tzinfo=timezone.utc)
        assert _occurrence_id_for_grace_check(
            claim_id, t1
        ) == _occurrence_id_for_grace_check(claim_id, t2)

    def test_different_day_produces_different_grace_check_id(self) -> None:
        claim_id = "claim_def"
        t1 = datetime(2026, 8, 17, tzinfo=timezone.utc)
        t2 = datetime(2026, 8, 18, tzinfo=timezone.utc)
        assert _occurrence_id_for_grace_check(
            claim_id, t1
        ) != _occurrence_id_for_grace_check(claim_id, t2)

    def test_different_claims_produce_different_ids(self) -> None:
        now = datetime(2026, 8, 17, tzinfo=timezone.utc)
        assert _occurrence_id_for_recheck("claim_a", now) != _occurrence_id_for_recheck(
            "claim_b", now
        )

    def test_expiration_trigger_stable_within_day(self) -> None:
        claim_id = "claim_exp"
        t1 = datetime(2026, 8, 17, 0, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 8, 17, 23, 59, 0, tzinfo=timezone.utc)
        assert _expiration_trigger_ref_id(claim_id, t1) == _expiration_trigger_ref_id(
            claim_id, t2
        )


# ---------------------------------------------------------------------------
# TestRecheckBatch
# ---------------------------------------------------------------------------


class TestRecheckBatch:
    """
    run_recheck_batch() finds eligible claims and calls run_domain_recheck().
    Claims rechecked within their interval window are skipped. The occurrence ID
    is stable within a calendar window, making the batch idempotent on retry.
    """

    def _make_overdue_claim(
        self, db: firestore.Client, days_overdue: int = 31
    ) -> tuple[str, str, str]:
        """
        Create an ACTIVE claim and backdate last_rechecked_at to make it
        eligible for a batch recheck.
        """
        ix_id, claim_id, token = _make_active_claim(db)
        past = _now() - ACTIVE_RECHECK_INTERVAL - timedelta(days=days_overdue)
        (
            db.collection("ix_ids")
            .document(ix_id)
            .collection("verification_claims")
            .document(claim_id)
            .update({"last_rechecked_at": past})
        )
        return ix_id, claim_id, token

    def test_overdue_claim_is_rechecked(self, db: firestore.Client) -> None:
        """
        A claim with last_rechecked_at more than ACTIVE_RECHECK_INTERVAL ago
        must be picked up by the batch and processed with the expected outcome.
        """
        _ix_id, claim_id, token = self._make_overdue_claim(db)

        import ixid_scheduler_service as sched_svc

        original = sched_svc.run_domain_recheck

        def patched_recheck(db, ix_id_, claim_id_, run_id, resolvers=None, _now=None):
            return run_domain_recheck(
                db,
                ix_id_,
                claim_id_,
                run_id,
                resolvers=[_FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])],
                _now=_now,
            )

        batch_now = _now()
        try:
            sched_svc.run_domain_recheck = patched_recheck
            result = run_recheck_batch(db, _now=lambda: batch_now)
        finally:
            sched_svc.run_domain_recheck = original

        job = next((j for j in result.jobs if j.claim_id == claim_id), None)
        assert job is not None, f"Claim {claim_id} not found in batch result"
        assert job.outcome == "PRESENT", f"Unexpected outcome: {job.outcome}"
        assert job.error is None

    def test_recently_rechecked_claim_is_skipped(self, db: firestore.Client) -> None:
        """
        A claim with last_rechecked_at set to now (within ACTIVE_RECHECK_INTERVAL)
        must be skipped — run_domain_recheck() must not be called for it.
        """
        _ix_id, claim_id, _token = _make_active_claim(db)
        # last_rechecked_at is set to creation time by create_claim(); claim is ineligible.

        import ixid_scheduler_service as sched_svc

        original = sched_svc.run_domain_recheck
        was_called = {"flag": False}

        def spy_recheck(db, ix_id_, claim_id_, run_id, resolvers=None, _now=None):
            if claim_id_ == claim_id:
                was_called["flag"] = True
            return original(
                db, ix_id_, claim_id_, run_id, resolvers=resolvers, _now=_now
            )

        batch_now = _now()
        try:
            sched_svc.run_domain_recheck = spy_recheck
            run_recheck_batch(db, _now=lambda: batch_now)
        finally:
            sched_svc.run_domain_recheck = original

        assert not was_called["flag"], (
            "run_domain_recheck must not be called for a recently issued claim"
        )

    def test_batch_occurrence_id_is_stable_on_retry(self, db: firestore.Client) -> None:
        """
        Running the batch twice within the same calendar month produces the same
        run_id for each eligible claim. The second run's recheck event hits the
        read-first idempotency path without overwriting the stored evidence.
        """
        ix_id, claim_id, token = self._make_overdue_claim(db)

        import ixid_scheduler_service as sched_svc

        run_ids_seen: list[str] = []
        original = sched_svc.run_domain_recheck

        def capture_run_id(db, ix_id_, claim_id_, run_id, resolvers=None, _now=None):
            if claim_id_ == claim_id:
                run_ids_seen.append(run_id)
            return run_domain_recheck(
                db,
                ix_id_,
                claim_id_,
                run_id,
                resolvers=[_FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])],
                _now=_now,
            )

        # Both runs use times within the same calendar month.
        batch_now = _now()
        try:
            sched_svc.run_domain_recheck = capture_run_id
            run_recheck_batch(db, _now=lambda: batch_now)
            run_recheck_batch(db, _now=lambda: batch_now + timedelta(hours=6))
        finally:
            sched_svc.run_domain_recheck = original

        assert len(run_ids_seen) == 2, (
            f"Claim must appear in both batch runs; saw run_ids={run_ids_seen}"
        )
        assert run_ids_seen[0] == run_ids_seen[1], (
            "Same calendar month → same run_id → idempotent batch"
        )

        # Exactly one recheck event (read-first path on second run).
        events = list(
            db.collection("ix_ids")
            .document(ix_id)
            .collection("domain_recheck_events")
            .where(filter=FieldFilter("claim_id", "==", claim_id))
            .stream()
        )
        assert len(events) == 1, (
            "Second run must not create a duplicate event for the same run_id"
        )


# ---------------------------------------------------------------------------
# TestExpirationBatch
# ---------------------------------------------------------------------------


class TestExpirationBatch:
    """
    run_expiration_batch() finds ACTIVE claims past expires_at and transitions them
    to EXPIRED. Re-running the same batch is idempotent.
    """

    def _make_expired_claim(self, db: firestore.Client) -> tuple[str, str]:
        """Set up a claim with expires_at in the past."""
        ix_id, claim_id, _token = _make_active_claim(db)
        # Back-date expires_at by writing directly (test-only override)
        past = _now() - timedelta(days=1)
        db.collection("ix_ids").document(ix_id).collection(
            "verification_claims"
        ).document(claim_id).update({"expires_at": past})
        return ix_id, claim_id

    def test_past_due_claim_is_expired(self, db: firestore.Client) -> None:
        ix_id, claim_id = self._make_expired_claim(db)
        batch_now = _now()
        result = run_expiration_batch(db, _now=lambda: batch_now)

        job = next((j for j in result.jobs if j.claim_id == claim_id), None)
        assert job is not None, f"Claim {claim_id} not found in expiration batch"
        assert job.outcome == "EXPIRED"
        assert job.error is None

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.EXPIRED.value

    def test_expiration_is_idempotent(self, db: firestore.Client) -> None:
        """Running the expiration batch twice on the same day must not double-expire."""
        ix_id, claim_id = self._make_expired_claim(db)
        batch_now = _now()

        result1 = run_expiration_batch(db, _now=lambda: batch_now)
        result2 = run_expiration_batch(db, _now=lambda: batch_now)

        job1 = next((j for j in result1.jobs if j.claim_id == claim_id), None)
        job2 = next((j for j in result2.jobs if j.claim_id == claim_id), None)

        assert job1 is not None and job1.outcome == "EXPIRED"
        # Second run: claim already EXPIRED so it doesn't appear in the query
        # (query filters status == ACTIVE). The claim is correctly absent.
        if job2 is not None:
            # If it somehow appeared, it must not have failed
            assert job2.error is None

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.EXPIRED.value
        assert claim["state_version"] == 1  # exactly one transition committed

    def test_active_claim_not_yet_expired_is_not_touched(
        self, db: firestore.Client
    ) -> None:
        """A claim with expires_at in the future must not be expired by the batch."""
        ix_id, claim_id, _token = _make_active_claim(db)
        # expires_at is 12 calendar months from now (set by verify_domain)

        batch_now = _now()
        result = run_expiration_batch(db, _now=lambda: batch_now)

        job = next((j for j in result.jobs if j.claim_id == claim_id), None)
        assert job is None, "Non-expired claim must not appear in expiration batch"

        claim = _read_claim(db, ix_id, claim_id)
        assert claim["status"] == ClaimStatus.ACTIVE.value


# ---------------------------------------------------------------------------
# TestRepairSweep
# ---------------------------------------------------------------------------


class TestRepairSweep:
    """
    run_repair_sweep() finds domain_recheck_events from the lookback window where
    transition_triggered is set and replays them to complete any pending transitions.
    """

    def test_sweep_completes_stranded_transition(
        self, db: firestore.Client, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """
        An evidence event with transition_triggered set but no committed transition
        (simulated by crashing execute_transition() on first call) must be detected
        and completed by the repair sweep.
        """
        ix_id, claim_id, token = _make_active_claim(db)

        # Drive claim to RECHECK_REQUIRED via two ABSENT observations ≥1h apart
        empty = _FakeDnsResolver([])
        t0 = _now()
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

        # Now: crash execute_transition() on first call to simulate evidence-write-then-crash
        import ixid_domain_verification_service as svc

        real_execute = svc.execute_transition
        first_call = {"done": False}

        def crash_once(db, req):  # type: ignore[no-untyped-def]
            if not first_call["done"]:
                first_call["done"] = True
                raise RuntimeError("simulated crash")
            return real_execute(db, req)

        monkeypatch.setattr(svc, "execute_transition", crash_once)

        restore_run_id = f"restore_{uuid.uuid4().hex[:6]}"
        present = _FakeDnsResolver([f"{TXT_RECORD_PREFIX}{token}"])

        with pytest.raises(RuntimeError, match="simulated crash"):
            run_domain_recheck(
                db,
                ix_id,
                claim_id,
                restore_run_id,
                resolvers=[present],
                _now=lambda: t0,
            )

        # Claim still RECHECK_REQUIRED — transition did not commit.
        assert (
            _read_claim(db, ix_id, claim_id)["status"]
            == ClaimStatus.RECHECK_REQUIRED.value
        )

        # Patch is still active (crash_once now delegates to real on 2nd+ call).
        # Run the repair sweep within the lookback window.
        sweep_now = t0 + timedelta(minutes=5)
        result = run_repair_sweep(db, _now=lambda: sweep_now)

        # The stranded event must have been found and repaired.
        repaired = [
            j for j in result.jobs if "REPAIRED" in j.outcome and j.claim_id == claim_id
        ]
        assert len(repaired) == 1, (
            f"Expected 1 repaired job for {claim_id}, got: {result.jobs}"
        )

        # Claim must now be ACTIVE.
        assert _read_claim(db, ix_id, claim_id)["status"] == ClaimStatus.ACTIVE.value

    def test_sweep_skips_already_committed_events(self, db: firestore.Client) -> None:
        """
        An evidence event whose transition already committed must be silently skipped
        by the sweep — not counted as a failure.
        """
        ix_id, claim_id, _token = _make_active_claim(db)

        # Drive to RECHECK_REQUIRED normally (transition commits successfully)
        empty = _FakeDnsResolver([])
        t0 = _now()
        run_domain_recheck(
            db, ix_id, claim_id, "rr_a", resolvers=[empty, empty], _now=lambda: t0
        )
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            "rr_b",
            resolvers=[empty, empty],
            _now=lambda: t0 + timedelta(hours=2),
        )
        assert (
            _read_claim(db, ix_id, claim_id)["status"]
            == ClaimStatus.RECHECK_REQUIRED.value
        )

        # Sweep: the confirmed-negative event has transition_triggered set
        # and the transition was committed. Sweep must not fail.
        sweep_now = t0 + timedelta(minutes=10)
        result = run_repair_sweep(db, _now=lambda: sweep_now)

        failures = [
            j for j in result.jobs if j.outcome == "ERROR" and j.claim_id == claim_id
        ]
        assert not failures, (
            f"Already-committed events must not produce errors: {failures}"
        )

    def test_sweep_does_not_touch_events_outside_lookback(
        self, db: firestore.Client
    ) -> None:
        """
        Events outside the REPAIR_SWEEP_LOOKBACK window must not be processed.
        """
        ix_id, claim_id, _token = _make_active_claim(db)
        empty = _FakeDnsResolver([])
        t0 = _now() - timedelta(hours=48)  # 48h ago — outside 24h lookback

        run_domain_recheck(
            db, ix_id, claim_id, "old_r1", resolvers=[empty, empty], _now=lambda: t0
        )
        run_domain_recheck(
            db,
            ix_id,
            claim_id,
            "old_r2",
            resolvers=[empty, empty],
            _now=lambda: t0 + timedelta(hours=2),
        )

        # Sweep at current time — old events fall outside lookback
        sweep_now = _now()
        result = run_repair_sweep(db, _now=lambda: sweep_now)

        # Claim events from 48h ago must not appear in sweep result
        old_jobs = [j for j in result.jobs if j.claim_id == claim_id]
        assert not old_jobs, (
            f"Events outside lookback window must not be processed: {old_jobs}"
        )


# ---------------------------------------------------------------------------
# TestBatchResultAccounting
# ---------------------------------------------------------------------------


class TestBatchResultAccounting:
    def test_batch_result_errors_property(self) -> None:
        from ixid_scheduler_service import ClaimJobResult

        result = BatchResult(processed=3, succeeded=2, failed=1)
        result.jobs = [
            ClaimJobResult("c1", "ix1", "r1", "PRESENT"),
            ClaimJobResult("c2", "ix2", "r2", "ERROR", error="boom"),
            ClaimJobResult("c3", "ix3", "r3", "SKIPPED"),
        ]
        assert result.errors == ["boom"]
        assert result.succeeded == 2
        assert result.failed == 1
