# Portal Destination Composition Contract V1

## 1. Purpose

This contract defines how canonical portal surfaces compose into visible destinations before any navigation controller changes presentation.

It is governed by:

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`;
- `PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`;
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`.

Committed runtime anchors:

- `ebb8e33` — `feat: add portal view state`;
- `65fcfab` — `feat: add portal view projection`;
- `92fd61d` — `feat: add portal surface registry`.

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
  #companion
  #transferMod

RECIPIENTS:
  none

ACTIVITY:
  #receiptHistory

VERIFICATION:
  #verificationMod

SYSTEM:
  #portalFooter
  #telemetry
```

The following islands are deliberately unresolved and must not be silently assigned by a visibility controller:

```text
#ccIntake
#recipientIntel
network module
```

`#ccIntake` is currently Coin Card handoff context within the active transfer flow.

`#recipientIntel` is current-recipient context within the active transfer flow.

The current network module mixes Transfer-critical network facts with operational and diagnostic System detail.

A registered surface must not rely for visibility on an ancestor registered to a different primary surface when that ancestor may become inactive.

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
- any unregistered descendant contained inside `#transferMod`, including `#ccIntake` and `#recipientIntel`, through containment inheritance only.

Transfer is the default launch destination and remains the primary workspace. It must remain the place where execution blockers surface at the point of action.

### Recipients

When the primary destination is `RECIPIENTS`, the registry currently has no canonical destination island to display.

The first implementation must provide a dedicated Recipients destination shell before visible Recipients navigation ships. That shell may initially present a staged unavailable or empty state, but it must be its own registered Recipients surface.

The initial Recipients-shell slice introduces no recipient persistence,
recipient list, recent-recipient cache, import, scanning, Coin Card intake,
address adoption, or other recipient-data behavior. Those capabilities require
separate implementation slices and evidence.

The shell may later contain local recipient-book entries, imported recipient records, scanned recipients, recent recipient suggestions, and Coin Card route intake. It must preserve the browser-local, non-custodial data boundary unless a separate storage contract explicitly changes that boundary.

The implementation must not silently reuse `#ccIntake` or `#recipientIntel` as the complete Recipients destination. Those elements are current Transfer context and may only become Recipients content after an explicit refactor and registry update.

`#ccIntake` and `#recipientIntel` remain Transfer-contained context. They are not the first Recipients shell.

### Activity

When the primary destination is `ACTIVITY`, the composition includes:

- a dedicated Activity shell outside `#transferMod`;
- `#receiptHistory` moved or structurally wrapped into that shell;
- future Activity-specific receipt and evidence retrieval regions once explicitly registered.

`#companion` remains Transfer-owned active transaction status. It must not be treated as Activity merely because it contains transaction state.

Pending or current transaction state belongs with Transfer. Historical receipts, hashes, and evidence retrieval belong with Activity. Historical evidence does not independently block a new transfer, though it may link to a current blocker or show an actionable warning.

The Activity shell must be created and registered before visible navigation ships. A registered Activity surface must not depend for visibility on a Transfer-owned ancestor.

## 5. Containment Inheritance

Unregistered descendants inherit visibility from their nearest registered ancestor only for presentation containment.

If `#transferMod` is inactive, descendants inside it may become inactive because their registered ancestor is inactive. That inheritance does not independently register those descendants, and no controller may infer surface ownership from containment alone.

Applied examples:

- `#ccIntake` may disappear when `#transferMod` is inactive because it is contained by the Transfer surface. It remains unresolved and is not a Recipients surface.
- `#recipientIntel` may disappear when `#transferMod` is inactive because it is contained by the Transfer surface. It remains current-recipient context and is not a Recipients surface.

Containment inheritance must never be used to manufacture a destination or to infer that a descendant owns transaction, recipient, verification, or execution state.

A registered surface may be structurally nested inside another element for markup reasons, but its visibility may not depend on an ancestor registered to a different primary surface if that ancestor can become inactive.

## 6. Network Module Partition

The existing network module remains globally visible and outside destination hiding during the first navigation implementation.

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

- the Recipients shell exists and is registered;
- the Activity shell exists and no longer depends on a Transfer-owned ancestor;
- the network module is explicitly treated as globally persistent.

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

1. add and register the dedicated Recipients empty-state shell;
2. add and register the dedicated Activity shell and place `#receiptHistory` within it;
3. mark the unresolved network module as globally persistent for presentation purposes;
4. add the presentation-only visibility controller;
5. add accessible navigation controls;
6. partition network facts in a later explicit slice;
7. add contextual Verification and System controls;
8. conduct mobile and desktop state-preservation QA.

## 14. Acceptance Criteria

Future implementation work must prove:

- no fact authority or execution authority is redefined;
- no five-equal-tab model is introduced;
- Transfer blockers remain at the point of action;
- Recipients is not fabricated from Transfer fragments;
- current and historical transaction states remain distinct;
- visibility changes cannot mutate product state;
- contextual layers preserve the primary destination;
- unresolved islands are explicitly governed;
- the network module is partitioned or kept globally visible before hiding System;
- mobile and desktop remain semantically equivalent.

## 15. Open Questions

None for the first visibility-controller implementation.
