const NETWORK_ID=/^[a-f0-9]{64}$/;
const OBJECT_ID=/^[a-f0-9]{64}$/;
const WALLET_ADDRESS=/^myr_w_[a-z2-7]{52}$/;
const TOKEN_AMOUNT=/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,9})?$/;
const CONNECTION_PORT='myria-wallet-connect';
const CONTRACT_PORT='myria-contract';
const U64_MAX=18446744073709551615n;

export const MYRIA_CHROME_EXTENSION_ID='magpbindkkmfmeddocheinckgfepbopc';
export const MYRIA_DECIMALS=9;

export class MyriaDappError extends Error {
  constructor(code,message=code,cause){super(message,{cause});this.name='MyriaDappError';this.code=code;}
}

export class MyriaContract {
  constructor(client,connection,definition){
    this.networkId=connection.networkId;this.address=connection.address;
    this.contractId=definition.contractId;this.wasmId=definition.wasmId;this.owner=definition.owner;
    Object.defineProperty(this,'_client',{value:client});Object.freeze(this);
  }
  invoke({input={},amount='0',signal}={}){return this._client.invokeContract({networkId:this.networkId,address:this.address,contractId:this.contractId,input,amount,signal});}
}

function required(value,pattern,code){
  if(typeof value!=='string'||!pattern.test(value))throw new MyriaDappError(code);
  return value;
}
function jsonInput(value){
  let encoded;
  try{encoded=typeof value==='string'?(JSON.parse(value),value):JSON.stringify(value);}
  catch(error){throw new MyriaDappError('INVALID_CONTRACT_INPUT','Contract input must be valid JSON.',error);}
  if(typeof encoded!=='string'||encoded.length>32768)throw new MyriaDappError('INVALID_CONTRACT_INPUT','Contract input exceeds 32,768 characters.');
  return encoded;
}
export function myriaAmountToUnits(value){
  const decimal=required(value,TOKEN_AMOUNT,'INVALID_AMOUNT');
  const [whole,fraction='']=decimal.split('.');
  const units=BigInt(whole)*1_000_000_000n+BigInt(fraction.padEnd(MYRIA_DECIMALS,'0')||'0');
  if(units>U64_MAX)throw new MyriaDappError('INVALID_AMOUNT');
  return units.toString();
}
export function myriaUnitsToAmount(value){
  if(typeof value!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value))throw new MyriaDappError('INVALID_UNITS');
  const units=BigInt(value);if(units>U64_MAX)throw new MyriaDappError('INVALID_UNITS');
  const fraction=String(units%1_000_000_000n).padStart(MYRIA_DECIMALS,'0').replace(/0+$/,'');
  return `${units/1_000_000_000n}${fraction?'.'+fraction:''}`;
}
function amount(value='0'){myriaAmountToUnits(value);return value;}
function browserName(){
  const ua=globalThis.navigator?.userAgent??'';
  return /Firefox\//i.test(ua)?'firefox':/Chrom(?:e|ium)\//i.test(ua)?'chromium':'unknown';
}
function defaultStorage(){try{return globalThis.localStorage;}catch{return undefined;}}

export class MyriaDappClient {
  #extensionId;#runtime;#storage;#listeners=new Set();#initialTimeout;#approvalTimeout;
  constructor(options={}){
    this.#extensionId=options.extensionId??MYRIA_CHROME_EXTENSION_ID;
    this.#runtime=options.runtime??globalThis.chrome?.runtime;
    this.#storage=options.storage===false?undefined:options.storage??defaultStorage();
    this.#initialTimeout=options.initialTimeoutMs??10000;
    this.#approvalTimeout=options.approvalTimeoutMs??602000;
  }
  status(){return {available:typeof this.#runtime?.connect==='function',browser:browserName(),extensionId:this.#extensionId};}
  onStatus(listener){if(typeof listener!=='function')throw new TypeError('listener must be a function');this.#listeners.add(listener);return()=>this.#listeners.delete(listener);}
  #emit(operation,state,detail={}){const event=Object.freeze({operation,state,at:Date.now(),...detail});for(const listener of this.#listeners)try{listener(event);}catch{}return event;}
  #key(networkId){return `myria:dapp:connection:${networkId}`;}
  #remember(result){try{this.#storage?.setItem(this.#key(result.networkId),JSON.stringify(result));}catch{}return result;}
  #forget(networkId){try{this.#storage?.removeItem(this.#key(networkId));}catch{}}
  rememberedConnection(networkId){
    required(networkId,NETWORK_ID,'INVALID_NETWORK');
    try{const value=JSON.parse(this.#storage?.getItem(this.#key(networkId))??'null');return value?.networkId===networkId&&WALLET_ADDRESS.test(value.address)?{networkId,address:value.address}:null;}catch{return null;}
  }
  async connect({networkId,signal}={}){
    required(networkId,NETWORK_ID,'INVALID_NETWORK');
    const result=await this.#request(CONNECTION_PORT,{type:'connect',networkId},{operation:'connect',signal,pendingState:'awaiting-approval',pendingTimeout:122000,accept:reply=>reply?.type==='approved'?this.#connection(reply.result,networkId):undefined});
    return this.#remember(result);
  }
  async restoreConnection({networkId,address,signal}={}){
    required(networkId,NETWORK_ID,'INVALID_NETWORK');
    const target=address??this.rememberedConnection(networkId)?.address;
    required(target,WALLET_ADDRESS,'NO_REMEMBERED_CONNECTION');
    try{
      const result=await this.#request(CONNECTION_PORT,{type:'restore',networkId,address:target},{operation:'restore',signal,accept:reply=>reply?.type==='approved'&&reply.restored===true?this.#connection(reply.result,networkId):undefined});
      return this.#remember(result);
    }catch(error){if(error instanceof MyriaDappError&&error.code==='NOT_CONNECTED')this.#forget(networkId);throw error;}
  }
  async disconnect({networkId,address,signal}={}){
    required(networkId,NETWORK_ID,'INVALID_NETWORK');
    const target=address??this.rememberedConnection(networkId)?.address;
    required(target,WALLET_ADDRESS,'NO_REMEMBERED_CONNECTION');
    await this.#request(CONNECTION_PORT,{type:'disconnect',networkId,address:target},{operation:'disconnect',signal,accept:reply=>reply?.type==='disconnected'?true:undefined});
    this.#forget(networkId);return {networkId,address:target,disconnected:true};
  }
  async getContracts({networkId,address,signal}={}){
    this.#identity(networkId,address);
    return this.#request(CONTRACT_PORT,{type:'catalog',networkId,address},{operation:'contracts',signal,loadingState:'reading',loadingTimeout:52000,accept:reply=>reply?.type==='result'?this.#catalog(reply.result,networkId):undefined});
  }
  async getBalance({networkId,address,signal}={}){
    this.#identity(networkId,address);
    return this.#request(CONTRACT_PORT,{type:'balance',networkId,address},{operation:'balance',signal,loadingState:'reading',loadingTimeout:52000,accept:reply=>reply?.type==='result'?this.#balance(reply.result,networkId,address):undefined});
  }
  async syncTransaction({networkId,address,transactionId,signal}={}){
    this.#identity(networkId,address);required(transactionId,OBJECT_ID,'INVALID_TRANSACTION_ID');
    return this.#request(CONTRACT_PORT,{type:'sync-transaction',networkId,address,transactionId},{operation:'sync-transaction',signal,loadingState:'reading',loadingTimeout:52000,accept:reply=>{
      if(reply?.type!=='result')return;
      if(reply.result?.transactionId!==transactionId||typeof reply.result?.recovered!=='boolean')throw new MyriaDappError('INVALID_WALLET_RESPONSE');
      return {...this.#balance(reply.result,networkId,address),transactionId,recovered:reply.result.recovered};
    }});
  }
  async getAssets({networkId,address,signal}={}){
    this.#identity(networkId,address);
    return this.#request(CONTRACT_PORT,{type:'assets',networkId,address},{operation:'assets',signal,loadingState:'reading',loadingTimeout:52000,accept:reply=>reply?.type==='result'?this.#assets(reply.result,networkId,address):undefined});
  }
  async loadContract({networkId,address,contractId,signal}={}){
    this.#identity(networkId,address);required(contractId,OBJECT_ID,'INVALID_CONTRACT_ID');
    const catalog=await this.getContracts({networkId,address,signal});
    const definition=catalog.contracts.find(contract=>contract.contractId===contractId);
    if(!definition){this.#emit('load-contract','error',{code:'CONTRACT_NOT_FOUND'});throw new MyriaDappError('CONTRACT_NOT_FOUND');}
    const contract=new MyriaContract(this,{networkId,address},definition);this.#emit('load-contract','success',{result:contract});return contract;
  }
  async invokeContract({networkId,address,contractId,input={},amount:attached='0',signal}={}){
    this.#identity(networkId,address);required(contractId,OBJECT_ID,'INVALID_CONTRACT_ID');
    return this.#request(CONTRACT_PORT,{type:'invoke',networkId,address,contractId,input:jsonInput(input),amount:amount(attached)},{operation:'invoke',signal,pendingState:'awaiting-approval',pendingTimeout:this.#approvalTimeout,accept:reply=>reply?.type==='result'?this.#contractResult(reply.result,networkId):undefined});
  }
  #identity(networkId,address){required(networkId,NETWORK_ID,'INVALID_NETWORK');required(address,WALLET_ADDRESS,'INVALID_WALLET_ADDRESS');}
  #connection(value,networkId){if(!value||value.networkId!==networkId||!WALLET_ADDRESS.test(value.address))throw new MyriaDappError('INVALID_WALLET_RESPONSE');return {networkId,address:value.address};}
  #catalog(value,networkId){
    const validFee=raw=>typeof raw==='string'&&/^\d{1,20}$/.test(raw)&&BigInt(raw)<=U64_MAX;
    if(!value||value.networkId!==networkId||!Array.isArray(value.contracts)||!validFee(value.invocationFeeUnits)||!validFee(value.invocationMaximumFeeUnits)||BigInt(value.invocationMaximumFeeUnits)<BigInt(value.invocationFeeUnits)||!['ESTIMATED','FIXED'].includes(value.feeLabel))throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    const contracts=value.contracts.map(item=>{if(!item||!OBJECT_ID.test(item.contractId)||!OBJECT_ID.test(item.wasmId)||!WALLET_ADDRESS.test(item.owner))throw new MyriaDappError('INVALID_WALLET_RESPONSE');return {contractId:item.contractId,wasmId:item.wasmId,owner:item.owner};});
    return {networkId,invocationFeeUnits:value.invocationFeeUnits,invocationMaximumFeeUnits:value.invocationMaximumFeeUnits,feeLabel:value.feeLabel,contracts};
  }
  #balance(value,networkId,address){
    const validUnits=value?.observedUnits===null||typeof value?.observedUnits==='string'&&/^\d+$/.test(value.observedUnits);
    if(!value||value.networkId!==networkId||value.address!==address||!validUnits||value.display!==null&&typeof value.display!=='string'||typeof value.status!=='string'||!Number.isInteger(value.conflicts)||value.balanceType!=='OBSERVED_NOT_PROVEN_SPENDABLE')throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    return {networkId,address,observedUnits:value.observedUnits,display:value.display,status:value.status,conflicts:value.conflicts,balanceType:value.balanceType};
  }
  #assets(value,networkId,address){
    if(!value||value.networkId!==networkId||value.address!==address||!Array.isArray(value.assets)||value.assets.length>100)throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    const assets=value.assets.map(raw=>{
      if(!raw||!OBJECT_ID.test(raw.assetId)||typeof raw.name!=='string'||raw.name.length>80||typeof raw.symbol!=='string'||raw.symbol.length>16||!Number.isInteger(raw.decimals)||raw.decimals<0||raw.decimals>18||!['GENESIS','FIXED'].includes(raw.supplyPolicy)||typeof raw.balanceUnits!=='string'||!/^\d{1,20}$/.test(raw.balanceUnits)||BigInt(raw.balanceUnits)>U64_MAX)throw new MyriaDappError('INVALID_WALLET_RESPONSE');
      return {assetId:raw.assetId,name:raw.name,symbol:raw.symbol,decimals:raw.decimals,supplyPolicy:raw.supplyPolicy,balanceUnits:raw.balanceUnits};
    });
    return {networkId,address,assets};
  }
  #contractResult(value,networkId){if(!value||typeof value!=='object'||value.networkId!==networkId||!OBJECT_ID.test(value.transactionId))throw new MyriaDappError('INVALID_WALLET_RESPONSE');return {...value,operation:'invoke'};}
  #request(portName,message,options){
    const {operation,signal,accept,pendingState,loadingState,pendingTimeout=this.#approvalTimeout,loadingTimeout=52000}=options;
    if(typeof this.#runtime?.connect!=='function'){this.#emit(operation,'error',{code:'WALLET_UNAVAILABLE'});return Promise.reject(new MyriaDappError('WALLET_UNAVAILABLE'));}
    return new Promise((resolve,reject)=>{
      let port,settled=false,phase='opening',timer,heartbeat;const requestId=globalThis.crypto?.randomUUID?.()??`${Date.now()}-${Math.random()}`;
      const stop=()=>{clearTimeout(timer);clearInterval(heartbeat);signal?.removeEventListener('abort',cancel);try{port?.disconnect();}catch{}};
      const finish=(value,error)=>{if(settled)return;settled=true;stop();if(error){const state=error==='CANCELLED'?'cancelled':'error';this.#emit(operation,state,{requestId,code:error});reject(new MyriaDappError(error));}else{this.#emit(operation,'success',{requestId,result:value});resolve(value);}};
      const arm=(ms,code)=>{clearTimeout(timer);timer=setTimeout(()=>finish(undefined,code),ms);};
      const cancel=()=>finish(undefined,'CANCELLED');
      if(signal?.aborted){cancel();return;}signal?.addEventListener('abort',cancel,{once:true});
      this.#emit(operation,'opening',{requestId});
      try{
        port=this.#runtime.connect(this.#extensionId,{name:portName});
        port.onMessage.addListener(reply=>{
          if(reply?.type==='pending'&&pendingState){phase=pendingState;this.#emit(operation,pendingState,{requestId});arm(pendingTimeout,'APPROVAL_EXPIRED');return;}
          if(reply?.type==='loading'&&loadingState){phase=loadingState;this.#emit(operation,loadingState,{requestId});arm(loadingTimeout,'REQUEST_TIMEOUT');return;}
          if(reply?.type==='progress'&&typeof reply.stage==='string'){phase='executing';this.#emit(operation,'executing',{requestId,stage:reply.stage});arm(pendingTimeout,'EXECUTION_TIMEOUT');return;}
          if(reply?.type==='error'){finish(undefined,typeof reply.code==='string'?reply.code:'WALLET_ERROR');return;}
          try{const value=accept(reply);if(value!==undefined)finish(value);}catch(error){finish(undefined,error instanceof MyriaDappError?error.code:'INVALID_WALLET_RESPONSE');}
        });
        port.onDisconnect.addListener(()=>{void this.#runtime.lastError;finish(undefined,phase==='awaiting-approval'?'WALLET_WINDOW_CLOSED':'WALLET_UNAVAILABLE');});
        arm(this.#initialTimeout,'WALLET_UNAVAILABLE');
        heartbeat=setInterval(()=>{try{port.postMessage({type:'ping'});}catch{finish(undefined,'WALLET_UNAVAILABLE');}},15000);
        port.postMessage(message);
      }catch(error){finish(undefined,'WALLET_UNAVAILABLE');}
    });
  }
}

export function createMyriaDapp(options){return new MyriaDappClient(options);}
export {tokenAvatarArt,tokenInitial,drawTokenAvatar,tokenAvatarPng} from './token-avatar.js';
