# ImplicitEx Gate 2 — Live Transfer Smoke Verification

Date: 2026-06-01
Status: PASSED
Gate: Gate 2 (Live-transfer readiness review)
Branch: gate2-live-smoke-metamask
Commit: e866e8a
Contract: 0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0 (canonical, Safe-owned)
Network: Polygon mainnet (chainId 137)
Wallet: MetaMask injected

## Participants

```text
Sender:    0x2489587C9da6EaB970a5479BA70273BA37961221
Recipient: 0xe0B02A6d9738aa36eE48004211E264b7a815796B
Treasury:  0xa7cE4232811021d2Dd01f4f0f264Df2427ab3919
Contract:  0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0
```

## Transfer Evidence

```text
Transfer hash:  0xcfa000fa...eeb59a  (partial — full hash to be appended from archive[0])
Approval hash:  pending archive[0] extraction
Explorer:       https://polygonscan.com (interaction with contract confirmed)
```

Note: full hashes are available in `localStorage["ix.receipt.archive"]` under receipt ID
`2026-06-01T18:48:56.305Z-992d25bd`. To be appended when extracted.

## Receipt Archive (localStorage ix.receipt.archive)

```text
index 0 — id: 2026-06-01T18:48:56.305Z-992d25bd   state: confirmed
index 1 — id: 2026-06-01T18:43:53.395Z-d064d498   state: authorizing
```

State progression observed in UI: AUTHORIZING → CONFIRMED.

## Economic Routing Verification

```text
Sender balance before:      ~9.22 USDC
Sender balance after:       ~8.21 USDC
Sender total debit:          1.01 USDC   ✅  (exact)

Recipient received:          1.00 USDC   ✅  (Polygonscan confirmed, 0xe0B0...796B)
Treasury fee received:       0.01 USDC   ✅  (Polygonscan confirmed, 0xa7cE...3919)
Contract retained:           0.00 USDC   ✅  (zero-custody routing confirmed)
```

Fee math correct: 1.00 USDC × 100 bps = 0.01 USDC fee; total debit = 1.01 USDC.

## Approval Flow Verification

MetaMask spending cap prompt observed and confirmed:

```text
Transaction type:  Spending cap request (USDC approval)
Spending cap:      1.01 USDC  ✅  (not unlimited — exact allowance)
Spender:           0x5015841D6E665e63Ea174aD6b8FeF854026dE0C0  ✅  (matches chains.js)
Network:           Polygon  ✅
Token:             USDC  ✅
Request origin:    localhost:8181  ✅
```

UI at approval prompt: "Step 1 of 2 — Approve 1.01 USDC total debit / Wallet authorization required"

## Significance

This is the first execution of the full `approve → transferWithFee` lifecycle
under a real wallet prompt on the live frontend. Prior smoke (2026-05-23) verified
contract routing via script; this verifies the complete user-facing flow including
MetaMask approval construction, allowance scoping, and two-step execution.

The highest-risk unknown in the project prior to this session:

> "Can a real user, with a real wallet, approve USDC and execute transferWithFee() on Polygon?"

Answer: yes.

## What Remains (not a blocker for Gate 2)

- Full hashes (transferHash, approvalHash) to be appended from archive[0]
- Failure/rejection path validation deferred to Gate 4
- Receipt API does not currently expose `listAll()` — follow-up engineering task

## Gate Discipline

Gate opened: manually on branch gate2-live-smoke-metamask for this smoke only
Gate closed: immediately after smoke, before commit e866e8a
transfersEnabled state at commit: false (global), false (Polygon 137)
