"""
IX ID Holder Edge v0.1
=======================
Public-facing Cloud Run service: ``ixid-holder-edge``

Contract: docs/architecture/ixid-holder-authority-v0.1.md §5.1

This process holds no Firestore role. Its only application authority is
service-scoped ``roles/run.invoker`` on ``ixid-holder-authority``.

Architecture:
::

    Browser / Client
       │  Authorization: Bearer <firebase-id-token>
       ▼
    LB: /api/holder/* → ixid-holder-backend (pathPrefixRewrite: /api/ → /)
    ixid-holder-edge  (this service — public; no Firestore role)
       │  strip inbound X-Serverless-Authorization, X-Ix-*
       │  add    X-Serverless-Authorization: Bearer <OIDC, aud=authority URL>
       │  forward Authorization: Bearer <firebase-id-token> unchanged
       ▼
    ixid-holder-authority  (private; Cloud Run IAM-gated)

Two-token protocol (§5.1 — frozen):
  - Client sends: ``Authorization: Bearer <firebase-id-token>``
  - This edge strips all inbound ``X-Serverless-Authorization`` and ``X-Ix-*``
    headers. Attacker-forged trust headers cannot reach the authority service.
  - Edge forwards the client's ``Authorization: Bearer <firebase-id-token>``
    unchanged so the authority application layer can verify it independently.
  - Edge generates its own OIDC token with ``aud = authority service URL``
    from the GCE metadata server. Placed in ``X-Serverless-Authorization:
    Bearer <oidc-token>`` so Cloud Run IAM can validate it before any
    application code executes. Cloud Run checks ``X-Serverless-Authorization``
    when present, reserving ``Authorization`` for application use (§5.1).
  - Authority verifies ``X-Serverless-Authorization`` (Cloud Run IAM — OIDC)
    and ``Authorization`` (Flask — Firebase Admin SDK) independently.
  - Neither bearer token is logged.

Invariants:
  - This handler MUST NOT read Firestore, verify Firebase tokens, or make
    any trust decisions. It forwards request bodies and response bodies
    exactly as received.
  - ``Cache-Control: no-store`` is applied to every response.
  - One OIDC token is fetched per request. It is not cached or logged.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from flask import Flask, Response, request

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_AUTHORITY_URL = os.environ.get(
    "AUTHORITY_SERVICE_URL",
    "https://ixid-holder-authority-i2idkn6uxq-uc.a.run.app",
)

_METADATA_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance"
    "/service-accounts/default/identity?audience={audience}"
)

# Headers this edge strips from inbound requests before forwarding (§5.1)
# Prevents clients from pre-injecting X-Serverless-Authorization (which Cloud Run
# IAM would accept as the service-invoker credential) or any X-Ix-* trust header.
_STRIP_PREFIXES = ("x-serverless-authorization", "x-ix-")

# ---------------------------------------------------------------------------
# Cache-Control invariant
# ---------------------------------------------------------------------------


@app.after_request
def _apply_no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------------------
# OIDC token fetch (same pattern as ixid_edge_handler.py)
# ---------------------------------------------------------------------------


def _fetch_oidc_token(audience: str) -> str:
    """
    Fetch an OIDC identity token from the GCE metadata server.
    Token is scoped to ``audience`` (the private authority service URL).
    Token is not logged.
    """
    url = _METADATA_TOKEN_URL.format(audience=audience)
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.read().decode("utf-8").strip()


# ---------------------------------------------------------------------------
# Header hygiene (§5.1 two-token protocol)
# ---------------------------------------------------------------------------


def _build_forwarded_headers() -> dict[str, str]:
    """
    Build the forwarded header set for the edge → authority call (§5.1 frozen):

      1. Strip all inbound X-Serverless-Authorization and X-Ix-* headers so
         clients cannot inject a pre-authorized Cloud Run invoker credential.
      2. Forward the client's Authorization: Bearer <firebase-id-token> unchanged
         so the authority application layer can verify it independently.
      3. Add X-Serverless-Authorization: Bearer <oidc-token> for Cloud Run IAM.

    Cloud Run IAM checks X-Serverless-Authorization when present, allowing the
    application to retain Authorization for its own (Firebase) use (§5.1).
    The OIDC token audience is the canonical authority service URL.

    Hop-by-hop headers (RFC 7230 §6.1) and Host are stripped; urllib sets Host
    automatically from the target URL, preventing hostname confusion at the
    authority.

    Raises on metadata server failure.
    """
    forwarded: dict[str, str] = {}

    # Hop-by-hop headers that MUST NOT be forwarded (RFC 7230 §6.1).
    # Host is also excluded — urllib sets it from the target URL.
    _HOP_BY_HOP = frozenset({"host", "connection", "keep-alive", "transfer-encoding",
                              "te", "trailer", "proxy-authorization", "upgrade"})

    for key, value in request.headers:
        lower = key.lower()
        if lower in _HOP_BY_HOP:
            continue
        if any(lower.startswith(p) for p in _STRIP_PREFIXES):
            continue
        forwarded[key] = value

    # Add edge OIDC token in X-Serverless-Authorization for Cloud Run IAM.
    # Authorization (Firebase ID token) is already forwarded unchanged above.
    oidc_token = _fetch_oidc_token(_AUTHORITY_URL)
    forwarded["X-Serverless-Authorization"] = f"Bearer {oidc_token}"

    return forwarded


# ---------------------------------------------------------------------------
# Proxy
# ---------------------------------------------------------------------------


def _proxy_to_authority(
    method: str, path: str, headers: dict, body: bytes | None
) -> tuple[int, Any, str]:
    """
    Forward the request to the private authority service.
    Returns (status_code, body_dict_or_None, content_type).
    """
    upstream_url = f"{_AUTHORITY_URL}{path}"
    req = urllib.request.Request(
        upstream_url,
        headers=headers,
        method=method,
        data=body,
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body_bytes = resp.read()
            try:
                return resp.status, json.loads(body_bytes.decode("utf-8")), "application/json"
            except Exception:
                return resp.status, body_bytes.decode("utf-8", errors="replace"), "text/plain"
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read()
        try:
            return exc.code, json.loads(body_bytes.decode("utf-8")), "application/json"
        except Exception:
            return exc.code, {"error": f"upstream error {exc.code}"}, "application/json"


# ---------------------------------------------------------------------------
# Generic proxy handler
# ---------------------------------------------------------------------------


def _handle_proxy(path: str) -> Response:
    """
    Apply header hygiene and proxy any /holder/* request to the authority.
    """
    try:
        forwarded_headers = _build_forwarded_headers()
    except Exception as exc:
        logger.error("Failed to fetch OIDC token: %s", exc)
        return Response(
            json.dumps({"error": "Service temporarily unavailable"}),
            status=503,
            content_type="application/json",
        )

    body = request.get_data() or None
    method = request.method

    try:
        status, resp_body, content_type = _proxy_to_authority(
            method, path, forwarded_headers, body
        )
    except Exception as exc:
        logger.error("Holder authority proxy error for %s %s: %s", method, path, exc)
        return Response(
            json.dumps({"error": "Service temporarily unavailable"}),
            status=503,
            content_type="application/json",
        )

    if isinstance(resp_body, dict):
        body_str = json.dumps(resp_body)
    else:
        body_str = str(resp_body)

    logger.info("proxied: %s %s → %d", method, path, status)
    return Response(body_str, status=status, content_type=content_type)


# ---------------------------------------------------------------------------
# Routes — proxy all /holder/* paths to authority
# ---------------------------------------------------------------------------


@app.route("/holder/v0.1/account", methods=["POST"])
def proxy_create_account() -> Response:
    return _handle_proxy("/holder/v0.1/account")


@app.route("/holder/v0.1/ix-id", methods=["POST"])
def proxy_register_ix_id() -> Response:
    return _handle_proxy("/holder/v0.1/ix-id")


@app.route("/holder/v0.1/workspace", methods=["GET"])
def proxy_get_workspace() -> Response:
    return _handle_proxy("/holder/v0.1/workspace")


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------


@app.errorhandler(405)
def _method_not_allowed(exc) -> Response:
    logger.warning("Method not allowed: %s %s", request.method, request.path)
    return Response(
        json.dumps({"error": "METHOD_NOT_ALLOWED"}),
        status=405,
        content_type="application/json",
    )


@app.errorhandler(404)
def _not_found(exc) -> Response:
    return Response(
        json.dumps({"error": "NOT_FOUND"}),
        status=404,
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
