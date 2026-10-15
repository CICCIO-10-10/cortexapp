// Revisione PR #2 (16/10/2026): consenso assente / accettato / negato / revocato, all'apertura, durante la
// navigazione e dopo la ricarica. La build locale (dist/) viene servita come se fosse https://cortexapp.it,
// perché GA4 e Clarity partono solo lì: OGNI richiesta è intercettata, nessun contatto con la produzione.
// Clarity, GA e /api/telemetry sono sostituiti da registratori finti.
// Uso: npm run build && NODE_PATH=<playwright> node scripts/revisione-pr2-2026-10/consenso-browser.cjs <scenario>
// Scenari: assente | accettato | negato | revocato_altra_scheda
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const DIST = path.join(__dirname, '../../dist');
const SITE = 'https://cortexapp.it';
const SCENARIO = process.argv[2] || 'assente';
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log('[consenso]', ok ? 'OK  ' : 'FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); };

const REWRITE = { '/': 'index.html', '/app': 'app.html', '/materiale': 'app.html', '/privacy': 'privacy.html' };
const TYPES = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
// Clarity finto: registra le chiamate; "registra la sessione" finché non riceve consentv2 negato.
const FAKE_CLARITY = 'window.__clarity={loaded:true,calls:[],recording:true};(function(){var q=(window.clarity&&window.clarity.q)||[];' +
  'window.clarity=function(){var a=[].slice.call(arguments);window.__clarity.calls.push(a);' +
  'if(a[0]==="consentv2"&&a[1]&&a[1].analytics_Storage==="denied")window.__clarity.recording=false;};q.forEach(function(a){window.clarity.apply(null,a);});})();';

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ serviceWorkers: 'block', viewport: { width: 390, height: 844 } });
  const sent = [];        // eventi ricevuti da /api/telemetry
  const external = { clarity: 0, gtag: 0 };
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.origin === SITE) {
      if (u.pathname === '/api/telemetry') { try { sent.push(JSON.parse(r.request().postData() || '{}').type); } catch (_) {} return r.fulfill({ status: 202, body: '{"ok":true}', contentType: 'application/json' }); }
      if (u.pathname.startsWith('/api/')) return r.fulfill({ status: 503, body: '{}' });
      const file = REWRITE[u.pathname] || u.pathname.slice(1);
      const p = path.join(DIST, file);
      if (p.startsWith(DIST) && fs.existsSync(p) && fs.statSync(p).isFile()) return r.fulfill({ status: 200, body: fs.readFileSync(p), contentType: TYPES[path.extname(p)] || 'application/octet-stream' });
      return r.fulfill({ status: 404, body: '' });
    }
    if (/clarity\.ms$/.test(u.hostname)) { external.clarity++; return r.fulfill({ status: 200, body: FAKE_CLARITY, contentType: 'application/javascript' }); }
    if (/googletagmanager\.com$/.test(u.hostname)) { external.gtag++; return r.fulfill({ status: 200, body: 'window.__gaLoaded=true;', contentType: 'application/javascript' }); }
    return r.abort();   // Firebase, Google, CDN: nessuna richiesta esce
  });
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__c_init')) {
        sessionStorage.setItem('__c_init', '1');
        localStorage.setItem('cortex_guest', '1');
        localStorage.setItem('cortex_demo_seen', '1');
        localStorage.setItem('cortex_onboarding_done', '1');
        localStorage.setItem('cortex_onboarded', '1');
      }
    } catch (_) {}
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/ServiceWorker|firebase|Firebase/i.test(e.message)) console.log('[consenso] pageerror', e.message.slice(0, 140)); });
  const ready = async (p = page) => { await p.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 }); await p.waitForTimeout(4000); };
  const nav = async (p, name) => p.evaluate((name) => { const b = document.createElement('button'); b.setAttribute('data-fn', 'showPage'); b.setAttribute('data-params', JSON.stringify([name])); document.body.appendChild(b); b.click(); b.remove(); }, name);
  const count = (t) => sent.filter(x => x === t).length;
  const snapshot = async (p = page) => p.evaluate(() => ({ dataLayer: (window.dataLayer || []).length, clarity: !!(window.__clarity && window.__clarity.loaded), recording: !!(window.__clarity && window.__clarity.recording) }));

  await page.goto(SITE + '/app');
  await ready();

  if (SCENARIO === 'assente') {
    await nav(page, 'materiale'); await page.waitForTimeout(3000);
    await page.reload(); await ready();
    const s = await snapshot();
    check('consenso assente: nessun evento al tracker interno (apertura, navigazione, ricarica)', sent.length === 0, sent);
    check('consenso assente: Clarity e GA non scaricati', external.clarity === 0 && external.gtag === 0 && !s.clarity && s.dataLayer === 0, { ...external, ...s });
  }

  if (SCENARIO === 'accettato' || SCENARIO === 'revocato_altra_scheda') {
    await page.locator('#gdpr-accept-btn').click();
    await page.waitForTimeout(6000);
    let s = await snapshot();
    check('accettato: Clarity e GA caricati una volta', external.clarity === 1 && external.gtag === 1 && s.clarity, external);
    check('accettato: app_open e session_start una volta', count('app_open') === 1 && count('session_start') === 1, sent);
    await nav(page, 'materiale'); await page.waitForTimeout(3000);
    await nav(page, 'home'); await page.waitForTimeout(3000);
    check('navigazione: nessun app_open o session_start in più', count('app_open') === 1 && count('session_start') === 1, sent);
    if (SCENARIO === 'accettato') {
      await page.reload(); await ready();
      check('ricarica: un app_open per caricamento, sessione ripresa (non nuova)', count('app_open') === 2 && count('session_start') === 1 && count('session_resume') === 1, sent);
    }
  }

  if (SCENARIO === 'negato') {
    await page.locator('#gdpr-decline-btn').click();
    await page.waitForTimeout(4000);
    await nav(page, 'materiale'); await page.waitForTimeout(2000);
    await page.reload(); await ready();
    const s = await snapshot();
    check('negato: nessun evento, nemmeno dopo navigazione e ricarica', sent.length === 0, sent);
    check('negato: Clarity e GA mai scaricati', external.clarity === 0 && external.gtag === 0 && !s.clarity, external);
  }

  if (SCENARIO === 'revocato_altra_scheda') {
    // Revoca dalla pagina privacy in un'altra scheda, mentre l'app resta aperta con Clarity attivo.
    const other = await ctx.newPage();
    await other.goto(SITE + '/privacy');
    await other.locator('#cookie-scelta [data-cookie="declined"]').click();
    await other.waitForTimeout(1000);
    const before = sent.length;
    await nav(page, 'materiale'); await page.waitForTimeout(4000);      // attività nella scheda dell'app
    const s = await snapshot();
    check('revoca: il tracker interno si ferma anche nella scheda già aperta', sent.length === before, sent.slice(before));
    check('revoca: Clarity nella scheda già aperta riceve il rifiuto (non continua a registrare)', s.recording === false, s);
    check('revoca: GA nella scheda già aperta riceve il rifiuto', await page.evaluate(() => (window.dataLayer || []).some(e => e && e[0] === 'consent' && e[1] === 'update' && e[2] && e[2].analytics_storage === 'denied')));
    await page.reload(); await ready();
    const s2 = await snapshot();
    check('dopo la ricarica: nessun tracker', !s2.clarity && sent.length === before, { ...s2, nuovi: sent.slice(before) });
  }

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(JSON.stringify({ scenario: SCENARIO, passed: results.length - failed, failed }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
