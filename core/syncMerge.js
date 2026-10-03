/**
 * core/syncMerge.js — regole di sincronizzazione dei mazzi (audit 2026-10, fase 2.3)
 *
 * Prima: ogni salvataggio riscriveva TUTTI i mazzi sul cloud e ogni lettura del
 * cloud SOSTITUIVA i mazzi locali (modifiche offline o di un altro dispositivo perse).
 *
 * Ora (per ogni mazzo, chiave = id):
 *  - "sporco" = contenuto locale diverso dall'ultimo contenuto sincronizzato
 *    (hash canonico salvato in cortex_sync_meta) → è la coda durevole: tutto ciò che
 *    non combacia viene ritentato, anche dopo chiusura dell'app;
 *  - upload solo dei mazzi sporchi, uno per transazione, con precondizione sulla
 *    revisione del server (rev) e sul timestamp dell'ultima scrittura nota;
 *  - lettura del cloud: un mazzo sporco non viene mai sovrascritto; se nel frattempo
 *    è cambiato anche sul cloud si tengono ENTRAMBE le versioni (copia locale);
 *  - mazzo assente sul cloud: se era già stato sincronizzato e non è sporco è stato
 *    cancellato altrove → rimosso; altrimenti è nuovo → resta e verrà caricato;
 *  - prima esecuzione (nessun metadato): uguale → pulito; diverso → si tengono entrambi.
 * Nessuna decisione si basa solo sull'orologio del dispositivo.
 */

const VOLATILE_FIELDS = new Set(['rev', 'updatedAt', 'syncedAt']);

export function stableStringify(value) {
    if (value === undefined) return 'null';
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (typeof value.toMillis === 'function') return JSON.stringify(value.toMillis());
    if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
    const keys = Object.keys(value).filter(k => value[k] !== undefined && typeof value[k] !== 'function').sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(value[k])).join(',') + '}';
}

/** Hash canonico del contenuto (ordine delle chiavi irrilevante, campi di sync esclusi). */
export function deckHash(deck) {
    const content = {};
    for (const [k, v] of Object.entries(deck || {})) if (!VOLATILE_FIELDS.has(k)) content[k] = v;
    const s = stableStringify(content);
    let h1 = 0x811c9dc5, h2 = 0x01000193;
    for (let i = 0; i < s.length; i++) {
        const c = s.charCodeAt(i);
        h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
        h2 = Math.imul(h2 + c, 0x5bd1e995) >>> 0;
    }
    return h1.toString(16).padStart(8, '0') + h2.toString(16).padStart(8, '0') + ':' + s.length;
}

export function readMeta(raw) {
    let m = raw;
    if (typeof raw === 'string') { try { m = JSON.parse(raw); } catch (_) { m = null; } }
    if (!m || typeof m !== 'object') m = {};
    return {
        v: 1,
        initialized: m.initialized === true,
        hashes: m.hashes && typeof m.hashes === 'object' ? { ...m.hashes } : {},
        stamps: m.stamps && typeof m.stamps === 'object' ? { ...m.stamps } : {},
    };
}

const idOf = d => (d && d.id != null ? String(d.id) : null);
const stampOf = d => {
    const u = d && d.updatedAt;
    if (u == null) return null;
    if (typeof u === 'number') return u;
    if (typeof u.toMillis === 'function') return u.toMillis();
    if (typeof u.seconds === 'number') return u.seconds * 1000 + Math.floor((u.nanoseconds || 0) / 1e6);
    return null;
};
export const deckStamp = stampOf;

export function isDirty(deck, meta) {
    const id = idOf(deck);
    if (!id) return false;
    return meta.hashes[id] !== deckHash(deck);
}

/** Copia locale da conservare in caso di conflitto (nuovo id, mai sincronizzata). */
export function conflictCopy(deck, now = Date.now()) {
    const { rev, updatedAt, syncedAt, ...rest } = deck;
    return { ...rest, id: `${idOf(deck)}_copia_${now}`, name: `${deck.name || deck.title || 'Mazzo'} (copia di questo dispositivo)`, conflictOf: idOf(deck), conflictAt: now };
}

function recordClean(meta, deck) {
    const id = idOf(deck);
    meta.hashes[id] = deckHash(deck);
    const st = stampOf(deck);
    if (st !== null) meta.stamps[id] = st; else delete meta.stamps[id];
}

/**
 * Unisce i mazzi del cloud in quelli locali.
 * @param {{local:object[], cloud:object[], meta:object, deleted:Iterable<string>, now?:number}} p
 * @returns {{decks:object[], meta:object, conflicts:{id:string, copyId:string}[], removed:string[], dirtyIds:string[]}}
 */
export function mergeCloudIntoLocal({ local = [], cloud = [], meta: rawMeta, deleted = [], now = Date.now() }) {
    const meta = readMeta(rawMeta);
    const deletedSet = new Set([...deleted].map(String));
    const cloudById = new Map();
    for (const c of cloud) { const id = idOf(c); if (id && !deletedSet.has(id)) cloudById.set(id, c); }

    const out = [], conflicts = [], removed = [];
    const seen = new Set();
    for (const l of local) {
        const id = idOf(l);
        if (!id) { out.push(l); continue; }               // senza id: mai perso, mai caricato
        if (seen.has(id)) continue;
        seen.add(id);
        if (deletedSet.has(id)) { removed.push(id); continue; }
        const c = cloudById.get(id);
        if (c) {
            const localDirty = isDirty(l, meta);
            const sameContent = deckHash(l) === deckHash(c);
            if (sameContent) { out.push(c); recordClean(meta, c); continue; }
            if (!meta.initialized) {
                // Nessuna storia di sync su questo dispositivo: diverso = tieni entrambi.
                out.push(c); recordClean(meta, c);
                const copy = conflictCopy(l, now); out.push(copy); conflicts.push({ id, copyId: copy.id });
                continue;
            }
            if (!localDirty) { out.push(c); recordClean(meta, c); continue; }   // cloud più recente
            const cloudChanged = (c.rev || 0) !== (l.rev || 0) ||
                (meta.stamps[id] != null && stampOf(c) !== null && stampOf(c) !== meta.stamps[id]);
            if (!cloudChanged) { out.push(l); continue; }                         // modifica locale in attesa
            out.push(c); recordClean(meta, c);                                    // conflitto: tieni entrambi
            const copy = conflictCopy(l, now); out.push(copy); conflicts.push({ id, copyId: copy.id });
        } else {
            const wasSynced = Object.prototype.hasOwnProperty.call(meta.hashes, id);
            if (wasSynced && !isDirty(l, meta)) { removed.push(id); delete meta.hashes[id]; delete meta.stamps[id]; continue; }
            out.push(l);                                                          // nuovo o modificato: resta
        }
    }
    for (const [id, c] of cloudById) {
        if (seen.has(id)) continue;
        out.push(c); recordClean(meta, c);
    }
    meta.initialized = true;
    const dirtyIds = out.filter(d => idOf(d) && isDirty(d, meta)).map(idOf);
    return { decks: out, meta, conflicts, removed, dirtyIds };
}

/** Mazzi da caricare: solo quelli sporchi (mai tutti). */
export function decksToUpload(local = [], rawMeta) {
    const meta = readMeta(rawMeta);
    return local.filter(d => idOf(d) && isDirty(d, meta));
}

/**
 * Precondizione della transazione di upload: il cloud è ancora quello su cui si
 * basa la modifica locale?
 */
export function uploadPrecondition({ local, cloudDoc, meta: rawMeta }) {
    const meta = readMeta(rawMeta);
    const id = idOf(local);
    const baseRev = local.rev || 0;
    if (!cloudDoc) return { ok: true, baseRev, recreate: baseRev > 0 };
    const cloudRev = cloudDoc.rev || 0;
    const known = meta.stamps[id];
    const cloudStamp = stampOf(cloudDoc);
    const stampChanged = known != null && cloudStamp !== null && cloudStamp !== known;
    return { ok: cloudRev === baseRev && !stampChanged, baseRev, cloudRev };
}

/** Aggiorna i metadati dopo un upload riuscito. */
export function recordUploaded(rawMeta, deck, stampMs) {
    const meta = readMeta(rawMeta);
    const id = idOf(deck);
    meta.hashes[id] = deckHash(deck);
    if (stampMs != null) meta.stamps[id] = stampMs; else delete meta.stamps[id];
    return meta;
}

/**
 * Conflitto in upload su UN mazzo: la versione del cloud prende il suo posto e la
 * versione locale resta come copia (da caricare). Gli altri mazzi non vengono toccati.
 */
export function resolveUploadConflict({ decks = [], deck, cloudDoc, meta: rawMeta, now = Date.now() }) {
    const meta = readMeta(rawMeta);
    const id = idOf(deck);
    const cloudDeck = { ...cloudDoc, id: cloudDoc && cloudDoc.id != null ? cloudDoc.id : deck.id };
    const copy = conflictCopy(deck, now);
    const out = [];
    for (const d of decks) {
        if (idOf(d) === id) { out.push(cloudDeck, copy); continue; }
        out.push(d);
    }
    if (!out.includes(cloudDeck)) out.push(cloudDeck, copy);
    recordClean(meta, cloudDeck);
    return { decks: out, meta, copyId: copy.id };
}
