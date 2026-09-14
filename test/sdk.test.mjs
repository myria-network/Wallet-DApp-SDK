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
const networkId='ab'.repeat(32),address='myr_w_'+'a'.repeat(52),contractId='91'.repeat(32),wasmId='39'.repeat(32),transactionId='73'.repeat(32);

function fixture(){
  const sent=[],runtime={lastError:null,connect(extensionId,{name}){
    assert.equal(extensionId,'magpbindkkmfmeddocheinckgfepbopc');
    return new Port(name,(message,port)=>{
      if(message.type==='ping')return;sent.push({name,message});
      queueMicrotask(()=>{
        if(name==='myria-wallet-connect'&&message.type==='connect'){port.onMessage.emit({type:'pending'});port.onMessage.emit({type:'approved',result:{networkId,address}});return;}
        if(name==='myria-wallet-connect'&&message.type==='restore'){port.onMessage.emit({type:'approved',restored:true,result:{networkId,address}});return;}
        if(name==='myria-wallet-connect'&&message.type==='disconnect'){port.onMessage.emit({type:'disconnected'});return;}
        if(message.type==='balance'){port.onMessage.emit({type:'loading'});port.onMessage.emit({type:'result',result:{networkId,address,observedUnits:'10000000',display:'10',status:'READY',conflicts:0,balanceType:'OBSERVED_NOT_PROVEN_SPENDABLE'}});return;}
        if(message.type==='catalog'){port.onMessage.emit({type:'loading'});port.onMessage.emit({type:'result',result:{networkId,invocationFeeUnits:'20000',invocationMaximumFeeUnits:'25000',feeLabel:'ESTIMATED',contracts:[{contractId,wasmId,owner:address}]}});return;}
        if(message.type==='invoke'){port.onMessage.emit({type:'pending'});port.onMessage.emit({type:'progress',stage:'EXECUTING'});port.onMessage.emit({type:'result',result:{networkId,transactionId,executionStatus:'SUCCESS',executionReason:null,output:{answer:42}}});}
      });
    });
  }};
  return {runtime,sent,storage:new MemoryStorage()};
}

test('connect returns and remembers only the approved public address',async()=>{
  const f=fixture(),events=[],sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});sdk.onStatus(event=>events.push(event));
  assert.deepEqual(await sdk.connect({networkId}),{networkId,address});
  assert.deepEqual(sdk.rememberedConnection(networkId),{networkId,address});
  assert.deepEqual(events.map(event=>event.state),['opening','awaiting-approval','success']);
  assert.equal(new Set(events.map(event=>event.requestId)).size,1);
  assert.deepEqual(await sdk.restoreConnection({networkId}),{networkId,address});
  assert.equal((await sdk.disconnect({networkId})).disconnected,true);
  assert.equal(sdk.rememberedConnection(networkId),null);
});

test('balance, contract loading and invocation expose validated responses and progress',async()=>{
  const f=fixture(),events=[],sdk=createMyriaDapp({runtime:f.runtime,storage:f.storage});sdk.onStatus(event=>events.push(event));
  const balance=await sdk.getBalance({networkId,address});assert.equal(balance.observedUnits,'10000000');assert.equal(balance.display,'10');
  const contract=await sdk.loadContract({networkId,address,contractId});
  assert.equal(contract.contractId,contractId);assert.equal(contract.wasmId,wasmId);assert.equal(contract.owner,address);
  const catalog=await sdk.getContracts({networkId,address});assert.equal(catalog.invocationFeeUnits,'20000');assert.equal(catalog.invocationMaximumFeeUnits,'25000');assert.equal(catalog.feeLabel,'ESTIMATED');
  const result=await contract.invoke({input:{value:42},amount:'0.5'});
  assert.equal(result.transactionId,transactionId);assert.equal(result.output.answer,42);
  assert.deepEqual(f.sent.find(item=>item.message.type==='invoke').message,{type:'invoke',networkId,address,contractId,input:'{"value":42}',amount:'0.5'});
  assert.ok(events.some(event=>event.operation==='balance'&&event.state==='reading'));
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
  for(const method of ['status','onStatus','rememberedConnection','connect','restoreConnection','disconnect','getBalance','getContracts','loadContract','invoke','invokeContract','myriaAmountToUnits','myriaUnitsToAmount','tokenAvatarArt','tokenInitial','drawTokenAvatar','tokenAvatarPng'])assert.ok(api.includes('`'+method),`API.md must document ${method}`);
  for(const structure of ['MyriaConnection','MyriaBalance','MyriaContractCatalog','MyriaContractDefinition','MyriaContractResult','MyriaStatusEvent'])assert.ok(model.includes(structure),`DATA_MODEL.md must document ${structure}`);
  for(const text of [api,model,readme])assert.doesNotMatch(text,/SvelteKit|Amazon Web Services|\bAWS\b|\bEC2\b|CloudFront/i);
});
