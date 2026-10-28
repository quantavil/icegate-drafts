const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
function scenario(incomingName, incomingKeep) {
  const file = name => ({getName: () => name, getBytes: () => [1]});
  const leo = file('123456701012026-leo.pdf'), gate = file('123456701012026-gate.pdf');
  const priorItems = [{id:'leo',name:leo.getName(),bill:'1234567'}, {id:'gate',name:gate.getName(),bill:'1234567'}];
  const store = {'bill-1234567-01012026': JSON.stringify({id:'thread'}), 'icegate-thread-thread': JSON.stringify({draft:'managed',items:priorItems,hash:'old'})};
  const props = {getProperty:k=>store[k]||null,setProperty:(k,v)=>{store[k]=v}};
  const ctx={console, Utilities:{DigestAlgorithm:{SHA_256:'sha'},computeDigest:()=>[1],base64Encode:()=> 'same'}};
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
  let replacementItems, updated = false;
  ctx.rawDraft_= id => ({message:{threadId:'thread',raw: id === 'managed' && !updated ? 'old' : 'replacement'}});
  ctx.hash_= value => value;
  ctx.attachments_=()=>[leo, gate];
  ctx.unsentFiles_=()=>[false,true,incomingKeep];
  ctx.newDraft_=(_,items)=>{replacementItems=items;return 'temporary'};
  ctx.api_=method=>{if (method === 'put') updated=true;};
  ctx.handleMessage_({getAttachments:()=>[file(incomingName)],getId:()=> 'incoming'}, {bill:'1234567',date:'01012026',type:'Gatepass'}, props);
  assert.equal(updated,true);
  assert.deepEqual(Array.from(replacementItems, x=>x.name),[gate.getName()]);
}
scenario('123456701012026-gate.pdf', true);
scenario('123456701012026-leo.pdf', false);
console.log('Sent attachments are removed from a managed draft even when incoming files are duplicates or already sent');
