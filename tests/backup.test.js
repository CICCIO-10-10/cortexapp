// Audit 2026-10 — Fase 2.4: export/import reali.
import { describe, it, expect } from 'vitest';
import { buildBackup, parseBackup, planImport, BACKUP_VERSION } from '../core/backup.js';
import fs from 'node:fs';

const deck = (id, q) => ({ id, name: 'Mazzo ' + id, cards: [{ q, a: 'r', nextReview: '2026-10-05' }] });

describe('backup v2', () => {
    it('export → import su archivio vuoto conserva carte e progressi SRS', () => {
        const decks = [deck(1, 'uno'), deck(2, 'due')];
        const file = JSON.stringify(buildBackup({ decks, sessions: [{ date: '2026-10-01', correct: 3 }], recordings: [{ id: 'r1', name: 'Lezione', blob: 'BINARIO' }], gamification: { xp: 120 } }));
        const parsed = parseBackup(file);
        expect(parsed).toMatchObject({ ok: true, format: 'v' + BACKUP_VERSION });
        expect(parsed.decks).toEqual(decks);
        expect(parsed.sessions).toHaveLength(1);
        const plan = planImport([], parsed.decks);
        expect(plan).toMatchObject({ added: 2, copies: 0, skipped: 0 });
        expect(plan.decks[0].cards[0].nextReview).toBe('2026-10-05');
        expect(JSON.parse(file).recordings[0]).toEqual({ id: 'r1', name: 'Lezione' });   // audio non incluso, solo elenco
    });
    it('nessuna sovrascrittura: identici saltati, diversi importati come copia', () => {
        const plan = planImport([deck(1, 'uno'), deck(2, 'locale')], [deck(1, 'uno'), deck(2, 'dal backup'), deck(3, 'tre')], 9);
        expect(plan).toMatchObject({ added: 1, skipped: 1, copies: 1 });
        expect(plan.decks.map(d => d.id)).toEqual([1, 2, '2_importato_9_1', 3]);
        expect(plan.decks[1].cards[0].q).toBe('locale');
    });
    it('import ripetuto: nessun duplicato', () => {
        const once = planImport([], [deck(1, 'x')]);
        const twice = planImport(once.decks, [deck(1, 'x')]);
        expect(twice).toMatchObject({ added: 0, skipped: 1, copies: 0 });
        expect(twice.decks).toHaveLength(1);
    });
    it('formati storici: vecchio exportProgress (stringhe JSON) e vecchio export GDPR', () => {
        const legacy = parseBackup(JSON.stringify({ decks: JSON.stringify([deck(5, 'vecchio')]), sessions: '[]', gamification: '{"xp":3}' }));
        expect(legacy).toMatchObject({ ok: true, format: 'legacy-progress' });
        expect(legacy.decks[0].id).toBe(5);
        const emptyGdpr = parseBackup(JSON.stringify({ exportDate: 'x', decks: [], sessions: [] }));
        expect(emptyGdpr.ok).toBe(true);
        expect(emptyGdpr.warnings[0]).toMatch(/vecchi export potevano essere vuoti/);
    });
    it('validazione: file non validi, versione futura, mazzi/carte non validi', () => {
        expect(parseBackup('non json').ok).toBe(false);
        expect(parseBackup(JSON.stringify([1, 2])).ok).toBe(false);
        expect(parseBackup(JSON.stringify({ format: 'cortex-backup', version: 99, decks: [] })).error).toMatch(/più recente/);
        const p = parseBackup(JSON.stringify({ format: 'cortex-backup', version: 2, decks: [null, 'x', { name: 'senza id', cards: [{ q: 1 }, 'bad'], rev: 7, updatedAt: 1 }] }));
        expect(p.decks).toHaveLength(1);
        expect(p.decks[0].cards).toHaveLength(1);
        expect(p.decks[0].rev).toBeUndefined();            // i metadati di sync non si importano
        expect(String(p.decks[0].id)).toMatch(/^import_/);
        expect(p.warnings.length).toBeGreaterThanOrEqual(2);
    });
    it('l\'export usa l\'archivio reale e non la chiave inesistente mm_decks_v1', () => {
        const src = fs.readFileSync(new URL('../modules/gdpr.js', import.meta.url), 'utf8');
        expect(src).not.toContain("'mm_decks_v1'");
        expect(src).toContain('await hydrateFromIDB()');
        expect(src).toContain('buildBackup(');
        const fb = fs.readFileSync(new URL('../services/firebase.js', import.meta.url), 'utf8');
        expect(fb).not.toMatch(/localStorage\.setItem\(KEYS\.DECKS_V1, data\.decks\)/);   // vecchio import ignorato da IndexedDB
    });
});
