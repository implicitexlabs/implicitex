# Architecture Decision Log

## 2026-03-28 - Desktop Framework Selection

Decision:
- ImplicitEx desktop will be built with Electron.

Context:
- Product remains web-first for initial delivery.
- Desktop is a secondary phase focused on reducing wallet-extension friction and improving transaction UX control.

Status:
- Accepted

Notes:
- Tauri is explicitly out of scope for the current plan.
- Current sequencing remains: web hardening first, Electron wrapper second, deeper device flows after desktop stability.

## 2026-03-28 - Ledger and AuditWalk Sequencing

Decision:
- Ledger hardware wallet integration is approved but gated.
- AuditWalk is approved as a complementary security tool to ImplicitEx.

Context:
- Team will not start Ledger integration until both web presence and Electron desktop software are in place and stable.
- Security augmentation is needed without expanding scope into parallel platform rewrites.

Status:
- Accepted
