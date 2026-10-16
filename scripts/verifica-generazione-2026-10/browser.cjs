// Verifica 15/10/2026 del percorso testo/foto/PDF → flashcard → salvataggio → primo ripasso.
// - Firebase: emulatori locali Auth 9099 + Firestore 8189, progetto demo (scripts/verifica-flusso-tolc-2026-10/avvia-emulatori.sh).
// - AI SIMULATA: /api/gemini è intercettato e risponde con carte preparate. NON verifica la qualità dell'AI reale.
// - OCR: lo script Tesseract (CDN) è intercettato; lo scenario "ocr" lo blocca apposta.
// - Rete esterna bloccata: nessun account reale, nessun costo AI, nessuna scrittura in produzione.
// Avvio: npx vite --port 5173 ; Uso: NODE_PATH=<playwright> node scripts/verifica-generazione-2026-10/browser.cjs <scenario>
// Scenari: testo | malformato | rete | blocco | ocr | account
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
const SCENARIO = process.argv[2] || 'testo';
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log('[gen]', ok ? 'OK  ' : 'FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); };

const NOTES = 'La fotosintesi clorofilliana è il processo con cui le piante verdi trasformano energia luminosa in energia chimica. ' +
  'Avviene nei cloroplasti grazie alla clorofilla. Nella fase luminosa si produce ATP e NADPH, nella fase oscura (ciclo di Calvin) si fissa la CO2. ' +
  'I prodotti finali sono glucosio e ossigeno, che viene liberato nell’atmosfera.';
const CARDS = [
  { front: 'Che cos’è la fotosintesi?', back: 'Trasformazione di energia luminosa in energia chimica.' },
  { front: 'Dove avviene la fotosintesi?', back: 'Nei cloroplasti.' },
  { front: 'Che cosa si fissa nel ciclo di Calvin?', back: 'La CO2.' },
];
const geminiBody = (text) => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });

function initScript() {
  try {
    if (!sessionStorage.getItem('__gen_init')) {
      sessionStorage.setItem('__gen_init', '1');
      localStorage.setItem('cortex_cookie_consent', 'declined');
      localStorage.setItem('cortex_onboarding_done', '1');
      localStorage.setItem('cortex_onboarded', '1');
      localStorage.setItem('cortex_guest', '1');   // modalità ospite, come "Prova senza account"
      localStorage.setItem('cortex_demo_seen', '1');
      localStorage.setItem('fb_project_id', 'demo-cortex-security');
      localStorage.setItem('fb_api_key', 'demo-key');
      localStorage.setItem('fb_auth_domain', 'localhost');
    }
  } catch (_) {}
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
async function idb(page, scope) {
  return page.evaluate((scope) => new Promise((res) => {
    const r = indexedDB.open('cortex_db', 1);
    r.onsuccess = () => { const g = r.result.transaction('decks', 'readonly').objectStore('decks').get(scope); g.onsuccess = () => { res(g.result || []); r.result.close(); }; g.onerror = () => res([]); };
    r.onerror = () => res([]);
  }), scope);
}
async function fn(page, name, params) {
  await page.evaluate(([name, params]) => {
    const b = document.createElement('button'); b.setAttribute('data-fn', name);
    if (params) b.setAttribute('data-params', JSON.stringify(params));
    document.body.appendChild(b); b.click(); b.remove();
  }, [name, params]);
}
async function ready(page) {
  await page.waitForFunction(() => window.__cxModulesReady && !window.__cxScopeSwitching, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
}
async function openCreate(page, name, text) {
  await fn(page, 'showView', ['CreateDeckView']);
  await page.locator('#deck-name').waitFor({ timeout: 10000 });
  await page.fill('#deck-name', name);
  await page.fill('#deck-text', text);
}
const genBtn = (page) => page.locator('[data-fn="openPdfAIFromText"]').first();
const decksNamed = (decks, name) => decks.filter(d => (d.name || '').trim().toLowerCase() === name.toLowerCase());

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  // 15/10/2026 sera: service worker bloccato. Con sw.js attivo le richieste passavano dal service worker e
  // sfuggivano alle intercettazioni: lo scenario "ocr" caricava il Tesseract vero dalla CDN.
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
  let aiMode = 'ok', aiCalls = 0, ocrMode = 'ok';
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/gemini') {
      aiCalls++;
      if (aiMode === 'hang') return;                                   // nessuna risposta
      if (aiMode === 'neterr') return r.abort('failed');
      if (aiMode === 'bad') return r.fulfill({ status: 200, contentType: 'application/json', body: geminiBody('Ecco le tue flashcard: {non è json') });
      return r.fulfill({ status: 200, contentType: 'application/json', body: geminiBody(JSON.stringify({ title: 'Titolo proposto dall’AI', cards: CARDS })) });
    }
    if (/tesseract/.test(u.pathname)) {
      if (ocrMode === 'hang') return;                                  // CDN bloccata: lo script non arriva mai
      return r.fulfill({ status: 200, contentType: 'application/javascript', body: 'window.Tesseract={recognize:async()=>({data:{text:"Testo letto dalla foto: la mitosi è la divisione cellulare."}})};' });
    }
    if (u.hostname === 'localhost' || (u.hostname === '127.0.0.1' && /^(9099|8189)$/.test(u.port))) return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/ServiceWorker/.test(e.message)) console.log('[gen] pageerror', e.message.slice(0, 160)); });
  await page.goto(BASE + '/app');
  await ready(page);

  if (SCENARIO === 'testo') {
    await openCreate(page, 'Biologia', NOTES);
    await genBtn(page).dblclick();
    await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 20000 });
    check('doppio clic su "Genera": una sola chiamata AI', aiCalls === 1, aiCalls);
    check('anteprima: il nome scelto resta (non il titolo dell’AI)', await page.inputValue('#pdfai-deck-name') === 'Biologia');
    await page.locator('#pdfai-save-btn').dblclick();
    await page.waitForTimeout(1500);
    let decks = await idb(page, 'guest');
    const bio = decksNamed(decks, 'Biologia');
    check('doppio clic su "Salva": una sola materia "Biologia"', bio.length === 1, bio.length);
    check('carte salvate (3)', bio[0] && bio[0].cards.length === 3, bio[0] && bio[0].cards.length);
    check('materiale importato conservato nella materia', bio[0] && bio[0].text === NOTES, bio[0] && (bio[0].text || '').slice(0, 40));
    // "Salva Materia" dopo il salvataggio dall'anteprima: nessuna seconda materia con lo stesso nome
    await fn(page, 'showView', ['CreateDeckView']);
    await page.waitForTimeout(500);
    const formName = await page.inputValue('#deck-name').catch(() => '');
    if (formName) { await fn(page, 'saveDeck'); await page.waitForTimeout(1000); }
    decks = await idb(page, 'guest');
    check('"Salva Materia" dopo il salvataggio AI: niente doppione', decksNamed(decks, 'Biologia').length === 1, { form: formName, n: decksNamed(decks, 'Biologia').length });
    // ricarica + primo ripasso
    await page.reload(); await ready(page);
    decks = await idb(page, 'guest');
    const after = decksNamed(decks, 'Biologia')[0];
    check('dopo la ricarica: materia, carte e materiale ci sono', after && after.cards.length === 3 && after.text === NOTES);
    await fn(page, 'startStudyById', [after.id]);
    await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
    for (let i = 0; i < 10 && !(await page.locator('#session-done').isVisible()); i++) {
      await page.locator('#flip-card').click(); await page.locator('#rating-buttons.visible').waitFor();
      await page.locator('#rating-buttons .btn-good').click(); await page.waitForTimeout(150);
    }
    await page.waitForTimeout(1000);
    await page.reload(); await ready(page);
    const studied = decksNamed(await idb(page, 'guest'), 'Biologia')[0];
    check('primo ripasso: progressi conservati dopo la ricarica', studied && studied.cards.every(c => c.reps > 0));
  }

  if (SCENARIO === 'malformato' || SCENARIO === 'rete') {
    aiMode = SCENARIO === 'malformato' ? 'bad' : 'neterr';
    await openCreate(page, 'Chimica', NOTES);
    await genBtn(page).click();
    await page.waitForTimeout(3000);
    const saveVisible = await page.locator('#pdfai-save-btn').isVisible().catch(() => false);
    const msg = (await page.locator('#pdfai-cards-list').innerText().catch(() => '')).slice(0, 120);
    check('errore mostrato, nessun pulsante "Salva"', !saveVisible && msg.length > 0, msg);
    check('nessuna materia creata', decksNamed(await idb(page, 'guest'), 'Chimica').length === 0);
    check('il testo importato resta nel campo', await page.inputValue('#deck-text') === NOTES);
    // riprova
    await page.evaluate(() => window.closePdfAI && window.closePdfAI());
    aiMode = 'ok';
    await genBtn(page).click();
    await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#pdfai-save-btn').click();
    await page.waitForTimeout(1500);
    const chem = decksNamed(await idb(page, 'guest'), 'Chimica');
    check('riprova riuscita: una sola materia con 3 carte', chem.length === 1 && chem[0].cards.length === 3, chem.map(d => d.cards.length));
  }

  if (SCENARIO === 'blocco') {
    // Il servizio AI non risponde: entro un tempo limitato errore e possibilità di riprovare.
    aiMode = 'hang';
    await openCreate(page, 'Storia', NOTES);
    await genBtn(page).click();
    const t0 = Date.now();
    let settled = false;
    for (let i = 0; i < 75; i++) {
      await page.waitForTimeout(1000);
      const loading = await page.locator('#pdfai-loading').isVisible().catch(() => false);
      if (!loading) { settled = true; break; }
    }
    const waited = Math.round((Date.now() - t0) / 1000);
    check('AI che non risponde: l’attesa finisce (≤ 70 s) con un errore', settled, { secondi: waited });
    aiMode = 'ok';
    await page.evaluate(() => window.closePdfAI && window.closePdfAI());
    const before = aiCalls;
    await genBtn(page).click();
    await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
    check('dopo l’attesa si può riprovare', aiCalls === before + 1 && await page.locator('#pdfai-save-btn').isVisible(), { chiamate: aiCalls - before });
  }

  if (SCENARIO === 'ocr') {
    ocrMode = 'hang';
    await openCreate(page, 'Biologia cellulare', '');
    const toasts = [];
    await page.exposeFunction('__genToast', (m) => toasts.push(m));
    await page.evaluate(() => { const el = document.getElementById('toast'); new MutationObserver(() => { if (el.textContent) window.__genToast(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
    const t0 = Date.now();
    const run = page.evaluate(() => window.handleImageFile(new File([new Uint8Array([137, 80, 78, 71])], 'appunti.png', { type: 'image/png' })).then(() => 'done'));
    const outcome = await Promise.race([run, new Promise(r => setTimeout(() => r('ancora in attesa'), 75000))]);
    const waited = Math.round((Date.now() - t0) / 1000);
    check('OCR bloccato: l’attesa finisce (≤ 70 s)', outcome === 'done' && waited <= 70, { esito: outcome, secondi: waited });
    check('OCR bloccato: messaggio comprensibile', toasts.some(m => /OCR/i.test(m)), toasts.slice(-2));
    ocrMode = 'ok';
    const t1 = Date.now();
    await page.evaluate(() => window.handleImageFile(new File([new Uint8Array([137, 80, 78, 71])], 'appunti.png', { type: 'image/png' })));
    const text = await page.inputValue('#deck-text');
    check('riprova: il testo della foto arriva nel campo', /mitosi/.test(text), text.slice(0, 80));
  }

  if (SCENARIO === 'account') {
    // Ospite: genera e salva (l'ospite usa un account ANONIMO sull'emulatore per l'AI)
    await openCreate(page, 'Fisica', NOTES);
    await genBtn(page).click();
    await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 20000 });
    await page.locator('#pdfai-save-btn').click();
    await page.waitForTimeout(1500);
    const anon = await page.evaluate(() => { const u = firebase.auth().currentUser; return u ? { anon: u.isAnonymous } : null; });
    check('ospite: l’AI passa da un account anonimo (quota ospite lato server)', anon && anon.anon === true, anon);
    check('ospite: materia salvata', decksNamed(await idb(page, 'guest'), 'Fisica').length === 1);
    // Il server Vite non ha le riscritture dell'hosting (firebase.json: /materiale → /app.html):
    // si torna su /app prima dell'accesso, che ricarica la pagina al cambio di spazio dati.
    await page.goto(BASE + '/app'); await ready(page);
    // Accesso Google simulato sull'emulatore
    const uidA = 'genA' + Date.now().toString(36);
    await page.evaluate((uid) => {
      const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true }));
      window.__guestLogin = () => firebase.auth().signInWithCredential(cred);
      try { localStorage.setItem('cortex_guest', '1'); } catch (_) {}
      window.__guestLogin();
    }, uidA);
    await page.waitForTimeout(7000);
    await ready(page);
    const st = await page.evaluate(() => ({ uid: window._fbUserId, scope: localStorage.getItem('cortex_active_scope'), anon: firebase.auth().currentUser && firebase.auth().currentUser.isAnonymous }));
    check('accesso completato: spazio dati dell’account', st.uid && st.scope === 'u:' + st.uid && st.anon === false, st);
    const accDecks = await idb(page, 'u:' + st.uid);
    const fis = decksNamed(accDecks, 'Fisica');
    check('account: la materia dell’ospite c’è, una volta, con carte e materiale', fis.length === 1 && fis[0].cards.length === 3 && fis[0].text === NOTES, fis.map(d => [d.cards.length, !!d.text]));
    let cloud = [];
    for (let i = 0; i < 20 && !cloud.length; i++) {
      await page.waitForTimeout(1000);
      cloud = await page.evaluate(async () => (await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get()).docs.map(d => d.data().name));
    }
    check('account: materia sul cloud (emulatore)', cloud.includes('Fisica'), cloud);
    // Isolamento: B non vede nulla di A
    await page.evaluate(() => firebase.auth().signOut()); await page.waitForTimeout(5000); await ready(page);
    const uidB = 'genB' + Date.now().toString(36);
    await page.evaluate((uid) => { const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true })); return firebase.auth().signInWithCredential(cred); }, uidB);
    await page.waitForTimeout(7000); await ready(page);
    const b = await page.evaluate(() => ({ uid: window._fbUserId }));
    const bDecks = await idb(page, 'u:' + b.uid);
    const bCloud = await page.evaluate(async () => (await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get()).size);
    check('account B: nessuna materia di A, né sul dispositivo né sul cloud', b.uid !== st.uid && !decksNamed(bDecks, 'Fisica').length && bCloud === 0, { dispositivo: bDecks.length, cloud: bCloud });
  }

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(JSON.stringify({ scenario: SCENARIO, passed: results.length - failed, failed }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
