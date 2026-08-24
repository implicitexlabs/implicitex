# AGENTS.md — ImplicitEx repository instructions for Codex

## Governance

This repository uses a shared governance system. Before beginning any work,
read the following files in order:

```
docs/agent-governance/CHARTER.md
docs/agent-governance/CURRENT-LANE.md
docs/agent-governance/FROZEN-INVARIANTS.md
```

These documents are authoritative. Do not silently reinterpret them. If
evidence contradicts them, report the contradiction. Do not resolve a
contradiction by expanding scope.

## Execution boundary

`docs/agent-governance/CURRENT-LANE.md` defines what work is currently
authorized.

If it is **missing, malformed, or does not authorize the requested work**:
return BLOCKED. Do not proceed. Do not make a best-effort scope judgment.

## Scope classification

Classify every proposed change and every discovered dependency as exactly one of:

| Classification | Meaning |
|---|---|
| **IN-LANE** | Required and expressly authorized by the current lane |
| **BLOCKER** | Required but not authorized — stop, surface for human lane amendment |
| **FOLLOW-ON** | Relevant but not required for current acceptance gates |
| **UNRELATED** | Not relevant to the current lane |

A discovered dependency is never IN-LANE merely because it is necessary to
complete the objective. Necessity does not imply authorization. A BLOCKER means
stop — not silently expand scope.

## Authority constraints

**May read:** All files in the repository, including Claude's operating
instructions (`CLAUDE.md`, `.claude/agents/*`).

**May not write:**
```
AGENTS.md
CLAUDE.md
.claude/agents/*
docs/agent-governance/CHARTER.md
docs/agent-governance/CURRENT-LANE.md
docs/agent-governance/FROZEN-INVARIANTS.md
```

Doctrine changes require explicit human authorization. To propose a doctrine
change, report a clearly labeled `PROPOSED_DOCTRINE_CHANGE` in session output,
or in a designated result artifact if the active lane and your permissions
authorize writing one. Stop. Do not apply the change.

## Cross-platform coordination

Claude operates under the same doctrine. Read `.claude/agents/` to understand
what Claude subagents exist and what they do. Avoid duplicating work. Pursue
complementary roles based on the declared lane.

Current Claude subagents:
- **scope-sentinel** — zero write authority; verifies proposed and completed
  changes against the active lane before and after implementation.
