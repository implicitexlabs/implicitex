# Portal Intent-Based Presentation Projection V1

This document is a presentation projection only.

Authority is inherited exclusively from `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`.
This projection assigns presentation placement only and may not redefine,
simplify, or supersede an inventoried authority.

It maps inventoried facts onto the portal surfaces defined by
`PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`.

It does not create authority, storage policy, navigation, or execution behavior.

## 1. Purpose

The portal projects existing facts into user-intent surfaces so the application
can present the right facts at the right time without duplicating authority.

The projection must preserve the same authoritative state across every
appearance of a fact.

## 2. Projection Rules

- A fact may appear in more than one surface for safety or continuity.
- Every appearance must project the same authoritative state.
- Projection does not create a second source of truth.
- Projection does not decide storage architecture.
- Projection does not move DOM sections.
- Projection does not add navigation.
- Verification and System remain contextual and supporting, not equal primary destinations.
- Recipients and Activity are intended surfaces and are not yet implemented as dedicated destinations in the current DOM.
- Every execution blocker must surface at the point of action in Transfer.
- Verification and System may explain or mirror a blocker, but neither may be its exclusive or primary presentation surface.
- Values selected from Recipients or Activity remain proposed inputs until the user explicitly adopts them into the Transfer draft. Supporting surfaces may not silently overwrite current or frozen transfer intent.

## 3. Projection Matrix

| Fact | Inventory authority reference | Canonical projection surface | Secondary/contextual projection | Visibility obligation | Detail treatment | Blocking placement |
| ---- | ---------------------------- | ---------------------------- | ------------------------------- | -------------------- | ---------------- | ------------------ |
| Recipient address | See the corresponding inventory row | Transfer | Contextual Verification; Recipients; Activity | Required summary during an active transfer | Contextual drawer or sheet; evidence disclosure | Transfer review and authorization, if invalid or unresolved |
| Recipient label / display name | See the corresponding inventory row | Transfer | Contextual Verification; Recipients; Activity | Conditional summary when the label is relevant to the current transfer | No additional detail unless a stricter source record must be shown for reconciliation | Transfer review only when a separate authoritative identity or route fact conflicts with frozen transfer intent under the applicable execution policy |
| Asset / token | See the corresponding inventory row | Transfer | Contextual Verification; System | Required summary during an active transfer | No additional detail | Transfer review and authorization if unsupported or unavailable |
| Route and network | See the corresponding inventory row | Transfer | Contextual Verification; System | Required summary during an active transfer | Contextual drawer or sheet; evidence disclosure | Transfer owns the interruption; Verification may explain the evidence behind the blocker |
| Connected wallet | See the corresponding inventory row | Transfer | System | Required summary during an active transfer | No additional detail | Transfer owns the interruption |
| Chain ID and network condition | See the corresponding inventory row | Transfer | System; contextual Verification | Required summary during an active transfer | No additional detail; supporting evidence may be shown on demand | Transfer owns the interruption; Verification may explain the evidence behind the blocker |
| Amount | See the corresponding inventory row | Transfer | Contextual Verification | Required summary during an active transfer once frozen for review | No additional detail | Transfer review and authorization if invalid, out of bounds, or unresolved |
| Platform fee and total debit | See the corresponding inventory row | Transfer | Activity; System | Required summary during an active transfer | No additional detail | Transfer review and authorization if the preview cannot be computed or the balance is insufficient |
| Wallet balance and available funds | See the corresponding inventory row | Transfer | System | Required summary during an active transfer | No additional detail | Transfer owns the interruption |
| Coin Card route evidence | See the corresponding inventory row | Transfer | Contextual Verification | Conditional summary whenever a Coin Card or verified route is active | Evidence disclosure; contextual drawer or sheet | Transfer owns the interruption; Verification may mirror the evidence |
| Coin Card lifecycle / integrity state | See the corresponding inventory row | Transfer | Contextual Verification | Conditional summary whenever lifecycle state is relevant to execution | Evidence disclosure; contextual drawer or sheet | Transfer owns the interruption; Verification may mirror the evidence |
| Display label on Coin Card | See the corresponding inventory row | Transfer | Contextual Verification; Recipients | Conditional summary when the Coin Card is displayed | No additional detail | Transfer review only if the label must be reconciled against a stricter source record or conflicts with frozen transfer intent under the applicable execution policy |
| Authorization readiness | See the corresponding inventory row | Transfer | None beyond the transfer surface | Required summary while reviewing or authorizing | No additional detail | Transfer owns the interruption |
| Approval state | See the corresponding inventory row | Transfer | Activity; contextual Verification | Conditional summary while approval is active or unresolved | Receipt detail | Transfer owns the interruption while pending or rejected |
| Transfer submission and chain confirmation state | See the corresponding inventory row | Transfer | Activity; contextual Verification | Conditional summary while submission is pending, failed, or unresolved | Receipt detail | Transfer owns the interruption while pending, failed, or unresolved |
| Transaction hash, block, and confirmation time | See the corresponding inventory row | Activity | Contextual Verification | On demand | Receipt detail | Activity may link to a current blocker, but historical evidence does not independently create an execution blocker |
| Recent receipts and activity history | See the corresponding inventory row | Activity | Contextual Verification; Transfer sidebar evidence | On demand | Receipt detail | Activity may surface an actionable warning or link to a current blocking condition; historical evidence does not independently create an execution blocker |
| Companion transaction status | See the corresponding inventory row | Transfer | None beyond the transfer surface | Conditional summary while the transfer is active | No additional detail | Transfer owns the interruption when it surfaces a blocker already present elsewhere |
| Telemetry summary, status rows, details, and guidance | See the corresponding inventory row | System | None beyond the system surface | On demand | System disclosure | System as contextual advisory only |
| Contract details | See the corresponding inventory row | System | Contextual Verification | Conditional summary when the active chain or deployment context matters | System disclosure | Transfer owns the interruption when missing, paused, or mismatched; System and Verification may explain it |
| Installation state and install instructions | See the corresponding inventory row | System | Support / installation help | On demand | System disclosure | Passive informational state |
| Help, legal, and disclosures | See the corresponding inventory row | System | Support | On demand | System disclosure | Passive informational state unless a separate authority marks it blocking |

## 4. Intended Surfaces

### Transfer

Transfer carries the primary operational facts and any blocking execution conditions. It may show supporting facts when they are required to complete review or authorization, but it does not create separate authority for them.

### Recipients

Recipients carries recipient selection, local convenience data, and Coin Card route intake. It may project recipient labels, route evidence, and local history, but it does not own transfer truth.

### Activity

Activity carries pending and historical transaction evidence. It may project receipts, hashes, confirmation facts, and historical transfer records, but it does not own execution truth.

### Contextual Verification

Verification stays attached to the fact or object being evaluated. It may open as a drawer, sheet, disclosure, evidence panel, or dedicated detail view, but it does not become a detached primary destination.

### System

System carries wallet and network status, contracts, installation, diagnostics, help, and disclosures. It stays compact and supportive rather than equal to Transfer.

## 5. Prohibited Projection Behaviors

- Creating new authority by copying a fact into a second independent state store.
- Turning Verification or System into equal primary destinations.
- Moving portal DOM sections before the projection is approved by contract and inventory.
- Deciding storage architecture.
- Changing execution authority.
- Making a factual projection differ from the inventoried authority.
- Silently overwriting transfer intent from Recipients or Activity.

## 6. Acceptance Criteria

Future implementation work should be able to prove:

- authority is inherited exclusively from `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`;
- every projected appearance of a fact matches the same authoritative source;
- Transfer remains the primary operational destination;
- Recipients and Activity remain subordinate to their intended roles and cannot silently replace transfer intent;
- Verification remains contextual and System remains compact;
- blocker placement is consistent with the IA contract and every execution blocker surfaces at the point of action in Transfer;
- compact trust state appears on Transfer whenever a Coin Card or verified route is active;
- labels do not independently block;
- historical evidence does not independently block;
- no new authority, navigation, storage, or execution behavior is introduced.
