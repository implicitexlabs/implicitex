# Coin Card Publisher MVP — Smoke
**Date:** 2026-06-28
**Surface:** implicitex.com/coincard/publisher-mvp.html
**Commit under test:** 3db6c5c (feat: add coin card publisher mvp surface)
**Scope:** Full publisher pipeline smoke — manifest generation through evidence archive.
**Not in scope:** Actual registry publication, transfer execution, USDC custody.

**Prerequisite:** Lane A surface smoke (2026-06-28) must PASS before this gate runs.

---

## P1 — Page Load

| Check | Expected | Result |
|---|---|---|
| Page loads without console errors | Yes | |
| ImplicitEx nav renders correctly | Yes | |
| Publisher form visible | Yes | |
| Theme toggle works | Yes | |
| Clock toggle works | Yes | |
| No MetaMask prompt on load (wallet connect is user-initiated) | Yes | |
| Desktop layout — no overflow or broken columns | Yes | |
| Mobile layout — readable, no clipped inputs | Yes | |

**Outcome:** PASS / FAIL

---

## P2 — Wallet Connect (Issuer)

| Check | Expected | Result |
|---|---|---|
| Click "Connect Issuer Wallet" | MetaMask prompts for account access | |
| Approve — issuer address populates in field | Yes | |
| Notice appears: "Issuer wallet selected. Review the payment identity before signing." | Yes | |
| Notice does NOT say "connected" in a way that implies transfer authorization | Yes | |
| Reject — error notice appears, no crash | Yes | |

**Outcome:** PASS / FAIL

---

## P3 — Manifest Generation

Fill in form with test values before this step:
- Subject type: `creator`
- Subject name: `test-smoke-2026-06-28`
- Display name: `Smoke Test`
- Description: `Publisher MVP smoke test subject`
- Recipient address: (any valid EVM address)
- Issuer address: (connected wallet address from P2)
- Reference URI: `https://implicitex.com/coincard/publisher-mvp.html`

| Check | Expected | Result |
|---|---|---|
| Click "Generate Manifest" | No error | |
| Step 1 advances to `observed` | Yes | |
| Canonical payload textarea populates | Yes | |
| Payload hash appears (sha256: prefix) | Yes | |
| Manifest JSON textarea populates with unsigned manifest | Yes | |
| `card_id` format: `coincard:creator:test-smoke-2026-06-28` | Yes | |
| No `signature` field in unsigned manifest | Yes | |
| Step 2 shows `pending` | Yes | |

**Outcome:** PASS / FAIL

---

## P4 — Wallet Signature

| Check | Expected | Result |
|---|---|---|
| Click "Sign Manifest" | MetaMask personal_sign prompt appears | |
| MetaMask prompt shows canonical payload text (not a transaction) | Yes — this is a message sign, not a transfer | |
| MetaMask prompt does NOT show ETH/USDC amount | Correct — no value field | |
| MetaMask prompt does NOT request approval, gas, or custody | Correct | |
| Approve signature | Step 2 advances to `observed` | |
| Signed manifest JSON populates with `signature` field | Yes | |
| `signature.type` = `eip191` | Yes | |
| `signature.value` = long hex string | Yes | |
| Notice: "Signed manifest created. This is not a transfer and not yet a registry publication." | Yes | |
| Reject signature — error notice appears, no crash | Yes | |

**Critical check — wallet prompt must not look like a transfer:**

Record exact MetaMask prompt header text here: ____________________

**Outcome:** PASS / FAIL

---

## P5 — Registry Draft

| Check | Expected | Result |
|---|---|---|
| Click "Create Registry Draft" | No error | |
| Step 3 advances to `observed` | Yes | |
| Registry JSON populates | Yes | |
| `registry_version`: 1 | Yes | |
| `status`: ACTIVE | Yes | |
| `manifest_hash` present (sha256: prefix) | Yes | |
| `registry_signature` field absent (pending, not present) | Yes | |
| Notice: "Registry draft created. Operational validity remains pending until registry evidence is complete." | Yes | |

**Outcome:** PASS / FAIL

---

## P6 — Verification Output

| Check | Expected | Result |
|---|---|---|
| Click "Verify Draft" | No error | |
| Step 4 advances to `observed` | Yes | |
| Verification JSON populates | Yes | |
| `manifest_signature_status`: `valid` | Yes | |
| `verification_state`: `pending` | Yes | |
| `uncertainty_reason`: `registry_signature_pending` | Yes | |
| `registry_signature_status`: `pending` | Yes | |
| Notice mentions "uncertainty reason" | Yes | |

**Critical check — `verification_state` must NOT be `active`:**

`verification_state` observed: ____________________
`uncertainty_reason` observed: ____________________

**Outcome:** PASS / FAIL

---

## P7 — Evidence Archive

Check the three confirmation checkboxes before archiving:
- [ ] Reviewed identity binding
- [ ] Reviewed trust boundaries
- [ ] Reviewed uncertainty reason

| Check | Expected | Result |
|---|---|---|
| Check all three confirmations | Enabled | |
| Click "Create Archive" | No error | |
| Step 5 advances to `observed` | Yes | |
| Archive JSON populates | Yes | |
| `archive_version`: 1 | Yes | |
| `evidence_state.observed` includes `signed_manifest`, `registry_record`, `verification_output` | Yes | |
| `evidence_state.missing` includes `registry_signature` | Yes | |
| `publisher_confirmation` reflects the three checkbox states | Yes | |
| Notice: "Evidence archive created. The MVP has produced proof artifacts, not a payment execution." | Yes | |

**Outcome:** PASS / FAIL

---

## P8 — No Transfer, No Custody

This is the constitutional check. Confirm across the full session:

| Check | Expected | Result |
|---|---|---|
| No ETH or USDC transfer was submitted at any point | Confirmed | |
| No approval (allowance) request was made at any point | Confirmed | |
| MetaMask only prompted once: `personal_sign` message (not a transaction) | Confirmed | |
| Wallet balance unchanged after session | Confirmed | |
| No gas was spent | Confirmed | |

**Outcome:** PASS / FAIL

---

## Evidence Summary

| Field | Value |
|---|---|
| `card_id` generated | |
| Payload hash (`sha256:...`) | |
| Manifest hash (`sha256:...`) | |
| `verification_state` | |
| `uncertainty_reason` | |
| MetaMask prompt type | personal_sign (message, not transaction) |

---

## Result

**Publisher MVP smoke:** PASS / FAIL

**All checks PASS** confirms: canonical manifest pipeline executes correctly end-to-end; wallet signature is a message sign, not a transfer; uncertainty is surfaced explicitly; no custody or execution occurs. Trust kernel exposed correctly by publisher surface.

**If FAIL:** Record finding below. Do not archive Publisher MVP lane as complete.

Finding:
