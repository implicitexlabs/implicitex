// IX ID action handler — Slice F
// This placeholder is replaced by the /auth/action handler.
// See M2 contract §1.6 (ixid-onboarding-v0.1.md).
//
// Security invariants enforced by the real handler:
//   - Mode allowlist: verifyEmail and resetPassword only.
//   - oobCode presence check: fail closed if absent or empty.
//   - continueUrl allowlist: https://app.ixid.me/register only.
//   - No third-party resources.
//   - No secret values logged.
