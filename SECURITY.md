# Security model

## Trust boundary

The SDK runs in the dApp page and treats the wallet response as an external message. It validates network IDs, wallet addresses, contract IDs, WASM IDs, amount strings, catalog fee values, contract definitions, balance fields, and invocation response identity before returning data.

The SDK does not receive private keys, seed phrases, passwords, raw signing methods, or unrestricted wallet storage access.

## Origin approval

- Connection approval is bound to the exact top-level website origin and Genesis.
- An embedded frame must not initiate wallet access.
- Remembered connection storage contains only the public network ID and address.
- `restoreConnection()` verifies the same address with the wallet and never changes it to another selected account.
- `disconnect()` revokes the approval and deletes the local restoration hint.

## Signing and funds

Read methods cannot sign or move funds. Every contract invocation that signs or transfers value requires a visible wallet confirmation. The wallet is responsible for displaying the origin, selected wallet, contract, attached amount, fee, total, inputs, and additional caller debits before approval.

Optional `callerTransfers` caps are validated independently by the SDK, extension
bridge and economic engine. The confirmation preserves the requested amount and
caps, rejects a mismatching preparation response, and signs only after the final
confirmation. Fee preparation does not execute the contract. A contract still
cannot debit an undeclared recipient or exceed the signed per-recipient limits.

A dApp can propose malicious parameters or an excessive amount. It cannot authorize them by itself. Users and applications must still review the wallet confirmation and verify that the displayed ContractID and values match the intended action.

## Application requirements

- Use a secure production origin.
- Keep the expected Genesis and ContractID in reviewed application configuration.
- Pass money as exact decimal strings and keep atomic units as strings or `BigInt`.
- Bound contract input before constructing large objects.
- Handle `USER_REJECTED`, timeouts, cancellation, network mismatch, and unknown wallet errors.
- Disable duplicate action buttons while one approval is pending.
- Do not treat `status().available` or a remembered address as an active connection.
- Do not place secrets in dApp source, status listeners, logs, or local storage.
- Escape contract output before rendering it. Never inject returned text as executable HTML or JavaScript.

## Reporting a vulnerability

Do not publish an unpatched vulnerability in a public issue. Contact the maintainers privately with the affected version, reproduction steps, impact, and proposed mitigation when available.
