/**
 * core/eventBus.js  — Phase 9
 *
 * Sistema di event delegation che intercetta click su elementi
 * con attributo `data-fn`. Questo permette di:
 *   1. Rimuovere gli onclick="fn()" inline dall'HTML
 *   2. Non dipendere dal blocco WINDOW EXPORTS in main.js
 *   3. Testare i handler in isolamento
 *
 * Utilizzo nel HTML:
 *   <button data-fn="showPage" data-params='["home"]'>Home</button>
 *   <button data-fn="rateCard" data-params="[0]">No ❌</button>
 *   <button data-fn="openSettings">⚙️</button>
 *   <div data-fn="toggleGuideBody" data-self="true">…</div>
 *
 * Lookup order (Phase 9):
 *   1. registry (core/registry.js) — funzioni pure data-fn, non su window
 *   2. window[fnName]              — fallback per HTML dinamico (innerHTML)
 *
 * Quando tutto l'HTML dinamico sarà migrato a data-fn (Phase 10+),
 * il fallback su window potrà essere rimosso.
 */

import { registry } from './registry.js';

export function initEventBus() {
    document.addEventListener('click', (e) => {
        const target = e.target.closest('[data-fn]');
        if (!target) return;

        const fnName = target.dataset.fn;
        if (!fnName) return;

        // 1. Cerca nel registry esplicito; 2. fallback su window
        const fn = registry[fnName] ?? window[fnName];
        if (typeof fn !== 'function') {
            console.warn(`[eventBus] Funzione non trovata: "${fnName}"`);
            return;
        }

        // Parsa i parametri (JSON array) se presenti
        let params = [];
        if (target.dataset.params) {
            try {
                params = JSON.parse(target.dataset.params);
                if (!Array.isArray(params)) params = [params];
            } catch {
                console.warn(`[eventBus] data-params non valido su:`, target);
            }
        }

        // Se data-self è presente, passa l'elemento come primo argomento
        // Utile per handler che operano su this (es. toggleGuideBody, revealImage)
        if ('self' in target.dataset) {
            params = [target, ...params];
        }

        // Previeni il comportamento default solo per <a> e <button type="submit">
        const tag = target.tagName.toLowerCase();
        if (tag === 'a' || (tag === 'button' && target.type === 'submit')) {
            e.preventDefault();
        }

        fn(...params);
    }, { passive: false });


}
