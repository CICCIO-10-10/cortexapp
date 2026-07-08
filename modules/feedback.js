// modules/feedback.js
// Fase 5 — Estrazione da main.js
// Feedback community: submit, load lista, admin controls.
// Dipende da services/firebase.js per la connessione Firestore.
// Chiamato da main.js legacy via window.* e dai data-fn nel registry.

import {
    submitFeedback, loadFeedbackMessages,
    deleteFeedback, pinFeedback, replyFeedback
} from '../services/firebase.js';

/**
 * Inizializza il modulo feedback e registra le funzioni nel registry.
 * @param {Function} register - callback registry(name, fn)
 */
export function init(register) {
    if (register) {
        register('submitFeedback',       submitFeedback);
        register('loadFeedbackMessages', loadFeedbackMessages);
        register('deleteFeedback',       deleteFeedback);
        register('pinFeedback',          pinFeedback);
        register('replyFeedback',        replyFeedback);
    }
    window.submitFeedback       = submitFeedback;
    window.loadFeedbackMessages = loadFeedbackMessages;
    window.deleteFeedback       = deleteFeedback;
    window.pinFeedback          = pinFeedback;
    window.replyFeedback        = replyFeedback;
}

// Re-export per convenienza (altri moduli possono importare da qui)
export { submitFeedback, loadFeedbackMessages, deleteFeedback, pinFeedback, replyFeedback };
