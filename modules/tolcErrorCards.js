/**
 * modules/tolcErrorCards.js — logica PURA (nessun DOM, nessuna rete) per il mazzo
 * "errori TOLC" creato in locale, senza AI e senza login.
 *
 * Regole:
 *  - una carta per ogni domanda RISPOSTA in modo errato (le domande lasciate in
 *    bianco non sono errori);
 *  - fronte = domanda, retro = testo completo della risposta corretta (+ la
 *    risposta scelta), presi dai dati del test: nessuna spiegazione inventata;
 *  - domande con dati incompleti vengono saltate e contate, senza rompere il flusso;
 *  - un tentativo TOLC produce al massimo UN mazzo (id deterministico per tentativo).
 */

export const TOLC_ERROR_DECK_SOURCE = 'tolc_errors_local';
export const TOLC_ERROR_NO_EXPLANATION =
    'Le domande di questa simulazione non includono una spiegazione: ogni carta mostra la risposta corretta e quella che avevi scelto.';

const MAX_Q = 1000;
const MAX_A = 600;

function letter(i) { return String.fromCharCode(65 + i); }
function clean(v, max) {
    if (typeof v !== 'string' && typeof v !== 'number') return '';
    return String(v).replace(/\s+/g, ' ').trim().slice(0, max);
}
function isIndex(v, len) { return Number.isInteger(v) && v >= 0 && v < len; }

/**
 * @param {Array} qs       domande del tentativo ({ s, q, o:[...], c })
 * @param {Array} answers  indice scelto per domanda, null/undefined = non data
 * @returns {{ wrong: Array, skipped: number }}
 */
export function collectWrongAnswers(qs, answers) {
    const wrong = [];
    let skipped = 0;
    const list = Array.isArray(qs) ? qs : [];
    const ans = Array.isArray(answers) ? answers : [];
    list.forEach((q, i) => {
        const a = ans[i];
        if (a === null || a === undefined) return;                 // in bianco: non è un errore
        if (!q || typeof q !== 'object' || !Array.isArray(q.o)) { skipped++; return; }
        if (!isIndex(q.c, q.o.length) || !isIndex(a, q.o.length)) { skipped++; return; }
        if (a === q.c) return;                                     // corretta
        const question = clean(q.q, MAX_Q);
        const correctText = clean(q.o[q.c], MAX_A);
        if (!question || !correctText) { skipped++; return; }      // dati incompleti
        wrong.push({
            section: clean(q.s, 60),
            question,
            correctLetter: letter(q.c),
            correctText,
            chosenLetter: letter(a),
            chosenText: clean(q.o[a], MAX_A),
        });
    });
    return { wrong, skipped };
}

/** Id stabile per tentativo: doppio click o nuovo click = stesso mazzo. */
export function tolcErrorDeckId(attemptId) {
    return 'tolc-err-' + String(attemptId || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 80);
}

export function findDeckForAttempt(decks, attemptId) {
    if (!attemptId || !Array.isArray(decks)) return null;
    const id = tolcErrorDeckId(attemptId);
    return decks.find(d => d && (String(d.id) === id || d.sourceAttempt === attemptId)) || null;
}

export function isTolcErrorDeck(deck) {
    return !!(deck && deck.source === TOLC_ERROR_DECK_SOURCE);
}

/**
 * Costruisce il mazzo nel formato usato dall'app (come deckForm.buildDeckObject).
 * @returns {object|null} null se non c'è nessun errore utilizzabile
 */
export function buildTolcErrorDeck({ attemptId, testKey, testName, wrong, today, format }) {
    if (!attemptId || !Array.isArray(wrong) || !wrong.length) return null;
    const fmt = typeof format === 'function' ? format : (x => x);
    const id = tolcErrorDeckId(attemptId);
    const name = clean(testName, 60) || 'TOLC';
    const dateLabel = /^\d{4}-\d{2}-\d{2}$/.test(today || '') ? today.slice(8, 10) + '/' + today.slice(5, 7) : '';
    const cards = wrong.map((w, i) => ({
        id: id + '-' + i,
        q: (w.section ? '[' + w.section + '] ' : '') + fmt(w.question),
        a: w.correctLetter + ') ' + fmt(w.correctText) +
            (w.chosenText ? '  ·  Avevi scelto ' + w.chosenLetter + ') ' + fmt(w.chosenText) : ''),
        ease: 2.5, interval: 1, nextReview: today, reps: 0,
    }));
    return {
        id,
        name: 'Errori ' + name + (dateLabel ? ' · ' + dateLabel : ''),
        subject: name,
        text: TOLC_ERROR_NO_EXPLANATION,
        examDate: '', examType: '', examTopics: '',
        attachments: [],
        cards,
        aiSummary: '',
        created: today,
        source: TOLC_ERROR_DECK_SOURCE,
        sourceAttempt: attemptId,
        tolcTest: clean(testKey, 20),
        cardsOrigin: 'tolc_bank',   // carte prese dalla banca domande, NON generate dall'AI
    };
}

/** Testo per la richiesta facoltativa di spiegazione AI (stesse informazioni delle carte). */
export function aiNotesFromDeck(deck) {
    if (!deck || !Array.isArray(deck.cards) || !deck.cards.length) return '';
    return 'Argomenti che ho SBAGLIATO nella simulazione ' + (deck.subject || 'TOLC') +
        '. Crea flashcard di ripasso mirate su questi concetti:\n\n' +
        deck.cards.map(c => String(c.q).slice(0, 300) + '\nRisposta corretta: ' + String(c.a).split('  ·  ')[0].slice(0, 200)).join('\n\n');
}
