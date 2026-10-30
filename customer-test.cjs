const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const message=from=>({isDraft:()=>false,getSubject:()=> 'SB 1234567',getPlainBody:()=>'',getFrom:()=>from,getId:()=>from});
const thread=(id,people)=>({getId:()=>id,getMessages:()=>people.map(message),getLastMessageDate:()=>new Date(0)});
const list=[thread('self-only',['alias@example.com']),thread('customer',['sender@example.com','customer@example.com'])];
const ctx={Session:{getEffectiveUser:()=>({getEmail:()=> 'sender@example.com'})},GmailApp:{getAliases:()=>['alias@example.com'],search:()=>list}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
assert.equal(ctx.findCustomer_('1234567').id,'customer');
console.log('Customer matching excludes own account and aliases');

// Gmail's message-level results can find a bill only indexed in an attached PDF.
{
  const fallbackMessage = {isDraft:()=>false,getFrom:()=> 'customer@example.com',getThread:()=>pdfThread};
  const pdfThread = thread('pdf-customer',['customer@example.com']);
  const fallbackCtx={Session:ctx.Session,GmailApp:{getAliases:()=>[],search:()=>[],getMessageById:()=>fallbackMessage}};
  vm.createContext(fallbackCtx);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),fallbackCtx);
  fallbackCtx.api_=(method,path)=>{assert.match(decodeURIComponent(path),/newer_than:3m/);return {messages:[{id:'pdf-message'}]};};
  assert.equal(fallbackCtx.findCustomer_('1234567')?.id,'pdf-customer');
}

// Normal subject/body matches take precedence without calling the fallback API.
{
  const c={Session:ctx.Session,GmailApp:{getAliases:()=>[],search:q=>{assert.match(q,/newer_than:3m/);return [thread('normal',['customer@example.com'])];}}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),c);
  c.api_=()=>{throw new Error('fallback must not run');};
  assert.equal(c.findCustomer_('1234567').id,'normal');
}
// ICEGATE itself cannot be the message that supplies the fallback hit.
{
  const c={Session:ctx.Session,GmailApp:{getAliases:()=>[],search:()=>[],getMessageById:()=>({isDraft:()=>false,getFrom:()=> 'noreply@icegate.gov.in'})}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),c);
  c.api_=()=>({messages:[{id:'icegate'}]});
  assert.equal(c.findCustomer_('1234567'),null);
}
console.log('PDF fallback uses message search only after normal matching and excludes ICEGATE hits');

// A bill is not a substring of a longer number, and a no-reply message
// cannot supply the match just because another message has a customer sender.
{
  const mk=(from,subject)=>({isDraft:()=>false,getSubject:()=>subject,getPlainBody:()=>'',getFrom:()=>from});
  const mixed={getId:()=> 'mixed',getMessages:()=>[mk('noreply@icegate.gov.in','SB 1234567'),mk('customer@example.com','No bill here')],getLastMessageDate:()=>new Date(0)};
  const longer={getId:()=> 'longer',getMessages:()=>[mk('customer@example.com','SB 12345678')],getLastMessageDate:()=>new Date(0)};
  const c={Session:ctx.Session,GmailApp:{getAliases:()=>[],search:()=>[mixed,longer]}};
  vm.createContext(c);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),c);c.api_=()=>({messages:[]});
  assert.equal(c.findCustomer_('1234567'),null);
}
