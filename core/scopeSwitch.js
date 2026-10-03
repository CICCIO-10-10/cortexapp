/**
 * core/scopeSwitch.js — cambio di account sul dispositivo (audit 2026-10, fase 2.1).
 * Vedi core/accountScope.js per il modello dei dati.
 */
import { state, hydrateFromIDB } from './state.js';
import { saveDecks, saveSessions, saveRecordings, loadDecks, loadSessions, loadRecordings, deleteScopeData } from './db.js';
import { currentScope, swapLocalStorage, clearStash, mergeDecksById, mergeListsUnique, isValidScope, isScopeStale, canReloadForScope, ACTIVE_SCOPE_KEY } from './accountScope.js';

function localSnapshotDecks() {
    try { const v = JSON.parse(localStorage.getItem('mm_decks') || '[]'); return Array.isArray(v) ? v : []; }
    catch (_) { return []; }
}

/**
 * Salva lo scope uscente, unisce l'ospite nell'account se si passa da ospite ad
 * account, carica lo scope entrante. Non tocca il cloud. Dopo la chiamata la
 * pagina va ricaricata (o lo stato re-idratato) prima di usare i dati.
 * @returns {Promise<{switched:boolean, from:string, to:string, mergedGuest:boolean}>}
 */
export async function switchAccountScope(to) {
    const from = currentScope();
    if (!isValidScope(to) || from === to) return { switched: false, from, to, mergedGuest: false };
    // Prima di salvare lo scope uscente, lo stato deve contenere i dati completi di
    // IndexedDB (altrimenti si salverebbe solo la copia parziale di avvio).
    await hydrateFromIDB();

    const decks = mergeDecksById(state.decks, localSnapshotDecks());
    const sessions = Array.isArray(state.sessions) ? state.sessions : [];
    const recordings = Array.isArray(state.recordings) ? state.recordings : [];

    // 1) Lo scope uscente viene salvato per intero. Se IndexedDB non funziona resta
    //    la copia in localStorage (spostata nello stash dello scope uscente).
    let savedFrom = true;
    try {
        await saveDecks(decks, from);
        await saveSessions(sessions, from);
        await saveRecordings(recordings, from);
    } catch (e) {
        savedFrom = false;
        try { localStorage.setItem('mm_decks', JSON.stringify(decks)); } catch (_) {}
        console.warn('[Scope] salvataggio dello scope uscente non riuscito, resta la copia locale:', e);
    }

    // 2) Ospite → account: unione esplicita e idempotente (stesso id = una sola copia).
    const mergedGuest = from === 'guest' && to.startsWith('u:');
    if (mergedGuest) {
        const [accDecks, accSessions, accRecordings] = await Promise.all([loadDecks(to), loadSessions(to), loadRecordings(to)]);
        await saveDecks(mergeDecksById(accDecks || [], decks), to);
        await saveSessions(mergeListsUnique(accSessions || [], sessions), to);
        await saveRecordings(mergeListsUnique(accRecordings || [], recordings), to);
    }

    // 3) localStorage: stash dello scope uscente, ripristino di quello entrante.
    swapLocalStorage(from, to, { mergeFromGuest: mergedGuest });

    // 4) Solo a unione confermata lo spazio ospite viene svuotato.
    if (mergedGuest && savedFrom) {
        try { await deleteScopeData('guest'); clearStash('guest', { archiveAs: 'guest-archive' }); }
        catch (e) { console.warn('[Scope] pulizia spazio ospite rimandata:', e); }
    }
    return { switched: true, from, to, mergedGuest };
}

/**
 * Più schede: se un'altra scheda cambia account, questa si ricarica invece di
 * continuare a scrivere i dati dell'account precedente.
 */
export function installScopeWatcher() {
    if (typeof window === 'undefined' || window.__cortexScopeWatcher) return;
    window.__cortexScopeWatcher = true;
    window.addEventListener('storage', (e) => {
        if (e.key !== ACTIVE_SCOPE_KEY || !isScopeStale()) return;
        if (canReloadForScope()) location.reload();
    });
}
