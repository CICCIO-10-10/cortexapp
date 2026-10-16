// Verifica finale dell'integrazione locale PR #3 (15/10/2026, sera).
// Percorsi testo/PDF/foto → generazione → anteprima → salvataggio → ripasso → riapertura, sul codice integrato
// con la nuova grafica. Tutto locale: Vite + emulatori Firebase (progetto demo), AI SIMULATA su /api/gemini.
// - pdf.js (cdnjs) e Tesseract (jsDelivr + dati della lingua) sono quelli VERI scaricati dalla CDN, salvo
//   gli scenari che li bloccano apposta. Nessun account reale, nessuna chiamata all'AI vera.
// - Service worker bloccato: altrimenti le richieste sfuggono alle intercettazioni.
// Avvio: emulatori (scripts/verifica-flusso-tolc-2026-10/avvia-emulatori.sh) + npx vite --port 5173
// Uso: BASE=http://localhost:5173 NODE_PATH=<playwright> node scripts/verifica-finale-2026-10-15/browser.cjs <scenario>
// Scenari: pdf | foto | esistente | lungo | pdfblocco | lungo-account
const { chromium } = require('playwright');
const path = require('node:path');
const fs = require('node:fs');
const BASE = process.env.BASE || 'http://localhost:5173';
const SCENARIO = process.argv[2] || 'pdf';
const DIR = __dirname;
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log('[fin]', ok ? 'OK  ' : 'FAIL', name, detail !== undefined ? JSON.stringify(detail).slice(0, 300) : ''); };

const CARDS = [
  { front: 'Che cosa contiene il nucleo?', back: 'Il DNA organizzato in cromosomi.' },
  { front: 'Che cosa producono i mitocondri?', back: 'ATP.' },
  { front: 'Che cosa fa l’apparato di Golgi?', back: 'Modifica e smista le proteine.' },
];
const geminiBody = (text) => JSON.stringify({ candidates: [{ content: { parts: [{ text }] } }] });

function initScript() {
  try {
    if (!sessionStorage.getItem('__fin_init')) {
      sessionStorage.setItem('__fin_init', '1');
      localStorage.setItem('cortex_cookie_consent', 'declined');
      localStorage.setItem('cortex_onboarding_done', '1');
      localStorage.setItem('cortex_onboarded', '1');
      localStorage.setItem('cortex_guest', '1');
      localStorage.setItem('cortex_demo_seen', '1');
      localStorage.setItem('cortex_guest_prompted', '1');   // niente invito all'account sopra i pulsanti
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
  if (text !== undefined) await page.fill('#deck-text', text);
}
const genBtn = (page) => page.locator('[data-fn="openPdfAIFromText"]').first();
const decksNamed = (decks, name) => decks.filter(d => (d.name || '').trim().toLowerCase() === name.toLowerCase());
async function watchToasts(page) {
  const toasts = [];
  await page.exposeFunction('__finToast', (m) => toasts.push(m));
  await page.evaluate(() => { const el = document.getElementById('toast'); new MutationObserver(() => { if (el.textContent) window.__finToast(el.textContent); }).observe(el, { childList: true, characterData: true, subtree: true }); });
  return toasts;
}
// Il server Vite non ha le riscritture dell'hosting (/materiale → app.html): si riapre /app.
async function reloadApp(page) { await page.goto(BASE + '/app'); await ready(page); }
async function generateAndSave(page) {
  await genBtn(page).click();
  await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 30000 });
  await page.locator('#pdfai-save-btn').click();
  await page.waitForTimeout(1500);
}
async function studyAll(page, id) {
  await fn(page, 'startStudyById', [id]);
  await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
  for (let i = 0; i < 12 && !(await page.locator('#session-done').isVisible()); i++) {
    await page.locator('#flip-card').click(); await page.locator('#rating-buttons.visible').waitFor();
    await page.locator('#rating-buttons .btn-good').click(); await page.waitForTimeout(150);
  }
  await page.waitForTimeout(1000);
}
// Riapertura della materia come la fa lo studente (modifica): nome, testo e carte nel modulo.
async function reopen(page, name) {
  const idx = await page.evaluate((name) => (window._legacyState().decks || []).findIndex(d => (d.name || '').trim().toLowerCase() === name.toLowerCase()), name);
  await fn(page, 'editDeck', [idx]);
  await page.locator('#deck-name').waitFor({ timeout: 10000 });
  await page.waitForTimeout(800);
  return page.evaluate(() => ({
    name: document.getElementById('deck-name').value,
    text: document.getElementById('deck-text').value,
    pairs: document.querySelectorAll('#pairs-container .fc-pair').length,
  }));
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', acceptDownloads: true });
  let aiCalls = 0, pdfMode = 'real', ocrMode = 'real', lastPrompt = '';
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/gemini') {
      aiCalls++;
      try { lastPrompt = r.request().postData() || ''; } catch (_) {}
      return r.fulfill({ status: 200, contentType: 'application/json', body: geminiBody(JSON.stringify({ title: 'Titolo proposto dall’AI', cards: CARDS })) });
    }
    if (u.hostname === 'cdnjs.cloudflare.com' && /pdf\.js/.test(u.pathname)) {
      if (pdfMode === 'hang') return;                 // CDN bloccata: lo script non arriva
      return r.continue();                            // pdf.js vero
    }
    if (/tesseract|tessdata/.test(u.href)) {
      if (ocrMode === 'hang') return;
      return r.continue();                            // Tesseract vero (script, worker, core, lingua)
    }
    if (u.hostname === 'localhost' || (u.hostname === '127.0.0.1' && /^(9099|8189)$/.test(u.port))) return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  page.on('pageerror', e => { if (!/ServiceWorker/.test(e.message)) console.log('[fin] pageerror', e.message.slice(0, 160)); });
  await page.goto(BASE + '/app');
  await ready(page);

  if (SCENARIO === 'pdf' || SCENARIO === 'foto') {
    const toasts = await watchToasts(page);
    const name = SCENARIO === 'pdf' ? 'Biologia PDF' : 'Biologia foto';
    await openCreate(page, name);
    const t0 = Date.now();
    if (SCENARIO === 'pdf') {
      await page.locator('input[type=file][aria-label="Carica qualsiasi file di materiale"]').setInputFiles(path.join(DIR, 'fixture-appunti.pdf'));
      await page.waitForFunction(() => /mitocondri/.test(document.getElementById('deck-text').value), null, { timeout: 60000 }).catch(() => {});
    } else {
      await page.locator('input[type=file][aria-label="Carica foto appunti"]').setInputFiles(path.join(DIR, 'fixture-foto-appunti.png'));
      await page.waitForFunction(() => /mitosi/i.test(document.getElementById('deck-text').value), null, { timeout: 150000 }).catch(() => {});
    }
    const imported = await page.inputValue('#deck-text');
    const want = SCENARIO === 'pdf' ? /mitocondri[\s\S]*Golgi/ : /mitosi/i;
    check(`${SCENARIO}: testo estratto nel campo (${Math.round((Date.now() - t0) / 1000)} s)`, want.test(imported), imported.slice(0, 160));
    await generateAndSave(page);
    check(`${SCENARIO}: l’AI riceve il testo estratto`, SCENARIO === 'pdf' ? /mitocondri/.test(lastPrompt) : /mitosi/i.test(lastPrompt));
    let d = decksNamed(await idb(page, 'guest'), name)[0];
    check(`${SCENARIO}: materia salvata con nome, 3 carte e appunti originali`, d && d.cards.length === 3 && d.text === imported, d && { carte: d.cards.length, testoUguale: d.text === imported });
    await reloadApp(page);
    d = decksNamed(await idb(page, 'guest'), name)[0];
    await studyAll(page, d.id);
    await reloadApp(page);
    d = decksNamed(await idb(page, 'guest'), name)[0];
    check(`${SCENARIO}: progressi del ripasso conservati dopo la ricarica`, d && d.cards.every(c => c.reps > 0), d && d.cards.map(c => c.reps));
    const r = await reopen(page, name);
    check(`${SCENARIO}: riapertura: nome, appunti originali e carte nel modulo`, r.name === name && r.text === imported && r.pairs === 3, { nome: r.name, testoUguale: r.text === imported, carte: r.pairs });
    check(`${SCENARIO}: nessun messaggio d’errore`, !toasts.some(m => /errore|non riuscit/i.test(m)), toasts.slice(-3));
  }

  if (SCENARIO === 'esistente') {
    // Materia già salvata con i suoi appunti; lo studente la riapre, aggiunge altro materiale e genera.
    const A = 'Appunti di Storia già salvati: la Rivoluzione francese inizia nel 1789 con la presa della Bastiglia.';
    const B = 'Materiale aggiunto oggi: nel 1799 Napoleone prende il potere con il colpo di Stato del 18 brumaio.';
    await openCreate(page, 'Storia', A);
    await fn(page, 'saveDeck'); await page.waitForTimeout(1500);
    const r0 = await reopen(page, 'Storia');
    check('esistente: riaperta con i suoi appunti', r0.text === A, r0);
    await page.fill('#deck-text', A + '\n\n' + B);
    await generateAndSave(page);
    const d = decksNamed(await idb(page, 'guest'), 'Storia');
    check('esistente: una sola materia, con le carte nuove', d.length === 1 && d[0].cards.length === 3, d.map(x => x.cards.length));
    check('esistente: appunti precedenti conservati', d[0] && d[0].text.includes(A));
    check('esistente: materiale aggiunto conservato', d[0] && d[0].text.includes(B), d[0] && d[0].text.slice(-80));
  }

  if (SCENARIO === 'lungo' || SCENARIO === 'lungo-account') {
    // Materiale oltre il limite di 300.000 caratteri.
    const unit = 'Paragrafo di prova sul diritto privato: il contratto è l’accordo di due o più parti. ';
    const BIG = (unit.repeat(Math.ceil(350000 / unit.length))).slice(0, 350000) + 'FINE-DEL-MATERIALE';
    let uid = null;
    if (SCENARIO === 'lungo-account') {
      uid = 'lungo' + Date.now().toString(36);
      await page.evaluate((uid) => { const cred = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true })); return firebase.auth().signInWithCredential(cred); }, uid);
      await page.waitForTimeout(7000); await ready(page);
      uid = await page.evaluate(() => window._fbUserId);
    }
    const scope = uid ? 'u:' + uid : 'guest';
    const toasts = await watchToasts(page);
    await openCreate(page, 'Diritto privato', BIG);
    await genBtn(page).click();
    await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 30000 });
    const notice = await page.locator('#pdfai-text-limit').innerText().catch(() => '');
    check('lungo: PRIMA del salvataggio il limite è dichiarato nell’anteprima', /300\.000/.test(notice) && /350\.018|350.018/.test(notice), notice);
    if (process.env.SHOT) { await page.waitForTimeout(1000); await page.screenshot({ path: process.env.SHOT }); }   // facoltativo: immagine dell'avviso
    const saveLabel = await page.locator('#pdfai-save-btn').innerText();
    check('lungo: il pulsante dice che si salvano solo le carte', /solo le carte/i.test(saveLabel), saveLabel);
    let dl = null;
    try {
      const [download] = await Promise.all([page.waitForEvent('download', { timeout: 10000 }), page.locator('#pdfai-text-download').click()]);
      const p = await download.path();
      dl = { name: download.suggestedFilename(), text: fs.readFileSync(p, 'utf8') };
    } catch (e) { dl = { error: String(e).slice(0, 120) }; }
    check('lungo: il materiale completo si può scaricare, identico', dl && dl.text === BIG, dl && { nome: dl.name, lunghezza: dl.text && dl.text.length, errore: dl.error });
    await page.locator('#pdfai-save-btn').click();
    await page.waitForTimeout(2000);
    const d = decksNamed(await idb(page, scope), 'Diritto privato')[0];
    check('lungo: carte salvate', d && d.cards.length === 3, d && d.cards.length);
    check('lungo: la materia segnala che il materiale non è dentro', d && !d.text && d.textOmitted && d.textOmitted.chars === BIG.length, d && { testo: (d.text || '').length, segnale: d.textOmitted });
    check('lungo: dopo il salvataggio un avviso esplicito', toasts.some(m => /300\.000/.test(m)), toasts.slice(-3));
    const r = await reopen(page, 'Diritto privato');
    const hint = await page.locator('#material-input-hint').innerText().catch(() => '');
    check("lungo: riaprendo la materia lo si capisce", /non è stato salvato/i.test(hint), hint);
    if (uid) {
      let cloud = null;
      for (let i = 0; i < 20 && !cloud; i++) {
        await page.waitForTimeout(1000);
        cloud = await page.evaluate(async () => { const s = await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get(); const x = s.docs.map(d => d.data()).find(d => d.name === 'Diritto privato'); return x ? { cards: (x.cards || []).length, text: (x.text || '').length, omitted: x.textOmitted || null } : null; });
      }
      check('lungo-account: la materia arriva sul cloud (emulatore) con le carte', cloud && cloud.cards === 3, cloud);
      check('lungo-account: nessun avviso “troppo grande”', !toasts.some(m => /troppo grande/i.test(m)), toasts.slice(-3));
      // Appena sotto il limite, con lettere accentate (più byte per carattere): il materiale entra e si sincronizza.
      const unitA = 'Perché la libertà contrattuale è limitata? Città, società, proprietà: è così. ';
      const UNDER = (unitA.repeat(Math.ceil(299000 / unitA.length))).slice(0, 299000);
      await openCreate(page, 'Diritto sotto limite', UNDER);
      await genBtn(page).click();
      await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 30000 });
      check('sotto il limite: nessun avviso nell’anteprima', !(await page.locator('#pdfai-text-limit').count()));
      await page.locator('#pdfai-save-btn').click();
      await page.waitForTimeout(2000);
      let under = null;
      for (let i = 0; i < 25 && !(under && under.text === UNDER.length); i++) {
        await page.waitForTimeout(1000);
        under = await page.evaluate(async () => { const s = await firebase.firestore().collection('users').doc(window._fbUserId).collection('decks').get(); const x = s.docs.map(d => d.data()).find(d => d.name === 'Diritto sotto limite'); return x ? { cards: (x.cards || []).length, text: (x.text || '').length } : null; });
      }
      check('sotto il limite: materiale e carte sul cloud (emulatore)', under && under.cards === 3 && under.text === UNDER.length, under);
      check('nessun errore di sincronizzazione', !toasts.some(m => /troppo grande|sincronizz.*non riuscit|errore/i.test(m)), toasts.slice(-3));
    }
  }

  if (SCENARIO === 'pdfblocco') {
    // pdf.js dalla CDN non arriva: errore entro un tempo limitato; la riprova lo carica davvero.
    pdfMode = 'hang';
    await reloadApp(page);           // anche il precaricamento dopo il load resta bloccato
    const toasts = await watchToasts(page);
    await openCreate(page, 'Biologia blocco');
    const input = page.locator('input[type=file][aria-label="Carica qualsiasi file di materiale"]');
    const t0 = Date.now();
    await input.setInputFiles(path.join(DIR, 'fixture-appunti.pdf'));
    // L'errore del file appare nella riga di stato sotto i pulsanti di caricamento (non come avviso a comparsa).
    let status = '';
    for (let i = 0; i < 70 && !/Errore/.test(status); i++) { await page.waitForTimeout(1000); status = await page.locator('#pdf-status-text').innerText().catch(() => ''); }
    const waited = Math.round((Date.now() - t0) / 1000);
    check('pdf bloccato: l’attesa finisce con un messaggio chiaro', /PDF/.test(status) && /riprova/i.test(status) && waited <= 70, { secondi: waited, stato: status });
    check('pdf bloccato: nessun testo inventato nel campo', (await page.inputValue('#deck-text')) === '');
    pdfMode = 'real';
    await input.setInputFiles([]);
    await input.setInputFiles(path.join(DIR, 'fixture-appunti.pdf'));
    await page.waitForFunction(() => /mitocondri/.test(document.getElementById('deck-text').value), null, { timeout: 60000 }).catch(() => {});
    check('pdf: la riprova carica pdf.js e il testo arriva', /mitocondri/.test(await page.inputValue('#deck-text')));
  }

  await browser.close();
  const failed = results.filter(x => !x).length;
  console.log(JSON.stringify({ scenario: SCENARIO, passed: results.length - failed, failed }));
  process.exit(failed ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
