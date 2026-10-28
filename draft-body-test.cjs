const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
let body;
const ctx = {GmailApp:{getThreadById:()=>({getMessages:()=>[{isDraft:()=>false,createDraftReplyAll:text=>{body=text;return {getId:()=> 'draft'};}}]})}};
vm.createContext(ctx);vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
const draft = types => {ctx.newDraft_('thread',types.map(type=>({bill:'1234567',type})),[]);return body;};
assert.match(draft(['LEO']),/attached the LEO copies/);assert.doesNotMatch(body,/eGatepass/);
assert.match(draft(['Gatepass']),/attached the eGatepass copies/);assert.doesNotMatch(body,/LEO/);
assert.match(draft(['LEO','Gatepass']),/attached the LEO and eGatepass copies/);
console.log('Draft text matches the attached document types');
