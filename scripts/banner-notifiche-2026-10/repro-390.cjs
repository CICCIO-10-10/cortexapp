// Verifica 16/10/2026: alla PRIMA visita, a 390 px, il banner "Attiva le notifiche" (.notif-banner)
// copre il ripasso di un mazzo normale (non TOLC) e intercetta i tocchi?
// Ospite, AI SIMULATA (/api/gemini intercettato), Firebase su emulatori locali, rete esterna bloccata.
// Avvio: npx vite --port 5173 + scripts/verifica-flusso-tolc-2026-10/avvia-emulatori.sh
// Uso: NODE_PATH=<playwright> CHROMIUM=<chrome> node scripts/banner-notifiche-2026-10/repro-390.cjs
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
const W = Number(process.env.W || 390), H = Number(process.env.H || 844);
const results = [];
const check = (name, ok, detail) => { results.push(!!ok); console.log('[banner]', ok ? 'OK  ' : 'FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); };
const CARDS = [
  { front: 'Che cos’è la fotosintesi?', back: 'Trasformazione di energia luminosa in energia chimica.' },
  { front: 'Dove avviene?', back: 'Nei cloroplasti.' },
  { front: 'Che cosa si fissa nel ciclo di Calvin?', back: 'La CO2.' },
];
const NOTES = 'La fotosintesi trasforma energia luminosa in energia chimica nei cloroplasti; nel ciclo di Calvin si fissa la CO2.';

function initScript() {
  try {
    if (!sessionStorage.getItem('__b_init')) {
      sessionStorage.setItem('__b_init', '1');
      // prima visita: mm_notif_asked NON impostato, quindi il banner viene creato
      ['cortex_onboarding_done', 'cortex_onboarded', 'cortex_guest', 'cortex_demo_seen'].forEach(k => localStorage.setItem(k, '1'));
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
async function fn(page, name, params) {
  await page.evaluate(([name, params]) => {
    const b = document.createElement('button'); b.setAttribute('data-fn', name);
    if (params) b.setAttribute('data-params', JSON.stringify(params));
    document.body.appendChild(b); b.click(); b.remove();
  }, [name, params]);
}
// Che cosa riceve davvero un tocco al centro dell'elemento?
async function hit(page, sel) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel); if (!el) return { missing: true };
    const r = el.getBoundingClientRect(); const x = r.left + r.width / 2, y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const banner = top && top.closest('.notif-banner');
    return { ok: !!(top && (top === el || el.contains(top))), banner: !!banner, top: top ? (top.id || top.className || top.tagName) : null, y: Math.round(y) };
  }, sel);
}
async function bannerBox(page) {
  return page.evaluate(() => {
    const b = document.querySelector('.notif-banner'); if (!b) return null;
    const cs = getComputedStyle(b); const r = b.getBoundingClientRect();
    return { visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.height > 0, top: Math.round(r.top), bottom: Math.round(r.bottom) };
  });
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM, args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
  await ctx.route('**/*', async (r) => {
    const u = new URL(r.request().url());
    if (u.pathname === '/api/gemini') return r.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ title: 'x', cards: CARDS }) }] } }] }) });
    if (u.hostname === 'localhost' || (u.hostname === '127.0.0.1' && /^(9099|8189)$/.test(u.port))) return r.continue();
    return r.abort();
  });
  await ctx.addInitScript(initScript);
  const page = await ctx.newPage();
  await page.goto(BASE + '/app');
  await page.waitForFunction(() => window.__cxModulesReady && !window.__cxScopeSwitching, null, { timeout: 30000 });
  await page.waitForTimeout(1500);
  const b0 = await bannerBox(page);
  check('prima visita: banner notifiche presente', b0 && b0.visible, b0);

  // creazione → salvataggio (senza ricaricare: il banner resta quello della prima visita)
  await fn(page, 'showView', ['CreateDeckView']);
  await page.locator('#deck-name').waitFor({ timeout: 10000 });
  await page.fill('#deck-name', 'Biologia'); await page.fill('#deck-text', NOTES);
  await page.locator('[data-fn="openPdfAIFromText"]').first().click();
  await page.locator('#pdfai-save-btn').waitFor({ state: 'visible', timeout: 20000 });
  await page.locator('#pdfai-save-btn').click();
  await page.waitForTimeout(1500);
  const deckId = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('cortex_db', 1);
    r.onsuccess = () => { const g = r.result.transaction('decks', 'readonly').objectStore('decks').get('guest'); g.onsuccess = () => { const d = (g.result || []).find(x => x.name === 'Biologia'); res(d && d.id); }; };
  }));
  check('mazzo normale salvato', !!deckId, deckId);
  // dopo il primo salvataggio l'ospite vede la proposta di account: la chiude come farebbe una persona
  if (await page.locator('#gsm-later').count()) await page.locator('#gsm-later').click();
  await page.waitForTimeout(300);

  // ripasso di un mazzo normale
  await fn(page, 'startStudyById', [deckId]);
  await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
  await page.waitForTimeout(500);
  const b1 = await bannerBox(page);
  const flip = await hit(page, '#flip-card');
  check('ripasso: la carta riceve il tocco (non il banner)', flip.ok && !flip.banner, { flip, banner: b1 });
  check('ripasso: il banner notifiche non è visibile sopra lo studio', !(b1 && b1.visible), b1);
  await page.locator('#flip-card').tap().catch(async () => page.locator('#flip-card').click({ force: true }));
  await page.locator('#rating-buttons.visible').waitFor({ timeout: 5000 }).catch(() => {});
  const rates = {};
  for (const s of ['.btn-fail', '.btn-hard', '.btn-good']) rates[s] = await hit(page, '#rating-buttons ' + s);
  const covered = Object.entries(rates).filter(([, v]) => !v.missing && (!v.ok || v.banner)).map(([k]) => k);
  check('ripasso: tutti i pulsanti di valutazione ricevono il tocco', covered.length === 0, { coperti: covered, banner: await bannerBox(page), rates });

  // un tocco reale su "Bene" valuta la carta?
  const g = await page.locator('#rating-buttons .btn-good').boundingBox();
  if (g) await page.touchscreen.tap(g.x + g.width / 2, g.y + g.height / 2);
  await page.waitForTimeout(800);
  const rated = await page.evaluate(() => new Promise((res) => {
    const r = indexedDB.open('cortex_db', 1);
    r.onsuccess = () => { const q = r.result.transaction('decks', 'readonly').objectStore('decks').get('guest'); q.onsuccess = () => { const d = (q.result || []).find(x => x.name === 'Biologia'); res(d ? d.cards.filter(c => c.reps > 0).length : -1); }; };
  }));
  check('tocco reale su "La sapevo": la carta viene valutata (salvata)', rated === 1, rated);

  // chiusura del ripasso: il banner torna disponibile (la scelta non va persa)
  for (let i = 0; i < 6 && !(await page.locator('#session-done').isVisible()); i++) {
    await page.locator('#flip-card').click({ force: true }); await page.locator('#rating-buttons.visible').waitFor({ timeout: 3000 }).catch(() => {});
    await page.locator('#rating-buttons .btn-good').click({ force: true }).catch(() => {}); await page.waitForTimeout(200);
  }
  await page.evaluate(() => { const c = document.querySelector('[data-fn="closeStudy"], #close-study, .study-close'); if (c) c.click(); });
  await page.waitForTimeout(800);
  const b2 = await bannerBox(page);
  check('dopo il ripasso: il banner notifiche è di nuovo visibile (scelta non persa)', b2 && b2.visible, b2);
  console.log(JSON.stringify({ viewport: W + 'x' + H, passed: results.filter(Boolean).length, failed: results.filter(x => !x).length }));
  await browser.close();
  process.exit(results.every(Boolean) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(2); });
