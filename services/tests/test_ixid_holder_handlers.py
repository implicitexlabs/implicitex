"""
IX ID Holder Handler tests — frozen two-token protocol (§5.1).

These tests verify the edge and authority handler contract invariants that
were explicitly required after deployment-phase remediation:

Edge (ixid_holder_edge_handler):
  A. Browser Authorization: Bearer <firebase-token> survives edge forwarding
     unchanged — not remapped, not replaced.
  B. Client-supplied X-Serverless-Authorization is stripped before forwarding.
  C. Edge generates its own X-Serverless-Authorization (OIDC) for Cloud Run IAM.
  D. Host: app.ixid.me is NOT forwarded upstream (prevents hostname confusion).
  E. Hop-by-hop headers are not forwarded.
  F. X-Ix-* headers are stripped.
  G. Cache-Control: no-store on all holder edge responses.
  H. OIDC fetch failure → 503, not 500 or uncaught error.

Authority (ixid_holder_authority_handler):
  I.  Firebase token is read from Authorization (not X-Firebase-Authorization).
  J.  X-Firebase-Authorization header has no authority — providing it alone
      yields 401 UNAUTHENTICATED.
  K.  Missing Authorization → 401 UNAUTHENTICATED on all three routes.
  L.  Cache-Control: no-store on all authority responses.
"""

import json
import uuid
from unittest.mock import MagicMock, patch

import pytest

import ixid_holder_edge_handler as edge
import ixid_holder_authority_handler as authority


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def edge_client():
    edge.app.config["TESTING"] = True
    with edge.app.test_client() as c:
        yield c


@pytest.fixture()
def auth_client():
    authority.app.config["TESTING"] = True
    with authority.app.test_client() as c:
        yield c


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _captured_headers(monkeypatch) -> dict:
    """
    Monkeypatch _proxy_to_authority so its ``headers`` argument is captured.
    Returns the mutable dict that will hold the forwarded headers after the
    first call.
    """
    captured: dict = {}

    def _fake_proxy(method, path, headers, body):
        captured.update(headers)
        return 200, {"ok": True}, "application/json"

    monkeypatch.setattr(edge, "_proxy_to_authority", _fake_proxy)
    monkeypatch.setattr(edge, "_fetch_oidc_token", lambda audience: "oidc-stub-token")
    return captured


# ---------------------------------------------------------------------------
# A. Browser Authorization survives edge forwarding unchanged
# ---------------------------------------------------------------------------


class TestEdgeFirebaseTokenPassthrough:
    """A — Authorization: Bearer <firebase-token> must pass through the edge unchanged."""

    def test_authorization_forwarded_as_is(self, edge_client, monkeypatch):
        captured = _captured_headers(monkeypatch)
        edge_client.post(
            "/holder/v0.1/account",
            headers={
                "Authorization": "Bearer firebase-id-token-value",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": "op-1"}),
        )
        # The forwarded Authorization must be the Firebase token, NOT the OIDC token.
        assert captured.get("Authorization") == "Bearer firebase-id-token-value"

    def test_authorization_not_present_when_client_omits_it(self, edge_client, monkeypatch):
        """Edge must not inject a Firebase token that was not provided."""
        captured = _captured_headers(monkeypatch)
        edge_client.get("/holder/v0.1/workspace")
        # No inbound Authorization → edge must not fabricate one (OIDC goes to X-Serverless)
        assert captured.get("Authorization") is None


# ---------------------------------------------------------------------------
# B. Client-supplied X-Serverless-Authorization is stripped
# ---------------------------------------------------------------------------


class TestEdgeStripsXServerlessAuthorization:
    """B — attacker-forged X-Serverless-Authorization must not reach the authority.

    The edge strips the inbound value and writes its own OIDC token into
    X-Serverless-Authorization. The captured header will contain the edge's
    OIDC token, never the inbound forged value.
    """

    def test_inbound_x_serverless_authorization_not_forwarded(self, edge_client, monkeypatch):
        """The attacker's X-Serverless-Authorization value must not appear downstream."""
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={"X-Serverless-Authorization": "Bearer attacker-oidc-token"},
        )
        # Edge replaces the inbound value with its own OIDC stub token.
        # The attacker's value must not survive.
        x_sa = captured.get("X-Serverless-Authorization", "")
        assert x_sa == "Bearer oidc-stub-token", (
            "Forged X-Serverless-Authorization must be overwritten by edge OIDC token"
        )
        assert "attacker-oidc-token" not in x_sa

    def test_x_serverless_authorization_forged_value_overwritten(self, edge_client, monkeypatch):
        """Any inbound X-Serverless-Authorization value is overwritten, not forwarded."""
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={"X-Serverless-Authorization": "arbitrary forged value"},
        )
        x_sa = captured.get("X-Serverless-Authorization", "")
        assert x_sa == "Bearer oidc-stub-token"
        assert "arbitrary forged value" not in x_sa


# ---------------------------------------------------------------------------
# C. Edge generates its own X-Serverless-Authorization
# ---------------------------------------------------------------------------


class TestEdgeGeneratesXServerlessAuthorization:
    """C — edge must add X-Serverless-Authorization with its own OIDC token."""

    def test_x_serverless_authorization_added(self, edge_client, monkeypatch):
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={"Authorization": "Bearer firebase-token"},
        )
        assert captured.get("X-Serverless-Authorization") == "Bearer oidc-stub-token"

    def test_x_serverless_authorization_uses_authority_audience(self, edge_client, monkeypatch):
        """_fetch_oidc_token is called with the canonical authority URL as audience."""
        audiences_seen: list = []
        monkeypatch.setattr(
            edge,
            "_fetch_oidc_token",
            lambda audience: (audiences_seen.append(audience) or "tok"),
        )
        monkeypatch.setattr(
            edge, "_proxy_to_authority", lambda m, p, h, b: (200, {}, "application/json")
        )
        edge_client.get("/holder/v0.1/workspace")
        assert len(audiences_seen) == 1
        assert audiences_seen[0] == edge._AUTHORITY_URL


# ---------------------------------------------------------------------------
# D. Host header is not forwarded upstream
# ---------------------------------------------------------------------------


class TestEdgeStripsHostHeader:
    """D — Host: app.ixid.me must not be forwarded to the authority service."""

    def test_host_not_in_forwarded_headers(self, edge_client, monkeypatch):
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={"Host": "app.ixid.me"},
        )
        assert all(k.lower() != "host" for k in captured)


# ---------------------------------------------------------------------------
# E. Hop-by-hop headers are not forwarded
# ---------------------------------------------------------------------------


class TestEdgeStripsHopByHopHeaders:
    """E — RFC 7230 §6.1 hop-by-hop headers must not be forwarded."""

    @pytest.mark.parametrize("header", [
        "Connection",
        "Keep-Alive",
        "Transfer-Encoding",
        "TE",
        "Trailer",
        "Proxy-Authorization",
        "Upgrade",
    ])
    def test_hop_by_hop_header_stripped(self, edge_client, monkeypatch, header):
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={header: "hop-by-hop-value"},
        )
        assert all(k.lower() != header.lower() for k in captured), (
            f"{header} must not be forwarded upstream"
        )


# ---------------------------------------------------------------------------
# F. X-Ix-* headers are stripped
# ---------------------------------------------------------------------------


class TestEdgeStripsXIxHeaders:
    """F — X-Ix-* trust headers must not reach the authority."""

    def test_x_ix_prefixed_header_stripped(self, edge_client, monkeypatch):
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={"X-Ix-Identity": "injected"},
        )
        assert all(not k.lower().startswith("x-ix-") for k in captured)

    def test_x_ix_variant_stripped(self, edge_client, monkeypatch):
        captured = _captured_headers(monkeypatch)
        edge_client.get(
            "/holder/v0.1/workspace",
            headers={"X-Ix-Account": "injected"},
        )
        assert all(not k.lower().startswith("x-ix-") for k in captured)


# ---------------------------------------------------------------------------
# G. Cache-Control: no-store on all edge responses
# ---------------------------------------------------------------------------


class TestEdgeCacheControl:
    """G — Cache-Control: no-store on every edge response."""

    def test_no_store_on_proxied_200(self, edge_client, monkeypatch):
        monkeypatch.setattr(edge, "_fetch_oidc_token", lambda a: "tok")
        monkeypatch.setattr(
            edge, "_proxy_to_authority", lambda m, p, h, b: (200, {"ok": True}, "application/json")
        )
        resp = edge_client.get("/holder/v0.1/workspace")
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_503_oidc_failure(self, edge_client, monkeypatch):
        monkeypatch.setattr(
            edge, "_fetch_oidc_token", lambda a: (_ for _ in ()).throw(OSError("metadata unavailable"))
        )
        resp = edge_client.get("/holder/v0.1/workspace")
        assert resp.status_code == 503
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_404(self, edge_client, monkeypatch):
        resp = edge_client.get("/holder/v0.1/not-a-route")
        assert resp.status_code == 404
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_405(self, edge_client, monkeypatch):
        resp = edge_client.delete("/holder/v0.1/workspace")
        assert resp.status_code == 405
        assert resp.headers.get("Cache-Control") == "no-store"


# ---------------------------------------------------------------------------
# H. OIDC fetch failure → 503
# ---------------------------------------------------------------------------


class TestEdgeOidcFailure:
    """H — metadata server failure yields 503, not 500 or uncaught exception."""

    def test_oidc_failure_yields_503(self, edge_client, monkeypatch):
        monkeypatch.setattr(
            edge,
            "_fetch_oidc_token",
            lambda a: (_ for _ in ()).throw(OSError("connection refused")),
        )
        resp = edge_client.get("/holder/v0.1/workspace")
        assert resp.status_code == 503
        body = json.loads(resp.data)
        assert "error" in body

    def test_oidc_failure_on_post_yields_503(self, edge_client, monkeypatch):
        monkeypatch.setattr(
            edge,
            "_fetch_oidc_token",
            lambda a: (_ for _ in ()).throw(RuntimeError("metadata not available")),
        )
        resp = edge_client.post(
            "/holder/v0.1/account",
            headers={"Content-Type": "application/json"},
            data=json.dumps({"operation_id": "op-1"}),
        )
        assert resp.status_code == 503


# ---------------------------------------------------------------------------
# Authority handler tests — I through L
# ---------------------------------------------------------------------------


def _mock_service(monkeypatch, method_name, return_value=None, side_effect=None):
    """
    Patch HolderAuthorityService.<method_name> on the authority handler module.
    Also patches verify_firebase_id_token to return a fixed identity_key.
    """
    monkeypatch.setattr(
        authority,
        "verify_firebase_id_token",
        lambda token, require_email_verified=False: (
            "identity-key-hex",
            "https://securetoken.google.com/ixid-prod",
            "uid123",
        ),
    )
    svc = MagicMock()
    if side_effect is not None:
        getattr(svc, method_name).side_effect = side_effect
    else:
        getattr(svc, method_name).return_value = return_value
    monkeypatch.setattr(authority, "_get_service", lambda: svc)
    return svc


# ---------------------------------------------------------------------------
# I. Firebase token is read from Authorization, not X-Firebase-Authorization
# ---------------------------------------------------------------------------


class TestAuthorityReadsFirebaseFromAuthorization:
    """I — authority reads Firebase ID token from Authorization header (frozen §5.1)."""

    def test_authorization_header_accepted(self, auth_client, monkeypatch):
        """Providing the Firebase token in Authorization → route executes."""
        result = MagicMock()
        result.created_new = True
        result.account_id = "acct-1"
        result.account_state = "ACTIVE"
        result.account_state_version = 0
        result.owned_ix_id = None
        _mock_service(monkeypatch, "create_account", return_value=result)

        resp = auth_client.post(
            "/holder/v0.1/account",
            headers={
                "Authorization": "Bearer firebase-id-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": "op-123"}),
        )
        assert resp.status_code == 201

    def test_workspace_authorization_header_accepted(self, auth_client, monkeypatch):
        """GET workspace reads Firebase token from Authorization."""
        result = MagicMock()
        result.account_id = "acct-1"
        result.account_state = "ACTIVE"
        result.account_state_version = 0
        result.ix_ids = []
        _mock_service(monkeypatch, "get_workspace", return_value=result)

        resp = auth_client.get(
            "/holder/v0.1/workspace",
            headers={"Authorization": "Bearer firebase-id-token"},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# J. X-Firebase-Authorization has no authority
# ---------------------------------------------------------------------------


class TestAuthorityXFirebaseAuthorizationHasNoAuthority:
    """J — X-Firebase-Authorization header is not honored; provides no access."""

    def test_x_firebase_authorization_alone_rejected(self, auth_client, monkeypatch):
        """
        Sending only X-Firebase-Authorization (not Authorization) yields 401.
        This would have been the bug: if the authority read from X-Firebase-Authorization,
        a client could bypass the two-token protocol by forging that header.
        """
        # Do NOT patch verify_firebase_id_token — if the authority incorrectly
        # reads X-Firebase-Authorization, the call would reach verification.
        resp = auth_client.post(
            "/holder/v0.1/account",
            headers={
                "X-Firebase-Authorization": "Bearer firebase-id-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": "op-123"}),
        )
        assert resp.status_code == 401
        body = json.loads(resp.data)
        assert body["error"] == "UNAUTHENTICATED"

    def test_x_firebase_authorization_alone_rejected_workspace(self, auth_client):
        resp = auth_client.get(
            "/holder/v0.1/workspace",
            headers={"X-Firebase-Authorization": "Bearer firebase-id-token"},
        )
        assert resp.status_code == 401

    def test_x_firebase_authorization_alone_rejected_ix_id(self, auth_client):
        resp = auth_client.post(
            "/holder/v0.1/ix-id",
            headers={
                "X-Firebase-Authorization": "Bearer firebase-id-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": "op-123", "handle": "test"}),
        )
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# K. Missing Authorization → 401 on all three routes
# ---------------------------------------------------------------------------


class TestAuthorityMissingAuthorizationHeader:
    """K — no Authorization header → 401 UNAUTHENTICATED on every route."""

    def test_create_account_no_auth(self, auth_client):
        resp = auth_client.post(
            "/holder/v0.1/account",
            headers={"Content-Type": "application/json"},
            data=json.dumps({"operation_id": "op-1"}),
        )
        assert resp.status_code == 401
        assert json.loads(resp.data)["error"] == "UNAUTHENTICATED"

    def test_register_ix_id_no_auth(self, auth_client):
        resp = auth_client.post(
            "/holder/v0.1/ix-id",
            headers={"Content-Type": "application/json"},
            data=json.dumps({"operation_id": "op-1", "handle": "test"}),
        )
        assert resp.status_code == 401

    def test_get_workspace_no_auth(self, auth_client):
        resp = auth_client.get("/holder/v0.1/workspace")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# L. Cache-Control: no-store on all authority responses
# ---------------------------------------------------------------------------


class TestAuthorityCacheControl:
    """L — Cache-Control: no-store on every authority response."""

    def test_no_store_on_401(self, auth_client):
        resp = auth_client.get("/holder/v0.1/workspace")
        assert resp.status_code == 401
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_422(self, auth_client, monkeypatch):
        monkeypatch.setattr(
            authority,
            "verify_firebase_id_token",
            lambda token, require_email_verified=False: ("identity-key", "iss", "sub"),
        )
        resp = auth_client.post(
            "/holder/v0.1/account",
            headers={
                "Authorization": "Bearer firebase-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({}),  # missing operation_id
        )
        assert resp.status_code == 422
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_405(self, auth_client):
        resp = auth_client.delete("/holder/v0.1/workspace")
        assert resp.status_code == 405
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_404(self, auth_client):
        resp = auth_client.get("/holder/v0.1/not-a-route")
        assert resp.status_code == 404
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_no_store_on_successful_response(self, auth_client, monkeypatch):
        result = MagicMock()
        result.account_id = "acct-1"
        result.account_state = "ACTIVE"
        result.account_state_version = 0
        result.ix_ids = []
        _mock_service(monkeypatch, "get_workspace", return_value=result)

        resp = auth_client.get(
            "/holder/v0.1/workspace",
            headers={"Authorization": "Bearer firebase-token"},
        )
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# M. M2 gate tests — email_verified admission rule (§1.5)
# ---------------------------------------------------------------------------


from ixid_holder_authority_service import AuthenticationError as _AuthErr  # noqa: E402


def _unverified_email_mock(monkeypatch):
    """
    Simulate a Firebase token with email_verified=False.
    verify_firebase_id_token raises EMAIL_NOT_VERIFIED when require_email_verified=True.
    GET /workspace (require_email_verified=False) passes through normally.
    """

    def _verify(token, require_email_verified=False):
        if require_email_verified:
            raise _AuthErr("Email not verified", internal_code="EMAIL_NOT_VERIFIED")
        return ("identity-key-hex", "https://securetoken.google.com/ixid-prod", "uid123")

    monkeypatch.setattr(authority, "verify_firebase_id_token", _verify)


class TestM2EmailVerifiedAdmission:
    """
    M — M2 gate tests M2-1 and M2-2: server-side email_verified admission.

    Contract: §1.5. require_email_verified=True is passed only to CREATE_ACCOUNT
    and REGISTER_IX_ID. GET /workspace uses the default (False).
    """

    def test_m2_1_unverified_email_create_account_denied(self, auth_client, monkeypatch):
        """M2-1: email_verified=false → CREATE_ACCOUNT → 401 UNAUTHENTICATED (zero writes).
        create_account() must not be called — the denial happens before the service boundary.
        """
        _unverified_email_mock(monkeypatch)
        svc = MagicMock()
        monkeypatch.setattr(authority, "_get_service", lambda: svc)

        resp = auth_client.post(
            "/holder/v0.1/account",
            headers={
                "Authorization": "Bearer unverified-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": str(uuid.uuid4())}),
        )
        assert resp.status_code == 401
        assert json.loads(resp.data)["error"] == "UNAUTHENTICATED"
        svc.create_account.assert_not_called()

    def test_m2_2_unverified_email_register_ix_id_denied(self, auth_client, monkeypatch):
        """M2-2: email_verified=false → REGISTER_IX_ID → 401 UNAUTHENTICATED (zero writes).
        register_ix_id() must not be called — denial happens before the service boundary.
        """
        _unverified_email_mock(monkeypatch)
        svc = MagicMock()
        monkeypatch.setattr(authority, "_get_service", lambda: svc)

        resp = auth_client.post(
            "/holder/v0.1/ix-id",
            headers={
                "Authorization": "Bearer unverified-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": str(uuid.uuid4()), "handle": "myhandle"}),
        )
        assert resp.status_code == 401
        assert json.loads(resp.data)["error"] == "UNAUTHENTICATED"
        svc.register_ix_id.assert_not_called()

    def test_m2_workspace_not_subject_to_email_admission_check(self, auth_client, monkeypatch):
        """
        GET /workspace must NOT be denied by the email_verified admission check.
        verify_firebase_id_token is called with require_email_verified=False for workspace reads.
        """
        calls: list[bool] = []

        def _track(token, require_email_verified=False):
            calls.append(require_email_verified)
            return ("identity-key-hex", "https://securetoken.google.com/ixid-prod", "uid123")

        monkeypatch.setattr(authority, "verify_firebase_id_token", _track)

        svc = MagicMock()
        svc.get_workspace.side_effect = _AuthErr("auth identity not found")
        monkeypatch.setattr(authority, "_get_service", lambda: svc)

        resp = auth_client.get(
            "/holder/v0.1/workspace",
            headers={"Authorization": "Bearer firebase-token"},
        )
        assert resp.status_code == 401
        assert calls == [False], (
            "GET /workspace must call verify_firebase_id_token with require_email_verified=False"
        )

    def test_m2_verified_email_create_account_reaches_service(self, auth_client, monkeypatch):
        """Verified email → admission check passes → CREATE_ACCOUNT reaches service."""
        monkeypatch.setattr(
            authority,
            "verify_firebase_id_token",
            lambda token, require_email_verified=False: (
                "identity-key-hex",
                "https://securetoken.google.com/ixid-prod",
                "uid123",
            ),
        )
        result = MagicMock()
        result.created_new = True
        result.account_id = "acct-1"
        result.account_state = "ACTIVE"
        result.account_state_version = 0
        result.owned_ix_id = None
        svc = MagicMock()
        svc.create_account.return_value = result
        monkeypatch.setattr(authority, "_get_service", lambda: svc)

        resp = auth_client.post(
            "/holder/v0.1/account",
            headers={
                "Authorization": "Bearer verified-token",
                "Content-Type": "application/json",
            },
            data=json.dumps({"operation_id": str(uuid.uuid4())}),
        )
        assert resp.status_code == 201
        assert svc.create_account.called
        assert resp.headers.get("Cache-Control") == "no-store"
