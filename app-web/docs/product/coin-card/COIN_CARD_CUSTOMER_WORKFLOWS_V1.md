# Coin Card Customer Workflows V1

**Status:** Ratified and closed  
**Governing documents:**
- `COIN_CARD_ENTITLEMENT_SPECIFICATION_V1.md` at `b3bdc08` (ratified)
- `COIN_CARD_DATA_MODEL_V1.md` at `d0b5a8b` (ratified and closed)  
**Ratified:** 2026-08-02

**Scope:** Five end-to-end customer workflows as observable experiences. Defines
customer-visible states, required authority, record changes, lifecycle events,
evidence publications, failure classes, and audit evidence. Does not define
screen layouts, database migrations, application code, checkout flows, or
business-operation workflows.

**Implementation contracts referenced (do not reinvent):**
- `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md` — execution-authorization gate
- `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md` — EVM transfer interface
- `COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md` — bundle authentication
- `COIN_CARD_LIFECYCLE_RECORD_AUTHENTICATION_AND_CANONICALIZATION_CONTRACT_V1.md` — canonical JSON and signature schema
- `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md` — registry authority and publication evidence
- `COIN_CARD_LIFECYCLE_REGISTRY_AUTHORITY_CONTRACT_V1.md` — authority model
- `COIN_CARD_MANIFEST_RUNTIME_CONTRACT_V1.md` — manifest runtime
- `COIN_CARD_MANIFEST_SCHEMA_V1.md` — manifest schema
- `COIN_CARD_SIGNATURE_POLICY_V1.md` — signing policy
- `COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md` — verifier design

---

## Shared conventions

### Authentication model

Customer operations use the three-level credential stack defined in
Entitlement Specification §7:

| Level | Mechanism | Use |
|---|---|---|
| Primary | SIWE — wallet signs a server-issued nonce | Routine access; route changes; cancellation |
| Secondary | Verified email — OTP or magic link | Fallback when wallet unavailable |
| Recovery | 8 one-time recovery codes (bcrypt-hashed) | Last-resort access recovery |

A server-issued nonce is required for all SIWE operations. Client-side nonces
are Phase 0 only and must not be treated as production-grade authentication.
All authentication operations are fail-closed: an ambiguous or incomplete
authentication result must be treated as failure.

### Event-first rule

Every state change on any record must write the corresponding LifecycleEvent
in the same atomic transaction before the state change commits. If the event
write fails, the state change must not proceed. See Data Model V1 §6 and
Transactional invariant 1.

### Evidence publication requirement

Every state change requiring a new signed public record must advance the
corresponding EvidencePublication to `activated` in the same atomic commit as
the state change. If publication fails before `published`, the state change
does not proceed. If publication has reached `published` but activation fails,
retry or issue a compensating publication before proceeding. See Data Model V1
§7, Transactional invariant 5.

### Notation

```
→  state change (record field or status)
←  verification or read
[pub]  EvidencePublication created or activated
[evt]  LifecycleEvent written
```

Record abbreviations follow Data Model V1 §Record catalog:
`acct`, `card`, `route`, `ent`, `pay`, `evt`, `pub`, `case`.

---

## Workflow 1: Identity and Account Access

### Customer objective

Gain authenticated access to the customer's Coin Card account to perform
management operations.

### Entry conditions

A visitor arrives at the account sign-in surface with an intention to sign in
or create an account.

### Customer-visible starting state

No authenticated session exists. The sign-in surface is presented.

### Required authority

New account creation: any party who can produce a valid wallet signature or
verified email address.

Sign-in: the account holder who controls the registered wallet address or
verified email address.

Account closure: the account holder; authenticated at primary or secondary
level.

---

### 1.1 New account creation

**Happy path:**

1. Visitor chooses sign-in method (wallet or email).
2. Server issues a nonce bound to this session.
3. Visitor signs the nonce with their wallet (SIWE) or initiates email
   verification.
4. Signature is verified server-side (ecrecover for SIWE; OTP for email).
5. Account record created: `acct.status = 'active'`.
6. AccountCredential created: wallet address (primary) and/or email (secondary).
7. `account_created` LifecycleEvent written.
8. Session established.

**Records created:** `acct`, `AccountCredential`  
**Lifecycle events:** `account_created`  
**Evidence publications:** None.

**Customer-visible success state:** Authenticated session; dashboard visible;
no card yet.

**Recoverable failures:**
- Wallet signature invalid: surface "signature could not be verified"; discard
  nonce; allow retry with a new nonce.
- Email OTP expired: surface "verification code expired"; allow retry.

**Non-recoverable failures:** None at this stage.

**Retry and idempotency:** Nonces are single-use. A failed authentication
issues a fresh nonce on retry. An account with the same wallet address already
registered returns the existing account; it does not create a duplicate.

**Security boundaries:** Server-issued nonce must expire (short TTL). SIWE
signature verification uses ecrecover server-side. Email OTPs are single-use
and time-bounded.

**Audit evidence:** `account_created` LifecycleEvent with `actor_type = 'customer'`.

---

### 1.2 Sign-in: SIWE (primary)

**Happy path:**

1. Server issues a nonce.
2. Customer signs the nonce with their registered wallet.
3. Server verifies the signature and resolves the wallet address to an Account.
4. Session established.

**Records read:** `acct`, `AccountCredential` (wallet)  
**Records mutated:** None. Sign-in is not a state-changing operation.  
**Lifecycle events:** None for routine sign-in.

**Recoverable failures:**
- Wallet signature invalid: "Signature invalid; please try again."
- Wallet address not registered: "No account found for this wallet."
- Nonce expired: issue fresh nonce.

**Non-recoverable failures:** None.

**Security boundaries:** Server-issued nonce only. Nonce is single-use and
expires; a replayed or reused nonce is rejected. Authentication fails closed.

---

### 1.3 Sign-in: email (secondary fallback)

**Happy path:**

1. Customer enters registered email address.
2. OTP or magic link delivered to email.
3. Customer submits OTP or follows magic link.
4. Server verifies OTP; resolves email to Account.
5. Session established with secondary-credential flag.

**Records read:** `acct`, `AccountCredential` (email)  
**Records mutated:** `acct.email_verified_at` set on first successful email
verification if not already set.  
**Lifecycle events:** None for routine sign-in.

**Recoverable failures:**
- Email not in registry: "No account found for this address."
- OTP expired or invalid: allow retry with fresh OTP.
- Email delivery failure: surface error; allow retry.

**Security note:** Secondary-credential sessions may require step-up
authentication for sensitive operations (route changes, cancellation).
The exact step-up policy is an implementation decision; the data model
enforces that route changes require `primary` or `secondary` credential
authentication per Entitlement Specification §5.

---

### 1.4 Access recovery via recovery codes

**Entry condition:** Customer cannot sign in via wallet or email. 8 one-time
recovery codes were generated at card activation.

**Happy path:**

1. Customer provides one recovery code.
2. Server finds matching `AccountRecoveryCode` by bcrypt comparison.
3. Code is marked `used_at = NOW()`.
4. Customer completes a challenge through their account's verified email
   address (OTP or magic link). The email challenge is required in addition
   to the recovery code; the code alone is insufficient.
5. Recovery-code session established with `session_type = 'recovery'`.
6. Customer registers or restores a primary authentication credential
   (new SIWE wallet address).
7. On successful primary-credential restoration, the recovery session
   terminates.
8. Customer begins a new fully authenticated session (primary credential)
   for all subsequent management operations.

**Recovery-code session authority:**

A recovery-code session may only:
- Verify the single consumed recovery code.
- Complete the required email challenge.
- Register or restore a primary authentication credential.
- View masked account information necessary to confirm account identity.

A recovery-code session must not permit:
- Wallet route changes.
- Entitlement cancellation, renewal, or reactivation.
- Account closure.
- Email ownership changes (changing the registered email address).
- Generation of replacement recovery codes.
- Access to complete payment details (provider IDs, full amounts).
- Any other economically consequential management operation.

**Records read:** `acct`, `AccountRecoveryCode`  
**Records mutated:** `AccountRecoveryCode.used_at` set; `AccountCredential` created on primary credential restoration.  
**Lifecycle events:** None for session establishment; code consumption is private operational metadata.

**Non-recoverable failures:** All 8 codes consumed with no accessible primary
or secondary credential, or email challenge cannot be completed: account access
is permanently lost. The customer's funds are not affected — the recipient
address on-chain is not controlled by ImplicitEx. The card identity and
evidence remain on record.

**Security boundaries:** 
- Codes are never retrievable after initial display. Plaintext is shown once
  at generation and discarded.
- Used codes are not deleted; they are marked consumed for audit.
- The recovery session terminates as soon as the primary credential is
  restored. It cannot be extended or reused.
- The email challenge is mandatory; a recovery code without a passing email
  challenge does not establish a session.
- Session type `recovery` is distinct from `primary` and `secondary` at the
  application layer.

**Out of scope:** Code regeneration, cross-device sync, hardware key binding,
SMS or TOTP as recovery mechanisms.

---

### 1.5 Adding or replacing a wallet credential

**Entry condition:** Customer is authenticated at primary or secondary level.

**Happy path:**

1. Customer requests to add a new wallet address.
2. Server issues nonce for the new wallet.
3. New wallet signs the nonce.
4. Signature verified; new AccountCredential created.
5. Existing credentials unaffected unless customer explicitly removes the old one.

**Records created:** `AccountCredential` (new wallet)  
**Lifecycle events:** None (credential addition is not a card state change).

**Security boundaries:** Adding a credential requires an active authenticated
session. The new credential is not active until the signature is verified
server-side.

---

### 1.6 Account closure

**Entry condition:** Customer requests account closure. No active entitlement
may be open; if an entitlement is active, the customer must first cancel or
wait for expiration.

**Happy path:**

1. Customer confirms closure intention.
2. `acct.status → 'closed'`, `acct.closed_at` set.
3. LifecycleEvent `account_closed` written.
4. Sensitive fields scheduled for zeroing per retention policy.

**Records mutated:** `acct.status`, `acct.closed_at`  
**Lifecycle events:** `account_closed`  

**Non-recoverable failures:** Closure is not automatically reversible.

**Out of scope:** Account reopening, transfer of card ownership, fund recovery.

---

### W1 Exit conditions

The customer holds an authenticated session or has been informed of an
irrecoverable access failure.

### W1 Out of scope

Multi-device session management, OAuth / social sign-in, hardware security
keys, two-factor app codes, automated account recovery, admin-initiated
account reset.

---

## Workflow 2: Card Presentation and Sharing

### Customer objective (as card holder)

Share a verifiable payment identity with potential transfer senders.

### Visitor objective

View a Coin Card, confirm its authenticity, and obtain a verified recipient
address before initiating a transfer.

### Entry conditions

Any party navigates to `coincard.click/<handle>` or scans the card's QR code.
No authentication is required.

### Customer-visible starting state

Public URL is reachable. Content varies by card status (see §2.1).

### Required authority

None. Card presentation is fully public and unauthenticated.

---

### 2.1 Opening a public card page

**Happy path:**

1. Visitor requests `coincard.click/<handle>`.
2. System resolves handle to CoinCard record.
3. Derived card status computed from Entitlement + SuspensionCase.
4. Most recent activated EvidencePublication loaded.
5. Card page rendered with status, handle, public URL, and recipient address
   per display rules below.

**Records read:** `card`, `route` (most recently active), `ent` (current),
`case` (open, if any), `pub` (most recent activated).

**Records mutated:** None. Card presentation is a read-only operation.  
**Lifecycle events:** None.  
**Evidence publications:** None created.

---

### 2.2 Card status presentation rules

| Derived status | Execution display | Route address display | Signed evidence displayed |
|---|---|---|---|
| `ACTIVE` | Enabled; sender may initiate transfer | Active recipient address | Yes |
| `SUSPENDED` | Disabled; suspension notice shown | Not shown as executable | Yes (signed suspension record) |
| `EXPIRED` | Disabled; expiration shown; renewal CTA shown to card holder | Historical address shown as non-executable | Yes |
| `REVOKED` | Disabled; permanent revocation shown | Not shown | Yes (signed revocation record) |
| `NEVER_ACTIVATED` | N/A | Not shown | Not applicable |

**Grace period note:** A card in grace (EXPIRED, NOW() ≤ grace_period_ends_at)
displays identically to any other EXPIRED card. The grace period is not
customer-visible as a distinct state. Execution remains disabled.

**Mismatch handling:** If derived status does not match
`EvidencePublication.card_status_at_publication` of the most recent activated
publication, the card must not be presented as ACTIVE. The discrepancy must be
surfaced as an integrity warning and ImplicitEx must issue an updated
EvidencePublication immediately.

---

### 2.3 Sharing a card URL

The card holder copies or shares `coincard.click/<handle>`. No operation
is required; the URL is permanent and immutable. The handle is never
reassigned or changed.

**Out of scope:** QR code generation parameters, embeddable widgets, social
sharing metadata, analytics of link traffic.

---

### W2 Recoverable failures

- Handle not found: 404 response; no card information revealed.
- Registry unavailable: cached or stale presentation with freshness warning;
  verification is degraded but the signed bundle remains verifiable offline.
- EvidencePublication signature invalid: surface integrity failure; do not
  present the card as verified.

### W2 Non-recoverable failures

- Card is REVOKED: permanently non-executable; the page remains accessible
  for historical reference.

### W2 Security boundaries

No authentication required. The card page must not reveal account email,
AccountCredential wallet address of the card holder (only the recipient
route address is public), internal record IDs, or operator metadata.

### W2 Audit evidence

No lifecycle event is written for card page views. Evidence exists in the
EvidencePublication chain already on record.

### W2 Exit conditions

Visitor has seen the card's current status, recipient address (if applicable),
and can proceed to payment execution or independent verification.

### W2 Out of scope

Visitor identity, visitor wallet binding to the display, click tracking,
per-view analytics.

---

## Workflow 3: Payment Execution

### Customer objective (visitor / transfer sender)

Send USDC to a Coin Card holder's verified recipient address on Polygon.

### Governing principle

ImplicitEx is non-custodial. It presents a verified recipient address and
provides an authorization gate. The USDC transfer is executed directly from
the visitor's wallet to the recipient's wallet via the Polygon blockchain.
ImplicitEx does not intermediate, hold, escrow, or guarantee any transfer.

### Records involved in payment execution

Payment execution does not create or mutate any record in the ratified data
model (Data Model V1). The data model covers subscription and entitlement
lifecycle, not individual USDC transfers made via the card. The following
records are **read** during execution:

- `card` — identity and public URL
- `route` (active) — recipient Polygon USDC address
- `ent` (current) — status, execution eligibility
- `case` (open, if any) — suspension status
- `pub` (most recent activated) — signed state verification

The authorization proof object and transfer intent snapshot are governed by
`COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`. They are not records in
the data model; they are transient execution-time artifacts.

On-chain transaction evidence (blockchain receipt, transaction hash) is
external evidence produced by the Polygon network, not by ImplicitEx.

**Note:** A future receipt-storage system may create internal evidence records
for completed transfers. That is out of scope for V1 and must not enter through
this workflow definition.

---

### 3.1 Visitor opens Coin Card

**Entry:** Visitor navigates to `coincard.click/<handle>` (from Workflow 2).

The card page loads and displays the current card status. If the card is not
ACTIVE, execution is presented as unavailable with the reason displayed
(expired / suspended / revoked). The visitor may not proceed to execution.

If the card is ACTIVE, a "Send USDC" or equivalent action is presented.

---

### 3.2 Card and lifecycle verification

Before any execution surface is shown, the runtime must verify the card's
signed state per `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`.
Verification steps:

1. Load the most recent activated EvidencePublication.
2. Verify the signature over the canonical signing input set using the
   trusted public key (per `COIN_CARD_SIGNATURE_POLICY_V1.md` and
   `COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`).
3. Confirm `card_status_at_publication = ACTIVE`.
4. Verify asset hashes against the loaded manifest assets.
5. Confirm the publication chain is unbroken (`prior_publication_id` links).

**Failure — signature invalid:** Present integrity failure; do not enable
execution. The card must not be presented as verified.

**Failure — status not ACTIVE:** Surface the actual status; execution is
unavailable.

**Failure — registry unavailable:** The signed bundle remains verifiable
offline. If the bundle cannot be loaded, execution must not be enabled. See
`COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md`.

The verification is performed by `IX_COIN_CARD_LIFECYCLE_PRESENTATION` per the
lifecycle presentation promotion contract. Do not replicate the verification
logic here.

---

### 3.3 Route resolution

Once lifecycle verification succeeds (`ACTIVE`):

1. Resolve the active WalletRoute for this card.
2. Confirm `WalletRoute.status = 'active'` and `Entitlement.status = 'active'`.
3. The recipient address is the EIP-55 checksum Polygon USDC address from
   the active route.
4. The recipient address is displayed to the visitor before any wallet
   interaction.

**Fail-closed:** If the active route cannot be resolved, execution is
unavailable. An expired card's last route must not be presented as an
active, executable destination.

---

### 3.4 Wallet connection

1. Visitor initiates wallet connection (MetaMask, WalletConnect, or equivalent
   per the provider continuity contract).
2. Wallet connection is established.
3. The connected wallet address and network are captured.

**Failure — connection refused or cancelled:** Return to pre-connection state;
no state change; retry available.

**Failure — wallet unavailable:** Surface error; retry available.

**Continuity:** Provider continuity checks (wallet still connected, same
address, same network) are enforced before authorization. See
`COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`.

---

### 3.5 Chain and account validation

After wallet connection, before amount entry:

1. Confirm the connected wallet is on Polygon (chainId 137 mainnet or 80002
   Amoy for test).
2. Confirm the connected wallet address matches what was connected (TOCTOU
   check: address has not changed since connection).
3. Read the visitor's USDC balance on Polygon.
4. Read the visitor's MATIC (native gas) balance.

**Failure — wrong chain:** Surface "Please switch to Polygon." Execution
blocked until resolved.

**Failure — address drift (TOCTOU):** The wallet address changed between
connection and validation. This is a chain-continuity failure; execution
must be re-initialized from wallet connection. See §3.12.

**Failure — provider mismatch:** See §3.13.

---

### 3.6 Amount entry

Visitor enters the USDC amount to send.

1. Amount is validated: positive, non-zero, within reasonable limits.
2. Sufficient USDC balance check: see §3.14.
3. Sufficient MATIC (gas) check: see §3.15.
4. Estimated gas is shown to the visitor.
5. Visitor confirms the intended amount.

The entered amount is not yet committed to any record. It becomes part of
the frozen transfer-intent snapshot in §3.7.

---

### 3.7 Review-record creation

A transfer intent snapshot is created to capture the exact state of the
intended transfer at the moment the visitor proceeds to review. This is a
transient execution-time artifact governed by
`COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`, not a record in the
data model.

The snapshot captures:
- Recipient address (from active WalletRoute at time of snapshot)
- Amount (from visitor entry)
- Chain ID
- Timestamp
- Card ID and entitlement ID (from the verified ACTIVE state)
- Promoted-presentation proof (from §3.2 verification)

The visitor is shown the exact parameters they are about to authorize:
recipient address, amount, and network. This is the final review before
wallet interaction begins.

**Governing invariant:** The snapshot is frozen at creation. If any parameter
changes between snapshot creation and authorization, the snapshot is invalid
and the flow must restart.

---

### 3.8 Authorization-proof issuance and consumption

`COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md` is the authority for
this step. Summary for the workflow:

1. `authorizeExecution()` receives three inputs:
   - Promoted-presentation proof (from §3.2)
   - Frozen transfer-intent snapshot (from §3.7)
   - Frozen wallet-readiness snapshot (current chain, address, balances)
2. The function evaluates policy synchronously. It makes no wallet calls.
3. If all checks pass, an execution-authorization result is produced.
4. The result is single-use: it authorizes exactly this transfer attempt.
5. A second call with the same inputs produces a second independent result
   (it is not replayed).

**Fail-closed:** Any authorization failure blocks execution. Failure types
are defined in `COIN_CARD_EXECUTION_AUTHORIZATION_CONTRACT_V1.md`.

**Consumption:** The authorization result is consumed at the moment the
wallet transaction is submitted (§3.9 or §3.10). It is not reusable.

---

### 3.9 Allowance-sufficient transfer path

If the visitor's USDC allowance for the Coin Card execution contract is
sufficient to cover the transfer amount:

1. Authorization result is consumed.
2. Wallet prompts visitor to sign the `transfer()` call (or equivalent
   per `COIN_CARD_EXECUTION_INTERFACE_DESCRIPTOR_CONTRACT_V1.md`).
3. Visitor signs and submits.
4. Transaction is broadcast to Polygon.
5. → §3.16 (Broadcast success) or §3.17 (Outcome unknown).

---

### 3.10 Approval-required path

If the visitor's USDC allowance is insufficient:

1. Visitor is informed that an approval transaction is required first.
2. Wallet prompts visitor to sign an `approve()` call for the required amount.
3. Visitor signs and submits the approval.
4. Approval transaction confirmed on-chain.
5. Re-validate allowance (fresh observation).
6. Proceed from §3.9.

**Failure — approval rejected by visitor:** See §3.11.

**TOCTOU:** Between approval confirmation and the transfer attempt, the
wallet state is re-validated (§3.5 chain and account checks). A state change
triggers §3.12.

---

### 3.11 Wallet rejection

Visitor declines to sign either the approval or the transfer in their wallet.

**State:** No transaction has been broadcast. No blockchain state has changed.
No data model record has been mutated.

**Customer display:** "Transfer cancelled." Return to the pre-authorization
state. Execution may be retried.

**Invariant:** A visitor cancellation or wallet rejection must not be
represented as a failed blockchain transaction.

---

### 3.12 Account or chain drift (TOCTOU failure)

Between wallet connection (§3.4) and any subsequent step, the connected
wallet address has changed, the chain has changed, or the provider has been
replaced.

**State:** No transaction broadcast. No state changes.

**Recovery:** Discard the current execution context. Re-initialize from
§3.4 (wallet connection). The visitor must reconnect and go through the
full validation sequence again.

**Invariant:** Continuing after detected drift is not permitted. The execution
fails closed.

---

### 3.13 Provider mismatch

The wallet provider detected is not the one that produced the promoted
presentation or the frozen intent snapshot. This may indicate a session
inconsistency or a provider switch.

**Recovery:** Same as §3.12. Restart from §3.4. The prior authorization
result is invalidated.

---

### 3.14 Insufficient USDC

Visitor's USDC balance (observed at §3.5 or re-checked at §3.6) is less than
the entered amount plus estimated gas equivalent.

**State:** No transaction broadcast.

**Customer display:** "Insufficient USDC balance. You have X USDC; this
transfer requires Y."

**Recovery:** Visitor adjusts the amount to fit their balance, or cancels.

---

### 3.15 Insufficient native gas

Visitor's MATIC balance is insufficient to cover estimated gas for the
transfer (and approval if required).

**State:** No transaction broadcast.

**Customer display:** "Insufficient MATIC for gas. You need approximately
X MATIC for this transaction."

**Recovery:** Visitor must obtain MATIC before proceeding.

---

### 3.16 Broadcast success

The transaction has been submitted to the Polygon network and a transaction
hash has been returned by the RPC node.

**State:** The transaction is in-flight. Outcome is not yet known.

**Customer display:** "Transaction submitted. Waiting for confirmation." The
transaction hash is displayed and linkable (e.g., Polygonscan).

**Transition:** Move immediately to §3.17 (Submitted; outcome unknown).
Broadcast success is not confirmation. Do not display the transfer as
complete at this point.

---

### 3.17 Submitted but not confirmed / outcome unknown

A transaction hash exists but the transaction has not been confirmed on-chain.

**Invariant:** A submitted transaction with an unknown outcome must be
represented as outcome-unknown, not failed.

**State representation:**

| Observation | Display to visitor |
|---|---|
| Pending in mempool | "Submitted — awaiting confirmation" |
| Not found (dropped / reorged) | "Transaction not found — status unknown" |
| RPC error during status check | "Status check failed — check your wallet or explorer" |
| Timeout (no confirmation after N blocks) | "Confirmation timeout — check Polygonscan for status" |

**Recovery for dropped/timed-out transactions:** The visitor must check the
Polygon explorer directly with their transaction hash. ImplicitEx cannot
recover, reverse, or retry a submitted Polygon transaction on the visitor's
behalf.

**Failure representation:** A pending or unknown outcome must never be
displayed as "Failed" or "Cancelled" until on-chain evidence confirms failure
or the visitor explicitly confirms they do not wish to continue waiting.

**Provisional evidence artifact:** When the transaction has been broadcast but
not confirmed, a provisional evidence artifact may be generated containing:
- Transaction hash
- Submission timestamp
- Chain ID
- Recipient address
- Amount
- `confirmation_status: 'pending'` (explicit; does not claim success or failure)
- Explorer link

The provisional artifact must not claim success or failure. If confirmation
is later established, the visitor should obtain the confirmed artifact (§3.18).

---

### 3.18 Confirmed transaction evidence

The transaction has been confirmed on-chain (finality per Polygon consensus).

**Customer display:** "Transfer confirmed. X USDC sent to [recipient address]."

A **transaction evidence artifact** must be generated and presented to the
visitor. This artifact is governed by the existing transaction-evidence
contract. It may be generated client-side. The visitor may download or copy
it. ImplicitEx does not promise permanent server-side storage of individual
transfer receipts in V1.

The transaction evidence artifact must include:

| Field | Source |
|---|---|
| Transaction hash | Blockchain RPC |
| Approval transaction hash (if applicable) | Blockchain RPC |
| Chain ID | Wallet connection |
| Block number | Blockchain RPC |
| Confirmation status | `confirmed` |
| Sender address | Wallet connection |
| Recipient address | Active WalletRoute at time of transfer |
| USDC token contract address | Chain configuration |
| Recipient amount (atomic) | Transfer event log |
| Broadcast timestamp | Local time at broadcast |
| Confirmation timestamp | Block timestamp |
| Explorer link | Chain configuration + transaction hash |
| Coin Card ID | `card.card_id` |
| WalletRoute ID | `route.route_id` |
| Activated EvidencePublication reference | `pub.publication_id` + `pub.signature` |
| Evidence schema / version | e.g., `coin-card-transfer-evidence.v1` |

**Data model:** No data model record is created by ImplicitEx for the
visitor's transfer. The blockchain is the authoritative record. The evidence
artifact is a workflow output, not a persistent data model record.

**Relationship to evidence contracts:** The evidence artifact references the
existing activated EvidencePublication, linking the transfer to the signed
card state at time of transfer. It does not duplicate the card's signed
evidence; it points to it.

**Pre-broadcast validation failure:** A failure before broadcast (insufficient
balance, wallet rejection, chain validation failure) produces no transaction
evidence and no claim of submission.

**Wallet rejection:** No blockchain receipt. No evidence artifact asserting
submission.

---

### W3 Security boundaries

- ImplicitEx never takes custody, never holds an intermediate balance, and
  cannot reverse any submitted transaction.
- The recipient address is taken from the active WalletRoute; it is never
  modified by the execution surface.
- The authorization proof is single-use; it cannot authorize a second
  transfer with different parameters.
- Chain continuity checks (chainId match) and account continuity checks
  (wallet address unchanged) are fail-closed.
- An execution surface must not be presented for a card that is not ACTIVE.

### W3 Customer notices

No ImplicitEx-generated customer notice is triggered by a single transfer.
The transfer is between the visitor and the recipient; it does not alter the
card holder's account state.

### W3 Audit evidence

On-chain: blockchain transaction, Transfer event, block explorer.
ImplicitEx: no data model record created per transfer. The most recently
activated EvidencePublication records the card state at the time the card
was last signed, not at the time of each individual transfer.

Visitor-facing: transaction evidence artifact (§3.18) linking on-chain
evidence to the card's signed state at time of transfer. Generated
client-side; the visitor is responsible for retaining it. A provisional
artifact (§3.17) is available for submitted-but-unconfirmed transactions.

### W3 Exit conditions

Visitor has either received confirmation of a completed transfer, is
observing a pending transaction, or has been informed of a specific reason
execution is unavailable.

### W3 Out of scope

Scheduled transfers, batched transfers, invoicing, transfer history managed
by ImplicitEx, transfer insurance, fund recovery, reversal of on-chain
transactions, analytics of individual transfer amounts, visitor account
creation, visitor identity verification.

---

## Workflow 4: Evidence and Verification

### Customer objective

Confirm that a Coin Card's signed evidence is authentic, unmodified, and
current — either as the card holder reviewing their own evidence or as a
third party independently verifying a card before sending funds.

### Entry conditions

Any party has access to the card's public URL or its signed evidence bundle.

### Required authority

None. All evidence is public and verifiable without authentication and
without ImplicitEx being operational.

---

### 4.1 Card holder reviewing their own evidence

**Happy path:**

1. Card holder is authenticated and views their card management page.
2. System loads the most recent activated EvidencePublication.
3. Displays: card status, signed lifecycle bundle hash, asset hashes,
   signing key ID, publication timestamp, publication chain (prior
   publication IDs).
4. Card holder can download the signed bundle for offline verification.

**Records read:** `card`, `pub` (all activated, ordered by chain), `ent`  
**Records mutated:** None.  
**Lifecycle events:** None.

---

### 4.2 Third-party independent verification

**Entry:** Verifier has the card's public URL or handle and wants to confirm
the card is authentic and ACTIVE before sending.

**Happy path (online):**

1. Verifier opens `coincard.click/<handle>`.
2. Runtime loads the signed manifest and lifecycle bundle.
3. Verifier invokes the signature verifier per
   `COIN_CARD_SIGNATURE_VERIFIER_DESIGN_V1.md`.
4. Trusted public key retrieved per
   `COIN_CARD_TRUSTED_KEY_SOURCE_CONTRACT_V1.md`.
5. Signature verified over the canonical signing input set using
   `coin-card-canonical-json.v1`.
6. `card_status_at_publication = ACTIVE` confirmed.
7. Asset hashes verified against the published manifest assets.
8. Verification result displayed: authenticated / not authenticated / error.

**Records read:** `pub` (most recent activated), manifest assets  
**Records mutated:** None.

---

### 4.3 Verifying against registry (online)

The lifecycle registry (per `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`)
provides the current authoritative record. Verification against the registry
confirms:

- The registry accepted and published the record (`publishedAt` is registry
  evidence, not issuer-provided).
- The registry version and record ID are consistent with the signed manifest.
- The card is currently ACTIVE, EXPIRED, SUSPENDED, or REVOKED.

**Verifier note:** `signedAt`, `publishedAt`, and `verificationTime` are
three distinct timestamps. See `COIN_CARD_LIFECYCLE_REGISTRY_CONTRACT_V1.md`
for authority over each.

---

### 4.4 Verifying against bundle (offline)

The signed lifecycle bundle is independently verifiable without accessing
ImplicitEx's registry at verification time. Per
`COIN_CARD_LIFECYCLE_BUNDLE_VERIFICATION_CONTRACT_V1.md`:

1. Bundle loaded from the card's public storage path.
2. Bundle schema version confirmed: `coin-card-lifecycle-registry-bundle.v1`.
3. Each contained lifecycle record individually authenticated.
4. Records confirmed to form one coherent collection.
5. Bundle integrity established independently of ImplicitEx availability.

**Note:** V1 bundles are not separately bundle-signed. The V1 result includes
`bundleSignature: 'not-applicable-v1'`. See verification contract for exact
claims proven and not proven.

---

### 4.5 Evidence chain integrity

The EvidencePublication chain links every signed state change via
`prior_publication_id`. A verifier may:

1. Start from the most recent activated publication.
2. Follow `prior_publication_id` links backward to the `initial_activation`
   publication (which has `prior_publication_id = null`).
3. Verify that the chain is unbroken and that each link is a valid activated
   publication for the same `card_id`.

An unbroken chain from `initial_activation` to the current state establishes
full chain of custody for the card's lifecycle.

**Failure — broken chain:** A gap or invalid link is an integrity finding.
The card must not be presented as verified. ImplicitEx must investigate and
re-issue if the gap is caused by an abandoned publication.

---

### W4 Recoverable failures

- Registry temporarily unavailable: offline bundle verification remains
  available. Surface degraded-mode notice.
- Signature check produces UNAVAILABLE (resolver not reached): fail open
  with explicit warning; do not treat as authenticated.
- Asset hash mismatch: surface integrity failure; do not present card as
  verified.

### W4 Non-recoverable failures

- Signing key revoked per `COIN_CARD_SIGNATURE_POLICY_V1.md`: cards signed
  with the revoked key are not verifiable unless re-signed with a valid key.

### W4 Security boundaries

Verification is stateless and read-only. It does not require ImplicitEx to
be operational. The signed artifacts are the authority; ImplicitEx's
availability affects freshness, not the validity of past-signed evidence.

### W4 Audit evidence

Verification produces no internal records. The signed EvidencePublication
chain is the audit record.

### W4 Exit conditions

Verifier has received a definitive authenticated / unauthenticated / error
result with the specific failure reason if applicable.

### W4 Out of scope

Legal identity claims (the signed artifacts prove artifact integrity, not
real-world identity), transfer insurance verification, on-chain transaction
history.

---

## Workflow 5: Card Management

### Customer objective

Maintain, update, or close the customer's active Coin Card entitlement.

### Required authority

All management operations require an authenticated session at primary or
secondary credential level, except where noted.

---

### 5.1 Viewing card and entitlement status

**Happy path:**

1. Authenticated customer opens their card management view.
2. System reads card, active entitlement, active route, SuspensionCase (if
   any), and most recent activated EvidencePublication.
3. Displays: handle, public URL, derived status, activation date, expiration
   date, route changes used/remaining, grace period (if applicable).

**Records read:** `card`, `ent` (current), `route` (active), `case` (open,
if any), `pub` (most recent activated)  
**Records mutated:** None.  
**Lifecycle events:** None.

---

### 5.2 Updating a wallet route

**Entry conditions:** Card has `status = ACTIVE`. Customer has route changes
remaining (`route_changes_used < route_changes_allowed`).

**Required authority:** Primary credential (SIWE wallet signature).

**Happy path:**

1. Customer enters the new Polygon USDC recipient address.
2. System validates the address format (EIP-55 checksum, Polygon).
3. Customer confirms the change.
4. Server authenticates the request at primary credential level.
5. New WalletRoute record created: `route.status = 'active'`, `route.route_sequence` incremented.
6. Prior route: `route.status → 'superseded'`, `route.superseded_at` set.
7. `Entitlement.route_changes_used` incremented.
8. EvidencePublication created: `publication_type = 'route_change'`, progression through `prepared → signed → published → activated`.
9. LifecycleEvent `route_changed` written.
10. Customer-visible success: updated card showing new recipient address.

**Records created:** `route` (new)  
**Records mutated:** `route` (prior, status → superseded), `ent.route_changes_used`  
**Lifecycle events:** `route_changed`  
**Evidence publications:** `pub` (route_change, activated) [pub]

**Atomic invariant:** New route activation, prior route supersession,
entitlement counter increment, EvidencePublication activation, and lifecycle
event are a single atomic commit. If any step fails before `published`,
the new route record is abandoned and the prior route remains active.
If the publication reaches `published` but activation fails, retry or
issue compensating publication.

---

### 5.3 Route-change quota enforcement

`Entitlement.route_changes_used` is compared to `route_changes_allowed` (4)
before accepting a route-change request.

**At quota:** Customer is informed "You have used all 4 route changes for
this term. Route changes reset with renewal."

**Invariant:** `route_changes_used` is never decremented. The counter advances
only. Unused changes do not carry to a renewal term.

**Failure after partial increment:** If the route change fails after
`route_changes_used` has been incremented but before the new route is
activated, the increment must be rolled back in the same transaction. A
`route_changes_used` increment without a corresponding new active route is
a data integrity violation.

---

### 5.4 Renewal during active term

**Entry condition:** Customer has an active entitlement and chooses to renew
before expiration. Renewal is not automatic during the pilot.

**Happy path:**

1. Customer initiates renewal (manual — via checkout).
2. A new Payment record is created and enters `pending` status.
3. Payment is confirmed (`pay.status → 'confirmed'`, `pay.confirmed_at` set).
4. A new Entitlement record is created: `ent.status = 'pending_activation'`,
   provisioning deadline set to `confirmed_at + 24h`.
5. Provisioning completes (signed package published for the new term).
6. New Entitlement activates atomically:
   - `ent.status → 'active'`, `ent.activated_at` set, `ent.expires_at` set.
   - `CoinCard.active_entitlement_id → new ent.entitlement_id`.
   - `CoinCard.active_entitlement_version` incremented.
   - Prior entitlement: `ent.status → 'expired'`.
   - EvidencePublication type `renewal` activated.
   - LifecycleEvent `entitlement_activated` written.
7. The Coin Card identity (handle, card_id, public_url) is unchanged.
8. Route-change allowance resets to 4 for the new term.

**Records created:** `pay` (new), `ent` (new)  
**Records mutated:** `ent` (prior, status → expired), `card.active_entitlement_id`, `card.active_entitlement_version`  
**Lifecycle events:** `entitlement_activated`, `entitlement_expired` (prior)  
**Evidence publications:** `pub` (renewal, activated) [pub]

**Renewal notice:** 30-day notice delivered to customer's registered contact
before expiration. LifecycleEvent `renewal_notice_sent` written at notice time.

**Out of scope:** Automatic renewal, multi-year purchase, discounted renewal
pricing (pricing is disclosed before the notice is sent; the exact price is
not set by this document).

---

### 5.5 Renewal during grace

**Entry condition:** Card is EXPIRED; grace period is active
(`NOW() ≤ ent.grace_period_ends_at`). Execution is disabled.

**Happy path:** Identical to §5.4. The prior entitlement is already `expired`
before the renewal purchase. The renewal creates a new entitlement, activates
it, and re-establishes a signed ACTIVE state on the same Coin Card identity.
The card's handle and public URL are unchanged.

---

### 5.5a Post-grace reactivation

**Entry condition:** Card is EXPIRED; grace period has ended
(`NOW() > ent.grace_period_ends_at`). The card identity is permanently
reserved and has not been reassigned. Execution is disabled.

**Distinction from renewal (§5.4, §5.5):** Reactivation is not renewal.
It creates a new entitlement after an indefinite gap. It does not restore
the terms, pricing, or configuration of the prior entitlement.

**Required authority:** Primary credential (SIWE wallet signature).

**Happy path:**

1. Customer initiates reactivation (via checkout, at then-current pricing).
2. A new Payment record created; enters `pending` status.
3. Payment confirmed (`pay.confirmed_at` set; provisioning deadline = `confirmed_at + 24h`).
4. Customer supplies a current, valid Polygon USDC recipient address.
   Obsolete route configuration is not automatically restored; the prior
   `superseded` routes remain on record but a new route is required.
5. Provisioning completes (signed package published for the new term).
6. New Entitlement activates atomically — identical to §5.4 steps 6–8.
7. Card's handle, public URL, `card_id`, and full signed evidence chain
   are preserved. Card identity is continuous; no identity gap.
8. Card transitions from EXPIRED to ACTIVE.

**Records created:** `pay` (new), `ent` (new), `route` (new — fresh address required)  
**Records mutated:** `ent` (prior, status already `expired`), `card.active_entitlement_id`, `card.active_entitlement_version`  
**Lifecycle events:** `entitlement_activated`  
**Evidence publications:** `pub` (renewal type, activated) [pub]

**Note on publication type:** Post-grace reactivation uses `publication_type = 'renewal'`
because it re-establishes an ACTIVE state on the same card identity. The
distinction from within-term renewal is recorded in the lifecycle event
metadata (`activation_after_grace = true`), not in the publication type.

**Provisioning SLA:** The 24-hour SLA applies from `pay.confirmed_at`. If
provisioning fails, the refund and extension rules from Entitlement
Specification §4 apply.

**Security:** Reactivation is subject to acceptable-use review at ImplicitEx's
discretion. The operator may decline reactivation for a card with a history of
violations without triggering a refund obligation.

**Non-recoverable:** If the customer cannot supply a valid recipient address
within the provisioning window, the reactivation is cancelled and the
applicable refund rules apply.

---

### 5.6 Customer-requested cancellation

**Entry condition:** Customer requests deactivation. Entitlement may be in
any non-terminal status.

**Required authority:** Primary or secondary credential.

**Happy path:**

1. Customer confirms cancellation.
2. LifecycleEvent `cancellation_requested` written.
3. Refund eligibility determined: full refund if within 30 days of
   `ent.activated_at`; no refund after 30 days.
4. If refund due:
   - `pay.refund_initiated_at` set.
   - `pay.refund_reason = 'customer_request'`.
   - Refund processed with payment provider.
   - On confirmation: `pay.status → 'refunded'`, `pay.refunded_at` set.
   - LifecycleEvent `refund_initiated` and `refund_confirmed` written.
5. `ent.status → 'cancelled'`, `ent.cancelled_at` set.
6. `CoinCard.active_entitlement_id → null`.
7. `CoinCard.active_entitlement_version` incremented.
8. EvidencePublication type `cancellation` activated:
   - `card_status_at_publication = EXPIRED`
   - `cancellation_reason = 'customer_requested'`
   - `cancellation_effective_at = ent.cancelled_at`
   The public derived status is EXPIRED, but the signed evidence identifies
   customer-requested cancellation, not natural expiration.
9. LifecycleEvent `entitlement_cancelled` written.

**Records mutated:** `ent.status`, `ent.cancelled_at`, `pay.refund_initiated_at`, `pay.refund_reason`, `pay.status`, `pay.refunded_at`, `card.active_entitlement_id`, `card.active_entitlement_version`  
**Lifecycle events:** `cancellation_requested`, `refund_initiated` (if applicable), `refund_confirmed` (if applicable), `entitlement_cancelled`  
**Evidence publications:** `pub` (cancellation, activated; signed with `cancellation_reason` and `cancellation_effective_at`) [pub]

**Non-recoverable:** Cancellation cannot be undone. A new entitlement requires
a new purchase.

**Customer notice:** Confirmation of cancellation delivered to registered
contact. If a refund is due, refund confirmation delivered when the payment
provider confirms.

---

### 5.7 Suspension notice and review

**Entry condition:** Operator initiates suspension for grounds defined in
Entitlement Specification §6 (security investigation, suspected acceptable-use
violation, platform integrity concern). The Entitlement remains `active`
during suspension; only the derived card status changes to SUSPENDED.

**Suspension initiation (operator action):**

1. Operator creates SuspensionCase:
   - `case.status = 'open'`
   - `case.initiated_at`, `case.initiated_by`, `case.reason` set
   - `case.deadline = initiated_at + 7 calendar days`
2. `case.customer_notice_sent_at` set in the same atomic transaction
   (suspension and notice are atomic).
3. Customer notice delivered: states reason and deadline.
4. EvidencePublication type `suspension` activated: `card_status_at_publication = SUSPENDED`.
5. LifecycleEvents: `suspended`, `customer_notice_sent`.

**Customer-visible state:** Card shows SUSPENDED with stated reason. Card
is not executable. The customer's entitlement remains active; expiration
clock continues running.

**Deadline breach:** If `case.deadline` passes without resolution and no
extension was recorded:
- `case.deadline_breached_at` set.
- `case.escalated_at` set.
- `case.process_failure_code` set.
- LifecycleEvent `suspension_deadline_breached` written.
- Case status does not change; card remains SUSPENDED.
- Requires immediate operator escalation.

**Customer options:** The customer may contact support. They do not have a
unilateral mechanism to end the suspension; the suspension is operator-initiated
and must be resolved by the operator.

**Records created:** `case`  
**Records mutated:** `case.customer_notice_sent_at`, `case.customer_notice_channel`; (breach: `case.deadline_breached_at`, `case.escalated_at`, `case.process_failure_code`)  
**Lifecycle events:** `suspended`, `customer_notice_sent`; (breach: `suspension_deadline_breached`)  
**Evidence publications:** `pub` (suspension, activated) [pub]

---

### 5.8 Restoration

**Entry condition:** Open SuspensionCase; operator review concluded without
grounds for action.

**Happy path:**

1. Operator records resolution: `case.resolution = 'restored'`, `case.resolved_at`,
   `case.resolved_by`, `case.resolution_notes`.
2. `case.status → 'resolved_restored'`.
3. EvidencePublication type `restoration` activated: `card_status_at_publication = ACTIVE`.
4. LifecycleEvent `restored` written.
5. Customer notice delivered: card restored to ACTIVE.

**Customer-visible state:** Card returns to ACTIVE; execution re-enabled.

**Extension path:** If the operator needs more time before the deadline:
1. `case.extension_deadline = case.deadline + 7 calendar days` set.
2. `case.extension_reason` recorded (required).
3. `case.extension_notice_sent_at` set.
4. `case.status → 'resolved_extended'`.
5. Customer notified of extension and new deadline.
6. LifecycleEvents: `suspension_extended`, `customer_notice_sent`.
7. Resolution proceeds from `resolved_extended` state.

**Records mutated:** `case.status`, `case.resolution`, `case.resolved_at`, `case.resolved_by`, `case.resolution_notes`; (extension: `case.extension_deadline`, `case.extension_reason`, `case.extension_notice_sent_at`)  
**Lifecycle events:** `restored`; (extension: `suspension_extended`, `customer_notice_sent`)  
**Evidence publications:** `pub` (restoration, activated) [pub]

---

### 5.9 Revocation

**Entry condition:** Operator has confirmed a grounds for permanent
revocation (confirmed acceptable-use violation, fraud, court order).

**Happy path:**

1. Operator records revocation:
   - `ent.status → 'revoked'`, `ent.revoked_at` set.
   - `CoinCard.active_entitlement_id → null`.
   - `CoinCard.active_entitlement_version` incremented.
2. SuspensionCase (if open): `case.status → 'resolved_revoked'`, `case.resolution = 'revoked'`, `case.resolved_at`, `case.resolved_by`, `case.resolution_notes` (required).
3. EvidencePublication type `revocation` activated: `card_status_at_publication = REVOKED`.
4. LifecycleEvent `entitlement_revoked` written.
5. Customer notified.

**Customer-visible state:** Card shows REVOKED permanently. Execution
permanently disabled. No refund for cause revocation.

**Irrevocability:** REVOKED is a terminal status. It cannot be reversed.
A new entitlement on the same card identity is possible only per acceptable-use
policy (not defined here).

**Records mutated:** `ent.status`, `ent.revoked_at`, `card.active_entitlement_id`, `card.active_entitlement_version`, `case.status` (if open), `case.resolution`, `case.resolved_at`, `case.resolved_by`, `case.resolution_notes`  
**Lifecycle events:** `entitlement_revoked`  
**Evidence publications:** `pub` (revocation, activated) [pub]

---

### 5.10 Expiration

**Entry condition:** `NOW() >= ent.expires_at`.

**Happy path (system-driven):**

1. System detects expiration: `ent.status → 'expired'`.
2. `ent.grace_period_ends_at = expires_at + 30 days` set.
3. `CoinCard.active_entitlement_id → null`.
4. `CoinCard.active_entitlement_version` incremented.
5. EvidencePublication type `expiration` activated: `card_status_at_publication = EXPIRED`.
6. LifecycleEvents: `entitlement_expired`, `grace_period_started`.
7. Renewal notice was delivered 30 days prior (`renewal_notice_sent` event
   already on record).
8. After `grace_period_ends_at`: LifecycleEvent `grace_period_ended` written.

**Customer-visible state:** Card shows EXPIRED. Execution disabled. Renewal
option presented if card holder is authenticated. Slug not reassigned.

**Records mutated:** `ent.status`, `ent.grace_period_ends_at`, `card.active_entitlement_id`, `card.active_entitlement_version`  
**Lifecycle events:** `entitlement_expired`, `grace_period_started`, `grace_period_ended` (after grace expires)  
**Evidence publications:** `pub` (expiration, activated) [pub]

---

### 5.11 Recovery of account access

See §1.4 for the full recovery-code session workflow.

**Management restriction during recovery session:** A recovery-code session
must not permit any card management operation (route changes, cancellation,
renewal, reactivation, account closure, recovery code regeneration, email
changes, or access to complete payment details). All management operations
require a fresh session authenticated at primary or secondary credential level.

After the recovery session completes and a primary credential is restored,
the customer must initiate a new sign-in (§1.2) before performing management
operations. The recovery session does not carry over into a full session.

---

### W5 Security boundaries

- Route changes require primary-credential authentication.
- Cancellation requires primary or secondary credential.
- Renewal and reactivation purchases require authentication sufficient for
  checkout (checkout flow is out of scope for this document).
- A recovery-code session must not permit any management operation; it
  is limited to primary-credential restoration only (see §1.4).
- Suspension is operator-initiated; the customer cannot initiate or end
  a suspension unilaterally.
- Revocation is operator-initiated and permanent.
- Expiration is system-driven; it cannot be prevented by the customer.
- All management operations write immutable LifecycleEvents.
- Every state change visible in the signed registry produces an activated
  EvidencePublication.

### W5 Customer notices

| Event | Notice delivery |
|---|---|
| Renewal notice (30 days before expiration) | Registered contact |
| Suspension | Registered contact (atomic with suspension) |
| Suspension extension | Registered contact |
| Restoration | Registered contact |
| Revocation | Registered contact |
| Cancellation confirmation | Registered contact |
| Refund confirmation | Registered contact |

All notices produce a `customer_notice_sent` or `renewal_notice_sent`
LifecycleEvent. Notice delivery method is `case.customer_notice_channel` for
suspension; `notice_channel` metadata for other events.

### W5 Audit evidence

Every management operation produces at least one LifecycleEvent. Every
status change that affects the signed public state produces an activated
EvidencePublication. The combination of the immutable event log and the
chained evidence publications constitutes the auditable record.

### W5 Exit conditions

The card is in a new deterministic state that is represented in the signed
evidence record and is consistent with the data model.

### W5 Out of scope

Checkout and payment collection for subscription purchase, pricing
configuration, support ticket management, bulk operations, operator console
workflows, admin account management, third-party abuse reporting.

---

## Governance decision log

The following four governance decisions were surfaced during initial workflow
definition. All four are now resolved and incorporated.

**GD-1 — Post-grace reactivation (resolved)**
*Original:* Treated post-grace renewal as permitted with deferred policy.
*Resolution:* Post-grace reactivation is distinct from renewal. It creates a
new entitlement at then-current pricing, requires fresh route validation,
and is subject to acceptable-use review. Permanent card identity is preserved.
The entitlement specification (§6, §8) now defines the distinction.
Workflow §5.5a implements reactivation.

**GD-2 — Cancellation publication type (resolved)**
*Original:* Cancellation incorrectly used the `expiration` publication type.
*Resolution:* `cancellation` added as a distinct `EvidencePublication.publication_type`
in Data Model V1. Cancellation and natural expiration both produce
`card_status_at_publication = EXPIRED` but the cause is signed into the
evidence record. Workflow §5.6 updated.

**GD-3 — No backend record for individual transfers (resolved)**
*Original:* Noted individual transfers produce no data model record; deferred receipt architecture.
*Resolution:* Confirmed. V1 creates no backend record per transfer. The
blockchain is authoritative. A transaction evidence artifact is generated
client-side after confirmation (§3.18) and linked to the card's signed state.
V1 does not promise server storage. Provisional artifact available for
pending transactions (§3.17).

**GD-4 — Recovery-code session authority (resolved)**
*Original:* Deferred restriction policy to implementation.
*Resolution:* A recovery-code session is recovery-limited: it may only
restore a primary credential after passing a required email challenge. It
must not permit any economically consequential operation. Explicit prohibited
and permitted operation lists are now governing. See §1.4 and §5.11.

---

## Contradictions found

None. All five workflows are consistent with the ratified entitlement
specification and the ratified data model. The four governance decisions
above were clarifications and boundary extensions that have been incorporated.

---

## Amendment log

### 2026-08-02 — Four amendments applied at ratification

**Amendment A — Post-grace reactivation**
§5.5a added. §5.5 clarified as grace-period renewal only. GD-1 resolved.

**Amendment B — Cancellation publication type**
§5.6 updated to use `publication_type = 'cancellation'` with
`cancellation_reason` and `cancellation_effective_at` signing inputs. GD-2 resolved.

**Amendment C — Transaction evidence artifact**
§3.17 provisional artifact added. §3.18 rewritten with full evidence field
list, client-side generation policy, V1 storage disclaimer, and no-evidence
rules for wallet rejection and pre-broadcast failures. W3 audit evidence
updated. GD-3 resolved.

**Amendment D — Recovery-code session authority**
§1.4 rewritten with explicit permitted/prohibited operation list, required
email challenge, session termination on credential restoration. §5.11
updated. W5 security boundaries updated. GD-4 resolved.
