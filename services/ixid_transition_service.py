"""
IX ID Claim Transition Service
================================
Single authority for all verification_claim lifecycle transitions.

Implements the schema defined in:
  implicitex/docs/architecture/ixid-firestore-schema-v0.1.md §2–§3

No other module may write to verification_claims or their events subcollection.
All transitions must pass through execute_transition().

Enforcement properties:
  - Immutable field protection: claim evidentiary fields are never modified
  - Legal transition guard: only state-machine-defined transitions are accepted
  - State version precondition: concurrent modifications are detected via state_version
  - Atomic writes: claim update + event creation in a single Firestore transaction
  - Idempotent replay: transition_operation_id prevents duplicate events on retry
"""

import hashlib
import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from enum import Enum

from google.cloud import firestore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Enums
# ---------------------------------------------------------------------------


class ClaimStatus(str, Enum):
    ACTIVE = "ACTIVE"
    RECHECK_REQUIRED = "RECHECK_REQUIRED"
    EXPIRED = "EXPIRED"
    SUPERSEDED = "SUPERSEDED"
    REVOKED = "REVOKED"


class TriggerType(str, Enum):
    IX_RECHECK = "IX_RECHECK"
    IX_SCHEDULED = "IX_SCHEDULED"
    IX_INCIDENT = "IX_INCIDENT"
    IX_RENEWAL = "IX_RENEWAL"
    IX_ADMIN = "IX_ADMIN"
    IX_CONTROLLER_REQUEST = "IX_CONTROLLER_REQUEST"


# ---------------------------------------------------------------------------
# Legal transitions
# Terminal states (SUPERSEDED, REVOKED) have no outbound transitions.
# ---------------------------------------------------------------------------

LEGAL_TRANSITIONS: dict[ClaimStatus, set[ClaimStatus]] = {
    ClaimStatus.ACTIVE: {
        ClaimStatus.RECHECK_REQUIRED,
        ClaimStatus.EXPIRED,
        ClaimStatus.SUPERSEDED,
        ClaimStatus.REVOKED,
    },
    ClaimStatus.RECHECK_REQUIRED: {
        ClaimStatus.ACTIVE,
        ClaimStatus.EXPIRED,
        ClaimStatus.SUPERSEDED,  # renewal permitted during grace period
    },
    ClaimStatus.EXPIRED: set(),  # terminal: renewal creates a new claim
    ClaimStatus.SUPERSEDED: set(),  # terminal
    ClaimStatus.REVOKED: set(),  # terminal
}

# ---------------------------------------------------------------------------
# Immutable fields — never modified after claim creation
# ---------------------------------------------------------------------------

IMMUTABLE_CLAIM_FIELDS = frozenset(
    {
        "claim_id",
        "claim_type",
        "subject",
        "evidence_type",
        "evidence_ref",
        "verified_at",
        "expires_at",
        "verification_policy_version",
        "assurance_level",
        "verifier",
        "supersedes",
        "created_at",
    }
)

# ---------------------------------------------------------------------------
# Data classes
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class TransitionRequest:
    """Describes a single requested claim lifecycle transition."""

    ix_id: str
    claim_id: str
    from_status: ClaimStatus
    from_version: int
    to_status: ClaimStatus
    trigger_type: TriggerType
    trigger_ref_id: str  # stable ID for the triggering event; see schema §3.2
    reason_code: str
    operator_uid: str | None = None
    # Lifecycle timestamp updates (only the fields relevant to this transition)
    recheck_required_at: datetime | None = None
    grace_expires_at: datetime | None = None
    expired_at: datetime | None = None
    superseded_by: str | None = None
    revocation_reason: str | None = None
    last_rechecked_at: datetime | None = None


@dataclass(frozen=True)
class TransitionResult:
    idempotent: bool  # True if this operation had already committed
    claim_id: str
    from_status: ClaimStatus
    to_status: ClaimStatus
    from_version: int
    to_version: int
    transition_operation_id: str


# ---------------------------------------------------------------------------
# Operation ID
# ---------------------------------------------------------------------------


def build_operation_id(req: TransitionRequest) -> str:
    """
    Deterministic operation ID derived from stable, unique inputs.

    Two retries of the same logical operation produce the same ID.
    Two genuinely separate trigger events produce different IDs.

    Role of each input:
      trigger_ref_id  — distinguishes one logical operation from another.
                        Two independent scheduler runs that both see the same claim
                        at the same version must have different trigger_ref_ids.
      from_version    — binds this operation to the state it expected to act upon.
                        A retry that finds from_version unchanged re-uses the same
                        operation ID. A new operation on a different version produces
                        a different ID even with the same trigger source.
    """
    raw = "|".join(
        [
            req.claim_id,
            req.from_status.value,
            str(req.from_version),
            req.to_status.value,
            req.trigger_type.value,
            req.trigger_ref_id,
        ]
    )
    return hashlib.sha256(raw.encode()).hexdigest()


# ---------------------------------------------------------------------------
# Core transition executor
# ---------------------------------------------------------------------------


def execute_transition(
    db: firestore.Client,
    req: TransitionRequest,
) -> TransitionResult:
    """
    Execute a claim lifecycle transition atomically.

    Guarantees:
      - Idempotent: safe to call multiple times with the same TransitionRequest
      - Atomic: claim document update and event creation commit together or not at all
      - Immutable field protection: raises if any immutable field would be modified
      - Legal transition guard: raises if transition is not in LEGAL_TRANSITIONS
      - State version precondition: raises if claim.state_version != req.from_version
        (indicates concurrent modification; caller should re-read and re-evaluate)
    """
    operation_id = build_operation_id(req)

    claim_ref = (
        db.collection("ix_ids")
        .document(req.ix_id)
        .collection("verification_claims")
        .document(req.claim_id)
    )
    event_ref = claim_ref.collection("events").document(operation_id)

    transaction = db.transaction()

    @firestore.transactional
    def _run(transaction: firestore.Transaction) -> TransitionResult:
        # ── Step 1: Idempotency check ────────────────────────────────────────
        event_snap = event_ref.get(transaction=transaction)
        if event_snap.exists:
            ev = event_snap.to_dict()
            _verify_event_matches_request(ev, req, operation_id)
            logger.info(
                "Transition already committed (idempotent replay): %s", operation_id
            )
            return TransitionResult(
                idempotent=True,
                claim_id=req.claim_id,
                from_status=ClaimStatus(ev["from_status"]),
                to_status=ClaimStatus(ev["to_status"]),
                from_version=ev["from_version"],
                to_version=ev["to_version"],
                transition_operation_id=operation_id,
            )

        # ── Step 2: Read current claim ───────────────────────────────────────
        claim_snap = claim_ref.get(transaction=transaction)
        if not claim_snap.exists:
            raise ClaimNotFoundError(req.claim_id)

        claim = claim_snap.to_dict()

        # ── Step 3: State version precondition ──────────────────────────────
        actual_version = claim.get("state_version")
        if actual_version != req.from_version:
            raise VersionConflictError(
                claim_id=req.claim_id,
                expected=req.from_version,
                actual=actual_version,
            )

        # ── Step 4: Confirm current status matches expected from_status ──────
        actual_status = ClaimStatus(claim["status"])
        if actual_status != req.from_status:
            raise StatusMismatchError(
                claim_id=req.claim_id,
                expected=req.from_status,
                actual=actual_status,
            )

        # ── Step 5: Legal transition guard ───────────────────────────────────
        allowed = LEGAL_TRANSITIONS.get(req.from_status, set())
        if req.to_status not in allowed:
            raise IllegalTransitionError(
                claim_id=req.claim_id,
                from_status=req.from_status,
                to_status=req.to_status,
            )

        # ── Step 6: Immutable field protection ───────────────────────────────
        # No lifecycle update dict should touch immutable fields.
        # This guard confirms it programmatically.
        lifecycle_updates = _build_lifecycle_updates(req)
        illegal_mutations = IMMUTABLE_CLAIM_FIELDS & lifecycle_updates.keys()
        if illegal_mutations:
            raise ImmutableFieldViolationError(req.claim_id, illegal_mutations)

        # ── Step 7: Construct and write event + claim update atomically ───────
        to_version = req.from_version + 1
        now = datetime.now(timezone.utc)

        event_doc = {
            "event_id": operation_id,
            "claim_id": req.claim_id,
            "transition_operation_id": operation_id,
            "from_status": req.from_status.value,
            "to_status": req.to_status.value,
            "from_version": req.from_version,
            "to_version": to_version,
            "occurred_at": now,
            "reason_code": req.reason_code,
            "triggered_by": req.trigger_type.value,
            "operator_uid": req.operator_uid,
            "policy_version": claim.get("verification_policy_version"),
        }

        claim_update = {
            "status": req.to_status.value,
            "state_version": to_version,
            **lifecycle_updates,
        }

        transaction.set(event_ref, event_doc)
        transaction.update(claim_ref, claim_update)

        return TransitionResult(
            idempotent=False,
            claim_id=req.claim_id,
            from_status=req.from_status,
            to_status=req.to_status,
            from_version=req.from_version,
            to_version=to_version,
            transition_operation_id=operation_id,
        )

    return _run(transaction)


# ---------------------------------------------------------------------------
# Claim creation
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class ClaimRecord:
    """All immutable fields for a new verification claim."""

    ix_id: str
    claim_id: str
    claim_type: str  # PAYMENT_ROUTE | DOMAIN | BUSINESS_IDENTITY
    subject: str  # wallet address, domain, or org name
    evidence_type: str
    evidence_ref: str
    verified_at: datetime
    expires_at: datetime | None
    verification_policy_version: str
    assurance_level: str
    verifier: str
    supersedes: str | None  # claim_id of prior claim this one replaces


def create_claim(db: firestore.Client, record: ClaimRecord) -> None:
    """
    Create a new verification claim document and its immutable CLAIM_CREATED event
    in a single atomic transaction.

    This is the only function that may write a new claim document. It guarantees:
      - The claim document and the CLAIM_CREATED event are always written together
      - The CLAIM_CREATED event contains all immutable facts needed for evidence
        reconstruction if the materialized claim document is ever destroyed
      - state_version starts at 0

    The CLAIM_CREATED event is stored at events/CREATED so it sorts before any
    transition events (which use hash-derived document IDs) when ordered by
    to_version: 0 is always the creation anchor.
    """
    now = datetime.now(timezone.utc)

    claim_ref = (
        db.collection("ix_ids")
        .document(record.ix_id)
        .collection("verification_claims")
        .document(record.claim_id)
    )
    created_event_ref = claim_ref.collection("events").document(
        f"{record.claim_id}_CREATED"
    )

    claim_doc = {
        # Immutable
        "claim_id": record.claim_id,
        "claim_type": record.claim_type,
        "subject": record.subject,
        "evidence_type": record.evidence_type,
        "evidence_ref": record.evidence_ref,
        "verified_at": record.verified_at,
        "expires_at": record.expires_at,
        "verification_policy_version": record.verification_policy_version,
        "assurance_level": record.assurance_level,
        "verifier": record.verifier,
        "supersedes": record.supersedes,
        "created_at": now,
        # Lifecycle — initial values
        "status": ClaimStatus.ACTIVE.value,
        "state_version": 0,
        "last_rechecked_at": now,
        "recheck_required_at": None,
        "grace_expires_at": None,
        "expired_at": None,
        "superseded_by": None,
        "revocation_reason": None,
    }

    # CLAIM_CREATED event — contains every immutable field so the claim can be
    # fully reconstructed from events alone after the materialized document is gone.
    created_event_doc = {
        "event_type": "CLAIM_CREATED",
        "claim_id": record.claim_id,
        "claim_type": record.claim_type,
        "subject": record.subject,
        "evidence_type": record.evidence_type,
        "evidence_ref": record.evidence_ref,
        "verified_at": record.verified_at,
        "expires_at": record.expires_at,
        "verification_policy_version": record.verification_policy_version,
        "assurance_level": record.assurance_level,
        "verifier": record.verifier,
        "supersedes": record.supersedes,
        "created_at": now,
        "initial_status": ClaimStatus.ACTIVE.value,
        "initial_state_version": 0,
        # Not a lifecycle transition, so no from_version/to_version.
        # to_version=0 is implicit: this event establishes version 0.
    }

    transaction = db.transaction()

    @firestore.transactional
    def _create(txn: firestore.Transaction) -> None:
        if claim_ref.get(transaction=txn).exists:
            raise ClaimAlreadyExistsError(record.claim_id)
        txn.set(claim_ref, claim_doc)
        txn.set(created_event_ref, created_event_doc)

    _create(transaction)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _build_lifecycle_updates(req: TransitionRequest) -> dict[str, object]:
    """Build the mutable field updates for this transition. Only set fields present in the request."""
    updates: dict[str, object] = {}
    if req.recheck_required_at is not None:
        updates["recheck_required_at"] = req.recheck_required_at
    if req.grace_expires_at is not None:
        updates["grace_expires_at"] = req.grace_expires_at
    if req.expired_at is not None:
        updates["expired_at"] = req.expired_at
    if req.superseded_by is not None:
        updates["superseded_by"] = req.superseded_by
    if req.revocation_reason is not None:
        updates["revocation_reason"] = req.revocation_reason
    if req.last_rechecked_at is not None:
        updates["last_rechecked_at"] = req.last_rechecked_at
    # Grace period cleanup: if transitioning out of RECHECK_REQUIRED back to ACTIVE,
    # clear the grace fields.
    if (
        req.from_status == ClaimStatus.RECHECK_REQUIRED
        and req.to_status == ClaimStatus.ACTIVE
    ):
        updates.setdefault("recheck_required_at", None)
        updates.setdefault("grace_expires_at", None)
    return updates


def _verify_event_matches_request(
    ev: dict,
    req: TransitionRequest,
    operation_id: str,
) -> None:
    """
    Confirm an existing event record describes the same logical operation.
    If it does not, the operation_id construction has a collision or a bug.
    """
    mismatches = []
    if ev.get("claim_id") != req.claim_id:
        mismatches.append(f"claim_id: stored={ev.get('claim_id')} req={req.claim_id}")
    if ev.get("from_status") != req.from_status.value:
        mismatches.append(
            f"from_status: stored={ev.get('from_status')} req={req.from_status.value}"
        )
    if ev.get("to_status") != req.to_status.value:
        mismatches.append(
            f"to_status: stored={ev.get('to_status')} req={req.to_status.value}"
        )
    if ev.get("from_version") != req.from_version:
        mismatches.append(
            f"from_version: stored={ev.get('from_version')} req={req.from_version}"
        )
    if mismatches:
        raise OperationIdCollisionError(operation_id, mismatches)


# ---------------------------------------------------------------------------
# Exceptions
# ---------------------------------------------------------------------------


class TransitionError(Exception):
    """Base class for all transition failures."""


class ClaimNotFoundError(TransitionError):
    def __init__(self, claim_id: str):
        super().__init__(f"Claim not found: {claim_id}")
        self.claim_id = claim_id


class ClaimAlreadyExistsError(TransitionError):
    def __init__(self, claim_id: str):
        super().__init__(f"Claim already exists: {claim_id}")
        self.claim_id = claim_id


class VersionConflictError(TransitionError):
    """
    Raised when claim.state_version != expected from_version.
    Indicates a concurrent modification. Caller should re-read the claim
    and re-evaluate whether the transition is still appropriate.
    """

    def __init__(self, claim_id: str, expected: int, actual: int):
        super().__init__(
            f"Version conflict on {claim_id}: expected state_version={expected}, "
            f"actual={actual}. Re-read claim and re-evaluate."
        )
        self.claim_id = claim_id
        self.expected = expected
        self.actual = actual


class StatusMismatchError(TransitionError):
    def __init__(self, claim_id: str, expected: ClaimStatus, actual: ClaimStatus):
        super().__init__(
            f"Status mismatch on {claim_id}: expected {expected.value}, actual {actual.value}"
        )


class IllegalTransitionError(TransitionError):
    def __init__(self, claim_id: str, from_status: ClaimStatus, to_status: ClaimStatus):
        super().__init__(
            f"Illegal transition on {claim_id}: {from_status.value} → {to_status.value}"
        )
        self.claim_id = claim_id
        self.from_status = from_status
        self.to_status = to_status


class ImmutableFieldViolationError(TransitionError):
    def __init__(self, claim_id: str, fields: frozenset):
        super().__init__(
            f"Attempted to modify immutable fields on {claim_id}: {sorted(fields)}"
        )
        self.claim_id = claim_id
        self.fields = fields


class OperationIdCollisionError(TransitionError):
    """
    Raised when an existing event document has the same transition_operation_id
    but describes a different logical operation. Indicates an ID construction bug.
    """

    def __init__(self, operation_id: str, mismatches: list[str]):
        super().__init__(f"Operation ID collision on {operation_id}: {mismatches}")
        self.operation_id = operation_id
        self.mismatches = mismatches
