// Durable deletion journal: a mobile close must not undo a confirmed deletion.
const KEY = 'cortex_deleted_decks';
function owner() {
    return window._fbUserId || localStorage.getItem('mm_user_id') || 'guest';
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
