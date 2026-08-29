# IX ID M3 Payment Route — Implementation State
## 2026-08-27

This document records the implementation state of M3 (Payment Route Authority Lifecycle)
as of 2026-08-27. It is an evidence document, not a closure declaration. M3 production
deployment requires independent smoke gate and deployment authorization.

---

## 1. IX ID Product Lifecycle Status

| Layer | Milestone | Implementation State | Notes |
|---|---|---|---|
| **Account** | M1 | IMPLEMENTED, DEPLOYED | Two-token protocol, Firebase auth, account/IX ID creation. Evidence: `ixid-holder-authority-m1-production-state-2026-08-20.md` |
| **Identity** | M2 | IMPLEMENTED (undeployed) | IX ID registration, handle canonicalization, workspace read. Blocked on Cloud Armor quota (Slice D). |
| **Profile** | M5 (early) | IMPLEMENTED (undeployed) | `display_name`, `bio`, `website_url`. Mutation events. Public profile projection. |
| **Domain** | M5 (early) | IMPLEMENTED (undeployed) | DNS TXT challenge/verify lifecycle. Domain status endpoint. |
| **Payment Route** | M3 | IMPLEMENTED (undeployed) | Full ownership-proof → publish → resolve lifecycle. See §2. |
| **Payment Execution** | M4+ | NOT IMPLEMENTED | Payer flow, ImplicitEx transfer portal integration, M4 activation. Deferred. |

---

## 2. M3 Payment Route — What Is Implemented

### 2.1 Ownership Proof Lifecycle

The complete wallet ownership challenge → sign → verify → publish flow:

```
Owner (authenticated)
  → POST /api/holder/v0.1/wallet-challenge  {destination_address}
      Server issues EIP-191 personal_sign challenge bound to ix_id + holder + address + chain
  → Owner signs challenge_text with wallet (locally; server never touches private key)
  → POST /api/holder/v0.1/wallet-verify  {challenge_id, signature}
      Server recovers signer address via eth_account.Account.recover_message
      If recovered == proposed wallet → publishes route
      If mismatch → WRONG_SIGNER rejection
  → Route is ACTIVE on ix_ids/{ix_id}: active_payment_route_address + active_payment_route_claim_id
```

### 2.2 Published Route Artifacts

For each successful verification, three records are written atomically:

1. **`ix_ids/{ix_id}/wallet_challenges/{challenge_id}`** — status set to `CONSUMED`
2. **`ix_ids/{ix_id}/wallet_binding_events/{event_id}`** — append-only evidence:
   - `event_id`, `ix_id`, `account_uid`, `wallet_address`, `network="polygon"`, `chain_id=137`
   - `challenge_nonce`, `challenge_issued_at`, `challenge_expires_at`
   - `signature`, `signature_verified=True`, `binding_committed_at`
   - `prior_wallet_address`, `prior_claim_id` (null on first binding)
   - `method="ETH_SIGN_CHALLENGE"`
3. **`ix_ids/{ix_id}/verification_claims/{claim_id}`** — `claim_type="PAYMENT_ROUTE"`, `status="ACTIVE"`:
   - `subject=wallet_address`, `evidence_type="ETH_SIGN_CHALLENGE"`, `evidence_ref=event_id`
   - `chain_id=137`, `asset_contract=0x3c499c542cef5e3811e1192ce70d8cc03d5c3359`
   - `supersedes=prior_claim_id` (null on first binding)

Root doc `ix_ids/{ix_id}` updated atomically: `active_payment_route_claim_id`, `active_payment_route_address`, `routing_suspended=False`.

### 2.3 Route Replacement

A second `wallet-challenge` → `wallet-verify` cycle supersedes the prior binding:
- Prior `verification_claims` record: `status=SUPERSEDED`, `superseded_by=new_claim_id`
- New `wallet_binding_events` record: `prior_wallet_address`, `prior_claim_id` set
- ix_ids root doc: updated to new address + new claim_id
- Historical wallet_binding_events are never modified

### 2.4 Route Disable

`POST /api/holder/v0.1/payment-route/disable`:
- Active claim status set to `REVOKED`
- ix_ids root doc: `active_payment_route_claim_id=null`, `active_payment_route_address=null`, `routing_suspended=True`

### 2.5 Public Route Resolver

`GET /public/route/{ix_id}` (no authentication required):
- IX ID does not exist → 404
- IX ID exists, no active route or `routing_suspended=True` → `{ix_id, payable: false}`
- IX ID exists, active route → `{ix_id, payable: true, destination_address, chain_id: 137, asset: "USDC", claim_id}`
- No signature, challenge, account_id, or private evidence exposed
- Cache-Control: no-store

### 2.6 Security Properties

| Property | Mechanism |
|---|---|
| Challenge bound to ix_id | challenge_text contains ix_id verbatim |
| Challenge bound to holder | challenge.account_id checked against authenticated account |
| Challenge bound to address | Server compares recovered signer to challenge.destination_address |
| Challenge bound to chain | challenge.chain_id enforced = 137 (Polygon) |
| Replay prevention | PENDING → CONSUMED transition inside same Firestore transaction as publish |
| Challenge expiry | 10-minute TTL; expires_at checked server-side |
| Malformed signature | eth_account recovers or raises; all exceptions → INVALID_SIGNATURE |
| Wrong signer | recovered != expected → WRONG_SIGNER |
| Cross-holder isolation | account_id mismatch → AuthorizationError; no Firestore write |
| Client-supplied address | Never trusted; always re-derived from recovered signer |
| Private key | Never handled; user signs locally in wallet |

---

## 3. Network / Asset Binding

| Field | Value |
|---|---|
| Network | Polygon mainnet |
| Chain ID | 137 |
| Asset | Native Circle USDC (NOT bridged USDC.e) |
| Token contract | `0x3c499c542cef5e3811e1192ce70d8cc03d5c3359` |
| Asset binding version | `polygon-pos-native-usdc-v1` (per asset-route-registry.md) |

---

## 4. API Surface Added

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/holder/v0.1/wallet-challenge` | POST | ID token + email verified | Issue EIP-191 wallet ownership challenge |
| `/api/holder/v0.1/wallet-verify` | POST | ID token + email verified | Submit signature; publish route on success |
| `/api/holder/v0.1/payment-route` | GET | ID token | Read current route (holder view) |
| `/api/holder/v0.1/payment-route/disable` | POST | ID token + email verified | Disable active route |
| `/public/route/{ix_id}` | GET | None | Public payment-route resolver |

---

## 5. Test Gate Results

### 5.1 New emulator tests (39 tests)

```
FIRESTORE_EMULATOR_HOST=localhost:8080
python -m pytest tests/test_ixid_wallet_route_service.py -v

39 passed, 0 failed, 0 skipped
```

Coverage:
- Address validation (7 tests): format, zero address, normalization
- Challenge issuance (6 tests): valid issue, invalid address, no IX ID, prior cancellation, normalization
- Verification (7 tests): correct signature, wrong signer, expired, replay, malformed, wrong holder, not found
- Publish evidence (3 tests): binding event, claim record, root doc update
- Route replacement (3 tests): new claim, superseded prior, binding event records prior
- Route disable (3 tests): removes route, rejects when no route, rejects when no IX ID
- Get route (4 tests): no IX ID, active route, no route, after disable
- Public resolver (6 tests): 404, no route, payable true, no private data, suspended, cache-control

### 5.2 Complete backend suite (emulator active)

```
FIRESTORE_EMULATOR_HOST=localhost:8080
python -m pytest

396 passed, 2 skipped, 0 failed
```

The 2 skips are pre-existing infrastructure tests (Cloud Run IAM, Cloud Armor) not testable
in the emulator.

### 5.3 Frontend suites

```
ixid-onboarding-web:   43 passed, 0 failed
ixid-identity-page:    58 passed, 0 failed
```

---

## 6. Files Changed in M3 Tranche

| File | Change |
|---|---|
| `services/ixid_holder_authority_service.py` | Added `_POLYGON_CHAIN_ID`, `_POLYGON_USDC_CONTRACT`, `_WALLET_ADDRESS_RE`, `_ZERO_ADDRESS`, `_WALLET_CHALLENGE_TTL_SECONDS`; dataclasses `WalletChallengeResult`, `WalletVerifyResult`, `PaymentRouteResult`; `_validate_wallet_address`; methods `issue_wallet_challenge`, `verify_wallet_challenge`, `get_payment_route`, `disable_payment_route` |
| `services/ixid_holder_authority_handler.py` | 4 new routes: wallet-challenge, wallet-verify, payment-route GET, payment-route/disable |
| `services/ixid_holder_edge_handler.py` | 4 new proxy routes |
| `services/ixid_projection_handler.py` | `GET /public/route/<ix_id>` route added |
| `services/requirements.txt` | `eth-account==0.14.0` added |
| `services/tests/test_ixid_wallet_route_service.py` | NEW — 39 emulator integration tests |
| `ixid-onboarding-web/public/holder-api-client.js` | 4 new API methods |
| `ixid-onboarding-web/public/register.js` | `showPaymentRouteSection`, `bindPaymentRouteEvents` wired into render/bootstrap |
| `ixid-onboarding-web/public/index.html` | `#payment-route-section` HTML block |

---

## 7. What Is NOT Implemented (M3 Deferred)

| Gap | Reason |
|---|---|
| In-browser MetaMask/WalletConnect signing | No wallet connector in onboarding web yet; UI uses challenge-text copy + signature paste flow |
| Rate limiting per account | Spec §8.4 defines minimum 10 mutations/hour; not yet enforced |
| `payment_route_records` subcollection | Recovery candidate design (non-authoritative); primary spec uses claims + wallet_binding_events directly |
| Route disposition model (CURRENT/LEGACY/RETIRED) | Asset binding versioning deferred to M4+ |
| Routing suspension notification | `routing_suspended=True` set but no owner notification |
| Public route CDN caching | Spec allows `public, max-age=30`; currently `no-store` (conservative) |

---

## 8. Deferred — Payment Execution (M4+)

The following are NOT implemented in this tranche and must remain NOT IMPLEMENTED:

- Payer checkout UI / amount entry
- ImplicitEx transfer portal integration
- M4 activation interface (proof → ACTIVE claim via M4)
- `routing_suspended=False` cleared by M4 proof verification
- PAYMENT_ROUTE claim activation by M4 automated verifier
- Cross-service payment handoff
