# Fee Constitution

## Principle

The fee compensates for infrastructure usage. It does not function as a claim on
the value being transferred.

ImplicitEx facilitates and protects the transfer. It does not own part of the
money's purpose. This separates the platform from a broker, custodian, or
marketplace taking a percentage because it helped create the underlying transaction
value.

The platform fee therefore exists to compensate ImplicitEx for providing reliable
transfer infrastructure — not to scale indefinitely with the amount being
transferred. A sender moving 20,000 USDC is using the same infrastructure as a
sender moving 200 USDC. The service delivered is substantially the same. The fee
should reflect that.

## Policy

- **Rate:** 1% of the recipient amount
- **Ceiling:** 10 USDC per transfer
- **Formula:** `fee = min(amount × 1%, 10 USDC)`

The cap activates at 1,000 USDC. Below that threshold, the fee scales naturally
with the amount. Above it, the fee is fixed.

| Recipient gets | Fee       |
| -------------: | --------: |
| 100 USDC       | 1.00 USDC |
| 250 USDC       | 2.50 USDC |
| 800 USDC       | 8.00 USDC |
| 1,000 USDC     | 10.00 USDC |
| 2,000 USDC     | 10.00 USDC |
| 10,000 USDC    | 10.00 USDC |
| 20,000 USDC    | 10.00 USDC |

## Authority

The contract is the authority. The portal mirrors it.

- `ImplicitExTransfer.calculateFee()` is the single source of truth.
- `transferWithFee()` and `previewTransfer()` both delegate to it.
- The portal's `calculateFee()` in `ix-execution.js` mirrors the contract formula
  exactly and must be kept in sync whenever the policy changes.
- Users do not have to trust the portal's display. The contract enforces the same
  number they see.

## Displayed to users as

> Platform fee (1%, max 10 USDC)

This wording is intentional. It communicates the ceiling without requiring the
user to do arithmetic or wonder what happens at larger amounts.

## Governance

The fee rate (`feeBasisPoints`) is owner-configurable downward only — it can never
be raised above 1% without deploying a new contract. The ceiling (`MAX_FEE`) is an
immutable contract constant. Changing either requires a new contract deployment and
a deliberate migration decision.

That constraint is load-bearing. It means users can read the deployed contract and
know the worst case. The portal cannot override it. The owner cannot silently raise
it. The ceiling is the ceiling.

This is the distinction between a promise and a verifiable constraint. A
configurable cap says "trust management not to change this unfairly." An immutable
cap says "management does not possess that power in this contract." For a
trust-oriented payment platform, the second statement is materially stronger.

If inflation, additional token support, or substantial economic changes require
revisiting these parameters, the path is a clearly versioned successor contract
with public migration and disclosure — not a quiet configuration change. That is
not a defect. Deliberate redeployment is the price of making an important
guarantee credible.

## Why this matters

Pricing decisions reveal values. Stopping at 10 USDC when the mathematics would
permit 20, 100, or 200 is a choice that users can observe and verify on-chain.
Over time, that pattern of observable restraint is more durable than any marketing
claim about being trustworthy.
