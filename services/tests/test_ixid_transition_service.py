"""
IX ID Transition Service — Integration Tests

Implements the two mandatory verification tests from:
  implicitex/docs/architecture/ixid-firestore-schema-v0.1.md §11

Test 1 — Historical Reconstruction Test
  Proves: did IX record the history?
  Method: execute a defined operation sequence, delete materialized claim/account
          documents, reconstruct history from subcollection events alone.

Test 2 — Transition Completeness Test
  Proves: does the event log match operational reality, and vice versa?
  Method: read all lifecycle events ordered by to_version; verify the chain is
          continuous, non-duplicated, and consistent with the materialized claim.

These tests use a real Firestore emulator (firebase emulators:start --only firestore).
They must pass before any claim lifecycle code ships to production.
"""

import os
from datetime import datetime, timezone
from unittest.mock import patch

import pytest
from google.cloud import firestore

from ixid_transition_service import (
    ClaimAlreadyExistsError,
    ClaimRecord,
    ClaimStatus,
    IllegalTransitionError,
    ImmutableFieldViolationError,
    StatusMismatchError,
    TransitionRequest,
    TriggerType,
    VersionConflictError,
    build_operation_id,
    create_claim,
    execute_transition,
)

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="session")
def db():
    """Firestore client pointed at the local emulator."""
    os.environ.setdefault("FIRESTORE_EMULATOR_HOST", "localhost:8080")
    client = firestore.Client(project="ix-id-test")
    return client


@pytest.fixture
def ix_id(db):
    """
    Create a minimal IX ID account document and a fresh ACTIVE claim via create_claim().
    Using create_claim() rather than raw Firestore writes ensures the CLAIM_CREATED
    event is always present, making the fixture itself consistent with the invariants
    being tested.
    """
    handle = f"testaccount-{datetime.now(timezone.utc).timestamp()}"
    now = datetime.now(timezone.utc)

    # Account doc (direct write; account creation is not yet in scope of this service)
    db.collection("ix_ids").document(handle).set(
        {
            "ix_id": handle,
            "account_status": "ACTIVE",
            "created_at": now,
        }
    )

    claim_id = f"clm_{handle}"
    record = ClaimRecord(
        ix_id=handle,
        claim_id=claim_id,
        claim_type="DOMAIN",
        subject=f"{handle}.com",
        evidence_type="DNS_TXT",
        evidence_ref=f"evt_dns_{handle}",
        verified_at=now,
        expires_at=None,
        verification_policy_version="domain-v1",
        assurance_level="STANDARD",
        verifier="IX_AUTOMATED",
        supersedes=None,
    )
    create_claim(db, record)

    yield handle, claim_id

    # Cleanup after test
    _delete_ix_id_recursive(db, handle)


def _delete_ix_id_recursive(db, handle):
    """Delete account doc and all subcollections (Firestore does not cascade)."""
    account_ref = db.collection("ix_ids").document(handle)
    claim_refs = list(account_ref.collection("verification_claims").stream())
    for claim_snap in claim_refs:
        claim_ref = claim_snap.reference
        for event_snap in claim_ref.collection("events").stream():
            event_snap.reference.delete()
        claim_ref.delete()
    account_ref.delete()


def _make_request(
    handle,
    claim_id,
    from_status,
    from_version,
    to_status,
    trigger_ref_id="run-001",
    **kwargs,
) -> TransitionRequest:
    return TransitionRequest(
        ix_id=handle,
        claim_id=claim_id,
        from_status=from_status,
        from_version=from_version,
        to_status=to_status,
        trigger_type=TriggerType.IX_SCHEDULED,
        trigger_ref_id=trigger_ref_id,
        reason_code="test",
        **kwargs,
    )


def _read_events(db, handle, claim_id) -> list[dict]:
    events_ref = (
        db.collection("ix_ids")
        .document(handle)
        .collection("verification_claims")
        .document(claim_id)
        .collection("events")
    )
    return [snap.to_dict() for snap in events_ref.stream()]


def _read_claim(db, handle, claim_id) -> dict:
    return (
        db.collection("ix_ids")
        .document(handle)
        .collection("verification_claims")
        .document(claim_id)
        .get()
        .to_dict()
    )


# ---------------------------------------------------------------------------
# §11 Test 1 — Historical Reconstruction Test
# ---------------------------------------------------------------------------


class TestHistoricalReconstruction:
    """
    Execute a defined operation sequence.
    Delete the materialized claim document.
    Reconstruct history from subcollection events alone.
    Assert it matches the expected sequence.
    """

    def test_reconstruct_full_operation_sequence(self, db, ix_id):
        handle, claim_id = ix_id
        claim_ref = (
            db.collection("ix_ids")
            .document(handle)
            .collection("verification_claims")
            .document(claim_id)
        )

        # ── Operation sequence ───────────────────────────────────────────────
        # Step 1: ACTIVE(v0) → RECHECK_REQUIRED(v1)
        now = datetime.now(timezone.utc)
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                from_status=ClaimStatus.ACTIVE,
                from_version=0,
                to_status=ClaimStatus.RECHECK_REQUIRED,
                trigger_ref_id="recheck-run-001",
                recheck_required_at=now,
                grace_expires_at=now,
            ),
        )

        # Step 2: RECHECK_REQUIRED(v1) → ACTIVE(v2)  (artifact restored)
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                from_status=ClaimStatus.RECHECK_REQUIRED,
                from_version=1,
                to_status=ClaimStatus.ACTIVE,
                trigger_ref_id="recheck-run-002",
            ),
        )

        # Step 3: ACTIVE(v2) → EXPIRED(v3)  (scheduled expiration)
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                from_status=ClaimStatus.ACTIVE,
                from_version=2,
                to_status=ClaimStatus.EXPIRED,
                trigger_ref_id="schedule-run-001",
                expired_at=now,
            ),
        )

        expected_chain = [
            (ClaimStatus.ACTIVE, ClaimStatus.RECHECK_REQUIRED, 0, 1),
            (ClaimStatus.RECHECK_REQUIRED, ClaimStatus.ACTIVE, 1, 2),
            (ClaimStatus.ACTIVE, ClaimStatus.EXPIRED, 2, 3),
        ]

        # ── Delete the materialized claim document ───────────────────────────
        # Firestore does NOT cascade-delete subcollections, so events survive.
        claim_ref.delete()
        assert not claim_ref.get().exists, "claim document should be deleted"

        # ── Reconstruct from events subcollection alone ──────────────────────
        raw_events = _read_events(db, handle, claim_id)

        # Separate CLAIM_CREATED event from lifecycle transition events
        created_events = [
            e for e in raw_events if e.get("event_type") == "CLAIM_CREATED"
        ]
        transition_events = [
            e for e in raw_events if e.get("event_type") != "CLAIM_CREATED"
        ]

        # ── Verify CLAIM_CREATED event carries all immutable facts ───────────
        assert len(created_events) == 1, "Exactly one CLAIM_CREATED event must exist"
        created = created_events[0]

        assert created["claim_id"] == claim_id
        assert created["claim_type"] == "DOMAIN"
        assert created["subject"] == f"{handle}.com"
        assert created["evidence_type"] == "DNS_TXT"
        assert created["evidence_ref"] == f"evt_dns_{handle}"
        assert created["verification_policy_version"] == "domain-v1"
        assert created["assurance_level"] == "STANDARD"
        assert created["verifier"] == "IX_AUTOMATED"
        assert created["initial_status"] == ClaimStatus.ACTIVE.value
        assert created["initial_state_version"] == 0
        # These fields are present — the exact values are datetime objects set by create_claim
        assert created["verified_at"] is not None
        assert created["created_at"] is not None

        # ── Verify lifecycle transition chain ────────────────────────────────
        assert len(transition_events) == len(expected_chain), (
            f"Expected {len(expected_chain)} transition events, found {len(transition_events)}"
        )

        events = sorted(transition_events, key=lambda e: e["to_version"])

        for i, (ev, (exp_from, exp_to, exp_fv, exp_tv)) in enumerate(
            zip(events, expected_chain)
        ):
            assert ev["from_status"] == exp_from.value, f"event {i} from_status"
            assert ev["to_status"] == exp_to.value, f"event {i} to_status"
            assert ev["from_version"] == exp_fv, f"event {i} from_version"
            assert ev["to_version"] == exp_tv, f"event {i} to_version"
            assert ev["claim_id"] == claim_id, f"event {i} claim_id"

        # Chain is continuous
        for i in range(1, len(events)):
            assert events[i]["from_version"] == events[i - 1]["to_version"]
            assert events[i]["from_status"] == events[i - 1]["to_status"]


# ---------------------------------------------------------------------------
# §11 Test 2 — Transition Completeness Test
# ---------------------------------------------------------------------------


class TestTransitionCompleteness:
    """
    For every lifecycle event, verify version and status continuity.
    For the final event, verify it matches the materialized claim.
    """

    def _run_completeness_check(self, db, handle, claim_id):
        # Filter out CLAIM_CREATED — it has no to_version; only lifecycle transition events have it.
        events = sorted(
            [
                e
                for e in _read_events(db, handle, claim_id)
                if e.get("event_type") != "CLAIM_CREATED"
            ],
            key=lambda e: e["to_version"],
        )
        claim = _read_claim(db, handle, claim_id)

        if not events:
            # No transitions yet — claim should still be at version 0
            assert claim["state_version"] == 0
            return

        # Chain starts at version 0
        assert events[0]["from_version"] == 0, "Chain must start at from_version=0"

        for i, ev in enumerate(events):
            # Each event increments version by exactly 1
            assert ev["to_version"] == ev["from_version"] + 1, (
                f"Event {i}: to_version ({ev['to_version']}) != from_version ({ev['from_version']}) + 1"
            )

        # Chain is continuous
        for i in range(1, len(events)):
            assert events[i]["from_version"] == events[i - 1]["to_version"], (
                f"Gap in version chain between events {i - 1} and {i}"
            )
            assert events[i]["from_status"] == events[i - 1]["to_status"], (
                f"Status continuity broken between events {i - 1} and {i}"
            )

        # All operation IDs are unique
        op_ids = [ev["transition_operation_id"] for ev in events]
        assert len(op_ids) == len(set(op_ids)), (
            "Duplicate transition_operation_id detected"
        )

        # Final event matches materialized claim
        last = events[-1]
        assert last["to_version"] == claim["state_version"], (
            f"Event chain ends at v{last['to_version']} but claim.state_version={claim['state_version']}"
        )
        assert last["to_status"] == claim["status"], (
            f"Event chain ends at {last['to_status']} but claim.status={claim['status']}"
        )

    def test_single_transition(self, db, ix_id):
        handle, claim_id = ix_id
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                from_status=ClaimStatus.ACTIVE,
                from_version=0,
                to_status=ClaimStatus.RECHECK_REQUIRED,
                trigger_ref_id="run-single",
                recheck_required_at=datetime.now(timezone.utc),
                grace_expires_at=datetime.now(timezone.utc),
            ),
        )
        self._run_completeness_check(db, handle, claim_id)

    def test_multi_transition_chain(self, db, ix_id):
        handle, claim_id = ix_id
        now = datetime.now(timezone.utc)

        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                ClaimStatus.ACTIVE,
                0,
                ClaimStatus.RECHECK_REQUIRED,
                "r1",
                recheck_required_at=now,
                grace_expires_at=now,
            ),
        )
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                ClaimStatus.RECHECK_REQUIRED,
                1,
                ClaimStatus.ACTIVE,
                "r2",
            ),
        )
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                ClaimStatus.ACTIVE,
                2,
                ClaimStatus.EXPIRED,
                "r3",
                expired_at=now,
            ),
        )
        self._run_completeness_check(db, handle, claim_id)


# ---------------------------------------------------------------------------
# Idempotency tests
# ---------------------------------------------------------------------------


class TestIdempotency:
    def test_retry_returns_idempotent_success(self, db, ix_id):
        handle, claim_id = ix_id
        req = _make_request(
            handle,
            claim_id,
            from_status=ClaimStatus.ACTIVE,
            from_version=0,
            to_status=ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-idempotent",
            recheck_required_at=datetime.now(timezone.utc),
            grace_expires_at=datetime.now(timezone.utc),
        )

        r1 = execute_transition(db, req)
        r2 = execute_transition(db, req)  # retry

        assert not r1.idempotent
        assert r2.idempotent
        assert r1.transition_operation_id == r2.transition_operation_id

        # Only one transition event exists (CLAIM_CREATED is separate and expected)
        transition_events = [
            e
            for e in _read_events(db, handle, claim_id)
            if e.get("event_type") != "CLAIM_CREATED"
        ]
        assert len(transition_events) == 1

    def test_idempotent_replay_does_not_double_increment_version(self, db, ix_id):
        handle, claim_id = ix_id
        req = _make_request(
            handle,
            claim_id,
            from_status=ClaimStatus.ACTIVE,
            from_version=0,
            to_status=ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-version-check",
            recheck_required_at=datetime.now(timezone.utc),
            grace_expires_at=datetime.now(timezone.utc),
        )
        execute_transition(db, req)
        execute_transition(db, req)

        claim = _read_claim(db, handle, claim_id)
        assert claim["state_version"] == 1  # incremented exactly once


# ---------------------------------------------------------------------------
# Guard tests
# ---------------------------------------------------------------------------


class TestGuards:
    def test_illegal_transition_raises(self, db, ix_id):
        handle, claim_id = ix_id
        with pytest.raises(IllegalTransitionError):
            # ACTIVE → ACTIVE is not a legal transition
            execute_transition(
                db,
                _make_request(
                    handle,
                    claim_id,
                    from_status=ClaimStatus.ACTIVE,
                    from_version=0,
                    to_status=ClaimStatus.ACTIVE,
                    trigger_ref_id="run-illegal",
                ),
            )

    def test_version_conflict_raises(self, db, ix_id):
        handle, claim_id = ix_id
        # Advance the claim to v1
        execute_transition(
            db,
            _make_request(
                handle,
                claim_id,
                from_status=ClaimStatus.ACTIVE,
                from_version=0,
                to_status=ClaimStatus.RECHECK_REQUIRED,
                trigger_ref_id="run-advance",
                recheck_required_at=datetime.now(timezone.utc),
                grace_expires_at=datetime.now(timezone.utc),
            ),
        )
        # Now try to transition from stale from_version=0
        with pytest.raises(VersionConflictError):
            execute_transition(
                db,
                _make_request(
                    handle,
                    claim_id,
                    from_status=ClaimStatus.ACTIVE,
                    from_version=0,  # stale
                    to_status=ClaimStatus.EXPIRED,
                    trigger_ref_id="run-stale",
                ),
            )

    def test_status_mismatch_raises(self, db, ix_id):
        handle, claim_id = ix_id
        with pytest.raises(StatusMismatchError):
            execute_transition(
                db,
                _make_request(
                    handle,
                    claim_id,
                    from_status=ClaimStatus.RECHECK_REQUIRED,  # wrong — claim is ACTIVE
                    from_version=0,
                    to_status=ClaimStatus.ACTIVE,
                    trigger_ref_id="run-mismatch",
                ),
            )

    def test_immutable_field_violation_raises(self, db, ix_id):
        """
        ImmutableFieldViolationError is raised if lifecycle update dict
        contains an immutable field. Construct a request with a monkeypatched
        _build_lifecycle_updates to simulate the bug.
        """
        handle, claim_id = ix_id
        req = _make_request(
            handle,
            claim_id,
            from_status=ClaimStatus.ACTIVE,
            from_version=0,
            to_status=ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-immutable",
            recheck_required_at=datetime.now(timezone.utc),
            grace_expires_at=datetime.now(timezone.utc),
        )
        with (
            patch(
                "ixid_transition_service._build_lifecycle_updates",
                return_value={
                    "verified_at": datetime.now(timezone.utc)
                },  # immutable field
            ),
            pytest.raises(ImmutableFieldViolationError),
        ):
            execute_transition(db, req)


# ---------------------------------------------------------------------------
# Operation ID determinism test
# ---------------------------------------------------------------------------


class TestCreateClaim:
    def test_create_claim_writes_created_event(self, db, ix_id):
        handle, claim_id = ix_id
        events = _read_events(db, handle, claim_id)
        created = [e for e in events if e.get("event_type") == "CLAIM_CREATED"]
        assert len(created) == 1
        assert created[0]["claim_id"] == claim_id
        assert created[0]["initial_state_version"] == 0
        assert created[0]["initial_status"] == ClaimStatus.ACTIVE.value

    def test_create_claim_twice_raises(self, db, ix_id):
        handle, claim_id = ix_id
        now = datetime.now(timezone.utc)
        duplicate = ClaimRecord(
            ix_id=handle,
            claim_id=claim_id,  # same claim_id
            claim_type="DOMAIN",
            subject=f"{handle}.com",
            evidence_type="DNS_TXT",
            evidence_ref="evt_dns_duplicate",
            verified_at=now,
            expires_at=None,
            verification_policy_version="domain-v1",
            assurance_level="STANDARD",
            verifier="IX_AUTOMATED",
            supersedes=None,
        )
        with pytest.raises(ClaimAlreadyExistsError):
            create_claim(db, duplicate)


class TestOperationId:
    def test_same_inputs_produce_same_id(self):
        req = _make_request(
            "handle",
            "claim-1",
            ClaimStatus.ACTIVE,
            0,
            ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-determinism",
        )
        assert build_operation_id(req) == build_operation_id(req)

    def test_different_trigger_ref_produces_different_id(self):
        req1 = _make_request(
            "handle",
            "claim-1",
            ClaimStatus.ACTIVE,
            0,
            ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-A",
        )
        req2 = _make_request(
            "handle",
            "claim-1",
            ClaimStatus.ACTIVE,
            0,
            ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-B",
        )
        assert build_operation_id(req1) != build_operation_id(req2)

    def test_different_from_version_produces_different_id(self):
        req1 = _make_request(
            "handle",
            "claim-1",
            ClaimStatus.ACTIVE,
            0,
            ClaimStatus.RECHECK_REQUIRED,
            trigger_ref_id="run-X",
        )
        req2 = _make_request(
            "handle",
            "claim-1",
            ClaimStatus.ACTIVE,
            5,
            ClaimStatus.RECHECK_REQUIRED,  # different from_version
            trigger_ref_id="run-X",
        )
        assert build_operation_id(req1) != build_operation_id(req2)
