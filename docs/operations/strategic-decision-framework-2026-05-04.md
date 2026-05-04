# Strategic Decision Framework — ImplicitEx Launch

Owner: Antoine Daniels / Aden Media Group LLC

Active window: May 2026 through August 2026

Last updated: 2026-05-04

Next review: 2026-06-04 or after first mainnet transaction, whichever comes
first.

## Non-Negotiables

Before any decision is made, these constraints are fixed:

- Fee: 1% flat. Not tiered yet. The 1% fee is the launch fee and is
  locked in the contract assumptions, docs, UI, and test fixtures. Do not reopen
  this unless post-mainnet transaction data gives a specific reason to.
- Custody: Non-custodial. ImplicitEx does not hold user funds at any point. This
  is the legal and product boundary. Do not cross it.
- Chain: Polygon and USDC. No scope expansion until mainnet is stable.
- Transfer cap: $250 USDC per transaction during soft launch. This is a risk
  management decision, not a permanent constraint.
- Gate: `transfersEnabled: false` until Amoy testnet smoke passes completely.
  This flag does not get set true under time pressure.

## 1. Clarify The Core Objective

Current objective:

First transaction on Amoy testnet with a real wallet, real USDC approval, real
fee routing to treasury, and a real explorer receipt within 30 days.

Not the current objective:

- Perfect product
- Mainnet launch
- Marketing campaign
- Subscription tier
- Volume tier pricing

The milestone that unlocks everything else:

```text
A stranger connected a wallet, approved a USDC transfer, paid a 1% fee, and
received an explorer receipt. The treasury address received the correct fee
amount. No errors.
```

Until that sentence is true on testnet, nothing else is the priority.

Nice-to-haves that do not block the milestone:

- Light theme toggle
- News feed from Python backend
- Volume tier pricing
- Subscription model
- Mobile optimization beyond basic responsiveness

## 2. Challenge All External Claims

Apply this to ImplicitEx decisions specifically:

- "You need a formal audit before launch." Not necessarily true for a
  non-custodial transfer contract with a $250 cap and honest disclosure. Verify
  actual exposure before spending money the project does not have.
- "You need KYC." Do not let this stop the testnet sprint. Re-verify
  periodically as regulations shift.
- "The contract needs to be more complex." No. The contract does one thing:
  route a USDC transfer with a 1% fee to treasury. Complexity is risk surface.
- "You should charge more because competitors do." Irrelevant at launch. The
  1% fee is a trust-building price. Revisit after 90 days of clean transaction
  history.

## 3. Map All Plausible Paths To First Revenue

| Path | Time estimate | Risk | Notes |
| --- | --- | --- | --- |
| ImplicitEx testnet to mainnet soft launch | 15-20 focused days | Medium | Fastest if frontend wiring goes cleanly |
| AuditWalk Linux CLI passive sales | Already monetized | Low | Trickle revenue while ImplicitEx builds |
| AuditWalk setup help offer ($199) | Days to publish | Low | No new build required |
| ImplicitEx subscription tier | Post-traction only | Low | Do not build until usage data exists |
| AuditWalk Windows CLI | 4-6 weeks | Medium | Larger market, do after ImplicitEx testnet |

Selected path:

ImplicitEx testnet sprint as primary, AuditWalk passive outreach running in
parallel.

## 4. Real Cost Of Remaining ImplicitEx Tasks

| Task | Time cost | Money cost | Risk if skipped |
| --- | --- | --- | --- |
| Precision fee tests | 2-4 hours | $0 | High: decimal errors damage trust permanently |
| Amoy testnet deploy | 1 day | Gas only | Blocks everything downstream |
| Frontend wallet.js production wiring | 5-8 days | $0 | Blocks first real transaction |
| Frontend integration tests | 2-3 days | $0 | Medium: edge cases surface in production |
| Production deploy | 1 day | $0-low | Blocks public access |
| Stub pages | 2-4 hours | $0 | Low for launch, needed before promotion |
| Formal contract audit | $15K-$50K | High | Managed initially via cap, disclosure, and non-custodial architecture |

Total to first testnet transaction: roughly 15-20 focused days, near-zero cost.

## 5. Capacity And Temperament Check

Current operating assumption:

- Primary focus: ImplicitEx sprint, roughly 4-6 hours per day.
- Parallel track: AuditWalk passive promotion via OpenClaw agents, low touch.
- Energy pattern: design and UI work builds momentum; use that productively at
  the start of sessions.
- Context-switching risk: high. When ImplicitEx is primary, AuditWalk is
  genuinely maintenance mode.

90-day boundary:

By August 2026, ImplicitEx is generating revenue or active employment search
begins. This is a pre-committed decision gate, not a failure condition.

## 6. Hidden Assumptions To Watch

- "Frontend wiring will be straightforward." Wallet provider inconsistencies,
  mobile behavior, and chain detection edge cases can expand.
- "Testnet smoke will pass cleanly on the first try." Plan for at least one
  fix round after first Amoy deploy.
- "1% will feel too low and should be raised." Resist this until there are 60
  days of mainnet data.
- "More features are needed before launch." No. V1 is connect wallet, approve,
  transfer, receive receipt.
- "AuditWalk must be fully polished first." No. AuditWalk Linux is shippable
  now; promote it without derailing ImplicitEx.

## 7. Decision Criteria For The Next 30 Days

A decision is correct if it directly moves toward this outcome:

```text
First Amoy testnet transaction complete. Fee routed correctly. Explorer receipt
confirmed.
```

A decision is a distraction if it does not directly unblock that outcome.

If a task does not directly unblock the testnet milestone, it goes to backlog,
not into today's work.

## 8. Current Decision Log

| Date | Decision | Reasoning |
| --- | --- | --- |
| 2026-05-04 | Fee set to 1% flat / 100 bps | Clean, transparent, trust-building at launch. Revisit post-traction. |
| 2026-05-04 | Prior higher demo fee superseded | Earlier demo-shell caution language; not the launch model. |
| 2026-05-04 | Transfer cap set to $250 USDC | Risk management during unaudited soft launch. Raise after clean transaction history. |
| 2026-05-04 | Formal audit deferred | Cost prohibitive; managed initially via cap, disclosure, and non-custodial architecture. |
| 2026-05-04 | ImplicitEx sprint is primary track | Faster path to first revenue than AuditWalk Windows CLI build. |
| 2026-05-04 | Subscription tier deferred | No usage data yet. Build after 90 days of mainnet history. |

## 9. Walls That Are Not Stops

- No audit means cannot launch. Not true as an absolute. $250 cap, honest
  disclosure, and non-custodial architecture make a soft launch risk-managed.
- No marketing means no users. Not true for testnet. Need 3-5 trusted testers,
  not a campaign.
- Contract must be complex to be credible. Not true. Simplicity is a security
  argument.
- AuditWalk must be finished first. Not true. AuditWalk Linux is shippable now.

## 10. Single Most Important Number

`$0`

That is current ImplicitEx revenue. Every decision in the next 30 days is
evaluated by how directly it moves that number off zero.

Second most important number:

`$250`

The per-transaction cap. This bounds and discloses early-user exposure.

Third most important number:

`1%`

The launch fee. It is set, honest, and does not change until data says
otherwise.

## Default Decision Protocol

Use this protocol when making ImplicitEx product, legal, engineering, or launch
decisions.

1. Clarify the core objective.
2. Challenge all external claims.
3. Map all plausible solutions.
4. Measure cost, time, and risk across all paths.
5. Match to capacity and temperament.
6. Surface and compare hidden assumptions.
7. Choose based on total alignment.
8. Document the logic.
9. Treat walls as boundaries to examine, not automatic stops.
10. Adjust the meta-lens when the problem framing is suspect.
