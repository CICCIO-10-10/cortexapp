/**
 * js/utils.js — Funzioni di utilità pure (Phase 10)
 *
 * Nessuna dipendenza da main.js o dal DOM (tranne escapeHTML/sanitizeHTML
 * che usano document.createElement — sempre disponibile in browser).
 * Importabile da qualsiasi modulo senza rischio di dipendenze circolari.
 */

/**
 * Restituisce la data odierna come stringa YYYY-MM-DD nel fuso orario LOCALE.
 * IMPORTANTE: NON usare toISOString() che ritorna UTC — in Italia (UTC+2)
 * studiare tra mezzanotte e le 02:00 locali darebbe la data di ieri in UTC,
 * rompendo la streak e il reset del contatore giornaliero.
 */
export function todayStr() {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const g = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${g}`;
}

/** Differenza in giorni interi tra due date ISO string (b - a). */
export function daysDiff(a, b) {
    return Math.floor((new Date(b) - new Date(a)) / 86400000);
}

/**
 * Escape HTML — converte i caratteri speciali in entità HTML.
 * Usato per rendere sicuro il testo prima di inserirlo in innerHTML.
 */
export function escapeHTML(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

/**
 * Sanitize HTML parziale — escape completo ma ripristina un set ristretto
 * di tag sicuri (<br>, <b>, <strong>, <ul>, <li>).
 */
export function sanitizeHTML(str) {
    if (!str) return '';
    const temp = document.createElement('div');
    temp.textContent = str;
    return temp.innerHTML
        .replace(/&lt;br&gt;/g, '<br>')
        .replace(/&lt;b&gt;/g, '<b>')
        .replace(/&lt;\/b&gt;/g, '</b>')
        .replace(/&lt;strong&gt;/g, '<strong>')
        .replace(/&lt;\/strong&gt;/g, '</strong>')
        .replace(/&lt;ul&gt;/g, '<ul>')
        .replace(/&lt;\/ul&gt;/g, '</ul>')
        .replace(/&lt;li&gt;/g, '<li>')
        .replace(/&lt;\/li&gt;/g, '</li>');
}

/**
 * fetch con timeout — lancia AbortError se la risposta non arriva
 * entro `timeout` millisecondi (default 30s).
 */
export async function fetchWithTimeout(url, options, timeout = 30000) {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
        const response = await fetch(url, { ...options, signal: controller.signal });
        clearTimeout(id);
        return response;
    } catch (error) {
        clearTimeout(id);
        throw error;
    }
}

/**
 * Gestione centralizzata degli errori AI — mostra il messaggio giusto
 * e, dove ha senso, offre all'utente un'azione alternativa (es. "Studia ora").
 *
 * @param {Error}   err        — errore lanciato da callGemini / callGeminiProxy
 * @param {string}  context    — contesto es. 'flashcard', 'piano', 'riassunto'
 * @param {Function} showToast — fn showToast iniettata
 */
export function handleAIError(err, context = '', showToast = window.showToast) {
    const toast = showToast || window.showToast || (() => {});

    if (err?.isPaywall) {
        if (window.showPaywall) window.showPaywall('ai');
        return;
    }

    if (!navigator.onLine || err?.message?.includes('Failed to fetch')) {
        toast(`⚠️ Sei offline — ${context || 'l\'IA'} non è disponibile senza internet. Puoi comunque studiare con le flashcard esistenti.`, 'error');
        return;
    }

    if (err?.isDown || err?.message?.includes('503') || err?.message?.includes('500')) {
        toast('🔧 Gemini è momentaneamente irraggiungibile. Riprova tra qualche minuto — nel frattempo puoi studiare normalmente.', 'error');
        return;
    }

    if (err?.isRateLimit || err?.message?.includes('429')) {
        toast('⏳ Troppe richieste. Aspetta un minuto e riprova.', 'error');
        return;
    }

    if (err?.isAuthError || err?.isNoApiKey) {
        toast('🔑 Chiave AI non configurata. Accedi con Google o imposta la tua API key nelle Impostazioni.', 'error');
        return;
    }

    // Errore generico — non mostrare messaggi tecnici all'utente
    console.error(`[AI Error — ${context}]`, err);
    toast(`❌ ${context ? context.charAt(0).toUpperCase() + context.slice(1) + ' fallita' : 'Operazione AI fallita'}. Riprova tra qualche secondo.`, 'error');
}

/**
 * Fisher-Yates shuffle — rimescola un array in modo matematicamente uniforme O(N).
 * Non muta l'array originale; restituisce una copia rimescolata.
 */
export function fisherYatesShuffle(array) {
    const arr = [...array];
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
