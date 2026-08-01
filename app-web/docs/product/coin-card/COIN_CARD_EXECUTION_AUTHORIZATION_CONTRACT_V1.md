# Coin Card Execution Authorization Contract v1 — App-Web Pointer

Canonical version: `../../../../docs/product/coin-card/COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`

This file is a pointer. The authoritative contract lives in the canonical root.

## Summary

The execution-authorization gate consumes three inputs — a genuine
promoted-presentation proof, a frozen transfer-intent snapshot, and a frozen
wallet-readiness snapshot — and decides whether one specific transfer attempt
may proceed to wallet interaction. It is a synchronous pure policy function
with no wallet calls, no DOM reads, and no async operations. Only
`EXECUTION_AUTHORIZED` results enter the private WeakSet; all other results
carry `executionEligible: false`. The `executionPlan` field on authorized
results distinguishes `TRANSFER_ONLY` (allowance already sufficient) from
`APPROVE_THEN_TRANSFER` (allowance must be set first). IX_EXECUTION must
validate with `isExecutionAuthorizedResult()`, mark the result consumed before
any wallet call, and perform the TOCTOU guard by re-reading account and chain
immediately before wallet interaction.
