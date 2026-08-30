"""
IX ID Holder Authority HTTP Handler v0.1
=========================================
Private Cloud Run service: ``ixid-holder-authority``

Contract: docs/architecture/ixid-holder-authority-v0.1.md §5.1, §5.4, §5.3

This process holds ``roles/datastore.user`` and is the sole write authority
for all holder Firestore collections. It is reachable only from
``ixid-holder-edge`` (enforced by Cloud Run IAM: only
``ixid-holder-edge-runtime`` holds ``roles/run.invoker`` on this service).

Authentication invariants:
  - Cloud Run runtime verifies ``X-Serverless-Authorization: Bearer <Google-signed
    OIDC token>`` before any application code executes. Only
    ``ixid-holder-edge-runtime`` holds ``run.invoker`` on this service, so no
    other caller reaches Flask.
  - This handler independently verifies the ``Authorization: Bearer <firebase-id-token>``
    header using the Firebase Admin SDK. It does NOT trust any application-level
    header as a pre-verified identity claim.
  - ``X-Firebase-Authorization`` has no authority in this service.
  - Neither bearer token is logged.

Cache invariant:
  ``Cache-Control: no-store`` is applied to every response by an
  ``@app.after_request`` hook. This cannot be bypassed by any route.
"""

import json
import logging
import os

from flask import Flask, Response, request
from google.cloud import firestore

from ixid_holder_authority_service import (
    AuthenticationError,
    AuthorizationError,
    DomainChallengeResult,
    DomainStatusResult,
    DomainVerifyResult,
    HandleUnavailableError,
    HolderAuthorityService,
    IdempotencyConflictError,
    InternalConsistencyError,
    PaymentRouteResult,
    ProfileResult,
    RateLimitError,
    ValidationError,
    WalletChallengeResult,
    WalletVerifyResult,
    verify_firebase_id_token,
)

logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)

app = Flask(__name__)

# ---------------------------------------------------------------------------
# Firestore client (lazy singleton)
# ---------------------------------------------------------------------------

_db: firestore.Client | None = None


def _get_db() -> firestore.Client:
    global _db
    if _db is None:
        _db = firestore.Client()
    return _db


def _get_service() -> HolderAuthorityService:
    return HolderAuthorityService(_get_db())


# ---------------------------------------------------------------------------
# Cache-Control invariant (§5.1 — frozen)
# ---------------------------------------------------------------------------


@app.after_request
def _apply_no_store(response: Response) -> Response:
    response.headers["Cache-Control"] = "no-store"
    return response


# ---------------------------------------------------------------------------
# Response helpers
# ---------------------------------------------------------------------------


def _json(body: dict, status: int) -> Response:
    return Response(
        json.dumps(body),
        status=status,
        content_type="application/json",
    )


def _err(code: str, status: int, detail: str | None = None) -> Response:
    body: dict = {"error": code}
    if detail:
        body["detail"] = detail
    return _json(body, status)


# ---------------------------------------------------------------------------
# Token extraction
# ---------------------------------------------------------------------------


def _extract_bearer(header_value: str | None) -> str | None:
    if not header_value or not header_value.startswith("Bearer "):
        return None
    token = header_value[len("Bearer "):].strip()
    return token or None


# ---------------------------------------------------------------------------
# Operation ID validation
# ---------------------------------------------------------------------------


def _extract_operation_id(body: dict) -> str | None:
    op_id = body.get("operation_id")
    if not isinstance(op_id, str) or not op_id.strip():
        return None
    return op_id.strip()


# ---------------------------------------------------------------------------
# Error → HTTP mapping
# ---------------------------------------------------------------------------


def _handle_service_error(exc: Exception) -> Response:
    if isinstance(exc, AuthenticationError):
        logger.info(
            "Authentication error: %s internal_code=%s", exc, exc.internal_code
        )
        return _err("UNAUTHENTICATED", 401)
    if isinstance(exc, AuthorizationError):
        logger.info("Authorization error: %s (code=%s)", exc, exc.internal_code)
        return _err("ACCESS_DENIED", 403)
    if isinstance(exc, RateLimitError):
        logger.info("Rate limit exceeded: %s retry_after=%s", exc, exc.retry_after)
        resp = _err("RATE_LIMIT_EXCEEDED", 429)
        resp.headers["Retry-After"] = str(exc.retry_after)
        return resp
    if isinstance(exc, HandleUnavailableError):
        logger.info("Handle unavailable: %s", exc)
        return _err("HANDLE_UNAVAILABLE", 409)
    if isinstance(exc, IdempotencyConflictError):
        logger.warning("Idempotency conflict: %s", exc)
        return _err("IDEMPOTENCY_CONFLICT", 422)
    if isinstance(exc, ValidationError):
        logger.info("Validation error: %s (code=%s)", exc, exc.code)
        return _err(exc.code, 422)
    if isinstance(exc, InternalConsistencyError):
        logger.error("INTERNAL CONSISTENCY ERROR: %s", exc)
        return _err("INTERNAL_ERROR", 500)
    logger.error("Unexpected error: %s", exc, exc_info=True)
    return _err("INTERNAL_ERROR", 500)


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.route("/holder/v0.1/account", methods=["POST"])
def handle_create_account() -> Response:
    """
    CREATE_ACCOUNT operation (§5.4.1).

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"operation_id": "<uuid>"}

    Response 201 (new account created):
        {"account_id": "...", "account_state": "ACTIVE", ...}

    Response 200 (account already existed — idempotent):
        {"account_id": "...", "account_state": "ACTIVE", ...}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    operation_id = _extract_operation_id(body)
    if not operation_id:
        return _err("MISSING_OPERATION_ID", 422)

    try:
        identity_key, verified_iss, verified_sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().create_account(
            operation_id=operation_id,
            identity_key=identity_key,
            verified_iss=verified_iss,
            verified_sub=verified_sub,
        )
    except Exception as exc:
        return _handle_service_error(exc)

    status = 201 if result.created_new else 200
    return _json(
        {
            "account_id": result.account_id,
            "account_state": result.account_state,
            "account_state_version": result.account_state_version,
            "owned_ix_id": result.owned_ix_id,
        },
        status,
    )


@app.route("/holder/v0.1/ix-id", methods=["POST"])
def handle_register_ix_id() -> Response:
    """
    REGISTER_IX_ID operation (§5.4.2).

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"operation_id": "<uuid>", "handle": "<desired-handle>"}

    Response 201 (IX ID registered):
        {"ix_id": "...", "ix_id_state": "ACTIVE", "ix_id_state_version": 0, ...}

    Response 200 (idempotent replay — IX ID was already registered):
        {"ix_id": "...", "ix_id_state": "ACTIVE", ...}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    operation_id = _extract_operation_id(body)
    if not operation_id:
        return _err("MISSING_OPERATION_ID", 422)

    handle_input = body.get("handle")
    if not isinstance(handle_input, str) or not handle_input.strip():
        return _err("MISSING_HANDLE", 422)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().register_ix_id(
            operation_id=operation_id,
            identity_key=identity_key,
            handle_input=handle_input,
        )
    except Exception as exc:
        return _handle_service_error(exc)

    status = 200 if result.is_replay else 201
    return _json(
        {
            "ix_id": result.ix_id,
            "ix_id_state": result.ix_id_state,
            "ix_id_state_version": result.ix_id_state_version,
            "owner_account_id": result.owner_account_id,
        },
        status,
    )


@app.route("/holder/v0.1/workspace", methods=["GET"])
def handle_get_workspace() -> Response:
    """
    Authenticated holder workspace read (§5.3).

    Request:
        Authorization: Bearer <firebase-id-token>

    Response 200 (ACTIVE or SUSPENDED account):
        {"account_id": "...", "account_state": "...", "ix_ids": [...]}

    Response 403 (DISABLED or CLOSED account):
        {"error": "ACCESS_DENIED"}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(raw_token)
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().get_workspace(identity_key)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "account_id": result.account_id,
            "account_state": result.account_state,
            "account_state_version": result.account_state_version,
            "ix_ids": result.ix_ids,
        },
        200,
    )


@app.route("/holder/v0.1/profile", methods=["PATCH"])
def handle_update_profile() -> Response:
    """
    UPDATE_PROFILE — update the authenticated owner's profile fields.

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"display_name": "...", "bio": "...", "website_url": "..."}
        (any subset of fields; omitted fields are unchanged)

    Response 200:
        {"display_name": "...", "bio": "...", "website_url": "..."}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    if not isinstance(body, dict):
        return _err("INVALID_REQUEST_BODY", 422)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().update_profile(identity_key, body)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "display_name": result.display_name,
            "bio": result.bio,
            "website_url": result.website_url,
        },
        200,
    )


@app.route("/holder/v0.1/domain-challenge", methods=["POST"])
def handle_issue_domain_challenge() -> Response:
    """
    Issue a DNS TXT challenge for domain verification.

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"domain": "example.com"}

    Response 201:
        {"challenge_id": "...", "domain": "...", "txt_record": "ixid-verify=...", "expires_at": "..."}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    domain_input = body.get("domain")
    if not isinstance(domain_input, str) or not domain_input.strip():
        return _err("MISSING_DOMAIN", 422)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().issue_domain_challenge(identity_key, domain_input)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "challenge_id": result.challenge_id,
            "domain": result.domain,
            "txt_record": result.txt_record,
            "expires_at": result.expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        201,
    )


@app.route("/holder/v0.1/domain-verify", methods=["POST"])
def handle_verify_domain() -> Response:
    """
    Attempt DNS TXT verification for a previously issued challenge.

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"challenge_id": "..."}

    Response 200:
        {"verified": true/false, "claim_id": "...", "error_code": "..."}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    challenge_id_input = body.get("challenge_id")
    if not isinstance(challenge_id_input, str) or not challenge_id_input.strip():
        return _err("MISSING_CHALLENGE_ID", 422)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().verify_domain_challenge(identity_key, challenge_id_input)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "verified": result.verified,
            "claim_id": result.claim_id,
            "error_code": result.error_code,
        },
        200,
    )


@app.route("/holder/v0.1/domain-status", methods=["GET"])
def handle_get_domain_status() -> Response:
    """
    Get domain verification status for the authenticated owner's IX ID.

    Request:
        Authorization: Bearer <firebase-id-token>

    Response 200:
        {"domain": {...}|null, "pending_challenge": {...}|null}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(raw_token)
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().get_domain_status(identity_key)
    except Exception as exc:
        return _handle_service_error(exc)

    domain_block = None
    if result.domain_status is not None:
        domain_block = {
            "status": result.domain_status,
            "subject": result.domain_subject,
            "claim_id": result.domain_claim_id,
            "expires_at": (
                result.domain_expires_at.strftime("%Y-%m-%dT%H:%M:%SZ")
                if result.domain_expires_at else None
            ),
        }

    challenge_block = None
    if result.pending_challenge_id is not None:
        challenge_block = {
            "challenge_id": result.pending_challenge_id,
            "domain": result.pending_challenge_domain,
            "txt_record": result.pending_txt_record,
            "expires_at": (
                result.pending_challenge_expires_at.strftime("%Y-%m-%dT%H:%M:%SZ")
                if result.pending_challenge_expires_at else None
            ),
        }

    return _json(
        {
            "domain": domain_block,
            "pending_challenge": challenge_block,
        },
        200,
    )


@app.route("/holder/v0.1/wallet-challenge", methods=["POST"])
def handle_issue_wallet_challenge() -> Response:
    """
    Issue a personal_sign challenge for wallet binding.

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"destination_address": "0x..."}

    Response 201:
        {"challenge_id": "...", "ix_id": "...", "destination_address": "...",
         "chain_id": 137, "challenge_text": "...", "expires_at": "..."}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    destination_address = body.get("destination_address")
    if not isinstance(destination_address, str) or not destination_address.strip():
        return _err("MISSING_DESTINATION_ADDRESS", 422)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().issue_wallet_challenge(identity_key, destination_address)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "challenge_id": result.challenge_id,
            "ix_id": result.ix_id,
            "destination_address": result.destination_address,
            "chain_id": result.chain_id,
            "challenge_text": result.challenge_text,
            "expires_at": result.expires_at.strftime("%Y-%m-%dT%H:%M:%SZ"),
        },
        201,
    )


@app.route("/holder/v0.1/wallet-verify", methods=["POST"])
def handle_verify_wallet() -> Response:
    """
    Verify a personal_sign signature and publish the payment route.

    Request:
        Authorization: Bearer <firebase-id-token>
        Content-Type: application/json
        {"challenge_id": "...", "signature": "0x..."}

    Response 200:
        {"claim_id": "...", "ix_id": "...", "destination_address": "...",
         "chain_id": 137, "is_replacement": false}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        body = request.get_json(force=True, silent=True) or {}
    except Exception:
        body = {}

    challenge_id = body.get("challenge_id")
    if not isinstance(challenge_id, str) or not challenge_id.strip():
        return _err("MISSING_CHALLENGE_ID", 422)

    signature = body.get("signature")
    if not isinstance(signature, str) or not signature.strip():
        return _err("MISSING_SIGNATURE", 422)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().verify_wallet_challenge(identity_key, challenge_id, signature)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "claim_id": result.claim_id,
            "ix_id": result.ix_id,
            "destination_address": result.destination_address,
            "chain_id": result.chain_id,
            "is_replacement": result.is_replacement,
        },
        200,
    )


@app.route("/holder/v0.1/payment-route", methods=["GET"])
def handle_get_payment_route() -> Response:
    """
    Return the current payment route for the authenticated holder.

    Request:
        Authorization: Bearer <firebase-id-token>

    Response 200:
        {"ix_id": "...", "destination_address": "...", "chain_id": 137,
         "asset": "USDC", "claim_id": "...", "routing_suspended": false}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(raw_token)
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().get_payment_route(identity_key)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "ix_id": result.ix_id,
            "destination_address": result.destination_address,
            "chain_id": result.chain_id,
            "asset": result.asset,
            "claim_id": result.claim_id,
            "routing_suspended": result.routing_suspended,
        },
        200,
    )


@app.route("/holder/v0.1/payment-route/disable", methods=["POST"])
def handle_disable_payment_route() -> Response:
    """
    Revoke the active payment route (holder-initiated).

    Request:
        Authorization: Bearer <firebase-id-token>

    Response 200:
        {"ix_id": "...", "destination_address": null, "chain_id": null,
         "asset": null, "claim_id": null, "routing_suspended": true}
    """
    raw_token = _extract_bearer(request.headers.get("Authorization"))
    if not raw_token:
        return _err("UNAUTHENTICATED", 401)

    try:
        identity_key, _iss, _sub = verify_firebase_id_token(
            raw_token, require_email_verified=True
        )
    except AuthenticationError as exc:
        return _handle_service_error(exc)

    try:
        result = _get_service().disable_payment_route(identity_key)
    except Exception as exc:
        return _handle_service_error(exc)

    return _json(
        {
            "ix_id": result.ix_id,
            "destination_address": result.destination_address,
            "chain_id": result.chain_id,
            "asset": result.asset,
            "claim_id": result.claim_id,
            "routing_suspended": result.routing_suspended,
        },
        200,
    )


# ---------------------------------------------------------------------------
# Error handlers
# ---------------------------------------------------------------------------


@app.errorhandler(405)
def _method_not_allowed(exc) -> Response:
    logger.warning("Method not allowed: %s %s", request.method, request.path)
    return _err("METHOD_NOT_ALLOWED", 405)


@app.errorhandler(404)
def _not_found(exc) -> Response:
    return _err("NOT_FOUND", 404)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "8080"))
    app.run(host="0.0.0.0", port=port, debug=False)
