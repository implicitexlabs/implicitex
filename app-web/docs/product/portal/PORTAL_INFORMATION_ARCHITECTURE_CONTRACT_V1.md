# Portal Information Architecture Contract V1

## 1. Purpose

The portal is the canonical operational interface for ImplicitEx. It is organized around user intent, not current DOM order, implementation modules, or equal-weight dashboard categories.

This contract governs presentation structure only. It does not change execution authority, wallet behavior, Coin Card behavior, transaction execution, or portal runtime truth.

## 2. Destination hierarchy

The portal must freeze these roles:

- **Transfer** — default launch destination and primary workspace.
- **Recipients** — persistent destination for saved, recent, imported, scanned, and Coin Card recipients.
- **Activity** — persistent destination for transaction states, receipts, history, and evidence retrieval.
- **Verification** — contextual evidence attached to a recipient, route, Coin Card, transaction, or receipt.
- **System** — compact operational support containing wallet, network, contracts, status, settings, security, installation, help, and disclosures.

These five concepts do not become five equal tabs.

Transfer remains the center of gravity. Recipients and Activity are persistent destinations because they support repeated work. Verification and System remain contextual or compact support layers.

“Persistent destination” means consistently reachable within portal navigation. It does not require server-side persistence, user accounts, custodial storage, cloud recipient storage, or remotely retained transaction history.

Recipients and Activity storage and retention are separate future architecture decisions. This contract only establishes navigation roles and reachability.

## 3. Authority and precedence

This contract governs portal information architecture and presentation hierarchy only. It does not supersede Coin Card verification, trusted-key, lifecycle, wallet, fee, transaction, integrity, or execution-authorization contracts.

When presentation convenience conflicts with an authoritative safety or execution rule, the authoritative rule controls.

## 4. Authoritative state

The portal must maintain one authoritative transaction state shared across portal views.

The contract prohibits:

- independent transfer-state copies per destination;
- reconstructing transfer state from presentation markup;
- clearing transfer state merely because the user changes views;
- view components becoming execution authorities.

## 5. State preservation

An unfinished transfer must survive:

- opening Recipients;
- opening Activity;
- inspecting verification evidence;
- opening and closing System;
- responsive navigation changes;
- orientation changes;
- ordinary collapse and expansion.

Navigation preserves user intent. It does not freeze volatile wallet truth.

Preserved user intent includes:

- selected recipient;
- selected asset or route intent;
- entered amount;
- optional memo or recipient label;
- current review progression where still valid.

Refreshed live facts include:

- connected account;
- chain ID;
- balance and available funds;
- provider availability;
- route availability;
- credential and verification state;
- pending or completed transaction state.

Frozen authorization evidence is limited to the specific wallet and execution snapshot captured for an authorization attempt. That evidence remains governed by the execution-authorization contract and may not be reused after its validity conditions change.

Returning to Transfer must restore the same preserved user intent unless an authoritative underlying fact changed.

Volatile facts must be refreshed rather than blindly preserved. At minimum, that includes:

- wallet connection;
- chain ID;
- balances;
- funds;
- credential state;
- route availability;
- execution status.

## 6. Interruption policy

Only conditions that make execution unsafe, impossible, or dependent on explicit user action may interrupt the Transfer workflow.

Classify portal facts into these buckets:

- blocking execution condition;
- actionable warning;
- contextual advisory;
- passive informational state.

Legitimate blockers include:

- wallet unavailable or disconnected when required;
- wrong or unknown network;
- insufficient funds;
- invalid or unresolved recipient;
- failed integrity or verification state where execution policy forbids proceeding;
- stale or conflicting execution authorization;
- transaction already pending where duplicate submission would be unsafe.

Ordinary diagnostics, educational material, telemetry, legal content, and noncritical status information must not interrupt Transfer.

## 7. Primary Transfer surface

The primary operational surface must show:

- recipient;
- asset;
- route and network;
- amount recipient receives;
- platform fee;
- total from wallet;
- wallet state;
- available funds;
- recipient or Coin Card trust state;
- execution readiness;
- review and authorization state;
- pending, success, failure, or receipt outcome.

The surface must distinguish always-visible facts from expandable detail.

## 8. Contextual Verification

Verification must remain attached to the object it evaluates.

It may open as a drawer, sheet, disclosure, evidence panel, or dedicated detail view, but it must preserve surrounding context and must not become a disconnected general-purpose destination.

Verification evidence must never overwrite or independently determine execution state outside the existing verification and authorization authorities.

## 9. Compact System layer

System may expose:

- wallet connection and identity;
- active network;
- route and contract information;
- service and registry status;
- security information;
- installation controls;
- appearance or portal settings;
- support, legal, and disclosures.

System must not become the place where critical blockers are hidden. Blocking facts must surface at the point of action.

## 10. Responsive equivalence

Mobile and desktop may use different navigation presentations, such as a bottom bar, rail, menu, drawer, or contextual sheet.

They must preserve:

- the same destination hierarchy;
- the same authoritative state;
- the same blocking rules;
- the same evidence;
- the same execution authority.

Responsive adaptation must not create different product semantics.

## 11. Prohibited implementations

The portal must not:

- become five equal primary tabs;
- convert each current DOM section into a separate destination;
- replace one long scrolling page with several long scrolling pages;
- duplicate transfer forms;
- add view-local execution logic;
- clear transfer state on navigation;
- hide critical warnings only inside System;
- force users through Verification before ordinary navigation;
- treat presentation state as financial or execution truth;
- change execution authority as part of information-architecture work.

## 12. Implementation sequence

Freeze this order:

1. inventory existing portal facts and their authorities;
2. define a presentation projection for intent-based views;
3. add navigation while preserving the existing Transfer surface;
4. prove transfer-state preservation;
5. move Recipients and Activity into persistent destinations;
6. attach Verification contextually;
7. compact System support;
8. remove obsolete long-page presentation only after parity is proven.

## 13. Acceptance criteria

Future tests should prove:

- Transfer is the default destination;
- switching destinations preserves unfinished transfer intent;
- volatile wallet facts refresh correctly;
- no destination owns a separate transaction state;
- only genuine blockers interrupt execution;
- Verification remains contextual;
- System remains compact;
- mobile and desktop expose equivalent capabilities;
- execution authority remains unchanged.
