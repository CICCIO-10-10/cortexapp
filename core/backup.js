/**
 * core/backup.js — export/import dei dati di studio (audit 2026-10, fase 2.4)
 *
 * Prima: l'export leggeva 'mm_decks_v1' (chiave inesistente) → file con zero mazzi;
 * l'import scriveva in localStorage, che IndexedDB poi ignorava.
 *
 * Formato 'cortex-backup' versione 2:
 *  { format, version, exportedAt, app, account:{type, email?}, decks[], sessions[],
 *    recordings[] (solo elenco), gamification, settings, attachments:{...} }
 * Allegati: quelli salvati DENTRO il mazzo (es. immagini/PDF come data URL) sono
 * inclusi; le registrazioni audio e i file su cloud NON sono inclusi (solo elenco).
 */
import { deckHash } from './syncMerge.js';

export const BACKUP_FORMAT = 'cortex-backup';
export const BACKUP_VERSION = 2;
const LIMITS = Object.freeze({ decks: 1000, cardsPerDeck: 10000, sessions: 20000, bytes: 50 * 1024 * 1024 });

export function buildBackup({ decks = [], sessions = [], recordings = [], gamification = null, settings = {}, account = null, appVersion = '', now = new Date() }) {
    return {
        format: BACKUP_FORMAT,
        version: BACKUP_VERSION,
        exportedAt: now.toISOString(),
        app: { name: 'Cortex', version: String(appVersion || '') },
        gdprNote: 'Esportazione dati personali ai sensi del GDPR Art. 20.',
        account: account ? { type: account.type || 'account', email: account.email || null } : { type: 'guest' },
        decks: Array.isArray(decks) ? decks : [],
        sessions: Array.isArray(sessions) ? sessions : [],
        // Le registrazioni audio stanno in un archivio separato del dispositivo: qui solo l'elenco.
        recordings: (Array.isArray(recordings) ? recordings : []).map(r => {
            const { blob, data, audio, ...meta } = (r && typeof r === 'object') ? r : {};
            return meta;
        }),
        gamification: gamification && typeof gamification === 'object' ? gamification : null,
        settings,
        attachments: {
            included: 'Allegati salvati dentro i mazzi (immagini/PDF come dati).',
            notIncluded: 'Registrazioni audio e file caricati sul cloud (solo elenco).',
        },
    };
}

function normalizeDeck(raw, i, warnings) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) { warnings.push(`Mazzo ${i + 1} ignorato: formato non valido.`); return null; }
    const cards = Array.isArray(raw.cards) ? raw.cards : [];
    if (cards.length > LIMITS.cardsPerDeck) { warnings.push(`Mazzo "${String(raw.name || i + 1).slice(0, 40)}" ignorato: troppe carte.`); return null; }
    const validCards = cards.filter(c => c && typeof c === 'object' && !Array.isArray(c));
    if (validCards.length !== cards.length) warnings.push(`Mazzo "${String(raw.name || i + 1).slice(0, 40)}": ${cards.length - validCards.length} carte non valide ignorate.`);
    const { rev, updatedAt, syncedAt, ...rest } = raw;   // i metadati di sync non si importano
    return { ...rest, id: raw.id != null ? raw.id : `import_${Date.now()}_${i}`, name: String(raw.name || raw.title || 'Mazzo importato').slice(0, 200), cards: validCards };
}

/**
 * Legge e valida un backup (v2, export GDPR precedente, backup legacy con stringhe JSON).
 * @returns {{ok:true, format:string, decks:object[], sessions:object[], gamification:object|null, warnings:string[]} | {ok:false, error:string}}
 */
export function parseBackup(text) {
    if (typeof text !== 'string') return { ok: false, error: 'File non leggibile.' };
    if (text.length > LIMITS.bytes) return { ok: false, error: 'File troppo grande.' };
    let data;
    try { data = JSON.parse(text); } catch (_) { return { ok: false, error: 'Il file non è un backup Cortex valido (JSON non leggibile).' }; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) return { ok: false, error: 'Il file non è un backup Cortex valido.' };
    const warnings = [];
    let format;
    let decks = data.decks, sessions = data.sessions, gamification = data.gamification;
    if (data.format === BACKUP_FORMAT) {
        if (Number(data.version) > BACKUP_VERSION) return { ok: false, error: 'Backup creato da una versione più recente di Cortex: aggiorna l’app.' };
        format = 'v' + Number(data.version || 2);
    } else if (typeof decks === 'string' || typeof sessions === 'string') {
        format = 'legacy-progress';          // exportProgress(): valori come stringhe JSON
        try { decks = decks ? JSON.parse(decks) : []; } catch (_) { decks = []; warnings.push('Mazzi del vecchio backup non leggibili.'); }
        try { sessions = sessions ? JSON.parse(sessions) : []; } catch (_) { sessions = []; }
        try { gamification = typeof gamification === 'string' ? JSON.parse(gamification) : gamification; } catch (_) { gamification = null; }
    } else if (Array.isArray(decks)) {
        format = 'legacy-gdpr';              // vecchio exportUserData()
        gamification = null;                 // conteneva solo stringhe sparse
    } else {
        return { ok: false, error: 'Il file non contiene mazzi Cortex.' };
    }
    if (!Array.isArray(decks)) decks = [];
    if (decks.length > LIMITS.decks) return { ok: false, error: 'Troppi mazzi nel file.' };
    const normDecks = decks.map((d, i) => normalizeDeck(d, i, warnings)).filter(Boolean);
    const normSessions = (Array.isArray(sessions) ? sessions : []).filter(s => s && typeof s === 'object').slice(-LIMITS.sessions);
    if (format !== 'v2' && normDecks.length === 0) warnings.push('Il file non contiene mazzi (i vecchi export potevano essere vuoti).');
    return { ok: true, format, decks: normDecks, sessions: normSessions, gamification: gamification && typeof gamification === 'object' ? gamification : null, warnings };
}

/**
 * Piano di import (anteprima): stesso id e contenuto = saltato; stesso id ma
 * contenuto diverso = importato come copia; id nuovo = aggiunto. Nulla viene sovrascritto.
 */
export function planImport(localDecks = [], importedDecks = [], now = Date.now()) {
    const byId = new Map(localDecks.filter(d => d && d.id != null).map(d => [String(d.id), d]));
    const toAdd = [];
    let added = 0, skipped = 0, copies = 0;
    importedDecks.forEach((d, i) => {
        const existing = byId.get(String(d.id));
        if (!existing) { toAdd.push(d); byId.set(String(d.id), d); added++; return; }
        if (deckHash(existing) === deckHash(d)) { skipped++; return; }
        toAdd.push({ ...d, id: `${d.id}_importato_${now}_${i}`, name: `${d.name} (importato)` });
        copies++;
    });
    return { decks: [...localDecks, ...toAdd], added, skipped, copies, total: importedDecks.length };
}
