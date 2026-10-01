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
import { collectWrongAnswers, buildTolcErrorDeck, findDeckForAttempt, isTolcErrorDeck, aiNotesFromDeck, TOLC_ERROR_NO_EXPLANATION } from './tolcErrorCards.js';

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
 * Crea (o riapre, se già creato per questo tentativo) il mazzo degli errori e avvia lo studio.
 * @param {object} st      stato della simulazione ({ attemptId, key, test, qs, answers })
 * @param {function} fmt   formattatore testo (notazioni matematiche)
 * @returns {Promise<{ok:boolean, reason?:string, created?:boolean, count?:number}>}
 */
export async function createAndStudyTolcErrorDeck(st, fmt) {
    if (_busy) return { ok: false, reason: 'busy' };
    _busy = true;
    try {
        if (!st || !st.attemptId) return { ok: false, reason: 'no_attempt' };
        let deck = findDeckForAttempt(state.decks, st.attemptId);
        let created = false;
        if (!deck) {
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
            created = true;
            const guest = _isGuest();
            _write({ deckId: deck.id, ts: Date.now(), guest, steps: {} });
            // Riusa l'evento esistente "ingresso nella sessione di studio" (study.js).
            try { localStorage.setItem('cortex_tolc_error_study_pending', JSON.stringify({ ts: Date.now(), deckId: deck.id })); } catch (_) {}
            try { track('tolc_error_deck_created', { count: deck.cards.length, mode: 'local', type: guest ? 'guest' : 'account' }); } catch (_) {}
        }
        // Nessun cambio di pagina: lo studio si apre in sovrimpressione e l'URL resta quello dell'app.
        if (window.showToast) {
            window.showToast(created
                ? deck.cards.length + (deck.cards.length === 1 ? ' carta pronta' : ' carte pronte') + ' dai tuoi errori. Le domande non hanno una spiegazione: vedrai la risposta corretta.'
                : 'Riapro il mazzo dei tuoi errori.', 'success');
        }
        // Il banner "Attiva le notifiche" (prima visita) copriva i pulsanti di valutazione su
        // telefono: lo nascondiamo durante questo studio e lo rimettiamo alla chiusura.
        try { document.querySelectorAll('.notif-banner').forEach(b => { b.dataset.cxTolcHidden = '1'; b.style.display = 'none'; }); } catch (_) {}
        await startStudyById(deck.id);
        return { ok: true, created, count: deck.cards.length };
    } catch (e) {
        return { ok: false, reason: 'error' };
    } finally {
        _busy = false;
    }
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
            if (typeof window.__guestLogin === 'function') window.__guestLogin();
            else if (typeof window.loginWithGoogle === 'function') window.loginWithGoogle();
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
}
