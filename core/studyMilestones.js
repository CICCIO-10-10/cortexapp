/**
 * core/studyMilestones.js — le due tappe che misurano se lo studio "attacca" (04/10/2026).
 *
 *  1. review_first_completed   prima sessione di ripasso arrivata in fondo con almeno una
 *                              carta valutata, su questo dispositivo (una volta).
 *  2. study_returned_next_day  prima carta valutata in un GIORNO DI CALENDARIO successivo a
 *                              quello del primo ripasso completato (una volta; days_after).
 *
 * Solo attività di studio vera (valutare carte): aprire l'app, il refresh del token o un
 * heartbeat NON contano. Stato sul dispositivo, non per account: un ospite che poi accede
 * non riparte da zero e non viene contato due volte. Per gli account le stesse tappe sono
 * registrate anche lato server (services/activation.js), utili tra più dispositivi.
 * Nessun contenuto: solo date (AAAA-MM-GG) e conteggi.
 */

export const FIRST_REVIEW_KEY = 'cortex_first_review_day';
export const RETURNED_KEY = 'cortex_study_returned_day';

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Giorni di calendario tra due date AAAA-MM-GG (b - a). */
export function daysBetween(a, b) {
    if (!DAY_RE.test(a || '') || !DAY_RE.test(b || '')) return NaN;
    const ta = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
    const tb = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
    return Math.round((tb - ta) / 864e5);
}

function get(store, k) { try { return store.getItem(k); } catch (_) { return null; } }
function set(store, k, v) { try { store.setItem(k, v); return true; } catch (_) { return false; } }

/**
 * Sessione arrivata in fondo.
 * @returns {{first:boolean}} first=true solo la prima volta su questo dispositivo
 */
export function noteReviewCompleted(store, today, rated) {
    if (!store || !DAY_RE.test(today || '') || !(rated > 0)) return { first: false };
    if (DAY_RE.test(get(store, FIRST_REVIEW_KEY) || '')) return { first: false };
    return { first: set(store, FIRST_REVIEW_KEY, today) };
}

/**
 * Carta valutata.
 * @returns {{returned:boolean, daysAfter?:number}} returned=true solo la prima volta che si
 *          studia in un giorno successivo a quello del primo ripasso completato
 */
export function noteCardRated(store, today) {
    if (!store || !DAY_RE.test(today || '')) return { returned: false };
    const first = get(store, FIRST_REVIEW_KEY);
    if (!DAY_RE.test(first || '') || DAY_RE.test(get(store, RETURNED_KEY) || '')) return { returned: false };
    const daysAfter = daysBetween(first, today);
    if (!(daysAfter >= 1)) return { returned: false };
    return set(store, RETURNED_KEY, today) ? { returned: true, daysAfter } : { returned: false };
}
