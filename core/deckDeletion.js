import { currentScope } from './accountScope.js';
// Durable deletion journal: a mobile close must not undo a confirmed deletion.
const KEY = 'cortex_deleted_decks';
// Fase 2.1: il registro segue lo spazio dati della scheda (non l'ultimo account del
// dispositivo): da ospite dopo un logout non si usa più il registro dell'account.
function owner() {
    const scope = currentScope();
    return scope.startsWith('u:') ? scope.slice(2) : 'guest';
}
export function deletedDeckIds(uid = owner()) {
    try { return JSON.parse(localStorage.getItem(KEY) || '{}')[uid] || []; }
    catch (_) { return []; }
}
export function rememberDeletedDecks(ids, uid = owner()) {
    const all = JSON.parse(localStorage.getItem(KEY) || '{}');
    all[uid] = [...new Set([...deletedDeckIds(uid), ...ids.map(String)])];
    localStorage.setItem(KEY, JSON.stringify(all));
}
export function withoutDeletedDecks(decks, uid = owner()) {
    const deleted = new Set(deletedDeckIds(uid));
    return decks.filter(deck => !deleted.has(String(deck.id)));
}
