# ImplicitEx Foundation Checkpoint (2026-04-30)

This document records the state of the ImplicitEx project at the close of the
2026-04-30 cleanup and hardening session. It serves as a reference point before
testnet planning begins.

---

## 1. Canonical Repo Status

- **Repo root:** `/home/adenmediagroup/DevEnv/implicitex`
- **Canonical remote:** `git@github.com:implicitexlabs/implicitex.git` (origin)
- **Legacy remote parked:** `git@github.com:implicitexlabs/implicitex-site.git`
  (legacy-origin — do not push to; retained as reference only)
- **Dirty history:** `/home/adenmediagroup/DevEnv/implicitex_dirty_history_2026-04-30`
  (local only, never pushed — contains pre-clean history with sensitive material)
- **Local quarantine:** `/home/adenmediagroup/DevEnv/implicitex_local_quarantine_2026-04-30`
  (local only, never pushed — contains risky legacy runtime files removed from repo)
- **Secrets:** `.private/secrets/` (gitignored, local only)
- **HEAD at close:** `2eba935 Merge adversarial ImplicitEx contract tests`

---

## 2. Frontend Status

- **Layout:** Static-runtime. Browser-served assets under `app-web/frontend/public/`.
  No bundler. `app-web/frontend/src/` reserved as future build-tool source lane.
- **Publish safety:** PUBLISH_SAFE scan passed. No hardcoded RPC URLs, API keys,
  provider URLs, or contract addresses in active runtime files.
- **Demo transfer flow:** A visible "Open Demo Transfer" button is present in
  `index.html`. The modal flow is labeled as demo/non-executing. No real USDC
  transfer is claimed or executed.
- **Wallet wiring:** `scripts/wallet.js` is the single active wallet module.
  `header.js` delegates to `window.connectWallet` only — no duplicate behavior.
  Footer placeholder is wired to `#footer-placeholder` in `index.html`.
- **Quarantined scripts:** `app.js`, `main.js`, `verify.js`, `wallet-1.js`,
  `wallet-email.js`, and `gas-estimator.js` were removed from active runtime
  and placed in local quarantine. They do not ship.

---

## 3. Contract Status

- **File:** `app-web/contracts/implicitex_transfer.sol`
- **OpenZeppelin hardening completed:**
  - `Ownable2Step` — two-step ownership transfer replaces single-step custom logic
  - `Pausable` — OZ-standard pause/unpause replaces custom bool modifier
  - `ReentrancyGuard` — OZ guard replaces custom `entered` bool
  - `SafeERC20` — safe token interaction replaces direct require-on-bool pattern
  - `IERC20` — OZ interface replaces custom minimal interface
- **Behavior preserved:**
  - `transferWithFee(recipient, amount)` is the public transfer entry point
  - Fee basis points, min transfer amount, transfer precision, and treasury
    address are all configurable by owner
  - Fee cap of 10% (`MAX_FEE_BPS = 1000`) enforced
  - All original events retained (plus OZ ownership events)
- **Contract addresses:** None. No deployment has occurred.
- **Network config:** None. No RPC URLs, chain IDs, or provider configuration added.

---

## 4. Test Status

- **Framework:** Hardhat, local in-memory network only
- **Config:** `app-web/hardhat.config.js` — `sources: ./contracts`, `tests: ./tests`
- **Test file:** `app-web/tests/contracts/implicitex_transfer.test.js`
- **Mock contracts:** `MockERC20.sol`, `ReentrantERC20Mock.sol`, `FeeOnTransferERC20Mock.sol`
- **Suite result:** 36 passing
- **Coverage includes:**
  - Constructor validation (all guards)
  - Ownable2Step semantics (pending owner, accept ownership, rejection of unauthorized accept)
  - Pause/unpause owner controls and transfer blocking
  - Fee/min/precision admin setters (owner success + non-owner rejection)
  - `transferWithFee` happy path (with and without fee)
  - Fee math and rounding
  - Failure branches: transferFrom failure, recipient transfer failure, fee transfer failure
  - Adversarial reentrancy callback attempt
  - Fee-on-transfer token unsupported behavior
  - Sequential transfer balance invariants
  - Event emission checks for core events

---

## 5. Production Status

- **Real transfers:** Disabled. The frontend does not execute USDC transfers.
- **Production gate:** `docs/product/production-transfer-gate.md` — checklist not complete
- **Gate status doc:** `docs/product/production-transfer-gate-status-2026-04-30.md`
- **Remaining open gates (as of this checkpoint):**
  - Contract deployment (no addresses exist)
  - Chain/address configuration (no chain config exists)
  - Allowance/approval flow (not wired in frontend)
  - Transaction lifecycle states (demo modal only, no real tx states)
  - Full error handling for on-chain failures
  - Security/ops controls (multisig policy, treasury key policy, incident runbook)
  - Testnet signoff (no testnet deployment has occurred)
  - Production enablement (blocked by all above)

---

## 6. Next Safe Branch

**Branch:** `testnet-readiness-plan-2026-04-30`

**Purpose:** Define what is required before a controlled testnet deployment can
proceed. Planning only — no deployment wiring, no addresses, no RPC URLs, no
network config in this branch.

**Scope:**
- Define required chain configuration structure (which networks, what addresses needed)
- Define deploy artifact expectations (what Hardhat ignition/scripts output is needed)
- Define frontend config gate (how chain/contract config will be injected safely)
- Define testnet ops runbook skeleton (who deploys, how, under what controls)
- Define testnet signoff criteria (what must pass before calling testnet done)

**What this branch must not do:**
- Add deployment addresses
- Add RPC URLs, API keys, or provider config
- Wire frontend transaction execution
- Deploy contracts
