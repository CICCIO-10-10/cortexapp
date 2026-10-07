// 07/10/2026: se gstatic non risponde l'app deve caricare Firebase dalla copia locale.
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';

const app = readFileSync(new URL('../app.html', import.meta.url), 'utf8');
const sri = { app: '4gq9w/AGf72FXdNQ3Kn3EqWP7633NbCMjpYHt8YCZyXf23o2opcuAr4cif41tLrC', auth: 'xtdq4MQqPj1dB5DQsuw9O7dh4kHhMP/Wp5u8O1jiaWiou13ZfJIgiccjtVK2pBhL',
  firestore: 'Qgqc/HETq5lqJnRDqWnV1AZGw3pgMYNUVaqLLN1W/55XuWK94epwbCQrOvdoh1Zo', storage: 'yTXgVdKIoM5XuQZ1AGw9zFUgmu45OeHYpGDbbWtXHu/qOJxneVAXbw5Rh5CGninE' };

describe('Firebase di riserva', () => {
  it('app.html carica la copia locale solo se gstatic non ha caricato', () => {
    const i = app.indexOf('firebase-messaging-compat.js'), j = app.indexOf('__cxFirebaseFallback');
    expect(i).toBeGreaterThan(0); expect(j).toBeGreaterThan(i);
    expect(app).toContain("/vendor/firebase/10.8.0/firebase-' + need[i] + '-compat.js");
  });
  it('i file locali sono identici a quelli di gstatic (stesso hash SRI)', () => {
    for (const m of ['app', 'auth', 'firestore', 'storage', 'functions', 'messaging']) {
      const p = new URL(`../public/vendor/firebase/10.8.0/firebase-${m}-compat.js`, import.meta.url);
      expect(existsSync(p), m).toBe(true);
      if (sri[m]) expect(createHash('sha384').update(readFileSync(p)).digest('base64'), m).toBe(sri[m]);
    }
  });
});
