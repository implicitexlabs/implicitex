# Platform Strategy

## Phase 1: Online Tool
- Build full core functionality for USDC transfers.
- Treat web delivery as the canonical implementation.
- Use this phase to validate workflows and requirements.

## Desktop Framework Decision
- Electron is the selected desktop framework for ImplicitEx.
- Tauri is not in scope for the current roadmap.

## Phase 2: Desktop Resource (Electron)
- Derive desktop scope from validated online behavior.
- Reuse business logic where possible.
- Position desktop as an extension, not a parallel first build.
- Wrap the existing web stack in Electron and incrementally harden desktop UX.

## Phase 3: Ledger Hardware Wallet Integration
- Start only after Phase 1 and Phase 2 are stable.
- Focus on secure hardware-signing flows inside the established ImplicitEx environment.
- Keep integration sequencing strict to avoid parallel platform complexity.

## Strategic Expansion: Agent Financial Infrastructure
- Treat the current transfer engine as a possible settlement primitive for autonomous agents.
- Explore agent budgets, permissions, identity, audit trails, delegated approval thresholds, and reputation as future platform layers.
- Keep this expansion out of the immediate MVP until the non-custodial transfer platform is validated.
- Use `docs/product/agent-financial-infrastructure-initiative.md` as the primary thesis document.

## Security Companion: AuditWalk
- Use AuditWalk as a complementary security tool for ImplicitEx.
- Apply AuditWalk outputs to improve validation, risk visibility, and trust signaling.
- Explore AuditWalk as a verification and provenance layer for agent-initiated financial actions.
