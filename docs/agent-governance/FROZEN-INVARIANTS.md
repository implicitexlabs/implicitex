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

## I-6 — Lane transitions use compare-and-swap guards

I-6 applies whenever any operation proposes to create, replace, amend, close,
supersede, restore, or otherwise write
`docs/agent-governance/CURRENT-LANE.md`. The trigger is the proposed operation,
not the presence of `CURRENT-LANE.md` in an allowed-path list.

I-6 governs lane transitions only. It does not apply to implementation commits
performed within an already-active lane.

I-6 takes effect with the commit that adds this invariant. It does not
retroactively invalidate earlier lane transitions. Every transition after that
effective commit must comply, including any close, amendment, or supersession
of a lane created before I-6 took effect.

### Baseline guard — immediately before the first transition write

Before the first write to `CURRENT-LANE.md`, the transition session must:

1. verify that `CURRENT-LANE.md` has no pre-existing staged or unstaged change
   attributable to another transition;
2. record the expected repository `HEAD` with `git rev-parse HEAD`;
3. record the expected committed `CURRENT-LANE.md` blob at that `HEAD` with
   `git rev-parse HEAD:docs/agent-governance/CURRENT-LANE.md`; and
4. immediately before the first write, re-read both `HEAD` and the committed
   lane blob and compare them with the recorded expected pair.

The baseline guard passes only when no conflicting transition change exists and
both values match. A mismatch is:

`BLOCKED — LANE MUTEX VIOLATED`

### Commit guard — immediately before staging or committing

Immediately before staging or committing the transition, the session must:

1. re-read the expected `HEAD` and committed lane blob pair;
2. verify that the worktree hash of `CURRENT-LANE.md` equals the hash of the
   reviewed transition candidate; and
3. verify that the index contains no unexpected state.

The commit guard passes only when the expected `HEAD` and committed lane blob
still match, the worktree contains the reviewed candidate, and the index state
is expected. A mismatch is:

`BLOCKED — LANE MUTEX VIOLATED`

After either guard reports that blocker, the session must not write, stage,
commit, reset, check out, restore, or automatically reconcile
`CURRENT-LANE.md`. The session must inspect the intervening commits, reconcile
authority, and obtain any newly required human authorization before recording
a new expected `HEAD` and committed lane blob pair.

I-6 has no time-to-live, wall-clock, or session-age rule. Freshness is
established only by the required repository-state comparisons.
