// Verifica 14/10/2026 nel browser del flusso TOLC → mazzo errori → ripasso → salvataggio → riapertura.
// Tutta la rete esterna è bloccata: niente backend Firebase, niente AI, niente account reali (si prova da ospite).
// Avvio: npx vite --port 5173   (oppure npm run build && npx vite preview e BASE=http://localhost:4173)
// Uso:   NODE_PATH=<cartella con playwright> node scripts/verifica-flusso-tolc-2026-10/browser.cjs <scenario>
// Scenari: main | noerrors | idbfail | loginredirect | dblconsegna | scope
const { chromium } = require('playwright');
const BASE = process.env.BASE || 'http://localhost:5173';
const SCENARIO = process.argv[2] || 'main';

const log = (...a) => console.log('[e2e]', ...a);
const results = [];
const check = (name, ok, detail) => { results.push({ name, ok: !!ok, detail }); log(ok ? 'OK  ' : 'FAIL', name, detail !== undefined ? JSON.stringify(detail) : ''); };

async function idbDecks(page, scope = 'guest') {
  return page.evaluate((scope) => new Promise((res) => {
    const r = indexedDB.open('cortex_db', 1);
    r.onsuccess = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('decks')) return res(null);
      const g = db.transaction('decks', 'readonly').objectStore('decks').get(scope);
      g.onsuccess = () => { res(g.result || null); db.close(); };
      g.onerror = () => res(null);
    };
    r.onerror = () => res(null);
  }), scope);
}

// Apre lo studio come fa l'app: pulsante con data-fn (delegazione eventi del registro).
async function studyById(page, id) {
  await page.evaluate((id) => {
    const b = document.createElement('button');
    b.setAttribute('data-fn', 'startStudyById');
    b.setAttribute('data-params', JSON.stringify([id]));
    document.body.appendChild(b); b.click(); b.remove();
  }, id);
}

async function newPage(ctx) {
  const page = await ctx.newPage();
  page.on('pageerror', e => log('pageerror:', e.message));
  page.on('console', m => { if (m.type() === 'error' && !/ERR_FAILED|Could not reach Cloud Firestore/.test(m.text())) log('console.error:', m.text().slice(0, 200)); });
  return page;
}

async function answerAll(page, pick) {
  // Risponde a tutte le domande con l'indice scelto da pick(i), poi consegna.
  for (let i = 0; i < 200; i++) {
    const ov = page.locator('#tolc-sim-overlay');
    if (await ov.locator('#tolc-consegna').count()) break;
    const opts = ov.locator('.tolc-opt');
    await opts.first().waitFor({ timeout: 15000 });
    const n = await opts.count();
    const idx = pick(i, n);
    if (idx !== null) await opts.nth(Math.min(idx, n - 1)).click();
    if (await ov.locator('#tolc-next').count()) await ov.locator('#tolc-next').click();
    else if (await ov.locator('#tolc-skip').count()) await ov.locator('#tolc-skip').click();
  }
}

async function startQuick(page) {
  await page.goto(BASE + '/app.html?sim=tolc-i&veloce=1');
  await page.locator('#tolc-sim-overlay .tolc-opt').first().waitFor({ timeout: 30000 });
}

(async () => {
  const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const external = new Set();
  await ctx.route('**/*', (route) => {
    const u = new URL(route.request().url());
    if (u.hostname === 'localhost' || u.hostname === '127.0.0.1') return route.continue();
    external.add(u.hostname);
    return route.abort();
  });
  // Rende i click deterministici: nessuna demo/onboarding/consenso sopra il simulatore.
  await ctx.addInitScript(() => {
    try {
      if (!sessionStorage.getItem('__e2e_init')) {
        sessionStorage.setItem('__e2e_init', '1');
        localStorage.setItem('cortex_cookie_consent', 'rejected');
        localStorage.setItem('cortex_onboarding_done', '1');
      }
    } catch (_) {}
  });

  const page = await newPage(ctx);

  if (SCENARIO === 'main') {
    // 1) simulazione completata con errori (risposta 0 sempre → alcune sbagliate) + una in bianco
    await startQuick(page);
    await answerAll(page, (i) => (i === 1 ? null : 0));
    await page.locator('#tolc-consegna').click();
    await page.locator('#tolc-sim-overlay').getByText(/Ripassa|Nessun errore/).first().waitFor();
    const hasGen = await page.locator('#tolc-gen-errors').count();
    const genText = hasGen ? await page.locator('#tolc-gen-errors').innerText() : '';
    const nWrong = hasGen ? (genText.match(/(\d+)/) ? +genText.match(/(\d+)/)[1] : 1) : 0;
    check('risultato mostra il pulsante del ripasso quando ci sono errori', hasGen > 0, genText);

    // 2) doppio clic su "Ripassa i tuoi errori"
    await page.locator('#tolc-gen-errors').dblclick();
    await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
    await page.waitForTimeout(800);
    let decks = await idbDecks(page);
    const errDecks = (decks || []).filter(d => d.source === 'tolc_errors_local');
    check('doppio clic: un solo mazzo errori salvato su IndexedDB', errDecks.length === 1, errDecks.length);
    check('carte = risposte sbagliate (in bianco escluse)', errDecks[0] && errDecks[0].cards.length === nWrong, { cards: errDecks[0] && errDecks[0].cards.length, nWrong });
    check('ogni carta ha domanda, risposta corretta e risposta scelta', errDecks[0] && errDecks[0].cards.every(c => c.q && /^[A-E]\) /.test(c.a) && /Avevi scelto [A-E]\)/.test(c.a)));
    const deckId = errDecks[0] && errDecks[0].id;

    // 3) ripasso: valuta la prima carta, ricarica a metà sessione
    await page.locator('#flip-card').click();
    await page.locator('#rating-buttons.visible').waitFor();
    await page.locator('#rating-buttons [data-params="[2]"]').click();
    await page.waitForTimeout(800);
    decks = await idbDecks(page);
    let d = (decks || []).find(x => x.id === deckId);
    const rated = d && d.cards.filter(c => c.reps > 0).length;
    check('valutazione salvata subito su IndexedDB', rated === 1, rated);

    await page.reload();
    await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    decks = await idbDecks(page);
    d = (decks || []).find(x => x.id === deckId);
    check('dopo il refresh il mazzo e la carta valutata ci sono ancora', d && d.cards.filter(c => c.reps > 0).length === 1);
    const visible = await page.evaluate((name) => document.body.innerText.includes(name), d && d.name);
    check('dopo il refresh il mazzo compare nella lista', visible, d && d.name);

    // 4) riapertura e completamento del ripasso (solo le carte ancora da fare)
    await studyById(page, deckId);
    await page.locator('#study-overlay.active').waitFor({ timeout: 10000 });
    for (let i = 0; i < 50; i++) {
      if (await page.locator('#session-done').isVisible()) break;
      await page.locator('#flip-card').click();
      await page.locator('#rating-buttons.visible').waitFor();
      await page.locator('#rating-buttons [data-params="[2]"]').click();
      await page.waitForTimeout(150);
    }
    check('sessione arrivata in fondo', await page.locator('#session-done').isVisible());
    await page.waitForTimeout(800);
    decks = await idbDecks(page);
    d = (decks || []).find(x => x.id === deckId);
    const today = await page.evaluate(() => { const x = new Date(); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); });
    check('tutte le carte valutate e riprogrammate dopo oggi', d && d.cards.every(c => c.reps > 0 && String(c.nextReview).slice(0, 10) > today), d && d.cards.map(c => [c.reps, c.nextReview]));
    await page.locator('#session-done [data-fn="closeStudy"]').click();
    await page.waitForTimeout(3500);
    const promptShown = await page.locator('#tolc-save-prompt').count();
    log('proposta di salvataggio visibile dopo la chiusura (senza SDK Firebase atteso: no):', promptShown);

    // 5) chiusura e riapertura (nuova pagina, stesso profilo)
    await page.close();
    const page2 = await newPage(ctx);
    await page2.goto(BASE + '/app');
    await page2.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    await page2.waitForTimeout(1500);
    decks = await idbDecks(page2);
    d = (decks || []).find(x => x.id === deckId);
    check('chiusura e riapertura: progressi del ripasso conservati', d && d.cards.every(c => c.reps > 0));
    await studyById(page2, deckId);
    await page2.waitForTimeout(800);
    check('riapertura: nessuna carta da ripassare oggi (non riparte da capo)', !(await page2.locator('#study-overlay.active').count()));

    // 6) nuovo tentativo senza errori? Simulato più sotto (scenario noerrors)
    await page2.close();
  }

  if (SCENARIO === 'noerrors') {
    // Simulazione senza risposte sbagliate: tutte in bianco
    await startQuick(page);
    await answerAll(page, () => null);
    await page.locator('#tolc-consegna').click();
    await page.waitForTimeout(500);
    check('senza errori: nessun pulsante per creare il mazzo', (await page.locator('#tolc-gen-errors').count()) === 0);
    check('senza errori: messaggio "Nessun errore da ripassare"', (await page.locator('#tolc-sim-overlay').innerText()).includes('Nessun errore da ripassare'));
    await page.waitForTimeout(800);
    const decks = await idbDecks(page);
    check('senza errori: nessun mazzo errori creato', !(decks || []).some(d => d.source === 'tolc_errors_local'), (decks || []).length);
  }

  if (SCENARIO === 'idbfail') {
    // Salvataggio su IndexedDB che fallisce: niente falsa conferma, copia di riserva recuperabile.
    await startQuick(page);
    await answerAll(page, () => 0);
    await page.locator('#tolc-consegna').click();
    await page.locator('#tolc-gen-errors').waitFor();
    await page.evaluate(() => {
      const orig = IDBObjectStore.prototype.put;
      const ours = new Set(['decks', 'sessions', 'recordings']);
      IDBObjectStore.prototype.put = function () {
        if (this.transaction && this.transaction.db && this.transaction.db.name === 'cortex_db' && ours.has(this.name)) throw new DOMException('quota', 'QuotaExceededError');
        return orig.apply(this, arguments);
      };
      window.__restorePut = () => { IDBObjectStore.prototype.put = orig; };
    });
    const toasts = [];
    await page.exposeFunction('__e2eToast', (m, t) => toasts.push([t, m]));
    // Unico elemento #toast: si registra ogni messaggio mostrato, nell'ordine.
    await page.evaluate(() => {
      const el = document.getElementById('toast');
      new MutationObserver(() => { if (el.textContent) window.__e2eToast(el.textContent, el.className); }).observe(el, { childList: true, characterData: true, subtree: true, attributes: true });
    });
    await page.locator('#tolc-gen-errors').click();
    await page.waitForTimeout(1500);
    const status = await page.evaluate(() => window.__cortexSaveStatus);
    const backup = await page.evaluate(() => { try { return { unsaved: localStorage.getItem('cortex_decks_unsaved'), n: (JSON.parse(localStorage.getItem('mm_decks') || '[]') || []).filter(d => d.source === 'tolc_errors_local').length }; } catch (_) { return null; } });
    log('toast:', JSON.stringify(toasts));
    check('IndexedDB in errore: stato di salvataggio "error" (non "saved")', status === 'error', status);
    check('IndexedDB in errore: avviso di errore visibile', toasts.some(([t]) => /error/.test(t)));
    check('IndexedDB in errore: copia di riserva con il mazzo errori', backup && backup.unsaved === '1' && backup.n === 1, backup);
    await page.evaluate(() => window.__restorePut());
    await page.reload();
    await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    await page.waitForTimeout(1500);
    const n = await page.evaluate(() => (window.__cortexState?.decks || null));
    const decks = await idbDecks(page);
    const listed = await page.evaluate(() => document.body.innerText.includes('Errori TOLC'));
    check('al riavvio il mazzo errori è recuperato dalla copia di riserva', listed, { idb: (decks || []).filter(d => d.source === 'tolc_errors_local').length });
  }

  if (SCENARIO === 'loginredirect') {
    // "Salva il risultato nel tuo account Google" da ospite. Caso peggiore: il login
    // naviga via SUBITO (sincrono), più in fretta del vero signInWithRedirect.
    await startQuick(page);
    await answerAll(page, () => 0);
    await page.locator('#tolc-consegna').click();
    await page.locator('#tolc-enter').waitFor();
    await page.evaluate(() => {
      window.__guestLogin = function () { location.assign('/app'); };
    });
    await page.locator('#tolc-enter').dblclick({ noWaitAfter: true }).catch(() => {});
    await page.waitForTimeout(2000);
    await page.waitForLoadState('load');
    await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    const rec = await page.evaluate(() => localStorage.getItem('cortex_tolc_resume'));
    log('record di ripresa subito dopo il ritorno:', rec);
    await page.locator('#tolc-resume-card').waitFor({ timeout: 20000 }).catch(() => {});
    const card = await page.locator('#tolc-resume-card').count();
    const decks = await idbDecks(page);
    const errs = (decks || []).filter(d => d.source === 'tolc_errors_local');
    check('ritorno dal login: un solo mazzo errori presente', errs.length === 1, errs.length);
    check('ritorno dal login: proposta "Ripassa i tuoi errori"', card === 1);
    if (card) {
      await page.locator('#tolc-resume-go').click();
      await page.locator('#study-overlay.active').waitFor({ timeout: 10000 }).catch(() => {});
      check('la proposta apre il ripasso del mazzo', await page.locator('#study-overlay.active').count() === 1);
    }
    await page.reload();
    await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    await page.waitForTimeout(3000);
    check('la proposta di ripresa compare una sola volta', (await page.locator('#tolc-resume-card').count()) === 0);
  }

  if (SCENARIO === 'dblconsegna') {
    await startQuick(page);
    await answerAll(page, () => 0);
    const before = await page.evaluate(() => Object.keys(localStorage).filter(k => /tolc/i.test(k)).map(k => [k, (localStorage.getItem(k) || '').length]));
    log('chiavi tolc prima:', JSON.stringify(before));
    const histKey = await page.evaluate(() => Object.keys(localStorage).find(k => /tolc.*(hist|storico)/i.test(k)) || null);
    await page.locator('#tolc-consegna').dblclick();
    await page.waitForTimeout(800);
    const hk = histKey || await page.evaluate(() => Object.keys(localStorage).find(k => /tolc.*(hist|storico)/i.test(k)) || null);
    const hist = await page.evaluate((k) => { try { return JSON.parse(localStorage.getItem(k) || '[]'); } catch (_) { return null; } }, hk);
    check('doppio clic su consegna: una sola prova nello storico', Array.isArray(hist) && hist.length === 1, { key: hk, n: hist && hist.length });
  }

  if (SCENARIO === 'scope') {
    // Dispositivo con i dati di un "account A" (sintetico); all'avvio nessun utente collegato
    // (rete bloccata) → l'app passa allo spazio ospite. L'ospite non deve vedere nulla di A.
    await page.goto(BASE + '/app');
    await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    await page.evaluate(() => new Promise((res) => {
      const deckA = { id: 'tolc-err-tolc-i-AAAA', name: 'Errori TOLC-I di A', subject: 'TOLC-I', source: 'tolc_errors_local', sourceAttempt: 'tolc-i-AAAA',
        cards: [{ id: 'x-0', q: 'Domanda di A', a: 'A) risposta', ease: 2.5, interval: 1, nextReview: '2020-01-01', reps: 0 }], created: '2026-10-14' };
      localStorage.setItem('cortex_active_scope', 'u:A');
      localStorage.setItem('cortex_tolc_history', JSON.stringify([{ k: 'tolc-i', q: false, s: 17.75, n: 20, t: Date.now() - 864e5 }]));
      localStorage.setItem('cortex_tolc_resume', JSON.stringify({ v: 1, attemptId: 'tolc-i-AAAA', deckId: deckA.id, testName: 'TOLC-I', correct: 3, total: 10, nWrong: 1, reason: 'result_login', ts: Date.now() }));
      const r = indexedDB.open('cortex_db', 1);
      r.onsuccess = () => { const tx = r.result.transaction('decks', 'readwrite'); tx.objectStore('decks').put([deckA], 'u:A'); tx.oncomplete = () => { r.result.close(); res(); }; };
    }));
    await page.reload();
    await page.waitForTimeout(6000);   // cambio di spazio dati + ricarica
    await page.waitForFunction(() => window.__cxModulesReady, null, { timeout: 30000 });
    await page.waitForTimeout(2000);
    const scope = await page.evaluate(() => localStorage.getItem('cortex_active_scope'));
    const text = await page.evaluate(() => document.body.innerText);
    check('nessun utente collegato: spazio dati ospite', scope === 'guest', scope);
    check('ospite: il mazzo errori di A non compare', !text.includes('Errori TOLC-I di A'));
    check('ospite: il punteggio TOLC di A non compare in home', !/17,75/.test(text));
    check('ospite: nessuna proposta di ripresa del TOLC di A', (await page.locator('#tolc-resume-card').count()) === 0);
    const stashed = await page.evaluate(() => localStorage.getItem('cortex_scoped:u:A:cortex_tolc_history'));
    check('i punteggi di A restano da parte nello spazio di A', !!stashed && stashed.includes('17.75'));
  }

  log('host esterni bloccati:', [...external].sort().join(', '));
  await browser.close();
  const failed = results.filter(r => !r.ok);
  console.log(JSON.stringify({ scenario: SCENARIO, passed: results.length - failed.length, failed: failed.length }));
  process.exit(failed.length ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
