# Portal Global Surface Registration Contract V1

## 1. Purpose

This contract defines a third presentation category for portal surfaces that
must remain present regardless of selected primary destination or open
contextual layer.

The category is:

- `GLOBAL`

`GLOBAL` is not:

- a primary destination;
- a contextual layer;
- a fact authority;
- execution authority;
- storage persistence;
- permission for arbitrary global UI.

It is only a presentation-scope declaration that a registered root remains
outside destination hiding.

This contract does not redefine product authority, execution authority, or
data retention. It only freezes how certain portal surfaces are represented for
presentation-controller purposes.

## 2. V1 Global Surface

Freeze exactly one V1 global surface:

- `NETWORK`

The planned runtime representation is:

```html
<div
  id="networkMod"
  data-portal-global-surface="NETWORK"
>
```

The exact existing element type and class must be preserved during
implementation. A future runtime slice may add only the stable ID and global
surface attribute unless focused tests expose a real defect.

The current mixed network module remains presently unregistered until the
runtime slice lands.

## 3. Why Explicit Registration Is Required

Record the following:

- the current network module mixes Transfer-critical network facts with System
  diagnostic detail;
- it must remain visible during the first destination-navigation
  implementation;
- relying on absence from the primary and contextual registries is not a
  durable contract;
- an explicit global registration lets validation prove that destination hiding
  cannot accidentally consume it;
- global registration does not resolve or reassign the authorities of facts
  shown within it.

## 4. Surface Registry Extension

Freeze the future `IX_PORTAL_SURFACE_REGISTRY` extension:

- `primary`
- `contextual`
- `global`

The registration snapshot will add:

```text
global:
  NETWORK:
    #networkMod
```

Add a future read API:

```text
getGlobalSurfaceRegistrations(surface)
```

Preserve the existing primary and contextual APIs unchanged.

Global descriptors must use the same descriptor-only shape:

```text
{
  id,
  selector,
  surface,
  category
}
```

For the network registration:

- `category = GLOBAL`
- `surface = NETWORK`
- `id = networkMod`
- `selector = #networkMod`

No live DOM element may be exposed.

Deterministic ordering remains by selector.

## 5. Registration Constraints

Require:

- a safe, stable, unique element ID;
- exactly one `data-portal-global-surface="NETWORK"` registration in V1;
- no element may carry more than one portal surface-category attribute;
- primary, contextual, and global registrations are mutually exclusive;
- a global surface must not be nested inside a registered primary destination;
- a global surface must not be nested inside a contextual surface that may
  close;
- the global network root must remain under the portal application region;
- DOM order must not establish global ownership;
- classes, copy, and visual appearance must not establish global ownership.

V1 permits exactly `data-portal-global-surface="NETWORK"`. No other global-
surface value is valid in V1.

Invalid or duplicate global registrations must fail validation deterministically,
including:

- primary + contextual;
- primary + global;
- contextual + global;
- all three categories;
- duplicate global registrations;
- unsupported global-surface values.

A failed validation rescan must not mutate the registry’s original immutable
snapshot.

## 6. Visibility-Controller Requirements

Freeze these rules:

- the presentation-only visibility controller may hide or inert inactive
  primary surfaces;
- it must not apply `hidden`, `inert`, `aria-hidden`, controller classes, or
  visibility styles to a registered global surface;
- it must not move or clone a global surface;
- opening Verification or System must not hide the global network surface;
- switching among Transfer, Recipients, and Activity must not hide the global
  network surface;
- global content may continue updating from its existing authorities;
- global registration does not permit the visibility controller to mutate
  network facts or network state.

If the required V1 global network registration is missing or invalid,
destination hiding must not activate. The existing long-page presentation
remains intact.

## 7. Feature-Owned State

Distinguish:

- global presentation scope;
- feature-owned disclosure or detail state within the network module.

The destination controller must not clear feature-owned classes, disclosures,
details, text, or status state inside the global root.

Global registration guarantees that the root remains outside destination
hiding; it does not require every nested diagnostic detail to remain
permanently expanded.

## 8. Later Network Partition

`NETWORK` remains global only while the module mixes:

- Transfer-critical blockers and readiness facts;
- System diagnostic and operational detail.

The global registration may be removed only after a separate explicit partition
creates:

- `Transfer-critical network/blocker surface`
- `System diagnostic/detail surface`

Before removing global registration, evidence must prove:

- every execution blocker still surfaces at the point of action in Transfer;
- System contains only explanatory or diagnostic detail;
- no critical network fact becomes reachable only through System;
- the visibility controller remains unable to conceal an execution blocker.

Do not define that later partition’s exact DOM structure in this contract.

## 9. Current Versus Planned Registry

Clearly distinguish:

### Current committed registry

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

GLOBAL:
  none
```

### Planned result after implementation

```text
GLOBAL:
  NETWORK:
    #networkMod
```

Do not describe `#networkMod` or the global registry API as already committed.

## 10. Atomic Implementation Boundary

The first NETWORK resolution is registration in place on the existing mixed
network-module root. The runtime slice adds only the stable `networkMod` ID and
`data-portal-global-surface="NETWORK"` unless focused evidence exposes a real
defect.

The marker and registry extension must not ship as separate intermediate
slices. The future runtime implementation must land in one isolated commit
containing:

- the stable `networkMod` ID on the existing network root;
- `data-portal-global-surface="NETWORK"`;
- registry discovery of global surfaces;
- a `global` snapshot bucket;
- `getGlobalSurfaceRegistrations(surface)`;
- global registration validation;
- focused tests.

Before that atomic commit:

- the current registry has no global bucket or public global lookup API;
- the existing network module remains unregistered;
- destination hiding remains unavailable.

After that atomic commit:

- the immutable registration snapshot includes:

```text
global:
  NETWORK:
    #networkMod
```

- validation requires exactly one valid NETWORK registration;
- a missing, duplicate, unsupported, or category-colliding registration fails
  deterministically;
- destination hiding may proceed only after successful registry validation.

## 11. Registration In Place

The first NETWORK resolution is registration in place on the existing mixed
network-module root. The runtime slice adds only the stable `networkMod` ID and
`data-portal-global-surface="NETWORK"` unless focused evidence exposes a real
defect.

The slice must:

- preserve the existing element type;
- preserve all existing classes;
- preserve copy and child structure;
- preserve network rendering and update behavior;
- keep the root under `#modules`;
- keep it outside every registered primary surface;
- keep it outside every contextual surface that may close;
- not move, clone, wrap, reconstruct, or restyle it.

Do not describe `#networkMod` as already committed.

## 12. Feature-Owned Visibility

GLOBAL means the destination or contextual presentation controller does not
hide the registered root.

It does not authorize the controller to remove feature-owned `hidden`,
`inert`, `aria-hidden`, classes, styles, disclosure state, text, or status.

The controller may neither add nor remove visibility markers on a global root.
It must not broadly reveal global descendants.

Feature logic remains authoritative for nested disclosure and diagnostic
detail.

Validation failure or controller teardown must not alter feature-owned state.

Global presentation registration does not mean every descendant must always be
visually expanded.

## 13. Global API Behavior

`getGlobalSurfaceRegistrations("NETWORK")` must return a fresh immutable
descriptor projection ordered by selector.

Descriptors remain exactly:

```text
{
  id,
  selector,
  surface,
  category
}
```

For NETWORK:

- `id = networkMod`
- `selector = #networkMod`
- `surface = NETWORK`
- `category = GLOBAL`

No live element reference may be exposed.

Deterministic failure is required for unsupported lookup values.

No mutation of internal snapshots may occur through returned objects or arrays.

Validation rescans current DOM metadata, and a failed rescan leaves the
original immutable snapshot unchanged.

The existing primary and contextual API contracts remain unchanged.

## 14. Acceptance Criteria

This documentation slice proves:

- GLOBAL is presentation scope only;
- GLOBAL is neither a destination, contextual layer, fact authority, storage
  authority, nor execution authority;
- NETWORK is the only permitted V1 global surface;
- global persistence is explicit and never inferred from missing metadata;
- the planned marker is exactly `data-portal-global-surface="NETWORK"`;
- the planned stable ID is exactly `networkMod`;
- primary, contextual, and global registrations are pairwise mutually
  exclusive;
- the future runtime extension lands atomically with the marker;
- the existing network module is registered in place and not moved or
  reconstructed;
- the snapshot gains a global bucket;
- the API gains `getGlobalSurfaceRegistrations`;
- descriptor-only, immutability, deterministic ordering, and validation-rescan
  rules remain intact;
- registered global roots are exempt from destination and contextual hiding;
- feature-owned state inside the global root remains untouched;
- missing or invalid NETWORK registration prevents destination hiding;
- the current committed runtime still contains no global registration;
- later removal requires explicit Transfer/System network partition evidence;
- this documentation slice changes no runtime behavior or product authority.
