const NETWORK_ID=/^[a-f0-9]{64}$/;
const OBJECT_ID=/^[a-f0-9]{64}$/;
const WALLET_ADDRESS=/^myr_w_[a-z2-7]{52}$/;
const TOKEN_AMOUNT=/^(0|[1-9][0-9]{0,12})(\.[0-9]{1,9})?$/;
const CONNECTION_PORT='myria-wallet-connect';
const CONTRACT_PORT='myria-contract';
const AMM_PORT='myria-amm';
const PRESALE_INTENT_PORT='myria-presale-intent';
const U64_MAX=18446744073709551615n;
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOLANA_ADDRESS=/^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const ATOMIC_UNITS=/^[1-9][0-9]{0,20}$/;
const BASE64URL=/^[A-Za-z0-9_-]+$/;
const PRESALE_FIELDS=['version','challengeId','origin','networkId','cluster','myriaWallet','solanaWallet','usdtMint','receiverTokenAccount','usdtAmountUnits','myrAmountUnits','nonce','issuedAt','expiresAt'];
const ED25519_SPKI_PREFIX='302a300506032b6570032100';

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
  invoke({input={},amount='0',callerTransfers,signal}={}){return this._client.invokeContract({networkId:this.networkId,address:this.address,contractId:this.contractId,input,amount,callerTransfers,signal});}
}

function required(value,pattern,code){
  if(typeof value!=='string'||!pattern.test(value))throw new MyriaDappError(code);
  return value;
}
function exactRequest(value,requiredFields,optionalFields,code){
  if(!value||typeof value!=='object'||Array.isArray(value))throw new MyriaDappError(code);
  const allowed=new Set([...requiredFields,...optionalFields]);
  if(requiredFields.some(field=>!Object.hasOwn(value,field))||Object.keys(value).some(field=>!allowed.has(field)))throw new MyriaDappError(code);
  return value;
}
function positiveUnits(value,code){
  if(typeof value!=='string'||!/^[1-9][0-9]{0,19}$/.test(value)||BigInt(value)>U64_MAX)throw new MyriaDappError(code);
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
function callerCaps(value){
  const code='INVALID_CALLER_TRANSFERS';
  if(!Array.isArray(value)||!value.length||value.length>8)throw new MyriaDappError(code);
  let total=0n;const recipients=new Set();
  const caps=value.map(cap=>{
    exactRequest(cap,['to','amountUnits'],[],code);
    required(cap.to,/^myr_w_[a-z2-7]{51}[aq]$/,code);positiveUnits(cap.amountUnits,code);
    if(recipients.has(cap.to))throw new MyriaDappError(code);
    recipients.add(cap.to);total+=BigInt(cap.amountUnits);
    return {to:cap.to,amountUnits:cap.amountUnits};
  });
  if(total>U64_MAX)throw new MyriaDappError(code);
  return caps;
}
function browserName(){
  const ua=globalThis.navigator?.userAgent??'';
  return /Firefox\//i.test(ua)?'firefox':/Chrom(?:e|ium)\//i.test(ua)?'chromium':'unknown';
}
function defaultStorage(){try{return globalThis.localStorage;}catch{return undefined;}}
function base64UrlBytes(value){
 if(typeof value!=='string'||!BASE64URL.test(value))return;
 try{const raw=atob(value.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((value.length+3)%4)),bytes=new Uint8Array(raw.length);for(let index=0;index<raw.length;index++)bytes[index]=raw.charCodeAt(index);return bytes;}catch{return;}
}

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
  async authorizePresaleIntent({intent,signal}={}){
    const value=this.#presaleIntent(intent);
    return this.#request(PRESALE_INTENT_PORT,{type:'authorize',intent:value},{operation:'authorize-presale-intent',signal,pendingState:'awaiting-approval',pendingTimeout:122000,accept:reply=>reply?.type==='approved'?this.#presaleProof(reply.result):undefined});
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
    return this.#request(CONTRACT_PORT,{type:'sync-transaction',networkId,address,transactionId},{operation:'sync-transaction',signal,loadingState:'reading',loadingTimeout:52000,accept:reply=>reply?.type==='result'?this.#transactionSync(reply.result,networkId,address,transactionId):undefined});
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
  async invokeContract({networkId,address,contractId,input={},amount:attached='0',callerTransfers,signal}={}){
    this.#identity(networkId,address);required(contractId,OBJECT_ID,'INVALID_CONTRACT_ID');
    return this.#request(CONTRACT_PORT,{type:'invoke',networkId,address,contractId,input:jsonInput(input),amount:amount(attached),...(callerTransfers!==undefined?{callerTransfers:callerCaps(callerTransfers)}:{})},{operation:'invoke',signal,pendingState:'awaiting-approval',pendingTimeout:this.#approvalTimeout,accept:reply=>reply?.type==='result'?this.#contractResult(reply.result,networkId):undefined});
  }
  async requestAmmSwap(request={}){
    exactRequest(request,['networkId','address','poolId','assetIn','amountInUnits'],['slippageBps','signal'],'INVALID_AMM_SWAP');
    const {networkId,address,poolId,assetIn,amountInUnits,signal}=request,slippageBps=request.slippageBps??50;
    this.#identity(networkId,address);required(poolId,OBJECT_ID,'INVALID_POOL_ID');required(assetIn,OBJECT_ID,'INVALID_ASSET_ID');positiveUnits(amountInUnits,'INVALID_AMOUNT');
    if(!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>500)throw new MyriaDappError('INVALID_SLIPPAGE');
    const intent={networkId,address,poolId,assetIn,amountInUnits,slippageBps};
    return this.#request(AMM_PORT,{type:'swap',...intent},{operation:'amm-swap',signal,pendingState:'awaiting-approval',pendingTimeout:this.#approvalTimeout,accept:reply=>reply?.type==='result'?this.#ammSwapResult(reply.result,intent):undefined});
  }
  async requestAmmAddLiquidity(request={}){
    exactRequest(request,['networkId','address','poolId','amount0Units','amount1Units'],['slippageBps','signal'],'INVALID_AMM_LIQUIDITY');
    const {networkId,address,poolId,amount0Units,amount1Units,signal}=request,slippageBps=request.slippageBps??50;
    this.#identity(networkId,address);required(poolId,OBJECT_ID,'INVALID_POOL_ID');positiveUnits(amount0Units,'INVALID_AMOUNT');positiveUnits(amount1Units,'INVALID_AMOUNT');
    if(!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>500)throw new MyriaDappError('INVALID_SLIPPAGE');
    const intent={type:'add-liquidity',networkId,address,poolId,amount0Units,amount1Units,slippageBps};
    return this.#request(AMM_PORT,intent,{operation:'amm-add-liquidity',signal,pendingState:'awaiting-approval',pendingTimeout:this.#approvalTimeout,accept:reply=>reply?.type==='result'?this.#ammLiquidityResult(reply.result,intent):undefined});
  }
  async requestAmmRemoveLiquidity(request={}){
    exactRequest(request,['networkId','address','poolId','freeLpUnits'],['slippageBps','signal'],'INVALID_AMM_LIQUIDITY');
    const {networkId,address,poolId,freeLpUnits,signal}=request,slippageBps=request.slippageBps??50;
    this.#identity(networkId,address);required(poolId,OBJECT_ID,'INVALID_POOL_ID');positiveUnits(freeLpUnits,'INVALID_AMOUNT');
    if(!Number.isInteger(slippageBps)||slippageBps<1||slippageBps>500)throw new MyriaDappError('INVALID_SLIPPAGE');
    const intent={type:'remove-liquidity',networkId,address,poolId,freeLpUnits,slippageBps};
    return this.#request(AMM_PORT,intent,{operation:'amm-remove-liquidity',signal,pendingState:'awaiting-approval',pendingTimeout:this.#approvalTimeout,accept:reply=>reply?.type==='result'?this.#ammLiquidityResult(reply.result,intent):undefined});
  }
  async getAmmPoolPosition({networkId,address,poolId,signal}={}){
    this.#identity(networkId,address);required(poolId,OBJECT_ID,'INVALID_POOL_ID');
    return this.#request(AMM_PORT,{type:'position',networkId,address,poolId},{operation:'amm-position',signal,loadingState:'reading',loadingTimeout:52000,accept:reply=>reply?.type==='result'?this.#ammPosition(reply.result,{networkId,address,poolId}):undefined});
  }
  #identity(networkId,address){required(networkId,NETWORK_ID,'INVALID_NETWORK');required(address,WALLET_ADDRESS,'INVALID_WALLET_ADDRESS');}
  #presaleIntent(value){
    const invalid=()=>{throw new MyriaDappError('INVALID_PRESALE_INTENT');};
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...PRESALE_FIELDS].sort().join(','))invalid();
    if(value.version!==1||!UUID.test(value.challengeId)||!NETWORK_ID.test(value.networkId)||!['devnet','testnet'].includes(value.cluster)||!WALLET_ADDRESS.test(value.myriaWallet)||![value.solanaWallet,value.usdtMint,value.receiverTokenAccount].every(item=>typeof item==='string'&&SOLANA_ADDRESS.test(item))||![value.usdtAmountUnits,value.myrAmountUnits].every(item=>typeof item==='string'&&ATOMIC_UNITS.test(item))||typeof value.nonce!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.nonce))invalid();
    try{const origin=new URL(value.origin);if(origin.origin!==value.origin||!['https:','http:'].includes(origin.protocol)||origin.protocol==='http:'&&!['127.0.0.1','localhost'].includes(origin.hostname))invalid();}catch{invalid();}
    const issued=Date.parse(value.issuedAt),expires=Date.parse(value.expiresAt);if(!Number.isFinite(issued)||!Number.isFinite(expires)||expires<=issued||expires-issued>300000||new Date(issued).toISOString()!==value.issuedAt||new Date(expires).toISOString()!==value.expiresAt)invalid();
    return Object.freeze(Object.fromEntries(PRESALE_FIELDS.map(field=>[field,value[field]])));
  }
  #presaleProof(value){
    const publicKey=base64UrlBytes(value?.publicKey),signature=base64UrlBytes(value?.signature),prefix=publicKey&&[...publicKey.subarray(0,12)].map(byte=>byte.toString(16).padStart(2,'0')).join('');
    if(!value||Object.keys(value).sort().join(',')!=='publicKey,signature'||publicKey?.length!==44||prefix!==ED25519_SPKI_PREFIX||signature?.length!==64)throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    return {publicKey:value.publicKey,signature:value.signature};
  }
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
  #transactionSync(value,networkId,address,transactionId){
    if(value?.transactionId!==transactionId||typeof value?.recovered!=='boolean')throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    return {...this.#balance(value,networkId,address),transactionId,recovered:value.recovered};
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
  #ammSwapResult(value,intent){
    const fields=['operation','status','networkId','transactionId','poolId','previousStateId','nextStateId','assetIn','assetOut','amountInUnits','amountOutUnits','minimumOutUnits','feeUnits','propagationStatus'];
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...fields].sort().join(',')||value.operation!=='amm-swap'||value.status!=='ACCEPTED_LOCAL'||value.networkId!==intent.networkId||value.poolId!==intent.poolId||value.assetIn!==intent.assetIn||value.amountInUnits!==intent.amountInUnits||!['QUEUED','RECOVERY_PENDING'].includes(value.propagationStatus))throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    for(const field of ['transactionId','previousStateId','nextStateId','assetOut'])if(!OBJECT_ID.test(value[field]))throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    for(const field of ['amountInUnits','amountOutUnits','minimumOutUnits','feeUnits'])positiveUnits(value[field],'INVALID_WALLET_RESPONSE');
    if(value.assetOut===value.assetIn||BigInt(value.minimumOutUnits)>BigInt(value.amountOutUnits))throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    return Object.fromEntries(fields.map(field=>[field,value[field]]));
  }
  #ammLiquidityResult(value,intent){
    const fields=['operation','status','networkId','transactionId','poolId','previousStateId','nextStateId','amount0Units','amount1Units','freeLpUnits','feeUnits','propagationStatus'];
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!==[...fields].sort().join(',')||value.operation!==`amm-${intent.type}`||value.status!=='ACCEPTED_LOCAL'||value.networkId!==intent.networkId||value.poolId!==intent.poolId||!['QUEUED','RECOVERY_PENDING'].includes(value.propagationStatus))throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    for(const field of ['transactionId','previousStateId','nextStateId'])required(value[field],OBJECT_ID,'INVALID_WALLET_RESPONSE');
    for(const field of ['amount0Units','amount1Units','freeLpUnits','feeUnits'])positiveUnits(value[field],'INVALID_WALLET_RESPONSE');
    if(intent.type==='add-liquidity'&&(value.amount0Units!==intent.amount0Units||value.amount1Units!==intent.amount1Units)||intent.type==='remove-liquidity'&&value.freeLpUnits!==intent.freeLpUnits)throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    return Object.fromEntries(fields.map(field=>[field,value[field]]));
  }
  #ammPosition(value,intent){
    if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).sort().join(',')!=='address,freeLpUnits,lpAssetId,networkId,poolId'||value.networkId!==intent.networkId||value.address!==intent.address||value.poolId!==intent.poolId||!OBJECT_ID.test(value.lpAssetId)||typeof value.freeLpUnits!=='string'||!/^(0|[1-9][0-9]{0,19})$/.test(value.freeLpUnits)||BigInt(value.freeLpUnits)>U64_MAX)throw new MyriaDappError('INVALID_WALLET_RESPONSE');
    return {networkId:value.networkId,address:value.address,poolId:value.poolId,lpAssetId:value.lpAssetId,freeLpUnits:value.freeLpUnits};
  }
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
