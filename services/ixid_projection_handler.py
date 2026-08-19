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


def _load_public_facts(db: firestore.Client, ix_id: str) -> PublicIdentityFacts | None:
    """
    Load the public identity facts for ``ix_id`` from Firestore.

    Returns ``None`` when the ix_id has no claim documents (404 condition).
    Returns ``PublicIdentityFacts(domain=None)`` when the ix_id has claims
    of other types but no DOMAIN claim.

    The caller must not make trust decisions from this data; that is the
    kernel's responsibility.

    No Firestore writes are performed.

    Authoritative claim selection — v0.1 canonical-domain rule
    -----------------------------------------------------------
    An IX ID may accumulate multiple DOMAIN claims over its lifetime. The
    frozen architecture specification (ixid-identity-trust-architecture-v0.1)
    does not guarantee exactly one DOMAIN subject per IX ID; §6.1 DOMAIN_CONFLICT
    guards against two different IX IDs holding the same domain, not against
    one IX ID holding claims for multiple distinct domains.

    The following selection rule is therefore an explicit v0.1 product decision,
    not a derivation from the lifecycle contract alone:

    Step 1 — Exclude chain predecessors.
      A SUPERSEDED claim always has ``superseded_by`` set to its successor's
      claim_id. Exclude these; they are not current authority.
      EXPIRED terminal claims retain ``superseded_by = None`` (EXPIRED has no
      outbound transitions and cannot be succeeded via the SUPERSEDED path).
      Defensive fallback: if all DOMAIN claims have ``superseded_by`` set
      (should not occur in practice), treat all as candidates.

    Step 2 — Enforce single-subject invariant.
      ``superseded_by = None`` establishes only that a claim is a chain tip.
      It does not establish that the claim is *the* canonical public domain.
      If non-superseded tips have more than one distinct subject, the canonical
      domain is ambiguous under the v0.1 rule. Fail closed: present no DOMAIN
      claim rather than silently elect one domain over another by recency.
      Log an error for operational investigation.

    Step 3 — Select most recently verified among same-subject candidates.
      Within a single domain subject, multiple non-superseded tips can exist
      (e.g., EXPIRED then re-verified for the same domain; EXPIRED is terminal
      and retains ``superseded_by = None`` while the successor's ``supersedes``
      points back at it). Among these, the most recently verified is the
      authoritative claim for that subject.

    This rule is deterministic and fails closed on internally inconsistent
    states rather than guessing.
    """
    claims_ref = (
        db.collection("ix_ids").document(ix_id).collection("verification_claims")
    )

    # Load all claims for this ix_id. Expected to be a small set (O(1–5)).
    # Fetching all in one round-trip avoids a composite index requirement
    # and distinguishes "ix_id not found" from "no DOMAIN claim present".
    all_claims = list(claims_ref.stream())

    if not all_claims:
        # ix_id has no claims — treat as not found
        return None

    domain_docs = [d for d in all_claims if d.to_dict().get("claim_type") == "DOMAIN"]

    if not domain_docs:
        return PublicIdentityFacts(domain=None)

    # Step 1: exclude chain predecessors.
    non_superseded = [d for d in domain_docs if not d.to_dict().get("superseded_by")]
    candidates = non_superseded if non_superseded else domain_docs

    # Step 2: single-subject invariant.
    subjects = {d.to_dict()["subject"] for d in candidates}
    if len(subjects) > 1:
        # Multiple distinct domain subjects without a canonical reference.
        # Ambiguous in v0.1 — fail closed rather than silently elect by recency.
        logger.error(
            "ix_id=%s has %d non-superseded DOMAIN claims with %d distinct subjects %r; "
            "canonical domain is ambiguous under v0.1 rule; presenting no DOMAIN claim",
            ix_id,
            len(candidates),
            len(subjects),
            subjects,
        )
        return PublicIdentityFacts(domain=None)

    # Step 3: most recently verified among same-subject candidates.
    authoritative = max(candidates, key=lambda d: d.to_dict()["verified_at"])
    data = authoritative.to_dict()

    # Firestore returns timezone-aware datetimes; the kernel validates this.
    return PublicIdentityFacts(
        domain=DomainClaimFacts(
            status=data["status"],
            expires_at=data.get("expires_at"),
            verified_at=data["verified_at"],
            subject=data["subject"],
        )
    )


# ---------------------------------------------------------------------------
# Serialization
# ---------------------------------------------------------------------------


def _iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.strftime("%Y-%m-%dT%H:%M:%SZ")


def _serialize_view(ix_id: str, view: PublicIdentityView) -> dict:
    d = view.domain
    return {
        "ix_id": ix_id,
        "evaluated_at": _iso(view.evaluated_at),
        "policy_version": view.policy_version,
        "snapshot_id": view.snapshot.snapshot_id,
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


def _identity_response(ix_id: str, view: PublicIdentityView) -> Response:
    body = _serialize_view(ix_id, view)
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
        facts = _load_public_facts(_get_db(), ix_id)
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

    return _identity_response(ix_id, view)


# ---------------------------------------------------------------------------
# Entry point (gunicorn targets `app`; this block is for local debugging only)
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
