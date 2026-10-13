// Test 13/10/2026: dalla pagina /unime "Studia <materia> con Cortex" l'app non perde la materia.
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { materiaDaParametri, trovaMazzo } from '../core/materiaArrival.js';

describe('Arrivo con la materia scelta su /unime', () => {
  it('usa il nome leggibile se c\'è, altrimenti ricostruisce dallo slug', () => {
    expect(materiaDaParametri('?guest=1&area=universita&materia=storia-della-filosofia-antica&nome=Storia%20della%20filosofia%20antica'))
      .toBe('Storia della filosofia antica');
    expect(materiaDaParametri('?guest=1&area=universita&materia=storia-della-filosofia-antica')).toBe('Storia della filosofia antica');
  });
  it('ignora link senza materia, slug strani e link TOLC', () => {
    expect(materiaDaParametri('?guest=1&area=universita')).toBe(null);
    expect(materiaDaParametri('?materia=<script>')).toBe(null);
    expect(materiaDaParametri('?sim=tolc-e&materia=fisica')).toBe(null);
  });
  it('riconosce una materia già creata anche con maiuscole e accenti diversi', () => {
    const decks = [{ id: 1, name: 'Analisi Matematica' }, { id: 2, name: 'Etica e Libertà' }];
    expect(trovaMazzo(decks, 'etica e liberta').id).toBe(2);
    expect(trovaMazzo(decks, 'Fisica')).toBe(null);
  });
  it('/unime manda anche il nome; l\'onboarding non chiede di nuovo cosa preparare', () => {
    expect(fs.readFileSync(new URL('../unime.html', import.meta.url), 'utf8')).toContain("+'&nome='+encodeURIComponent(ins.nome)");
    expect(fs.readFileSync(new URL('../core/onboarding.js', import.meta.url), 'utf8')).toContain("if (arrivoDaMateria()) return 'materia_arrival';");
  });
});

describe('Riquadro notifiche: "Non ora" e "Attiva" chiudono con un clic', () => {
  it('i due pulsanti passano l\'elemento al gestore (data-self)', () => {
    const m = fs.readFileSync(new URL('../main.js', import.meta.url), 'utf8');
    expect(m).toContain('<button data-fn="notifyAndDismiss" data-self>Attiva</button>');
    expect(m).toContain('<button data-fn="dismissParent" data-self');
  });
});

describe('Analisi: niente Clarity/GA4 fuori da cortexapp.it', () => {
  const src = fs.readFileSync(new URL('../public/cortex-consent.js', import.meta.url), 'utf8');
  const run = (href, consent) => {
    const u = new URL(href);
    const added = [];
    const store = { cortex_cookie_consent: consent };
    const win = {
      location: { protocol: u.protocol, hostname: u.hostname, pathname: u.pathname, search: '', reload() {} },
      localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => { store[k] = v; } },
    };
    const doc = { readyState: 'complete', head: { appendChild: el => added.push(el.src) }, body: { appendChild() {} },
      createElement: () => ({ setAttribute() {}, addEventListener() {}, style: {} }), getElementById: () => null, addEventListener() {} };
    new Function('window', 'document', 'location', 'localStorage', 'URLSearchParams', src)(win, doc, win.location, win.localStorage, URLSearchParams);
    return added.join(' ');
  };
  it('sul sito vero, con consenso, si caricano', () => {
    const s = run('https://cortexapp.it/tolc-e', 'accepted');
    expect(s).toContain('clarity.ms'); expect(s).toContain('googletagmanager');
  });
  it('in locale o senza consenso no', () => {
    expect(run('http://127.0.0.1:4177/app', 'accepted')).toBe('');
    expect(run('http://localhost:5173/', 'accepted')).toBe('');
    expect(run('https://cortexapp.it/', 'declined')).toBe('');
  });
});
