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
  - Cloud Run runtime verifies ``X-Serverless-Authorization`` (Google OIDC)
    before any application code executes. An unauthorized caller receives 403
    at the Cloud Run invocation boundary.
  - This handler independently verifies the ``Authorization: Bearer <firebase-id-token>``
    header using the Firebase Admin SDK. It does NOT trust any application-level
    header as a pre-verified identity claim.
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
    HandleUnavailableError,
    HolderAuthorityService,
    IdempotencyConflictError,
    InternalConsistencyError,
    ValidationError,
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
        logger.info("Authentication error: %s", exc)
        return _err("UNAUTHENTICATED", 401)
    if isinstance(exc, AuthorizationError):
        logger.info("Authorization error: %s (code=%s)", exc, exc.internal_code)
        return _err("ACCESS_DENIED", 403)
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
        identity_key, verified_iss, verified_sub = verify_firebase_id_token(raw_token)
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
        identity_key, _iss, _sub = verify_firebase_id_token(raw_token)
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
