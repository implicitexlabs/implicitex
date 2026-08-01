# docs

Product, operations, and legal documentation for ImplicitEx.

## Structure

```
docs/
├── product/
│   ├── portal/                       Portal documentation (contract + inventory + projection + composition + global + visibility)
│   ├── product-commercial-roadmap-2026-07-30.md
│   │                                  Master one-year independent-operator, economics, validation, and exclusion roadmap
│   ├── product-commercial-capability-register-2026-07-30.md
│   │                                  Subordinate per-capability scope, dependency, validation, and completion records
│   ├── mvp-roadmap.md                Historical launch gate sequence and implementation board
│   ├── agent-financial-infrastructure-initiative.md
│   │                                  Strategic thesis for agent treasury, permissions, settlement, and audit
│   ├── transaction-states.md         10-state receipt machine vocabulary
│   ├── legal-review-research-brief.md  Comparative research for attorney review
│   └── service-model-summary.md      One-page factual product summary
│
├── attorney-review/                  Attorney review package (Gate 3)
│   ├── README.md                     Entry point for reviewing attorney
│   ├── service-model-summary.md      Product summary
│   ├── legal-review-research-brief.md  Research brief
│   ├── gate2-evidence.md             Live transfer smoke evidence
│   └── screenshots/                  Screenshots checklist (to be added)
│
├── operations/
│   ├── transaction-trust-gate.md     Launch review gate for transaction trust and recovery clarity
│   └── evidence/                     Live smoke test records
│       └── gate2-live-transfer-smoke-2026-06-01.md
│
├── decisions/                        Architecture decision records (ADRs)
├── architecture/                     Platform architecture documentation
├── brand/                            Brand assets and guidelines
├── releases/                         Release notes
└── testing/                          Test plans and QA documentation
```

## Start Here

- **What governs product, market, revenue, and scope decisions?** `product/product-commercial-roadmap-2026-07-30.md`
- **Where are detailed capability decisions recorded?** `product/product-commercial-capability-register-2026-07-30.md`
- **Where are we in the launch sequence?** `product/mvp-roadmap.md`
- **What is the product?** `product/service-model-summary.md`
- **What is the larger agent infrastructure thesis?** `product/agent-financial-infrastructure-initiative.md`
- **What governs portal navigation and presentation hierarchy?** `product/portal/PORTAL_INFORMATION_ARCHITECTURE_CONTRACT_V1.md`
- **What facts and authorities are currently visible in the portal?** `product/portal/PORTAL_FACT_AND_AUTHORITY_INVENTORY_V1.md`
- **How do portal facts project into surfaces without creating new authority?** `product/portal/PORTAL_INTENT_BASED_PRESENTATION_PROJECTION_V1.md`
- **How do registered portal surfaces compose into visible destinations?** `product/portal/PORTAL_DESTINATION_COMPOSITION_CONTRACT_V1.md`
- **How do persistent portal surfaces remain outside destination hiding?** `product/portal/PORTAL_GLOBAL_SURFACE_REGISTRATION_CONTRACT_V1.md`
- **How does the visibility controller activate without a locked-door state?** `product/portal/PORTAL_VISIBILITY_CONTROLLER_ACTIVATION_CONTRACT_V1.md`
- **How do we review transaction trust before launch?** `operations/transaction-trust-gate.md`
- **Attorney review materials?** `attorney-review/README.md`
- **Live transfer proof?** `operations/evidence/gate2-live-transfer-smoke-2026-06-01.md`
