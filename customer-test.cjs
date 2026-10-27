const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const message=from=>({isDraft:()=>false,getSubject:()=> 'SB 1234567',getPlainBody:()=>'',getFrom:()=>from,getId:()=>from});
const thread=(id,people)=>({getId:()=>id,getMessages:()=>people.map(message),getLastMessageDate:()=>new Date(0)});
const list=[thread('self-only',['alias@example.com']),thread('customer',['sender@example.com','customer@example.com'])];
const ctx={Session:{getEffectiveUser:()=>({getEmail:()=> 'sender@example.com'})},GmailApp:{getAliases:()=>['alias@example.com'],search:()=>list}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
assert.equal(ctx.findCustomer_('1234567').id,'customer');
console.log('Customer matching excludes own account and aliases');
