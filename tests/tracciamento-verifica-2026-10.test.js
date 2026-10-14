// Verifica 14/10/2026 dell'affidabilità del tracciamento (docs/VERIFICA_TRACCIAMENTO_2026-10-14.md).
// Dati sintetici, Firestore finto in memoria: nessun dato reale.
import { describe, it, expect } from 'vitest';
import { createRequire } from 'node:module';
import { noteReviewCompleted, noteCardRated } from '../core/studyMilestones.js';

const require = createRequire(import.meta.url);
const { handler } = require('../functions/telemetry.js');
const { createFakeFirestore } = require('./helpers/fakeFirestore.cjs');

function mem(seed = {}) {
    const m = new Map(Object.entries(seed));
    return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: k => m.delete(k) };
}
function telemetry() {
    const fake = createFakeFirestore({ now: () => Date.UTC(2026, 9, 14, 10) });
    const send = handler({ db: fake.db, admin: fake.admin, secret: () => 'sale-di-prova', now: () => Date.UTC(2026, 9, 14, 10), ipRateLimit: () => true });
    const post = async (body) => {
        const res = { code: 0, set() {}, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; } };
        await send({ method: 'POST', headers: {}, ip: '203.0.113.7', body }, res);
        return res.code;
    };
    return { fake, post };
}

// Difetto riprodotto: adminDashboard esclude i visitatori TEST_ (test automatici) dai percorsi,
// ma functions/telemetry.js contava le loro visite nei contatori del giorno (pageviews_<data>,
// sorgenti) e nella presenza "online ora". Due numeri della stessa dashboard con regole diverse.
describe('telemetria: visitatori di test (TEST_…)', () => {
    it('non entrano nei contatori di visite, sorgenti e presenza; l\'evento resta registrato', async () => {
        const { fake, post } = telemetry();
        expect(await post({ visitor: 'TEST_e2e_1', eventId: 'ev-1', type: 'session_start', page: '/app', source: 'diretto' })).toBe(202);
        expect(await post({ visitor: 'TEST_e2e_1', eventId: 'ev-2', type: 'landing_view', page: '/', source: 'diretto' })).toBe(202);
        const day = fake.rows.get('analytics/pageviews_2026-10-14');
        expect(day).toBeUndefined();                                                     // nessuna visita contata
        expect(fake.rows.has('analytics/presence/sessions/TEST_e2e_1')).toBe(false);     // non "online"
        expect(fake.rows.has('journeys/TEST_e2e_1/events/ev-1')).toBe(true);             // verificabile a parte
    });

    it('i visitatori normali restano contati come prima', async () => {
        const { fake, post } = telemetry();
        await post({ visitor: 'v-reale-1', eventId: 'ev-1', type: 'session_start', page: '/app', source: 'google' });
        await post({ visitor: 'v-reale-1', eventId: 'ev-1', type: 'session_start', page: '/app', source: 'google' });   // ritrasmissione
        const day = fake.rows.get('analytics/pageviews_2026-10-14');
        expect(day).toEqual({ app: 1, src_google: 1 });                                  // una volta sola
        expect(fake.rows.has('analytics/presence/sessions/v-reale-1')).toBe(true);
    });
});

// Definizioni delle tappe di studio (core/studyMilestones.js): documentate, qui fissate con dati sintetici.
describe('primo ripasso e ritorno: definizioni', () => {
    it('primo ripasso = sessione arrivata in fondo con almeno una carta valutata, una volta per dispositivo', () => {
        const s = mem();
        expect(noteReviewCompleted(s, '2026-10-14', 0).first).toBe(false);   // sessione senza voti
        expect(noteReviewCompleted(s, '2026-10-14', 3).first).toBe(true);
        expect(noteReviewCompleted(s, '2026-10-15', 3).first).toBe(false);   // non si ripete
    });
    it('ritorno = prima carta VALUTATA in un giorno di calendario successivo (non per forza il giorno dopo)', () => {
        const s = mem({ cortex_first_review_day: '2026-10-14' });
        expect(noteCardRated(s, '2026-10-14').returned).toBe(false);         // stesso giorno
        expect(noteCardRated(s, '2026-10-17')).toEqual({ returned: true, daysAfter: 3 });
        expect(noteCardRated(s, '2026-10-18').returned).toBe(false);         // una volta sola
    });
    it('senza primo ripasso registrato non c\'è ritorno', () => {
        expect(noteCardRated(mem(), '2026-10-15').returned).toBe(false);
    });
});

// Difetto riprodotto (browser, scripts/verifica-tracciamento-2026-10/consenso-app-open.cjs): app_open
// parte solo all'avvio; se il consenso arriva dopo (banner al primo accesso) track() lo scarta e il
// browser entra nel percorso ordinato appActivation solo dopo un refresh. session_start invece aspetta
// il consenso. Correzione: app_open inviato UNA volta all'accettazione esplicita, mai prima né se si rifiuta.
describe('app_open quando il consenso arriva dopo l\'avvio', () => {
    async function load(consent) {
        const { vi } = await import('vitest');
        vi.resetModules();
        const store = mem(consent ? { cortex_cookie_consent: consent } : {});
        const win = new EventTarget();
        const sent = [];
        win.__cxLogStep = (type) => sent.push(type);
        vi.stubGlobal('window', win);
        vi.stubGlobal('localStorage', store);
        const mod = await import('../core/analytics.js');
        return { mod, win, store, sent };
    }
    const accept = (h) => { h.store.setItem('cortex_cookie_consent', 'accepted'); h.win.dispatchEvent(new Event('cortex:consent-accepted')); };

    it('consenso già dato all\'avvio: inviato subito, una volta', async () => {
        const h = await load('accepted');
        h.mod.trackWhenConsented('app_open', { version: '1' });
        accept(h);
        expect(h.sent).toEqual(['app_open']);
    });
    it('consenso dato dopo l\'avvio: inviato all\'accettazione, una volta sola', async () => {
        const h = await load(null);
        h.mod.trackWhenConsented('app_open', { version: '1' });
        expect(h.sent).toEqual([]);                    // niente prima del consenso
        accept(h);
        accept(h);
        expect(h.sent).toEqual(['app_open']);
    });
    it('consenso rifiutato o blocco del tracciamento: mai inviato', async () => {
        const h = await load('declined');
        h.mod.trackWhenConsented('app_open', { version: '1' });
        h.win.dispatchEvent(new Event('cortex:consent-accepted'));   // evento senza consenso salvato
        expect(h.sent).toEqual([]);
        const h2 = await load(null);
        h2.store.setItem('cortex_no_track', '1');
        h2.mod.trackWhenConsented('app_open', { version: '1' });
        accept(h2);
        expect(h2.sent).toEqual([]);
    });
});
