# Architecture Constitutions

This directory contains constitutional documents for ImplicitEx architecture.

Constitutions are slower-moving governance artifacts. They define enduring
principles, guarantees, boundaries, and interpretation rules that lower layers
must preserve as the product evolves.

## Document Roles

| Layer | Role |
| --- | --- |
| Mission | Defines why ImplicitEx exists. |
| Constitutions | Define what values and guarantees must remain true. |
| Architectures | Explain how systems and journeys realize those principles. |
| Contracts | Specify what modules, surfaces, or services must guarantee. |
| Implementations | Provide concrete code, assets, and operational behavior. |

## What Belongs Here

Place a document in this directory only when it:

- governs future architectures, contracts, and implementations
- defines values or guarantees that should change slowly
- resolves a recurring class of design or engineering conflict
- establishes interpretation rules for lower-layer decisions
- is intended to outlive a single implementation or release

## What Does Not Belong Here

Do not place ordinary product specs, UI explorations, implementation notes,
release plans, test plans, or one-off design decisions in this directory.

Those documents belong in product, architecture, contracts, operations, testing,
or decision-record locations as appropriate.

## Review Standard

A constitutional document should help reviewers answer:

> Does this lower-layer decision preserve the values and guarantees ImplicitEx
> has chosen not to trade away?

If the answer is no, the lower-layer design should change before the
constitution does.
