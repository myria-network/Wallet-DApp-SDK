# MYRIA Wallet dApp SDK data model

## Representation rules

- IDs are lowercase 64-character hexadecimal strings.
- Wallet addresses use the public `myr_w_...` format.
- Monetary values crossing the extension boundary are strings.
- `amount` is decimal MYR text; `observedUnits` and fee fields are atomic-unit strings.
- Timestamps in status events are Unix milliseconds.
- Contract input and output are JSON-compatible data.

## Connection

```ts
interface MyriaConnection {
  networkId: string;
  address: string;
}
```

`networkId` identifies the Genesis. `address` is the exact public wallet address selected and approved by the user.

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
  | 'balance'
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
