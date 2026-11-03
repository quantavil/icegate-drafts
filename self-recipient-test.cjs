const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
let put;
const raw = header => Buffer.from(header + '\r\n\r\nBody é\r\n', 'utf8').toString('base64url');
const ctx = {
  console,
  Session: {getEffectiveUser: () => ({getEmail: () => 'Me@Example.com'})},
  Utilities: {
    base64DecodeWebSafe: s => [...Buffer.from(s, 'base64url')].map(b => b > 127 ? b - 256 : b),
    base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64url'),
    newBlob: x => typeof x === 'string' ? {getBytes: () => [...Buffer.from(x)].map(b => b > 127 ? b - 256 : b)} : {getDataAsString: () => Buffer.from(x.map(b => b & 255)).toString('latin1')},
  },
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);
const add = ctx.addToRecipient_;
assert.equal(add('From: a@b.com\r\nTo: Client <c@d.com>\r\nSubject: x', 'me@example.com'), 'From: a@b.com\r\nTo: Client <c@d.com>, me@example.com\r\nSubject: x');
assert.equal(add('To: Client <c@d.com>,\r\n e@f.com\r\nSubject: x', 'me@example.com'), 'To: Client <c@d.com>,\r\n e@f.com, me@example.com\r\nSubject: x');
assert.equal(add('To: "Me" <ME@example.com>\nSubject: x', 'me@example.com'), 'To: "Me" <ME@example.com>\nSubject: x');
assert.equal(add('From: a@b.com\nSubject: x', 'me@example.com'), 'To: me@example.com\nFrom: a@b.com\nSubject: x');
assert.equal(add('To: \r\nSubject: x', 'me@example.com'), 'To: me@example.com\r\nSubject: x');
assert.equal(add('Cc: me@example.com\r\nTo: c@d.com', 'me@example.com'), 'Cc: me@example.com\r\nTo: c@d.com, me@example.com');
assert.equal(add('X-To: c@d.com\r\nSubject: x', 'me@example.com'), 'To: me@example.com\r\nX-To: c@d.com\r\nSubject: x');

ctx.rawDraft_ = id => ({message: {threadId: 'thread', raw: raw('From: a@b.com\r\nTo: c@d.com\r\nSubject: x')}});
ctx.api_ = (method, path, data) => { put = {method, path, data}; };
ctx.addSelfToRecipients_('d1');
assert.equal(put.method, 'put'); assert.equal(put.path, 'drafts/d1'); assert.equal(put.data.message.threadId, 'thread');
const sent = Buffer.from(put.data.message.raw, 'base64url').toString('utf8');
assert.equal(sent, 'From: a@b.com\r\nTo: c@d.com, Me@Example.com\r\nSubject: x\r\n\r\nBody é\r\n');

put = null;
ctx.rawDraft_ = () => ({message: {threadId: 'thread', raw: raw('To: me@example.com')}});
ctx.addSelfToRecipients_('d1');
assert.equal(put, null);
console.log('Own address is added to To once and the message body is untouched');
