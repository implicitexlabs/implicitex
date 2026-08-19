"""
IX ID Public Edge v0.1 — tests.

The edge handler holds no Firestore credentials and performs no trust logic.
These tests verify:
  1. The proxy correctly forwards upstream responses (status, body, headers).
  2. Cache-Control: no-store is applied to every response, including 404,
     405, 503, and proxied errors — the same global invariant as the
     projection handler.
  3. The handler does not import or invoke Firestore, the Presentation Kernel,
     or any trust-logic module.
  4. A metadata/OIDC fetch failure produces 503, not 500 or an uncaught error.
"""

import json
from unittest.mock import MagicMock, patch

import pytest

import ixid_edge_handler as edge


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture()
def client():
    edge.app.config["TESTING"] = True
    with edge.app.test_client() as c:
        yield c


def _mock_proxy(status: int, body: dict):
    """Return a _proxy_upstream stub that yields (status, body, content_type)."""
    return lambda ix_id: (status, body, "application/json")


# ---------------------------------------------------------------------------
# Proxy forwarding
# ---------------------------------------------------------------------------


class TestProxyForwarding:
    def test_200_upstream_forwarded(self, client, monkeypatch):
        body = {
            "ix_id": "alice",
            "evaluated_at": "2026-08-18T12:00:00Z",
            "policy_version": "v1",
            "snapshot_id": None,
            "domain": {
                "status": "VERIFIED",
                "label": "Official Website Verified",
                "subject": "alice.example.com",
                "verified_since": "2026-07-01T00:00:00Z",
            },
        }
        monkeypatch.setattr(edge, "_proxy_upstream", _mock_proxy(200, body))
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 200
        assert json.loads(resp.data) == body

    def test_404_upstream_forwarded(self, client, monkeypatch):
        body = {"error": "IX ID not found: 'alice'"}
        monkeypatch.setattr(edge, "_proxy_upstream", _mock_proxy(404, body))
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 404
        assert json.loads(resp.data) == body

    def test_500_upstream_forwarded_as_500(self, client, monkeypatch):
        body = {"error": "Internal error: ..."}
        monkeypatch.setattr(edge, "_proxy_upstream", _mock_proxy(500, body))
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 500

    def test_proxy_error_returns_503(self, client, monkeypatch):
        """A network failure fetching from upstream yields 503, not an uncaught error."""

        def _raise(ix_id):
            raise OSError("connection refused")

        monkeypatch.setattr(edge, "_proxy_upstream", _raise)
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 503
        body = json.loads(resp.data)
        assert "error" in body

    def test_proxy_does_not_reinterpret_body(self, client, monkeypatch):
        """Edge returns whatever the upstream sent without modification."""
        upstream_body = {
            "ix_id": "bob",
            "evaluated_at": "2026-08-18T10:00:00Z",
            "policy_version": "v1",
            "snapshot_id": None,
            "domain": {"status": "EXPIRED", "label": "Domain Verification Expired",
                       "subject": "bob.example.com", "verified_since": None},
        }
        monkeypatch.setattr(edge, "_proxy_upstream", _mock_proxy(200, upstream_body))
        resp = client.get("/public/identity/bob")
        assert json.loads(resp.data) == upstream_body


# ---------------------------------------------------------------------------
# Cache-Control global invariant (RFC 9110 §15.5.5)
# ---------------------------------------------------------------------------


class TestCacheControlGlobalInvariant:
    """
    Cache-Control: no-store must appear on every response from the edge.

    The edge is the public boundary; cached stale responses here are
    indistinguishable from cached stale responses at the projection layer.
    """

    def test_cache_control_on_200(self, client, monkeypatch):
        body = {"ix_id": "alice", "domain": {"status": "VERIFIED"}}
        monkeypatch.setattr(edge, "_proxy_upstream", _mock_proxy(200, body))
        resp = client.get("/public/identity/alice")
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_cache_control_on_404_from_upstream(self, client, monkeypatch):
        body = {"error": "IX ID not found: 'alice'"}
        monkeypatch.setattr(edge, "_proxy_upstream", _mock_proxy(404, body))
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 404
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_cache_control_on_405(self, client, monkeypatch):
        resp = client.post("/public/identity/alice")
        assert resp.status_code == 405
        assert resp.headers.get("Cache-Control") == "no-store"

    def test_cache_control_on_503_proxy_error(self, client, monkeypatch):
        def _raise(ix_id):
            raise OSError("network failure")

        monkeypatch.setattr(edge, "_proxy_upstream", _raise)
        resp = client.get("/public/identity/alice")
        assert resp.status_code == 503
        assert resp.headers.get("Cache-Control") == "no-store"


# ---------------------------------------------------------------------------
# Containment: edge must not import trust-logic modules
# ---------------------------------------------------------------------------


class TestEdgeContainment:
    def test_edge_does_not_import_firestore_client(self):
        """Edge handler must not import the Firestore client library."""
        import inspect

        src = inspect.getsource(edge)
        # Docstrings may mention "Firestore" as a concept; check for actual imports.
        assert "from google.cloud import firestore" not in src
        assert "import google.cloud.firestore" not in src
        assert "firestore.Client" not in src

    def test_edge_does_not_import_presentation_kernel(self):
        import inspect

        src = inspect.getsource(edge)
        assert "ixid_presentation_kernel" not in src

    def test_edge_does_not_import_transition_service(self):
        import inspect

        src = inspect.getsource(edge)
        assert "ixid_transition_service" not in src

    def test_edge_does_not_import_projection_handler(self):
        """Edge is a separate process; it must not import the projection handler."""
        import inspect

        src = inspect.getsource(edge)
        assert "ixid_projection_handler" not in src


# ---------------------------------------------------------------------------
# Method enforcement
# ---------------------------------------------------------------------------


class TestMethodEnforcement:
    @pytest.mark.parametrize("method", ["POST", "PUT", "DELETE", "PATCH"])
    def test_non_get_rejected(self, client, method):
        resp = client.open("/public/identity/alice", method=method)
        assert resp.status_code == 405

    def test_405_body_is_json_with_error_key(self, client):
        resp = client.post("/public/identity/alice")
        body = json.loads(resp.data)
        assert "error" in body
