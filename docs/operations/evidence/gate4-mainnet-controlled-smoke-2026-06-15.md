# ImplicitEx Gate 4 — Mainnet Controlled Live Smoke

Date: 2026-06-15
Status: PASSED
Gate: Gate 4 (Mainnet controlled live smoke)
Branch: gate3-production-frontend-qa
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
Transfer hash:  0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9
Block:          88565097
State:          confirmed
Funds moved:    true
Explorer:       https://polygonscan.com/tx/0x37fd733a7f1854740bf702aa5bf59794f4ebab0f39d2a84fb2c231c29df622d9
```

## Economic Routing Verification

```text
Sender balance before:      7.172 USDC
Sender balance after:       6.162 USDC
Sender total debit:         1.010 USDC  ✅  (exact)

Recipient received:         1.000 USDC  ✅  (Polygonscan confirmed, 0xe0B0...796B)
Treasury fee received:      0.010 USDC  ✅  (Polygonscan confirmed, 0xa7cE...3919)
Contract retained:          0.000 USDC  ✅  (zero-custody routing confirmed)
```

Fee math correct: 1.00 USDC × 100 bps = 0.01 USDC fee; total debit = 1.01 USDC.

Polygonscan ERC-20 token transfers (on-chain):
- Transfer 1: 0x2489...1221 → 0xe0B0...796B  1.00 USDC  ✅
- Transfer 2: 0x2489...1221 → 0xa7cE...3919  0.01 USDC  ✅

## UI State Progression Observed

```text
1. Armed state:      Status LIVE, recipient populated, amount 1.0, fee 0.010000 USDC, Execute Transfer enabled
2. Wallet prompt:    MetaMask confirmation — total debit 1.01 USDC, Polygon, contract interaction, gas shown
3. Broadcast phase:  ImplicitEx shows "AWAITING POLYGON..." / "Transfer submitted — awaiting Polygon confirmation" / "Broadcast to network. Do not retry."
4. Final state:      "Transfer confirmed. View on Polygon explorer"
```

The UI did not falsely report success immediately after wallet confirmation. Pending state was
displayed and held until on-chain confirmation. Final state reflects real on-chain status only.

## Gate Discipline

```text
transfersEnabled opened:  2026-06-15  (global: true, Polygon 137: true)
Transfer executed:        2026-06-15  block 88565097
Gate closed:              2026-06-15  (global: false, Polygon 137: false)
Closed config deployed:   pending this commit
```

## Significance

This is the controlled live smoke confirming the full transfer + fee-routing path is
operational on the production frontend at implicitex-236f2.web.app.

The highest-risk unknown entering Gate 4:

> "Does fee routing work correctly under a real user flow from the production frontend?"

Answer: yes. Treasury received 0.01 USDC at the correct address. Recipient received 1.00 USDC.
Sender was debited exactly 1.01 USDC. Contract retained zero.

The revenue path is proven end-to-end.

## What Remains (Gate 5)

- Homepage copy final
- Contact/support route
- Known-limitations note (no recovery, no reversal, Polygon only)
- First-user walkthrough tested
- Attorney review (recommended before scale, not a hard MVP blocker)
- Launch announcement ready
