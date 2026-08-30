"""
IX ID M3 Payment Route — Emulator Integration Tests
=====================================================
Tests for issue_wallet_challenge, verify_wallet_challenge, get_payment_route,
disable_payment_route, and the public /public/route/<ix_id> projection endpoint.

All emulator tests are skipped if FIRESTORE_EMULATOR_HOST is not set.

Signature testing uses eth_account.Account.sign_message with a known test private key.
"""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone

import pytest
from eth_account import Account
from eth_account.messages import encode_defunct
from google.cloud import firestore

import ixid_projection_handler as proj_handler
from ixid_projection_handler import app as proj_app
from ixid_holder_authority_service import (
    AccountState,
    AuthIdentityState,
    AuthorizationError,
    HolderAuthorityService,
    InternalConsistencyError,
    IxIdState,
    RateLimitError,
    ValidationError,
    compute_identity_key,
    generate_account_id,
    _validate_wallet_address,
)

# Native Circle USDC on Polygon mainnet (canonical; also checked via asset-route-registry.md).
_POLYGON_USDC_CONTRACT = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
_POLYGON_USDC_ASSET_BINDING = "polygon-pos-native-usdc-v1"

# ---------------------------------------------------------------------------
# Test private keys and addresses
# ---------------------------------------------------------------------------

_TEST_PRIVKEY = "0x" + "1" * 64
_TEST_ADDRESS = Account.from_key(_TEST_PRIVKEY).address.lower()

_WRONG_PRIVKEY = "0x" + "2" * 64
_WRONG_ADDRESS = Account.from_key(_WRONG_PRIVKEY).address.lower()

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


@pytest.fixture()
def proj_client():
    proj_app.config["TESTING"] = True
    # Wire projection handler to emulator
    emulator = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not emulator:
        pytest.skip("FIRESTORE_EMULATOR_HOST not set")
    # Reset the cached db so it picks up the emulator
    proj_handler._db = firestore.Client(project=_TEST_PROJECT)
    with proj_app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Test helpers
# ---------------------------------------------------------------------------


def _fresh_uid() -> str:
    return f"user_{uuid.uuid4().hex[:12]}"


def _fresh_handle() -> str:
    return f"wr-{uuid.uuid4().hex[:8]}"


def _fresh_op() -> str:
    return str(uuid.uuid4())


def _make_identity(uid: str | None = None) -> tuple[str, str, str]:
    sub = uid or _fresh_uid()
    key = compute_identity_key(_TEST_ISS, sub)
    return key, _TEST_ISS, sub


def _seed_account(
    db: firestore.Client,
    account_state: str,
    owned_ix_id: str | None = None,
) -> tuple[str, str]:
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
    active_payment_route_address: str | None = None,
    active_payment_route_claim_id: str | None = None,
    routing_suspended: bool = False,
) -> None:
    now = datetime.now(timezone.utc)
    doc: dict = {
        "ix_id": handle,
        "owner_account_id": owner_account_id,
        "ix_id_state": IxIdState.ACTIVE,
        "ix_id_state_version": 0,
        "ix_id_state_changed_at": now,
        "created_at": now,
    }
    if active_payment_route_address is not None:
        doc["active_payment_route_address"] = active_payment_route_address
    if active_payment_route_claim_id is not None:
        doc["active_payment_route_claim_id"] = active_payment_route_claim_id
    if routing_suspended:
        doc["routing_suspended"] = True
    db.collection("ix_ids").document(handle).set(doc)


def _make_account_with_ix_id(
    db: firestore.Client,
    service: HolderAuthorityService,
) -> tuple[str, str]:
    """Create an ACTIVE account with a registered IX ID. Returns (handle, identity_key)."""
    key, iss, sub = _make_identity()
    service.create_account(
        operation_id=_fresh_op(),
        identity_key=key,
        verified_iss=iss,
        verified_sub=sub,
    )
    handle = _fresh_handle()
    service.register_ix_id(
        operation_id=_fresh_op(),
        identity_key=key,
        handle_input=handle,
    )
    return handle, key


def _sign_challenge(challenge_text: str, privkey: str = _TEST_PRIVKEY) -> str:
    """Sign challenge_text with personal_sign (EIP-191) using privkey."""
    message = encode_defunct(text=challenge_text)
    signed = Account.sign_message(message, private_key=privkey)
    return signed.signature.hex()


# ---------------------------------------------------------------------------
# Unit tests for _validate_wallet_address (no emulator required)
# ---------------------------------------------------------------------------


class TestValidateWalletAddress:
    def test_valid_address_lowercase(self):
        addr = "0x" + "a" * 40
        assert _validate_wallet_address(addr) == addr

    def test_valid_address_mixed_case_normalized(self):
        addr = "0xAbCd" + "1" * 36
        result = _validate_wallet_address(addr)
        assert result == addr.lower()

    def test_invalid_not_string(self):
        with pytest.raises(ValidationError) as exc:
            _validate_wallet_address(123)  # type: ignore[arg-type]
        assert exc.value.code == "INVALID_ADDRESS"

    def test_invalid_too_short(self):
        with pytest.raises(ValidationError) as exc:
            _validate_wallet_address("0x" + "a" * 38)
        assert exc.value.code == "INVALID_ADDRESS"

    def test_invalid_no_0x_prefix(self):
        with pytest.raises(ValidationError) as exc:
            _validate_wallet_address("a" * 40)
        assert exc.value.code == "INVALID_ADDRESS"

    def test_invalid_zero_address(self):
        with pytest.raises(ValidationError) as exc:
            _validate_wallet_address("0x" + "0" * 40)
        assert exc.value.code == "INVALID_ADDRESS"

    def test_invalid_non_hex_chars(self):
        with pytest.raises(ValidationError) as exc:
            _validate_wallet_address("0x" + "g" * 40)
        assert exc.value.code == "INVALID_ADDRESS"


# ===========================================================================
# Emulator integration tests
# ===========================================================================


class TestWalletChallengeIssuance:
    def test_issue_wallet_challenge_valid(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        result = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        assert result.challenge_id
        assert result.ix_id == handle
        assert result.destination_address == _TEST_ADDRESS
        assert result.chain_id == 137
        assert handle in result.challenge_text
        assert _TEST_ADDRESS in result.challenge_text
        assert result.challenge_id in result.challenge_text
        assert result.expires_at > datetime.now(timezone.utc)

        # Verify Firestore document written
        doc = (
            db.collection("ix_ids").document(handle)
            .collection("wallet_challenges").document(result.challenge_id)
            .get().to_dict()
        )
        assert doc["status"] == "PENDING"
        assert doc["destination_address"] == _TEST_ADDRESS
        assert doc["chain_id"] == 137

    def test_issue_wallet_challenge_invalid_address_format(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.issue_wallet_challenge(key, "not-an-address")
        assert exc.value.code == "INVALID_ADDRESS"

    def test_issue_wallet_challenge_zero_address_rejected(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.issue_wallet_challenge(key, "0x" + "0" * 40)
        assert exc.value.code == "INVALID_ADDRESS"

    def test_issue_wallet_challenge_no_ix_id_rejected(self, service, db):
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=None)
        with pytest.raises(ValidationError) as exc:
            service.issue_wallet_challenge(key, _TEST_ADDRESS)
        assert exc.value.code == "NO_IX_ID"

    def test_issue_wallet_challenge_cancels_prior_pending(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        first = service.issue_wallet_challenge(key, _TEST_ADDRESS)

        # Issue a second challenge
        second = service.issue_wallet_challenge(key, _TEST_ADDRESS)

        # First should be CANCELLED
        first_doc = (
            db.collection("ix_ids").document(handle)
            .collection("wallet_challenges").document(first.challenge_id)
            .get().to_dict()
        )
        assert first_doc["status"] == "CANCELLED"

        # Second should be PENDING
        second_doc = (
            db.collection("ix_ids").document(handle)
            .collection("wallet_challenges").document(second.challenge_id)
            .get().to_dict()
        )
        assert second_doc["status"] == "PENDING"

    def test_issue_wallet_challenge_normalizes_address(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        mixed_addr = _TEST_ADDRESS.upper().replace("0X", "0x")
        result = service.issue_wallet_challenge(key, mixed_addr)
        assert result.destination_address == _TEST_ADDRESS


class TestWalletVerification:
    def test_verify_correct_signature_publishes_route(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(challenge.challenge_text)

        result = service.verify_wallet_challenge(key, challenge.challenge_id, sig)

        assert result.claim_id
        assert result.ix_id == handle
        assert result.destination_address == _TEST_ADDRESS
        assert result.chain_id == 137
        assert result.is_replacement is False

    def test_verify_wrong_signer_rejected(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        # Sign with WRONG private key
        sig = _sign_challenge(challenge.challenge_text, _WRONG_PRIVKEY)

        with pytest.raises(ValidationError) as exc:
            service.verify_wallet_challenge(key, challenge.challenge_id, sig)
        assert exc.value.code == "WRONG_SIGNER"

    def test_verify_expired_challenge_rejected(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)

        # Manually expire the challenge
        ix_ref = db.collection("ix_ids").document(handle)
        ix_ref.collection("wallet_challenges").document(challenge.challenge_id).update({
            "expires_at": datetime.now(timezone.utc) - timedelta(seconds=1),
        })

        sig = _sign_challenge(challenge.challenge_text)
        with pytest.raises(ValidationError) as exc:
            service.verify_wallet_challenge(key, challenge.challenge_id, sig)
        assert exc.value.code == "CHALLENGE_EXPIRED"

    def test_verify_consumed_challenge_rejected_replay(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(challenge.challenge_text)

        # First verify succeeds
        service.verify_wallet_challenge(key, challenge.challenge_id, sig)

        # Second verify (replay) must fail
        with pytest.raises(ValidationError) as exc:
            service.verify_wallet_challenge(key, challenge.challenge_id, sig)
        assert exc.value.code == "CHALLENGE_ALREADY_USED"

    def test_verify_malformed_signature_rejected(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)

        with pytest.raises(ValidationError) as exc:
            service.verify_wallet_challenge(key, challenge.challenge_id, "not-a-signature")
        assert exc.value.code == "INVALID_SIGNATURE"

    def test_verify_wrong_holder_rejected(self, service, db):
        """Challenge issued to account A cannot be consumed by account B.

        The challenge is stored under account A's IX ID subcollection. When
        account B looks up the challenge_id under its own IX ID, the document
        does not exist. The service returns CHALLENGE_NOT_FOUND — which is the
        correct security outcome: B cannot enumerate or consume A's challenges.
        """
        handle_a, key_a = _make_account_with_ix_id(db, service)
        _handle_b, key_b = _make_account_with_ix_id(db, service)

        challenge = service.issue_wallet_challenge(key_a, _TEST_ADDRESS)
        sig = _sign_challenge(challenge.challenge_text)

        # Account B tries to use account A's challenge.
        # The challenge lives under A's ix_id subcollection; B cannot see it.
        # Either CHALLENGE_NOT_FOUND (ValidationError) or AuthorizationError is acceptable.
        with pytest.raises((AuthorizationError, ValidationError)) as exc:
            service.verify_wallet_challenge(key_b, challenge.challenge_id, sig)
        # If ValidationError, must be CHALLENGE_NOT_FOUND (not a different error code)
        if isinstance(exc.value, ValidationError):
            assert exc.value.code == "CHALLENGE_NOT_FOUND"

    def test_verify_challenge_not_found(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.verify_wallet_challenge(key, str(uuid.uuid4()), "0x" + "a" * 130)
        assert exc.value.code == "CHALLENGE_NOT_FOUND"


class TestPaymentRoutePublish:
    def test_publish_creates_wallet_binding_event(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(challenge.challenge_text)
        result = service.verify_wallet_challenge(key, challenge.challenge_id, sig)

        ix_ref = db.collection("ix_ids").document(handle)
        events = list(ix_ref.collection("wallet_binding_events").stream())
        assert len(events) == 1
        ev = events[0].to_dict()
        assert ev["wallet_address"] == _TEST_ADDRESS
        assert ev["signature_verified"] is True
        assert ev["method"] == "ETH_SIGN_CHALLENGE"
        assert ev["chain_id"] == 137
        assert ev["prior_wallet_address"] is None
        assert ev["prior_claim_id"] is None

    def test_publish_creates_payment_route_claim(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(challenge.challenge_text)
        result = service.verify_wallet_challenge(key, challenge.challenge_id, sig)

        ix_ref = db.collection("ix_ids").document(handle)
        claim_doc = ix_ref.collection("verification_claims").document(result.claim_id).get().to_dict()
        assert claim_doc["claim_type"] == "PAYMENT_ROUTE"
        assert claim_doc["status"] == "ACTIVE"
        assert claim_doc["subject"] == _TEST_ADDRESS
        assert claim_doc["chain_id"] == 137

    def test_publish_updates_ix_id_active_route(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        challenge = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(challenge.challenge_text)
        result = service.verify_wallet_challenge(key, challenge.challenge_id, sig)

        ix_doc = db.collection("ix_ids").document(handle).get().to_dict()
        assert ix_doc["active_payment_route_address"] == _TEST_ADDRESS
        assert ix_doc["active_payment_route_claim_id"] == result.claim_id
        assert ix_doc.get("routing_suspended") is False


class TestPaymentRouteReplacement:
    def test_replacement_creates_new_claim(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)

        # First route
        ch1 = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig1 = _sign_challenge(ch1.challenge_text)
        r1 = service.verify_wallet_challenge(key, ch1.challenge_id, sig1)

        # Second route (replacement)
        ch2 = service.issue_wallet_challenge(key, _WRONG_ADDRESS)
        sig2 = _sign_challenge(ch2.challenge_text, _WRONG_PRIVKEY)
        r2 = service.verify_wallet_challenge(key, ch2.challenge_id, sig2)

        assert r2.is_replacement is True
        assert r2.claim_id != r1.claim_id
        assert r2.destination_address == _WRONG_ADDRESS

    def test_replacement_supersedes_prior_claim(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)

        ch1 = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig1 = _sign_challenge(ch1.challenge_text)
        r1 = service.verify_wallet_challenge(key, ch1.challenge_id, sig1)

        ch2 = service.issue_wallet_challenge(key, _WRONG_ADDRESS)
        sig2 = _sign_challenge(ch2.challenge_text, _WRONG_PRIVKEY)
        r2 = service.verify_wallet_challenge(key, ch2.challenge_id, sig2)

        ix_ref = db.collection("ix_ids").document(handle)
        prior_claim = ix_ref.collection("verification_claims").document(r1.claim_id).get().to_dict()
        assert prior_claim["status"] == "SUPERSEDED"
        assert prior_claim["superseded_by"] == r2.claim_id

    def test_replacement_wallet_binding_event_records_prior(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)

        ch1 = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig1 = _sign_challenge(ch1.challenge_text)
        r1 = service.verify_wallet_challenge(key, ch1.challenge_id, sig1)

        ch2 = service.issue_wallet_challenge(key, _WRONG_ADDRESS)
        sig2 = _sign_challenge(ch2.challenge_text, _WRONG_PRIVKEY)
        r2 = service.verify_wallet_challenge(key, ch2.challenge_id, sig2)

        ix_ref = db.collection("ix_ids").document(handle)
        events = list(ix_ref.collection("wallet_binding_events").stream())
        # Find the second event (replacement)
        replacement_ev = [
            e.to_dict() for e in events
            if e.to_dict().get("prior_wallet_address") is not None
        ]
        assert len(replacement_ev) == 1
        ev = replacement_ev[0]
        assert ev["prior_wallet_address"] == _TEST_ADDRESS
        assert ev["prior_claim_id"] == r1.claim_id


class TestPaymentRouteDisable:
    def test_disable_removes_active_route(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        r = service.verify_wallet_challenge(key, ch.challenge_id, sig)

        result = service.disable_payment_route(key)

        assert result.ix_id == handle
        assert result.destination_address is None
        assert result.chain_id is None
        assert result.asset is None
        assert result.claim_id is None
        assert result.routing_suspended is True

        ix_doc = db.collection("ix_ids").document(handle).get().to_dict()
        assert ix_doc.get("active_payment_route_address") is None
        assert ix_doc.get("active_payment_route_claim_id") is None
        assert ix_doc.get("routing_suspended") is True

        # Prior claim should be REVOKED
        ix_ref = db.collection("ix_ids").document(handle)
        claim = ix_ref.collection("verification_claims").document(r.claim_id).get().to_dict()
        assert claim["status"] == "REVOKED"

    def test_disable_no_route_rejected(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.disable_payment_route(key)
        assert exc.value.code == "NO_ACTIVE_ROUTE"

    def test_disable_no_ix_id_rejected(self, service, db):
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=None)
        with pytest.raises(ValidationError) as exc:
            service.disable_payment_route(key)
        assert exc.value.code == "NO_IX_ID"


class TestPaymentRouteGet:
    def test_get_route_no_ix_id(self, service, db):
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=None)
        result = service.get_payment_route(key)
        assert result.ix_id is None
        assert result.destination_address is None
        assert result.chain_id is None
        assert result.asset is None
        assert result.claim_id is None
        assert result.routing_suspended is False

    def test_get_route_with_active_route(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        r = service.verify_wallet_challenge(key, ch.challenge_id, sig)

        result = service.get_payment_route(key)
        assert result.ix_id == handle
        assert result.destination_address == _TEST_ADDRESS
        assert result.chain_id == 137
        assert isinstance(result.asset, dict)
        assert result.asset["symbol"] == "USDC"
        assert result.claim_id == r.claim_id
        assert result.routing_suspended is False

    def test_get_route_no_route(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        result = service.get_payment_route(key)
        assert result.ix_id == handle
        assert result.destination_address is None
        assert result.chain_id is None
        assert result.asset is None
        assert result.claim_id is None
        assert result.routing_suspended is False

    def test_get_route_after_disable_shows_suspended(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)
        service.disable_payment_route(key)

        result = service.get_payment_route(key)
        assert result.destination_address is None
        assert result.routing_suspended is True


class TestPublicRouteResolver:
    def test_public_route_nonexistent_ix_id_404(self, proj_client, db):
        resp = proj_client.get("/public/route/nonexistent-handle-xyz")
        assert resp.status_code == 404
        body = json.loads(resp.data)
        assert "error" in body

    def test_public_route_no_active_route_payable_false(self, proj_client, db, service):
        handle = _fresh_handle()
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=handle)
        _seed_ix_id(db, handle, account_id)

        resp = proj_client.get(f"/public/route/{handle}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["ix_id"] == handle
        assert body["payable"] is False
        assert "destination_address" not in body

    def test_public_route_with_active_route_payable_true(self, proj_client, db, service):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        r = service.verify_wallet_challenge(key, ch.challenge_id, sig)

        resp = proj_client.get(f"/public/route/{handle}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["ix_id"] == handle
        assert body["payable"] is True
        assert body["destination_address"] == _TEST_ADDRESS
        assert body["chain_id"] == 137
        assert isinstance(body["asset"], dict)
        assert body["asset"]["symbol"] == "USDC"
        assert body["claim_id"] == r.claim_id

    def test_public_route_no_signature_exposed(self, proj_client, db, service):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        resp = proj_client.get(f"/public/route/{handle}")
        body = json.loads(resp.data)
        # Private fields must not appear
        assert "signature" not in body
        assert "challenge_text" not in body
        assert "account_id" not in body
        assert "challenge_id" not in body

    def test_public_route_suspended_payable_false(self, proj_client, db, service):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)
        service.disable_payment_route(key)

        resp = proj_client.get(f"/public/route/{handle}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["payable"] is False

    def test_public_route_cache_control_no_store(self, proj_client, db):
        handle = _fresh_handle()
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=handle)
        _seed_ix_id(db, handle, account_id)

        resp = proj_client.get(f"/public/route/{handle}")
        assert resp.headers.get("Cache-Control") == "no-store"


# ===========================================================================
# Asset identity tests — M3 structured USDC object
# ===========================================================================


class TestAssetIdentity:
    """Verify that asset is a structured dict with precise USDC identity,
    not an ambiguous string. Both holder GET and public projection tested."""

    def test_holder_get_asset_is_dict(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        result = service.get_payment_route(key)
        assert isinstance(result.asset, dict), "asset must be a dict, not a string"

    def test_holder_get_asset_contract_is_native_usdc(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        result = service.get_payment_route(key)
        assert result.asset["contract"] == _POLYGON_USDC_CONTRACT, (
            "contract must be native USDC 0x3c499c..., not USDC.e or another token"
        )

    def test_holder_get_asset_binding_version(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        result = service.get_payment_route(key)
        assert result.asset["asset_binding_version"] == _POLYGON_USDC_ASSET_BINDING

    def test_public_route_asset_has_contract(self, proj_client, db, service):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        resp = proj_client.get(f"/public/route/{handle}")
        body = json.loads(resp.data)
        assert body["payable"] is True
        asset = body["asset"]
        assert isinstance(asset, dict), "public route asset must be a dict"
        assert asset["contract"] == _POLYGON_USDC_CONTRACT, (
            "public route must expose exact native USDC contract (not USDC.e)"
        )

    def test_public_route_asset_binding_version(self, proj_client, db, service):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        resp = proj_client.get(f"/public/route/{handle}")
        body = json.loads(resp.data)
        assert body["asset"]["asset_binding_version"] == _POLYGON_USDC_ASSET_BINDING

    def test_public_route_asset_symbol(self, proj_client, db, service):
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        resp = proj_client.get(f"/public/route/{handle}")
        body = json.loads(resp.data)
        assert body["asset"]["symbol"] == "USDC"


# ===========================================================================
# Route revision semantics — claim_id as immutable revision identifier
# ===========================================================================


class TestRouteRevisionSemantics:
    """Verify that claim_id is the immutable route revision identifier:
    stable after publish, different after replacement, prior revision preserved."""

    def test_claim_id_stable_after_publish(self, service, db):
        """claim_id returned by verify == claim_id returned by get_payment_route."""
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        verify_result = service.verify_wallet_challenge(key, ch.challenge_id, sig)

        get_result = service.get_payment_route(key)
        assert get_result.claim_id == verify_result.claim_id, (
            "claim_id must be stable: get_payment_route must return same claim_id as verify"
        )

    def test_replacement_yields_different_claim_id(self, service, db):
        """Route replacement produces a new, different claim_id."""
        handle, key = _make_account_with_ix_id(db, service)

        ch1 = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig1 = _sign_challenge(ch1.challenge_text)
        r1 = service.verify_wallet_challenge(key, ch1.challenge_id, sig1)

        ch2 = service.issue_wallet_challenge(key, _WRONG_ADDRESS)
        sig2 = _sign_challenge(ch2.challenge_text, _WRONG_PRIVKEY)
        r2 = service.verify_wallet_challenge(key, ch2.challenge_id, sig2)

        assert r2.claim_id != r1.claim_id, (
            "replacement must produce a new claim_id; prior claim_id is a historical revision"
        )

    def test_prior_claim_remains_accessible_after_replacement(self, service, db):
        """Prior revision claim record is not deleted; it has status SUPERSEDED."""
        handle, key = _make_account_with_ix_id(db, service)

        ch1 = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig1 = _sign_challenge(ch1.challenge_text)
        r1 = service.verify_wallet_challenge(key, ch1.challenge_id, sig1)

        ch2 = service.issue_wallet_challenge(key, _WRONG_ADDRESS)
        sig2 = _sign_challenge(ch2.challenge_text, _WRONG_PRIVKEY)
        service.verify_wallet_challenge(key, ch2.challenge_id, sig2)

        # Prior claim still exists in Firestore
        prior_doc = (
            db.collection("ix_ids").document(handle)
            .collection("verification_claims").document(r1.claim_id)
            .get()
        )
        assert prior_doc.exists, "prior claim must not be deleted on replacement"
        assert prior_doc.to_dict()["status"] == "SUPERSEDED"

    def test_public_route_exposes_claim_id(self, proj_client, db, service):
        """Public route response includes claim_id as route revision identifier."""
        handle, key = _make_account_with_ix_id(db, service)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        r = service.verify_wallet_challenge(key, ch.challenge_id, sig)

        resp = proj_client.get(f"/public/route/{handle}")
        body = json.loads(resp.data)
        assert body["payable"] is True
        assert body["claim_id"] == r.claim_id, (
            "public route must expose claim_id so payers can bind payment intents to a revision"
        )


# ===========================================================================
# Rate limiting — §8.4: 10 route mutations per account per hour
# ===========================================================================


class TestRateLimiting:
    """Verify that route mutations are rate-limited at 10 per account per hour.

    Rather than issuing 10 real verify operations, tests seed the rate limit
    document directly to avoid exhaustive test setup.
    """

    def _exhaust_rate_limit(self, db: firestore.Client, account_id: str) -> None:
        """Seed the rate limit document as if 10 mutations have already occurred."""
        now = datetime.now(timezone.utc)
        window_end = now + timedelta(minutes=30)
        db.collection("route_mutation_rate_limits").document(account_id).set({
            "count": 10,
            "window_start": now - timedelta(minutes=30),
            "window_end": window_end,
        })

    def test_verify_raises_rate_limit_error_when_exhausted(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)

        # Issue a challenge first (does not count toward rate limit)
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)

        # Resolve account_id to seed the rate limit document
        auth_doc = db.collection("auth_identities").document(key).get().to_dict()
        account_id = auth_doc["account_id"]
        self._exhaust_rate_limit(db, account_id)

        with pytest.raises(RateLimitError):
            service.verify_wallet_challenge(key, ch.challenge_id, sig)

    def test_disable_raises_rate_limit_error_when_exhausted(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)

        # Publish a route so disable has something to act on
        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)
        service.verify_wallet_challenge(key, ch.challenge_id, sig)

        # Now exhaust the limit (verify counted as 1, set count to 10)
        auth_doc = db.collection("auth_identities").document(key).get().to_dict()
        account_id = auth_doc["account_id"]
        self._exhaust_rate_limit(db, account_id)

        with pytest.raises(RateLimitError):
            service.disable_payment_route(key)

    def test_rate_limit_error_has_positive_retry_after(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)

        ch = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        sig = _sign_challenge(ch.challenge_text)

        auth_doc = db.collection("auth_identities").document(key).get().to_dict()
        account_id = auth_doc["account_id"]
        self._exhaust_rate_limit(db, account_id)

        with pytest.raises(RateLimitError) as exc:
            service.verify_wallet_challenge(key, ch.challenge_id, sig)
        assert exc.value.retry_after > 0, "retry_after must be a positive integer (seconds)"


# ===========================================================================
# Challenge issuance rate limit — separate counter, 10/hour per account
# ===========================================================================


class TestChallengeIssuanceRateLimit:
    """Verify that wallet challenge issuance is bounded per account, independently
    of the route-mutation limit. The counters live in separate Firestore
    collections and must not interfere with each other.

    Tests seed challenge_issuance_rate_limits/{account_id} directly to avoid
    issuing 10 real challenges in sequence.
    """

    def _exhaust_issuance_limit(self, db: firestore.Client, account_id: str) -> None:
        """Seed the challenge issuance rate limit as if 10 issuances have occurred."""
        now = datetime.now(timezone.utc)
        db.collection("challenge_issuance_rate_limits").document(account_id).set({
            "count": 10,
            "window_start": now - timedelta(minutes=30),
            "window_end": now + timedelta(minutes=30),
        })

    def _account_id_for_key(self, db: firestore.Client, key: str) -> str:
        return db.collection("auth_identities").document(key).get().to_dict()["account_id"]

    def test_challenge_issuance_raises_rate_limit_when_exhausted(self, service, db):
        handle, key = _make_account_with_ix_id(db, service)
        account_id = self._account_id_for_key(db, key)
        self._exhaust_issuance_limit(db, account_id)

        with pytest.raises(RateLimitError):
            service.issue_wallet_challenge(key, _TEST_ADDRESS)

    def test_exhausted_challenge_quota_produces_no_new_challenge_record(self, service, db):
        """When rate-limited, issue_wallet_challenge must not write any new challenge
        document to wallet_challenges. The RateLimitError must be raised before
        any Firestore write to authoritative collections."""
        handle, key = _make_account_with_ix_id(db, service)
        account_id = self._account_id_for_key(db, key)
        self._exhaust_issuance_limit(db, account_id)

        ix_ref = db.collection("ix_ids").document(handle)
        challenges_before = list(ix_ref.collection("wallet_challenges").stream())

        with pytest.raises(RateLimitError):
            service.issue_wallet_challenge(key, _TEST_ADDRESS)

        challenges_after = list(ix_ref.collection("wallet_challenges").stream())
        assert len(challenges_after) == len(challenges_before), (
            "rate-limited issuance must not write a new wallet_challenges document"
        )

    def test_one_account_cannot_consume_another_accounts_issuance_quota(self, service, db):
        """Challenge issuance rate limit is per-account. Exhausting account A's
        limit must not affect account B's ability to issue challenges."""
        handle_a, key_a = _make_account_with_ix_id(db, service)
        handle_b, key_b = _make_account_with_ix_id(db, service)

        account_id_a = self._account_id_for_key(db, key_a)
        self._exhaust_issuance_limit(db, account_id_a)

        # Account A is now rate-limited
        with pytest.raises(RateLimitError):
            service.issue_wallet_challenge(key_a, _TEST_ADDRESS)

        # Account B must still be able to issue a challenge
        result_b = service.issue_wallet_challenge(key_b, _TEST_ADDRESS)
        assert result_b.challenge_id, "account B must not be blocked by account A's exhausted quota"

    def test_expired_issuance_window_resets_and_allows_new_challenge(self, service, db):
        """When the rate-limit window has expired, the next issuance starts a new
        window and succeeds. The old count is discarded."""
        handle, key = _make_account_with_ix_id(db, service)
        account_id = self._account_id_for_key(db, key)

        # Seed with an already-expired window at the limit
        now = datetime.now(timezone.utc)
        db.collection("challenge_issuance_rate_limits").document(account_id).set({
            "count": 10,
            "window_start": now - timedelta(hours=2),
            "window_end": now - timedelta(hours=1),  # window already expired
        })

        # Issuance must succeed (new window starts)
        result = service.issue_wallet_challenge(key, _TEST_ADDRESS)
        assert result.challenge_id, "expired window must reset; issuance must succeed"

        # New window must have count=1
        doc = db.collection("challenge_issuance_rate_limits").document(account_id).get().to_dict()
        assert doc["count"] == 1
