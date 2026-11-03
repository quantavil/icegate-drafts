const fs = require('node:fs'), vm = require('node:vm'), assert = require('node:assert/strict');
const bytesOf = s => [...Buffer.from(s)].map(b => b > 127 ? b - 256 : b);
const ctx = {
  console,
  GmailApp: {getAliases: () => []},
  Session: {getEffectiveUser: () => ({getEmail: () => 'Me@Example.com'})},
  Utilities: {
    base64DecodeWebSafe: s => bytesOf(Buffer.from(s, 'base64url')),
    base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => b & 255)).toString('base64url'),
    newBlob: x => typeof x === 'string' ? {getBytes: () => bytesOf(x)} : {getDataAsString: () => Buffer.from(x.map(b => b & 255)).toString('latin1')},
  },
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname + '/Code.gs', 'utf8'), ctx);
const own = ['me@example.com'];
const mail = (from, to, cc = '', replyTo = '') => ({getFrom: () => from, getTo: () => to, getCc: () => cc, getReplyTo: () => replyTo});
const plain = x => JSON.parse(JSON.stringify(x));

// Our own sent mail: customer stays in To, other recipients stay in Cc, we are never listed.
assert.deepEqual(plain(ctx.replyRecipients_(mail('ME <me@example.com>', 'cust@x.com', 'info@y.in'), own)), {to: ['cust@x.com'], cc: ['info@y.in']});
// Customer mail: reply to the sender, everyone else (except us) in Cc.
assert.deepEqual(plain(ctx.replyRecipients_(mail('Cust <cust@x.com>', 'me@example.com', 'info@y.in'), own)), {to: ['cust@x.com'], cc: ['info@y.in']});
assert.deepEqual(plain(ctx.replyRecipients_(mail('Cust <cust@x.com>', 'me@example.com, other@z.com', '', 'reply@x.com'), own)), {to: ['reply@x.com'], cc: ['other@z.com']});

assert.equal(ctx.setRecipients_('From: a@b.com\r\nTo: me@example.com\r\nCc: info@y.in,\r\n cust@x.com\r\nSubject: s', ['cust@x.com'], ['info@y.in']), 'To: cust@x.com\r\nCc: info@y.in\r\nFrom: a@b.com\r\nSubject: s');
assert.equal(ctx.setRecipients_('Subject: s\nTo: me@example.com', ['c@x.com'], []), 'To: c@x.com\nSubject: s');

// Whole draft: the observed bad draft (To = us, customer in Cc) is repaired; body bytes are untouched.
let put;
const draftRaw = h => Buffer.from(h + '\r\n\r\nBody é\r\n').toString('base64url');
ctx.api_ = (m, p, d) => { put = {m, p, d}; };
ctx.rawDraft_ = () => ({message: {threadId: 't', raw: draftRaw('From: me@example.com\r\nTo: me@example.com\r\nCc: info@y.in, cust@x.com\r\nSubject: s')}});
ctx.fixReplyRecipients_('d1', mail('ME <me@example.com>', 'cust@x.com', 'info@y.in'));
assert.equal(put.p, 'drafts/d1'); assert.equal(put.d.message.threadId, 't');
assert.equal(Buffer.from(put.d.message.raw, 'base64url').toString(), 'To: cust@x.com\r\nCc: info@y.in\r\nFrom: me@example.com\r\nSubject: s\r\n\r\nBody é\r\n');

// A correct draft is left alone.
put = null;
ctx.rawDraft_ = () => ({message: {threadId: 't', raw: draftRaw('To: cust@x.com\r\nCc: info@y.in')}});
ctx.fixReplyRecipients_('d1', mail('Cust <cust@x.com>', 'me@example.com', 'info@y.in'));
assert.equal(put, null);
console.log('Draft To never lists our own address and the customer stays in To');
