// Riproduzione locale (2026-10-04) del percorso TOLC -> errori -> ripasso e degli errori "firebase non definito".
// Nessun traffico verso la produzione: backend Firebase, Analytics, Clarity e login Google sono BLOCCATI;
// gli eventi di telemetria sono catturati in pagina (window.__cxSendTelemetry predefinita).
// Uso: npm run build && npx vite preview --port 4173 ; poi
//   NODE_PATH=<cartella con playwright> node scripts/tolc-ripasso-2026-10/repro-browser.cjs [scenario]
// Scenari: sdk_ok | sdk_blocked | twa | desktop | account | login_resume
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4173';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const ANDROID_UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const BLOCK = [/firestore\.googleapis\.com/, /identitytoolkit\.googleapis\.com/, /securetoken\.googleapis\.com/, /cloudfunctions\.net/,
  /firebaseinstallations\.googleapis\.com/, /fcmregistrations/, /google-analytics\.com/, /googletagmanager\.com/, /clarity\.ms/,
  /accounts\.google\.com/, /apis\.google\.com/, /\.run\.app/, /firebaseapp\.com\/__\/auth/, /\/api\/telemetry/, /pagead2|doubleclick/];

async function run(scenario) {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const mobile = scenario !== 'desktop';
  const ctx = await browser.newContext(mobile ? { userAgent: ANDROID_UA, viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 800 } });
  const out = { scenario, pageErrors: [], rejections: [], consoleErrors: [], events: [], blocked: 0, notes: [] };
  await ctx.route('**/*', route => {
    const u = route.request().url();
    if (scenario === 'sdk_blocked' && /gstatic\.com\/firebasejs/.test(u)) { out.blocked++; return route.abort(); }
    if (BLOCK.some(r => r.test(u))) { out.blocked++; return route.abort(); }
    return route.continue();
  });
  await ctx.addInitScript(({ account }) => {
    try {
      if (!sessionStorage.getItem('__repro_init')) {
        sessionStorage.setItem('__repro_init', '1');
        if (!localStorage.getItem('cortex_cookie_consent')) localStorage.setItem('cortex_cookie_consent', 'accepted');
      }
    } catch (_) {}
    window.__cap = [];
    window.__cxSendTelemetry = function (e) { try { window.__cap.push({ type: e.type, meta: e.meta || {} }); console.log('TEL ' + JSON.stringify({ type: e.type, meta: e.meta || {} })); } catch (_) {} return Promise.resolve(); };
    window.addEventListener('unhandledrejection', ev => { try { const r = ev.reason; console.log('REJ ' + ((r && (r.stack || r.message)) || String(r)).slice(0, 600)); } catch (_) {} });
    if (account) {
      // Simulazione di un utente registrato SENZA backend: solo stato client (le chiamate cloud falliscono, bloccate).
      Object.defineProperty(window, '__reproAccount', { value: true });
    }
  }, { account: scenario === 'account' });
  const page = await ctx.newPage();
  page.on('pageerror', e => out.pageErrors.push((e.stack || e.message).slice(0, 500)));
  page.on('console', m => {
    const t = m.text();
    if (t.startsWith('TEL ')) { try { out.events.push(JSON.parse(t.slice(4))); } catch (_) {} return; }
    if (t.startsWith('REJ ')) { out.rejections.push(t.slice(4)); return; }
    if (m.type() === 'error') out.consoleErrors.push(t.slice(0, 200));
  });
  const referer = scenario === 'twa' ? 'android-app://app.web.cortex_app.twa/' : undefined;
  await page.goto(BASE + '/app?sim=tolc-i', { waitUntil: 'load', referer });
  await page.waitForTimeout(2500);
  const hasSim = await page.$('#tolc-sim-overlay');
  out.notes.push('overlay simulatore: ' + !!hasSim + ', firebase definito: ' + await page.evaluate(() => typeof firebase !== 'undefined'));
  if (!hasSim) { await finish(); return out; }
  // Rispondi alle prime 6 domande (sempre la prima opzione), poi consegna.
  for (let i = 0; i < 6; i++) {
    const opt = await page.$('#tolc-sim-overlay .tolc-opt');
    if (!opt) break;
    await opt.click();
    const next = await page.$('#tolc-next'); if (next) await next.click();
    await page.waitForTimeout(80);
  }
  await page.evaluate(() => { const b = document.getElementById('tolc-consegna'); if (b) b.click(); });
  // _finish non ha un pulsante finché non si arriva in fondo: forziamo la consegna con il click sul
  // pulsante del pannello (se presente) oppure navigando all'ultima domanda.
  for (let k = 0; k < 80 && !(await page.$('#tolc-gen-errors, #tolc-results-primary')); k++) {
    const c = await page.$('#tolc-consegna'); if (c) { await c.click(); break; }
    const n = await page.$('#tolc-next'); if (n) await n.click(); else break;
    await page.waitForTimeout(20);
  }
  await page.waitForTimeout(400);
  const result = await page.evaluate(() => {
    const ov = document.getElementById('tolc-sim-overlay');
    const btns = ov ? Array.from(ov.querySelectorAll('button')).map(b => (b.id || '') + ':' + b.textContent.trim().slice(0, 60)) : [];
    return { buttons: btns };
  });
  out.notes.push('pulsanti risultato: ' + JSON.stringify(result.buttons));
  if (scenario === 'login_resume') {
    // Richiesta di accesso dal risultato. Il login reale su telefono è un redirect: simuliamo
    // l'avvio (stessi flag di _doRedirect) e il ritorno su "/" (URL usato dalla vecchia app),
    // SENZA completare l'accesso (backend bloccato) → atteso: ritorno in /app, di nuovo ospite,
    // proposta "Ripassa i tuoi errori" che apre lo studio.
    out.notes.push('URL al risultato: ' + await page.evaluate(() => location.pathname));
    await page.evaluate(() => { window.loginWithGoogle = function () {
      localStorage.setItem('cortex_redirect_pending', '1'); localStorage.setItem('cortex_redirect_ts', String(Date.now()));
      window.__loginCalled = true; setTimeout(() => { location.href = '/'; }, 50);
    }; });
    const enter = await page.$('#tolc-enter');
    if (enter) await enter.click();
    await page.waitForTimeout(200);
    out.notes.push('prima del redirect: ' + JSON.stringify(await page.evaluate(() => ({ login: !!window.__loginCalled, resume: JSON.parse(localStorage.getItem('cortex_tolc_resume') || 'null') }))));
    await page.waitForURL(/\/app/, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(5000);
    out.notes.push('dopo il ritorno: ' + JSON.stringify(await page.evaluate(() => ({
      path: location.pathname, guest: localStorage.getItem('cortex_guest'),
      authWall: !!(document.getElementById('auth-overlay') && !document.getElementById('auth-overlay').classList.contains('hidden')),
      resumeCard: document.getElementById('tolc-resume-card') ? document.getElementById('tolc-resume-card').textContent.trim().slice(0, 160) : null,
      tolcErrDecks: ((window._legacyState && window._legacyState().decks) || []).filter(d => d && /^tolc-err-/.test(String(d.id))).length,
    }))));
    const go = await page.$('#tolc-resume-go');
    if (go) { await go.click(); await page.waitForTimeout(800); }
    out.notes.push('studio aperto dalla ripresa: ' + await page.evaluate(() => { const o = document.getElementById('study-overlay'); return !!(o && o.classList.contains('active')); }));
    await finish(); return out;
  }
  const primary = await page.$('#tolc-gen-errors');
  if (!primary) { out.notes.push('nessun pulsante errori'); await finish(); return out; }
  await primary.click();
  await page.waitForTimeout(1500);
  const studyOpen = await page.evaluate(() => {
    const vis = el => !!el && el.offsetParent !== null;
    const ov = document.getElementById('study-overlay');
    const toasts = Array.from(document.querySelectorAll('.toast, #toast, [class*=toast]')).map(t => t.textContent.trim().slice(0, 120)).filter(Boolean);
    return { overlayGone: !document.getElementById('tolc-sim-overlay'), studyVisible: !!(ov && ov.classList.contains('active')), onboardingVisible: (document.getElementById('onboarding-overlay') || {style:{}}).style.display === 'flex', toasts };
  });
  out.notes.push('dopo il click: ' + JSON.stringify(studyOpen));
  // Valuta le carte fino in fondo
  for (let i = 0; i < 12; i++) {
    const done = await page.evaluate(() => { const d = document.getElementById('session-done'); return !!d && d.style.display === 'block'; });
    if (done) { out.notes.push('sessione completata dopo ' + i + ' carte'); break; }
    const ok = await page.evaluate(() => {
      if (typeof window.flipCard === 'function') window.flipCard(); else { const f = document.querySelector('[data-fn=flipCard]'); if (f) f.click(); }
      const b = document.querySelector('#rating-buttons .btn-good'); if (!b) return false; b.click(); return true;
    });
    if (!ok) { out.notes.push('pulsanti di valutazione non trovati'); break; }
    await page.waitForTimeout(150);
  }
  await page.waitForTimeout(3500);
  out.notes.push('prompt salvataggio: ' + !!(await page.$('#tolc-save-prompt')));
  await finish();
  return out;
  async function finish() { await browser.close(); }
}

(async () => {
  const scenarios = process.argv.slice(2).length ? process.argv.slice(2) : ['sdk_ok', 'sdk_blocked'];
  for (const s of scenarios) {
    const r = await run(s);
    console.log('\n===== ' + s + ' =====');
    console.log(JSON.stringify({ ...r, events: r.events.map(e => e.type + (e.meta && e.meta.platform ? '@' + e.meta.platform : '')) }, null, 1));
  }
})().catch(e => { console.error(e); process.exit(1); });
