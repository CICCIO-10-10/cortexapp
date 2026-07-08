/**
 * widget.js — Cortex Homescreen Widget Data
 *
 * STATO: SCHELETRO — aggiornamento dati completo, rendering widget da fare
 *
 * IDEA:
 *   Widget Android sulla homescreen che mostra:
 *   - Quante carte hai da ripassare oggi
 *   - La tua streak attuale
 *   - La prima carta del giorno (anteprima)
 *   - Bottone diretto "Studia ora"
 *
 *   I dati vengono aggiornati ogni volta che l'utente chiude l'app
 *   e scritti in /widgets/study-data.json (file statico su Firebase Hosting).
 *   Il widget Android legge questo file via URL pubblico.
 *
 * COME FUNZIONA IL WIDGET ANDROID (PWA):
 *   1. manifest.json dichiara il widget (già fatto)
 *   2. Il SW (sw.js) gestisce l'aggiornamento dati via Periodic Background Sync
 *   3. Il widget legge /widgets/study-data.json e mostra i dati
 *   4. ms_ac_template: widgets/study-widget.json definisce il layout (Windows/Android)
 *
 * TODO:
 *   1. Creare widgets/study-widget.json (template Adaptive Card per Windows widget)
 *   2. Aggiungere handler 'cortex-update-cache' nel SW per aggiornare i dati
 *   3. Collegare updateWidgetData() in main.js (visibilitychange → hidden)
 *   4. Testare su Android Chrome con "Aggiungi alla schermata home"
 */

// ─── Aggiornamento dati widget ────────────────────────────────────────────────

/**
 * Calcola i dati aggiornati e li scrive nel Service Worker
 * per l'aggiornamento del widget.
 * Da chiamare ogni volta che l'app va in background.
 */
export function updateWidgetData() {
    const data = _buildWidgetData();

    // Invia i dati al Service Worker che aggiorna la cache
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({
            type: 'UPDATE_WIDGET_DATA',
            payload: data,
        });
    }

    // Cache locale per accesso rapido
    localStorage.setItem('cortex_widget_data', JSON.stringify(data));
}

function _buildWidgetData() {
    const streak = parseInt(localStorage.getItem('cortex_streak') || '0', 10);
    const decks = _getDecks();
    const now = Date.now();

    // Conta carte in scadenza
    let cardsDue = 0;
    let nextCard = null;
    let nextCardDeck = '';

    for (const deck of decks) {
        for (const card of (deck.cards || [])) {
            if (!card.nextReview || card.nextReview <= now) {
                cardsDue++;
                if (!nextCard) {
                    nextCard = card;
                    nextCardDeck = deck.name || '';
                }
            }
        }
    }

    // Ultima sessione
    const sessions = _getSessions();
    const lastStudy = sessions.length > 0
        ? new Date(sessions[sessions.length - 1].ts).toISOString()
        : null;

    return {
        cards_due: cardsDue,
        streak,
        last_study: lastStudy,
        next_card: nextCard
            ? { front: nextCard.front?.substring(0, 80) || '', deck: nextCardDeck }
            : { front: cardsDue === 0 ? 'Tutte le carte ripassate oggi! 🎉' : 'Apri Cortex per studiare 🧠', deck: '' },
        updated_at: new Date().toISOString(),
    };
}

// ─── Handler nel Service Worker ───────────────────────────────────────────────
// Aggiungere questo blocco in sw.js dentro il listener 'message':
//
// self.addEventListener('message', (event) => {
//     if (event.data?.type === 'UPDATE_WIDGET_DATA') {
//         const data = JSON.stringify(event.data.payload);
//         caches.open(CACHE_NAME).then(cache => {
//             cache.put('/widgets/study-data.json', new Response(data, {
//                 headers: { 'Content-Type': 'application/json' }
//             }));
//         });
//         // Notifica il widget di aggiornarsi (Chrome 126+)
//         if (self.registration.widgets) {
//             self.registration.widgets.getAll().then(widgets => {
//                 widgets.forEach(w => w.update(event.data.payload));
//             });
//         }
//     }
// });

// ─── Utils ────────────────────────────────────────────────────────────────────

function _getDecks() {
    try { return JSON.parse(localStorage.getItem('cortex_decks') || '[]'); }
    catch { return []; }
}

function _getSessions() {
    try { return JSON.parse(localStorage.getItem('cortex_study_sessions') || '[]'); }
    catch { return []; }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

/**
 * Da chiamare in main.js dopo il login.
 * Aggiorna i dati widget ogni volta che l'app va in background.
 */
export function initWidget() {
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) updateWidgetData();
    });

    // Aggiornamento immediato all'avvio
    updateWidgetData();
}
