/**
 * modules/tolcErrorDeck.js — percorso a basso attrito "TOLC → mazzo errori → studio".
 *
 * Dopo la consegna del TOLC chiunque (ospite incluso) crea SUBITO un mazzo locale con
 * le domande sbagliate e inizia a studiarlo: niente AI, niente login prima del valore.
 * Il login viene proposto DOPO (non bloccante) per sincronizzare i progressi o chiedere
 * la spiegazione AI, che resta dietro login come prima (paywall/regole invariati).
 *
 * Tracciamento (solo nomi evento + conteggi, nessun contenuto; track() rispetta il consenso):
 *   tolc_error_deck_created        mazzo creato senza AI      { count, mode:'local', type:'guest'|'account' }
 *   tolc_error_first_study         ingresso nella sessione    (evento esistente, study.js)
 *   tolc_error_first_card_rated    prima carta valutata       (una volta per mazzo)
 *   tolc_error_session_completed   sessione arrivata in fondo { count } (una volta per mazzo)
 *   tolc_error_deck_login_completed  accesso completato da chi aveva creato il mazzo da ospite
 *   tolc_error_save_prompt_shown / _login_click / _ai_click / _dismiss  rami del prompt
 * Le carte di questo mazzo NON incrementano activation.cardsGenerated (non sono generate).
 */
import { state } from '../core/state.js';
import { saveState } from './deckUtils.js';
import { startStudyById } from './study.js';
import { track } from '../core/analytics.js';
import { todayStr } from '../js/utils.js';
import { collectWrongAnswers, buildTolcErrorDeck, findDeckForAttempt, isTolcErrorDeck, aiNotesFromDeck, TOLC_ERROR_NO_EXPLANATION, TOLC_RESUME_KEY, buildResumeRecord, parseResumeRecord } from './tolcErrorCards.js';

const FUNNEL_KEY = 'cortex_tolc_error_funnel';
const FUNNEL_TTL = 30 * 24 * 60 * 60 * 1000;

function _isGuest() { return !window._fbLoggedIn; }
function _read() {
    try {
        const f = JSON.parse(localStorage.getItem(FUNNEL_KEY) || 'null');
        if (!f || !f.deckId || !f.ts || Date.now() - f.ts > FUNNEL_TTL) return null;
        return f;
    } catch (_) { return null; }
}
function _write(f) { try { localStorage.setItem(FUNNEL_KEY, JSON.stringify(f)); } catch (_) {} }

/** Segna un passaggio del funnel una sola volta per mazzo; true se è la prima volta. */
export function markTolcErrorStep(deckId, step) {
    const f = _read();
    if (!f || String(f.deckId) !== String(deckId)) return false;
    f.steps = f.steps || {};
    if (f.steps[step]) return false;
    f.steps[step] = Date.now();
    _write(f);
    return true;
}

let _busy = false;

/**
 * Crea il mazzo degli errori (o ritrova quello già creato per questo tentativo), SENZA aprire lo studio.
 * Usato sia dal pulsante principale sia prima di una richiesta di accesso.
 * @returns {{ok:true, deck:object, created:boolean} | {ok:false, reason:string}}
 */
export function ensureTolcErrorDeck(st, fmt) {
    if (!st || !st.attemptId) return { ok: false, reason: 'no_attempt' };
    if (!state || !Array.isArray(state.decks)) return { ok: false, reason: 'not_ready' };
    let deck = findDeckForAttempt(state.decks, st.attemptId);
    if (deck) return { ok: true, deck, created: false };
    const { wrong, skipped } = collectWrongAnswers(st.qs, st.answers);
    if (!wrong.length) return { ok: false, reason: skipped ? 'incomplete' : 'no_errors' };
    deck = buildTolcErrorDeck({
        attemptId: st.attemptId,
        testKey: st.key,
        testName: (st.test && st.test.nome) || 'TOLC',
        wrong, today: todayStr(), format: fmt,
    });
    if (!deck) return { ok: false, reason: 'incomplete' };
    state.decks.push(deck);
    saveState();
    const guest = _isGuest();
    _write({ deckId: deck.id, ts: Date.now(), guest, steps: {} });
    // Riusa l'evento esistente "ingresso nella sessione di studio" (study.js).
    try { localStorage.setItem('cortex_tolc_error_study_pending', JSON.stringify({ ts: Date.now(), deckId: deck.id })); } catch (_) {}
    try { track('tolc_error_deck_created', { count: deck.cards.length, mode: 'local', type: guest ? 'guest' : 'account' }); } catch (_) {}
    return { ok: true, deck, created: true };
}

/**
 * Crea (o riapre, se già creato per questo tentativo) il mazzo degli errori e avvia lo studio.
 * @param {object} st      stato della simulazione ({ attemptId, key, test, qs, answers })
 * @param {function} fmt   formattatore testo (notazioni matematiche)
 * @returns {Promise<{ok:boolean, reason?:string, created?:boolean, count?:number}>}
 */
export async function createAndStudyTolcErrorDeck(st, fmt) {
    if (_busy) return { ok: false, reason: 'busy' };
    _busy = true;
    try {
        const res = ensureTolcErrorDeck(st, fmt);
        if (!res.ok) return res;
        const { deck, created } = res;
        // Nessun cambio di pagina: lo studio si apre in sovrimpressione e l'URL resta quello dell'app.
        if (window.showToast) {
            window.showToast(created
                ? deck.cards.length + (deck.cards.length === 1 ? ' carta pronta' : ' carte pronte') + ': su ogni carta vedi la risposta corretta e quella che avevi scelto.'
                : 'Riapro il mazzo dei tuoi errori.', 'success');
        }
        // Il banner "Attiva le notifiche" (prima visita) copriva i pulsanti di valutazione su
        // telefono: lo nascondiamo durante questo studio e lo rimettiamo alla chiusura.
        try { document.querySelectorAll('.notif-banner').forEach(b => { b.dataset.cxTolcHidden = '1'; b.style.display = 'none'; }); } catch (_) {}
        await startStudyById(deck.id);
        return { ok: true, created, count: deck.cards.length };
    } catch (e) {
        try { track('tolc_error_deck_failed', { reason: 'error' }); } catch (_) {}
        return { ok: false, reason: 'error' };
    } finally {
        _busy = false;
    }
}

// ── Accesso senza perdere il risultato ───────────────────────────────────────
function _saveResume(rec) {
    try { if (rec) localStorage.setItem(TOLC_RESUME_KEY, JSON.stringify(rec)); return !!rec; } catch (_) { return false; }
}
function _clearResume() { try { localStorage.removeItem(TOLC_RESUME_KEY); } catch (_) {} }
function _startLogin() {
    if (typeof window.__guestLogin === 'function') window.__guestLogin();
    else if (typeof window.loginWithGoogle === 'function') window.loginWithGoogle();
}

/**
 * "Salva il risultato con Google" dalla schermata del risultato: prima di avviare l'accesso
 * (che ricarica la pagina) mette al sicuro gli errori in un mazzo locale e un riepilogo del
 * risultato, così al ritorno la persona può riprendere dal ripasso.
 * @param {object} st       stato della simulazione
 * @param {function} fmt    formattatore testo
 * @param {{correct:number,total:number,nWrong:number}} summary
 */
export function saveTolcResultAndLogin(st, fmt, summary) {
    if (window._firebaseUnavailable) {
        if (window.showToast) window.showToast('L’accesso non è disponibile in questo momento. Puoi comunque ripassare gli errori su questo dispositivo.', 'info');
        return { ok: false, reason: 'auth_unavailable' };
    }
    let deckId = null;
    try { const r = ensureTolcErrorDeck(st, fmt); if (r.ok) deckId = r.deck.id; } catch (_) {}
    const saved = _saveResume(buildResumeRecord({
        attemptId: st && st.attemptId, deckId,
        testName: st && st.test && st.test.nome,
        correct: summary && summary.correct, total: summary && summary.total, nWrong: summary && summary.nWrong,
        reason: 'result_login',
    }));
    try { track('tolc_result_login_click', { count: (summary && summary.nWrong) || 0, success: saved }); } catch (_) {}
    _startLogin();
    return { ok: true, deckId };
}

let _resumeTimer = null;
/**
 * Al ritorno (dopo l'accesso o una ricarica) ripropone UNA volta il ripasso del mazzo degli
 * errori salvato prima dell'accesso. Non compare sopra simulatore, studio o onboarding.
 */
export function maybeShowTolcResume(attempt = 0) {
    try {
        clearTimeout(_resumeTimer);
        const rec = parseResumeRecord(localStorage.getItem(TOLC_RESUME_KEY), Date.now());
        if (!rec) { _clearResume(); return false; }
        const busy = document.getElementById('tolc-sim-overlay') || document.getElementById('tolc-save-prompt') ||
            document.getElementById('tolc-resume-card') ||
            (document.getElementById('study-overlay') && document.getElementById('study-overlay').classList.contains('active')) ||
            (document.getElementById('onboarding-overlay') && document.getElementById('onboarding-overlay').style.display === 'flex') ||
            !window.__cxModulesReady || window.__cxScopeSwitching;
        const deck = rec.deckId && state && Array.isArray(state.decks) ? state.decks.find(d => d && String(d.id) === String(rec.deckId)) : null;
        // I mazzi arrivano da IndexedDB in modo asincrono: riprova per qualche secondo.
        if (busy || (rec.deckId && !deck)) {
            if (attempt < 12) _resumeTimer = setTimeout(() => maybeShowTolcResume(attempt + 1), 1000);
            else if (rec.deckId && !deck) _clearResume();   // mazzo non presente in questo account/dispositivo
            return false;
        }
        _clearResume();
        if (!deck) return false;
        const due = Array.isArray(deck.cards) ? deck.cards.length : 0;
        const box = document.createElement('div');
        box.id = 'tolc-resume-card';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Riprendi il ripasso del TOLC');
        box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(92vw,420px);z-index:70000;background:#15151d;border:1px solid rgba(34,197,94,.45);border-radius:16px;padding:16px;color:#e8e8ee;font-family:Inter,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);';
        const title = document.createElement('div');
        title.style.cssText = 'font-weight:800;font-size:.98rem;margin-bottom:6px;';
        title.textContent = 'Il tuo ' + rec.testName + (rec.total ? ': ' + rec.correct + '/' + rec.total + ' corrette' : '');
        const body = document.createElement('div');
        body.style.cssText = 'font-size:.82rem;color:rgba(255,255,255,.65);line-height:1.5;margin-bottom:12px;';
        body.textContent = due === 1 ? 'Hai 1 errore pronto da ripassare.' : 'Hai ' + due + ' errori pronti da ripassare.';
        const go = document.createElement('button');
        go.id = 'tolc-resume-go';
        go.style.cssText = 'width:100%;padding:12px;border:none;border-radius:10px;font-weight:800;color:#fff;background:linear-gradient(135deg,#16a34a,#22c55e);cursor:pointer;';
        go.textContent = 'Ripassa i tuoi errori';
        const later = document.createElement('button');
        later.id = 'tolc-resume-later';
        later.style.cssText = 'width:100%;padding:10px;margin-top:6px;border:none;background:transparent;color:rgba(255,255,255,.5);font-weight:600;cursor:pointer;';
        later.textContent = 'Più tardi (lo trovi tra i tuoi mazzi)';
        box.append(title, body, go, later);
        document.body.appendChild(box);
        const type = window._fbLoggedIn ? 'account' : 'guest';
        try { track('tolc_resume_shown', { count: due, type, flow: rec.reason }); } catch (_) {}
        const close = () => { try { box.remove(); } catch (_) {} };
        go.onclick = () => {
            try { track('tolc_resume_click', { count: due, type, flow: rec.reason }); } catch (_) {}
            close();
            startStudyById(deck.id);
        };
        later.onclick = () => {
            try { track('tolc_resume_dismiss', { type, flow: rec.reason }); } catch (_) {}
            close();
        };
        return true;
    } catch (_) { return false; }
}

// ── Eventi dallo studio (study.js chiama questo hook solo per i mazzi errori TOLC) ──
function _onStudyEvent(step, deck, extra) {
    try {
        if (!isTolcErrorDeck(deck)) return;
        if (step === 'first_rate' && markTolcErrorStep(deck.id, 'rated')) {
            track('tolc_error_first_card_rated');
        } else if (step === 'completed') {
            if (markTolcErrorStep(deck.id, 'completed')) track('tolc_error_session_completed', { count: (extra && extra.count) || 0 });
            // Aspetta che finiscano le celebrazioni (livello/obiettivo) per non sovrapporsi;
            // se la persona chiude prima, la proposta compare alla chiusura ('closed').
            let tries = 0;
            const later = () => {
                const busy = document.getElementById('level-up-celebration') || document.getElementById('guest-save-modal');
                if (busy && tries++ < 12) { setTimeout(later, 1000); return; }
                showTolcSavePrompt(deck);
            };
            setTimeout(later, 2500);
        } else if (step === 'closed') {
            try { document.querySelectorAll('.notif-banner[data-cx-tolc-hidden="1"]').forEach(b => { b.style.display = ''; delete b.dataset.cxTolcHidden; }); } catch (_) {}
            showTolcSavePrompt(deck);
        }
    } catch (_) {}
}

/** Accesso completato: conta una sola volta per chi aveva creato il mazzo da ospite. */
function _onLoginCompleted() {
    try {
        const f = _read();
        if (!f || !f.guest) return;
        if (markTolcErrorStep(f.deckId, 'login')) track('tolc_error_deck_login_completed');
    } catch (_) {}
}

// ── Proposta NON bloccante dopo lo studio ────────────────────────────────────
export function showTolcSavePrompt(deck) {
    try {
        if (!isTolcErrorDeck(deck) || document.getElementById('tolc-save-prompt')) return;
        // Senza SDK Firebase (modalità solo locale) accesso e AI non funzionano: non proporli.
        if (window._firebaseUnavailable) return;
        if (!markTolcErrorStep(deck.id, 'prompt')) return;   // una volta per mazzo
        const guest = _isGuest();
        const box = document.createElement('div');
        box.id = 'tolc-save-prompt';
        box.setAttribute('role', 'dialog');
        box.setAttribute('aria-label', 'Salva il mazzo degli errori');
        box.style.cssText = 'position:fixed;left:50%;bottom:16px;transform:translateX(-50%);width:min(92vw,420px);z-index:70000;background:#15151d;border:1px solid rgba(168,85,247,.4);border-radius:16px;padding:16px;color:#e8e8ee;font-family:Inter,system-ui,sans-serif;box-shadow:0 18px 50px rgba(0,0,0,.5);';
        const title = guest ? 'Vuoi ritrovare questo mazzo domani?' : 'Vuoi capire meglio i tuoi errori?';
        const body = guest
            ? 'Accedi con Google per salvarlo e sincronizzare i progressi. Puoi anche continuare come ospite: il mazzo resta su questo dispositivo.'
            : TOLC_ERROR_NO_EXPLANATION + ' Se vuoi, l’AI può crearti carte con la spiegazione.';
        box.innerHTML =
            '<div style="font-weight:800;font-size:.98rem;margin-bottom:6px;">' + title + '</div>' +
            '<div style="font-size:.82rem;color:rgba(255,255,255,.65);line-height:1.5;margin-bottom:12px;">' + body + '</div>' +
            (guest ? '<button id="tsp-login" style="width:100%;padding:12px;border:none;border-radius:10px;font-weight:800;color:#fff;background:linear-gradient(135deg,#8b5cf6,#d946ef);cursor:pointer;">Accedi con Google</button>' : '') +
            '<button id="tsp-ai" style="width:100%;padding:11px;margin-top:8px;border-radius:10px;border:1px solid rgba(168,85,247,.5);background:rgba(168,85,247,.12);color:#e9d5ff;font-weight:700;cursor:pointer;">Spiegami gli errori con l’AI' + (guest ? ' (richiede l’accesso)' : '') + '</button>' +
            '<button id="tsp-later" style="width:100%;padding:10px;margin-top:6px;border:none;background:transparent;color:rgba(255,255,255,.5);font-weight:600;cursor:pointer;">' + (guest ? 'Continua come ospite' : 'Non ora') + '</button>';
        document.body.appendChild(box);
        try { track('tolc_error_save_prompt_shown', { type: guest ? 'guest' : 'account' }); } catch (_) {}
        // Stessa richiesta del modale generico "salva i progressi" (app.html): non riproporlo.
        if (guest) { try { localStorage.setItem('cortex_guest_prompted', '1'); } catch (_) {} }
        const close = () => { try { box.remove(); } catch (_) {} };
        const login = box.querySelector('#tsp-login');
        if (login) login.onclick = () => {
            try { track('tolc_error_save_prompt_login_click'); } catch (_) {}
            close();
            _saveResume(buildResumeRecord({ attemptId: deck.sourceAttempt || deck.id, deckId: deck.id, testName: deck.subject, nWrong: (deck.cards || []).length, reason: 'save_prompt' }));
            _startLogin();
        };
        box.querySelector('#tsp-ai').onclick = () => {
            try { track('tolc_error_save_prompt_ai_click', { type: guest ? 'guest' : 'account' }); } catch (_) {}
            close();
            requestAiExplanation(deck);
        };
        box.querySelector('#tsp-later').onclick = () => {
            try { track('tolc_error_save_prompt_dismiss'); } catch (_) {}
            close();
        };
    } catch (_) {}
}

/** Spiegazione AI facoltativa: stesso percorso AI di prima (login richiesto per gli ospiti). */
export function requestAiExplanation(deck) {
    const notes = aiNotesFromDeck(deck);
    if (!notes) return;
    try {
        localStorage.setItem('cortex_pending_ai', JSON.stringify({
            text: notes,
            instructions: 'Flashcard di ripasso sugli errori della simulazione TOLC: spiega il concetto corretto, non solo la lettera della risposta.',
            ts: Date.now(), source: 'tolc_errors', authRequired: _isGuest(),
        }));
    } catch (_) {}
    if (!_isGuest()) {
        if (typeof window.__resumePendingAI === 'function') window.__resumePendingAI();
        return;
    }
    if (typeof window.__guestLogin === 'function') window.__guestLogin();
    else if (typeof window.loginWithGoogle === 'function') window.loginWithGoogle();
}

if (typeof window !== 'undefined') {
    window.__cxTolcErrorStudyEvent = _onStudyEvent;
    window.__cxTolcErrorLoginDone = _onLoginCompleted;
    window.__cxMaybeShowTolcResume = maybeShowTolcResume;
}
