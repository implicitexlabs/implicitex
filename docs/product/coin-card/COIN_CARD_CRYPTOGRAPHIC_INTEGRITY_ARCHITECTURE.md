# Coin Card Cryptographic Integrity Architecture

Status: concept proposal, post-Coin Card MVP

Purpose: define the future security architecture that makes every Coin Card either authentic or invalid through cryptographic verification.

## Design Philosophy

Coin Card should become a verified financial instrument, not only an embeddable payment widget. The free version should expose only one configurable value: the recipient wallet address. Everything else is governed by ImplicitEx to preserve integrity and user trust.

The verification question is not whether a card looks correct. The verification question is whether this is exactly the card ImplicitEx generated. Any answer other than yes fails verification.

## Core Rule

The verification badge certifies that recipient, protected assets, layout, execution wiring, registry status, and cryptographic signature match the canonical ImplicitEx-issued version.

Trust comes from verifiable integrity, not visual appearance.

## Cryptographic Manifest

Each Coin Card should be accompanied by a signed manifest containing:

- Card ID
- Coin Card version
- Recipient wallet
- Network
- Registry status
- Approved JavaScript hashes
- Approved CSS hashes
- Approved image and SVG hashes
- Layout version
- Build version
- Digital signature

Protected assets are verified using cryptographic hashes such as SHA-256. Filenames and timestamps are not integrity evidence. Changing one byte changes the hash and invalidates the card.

## Runtime Verification

When a Coin Card loads:

1. Download the signed manifest.
2. Calculate hashes of protected assets.
3. Compare calculated hashes with manifest hashes.
4. Verify the ImplicitEx signature.
5. Determine the verification state.

## Verification States

- `VERIFIED`: all checks pass; transfers enabled.
- `INTEGRITY_FAILED`: protected assets changed; transfers disabled.
- `CARD_REVOKED`: registry revoked the card; transfers disabled.
- `VERIFICATION_UNAVAILABLE`: manifest or signature cannot be validated; transfers disabled.

## Modification Policy

Free tier allowed modification:

- Recipient wallet address, through the approved generation workflow only.

Protected in every tier:

- Branding
- JavaScript
- CSS
- Images and SVGs
- Layout
- Verification logic
- Trust copy
- Execution wiring

Potential paid features may include custom branding, color themes, layout variants, white-label options, analytics, and multiple Coin Cards. Paid plans must not disable integrity verification.

## Python Verification Layer

Python owns offline and deployment-time integrity work:

- Generate manifests.
- Calculate protected asset hashes.
- Sign manifests.
- Maintain the Coin Card Registry.
- Validate deployment packages.
- Detect unauthorized modification.
- Publish verification reports.

Python protects integrity. It does not execute blockchain transfers.

## Evidence Vocabulary

- `manifestHash`: hash of the canonical signed manifest payload.
- `intentHash`: hash of the verified transfer intent.
- `assetHash`: hash of a protected JavaScript, CSS, image, or SVG asset.
- `receiptHash`: hash of normalized receipt evidence.
- `proofPacketHash`: hash of the exported proof packet.

## Boundary

Coin Card creates and verifies transfer intent.

`IX_EXECUTION` prepares, approves, transfers, confirms, and emits execution receipts.

The Python cryptographic layer generates and validates integrity evidence. It never becomes a transaction execution path.
