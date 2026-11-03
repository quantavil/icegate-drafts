const fs=require('node:fs'), vm=require('node:vm'), assert=require('node:assert/strict');
const ctx={console}; vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
const doc={getName:()=> '123456701012026INMBD6SB35.pdf'};
let markedRead=false;
const msg={getAttachments:()=>[doc],getId:()=> 'gate-message',markRead:()=>{assert.ok(saved['icegate-thread-thread'].includes('new-draft'));markedRead=true;}};
const info={bill:'1234567',date:'01012026',type:'Gatepass'};
const saved={'bill-1234567-01012026':JSON.stringify({id:'thread',parent:'parent'}),'icegate-thread-thread':JSON.stringify({draft:'sent-draft',parent:'parent',items:[{id:'leo',name:'leo.pdf',bill:'1234567'}],hash:'old'})};
const props={getProperty:k=>saved[k]||null,setProperty:(k,v)=>{saved[k]=v}};
let created=[];
ctx.rawDraft_=id=>id==='sent-draft'?null:{message:{threadId:'thread',raw:'new'}};
ctx.unsentFiles_=(_,files)=>files.map(()=>true);
ctx.newDraft_=(_,items)=>{created=items;return 'new-draft'};
ctx.hash_=()=>'hash';
ctx.fileHash_=()=>'file-hash';
ctx.handleMessage_(msg,info,props);
assert.equal(created.length,1); assert.equal(created[0].id,'gate-message');
assert.equal(JSON.parse(saved['icegate-thread-thread']).draft,'new-draft');
assert.equal(markedRead,true);
console.log('A sent draft is followed by a new draft containing only the newly arrived document');

// A later document that only updates the existing draft also marks its source email as read.
{
  let read=0;
  const m2={getAttachments:()=>[{getName:()=> '123456701012026INMBD6SB35.pdf'}],getId:()=> 'gate-2',markRead:()=>{read++}};
  saved['icegate-thread-thread']=JSON.stringify({draft:'live-draft',items:[{id:'leo',name:'leo.pdf',bill:'1234567',hash:'h'}],hash:'hash'});
  ctx.rawDraft_=()=>({message:{threadId:'thread',raw:'new'}});
  ctx.attachments_=items=>items.map(()=>({getName:()=> 'leo.pdf'}));
  ctx.api_=()=>null;
  ctx.handleMessage_(m2,info,props);
  assert.equal(read,1);
  assert.equal(JSON.parse(saved['icegate-thread-thread']).items.length,2);
  console.log('An update to an existing draft marks the new ICEGATE email as read');
}
