# docs

Product, operations, and legal documentation for ImplicitEx.

## Structure

```
docs/
├── product/
│   ├── mvp-roadmap.md                Launch gate sequence and board (primary reference)
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

- **Where are we in the launch sequence?** `product/mvp-roadmap.md`
- **What is the product?** `product/service-model-summary.md`
- **What is the larger agent infrastructure thesis?** `product/agent-financial-infrastructure-initiative.md`
- **How do we review transaction trust before launch?** `operations/transaction-trust-gate.md`
- **Attorney review materials?** `attorney-review/README.md`
- **Live transfer proof?** `operations/evidence/gate2-live-transfer-smoke-2026-06-01.md`
