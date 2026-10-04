// Prova (04/10/2026): nelle pagine "Scuole superiori a <provincia>" ogni etichetta di indirizzo è un
// link, e il tool /scuola si apre già su provincia e indirizzo. Rete esterna bloccata.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4173';
(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  await ctx.route('**/*', r => (/googleapis|google-analytics|googletagmanager|clarity|cloudfunctions|gstatic/.test(r.request().url()) ? r.abort() : r.continue()));
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/scuole-superiori-aosta.html', { waitUntil: 'load' });
  const chips = await p.$$eval('.chip', els => els.map(e => e.tagName + ':' + e.textContent.trim()));
  const out = { chipNonLink: chips.filter(c => !c.startsWith('A:')), chipTotali: chips.length };
  await p.click('a.chip:has-text("Istituto Tecnico")');
  await p.waitForLoadState('load'); await p.waitForTimeout(1500);
  out.dopoClic = await p.evaluate(() => ({ url: location.pathname + location.search, schermata: document.querySelector('.screen.active') && document.querySelector('.screen.active').id, sottotitolo: (document.getElementById('sub-scuola') || {}).textContent, scuole: document.querySelectorAll('#box-scuole .srow').length }));
  await p.goto(BASE + '/scuola', { waitUntil: 'load' }); await p.waitForTimeout(500);
  out.senzaParametri = await p.evaluate(() => document.querySelector('.screen.active').id);
  out.errori = errs;
  console.log(JSON.stringify(out, null, 1));
  await b.close();
})();
