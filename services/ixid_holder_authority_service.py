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
import urllib.parse
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


class RateLimitError(HolderAuthorityError):
    """Maps to HTTP 429 Too Many Requests."""

    def __init__(self, message: str = "Rate limit exceeded", retry_after: int = 60):
        super().__init__(message)
        self.retry_after = retry_after


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


@dataclass(frozen=True)
class ProfileResult:
    display_name: str | None
    bio: str | None
    website_url: str | None


@dataclass(frozen=True)
class DomainChallengeResult:
    challenge_id: str
    domain: str
    txt_record: str
    expires_at: datetime


@dataclass(frozen=True)
class DomainVerifyResult:
    verified: bool
    claim_id: str | None
    error_code: str | None


@dataclass(frozen=True)
class DomainStatusResult:
    domain_status: str | None
    domain_subject: str | None
    domain_claim_id: str | None
    domain_expires_at: datetime | None
    pending_challenge_id: str | None
    pending_challenge_domain: str | None
    pending_txt_record: str | None
    pending_challenge_expires_at: datetime | None


# ---------------------------------------------------------------------------
# Payment route constants
# ---------------------------------------------------------------------------

_POLYGON_CHAIN_ID = 137
_POLYGON_USDC_CONTRACT = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"
# Immutable asset binding identifier (asset-route-registry.md polygon-pos-native-usdc-v1).
# Used in the public route response so payers can identify the exact ERC-20 contract
# without inferring it from the symbol. NOT USDC.e (0x2791...).
_POLYGON_USDC_ASSET_BINDING = "polygon-pos-native-usdc-v1"
_WALLET_ADDRESS_RE = re.compile(r"^0x[0-9a-fA-F]{40}$")
_ZERO_ADDRESS = "0x" + "0" * 40
_WALLET_CHALLENGE_TTL_SECONDS = 600  # 10 minutes
# Spec §8.4: minimum 10 route mutations (verify + disable) per account per hour.
_ROUTE_MUTATION_LIMIT_PER_HOUR = 10
# Separate per-account limit for wallet challenge issuance. Challenge issuance
# does not mutate the route (no active_payment_route_* fields change; any
# existing PENDING challenge is merely cancelled). A separate counter prevents
# unbounded challenge record accumulation without coupling issuance quota to the
# route-mutation limit. Same window (1 hour) and same numeric limit for
# consistency with §8.4.
_CHALLENGE_ISSUANCE_LIMIT_PER_HOUR = 10


# ---------------------------------------------------------------------------
# Payment route result types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class WalletChallengeResult:
    challenge_id: str
    ix_id: str
    destination_address: str
    chain_id: int
    challenge_text: str
    expires_at: datetime


@dataclass(frozen=True)
class WalletVerifyResult:
    claim_id: str
    ix_id: str
    destination_address: str
    chain_id: int
    is_replacement: bool


@dataclass(frozen=True)
class PaymentRouteResult:
    ix_id: str | None
    destination_address: str | None
    chain_id: int | None
    # Structured asset identity; None when no route is active.
    # Fields: symbol, contract (exact ERC-20 address), asset_binding_version.
    # The contract field unambiguously identifies native Circle USDC on Polygon,
    # not USDC.e (0x2791bca1f2de4661ed88a30c99a7a9449aa84174).
    asset: dict | None
    # claim_id is the immutable route revision identifier.
    # A payment intent MUST capture claim_id at resolution time. Any replacement
    # produces a new claim_id; the payer can detect a stale binding by comparing
    # its captured claim_id against the current active_payment_route_claim_id.
    # Integer counters are not used; claim_id provides the same guarantee as an
    # opaque monotonically unique revision identifier.
    claim_id: str | None
    routing_suspended: bool


# ---------------------------------------------------------------------------
# Reserved handles (§4.2)
# ---------------------------------------------------------------------------

# ---------------------------------------------------------------------------
# Wallet address validation
# ---------------------------------------------------------------------------


def _validate_wallet_address(address: str) -> str:
    """Validate and normalize (lowercase) an EVM wallet address. Raises ValidationError."""
    if not isinstance(address, str):
        raise ValidationError("destination_address must be a string", code="INVALID_ADDRESS")
    if not _WALLET_ADDRESS_RE.match(address):
        raise ValidationError(
            "destination_address must be a 0x-prefixed 40-hex-character address",
            code="INVALID_ADDRESS",
        )
    normalized = address.lower()
    if normalized == _ZERO_ADDRESS:
        raise ValidationError(
            "destination_address must not be the zero address",
            code="INVALID_ADDRESS",
        )
    return normalized


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
# Profile field limits
# ---------------------------------------------------------------------------

_DISPLAY_NAME_MAX = 100
_BIO_MAX = 500
_WEBSITE_URL_MAX = 2048

_PROFILE_MUTATION_TYPES = {
    "display_name": "DISPLAY_NAME",
    "bio": "BIO",
    "website_url": "WEBSITE_URL",
}

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


def _validate_text_field(value: object, max_len: int, field_name: str) -> str | None:
    """Trim a string field; None or empty string clears it. Raises ValidationError on type or length error."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValidationError(f"{field_name} must be a string", code="PROFILE_VALIDATION_ERROR")
    trimmed = value.strip()
    if trimmed == "":
        return None
    if len(trimmed) > max_len:
        raise ValidationError(
            f"{field_name} must be {max_len} characters or fewer",
            code="PROFILE_VALIDATION_ERROR",
        )
    return trimmed


def _validate_url_field(value: object, field_name: str) -> str | None:
    """Validate and trim a URL field. Accepts http/https only. Empty string clears it."""
    trimmed = _validate_text_field(value, _WEBSITE_URL_MAX, field_name)
    if trimmed is None:
        return None
    try:
        parsed = urllib.parse.urlparse(trimmed)
    except Exception:
        raise ValidationError(f"{field_name} must be a valid URL", code="PROFILE_VALIDATION_ERROR")
    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        raise ValidationError(
            f"{field_name} must be an http or https URL",
            code="PROFILE_VALIDATION_ERROR",
        )
    return trimmed


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


def verify_firebase_id_token(
    token: str, *, require_email_verified: bool = False
) -> tuple[str, str, str]:
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

    require_email_verified (M2 §1.5):
      When True, raises AuthenticationError(internal_code="EMAIL_NOT_VERIFIED")
      if the decoded token's email_verified claim is not True.
      Called with True only for CREATE_ACCOUNT and REGISTER_IX_ID.
      GET /workspace calls this function with the default (False) so that
      a returning user with an established account can always read their workspace.
      The denial reason is emitted as a structured log field only; it is never
      returned to the client and never written to Firestore (§5.5 invariant).
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

    if require_email_verified and decoded.get("email_verified") is not True:
        raise AuthenticationError(
            "Email not verified",
            internal_code="EMAIL_NOT_VERIFIED",
        )

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
# Asset identity helper
# ---------------------------------------------------------------------------


def _polygon_usdc_asset_identity() -> dict:
    """
    Immutable asset binding for native Circle USDC on Polygon (polygon-pos-native-usdc-v1).

    Returns the canonical dict included in public payment-route responses.
    The 'contract' field unambiguously identifies the ERC-20 contract so payers
    do not have to infer it from the symbol. USDC.e (0x2791...) is NOT supported.
    """
    return {
        "symbol": "USDC",
        "contract": _POLYGON_USDC_CONTRACT,
        "asset_binding_version": _POLYGON_USDC_ASSET_BINDING,
    }


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
                        "profile": {
                            "display_name": ix.get("display_name"),
                            "bio": ix.get("bio"),
                            "website_url": ix.get("website_url"),
                        },
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

    # ── UPDATE_PROFILE ───────────────────────────────────────────────────────

    def update_profile(
        self,
        identity_key: str,
        updates: dict,
    ) -> ProfileResult:
        """
        Update profile fields on the owner's IX ID document.

        Only fields present in ``updates`` are modified. Omitted fields
        are left unchanged. An empty string in ``updates`` clears a field.

        Supported fields: display_name, bio, website_url.
        All text fields are trimmed before validation.
        Writes identity_mutations events for every changed field.
        """
        db = self._db

        # Resolve account — ACTIVE only
        account_id, _state = self._resolve_account_for_mutation(identity_key)

        # Look up owned IX ID
        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")
        if not owned_ix_id:
            raise ValidationError(
                "no IX ID registered; claim a handle before editing your profile",
                code="NO_IX_ID",
            )

        # Validate supplied fields
        validated: dict[str, str | None] = {}
        if "display_name" in updates:
            validated["display_name"] = _validate_text_field(
                updates["display_name"], _DISPLAY_NAME_MAX, "display_name"
            )
        if "bio" in updates:
            validated["bio"] = _validate_text_field(updates["bio"], _BIO_MAX, "bio")
        if "website_url" in updates:
            validated["website_url"] = _validate_url_field(updates["website_url"], "website_url")

        # Reject unrecognised fields
        unknown = set(updates.keys()) - set(_PROFILE_MUTATION_TYPES.keys())
        if unknown:
            raise ValidationError(
                f"unrecognised profile field(s): {', '.join(sorted(unknown))}",
                code="PROFILE_VALIDATION_ERROR",
            )

        if not validated:
            # No recognised fields in request — nothing to do
            ix_ref = db.collection("ix_ids").document(owned_ix_id)
            ix_snap = ix_ref.get()
            ix = ix_snap.to_dict() if ix_snap.exists else {}
            return ProfileResult(
                display_name=ix.get("display_name"),
                bio=ix.get("bio"),
                website_url=ix.get("website_url"),
            )

        now = datetime.now(timezone.utc)
        ix_ref = db.collection("ix_ids").document(owned_ix_id)
        mutations_ref = ix_ref.collection("identity_mutations")

        # Build mutation events and field updates
        mutation_docs = []
        field_updates: dict[str, object] = {}
        for field_name, new_val in validated.items():
            event_id = str(uuid.uuid4())
            new_hash = (
                hashlib.sha256(new_val.encode("utf-8")).hexdigest()
                if new_val is not None
                else None
            )
            mutation_docs.append(
                (
                    mutations_ref.document(event_id),
                    {
                        "event_id": event_id,
                        "mutation_type": _PROFILE_MUTATION_TYPES[field_name],
                        "prior_value_ref": None,
                        "new_value_hash": new_hash,
                        "mutated_at": now,
                        "session_event_id": event_id,
                    },
                )
            )
            field_updates[field_name] = new_val

        # Write mutation events + field updates in a transaction
        transaction = db.transaction()

        @firestore.transactional
        def _run(transaction: firestore.Transaction) -> None:  # noqa: WPS430
            for ref, doc in mutation_docs:
                transaction.set(ref, doc)
            transaction.update(ix_ref, field_updates)

        _run(transaction)

        # Read back to return authoritative values
        ix_snap = ix_ref.get()
        ix = ix_snap.to_dict() if ix_snap.exists else {}

        logger.info(
            "UPDATE_PROFILE committed: account_id=%s ix_id=%s fields=%s",
            account_id,
            owned_ix_id,
            list(validated.keys()),
        )

        return ProfileResult(
            display_name=ix.get("display_name"),
            bio=ix.get("bio"),
            website_url=ix.get("website_url"),
        )

    # ── DOMAIN CHALLENGE ─────────────────────────────────────────────────────

    def issue_domain_challenge(
        self,
        identity_key: str,
        domain_input: str,
    ) -> DomainChallengeResult:
        """
        Issue a DNS TXT challenge for domain verification.
        Owner must have a registered IX ID.
        """
        from ixid_domain_verification_service import issue_challenge  # noqa: PLC0415

        db = self._db

        account_id, _state = self._resolve_account_for_mutation(identity_key)

        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")
        if not owned_ix_id:
            raise ValidationError(
                "no IX ID registered; claim a handle before verifying a domain",
                code="NO_IX_ID",
            )

        if not isinstance(domain_input, str) or not domain_input.strip():
            raise ValidationError("domain must be a non-empty string", code="PROFILE_VALIDATION_ERROR")
        domain = domain_input.strip().lower().lstrip("http://").lstrip("https://").rstrip("/")
        if not domain or "." not in domain:
            raise ValidationError("domain must be a valid domain name (e.g. example.com)", code="PROFILE_VALIDATION_ERROR")

        issuance = issue_challenge(db, owned_ix_id, domain, account_id)

        return DomainChallengeResult(
            challenge_id=issuance.challenge_id,
            domain=issuance.domain,
            txt_record=issuance.txt_record_value,
            expires_at=issuance.expires_at,
        )

    # ── DOMAIN VERIFY ────────────────────────────────────────────────────────

    def verify_domain_challenge(
        self,
        identity_key: str,
        challenge_id_input: str,
    ) -> DomainVerifyResult:
        """
        Attempt to verify a DNS TXT challenge. Returns success/failure.
        The challenge must be owned by this account's IX ID.
        """
        from ixid_domain_verification_service import verify_domain  # noqa: PLC0415

        db = self._db

        account_id, _state = self._resolve_account_for_mutation(identity_key)

        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")
        if not owned_ix_id:
            raise ValidationError("no IX ID registered", code="NO_IX_ID")

        if not isinstance(challenge_id_input, str) or not challenge_id_input.strip():
            raise ValidationError("challenge_id must be a non-empty string", code="PROFILE_VALIDATION_ERROR")

        outcome = verify_domain(db, owned_ix_id, challenge_id_input.strip(), account_id)

        return DomainVerifyResult(
            verified=outcome.success,
            claim_id=outcome.claim_id,
            error_code=outcome.error_code,
        )

    # ── DOMAIN STATUS ────────────────────────────────────────────────────────

    def get_domain_status(self, identity_key: str) -> DomainStatusResult:
        """
        Return the current domain verification status and any pending challenge
        for the authenticated owner's IX ID.
        """
        db = self._db

        # Use workspace-style resolution (read-only — no email-verified requirement)
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
            raise InternalConsistencyError("auth mapping points to non-existent account")
        acct = acct_snap.to_dict()
        state = acct.get("account_state")
        if state in (AccountState.DISABLED, AccountState.CLOSED):
            raise AuthorizationError(f"account {state}", internal_code="ACCOUNT_NOT_READABLE")

        owned_ix_id = acct.get("owned_ix_id")
        if not owned_ix_id:
            return DomainStatusResult(
                domain_status=None,
                domain_subject=None,
                domain_claim_id=None,
                domain_expires_at=None,
                pending_challenge_id=None,
                pending_challenge_domain=None,
                pending_txt_record=None,
                pending_challenge_expires_at=None,
            )

        ix_ref = db.collection("ix_ids").document(owned_ix_id)

        # Load domain claims
        claims = list(ix_ref.collection("verification_claims").stream())
        domain_claims = [c for c in claims if c.to_dict().get("claim_type") == "DOMAIN"]

        domain_status = None
        domain_subject = None
        domain_claim_id = None
        domain_expires_at = None

        if domain_claims:
            # Find the active/most-recent non-superseded claim
            non_superseded = [c for c in domain_claims if not c.to_dict().get("superseded_by")]
            candidates = non_superseded if non_superseded else domain_claims
            best = max(candidates, key=lambda c: c.to_dict().get("verified_at", datetime.min.replace(tzinfo=timezone.utc)))
            d = best.to_dict()
            domain_status = d.get("status")
            domain_subject = d.get("subject")
            domain_claim_id = best.id
            domain_expires_at = d.get("expires_at")

        # Load most recent PENDING challenge
        from ixid_domain_verification_service import ChallengeStatus  # noqa: PLC0415
        challenges = list(
            ix_ref.collection("domain_challenges")
            .where("status", "==", ChallengeStatus.PENDING.value)
            .stream()
        )
        pending_challenge_id = None
        pending_challenge_domain = None
        pending_txt_record = None
        pending_challenge_expires_at = None

        if challenges:
            now = datetime.now(timezone.utc)
            # Filter to non-expired (wall-clock)
            valid = [
                c for c in challenges
                if c.to_dict().get("expires_at") is None
                or (
                    isinstance(c.to_dict().get("expires_at"), datetime)
                    and c.to_dict()["expires_at"].replace(tzinfo=timezone.utc)
                    if c.to_dict()["expires_at"].tzinfo is None
                    else c.to_dict()["expires_at"]
                ) > now
            ]
            if valid:
                latest = max(valid, key=lambda c: c.to_dict().get("issued_at", datetime.min.replace(tzinfo=timezone.utc)))
                p = latest.to_dict()
                pending_challenge_id = latest.id
                pending_challenge_domain = p.get("domain")
                pending_txt_record = p.get("txt_record_value")
                pending_challenge_expires_at = p.get("expires_at")

        return DomainStatusResult(
            domain_status=domain_status,
            domain_subject=domain_subject,
            domain_claim_id=domain_claim_id,
            domain_expires_at=domain_expires_at,
            pending_challenge_id=pending_challenge_id,
            pending_challenge_domain=pending_challenge_domain,
            pending_txt_record=pending_txt_record,
            pending_challenge_expires_at=pending_challenge_expires_at,
        )

    # ── ISSUE_WALLET_CHALLENGE ────────────────────────────────────────────────

    def issue_wallet_challenge(
        self,
        identity_key: str,
        destination_address: str,
    ) -> WalletChallengeResult:
        """
        Issue a personal_sign challenge for wallet binding.

        Cancels any existing PENDING wallet_challenges for this ix_id before
        writing the new one. The challenge_text contains everything the holder
        must sign; the service verifies the recovered signer matches
        destination_address in verify_wallet_challenge.
        """
        db = self._db

        account_id, _state = self._resolve_account_for_mutation(identity_key)

        # Enforce challenge issuance rate limit before any Firestore writes.
        # Uses a separate counter from the route-mutation limit so that the
        # full 10/hour mutation budget is preserved even if challenges are
        # issued but not verified.
        self._check_challenge_issuance_rate_limit(account_id)

        # Resolve owned IX ID
        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")
        if not owned_ix_id:
            raise ValidationError(
                "no IX ID registered; claim a handle before setting a payment route",
                code="NO_IX_ID",
            )

        normalized_address = _validate_wallet_address(destination_address)

        # Cancel any existing PENDING challenges for this ix_id
        ix_ref = db.collection("ix_ids").document(owned_ix_id)
        pending_challenges = list(
            ix_ref.collection("wallet_challenges")
            .where("status", "==", "PENDING")
            .stream()
        )
        for c in pending_challenges:
            c.reference.update({"status": "CANCELLED"})

        # Generate challenge
        challenge_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        from datetime import timedelta  # noqa: PLC0415
        expires_at = now + timedelta(seconds=_WALLET_CHALLENGE_TTL_SECONDS)
        issued_at_iso = now.strftime("%Y-%m-%dT%H:%M:%SZ")
        expires_at_iso = expires_at.strftime("%Y-%m-%dT%H:%M:%SZ")

        challenge_text = (
            "IX ID Payment Route Authorization\n"
            "\n"
            "I authorize this wallet as my USDC payment destination on Polygon.\n"
            "\n"
            f"IX ID: {owned_ix_id}\n"
            f"Wallet: {normalized_address}\n"
            f"Network: Polygon (Chain ID: 137)\n"
            f"Asset: USDC (0x3c499c542cef5e3811e1192ce70d8cc03d5c3359)\n"
            f"Challenge: {challenge_id}\n"
            f"Issued: {issued_at_iso}\n"
            f"Expires: {expires_at_iso}\n"
            "\n"
            "This signature proves I control this wallet.\n"
            "It does not transfer funds or grant other permissions."
        )

        ix_ref.collection("wallet_challenges").document(challenge_id).set({
            "challenge_id": challenge_id,
            "ix_id": owned_ix_id,
            "account_id": account_id,
            "destination_address": normalized_address,
            "chain_id": _POLYGON_CHAIN_ID,
            "challenge_text": challenge_text,
            "status": "PENDING",
            "issued_at": now,
            "expires_at": expires_at,
        })

        logger.info(
            "WALLET_CHALLENGE issued: account_id=%s ix_id=%s challenge_id=%s",
            account_id,
            owned_ix_id,
            challenge_id,
        )

        return WalletChallengeResult(
            challenge_id=challenge_id,
            ix_id=owned_ix_id,
            destination_address=normalized_address,
            chain_id=_POLYGON_CHAIN_ID,
            challenge_text=challenge_text,
            expires_at=expires_at,
        )

    # ── VERIFY_WALLET_CHALLENGE ───────────────────────────────────────────────

    def verify_wallet_challenge(
        self,
        identity_key: str,
        challenge_id: str,
        signature: str,
    ) -> WalletVerifyResult:
        """
        Verify a personal_sign signature against a previously issued challenge.

        Atomically:
          - Marks challenge CONSUMED
          - Supersedes any prior PAYMENT_ROUTE claim
          - Writes wallet_binding_events (append-only)
          - Writes new verification_claims/{claim_id}
          - Updates ix_ids root doc with active route pointers
        """
        from eth_account import Account  # noqa: PLC0415
        from eth_account.messages import encode_defunct  # noqa: PLC0415

        db = self._db

        account_id, _state = self._resolve_account_for_mutation(identity_key)

        # Enforce route mutation rate limit (§8.4) before any further reads.
        # Rejection produces zero Firestore writes to authoritative collections.
        self._check_route_mutation_rate_limit(account_id)

        # Resolve owned IX ID
        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")
        if not owned_ix_id:
            raise ValidationError("no IX ID registered", code="NO_IX_ID")

        # Load challenge
        ix_ref = db.collection("ix_ids").document(owned_ix_id)
        challenge_ref = ix_ref.collection("wallet_challenges").document(challenge_id)
        challenge_snap = challenge_ref.get()
        if not challenge_snap.exists:
            raise ValidationError("challenge not found", code="CHALLENGE_NOT_FOUND")

        challenge = challenge_snap.to_dict()

        # Ownership and consistency checks (pre-transaction)
        if challenge.get("account_id") != account_id:
            raise AuthorizationError(
                "challenge belongs to a different account",
                internal_code="CHALLENGE_WRONG_ACCOUNT",
            )
        if challenge.get("ix_id") != owned_ix_id:
            raise InternalConsistencyError(
                "challenge ix_id disagrees with account owned_ix_id"
            )
        if challenge.get("status") != "PENDING":
            raise ValidationError(
                "challenge has already been used or cancelled",
                code="CHALLENGE_ALREADY_USED",
            )

        now = datetime.now(timezone.utc)
        challenge_expires_at = challenge.get("expires_at")
        if challenge_expires_at is not None:
            # Normalize tz-awareness
            if isinstance(challenge_expires_at, datetime) and challenge_expires_at.tzinfo is None:
                challenge_expires_at = challenge_expires_at.replace(tzinfo=timezone.utc)
            if now >= challenge_expires_at:
                raise ValidationError("challenge has expired", code="CHALLENGE_EXPIRED")

        if challenge.get("chain_id") != _POLYGON_CHAIN_ID:
            raise InternalConsistencyError(
                f"challenge chain_id={challenge.get('chain_id')} is not {_POLYGON_CHAIN_ID}"
            )

        # Verify signature
        challenge_text = challenge["challenge_text"]
        normalized_address = challenge["destination_address"]
        message = encode_defunct(text=challenge_text)
        try:
            recovered = Account.recover_message(message, signature=signature)
        except Exception:
            raise ValidationError("Malformed signature", code="INVALID_SIGNATURE")
        if recovered.lower() != normalized_address:
            raise ValidationError(
                "Signature does not match proposed wallet",
                code="WRONG_SIGNER",
            )

        # Atomically commit
        transaction = db.transaction()

        @firestore.transactional
        def _run(txn: firestore.Transaction) -> WalletVerifyResult:  # noqa: WPS430
            # ── ALL READS FIRST (Firestore: no reads after writes) ────────────

            # Re-read challenge inside transaction (TOCTOU guard)
            c_snap = challenge_ref.get(transaction=txn)
            if not c_snap.exists:
                raise ValidationError("challenge not found", code="CHALLENGE_NOT_FOUND")
            c = c_snap.to_dict()
            if c.get("status") != "PENDING":
                raise ValidationError(
                    "challenge has already been used or cancelled",
                    code="CHALLENGE_ALREADY_USED",
                )

            # Re-check expiry
            txn_now = datetime.now(timezone.utc)
            c_expires = c.get("expires_at")
            if c_expires is not None:
                if isinstance(c_expires, datetime) and c_expires.tzinfo is None:
                    c_expires = c_expires.replace(tzinfo=timezone.utc)
                if txn_now >= c_expires:
                    raise ValidationError("challenge has expired", code="CHALLENGE_EXPIRED")

            # Read current route state from ix_ids root (before any writes)
            ix_snap = ix_ref.get(transaction=txn)
            ix_data = ix_snap.to_dict() if ix_snap.exists else {}
            prior_claim_id = ix_data.get("active_payment_route_claim_id")
            prior_address = ix_data.get("active_payment_route_address")

            # ── GENERATE IDs ──────────────────────────────────────────────────

            event_id = str(uuid.uuid4())
            new_claim_id = str(uuid.uuid4())
            commit_now = datetime.now(timezone.utc)

            # ── ALL WRITES ────────────────────────────────────────────────────

            # Mark challenge CONSUMED
            txn.update(challenge_ref, {"status": "CONSUMED"})

            # Supersede prior claim if present
            if prior_claim_id:
                prior_claim_ref = ix_ref.collection("verification_claims").document(prior_claim_id)
                txn.update(prior_claim_ref, {
                    "status": "SUPERSEDED",
                    "superseded_by": new_claim_id,
                })

            # Write wallet_binding_event (append-only)
            event_ref = ix_ref.collection("wallet_binding_events").document(event_id)
            txn.set(event_ref, {
                "event_id": event_id,
                "ix_id": owned_ix_id,
                "account_uid": account_id,
                "wallet_address": normalized_address,
                "network": "polygon",
                "chain_id": _POLYGON_CHAIN_ID,
                "challenge_nonce": challenge_id,
                "challenge_issued_at": c.get("issued_at"),
                "challenge_expires_at": c.get("expires_at"),
                "signature": signature,
                "signature_verified": True,
                "binding_committed_at": commit_now,
                "prior_wallet_address": prior_address,
                "prior_claim_id": prior_claim_id,
                "method": "ETH_SIGN_CHALLENGE",
            })

            # Write new verification_claims entry
            claim_ref = ix_ref.collection("verification_claims").document(new_claim_id)
            txn.set(claim_ref, {
                "claim_id": new_claim_id,
                "claim_type": "PAYMENT_ROUTE",
                "status": "ACTIVE",
                "subject": normalized_address,
                "evidence_type": "ETH_SIGN_CHALLENGE",
                "evidence_ref": event_id,
                "verified_at": commit_now,
                "expires_at": None,
                "supersedes": prior_claim_id,
                "superseded_by": None,
                "state_version": 0,
                "chain_id": _POLYGON_CHAIN_ID,
                "asset_contract": _POLYGON_USDC_CONTRACT,
                "created_at": commit_now,
            })

            # Update ix_ids root doc
            txn.update(ix_ref, {
                "active_payment_route_claim_id": new_claim_id,
                "active_payment_route_address": normalized_address,
                "routing_suspended": False,
            })

            return WalletVerifyResult(
                claim_id=new_claim_id,
                ix_id=owned_ix_id,
                destination_address=normalized_address,
                chain_id=_POLYGON_CHAIN_ID,
                is_replacement=(prior_claim_id is not None),
            )

        result = _run(transaction)

        logger.info(
            "WALLET_VERIFY committed: account_id=%s ix_id=%s claim_id=%s is_replacement=%s",
            account_id,
            owned_ix_id,
            result.claim_id,
            result.is_replacement,
        )

        return result

    # ── GET_PAYMENT_ROUTE ────────────────────────────────────────────────────

    def get_payment_route(self, identity_key: str) -> PaymentRouteResult:
        """
        Return the current payment route for the authenticated holder.

        Uses _resolve_account_for_mutation (ACTIVE only) for consistency with
        other route operations. If the account has no owned IX ID, returns
        a null PaymentRouteResult.
        """
        db = self._db

        account_id, _state = self._resolve_account_for_mutation(identity_key)

        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")

        if not owned_ix_id:
            return PaymentRouteResult(
                ix_id=None,
                destination_address=None,
                chain_id=None,
                asset=None,
                claim_id=None,
                routing_suspended=False,
            )

        ix_ref = db.collection("ix_ids").document(owned_ix_id)
        ix_snap = ix_ref.get()
        if not ix_snap.exists:
            return PaymentRouteResult(
                ix_id=owned_ix_id,
                destination_address=None,
                chain_id=None,
                asset=None,
                claim_id=None,
                routing_suspended=False,
            )

        ix = ix_snap.to_dict()
        active_address = ix.get("active_payment_route_address")
        active_claim_id = ix.get("active_payment_route_claim_id")
        routing_suspended = ix.get("routing_suspended", False)

        return PaymentRouteResult(
            ix_id=owned_ix_id,
            destination_address=active_address,
            chain_id=_POLYGON_CHAIN_ID if active_address else None,
            asset=_polygon_usdc_asset_identity() if active_address else None,
            claim_id=active_claim_id,
            routing_suspended=routing_suspended,
        )

    # ── DISABLE_PAYMENT_ROUTE ─────────────────────────────────────────────────

    def disable_payment_route(self, identity_key: str) -> PaymentRouteResult:
        """
        Revoke the active payment route.

        Sets claim status=REVOKED, clears active route pointers, and sets
        routing_suspended=True on the ix_ids root doc.
        """
        db = self._db

        account_id, _state = self._resolve_account_for_mutation(identity_key)

        # Enforce route mutation rate limit (§8.4).
        self._check_route_mutation_rate_limit(account_id)

        acct_ref = db.collection("accounts").document(account_id)
        acct_snap = acct_ref.get()
        if not acct_snap.exists:
            raise InternalConsistencyError("account document absent after resolution")
        owned_ix_id = acct_snap.to_dict().get("owned_ix_id")
        if not owned_ix_id:
            raise ValidationError("no IX ID registered", code="NO_IX_ID")

        ix_ref = db.collection("ix_ids").document(owned_ix_id)
        ix_snap = ix_ref.get()
        ix_data = ix_snap.to_dict() if ix_snap.exists else {}
        active_claim_id = ix_data.get("active_payment_route_claim_id")

        if not active_claim_id:
            raise ValidationError("no active payment route to disable", code="NO_ACTIVE_ROUTE")

        transaction = db.transaction()

        @firestore.transactional
        def _run(txn: firestore.Transaction) -> None:  # noqa: WPS430
            # Revoke the active claim
            claim_ref = ix_ref.collection("verification_claims").document(active_claim_id)
            txn.update(claim_ref, {"status": "REVOKED"})

            # Clear active route pointers, set routing_suspended
            txn.update(ix_ref, {
                "active_payment_route_claim_id": None,
                "active_payment_route_address": None,
                "routing_suspended": True,
            })

        _run(transaction)

        logger.info(
            "DISABLE_PAYMENT_ROUTE committed: account_id=%s ix_id=%s prior_claim_id=%s",
            account_id,
            owned_ix_id,
            active_claim_id,
        )

        return PaymentRouteResult(
            ix_id=owned_ix_id,
            destination_address=None,
            chain_id=None,
            asset=None,
            claim_id=None,
            routing_suspended=True,
        )

    # ── ROUTE MUTATION RATE LIMIT (§8.4) ─────────────────────────────────────

    def _check_route_mutation_rate_limit(self, account_id: str) -> None:
        """
        Enforce per-account rate limit for route mutations (verify + disable).

        Spec §8.4: at minimum 10 mutations per account per hour.
        Raises RateLimitError with retry_after seconds if the limit is exceeded.

        State is maintained server-side in route_mutation_rate_limits/{account_id}.
        Uses a Firestore transaction so concurrent requests on different Cloud Run
        instances are serialized correctly.
        """
        from datetime import timedelta  # noqa: PLC0415

        db = self._db
        now = datetime.now(timezone.utc)
        limit_ref = db.collection("route_mutation_rate_limits").document(account_id)
        transaction = db.transaction()

        @firestore.transactional
        def _check(txn: firestore.Transaction) -> None:
            snap = limit_ref.get(transaction=txn)
            if snap.exists:
                data = snap.to_dict()
                window_end = data.get("window_end")
                if isinstance(window_end, datetime) and window_end.tzinfo is None:
                    window_end = window_end.replace(tzinfo=timezone.utc)
                if window_end and now < window_end:
                    # Within the existing window
                    count = data.get("count", 0)
                    if count >= _ROUTE_MUTATION_LIMIT_PER_HOUR:
                        retry_after = max(1, int((window_end - now).total_seconds()) + 1)
                        raise RateLimitError(
                            "Route mutation rate limit exceeded",
                            retry_after=retry_after,
                        )
                    txn.update(limit_ref, {"count": count + 1})
                else:
                    # Window expired — start fresh
                    window_end_new = now + timedelta(hours=1)
                    txn.set(limit_ref, {
                        "count": 1,
                        "window_start": now,
                        "window_end": window_end_new,
                    })
            else:
                # First mutation for this account
                window_end_new = now + timedelta(hours=1)
                txn.set(limit_ref, {
                    "count": 1,
                    "window_start": now,
                    "window_end": window_end_new,
                })

        _check(transaction)

    # ── CHALLENGE ISSUANCE RATE LIMIT ─────────────────────────────────────────

    def _check_challenge_issuance_rate_limit(self, account_id: str) -> None:
        """
        Enforce per-account rate limit for wallet challenge issuance.

        Challenge issuance is semantically distinct from route mutation:
        it creates a PENDING record and cancels any prior PENDING challenge,
        but does not change active_payment_route_* fields. A separate counter
        prevents unbounded challenge record accumulation while preserving the
        full 10/hour budget for route mutations (verify + disable).

        Same window (1 hour) and limit as §8.4 route mutations for consistency.
        Raises RateLimitError with retry_after seconds if the limit is exceeded.

        State is maintained in challenge_issuance_rate_limits/{account_id}.
        """
        from datetime import timedelta  # noqa: PLC0415

        db = self._db
        now = datetime.now(timezone.utc)
        limit_ref = db.collection("challenge_issuance_rate_limits").document(account_id)
        transaction = db.transaction()

        @firestore.transactional
        def _check(txn: firestore.Transaction) -> None:
            snap = limit_ref.get(transaction=txn)
            if snap.exists:
                data = snap.to_dict()
                window_end = data.get("window_end")
                if isinstance(window_end, datetime) and window_end.tzinfo is None:
                    window_end = window_end.replace(tzinfo=timezone.utc)
                if window_end and now < window_end:
                    count = data.get("count", 0)
                    if count >= _CHALLENGE_ISSUANCE_LIMIT_PER_HOUR:
                        retry_after = max(1, int((window_end - now).total_seconds()) + 1)
                        raise RateLimitError(
                            "Challenge issuance rate limit exceeded",
                            retry_after=retry_after,
                        )
                    txn.update(limit_ref, {"count": count + 1})
                else:
                    window_end_new = now + timedelta(hours=1)
                    txn.set(limit_ref, {
                        "count": 1,
                        "window_start": now,
                        "window_end": window_end_new,
                    })
            else:
                window_end_new = now + timedelta(hours=1)
                txn.set(limit_ref, {
                    "count": 1,
                    "window_start": now,
                    "window_end": window_end_new,
                })

        _check(transaction)
