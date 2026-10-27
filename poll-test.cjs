const fs = require('node:fs'); const vm = require('node:vm'); const assert = require('node:assert/strict');
const now = Date.now(), store = {'icegate-start':String(now - 3600000),'done-old':String(now)}; let reads=0, lists=0;
const props={getProperty:k=>store[k]||null,getProperties:()=>({...store}),setProperty:(k,v)=>{store[k]=v},deleteProperty:k=>{delete store[k]}};
const ctx={PropertiesService:{getScriptProperties:()=>props},GmailApp:{getMessageById:()=>{reads++;throw Error('Processed message reread');}},console};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
ctx.api_=()=>{lists++;return {messages:[{id:'old'}]}};
ctx.processNewIcegate_();
assert.equal(lists,1); assert.equal(reads,0); console.log('Polling skips processed messages');
