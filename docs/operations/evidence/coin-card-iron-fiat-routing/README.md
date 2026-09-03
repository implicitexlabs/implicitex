# Coin Card Iron Fiat Routing Evidence

**Status:** Empty evidence root; validation has not begun

This directory retains reviewed evidence for the frozen Iron fiat-routing architecture:

- `../../../product/coin-card/COIN_CARD_IRON_FIAT_ROUTING_ARCHITECTURE_V1.md`
- `../../../product/coin-card/fiat-routing/IRON_COIN_CARD_FIAT_RAIL_DILIGENCE_MASTER_V1.md`
- `../../../product/coin-card/fiat-routing/IRON_PROVIDER_DILIGENCE_QUESTIONNAIRE_V1.md`
- `../../../product/coin-card/fiat-routing/IRON_PROVIDER_VALIDATION_MATRIX_V1.md`

No file in this directory may claim a validation row passed unless the validation matrix
contains the same disposition and a reviewer has confirmed the retained evidence.

No provider answer changes the frozen architecture by implication. Evidence may satisfy
an existing requirement, support an authorized bounded exception, or document a
contradiction requiring formal architecture reopening. It may not silently redefine the
route model while being recorded.

## Run layout

Create one directory per evidence run:

```text
<YYYY-MM-DD>_<matrix-row>_<short-run-id>/
  README.md
  normalized-result.json
  artifacts/
```

The run `README.md` must contain:

```text
Run ID
Matrix row
Owner
Environment
UTC start/end
Named operators
Pinned Iron API version
Tested date
Procedure revision
Expected result
Actual result
Disposition
Evidence link
Evidence inventory and hashes
Issue or incident links
Notes
Reviewer and review date
```

## Data handling

Do not commit:

- API keys, webhook secrets, authentication tokens, or signing material;
- full bank account or routing credentials;
- unredacted KYC/KYB records;
- unnecessary sender identity or payment-tracking data;
- private customer wallet-ownership evidence;
- production provider payloads that contract or policy prohibits retaining in git.

Store sensitive raw evidence in the approved restricted evidence system. Commit only the
minimum redacted evidence, normalized facts, cryptographic hashes, and access reference
needed to reproduce the validation conclusion.

## Status discipline

The only allowed run dispositions are:

```text
NOT_RUN | IN_PROGRESS | PASS | APPROVED_EXCEPTION | FAIL | NOT_APPLICABLE
```

`CONDITIONAL PASS` is a final launch decision, not an evidence-run disposition. An
`APPROVED_EXCEPTION` must link to its named approver, bounded scope, enforcement,
rationale, and review/expiration date. A launch-blocking `FAIL` keeps the rail disabled.
