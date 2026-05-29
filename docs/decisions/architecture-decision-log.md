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

## 2026-05-28 - Receipt Store as Continuity Layer; getRecipientContext Contract

Decision:
- The receipt archive is the source of record for recipient history.
- `getRecipientContext(address)` is the single query interface for recipient
  context. `wallet.js` asks the question; `receipt-store.js` answers it.
- Active (in-flight) receipts are excluded from recipient history queries.
  Archive-only scope preserves signal integrity — a draft or abandoned transfer
  must not influence history.
- `totalSent` is deferred to v2. Summing amounts from string fields using
  `parseFloat` is deceptively unsafe for a product whose purpose is financial
  trust. v2 will sum integer USDC base units (6 decimals) before display
  formatting.

Context:
- Discovered during receipt-store architecture review that the existing
  `receipt.v1` schema (`recipient`, `purposeTag`, `referenceId`, `memo`,
  `createdAt`, `amount`) contains the full raw material for a local-first
  recipient relationship memory system with no new storage or backend required.
- The companion tray doc phrase "persistence converts the companion tray from
  a runtime display into a continuity layer" anticipated this direction.
- The Worldpay parallel: merchants pay for confidence, continuity, and
  auditability — not the raw transfer. Recipient memory directly addresses
  the question "who is this address to me?" that most wallets leave unanswered.

Status:
- Specced. Implementation deferred to `receipt-history` branch.
- Full API contract in `docs/product/receipt-store.md` § Recipient Context Queries.

Notes:
- Recipient aliases (local labeling) are a separate feature and do not belong
  in the receipt store.
- The `recipient` field is included in the return object as a self-describing
  convention — useful for telemetry, debug logging, and future rendering without
  caller-side bookkeeping.

---

## 2026-03-28 - Ledger and AuditWalk Sequencing

Decision:
- Ledger hardware wallet integration is approved but gated.
- AuditWalk is approved as a complementary security tool to ImplicitEx.

Context:
- Team will not start Ledger integration until both web presence and Electron desktop software are in place and stable.
- Security augmentation is needed without expanding scope into parallel platform rewrites.

Status:
- Accepted
