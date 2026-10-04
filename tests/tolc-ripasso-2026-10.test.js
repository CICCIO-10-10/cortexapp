// Test 04/10/2026: tappe di studio, riepilogo per la ripresa dopo l'accesso, funnel della
// dashboard e meta ammessi dalla telemetria. Logica reale dei moduli, nessun servizio esterno.
import { describe, it, expect, vi } from 'vitest';
import fs from 'node:fs';
import vm from 'node:vm';
import { noteReviewCompleted, noteCardRated, daysBetween, FIRST_REVIEW_KEY } from '../core/studyMilestones.js';
import * as cards from '../modules/tolcErrorCards.js';
import summary from '../functions/journey-summary.cjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateEvent } = require('../functions/telemetry.js');

function memStore() {
    const m = new Map();
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k), m };
}

describe('studyMilestones — primo ripasso completato e ritorno in un giorno successivo', () => {
    it('il primo ripasso conta una volta sola e solo con almeno una carta valutata', () => {
        const s = memStore();
        expect(noteReviewCompleted(s, '2026-10-04', 0).first).toBe(false);
        expect(noteReviewCompleted(s, '2026-10-04', 3).first).toBe(true);
        expect(noteReviewCompleted(s, '2026-10-04', 5).first).toBe(false);
        expect(noteReviewCompleted(s, '2026-10-06', 5).first).toBe(false);
        expect(s.getItem(FIRST_REVIEW_KEY)).toBe('2026-10-04');
    });

    it('studiare lo stesso giorno non è un ritorno; il primo giorno successivo sì, una volta', () => {
        const s = memStore();
        expect(noteCardRated(s, '2026-10-04').returned).toBe(false);          // prima del primo ripasso
        noteReviewCompleted(s, '2026-10-04', 2);
        expect(noteCardRated(s, '2026-10-04').returned).toBe(false);          // stesso giorno
        expect(noteCardRated(s, '2026-10-06')).toEqual({ returned: true, daysAfter: 2 });
        expect(noteCardRated(s, '2026-10-07').returned).toBe(false);          // già contato
    });

    it('date non valide o storage che fallisce non generano eventi', () => {
        const broken = { getItem() { throw new Error('x'); }, setItem() { throw new Error('quota'); } };
        expect(noteReviewCompleted(broken, '2026-10-04', 3).first).toBe(false);
        expect(noteCardRated(memStore(), 'ieri').returned).toBe(false);
        expect(daysBetween('2026-10-31', '2026-11-01')).toBe(1);
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);              // cambio ora legale
    });
});

describe('ripresa dopo l\'accesso — riepilogo del risultato TOLC', () => {
    const now = Date.UTC(2026, 9, 4, 10);
    it('salva solo numeri e identificativi del tentativo, mai domande o risposte', () => {
        const rec = cards.buildResumeRecord({ attemptId: 'tolc-i-abc', deckId: 'tolc-err-tolc-i-abc', testName: 'TOLC-I', correct: 12, total: 50, nWrong: 9, now });
        expect(rec).toEqual({ v: 1, attemptId: 'tolc-i-abc', deckId: 'tolc-err-tolc-i-abc', testName: 'TOLC-I', correct: 12, total: 50, nWrong: 9, reason: 'result_login', ts: now });
        expect(cards.buildResumeRecord({ attemptId: '' })).toBeNull();
    });
    it('scarta record malformati, troppo vecchi o nel futuro', () => {
        const rec = cards.buildResumeRecord({ attemptId: 'a', now });
        expect(cards.parseResumeRecord(JSON.stringify(rec), now + 1000)).toMatchObject({ attemptId: 'a' });
        expect(cards.parseResumeRecord(JSON.stringify(rec), now + 8 * 864e5)).toBeNull();
        expect(cards.parseResumeRecord(JSON.stringify({ ...rec, ts: now + 3600e3 }), now)).toBeNull();
        expect(cards.parseResumeRecord('{rotto', now)).toBeNull();
        expect(cards.parseResumeRecord(JSON.stringify({ ...rec, v: 2 }), now)).toBeNull();
    });
});

describe('tolcErrorDeck — accesso dal risultato senza perdere errori e risultato', () => {
    const QS = [
        { s: 'Matematica', q: 'Quanto fa 2+2?', o: ['3', '4', '5'], c: 1 },
        { s: 'Logica', q: 'Se A allora B…', o: ['vero', 'falso'], c: 0 },
        { s: 'Matematica', q: 'Radice di 9?', o: ['3', '9'], c: 0 },
    ];
    const source = p => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/^import .*;\r?\n/gm, '').replace(/\bexport /g, '');
    function load({ loggedIn = false, firebaseUnavailable = false } = {}) {
        const store = memStore();
        const tracked = [], logins = [], studied = [];
        const elements = {};
        const mk = () => { const el = { style: {}, children: [], setAttribute() {}, append(...c) { this.children.push(...c); }, remove() { delete elements[this.id]; } }; return el; };
        const ctx = vm.createContext({
            localStorage: store,
            window: { _fbLoggedIn: loggedIn, _firebaseUnavailable: firebaseUnavailable, showToast: vi.fn(), __guestLogin: () => logins.push('guest'), __cxModulesReady: true },
            document: { getElementById: id => elements[id] || null, createElement: mk, querySelectorAll: () => [], body: { appendChild(el) { elements[el.id] = el; } } },
            state: { decks: [] }, saveState: vi.fn(),
            startStudyById: async id => { studied.push(id); },
            track: (n, p) => tracked.push([n, p || {}]),
            todayStr: () => '2026-10-04', setTimeout: () => 0, clearTimeout: () => {}, console, JSON, Date, Math, String, Array, Promise, Number,
            ...cards,
        });
        vm.runInContext(source('../modules/tolcErrorDeck.js'), ctx);
        return { ctx, store, tracked, logins, studied, elements };
    }
    const st = { attemptId: 'tolc-i-r1', key: 'tolc-i', test: { nome: 'TOLC-I' }, qs: QS, answers: [0, 1, null] };

    it('prima dell\'accesso crea il mazzo errori e salva il riepilogo; al ritorno propone il ripasso', async () => {
        const { ctx, store, tracked, logins, studied, elements } = load();
        ctx.st = st;
        const res = vm.runInContext('saveTolcResultAndLogin(st, x => x, { correct: 0, total: 3, nWrong: 2 })', ctx);
        expect(res).toEqual({ ok: true, deckId: 'tolc-err-tolc-i-r1' });
        expect(logins).toEqual(['guest']);
        expect(ctx.state.decks.map(d => d.id)).toEqual(['tolc-err-tolc-i-r1']);
        const rec = JSON.parse(store.getItem(cards.TOLC_RESUME_KEY));
        expect(rec).toMatchObject({ deckId: 'tolc-err-tolc-i-r1', nWrong: 2, total: 3 });
        expect(JSON.stringify(rec)).not.toMatch(/2\+2|Radice|vero/);
        // ritorno: la proposta compare una volta e apre lo studio dello stesso mazzo
        expect(vm.runInContext('maybeShowTolcResume()', ctx)).toBe(true);
        expect(store.getItem(cards.TOLC_RESUME_KEY)).toBeNull();
        elements['tolc-resume-card'].children.find(c => c.id === 'tolc-resume-go').onclick();
        expect(studied).toEqual(['tolc-err-tolc-i-r1']);
        expect(vm.runInContext('maybeShowTolcResume()', ctx)).toBe(false);
        const names = tracked.map(([n]) => n);
        expect(names).toEqual(['tolc_error_deck_created', 'tolc_result_login_click', 'tolc_resume_shown', 'tolc_resume_click']);
    });

    it('se il mazzo non è in questo spazio dati (altro account) la proposta non compare e il record si pulisce', () => {
        const { ctx, store } = load();
        store.setItem(cards.TOLC_RESUME_KEY, JSON.stringify(cards.buildResumeRecord({ attemptId: 'x', deckId: 'tolc-err-x', now: Date.now() })));
        let shown = true;
        for (let i = 0; i <= 13; i++) shown = vm.runInContext('maybeShowTolcResume(' + i + ')', ctx);
        expect(shown).toBe(false);
        expect(store.getItem(cards.TOLC_RESUME_KEY)).toBeNull();
    });

    it('senza SDK Firebase niente accesso: si resta sul ripasso locale', () => {
        const { ctx, logins, store } = load({ firebaseUnavailable: true });
        ctx.st = st;
        expect(vm.runInContext('saveTolcResultAndLogin(st, x => x, { nWrong: 2 })', ctx)).toMatchObject({ ok: false, reason: 'auth_unavailable' });
        expect(logins).toEqual([]);
        expect(store.getItem(cards.TOLC_RESUME_KEY)).toBeNull();
    });
});

describe('journey-summary — percorsi nuovi e rami', () => {
    const ev = (vid, type, ts, meta) => ({ vid, type, ts, meta });
    it('prova TOLC contata dall\'avvio reale anche con link diretto (senza selettore/intro)', () => {
        const events = [
            ev('sel', 'tolc_selector_viewed', 1), ev('sel', 'tolc_type_picked', 2), ev('sel', 'tolc_intro_viewed', 3), ev('sel', 'tolc_test_start', 4), ev('sel', 'tolc_first_answer', 5), ev('sel', 'tolc_sim_complete', 6),
            ev('dir', 'tolc_test_start', 1), ev('dir', 'tolc_first_answer', 2), ev('dir', 'tolc_sim_complete', 3),
        ];
        const { v3 } = summary.summarizeJourneys(events);
        expect(v3.paths.tolc.tolc_sim_complete).toBe(1);   // percorso storico (dal selettore): invariato
        expect(v3.paths.tolcAttempt).toEqual({ tolc_test_start: 2, tolc_first_answer: 2, tolc_sim_complete: 2 });
        expect(v3.steps.tolc_sim_complete).toBe(1);        // steps storici non sovrascritti
    });

    it('primo ripasso → ritorno in ordine, con tipo di account e giorni', () => {
        const events = [
            ev('g', 'review_first_completed', 1, { type: 'guest', flow: 'tolc_errors' }), ev('g', 'study_returned_next_day', 2, { type: 'guest', days_after: 1 }),
            ev('a', 'review_first_completed', 1, { type: 'account', flow: 'deck' }),
            ev('z', 'study_returned_next_day', 1, { days_after: 3 }),   // senza primo ripasso nel campione: non entra nel percorso
        ];
        const { v3 } = summary.summarizeJourneys(events);
        expect(v3.paths.review).toEqual({ review_first_completed: 2, study_returned_next_day: 1 });
        expect(v3.breakdown.review_first_type).toEqual({ guest: 1, account: 1 });
        expect(v3.breakdown.review_first_flow).toEqual({ tolc_errors: 1, deck: 1 });
    });

    it('abbandono TOLC separato da chi poi consegna; varianti onboarding; errori SDK', () => {
        const now = Date.now();
        const events = [
            ev('q1', 'tolc_test_quit', now - 5), ev('q1', 'tolc_sim_complete', now - 1),
            ev('q2', 'tolc_test_quit', now - 5),
            ev('o1', 'onboarding_skipped', now - 3, { step: 0 }), ev('o2', 'onboarding_skipped', now - 3, { variant: 'single_screen' }),
            ev('o3', 'onboarding_bypassed', now - 3, { reason: 'tolc_arrival' }),
            ev('f', 'firebase_sdk_unavailable', now - 2, { reason: 'not_loaded' }),
        ];
        const r = summary.summarizeJourneys(events);
        expect(r.v3.breakdown.tolc_quit_then_completed).toBe(1);
        expect(r.v3.breakdown.tolc_quit_not_completed).toBe(1);
        expect(r.v3.breakdown.onboarding_variant).toEqual({ 'pre_2026_09_29:skipped': 1, 'single_screen:skipped': 1 });
        expect(r.v3.breakdown.onboarding_bypass_reason).toEqual({ tolc_arrival: 1 });
        expect(r.errors.browsers.firebase_sdk_unavailable).toBe(1);
        expect(r.errors.reasons.firebase_sdk_unavailable).toEqual({ not_loaded: 1 });
    });
});

describe('telemetria — meta ammessi', () => {
    const base = { visitor: 'v1', eventId: 'e1', type: 'tolc_sim_complete' };
    it('tiene codici, punteggi, varianti e tipo di account', () => {
        const e = validateEvent({ ...base, meta: { test: 'tolc-i', pct: 40, variant: 'single_screen', account_type: 'guest', days_after: 2, last_step: 2 } });
        expect(e.meta).toEqual({ test: 'tolc-i', pct: 40, variant: 'single_screen', account_type: 'guest', days_after: 2, last_step: 2 });
    });
    it('continua a scartare chiavi non previste e oggetti annidati', () => {
        const e = validateEvent({ ...base, meta: { email: 'a@b.it', question: 'testo', uid: 'abc', nested: { a: 1 } } });
        expect(e.meta).toEqual({});
    });
});
