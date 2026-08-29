"""
IX ID Public Identity HTTP Projection v0.1
==========================================
Read-only Cloud Run endpoint that exposes the frozen Presentation Kernel
over HTTP.

Transport invariant
-------------------
The projection layer transports presentation authority; it does not create it.

All trust decisions are delegated to the Presentation Kernel. This handler:
  - loads raw claim facts from Firestore
  - captures one explicit evaluated_at at request time
  - calls derive_public_identity_view() exactly once
  - serializes the returned PublicIdentityView

What the projection layer MUST NOT do:
  - Inspect claim status and make its own expiry or validity judgements
  - Call the DNS resolver or Transition Service
  - Mutate any Firestore document
  - Infer BUSINESS_IDENTITY or PAYMENT_ROUTE state the kernel does not support
  - Invent presentation semantics not present in the PublicIdentityView

Cache invariant (v0.1 — not yet enforced by CDN)
-------------------------------------------------
``Cache-Control: no-store`` is a **global response invariant**, applied to
every response from this service: 200, 400, 404, 405, and 500.

HTTP defines 404 and 405 as heuristically cacheable (RFC 9110 §15.5.5).
An IX ID that does not exist today may exist within minutes after the first
verification completes. A cached negative response would suppress that valid
identity as surely as a cached stale VERIFIED response would misrepresent an
expired one. Both are stale-authority failures.

The invariant is enforced by an ``@app.after_request`` hook, not by individual
response helpers, to ensure it cannot be bypassed by any path — including
Flask's built-in error responses.

Any future CDN or edge-caching configuration MUST enforce per-response TTL
bounded by ``expires_at``, not a fixed wall-clock cache duration.

Frozen containment invariants:
  - Read-only: no Firestore writes, no Transition Service calls, no DNS.
  - No authentication required for public identity reads.
  - One evaluated_at per request, captured at the handler boundary.
  - derive_public_identity_view() called exactly once per request.
"""

import json
import logging
import os
from datetime import datetime, timezone

from flask import Flask, Response, request
from google.cloud import firestore

from ixid_presentation_kernel import (
    DomainClaimFacts,
    EvaluationContext,
    PresentationPolicy,
    PublicIdentityFacts,
    PublicIdentityView,
    ResolverSnapshotRef,
    derive_public_identity_view,
)

logger = logging.getLogger(__name__)

app = Flask(__name__)


# ---------------------------------------------------------------------------
# Global cache invariant
# ---------------------------------------------------------------------------


@app.after_request
def _apply_no_store(response: Response) -> Response:
    """
    Enforce Cache-Control: no-store on every response.

    HTTP defines 404 and 405 as heuristically cacheable (RFC 9110 §15.5.5).
    An IX ID that does not exist today may exist within minutes. A cached
    negative response is the same stale-authority failure as a cached stale
    VERIFIED response. This hook covers all paths, including Flask built-ins.
    """
    response.headers["Cache-Control"] = "no-store"
    return response

# ---------------------------------------------------------------------------
# Firestore client — one instance per container process
# ---------------------------------------------------------------------------

_db: firestore.Client | None = None


def _get_db() -> firestore.Client:
    global _db
    if _db is None:
        _db = firestore.Client()
    return _db


# ---------------------------------------------------------------------------
# Firestore fact loading
# ---------------------------------------------------------------------------


def _load_public_facts(db: firestore.Client, ix_id: str) -> tuple[PublicIdentityFacts | None, dict]:
    """
    Load public identity facts and profile fields for ``ix_id`` from Firestore.

    Returns (None, {}) when the ix_id document does not exist (404 condition).
    Returns (PublicIdentityFacts, profile_dict) when the ix_id exists.
    profile_dict keys: display_name, bio, website_url (all may be None).

    The caller must not make trust decisions from this data.
    """
    ix_ref = db.collection("ix_ids").document(ix_id)
    ix_snap = ix_ref.get()

    if not ix_snap.exists:
        return None, {}

    ix = ix_snap.to_dict()
    profile = {
        "display_name": ix.get("display_name"),
        "bio": ix.get("bio"),
        "website_url": ix.get("website_url"),
    }

    claims_ref = ix_ref.collection("verification_claims")
    all_claims = list(claims_ref.stream())

    if not all_claims:
        return PublicIdentityFacts(domain=None), profile

    domain_docs = [d for d in all_claims if d.to_dict().get("claim_type") == "DOMAIN"]

    if not domain_docs:
        return PublicIdentityFacts(domain=None), profile

    # Step 1: exclude chain predecessors.
    non_superseded = [d for d in domain_docs if not d.to_dict().get("superseded_by")]
    candidates = non_superseded if non_superseded else domain_docs

    # Step 2: single-subject invariant.
    subjects = {d.to_dict()["subject"] for d in candidates}
    if len(subjects) > 1:
        logger.error(
            "ix_id=%s has %d non-superseded DOMAIN claims with %d distinct subjects %r; "
            "canonical domain is ambiguous under v0.1 rule; presenting no DOMAIN claim",
            ix_id,
            len(candidates),
            len(subjects),
            subjects,
        )
        return PublicIdentityFacts(domain=None), profile

    # Step 3: most recently verified among same-subject candidates.
    authoritative = max(candidates, key=lambda d: d.to_dict()["verified_at"])
    data = authoritative.to_dict()

    return PublicIdentityFacts(
        domain=DomainClaimFacts(
            status=data["status"],
            expires_at=data.get("expires_at"),
            verified_at=data["verified_at"],
            subject=data["subject"],
        )
    ), profile


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _serialize_view(ix_id: str, view: PublicIdentityView, profile: dict) -> dict:
    d = view.domain
    return {
        "ix_id": ix_id,
        "evaluated_at": _iso(view.evaluated_at),
        "policy_version": view.policy_version,
        "snapshot_id": view.snapshot.snapshot_id,
        "profile": {
            "display_name": profile.get("display_name"),
            "bio": profile.get("bio"),
            "website_url": profile.get("website_url"),
        },
        "domain": {
            "status": d.presentation_status.value,
            "label": d.display_label,
            "subject": d.subject,
            "verified_since": _iso(d.verified_since),
        },
    }


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


@app.errorhandler(405)
def _method_not_allowed(exc) -> Response:
    logger.warning("Method not allowed: %s %s", request.method, request.path)
    return Response(
        json.dumps({"error": f"Method not allowed: {request.method}"}),
        status=405,
        content_type="application/json",
    )


def _not_found(ix_id: str) -> Response:
    return Response(
        json.dumps({"error": f"IX ID not found: {ix_id!r}"}),
        status=404,
        content_type="application/json",
    )


def _bad_request(message: str) -> Response:
    logger.warning("Bad request: %s", message)
    return Response(
        json.dumps({"error": message}),
        status=400,
        content_type="application/json",
    )


def _server_error(message: str) -> Response:
    logger.error("Internal error: %s", message)
    return Response(
        json.dumps({"error": message}),
        status=500,
        content_type="application/json",
    )


def _identity_response(ix_id: str, view: PublicIdentityView, profile: dict) -> Response:
    body = _serialize_view(ix_id, view, profile)
    return Response(
        json.dumps(body),
        status=200,
        content_type="application/json",
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

_POLICY = PresentationPolicy(policy_version="v1")


@app.route("/public/identity/<ix_id>", methods=["GET"])
def handle_get_identity(ix_id: str) -> Response:
    """
    Return the public identity view for the requested ix_id.

    One evaluated_at is captured at the handler boundary. All temporal
    authority flows from that single timestamp into the kernel. No downstream
    code reads the clock.
    """
    # Capture evaluation timestamp at the handler boundary.
    # This is the only call to the clock in this request.
    evaluated_at = datetime.now(timezone.utc)

    try:
        facts, profile = _load_public_facts(_get_db(), ix_id)
    except Exception as exc:  # noqa: BLE001
        return _server_error(f"Failed to load identity facts: {exc}")

    if facts is None:
        return _not_found(ix_id)

    view = derive_public_identity_view(
        facts,
        _POLICY,
        EvaluationContext(
            evaluated_at=evaluated_at,
            snapshot=ResolverSnapshotRef(snapshot_id=None),
        ),
    )

    logger.info(
        "identity view: ix_id=%s domain_status=%s evaluated_at=%s",
        ix_id,
        view.domain.presentation_status.value,
        _iso(evaluated_at),
    )

    return _identity_response(ix_id, view, profile)


@app.route("/public/route/<ix_id>", methods=["GET", "OPTIONS"])
def handle_get_payment_route(ix_id: str) -> Response:
    """
    Return the current payment route for the given IX ID.

    Reads only the public routing fields from ix_ids/{ix_id}.
    No private signature, challenge, or ownership evidence exposed.

    - IX ID not found → 404
    - IX ID exists, no active route → 200 {ix_id, payable: false}
    - IX ID exists, active route → 200 {ix_id, payable: true, destination_address, chain_id, asset, claim_id}

    CORS
    ----
    Access-Control-Allow-Origin: * is intentional and safe for this endpoint.
    This is a read-only, public, unauthenticated endpoint. No credentials are
    read, no state is mutated, and no private data is exposed. The ImplicitEx
    Transfer Portal (portal.implicitex.com) fetches this endpoint cross-origin
    to independently validate the destination_address and claim_id carried in
    an IX ID payment handoff URL.
    """
    # Preflight — browsers send OPTIONS before cross-origin GET requests.
    if request.method == "OPTIONS":
        resp = Response("", status=204)
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Allow-Methods"] = "GET"
        resp.headers["Access-Control-Max-Age"] = "86400"
        return resp

    try:
        ix_snap = _get_db().collection("ix_ids").document(ix_id).get()
    except Exception as exc:
        return _server_error(f"Failed to load route: {exc}")

    if not ix_snap.exists:
        return _not_found(ix_id)

    ix = ix_snap.to_dict()
    active_address = ix.get("active_payment_route_address")
    active_claim_id = ix.get("active_payment_route_claim_id")
    routing_suspended = ix.get("routing_suspended", False)

    if not active_address or not active_claim_id or routing_suspended:
        body = {"ix_id": ix_id, "payable": False}
    else:
        body = {
            "ix_id": ix_id,
            "payable": True,
            "destination_address": active_address,
            "chain_id": 137,
            "asset": {
                "symbol": "USDC",
                "contract": "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359",
                "asset_binding_version": "polygon-pos-native-usdc-v1",
            },
            "claim_id": active_claim_id,
        }

    resp = Response(json.dumps(body), status=200, content_type="application/json")
    resp.headers["Access-Control-Allow-Origin"] = "*"
    return resp


# ---------------------------------------------------------------------------
# Entry point (gunicorn targets `app`; this block is for local debugging only)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
