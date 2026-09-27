import { it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
function element() {
    const classes = new Set();
    return { style: { removeProperty(key) { delete this[key]; } }, classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
        dataset: {}, innerHTML: '', textContent: '', querySelector: () => element(), addEventListener() {}, remove() {}, parentNode: { insertBefore() {} } };
}
function setup(path) {
    const els = new Map();
    const data = new Map([['cortex_daily_goal', '10000']]);
    const ctx = vm.createContext({ document: { getElementById: id => { if (!els.has(id)) els.set(id, element()); return els.get(id); }, querySelectorAll: () => [], addEventListener() {}, createElement: element },
        localStorage: { getItem: k => data.get(k) ?? null, setItem: (k,v) => data.set(k, String(v)) },
        window: { dispatchEvent: vi.fn() }, Event, console, setTimeout, clearTimeout, setInterval, clearInterval,
        t: k => k, TRANSLATIONS: { it: {} }, todayStr: () => '2026-09-27', processAnswer: () => ({ nextReview: '2026-09-27' }),
        track: vi.fn(), bumpActivation: vi.fn(), renderDecks: vi.fn(), updateMemoryBank: vi.fn(),
        fisherYatesShuffle: a => a, escapeHTML: x => String(x), SecurityManager: { getApiKey: () => null },
    });
    vm.runInContext(source(path), ctx);
    return { ctx, els };
}
it('finishes, closes and reopens flashcard sessions repeatedly without a blank overlay', async () => {
    const { ctx, els } = setup('../modules/study.js');
    ctx.deps = { state: { decks: [{ id: 'a', name: 'Test', cards: [{ id: 'c', q: 'Q', a: 'A' }] }], todayCards: 0 }, saveState: vi.fn(), awardXP: vi.fn(), getCurrentDeckIndex: () => 0, setCurrentDeckIndex: vi.fn() };
    vm.runInContext('init(deps)', ctx);
    for (let i = 0; i < 5; i++) {
        await vm.runInContext('startStudyById("a")', ctx);
        expect(els.get('study-overlay').classList.contains('active')).toBe(true);
        expect(els.get('session-done').style.display).toBe('none');
        vm.runInContext('flipCard(); rateCard(2); rateCard(2)', ctx);
        expect(els.get('session-done').style.display).toBe('block');
        expect(ctx.deps.state.todayCards).toBe(i + 1);
        vm.runInContext('closeStudy()', ctx);
        expect(els.get('study-overlay').style.display).toBe('none');
    }
});
it('does not rate an unrevealed card on duplicate taps or after closing', async () => {
    const { ctx } = setup('../modules/study.js');
    ctx.deps = { state: { decks: [{ id: 'a', cards: [{ q: 'Q', a: 'A' }, { q: 'Q2', a: 'A2' }] }], todayCards: 0 }, saveState: vi.fn(), awardXP: vi.fn(), getCurrentDeckIndex: () => 0, setCurrentDeckIndex: vi.fn() };
    vm.runInContext('init(deps)', ctx);
    await vm.runInContext('startStudy(0)', ctx);
    vm.runInContext('flipCard(); rateCard(2); rateCard(2); closeStudy(); flipCard(); rateCard(2)', ctx);
    expect(ctx.deps.state.todayCards).toBe(1);
});
it('ignores a late cloud response after the flashcard session is closed', async () => {
    const { ctx, els } = setup('../modules/study.js');
    let release;
    ctx.window.loadDeckFromSubcollection = () => new Promise(r => { release = r; });
    ctx.deps = { state: { decks: [{ id: 'a', cards: [] }] }, setCurrentDeckIndex: vi.fn() };
    vm.runInContext('init(deps)', ctx);
    const pending = vm.runInContext('startStudy(0)', ctx);
    vm.runInContext('closeStudy()', ctx);
    release({ cards: [{ q: 'Q', a: 'A' }] });
    await pending;
    expect(els.get('study-overlay').classList.contains('active')).toBe(false);
});
it('cancels quiz timers and delayed advancement when closing and reopening', () => {
    vi.useFakeTimers();
    try {
        const { ctx, els } = setup('../modules/quiz.js');
        ctx.deps = { state: { decks: [{ id: 'a', cards: [1,2,3,4].map(n => ({ q: `Q${n}`, a: `A${n}` })) }] }, gState: { totalCards: 0 }, awardXP: vi.fn() };
        vm.runInContext('init(deps); window.__quizStartClassic(0); answerQuiz(0,"A1","A1"); answerQuiz(0,"A1","A1"); closeQuiz(); window.__quizStartClassic(0)', ctx);
        vi.advanceTimersByTime(1500);
        expect(els.get('quiz-overlay').innerHTML).toContain('1 / 4');
        expect(ctx.deps.gState.totalCards).toBe(1);
        vm.runInContext('closeQuiz()', ctx);
        expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
});
