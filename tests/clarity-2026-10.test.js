// 04/10/2026 — rilievi Clarity: abbandoni TOLC per tentativo, percorso completo legato al tentativo.
import { describe, it, expect } from 'vitest';
import summary from '../functions/journey-summary.cjs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { validateEvent } = require('../functions/telemetry.js');

const ev = (vid, type, ts, meta = {}) => ({ vid, type, ts, meta });
const MIN = 60 * 1000;

describe('tentativi TOLC — completato/abbandonato sul tentativo, non sull\'evento', () => {
    const now = 10 * 60 * MIN;
    it('avvio → pagina nascosta → ritorno → consegna = 1 tentativo completato, 0 abbandoni', () => {
        const a = { attempt: 'tolc-i-a1' };
        const r = summary.summarizeJourneys([
            ev('v', 'tolc_test_start', 1 * MIN, a), ev('v', 'tolc_first_answer', 2 * MIN, a),
            ev('v', 'tolc_test_hidden', 3 * MIN, a), ev('v', 'tolc_test_resumed', 4 * MIN, { ...a, duration: 60 }),
            ev('v', 'tolc_test_hidden', 5 * MIN, a), ev('v', 'tolc_test_resumed', 6 * MIN, a),     // doppia pausa
            ev('v', 'tolc_sim_complete', 30 * MIN, a),
        ], {}, now);
        expect(r.v3.attempts).toMatchObject({ total: 1, completed: 1, abandoned: 0, in_progress: 0, hidden: 1, hidden_then_completed: 1 });
    });
    it('più test nella stessa sessione sono tentativi distinti; uscita esplicita e inattività = abbandono', () => {
        const r = summary.summarizeJourneys([
            ev('v', 'tolc_test_start', 1 * MIN, { attempt: 't1' }), ev('v', 'tolc_sim_complete', 20 * MIN, { attempt: 't1' }),
            ev('v', 'tolc_test_start', 21 * MIN, { attempt: 't2' }), ev('v', 'tolc_test_quit', 22 * MIN, { attempt: 't2', how: 'button' }),
            ev('v', 'tolc_test_start', 23 * MIN, { attempt: 't3' }), ev('v', 'tolc_test_hidden', 24 * MIN, { attempt: 't3' }),   // mai tornato, > 30 min
            ev('w', 'tolc_test_start', now - 5 * MIN, { attempt: 't4' }),                                                       // ancora in corso
        ], {}, now);
        expect(r.v3.attempts).toMatchObject({ total: 4, completed: 1, abandoned: 2, abandoned_explicit: 1, in_progress: 1 });
        expect(r.v3.attempts.abandonAfterMinutes).toBe(30);
    });
    it('eventi duplicati non gonfiano i conteggi; eventi senza id (client vecchi) solo contati', () => {
        const a = { attempt: 'd1' };
        const r = summary.summarizeJourneys([
            ev('v', 'tolc_test_start', 1, a), ev('v', 'tolc_test_start', 2, a), ev('v', 'tolc_sim_complete', 3, a), ev('v', 'tolc_sim_complete', 4, a),
            ev('x', 'tolc_test_start', 1), ev('x', 'tolc_test_quit', 2),
        ], {}, now);
        expect(r.v3.attempts).toMatchObject({ total: 1, completed: 1, legacy_events_without_attempt: 2 });
        expect(r.v3.attempts.path.tolc_test_start).toBe(1);
    });
    it('percorso per tentativo: dal test al salvataggio riuscito, AI separata dal ripasso locale', () => {
        const a = { attempt: 'p1' };
        const r = summary.summarizeJourneys([
            ev('v', 'tolc_test_start', 1, a), ev('v', 'tolc_first_answer', 2, a), ev('v', 'tolc_sim_complete', 3, a),
            ev('v', 'tolc_errors_generate_click', 4, a), ev('v', 'tolc_error_deck_created', 5, a), ev('v', 'tolc_error_first_card_rated', 6, a),
            ev('v', 'tolc_error_session_completed', 7, a), ev('v', 'tolc_error_save_prompt_login_click', 8, a), ev('v', 'tolc_error_deck_login_completed', 9, a),
            ev('v', 'tolc_error_cards_generated', 10, a),   // percorso AI: non è un passo del ripasso locale
        ], {}, now);
        expect(Object.values(r.v3.attempts.path)).toEqual([1, 1, 1, 1, 1, 1, 1, 1, 1]);
    });
});

describe('telemetria — id del tentativo ammesso', () => {
    it('attempt passa, chiavi non previste no', () => {
        const e = validateEvent({ visitor: 'v1', eventId: 'e1', type: 'tolc_test_hidden', meta: { attempt: 'tolc-i-mut2-abc', n: 3, answered: 3 } });
        expect(e.meta).toEqual({ attempt: 'tolc-i-mut2-abc', n: 3 });
    });
});
