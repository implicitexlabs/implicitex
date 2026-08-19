"""
IX ID Public Identity Presentation Kernel v0.1
===============================================
Pure, deterministic derivation of what IX may truthfully present to a human
about an identity at a specific instant in time.

Governing invariant
-------------------
Same facts + same policy + same resolver snapshot + same evaluation time
= same public presentation.

No Date.now(). No Firestore access. No network calls. No mutation.
This function is a pure transformation of its inputs.

Evaluation-time authority
-------------------------
``expires_at`` is the authoritative time boundary for public trust validity.
The materialized ``status`` field in Firestore is the durable lifecycle
projection of that fact, not the source of it.

Concretely: a claim with status=ACTIVE whose expires_at is already in the
past MUST NOT be presented as currently verified. The scheduler-driven
EXPIRED transition will catch up; the presentation kernel must not wait for it.

BUSINESS_IDENTITY absence
--------------------------
Absence of a BUSINESS_IDENTITY claim must not degrade or inflate DOMAIN
semantics. "Official Website Verified" means exactly that and nothing more.

Frozen scope
------------
This module covers DOMAIN claim presentation only.
BUSINESS_IDENTITY and PAYMENT_ROUTE presentation are deferred to future
vertical slices and must be added here without modifying existing DOMAIN logic.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum

# ---------------------------------------------------------------------------
# Domain presentation status vocabulary
# ---------------------------------------------------------------------------


class DomainPresentationStatus(str, Enum):
    """
    Exhaustive set of displayable states for a DOMAIN claim.

    VERIFIED        — claim is ACTIVE or RECHECK_REQUIRED and evaluatedAt < expires_at
    RECHECK_PENDING — claim is RECHECK_REQUIRED and evaluatedAt < expires_at
                      (sub-state of VERIFIED: previously confirmed, recheck in progress)
    EXPIRED         — evaluatedAt >= expires_at, or materialized status is EXPIRED
    NOT_CURRENT     — claim was SUPERSEDED or REVOKED; a newer claim or admin action
                      has replaced or withdrawn this verification
    NONE            — no DOMAIN claim exists for this ix_id
    """

    VERIFIED = "VERIFIED"
    RECHECK_PENDING = "RECHECK_PENDING"
    EXPIRED = "EXPIRED"
    NOT_CURRENT = "NOT_CURRENT"
    NONE = "NONE"


# ---------------------------------------------------------------------------
# Input types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DomainClaimFacts:
    """
    Immutable facts drawn from a single DOMAIN verification claim document.
    The caller is responsible for selecting the correct (most recent active)
    claim; the kernel does not query Firestore.

    status        — materialized lifecycle status string (matches ClaimStatus values)
    expires_at    — hard expiry boundary; None only for legacy claims without expiry
    verified_at   — timestamp of original verification (used for display only)
    subject       — the domain string being verified (e.g. "implicitex.com")
    """

    status: str
    expires_at: datetime | None
    verified_at: datetime
    subject: str


@dataclass(frozen=True)
class PublicIdentityFacts:
    """
    All identity facts for a given ix_id at a point in time.
    Extend with additional claim types as future vertical slices are built.

    domain        — None if no DOMAIN claim exists; otherwise the most recent claim facts
    """

    domain: DomainClaimFacts | None = None


@dataclass(frozen=True)
class PresentationPolicy:
    """
    Versioned policy rules that govern derivation.
    A policy change (new version) may alter display copy or derivation logic
    without changing the underlying facts.
    """

    policy_version: str = "v1"


@dataclass(frozen=True)
class ResolverSnapshotRef:
    """
    Opaque reference to the DNS resolver snapshot used during verification.
    Stored with the presentation result for auditability; not used in derivation.
    """

    snapshot_id: str | None = None


@dataclass(frozen=True)
class EvaluationContext:
    """
    The two-part evaluation stamp that makes derivation deterministic.

    evaluated_at  — the instant at which this derivation is performed;
                    must be supplied by the caller, never sourced from
                    datetime.now() inside the kernel
    snapshot      — resolver snapshot reference (pass-through to output)
    """

    evaluated_at: datetime
    snapshot: ResolverSnapshotRef = field(default_factory=ResolverSnapshotRef)


# ---------------------------------------------------------------------------
# Output types
# ---------------------------------------------------------------------------


@dataclass(frozen=True)
class DomainPresentationView:
    """
    The resolved presentation of a DOMAIN claim at evaluation time.

    presentation_status  — what IX may truthfully show
    display_label        — short human-readable label suitable for UI display;
                           None when status is NONE
    verified_since       — original verification timestamp; None when no
                           current verification exists
    subject              — the verified domain; None when status is NONE
    """

    presentation_status: DomainPresentationStatus
    display_label: str | None
    verified_since: datetime | None
    subject: str | None


@dataclass(frozen=True)
class PublicIdentityView:
    """
    The complete deterministic public identity view for a single ix_id.

    All fields are derived solely from their inputs. This dataclass is
    suitable for serialization to an API response or UI presentation layer.
    """

    domain: DomainPresentationView
    evaluated_at: datetime
    snapshot: ResolverSnapshotRef
    policy_version: str


# ---------------------------------------------------------------------------
# Display copy — versioned alongside PresentationPolicy
# ---------------------------------------------------------------------------

_DOMAIN_LABELS: dict[DomainPresentationStatus, str | None] = {
    DomainPresentationStatus.VERIFIED: "Official Website Verified",
    DomainPresentationStatus.RECHECK_PENDING: "Domain Verification — Recheck Pending",
    DomainPresentationStatus.EXPIRED: "Domain Verification Expired",
    DomainPresentationStatus.NOT_CURRENT: "Domain Verification Not Current",
    DomainPresentationStatus.NONE: None,
}


# ---------------------------------------------------------------------------
# Domain derivation (private)
# ---------------------------------------------------------------------------


def _derive_domain_view(
    facts: DomainClaimFacts | None,
    evaluated_at: datetime,
) -> DomainPresentationView:
    """
    Derive the DomainPresentationView for a single DOMAIN claim.

    Priority order:
    1. No claim → NONE
    2. Terminal status (SUPERSEDED, REVOKED) → NOT_CURRENT regardless of time
    3. Materialized EXPIRED status → EXPIRED
    4. evaluatedAt >= expires_at → EXPIRED (time gate; overrides ACTIVE/RECHECK_REQUIRED)
    5. RECHECK_REQUIRED + evaluatedAt < expires_at → RECHECK_PENDING
    6. ACTIVE + evaluatedAt < expires_at → VERIFIED
    """
    if facts is None:
        return DomainPresentationView(
            presentation_status=DomainPresentationStatus.NONE,
            display_label=_DOMAIN_LABELS[DomainPresentationStatus.NONE],
            verified_since=None,
            subject=None,
        )

    status = facts.status

    # Terminal states — not time-dependent
    if status in ("SUPERSEDED", "REVOKED"):
        ps = DomainPresentationStatus.NOT_CURRENT
        return DomainPresentationView(
            presentation_status=ps,
            display_label=_DOMAIN_LABELS[ps],
            verified_since=None,
            subject=facts.subject,
        )

    # Materialized expiry
    if status == "EXPIRED":
        ps = DomainPresentationStatus.EXPIRED
        return DomainPresentationView(
            presentation_status=ps,
            display_label=_DOMAIN_LABELS[ps],
            verified_since=None,
            subject=facts.subject,
        )

    # Time gate — evaluated_at >= expires_at overrides ACTIVE or RECHECK_REQUIRED.
    # This is the load-bearing invariant: expires_at is the trust boundary,
    # not the materialized status.
    if facts.expires_at is not None and evaluated_at >= facts.expires_at:
        ps = DomainPresentationStatus.EXPIRED
        return DomainPresentationView(
            presentation_status=ps,
            display_label=_DOMAIN_LABELS[ps],
            verified_since=None,
            subject=facts.subject,
        )

    # Active states within the validity window
    if status == "RECHECK_REQUIRED":
        ps = DomainPresentationStatus.RECHECK_PENDING
        return DomainPresentationView(
            presentation_status=ps,
            display_label=_DOMAIN_LABELS[ps],
            verified_since=facts.verified_at,
            subject=facts.subject,
        )

    # status == "ACTIVE" (and optionally expires_at is None — legacy)
    ps = DomainPresentationStatus.VERIFIED
    return DomainPresentationView(
        presentation_status=ps,
        display_label=_DOMAIN_LABELS[ps],
        verified_since=facts.verified_at,
        subject=facts.subject,
    )


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def derive_public_identity_view(
    facts: PublicIdentityFacts,
    policy: PresentationPolicy,
    evaluation: EvaluationContext,
) -> PublicIdentityView:
    """
    Derive the complete public identity view for an ix_id.

    Pure function: no I/O, no clock access, no mutation.

    Governing invariant:
        Same facts + same policy + same evaluation = same output.

    Parameters
    ----------
    facts:
        All identity claim facts for the ix_id at the moment of lookup.
    policy:
        The versioned presentation policy to apply.
    evaluation:
        The evaluation timestamp and resolver snapshot reference. The caller
        supplies evaluated_at; the kernel never reads the system clock.

    Raises
    ------
    ValueError
        If any datetime consumed by the kernel is timezone-naive. All temporal
        inputs must be timezone-aware. The kernel rejects naive datetimes
        explicitly rather than allowing an incidental TypeError to surface from
        inside a comparison.

        Validated fields:
          evaluation.evaluated_at
          facts.domain.expires_at  (if domain claim present and expires_at not None)
          facts.domain.verified_at (if domain claim present)
    """
    if evaluation.evaluated_at.tzinfo is None:
        raise ValueError(
            "evaluation.evaluated_at must be timezone-aware; "
            f"got naive datetime: {evaluation.evaluated_at!r}"
        )

    if facts.domain is not None:
        d = facts.domain
        if d.expires_at is not None and d.expires_at.tzinfo is None:
            raise ValueError(
                "facts.domain.expires_at must be timezone-aware; "
                f"got naive datetime: {d.expires_at!r}"
            )
        if d.verified_at.tzinfo is None:
            raise ValueError(
                "facts.domain.verified_at must be timezone-aware; "
                f"got naive datetime: {d.verified_at!r}"
            )

    domain_view = _derive_domain_view(facts.domain, evaluation.evaluated_at)

    return PublicIdentityView(
        domain=domain_view,
        evaluated_at=evaluation.evaluated_at,
        snapshot=evaluation.snapshot,
        policy_version=policy.policy_version,
    )
