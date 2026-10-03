/**
 * core/accountScope.js — spazio dati per account sul dispositivo (audit 2026-10, fase 2.1)
 *
 * Problema: IndexedDB (chiave 'all') e localStorage erano GLOBALI. Dopo il logout
 * restavano i mazzi dell'account A; al primo login di B venivano caricati sul
 * cloud di B come "progressi ospite" (contaminazione A→B).
 *
 * Modello:
 *  - scope = 'guest' | 'u:<uid>'. Lo scope ATTIVO è in localStorage
 *    (cortex_active_scope) ed è noto in modo sincrono al boot.
 *  - IndexedDB: chiave = scope (es. decks['u:abc'], decks['guest']).
 *  - localStorage: le chiavi di studio dello scope attivo restano con il loro nome
 *    di sempre (così tutto il codice esistente continua a funzionare); quelle degli
 *    altri scope sono conservate come 'cortex_scoped:<scope>:<chiave>'.
 *  - Cambio account = salva lo scope uscente, carica quello entrante, ricarica la
 *    pagina (nessuno stato in memoria o operazione asincrona dell'account
 *    precedente sopravvive).
 *  - ospite → account: i dati ospite vengono UNITI nell'account e poi tolti dallo
 *    spazio ospite (migrazione esplicita, ripetibile senza duplicati).
 *  - account → altro account: nessun passaggio di dati.
 *  - Dati legacy (prima di questa versione): assegnati all'ultimo account che ha
 *    usato il dispositivo (mm_user_id), o all'ospite se nessuno ha mai fatto login.
 *    Una copia resta sempre in IndexedDB con chiave 'legacy' e la vecchia 'all'
 *    non viene cancellata.
 */

export const ACTIVE_SCOPE_KEY = 'cortex_active_scope';
export const LEGACY_SCOPE_KEY = 'cortex_legacy_scope';
const STASH_PREFIX = 'cortex_scoped:';

/** Chiavi localStorage che contengono dati di studio/di account (non preferenze del dispositivo). */
export const SCOPED_KEYS = Object.freeze([
    'mm_decks', 'mm_sessions', 'mm_recordings', 'mm_gstate', 'mm_gamification',
    'mm_today_cards', 'mm_today_date', 'mm_daily_xp', 'mm_daily_xp_date', 'mm_username',
    'cortex_v2', 'cortex_decks', 'cortex_draft', 'cortex_streak', 'cortex_xp',
    'cortex_total_sessions', 'cortex_study_sessions', 'cortex_daily_goal',
    'cortex_sparks_balance', 'cortex_user_plan', 'cortex_plan', 'cortex_trial_expires_at',
    'cortex_profile', 'cortex_user_v1', 'cortex_last_coach_report', 'cortex_widget_data',
    'cortex_workout_log', 'cortex_pending_ai', 'cortex_today_ai_calls',
    'cortex_tolc_error_study_pending', 'cortex_tolc_error_save_pending', 'cortex_tolc_error_generation_pending',
    'cortex_sync_meta', 'cortex_decks_unsaved',
]);
export const SCOPED_PREFIXES = Object.freeze(['loci_pins_', 'loci_img_', 'cortex_event_progress_', 'cortex_event_lastday_', 'cortex_event_done_']);

const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
const isScopedKey = k => SCOPED_KEYS.includes(k) || SCOPED_PREFIXES.some(p => k.startsWith(p));
const stashKey = (scope, key) => STASH_PREFIX + scope + ':' + key;

export function scopeForUser(user) {
    return user && !user.isAnonymous && typeof user.uid === 'string' && user.uid ? 'u:' + user.uid : 'guest';
}
export function isValidScope(s) { return s === 'guest' || (typeof s === 'string' && /^u:[A-Za-z0-9_-]{1,128}$/.test(s)); }

/** Elenco delle chiavi localStorage "attive" (senza prefisso) appartenenti allo scope attivo. */
function activeKeys(store) {
    const out = [];
    for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && !k.startsWith(STASH_PREFIX) && isScopedKey(k)) out.push(k);
    }
    return out;
}
function stashedKeys(store, scope) {
    const pre = STASH_PREFIX + scope + ':';
    const out = [];
    for (let i = 0; i < store.length; i++) {
        const k = store.key(i);
        if (k && k.startsWith(pre)) out.push(k.slice(pre.length));
    }
    return out;
}

/**
 * Inizializzazione sincrona, da chiamare PRIMA di leggere qualsiasi dato di studio.
 * Alla prima esecuzione assegna i dati legacy al loro proprietario probabile.
 * @returns {string} scope attivo
 */
export function ensureScopeInitialized() {
    const store = ls();
    if (!store) return 'guest';
    const existing = store.getItem(ACTIVE_SCOPE_KEY);
    if (isValidScope(existing)) { _tabScope = _tabScope || existing; return existing; }

    const loggedUid = store.getItem('cortex_uid');      // presente solo con login attivo
    const lastOwner = store.getItem('mm_user_id');      // ultimo account del dispositivo (resta dopo il logout)
    const active = loggedUid ? 'u:' + loggedUid : 'guest';
    const legacy = lastOwner ? 'u:' + lastOwner : active;
    const safeActive = isValidScope(active) ? active : 'guest';
    const safeLegacy = isValidScope(legacy) ? legacy : safeActive;

    if (safeLegacy !== safeActive) {
        // I dati presenti appartengono all'ultimo account, non a chi usa ora il dispositivo.
        for (const k of activeKeys(store)) {
            store.setItem(stashKey(safeLegacy, k), store.getItem(k));
            store.removeItem(k);
        }
    }
    store.setItem(LEGACY_SCOPE_KEY, safeLegacy);
    store.setItem(ACTIVE_SCOPE_KEY, safeActive);
    _tabScope = safeActive;
    return safeActive;
}

// Scope di QUESTA scheda, fissato al boot o dal cambio account. Le scritture usano
// questo valore, non quello corrente in localStorage: se un'altra scheda cambia
// account, questa non scrive nello spazio sbagliato (vedi isScopeStale()).
let _tabScope = null;

export function currentScope() {
    if (_tabScope) return _tabScope;
    const store = ls();
    const s = store && store.getItem(ACTIVE_SCOPE_KEY);
    _tabScope = isValidScope(s) ? s : ensureScopeInitialized();
    return _tabScope;
}

/** true se un'altra scheda ha cambiato account: questa scheda non deve più salvare. */
export function isScopeStale() {
    const store = ls();
    const s = store && store.getItem(ACTIVE_SCOPE_KEY);
    return !!_tabScope && isValidScope(s) && s !== _tabScope;
}

/** Scope a cui assegnare i dati IndexedDB legacy (chiave 'all'). */
export function legacyScope() {
    const store = ls();
    const s = store && store.getItem(LEGACY_SCOPE_KEY);
    return isValidScope(s) ? s : currentScope();
}

/** Sposta le chiavi attive nello stash di `from` e carica quelle di `to`. Sincrono. */
export function swapLocalStorage(from, to, { mergeFromGuest = false } = {}) {
    const store = ls();
    if (!store || from === to) return;
    const fromValues = {};
    for (const k of activeKeys(store)) {
        fromValues[k] = store.getItem(k);
        store.setItem(stashKey(from, k), fromValues[k]);
        store.removeItem(k);
    }
    for (const k of stashedKeys(store, to)) {
        store.setItem(k, store.getItem(stashKey(to, k)));
        store.removeItem(stashKey(to, k));
    }
    if (mergeFromGuest) {
        // Ospite → account: le chiavi che l'account non ha ancora vengono prese dall'ospite;
        // quelle in conflitto restano all'account (l'ospite resta recuperabile nel suo stash
        // finché la migrazione dei mazzi non è confermata).
        for (const [k, v] of Object.entries(fromValues)) {
            if (k === 'cortex_sync_meta' || k === 'mm_decks') continue; // gestite dalla migrazione dei mazzi
            if (store.getItem(k) === null) store.setItem(k, v);
        }
    }
    store.setItem(ACTIVE_SCOPE_KEY, to);
    _tabScope = to;
}

/**
 * Rimuove lo stash localStorage di uno scope (dopo una migrazione confermata).
 * Con `archiveAs` i valori vengono prima copiati in un archivio recuperabile
 * (es. XP dell'ospite in conflitto con quelli dell'account: non si perdono).
 */
export function clearStash(scope, { archiveAs = null } = {}) {
    const store = ls();
    if (!store) return;
    if (archiveAs) for (const k of stashedKeys(store, archiveAs)) store.removeItem(stashKey(archiveAs, k));
    for (const k of stashedKeys(store, scope)) {
        if (archiveAs) store.setItem(stashKey(archiveAs, k), store.getItem(stashKey(scope, k)));
        store.removeItem(stashKey(scope, k));
    }
}

/** Unione di mazzi per id (idempotente): in caso di stesso id vince `primary`. */
export function mergeDecksById(primary = [], secondary = []) {
    const out = [...(Array.isArray(primary) ? primary : [])];
    const ids = new Set(out.map(d => d && d.id != null ? String(d.id) : null).filter(Boolean));
    for (const d of (Array.isArray(secondary) ? secondary : [])) {
        if (!d) continue;
        if (d.id != null && ids.has(String(d.id))) continue;
        out.push(d);
        if (d.id != null) ids.add(String(d.id));
    }
    return out;
}

/** Unione di liste (sessioni, registrazioni) senza duplicati identici. */
export function mergeListsUnique(a = [], b = []) {
    const seen = new Set();
    const out = [];
    for (const item of [...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])]) {
        const key = typeof item === 'object' ? JSON.stringify(item) : String(item);
        if (seen.has(key)) continue;
        seen.add(key);
        out.push(item);
    }
    return out;
}

// ── Protezione da ricariche in loop ──────────────────────────────────────────
const RELOAD_GUARD = 'cortex_scope_reloads';
export function canReloadForScope(now = Date.now()) {
    try {
        const raw = JSON.parse(sessionStorage.getItem(RELOAD_GUARD) || '[]').filter(t => now - t < 15000);
        if (raw.length >= 2) return false;
        raw.push(now);
        sessionStorage.setItem(RELOAD_GUARD, JSON.stringify(raw));
        return true;
    } catch (_) { return true; }
}

/** Solo per test: azzera lo scope della scheda. */
export function _resetTabScopeForTests() { _tabScope = null; }
