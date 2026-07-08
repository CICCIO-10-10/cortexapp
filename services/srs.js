// services/srs.js
/**
 * Motore di Spaced Repetition — Algoritmo SM-2 con ottimizzazioni.
 *
 * Questo modulo è PURO: nessuna dipendenza su DOM, localStorage o store.
 * Prende una carta e un voto, ritorna la carta aggiornata.
 * Facilmente testabile con unit test.
 *
 * Fonte algoritmo originale: Piotr Woźniak (SuperMemo 2)
 * Ottimizzazioni applicate:
 *   - Ease Hell prevention: decadimento ridotto a -0.10 per rating "hard"
 *   - Fuzzing ±5%: dispersione del carico per evitare picchi di ripasso
 *   - Hard cap 365 giorni: nessuna carta sparisce per un anno intero
 *
 * @module services/srs
 */

const MIN_EASE       = 1.3;
const MAX_EASE       = 3.0;
const MAX_INTERVAL   = 365; // giorni
const FUZZ_PERCENT   = 0.05; // ±5%

/**
 * Calcola la data di prossimo ripasso come stringa ISO (YYYY-MM-DD).
 * @param {number} daysFromNow
 * @returns {string}
 */
function nextReviewDate(daysFromNow) {
    // Usa data locale (non UTC) per coerenza con todayStr() di utils.js
    const d = new Date();
    d.setDate(d.getDate() + daysFromNow);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const g = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${g}`;
}

/**
 * Applica il fuzzing all'intervallo per distribuire il carico.
 * Es. intervallo=20 → può diventare 19, 20 o 21.
 * @param {number} interval
 * @returns {number}
 */
function applyFuzz(interval) {
    if (interval <= 1) return interval;
    const maxOffset = Math.max(1, Math.round(interval * FUZZ_PERCENT));
    const offset = Math.floor(Math.random() * (maxOffset * 2 + 1)) - maxOffset;
    return Math.max(1, interval + offset);
}

/**
 * Processa la valutazione di una carta e ritorna la carta aggiornata.
 *
 * @param {Object} card  - La carta originale (non viene mutata)
 * @param {number} rating - 0 = Non sapevo, 1 = Difficile, 2 = Sapevo
 * @returns {Object} La carta aggiornata con i nuovi valori SRS
 *
 * Struttura carta:
 * {
 *   q:          string,   // domanda
 *   a:          string,   // risposta
 *   ease:       number,   // ease factor (default 2.5)
 *   interval:   number,   // giorni all'intervallo corrente (default 1)
 *   reps:       number,   // numero di ripetizioni totali
 *   nextReview: string,   // data prossimo ripasso YYYY-MM-DD
 * }
 */
export function processAnswer(card, rating) {
    // Clone immutabile: non modifichiamo mai la carta originale
    const c = { ...card };
    const ease     = c.ease     ?? 2.5;
    const interval = c.interval ?? 1;
    const reps     = c.reps     ?? 0;

    let newEase     = ease;
    let newInterval = interval;

    switch (rating) {
        case 0: // Non sapevo — reset
            newInterval = 1;
            newEase = Math.max(MIN_EASE, ease - 0.20);
            break;

        case 1: // Difficile — incremento minimo + Ease Hell prevention
            newInterval = Math.max(1, Math.floor(interval * 1.2));
            newEase = Math.max(MIN_EASE, ease - 0.10); // -0.10 invece di -0.15
            break;

        case 2: // Sapevo — incremento normale
            newInterval = Math.round(interval * ease);
            newEase = Math.min(MAX_EASE, ease + 0.10);
            break;

        default:
            console.warn(`[SRS] Rating non riconosciuto: ${rating}. Carta non modificata.`);
            return c;
    }

    // Fuzzing per distribuire il carico ±5%
    newInterval = applyFuzz(newInterval);

    // Hard cap: massimo 1 anno
    newInterval = Math.min(newInterval, MAX_INTERVAL);

    return {
        ...c,
        ease:       newEase,
        interval:   newInterval,
        reps:       reps + 1,
        nextReview: nextReviewDate(newInterval),
    };
}

/**
 * Ritorna true se la carta è in scadenza oggi o già scaduta.
 * @param {Object} card
 * @returns {boolean}
 */
export function isDue(card) {
    if (!card.nextReview) return true; // Nuova carta → subito in scadenza
    // Data locale (non UTC) per coerenza con nextReviewDate() e todayStr()
    const d = new Date();
    const today = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    return card.nextReview <= today;
}

/**
 * Filtra e ordina le carte in scadenza di un mazzo.
 * Le carte senza nextReview (nuove) vengono messe in coda.
 * @param {Array} cards
 * @returns {Array}
 */
export function getDueCards(cards) {
    if (!Array.isArray(cards)) return [];
    return cards
        .filter(isDue)
        .sort((a, b) => {
            // Prima le carte già viste (hanno nextReview), poi le nuove
            if (!a.nextReview && b.nextReview) return 1;
            if (a.nextReview && !b.nextReview) return -1;
            return a.nextReview < b.nextReview ? -1 : 1;
        });
}

/**
 * Statistiche SRS di un mazzo.
 * @param {Array} cards
 * @returns {{ due: number, new: number, learning: number, total: number }}
 */
export function getDeckStats(cards) {
    if (!Array.isArray(cards)) return { due: 0, new: 0, learning: 0, total: 0 };
    const today = new Date().toISOString().slice(0, 10);
    return cards.reduce((acc, c) => {
        acc.total++;
        if (!c.nextReview)              acc.new++;
        else if (c.nextReview <= today) acc.due++;
        else                            acc.learning++;
        return acc;
    }, { due: 0, new: 0, learning: 0, total: 0 });
}
