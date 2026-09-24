export type MyriaBrowser='chromium'|'firefox'|'unknown';
export type MyriaOperation='connect'|'restore'|'disconnect'|'authorize-presale-intent'|'balance'|'sync-transaction'|'assets'|'contracts'|'load-contract'|'invoke'|'amm-swap'|'amm-add-liquidity'|'amm-remove-liquidity'|'amm-position';
export type MyriaState='opening'|'awaiting-approval'|'reading'|'executing'|'success'|'error'|'cancelled';
export interface MyriaStatusEvent {operation:MyriaOperation;state:MyriaState;at:number;requestId?:string;stage?:string;code?:string;result?:unknown}
export interface MyriaConnection {networkId:string;address:string}
export interface MyriaPresaleIntent {version:1;challengeId:string;origin:string;networkId:string;cluster:'devnet'|'testnet';myriaWallet:string;solanaWallet:string;usdtMint:string;receiverTokenAccount:string;usdtAmountUnits:string;myrAmountUnits:string;nonce:string;issuedAt:string;expiresAt:string}
export interface MyriaPresaleIntentProof {publicKey:string;signature:string}
export interface MyriaBalance extends MyriaConnection {observedUnits:string|null;display:string|null;status:string;conflicts:number;balanceType:'OBSERVED_NOT_PROVEN_SPENDABLE'}
export interface MyriaTransactionSync extends MyriaBalance {transactionId:string;recovered:boolean}
export interface MyriaWalletAsset {assetId:string;name:string;symbol:string;decimals:number;supplyPolicy:'GENESIS'|'FIXED';balanceUnits:string}
export interface MyriaWalletAssets extends MyriaConnection {assets:MyriaWalletAsset[]}
export interface MyriaContractDefinition {contractId:string;wasmId:string;owner:string}
export interface MyriaContractCatalog {networkId:string;invocationFeeUnits:string;invocationMaximumFeeUnits:string;feeLabel:'ESTIMATED'|'FIXED';contracts:MyriaContractDefinition[]}
export interface MyriaContractResult {operation:'invoke';networkId:string;transactionId:string;executionStatus?:string;executionReason?:string|null;output?:unknown;[key:string]:unknown}
export interface MyriaAmmSwapRequest extends MyriaConnection {poolId:string;assetIn:string;amountInUnits:string;slippageBps?:number;signal?:AbortSignal}
export interface MyriaAmmSwapResult {operation:'amm-swap';status:'ACCEPTED_LOCAL';networkId:string;transactionId:string;poolId:string;previousStateId:string;nextStateId:string;assetIn:string;assetOut:string;amountInUnits:string;amountOutUnits:string;minimumOutUnits:string;feeUnits:string;propagationStatus:'QUEUED'|'RECOVERY_PENDING'}
export interface MyriaAmmAddLiquidityRequest extends MyriaConnection {poolId:string;amount0Units:string;amount1Units:string;slippageBps?:number;signal?:AbortSignal}
export interface MyriaAmmRemoveLiquidityRequest extends MyriaConnection {poolId:string;freeLpUnits:string;slippageBps?:number;signal?:AbortSignal}
export interface MyriaAmmLiquidityResult {operation:'amm-add-liquidity'|'amm-remove-liquidity';status:'ACCEPTED_LOCAL';networkId:string;transactionId:string;poolId:string;previousStateId:string;nextStateId:string;amount0Units:string;amount1Units:string;freeLpUnits:string;feeUnits:string;propagationStatus:'QUEUED'|'RECOVERY_PENDING'}
export interface MyriaAmmPoolPosition extends MyriaConnection {poolId:string;lpAssetId:string;freeLpUnits:string}
export interface MyriaStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export interface MyriaPort {postMessage(value:unknown):void;disconnect():void;onMessage:{addListener(listener:(value:any)=>void):void};onDisconnect:{addListener(listener:()=>void):void}}
export interface MyriaRuntime {connect(extensionId:string,options:{name:string}):MyriaPort;lastError?:unknown}
export interface MyriaDappOptions {extensionId?:string;runtime?:MyriaRuntime;storage?:MyriaStorage|false;initialTimeoutMs?:number;approvalTimeoutMs?:number}
export interface ConnectedRequest {networkId:string;signal?:AbortSignal}
export interface WalletRequest extends ConnectedRequest {address?:string}
/** Per-invocation native-token debit limit, shown for approval before signing. */
export interface MyriaCallerTransfer {to:string;amountUnits:string}
export interface ContractRequest extends ConnectedRequest {address:string;input?:unknown;amount?:string;callerTransfers?:MyriaCallerTransfer[]}
export declare const MYRIA_CHROME_EXTENSION_ID:string;
export declare const MYRIA_DECIMALS:9;
/** Converts exact MYR decimal text to JSON-safe atomic units without floating point. */
export declare function myriaAmountToUnits(value:string):string;
/** Converts JSON-safe atomic units to exact MYR decimal text, trimming trailing zeroes. */
export declare function myriaUnitsToAmount(value:string):string;
export declare class MyriaDappError extends Error {readonly code:string;constructor(code:string,message?:string,cause?:unknown)}
export declare class MyriaContract {
 readonly networkId:string;readonly address:string;readonly contractId:string;readonly wasmId:string;readonly owner:string;
 invoke(request?:{input?:unknown;amount?:string;callerTransfers?:MyriaCallerTransfer[];signal?:AbortSignal}):Promise<MyriaContractResult>;
}
export declare class MyriaDappClient {
 constructor(options?:MyriaDappOptions);
 status():{available:boolean;browser:MyriaBrowser;extensionId:string};
 onStatus(listener:(event:MyriaStatusEvent)=>void):()=>void;
 rememberedConnection(networkId:string):MyriaConnection|null;
 connect(request:ConnectedRequest):Promise<MyriaConnection>;
 restoreConnection(request:WalletRequest):Promise<MyriaConnection>;
 disconnect(request:WalletRequest):Promise<MyriaConnection&{disconnected:true}>;
 authorizePresaleIntent(request:{intent:MyriaPresaleIntent;signal?:AbortSignal}):Promise<MyriaPresaleIntentProof>;
 getBalance(request:ConnectedRequest&{address:string}):Promise<MyriaBalance>;
 syncTransaction(request:ConnectedRequest&{address:string;transactionId:string}):Promise<MyriaTransactionSync>;
 getAssets(request:ConnectedRequest&{address:string}):Promise<MyriaWalletAssets>;
 getContracts(request:ConnectedRequest&{address:string}):Promise<MyriaContractCatalog>;
 loadContract(request:ConnectedRequest&{address:string;contractId:string}):Promise<MyriaContract>;
 invokeContract(request:ContractRequest&{contractId:string}):Promise<MyriaContractResult>;
 requestAmmSwap(request:MyriaAmmSwapRequest):Promise<MyriaAmmSwapResult>;
 requestAmmAddLiquidity(request:MyriaAmmAddLiquidityRequest):Promise<MyriaAmmLiquidityResult>;
 requestAmmRemoveLiquidity(request:MyriaAmmRemoveLiquidityRequest):Promise<MyriaAmmLiquidityResult>;
 getAmmPoolPosition(request:MyriaConnection&{poolId:string;signal?:AbortSignal}):Promise<MyriaAmmPoolPosition>;
}
export declare function createMyriaDapp(options?:MyriaDappOptions):MyriaDappClient;
export type {TokenAvatarPixel,TokenAvatarFragment,TokenAvatarArt,TokenAvatarOptions,TokenAvatarCanvas} from '@myria-network/core';
export {tokenAvatarArt,tokenInitial,drawTokenAvatar,tokenAvatarPng} from '@myria-network/core';
