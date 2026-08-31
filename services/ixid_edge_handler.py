"""
IX ID Public Edge v0.1
======================
Credential-less public HTTP boundary that proxies the frozen
``GET /public/identity/{ix_id}`` endpoint to the private projection service.

This process holds no Firestore or Datastore IAM role. Its only application
authority is service-scoped ``roles/run.invoker`` on ``ixid-projection``.

Architecture
------------
::

    Internet
       ↓
    ixid-public-edge          (this service — public, no Firestore role)
       ↓  OIDC (metadata server)
    ixid-projection           (private — roles/datastore.viewer)
       ↓
    Firestore → Presentation Kernel → PublicIdentityView

Why a separate public process?
-------------------------------
``roles/datastore.viewer`` grants read access to all Firestore resources in
the project, not just the four fields the HTTP contract exposes. Granting
that role to the internet-facing runtime creates a larger read blast radius
than the HTTP response contract implies. Keeping the Firestore-bearing
service private limits a public-container compromise to OIDC token theft
against the private service — still a concern, but a substantially smaller
one than raw Firestore credential exposure.

Invariants
----------
- This handler MUST NOT read Firestore or call the Presentation Kernel.
- This handler MUST NOT reinterpret status, expiry, DOMAIN selection, or
  response fields. It forwards the upstream body exactly as received.
- ``Cache-Control: no-store`` is applied to every response, including 404,
  405, 500, and proxy-error responses. See the projection handler for the
  rationale (RFC 9110 §15.5.5 heuristic cacheability).
- One OIDC token is fetched per request from the GCE metadata server.
  The token is consumed inside the HTTP call and not logged.
"""

import json
import logging
import os
import urllib.error
import urllib.request
from typing import Any

from flask import Flask, Response, request

logger = logging.getLogger(__name__)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_PROJECTION_URL = os.environ.get(
    "PROJECTION_SERVICE_URL",
    "https://ixid-projection-i2idkn6uxq-uc.a.run.app",
)

_METADATA_TOKEN_URL = (
    "http://metadata.google.internal/computeMetadata/v1/instance"
    "/service-accounts/default/identity?audience={audience}"
)

# ---------------------------------------------------------------------------
# Global cache invariant (see module docstring)
# ---------------------------------------------------------------------------


@app.after_request
def _apply_no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------------------
# OIDC token fetch
# ---------------------------------------------------------------------------


def _fetch_oidc_token(audience: str) -> str:
    """
    Fetch an OIDC identity token from the GCE metadata server.

    The token is scoped to ``audience`` (the private projection service URL)
    and authorizes this process to invoke the private Cloud Run service.

    The token is not logged.
    """
    url = _METADATA_TOKEN_URL.format(audience=audience)
    req = urllib.request.Request(url, headers={"Metadata-Flavor": "Google"})
    with urllib.request.urlopen(req, timeout=5) as resp:
        return resp.read().decode("utf-8").strip()


# ---------------------------------------------------------------------------
# Proxy
# ---------------------------------------------------------------------------


def _proxy_upstream(ix_id: str) -> tuple[int, Any, str]:
    """
    Forward the identity request to the private projection service.

    Returns (status_code, body_dict_or_None, content_type).
    Raises on network failure or metadata token failure.
    """
    upstream_url = f"{_PROJECTION_URL}/public/identity/{ix_id}"
    token = _fetch_oidc_token(_PROJECTION_URL)

    req = urllib.request.Request(
        upstream_url,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return resp.status, body, "application/json"
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read()
        try:
            body = json.loads(body_bytes.decode("utf-8"))
        except Exception:  # noqa: BLE001
            body = {"error": f"upstream error {exc.code}"}
        return exc.code, body, "application/json"


# ---------------------------------------------------------------------------
# Error helpers
# ---------------------------------------------------------------------------


@app.errorhandler(405)
def _method_not_allowed(exc) -> Response:
    logger.warning("Method not allowed: %s %s", request.method, request.path)
    return Response(
        json.dumps({"error": f"Method not allowed: {request.method}"}),
        status=405,
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/public/identity/<ix_id>", methods=["GET"])
def handle_get_identity(ix_id: str) -> Response:
    """
    Proxy a public identity request to the private projection service.

    This handler does not read Firestore, call the Presentation Kernel,
    or make any trust decisions. It forwards the upstream response exactly.
    """
    try:
        status, body, content_type = _proxy_upstream(ix_id)
    except Exception as exc:  # noqa: BLE001
        logger.error("Edge proxy error for ix_id=%s: %s", ix_id, exc)
        return Response(
            json.dumps({"error": "Identity service temporarily unavailable"}),
            status=503,
            content_type="application/json",
        )

    logger.info(
        "proxied: ix_id=%s upstream_status=%d",
        ix_id,
        status,
    )
    return Response(
        json.dumps(body),
        status=status,
        content_type=content_type,
    )


@app.route("/public/route/<ix_id>", methods=["GET", "OPTIONS"])
def handle_get_route(ix_id: str) -> Response:
    """
    Proxy a public payment-route request to the private projection service.

    Called cross-origin from portal.implicitex.com (IX ID handoff).
    CORS Access-Control-Allow-Origin: * is required and applied here.

    This handler does not read Firestore or make trust decisions.
    It forwards the upstream response body exactly.
    """
    if request.method == "OPTIONS":
        resp = Response("", status=204, content_type="application/json")
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET"
        resp.headers["Access-Control-Max-Age"] = "86400"
        return resp

    upstream_url = f"{_PROJECTION_URL}/public/route/{ix_id}"
    token = _fetch_oidc_token(_PROJECTION_URL)
    req = urllib.request.Request(
        upstream_url,
        headers={"Authorization": f"Bearer {token}"},
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            status = resp.status
    except urllib.error.HTTPError as exc:
        body_bytes = exc.read()
        try:
            body = json.loads(body_bytes.decode("utf-8"))
        except Exception:  # noqa: BLE001
            body = {"error": f"upstream error {exc.code}"}
        status = exc.code
    except Exception as exc:  # noqa: BLE001
        logger.error("Route edge proxy error for ix_id=%s: %s", ix_id, exc)
        resp = Response(
            json.dumps({"error": "Route service temporarily unavailable"}),
            status=503,
            content_type="application/json",
        )
        resp.headers["Access-Control-Allow-Origin"] = "*"
        return resp

    logger.info("proxied route: ix_id=%s upstream_status=%d", ix_id, status)
    resp = Response(json.dumps(body), status=status, content_type="application/json")
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
