"""
IX ID Holder Authority Service v0.1
====================================
Single authority class for all holder operations.

Contract: docs/architecture/ixid-holder-authority-v0.1.md (FROZEN 2026-08-19)

This module is the sole authority for:
  - Firebase ID token verification (identity boundary)
  - auth_identities: creation and lookup
  - accounts: creation and state reads
  - ix_ids: handle registration and state reads
  - holder_operation_receipts: idempotency enforcement

No other module may perform these operations. All holder reads and
writes must flow through HolderAuthorityService.

Frozen invariants:
  - identity_key = hex(SHA-256(exact_iss + "\\x00" + exact_sub))
    No case transformation applied to iss or sub (§2.1).
  - account_id is IX-generated opaque identifier: ix_ + 128-bit URL-safe
    base64. Never a Firebase UID (§2.2).
  - Every successful operation writes an idempotency receipt inside the same
    Firestore transaction as the mutation (§2.4).
  - Denied calls produce zero authoritative Firestore writes (§5.5).
  - All holder responses carry Cache-Control: no-store (enforced in handler).
  - Current account state outranks replay semantics (§5.4.1 principle).
  - Idempotency check precedes handle-existence and owned-IX-ID checks in
    REGISTER_IX_ID (§5.4.2 step 6 ordering invariant).
"""

import hashlib
import logging
import os
import re
import secrets
import base64
import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

from google.cloud import firestore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

_FIREBASE_PROJECT_ID = os.environ.get("FIREBASE_PROJECT_ID", "ixid-prod")

# ---------------------------------------------------------------------------
# Firebase initialization (lazy; monkeypatched in tests)
# ---------------------------------------------------------------------------

_firebase_app = None


def _init_firebase():
    global _firebase_app
    if _firebase_app is None:
        import firebase_admin  # noqa: PLC0415 — lazy import for test isolation

        try:
            _firebase_app = firebase_admin.get_app()
        except ValueError:
            _firebase_app = firebase_admin.initialize_app()
    return _firebase_app


# ---------------------------------------------------------------------------
# Error hierarchy
# ---------------------------------------------------------------------------


class HolderAuthorityError(Exception):
    pass


class AuthenticationError(HolderAuthorityError):
    """Maps to HTTP 401."""

    def __init__(self, message: str, internal_code: str = "UNAUTHENTICATED"):
        super().__init__(message)
        self.internal_code = internal_code


class AuthorizationError(HolderAuthorityError):
    """Maps to HTTP 403."""

    def __init__(self, message: str, internal_code: str = "ACCESS_DENIED"):
        super().__init__(message)
        self.internal_code = internal_code


class HandleUnavailableError(HolderAuthorityError):
    """Maps to HTTP 409 HANDLE_UNAVAILABLE."""

    pass


class IdempotencyConflictError(HolderAuthorityError):
    """Maps to HTTP 422 IDEMPOTENCY_CONFLICT."""

    pass


class ValidationError(HolderAuthorityError):
    """Maps to HTTP 422."""

    def __init__(self, message: str, code: str = "VALIDATION_ERROR"):
        super().__init__(message)
        self.code = code


class InternalConsistencyError(HolderAuthorityError):
    """Maps to HTTP 500. Always logged and alerted."""

    pass


# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class AccountState(str, Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    DISABLED = "DISABLED"
    CLOSED = "CLOSED"


class IxIdState(str, Enum):
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    TOMBSTONED = "TOMBSTONED"


class AuthIdentityState(str, Enum):
    ACTIVE = "ACTIVE"
    REVOKED = "REVOKED"


# ---------------------------------------------------------------------------
# Result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class CreateAccountResult:
    account_id: str
    account_state: str
    account_state_version: int
    owned_ix_id: str | None
    is_noop: bool
    created_new: bool  # True → 201, False → 200


@dataclass(frozen=True)
class RegisterIxIdResult:
    ix_id: str
    ix_id_state: str
    ix_id_state_version: int
    owner_account_id: str
    is_replay: bool  # True → 200, False → 201


@dataclass(frozen=True)
class WorkspaceResult:
    account_id: str
    account_state: str
    account_state_version: int
    ix_ids: list


# ---------------------------------------------------------------------------
# Reserved handles (§4.2)
# ---------------------------------------------------------------------------

_RESERVED_HANDLES: frozenset[str] = frozenset(
    {
        # IX and product control-plane
        "implicitex",
        "ixid",
        "ixid-me",
        "holder",
        "auth",
        "login",
        "signin",
        "signup",
        "account",
        "accounts",
        "wallet",
        "pay",
        "payment",
        "payments",
        "checkout",
        "verify",
        "verification",
        "app",
        # Infrastructure and operations
        "api",
        "www",
        "mail",
        "dev",
        "staging",
        "prod",
        "test",
        "root",
        "system",
        "status",
        "health",
        "healthz",
        "metrics",
        "static",
        "assets",
        "cdn",
        "docs",
        "noreply",
        "postmaster",
        "hostmaster",
        "webmaster",
        # Trust and safety
        "admin",
        "support",
        "abuse",
        "security",
        "legal",
        "help",
    }
)

# ---------------------------------------------------------------------------
# Handle canonicalization (§4.1)
# ---------------------------------------------------------------------------

_HANDLE_RE = re.compile(r"^[a-z0-9][a-z0-9\-]*[a-z0-9]$")


def canonicalize_handle(handle_input: str) -> str:
    """
    Lowercase the input and validate per §4.1.
    Raises ValidationError on invalid form. Normalization precedes lookup.
    """
    if not isinstance(handle_input, str):
        raise ValidationError("Handle must be a string", code="INVALID_HANDLE")
    canonical = handle_input.lower()
    if len(canonical) < 3 or len(canonical) > 30:
        raise ValidationError(
            f"Handle must be 3–30 characters (got {len(canonical)})",
            code="INVALID_HANDLE_LENGTH",
        )
    if not _HANDLE_RE.match(canonical):
        raise ValidationError(
            "Handle must start and end with an alphanumeric character "
            "and contain only a-z, 0-9, or hyphens",
            code="INVALID_HANDLE_FORMAT",
        )
    if "--" in canonical:
        raise ValidationError(
            "Handle must not contain consecutive hyphens",
            code="INVALID_HANDLE_FORMAT",
        )
    return canonical


def check_reserved_handle(canonical_handle: str) -> None:
    """Raises ValidationError if handle is in the v0.1 reserved set (§4.2)."""
    if canonical_handle in _RESERVED_HANDLES:
        raise ValidationError(
            f"Handle '{canonical_handle}' is reserved",
            code="RESERVED_HANDLE",
        )


# ---------------------------------------------------------------------------
# Identity key (§2.1)
# ---------------------------------------------------------------------------


def compute_identity_key(iss: str, sub: str) -> str:
    """
    hex(SHA-256(exact_iss + "\\x00" + exact_sub))

    Takes iss and sub exactly as they appear in the verified Firebase ID token.
    No case transformation applied to either field.
    Including the full iss URL namespaces the identity to the Firebase project.
    """
    raw = (iss + "\x00" + sub).encode("utf-8")
    return hashlib.sha256(raw).hexdigest()


# ---------------------------------------------------------------------------
# Account ID generation (§2.2)
# ---------------------------------------------------------------------------


def generate_account_id() -> str:
    """
    ix_ + 128-bit URL-safe base64 (no padding).
    Never a Firebase UID or any externally derived value.
    """
    random_bytes = secrets.token_bytes(16)
    encoded = base64.urlsafe_b64encode(random_bytes).rstrip(b"=").decode("ascii")
    return f"ix_{encoded}"


# ---------------------------------------------------------------------------
# Payload fingerprints (§5.6)
# ---------------------------------------------------------------------------


def payload_fingerprint_create_account(identity_key: str) -> str:
    """SHA-256(identity_key). Binds the receipt to the authenticated principal."""
    return hashlib.sha256(identity_key.encode("utf-8")).hexdigest()


def payload_fingerprint_register_ix_id(canonical_handle: str) -> str:
    """SHA-256(canonical_handle). Binds the receipt to the requested handle."""
    return hashlib.sha256(canonical_handle.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Firebase token verification (§3.1)
# Monkeypatched in tests to avoid firebase-admin initialization.
# ---------------------------------------------------------------------------


def verify_firebase_id_token(token: str) -> tuple[str, str, str]:
    """
    Verify a Firebase ID token using the Firebase Admin SDK.

    Returns (identity_key, verified_iss, verified_sub).
    Raises AuthenticationError on any failure (invalid token, wrong audience,
    expired, etc.).

    The token audience is verified against the Firebase project ID embedded in
    the initialized firebase_admin app. Tokens from other Firebase projects are
    rejected at verification time.

    The verified_sub is used exactly as returned by the Firebase Admin SDK.
    No case transformation is applied.
    """
    _init_firebase()
    try:
        from firebase_admin import auth as firebase_auth  # noqa: PLC0415

        decoded = firebase_auth.verify_id_token(token, check_revoked=False)
    except Exception as exc:
        logger.warning("Firebase token verification failed: %s", type(exc).__name__)
        raise AuthenticationError("Invalid Firebase ID token") from exc

    verified_iss = decoded.get("iss", "")
    verified_sub = decoded.get("sub", "")
    if not verified_iss or not verified_sub:
        raise AuthenticationError("Firebase token missing iss or sub claim")

    identity_key = compute_identity_key(verified_iss, verified_sub)
    return identity_key, verified_iss, verified_sub


# ---------------------------------------------------------------------------
# Idempotency binding assertion helpers (§5.6)
# ---------------------------------------------------------------------------


def _assert_create_account_binding(
    receipt: dict, identity_key: str, payload_fp: str
) -> None:
    """
    Raises IdempotencyConflictError if receipt does not match the exact full
    binding for CREATE_ACCOUNT:
        principal_identity_key + operation_type=CREATE_ACCOUNT
        + target_ix_id=null + payload_fingerprint
    """
    if (
        receipt.get("principal_identity_key") != identity_key
        or receipt.get("operation_type") != "CREATE_ACCOUNT"
        or receipt.get("target_ix_id") is not None
        or receipt.get("payload_fingerprint") != payload_fp
    ):
        raise IdempotencyConflictError(
            "operation_id conflict: receipt fields do not match current request"
        )


def _assert_register_ix_id_binding(
    receipt: dict,
    identity_key: str,
    canonical_handle: str,
    payload_fp: str,
    account_id: str,
) -> None:
    """
    Raises IdempotencyConflictError if receipt does not match the exact full
    binding for REGISTER_IX_ID:
        principal_identity_key + operation_type=REGISTER_IX_ID
        + target_ix_id=canonical_handle + payload_fingerprint
        + receipt.resolved_account_id == current account_id
    """
    if (
        receipt.get("principal_identity_key") != identity_key
        or receipt.get("operation_type") != "REGISTER_IX_ID"
        or receipt.get("target_ix_id") != canonical_handle
        or receipt.get("payload_fingerprint") != payload_fp
        or receipt.get("resolved_account_id") != account_id
    ):
        raise IdempotencyConflictError(
            "operation_id conflict: receipt fields do not match current request"
        )


# ---------------------------------------------------------------------------
# HolderAuthorityService
# ---------------------------------------------------------------------------


class HolderAuthorityService:
    """
    Single authority class per §5.2.

    All Firebase token verification, account resolution, ownership checks,
    idempotency enforcement, and audit event creation must flow through
    this class. No alternative implementation is permitted.
    """

    def __init__(self, db: firestore.Client) -> None:
        self._db = db

    # ── CREATE_ACCOUNT (§5.4.1) ──────────────────────────────────────────────

    def create_account(
        self,
        operation_id: str,
        identity_key: str,
        verified_iss: str,
        verified_sub: str,
    ) -> CreateAccountResult:
        """
        CREATE_ACCOUNT operation.

        The caller (handler) has already verified the Firebase token and
        extracted (identity_key, verified_iss, verified_sub).

        Principle: current account state outranks replay semantics.
        A matching receipt does not grant access after account state changes.
        """
        db = self._db
        payload_fp = payload_fingerprint_create_account(identity_key)
        receipt_ref = db.collection("holder_operation_receipts").document(operation_id)

        # ── Step 3: Pre-transaction fast-path idempotency check ───────────────
        # Not authoritative; the transaction re-reads. Safe to reject early on
        # principal mismatch (operation_id used by a different identity).
        receipt_snap = receipt_ref.get()
        if receipt_snap.exists:
            r = receipt_snap.to_dict()
            if r.get("principal_identity_key") != identity_key:
                raise IdempotencyConflictError(
                    "operation_id already consumed by a different principal"
                )
            _assert_create_account_binding(r, identity_key, payload_fp)
            # exact match — continue to transaction for authoritative revalidation

        # ── Step 4: Transaction ───────────────────────────────────────────────
        transaction = db.transaction()

        @firestore.transactional
        def _run(transaction: firestore.Transaction) -> CreateAccountResult:  # noqa: WPS430
            # Step 4a: Re-read receipt (TOCTOU guard)
            r_snap = receipt_ref.get(transaction=transaction)

            if r_snap.exists:
                r = r_snap.to_dict()
                _assert_create_account_binding(r, identity_key, payload_fp)
                # exact full binding — revalidate current authority before returning
                auth_ref = db.collection("auth_identities").document(identity_key)
                a_snap = auth_ref.get(transaction=transaction)
                if not a_snap.exists:
                    logger.error(
                        "INTERNAL CONSISTENCY: receipt exists but auth_identities absent "
                        "op=%s identity_key=%.8s",
                        operation_id,
                        identity_key,
                    )
                    raise InternalConsistencyError(
                        "receipt exists but auth_identities mapping is absent"
                    )
                a = a_snap.to_dict()
                if a.get("account_id") != r.get("resolved_account_id"):
                    logger.error(
                        "INTERNAL CONSISTENCY: receipt resolved_account_id disagrees "
                        "with auth_identities op=%s",
                        operation_id,
                    )
                    raise InternalConsistencyError(
                        "receipt resolved_account_id disagrees with auth_identities mapping"
                    )
                if a.get("auth_identity_state") == AuthIdentityState.REVOKED:
                    logger.warning(
                        "AUTH_IDENTITY_REVOKED_AFTER_RECEIPT op=%s", operation_id
                    )
                    raise AuthenticationError(
                        "auth identity revoked; prior receipt does not bypass revocation",
                        internal_code="AUTH_IDENTITY_REVOKED_AFTER_RECEIPT",
                    )
                # ACTIVE — re-read account for current state
                acct_id = r["resolved_account_id"]
                acct_ref = db.collection("accounts").document(acct_id)
                acct_snap = acct_ref.get(transaction=transaction)
                if not acct_snap.exists:
                    raise InternalConsistencyError(
                        "receipt exists but account document is absent"
                    )
                acct = acct_snap.to_dict()
                state = acct.get("account_state")
                if state == AccountState.ACTIVE:
                    # Current authoritative snapshot — no write
                    return CreateAccountResult(
                        account_id=acct_id,
                        account_state=state,
                        account_state_version=acct.get("account_state_version", 0),
                        owned_ix_id=acct.get("owned_ix_id"),
                        is_noop=True,
                        created_new=False,
                    )
                logger.warning(
                    "ACCOUNT_SUSPENDED_AFTER_RECEIPT op=%s state=%s", operation_id, state
                )
                raise AuthorizationError(
                    f"account state is {state}; prior receipt does not grant access",
                    internal_code="ACCOUNT_SUSPENDED_AFTER_RECEIPT",
                )

            # Step 4b: Read auth_identities
            auth_ref = db.collection("auth_identities").document(identity_key)
            a_snap = auth_ref.get(transaction=transaction)
            now = datetime.now(timezone.utc)

            if a_snap.exists:
                a = a_snap.to_dict()
                if a.get("auth_identity_state") == AuthIdentityState.REVOKED:
                    raise AuthenticationError("auth identity revoked")
                # EXISTS, ACTIVE — account already exists; potential concurrent loser
                existing_account_id = a["account_id"]
                acct_ref = db.collection("accounts").document(existing_account_id)
                acct_snap = acct_ref.get(transaction=transaction)
                if not acct_snap.exists:
                    raise InternalConsistencyError(
                        "auth_identities mapping points to non-existent account"
                    )
                acct = acct_snap.to_dict()
                state = acct.get("account_state")
                if state == AccountState.ACTIVE:
                    # Write no-op receipt for this operation_id; return current snapshot
                    transaction.set(
                        receipt_ref,
                        {
                            "operation_id": operation_id,
                            "principal_identity_key": identity_key,
                            "operation_type": "CREATE_ACCOUNT",
                            "target_ix_id": None,
                            "payload_fingerprint": payload_fp,
                            "resolved_account_id": existing_account_id,
                            "result_ix_id_state_version": None,
                            "is_noop": True,
                            "occurred_at": now,
                        },
                    )
                    return CreateAccountResult(
                        account_id=existing_account_id,
                        account_state=state,
                        account_state_version=acct.get("account_state_version", 0),
                        owned_ix_id=acct.get("owned_ix_id"),
                        is_noop=True,
                        created_new=False,
                    )
                # Non-ACTIVE account — no write, no receipt
                raise AuthorizationError(
                    f"account state is {state}",
                    internal_code="ACCOUNT_NOT_ACTIVE",
                )

            # Steps 4c–4h: Create new account
            new_account_id = generate_account_id()
            e1_id = str(uuid.uuid4())
            e2_id = str(uuid.uuid4())
            acct_ref = db.collection("accounts").document(new_account_id)
            events_ref = acct_ref.collection("account_events")

            transaction.set(
                auth_ref,
                {
                    "identity_key": identity_key,
                    "issuer": verified_iss,
                    "subject": verified_sub,
                    "account_id": new_account_id,
                    "linked_at": now,
                    "linking_event_id": e2_id,
                    "auth_identity_state": AuthIdentityState.ACTIVE,
                    "revoked_at": None,
                    "revocation_event_id": None,
                },
            )
            transaction.set(
                acct_ref,
                {
                    "account_id": new_account_id,
                    "created_at": now,
                    "creation_auth_identity_key": identity_key,
                    "creation_security_event_id": e1_id,
                    "account_state": AccountState.ACTIVE,
                    "account_state_version": 0,
                    "account_state_changed_at": now,
                    "owned_ix_id": None,
                },
            )
            transaction.set(
                events_ref.document(e1_id),
                {
                    "event_id": e1_id,
                    "event_type": "ACCOUNT_CREATED",
                    "account_id": new_account_id,
                    "from_state": None,
                    "to_state": AccountState.ACTIVE,
                    "prior_state_version": None,
                    "resulting_state_version": 0,
                    "operation_id": operation_id,
                    "actor": "CONTROLLER",
                    "occurred_at": now,
                    "reason": None,
                },
            )
            transaction.set(
                events_ref.document(e2_id),
                {
                    "event_id": e2_id,
                    "event_type": "AUTH_IDENTITY_LINKED",
                    "account_id": new_account_id,
                    "from_state": None,
                    "to_state": None,
                    "prior_state_version": None,
                    "resulting_state_version": None,
                    "operation_id": operation_id,
                    "actor": "CONTROLLER",
                    "occurred_at": now,
                    "reason": None,
                },
            )
            transaction.set(
                receipt_ref,
                {
                    "operation_id": operation_id,
                    "principal_identity_key": identity_key,
                    "operation_type": "CREATE_ACCOUNT",
                    "target_ix_id": None,
                    "payload_fingerprint": payload_fp,
                    "resolved_account_id": new_account_id,
                    "result_ix_id_state_version": None,
                    "is_noop": False,
                    "occurred_at": now,
                },
            )

            logger.info(
                "CREATE_ACCOUNT committed: account_id=%s op=%s",
                new_account_id,
                operation_id,
            )
            return CreateAccountResult(
                account_id=new_account_id,
                account_state=AccountState.ACTIVE,
                account_state_version=0,
                owned_ix_id=None,
                is_noop=False,
                created_new=True,
            )

        return _run(transaction)

    # ── REGISTER_IX_ID (§5.4.2) ──────────────────────────────────────────────

    def register_ix_id(
        self,
        operation_id: str,
        identity_key: str,
        handle_input: str,
    ) -> RegisterIxIdResult:
        """
        REGISTER_IX_ID operation.

        Idempotency check MUST precede handle-existence and owned-IX-ID checks
        (§5.4.2 step 6 ordering invariant). A retry after a successful commit
        must not see the created handle and return 409 HANDLE_UNAVAILABLE.
        """
        db = self._db

        # Steps 2–3: Resolve account (raises AuthenticationError or returns state)
        account_id, account_state = self._resolve_account_for_mutation(identity_key)

        # Step 4: Canonicalize
        canonical_handle = canonicalize_handle(handle_input)

        # Step 5: Reserved handle check
        check_reserved_handle(canonical_handle)

        payload_fp = payload_fingerprint_register_ix_id(canonical_handle)
        receipt_ref = db.collection("holder_operation_receipts").document(operation_id)

        # Step 6: Check idempotency BEFORE handle-existence and owned-IX-ID checks
        # This ordering is the correction from revision 7: receipt check precedes
        # handle and ownership checks because the prior commit itself created the
        # handle and set owned_ix_id. Checking those first would incorrectly deny
        # a valid replay with 409 HANDLE_UNAVAILABLE.
        skip_handle_checks = False
        receipt_snap = receipt_ref.get()

        if receipt_snap.exists:
            r = receipt_snap.to_dict()
            if r.get("principal_identity_key") != identity_key:
                raise IdempotencyConflictError(
                    "operation_id already consumed by a different principal"
                )
            _assert_register_ix_id_binding(
                r, identity_key, canonical_handle, payload_fp, account_id
            )
            # exact receipt match — skip steps 7–8; go to authoritative transaction
            skip_handle_checks = True

        if not skip_handle_checks:
            # Step 7: Pre-transaction handle existence fast-path
            ix_id_ref = db.collection("ix_ids").document(canonical_handle)
            ix_snap = ix_id_ref.get()
            if ix_snap.exists:
                raise HandleUnavailableError(
                    f"handle '{canonical_handle}' is not available"
                )

            # Step 8: Pre-transaction owned_ix_id fast-path
            acct_ref = db.collection("accounts").document(account_id)
            acct_snap = acct_ref.get()
            if acct_snap.exists and acct_snap.to_dict().get("owned_ix_id") is not None:
                raise HandleUnavailableError("account already owns an IX ID")

        # Step 9: Authoritative transaction (§4.5)
        transaction = db.transaction()
        ix_id_ref = db.collection("ix_ids").document(canonical_handle)
        acct_ref = db.collection("accounts").document(account_id)

        @firestore.transactional
        def _run(transaction: firestore.Transaction) -> RegisterIxIdResult:  # noqa: WPS430
            # Step 9a: Re-read receipt (authoritative idempotency gate)
            # Receipt is checked BEFORE registration state — same ordering invariant.
            r_snap = receipt_ref.get(transaction=transaction)

            if r_snap.exists:
                r = r_snap.to_dict()
                _assert_register_ix_id_binding(
                    r, identity_key, canonical_handle, payload_fp, account_id
                )
                # exact full binding — revalidate current authority
                if r.get("resolved_account_id") != account_id:
                    raise InternalConsistencyError(
                        "receipt resolved_account_id disagrees with current account_id"
                    )
                acct_snap = acct_ref.get(transaction=transaction)
                if not acct_snap.exists:
                    raise InternalConsistencyError(
                        "account document not found during receipt replay"
                    )
                acct = acct_snap.to_dict()
                state = acct.get("account_state")
                if state != AccountState.ACTIVE:
                    logger.warning(
                        "ACCOUNT_SUSPENDED_AFTER_RECEIPT op=%s state=%s", operation_id, state
                    )
                    raise AuthorizationError(
                        f"account state is {state} during receipt replay",
                        internal_code="ACCOUNT_SUSPENDED_AFTER_RECEIPT",
                    )
                # Re-read ix_ids to confirm registration persisted (fail-closed)
                ix_snap = ix_id_ref.get(transaction=transaction)
                if not ix_snap.exists:
                    logger.error(
                        "INTERNAL CONSISTENCY: receipt exists but ix_ids absent "
                        "op=%s handle=%s",
                        operation_id,
                        canonical_handle,
                    )
                    raise InternalConsistencyError(
                        "receipt exists but ix_ids document is absent"
                    )
                ix = ix_snap.to_dict()
                if ix.get("owner_account_id") != account_id:
                    logger.error(
                        "INTERNAL CONSISTENCY: ix_ids owner_account_id disagrees "
                        "op=%s handle=%s",
                        operation_id,
                        canonical_handle,
                    )
                    raise InternalConsistencyError(
                        "ix_ids document owner_account_id disagrees with current account_id"
                    )
                # Current authoritative snapshot — no write
                return RegisterIxIdResult(
                    ix_id=canonical_handle,
                    ix_id_state=ix.get("ix_id_state", IxIdState.ACTIVE),
                    ix_id_state_version=ix.get("ix_id_state_version", 0),
                    owner_account_id=account_id,
                    is_replay=True,
                )

            # Step 9b: Re-read accounts (TOCTOU guard)
            acct_snap = acct_ref.get(transaction=transaction)
            if not acct_snap.exists:
                raise InternalConsistencyError("account document not found")
            acct = acct_snap.to_dict()
            if acct.get("account_state") != AccountState.ACTIVE:
                raise AuthorizationError(
                    "account not ACTIVE (concurrent state change)",
                    internal_code="ACCOUNT_NOT_ACTIVE",
                )
            if acct.get("owned_ix_id") is not None:
                raise HandleUnavailableError(
                    "account already owns an IX ID (concurrent registration)"
                )

            # Step 9c: Re-read ix_ids (TOCTOU guard)
            ix_snap = ix_id_ref.get(transaction=transaction)
            if ix_snap.exists:
                raise HandleUnavailableError(
                    f"handle '{canonical_handle}' is not available (concurrent registration)"
                )

            # Step 9d: Atomic claim (§4.5 steps 3–6)
            now = datetime.now(timezone.utc)
            event_id = str(uuid.uuid4())

            transaction.set(
                ix_id_ref,
                {
                    "ix_id": canonical_handle,
                    "owner_account_id": account_id,
                    "ix_id_state": IxIdState.ACTIVE,
                    "ix_id_state_version": 0,
                    "ix_id_state_changed_at": now,
                    "created_at": now,
                },
            )
            transaction.set(
                ix_id_ref.collection("ix_id_state_events").document(event_id),
                {
                    "event_id": event_id,
                    "operation_id": operation_id,
                    "operation_type": "REGISTRATION",
                    "account_id": account_id,
                    "from_ix_id_state": None,
                    "to_ix_id_state": IxIdState.ACTIVE,
                    "prior_ix_id_state_version": None,
                    "resulting_ix_id_state_version": 0,
                    "occurred_at": now,
                    "actor": "CONTROLLER",
                    "reason": None,
                },
            )
            # One-time mutation: accounts.owned_ix_id: null → canonical_handle
            transaction.update(acct_ref, {"owned_ix_id": canonical_handle})
            transaction.set(
                receipt_ref,
                {
                    "operation_id": operation_id,
                    "principal_identity_key": identity_key,
                    "operation_type": "REGISTER_IX_ID",
                    "target_ix_id": canonical_handle,
                    "payload_fingerprint": payload_fp,
                    "resolved_account_id": account_id,
                    "result_ix_id_state_version": 0,
                    "is_noop": False,
                    "occurred_at": now,
                },
            )

            logger.info(
                "REGISTER_IX_ID committed: account_id=%s handle=%s op=%s",
                account_id,
                canonical_handle,
                operation_id,
            )
            return RegisterIxIdResult(
                ix_id=canonical_handle,
                ix_id_state=IxIdState.ACTIVE,
                ix_id_state_version=0,
                owner_account_id=account_id,
                is_replay=False,
            )

        return _run(transaction)

    # ── GET WORKSPACE (§5.3) ─────────────────────────────────────────────────

    def get_workspace(self, identity_key: str) -> WorkspaceResult:
        """
        Authenticated holder workspace read.
        ACTIVE and SUSPENDED accounts may read.
        DISABLED and CLOSED accounts are denied all access.
        """
        db = self._db

        auth_ref = db.collection("auth_identities").document(identity_key)
        auth_snap = auth_ref.get()
        if not auth_snap.exists:
            raise AuthenticationError("auth identity not found")
        auth = auth_snap.to_dict()
        if auth.get("auth_identity_state") == AuthIdentityState.REVOKED:
            raise AuthenticationError("auth identity revoked")

        account_id = auth["account_id"]
        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError(
                "auth_identities mapping points to non-existent account"
            )
        acct = acct_snap.to_dict()
        state = acct.get("account_state")

        if state in (AccountState.DISABLED, AccountState.CLOSED):
            raise AuthorizationError(
                f"account {state}", internal_code="ACCOUNT_NOT_READABLE"
            )

        # Collect owned IX IDs
        ix_ids: list[dict] = []
        owned = acct.get("owned_ix_id")
        if owned:
            ix_ref = db.collection("ix_ids").document(owned)
            ix_snap = ix_ref.get()
            if ix_snap.exists:
                ix = ix_snap.to_dict()
                ix_ids.append(
                    {
                        "ix_id": owned,
                        "ix_id_state": ix.get("ix_id_state"),
                        "ix_id_state_version": ix.get("ix_id_state_version"),
                        "owner_account_id": account_id,
                    }
                )

        return WorkspaceResult(
            account_id=account_id,
            account_state=state,
            account_state_version=acct.get("account_state_version", 0),
            ix_ids=ix_ids,
        )

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _resolve_account_for_mutation(self, identity_key: str) -> tuple[str, str]:
        """
        Resolve identity_key → (account_id, account_state) for mutation operations.

        Raises:
          AuthenticationError — auth_identities not found or REVOKED (→ 401)
          InternalConsistencyError — auth mapping points to absent account (→ 500)
          AuthorizationError — account SUSPENDED/DISABLED/CLOSED (→ 403)
        """
        db = self._db
        auth_ref = db.collection("auth_identities").document(identity_key)
        auth_snap = auth_ref.get()
        if not auth_snap.exists:
            raise AuthenticationError(
                "auth identity not found; call CREATE_ACCOUNT first"
            )
        auth = auth_snap.to_dict()
        if auth.get("auth_identity_state") == AuthIdentityState.REVOKED:
            raise AuthenticationError("auth identity revoked")

        account_id = auth["account_id"]
        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError(
                "auth_identities mapping points to non-existent account"
            )
        acct = acct_snap.to_dict()
        state = acct.get("account_state")

        if state in (AccountState.SUSPENDED, AccountState.DISABLED, AccountState.CLOSED):
            raise AuthorizationError(
                f"account state is {state}; mutation denied",
                internal_code="ACCOUNT_NOT_ACTIVE",
            )

        return account_id, state
