// Revisione PR #2 (16/10/2026): un ospite con accesso ANONIMO (quello usato per l'AI) completa un ripasso.
// Firebase emulato (Auth 9099 + Firestore 8189, progetto demo, regole del repository:
// scripts/verifica-flusso-tolc-2026-10/avvia-emulatori.sh). Rete esterna bloccata, dati sintetici.
// Domanda: nasce users/{uid anonimo}.activation, che la dashboard conterebbe tra gli utenti attivati?
// Avvio: npx vite --port 5173 ; Uso: NODE_PATH=<playwright> node scripts/revisione-pr2-2026-10/attivazione-anonimo-emulatori.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
function initScript() {
  try {
    if (!sessionStorage.getItem('__a_init')) {
      sessionStorage.setItem('__a_init', '1');
      ['cortex_guest', 'cortex_demo_seen', 'cortex_onboarding_done', 'cortex_onboarded'].forEach(k => localStorage.setItem(k, '1'));
      localStorage.setItem('cortex_cookie_consent', 'declined');
      localStorage.setItem('fb_project_id', 'demo-cortex-security'); localStorage.setItem('fb_api_key', 'demo-key'); localStorage.setItem('fb_auth_domain', 'localhost');
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
(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx.route('**/*', r => { const u = new URL(r.request().url()); return (u.hostname === 'localhost' || (u.hostname === '127.0.0.1' && /^(9099|8189)$/.test(u.port))) ? r.continue() : r.abort(); });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  // come fa "Genera Flashcard con IA" per l'ospite
  const uid = await page.evaluate(async () => (await firebase.auth().signInAnonymously()).user.uid);
  await page.waitForTimeout(2000);
  // mazzo sintetico e ripasso completo
  await page.evaluate(() => {
    const s = window._legacyState();
    const d = new Date(); const today = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    s.decks.push({ id: 'deck_sintetico', name: 'Prova', cards: [1, 2].map(i => ({ id: 'c' + i, q: 'Domanda ' + i, a: 'Risposta ' + i, nextReview: today, interval: 1, ease: 2.5, reps: 0 })) });
    const b = document.createElement('button'); b.setAttribute('data-fn', 'startStudyById'); b.setAttribute('data-params', '["deck_sintetico"]'); document.body.appendChild(b); b.click(); b.remove();
  });
  await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
  // Il banner "Attiva le notifiche" (prima visita, 390 px) copre la carta: tolto qui, segnalato nel rapporto.
  await page.evaluate(() => document.querySelectorAll('.notif-banner').forEach(b => b.remove()));
  for (let i = 0; i < 5 && !(await page.locator('#session-done').isVisible()); i++) {
    await page.locator('#flip-card').click(); await page.locator('#rating-buttons.visible').waitFor();
    await page.locator('#rating-buttons .btn-good').click(); await page.waitForTimeout(300);
  }
  await page.waitForTimeout(3000);
  const full = await page.evaluate(async (uid) => { const s = await firebase.firestore().collection("users").doc(uid).get(); return s.exists ? s.data() : null; }, uid);
  const doc = full ? (full.activation || {}) : null;
  const counted = !!(doc && (doc.activated || doc.firstReviewCompletedAt));
  console.log(JSON.stringify({ anonimo: true, documento: doc ? Object.keys(doc).sort() : null, contato_come_attivato: counted }));
  console.log(counted ? 'FAIL l\'ospite anonimo risulta tra gli utenti attivati' : 'OK nessuna attivazione per l\'ospite anonimo');
  await browser.close();
  process.exit(counted ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
