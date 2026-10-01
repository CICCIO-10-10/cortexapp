import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import * as cards from '../modules/tolcErrorCards.js';
import summary from '../functions/journey-summary.cjs';

const { collectWrongAnswers, buildTolcErrorDeck, findDeckForAttempt, tolcErrorDeckId, aiNotesFromDeck, TOLC_ERROR_DECK_SOURCE } = cards;
const source = path => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');

const QS = [
    { s: 'Matematica', q: 'Quanto fa 2+2?', o: ['3', '4', '5', '6'], c: 1 },          // corretta
    { s: 'Matematica', q: 'Radice di 9?', o: ['1', '2', '3', '4'], c: 2 },             // sbagliata
    { s: 'Logica', q: 'Domanda lasciata in bianco', o: ['a', 'b'], c: 0 },              // in bianco
    { s: 'Inglese', q: 'Choose the past of go', o: ['goed', 'went'], c: 1 },            // sbagliata
    { s: 'Fisica', q: '', o: ['x', 'y'], c: 0 },                                         // dati incompleti
    { s: 'Fisica', q: 'Opzioni mancanti', c: 0 },                                        // dati incompleti
    { s: 'Fisica', q: 'Indice corretto non valido', o: ['x', 'y'], c: 7 },               // dati incompleti
];
const ANSWERS = [1, 0, null, 0, 1, 1, 0];

describe('tolcErrorCards (logica pura)', () => {
    it('crea carte solo per le risposte sbagliate e salta in bianco e dati incompleti', () => {
        const { wrong, skipped } = collectWrongAnswers(QS, ANSWERS);
        expect(wrong.map(w => w.question)).toEqual(['Radice di 9?', 'Choose the past of go']);
        expect(skipped).toBe(3);
        expect(wrong[0]).toMatchObject({ section: 'Matematica', correctLetter: 'C', correctText: '3', chosenLetter: 'A', chosenText: '1' });
    });

    it('usa il testo completo della risposta corretta e non inventa spiegazioni', () => {
        const { wrong } = collectWrongAnswers(QS, ANSWERS);
        const deck = buildTolcErrorDeck({ attemptId: 'tolc-i-abc', testKey: 'tolc-i', testName: 'TOLC-I', wrong, today: '2026-10-01' });
        expect(deck.cards).toHaveLength(2);
        expect(deck.cards[0].q).toBe('[Matematica] Radice di 9?');
        expect(deck.cards[0].a).toBe('C) 3  ·  Avevi scelto A) 1');
        expect(deck.cards.every(c => !/spiegaz/i.test(c.a))).toBe(true);
        expect(deck.text).toMatch(/non includono una spiegazione/);
        expect(deck).toMatchObject({ id: 'tolc-err-tolc-i-abc', source: TOLC_ERROR_DECK_SOURCE, cardsOrigin: 'tolc_bank', created: '2026-10-01', name: 'Errori TOLC-I · 01/10' });
        expect(deck.cards[0]).toMatchObject({ ease: 2.5, interval: 1, nextReview: '2026-10-01', reps: 0 });
    });

    it('non crea un mazzo senza errori o senza tentativo', () => {
        expect(buildTolcErrorDeck({ attemptId: 'x', wrong: [], today: '2026-10-01' })).toBeNull();
        expect(buildTolcErrorDeck({ attemptId: '', wrong: [{ question: 'q', correctText: 'a' }], today: '2026-10-01' })).toBeNull();
        expect(collectWrongAnswers(undefined, undefined)).toEqual({ wrong: [], skipped: 0 });
    });

    it('riconosce il mazzo già creato per lo stesso tentativo', () => {
        const decks = [{ id: 1 }, { id: tolcErrorDeckId('t-1'), sourceAttempt: 't-1' }];
        expect(findDeckForAttempt(decks, 't-1')).toBe(decks[1]);
        expect(findDeckForAttempt(decks, 't-2')).toBeNull();
    });

    it('prepara il testo per la spiegazione AI facoltativa senza la risposta scelta', () => {
        const { wrong } = collectWrongAnswers(QS, ANSWERS);
        const deck = buildTolcErrorDeck({ attemptId: 'a', testName: 'TOLC-I', wrong, today: '2026-10-01' });
        const notes = aiNotesFromDeck(deck);
        expect(notes).toMatch(/Risposta corretta: C\) 3/);
        expect(notes).not.toMatch(/Avevi scelto/);
    });
});

function deckModule({ loggedIn = false } = {}) {
    const store = new Map();
    const tracked = [];
    const studied = [];
    const ctx = vm.createContext({
        localStorage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) },
        window: { _fbLoggedIn: loggedIn, showToast: vi.fn(), showPage: vi.fn() },
        document: { getElementById: () => null, createElement: () => ({ style: {}, setAttribute() {}, querySelector: () => ({}) }), body: { appendChild() {} } },
        state: { decks: [] }, saveState: vi.fn(),
        startStudyById: async id => { studied.push(id); },
        track: (name, params) => tracked.push([name, params || {}]),
        todayStr: () => '2026-10-01', setTimeout, console, JSON, Date, Math, String, Array, Promise,
        ...cards,
    });
    vm.runInContext(source('../modules/tolcErrorDeck.js'), ctx);
    return { ctx, store, tracked, studied };
}

describe('tolcErrorDeck (salvataggio e studio)', () => {
    const st = { attemptId: 'tolc-i-xyz', key: 'tolc-i', test: { nome: 'TOLC-I' }, qs: QS, answers: ANSWERS };

    it('ospite: crea il mazzo in locale, avvia lo studio e non duplica con doppio click', async () => {
        const { ctx, tracked, studied } = deckModule();
        ctx.st = st;
        const [a, b] = await Promise.all([
            vm.runInContext('createAndStudyTolcErrorDeck(st, x => x)', ctx),
            vm.runInContext('createAndStudyTolcErrorDeck(st, x => x)', ctx),
        ]);
        expect([a.ok, b.ok].sort()).toEqual([false, true]);
        const again = await vm.runInContext('createAndStudyTolcErrorDeck(st, x => x)', ctx);
        expect(again).toMatchObject({ ok: true, created: false });
        expect(ctx.state.decks).toHaveLength(1);
        expect(studied).toEqual(['tolc-err-tolc-i-xyz', 'tolc-err-tolc-i-xyz']);
        expect(tracked.filter(([n]) => n === 'tolc_error_deck_created')).toEqual([['tolc_error_deck_created', { count: 2, mode: 'local', type: 'guest' }]]);
        expect(JSON.stringify(tracked)).not.toMatch(/Radice|past of go/);
    });

    it('nessun errore utilizzabile: nessun mazzo e nessuno studio', async () => {
        const { ctx, studied } = deckModule({ loggedIn: true });
        ctx.st = { ...st, attemptId: 'z', answers: [1, 2, null, 1, null, null, null] };
        const res = await vm.runInContext('createAndStudyTolcErrorDeck(st, x => x)', ctx);
        expect(res).toMatchObject({ ok: false, reason: 'no_errors' });
        expect(ctx.state.decks).toHaveLength(0);
        expect(studied).toHaveLength(0);
    });

    it('i passaggi del funnel scattano una sola volta e il login conta solo per chi era ospite', async () => {
        const { ctx, tracked } = deckModule();
        ctx.st = st;
        await vm.runInContext('createAndStudyTolcErrorDeck(st, x => x)', ctx);
        const deck = ctx.state.decks[0];
        ctx.deck = deck;
        vm.runInContext("window.__cxTolcErrorStudyEvent('first_rate', deck); window.__cxTolcErrorStudyEvent('first_rate', deck)", ctx);
        vm.runInContext("window.__cxTolcErrorStudyEvent('completed', deck, { count: 2 }); window.__cxTolcErrorStudyEvent('completed', deck, { count: 2 })", ctx);
        vm.runInContext('window.__cxTolcErrorLoginDone(); window.__cxTolcErrorLoginDone()', ctx);
        vm.runInContext("window.__cxTolcErrorStudyEvent('first_rate', { id: 'other', source: 'manual' })", ctx);
        const names = tracked.map(([n]) => n);
        expect(names.filter(n => n === 'tolc_error_first_card_rated')).toHaveLength(1);
        expect(names.filter(n => n === 'tolc_error_session_completed')).toHaveLength(1);
        expect(names.filter(n => n === 'tolc_error_deck_login_completed')).toHaveLength(1);
    });

    it('account già loggato: il login successivo non viene contato come conversione', async () => {
        const { ctx, tracked } = deckModule({ loggedIn: true });
        ctx.st = st;
        await vm.runInContext('createAndStudyTolcErrorDeck(st, x => x)', ctx);
        vm.runInContext('window.__cxTolcErrorLoginDone()', ctx);
        expect(tracked.find(([n]) => n === 'tolc_error_deck_created')[1].type).toBe('account');
        expect(tracked.some(([n]) => n === 'tolc_error_deck_login_completed')).toBe(false);
    });
});

describe('study.js → hook mazzo errori TOLC', () => {
    function element() {
        const classes = new Set();
        return { style: { removeProperty(key) { delete this[key]; } }, classList: { add: x => classes.add(x), remove: x => classes.delete(x), contains: x => classes.has(x) },
            dataset: {}, innerHTML: '', textContent: '', querySelector: () => element(), addEventListener() {}, remove() {}, parentNode: { insertBefore() {} } };
    }
    it('segnala prima valutazione, completamento e chiusura solo per i mazzi errori TOLC', async () => {
        const calls = [];
        const data = new Map([['cortex_daily_goal', '10000']]);
        const ctx = vm.createContext({ document: { getElementById: () => element(), querySelectorAll: () => [], addEventListener() {}, createElement: element },
            localStorage: { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, String(v)), removeItem: k => data.delete(k) },
            window: { dispatchEvent: vi.fn(), __cxTolcErrorStudyEvent: (step, deck, extra) => calls.push([step, deck && deck.id, extra && extra.count]) },
            Event, console, setTimeout, clearTimeout, setInterval, clearInterval,
            t: k => k, TRANSLATIONS: { it: {} }, todayStr: () => '2026-10-01', processAnswer: () => ({ nextReview: '2026-10-02' }),
            track: vi.fn(), bumpActivation: vi.fn(), renderDecks: vi.fn(), updateMemoryBank: vi.fn() });
        vm.runInContext(source('../modules/study.js'), ctx);
        ctx.deps = { state: { decks: [
            { id: 'tolc-err-a', source: 'tolc_errors_local', cards: [{ id: 'c1', q: 'Q', a: 'A' }] },
            { id: 'plain', cards: [{ id: 'p1', q: 'Q', a: 'A' }] },
        ], todayCards: 0 }, saveState: vi.fn(), awardXP: vi.fn(), getCurrentDeckIndex: () => 0, setCurrentDeckIndex: vi.fn() };
        vm.runInContext('init(deps)', ctx);
        await vm.runInContext('startStudyById("tolc-err-a")', ctx);
        vm.runInContext('flipCard(); rateCard(2); closeStudy()', ctx);
        await vm.runInContext('startStudyById("plain")', ctx);
        vm.runInContext('flipCard(); rateCard(2); closeStudy()', ctx);
        expect(calls).toEqual([['first_rate', 'tolc-err-a', undefined], ['completed', 'tolc-err-a', 1], ['closed', 'tolc-err-a', undefined]]);
    });
});

describe('journey-summary → funnel mazzo errori locale', () => {
    it('conta il percorso in ordine e tiene il login come ramo con denominatore ospiti', () => {
        const ev = (vid, type, ts, meta) => ({ vid, type, ts, meta });
        const events = [
            ev('g', 'tolc_sim_complete', 1), ev('g', 'tolc_error_deck_created', 2, { type: 'guest' }), ev('g', 'tolc_error_first_study', 3),
            ev('g', 'tolc_error_first_card_rated', 4), ev('g', 'tolc_error_session_completed', 5), ev('g', 'tolc_error_deck_login_completed', 6),
            ev('a', 'tolc_sim_complete', 1), ev('a', 'tolc_error_deck_created', 2, { type: 'account' }), ev('a', 'tolc_error_first_study', 3),
            ev('x', 'tolc_error_first_card_rated', 1), ev('x', 'tolc_sim_complete', 2),
        ];
        const { v3 } = summary.summarizeJourneys(events);
        expect(v3.paths.tolcLocalDeck).toEqual({ tolc_sim_complete: 3, tolc_error_deck_created: 2, tolc_error_first_study: 2, tolc_error_first_card_rated: 1, tolc_error_session_completed: 1 });
        expect(v3.steps.tolc_error_deck_login_completed).toBe(1);
        expect(v3.breakdown.tolc_deck_type).toEqual({ guest: 1, account: 1 });
    });
});
