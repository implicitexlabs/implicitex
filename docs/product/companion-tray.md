# ImplicitEx — Transaction Companion Tray

The Transaction Companion is an event-driven status layer that narrates
transaction state in plain language. It is not a chatbot, assistant, or
notification system.

Its identity is defined as much by what it does not do as by what it does.

---

## The Companion Does Not

- Initiate conversation
- Speculate about state
- Infer user intent
- Speak in first person
- Interrupt an active transaction
- Obscure the transaction instrument
- Replace Polygonscan or wallet confirmations as authoritative sources
- Persist as an always-open chat window
- Accumulate into a scrolling log
- Provide financial advice
- Use emotional language
- Classify unknown states as failures
- Animate without functional reason
- Surface raw hex data, error codes, or RPC internals to the user

---

## The Companion Does

- Respond to transaction events
- Display one current reading at a time
- Answer "did funds move?" as the first priority
- Archive a receipt when a terminal state is reached
- Remain collapsed and ambient when no active transaction exists
- Expand upward on user interaction or on high-priority state change
- Return to collapsed state when the transaction resolves

## Idle-State Philosophy

In idle state, the companion is **present but not read unless sought.**

This is a deliberate position between invisible (unhelpful) and readable-at-a-glance
(too loud). The collapsed bar anchors the interface without asserting itself.
It communicates continuity — the instrument is operational — without demanding
attention or signaling that something needs to be done.

Implementation: idle status text at `var(--muted)`, not `var(--dim)`.
The distinction matters: `--dim` asks to be read; `--muted` is peripheral context.

---

## Layout Behavior

- Position: fixed, bottom 0, full-width
- Collapsed height: ~40px — single status line
- Expanded height: ~280px — lifts upward via transform
- Never covers the action button or transaction instrument
- Expansion: upward only (not a dropdown — a lift-up)
- z-index: above content, below wallet modals

---

## State Rendering

The companion renders from the canonical state machine defined in:
`docs/product/transaction-states.md`

Each state maps to:
1. A collapsed status line (ambient, one sentence)
2. An expanded detail view (state + funds moved + hash/link if available + next action)

Rendering is deterministic. The same state always produces the same output.

---

## Persistence Behavior

- Receipts persist in localStorage across disconnect and refresh
- Companion re-derives display from stored raw state on reload
- Does not rely on runtime memory for state reconstruction
- Archive is accessible but not the default view

---

## Mobile Behavior

- Remains subordinate to the transfer instrument
- Uses the same state and receipt model as desktop
- Does not become a chat surface or notification feed
- Must not cover wallet-critical controls while expanded

---

## Animation Constraints

- Expansion and collapse use CSS transform only (no layout reflow)
- No entrance animations on the collapsed tray
- No attention-seeking motion when idle
- Transition duration: functional, not decorative

---

## Interaction Boundaries

- User can expand and collapse at any time
- Companion does not force expansion
- Companion may expand automatically on `unclear`, `failed`, `replaced`,
  `outcome_unknown`, and `confirmed` states
  (high-priority events where the user most needs context)
- No other automatic expansion

---

## Future AI Layer

When a language model is added to interpret receipts, it operates within these
constraints:

- It annotates known state. It does not classify state.
- It speaks in the same factual register as the deterministic messages.
- It does not introduce first-person language, emotional framing, or speculation.
- It has read access to the receipt. It does not have write access to state.

The state machine remains authoritative. The AI layer is explanatory only.
