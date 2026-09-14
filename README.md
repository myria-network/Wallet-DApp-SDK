# MYRIA Wallet dApp SDK

Browser JavaScript SDK for connecting a website to MYRIA Wallet, reading the selected public address and observed balance, finding an already deployed smart contract by `ContractID`, invoking it with JSON parameters, and receiving progress, results, and errors.

The SDK supports Chromium and Firefox through the same public API. It does not hold keys, sign transactions, deploy contracts, or bypass the wallet. Every operation that signs or moves funds requires a visible confirmation inside MYRIA Wallet.

## Documentation

| Guide | Use it for |
| --- | --- |
| [API reference](./API.md) | Every export and method, options, connection lifecycle, contract invocation, status events, cancellation, and errors. |
| [Data model](./DATA_MODEL.md) | Exact TypeScript structures returned by connection, balance, contract catalog, invocation, and status APIs. |
| [Security](./SECURITY.md) | Origin binding, confirmation boundaries, input validation, storage behavior, and safe dApp integration. |
| [Browser example](./examples/contract.html) | Complete no-bundler connection and contract invocation flow. |

## Install

```bash
npm install github:myria-network/Wallet-DApp-SDK
```

```js
import {
  createMyriaDapp,
  MyriaDappError,
  myriaAmountToUnits,
  myriaUnitsToAmount
} from '@myria-network/dapp';
```

For a website without a bundler, build or copy `dist/myria-dapp.iife.js` and load it with a script tag. The exports are available under `window.MyriaDapp`.

## Quick start

```js
import {createMyriaDapp, MyriaDappError} from '@myria-network/dapp';

const NETWORK_ID = 'YOUR_64_CHARACTER_GENESIS_ID';
const CONTRACT_ID = 'YOUR_64_CHARACTER_CONTRACT_ID';
const myria = createMyriaDapp();

myria.onStatus(event => {
  console.log(event.operation, event.state, event.stage ?? '', event.code ?? '');
});

let connection;

try {
  connection = await myria.restoreConnection({networkId: NETWORK_ID});
} catch (error) {
  if (!(error instanceof MyriaDappError) ||
      !['NO_REMEMBERED_CONNECTION', 'NOT_CONNECTED'].includes(error.code)) {
    throw error;
  }
  connection = await myria.connect({networkId: NETWORK_ID});
}

const balance = await myria.getBalance(connection);
console.log(connection.address, balance.observedUnits, balance.display);

const contract = await myria.loadContract({
  ...connection,
  contractId: CONTRACT_ID
});

const result = await contract.invoke({
  input: {action: 'example', value: 42},
  amount: '0.5'
});

console.log(result.transactionId, result.executionStatus, result.output);
```

## How it works

```text
Website
  ↓ request through the SDK
MYRIA Wallet browser bridge
  ↓ origin and network approval
Visible wallet confirmation
  ↓ local signing and verified execution
Structured result or MyriaDappError
```

Connection approval is bound to the exact website origin and Genesis. The dApp receives the selected public address. `restoreConnection()` asks the wallet to restore that exact approval; it does not silently select a different wallet.

`loadContract()` reads the wallet's verified contract catalog and binds a `MyriaContract` instance to the approved network, wallet address, and deployed `ContractID`. `invoke()` sends JSON input and an exact decimal MYR amount to the wallet. The wallet shows the site, wallet, contract, amount, fee, total, inputs, and any additional debit before the user confirms.

## Supported operations

- Detect whether the MYRIA Wallet bridge is available.
- Subscribe to operation lifecycle events.
- Connect and obtain the selected public wallet address.
- Restore the same remembered address after reload.
- Revoke the current website approval.
- Read the approved wallet's observed native balance.
- List deployed contracts known and verified by the wallet.
- Load one existing contract by `ContractID`.
- Invoke through a bound `MyriaContract` or directly through the client.
- Receive execution progress, transaction ID, execution status, output, and errors.
- Convert exact decimal MYR text to atomic units and back without floating point.
- Cancel pending calls with `AbortSignal`.

Read the [complete API reference](./API.md) and [data model](./DATA_MODEL.md) before integrating production flows.

## Browser requirements

- A compatible MYRIA Wallet extension must be installed and enabled.
- Production dApps must use a secure top-level origin.
- Local development can use loopback origins supported by the wallet.
- The same JavaScript API is exposed to compatible Chromium and Firefox builds.

The SDK is frontend code. A backend can prepare public application data, but it cannot use this browser bridge to sign for a user. User-authorized wallet operations must start from the approved browser page.

## License

MIT
