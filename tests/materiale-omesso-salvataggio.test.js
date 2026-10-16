import { it, expect, vi, afterEach } from 'vitest';
vi.mock('../core/i18n.js', () => ({ t: k => k }));
vi.mock('../modules/gamification.js', () => ({ awardXP: vi.fn() }));
vi.mock('../modules/decks.js', () => ({ renderDecks: vi.fn() }));
vi.mock('../core/analytics.js', () => ({ track: vi.fn() }));
vi.mock('../js/config.js', () => ({ APP_CONFIG: { STORAGE_KEYS: { DRAFT: 'draft-test' } } }));
afterEach(() => vi.unstubAllGlobals());
it('modificare una materia conserva la traccia degli appunti omessi, senza trasferirla a nuove materie', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null });
    vi.stubGlobal('document', {
        getElementById: id => ({ value: id === 'deck-name' ? 'Nome modificato' : '', innerHTML: '' }),
        querySelectorAll: () => [],
    });
    const { init, buildDeckObject } = await import('../modules/deckForm.js');
    const omitted = { chars: 350000, limit: 300000, at: 1 };
    init({ state: { decks: [{ id: 'd1', textOmitted: omitted }] }, getCurrentDeckIndex: () => 0 });
    expect(buildDeckObject().textOmitted).toEqual(omitted);
    init({ getCurrentDeckIndex: () => null });
    expect(buildDeckObject()).not.toHaveProperty('textOmitted');
});
