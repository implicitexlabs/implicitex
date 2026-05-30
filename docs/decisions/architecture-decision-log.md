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

## 2026-05-30 - WalletConnect Session Persistence: Privacy-First Default

Decision:
- WalletConnect sessions are not automatically restored on page refresh.
- Explicit disconnect clears the WalletConnect relay session and localStorage
  cache. Page refresh without disconnect also returns the application to a
  disconnected state requiring a fresh QR handshake.

Context:
- During WalletConnect integration smoke testing, both explicit disconnect
  and page refresh were confirmed to require fresh QR on reconnect.
- This behavior is a product choice, not a technical limitation. The WC SDK
  supports session restoration from localStorage, but the localStorage cache
  is cleared on explicit disconnect and is not restored on page reload because
  `IX_WC.init()` is not called on page load — only on user-initiated connect.

Rationale:
- ImplicitEx is a money-transfer tool. Shared-device safety is a higher
  priority than connection convenience for MVP.
- A user who explicitly disconnects, or who closes a browser tab, should not
  have their wallet silently reattached on the next visit.
- The tradeoff: returning users must scan a fresh QR after each session.
  Accepted for MVP.

Status:
- Accepted. Session restore on refresh may be revisited post-launch if
  returning-user friction becomes a product priority.

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
