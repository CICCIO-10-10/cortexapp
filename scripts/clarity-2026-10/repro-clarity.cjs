// Prove nel browser (04/10/2026) per i rilievi Clarity. Nessun contatto con la produzione:
// backend Google bloccati; per i casi con account si usano gli emulatori Auth/Firestore
// (progetto demo-cortex-security) e /api/gemini è simulato in pagina.
// Uso: NODE_PATH=<playwright> node scripts/clarity-2026-10/repro-clarity.cjs [tolc_pause|ai|non_ora|ripassa_ora]
const { chromium } = require('playwright');
const path = require('path');
const { summarizeJourneys } = require(path.join(__dirname, '../../functions/journey-summary.cjs'));
const BASE = process.env.BASE || 'http://localhost:4173';
const EXE = process.env.CHROMIUM || '/opt/pw-browsers/chromium';
const UA = { android: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36',
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.6 Mobile/15E148 Safari/604.1' };
const BLOCK = /firestore\.googleapis\.com|identitytoolkit\.googleapis\.com|securetoken\.googleapis\.com|cloudfunctions\.net|firebaseinstallations|google-analytics\.com|googletagmanager\.com|clarity\.ms|accounts\.google\.com|apis\.google\.com|fcmregistrations/;

async function newCtx(browser, { ua = 'android', emulator = false, gemini = null } = {}) {
  const ctx = await browser.newContext(ua === 'desktop' ? { viewport: { width: 1280, height: 800 } } : { userAgent: UA[ua], viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  await ctx.route('**/*', async r => {
    const u = new URL(r.request().url());
    if (u.hostname === '127.0.0.1' && /^(9099|8189)$/.test(u.port)) return r.continue();
    if (u.pathname === '/api/gemini' && gemini) return gemini(r);
    if (u.pathname === '/api/telemetry') return r.abort();
    return BLOCK.test(u.hostname + u.pathname) ? r.abort() : r.continue();
  });
  await ctx.addInitScript(({ emulator }) => {
    try {
      if (!sessionStorage.getItem('__init')) {
        sessionStorage.setItem('__init', '1');
        if (!localStorage.getItem('cortex_cookie_consent')) localStorage.setItem('cortex_cookie_consent', 'accepted');
        if (emulator) { localStorage.setItem('fb_project_id', 'demo-cortex-security'); localStorage.setItem('fb_api_key', 'demo-key'); localStorage.setItem('fb_auth_domain', 'localhost'); }
      }
    } catch (_) {}
    window.__ev = [];
    window.__cxSendTelemetry = function (e) { try { window.__ev.push({ type: e.type, meta: e.meta || {}, ts: Date.now() }); console.log('TEL ' + JSON.stringify({ type: e.type, meta: e.meta || {}, ts: Date.now() })); } catch (_) {} return Promise.resolve(); };
    if (emulator) {
      let fb;
      Object.defineProperty(window, 'firebase', { configurable: true, get() { return fb; }, set(v) {
        fb = v;
        if (v && v.initializeApp && !v.__w) { v.__w = true; const o = v.initializeApp.bind(v); v.initializeApp = function (c, n) { const a = o(Object.assign({}, c, { projectId: 'demo-cortex-security', apiKey: 'demo-key', authDomain: 'localhost' }), n); try { a.auth().useEmulator('http://127.0.0.1:9099', { disableWarnings: true }); } catch (_) {} try { a.firestore().useEmulator('127.0.0.1', 8189); } catch (_) {} return a; }; }
      } });
    }
  }, { emulator });
  const page = await ctx.newPage();
  const out = { events: [], errors: [], toasts: [], notes: [] };
  const _push = out.notes.push.bind(out.notes);
  out.notes.push = (...a) => { if (process.env.VERBOSE) a.forEach(x => console.log('  · ' + x)); return _push(...a); };
  page.on('console', m => { const t = m.text(); if (t.startsWith('TEL ')) { const e = JSON.parse(t.slice(4)); if (!/^(heartbeat|leave|session_start|session_resume)$/.test(e.type)) out.events.push(e); } });
  page.on('pageerror', e => out.errors.push(e.message.slice(0, 200)));
  page.on('dialog', d => d.accept());   // conferma privacy della generazione AI
  await page.exposeFunction('__toast', t => out.toasts.push(t));
  await page.addInitScript(() => { const iv = setInterval(() => { if (typeof window.showToast === 'function' && !window.showToast.__w) { const o = window.showToast; window.showToast = function (m, ty) { try { window.__toast(String(m).slice(0, 160)); } catch (_) {} return o.apply(this, arguments); }; window.showToast.__w = true; } }, 50); setTimeout(() => clearInterval(iv), 20000); });
  return { ctx, page, out };
}

async function answerAndFinish(page, n = 5) {
  for (let i = 0; i < n; i++) { await page.evaluate(() => { const o = document.querySelectorAll('#tolc-sim-overlay .tolc-opt'); if (o[1]) o[1].click(); const x = document.getElementById('tolc-next'); if (x) x.click(); }); await page.waitForTimeout(40); }
  for (let k = 0; k < 90; k++) { const c = await page.$('#tolc-consegna'); if (c) { await c.click(); break; } await page.evaluate(() => { const x = document.getElementById('tolc-next'); if (x) x.click(); }); await page.waitForTimeout(10); }
  await page.waitForTimeout(300);
}
async function setHidden(page, hidden) {
  await page.evaluate(h => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, hidden);
}

const scenarios = {
  // Prova obbligatoria: avvio → cambio scheda → ritorno → consegna = 1 tentativo completato, nessun abbandono.
  async tolc_pause(browser, ua) {
    const { page, out } = await newCtx(browser, { ua });
    await page.goto(BASE + '/app?sim=tolc-i', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    await page.evaluate(() => { const o = document.querySelectorAll('#tolc-sim-overlay .tolc-opt'); if (o[1]) o[1].click(); });
    await setHidden(page, true); await page.waitForTimeout(200); await setHidden(page, false);
    await setHidden(page, true); await page.waitForTimeout(100); await setHidden(page, false);
    await answerAndFinish(page, 4);
    const tolc = out.events.filter(e => /^tolc_/.test(e.type));
    out.notes.push('eventi TOLC: ' + tolc.map(e => e.type + (e.meta.attempt ? '' : '(SENZA id)')).join(', '));
    const s = summarizeJourneys(tolc.map(e => ({ vid: 'v', type: e.type, ts: e.ts, meta: e.meta })), {}, Date.now());
    out.notes.push('tentativi: ' + JSON.stringify({ total: s.v3.attempts.total, completed: s.v3.attempts.completed, abandoned: s.v3.attempts.abandoned, hidden_then_completed: s.v3.attempts.hidden_then_completed }));
    out.ok = s.v3.attempts.total === 1 && s.v3.attempts.completed === 1 && s.v3.attempts.abandoned === 0 && !tolc.some(e => e.type === 'tolc_test_quit');
    return out;
  },
  // Generazione AI con account (emulatore), percorso di e7z8b1: "Spiegami gli errori con l'AI" → accesso →
  // ripresa automatica (deckCreate.autoGenerateFlashcards). /api/gemini simulato: lento ma riuscito (27 s,
  // prima oltre il limite di 25 s), errore 500, risposta non valida; poi nuovo tentativo dal pulsante.
  async ai(browser, ua) {
    let mode = 'slow_ok', calls = 0;
    const deckJson = JSON.stringify({ summary: 'Riassunto', flashcards: [{ q: 'Che cos\'è un generatore?', a: 'Una macchina' }, { q: 'Legge di Ohm?', a: 'V = R·I' }] });
    const textJson = JSON.stringify({ title: 'Elettrotecnica', cards: [{ front: 'Generatore?', back: 'Macchina' }, { front: 'Ohm?', back: 'V=RI' }] });
    const gemini = async r => {
      calls++;
      const body = JSON.parse(r.request().postData() || '{}');
      const isDeckPath = JSON.stringify(body).includes('Rispondi ESCLUSIVAMENTE in formato JSON');
      const okText = isDeckPath ? deckJson : textJson;
      if (mode === 'slow_ok') { await new Promise(res => setTimeout(res, 27000)); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: okText }] } }] }) }); }
      if (mode === 'fail') return r.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ error: 'Errore AI', details: 'Il servizio AI non ha risposto. Non ti è stato scalato nulla: riprova.' }) });
      if (mode === 'invalid') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"summary":"tronc' }] } }] }) });
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ candidates: [{ content: { parts: [{ text: okText }] } }] }) });
    };
    const { page, out } = await newCtx(browser, { ua, emulator: true, gemini });
    await page.goto(BASE + '/app', { waitUntil: 'load' }); await page.waitForTimeout(2500);
    const uid = 'ai' + Date.now().toString(36);
    await page.evaluate(async uid => { const c = firebase.auth.GoogleAuthProvider.credential(JSON.stringify({ sub: uid, email: uid + '@example.com', email_verified: true })); await firebase.auth().signInWithCredential(c); }, uid);
    await page.waitForTimeout(4500);
    await page.evaluate(() => { const o = document.getElementById('onboarding-overlay'); if (o && o.style.display === 'flex') document.querySelector('#onboarding-overlay [data-fn=closeOnboarding]').click(); });
    const state = () => page.evaluate(() => ({ generating: !!window.__cxAiGenerating, saveDisabled: Array.from(document.querySelectorAll('[data-fn="saveDeck"]')).every(b => b.disabled), pairs: document.querySelectorAll('#pairs-container > *').length, testo: (document.getElementById('deck-text') || {}).value ? 'presente' : 'vuoto', materie: (window._legacyState().decks || []).length }));
    const toastText = () => page.evaluate(() => Array.from(document.querySelectorAll('.toast, [class*="toast"]')).map(t => t.textContent.trim()).filter(Boolean).slice(-1)[0] || '');
    const resume = () => page.evaluate(() => { localStorage.setItem('cortex_pending_ai', JSON.stringify({ text: 'Argomenti che ho SBAGLIATO nella simulazione TOLC-I. Il generatore è una macchina elettrica; la legge di Ohm lega tensione e corrente.', instructions: 'Spiega il concetto corretto', ts: Date.now(), source: 'tolc_errors' })); return window.__resumePendingAI(); });
    // 1) risposta lenta (27 s) ma valida
    const p1 = resume(); await page.waitForTimeout(3000);
    out.notes.push('durante la generazione (3 s): ' + JSON.stringify(await state()));
    await page.evaluate(() => { const b = document.querySelector('[data-fn="saveDeck"]'); if (b) { b.disabled = false; b.click(); } });   // anche forzando il clic su "Salva Materia"
    await page.waitForTimeout(500);
    out.notes.push('dopo clic su "Salva Materia" durante la generazione: ' + JSON.stringify(await state()) + ' · ' + await toastText());
    await p1; await page.waitForTimeout(800);
    out.notes.push('risposta a 27 s: ' + JSON.stringify(await state()) + ' · ' + await toastText());
    // 2) errore 500 → messaggio chiaro, testo conservato
    mode = 'fail'; await resume(); await page.waitForTimeout(800);
    out.notes.push('errore 500: ' + JSON.stringify(await state()) + ' · ' + await toastText());
    // 3) risposta non valida → non più silenziosa
    mode = 'invalid'; await resume(); await page.waitForTimeout(800);
    out.notes.push('risposta non valida: ' + JSON.stringify(await state()) + ' · ' + await toastText());
    // 4) nuovo tentativo dal pulsante "Genera Flashcard con IA" (percorso testo) e salvataggio unico
    mode = 'ok';
    const before = (await state()).materie;
    await page.evaluate(() => document.getElementById('btn-generate-ai').click()); await page.waitForTimeout(1500);
    const shown = await page.evaluate(() => document.querySelectorAll('#pdfai-cards-list [data-card], #pdfai-cards-list .pdfai-card, #pdfai-cards-list > div').length);
    await page.evaluate(() => { const b = document.getElementById('pdfai-save-btn'); if (b) { b.click(); b.click(); } });
    await page.waitForTimeout(1500);
    out.notes.push('nuovo tentativo: carte in anteprima=' + shown + ', materie ' + before + ' → ' + (await state()).materie + ', chiamate AI totali=' + calls);
    out.notes.push('eventi: ' + out.events.filter(e => /generation|cards_generated|cards_saved|tolc_error_cards/.test(e.type)).map(e => e.type + (e.meta.reason ? ':' + e.meta.reason : '') + (e.meta.flow ? '@' + e.meta.flow : '')).join(', '));
    return out;
  },
  // "Non ora" sul riquadro di accesso AI: chiude e non ricompare da solo nella stessa sessione.
  async non_ora(browser, ua) {
    const { page, out } = await newCtx(browser, { ua });
    await page.goto(BASE + '/app?guest=1', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    await page.evaluate(() => localStorage.setItem('cortex_pending_ai', JSON.stringify({ text: 'Argomenti sbagliati…', ts: Date.now(), source: 'tolc_errors', authRequired: true })));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);
    out.notes.push('riquadro mostrato: ' + !!(await page.$('#guest-login-gate')));
    for (let i = 0; i < 3; i++) { const b = await page.$('#glg-dismiss'); if (b) await b.click(); await page.waitForTimeout(300); }
    out.notes.push('dopo "Non ora": ' + !!(await page.$('#guest-login-gate')) + ', richiesta in sospeso: ' + await page.evaluate(() => !!localStorage.getItem('cortex_pending_ai')));
    await page.evaluate(() => localStorage.setItem('cortex_pending_ai', JSON.stringify({ text: 'x', ts: Date.now(), source: 'tolc_errors' })));
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(2500);
    out.notes.push('dopo ricarica nella stessa sessione: ' + !!(await page.$('#guest-login-gate')));
    out.notes.push('eventi: ' + out.events.filter(e => /guest_/.test(e.type)).map(e => e.type).join(', '));
    return out;
  },
  // "Ripassa ora": con carte da ripassare apre lo studio; senza, spiega perché e lo misura.
  async ripassa_ora(browser, ua) {
    const { page, out } = await newCtx(browser, { ua });
    await page.goto(BASE + '/app?guest=1', { waitUntil: 'load' }); await page.waitForTimeout(2000);
    await page.evaluate(() => {
      const d = new Date(); const today = d.toISOString().slice(0, 10); const tomorrow = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 10);
      const st = window._legacyState();
      st.decks.push({ id: 'dueDeck', name: 'Da ripassare', cards: [{ id: 'c1', q: 'Q1', a: 'A1', nextReview: today }, { id: 'c2', q: 'Q2', a: 'A2', nextReview: today }] });
      st.decks.push({ id: 'futureDeck', name: 'Già ripassato', cards: [{ id: 'c3', q: 'Q3', a: 'A3', nextReview: tomorrow }], dueCount: 5 });   // conteggio vecchio
      if (window.refreshDueCounts) window.refreshDueCounts(); window.showPage('home');
    });
    await page.waitForTimeout(800);
    await page.evaluate(() => { const b = document.querySelector('[data-fn="startStudyById"][data-params=\'["dueDeck"]\']'); if (b) b.click(); });
    await page.waitForTimeout(800);
    out.notes.push('"Ripassa ora" con carte: studio aperto = ' + await page.evaluate(() => document.getElementById('study-overlay').classList.contains('active')));
    await page.evaluate(() => { const c = document.querySelector('[data-fn="closeStudy"]'); if (c) c.click(); });
    await page.waitForTimeout(300);
    await page.evaluate(() => { window.showPage('home'); });
    await page.waitForTimeout(500);
    out.notes.push('etichetta del mazzo senza carte da ripassare: ' + await page.evaluate(() => { const b = document.querySelector('[data-fn="startStudyById"][data-params=\'["futureDeck"]\']'); return b ? b.textContent.trim() : 'non in elenco'; }));
    await page.evaluate(() => { const b = document.querySelector('[data-fn="startStudyById"][data-params=\'["futureDeck"]\']'); if (b) b.click(); });
    await page.waitForTimeout(800);
    out.notes.push('mazzo senza carte da ripassare: studio aperto = ' + await page.evaluate(() => document.getElementById('study-overlay').classList.contains('active')) + ', messaggio: ' + (out.toasts.slice(-1)[0] || ''));
    out.notes.push('eventi: ' + out.events.filter(e => /study_start|study_session_start/.test(e.type)).map(e => e.type + (e.meta.reason ? ':' + e.meta.reason : '')).join(', '));
    return out;
  },
};

(async () => {
  const browser = await chromium.launch({ executablePath: EXE, args: ['--no-sandbox'] });
  const list = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(scenarios);
  for (const name of list) {
    const [s, ua = 'android'] = name.split(':');
    const r = await scenarios[s](browser, ua);
    console.log('\n===== ' + name + ' =====');
    console.log(JSON.stringify({ ok: r.ok, errors: r.errors, notes: r.notes }, null, 1));
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
