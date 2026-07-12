# Portal Visibility Controller Activation Contract V1

## 1. Purpose

This contract defines the rollout boundary for the portal visibility controller.
The controller is presentation-only. It may become fully implemented before
navigation, but it must remain dormant on load.

Committed runtime anchor:

```text
369fd8f — feat: add dormant portal visibility controller
```

Completed:

- dormant visibility-controller runtime.

Not yet implemented:

- accessible primary navigation;
- first controller activation;
- contextual-layer visibility.

## 2. Committed Dormant Runtime Evidence

`369fd8f` committed exactly:

```text
app-web/frontend/public/js/portal-visibility-controller.js
app-web/tests/frontend/portal-visibility-controller.test.js
app-web/frontend/public/portal-index.html
app-web/frontend/public/css/main.css
```

The committed module:

- exports only `window.IX_PORTAL_VISIBILITY_CONTROLLER`;
- exposes the frozen API:

```text
apply(viewStateSnapshot)
restore()
getStatus()
```

- begins with `activated = false` and `primaryDestination = null`;
- does not invoke `apply()` during load;
- does not query the registry during load;
- does not read view-state authority during load;
- registers no event listeners;
- creates no navigation;
- adds no inactive marker;
- changes no focus or presentation.

The committed stylesheet rule is:

```css
[data-portal-controller-inactive] {
  display: none !important;
}
```

Static portal markup contains no inactive marker, so the rule has no effect
before explicit activation.

## 3. Dormant Means

Dormant means:

- loading the module changes no element visibility;
- it does not add or remove `data-portal-controller-inactive`;
- it does not add or remove `hidden`, `inert`, or `aria-hidden`;
- it does not add classes or inline styles;
- it does not move, clone, wrap, or rebuild surfaces;
- it does not register event listeners;
- it does not transition portal view state;
- it does not automatically react to projection metadata;
- it does not create visible controls;
- the existing long-page presentation remains intact.

The controller may mutate presentation only after explicit activation from a
later navigation coordinator.

## 4. Visible Activation Boundary

Accessible primary navigation and first controller activation must land
together in one later visible runtime slice.

That later slice must:

1. create reachable Transfer, Recipients, and Activity controls;
2. establish keyboard and selected-state semantics;
3. connect controls to the authoritative portal view-state transition;
4. update the view projection;
5. pass the resulting frozen view-state snapshot to the visibility controller;
6. activate destination hiding only after the controls are present and usable.

The controller must never automatically hide Recipients or Activity before
users have controls capable of returning to them.

## 5. Authority Boundary

The controller is presentation-only.

It may:

- consume a frozen portal view-state snapshot;
- consume or validate the committed surface-registry API;
- resolve registered descriptors to their existing DOM roots;
- apply or restore controller-owned presentation state.

It must not:

- select or transition the primary destination;
- open or close contextual layers;
- infer state from DOM order, classes, copy, or visual appearance;
- mutate view-state authority;
- mutate projection authority;
- mutate registry metadata;
- query wallet or network state;
- call Coin Card logic;
- read or write receipts;
- access storage, URL, or history;
- invoke execution authority.

The navigation coordinator owns sequencing. The controller owns only
application of an already-established primary destination.

## 6. Frozen Surface Behavior

After explicit activation, exactly one primary destination is active:

- `TRANSFER`
- `RECIPIENTS`
- `ACTIVITY`

Apply the complete registered root set for each destination:

```text
TRANSFER:
  #ccIntake
  #companion
  #transferMod

RECIPIENTS:
  #recipientsMod

ACTIVITY:
  #activityMod
```

Require:

- every root belonging to the selected destination is active;
- every registered root belonging to the other primary destinations is
  inactive;
- `#networkMod` remains untouched as `GLOBAL / NETWORK`;
- contextual Verification and System roots remain outside V1 primary-destination hiding;
- `#recipientIntel` inherits visibility through `#transferMod`;
- `#receiptHistory` inherits visibility through `#activityMod`;
- DOM order does not affect the result.

The V1 controller must not implement contextual-layer visibility.

## 7. Feature-Owned Versus Controller-Owned Visibility

`data-portal-controller-inactive` is reserved exclusively for
`IX_PORTAL_VISIBILITY_CONTROLLER`.

Requirements:

- static portal markup must not contain the marker;
- feature logic must not add, remove, copy, or interpret the marker;
- navigation logic must not mutate the marker directly;
- projection and view-state modules must not mutate the marker;
- only the visibility controller may add or remove it;
- marker presence is presentation state, not destination authority.

The controller may privately record the exact registered roots on which it
added `data-portal-controller-inactive`.

Marker ownership rules:

- a marker is controller-owned only when the controller added it during a
  successful presentation transaction and the root is present in the controller's
  private ownership record;
- before first successful activation, no registered primary root may already
  carry the marker;
- an unowned marker on any registered primary root is a deterministic conflict;
- the controller must not adopt or remove an unowned marker;
- reactivating a root removes the marker only from roots recorded as
  controller-owned;
- restoration removes markers only from controller-owned roots;
- the controller never broadly reveals descendants;
- it never clears child-level feature visibility.

Apply this explicitly to `#ccIntake`:

- `#ccIntake` is a registered Transfer root;
- its existing `hidden` attribute is feature-owned;
- activating Transfer must not reveal it;
- leaving and returning to Transfer must not remove its feature-owned `hidden`;
- Coin Card handoff logic remains the only authority that reveals or hides it
  for feature reasons.

Do not require `aria-hidden` in V1 unless later accessibility evidence
demonstrates that the controller-owned inactive marker plus feature-owned
visibility semantics is insufficient.

## 8. Dormant Controller API

Freeze a single future browser global:

- `window.IX_PORTAL_VISIBILITY_CONTROLLER`

The controller must not export additional globals.

Define the minimum API:

```text
apply(viewStateSnapshot)
restore()
getStatus()
```

### `apply(viewStateSnapshot)`

- requires a valid frozen portal view-state snapshot;
- accepts the already-established `primaryDestination`;
- validates the complete surface registry before mutation;
- verifies no global or contextual root carries the controller marker;
- verifies no registered primary root carries an unowned marker;
- computes the full visibility transaction before changing the DOM;
- applies the selected primary destination;
- does not transition view state;
- does not alter contextual-layer state;
- does not add `data-portal-controller-inactive` to an active root;
- returns a fresh immutable status snapshot.

### `restore()`

- restores the long-page presentation;
- removes only controller-owned `data-portal-controller-inactive`;
- preserves feature-owned state;
- does not change view state or projection metadata;
- is idempotent.

### `getStatus()`

Returns a fresh immutable descriptor such as:

```text
{
  activated,
  primaryDestination
}
```

It must expose no live element, WeakMap, mutation record, or authority object.

## 9. Transaction and Failure Behavior

Require an all-or-nothing presentation transaction.

Before mutation:

- validate the registry;
- require all three primary destinations;
- require the committed global NETWORK root;
- resolve every registered selector;
- confirm every selector resolves to the registered stable ID;
- confirm the supplied view-state snapshot is valid.

If any precondition fails:

- perform no visibility mutation;
- remain dormant or preserve the last successfully applied state;
- expose a deterministic error;
- keep the long-page presentation intact when no successful activation has occurred.

If a preflight marker conflict is detected, the controller must fail with:

```text
portal-visibility-marker-conflict
```

On marker conflict:

- perform no DOM mutation;
- preserve the last successful status;
- preserve authoritative view state and projection;
- do not alter focus;
- do not silently adopt the foreign marker.

If an unexpected mutation failure occurs partway through application:

- roll back controller-owned inactive-marker mutations from that transaction;
- preserve feature-owned visibility;
- do not modify the authoritative view-state snapshot;
- expose deterministic failure rather than leaving a half-applied destination.

A failed registry rescan must not cause the controller to use stale or guessed ownership.

## 10. Global and Contextual Protection

The controller must never add or remove the inactive marker on:

```text
GLOBAL:
  #networkMod

CONTEXTUAL:
  #verificationMod
  #portalFooter
  #telemetry
```

V1 primary visibility application must leave those roots exactly as it found them.

This does not make contextual roots globally persistent forever. Their later
behavior belongs to the contextual-layer implementation.

## 11. Initial Page Behavior

Before visible navigation and explicit activation:

```text
activated = false
primaryDestination = null
```

The default view-state destination may remain `TRANSFER`, but that fact alone
must not trigger hiding.

Projection metadata alone must not trigger hiding.

Script load order alone must not trigger hiding.

The existing long-page presentation remains the fallback and pre-activation state.

## 12. Later Navigation Coordinator

Freeze the future activation sequence:

```text
user intent
  → portal view-state transition
  → frozen state snapshot
  → view projection update
  → navigation selected-state update
  → focus move away from inactive content when needed
  → visibility controller apply(snapshot)
  → optional focus to newly active destination after success
```

The coordinator must not:

- derive the destination from currently visible DOM;
- call controller mutation before the state transition succeeds;
- leave selected navigation state inconsistent with the applied destination;
- silently fall back to Transfer after a failed transition.

Failure must preserve or restore a coherent prior presentation.

If focus is inside a root that will become inactive, the coordinator must move
focus to the selected navigation control before calling `apply(snapshot)`.
After a successful application, it may move focus to the newly active
destination heading or stable work region.

## 13. Accessibility Requirements

The dormant controller adds no focus behavior.

After activation:

- if focus is inside a root about to become inactive, the later navigation coordinator must move focus to the newly selected destination heading or stable work region;
- if `document.activeElement` is inside a root the controller intends to
  deactivate, `apply()` must fail deterministically with no marker mutation;
- the controller itself must not invent focus destinations;
- restoration must not force focus;
- reduced-motion behavior belongs to the later visible-navigation slice;
- mobile and desktop must use the same semantic destination state.

## 14. Runtime Implementation Sequence

Freeze:

1. define visibility-controller activation contract — completed by `de7610d`, hardened by `544666d`
2. implement dormant visibility controller with focused tests — completed by `369fd8f`
3. sync documentation after dormant controller commit — completed by `7895ac5` and this committed-evidence follow-up
4. implement accessible primary navigation and first controller activation atomically
5. conduct mobile and desktop destination/state-preservation QA
6. partition network facts in a later explicit slice
7. implement contextual Verification and System presentation

## 15. Acceptance Criteria

The contract must prove:

- the controller is dormant on load;
- no controller inactive marker exists before explicit activation;
- long-page presentation remains unchanged before explicit activation;
- view-state default `TRANSFER` does not itself cause hiding;
- projection metadata does not itself cause hiding;
- the controller consumes state but cannot transition it;
- navigation and first activation land together later;
- all registered roots for the selected primary destination are handled together;
- inactive primary roots receive controller-owned inactive markers;
- global and contextual roots remain untouched;
- the controller never mutates `hidden`, `inert`, or `aria-hidden`;
- feature-owned `hidden` on `#ccIntake` is preserved;
- the controller removes only the inactive marker it owns;
- an unowned marker fails with `portal-visibility-marker-conflict`;
- the marker namespace is reserved exclusively for the controller;
- static markup contains no inactive marker;
- `restore()` is idempotent;
- failures do not leave partial presentation;
- focus conflicts fail before mutation;
- no wallet, Coin Card, receipt, storage, network, URL, or execution authority is added;
- mobile and desktop retain equivalent semantics.

## 16. Validation Evidence

The committed dormant runtime is supported by:

- portal visibility controller: 23 tests passed
- portal surface registry: 18 tests passed
- portal view projection: 14 tests passed
- portal view state: 11 tests passed
- Coin Card evidence: 8 tests passed
- IX execution: 6 tests passed
- observability: passed
- static public validation: passed
- architecture validation: passed
- git diff check: passed

## 17. Files and Maps

Add canonical and mirrored copies:

```text
docs/product/portal/PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md
app-web/docs/product/portal/PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md
```

Cross-link it from:

```text
docs/product/portal/PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md
app-web/docs/product/portal/PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md
```

Update:

```text
docs/product/portal/README.md
app-web/docs/product/portal/README.md
docs/README.md
README.md
```

Keep canonical and mirrored contracts byte-identical.
