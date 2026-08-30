"""
IX ID Holder Authority Service — Profile + Domain Status Tests
==============================================================
Tests for update_profile, issue_domain_challenge, verify_domain_challenge,
and get_domain_status methods added in the profile management pass.

Emulator integration tests: skipped if FIRESTORE_EMULATOR_HOST is not set.
"""

import os
import uuid
from datetime import datetime, timezone

import pytest
from google.cloud import firestore

from ixid_holder_authority_service import (
    AccountState,
    AuthIdentityState,
    AuthenticationError,
    AuthorizationError,
    HolderAuthorityService,
    InternalConsistencyError,
    IxIdState,
    ValidationError,
    compute_identity_key,
    generate_account_id,
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
    return f"prof-{uuid.uuid4().hex[:8]}"


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
    ix_id_state: str = IxIdState.ACTIVE,
    display_name: str | None = None,
    bio: str | None = None,
    website_url: str | None = None,
) -> None:
    now = datetime.now(timezone.utc)
    doc: dict = {
        "ix_id": handle,
        "owner_account_id": owner_account_id,
        "ix_id_state": ix_id_state,
        "ix_id_state_version": 0,
        "ix_id_state_changed_at": now,
        "created_at": now,
    }
    if display_name is not None:
        doc["display_name"] = display_name
    if bio is not None:
        doc["bio"] = bio
    if website_url is not None:
        doc["website_url"] = website_url
    db.collection("ix_ids").document(handle).set(doc)


def _make_verified_account_with_ix_id(
    db: firestore.Client,
    service: HolderAuthorityService,
) -> tuple[str, str]:
    """Create an ACTIVE account with a registered IX ID. Returns (handle, identity_key)."""
    key, iss, sub = _make_identity()
    result = service.create_account(
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


# ===========================================================================
# Profile update tests
# ===========================================================================


class TestUpdateProfileDisplayName:
    def test_update_profile_display_name(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        result = service.update_profile(key, {"display_name": "Alice Example"})
        assert result.display_name == "Alice Example"

        ix = db.collection("ix_ids").document(handle).get().to_dict()
        assert ix["display_name"] == "Alice Example"


class TestUpdateProfileBio:
    def test_update_profile_bio(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        result = service.update_profile(key, {"bio": "Short bio here."})
        assert result.bio == "Short bio here."

        ix = db.collection("ix_ids").document(handle).get().to_dict()
        assert ix["bio"] == "Short bio here."


class TestUpdateProfileWebsiteUrl:
    def test_update_profile_website_url_valid(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        result = service.update_profile(key, {"website_url": "https://example.com"})
        assert result.website_url == "https://example.com"

    def test_update_profile_website_url_http_valid(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        result = service.update_profile(key, {"website_url": "http://example.com"})
        assert result.website_url == "http://example.com"

    def test_update_profile_website_url_invalid(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.update_profile(key, {"website_url": "not-a-url-at-all"})
        assert exc.value.code == "PROFILE_VALIDATION_ERROR"

    def test_update_profile_website_url_no_scheme(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.update_profile(key, {"website_url": "example.com"})
        assert exc.value.code == "PROFILE_VALIDATION_ERROR"


class TestUpdateProfilePartial:
    def test_update_profile_partial_update(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        service.update_profile(key, {"bio": "Initial bio."})
        result = service.update_profile(key, {"display_name": "Bob"})
        assert result.display_name == "Bob"
        assert result.bio == "Initial bio."

    def test_update_profile_empty_string_clears_field(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        service.update_profile(key, {"display_name": "To be cleared"})
        result = service.update_profile(key, {"display_name": ""})
        assert result.display_name is None

        ix = db.collection("ix_ids").document(handle).get().to_dict()
        assert ix.get("display_name") is None

    def test_update_profile_trimming(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        result = service.update_profile(key, {"display_name": "  Trimmed  "})
        assert result.display_name == "Trimmed"


class TestUpdateProfileValidation:
    def test_update_profile_display_name_too_long(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.update_profile(key, {"display_name": "A" * 101})
        assert exc.value.code == "PROFILE_VALIDATION_ERROR"

    def test_update_profile_bio_too_long(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.update_profile(key, {"bio": "B" * 501})
        assert exc.value.code == "PROFILE_VALIDATION_ERROR"

    def test_update_profile_unknown_field(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        with pytest.raises(ValidationError) as exc:
            service.update_profile(key, {"unknown_field": "value"})
        assert exc.value.code == "PROFILE_VALIDATION_ERROR"


class TestUpdateProfileAuthGuards:
    def test_update_profile_no_ix_id(self, service, db):
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=None)
        with pytest.raises(ValidationError) as exc:
            service.update_profile(key, {"display_name": "Name"})
        assert exc.value.code == "NO_IX_ID"

    def test_update_profile_requires_active_account(self, service, db):
        account_id, key = _seed_account(db, AccountState.SUSPENDED)
        with pytest.raises(AuthorizationError):
            service.update_profile(key, {"display_name": "Name"})


class TestUpdateProfileMutationEvents:
    def test_update_profile_writes_mutation_event(self, service, db):
        handle, key = _make_verified_account_with_ix_id(db, service)
        service.update_profile(key, {"display_name": "Mutation Test"})

        ix_ref = db.collection("ix_ids").document(handle)
        mutations = list(ix_ref.collection("identity_mutations").stream())
        assert len(mutations) >= 1
        types = {m.to_dict()["mutation_type"] for m in mutations}
        assert "DISPLAY_NAME" in types


# ===========================================================================
# Domain status tests
# ===========================================================================


class TestGetDomainStatus:
    def test_get_domain_status_no_ix_id(self, service, db):
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=None)
        result = service.get_domain_status(key)
        assert result.domain_status is None
        assert result.domain_subject is None
        assert result.domain_claim_id is None
        assert result.domain_expires_at is None
        assert result.pending_challenge_id is None
        assert result.pending_challenge_domain is None
        assert result.pending_txt_record is None
        assert result.pending_challenge_expires_at is None

    def test_get_domain_status_with_active_claim(self, service, db):
        handle = _fresh_handle()
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=handle)
        _seed_ix_id(db, handle, account_id)

        now = datetime.now(timezone.utc)
        claim_id = str(uuid.uuid4())
        db.collection("ix_ids").document(handle).collection("verification_claims").document(claim_id).set({
            "claim_id": claim_id,
            "claim_type": "DOMAIN",
            "status": "ACTIVE",
            "subject": "example.com",
            "verified_at": now,
            "expires_at": None,
            "superseded_by": None,
        })

        result = service.get_domain_status(key)
        assert result.domain_status == "ACTIVE"
        assert result.domain_subject == "example.com"
        assert result.domain_claim_id == claim_id

    def test_get_domain_status_with_pending_challenge(self, service, db):
        handle = _fresh_handle()
        account_id, key = _seed_account(db, AccountState.ACTIVE, owned_ix_id=handle)
        _seed_ix_id(db, handle, account_id)

        from datetime import timedelta
        now = datetime.now(timezone.utc)
        challenge_id = str(uuid.uuid4())
        db.collection("ix_ids").document(handle).collection("domain_challenges").document(challenge_id).set({
            "challenge_id": challenge_id,
            "domain": "pending.example.com",
            "txt_record_value": "ixid-verify=abc123",
            "status": "PENDING",
            "issued_at": now,
            "expires_at": now + timedelta(hours=24),
        })

        result = service.get_domain_status(key)
        assert result.pending_challenge_id == challenge_id
        assert result.pending_challenge_domain == "pending.example.com"
        assert result.pending_txt_record == "ixid-verify=abc123"
