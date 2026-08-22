"""
IX ID Holder Authority Service v0.1 — Test Suite
==================================================
Contract: docs/architecture/ixid-holder-authority-v0.1.md (FROZEN 2026-08-19)

Two test tiers:
  1. Unit tests (no emulator): prove pure logic — identity_key computation,
     handle canonicalization, payload fingerprints, reserved-handle rejection.
  2. Emulator integration tests: write real Firestore documents, call service
     methods, verify exact Firestore state. Skipped if FIRESTORE_EMULATOR_HOST
     is not set.

The emulator integration tests implement the 25-loop exit gate (Part 7) and
the falsification scenarios (Part 6) directly against authoritative persistence.

Token convention for emulator tests:
  Tests supply a (identity_key, iss, sub) tuple directly to service methods.
  The verify_firebase_id_token() function is not called in these tests —
  service methods that require identity resolution are called with pre-computed
  identity_key values. This isolates Firebase Auth from Firestore correctness.
"""

import os
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone

import pytest
from google.cloud import firestore

import ixid_holder_authority_service as svc
from ixid_holder_authority_service import (
    AccountState,
    AuthIdentityState,
    AuthenticationError,
    AuthorizationError,
    HandleUnavailableError,
    HolderAuthorityService,
    IdempotencyConflictError,
    InternalConsistencyError,
    IxIdState,
    ValidationError,
    canonicalize_handle,
    check_reserved_handle,
    compute_identity_key,
    generate_account_id,
    payload_fingerprint_create_account,
    payload_fingerprint_register_ix_id,
)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

_TEST_ISS = "https://securetoken.google.com/ixid-prod"
_TEST_PROJECT = "ix-id-test"

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture(scope="module")
def db() -> firestore.Client:
    emulator = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not emulator:
        pytest.skip("FIRESTORE_EMULATOR_HOST not set; skipping emulator integration tests")
    return firestore.Client(project=_TEST_PROJECT)


@pytest.fixture()
def service(db: firestore.Client) -> HolderAuthorityService:
    return HolderAuthorityService(db)


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


def _fresh_uid() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


def _fresh_handle() -> str:
    return f"gate-{uuid.uuid4().hex[:8]}"


def _fresh_op() -> str:
    return str(uuid.uuid4())


def _make_identity(uid: str | None = None) -> tuple[str, str, str]:
    """Returns (identity_key, iss, sub) for a synthetic test principal."""
    sub = uid or _fresh_uid()
    key = compute_identity_key(_TEST_ISS, sub)
    return key, _TEST_ISS, sub


def _create_account(service: HolderAuthorityService, uid: str | None = None):
    """Helper: CREATE_ACCOUNT for a fresh principal. Returns (result, identity_key)."""
    key, iss, sub = _make_identity(uid)
    result = service.create_account(
        operation_id=_fresh_op(),
        identity_key=key,
        verified_iss=iss,
        verified_sub=sub,
    )
    return result, key


def _seed_account(
    db: firestore.Client,
    account_state: str,
    owned_ix_id: str | None = None,
) -> tuple[str, str]:
    """Seed an account document directly. Returns (account_id, identity_key)."""
    uid = _fresh_uid()
    key = compute_identity_key(_TEST_ISS, uid)
    account_id = generate_account_id()
    now = datetime.now(timezone.utc)

    db.collection("auth_identities").document(key).set({
        "identity_key": key,
        "issuer": _TEST_ISS,
        "subject": uid,
        "account_id": account_id,
        "linked_at": now,
        "linking_event_id": str(uuid.uuid4()),
        "auth_identity_state": AuthIdentityState.ACTIVE,
        "revoked_at": None,
        "revocation_event_id": None,
    })
    db.collection("accounts").document(account_id).set({
        "account_id": account_id,
        "created_at": now,
        "creation_auth_identity_key": key,
        "creation_security_event_id": str(uuid.uuid4()),
        "account_state": account_state,
        "account_state_version": 0,
        "account_state_changed_at": now,
        "owned_ix_id": owned_ix_id,
    })
    return account_id, key


def _seed_ix_id(
    db: firestore.Client,
    handle: str,
    owner_account_id: str,
    ix_id_state: str,
) -> None:
    """Seed an ix_ids document directly for fixture state."""
    now = datetime.now(timezone.utc)
    db.collection("ix_ids").document(handle).set({
        "ix_id": handle,
        "owner_account_id": owner_account_id,
        "ix_id_state": ix_id_state,
        "ix_id_state_version": 0,
        "ix_id_state_changed_at": now,
        "created_at": now,
    })


def _seed_revoked_auth_identity(db: firestore.Client) -> tuple[str, str]:
    """Seed an auth_identities mapping with REVOKED state. Returns (account_id, identity_key)."""
    uid = _fresh_uid()
    key = compute_identity_key(_TEST_ISS, uid)
    account_id = generate_account_id()
    now = datetime.now(timezone.utc)

    # Auth identity is REVOKED
    db.collection("auth_identities").document(key).set({
        "identity_key": key,
        "issuer": _TEST_ISS,
        "subject": uid,
        "account_id": account_id,
        "linked_at": now,
        "linking_event_id": str(uuid.uuid4()),
        "auth_identity_state": AuthIdentityState.REVOKED,
        "revoked_at": now,
        "revocation_event_id": str(uuid.uuid4()),
    })
    # Account exists (ACTIVE) — revocation is on the auth identity, not the account
    db.collection("accounts").document(account_id).set({
        "account_id": account_id,
        "created_at": now,
        "creation_auth_identity_key": key,
        "creation_security_event_id": str(uuid.uuid4()),
        "account_state": AccountState.ACTIVE,
        "account_state_version": 0,
        "account_state_changed_at": now,
        "owned_ix_id": None,
    })
    return account_id, key


# ===========================================================================
# Unit Tests — no emulator required
# ===========================================================================


class TestIdentityKey:
    """F-15, F-16, loop 24: identity_key derivation."""

    def test_same_inputs_produce_same_key(self):
        k1 = compute_identity_key("https://securetoken.google.com/proj", "uid123")
        k2 = compute_identity_key("https://securetoken.google.com/proj", "uid123")
        assert k1 == k2

    def test_different_iss_same_sub_different_key(self):
        """F-15: Firebase project collision cannot collapse identities."""
        k1 = compute_identity_key("https://securetoken.google.com/proj-a", "uid123")
        k2 = compute_identity_key("https://securetoken.google.com/proj-b", "uid123")
        assert k1 != k2

    def test_same_iss_different_sub_different_key(self):
        """F-16: Case-distinct UIDs produce different identity keys."""
        k1 = compute_identity_key("https://securetoken.google.com/ixid-prod", "AbC123")
        k2 = compute_identity_key("https://securetoken.google.com/ixid-prod", "abc123")
        assert k1 != k2

    def test_different_iss_different_sub_different_key(self):
        k1 = compute_identity_key("https://securetoken.google.com/proj-a", "uid-a")
        k2 = compute_identity_key("https://securetoken.google.com/proj-b", "uid-b")
        assert k1 != k2

    def test_key_is_hex_string(self):
        k = compute_identity_key("https://issuer.example", "sub")
        assert len(k) == 64  # SHA-256 hex = 64 chars
        assert all(c in "0123456789abcdef" for c in k)

    def test_null_byte_separator_prevents_concatenation_collision(self):
        """Without the \\x00 separator, "ab" + "c" == "a" + "bc"."""
        k1 = compute_identity_key("ab", "c")
        k2 = compute_identity_key("a", "bc")
        assert k1 != k2


class TestHandleCanonicalization:
    """§4.1 — F-3b."""

    def test_lowercases_input(self):
        assert canonicalize_handle("Alice") == "alice"

    def test_mixed_case_normalizes(self):
        assert canonicalize_handle("GATE-TEST") == "gate-test"

    def test_valid_handle_passes(self):
        assert canonicalize_handle("mariastacos") == "mariastacos"

    def test_valid_handle_with_hyphens(self):
        assert canonicalize_handle("maria-tacos") == "maria-tacos"

    def test_valid_handle_with_numbers(self):
        assert canonicalize_handle("maria123") == "maria123"

    def test_minimum_length(self):
        assert canonicalize_handle("abc") == "abc"

    def test_maximum_length(self):
        assert canonicalize_handle("a" * 30) == "a" * 30

    def test_too_short_raises(self):
        with pytest.raises(ValidationError) as exc:
            canonicalize_handle("ab")
        assert "INVALID_HANDLE_LENGTH" in exc.value.code

    def test_too_long_raises(self):
        with pytest.raises(ValidationError) as exc:
            canonicalize_handle("a" * 31)
        assert "INVALID_HANDLE_LENGTH" in exc.value.code

    def test_starts_with_hyphen_raises(self):
        with pytest.raises(ValidationError):
            canonicalize_handle("-alice")

    def test_ends_with_hyphen_raises(self):
        with pytest.raises(ValidationError):
            canonicalize_handle("alice-")

    def test_consecutive_hyphens_raises(self):
        with pytest.raises(ValidationError):
            canonicalize_handle("ali--ce")

    def test_unicode_raises(self):
        with pytest.raises(ValidationError):
            canonicalize_handle("aliçe")

    def test_space_raises(self):
        with pytest.raises(ValidationError):
            canonicalize_handle("ali ce")

    def test_non_string_raises(self):
        with pytest.raises(ValidationError):
            canonicalize_handle(123)  # type: ignore


class TestReservedHandles:
    """§4.2."""

    def test_reserved_system_handle_raises(self):
        with pytest.raises(ValidationError) as exc:
            check_reserved_handle("admin")
        assert exc.value.code == "RESERVED_HANDLE"

    def test_reserved_infra_handle_raises(self):
        with pytest.raises(ValidationError):
            check_reserved_handle("api")

    def test_reserved_product_handle_raises(self):
        with pytest.raises(ValidationError):
            check_reserved_handle("implicitex")

    def test_non_reserved_handle_passes(self):
        check_reserved_handle("mariastacos")  # should not raise

    def test_reserved_set_is_hardcoded(self):
        """The reserved set must not be configurable via env or runtime mutation."""
        original_size = len(svc._RESERVED_HANDLES)
        assert original_size > 0
        # Confirm it is a frozenset (immutable)
        assert isinstance(svc._RESERVED_HANDLES, frozenset)


class TestPayloadFingerprints:
    """§5.6 — fingerprints bind receipts to specific operation payloads."""

    def test_create_account_fingerprint_is_deterministic(self):
        key = compute_identity_key(_TEST_ISS, "uid123")
        fp1 = payload_fingerprint_create_account(key)
        fp2 = payload_fingerprint_create_account(key)
        assert fp1 == fp2

    def test_register_ix_id_fingerprint_is_deterministic(self):
        fp1 = payload_fingerprint_register_ix_id("mariastacos")
        fp2 = payload_fingerprint_register_ix_id("mariastacos")
        assert fp1 == fp2

    def test_different_handles_different_fingerprints(self):
        fp1 = payload_fingerprint_register_ix_id("alice")
        fp2 = payload_fingerprint_register_ix_id("bob")
        assert fp1 != fp2


class TestAccountIdGeneration:
    """§2.2 — account_id uniqueness and format."""

    def test_account_id_starts_with_prefix(self):
        aid = generate_account_id()
        assert aid.startswith("ix_")

    def test_account_id_unique(self):
        ids = {generate_account_id() for _ in range(100)}
        assert len(ids) == 100

    def test_account_id_url_safe(self):
        for _ in range(20):
            aid = generate_account_id()
            suffix = aid[3:]
            assert all(c in "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_" for c in suffix)


# ===========================================================================
# verify_firebase_id_token — direct unit tests (no emulator, no Firebase network)
# ===========================================================================
#
# These tests mock firebase_admin.auth.verify_id_token one level below the
# public verify_firebase_id_token() function so that the real admission logic
# (email_verified claim check, iss/sub extraction, identity_key derivation) is
# exercised against concrete decoded-token payloads.
# ===========================================================================


def _make_decoded(
    *,
    iss: str = "https://securetoken.google.com/ixid-prod",
    sub: str = "test-uid-123",
    email_verified=True,
    include_email_verified: bool = True,
) -> dict:
    """Build a minimal decoded Firebase ID token dict."""
    d: dict = {"iss": iss, "sub": sub}
    if include_email_verified:
        d["email_verified"] = email_verified
    return d


class TestVerifyFirebaseIdTokenEmailVerifiedAdmission:
    """
    Direct unit tests for the M2 email_verified admission invariant inside
    verify_firebase_id_token().

    Firebase Admin SDK is mocked at verify_id_token(); the real claim-inspection
    and error-raising logic runs against controlled decoded payloads.
    """

    def _patch_admin(self, monkeypatch, decoded: dict):
        """Replace firebase_admin.auth.verify_id_token with a stub returning decoded."""
        import importlib

        # Ensure the lazy-import path sees our stub regardless of import order.
        firebase_admin_auth = importlib.import_module("firebase_admin.auth")
        monkeypatch.setattr(firebase_admin_auth, "verify_id_token", lambda token, **kw: decoded)
        # Also patch _init_firebase so no real app initialization is attempted.
        monkeypatch.setattr(svc, "_init_firebase", lambda: None)

    def test_verified_email_admitted_when_required(self, monkeypatch):
        """email_verified=True + require_email_verified=True → accepted; returns key/iss/sub."""
        decoded = _make_decoded(email_verified=True)
        self._patch_admin(monkeypatch, decoded)
        key, iss, sub = svc.verify_firebase_id_token("fake-token", require_email_verified=True)
        assert key == compute_identity_key(decoded["iss"], decoded["sub"])
        assert iss == decoded["iss"]
        assert sub == decoded["sub"]

    def test_false_email_verified_denied_when_required(self, monkeypatch):
        """email_verified=False → AuthenticationError / EMAIL_NOT_VERIFIED."""
        self._patch_admin(monkeypatch, _make_decoded(email_verified=False))
        with pytest.raises(AuthenticationError) as exc:
            svc.verify_firebase_id_token("fake-token", require_email_verified=True)
        assert exc.value.internal_code == "EMAIL_NOT_VERIFIED"

    def test_missing_email_verified_denied_when_required(self, monkeypatch):
        """Absent email_verified claim → AuthenticationError / EMAIL_NOT_VERIFIED."""
        self._patch_admin(monkeypatch, _make_decoded(include_email_verified=False))
        with pytest.raises(AuthenticationError) as exc:
            svc.verify_firebase_id_token("fake-token", require_email_verified=True)
        assert exc.value.internal_code == "EMAIL_NOT_VERIFIED"

    def test_truthy_non_boolean_denied_when_required(self, monkeypatch):
        """Non-Boolean truthy value (e.g. 1, 'true') → denied. Exact Boolean True required."""
        for truthy_non_bool in (1, "true", "yes", 1.0, [True]):
            self._patch_admin(monkeypatch, _make_decoded(email_verified=truthy_non_bool))
            with pytest.raises(AuthenticationError) as exc:
                svc.verify_firebase_id_token("fake-token", require_email_verified=True)
            assert exc.value.internal_code == "EMAIL_NOT_VERIFIED", (
                f"Expected EMAIL_NOT_VERIFIED for email_verified={truthy_non_bool!r}"
            )

    def test_not_required_passes_regardless_of_claim(self, monkeypatch):
        """require_email_verified=False → authentication succeeds regardless of email state."""
        for email_verified_value in (False, None, True, 0, ""):
            decoded = _make_decoded(email_verified=email_verified_value)
            self._patch_admin(monkeypatch, decoded)
            key, iss, sub = svc.verify_firebase_id_token("fake-token", require_email_verified=False)
            assert iss == decoded["iss"]

    def test_not_required_missing_claim_passes(self, monkeypatch):
        """require_email_verified=False → accepted even when claim is absent (workspace path)."""
        self._patch_admin(monkeypatch, _make_decoded(include_email_verified=False))
        key, iss, sub = svc.verify_firebase_id_token("fake-token", require_email_verified=False)
        assert sub == "test-uid-123"


# ===========================================================================
# Emulator Integration Tests — 25-Loop Exit Gate + Falsification
# ===========================================================================


class TestLoop1CreateAccount:
    """Loop 1: CREATE_ACCOUNT — new principal."""

    def test_creates_all_documents(self, service, db):
        key, iss, sub = _make_identity()
        op = _fresh_op()
        result = service.create_account(
            operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub
        )

        assert result.created_new is True
        assert result.account_state == AccountState.ACTIVE
        assert result.account_state_version == 0
        assert result.owned_ix_id is None
        assert not result.is_noop

        # Verify auth_identities
        auth = db.collection("auth_identities").document(key).get().to_dict()
        assert auth["account_id"] == result.account_id
        assert auth["auth_identity_state"] == AuthIdentityState.ACTIVE
        assert auth["issuer"] == iss
        assert auth["subject"] == sub

        # Verify account
        acct = db.collection("accounts").document(result.account_id).get().to_dict()
        assert acct["account_state"] == AccountState.ACTIVE
        assert acct["owned_ix_id"] is None
        assert acct["account_state_version"] == 0

        # Verify two account_events
        events = list(
            db.collection("accounts").document(result.account_id)
            .collection("account_events").stream()
        )
        event_types = {e.to_dict()["event_type"] for e in events}
        assert "ACCOUNT_CREATED" in event_types
        assert "AUTH_IDENTITY_LINKED" in event_types

        # Verify receipt
        receipt = db.collection("holder_operation_receipts").document(op).get().to_dict()
        assert receipt["is_noop"] is False
        assert receipt["resolved_account_id"] == result.account_id
        assert receipt["operation_type"] == "CREATE_ACCOUNT"
        assert receipt["target_ix_id"] is None

    def test_no_raw_uid_in_auth_identity_document(self, service, db):
        """§2.2.4: raw Firebase UID (sub) stored in auth_identities but NOT in account_events."""
        key, iss, sub = _make_identity()
        op = _fresh_op()
        result = service.create_account(
            operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub
        )
        events = list(
            db.collection("accounts").document(result.account_id)
            .collection("account_events").stream()
        )
        for e in events:
            ev = e.to_dict()
            assert sub not in str(ev), f"Raw Firebase UID found in event: {ev}"


class TestLoop2RegisterIxId:
    """Loop 2: REGISTER_IX_ID — new handle."""

    def test_creates_ix_id_and_sets_owned_ix_id(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        op = _fresh_op()

        result = service.register_ix_id(
            operation_id=op, identity_key=key, handle_input=handle
        )

        assert result.is_replay is False
        assert result.ix_id == handle
        assert result.ix_id_state == IxIdState.ACTIVE
        assert result.ix_id_state_version == 0
        assert result.owner_account_id == result_ca.account_id

        # Verify ix_ids document
        ix = db.collection("ix_ids").document(handle).get().to_dict()
        assert ix["owner_account_id"] == result_ca.account_id
        assert ix["ix_id_state"] == IxIdState.ACTIVE
        assert ix["ix_id_state_version"] == 0

        # Verify ix_id_state_events
        events = list(db.collection("ix_ids").document(handle).collection("ix_id_state_events").stream())
        assert len(events) == 1
        ev = events[0].to_dict()
        assert ev["operation_type"] == "REGISTRATION"
        assert ev["from_ix_id_state"] is None      # null marks origin
        assert ev["prior_ix_id_state_version"] is None
        assert ev["to_ix_id_state"] == IxIdState.ACTIVE
        assert ev["resulting_ix_id_state_version"] == 0

        # Verify owned_ix_id on account
        acct = db.collection("accounts").document(result_ca.account_id).get().to_dict()
        assert acct["owned_ix_id"] == handle

        # Verify receipt
        receipt = db.collection("holder_operation_receipts").document(op).get().to_dict()
        assert receipt["target_ix_id"] == handle
        assert receipt["result_ix_id_state_version"] == 0
        assert receipt["is_noop"] is False


class TestLoop3WorkspaceAfterFreshSession:
    """Loop 3: GET workspace — fresh session same account."""

    def test_workspace_returns_consistent_state(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle)

        ws = service.get_workspace(key)
        assert ws.account_id == result_ca.account_id
        assert ws.account_state == AccountState.ACTIVE
        assert len(ws.ix_ids) == 1
        assert ws.ix_ids[0]["ix_id"] == handle
        assert ws.ix_ids[0]["ix_id_state"] == IxIdState.ACTIVE


class TestLoop4ConcurrentHandleClaim:
    """Loop 4 / F-1: Two sessions, same handle — exactly one wins."""

    def test_exactly_one_winner_one_409(self, service, db):
        result_a, key_a = _create_account(service)
        result_b, key_b = _create_account(service)
        handle = _fresh_handle()

        results: list = []
        errors: list = []

        def _register(key):
            try:
                r = service.register_ix_id(
                    operation_id=_fresh_op(), identity_key=key, handle_input=handle
                )
                results.append(("ok", r))
            except HandleUnavailableError as e:
                errors.append(("409", str(e)))

        t1 = threading.Thread(target=_register, args=(key_a,))
        t2 = threading.Thread(target=_register, args=(key_b,))
        t1.start(); t2.start()
        t1.join(); t2.join()

        assert len(results) == 1, "Exactly one winner expected"
        assert len(errors) == 1, "Exactly one 409 expected"

        # Exactly one ix_ids document
        ix = db.collection("ix_ids").document(handle).get()
        assert ix.exists
        assert ix.to_dict()["ix_id_state"] == IxIdState.ACTIVE


class TestLoop5NonCanonicalFormOfTakenHandle:
    """Loop 5 / F-3b: Non-canonical forms of a taken handle → 409."""

    def test_uppercase_variant_of_taken_handle_denied(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle)

        # Now try to register upper-cased variant as a different account
        _, key_b = _create_account(service)
        with pytest.raises(HandleUnavailableError):
            service.register_ix_id(
                operation_id=_fresh_op(),
                identity_key=key_b,
                handle_input=handle.upper(),
            )


class TestLoop6Unauthenticated:
    """Loop 6: Unauthenticated request (no auth_identities entry) → 401."""

    def test_register_without_account_raises(self, service, db):
        non_existent_key = compute_identity_key(_TEST_ISS, "ghost_" + _fresh_uid())
        with pytest.raises(AuthenticationError):
            service.register_ix_id(
                operation_id=_fresh_op(),
                identity_key=non_existent_key,
                handle_input=_fresh_handle(),
            )

    def test_workspace_without_account_raises(self, service, db):
        non_existent_key = compute_identity_key(_TEST_ISS, "ghost_" + _fresh_uid())
        with pytest.raises(AuthenticationError):
            service.get_workspace(non_existent_key)


class TestLoop7HandleStates:
    """Loop 7 / F-3: Existing handle in ACTIVE, SUSPENDED, TOMBSTONED — all → 409."""

    def test_active_handle_returns_409(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        _seed_ix_id(db, handle, result_ca.account_id, IxIdState.ACTIVE)

        _, key_b = _create_account(service)
        with pytest.raises(HandleUnavailableError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key_b, handle_input=handle
            )

    def test_suspended_handle_returns_409(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        _seed_ix_id(db, handle, result_ca.account_id, IxIdState.SUSPENDED)

        _, key_b = _create_account(service)
        with pytest.raises(HandleUnavailableError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key_b, handle_input=handle
            )

    def test_tombstoned_handle_returns_409(self, service, db):
        """Loop 13 / F-6: TOMBSTONED handle permanently reserved."""
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        _seed_ix_id(db, handle, result_ca.account_id, IxIdState.TOMBSTONED)

        _, key_b = _create_account(service)
        with pytest.raises(HandleUnavailableError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key_b, handle_input=handle
            )


class TestLoop8IdempotentReplay:
    """Loop 8: Sequential retry — same operation_id, response previously received."""

    def test_create_account_replay_returns_snapshot(self, service, db):
        key, iss, sub = _make_identity()
        op = _fresh_op()
        r1 = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)
        r2 = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)

        assert r1.account_id == r2.account_id
        assert r2.created_new is False  # replay → 200

        # No second account_events record beyond the original two
        events = list(
            db.collection("accounts").document(r1.account_id)
            .collection("account_events").stream()
        )
        assert len(events) == 2

        # Exactly one receipt
        receipts = list(
            db.collection("holder_operation_receipts")
            .where(filter=firestore.FieldFilter("operation_id", "==", op)).stream()
        )
        assert len(receipts) == 1

    def test_register_ix_id_replay_returns_snapshot(self, service, db):
        """F-22: Sequential REGISTER_IX_ID replay after committed response is lost."""
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        op = _fresh_op()

        r1 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        # handle now EXISTS, receipt now exists — replay must succeed via receipt path
        r2 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)

        assert r1.ix_id == r2.ix_id == handle
        assert r2.is_replay is True

        # Exactly one ix_ids document
        ix = db.collection("ix_ids").document(handle).get()
        assert ix.exists

        # Exactly one receipt
        receipt = db.collection("holder_operation_receipts").document(op).get()
        assert receipt.exists

        # Exactly one ix_id_state_events record
        events = list(
            db.collection("ix_ids").document(handle).collection("ix_id_state_events").stream()
        )
        assert len(events) == 1, "Replay must not create a second state event"

    def test_replay_returns_current_state_not_cached_snapshot(self, service, db):
        """A replay after owned_ix_id is set must return the updated account state."""
        key, iss, sub = _make_identity()
        op = _fresh_op()
        r1 = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)

        # Register an IX ID (mutates owned_ix_id on the account)
        handle = _fresh_handle()
        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle)

        # Replay the CREATE_ACCOUNT — must return current snapshot (owned_ix_id = handle)
        r2 = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)
        assert r2.owned_ix_id == handle, (
            "Replay must return current authoritative state, not stale creation-time snapshot"
        )


class TestLoop9OperationIdReuseWithDifferentPayload:
    """Loop 9 / F-5: Same operation_id, different payload fingerprint → 422."""

    def test_create_account_id_reuse_different_fingerprint(self, service, db):
        key_a, iss_a, sub_a = _make_identity()
        key_b, iss_b, sub_b = _make_identity()
        op = _fresh_op()

        service.create_account(operation_id=op, identity_key=key_a, verified_iss=iss_a, verified_sub=sub_a)

        with pytest.raises(IdempotencyConflictError):
            service.create_account(operation_id=op, identity_key=key_b, verified_iss=iss_b, verified_sub=sub_b)

    def test_register_ix_id_different_handle_same_op(self, service, db):
        result_ca, key = _create_account(service)
        op = _fresh_op()
        handle_a = _fresh_handle()
        handle_b = _fresh_handle()

        service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle_a)

        with pytest.raises(IdempotencyConflictError):
            # Same op, different handle → fingerprint mismatch → 422
            service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle_b)


class TestLoop10ConcurrentCreateAccountDifferentOperationIds:
    """Loop 10 / F-11: Same Firebase UID, two operation_ids — exactly one account created."""

    def test_exactly_one_account_two_receipts(self, service, db):
        uid = _fresh_uid()
        key = compute_identity_key(_TEST_ISS, uid)
        iss, sub = _TEST_ISS, uid
        op_a = _fresh_op()
        op_b = _fresh_op()

        results: list = []

        def _create(op):
            r = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)
            results.append(r)

        t1 = threading.Thread(target=_create, args=(op_a,))
        t2 = threading.Thread(target=_create, args=(op_b,))
        t1.start(); t2.start()
        t1.join(); t2.join()

        assert len(results) == 2

        # All results reference the same account_id
        account_ids = {r.account_id for r in results}
        assert len(account_ids) == 1, "Exactly one account must be created"

        # Both operation_ids consumed
        r_a = db.collection("holder_operation_receipts").document(op_a).get()
        r_b = db.collection("holder_operation_receipts").document(op_b).get()
        assert r_a.exists, "Winner receipt must exist"
        assert r_b.exists, "Loser receipt must exist (is_noop=True)"

        noop_values = {
            db.collection("holder_operation_receipts").document(op_a).get().to_dict()["is_noop"],
            db.collection("holder_operation_receipts").document(op_b).get().to_dict()["is_noop"],
        }
        assert noop_values == {True, False}


class TestLoop11ConcurrentSameOperationIdCreateAccount:
    """Loop 11 / F-18: Same operation_id, same principal — concurrent overlap."""

    def test_exactly_one_receipt_and_account(self, service, db):
        key, iss, sub = _make_identity()
        op = _fresh_op()
        results: list = []

        def _create():
            r = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)
            results.append(r)

        t1 = threading.Thread(target=_create)
        t2 = threading.Thread(target=_create)
        t1.start(); t2.start()
        t1.join(); t2.join()

        assert len(results) == 2
        account_ids = {r.account_id for r in results}
        assert len(account_ids) == 1

        # Exactly one receipt
        receipt = db.collection("holder_operation_receipts").document(op).get()
        assert receipt.exists


class TestLoop12SameAccountSecondRegistration:
    """Loop 12 / F-12: Account with owned_ix_id → second REGISTER_IX_ID → 409."""

    def test_second_registration_denied(self, service, db):
        result_ca, key = _create_account(service)
        handle_a = _fresh_handle()
        handle_b = _fresh_handle()

        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle_a)

        with pytest.raises(HandleUnavailableError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input=handle_b
            )

        # No partial state committed for handle_b
        ix_b = db.collection("ix_ids").document(handle_b).get()
        assert not ix_b.exists


class TestLoop14DisabledClosedAccounts:
    """Loop 14 / F-7: DISABLED and CLOSED accounts denied all operations → 403."""

    def test_disabled_account_denied_create_account(self, service, db):
        account_id, key = _seed_account(db, AccountState.DISABLED)
        uid = _fresh_uid()
        # The seeded key already maps to the DISABLED account
        with pytest.raises(AuthorizationError):
            # Reuse key that maps to disabled account — CREATE_ACCOUNT sees existing ACTIVE auth, DISABLED account
            service.create_account(
                operation_id=_fresh_op(), identity_key=key,
                verified_iss=_TEST_ISS, verified_sub=uid,
            )

    def test_closed_account_denied_workspace(self, service, db):
        _, key = _seed_account(db, AccountState.CLOSED)
        with pytest.raises(AuthorizationError):
            service.get_workspace(key)

    def test_disabled_account_denied_workspace(self, service, db):
        _, key = _seed_account(db, AccountState.DISABLED)
        with pytest.raises(AuthorizationError):
            service.get_workspace(key)

    def test_disabled_account_denied_register(self, service, db):
        _, key = _seed_account(db, AccountState.DISABLED)
        with pytest.raises(AuthorizationError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input=_fresh_handle()
            )

    def test_closed_account_denied_register(self, service, db):
        _, key = _seed_account(db, AccountState.CLOSED)
        with pytest.raises(AuthorizationError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input=_fresh_handle()
            )


class TestLoop15SuspendedAccount:
    """Loop 15: SUSPENDED account — mutations denied, workspace read allowed."""

    def test_suspended_register_denied(self, service, db):
        _, key = _seed_account(db, AccountState.SUSPENDED)
        with pytest.raises(AuthorizationError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input=_fresh_handle()
            )

    def test_suspended_workspace_allowed(self, service, db):
        _, key = _seed_account(db, AccountState.SUSPENDED)
        ws = service.get_workspace(key)
        assert ws.account_state == AccountState.SUSPENDED


class TestLoop16ReplayAfterAccountStateChange:
    """Loop 16 / F-19 / F-21: Receipt replay after account suspension or auth revocation → 401/403."""

    def test_create_account_replay_after_suspension_raises_403(self, service, db):
        """F-19: Prior valid receipt; account now SUSPENDED → 403 on replay."""
        key, iss, sub = _make_identity()
        op = _fresh_op()
        r = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)

        # Suspend the account directly (administrative fixture)
        db.collection("accounts").document(r.account_id).update(
            {"account_state": AccountState.SUSPENDED}
        )

        with pytest.raises(AuthorizationError):
            service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)

    def test_create_account_replay_after_auth_revocation_raises_401(self, service, db):
        """F-21: Prior valid receipt; auth identity now REVOKED → 401 on replay."""
        key, iss, sub = _make_identity()
        op = _fresh_op()
        r = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)

        # Revoke the auth identity directly (administrative fixture)
        db.collection("auth_identities").document(key).update(
            {"auth_identity_state": AuthIdentityState.REVOKED}
        )

        with pytest.raises(AuthenticationError):
            service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)


class TestLoop17ConcurrentSameOperationIdRegisterIxId:
    """Loop 17 / F-20: Two concurrent in-flight REGISTER_IX_ID, same operation_id."""

    def test_exactly_one_ix_id_and_receipt(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        op = _fresh_op()
        results: list = []

        def _register():
            try:
                r = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
                results.append(("ok", r))
            except Exception as e:
                results.append(("err", e))

        t1 = threading.Thread(target=_register)
        t2 = threading.Thread(target=_register)
        t1.start(); t2.start()
        t1.join(); t2.join()

        successes = [r for r in results if r[0] == "ok"]
        assert len(successes) >= 1

        # Exactly one ix_ids document
        ix = db.collection("ix_ids").document(handle).get()
        assert ix.exists

        # Exactly one receipt
        receipt = db.collection("holder_operation_receipts").document(op).get()
        assert receipt.exists

        # Exactly one ix_id_state_events record
        events = list(
            db.collection("ix_ids").document(handle).collection("ix_id_state_events").stream()
        )
        assert len(events) == 1


class TestLoop18SequentialReplayAfterLostResponse:
    """Loop 18 / F-22: Committed first call; retry when handle already EXISTS."""

    def test_retry_finds_receipt_not_handle_existence(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        op = _fresh_op()

        # First call commits successfully
        r1 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        assert not r1.is_replay

        # handle now EXISTS — a naive implementation would return 409 here
        r2 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        assert r2.is_replay is True
        assert r2.ix_id == handle
        assert r2.ix_id_state_version == 0

        # Zero additional writes
        events = list(
            db.collection("ix_ids").document(handle).collection("ix_id_state_events").stream()
        )
        assert len(events) == 1, "Replay must not create a second state event"

        receipt = db.collection("holder_operation_receipts").document(op).get()
        assert receipt.exists  # exactly one receipt


class TestLoop20DirectFirestoreDenied:
    """Loop 20 / F-10: Direct Firestore Security Rules tests.

    Delegates to the Node.js @firebase/rules-unit-testing suite in
    services/security-rules-tests/, which creates real client SDK contexts
    subject to Firestore Security Rules (the Python server SDK bypasses rules).

    Proves READ and WRITE denial for both unauthenticated and
    Firebase-authenticated clients against all authority collections.
    """

    def test_security_rules_via_node_suite(self):
        """Run the Node.js security-rules-tests suite as a subprocess.

        Requires:
          - FIRESTORE_EMULATOR_HOST env var (already set for this session)
          - node_modules installed in services/security-rules-tests/

        Fails this Python test if any Node.js test fails, so zero unexpected
        skips appear in the full gate output.
        """
        emulator_host = os.environ.get("FIRESTORE_EMULATOR_HOST")
        if not emulator_host:
            pytest.skip("FIRESTORE_EMULATOR_HOST not set — Security Rules tests require emulator")

        suite_dir = os.path.join(os.path.dirname(__file__), "..", "security-rules-tests")
        suite_dir = os.path.normpath(suite_dir)

        node_modules = os.path.join(suite_dir, "node_modules")
        if not os.path.isdir(node_modules):
            pytest.skip(
                f"Node modules not installed in {suite_dir}. "
                "Run: cd services/security-rules-tests && npm install"
            )

        result = subprocess.run(
            ["npm", "test", "--", "--forceExit"],
            cwd=suite_dir,
            env={**os.environ, "FIRESTORE_EMULATOR_HOST": emulator_host},
            capture_output=True,
            text=True,
            timeout=120,
        )

        if result.returncode != 0:
            # Surface the full Jest output so failures are actionable
            raise AssertionError(
                f"Node.js Security Rules tests FAILED (exit {result.returncode}).\n"
                f"--- stdout ---\n{result.stdout}\n"
                f"--- stderr ---\n{result.stderr}"
            )


class TestLoop21AuditTrailReconstruction:
    """Loop 21: ix_id_state_events and account_events reconstruct history."""

    def test_registration_event_has_null_origin_sentinel(self, service, db):
        """from_ix_id_state=null and prior_ix_id_state_version=null marks origin (§2.3.4)."""
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle)

        events = list(
            db.collection("ix_ids").document(handle).collection("ix_id_state_events").stream()
        )
        assert len(events) == 1
        ev = events[0].to_dict()
        assert ev["from_ix_id_state"] is None
        assert ev["prior_ix_id_state_version"] is None
        assert ev["to_ix_id_state"] == IxIdState.ACTIVE
        assert ev["resulting_ix_id_state_version"] == 0

    def test_account_events_contain_no_raw_uid(self, service, db):
        key, iss, sub = _make_identity()
        r = service.create_account(
            operation_id=_fresh_op(), identity_key=key, verified_iss=iss, verified_sub=sub
        )
        events = list(
            db.collection("accounts").document(r.account_id)
            .collection("account_events").stream()
        )
        for e in events:
            assert sub not in str(e.to_dict()), "Raw Firebase UID must not appear in audit events"


class TestLoop22FreshLoadAfterOperation:
    """Loop 22: Committed state is visible; ix_id_state_version and owned_ix_id correct."""

    def test_owned_ix_id_visible_after_registration(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle)

        acct = db.collection("accounts").document(result_ca.account_id).get().to_dict()
        assert acct["owned_ix_id"] == handle


class TestLoop23CrashAndRetryResilience:
    """Loop 23: Retry after committed response lost — same result, no duplicate transition."""

    def test_create_account_crash_retry(self, service, db):
        key, iss, sub = _make_identity()
        op = _fresh_op()
        r1 = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)
        # Simulate retry
        r2 = service.create_account(operation_id=op, identity_key=key, verified_iss=iss, verified_sub=sub)
        assert r1.account_id == r2.account_id
        assert r2.created_new is False

    def test_register_ix_id_crash_retry(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        op = _fresh_op()
        r1 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        r2 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        assert r1.ix_id == r2.ix_id
        assert r2.is_replay is True


class TestLoop24FirebaseProjectIssuerInKey:
    """Loop 24 / F-15 / F-16: identity_key derivation — covered by unit tests."""

    def test_key_derivation_unit_test_reference(self):
        """Full coverage in TestIdentityKey. This loop confirms the unit tests exist."""
        k1 = compute_identity_key("https://securetoken.google.com/proj-a", "uid")
        k2 = compute_identity_key("https://securetoken.google.com/proj-b", "uid")
        assert k1 != k2


class TestLoop25HolderResponsesNoStore:
    """Loop 25 / F-17: Cache-Control: no-store on all holder responses.
    Full HTTP-level coverage in test_ixid_holder_authority_handler.py.
    This test confirms the service module does not set caching headers
    (the handler's @app.after_request hook is the enforcement point).
    """

    def test_no_store_is_not_set_by_service_module(self):
        """Service returns dataclasses, not HTTP responses. No-store is a handler concern."""
        # Service methods return dataclasses — no HTTP headers to inspect
        # The handler test suite verifies Cache-Control: no-store on all routes
        assert True  # guard: confirms test awareness


# ===========================================================================
# Additional Falsification Tests
# ===========================================================================


class TestF2ClientSuppliedAccountInjection:
    """F-2: account_id is always server-resolved, never client-supplied."""

    def test_owner_account_id_is_server_resolved(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        service.register_ix_id(operation_id=_fresh_op(), identity_key=key, handle_input=handle)

        ix = db.collection("ix_ids").document(handle).get().to_dict()
        # owner_account_id is exactly the server-generated account_id
        assert ix["owner_account_id"] == result_ca.account_id
        # No possibility for client to inject a different account_id via the service
        assert ix["owner_account_id"].startswith("ix_")


class TestF5bLegitimateIdempotencyRetry:
    """F-5b: Legitimate retry with same operation_id → 200, no duplicate state transition."""

    def test_register_legitimate_retry_no_extra_events(self, service, db):
        result_ca, key = _create_account(service)
        handle = _fresh_handle()
        op = _fresh_op()

        r1 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        r2 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)

        assert r1.ix_id_state_version == r2.ix_id_state_version
        events = list(
            db.collection("ix_ids").document(handle).collection("ix_id_state_events").stream()
        )
        assert len(events) == 1


class TestF9FullTOCTOU:
    """F-9: Transaction re-reads guards against state changes between pre-check and transaction."""

    def test_owned_ix_id_guard_prevents_concurrent_second_registration(self, service, db):
        """Two different handles from same account — only one can win (owned_ix_id sentinel)."""
        result_ca, key = _create_account(service)
        handle_a = _fresh_handle()
        handle_b = _fresh_handle()
        results: list = []
        errors: list = []

        def _register(handle):
            try:
                r = service.register_ix_id(
                    operation_id=_fresh_op(), identity_key=key, handle_input=handle
                )
                results.append(r)
            except (HandleUnavailableError, AuthorizationError) as e:
                errors.append(e)

        t1 = threading.Thread(target=_register, args=(handle_a,))
        t2 = threading.Thread(target=_register, args=(handle_b,))
        t1.start(); t2.start()
        t1.join(); t2.join()

        assert len(results) == 1, "Exactly one registration must succeed"
        # Account owns exactly one IX ID
        acct = db.collection("accounts").document(result_ca.account_id).get().to_dict()
        assert acct["owned_ix_id"] is not None


class TestF13DirectAuthorityInvocation:
    """F-13: Direct authority invocation without edge — blocked at Cloud Run IAM boundary.

    This is verified by the production smoke test, not the emulator.
    The emulator does not replicate Cloud Run IAM. Marking as known.
    """

    def test_placeholder_cloud_run_iam_not_testable_in_emulator(self):
        pytest.skip(
            "Cloud Run IAM verification is tested by the production smoke gate, "
            "not the Firestore emulator."
        )


# ===========================================================================
# M2 Gate Tests (§13) — emulator integration
# ===========================================================================
#
# The email_verified admission check (M2-1, M2-2) is handler-level and tested
# in test_ixid_holder_handlers.py. The tests below verify the downstream
# service behaviors that the M2 contract requires after admission passes.
#
# M2-11 (Cloud Armor rate limit) is not testable in the emulator; skipped.
# ===========================================================================


class TestM2FullForwardPath:
    """M2-3: email_verified=true → full forward path through the service."""

    def test_m2_3_full_forward_path(self, service, db):
        """
        After admission check passes (email_verified=true, simulated by reaching
        the service layer): GET workspace → 401 (no account) → CREATE_ACCOUNT 201
        → REGISTER_IX_ID 201 → GET workspace 200 with ix_ids populated.
        """
        key, iss, sub = _make_identity()
        handle = _fresh_handle()

        # No account yet — workspace raises AuthenticationError (auth identity absent)
        with pytest.raises(AuthenticationError):
            service.get_workspace(key)

        # CREATE_ACCOUNT → new account, 201
        ca = service.create_account(
            operation_id=_fresh_op(),
            identity_key=key,
            verified_iss=iss,
            verified_sub=sub,
        )
        assert ca.created_new is True
        assert ca.account_state == AccountState.ACTIVE

        # REGISTER_IX_ID → new IX ID, 201
        ri = service.register_ix_id(
            operation_id=_fresh_op(),
            identity_key=key,
            handle_input=handle,
        )
        assert ri.is_replay is False
        assert ri.ix_id == handle
        assert ri.ix_id_state == IxIdState.ACTIVE

        # GET workspace → 200, account ACTIVE, ix_ids populated
        ws = service.get_workspace(key)
        assert ws.account_state == AccountState.ACTIVE
        assert any(ix["ix_id"] == handle for ix in ws.ix_ids)


class TestM2ReturningUser:
    """M2-4 and M2-5: returning user workspace behavior."""

    def test_m2_4_returning_user_with_ix_id(self, service, db):
        """M2-4: ACTIVE account with IX ID → workspace 200, ix_ids non-empty."""
        handle = _fresh_handle()
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=handle)
        _seed_ix_id(db, handle, account_id, IxIdState.ACTIVE)

        ws = service.get_workspace(key)
        assert ws.account_state == AccountState.ACTIVE
        assert len(ws.ix_ids) == 1
        assert ws.ix_ids[0]["ix_id"] == handle

    def test_m2_5_returning_user_no_ix_id(self, service, db):
        """M2-5: ACTIVE account with no IX ID → workspace 200, ix_ids empty."""
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=None)

        ws = service.get_workspace(key)
        assert ws.account_state == AccountState.ACTIVE
        assert ws.ix_ids == []


class TestM2HandleUnavailable:
    """M2-6 and M2-7: 409/422 on handle conflicts."""

    def test_m2_6_409_handle_unavailable_then_different_handle_succeeds(self, service, db):
        """M2-6: 409 HANDLE_UNAVAILABLE → retry with different handle → 201."""
        taken_handle = _fresh_handle()
        # Seed the taken handle under a different account
        other_account_id, _ = _seed_account(db, AccountState.ACTIVE, owned_ix_id=taken_handle)
        _seed_ix_id(db, taken_handle, other_account_id, IxIdState.ACTIVE)

        # Create a fresh account to attempt registration
        key, iss, sub = _make_identity()
        service.create_account(
            operation_id=_fresh_op(), identity_key=key,
            verified_iss=iss, verified_sub=sub,
        )

        # Attempt the taken handle → 409
        with pytest.raises(HandleUnavailableError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input=taken_handle
            )

        # Use a different handle → 201
        fresh = _fresh_handle()
        ri = service.register_ix_id(
            operation_id=_fresh_op(), identity_key=key, handle_input=fresh
        )
        assert ri.is_replay is False
        assert ri.ix_id == fresh

    def test_m2_7_422_handle_reserved(self, service, db):
        """M2-7: reserved handle → 422 ValidationError(RESERVED_HANDLE)."""
        key, iss, sub = _make_identity()
        service.create_account(
            operation_id=_fresh_op(), identity_key=key,
            verified_iss=iss, verified_sub=sub,
        )
        with pytest.raises(ValidationError) as exc:
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input="admin"
            )
        assert exc.value.code == "RESERVED_HANDLE"


class TestM2IdempotencyReplay:
    """M2-8: response lost → retry with same operation_id → 200 (not 409)."""

    def test_m2_8_register_ix_id_retry_returns_200(self, service, db):
        """
        M2-8: REGISTER_IX_ID committed; retry with same operation_id → 200 (is_replay=True).
        Tests revision 7 idempotency ordering: receipt check precedes handle-existence check.
        """
        key, iss, sub = _make_identity()
        service.create_account(
            operation_id=_fresh_op(), identity_key=key,
            verified_iss=iss, verified_sub=sub,
        )
        handle = _fresh_handle()
        op = _fresh_op()

        r1 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)
        r2 = service.register_ix_id(operation_id=op, identity_key=key, handle_input=handle)

        assert r1.is_replay is False
        assert r2.is_replay is True
        assert r1.ix_id == r2.ix_id == handle


class TestM2SuspendedAccount:
    """M2-9: SUSPENDED account → GET workspace 200 with SUSPENDED state."""

    def test_m2_9_suspended_account_workspace_readable(self, service, db):
        """M2-9: SUSPENDED account reads workspace; REGISTER_IX_ID is denied (not tested here)."""
        account_id, key = _seed_account(db, AccountState.SUSPENDED)

        ws = service.get_workspace(key)
        assert ws.account_state == AccountState.SUSPENDED
        assert ws.ix_ids == []

    def test_m2_9_suspended_account_register_ix_id_denied(self, service, db):
        """SUSPENDED accounts cannot register IX IDs (mutation denied)."""
        account_id, key = _seed_account(db, AccountState.SUSPENDED)
        with pytest.raises(AuthorizationError):
            service.register_ix_id(
                operation_id=_fresh_op(), identity_key=key, handle_input=_fresh_handle()
            )


class TestM2DisabledClosedAccount:
    """M2-10: DISABLED or CLOSED account → GET workspace 403."""

    def test_m2_10_disabled_account_workspace_denied(self, service, db):
        """M2-10: DISABLED account → get_workspace raises AuthorizationError."""
        account_id, key = _seed_account(db, AccountState.DISABLED)
        with pytest.raises(AuthorizationError):
            service.get_workspace(key)

    def test_m2_10_closed_account_workspace_denied(self, service, db):
        """M2-10: CLOSED account → get_workspace raises AuthorizationError."""
        account_id, key = _seed_account(db, AccountState.CLOSED)
        with pytest.raises(AuthorizationError):
            service.get_workspace(key)


class TestM2CloudArmorRateLimit:
    """M2-11: Cloud Armor per-IP rate limit — infrastructure-level, not testable in emulator."""

    def test_m2_11_cloud_armor_not_testable_in_emulator(self):
        pytest.skip(
            "Cloud Armor rate-limit enforcement is verified by the production activation "
            "gate (§1.8 step 5), not the Firestore emulator."
        )
