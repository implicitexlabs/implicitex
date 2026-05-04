# Transaction Execution Contract

## Purpose

This contract defines the minimum required behavior before the ImplicitEx
frontend may execute a real USDC transfer.

The production transaction path must route through the ImplicitEx smart
contract. A direct USDC `transfer(address,uint256)` call is not an acceptable
production transfer path because it bypasses platform fee routing, treasury
accounting, pause controls, and the `TransferExecuted` event trail.

## Required Runtime Inputs

Before execution is possible, the frontend must have a reviewed chain config
entry for the active network:

- Supported chain ID.
- Network display name.
- USDC token address for that network.
- Deployed ImplicitEx contract address for that network.
- Block explorer base URL.
- `transfersEnabled` intentionally set for the current release stage.

Execution must be blocked if any required config value is missing, malformed, or
mismatched with the connected wallet network.

## Required Wallet Flow

The frontend must:

- Detect whether an injected wallet provider is available.
- Request wallet connection only after user action.
- Read the connected account.
- Detect the active chain.
- Reject unsupported chains.
- Offer a clear switch-network path when possible.
- Keep transfers disabled if `transfersEnabled` is false.

## Required Contract Reads

Before submit, the frontend must read live values from the deployed ImplicitEx
contract:

- `feeBasisPoints()`
- `minTransferAmount()`
- `transferPrecision()`
- `paused()`

The frontend must read token state from USDC:

- `decimals()`
- sender balance
- sender allowance for spender = ImplicitEx contract

Hardcoded fee/min/precision assumptions are not acceptable for real execution.

## Required Validation

The frontend must block submit when:

- Recipient is not a valid EVM address.
- Recipient is the zero address.
- Amount is not positive.
- Amount is below `minTransferAmount`.
- Amount does not satisfy `transferPrecision`.
- Sender balance is below amount plus fee.
- Contract is paused.
- Chain config is missing.
- Wallet is disconnected.
- Connected chain is unsupported.

## Required Approval Flow

If USDC allowance is below the required total debit, the frontend must:

- Show the required approval amount.
- Request `approve(implicitExAddress, requiredTotalDebit)`.
- Handle user rejection.
- Handle failed approval.
- Wait for approval confirmation.
- Re-read allowance before transfer submission.

## Required Transfer Flow

After validation and sufficient allowance, the frontend must call:

```text
ImplicitExTransfer.transferWithFee(recipient, amount)
```

The frontend must not call direct USDC `transfer(...)` for the production
transaction path.

## Required Transaction States

The UI must distinguish:

- Ready
- Waiting for wallet signature
- Approval pending
- Approval confirmed
- Transfer pending
- Transfer confirmed
- User rejected
- Failed/reverted
- Unknown or replaced transaction state

Confirmed transfers must show an explorer link or receipt metadata.

## Required Error Handling

The frontend must show clear errors for:

- Wallet missing
- Wallet disconnected
- Wrong network
- Unsupported network
- Missing config
- Invalid recipient
- Invalid amount
- Insufficient balance
- Insufficient allowance
- Approval rejected
- Approval failed
- Transfer rejected
- Transfer failed or reverted
- Contract paused
- Gas estimate failure
- Fee data failure

## Required Guard

Before any real transaction path is enabled:

```bash
cd app-web
npm test
npx hardhat compile
npx hardhat run scripts/local_predeploy_check.js
npm run check:static
```

Additional browser and testnet smoke evidence is required by the launch gate.

## Hard Stops

Do not enable real transaction execution if:

- `transfersEnabled` is true before signoff.
- No deployed ImplicitEx contract address exists for the active chain.
- Frontend submits direct USDC `transfer(...)` as the production path.
- Fee/min/precision are hardcoded instead of read from contract.
- Approval and allowance handling are missing.
- Testnet smoke evidence is missing.
- Negative-path smoke evidence is missing.
