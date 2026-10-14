// Verifica 14/10/2026: quali eventi del registro percorso arrivano al primo accesso, quando il
// consenso viene dato DOPO l'avvio dell'app (banner), e dopo un refresh.
// Nessun invio reale: rete esterna bloccata, __cxSendTelemetry sostituita da un raccoglitore in pagina.
// Avvio: npx vite --port 5173 ; Uso: NODE_PATH=<playwright> node scripts/verifica-tracciamento-2026-10/consenso-app-open.cjs [accetta|rifiuta]
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
const CHOICE = process.argv[2] === 'rifiuta' ? 'declined' : 'accepted';
(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); return (u.hostname === 'localhost' || u.hostname === '127.0.0.1') ? r.continue() : r.abort(); });
  await ctx.addInitScript(() => {
    window.__sent = [];
    window.__cxSendTelemetry = function (e) { window.__sent.push(e.type); return Promise.resolve(); };
  });
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
  await page.waitForTimeout(4000);
  const before = await page.evaluate(() => window.__sent.slice());
  // consenso dato dal banner dell'app
  const btn = page.locator(CHOICE === 'accepted' ? '#gdpr-accept-btn' : '#gdpr-decline-btn');
  if (await btn.count() && await btn.isVisible()) await btn.click();
  else await page.evaluate((c) => window.cortexSetCookieConsent(c), CHOICE);
  await page.waitForTimeout(8000);
  const afterConsent = await page.evaluate(() => window.__sent.slice());
  await page.reload();
  await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
  await page.waitForTimeout(5000);
  const afterReload = await page.evaluate(() => window.__sent.slice());
  const out = { prima_del_consenso: before, dopo_il_consenso: afterConsent, dopo_il_refresh: afterReload };
  console.log(JSON.stringify(out));
  const once = afterConsent.filter(t => t === 'app_open').length === 1;
  const ok = CHOICE === 'accepted'
    ? before.length === 0 && afterConsent.includes('session_start') && once && afterReload.includes('app_open')
    : before.length === 0 && afterConsent.length === 0 && afterReload.length === 0;
  console.log((ok ? 'OK ' : 'FAIL ') + (CHOICE === 'accepted' ? 'accettato: app_open una volta nella sessione in cui si accetta' : 'rifiutato: nessun evento, nemmeno dopo il refresh'));
  await browser.close();
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
