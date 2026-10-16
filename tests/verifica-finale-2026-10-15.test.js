// Verifica finale dell'integrazione locale della PR #3 (15/10/2026, sera).
// Ogni test riproduce un difetto osservato davvero (browser o codice) prima della correzione.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../core/analytics.js', () => ({ track: vi.fn() }));
vi.mock('../services/activation.js', () => ({ bumpActivation: vi.fn() }));
vi.mock('../core/i18n.js', () => ({ t: k => k }));
vi.mock('../services/fileHandler.js', () => ({ extractTextFromFile: vi.fn() }));
vi.mock('../services/firebase.js', () => ({ SecurityManager: { getApiKey: () => null }, getFunctions: () => null, callGeminiProxy: vi.fn() }));
vi.mock('../modules/gamification.js', () => ({ awardXP: vi.fn(), earnBadge: vi.fn() }));
vi.mock('../modules/deckUtils.js', () => ({ saveState: vi.fn() }));
vi.mock('../data/translations.js', () => ({ TRANSLATIONS: { it: {} } }));

// OCR: Tesseract.js 5 rifiuta con una STRINGA ("Error: Error attempting to read image."), non con un Error.
// Verificato nel browser con lo script vero della CDN e un'immagine non leggibile: l'app mostrava
// "Errore OCR: undefined".
describe('OCR: immagine non leggibile', () => {
    let ai, toasts;
    beforeEach(async () => {
        vi.resetModules();
        toasts = [];
        const box = { classList: { add() {}, remove() {} } };
        vi.stubGlobal('navigator', { onLine: true });
        vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
        vi.stubGlobal('document', { getElementById: id => (id === 'deck-text' ? { value: '' } : box) });
        vi.stubGlobal('window', { showToast: (m, t) => toasts.push([t, m]), Tesseract: { recognize: () => Promise.reject('Error: Error attempting to read image.') } });
        vi.stubGlobal('Tesseract', { recognize: () => Promise.reject('Error: Error attempting to read image.') });
        ai = await import('../services/ai.js');
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('messaggio comprensibile, mai "undefined"', async () => {
        await ai.handleImageFile({ name: 'foto.heic', type: 'image/heic' });
        const err = toasts.filter(([t]) => t === 'error').map(([, m]) => m);
        expect(err).toHaveLength(1);
        expect(err[0]).not.toMatch(/undefined/);
        expect(err[0]).toMatch(/immagine/i);
    });
});

// Materiale nella materia (modules/pdfToFlashcards.js, planMaterial). Riprodotto nel browser
// (scripts/verifica-finale-2026-10-15/browser.cjs, scenari "esistente" e "lungo"): materiale aggiunto a una
// materia già con appunti perso; materiale oltre 300.000 caratteri perso senza avviso.
describe('materiale: nulla sparisce in silenzio', () => {
    let planMaterial;
    beforeEach(async () => {
        vi.resetModules();
        vi.stubGlobal('document', { getElementById: () => null });
        vi.stubGlobal('localStorage', { getItem: () => null, setItem() {}, removeItem() {} });
        vi.stubGlobal('navigator', { onLine: true });
        vi.stubGlobal('window', {});
        ({ planMaterial } = await import('../modules/pdfToFlashcards.js'));
    });
    afterEach(() => { vi.unstubAllGlobals(); });

    it('materia nuova o senza appunti: si salva il materiale importato', () => {
        expect(planMaterial('', 'Appunti')).toEqual({ text: 'Appunti', omitted: 0 });
        expect(planMaterial(undefined, 'Appunti')).toEqual({ text: 'Appunti', omitted: 0 });
    });
    it('modulo = appunti salvati + materiale aggiunto: si tiene tutto', () => {
        expect(planMaterial('A', 'A\n\nB')).toEqual({ text: 'A\n\nB', omitted: 0 });
    });
    it('testi diversi: si tengono entrambi, nessuno sovrascritto', () => {
        expect(planMaterial('Vecchi appunti', 'Nuovo PDF').text).toBe('Vecchi appunti\n\nNuovo PDF');
    });
    it('niente di nuovo: la materia resta com’è', () => {
        expect(planMaterial('Appunti completi', 'completi')).toEqual({ text: 'Appunti completi', omitted: 0 });
    });
    it('oltre il limite: la materia resta com’era e si sa quanti caratteri mancano', () => {
        expect(planMaterial('', 'x'.repeat(11), 10)).toEqual({ text: '', omitted: 11 });
        expect(planMaterial('vecchio', 'y'.repeat(11), 10)).toEqual({ text: 'vecchio', omitted: 11 });
        expect(planMaterial('', 'x'.repeat(10), 10)).toEqual({ text: 'x'.repeat(10), omitted: 0 });
    });
    it('materiale vuoto: non cancella gli appunti esistenti', () => {
        expect(planMaterial('Appunti', '   ')).toEqual({ text: 'Appunti', omitted: 0 });
    });
});
