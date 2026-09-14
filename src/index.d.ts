export type MyriaBrowser='chromium'|'firefox'|'unknown';
export type MyriaOperation='connect'|'restore'|'disconnect'|'balance'|'contracts'|'load-contract'|'invoke';
export type MyriaState='opening'|'awaiting-approval'|'reading'|'executing'|'success'|'error'|'cancelled';
export interface MyriaStatusEvent {operation:MyriaOperation;state:MyriaState;at:number;requestId?:string;stage?:string;code?:string;result?:unknown}
export interface MyriaConnection {networkId:string;address:string}
export interface MyriaBalance extends MyriaConnection {observedUnits:string|null;display:string|null;status:string;conflicts:number;balanceType:'OBSERVED_NOT_PROVEN_SPENDABLE'}
export interface MyriaContractDefinition {contractId:string;wasmId:string;owner:string}
export interface MyriaContractCatalog {networkId:string;invocationFeeUnits:string;invocationMaximumFeeUnits:string;feeLabel:'ESTIMATED'|'FIXED';contracts:MyriaContractDefinition[]}
export interface MyriaContractResult {operation:'invoke';networkId:string;transactionId:string;executionStatus?:string;executionReason?:string|null;output?:unknown;[key:string]:unknown}
export interface MyriaStorage {getItem(key:string):string|null;setItem(key:string,value:string):void;removeItem(key:string):void}
export interface MyriaPort {postMessage(value:unknown):void;disconnect():void;onMessage:{addListener(listener:(value:any)=>void):void};onDisconnect:{addListener(listener:()=>void):void}}
export interface MyriaRuntime {connect(extensionId:string,options:{name:string}):MyriaPort;lastError?:unknown}
export interface MyriaDappOptions {extensionId?:string;runtime?:MyriaRuntime;storage?:MyriaStorage|false;initialTimeoutMs?:number;approvalTimeoutMs?:number}
export interface ConnectedRequest {networkId:string;signal?:AbortSignal}
export interface WalletRequest extends ConnectedRequest {address?:string}
export interface ContractRequest extends ConnectedRequest {address:string;input?:unknown;amount?:string}
export declare const MYRIA_CHROME_EXTENSION_ID:string;
export declare const MYRIA_DECIMALS:9;
/** Converts exact MYR decimal text to JSON-safe atomic units without floating point. */
export declare function myriaAmountToUnits(value:string):string;
/** Converts JSON-safe atomic units to exact MYR decimal text, trimming trailing zeroes. */
export declare function myriaUnitsToAmount(value:string):string;
export declare class MyriaDappError extends Error {readonly code:string;constructor(code:string,message?:string,cause?:unknown)}
export declare class MyriaContract {
 readonly networkId:string;readonly address:string;readonly contractId:string;readonly wasmId:string;readonly owner:string;
 invoke(request?:{input?:unknown;amount?:string;signal?:AbortSignal}):Promise<MyriaContractResult>;
}
export declare class MyriaDappClient {
 constructor(options?:MyriaDappOptions);
 status():{available:boolean;browser:MyriaBrowser;extensionId:string};
 onStatus(listener:(event:MyriaStatusEvent)=>void):()=>void;
 rememberedConnection(networkId:string):MyriaConnection|null;
 connect(request:ConnectedRequest):Promise<MyriaConnection>;
 restoreConnection(request:WalletRequest):Promise<MyriaConnection>;
 disconnect(request:WalletRequest):Promise<MyriaConnection&{disconnected:true}>;
 getBalance(request:ConnectedRequest&{address:string}):Promise<MyriaBalance>;
 getContracts(request:ConnectedRequest&{address:string}):Promise<MyriaContractCatalog>;
 loadContract(request:ConnectedRequest&{address:string;contractId:string}):Promise<MyriaContract>;
 invokeContract(request:ContractRequest&{contractId:string}):Promise<MyriaContractResult>;
}
export declare function createMyriaDapp(options?:MyriaDappOptions):MyriaDappClient;
