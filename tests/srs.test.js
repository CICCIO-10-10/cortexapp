/**
 * tests/srs.test.js — Cortex Unit Tests (Vitest)
 *
 * services/srs.js è documentato come modulo PURO (nessuna dipendenza da DOM,
 * localStorage o store globale) — quindi, a differenza di tests/unit.test.js,
 * qui importiamo ed eseguiamo direttamente il codice reale del modulo invece
 * di ricopiarne la logica. Copre il motore SM-2 usato per tutto lo studio a
 * ripetizione (gestione mazzi, scadenze, statistiche) — un bug qui rovina
 * silenziosamente l'esperienza di studio di ogni utente.
 *
 * Eseguire con: npm test
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { processAnswer, isDue, getDueCards, getDeckStats } from '../services/srs.js';

describe('processAnswer — algoritmo SM-2', () => {
    it('non muta la carta originale (immutabilità)', () => {
        const card = { q: 'Q', a: 'A', ease: 2.5, interval: 1, reps: 0 };
        const frozen = JSON.stringify(card);
        processAnswer(card, 2);
        expect(JSON.stringify(card)).toBe(frozen);
    });

    it('rating 0 ("Non sapevo") → reset interval a 1 e ease in calo', () => {
        const card = { ease: 2.5, interval: 20, reps: 5 };
        const out = processAnswer(card, 0);
        expect(out.interval).toBe(1);
        expect(out.ease).toBeCloseTo(2.3, 5);
        expect(out.reps).toBe(6);
    });

    it('rating 1 ("Difficile") → piccolo incremento, ease scende poco (anti Ease Hell)', () => {
        const card = { ease: 2.5, interval: 10, reps: 2 };
        const out = processAnswer(card, 1);
        expect(out.ease).toBeCloseTo(2.4, 5); // -0.10, non -0.15
        expect(out.interval).toBeGreaterThanOrEqual(10); // floor(10*1.2)=12, ma fuzzato ±5%
        expect(out.interval).toBeLessThanOrEqual(13);
    });

    it('rating 2 ("Sapevo") → interval cresce per ease, ease sale', () => {
        const card = { ease: 2.5, interval: 10, reps: 3 };
        const out = processAnswer(card, 2);
        expect(out.ease).toBeCloseTo(2.6, 5);
        // round(10*2.5)=25, con fuzz ±5% (~±1)
        expect(out.interval).toBeGreaterThanOrEqual(24);
        expect(out.interval).toBeLessThanOrEqual(26);
    });

    it('ease non scende mai sotto MIN_EASE (1.3)', () => {
        let card = { ease: 1.35, interval: 1, reps: 0 };
        card = processAnswer(card, 0); // -0.20 → andrebbe a 1.15, clampato a 1.3
        expect(card.ease).toBeGreaterThanOrEqual(1.3);
    });

    it('ease non sale mai sopra MAX_EASE (3.0)', () => {
        let card = { ease: 2.95, interval: 1, reps: 0 };
        card = processAnswer(card, 2); // +0.10 → andrebbe a 3.05, clampato a 3.0
        expect(card.ease).toBeLessThanOrEqual(3.0);
    });

    it('interval non supera mai il cap di 365 giorni', () => {
        const card = { ease: 3.0, interval: 300, reps: 10 };
        const out = processAnswer(card, 2); // 300*3.0=900, ben oltre il cap
        expect(out.interval).toBeLessThanOrEqual(365);
    });

    it('usa i default quando ease/interval/reps sono assenti (carta nuova)', () => {
        const out = processAnswer({ q: 'Q', a: 'A' }, 2);
        expect(out.ease).toBeCloseTo(2.6, 5); // default 2.5 + 0.10
        expect(out.reps).toBe(1);
    });

    it('rating non riconosciuto → ritorna la carta invariata', () => {
        const card = { ease: 2.5, interval: 5, reps: 1 };
        const out = processAnswer(card, 99);
        expect(out).toEqual(card);
    });

    it('imposta nextReview come stringa YYYY-MM-DD', () => {
        const out = processAnswer({ ease: 2.5, interval: 1, reps: 0 }, 2);
        expect(out.nextReview).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

describe('isDue — scadenza carta', () => {
    it('carta senza nextReview (nuova) è sempre in scadenza', () => {
        expect(isDue({})).toBe(true);
    });

    it('carta con nextReview nel passato è in scadenza', () => {
        expect(isDue({ nextReview: '2000-01-01' })).toBe(true);
    });

    it('carta con nextReview oggi è in scadenza', () => {
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,'0')}-${String(today.getDate()).padStart(2,'0')}`;
        expect(isDue({ nextReview: todayStr })).toBe(true);
    });

    it('carta con nextReview nel futuro NON è in scadenza', () => {
        expect(isDue({ nextReview: '2999-01-01' })).toBe(false);
    });
});

describe('getDueCards — filtro e ordinamento mazzo', () => {
    it('input non valido → array vuoto', () => {
        expect(getDueCards(null)).toEqual([]);
        expect(getDueCards(undefined)).toEqual([]);
    });

    it('esclude le carte non ancora in scadenza', () => {
        const cards = [
            { q: 'futura', nextReview: '2999-01-01' },
            { q: 'passata', nextReview: '2000-01-01' },
        ];
        const due = getDueCards(cards);
        expect(due).toHaveLength(1);
        expect(due[0].q).toBe('passata');
    });

    it('le carte nuove (senza nextReview) vanno in coda rispetto a quelle scadute', () => {
        const cards = [
            { q: 'nuova' },
            { q: 'scaduta-vecchia', nextReview: '2000-01-01' },
        ];
        const due = getDueCards(cards);
        expect(due.map(c => c.q)).toEqual(['scaduta-vecchia', 'nuova']);
    });

    it('tra due carte scadute, ordina per nextReview crescente (più vecchia prima)', () => {
        const cards = [
            { q: 'B', nextReview: '2020-06-01' },
            { q: 'A', nextReview: '2020-01-01' },
        ];
        const due = getDueCards(cards);
        expect(due.map(c => c.q)).toEqual(['A', 'B']);
    });
});

describe('getDeckStats — statistiche mazzo', () => {
    it('input non valido → contatori a zero', () => {
        expect(getDeckStats(null)).toEqual({ due: 0, new: 0, learning: 0, total: 0 });
    });

    it('classifica correttamente new / due / learning', () => {
        const cards = [
            { nextReview: undefined },        // new
            { nextReview: '2000-01-01' },      // due (passato)
            { nextReview: '2999-01-01' },       // learning (futuro)
        ];
        const stats = getDeckStats(cards);
        expect(stats).toEqual({ due: 1, new: 1, learning: 1, total: 3 });
    });
});
