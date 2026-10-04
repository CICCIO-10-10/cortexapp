// 04/10/2026 — "Script error." leggibile e dashboard che vede i campi nuovi degli eventi.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { browserContext, describeJsError } from '../core/analytics.js';
import summary from '../functions/journey-summary.cjs';

const ORIGIN = 'https://cortexapp.it';
describe('errori JS — niente più scartati in silenzio', () => {
  it('"Script error." diventa un motivo riconoscibile invece di sparire', () => {
    expect(describeJsError({ message: 'Script error.', filename: '', error: null }, ORIGIN)).toEqual({ reason: 'script_error_cross_origin', at: 'nascosto' });
  });
  it('errore nel nostro codice: messaggio + file:riga:colonna', () => {
    expect(describeJsError({ message: "TypeError: x is undefined", filename: ORIGIN + '/assets/app-BCPXdSoJ.js?v=1', lineno: 12, colno: 345, error: {} }, ORIGIN))
      .toEqual({ reason: 'TypeError: x is undefined', at: 'app-BCPXdSoJ.js:12:345' });
  });
  it('script di terzi: dominio indicato; estensioni e risorse ignorate', () => {
    expect(describeJsError({ message: 'boom', filename: 'https://accounts.google.com/gsi/client', error: {} }, ORIGIN)).toEqual({ reason: 'third_party: accounts.google.com: boom', at: 'accounts.google.com' });
    expect(describeJsError({ message: 'x', filename: 'chrome-extension://abc/c.js', error: {} }, ORIGIN)).toBeNull();
    expect(describeJsError({ message: '', filename: '', error: null }, ORIGIN)).toBeNull();
  });
  it('tipo di browser: in-app TikTok/Instagram, Safari iPhone, app Android', () => {
    const ios = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
    expect(browserContext(ios)).toBe('ios_safari');
    expect(browserContext('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 musical_ly_33.1.0 BytedanceWebview/d8a21c6')).toBe('inapp_tiktok');
    expect(browserContext('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Instagram 330.0.0')).toBe('inapp_instagram');
    expect(browserContext('Mozilla/5.0 (Linux; Android 14)', 'android_twa')).toBe('android_twa');
  });
});

describe('riepilogo errori — contesto dei js_error', () => {
  it('conta browser, ultimo passo e punto', () => {
    const now = Date.now();
    const r = summary.summarizeJourneys([
      { vid: 'a', type: 'js_error', ts: now - 1000, meta: { reason: 'script_error_cross_origin', type: 'inapp_tiktok', step: 'tolc_test_start', at: 'nascosto' } },
      { vid: 'b', type: 'js_error', ts: now - 2000, meta: { reason: 'script_error_cross_origin', type: 'inapp_tiktok', step: 'app_open', at: 'nascosto' } },
    ], {}, now);
    expect(r.errors.context.js_error.browser).toEqual({ inapp_tiktok: 2 });
    expect(r.errors.context.js_error.step).toEqual({ tolc_test_start: 1, app_open: 1 });
    expect(r.errors.reasons.js_error).toEqual({ script_error_cross_origin: 2 });
  });
});

describe('adminDashboard — i campi usati dal riepilogo arrivano davvero', () => {
  it('attempt, flow, variant, type, days_after, at sono tenuti nella proiezione dei meta', () => {
    const src = readFileSync(new URL('../functions/index.js', import.meta.url), 'utf8');
    const proj = src.slice(src.indexOf('const _m = x.meta || {};'), src.indexOf('(byVid[vid] = byVid[vid] || []).push'));
    for (const k of ['attempt', 'flow', 'variant', 'type', 'days_after', 'at']) expect(proj).toMatch(new RegExp('\\b' + k + ':'));
  });
});
