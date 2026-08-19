"""
IX ID Public Identity Presentation Kernel — unit tests.

Pure function: no Firestore emulator, no network, no clock.
All inputs are explicit; all outputs are deterministic.

Test structure mirrors the DOMAIN presentation matrix:

    status=ACTIVE + evaluatedAt < expires_at       → VERIFIED
    status=RECHECK_REQUIRED + evaluatedAt < expiry → RECHECK_PENDING
    status=ACTIVE/RECHECK_REQUIRED + evaluatedAt >= expiry → EXPIRED  (load-bearing)
    status=EXPIRED (materialized)                  → EXPIRED
    status=SUPERSEDED                              → NOT_CURRENT
    status=REVOKED                                 → NOT_CURRENT
    no DOMAIN claim                                → NONE

Key invariant under test:
    expires_at is the authoritative trust boundary.
    status=ACTIVE with evaluatedAt >= expires_at MUST NOT produce VERIFIED.
"""

from datetime import datetime, timezone

import pytest

from ixid_presentation_kernel import (
    DomainClaimFacts,
    DomainPresentationStatus,
    EvaluationContext,
    PresentationPolicy,
    PublicIdentityFacts,
    PublicIdentityView,
    ResolverSnapshotRef,
    derive_public_identity_view,
)

# ---------------------------------------------------------------------------
# Shared fixtures
# ---------------------------------------------------------------------------

_VERIFIED_AT = datetime(2026, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
_EXPIRES_AT = datetime(2026, 8, 18, 10, 0, 0, tzinfo=timezone.utc)
_DOMAIN = "implicitex.com"
_POLICY = PresentationPolicy(policy_version="v1")
_SNAPSHOT = ResolverSnapshotRef(snapshot_id="snap-abc123")


def _eval(evaluated_at: datetime) -> EvaluationContext:
    return EvaluationContext(evaluated_at=evaluated_at, snapshot=_SNAPSHOT)


def _active_facts(
    *,
    status: str = "ACTIVE",
    expires_at: datetime | None = _EXPIRES_AT,
    verified_at: datetime = _VERIFIED_AT,
    subject: str = _DOMAIN,
) -> PublicIdentityFacts:
    return PublicIdentityFacts(
        domain=DomainClaimFacts(
            status=status,
            expires_at=expires_at,
            verified_at=verified_at,
            subject=subject,
        )
    )


def _view(status: str, expires_at: datetime | None = _EXPIRES_AT) -> PublicIdentityView:
    """Helper: derive a view with a single ACTIVE-ish fact at evaluatedAt one hour before expiry."""
    before_expiry = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
    return derive_public_identity_view(
        _active_facts(status=status, expires_at=expires_at),
        _POLICY,
        _eval(before_expiry),
    )


# ---------------------------------------------------------------------------
# Load-bearing invariant: expires_at is the trust gate
# ---------------------------------------------------------------------------


class TestExpiresAtIsTrustBoundary:
    """
    The primary contract this kernel exists to enforce.
    status=ACTIVE with evaluatedAt >= expires_at must never produce VERIFIED.
    """

    def test_active_status_after_expiry_is_expired(self):
        """
        The canonical load-bearing test.
        Facts: status=ACTIVE, expires_at=2026-08-18T10:00:00Z
        Eval:  evaluatedAt=2026-08-18T10:00:01Z  (one second past expiry)
        Expected: EXPIRED — not VERIFIED.
        """
        one_second_past = datetime(2026, 8, 18, 10, 0, 1, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="ACTIVE", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(one_second_past),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.EXPIRED

    def test_active_status_at_exact_expiry_boundary_is_expired(self):
        """
        evaluatedAt == expires_at: the boundary is inclusive on the expired side.
        expires_at has passed; the claim is no longer current.
        """
        at_expiry = _EXPIRES_AT
        result = derive_public_identity_view(
            _active_facts(status="ACTIVE", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(at_expiry),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.EXPIRED

    def test_recheck_required_after_expiry_is_expired(self):
        """RECHECK_REQUIRED with evaluatedAt >= expires_at must not produce RECHECK_PENDING."""
        one_second_past = datetime(2026, 8, 18, 10, 0, 1, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="RECHECK_REQUIRED", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(one_second_past),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.EXPIRED

    def test_active_one_second_before_expiry_is_verified(self):
        """Boundary: one second before expires_at → still VERIFIED."""
        one_second_before = datetime(2026, 8, 18, 9, 59, 59, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="ACTIVE", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(one_second_before),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.VERIFIED

    def test_expired_domain_does_not_surface_verified_since(self):
        """When expired by time gate, verified_since must not appear — it would suggest ongoing validity."""
        one_second_past = datetime(2026, 8, 18, 10, 0, 1, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="ACTIVE", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(one_second_past),
        )
        assert result.domain.verified_since is None


# ---------------------------------------------------------------------------
# VERIFIED state
# ---------------------------------------------------------------------------


class TestVerifiedState:
    def test_active_before_expiry_is_verified(self):
        result = _view("ACTIVE")
        assert result.domain.presentation_status == DomainPresentationStatus.VERIFIED

    def test_verified_label(self):
        result = _view("ACTIVE")
        assert result.domain.display_label == "Official Website Verified"

    def test_verified_since_matches_verified_at(self):
        result = _view("ACTIVE")
        assert result.domain.verified_since == _VERIFIED_AT

    def test_verified_subject_matches_domain(self):
        result = _view("ACTIVE")
        assert result.domain.subject == _DOMAIN

    def test_active_without_expires_at_is_verified(self):
        """Legacy claims may have no expires_at; they should present as VERIFIED."""
        before_expiry = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="ACTIVE", expires_at=None),
            _POLICY,
            _eval(before_expiry),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.VERIFIED


# ---------------------------------------------------------------------------
# RECHECK_PENDING state
# ---------------------------------------------------------------------------


class TestRecheckPendingState:
    def test_recheck_required_before_expiry_is_recheck_pending(self):
        result = _view("RECHECK_REQUIRED")
        assert (
            result.domain.presentation_status
            == DomainPresentationStatus.RECHECK_PENDING
        )

    def test_recheck_pending_label(self):
        result = _view("RECHECK_REQUIRED")
        assert result.domain.display_label == "Domain Verification — Recheck Pending"

    def test_recheck_pending_retains_verified_since(self):
        """RECHECK_PENDING still shows when it was last verified — previously confirmed."""
        result = _view("RECHECK_REQUIRED")
        assert result.domain.verified_since == _VERIFIED_AT

    def test_recheck_pending_retains_subject(self):
        result = _view("RECHECK_REQUIRED")
        assert result.domain.subject == _DOMAIN


# ---------------------------------------------------------------------------
# EXPIRED state (materialized)
# ---------------------------------------------------------------------------


class TestMaterializedExpiredState:
    def test_materialized_expired_is_expired(self):
        result = _view("EXPIRED")
        assert result.domain.presentation_status == DomainPresentationStatus.EXPIRED

    def test_expired_label(self):
        result = _view("EXPIRED")
        assert result.domain.display_label == "Domain Verification Expired"

    def test_materialized_expired_does_not_surface_verified_since(self):
        result = _view("EXPIRED")
        assert result.domain.verified_since is None

    def test_materialized_expired_retains_subject(self):
        """Subject is still the domain — useful for showing which domain expired."""
        result = _view("EXPIRED")
        assert result.domain.subject == _DOMAIN


# ---------------------------------------------------------------------------
# NOT_CURRENT states
# ---------------------------------------------------------------------------


class TestNotCurrentState:
    def test_superseded_is_not_current(self):
        result = _view("SUPERSEDED")
        assert result.domain.presentation_status == DomainPresentationStatus.NOT_CURRENT

    def test_revoked_is_not_current(self):
        result = _view("REVOKED")
        assert result.domain.presentation_status == DomainPresentationStatus.NOT_CURRENT

    def test_not_current_label(self):
        result = _view("SUPERSEDED")
        assert result.domain.display_label == "Domain Verification Not Current"

    def test_not_current_does_not_surface_verified_since(self):
        """Superseded/revoked claims must not show verified_since as though they are current."""
        result = _view("SUPERSEDED")
        assert result.domain.verified_since is None

    def test_superseded_retains_subject(self):
        result = _view("SUPERSEDED")
        assert result.domain.subject == _DOMAIN

    def test_superseded_ignores_expiry_time(self):
        """Terminal state: even before expiry, SUPERSEDED → NOT_CURRENT."""
        well_before = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="SUPERSEDED", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(well_before),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.NOT_CURRENT

    def test_revoked_ignores_expiry_time(self):
        """Terminal state: even before expiry, REVOKED → NOT_CURRENT."""
        well_before = datetime(2025, 1, 1, 0, 0, 0, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            _active_facts(status="REVOKED", expires_at=_EXPIRES_AT),
            _POLICY,
            _eval(well_before),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.NOT_CURRENT


# ---------------------------------------------------------------------------
# NONE state
# ---------------------------------------------------------------------------


class TestNoneState:
    def test_no_domain_claim_is_none(self):
        result = derive_public_identity_view(
            PublicIdentityFacts(domain=None),
            _POLICY,
            _eval(datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.NONE

    def test_none_has_no_label(self):
        result = derive_public_identity_view(
            PublicIdentityFacts(domain=None),
            _POLICY,
            _eval(datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)),
        )
        assert result.domain.display_label is None

    def test_none_has_no_verified_since(self):
        result = derive_public_identity_view(
            PublicIdentityFacts(domain=None),
            _POLICY,
            _eval(datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)),
        )
        assert result.domain.verified_since is None

    def test_none_has_no_subject(self):
        result = derive_public_identity_view(
            PublicIdentityFacts(domain=None),
            _POLICY,
            _eval(datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)),
        )
        assert result.domain.subject is None


# ---------------------------------------------------------------------------
# Output structure invariants
# ---------------------------------------------------------------------------


class TestOutputStructure:
    def test_evaluated_at_passes_through(self):
        t = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
        result = derive_public_identity_view(_active_facts(), _POLICY, _eval(t))
        assert result.evaluated_at == t

    def test_snapshot_passes_through(self):
        result = derive_public_identity_view(
            _active_facts(),
            _POLICY,
            EvaluationContext(
                evaluated_at=datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc),
                snapshot=_SNAPSHOT,
            ),
        )
        assert result.snapshot == _SNAPSHOT

    def test_policy_version_passes_through(self):
        result = _view("ACTIVE")
        assert result.policy_version == "v1"

    def test_same_inputs_same_output(self):
        """Determinism: calling twice with identical inputs produces identical results."""
        facts = _active_facts()
        ctx = _eval(datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc))
        r1 = derive_public_identity_view(facts, _POLICY, ctx)
        r2 = derive_public_identity_view(facts, _POLICY, ctx)
        assert r1 == r2

    def test_different_evaluation_time_produces_different_result_across_boundary(self):
        """Different evaluation time at the expiry boundary produces different status."""
        before = _eval(datetime(2026, 8, 18, 9, 59, 59, tzinfo=timezone.utc))
        after = _eval(datetime(2026, 8, 18, 10, 0, 1, tzinfo=timezone.utc))
        facts = _active_facts(status="ACTIVE")
        r_before = derive_public_identity_view(facts, _POLICY, before)
        r_after = derive_public_identity_view(facts, _POLICY, after)
        assert r_before.domain.presentation_status == DomainPresentationStatus.VERIFIED
        assert r_after.domain.presentation_status == DomainPresentationStatus.EXPIRED


# ---------------------------------------------------------------------------
# Datetime contract: timezone-aware inputs required
# ---------------------------------------------------------------------------


class TestDatetimeContract:
    """
    The kernel must not silently compare timezone-naive and timezone-aware
    datetimes. A naive evaluated_at would produce undefined comparison behavior
    when tested against a timezone-aware expires_at.

    Contract: evaluation.evaluated_at must be timezone-aware.
    Violation raises ValueError with an explicit message.
    """

    def test_naive_evaluated_at_raises_value_error(self):
        """Timezone-naive evaluated_at is rejected before any derivation occurs."""
        naive_dt = datetime(2026, 8, 18, 9, 0, 0)  # noqa: DTZ001 — intentionally naive to test rejection
        assert naive_dt.tzinfo is None
        with pytest.raises(ValueError, match="timezone-aware"):
            derive_public_identity_view(
                _active_facts(),
                _POLICY,
                EvaluationContext(evaluated_at=naive_dt),
            )

    def test_naive_expires_at_raises_value_error(self):
        """Aware evaluated_at + naive expires_at must raise ValueError, not TypeError."""
        naive_expires = datetime(2026, 8, 18, 10, 0, 0)  # noqa: DTZ001 — intentionally naive
        aware_eval = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
        facts = PublicIdentityFacts(
            domain=DomainClaimFacts(
                status="ACTIVE",
                expires_at=naive_expires,
                verified_at=_VERIFIED_AT,
                subject=_DOMAIN,
            )
        )
        with pytest.raises(ValueError, match="timezone-aware"):
            derive_public_identity_view(facts, _POLICY, _eval(aware_eval))

    def test_naive_verified_at_raises_value_error(self):
        """Naive verified_at is rejected even if expires_at is aware."""
        naive_verified = datetime(2026, 1, 1, 0, 0, 0)  # noqa: DTZ001 — intentionally naive
        aware_eval = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
        facts = PublicIdentityFacts(
            domain=DomainClaimFacts(
                status="ACTIVE",
                expires_at=_EXPIRES_AT,
                verified_at=naive_verified,
                subject=_DOMAIN,
            )
        )
        with pytest.raises(ValueError, match="timezone-aware"):
            derive_public_identity_view(facts, _POLICY, _eval(aware_eval))

    def test_aware_evaluated_at_is_accepted(self):
        """Control: a timezone-aware evaluated_at is not rejected."""
        aware_dt = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
        result = derive_public_identity_view(_active_facts(), _POLICY, _eval(aware_dt))
        assert result.evaluated_at == aware_dt


# ---------------------------------------------------------------------------
# BUSINESS_IDENTITY absence does not alter DOMAIN semantics
# ---------------------------------------------------------------------------


class TestBusinessIdentityAbsence:
    """
    Absence of BUSINESS_IDENTITY must not degrade or inflate DOMAIN semantics.
    These tests document the isolation contract; BUSINESS_IDENTITY is not yet built.
    """

    def test_verified_domain_without_business_identity_is_still_verified(self):
        """DOMAIN=VERIFIED stands on its own. No cross-contamination from absent claims."""
        before = datetime(2026, 8, 18, 9, 0, 0, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            PublicIdentityFacts(domain=_active_facts().domain),
            _POLICY,
            _eval(before),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.VERIFIED
        assert result.domain.display_label == "Official Website Verified"

    def test_expired_domain_without_business_identity_is_still_expired(self):
        after_expiry = datetime(2026, 8, 18, 10, 0, 1, tzinfo=timezone.utc)
        result = derive_public_identity_view(
            PublicIdentityFacts(domain=_active_facts().domain),
            _POLICY,
            _eval(after_expiry),
        )
        assert result.domain.presentation_status == DomainPresentationStatus.EXPIRED
