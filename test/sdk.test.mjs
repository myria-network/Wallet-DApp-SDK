import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createMyriaDapp,MyriaDappError,MYRIA_DECIMALS,myriaAmountToUnits,myriaUnitsToAmount,tokenAvatarArt,tokenInitial} from '../src/index.js';

class Event {
  listeners=[];
  addListener(listener){this.listeners.push(listener);}
  emit(value){for(const listener of this.listeners)listener(value);}
}
class Port {
  onMessage=new Event();onDisconnect=new Event();closed=false;
  constructor(name,handle){this.name=name;this.handle=handle;}
  postMessage(message){this.handle(message,this);}
  disconnect(){if(this.closed)return;this.closed=true;this.onDisconnect.emit();}
}
class MemoryStorage {
  values=new Map();getItem(key){return this.values.get(key)??null;}setItem(key,value){this.values.set(key,value);}removeItem(key){this.values.delete(key);}
}
const networkId='ab'.repeat(32),address='myr_w_'+'a'.repeat(52),contractId='91'.repeat(32),wasmId='39'.repeat(32),transactionId='73'.repeat(32),poolId='44'.repeat(32),assetIn='55'.repeat(32),assetOut='66'.repeat(32),previousStateId='77'.repeat(32),nextStateId='88'.repeat(32);

function fixture({syncResult,presaleResult,ammResult}={}){
  const sent=[],runtime={lastError:null,connect(extensionId,{name}){
    assert.equal(extensionId,'magpbindkkmfmeddocheinckgfepbopc');
    return new Port(name,(message,port)=>{
      if(message.type==='ping')return;sent.push({name,message});
      queueMicrotask(()=>{
        if(name==='myria-wallet-connect'&&message.type==='connect'){port.onMessage.emit({type:'pending'});port.onMessage.emit({type:'approved',result:{networkId,address,name:'main',displayName:'Mi wallet'}});return;}
        if(name==='myria-wallet-connect'&&message.type==='restore'){port.onMessage.emit({type:'approved',restored:true,result:{networkId,address,name:'main',displayName:'Mi wallet'}});return;}
        if(name==='myria-wallet-connect'&&message.type==='disconnect'){port.onMessage.emit({type:'disconnected'});return;}
        if(name==='myria-presale-intent'&&message.type==='authorize'){port.onMessage.emit({type:'pending'});port.onMessage.emit({type:'approved',result:presaleResult??{publicKey:Buffer.concat([Buffer.from('302a300506032b6570032100','hex'),Buffer.alloc(32,7)]).toString('base64url'),signature:Buffer.alloc(64,9).toString('base64url')}});return;}
        if(message.type==='balance'){port.onMessage.emit({type:'loading'});port.onMessage.emit({type:'result',result:{networkId,address,observedUnits:'10000000',display:'10',status:'READY',conflicts:0,balanceType:'OBSERVED_NOT_PROVEN_SPENDABLE'}});return;}
        if(message.type==='sync-transaction'){port.onMessage.emit({type:'loading'});port.onMessage.emit({type:'result',result:syncResult??{networkId,address,transactionId:message.transactionId,recovered:true,observedUnits:'11000000',display:'11',status:'READY',conflicts:0,balanceType:'OBSERVED_NOT_PROVEN_SPENDABLE'}});if(syncResult)port.disconnect();return;}
        if(message.type==='assets'){port.onMessage.emit({type:'loading'});port.onMessage.emit({type:'result',result:{networkId,address,assets:[{assetId:networkId,name:'MYRIA',symbol:'MYR',decimals:9,supplyPolicy:'GENESIS',balanceUnits:'10000000'}]}});return;}
        if(message.type==='catalog'){port.onMessage.emit({type:'loading'});port.onMessage.emit({type:'result',result:{networkId,invocationFeeUnits:'20000',invocationMaximumFeeUnits:'25000',feeLabel:'ESTIMATED',contracts:[{contractId,wasmId,owner:address}]}});return;}
        if(name==='myria-amm'&&message.type==='swap'){port.onMessage.emit({type:'pending'});port.onMessage.emit({type:'progress',stage:'KEEPER'});port.onMessage.emit({type:'result',result:ammResult??{operation:'amm-swap',status:'ACCEPTED_LOCAL',networkId,transactionId,poolId,previousStateId,nextStateId,assetIn,assetOut,amountInUnits:message.amountInUnits,amountOutUnits:'2468',minimumOutUnits:'2455',feeUnits:'125',propagationStatus:'QUEUED'}});return;}
        if(message.type==='invoke'){port.onMessage.emit({type:'pending'});port.onMessage.emit({type:'progress',stage:'EXECUTING'});port.onMessage.emit({type:'result',result:{networkId,transactionId,executionStatus:'SUCCESS',executionReason:null,output:{answer:42}}});}
      });
    });
  }};
  return {runtime,sent,storage:new MemoryStorage()};
}

test('presale intent authorization uses visible approval and validates the wallet proof',async()=>{
 const intent={version:1,challengeId:'00000000-0000-4000-8000-000000000010',origin:'https://myria.network',networkId,cluster:'devnet',myriaWallet:address,solanaWallet:'11111111111111111111111111111111',usdtMint:'So11111111111111111111111111111111111111112',receiverTokenAccount:'Vote111111111111111111111111111111111111111',usdtAmountUnits:'10000000',myrAmountUnits:'100000000000',nonce:'A'.repeat(43),issuedAt:'2026-09-21T12:00:00.000Z',expiresAt:'2026-09-21T12:05:00.000Z'},f=fixture(),events=[],sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});sdk.onStatus(event=>events.push(event));
 const proof=await sdk.authorizePresaleIntent({intent});assert.equal(Buffer.from(proof.publicKey,'base64url').length,44);assert.equal(Buffer.from(proof.signature,'base64url').length,64);
 assert.deepEqual(f.sent.at(-1),{name:'myria-presale-intent',message:{type:'authorize',intent}});assert.ok(events.some(event=>event.operation==='authorize-presale-intent'&&event.state==='awaiting-approval'));
 const invalid=createMyriaDapp({runtime:fixture({presaleResult:{publicKey:'bad',signature:'bad'}}).runtime,storage:false});await assert.rejects(invalid.authorizePresaleIntent({intent}),error=>error instanceof MyriaDappError&&error.code==='INVALID_WALLET_RESPONSE');
 await assert.rejects(sdk.authorizePresaleIntent({intent:{...intent,origin:'https://myria.network/path'}}),error=>error.code==='INVALID_PRESALE_INTENT');
});

test('connect exposes only the approved public address',async()=>{
  const f=fixture(),events=[],sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});sdk.onStatus(event=>events.push(event));
  const connection={networkId,address};
  assert.deepEqual(await sdk.connect({networkId}),connection);
  assert.deepEqual(sdk.rememberedConnection(networkId),connection);
  assert.deepEqual(events.map(event=>event.state),['opening','awaiting-approval','success']);
  assert.equal(new Set(events.map(event=>event.requestId)).size,1);
  assert.deepEqual(await sdk.restoreConnection({networkId}),connection);
  assert.equal((await sdk.disconnect({networkId})).disconnected,true);
  assert.equal(sdk.rememberedConnection(networkId),null);
});

test('balance, contract loading and invocation expose validated responses and progress',async()=>{
  const f=fixture(),events=[],sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});sdk.onStatus(event=>events.push(event));
  const balance=await sdk.getBalance({networkId,address});assert.equal(balance.observedUnits,'10000000');assert.equal(balance.display,'10');
  const synced=await sdk.syncTransaction({networkId,address,transactionId});assert.equal(synced.transactionId,transactionId);assert.equal(synced.observedUnits,'11000000');assert.equal(synced.recovered,true);
  const assets=await sdk.getAssets({networkId,address});assert.equal(assets.assets[0].assetId,networkId);assert.equal(assets.assets[0].balanceUnits,'10000000');
  const contract=await sdk.loadContract({networkId,address,contractId});
  assert.equal(contract.contractId,contractId);assert.equal(contract.wasmId,wasmId);assert.equal(contract.owner,address);
  const catalog=await sdk.getContracts({networkId,address});assert.equal(catalog.invocationFeeUnits,'20000');assert.equal(catalog.invocationMaximumFeeUnits,'25000');assert.equal(catalog.feeLabel,'ESTIMATED');
  const result=await contract.invoke({input:{value:42},amount:'0.5'});
  assert.equal(result.transactionId,transactionId);assert.equal(result.output.answer,42);
  assert.deepEqual(f.sent.find(item=>item.message.type==='invoke').message,{type:'invoke',networkId,address,contractId,input:'{"value":42}',amount:'0.5'});
  assert.ok(events.some(event=>event.operation==='balance'&&event.state==='reading'));
  assert.ok(events.some(event=>event.operation==='sync-transaction'&&event.state==='reading'));
  assert.ok(events.some(event=>event.operation==='load-contract'&&event.state==='success'));
  assert.ok(events.some(event=>event.operation==='invoke'&&event.state==='executing'&&event.stage==='EXECUTING'));
});

test('invalid values and unknown contracts fail before an invocation is sent',async()=>{
  const f=fixture(),sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});
  await assert.rejects(sdk.connect({networkId:'bad'}),error=>error instanceof MyriaDappError&&error.code==='INVALID_NETWORK');
  await assert.rejects(sdk.loadContract({networkId,address,contractId:'ff'.repeat(32)}),error=>error instanceof MyriaDappError&&error.code==='CONTRACT_NOT_FOUND');
  await assert.rejects(sdk.invokeContract({networkId,address,contractId,input:'not-json'}),error=>error instanceof MyriaDappError&&error.code==='INVALID_CONTRACT_INPUT');
  assert.equal(f.sent.some(item=>item.message.type==='invoke'),false);
  await assert.rejects(sdk.invokeContract({networkId,address,contractId,amount:'0.0000000001'}),error=>error.code==='INVALID_AMOUNT');
  for(const amount of ['0.000000001','1.123456789']){await sdk.invokeContract({networkId,address,contractId,amount});assert.equal(f.sent.at(-1).message.amount,amount);}
});

test('invalid transaction sync replies fail as invalid wallet responses',async()=>{
  const f=fixture({syncResult:{networkId,address,transactionId:'74'.repeat(32),recovered:'yes'}});
  const sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});
  await assert.rejects(sdk.syncTransaction({networkId,address,transactionId}),error=>error instanceof MyriaDappError&&error.code==='INVALID_WALLET_RESPONSE');
});

test('MYR amounts preserve all nine Genesis decimals without floating point',()=>{
  assert.equal(MYRIA_DECIMALS,9);
  assert.equal(myriaAmountToUnits('0.000000001'),'1');
  assert.equal(myriaAmountToUnits('1.123456789'),'1123456789');
  assert.equal(myriaUnitsToAmount('1123456789'),'1.123456789');
  assert.equal(myriaUnitsToAmount('2000000000'),'2');
  assert.throws(()=>myriaAmountToUnits('0.0000000001'),error=>error.code==='INVALID_AMOUNT');
  assert.throws(()=>myriaAmountToUnits('18446744073.709551616'),error=>error.code==='INVALID_AMOUNT');
  assert.throws(()=>myriaAmountToUnits(0.1),error=>error.code==='INVALID_AMOUNT');
});

test('AMM swap uses its dedicated confirmation channel, defaults to 0.5% slippage and validates the accepted receipt',async()=>{
  const f=fixture(),events=[],sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});sdk.onStatus(event=>events.push(event));
  const result=await sdk.requestAmmSwap({networkId,address,poolId,assetIn,amountInUnits:'2500'});
  assert.deepEqual(f.sent.at(-1),{name:'myria-amm',message:{type:'swap',networkId,address,poolId,assetIn,amountInUnits:'2500',slippageBps:50}});
  assert.deepEqual(result,{operation:'amm-swap',status:'ACCEPTED_LOCAL',networkId,transactionId,poolId,previousStateId,nextStateId,assetIn,assetOut,amountInUnits:'2500',amountOutUnits:'2468',minimumOutUnits:'2455',feeUnits:'125',propagationStatus:'QUEUED'});
  assert.ok(events.some(event=>event.operation==='amm-swap'&&event.state==='awaiting-approval'));
  assert.ok(events.some(event=>event.operation==='amm-swap'&&event.state==='executing'&&event.stage==='KEEPER'));
  for(const slippageBps of [1,500]){await sdk.requestAmmSwap({networkId,address,poolId,assetIn,amountInUnits:'1',slippageBps});assert.equal(f.sent.at(-1).message.slippageBps,slippageBps);}
  assert.equal('requestAmmAddLiquidity' in sdk,false);assert.equal('requestAmmRemoveLiquidity' in sdk,false);
});

test('AMM swap rejects malformed intent fields before opening the wallet and rejects malformed receipts',async()=>{
  const f=fixture(),sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage}),base={networkId,address,poolId,assetIn,amountInUnits:'1'};
  for(const request of [{...base,amountInUnits:'0'},{...base,amountInUnits:'18446744073709551616'},{...base,slippageBps:0},{...base,slippageBps:501},{...base,poolId:'bad'},{...base,unexpected:true}])await assert.rejects(sdk.requestAmmSwap(request),error=>error instanceof MyriaDappError&&error.code.startsWith('INVALID_'));
  assert.equal(f.sent.length,0);
  const malformed=createMyriaDapp({runtime:fixture({ammResult:{operation:'amm-swap',status:'ACCEPTED_LOCAL',networkId,transactionId}}).runtime,storage:false});
  await assert.rejects(malformed.requestAmmSwap(base),error=>error instanceof MyriaDappError&&error.code==='INVALID_WALLET_RESPONSE');
});

test('token portraits are deterministic, dense and identify MYR with M and violet',()=>{
  const assetId='42'.repeat(32);
  const first=tokenAvatarArt(assetId,'TMYR'),second=tokenAvatarArt(assetId,'TMYR');
  assert.deepEqual(first,second);
  assert.equal(tokenInitial('TMYR','Test MYR'),'M');
  assert.equal(first.primary,'#a78bfa');
  assert.ok(first.pixels.length>=70,`expected a dense portrait, got ${first.pixels.length} pixels`);
  assert.notDeepEqual(tokenAvatarArt('43'.repeat(32),'ABC'),first);
  assert.throws(()=>tokenAvatarArt('not-an-asset','ABC'),/INVALID_ASSET_ID/);
});

test('public documentation covers every SDK method and result structure',async()=>{
  const api=await readFile(new URL('../API.md',import.meta.url),'utf8');
  const model=await readFile(new URL('../DATA_MODEL.md',import.meta.url),'utf8');
  const readme=await readFile(new URL('../README.md',import.meta.url),'utf8');
  for(const method of ['status','onStatus','rememberedConnection','connect','restoreConnection','disconnect','authorizePresaleIntent','getBalance','syncTransaction','getAssets','getContracts','loadContract','invoke','invokeContract','requestAmmSwap','myriaAmountToUnits','myriaUnitsToAmount','tokenAvatarArt','tokenInitial','drawTokenAvatar','tokenAvatarPng'])assert.ok(api.includes('`'+method),`API.md must document ${method}`);
  for(const structure of ['MyriaConnection','MyriaPresaleIntent','MyriaPresaleIntentProof','MyriaBalance','MyriaTransactionSync','MyriaWalletAssets','MyriaContractCatalog','MyriaContractDefinition','MyriaContractResult','MyriaAmmSwapRequest','MyriaAmmSwapResult','MyriaStatusEvent'])assert.ok(model.includes(structure),`DATA_MODEL.md must document ${structure}`);
  for(const text of [api,model,readme])assert.doesNotMatch(text,/SvelteKit|Amazon Web Services|\bAWS\b|\bEC2\b|CloudFront/i);
});
