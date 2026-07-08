/**
 * core/registry.js — Phase 9
 *
 * Registry esplicito dei handler per l'event bus.
 *
 * Perché esiste:
 *   Prima di Phase 9, eventBus usava window[fnName] per trovare i handler.
 *   Questo richiedeva che TUTTE le funzioni chiamate via data-fn fossero
 *   esposte su window — inquinando il global scope.
 *
 *   Con il registry, le funzioni vengono registrate esplicitamente:
 *     register('showPage', showPage);
 *   e il global scope resta pulito.
 *
 * Compatibilità:
 *   eventBus.js mantiene un fallback su window[fnName] per le funzioni
 *   registrate via HTML dinamico (onclick inline generato da JS) che
 *   devono ancora passare per window.
 *
 * Futuro (Phase 10+):
 *   Quando tutto l'HTML dinamico sarà convertito a data-fn,
 *   il fallback su window potrà essere rimosso.
 */

/** @type {Record<string, Function>} */
export const registry = Object.create(null);

/**
 * Registra un handler per l'event bus.
 * @param {string} name  - nome usato in data-fn="name"
 * @param {Function} fn  - funzione da invocare
 */
export function register(name, fn) {
    if (typeof fn !== 'function') return;   // guard per import opzionali
    registry[name] = fn;
}
