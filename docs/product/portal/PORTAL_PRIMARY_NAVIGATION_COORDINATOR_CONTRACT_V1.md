# Portal Primary Navigation Coordinator Contract V1

## 1. Purpose

This contract defines the visible primary-destination navigation and the first
visibility-controller activation boundary. It is documentation-only. The
navigation exists statically but remains `hidden` until the coordinator
successfully performs first activation.

It does not govern contextual Verification or System controls, network-fact
partitioning, wallet or execution state, recipient or receipt storage, or URL
routing and browser history.

Committed anchors:

- `ebb8e33` — `feat: add portal view state`;
- `65fcfab` — `feat: add portal view projection`;
- `92fd61d` — `feat: add portal surface registry`;
- `2285218` — `feat: register global network surface`;
- `369fd8f` — `feat: add dormant portal visibility controller`;
- `271a492` — `docs: record dormant visibility controller evidence`;
- `799340d` — `docs: define atomic portal view projection`;
- `f73a616` — `docs: harden portal projection atomicity contract`;
- `ac475b2` — `feat: make portal view projection atomic`;
- `f831da5` — `docs: sync portal contracts after atomic projection`.

Governing contracts:

- `PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`;
- `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`;
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`;
- `PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md`;
- `PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`.

## 2. Authority Model

```text
IX_PORTAL_VIEW_PROJECTION
  sole live projected-state owner

IX_PORTAL_VISIBILITY_CONTROLLER
  primary-surface visibility authority

IX_PORTAL_NAVIGATION_COORDINATOR
  user-intent, navigation-selected-state, focus, and compensation coordinator
```

The coordinator must not:

- create an independent current-destination store;
- call `IX_PORTAL_VIEW_STATE` directly;
- infer state from DOM order;
- infer state solely from `aria-current`;
- modify registered surface ownership;
- transition contextual layers.

A retained prior frozen projection snapshot is transaction evidence, not a
second state authority.

## 3. Navigation Markup

The future navigation root is:

```html
<nav
  id="portalPrimaryNav"
  class="portal-primary-nav"
  aria-label="Portal destinations"
  hidden
>
```

Requirements:

- first direct child of `#modules`;
- immediately before `#ccIntake`;
- outside every registered primary, contextual, and global root;
- unregistered in `IX_PORTAL_SURFACE_REGISTRY`;
- full-width across the portal grid;
- presentation coordination only.

It must not:

- wrap or move existing surfaces;
- become a primary destination itself;
- receive a controller inactive marker;
- alter GLOBAL / NETWORK placement.

The navigation remains `hidden` until first activation succeeds. If JavaScript
is unavailable or coordinator initialization fails, the long-page portal
remains available and the static navigation stays hidden.

## 4. Controls

The navigation contains exactly three native buttons:

```text
#portalNavTransfer
  data-portal-navigation-destination="TRANSFER"
  text: Transfer

#portalNavRecipients
  data-portal-navigation-destination="RECIPIENTS"
  text: Recipients

#portalNavActivity
  data-portal-navigation-destination="ACTIVITY"
  text: Activity
```

Every control must use:

```html
type="button"
```

Transfer may carry the initial static:

```html
aria-current="page"
```

because it matches the committed default projection, but the entire navigation
remains hidden until successful coordinator activation.

The coordinator owns:

- `aria-current` on these three buttons;
- navigation-root `hidden`;
- navigation status copy;
- button event listeners.

The visibility controller does not own those attributes.

## 5. Semantics

Do not use:

- `role="tablist"`;
- `role="tab"`;
- `role="tabpanel"`;
- `aria-controls`.

Rationale:

- Transfer maps to multiple registered roots;
- global and contextual roots remain visible outside the primary switch;
- there is no truthful one-control/one-tabpanel relationship;
- tab semantics would require structural wrappers or misleading associations.

Native button keyboard behavior is sufficient:

- Tab and Shift+Tab move among controls;
- Enter and Space activate the focused button;
- no custom arrow-key or roving-tabindex system is introduced.

## 6. Progressive Enhancement

Static markup must keep `#portalPrimaryNav hidden` before coordinator success.
Therefore:

```text
JavaScript unavailable or coordinator initialization fails
  → navigation remains hidden
  → visibility controller remains dormant or is restored
  → current long-page portal remains available
```

The navigation must not become visible before the first controller activation
succeeds.

## 7. Coordinator Module

The future runtime module is:

```text
app-web/frontend/public/js/portal-navigation-coordinator.js
```

It must load:

- after `portal-view-projection.js`;
- after `portal-surface-registry.js`;
- after `portal-visibility-controller.js`;
- before `wallet.js`;
- before `app.js`.

It exports one frozen browser global:

```text
window.IX_PORTAL_NAVIGATION_COORDINATOR
```

Public API:

```text
selectPrimaryDestination(destination)
getStatus()
```

Do not add:

```text
setState
replaceState
restoreState
openContextualLayer
closeContextualLayer
```

## 8. Coordinator Status

`getStatus()` returns a fresh frozen object:

```text
available
transitioning
primaryDestination
lastErrorCode
```

Rules:

- `primaryDestination` is read from `IX_PORTAL_VIEW_PROJECTION.getState()`;
- it is not retained as a second private current-state value;
- `available` is coordinator lifecycle status;
- `transitioning` is a synchronous reentrancy guard;
- `lastErrorCode` is coordinator diagnostic status;
- no DOM roots, authority objects, or mutable records are exposed.

Before successful initialization:

```text
available = false
transitioning = false
primaryDestination = TRANSFER
lastErrorCode = null
```

If current projection state cannot be read safely, `primaryDestination` may be
`null`.

## 9. Preflight

Before any initialization mutation, require:

- projection global exists and exposes its committed frozen API;
- visibility-controller global exists and exposes its committed frozen API;
- surface registry exists and validates successfully;
- `#modules` exists;
- `#portalPrimaryNav` exists as the first direct child of `#modules`;
- exactly three expected buttons exist;
- button IDs, destination values, text roles, and `type="button"` agree;
- navigation is outside registered roots;
- no unexpected fourth destination control exists;
- static navigation is hidden;
- exactly one initial `aria-current="page"` agrees with the projected destination.

Complete validation must occur before controller activation, navigation reveal,
selected-state mutation, or focus movement.

Deterministic failures:

- `portal-navigation-authority-missing`;
- `portal-navigation-authority-malformed`;
- `portal-navigation-structure-invalid`;
- `portal-navigation-state-conflict`.

## 10. First Activation

The coordinator initializes once after module load.

First-activation sequence:

1. complete authority and structure preflight;
2. retain:

```text
initialProjectionSnapshot =
  IX_PORTAL_VIEW_PROJECTION.getState()

initialControllerStatus =
  IX_PORTAL_VISIBILITY_CONTROLLER.getStatus()
```

3. capture exact initial navigation representation:

- navigation-root `hidden` presence and value;
- every button’s `aria-current` presence and value;
- status-region hidden/text state;
4. require the initial projected destination to be supported;
5. transactionally prepare exactly one matching navigation selection;
6. call:

```text
IX_PORTAL_VISIBILITY_CONTROLLER.apply(
  initialProjectionSnapshot
)
```

7. only after controller success:

- commit the matching `aria-current="page"`;
- remove `hidden` from `#portalPrimaryNav`;
- set coordinator availability to true.

Visible commit order:

```text
projection already coherent
→ controller applies coherent primary visibility
→ navigation selected state becomes coherent
→ navigation is revealed
```

## 11. Initialization Failure Recovery

If first activation fails:

- navigation remains hidden;
- exact initial `aria-current` representation is restored;
- projection remains unchanged;
- controller presentation is restored according to its prior status;
- the long-page portal remains available;
- coordinator status records failure;
- no destination control becomes reachable.

Controller restoration:

```text
initialControllerStatus.activated === false:
  IX_PORTAL_VISIBILITY_CONTROLLER.restore()

initialControllerStatus.activated === true:
  IX_PORTAL_VISIBILITY_CONTROLLER.apply(
    initialProjectionSnapshot
  )
```

Deterministic failures:

- `portal-navigation-initialization-failed`;
- `portal-navigation-compensation-failed`.

A compensation failure must not be represented as a successful long-page
restoration.

## 12. Destination Selection

`selectPrimaryDestination(destination)` must:

1. reject unsupported destinations with `portal-navigation-destination-invalid`;
2. reject use while unavailable;
3. reject or deterministically ignore synchronous reentrancy;
4. resolve the exact destination button;
5. retain:

```text
priorProjectionSnapshot =
  IX_PORTAL_VIEW_PROJECTION.getState()

priorControllerStatus =
  IX_PORTAL_VISIBILITY_CONTROLLER.getStatus()
```

6. capture exact prior navigation selected-state representation;
7. move focus to the requested navigation button before closing any current
   destination roots;
8. transition projection through:

```text
nextSnapshot =
  IX_PORTAL_VIEW_PROJECTION.setPrimaryDestination(
    destination
  )
```

9. apply visibility:

```text
IX_PORTAL_VISIBILITY_CONTROLLER.apply(
  nextSnapshot
)
```

10. only after controller success, transactionally commit exactly one
    `aria-current="page"`;
11. leave focus on the requested navigation button;
12. clear previous recoverable status;
13. return a fresh frozen status snapshot.

The coordinator must never call a view-state transition directly.

## 13. Same-Destination Behavior

Selecting the already-current destination:

- focuses its navigation button;
- performs no projection transition;
- performs no visibility-controller mutation;
- performs no unnecessary `aria-current` write when selected state is already coherent;
- returns successful frozen status.

If projection, controller status, and navigation selected state disagree, fail
with `portal-navigation-state-conflict`.

## 14. Selected-State Transactions

Before changing navigation selection, capture for all three buttons:

- `aria-current` existed;
- exact prior value;
- desired representation.

Success representation:

```text
selected button:
  aria-current="page"

unselected buttons:
  aria-current absent
```

Changes must be:

- deterministic;
- change-aware;
- applied in stable button order;
- rolled back in reverse order after failure;
- restored to exact prior presence and value.

Deterministic failure:

- `portal-navigation-selected-state-failed`.

A selected-state failure after controller success triggers complete
cross-authority compensation.

## 15. Cross-Authority Compensation

If projection succeeds but controller application fails:

1. restore projection:

```text
IX_PORTAL_VIEW_PROJECTION.setPrimaryDestination(
  priorProjectionSnapshot.primaryDestination
)
```

2. restore controller:

```text
initialControllerStatus.activated === false:
  IX_PORTAL_VISIBILITY_CONTROLLER.restore()

initialControllerStatus.activated === true:
  IX_PORTAL_VISIBILITY_CONTROLLER.apply(
    priorProjectionSnapshot
  )
```

3. restore exact prior navigation selected-state representation;
4. preserve the previous committed navigation selection;
5. report `portal-navigation-transition-failed`.

The same compensation sequence applies when navigation selected-state mutation
fails after both projection and controller succeeded.

Compensation itself can fail. On compensation failure:

- attempt every remaining compensation step;
- retain all original and compensation errors diagnostically;
- set coordinator availability to false;
- hide navigation;
- expose `portal-navigation-compensation-failed`;
- do not claim which destination is safely active;
- do not silently fall back to Transfer.

## 16. Focus

V1 focus behavior:

- user activation moves focus to the requested navigation button before controller application;
- focus remains on that button after success;
- no heading or destination root receives `tabindex="-1"` in this slice;
- the coordinator does not focus `#txRecipient`;
- no second focus jump occurs after destination activation.

On an ordinary compensated failure, focus may remain on the requested
navigation button while the prior button retains `aria-current="page"`.

The coordinator must not conceal failure by moving focus into a different
destination.

## 17. Status Region

The navigation includes:

```html
<p
  id="portalPrimaryNavStatus"
  class="portal-primary-nav-status"
  role="status"
  aria-live="polite"
  hidden
></p>
```

It is coordinator-owned and unregistered.

Recoverable transition failure copy:

```text
Couldn’t switch views. Your previous view remains active.
```

Compensation failure copy:

```text
Couldn’t confirm the active view. Navigation has been disabled.
```

Rules:

- successful selection clears and hides prior status;
- status is not used for normal destination announcements;
- no transaction, wallet, or execution error is reported through this region;
- error copy never asserts successful compensation unless compensation completed.

## 18. Responsive Behavior

Required behavior:

- `grid-column: 1 / -1`;
- three equal flexible control columns;
- no horizontal scrolling;
- no carousel;
- no sticky or fixed positioning;
- no animated indicator;
- no exchange-style ticker, neon state, or gambling treatment;
- visible `:focus-visible` treatment;
- selected state must not depend only on color;
- labels remain readable on iPhone-sized widths;
- buttons may wrap text rather than overflow.

Mobile and desktop visual details remain subject to implementation QA.

## 19. Event Behavior

The coordinator:

- registers one click handler for each destination button;
- relies on native Enter and Space activation;
- does not register global keyboard shortcuts;
- does not use MutationObserver;
- does not listen for projection-marker changes;
- does not poll authorities;
- does not write storage;
- does not modify URL or browser history;
- does not invoke wallet or execution code.

## 20. Runtime File Boundary

Expected future implementation files:

- `app-web/frontend/public/js/portal-navigation-coordinator.js`;
- `app-web/tests/frontend/portal-navigation-coordinator.test.js`;
- `app-web/frontend/public/portal-index.html`;
- `app-web/frontend/public/css/main.css`.

Existing projection, registry, state, and visibility-controller modules should
remain unchanged unless implementation reveals a documented contract defect.

`package.json` must remain untouched.

## 21. Automated Tests

Future focused tests must prove at minimum:

1. exact navigation markup and first-child placement;
2. navigation is statically hidden;
3. no registered root is moved or wrapped;
4. no tab semantics or `aria-controls` appear;
5. exactly three native destination buttons exist;
6. exactly one initial hidden `aria-current="page"` matches projection;
7. module authority and structure preflight precedes mutation;
8. successful first activation applies controller before revealing navigation;
9. failed first activation leaves navigation hidden and long-page presentation restored;
10. successful Transfer, Recipients, and Activity transitions;
11. focus moves to the requested button before closing roots;
12. focus remains on the selected button after success;
13. projection transition precedes controller application;
14. navigation selection commits after controller success;
15. exactly one `aria-current="page"` after success;
16. same-destination requests cause no projection or controller writes;
17. projection failure preserves prior controller and navigation state;
18. controller failure compensates projection;
19. selected-state mutation failure compensates projection and controller;
20. prior dormant controller compensation uses `restore()`;
21. prior active controller compensation uses `apply(priorSnapshot)`;
22. compensation attempts continue after one compensation failure;
23. compensation failure disables and hides navigation;
24. ordinary failure status copy is truthful;
25. compensation-failure copy is truthful;
26. no second current-state store is introduced;
27. no direct `IX_PORTAL_VIEW_STATE` access occurs;
28. no contextual transition occurs;
29. no controller marker is directly mutated;
30. no URL, history, storage, wallet, Coin Card, receipt, network, or execution authority is added;
31. public coordinator API and returned statuses are frozen;
32. mobile and desktop markup remains structurally usable.

## 22. Manual QA

Future manual evidence must cover:

- desktop navigation layout;
- iPhone-sized layout;
- keyboard traversal and native activation;
- visible focus;
- Transfer -> Recipients -> Activity -> Transfer;
- form state preservation when leaving and returning to Transfer;
- `#ccIntake` feature-owned `hidden` preservation;
- global network surface remaining visible;
- contextual surfaces remaining unaffected;
- status copy after injected recoverable failure;
- long-page fallback when coordinator initialization is prevented.

These checks occur only after implementation.

## 23. Documentation Maps

Update canonical and mirrored portal README maps:

- `docs/product/portal/README.md`;
- `app-web/docs/product/portal/README.md`.

Add the new contract with a concise description:

```text
Defines accessible primary navigation, first visibility-controller activation,
focus behavior, selected-state ownership, and cross-authority compensation.
```

Keep the README pair byte-identical.

## 24. Related Contract Status

The projection-atomicity prerequisite is complete.
The dormant visibility controller is complete.
The primary-navigation coordinator contract is now defined.
Navigation runtime and first activation remain unimplemented.

Cross-link this contract from:

- `PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`;
- `PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md`;
- `PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`.

Do not mark visible navigation complete.

## 25. Acceptance Criteria

This contract must prove:

- navigation exists statically but remains hidden until first successful activation;
- the coordinator is presentation-only and not a second state authority;
- projection remains the sole live projected-state owner;
- the visibility controller owns primary-surface suppression;
- the coordinator owns selected state, focus, and compensation;
- the coordinator never calls `IX_PORTAL_VIEW_STATE` directly;
- the coordinator never transitions contextual layers;
- initialization failure leaves the long-page portal available;
- first activation reveals navigation only after controller success;
- same-destination requests are change-aware;
- compensation is cross-authority and deterministic;
- no runtime or product authority changes in this documentation slice.
