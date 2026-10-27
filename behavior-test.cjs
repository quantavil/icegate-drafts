const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const file = (name, text) => ({getName: () => name, getBytes: () => Buffer.from(text)});
const prior = {isDraft: () => false, getFrom: () => 'Sender <sender@example.com>', getAttachments: () => [file('same.pdf','abc')]};
const ctx = {
  GmailApp: {getThreadById: () => ({getMessages: () => [prior]}), getAliases: () => []},
  Session: {getEffectiveUser: () => ({getEmail: () => 'sender@example.com'})},
  Utilities: {DigestAlgorithm: {SHA_256:'sha256'}, computeDigest: (_,bytes) => [...crypto.createHash('sha256').update(Buffer.from(bytes)).digest()], base64Encode: bytes => Buffer.from(bytes).toString('base64')},
};
vm.createContext(ctx); vm.runInContext(fs.readFileSync(__dirname+'/Code.gs','utf8'),ctx);
assert.equal(ctx.alreadySent_('thread', file('same.pdf','abc')),true);
assert.equal(ctx.alreadySent_('thread', file('same.pdf','changed')),false);
assert.equal(ctx.alreadySent_('thread', file('other.pdf','abc')),false);
console.log('Sent attachment detection passed');
