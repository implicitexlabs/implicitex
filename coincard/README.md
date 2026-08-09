# Coin Card public site

This directory is the Firebase Hosting source for `coincard.click`.

## Brand direction

The public visual system is derived from the three orange/cream Coin Card
reference images in:

```text
/home/adenmediagroup/Desktop/Coin Card Art/
```

The implementation translates those references into responsive HTML and CSS;
the reference screenshots themselves are not deployed as page artwork.

Core visual traits:

- warm off-white canvas;
- high-contrast orange action language;
- neutral human typography;
- a dark Coin Card as the primary product object;
- generous spacing and thin warm-gray boundaries;
- evidence-specific status language instead of generic trust badges.

## Information architecture

```text
/          Product and brand home
/send/     Supporter entry and handle lookup
/example/  Reserved, non-executable public-card example
/claim/    Existing acquisition and wallet-verification flow
/<handle>  Future canonical dynamic public-card route
```

`/example/` is a reserved product route explicitly marked as a demonstration.
It does not connect a
wallet, construct a transfer, or claim to represent a live registered card.

## Conservative provider rule

The public runtime assumes no fiat/on-ramp provider capabilities. It contains
no provider checkout, payment-card, bank-payment, or wallet-delivery promises.

The launch-capable story is limited to:

1. Coin Card resolves a configured route.
2. The route identifies USDC on Polygon.
3. The supporter reviews the route before wallet interaction.
4. The existing production transfer runtime owns execution.
5. ImplicitEx never takes custody of sender or recipient funds.

Any future provider rail must be additive, capability-gated, and backed by the
required runtime and business/compliance evidence. It must not become a
prerequisite for Coin Card identity, route display, or wallet-to-wallet use.

## Evidence-sensitive copy

Safe generic language includes:

- route active / route status;
- configured wallet;
- USDC on Polygon;
- review before wallet approval;
- non-custodial execution.

Claims such as `wallet ownership confirmed`, `verified payment identity`, or
`destination confirmed` may appear only when the individual card's current
evidence class authorizes them. Generic surfaces must never call a recipient
safe, trusted, approved, insured, or guaranteed.

## Claim-flow boundary

The claim page loads `css/claim-theme.css` as a presentation-only layer.
`claim/index.html` retains the existing progressive-disclosure element IDs and
`js/claim.js` remains the authority for wallet interaction, verification
state, payload construction, and Firestore submission.

## Next integration steps

1. Resolve `/<handle>` through the fixed Current Head and immutable public
   username-registry snapshot sources; the delivery policy is configured, but
   no production artifact is published yet.
2. Project authenticated lifecycle and evidence data into the public page.
3. Hand the public page's send action to the existing Coin Card execution
   authorization state machine.
4. Replace `/example/` with a fixture-backed example or remove it before any
   route could be mistaken for a live customer.
5. Add provider-specific modules only after their individual evidence gates
   pass.
