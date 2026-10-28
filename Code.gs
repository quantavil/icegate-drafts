function parseSubject(subject) {
  subject = subject.replace(/\s+/g, ' ').trim();
  const m = /^Electronic\s+(Final LEO|eGatepass)\s+copy of SB for Shipping Bill No\s*(\d{7})\s*Dt\s*(\d{8})/i.exec(subject);
  return m ? {bill:m[2],date:m[3],type:/leo/i.test(m[1]) ? 'LEO' : 'Gatepass'} : null;
}
function chooseThread(threads) {
  return threads.slice().sort((a,b) => b.count-a.count || b.time-a.time || a.id.localeCompare(b.id))[0] || null;
}
function activeHour(hour) { return hour >= 11 && hour < 22; }

const ICEGATE_SENDER = 'noreply@icegate.gov.in';
const STATE_PREFIX = 'icegate-thread-';

// Call once to start processing new mail. Existing mail is not backfilled.
function installAutomation() {
  const props = PropertiesService.getScriptProperties();
  if (!props.getProperty('icegate-start')) props.setProperty('icegate-start', String(Date.now()));
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'checkIcegate') ScriptApp.deleteTrigger(trigger);
  }
  ScriptApp.newTrigger('checkIcegate').timeBased().everyMinutes(1).create();
}
function stopAutomation() {
  for (const trigger of ScriptApp.getProjectTriggers()) {
    if (trigger.getHandlerFunction() === 'checkIcegate') ScriptApp.deleteTrigger(trigger);
  }
}
function checkIcegate() {
  if (!activeHour(Number(Utilities.formatDate(new Date(), 'Asia/Kolkata', 'H')))) return;
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { processNewIcegate_(); } finally { lock.releaseLock(); }
}
function processNewIcegate_() {
  const props = PropertiesService.getScriptProperties();
  const start = Number(props.getProperty('icegate-start'));
  if (!start) throw new Error('Run installAutomation first');
  const now = Date.now();
  const cursor = Math.max(start, Number(props.getProperty('icegate-cursor') || start));
  const query = 'from:' + ICEGATE_SENDER + ' {subject:LEO subject:eGatepass} after:' + (Math.floor(cursor / 1000) - 1) + ' has:attachment';
  const all = props.getProperties();
  const pending = JSON.parse(all['icegate-pending'] || '{}');
  const ids = new Set(Object.keys(pending).filter(id => pending[id] <= now));
  let pageToken;
  do {
    const path = 'messages?maxResults=100&q=' + encodeURIComponent(query) + (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
    const page = api_('get', path);
    for (const msg of (page.messages || [])) {
      if (!all['done-' + msg.id] && (!pending[msg.id] || pending[msg.id] <= now)) ids.add(msg.id);
    }
    pageToken = page.nextPageToken;
  } while (pageToken);
  for (const id of ids) {
    const key = 'done-' + id;
    if (pending[id] && pending[id] > now) continue;
    if (all[key]) { delete pending[id]; continue; }
    let info;
    try {
      const msg = GmailApp.getMessageById(id);
      if (msg.getDate().getTime() < start || !/^\s*(?:[^<]*<)?noreply@icegate\.gov\.in>?\s*$/i.test(msg.getFrom())) { delete pending[id]; continue; }
      info = parseSubject(msg.getSubject());
      if (!info) { delete pending[id]; continue; }
      handleMessage_(msg, info, props);
      props.setProperty(key, String(now));
      delete pending[id];
    } catch (err) {
      // A permanently deleted message must not block other pending messages.
      let missing = false;
      if (!info) {
        try { missing = !api_('get', 'messages/' + encodeURIComponent(id) + '?format=minimal', null, true); } catch (_) {}
      }
      if (missing) { delete pending[id]; continue; }
      pending[id] = now + 15 * 60 * 1000;
      console.error('Could not prepare ' + (info ? info.type + ' for SB ' + info.bill : 'ICEGATE message ' + id) + ': ' + err.message);
    }
  }
  props.setProperty('icegate-pending', JSON.stringify(pending));
  props.setProperty('icegate-cursor', String(Math.max(start, now - 3600000)));
  if (now - Number(props.getProperty('icegate-cleaned') || 0) > 86400000) {
    for (const k of Object.keys(all)) {
      if (k.startsWith('done-') && now - Number(all[k]) > 3 * 86400000) props.deleteProperty(k);
      if (k.startsWith(STATE_PREFIX) || k.startsWith('bill-')) {
        try { const saved = JSON.parse(all[k]); if (saved.updatedAt && now - saved.updatedAt > 30 * 86400000 && props.getProperty(k) === all[k]) props.deleteProperty(k); } catch (err) { console.error('Invalid saved state: ' + k); }
      }
    }
    props.setProperty('icegate-cleaned', String(now));
  }
}
function findCustomer_(bill) {
  const own = [Session.getEffectiveUser().getEmail()].concat(GmailApp.getAliases()).map(x => x.toLowerCase());
  let offset = 0, batch; const candidates = [];
  do {
    batch = GmailApp.search('"' + bill + '" -in:trash -in:spam', offset, 100); offset += batch.length;
    for (const thread of batch) {
      const msgs = thread.getMessages().filter(m => !m.isDraft());
      if (!msgs.some(m => (m.getSubject() + '\n' + m.getPlainBody()).includes(bill))) continue;
      const hasCustomer = msgs.some(m => {
        const from = m.getFrom();
        const address = (from.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [''])[0].toLowerCase();
        return address && address !== ICEGATE_SENDER && !own.includes(address) && !/no-?reply/i.test(address);
      });
      if (!hasCustomer) continue;
      candidates.push({id:thread.getId(),count:msgs.length,time:thread.getLastMessageDate().getTime()});
    }
  } while (batch.length === 100);
  return chooseThread(candidates);
}
function api_(method, path, data, allowMissing) {
  const res = UrlFetchApp.fetch('https://gmail.googleapis.com/gmail/v1/users/me/' + path, {
    method, headers:{Authorization:'Bearer ' + ScriptApp.getOAuthToken()},
    contentType:'application/json', payload:data ? JSON.stringify(data) : undefined, muteHttpExceptions:true
  });
  const status = res.getResponseCode();
  if (allowMissing && status === 404) return null;
  if (status < 200 || status >= 300) throw new Error('Gmail API error ' + status + ': ' + res.getContentText().slice(0,300));
  return status === 204 ? null : JSON.parse(res.getContentText());
}
function rawDraft_(id) { return api_('get', 'drafts/' + encodeURIComponent(id) + '?format=raw', null, true); }
function hash_(str) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, str)); }
function fileHash_(file) { return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, file.getBytes())); }
function attachments_(items) {
  const result = [];
  for (const item of items) {
    const msg = GmailApp.getMessageById(item.id);
    if (!msg) throw new Error('Source email no longer exists');
    const files = msg.getAttachments({includeInlineImages:false});
    const matches = files.filter(a => a.getName() === item.name);
    const file = item.index === undefined ? (matches.length === 1 ? matches[0] : null) : files[item.index];
    if (!file || file.getName() !== item.name || (item.hash && fileHash_(file) !== item.hash)) throw new Error('Source attachment missing, changed or ambiguous');
    result.push(file);
  }
  return result;
}
function newDraft_(threadId, items, files) {
  const thread = GmailApp.getThreadById(threadId);
  if (!thread) throw new Error('Customer conversation no longer exists');
  const messages = thread.getMessages().filter(message => !message.isDraft());
  const parent = messages[messages.length - 1];
  if (!parent) throw new Error('Customer conversation has no messages');
  const bills = [...new Set(items.map(x => x.bill))];
  const types = [items.some(x => x.type === 'LEO') && 'LEO', items.some(x => x.type === 'Gatepass') && 'eGatepass'].filter(Boolean).join(' and ');
  const body = 'Dear Sir,\n\nPlease find attached the ' + types + ' copies for shipping bill(s): ' + bills.join(', ') + '.\n\nThanks.';
  const escapeHtml = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const attribution = 'On ' + Utilities.formatDate(parent.getDate(), 'Asia/Kolkata', 'dd MMM yyyy, HH:mm') + ', ' + parent.getFrom() + ' wrote:';
  const quotedText = parent.getPlainBody().replace(/\r\n?/g, '\n').split('\n').map(line => '> ' + line).join('\n');
  const htmlBody = '<div>' + escapeHtml(body).replace(/\n/g, '<br>') + '</div><br><div class="gmail_quote"><div>' + escapeHtml(attribution) + '</div><blockquote style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">' + parent.getBody() + '</blockquote></div>';
  return parent.createDraftReplyAll(body + '\n\n' + attribution + '\n' + quotedText, {htmlBody:htmlBody,attachments:files || attachments_(items)}).getId();
}
function unsentFiles_(threadId, files) {
  const own = [Session.getEffectiveUser().getEmail()].concat(GmailApp.getAliases()).map(x => x.toLowerCase());
  const thread = GmailApp.getThreadById(threadId);
  if (!thread) throw new Error('Customer conversation no longer exists');
  const names = new Set(files.map(f => f.getName()));
  const sentHashes = new Set(), sentNames = new Set();
  for (const message of thread.getMessages()) {
    if (message.isDraft()) continue;
    const address = (message.getFrom().match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i) || [])[0];
    if (!address || !own.includes(address.toLowerCase())) continue;
    for (const sent of message.getAttachments({includeInlineImages:false})) {
      if (names.has(sent.getName())) { sentNames.add(sent.getName()); sentHashes.add(sent.getName() + ':' + fileHash_(sent)); }
    }
  }
  return files.map(file => !sentNames.has(file.getName()) || !sentHashes.has(file.getName() + ':' + fileHash_(file)));
}
function handleMessage_(msg, info, props, testIgnoreSent) {
  const pdfs = msg.getAttachments({includeInlineImages:false}).map((file,index) => ({file,index})).filter(x => /\.pdf$/i.test(x.file.getName()) && x.file.getName().startsWith(info.bill + info.date));
  if (!pdfs.length) throw new Error('No PDF matching bill and date');
  const mappingKey = 'bill-' + info.bill + '-' + info.date;
  const found = JSON.parse(props.getProperty(mappingKey) || 'null') || findCustomer_(info.bill);
  if (!found) throw new Error('No matching customer conversation');
  const stateKey = STATE_PREFIX + found.id;
  let state = JSON.parse(props.getProperty(stateKey) || 'null');
  let current = state && rawDraft_(state.draft);
  if (!current || hash_(current.message.raw) !== state.hash) state = null;
  const priorItems = state ? state.items : [];
  const priorFiles = state ? attachments_(priorItems) : [];
  const allFiles = priorFiles.concat(pdfs.map(x => x.file));
  const keep = testIgnoreSent ? allFiles.map(() => true) : unsentFiles_(found.id, allFiles);
  const incoming = pdfs.map((x,i) => ({file:x.file,keep:keep[priorFiles.length+i],item:{id:msg.getId(),name:x.file.getName(),index:x.index,hash:fileHash_(x.file),bill:info.bill,type:info.type}})).filter(x => x.keep);
  if (!incoming.length && !state) {
    found.updatedAt = Date.now();
    props.setProperty(mappingKey, JSON.stringify(found));
    console.log('Already sent in customer conversation: SB ' + info.bill + ' ' + info.type);
    return;
  }
  let created = false;
  if (state) {
    const keptPrior = priorItems.map((item,i) => ({item,file:priorFiles[i]})).filter((_,i) => keep[i]);
    const added = incoming.filter(x => !keptPrior.some(y => x.item.name === y.item.name && x.item.hash === (y.item.hash || fileHash_(y.file))));
    if (!added.length && keptPrior.length === priorItems.length) return;
    const items = keptPrior.map(x=>x.item).concat(added.map(x=>x.item));
    const files = keptPrior.map(x=>x.file).concat(added.map(x=>x.file));
    if (!items.length) {
      console.log('All files in the existing draft were sent separately; review the draft for SB ' + info.bill);
      return;
    }
    const tempId = newDraft_(found.id, items, files);
    try {
      const replacement = rawDraft_(tempId);
      const latest = rawDraft_(state.draft);
      if (!latest || hash_(latest.message.raw) !== state.hash) throw new Error('Draft was edited while preparing update; will retry');
      api_('put', 'drafts/' + encodeURIComponent(state.draft), {message:{threadId:found.id,raw:replacement.message.raw}});
      current = rawDraft_(state.draft);
      if (!current || current.message.threadId !== found.id) throw new Error('Updated draft is not in the expected thread');
      state.items = items; state.hash = hash_(current.message.raw);
    } finally { api_('delete', 'drafts/' + encodeURIComponent(tempId), null, true); }
  } else {
    const items = incoming.map(x=>x.item);
    const draftId = newDraft_(found.id, items, incoming.map(x=>x.file));
    current = rawDraft_(draftId);
    if (!current || current.message.threadId !== found.id) throw new Error('New draft is not in expected thread');
    state = {draft:draftId,items:items,hash:hash_(current.message.raw)};
    created = true;
  }
  state.updatedAt = Date.now();
  found.updatedAt = state.updatedAt;
  props.setProperty(stateKey, JSON.stringify(state));
  props.setProperty(mappingKey, JSON.stringify(found));
  if (created) {
    try { msg.markRead(); } catch (err) { console.error('Could not mark ICEGATE message as read: ' + err.message); }
  }
  console.log('Prepared ' + info.type + ' for SB ' + info.bill + ' in customer conversation');
}
function testPollReadOnly() {
  const started = Date.now();
  const q = 'from:noreply@icegate.gov.in {subject:LEO subject:eGatepass} after:' + Math.floor((Date.now()-7*86400000)/1000) + ' has:attachment';
  const page = api_('get','messages?maxResults=10&q='+encodeURIComponent(q));
  if (!(page.messages || []).length) throw new Error('Search did not find recent historical ICEGATE messages');
  const msg = GmailApp.getMessageById(page.messages[0].id);
  if (!/^\s*(?:[^<]*<)?noreply@icegate\.gov\.in>?\s*$/i.test(msg.getFrom())) throw new Error('Unexpected sender format');
  if (!parseSubject(msg.getSubject())) throw new Error('Unexpected subject format');
  console.log('PASS: poll query finds ICEGATE documents; read-only test took '+(Date.now()-started)+' ms');
}
