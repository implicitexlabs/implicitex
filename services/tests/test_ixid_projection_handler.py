"""
IX ID Public Identity HTTP Projection v0.1 — tests.

Two test tiers:
  1. Unit tests (no emulator): Firestore loading is monkeypatched at the
     module boundary. These prove that the HTTP layer delegates correctly to
     the kernel without rebuilding trust logic.
  2. Emulator integration tests: write real Firestore documents, make HTTP
     requests through the Flask test client, verify the full read path.

Key invariant under test (both tiers):
    A Firestore claim with status=ACTIVE and expires_at <= evaluated_at MUST
    be serialized as EXPIRED through the HTTP endpoint, not VERIFIED.
    The projection layer must not inspect status independently of the kernel.
"""

import json
import os
import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock

import pytest
from google.cloud import firestore

import ixid_projection_handler as handler
from ixid_presentation_kernel import (
    DomainClaimFacts,
    DomainPresentationStatus,
    PublicIdentityFacts,
)
from ixid_projection_handler import app

# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def client():
    app.config["TESTING"] = True
    with app.test_client() as c:
        yield c


@pytest.fixture(scope="module")
def db() -> firestore.Client:
    emulator = os.environ.get("FIRESTORE_EMULATOR_HOST")
    if not emulator:
        pytest.skip("FIRESTORE_EMULATOR_HOST not set; skipping integration tests")
    return firestore.Client(project="ix-id-test")


# ---------------------------------------------------------------------------
# Shared test helpers
# ---------------------------------------------------------------------------

_NOW = datetime(2026, 8, 18, 10, 0, 0, tzinfo=timezone.utc)
_VERIFIED_AT = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
_FUTURE_EXPIRES = datetime(2027, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
_PAST_EXPIRES = datetime(
    2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc
)  # one hour before _NOW


def _active_facts(expires_at=_FUTURE_EXPIRES) -> PublicIdentityFacts:
    return PublicIdentityFacts(
        domain=DomainClaimFacts(
            status="ACTIVE",
            expires_at=expires_at,
            verified_at=_VERIFIED_AT,
            subject="implicitex.com",
        )
    )


def _fresh_ix_id() -> str:
    return f"proj_{uuid.uuid4().hex[:8]}"


def _write_claim(
    db: firestore.Client,
    ix_id: str,
    *,
    status: str = "ACTIVE",
    expires_at: datetime = _FUTURE_EXPIRES,
    verified_at: datetime = _VERIFIED_AT,
    subject: str = "implicitex.com",
    superseded_by: str | None = None,
) -> str:
    """Write a minimal verification_claim document directly to the emulator."""
    claim_id = f"claim_{uuid.uuid4().hex[:8]}"
    db.collection("ix_ids").document(ix_id).collection("verification_claims").document(
        claim_id
    ).set(
        {
            "claim_id": claim_id,
            "claim_type": "DOMAIN",
            "status": status,
            "subject": subject,
            "expires_at": expires_at,
            "verified_at": verified_at,
            "evidence_type": "DNS_TXT",
            "evidence_ref": "test_ref",
            "state_version": 0,
            "superseded_by": superseded_by,
        }
    )
    return claim_id


# ---------------------------------------------------------------------------
# Method enforcement
# ---------------------------------------------------------------------------


class TestMethodEnforcement:
    @pytest.mark.parametrize("method", ["POST", "PUT", "PATCH", "DELETE"])
    def test_non_get_rejected(self, client, method, monkeypatch):
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.open("/public/identity/alice", method=method)
        assert resp.status_code == 405

    def test_405_body_is_json_with_error_key(self, client, monkeypatch):
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/public/identity/alice")
        assert resp.status_code == 405
        body = json.loads(resp.data)
        assert "error" in body


# ---------------------------------------------------------------------------
# Not-found handling
# ---------------------------------------------------------------------------


class TestNotFound:
    def test_unknown_ix_id_returns_404(self, client, monkeypatch):
        monkeypatch.setattr(handler, "_load_public_facts", lambda db, ix_id: None)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/nobody")
        assert resp.status_code == 404

    def test_404_body_has_error_key(self, client, monkeypatch):
        monkeypatch.setattr(handler, "_load_public_facts", lambda db, ix_id: None)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/nobody")
        body = json.loads(resp.data)
        assert "error" in body

    def test_404_does_not_call_kernel(self, client, monkeypatch):
        """Kernel must not be called when ix_id is not found."""
        monkeypatch.setattr(handler, "_load_public_facts", lambda db, ix_id: None)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        kernel_mock = MagicMock()
        monkeypatch.setattr(handler, "derive_public_identity_view", kernel_mock)
        client.get("/public/identity/nobody")
        kernel_mock.assert_not_called()


# ---------------------------------------------------------------------------
# Key invariant: stale ACTIVE must serialize as EXPIRED
# ---------------------------------------------------------------------------


class TestExpiryInvariant:
    """
    The projection layer MUST NOT inspect status independently.
    Firestore status=ACTIVE with expires_at <= evaluated_at → EXPIRED via kernel.
    """

    def test_active_claim_with_past_expiry_serializes_as_expired(
        self, client, monkeypatch
    ):
        """
        The primary transport invariant test.
        Firestore has status=ACTIVE. expires_at is in the past.
        The HTTP response must say EXPIRED, not VERIFIED.
        The projection layer must not have re-derived this — only the kernel can.
        """
        past_expiry_facts = _active_facts(expires_at=_PAST_EXPIRES)
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: past_expiry_facts
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())

        resp = client.get("/public/identity/alice")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.EXPIRED.value

    def test_active_claim_before_expiry_serializes_as_verified(
        self, client, monkeypatch
    ):
        """Control: status=ACTIVE + future expires_at → VERIFIED."""
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.VERIFIED.value

    def test_expired_status_serializes_as_expired(self, client, monkeypatch):
        """Materialized EXPIRED status → EXPIRED regardless of time."""
        expired_facts = PublicIdentityFacts(
            domain=DomainClaimFacts(
                status="EXPIRED",
                expires_at=_PAST_EXPIRES,
                verified_at=_VERIFIED_AT,
                subject="implicitex.com",
            )
        )
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: expired_facts
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.EXPIRED.value

    def test_expired_via_time_gate_has_no_verified_since(self, client, monkeypatch):
        """When expired by time gate, verified_since must not appear in the response."""
        past_expiry_facts = _active_facts(expires_at=_PAST_EXPIRES)
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: past_expiry_facts
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        body = json.loads(resp.data)
        assert body["domain"]["verified_since"] is None


# ---------------------------------------------------------------------------
# Response structure
# ---------------------------------------------------------------------------


class TestResponseStructure:
    def _get_alice(self, client, monkeypatch) -> dict:
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        return json.loads(client.get("/public/identity/alice").data)

    def test_response_contains_ix_id(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert body["ix_id"] == "alice"

    def test_response_contains_evaluated_at(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert "evaluated_at" in body
        # Must be a parseable ISO datetime string
        dt = datetime.fromisoformat(body["evaluated_at"].replace("Z", "+00:00"))
        assert dt.tzinfo is not None

    def test_response_contains_policy_version(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert body["policy_version"] == "v1"

    def test_response_contains_domain_object(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert "domain" in body
        d = body["domain"]
        assert "status" in d
        assert "label" in d
        assert "subject" in d
        assert "verified_since" in d

    def test_verified_domain_has_verified_since(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert body["domain"]["verified_since"] is not None

    def test_verified_domain_has_subject(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert body["domain"]["subject"] == "implicitex.com"

    def test_verified_label_in_response(self, client, monkeypatch):
        body = self._get_alice(client, monkeypatch)
        assert body["domain"]["label"] == "Official Website Verified"

    def test_content_type_is_json(self, client, monkeypatch):
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert "application/json" in resp.content_type

    def test_cache_control_is_no_store(self, client, monkeypatch):
        """Cache-Control: no-store must be present to enforce the cache invariant."""
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert resp.headers.get("Cache-Control") == "no-store"


class TestCacheControlGlobalInvariant:
    """
    Cache-Control: no-store is a global response invariant.

    HTTP defines 404 and 405 as heuristically cacheable (RFC 9110 §15.5.5).
    An IX ID that does not exist today may exist within minutes after
    verification. A cached negative suppresses that valid identity. This class
    verifies the invariant holds on every response status, not only 200.
    """

    def test_cache_control_on_404(self, client, monkeypatch):
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: None
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/does_not_exist")
        assert resp.status_code == 404
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_cache_control_on_405(self, client, monkeypatch):
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.post("/public/identity/alice")
        assert resp.status_code == 405
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_cache_control_on_500(self, client, monkeypatch):
        def _raise(db, ix_id):
            raise RuntimeError("simulated Firestore failure")

        monkeypatch.setattr(handler, "_load_public_facts", _raise)
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 500
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_cache_control_on_200(self, client, monkeypatch):
        """Regression guard: after_request hook must not drop header on 200."""
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 200
        assert resp.headers.get("Cache-Control") == "no-store"


# ---------------------------------------------------------------------------
# NONE state: no DOMAIN claim
# ---------------------------------------------------------------------------


class TestNoDomainClaim:
    def test_no_domain_claim_returns_200_with_none_status(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "_load_public_facts",
            lambda db, ix_id: PublicIdentityFacts(domain=None),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.NONE.value

    def test_none_domain_has_null_subject(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "_load_public_facts",
            lambda db, ix_id: PublicIdentityFacts(domain=None),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        body = json.loads(resp.data)
        assert body["domain"]["subject"] is None

    def test_none_domain_has_null_verified_since(self, client, monkeypatch):
        monkeypatch.setattr(
            handler,
            "_load_public_facts",
            lambda db, ix_id: PublicIdentityFacts(domain=None),
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        resp = client.get("/public/identity/alice")
        body = json.loads(resp.data)
        assert body["domain"]["verified_since"] is None


# ---------------------------------------------------------------------------
# BUSINESS_IDENTITY absence must not produce inferred assertion
# ---------------------------------------------------------------------------


class TestBusinessIdentityAbsence:
    """
    The kernel does not yet support BUSINESS_IDENTITY.
    The HTTP response must not contain a fabricated business verification field.
    """

    def test_response_does_not_contain_business_identity_field(
        self, client, monkeypatch
    ):
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        body = json.loads(client.get("/public/identity/alice").data)
        assert "business" not in body
        assert "business_identity" not in body

    def test_verified_domain_label_does_not_imply_business_verification(
        self, client, monkeypatch
    ):
        """'Official Website Verified' must not become 'Business Verified' or similar."""
        monkeypatch.setattr(
            handler, "_load_public_facts", lambda db, ix_id: _active_facts()
        )
        monkeypatch.setattr(handler, "_get_db", lambda: MagicMock())
        body = json.loads(client.get("/public/identity/alice").data)
        label = body["domain"]["label"]
        assert "Business" not in label
        assert "Organization" not in label


# ---------------------------------------------------------------------------
# Handler containment: no Transition Service or DNS symbols
# ---------------------------------------------------------------------------


class TestHandlerContainment:
    def test_handler_does_not_import_transition_service(self):
        import ixid_projection_handler as h

        assert not hasattr(h, "execute_transition")
        assert not hasattr(h, "ClaimStatus")
        assert not hasattr(h, "TriggerType")

    def test_handler_does_not_import_domain_verification_service(self):
        import ixid_projection_handler as h

        assert not hasattr(h, "run_domain_recheck")
        assert not hasattr(h, "issue_challenge")
        assert not hasattr(h, "verify_domain")

    def test_handler_does_not_import_scheduler_batch_functions(self):
        import ixid_projection_handler as h

        assert not hasattr(h, "run_recheck_batch")
        assert not hasattr(h, "run_expiration_batch")
        assert not hasattr(h, "run_repair_sweep")


# ---------------------------------------------------------------------------
# Emulator integration tests
# ---------------------------------------------------------------------------
#
# These tests write real Firestore documents and make HTTP requests through
# the Flask test client. The Firestore client is the real one backed by the
# emulator. They are skipped if FIRESTORE_EMULATOR_HOST is not set.


class TestEmulatorIntegration:
    """
    Full read path: Firestore emulator → _load_public_facts → kernel → HTTP response.
    No monkeypatching. Proves the real loading code delivers the right facts.
    """

    @pytest.fixture(autouse=True)
    def _patch_db(self, db, monkeypatch):
        """Wire the emulator-backed client into the handler for this test class."""
        monkeypatch.setattr(handler, "_get_db", lambda: db)

    def test_active_claim_with_future_expiry_returns_verified(self, client, db):
        ix_id = _fresh_ix_id()
        _write_claim(db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES)

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.VERIFIED.value

    def test_active_claim_with_past_expiry_returns_expired(self, client, db):
        """
        The primary emulator integration test.
        Firestore stores status=ACTIVE. expires_at is already past.
        The HTTP response must say EXPIRED through the real read path.
        This proves the projection layer does not bypass the kernel's time gate.
        """
        ix_id = _fresh_ix_id()
        past = datetime.now(timezone.utc) - timedelta(hours=2)
        _write_claim(db, ix_id, status="ACTIVE", expires_at=past)

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.EXPIRED.value

    def test_materialized_expired_claim_returns_expired(self, client, db):
        ix_id = _fresh_ix_id()
        past = datetime.now(timezone.utc) - timedelta(hours=1)
        _write_claim(db, ix_id, status="EXPIRED", expires_at=past)

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.EXPIRED.value

    def test_recheck_required_before_expiry_returns_recheck_pending(self, client, db):
        ix_id = _fresh_ix_id()
        _write_claim(db, ix_id, status="RECHECK_REQUIRED", expires_at=_FUTURE_EXPIRES)

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert (
            body["domain"]["status"] == DomainPresentationStatus.RECHECK_PENDING.value
        )

    def test_ix_id_without_any_claims_returns_404(self, client, db):
        ix_id = _fresh_ix_id()
        # Do not write anything — ix_id should not exist
        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 404

    def test_response_body_ix_id_matches_request(self, client, db):
        ix_id = _fresh_ix_id()
        _write_claim(db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES)

        resp = client.get(f"/public/identity/{ix_id}")
        body = json.loads(resp.data)
        assert body["ix_id"] == ix_id

    def test_evaluated_at_is_timezone_aware_iso(self, client, db):
        ix_id = _fresh_ix_id()
        _write_claim(db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES)

        resp = client.get(f"/public/identity/{ix_id}")
        body = json.loads(resp.data)
        raw = body["evaluated_at"]
        dt = datetime.fromisoformat(raw.replace("Z", "+00:00"))
        assert dt.tzinfo is not None

    def test_cache_control_no_store_on_emulator_response(self, client, db):
        ix_id = _fresh_ix_id()
        _write_claim(db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES)

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.headers.get("Cache-Control") == "no-store"


# ---------------------------------------------------------------------------
# Multi-claim selection: deterministic authoritative claim from lifecycle chain
# ---------------------------------------------------------------------------


class TestMultiClaimSelection:
    """
    An IX ID accumulates multiple DOMAIN claims over its lifetime.
    The loader must deterministically select the authoritative (tip) claim
    using the lifecycle contract, not Firestore result ordering.

    Selection rule:
      - SUPERSEDED claims have superseded_by set; exclude them.
      - Among non-superseded claims, pick the most recently verified.
    """

    @pytest.fixture(autouse=True)
    def _patch_db(self, db, monkeypatch):
        monkeypatch.setattr(handler, "_get_db", lambda: db)

    def test_superseded_predecessor_plus_active_successor_selects_active(
        self, client, db
    ):
        """
        Normal renewal: old ACTIVE claim superseded, new ACTIVE claim is tip.
        Old claim: status=SUPERSEDED, superseded_by=<new_id>
        New claim: status=ACTIVE, superseded_by=None, verified_at > old
        → Loader must select the new ACTIVE claim → VERIFIED response.
        """
        ix_id = _fresh_ix_id()
        t_old = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        t_new = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)

        new_claim_id = _write_claim(
            db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES, verified_at=t_new
        )
        _write_claim(
            db,
            ix_id,
            status="SUPERSEDED",
            expires_at=_FUTURE_EXPIRES,
            verified_at=t_old,
            superseded_by=new_claim_id,
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.VERIFIED.value

    def test_expired_historical_plus_active_current_selects_active(self, client, db):
        """
        Post-expiry re-verification: old claim EXPIRED (terminal, superseded_by=None),
        new claim ACTIVE. Both have superseded_by=None; most recent verified_at wins.
        → Loader must select the new ACTIVE claim → VERIFIED response.
        """
        ix_id = _fresh_ix_id()
        t_old = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        t_new = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        past_expires = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        _write_claim(
            db, ix_id, status="EXPIRED", expires_at=past_expires, verified_at=t_old
        )
        _write_claim(
            db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES, verified_at=t_new
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.VERIFIED.value

    def test_superseded_predecessor_plus_recheck_required_selects_recheck(
        self, client, db
    ):
        """
        Old claim superseded, new claim in RECHECK_REQUIRED (grace period).
        → Loader selects RECHECK_REQUIRED → RECHECK_PENDING response.
        """
        ix_id = _fresh_ix_id()
        t_old = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        t_new = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)

        new_claim_id = _write_claim(
            db,
            ix_id,
            status="RECHECK_REQUIRED",
            expires_at=_FUTURE_EXPIRES,
            verified_at=t_new,
        )
        _write_claim(
            db,
            ix_id,
            status="SUPERSEDED",
            expires_at=_FUTURE_EXPIRES,
            verified_at=t_old,
            superseded_by=new_claim_id,
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert (
            body["domain"]["status"] == DomainPresentationStatus.RECHECK_PENDING.value
        )

    def test_only_terminal_claims_returns_most_recent_terminal(self, client, db):
        """
        No active successor exists. Only SUPERSEDED + EXPIRED terminal claims.
        SUPERSEDED is excluded (has superseded_by set to the actual EXPIRED claim).
        EXPIRED (most recent, superseded_by=None) is the authoritative tip.
        → Select EXPIRED (tip) → kernel shows EXPIRED.
        """
        ix_id = _fresh_ix_id()
        t_old = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        t_mid = datetime(2025, 9, 1, 0, 0, 0, tzinfo=timezone.utc)
        past_expires = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        # Write the EXPIRED claim first and capture its actual document ID
        expired_claim_id = _write_claim(
            db, ix_id, status="EXPIRED", expires_at=past_expires, verified_at=t_mid
        )
        # Older SUPERSEDED claim points to the actual EXPIRED claim ID
        _write_claim(
            db,
            ix_id,
            status="SUPERSEDED",
            expires_at=past_expires,
            verified_at=t_old,
            superseded_by=expired_claim_id,
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        # EXPIRED is selected as the non-superseded tip; kernel returns EXPIRED
        assert body["domain"]["status"] == DomainPresentationStatus.EXPIRED.value

    def test_two_non_superseded_claims_same_subject_selects_most_recent(
        self, client, db
    ):
        """
        Two non-superseded DOMAIN claims for the same domain (e.g., EXPIRED then
        re-verified for the same domain — EXPIRED is terminal and retains
        superseded_by=None while the new ACTIVE claim has supersedes pointing back).
        Same subject → single canonical domain, select most recently verified.
        """
        ix_id = _fresh_ix_id()
        t_old = datetime(2025, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        t_new = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        past_expires = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)

        _write_claim(
            db,
            ix_id,
            status="EXPIRED",
            expires_at=past_expires,
            verified_at=t_old,
            subject="implicitex.com",
        )
        _write_claim(
            db,
            ix_id,
            status="ACTIVE",
            expires_at=_FUTURE_EXPIRES,
            verified_at=t_new,
            subject="implicitex.com",
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        # Both have same subject; most recent (ACTIVE) selected → VERIFIED
        assert body["domain"]["status"] == DomainPresentationStatus.VERIFIED.value
        assert body["domain"]["subject"] == "implicitex.com"

    def test_two_non_superseded_claims_different_subjects_fails_closed(
        self, client, db
    ):
        """
        Two non-superseded DOMAIN claims with distinct subjects.
        This is an ambiguous state under the v0.1 canonical-domain rule.
        The loader must fail closed: present no DOMAIN claim rather than
        silently elect one domain over another by verified_at recency.

        Verifying mariastacos.com on June 1 and maria-catering.com on July 1
        does not establish maria-catering.com as the canonical public domain —
        that would make verification recency secretly do canonical selection.
        """
        ix_id = _fresh_ix_id()
        t1 = datetime(2026, 6, 1, 0, 0, 0, tzinfo=timezone.utc)
        t2 = datetime(2026, 7, 1, 0, 0, 0, tzinfo=timezone.utc)

        _write_claim(
            db,
            ix_id,
            status="ACTIVE",
            expires_at=_FUTURE_EXPIRES,
            verified_at=t1,
            subject="mariastacos.com",
        )
        _write_claim(
            db,
            ix_id,
            status="ACTIVE",
            expires_at=_FUTURE_EXPIRES,
            verified_at=t2,
            subject="maria-catering.com",
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)
        # Fail closed: ambiguous canonical domain → NONE rather than guess
        assert body["domain"]["status"] == DomainPresentationStatus.NONE.value

    def test_superseded_claim_alone_does_not_block_404(self, client, db):
        """
        If the only DOMAIN claim is SUPERSEDED (shouldn't happen in practice,
        but the loader must not 404 — it should surface the best available data).
        """
        ix_id = _fresh_ix_id()
        _write_claim(
            db,
            ix_id,
            status="SUPERSEDED",
            expires_at=_FUTURE_EXPIRES,
            superseded_by="some-nonexistent-successor",
        )

        resp = client.get(f"/public/identity/{ix_id}")
        # ix_id exists (has a claim), so not 404.
        # The defensive fallback selects the only claim available.
        assert resp.status_code == 200
        body = json.loads(resp.data)
        assert body["domain"]["status"] == DomainPresentationStatus.NOT_CURRENT.value


# ---------------------------------------------------------------------------
# Response field containment: internal Firestore fields must not leak
# ---------------------------------------------------------------------------


class TestResponseFieldContainment:
    """
    The HTTP response must be derived exclusively from the PublicIdentityView
    returned by the kernel, not filtered from the raw Firestore document.

    This is a structural invariant: the loader strips internal fields by
    selecting only the fields needed to construct PublicIdentityFacts. The
    serializer then outputs only what PublicIdentityView contains.

    Prove it by writing a Firestore document with internal/evidence fields and
    asserting none of them appear in the HTTP response.
    """

    @pytest.fixture(autouse=True)
    def _patch_db(self, db, monkeypatch):
        monkeypatch.setattr(handler, "_get_db", lambda: db)

    def test_internal_evidence_fields_do_not_appear_in_response(self, client, db):
        """
        Firestore document contains internal fields that must never surface.
        The response must equal the kernel output, not a filtered Firestore dict.
        """
        ix_id = _fresh_ix_id()
        claim_id = f"claim_{uuid.uuid4().hex[:8]}"

        # Write a claim with many internal/evidence fields
        db.collection("ix_ids").document(ix_id).collection(
            "verification_claims"
        ).document(claim_id).set(
            {
                "claim_id": claim_id,
                "claim_type": "DOMAIN",
                "status": "ACTIVE",
                "subject": "implicitex.com",
                "expires_at": _FUTURE_EXPIRES,
                "verified_at": _VERIFIED_AT,
                "superseded_by": None,
                # Internal fields that must not appear in the response:
                "evidence_type": "DNS_TXT",
                "evidence_ref": "sensitive_evidence_ref_xyz",
                "challenge_token": "secret_challenge_token_abc",
                "verification_record_id": "internal_record_id_123",
                "account_uid": "internal_account_uid_456",
                "transition_operation_id": "internal_op_id_789",
                "state_version": 3,
                "verifier": "IX_AUTOMATED",
                "assurance_level": "STANDARD",
                "verification_policy_version": "v1",
                "supersedes": None,
                "last_rechecked_at": _VERIFIED_AT,
                "recheck_required_at": None,
                "grace_expires_at": None,
                "expired_at": None,
                "revocation_reason": None,
                "created_at": _VERIFIED_AT,
            }
        )

        resp = client.get(f"/public/identity/{ix_id}")
        assert resp.status_code == 200
        body = json.loads(resp.data)

        # These internal fields must be absent from the response body entirely
        internal_fields = {
            "evidence_ref",
            "challenge_token",
            "verification_record_id",
            "account_uid",
            "transition_operation_id",
            "state_version",
            "verifier",
            "assurance_level",
            "verification_policy_version",
            "supersedes",
            "superseded_by",
            "last_rechecked_at",
            "recheck_required_at",
            "grace_expires_at",
            "expired_at",
            "revocation_reason",
            "created_at",
            "evidence_type",
        }
        for field in internal_fields:
            assert field not in body, f"Internal field leaked into top-level: {field!r}"
            assert field not in body.get("domain", {}), (
                f"Internal field leaked into domain object: {field!r}"
            )

    def test_response_keys_match_public_identity_view_contract(self, client, db):
        """
        The top-level and domain keys in the response must exactly match the
        serialization of PublicIdentityView — no extra fields, no missing fields.
        """
        ix_id = _fresh_ix_id()
        _write_claim(db, ix_id, status="ACTIVE", expires_at=_FUTURE_EXPIRES)

        resp = client.get(f"/public/identity/{ix_id}")
        body = json.loads(resp.data)

        expected_top_keys = {
            "ix_id",
            "evaluated_at",
            "policy_version",
            "snapshot_id",
            "domain",
        }
        expected_domain_keys = {"status", "label", "subject", "verified_since"}

        assert set(body.keys()) == expected_top_keys
        assert set(body["domain"].keys()) == expected_domain_keys
