// Prova con UTENTE REGISTRATO su emulatori Firebase locali (Auth 9099, Firestore 8189), progetto
// demo-cortex-security: nessun contatto con la produzione (backend Google reali bloccati).
// Avvio emulatori: firebase emulators:start --only auth,firestore --project demo-cortex-security
// Uso: NODE_PATH=<playwright> node scripts/tolc-ripasso-2026-10/repro-account-emulator.cjs [account_tolc|guest_to_account]
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4173';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';
const BLOCK = [/firestore\.googleapis\.com/, /identitytoolkit\.googleapis\.com/, /securetoken\.googleapis\.com/, /cloudfunctions\.net/, /firebaseinstallations/,
  /google-analytics\.com/, /googletagmanager\.com/, /clarity\.ms/, /accounts\.google\.com/, /apis\.google\.com/, /\/api\/telemetry/, /\/api\/gemini/, /fcmregistrations/];

function initScript() {
  try {
    if (!sessionStorage.getItem('__emu_init')) {
      sessionStorage.setItem('__emu_init', '1');
      if (!localStorage.getItem('cortex_cookie_consent')) localStorage.setItem('cortex_cookie_consent', 'accepted');
      localStorage.setItem('fb_project_id', 'demo-cortex-security');
      localStorage.setItem('fb_api_key', 'demo-key');
      localStorage.setItem('fb_auth_domain', 'localhost');
    }
  } catch (_) {}
  window.__cxSendTelemetry = function (e) { try { console.log('TEL ' + JSON.stringify({ type: e.type, meta: e.meta || {} })); } catch (_) {} return Promise.resolve(); };
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
    fb = v;
    if (v && v.initializeApp && !v.__emuWrapped) {
      v.__emuWrapped = true;
      const orig = v.initializeApp.bind(v);
      v.initializeApp = function (cfg, name) {
        const app = orig(Object.assign({}, cfg, { projectId: 'demo-cortex-security', apiKey: 'demo-key', authDomain: 'localhost' }), name);
        try { app.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true }); } catch (e) { console.log('EMU auth ' + e.message); }
        try { app.firestore().useEmulator('127.0.0.1', 8189); } catch (e) { console.log('EMU fs ' + e.message); }
        return app;
      };
    }
  } });
}

async function signIn(page, uid) {
  return page.evaluate(async (uid) => {
    const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true, name: 'Tester ' + uid }));
    const r = await firebase.auth().signInWithCredential(cred);
    return r.user && r.user.uid;
  }, uid);
}

async function doTolc(page, { answers = 6, clickPrimary = true } = {}) {
  await page.evaluate(() => window.startTolcDirect('tolc-i'));
  await page.waitForTimeout(400);
  for (let i = 0; i < answers; i++) {
    await page.evaluate(() => { const o = document.querySelectorAll('#tolc-sim-overlay .tolc-opt'); if (o[1]) o[1].click(); const n = document.getElementById('tolc-next'); if (n) n.click(); });
    await page.waitForTimeout(50);
  }
  for (let k = 0; k < 90; k++) {
    const c = await page.$('#tolc-consegna'); if (c) { await c.click(); break; }
    await page.evaluate(() => { const n = document.getElementById('tolc-next'); if (n) n.click(); });
    await page.waitForTimeout(10);
  }
  await page.waitForTimeout(300);
  if (clickPrimary) { const p = await page.$('#tolc-gen-errors'); if (p) await p.click(); await page.waitForTimeout(1200); }
}

async function rateAll(page) {
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => { const d = document.getElementById('session-done'); return !!d && d.style.display === 'block'; });
    if (done) return i;
    const ok = await page.evaluate(() => { if (typeof window.flipCard === 'function') window.flipCard(); else { const f = document.querySelector('[data-fn=flipCard]'); if (f) f.click(); } const b = document.querySelector('#rating-buttons .btn-good'); if (!b) return false; b.click(); return true; });
    if (!ok) return -1;
    await page.waitForTimeout(120);
  }
  return -2;
}

async function run(scenario) {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });
  // Il blocco guarda l'host (gli URL dell'emulatore contengono 'identitytoolkit.googleapis.com' nel percorso).
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1' && /^(9099|8189)$/.test(u.port)) return r.continue(); return BLOCK.some(x => x.test(u.hostname + u.pathname)) ? r.abort() : r.continue(); });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  const out = { scenario, events: [], errors: [], notes: [] };
  page.on('console', m => { const t = m.text(); if (t.startsWith('TEL ')) { const e = JSON.parse(t.slice(4)); if (e.type !== 'heartbeat') out.events.push(e.type + (e.meta.account_type ? ':' + e.meta.account_type : '')); } else if (/^EMU/.test(t)) out.notes.push(t); });
  page.on('pageerror', e => out.errors.push(e.message.slice(0, 200)));
  const uid = 'acc' + Date.now().toString(36);

  if (scenario === 'account_tolc') {
    await page.goto(BASE + '/app', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    out.notes.push('login uid: ' + await signIn(page, uid));
    await page.waitForTimeout(4000);   // scope guest → account: la pagina si ricarica
    out.notes.push('dopo login: ' + JSON.stringify(await page.evaluate(() => ({ path: location.pathname, loggedIn: !!window._fbLoggedIn, scope: localStorage.getItem('cortex_active_scope'), onboardingShown: (document.getElementById('onboarding-overlay') || { style: {} }).style.display === 'flex' }))));
    // l'onboarding (account nuovo, nessun mazzo) può essere aperto: lo chiudiamo come farebbe chi salta
    await page.evaluate(() => { const o = document.getElementById('onboarding-overlay'); if (o && o.style.display === 'flex') document.querySelector('#onboarding-overlay [data-fn=closeOnboarding]').click(); });
    await page.waitForTimeout(500);
    out.notes.push('dopo chiusura onboarding: ' + await page.evaluate(() => location.pathname + ' firstRun=' + !!document.querySelector('[aria-label="Inizia da qui"]')));
    await doTolc(page);
    out.notes.push('studio aperto: ' + await page.evaluate(() => document.getElementById('study-overlay').classList.contains('active')));
    out.notes.push('diag studio: ' + JSON.stringify(await page.evaluate(() => ({ flip: typeof window.flipCard, rate: typeof window.rateCard, btns: document.querySelectorAll('#rating-buttons .btn-good').length,
      q: (document.getElementById('card-question') || {}).textContent && document.getElementById('card-question').textContent.slice(0, 40), sess: (document.getElementById('study-session') || {style:{}}).style.display,
      top: (() => { const e = document.elementFromPoint(196, 600); return e ? (e.id || e.className || e.tagName) : null; })() }))));
    out.notes.push('carte valutate fino alla fine: ' + await rateAll(page));
    await page.waitForTimeout(2500);
    out.notes.push('activation (Firestore emulatore): ' + JSON.stringify(await page.evaluate(async () => {
      const d = (await firebase.firestore().collection('users').doc(window._fbUserId).get()).data() || {};
      const a = d.activation || {};
      return { firstReviewDay: a.firstReviewDay, firstReviewCompletedAt: !!a.firstReviewCompletedAt, lastStudyDay: a.lastStudyDay, ratingsGiven: a.ratingsGiven, cardsStudied: a.cardsStudied, cardsGenerated: a.cardsGenerated || 0, activated: !!a.activated };
    })));
    // Giorno dopo (simulato): il primo ripasso risulta di ieri, sul dispositivo e sul server.
    await page.evaluate(async () => {
      const d = new Date(Date.now() - 864e5); const y = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
      localStorage.setItem('cortex_first_review_day', y);
      await firebase.firestore().collection('users').doc(window._fbUserId).set({ activation: { firstReviewDay: y } }, { merge: true });
      if (typeof window.closeStudy === 'function') window.closeStudy();
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const p = document.getElementById('tolc-save-prompt'); if (p) p.remove(); });
    await doTolc(page);
    out.notes.push('carte valutate (giorno dopo): ' + await rateAll(page));
    await page.waitForTimeout(2500);
    out.notes.push('ritorno sul server: ' + JSON.stringify(await page.evaluate(async () => {
      const a = ((await firebase.firestore().collection('users').doc(window._fbUserId).get()).data() || {}).activation || {};
      return { studyReturnedAt: !!a.studyReturnedAt, studyReturnedDay: a.studyReturnedDay };
    })));
  }

  if (scenario === 'guest_to_account') {
    await page.goto(BASE + '/app?sim=tolc-i', { waitUntil: 'load' });
    await page.waitForTimeout(2500);
    await doTolc(page, { clickPrimary: false });
    // "Salva il risultato nel tuo account Google": il login vero è sostituito da un accesso
    // all'emulatore (stesso effetto: utente Google nuovo → cambio di spazio dati → ricarica).
    await page.evaluate((uid) => { window.loginWithGoogle = function () {
      const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true }));
      firebase.auth().signInWithCredential(cred);
    }; }, uid);
    await page.click('#tolc-enter');
    await page.waitForTimeout(6000);
    out.notes.push('dopo accesso: ' + JSON.stringify(await page.evaluate(() => ({
      path: location.pathname, loggedIn: !!window._fbLoggedIn, scope: localStorage.getItem('cortex_active_scope'),
      resumeCard: document.getElementById('tolc-resume-card') ? document.getElementById('tolc-resume-card').textContent.trim().slice(0, 140) : null,
      onboardingShown: (document.getElementById('onboarding-overlay') || { style: {} }).style.display === 'flex',
      tolcErrDecks: ((window._legacyState && window._legacyState().decks) || []).filter(d => /^tolc-err-/.test(String(d.id))).length,
    }))));
    const go = await page.$('#tolc-resume-go');
    if (go) { await go.click(); await page.waitForTimeout(800); }
    out.notes.push('studio aperto dalla ripresa: ' + await page.evaluate(() => document.getElementById('study-overlay').classList.contains('active')));
    out.notes.push('carte valutate: ' + await rateAll(page));
    await page.waitForTimeout(3000);
    out.notes.push('mazzo sul cloud (emulatore): ' + JSON.stringify(await page.evaluate(async () => {
      const snap = await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get();
      return snap.docs.map(d => d.id).filter(id => /^tolc-err-/.test(id)).length;
    })));
  }
  await browser.close();
  return out;
}

(async () => {
  const list = process.argv.slice(2).length ? process.argv.slice(2) : ['account_tolc', 'guest_to_account'];
  for (const s of list) { const r = await run(s); console.log('\n===== ' + s + ' =====\n' + JSON.stringify(r, null, 1)); }
})().catch(e => { console.error(e); process.exit(1); });
