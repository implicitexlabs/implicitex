# Portal Destination Composition Contract V1

## 1. Purpose

This contract defines how canonical portal surfaces compose into visible destinations before any navigation controller changes presentation.

It is governed by:

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`;
- `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`;
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`;
- `PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`.

Committed runtime anchors:

- `ebb8e33` — `feat: add portal view state`;
- `65fcfab` — `feat: add portal view projection`;
- `92fd61d` — `feat: add portal surface registry`.
- `5b0c60c` — `feat: add recipients destination shell`.
- `1c01ebe` — `feat: register coin card intake as transfer surface`.
- `9a3daa3` — `feat: add activity destination shell`.
- `2285218` — `feat: register global network surface`.

This contract distinguishes:

- canonical surface ownership;
- destination composition;
- visibility behavior;
- contextual-layer behavior;
- containment inheritance;
- unresolved DOM islands.

It does not redefine fact authority, storage authority, wallet authority, Coin Card authority, receipt authority, or execution authority.

## 2. Current Canonical Registry

The committed Portal Surface Registry V1 declares this canonical ownership:

```text
TRANSFER:
  #ccIntake
  #companion
  #transferMod

RECIPIENTS:
  #recipientsMod

ACTIVITY:
  #activityMod

VERIFICATION:
  #verificationMod

SYSTEM:
  #portalFooter
  #telemetry
```

`#recipientsMod` is a dedicated empty/unavailable shell. It introduces no
recipient-data behavior.

The following islands are deliberately unresolved and must not be silently
assigned by a visibility controller:

```text
#recipientIntel
```

`#recipientIntel` is current-recipient context within the active transfer flow.

The network root's presentation ownership is resolved as `GLOBAL / NETWORK`.
Its internal Transfer/System fact partition remains deferred and does not make
the root structurally unresolved.

A registered surface must not rely for visibility on an ancestor registered to a different primary surface when that ancestor may become inactive.

`#ccIntake` is a Transfer-context island inside `#modules`, positioned outside
`#transferMod`. Its first resolution was registration in place by
`1c01ebe`, which added `data-portal-primary-surface="TRANSFER"` to the existing
island. That slice did not move, clone, wrap, or otherwise relocate
`#ccIntake` into `#transferMod`. It communicates Coin Card handoff context for
the active transfer, is not a complete Recipients destination, does not
inherit visibility from `#transferMod`, and must be treated as a Transfer
surface for destination visibility.

## 3. Composition Rules

Destination composition determines which registered surfaces appear together when a primary destination is selected.

Composition is not ownership. A destination may show facts from multiple authorities, but every fact keeps the authority defined in the inventory.

Composition is not projection. A fact may later be projected into a supporting layer, but this contract governs which DOM islands may be made visible or inactive by a presentation controller.

Composition is not execution policy. Transfer blockers remain governed by the applicable transaction, wallet, Coin Card, integrity, and execution-authorization authorities.

## 4. Primary Destinations

### Transfer

When the primary destination is `TRANSFER`, the composition includes:

- `#transferMod`;
- `#companion`;
- `#ccIntake`;
- any unregistered descendant contained inside `#transferMod`, including `#recipientIntel`, through containment inheritance only.

Transfer is the default launch destination and remains the primary workspace. It must remain the place where execution blockers surface at the point of action.

### Recipients

When the primary destination is `RECIPIENTS`, the composition includes:

- the registered dedicated Recipients shell `#recipientsMod`.

The shell is currently an empty/unavailable state and introduces no recipient-
data behavior.

The initial Recipients-shell slice introduces no recipient persistence,
recipient list, recent-recipient cache, import, scanning, Coin Card intake,
address adoption, or other recipient-data behavior. Those capabilities require
separate implementation slices and evidence.

The shell may later contain local recipient-book entries, imported recipient
records, scanned recipients, recent recipient suggestions, and Coin Card route
intake. It must preserve the browser-local, non-custodial data boundary unless
a separate storage contract explicitly changes that boundary.

The implementation must not silently reuse `#ccIntake` or `#recipientIntel` as
the complete Recipients destination. `#ccIntake` is now a registered Transfer
surface, and `#recipientIntel` remains current Transfer context. `#recipientIntel`
may only become Recipients content after an explicit refactor and registry
update.

### Activity

When the primary destination is `ACTIVITY`, the composition includes:

- the registered dedicated Activity shell `#activityMod`;
- `#receiptHistory` as an unregistered historical-content child inside that shell.

`#companion` remains Transfer-owned active transaction status. It must not be treated as Activity merely because it contains transaction state.

Pending or current transaction state belongs with Transfer. Historical receipts, hashes, and evidence retrieval belong with Activity. Historical evidence does not independently block a new transfer, though it may link to a current blocker or show an actionable warning.

`#receiptHistory` was moved intact into `#activityMod` by `9a3daa3`. Its stable ID, existing classes, accessibility structure, empty-state markup, and direct receipt-render lookup were preserved. Receipt rendering continues to resolve `#receiptHistory` directly and does not depend on its former parent. No receipt, transaction, or execution authority changed.

`#receiptHistory` no longer depends for visibility on a Transfer-owned ancestor. A registered surface must not rely for visibility on an ancestor registered to a different primary destination when that ancestor may become inactive.

## 5. Containment Inheritance

Unregistered descendants inherit visibility from their nearest registered ancestor only for presentation containment.

If `#transferMod` is inactive, descendants inside it may become inactive because their registered ancestor is inactive. That inheritance does not independently register those descendants, and no controller may infer surface ownership from containment alone.

Applied examples:

- `#ccIntake` is a separate island under `#modules`. It does not inherit from
  `#transferMod`, and its first implementation was registration in place as
  `TRANSFER` by adding `data-portal-primary-surface="TRANSFER"` to the existing
  island. That slice did not move, clone, wrap, or otherwise relocate
  `#ccIntake` into `#transferMod`.
- `#recipientIntel` is an unregistered descendant of `#transferMod`. It
  inherits Transfer presentation visibility, but that inheritance does not
  independently register it.

Containment inheritance must never be used to manufacture a destination or to infer that a descendant owns transaction, recipient, verification, or execution state.

A registered surface may be structurally nested inside another element for markup reasons, but its visibility may not depend on an ancestor registered to a different primary surface if that ancestor can become inactive.

## 6. Network Module Partition

The existing network module remains globally visible and outside destination
hiding during the first navigation implementation. The explicit GLOBAL / NETWORK
representation is committed by `2285218` and defined by
`PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`.

Transfer-critical network facts include, at minimum:

- active chain and network condition;
- wrong-network or unknown-network blockers;
- route availability;
- contract address mismatch;
- paused or unavailable execution contract state;
- fee and total-debit readiness when network-dependent;
- current execution blocker summaries.

Expanded operational or diagnostic System detail may include:

- gas trend details;
- RPC latency;
- block and confirmation timing diagnostics;
- contract reference details;
- service status explanation;
- noncritical telemetry or guidance.

Every execution blocker must surface at the point of action in Transfer. System may explain or mirror a blocker but may not exclusively contain it.

The first visibility controller must not hide the existing network module under System.

The current network module must remain globally visible until a later explicit partition creates:

1. a Transfer-critical network/blocker region; and
2. a System diagnostic/detail region.

Only after that partition may the module be hidden or split between destinations.

## 7. Contextual Layers

Verification and System are contextual or supporting layers, not primary destinations.

Opening or closing a contextual layer must not alter the selected primary destination.

Allowed treatments include:

- drawer;
- sheet;
- disclosure;
- inline contextual panel;
- dedicated detail view that preserves surrounding context.

The exact visual styling is not frozen here. The behavioral requirements are:

- Verification remains attached to the recipient, route, Coin Card, transaction, receipt, or evidence object it evaluates.
- System remains compact operational support for wallet, network, contracts, status, settings, security, installation, help, and disclosures.
- Contextual layers may explain or mirror blockers, but Transfer remains the point-of-action blocker surface.
- Closing a contextual layer restores focus and presentation context to the invoking surface without clearing transfer intent.

## 8. Visibility Policy

Presentation-controller visibility and feature-owned visibility are distinct.

- Presentation-controller visibility is owned by the destination controller.
- Feature-owned visibility remains owned by existing product logic inside a destination.

The controller may change visibility only on registered surface roots or dedicated destination shells. It may remove only `hidden`, `inert`, `aria-hidden`, classes, styles, or other markers that it previously applied and owns.

The controller must not broadly reveal descendants when activating a surface.

Inactive primary surfaces should use an accessible visibility mechanism that prevents focus inside inactive content. The default implementation should prefer both:

- `hidden`, for removal from visual and accessibility presentation;
- `inert`, where supported or safely polyfilled, for interaction containment during transitions.

If a browser lacks safe `inert` support, the controller must still prevent keyboard focus and screen-reader ambiguity through an equivalent accessible mechanism.

Unregistered top-level islands must remain visible until they are explicitly resolved, registered, or governed by containment inheritance. A controller must not hide unregistered top-level content merely because it is not in the registry.

Existing conditional elements such as `#ccIntake` and `#recipientIntel` remain governed by their feature logic even while Transfer is active.

Controller initialization must capture or otherwise distinguish baseline presentation state so teardown or validation failure can restore only controller-owned presentation changes.

Globally persistent shell elements, such as the portal frame, application chrome, and any future primary navigation controls, are outside destination visibility unless explicitly registered.

Critical notices must remain reachable at the point of action even when their explanatory details live in System or Verification.

Visibility changes must not mutate:

- form values;
- selected recipient or amount intent;
- wallet state;
- Coin Card verification state;
- transaction preview or authorization state;
- receipts;
- local or session storage;
- URL or history state;
- execution state.

## 9. Accessibility and Interaction

Destination controls must be keyboard-operable and expose selected-state semantics appropriate to their final form, such as tabs, segmented controls, radio groups, or navigation buttons.

The controller must provide:

- clear screen-reader names for each destination and contextual layer;
- deterministic focus movement after destination changes;
- focus entry and focus return for contextual layers;
- no focusable controls inside hidden or inactive content;
- no keyboard trap inside contextual layers;
- reduced-motion behavior for any transition animation;
- semantic equivalence between mobile and desktop presentations.

Mobile may use a bottom bar, sheet, or compact menu. Desktop may use a rail, segmented control, or menu. Those presentations must preserve the same destination hierarchy and authority boundaries.

## 10. Scroll and State Preservation

Each primary destination may preserve its own scroll position, but scroll restoration must never clear, rebuild, or derive transfer state.

Initial destination selection should focus or scroll to the destination heading or primary work region without forcing users through unrelated diagnostics.

Closing a contextual layer should restore focus to the invoking control or nearest stable surface location. It should not reset the primary destination scroll position unless a separate accessibility reason requires it.

View changes must preserve unfinished transfer intent according to the information-architecture contract. Volatile wallet and network facts must refresh from their authorities rather than being frozen by presentation state.

## 11. Failure and Fallback Behavior

Failures must expose uncertainty rather than silently falling back to a misleading surface.

If a required registered surface is missing, the visibility controller must fail closed and leave the existing page presentation unchanged.

Visible destination navigation cannot ship until:

- the Recipients shell exists and is registered — satisfied by `5b0c60c`;
- `#ccIntake` is explicitly registered in place as `TRANSFER` — satisfied by `1c01ebe`;
- the Activity shell exists and is registered — satisfied by `9a3daa3`;
- `#receiptHistory` is placed within the Activity shell — satisfied by `9a3daa3`;
- the network module has explicit GLOBAL registration — satisfied by `2285218`.

If Recipients has no implemented destination, Recipients navigation must not be enabled as an ordinary destination. The product may show a deliberate unavailable state only after a dedicated Recipients shell exists and is registered.

If registry validation fails, no destination hiding should be applied.

If a contextual surface is unavailable, the contextual control must be disabled, absent, or report the unavailable state without changing the primary destination.

If an execution blocker exists while another destination is selected, Transfer must surface the blocker at the point of action and the portal may show a non-destructive warning, badge, or return-to-Transfer affordance. The blocker must not be hidden exclusively in System, Verification, Activity, or Recipients.

## 12. Prohibited Implementations

The portal must not:

- turn Verification or System into primary destinations;
- revive a five-equal-tab model;
- fabricate Recipients from `#ccIntake` or `#recipientIntel`;
- hide Transfer-critical network blockers in System;
- treat `#companion` as Activity;
- infer ownership from DOM order, text content, classes, or visibility;
- infer ownership from containment inheritance;
- hide unregistered top-level islands without an explicit resolution;
- mutate product state as a side effect of visibility changes;
- create duplicate transaction state per destination;
- change wallet, Coin Card, receipt, storage, or execution authority.

## 13. Implementation Sequence

Freeze this order:

1. dedicated Recipients shell — completed by `5b0c60c`;
2. register `#ccIntake` explicitly in place as `TRANSFER` — completed by `1c01ebe`;
3. add and register the Activity shell and place `#receiptHistory` within it — completed by `9a3daa3`;
4. add explicit GLOBAL / NETWORK registration for the existing mixed network module — completed by `2285218`;
5. add the presentation-only visibility controller;
6. add accessible primary navigation controls;
7. partition network facts in a later explicit slice;
8. add contextual Verification and System controls;
9. conduct mobile and desktop state-preservation QA.

## 14. Acceptance Criteria

Future implementation work must prove:

- no fact authority or execution authority is redefined;
- no five-equal-tab model is introduced;
- Transfer blockers remain at the point of action;
- `#recipientsMod` exists as a dedicated empty/unavailable shell and is not fabricated from Transfer fragments;
- `#ccIntake` is explicitly registered in place as `TRANSFER` — already completed by `1c01ebe`;
- `#activityMod` is the sole registered Activity root;
- `#receiptHistory` is its unregistered historical-content child;
- `#receiptHistory` no longer depends on Transfer ancestry;
- current and historical transaction states remain distinct;
- receipt rendering remains keyed to the stable `#receiptHistory` identity;
- visibility changes cannot mutate product state;
- contextual layers preserve the primary destination;
- `#recipientIntel` is the only unresolved island;
- the network module is explicitly registered as GLOBAL / NETWORK and is no
  longer structurally unresolved;
- the later Transfer/System network fact partition remains deferred;
- mobile and desktop remain semantically equivalent.

## 15. Open Questions

None for the first visibility-controller implementation.
