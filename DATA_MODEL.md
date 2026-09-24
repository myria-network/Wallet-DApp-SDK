# MYRIA Wallet dApp SDK data model

## Representation rules

- IDs are lowercase 64-character hexadecimal strings.
- Wallet addresses use the public `myr_w_...` format.
- Monetary values crossing the extension boundary are strings.
- `amount` is decimal MYR text; `observedUnits` and fee fields are atomic-unit strings.
- Timestamps in status events are Unix milliseconds.
- Contract input and output are JSON-compatible data.

## Optional invocation debit caps

```ts
interface MyriaCallerTransfer {
  to: string;
  amountUnits: string;
}
```

`ContractRequest.callerTransfers` is an optional array of 1–8 distinct native-token
recipients with positive atomic-unit limits. These additional debits are shown
alongside the attached `amount` and fee, then included in the signed invocation
only after visible approval. They are not inferred by running the contract.

## Connection

```ts
interface MyriaConnection {
  networkId: string;
  address: string;
}
```

`networkId` identifies the Genesis. `address` is the exact public wallet address selected and approved by the user.

## Presale intent authorization

```ts
interface MyriaPresaleIntent {
  version: 1;
  challengeId: string;
  origin: string;
  networkId: string;
  cluster: 'devnet' | 'testnet';
  myriaWallet: string;
  solanaWallet: string;
  usdtMint: string;
  receiverTokenAccount: string;
  usdtAmountUnits: string;
  myrAmountUnits: string;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

interface MyriaPresaleIntentProof {
  publicKey: string;
  signature: string;
}
```

`MyriaPresaleIntent` is the complete short-lived server challenge passed unchanged to the wallet. `MyriaPresaleIntentProof` is a 44-byte Ed25519 SPKI public key and 64-byte signature encoded as Base64URL text. Neither structure authorizes a transaction or fee.

## SDK status

```ts
type MyriaBrowser = 'chromium' | 'firefox' | 'unknown';

interface MyriaSdkStatus {
  available: boolean;
  browser: MyriaBrowser;
  extensionId: string;
}
```

This structure reports bridge availability only.

## Status events

```ts
type MyriaOperation =
  | 'connect'
  | 'restore'
  | 'disconnect'
  | 'authorize-presale-intent'
  | 'balance'
  | 'sync-transaction'
  | 'contracts'
  | 'load-contract'
  | 'invoke';

type MyriaState =
  | 'opening'
  | 'awaiting-approval'
  | 'reading'
  | 'executing'
  | 'success'
  | 'error'
  | 'cancelled';

interface MyriaStatusEvent {
  operation: MyriaOperation;
  state: MyriaState;
  at: number;
  requestId?: string;
  stage?: string;
  code?: string;
  result?: unknown;
}
```

`requestId` correlates lifecycle events from one SDK call. `stage` is wallet-provided execution progress. `code` is present for errors and cancellations. `result` is present on success.

## Observed balance

```ts
interface MyriaBalance extends MyriaConnection {
  observedUnits: string | null;
  display: string | null;
  status: string;
  conflicts: number;
  balanceType: 'OBSERVED_NOT_PROVEN_SPENDABLE';
}
```

`observedUnits` is the native balance in atomic units. `null` means the wallet does not have enough verified local evidence to produce it. `display` is wallet-formatted text. `conflicts` counts known conflicting outgoing evidence. The structure never includes custom-token units in the native balance.

## Transaction sync

```ts
interface MyriaTransactionSync extends MyriaBalance {
  transactionId: string;
  recovered: boolean;
}
```

`recovered` reports whether this request added the verified transaction; `false` means it was already present. The returned balance always comes from the wallet ledger.

## Wallet assets

```ts
interface MyriaWalletAssets extends MyriaConnection {
  assets: {
    assetId: string;
    name: string;
    symbol: string;
    decimals: number;
    supplyPolicy: 'GENESIS' | 'FIXED';
    balanceUnits: string;
  }[];
}
```

`MyriaWalletAssets` is a bounded read of assets known to the approved address. `balanceUnits` is observed and does not prove that all units remain spendable. Asset names and avatars are display data; the asset ID and transaction evidence are authoritative.

## Contract catalog

```ts
interface MyriaContractDefinition {
  contractId: string;
  wasmId: string;
  owner: string;
}

interface MyriaContractCatalog {
  networkId: string;
  invocationFeeUnits: string;
  invocationMaximumFeeUnits: string;
  feeLabel: 'ESTIMATED' | 'FIXED';
  contracts: MyriaContractDefinition[];
}
```

Both fee values are native atomic-unit strings. The maximum is never lower than the estimate. Definitions describe already deployed contracts known to the wallet.

## Bound contract

```ts
class MyriaContract {
  readonly networkId: string;
  readonly address: string;
  readonly contractId: string;
  readonly wasmId: string;
  readonly owner: string;

  invoke(request?: {
    input?: unknown;
    amount?: string;
    signal?: AbortSignal;
  }): Promise<MyriaContractResult>;
}
```

The instance is immutable and bound to the address and verified definition used by `loadContract()`.

## Contract result

```ts
interface MyriaContractResult {
  operation: 'invoke';
  networkId: string;
  transactionId: string;
  executionStatus?: string;
  executionReason?: string | null;
  output?: unknown;
  [key: string]: unknown;
}
```

`transactionId` identifies the accepted transaction returned by the wallet. Contract-specific output remains JSON-compatible. Applications must evaluate `executionStatus` instead of assuming every returned transaction produced a successful contract result.

## Native AMM swap

```ts
interface MyriaAmmSwapRequest extends MyriaConnection {
  poolId: string;
  assetIn: string;
  amountInUnits: string;
  slippageBps?: number;
  signal?: AbortSignal;
}

interface MyriaAmmSwapResult {
  operation: 'amm-swap';
  status: 'ACCEPTED_LOCAL';
  networkId: string;
  transactionId: string;
  poolId: string;
  previousStateId: string;
  nextStateId: string;
  assetIn: string;
  assetOut: string;
  amountInUnits: string;
  amountOutUnits: string;
  minimumOutUnits: string;
  feeUnits: string;
  propagationStatus: 'QUEUED' | 'RECOVERY_PENDING';
}
```

All amount fields are exact atomic-unit strings. `QUEUED` means the accepted transaction has a durable discovery publication entry. `RECOVERY_PENDING` never invalidates or repeats the economic transaction.

## Native AMM liquidity

`MyriaAmmAddLiquidityRequest` provides exact `amount0Units` and `amount1Units` in canonical pool order. `MyriaAmmRemoveLiquidityRequest` provides exact `freeLpUnits`; both include a `poolId`, connected wallet identity, optional slippage basis points and optional abort signal.

`MyriaAmmLiquidityResult` carries `operation: 'amm-add-liquidity' | 'amm-remove-liquidity'`, `status: 'ACCEPTED_LOCAL'`, network, transaction, pool and state IDs, `amount0Units`, `amount1Units`, `freeLpUnits`, `feeUnits` and publication status. For adding, amounts are deposited and free LP is minted; for removing, free LP is burned and the two asset amounts are received.

`MyriaAmmPoolPosition` carries network, address, pool ID, LP asset ID and freely spendable `freeLpUnits`; it excludes locked founder LP.

## Disconnect result

```ts
interface MyriaDisconnectResult extends MyriaConnection {
  disconnected: true;
}
```

## Client options and adapters

```ts
interface MyriaStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface MyriaDappOptions {
  extensionId?: string;
  runtime?: MyriaRuntime;
  storage?: MyriaStorage | false;
  initialTimeoutMs?: number;
  approvalTimeoutMs?: number;
}
```

`runtime` and `storage` are injection points for compatible browser environments and controlled tests. They do not grant a dApp any wallet permission.
