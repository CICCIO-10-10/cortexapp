// Verifica 14/10/2026 con UTENTI REGISTRATI su emulatori Firebase locali (Auth 9099, Firestore 8189),
// progetto demo-cortex-security: nessun contatto con la produzione (backend Google reali bloccati),
// utenti sintetici creati sull'emulatore, nessuna AI.
// Avvio: npm run build && npx vite preview --port 4173
//        scripts/verifica-flusso-tolc-2026-10/avvia-emulatori.sh
// Uso:   NODE_PATH=<playwright> node scripts/verifica-flusso-tolc-2026-10/emulatori.cjs
// Le regole Firestore applicate sono quelle del repository (avvia-emulatori.sh): con regole aperte
// il difetto del primo accesso (doc utente rifiutato → mazzi ospite non caricati) non si vede.
// Percorso: ospite fa il TOLC → ripassa gli errori → "Accedi con Google" (emulatore) → i dati restano
// nell'account e arrivano sul cloud (emulatore) → logout → account B non vede nulla di A → A ritrova tutto.
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:4173';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const UA = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36';

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok }); console.log('[emu]', ok ? 'OK  ' : 'FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); };

function initScript() {
  try {
    if (!sessionStorage.getItem('__emu_init')) {
      sessionStorage.setItem('__emu_init', '1');
      localStorage.setItem('cortex_cookie_consent', 'rejected');
      localStorage.setItem('fb_project_id', 'demo-cortex-security');
      localStorage.setItem('fb_api_key', 'demo-key');
      localStorage.setItem('fb_auth_domain', 'localhost');
    }
  } catch (_) {}
  window.__cxSendTelemetry = function () { return Promise.resolve(); };
  let fb;
  Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
    fb = v;
    if (v && v.initializeApp && !v.__emuWrapped) {
      v.__emuWrapped = true;
      const orig = v.initializeApp.bind(v);
      v.initializeApp = function (cfg, name) {
        const app = orig(Object.assign({}, cfg, { projectId: 'demo-cortex-security', apiKey: 'demo-key', authDomain: 'localhost' }), name);
        try { app.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true }); } catch (_) {}
        try { app.firestore().useEmulator('127.0.0.1', 8189); } catch (_) {}
        return app;
      };
    }
  } });
}

// Il login Google vero è sostituito da un accesso all'emulatore (stesso effetto: utente Google → cambio di spazio dati → ricarica).
async function stubLogin(page, uid) {
  await page.evaluate((uid) => {
    window.loginWithGoogle = function () {
      const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true, name: 'Tester ' + uid }));
      firebase.auth().signInWithCredential(cred);
    };
  }, uid);
}
async function ready(page) {
  await page.waitForFunction(() => window.__cxModulesReady && !window.__cxScopeSwitching, null, { timeout: 30000 });
  await page.waitForTimeout(2500);
}
async function idb(page, scope) {
  return page.evaluate((scope) => new Promise((res) => {
    const r = indexedDB.open('cortex_db', 1);
    r.onsuccess = () => { const g = r.result.transaction('decks', 'readonly').objectStore('decks').get(scope); g.onsuccess = () => { res(g.result || null); r.result.close(); }; g.onerror = () => res(null); };
    r.onerror = () => res(null);
  }), scope);
}
async function quickTolc(page, pick) {
  await page.goto(BASE + '/app?sim=tolc-i&veloce=1', { waitUntil: 'load' });
  await page.locator('#tolc-sim-overlay .tolc-opt').first().waitFor({ timeout: 30000 });
  for (let i = 0; i < 100; i++) {
    const ov = page.locator('#tolc-sim-overlay');
    if (await ov.locator('#tolc-consegna').count()) break;
    const opts = ov.locator('.tolc-opt'); await opts.first().waitFor();
    await opts.nth(pick).click();
    await ov.locator('#tolc-next').click();
  }
  await page.locator('#tolc-consegna').click();
}
async function rate(page, n) {
  for (let i = 0; i < n; i++) {
    if (await page.locator('#session-done').isVisible()) return;
    await page.locator('#flip-card').click();
    await page.locator('#rating-buttons.visible').waitFor();
    await page.locator('#rating-buttons .btn-good').click();
    await page.waitForTimeout(150);
  }
}

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 393, height: 851 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', r => {
    const u = new URL(r.request().url());
    if ((u.hostname === '127.0.0.1' || u.hostname === 'localhost')) return r.continue();
    if (process.env.DEBUG) console.log('[emu] bloccato', u.hostname + u.pathname.slice(0, 60));
    return r.abort();   // tutto ciò che non è locale è bloccato
  });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/ServiceWorker/.test(e.message)) console.log('[emu] pageerror', e.message.slice(0, 160)); });
  const A = 'tolcA' + Date.now().toString(36), B = 'tolcB' + Date.now().toString(36);

  // 1) ospite: TOLC con errori → ripasso di 1 carta → chiusura → proposta "Accedi con Google"
  await quickTolc(page, 0);
  await page.locator('#tolc-gen-errors').click();
  await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
  await rate(page, 1);
  await page.locator('.study-close').click();
  await page.locator('#tolc-save-prompt').waitFor({ timeout: 10000 });
  const guestDeck = ((await idb(page, 'guest')) || []).find(d => d.source === 'tolc_errors_local');
  check('ospite: mazzo errori salvato con 1 carta valutata', guestDeck && guestDeck.cards.filter(c => c.reps > 0).length === 1);
  const guestHist = await page.evaluate(() => localStorage.getItem('cortex_tolc_history'));
  await stubLogin(page, A);
  await page.locator('#tsp-login').dblclick();          // doppio clic sull'accesso
  await page.waitForTimeout(6000);                      // cambio di spazio dati → ricarica
  await ready(page);
  const st = await page.evaluate(() => ({ loggedIn: !!window._fbLoggedIn, uid: window._fbUserId, scope: localStorage.getItem('cortex_active_scope') }));
  const uidA = st.uid;
  check('accesso completato: spazio dati dell\'account A', st.loggedIn && st.scope === 'u:' + uidA, st);

  // 2) conservazione del lavoro nell'account
  const accDecks = (await idb(page, 'u:' + uidA)) || [];
  const accErr = accDecks.filter(d => d.source === 'tolc_errors_local');
  check('account A: un solo mazzo errori (niente doppioni)', accErr.length === 1, accErr.length);
  check('account A: il progresso del ripasso fatto da ospite è conservato', accErr[0] && accErr[0].cards.filter(c => c.reps > 0).length === 1);
  check('account A: spazio ospite svuotato dopo l\'unione', ((await idb(page, 'guest')) || []).length === 0);
  check('account A: lo storico TOLC dell\'ospite passa all\'account', await page.evaluate(() => localStorage.getItem('cortex_tolc_history')) === guestHist);
  // La sincronizzazione è asincrona (ritardo + rete): si attende fino a 20 s.
  let cloud = [];
  for (let i = 0; i < 20 && !cloud.length; i++) {
    await page.waitForTimeout(1000);
    cloud = await page.evaluate(async () => {
      const snap = await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get();
      return snap.docs.map(d => d.id).filter(id => /^tolc-err-/.test(id));
    });
  }
  check('account A: mazzo errori sul cloud (emulatore) senza altre modifiche locali', cloud.length === 1, cloud);
  const userDoc = await page.evaluate(async () => { const d = (await firebase.firestore().collection('users').doc(window._fbUserId).get()).data() || {}; return { createdAt: !!d.createdAt, plan: d.plan || null, email: !!d.email }; });
  // 'plan' si scrive solo se il doc non esisteva ancora; se touchSeen() l'ha creato prima, manca:
  // assente = free per app e server (data.plan || 'free'). Mai un piano diverso da free.
  check('account A: documento utente completato al primo accesso (createdAt, email, piano free o assente)', userDoc.createdAt && userDoc.email && (userDoc.plan === 'free' || userDoc.plan === null), userDoc);

  // 3) continua il ripasso da account e ricarica: progressi salvati
  await page.evaluate((id) => { const b = document.createElement('button'); b.setAttribute('data-fn', 'startStudyById'); b.setAttribute('data-params', JSON.stringify([id])); document.body.appendChild(b); b.click(); b.remove(); }, accErr[0].id);
  await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
  await rate(page, 50);
  await page.waitForTimeout(1500);
  await page.reload(); await ready(page);
  const after = ((await idb(page, 'u:' + uidA)) || []).find(d => d.id === accErr[0].id);
  check('account A: ripasso completato e conservato dopo il refresh', after && after.cards.every(c => c.reps > 0));

  // 4) cambio account: logout di A, accesso di B
  await page.evaluate(() => firebase.auth().signOut());
  await page.waitForTimeout(5000); await ready(page);
  check('logout: torna lo spazio ospite', await page.evaluate(() => localStorage.getItem('cortex_active_scope')) === 'guest');
  await stubLogin(page, B);
  await page.evaluate(() => window.loginWithGoogle());
  await page.waitForTimeout(6000); await ready(page);
  const uidB = await page.evaluate(() => window._fbUserId);
  const bState = await page.evaluate(() => ({ scope: localStorage.getItem('cortex_active_scope'), hist: localStorage.getItem('cortex_tolc_history'), text: document.body.innerText }));
  check('account B: spazio dati di B', uidB && uidB !== uidA && bState.scope === 'u:' + uidB, bState.scope);
  check('account B: nessun mazzo errori di A sul dispositivo', !((await idb(page, 'u:' + uidB)) || []).some(d => d.source === 'tolc_errors_local') && !/Errori TOLC-I/.test(bState.text));
  check('account B: nessun punteggio TOLC di A', bState.hist === null, bState.hist);
  const bCloud = await page.evaluate(async () => (await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get()).size);
  check('account B: nessun mazzo di A attribuito a B sul cloud (emulatore)', bCloud === 0, bCloud);

  // 5) di nuovo A: ritrova mazzo, progressi e storico
  await page.evaluate(() => firebase.auth().signOut());
  await page.waitForTimeout(5000); await ready(page);
  await stubLogin(page, A);
  await page.evaluate(() => window.loginWithGoogle());
  await page.waitForTimeout(6000); await ready(page);
  const back = ((await idb(page, 'u:' + uidA)) || []).find(d => d.source === 'tolc_errors_local');
  check('di nuovo A: mazzo e progressi ritrovati', back && back.cards.every(c => c.reps > 0));
  check('di nuovo A: storico TOLC ritrovato', await page.evaluate(() => localStorage.getItem('cortex_tolc_history')) === guestHist);

  await browser.close();
  const failed = results.filter(r => !r.ok).length;
  console.log(JSON.stringify({ passed: results.length - failed, failed }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
