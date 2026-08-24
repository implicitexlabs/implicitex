# ImplicitEx Agent Governance Charter

## Purpose

This charter defines the governance model for autonomous and semi-autonomous
agents operating in the ImplicitEx repository. It is the foundational authority
document. All agent configuration files, lane documents, and operating
instructions must be consistent with it.

---

## Governance hierarchy

All agent execution is governed by three layers, in descending authority:

1. **Human authorization** — explicit, session-scoped. The only source of scope
   grants and doctrine changes.
2. **Doctrine** — the canonical files listed below. Defines operating constraints
   that persist across sessions.
3. **Agents** — execute within the boundary established by human authorization
   and doctrine.

No agent operates above this hierarchy. Agents do not override doctrine.

Human authority is ultimate — but **execution authorization does not implicitly
suspend or override doctrine**. To override a doctrine constraint, the human must
explicitly amend doctrine first. Ordinary task authorization does not imply
doctrine-change authority.

---

## Platforms

Two platforms are authorized to operate in this repository:

- **Claude** (Anthropic Claude Code) — governed by `CLAUDE.md` and `.claude/agents/`
- **Codex** (OpenAI Codex) — governed by `AGENTS.md`

Claude and Codex are peer platforms operating under common doctrine. Neither
platform has authority over the other's configuration. Both receive the same
canonical governance instructions by reading the same files.

---

## Doctrine files — human-controlled, read-only to agents

```
AGENTS.md
CLAUDE.md
.claude/agents/*
docs/agent-governance/CHARTER.md
docs/agent-governance/CURRENT-LANE.md
docs/agent-governance/FROZEN-INVARIANTS.md
```

Changes to any of the above require explicit human authorization in a
human-controlled session.

**Autonomous execution agent** — may identify apparent staleness, contradictions,
or proposed improvements. May report a clearly labeled `PROPOSED_DOCTRINE_CHANGE`
in session output, or in a designated result artifact if the active lane and the
agent's permissions authorize writing one. May never apply a doctrine change.
A proposal carries zero authority until a human session authorizes it.

**Human-controlled primary session** — may apply a doctrine change only after
explicit human authorization that specifically identifies the doctrine change.
Ordinary task authorization does not imply doctrine-change authority.

---

## Cross-platform visibility

Both Claude and Codex have read access to all doctrine files, including each
other's platform configuration. This enables awareness of what each platform
is capable of and what constraints it operates under.

Neither platform may write to the other's configuration files.

---

## Execution boundary

The active execution boundary is defined by `docs/agent-governance/CURRENT-LANE.md`.

Agents must read and parse this file before beginning any authorized work.

If `CURRENT-LANE.md` is missing, malformed, internally contradictory, or does
not authorize the requested work: the agent returns BLOCKED. No implementation
action is taken. Best-effort scope judgment on an ambiguous lane document is not
permitted.

`CURRENT-LANE.md` grants permission to begin work. Other doctrine files inform
decisions. Only `CURRENT-LANE.md` grants permission.

---

## Scope classification

Every change, dependency, or discovered item must be classified as exactly one of:

| Classification | Meaning |
|---|---|
| **IN-LANE** | Required and expressly authorized by the current lane |
| **BLOCKER** | Required but not authorized by the current lane — stop and surface for human lane amendment |
| **FOLLOW-ON** | Relevant and potentially valuable but not required for current acceptance |
| **UNRELATED** | Not relevant to the current lane |

A discovered dependency is never IN-LANE merely because it appears necessary to
accomplish the lane objective. Necessity does not imply authorization. A BLOCKER
means stop and surface — not silently enlarge scope.

---

## Doctrine amendment

Doctrine files are amended only by human-controlled sessions. The process:

1. An agent identifies a potential amendment.
2. The agent reports a clearly labeled `PROPOSED_DOCTRINE_CHANGE` in session
   output, or in a designated result artifact if the active lane and the
   agent's permissions authorize writing one. The block must include the target
   file, the observation, the suggested change, and the evidence.
3. The agent stops. It does not apply the change.
4. A human session reviews the proposal and, if accepted, authorizes and applies
   the change.

Agents may not propose amendments to their own configuration files through the
implementation mechanism they would be executing. That circular authority is not
permitted.
