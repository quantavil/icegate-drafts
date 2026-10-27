function parseSubject(subject) {
  subject = subject.replace(/\s+/g, ' ').trim();
  const m = /^Electronic\s+(Final LEO|eGatepass)\s+copy of SB for Shipping Bill No\s*(\d{7})\s*Dt\s*(\d{8})/i.exec(subject);
  return m ? {bill:m[2],date:m[3],type:/leo/i.test(m[1]) ? 'LEO' : 'Gatepass'} : null;
}
function chooseThread(threads) {
  return threads.slice().sort((a,b) => b.count-a.count || b.time-a.time || a.id.localeCompare(b.id))[0] || null;
}
function activeHour(hour) { return hour >= 10 && hour < 22; }
if (typeof module !== 'undefined') module.exports = {parseSubject, chooseThread, activeHour};
