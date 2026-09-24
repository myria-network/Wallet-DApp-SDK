# MYRIA Wallet dApp SDK API

## Exports

| Export | Purpose |
| --- | --- |
| `createMyriaDapp(options?)` | Creates a browser client. |
| `MyriaDappClient` | Main client class. |
| `MyriaContract` | Contract instance bound to one approved network, address, and deployed contract. |
| `MyriaDappError` | SDK error with a stable `code`. |
| `myriaAmountToUnits(value)` | Converts exact decimal MYR text into atomic units. |
| `myriaUnitsToAmount(value)` | Converts atomic-unit text into a trimmed decimal MYR amount. |
| `tokenAvatarArt(assetId, symbol?, name?, rootAssetId?)` | Returns deterministic Pixel Blast drawing instructions. The seed binds AssetID, symbol and name; the violet MYRIA palette is used only when `assetId === rootAssetId`. |
| `tokenInitial(symbol?, name?)` | Returns the single-letter token mark; MYR and TMYR always return `M`. |
| `drawTokenAvatar(canvas, options)` | Draws the token portrait into a browser canvas. |
| `tokenAvatarPng(assetId, symbol?, name?, rootAssetId?)` | Returns a cached PNG base64 data URL with the same root-palette rule. |
| `MYRIA_DECIMALS` | Native MYR precision used by the SDK: `9`. |
| `MYRIA_CHROME_EXTENSION_ID` | Default compatible Chromium extension identifier. |

All result structures are defined in [DATA_MODEL.md](./DATA_MODEL.md) and shipped as TypeScript declarations.

## Token portraits

```js
import {tokenAvatarPng} from '@myria-network/dapp';

const src = tokenAvatarPng(assetId, symbol, name, networkId);
```

The image is derived locally from the verified `AssetID`, symbol and name by `@myria-network/core`, which this SDK re-exports for compatibility. It does not replace protocol verification. Pass the verified Genesis NetworkID as `rootAssetId`: only an exact AssetID match receives violet. Without a root ID, even a token named MYR or TMYR uses a custom palette. Color alone never authenticates an asset.

## Create a client

```js
const myria = createMyriaDapp({
  extensionId,
  storage,
  initialTimeoutMs,
  approvalTimeoutMs
});
```

| Option | Description |
| --- | --- |
| `extensionId` | Optional compatible Chromium extension ID override. |
| `runtime` | Optional browser-runtime adapter for controlled integrations and tests. |
| `storage` | `localStorage`-compatible object, or `false` to disable remembered public addresses. |
| `initialTimeoutMs` | Time allowed for the wallet bridge to answer the initial request. |
| `approvalTimeoutMs` | Time allowed for a visible connection or invocation approval. |

## `status()`

Synchronous bridge detection:

```js
const status = myria.status();
// {available, browser, extensionId}
```

`available` only means that a compatible runtime bridge is present. It does not mean the site is connected or approved.

## `onStatus(listener)`

Subscribes to progress from every SDK operation and returns an unsubscribe function:

```js
const unsubscribe = myria.onStatus(event => {
  console.log(event.operation, event.state, event.stage, event.code);
});

unsubscribe();
```

States are `opening`, `awaiting-approval`, `reading`, `executing`, `success`, `error`, and `cancelled`. See [status events](./DATA_MODEL.md#status-events).

## `rememberedConnection(networkId)`

Returns the public address last approved for this website and network, or `null`:

```js
const remembered = myria.rememberedConnection(NETWORK_ID);
```

This local record is a restoration hint. It is not proof that approval still exists. `restoreConnection()` verifies it with the wallet.

## `connect({networkId, signal?})`

Opens the wallet's connection approval and returns the address explicitly selected by the user:

```js
const connection = await myria.connect({
  networkId: NETWORK_ID,
  signal: controller.signal
});
```

The result is `{networkId, address}`. The SDK never receives a private key, seed, password, or signing capability.

## `restoreConnection({networkId, address?, signal?})`

Restores an existing approval without opening a new selection flow:

```js
const connection = await myria.restoreConnection({networkId: NETWORK_ID});
```

When `address` is omitted, the SDK uses `rememberedConnection(networkId)`. The wallet confirms that the exact origin, network, and address remain approved. It does not replace the address with the wallet's most recently opened account.

Handle a missing or revoked connection explicitly:

```js
try {
  return await myria.restoreConnection({networkId: NETWORK_ID});
} catch (error) {
  if (error instanceof MyriaDappError &&
      ['NO_REMEMBERED_CONNECTION', 'NOT_CONNECTED'].includes(error.code)) {
    return myria.connect({networkId: NETWORK_ID});
  }
  throw error;
}
```

## `disconnect({networkId, address?, signal?})`

Revokes the origin approval in the wallet and removes the remembered public address:

```js
await myria.disconnect(connection);
```

The result contains `{networkId, address, disconnected: true}`.

## `authorizePresaleIntent({intent, signal?})`

Opens a dedicated MYRIA Wallet confirmation for one server-issued `MYRIA_PRESALE_INTENT_V1` challenge:

```js
const proof = await myria.authorizePresaleIntent({intent});
```

The wallet displays the exact website origin, MYRIA recipient, Solana payer, USDT amount and MYR amount. Approval returns `{publicKey, signature}` and emits the `authorize-presale-intent` operation with `awaiting-approval` while the wallet window is open. This is an off-chain Ed25519 authorization: it creates no MYRIA transaction, moves no funds and charges no network fee. The SDK validates the complete bounded intent and the exact proof encoding, and does not persist either value.

## `getAssets({networkId, address, signal?})`

Reads up to 100 assets known to the approved wallet address and returns their public identifiers, name, symbol, precision, supply policy, and observed atomic balance. This is a read-only request. A dApp may use these assets in a picker, but a wallet must verify the current spendable outputs and pool before any trade.

```js
const {assets} = await myria.getAssets(connection);
for (const asset of assets) console.log(asset.assetId, asset.symbol, asset.balanceUnits);
```

## `getBalance({networkId, address, signal?})`

Reads the wallet engine's observed native balance projection:

```js
const balance = await myria.getBalance(connection);

console.log(balance.observedUnits); // atomic-unit string or null
console.log(balance.display);       // formatted text or null
console.log(balance.status);
console.log(balance.conflicts);
```

This is a read operation and does not open a signing confirmation. The SDK validates the network, address, numeric representation, conflict count, and balance type before returning it.

## `syncTransaction({networkId, address, transactionId, signal?})`

Asks the approved wallet to discover and validate one exact transaction involving the selected address, then returns its ledger-derived observed balance:

```js
const result = await myria.syncTransaction({...connection, transactionId});
```

The transaction ID is only a locator. The wallet verifies the transaction, its dependencies, its economic admission, and its relationship to the selected address. This read/recovery operation never signs or trusts an amount supplied by the website.

## `getContracts({networkId, address, signal?})`

Reads deployed contracts known and verified by the selected wallet:

```js
const catalog = await myria.getContracts(connection);

console.log(catalog.invocationFeeUnits);
console.log(catalog.invocationMaximumFeeUnits);

for (const contract of catalog.contracts) {
  console.log(contract.contractId, contract.wasmId, contract.owner);
}
```

Amounts are atomic-unit strings. `feeLabel` is `ESTIMATED` or `FIXED`. Reading the catalog cannot invoke, deploy, or transfer funds.

## `loadContract({networkId, address, contractId, signal?})`

Finds an existing deployed contract in `getContracts()` and returns a bound `MyriaContract`:

```js
const contract = await myria.loadContract({...connection, contractId: CONTRACT_ID});

console.log(contract.networkId);
console.log(contract.address);
console.log(contract.contractId);
console.log(contract.wasmId);
console.log(contract.owner);
```

The SDK never deploys the contract. If the exact ID is absent from the verified wallet catalog, it throws `CONTRACT_NOT_FOUND`.

## `contract.invoke({input?, amount?, signal?})`

Invokes the contract bound by `loadContract()`:

```js
const result = await contract.invoke({
  input: {
    action: 'place-order',
    items: [{id: 'item-1', quantity: 2}]
  },
  amount: '1.25',
  signal: controller.signal
});
```

`input` must serialize as JSON and is limited to 32,768 characters. A string input must itself contain valid JSON. `amount` must be exact non-negative decimal text with at most nine fractional digits. Never pass a JavaScript number for money.

The wallet opens a visible confirmation. A successful promise resolution means the SDK received and validated the wallet response envelope; inspect `executionStatus`, `executionReason`, and `output` for the contract outcome.

## `invokeContract({networkId, address, contractId, input?, amount?, callerTransfers?, signal?})`

Direct form of `contract.invoke()`:

```js
const result = await myria.invokeContract({
  ...connection,
  contractId: CONTRACT_ID,
  input: {action: 'status'},
  amount: '0'
});
```

Use `loadContract()` when repeated calls should stay bound to the same verified contract definition. Use `invokeContract()` when the application already controls a verified `ContractID` and does not need a reusable instance.

`callerTransfers` optionally declares additional native-token debit caps for this
invocation, also supported by `contract.invoke()`. It is not an approval: the
wallet displays every recipient, cap, fee and maximum total before the user
confirms. No contract simulation is performed to discover these caps or price
the invocation. Undeclared or excessive debits fail during verified execution.

```js
await contract.invoke({
  input: {action: 'buy'},
  amount: '0',
  callerTransfers: [{to: recipientAddress, amountUnits: '2000000000'}]
});
```

Each cap is exact atomic-unit text (here, 2 MYR), not decimal MYR or a JavaScript
number. Use 1–8 unique canonical wallet addresses, positive caps, and a total
at most `18446744073709551615` atomic units. Omit the field when unused; an empty
array, duplicate destination or unknown cap field is rejected. These caps do
not authorize later invocations and unused allowances are not paid out.

## `requestAmmSwap({networkId, address, poolId, assetIn, amountInUnits, slippageBps?, signal?})`

Requests a native AMM swap through the dedicated wallet confirmation channel:

```js
const swap = await myria.requestAmmSwap({
  ...connection,
  poolId: POOL_ID,
  assetIn: ASSET_ID,
  amountInUnits: '250000000',
  slippageBps: 50
});
```

`amountInUnits` is an exact positive unsigned atomic-unit string. `slippageBps` defaults to 50 (0.5%) and must be an integer from 1 through 500. The wallet independently reloads the verified pool, calculates the protected minimum and fee, shows them to the user, and signs only after visible approval.

The result contains the accepted transaction and exact input/output, pool-state, fee, and propagation fields documented by `MyriaAmmSwapResult`. A result with `RECOVERY_PENDING` is still an accepted swap; only discovery publication needs background recovery and the dApp must not repeat the swap.

## Native AMM liquidity

`requestAmmAddLiquidity({networkId, address, poolId, amount0Units, amount1Units, slippageBps?, signal?})` and `requestAmmRemoveLiquidity({networkId, address, poolId, freeLpUnits, slippageBps?, signal?})` request a visible wallet confirmation for a verified pool. Amounts are positive atomic-unit strings; `amount0Units` and `amount1Units` follow the pool's canonical asset order, while `freeLpUnits` is the freely spendable LP amount. Slippage defaults to 50 basis points.

The wallet independently reloads the pool, balances and network fee, presents the minimum LP or asset outputs, and returns `MyriaAmmLiquidityResult` only after local acceptance. A dApp must not retry an accepted operation solely because discovery publication is pending.

`getAmmPoolPosition({networkId, address, poolId, signal?})` reads the connected wallet's verified, freely spendable LP balance without signing. The result is `MyriaAmmPoolPosition`. Locked founder LP is excluded.

## Exact amount conversion

```js
myriaAmountToUnits('1.123456789'); // '1123456789'
myriaAmountToUnits('0.000000001'); // '1'

myriaUnitsToAmount('1123456789');  // '1.123456789'
myriaUnitsToAmount('2000000000');  // '2'
```

Both functions validate the unsigned 64-bit limit and avoid floating point.

## Cancellation

Every asynchronous request accepts an optional `AbortSignal`:

```js
const controller = new AbortController();
const request = myria.getContracts({...connection, signal: controller.signal});

controller.abort();
await request; // rejects with MyriaDappError code CANCELLED
```

Cancellation closes the request port. It cannot reverse a transaction already approved and accepted by the wallet.

## Errors

```js
try {
  await contract.invoke({input, amount});
} catch (error) {
  if (error instanceof MyriaDappError) {
    console.error(error.code, error.message);
  }
}
```

| Code | Meaning or next action |
| --- | --- |
| `WALLET_UNAVAILABLE` | Compatible wallet bridge is missing, disabled, closed, or unreachable. |
| `INVALID_NETWORK` | `networkId` is not a lowercase 64-character hexadecimal ID. |
| `INVALID_WALLET_ADDRESS` | The supplied public address is malformed. |
| `NO_REMEMBERED_CONNECTION` | No public address is stored for this network; call `connect()`. |
| `NOT_CONNECTED` | The wallet no longer recognizes the origin/network/address approval. |
| `NETWORK_MISMATCH` | The requested Genesis does not match the wallet context. |
| `INVALID_CONTRACT_ID` | The supplied ContractID is malformed. |
| `CONTRACT_NOT_FOUND` | The wallet's verified catalog does not contain that deployed contract. |
| `INVALID_CONTRACT_INPUT` | Input is not valid bounded JSON. |
| `INVALID_AMM_SWAP` | The AMM request has missing or unexpected fields. |
| `INVALID_POOL_ID` | The supplied PoolID is malformed. |
| `INVALID_ASSET_ID` | The supplied AssetID is malformed. |
| `INVALID_SLIPPAGE` | Slippage is not an integer from 1 through 500 basis points. |
| `INVALID_AMOUNT` | Amount is not exact supported decimal text or exceeds the limit. |
| `INVALID_UNITS` | Atomic units are malformed or exceed the limit. |
| `INVALID_WALLET_RESPONSE` | The wallet response did not satisfy the SDK's expected structure. |
| `USER_REJECTED` | The user rejected the visible request. |
| `WALLET_WINDOW_CLOSED` | The approval window closed before completion. |
| `APPROVAL_EXPIRED` | The approval deadline elapsed. |
| `REQUEST_TIMEOUT` | A read did not complete before its deadline. |
| `EXECUTION_TIMEOUT` | Contract execution did not complete before its deadline. |
| `CANCELLED` | The caller's `AbortSignal` cancelled the request. |
| `WALLET_ERROR` | The wallet returned an unclassified error. |

The wallet may return additional protocol-specific error codes. Applications should display unknown codes safely and avoid treating an unknown failure as success.
