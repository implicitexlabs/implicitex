# Frozen Invariants

## What "frozen" means

**Frozen means non-overridable within execution work.**

No lane document, agent, implementation decision, discovered dependency,
configuration file, or argument from operational convenience may suspend,
weaken, reinterpret, or bypass a frozen invariant. A lane that appears to
conflict with a frozen invariant is wrong. The invariant stands.

Frozen invariants may be amended only through an **explicit human-authorized
doctrine change to this file itself**. That is a governance event, not an
implementation decision. Any active CURRENT-LANE that depends on the changed
invariant must be explicitly human-reviewed before work in that lane continues.

This file does not claim that invariants are metaphysically immutable. It claims
that **no execution agent has authority to change them**. Only a human-controlled
session authorizing a change to this specific file crosses that boundary.

---

These invariants cannot be suspended, overridden, or weakened by any lane
document, agent configuration, or implementation decision. They apply in every
lane, including future lanes that do not reference this file explicitly.

---

## I-1 — CURRENT-LANE.md is fail-closed

If `docs/agent-governance/CURRENT-LANE.md` is:
- missing
- unreadable or malformed
- internally contradictory
- present but does not authorize the requested work

then no implementation work may begin.

scope-sentinel must return BLOCKED with the specific reason. Best-effort scope
judgment on an ambiguous or absent lane document is not permitted.

`CURRENT-LANE.md` grants permission to begin work. Other doctrine files inform
decisions; only `CURRENT-LANE.md` grants permission.

---

## I-2 — Doctrine files are human-controlled

The following files are read-only to all agents at all times:

```
AGENTS.md
CLAUDE.md
.claude/agents/*
docs/agent-governance/CHARTER.md
docs/agent-governance/CURRENT-LANE.md
docs/agent-governance/FROZEN-INVARIANTS.md
```

An agent that identifies a potential change to any of these files must:
1. Report a clearly labeled `PROPOSED_DOCTRINE_CHANGE` in session output,
   or in a designated result artifact if the active lane and the agent's
   permissions authorize writing one.
2. Stop. Do not apply the change.

A proposal carries zero authority until a human session authorizes it.

This invariant applies to an agent's own configuration file. An agent may not
rewrite its own operating instructions because doing so makes the current task
easier.

**I-2 evaluation note for scope-sentinel:** This invariant is violated when a
doctrine file is modified autonomously by an agent without explicit human
authorization. It is **not** violated when a human-controlled session makes an
authorized change to a doctrine file. The correct evaluation question is:

> "Was any doctrine file modified without explicit human authorization?"

Not: "Was any doctrine file modified at all?"

I-2 PASS means: no autonomous doctrine mutation occurred.
I-2 FAIL means: a doctrine file was modified by agent action without explicit human authorization.

---

## I-3 — Necessity is not authorization

A discovered dependency is BLOCKER — not IN-LANE — if it is not explicitly
authorized by `CURRENT-LANE.md`, even if it appears necessary to complete the
lane objective.

The reasoning "X must be fixed before Y works, therefore fixing X is part of Y"
is not valid. It is the most common form of scope expansion and is not permitted.

BLOCKER means: stop and surface for human lane amendment. It does not mean:
silently include the dependency and continue.

---

## I-4 — Cross-platform read; no cross-platform write

Claude and Codex have read access to all doctrine files, including each other's
platform configuration.

Neither platform may write to the other's configuration files.

Visibility does not imply authority. Reading `AGENTS.md` does not authorize
modifying `AGENTS.md`. Reading `.claude/agents/scope-sentinel.md` does not
authorize modifying it.

---

## I-5 — Scope classifications are the complete and exclusive taxonomy

Every item evaluated by scope-sentinel must receive exactly one classification:

- **IN-LANE**
- **BLOCKER**
- **FOLLOW-ON**
- **UNRELATED**

No other classifications exist. Hedges such as "probably fine," "implicitly
authorized," or "minor and harmless" are not classifications and are not
permitted.

If a classification is genuinely ambiguous, that ambiguity must be surfaced
explicitly in the LANE QUESTIONS section of the sentinel report. The human
reviewer resolves ambiguity; scope-sentinel does not resolve it by defaulting
to IN-LANE.

---

## I-6 — Governance transition compare-and-swap

This invariant applies exclusively to **governance transitions**: sessions
whose active lane's authorized write paths include
`docs/agent-governance/CURRENT-LANE.md`. It does not apply to authorized
implementation commits within an already-active lane.

A session authorized to write `CURRENT-LANE.md` must perform a
compare-and-swap (CAS) check immediately before the first write:

**(a) Reconciliation-time recording.** At the moment the session begins
planning the lane transition, it must record:
- `expected_head`: the current HEAD SHA
- `expected_cas_blob_hash`: the current git blob hash of
  `docs/agent-governance/CURRENT-LANE.md`

**(b) Pre-write re-verification.** Immediately before any write to
`CURRENT-LANE.md`, the session must re-read the current HEAD SHA and the
current blob hash of `CURRENT-LANE.md` and compare them against the recorded
values.

**(c) Mismatch is BLOCKED.** If either value has changed since
reconciliation-time recording, the session must stop and report:

    BLOCKED — LANE MUTEX VIOLATED

    Expected HEAD:                 <expected_head>
    Observed HEAD:                 <current_head>

    Expected CURRENT-LANE.md blob: <expected_cas_blob_hash>
    Observed CURRENT-LANE.md blob: <current_blob_hash>

    A concurrent session has modified the repository or CURRENT-LANE.md
    since this session recorded its CAS baseline. This lane transition
    is prohibited. Human reconciliation required.

**(d) No subsequent writes after mismatch.** After a CAS mismatch, all
subsequent write, stage, commit, reset, checkout, or restore operations
targeting `CURRENT-LANE.md` are prohibited in that session.

**(e) Scope restriction.** This invariant applies only to governance
transitions — sessions authorized to write `CURRENT-LANE.md`. It does not
apply to implementation commits made within an already-active lane.

**(f) No freshness rule.** This invariant introduces no TTL, timestamp
freshness rule, or session-age rule. The only check is hash equality between
reconciliation-time recording and pre-write re-verification.
