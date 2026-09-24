/**
 * notifications.js — Cortex Smart Notifications System
 *
 * STATO: SCHELETRO — struttura completa, logica da collegare all'app
 *
 * IDEA:
 *   Utenti FREE  → promemoria generici e fastidiosi (ogni giorno, fissi)
 *                  + nudge per upgradare ("Sblocca Boss Mode con Student 🚀")
 *   Utenti PRO   → promemoria intelligenti basati su carte in scadenza,
 *                  streak, obiettivo personale — no spam, solo quando serve
 *
 * STACK:
 *   - Firebase Cloud Messaging (FCM) — già configurato in sw.js
 *   - Cloud Functions (da creare) — invio schedulato server-side
 *   - Periodic Background Sync — già configurato in sw.js (sendDailyReminder)
 *
 * TODO:
 *   1. Creare Cloud Function "sendScheduledNotifications" (trigger: pubsub ogni ora)
 *   2. Salvare FCM token su Firestore per ogni utente
 *   3. Collegare notificationSettings alle preferenze utente nelle impostazioni
 *   4. Testare su dispositivo reale (le notifiche non funzionano su localhost)
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const NOTIF_CONFIG = {
    // Orari preferiti di invio (ora locale utente)
    defaultReminderHour: 19,    // 19:00 default

    // FREE: frequenza massima notifiche (ms)
    freeMaxFrequencyMs: 24 * 60 * 60 * 1000,       // ogni 24h

    // PRO: notifica solo se ci sono carte in scadenza
    proMinCardsDue: 1,

    // Cooldown upsell (non spammare ogni giorno)
    upsellCooldownMs: 3 * 24 * 60 * 60 * 1000,     // ogni 3 giorni
};

// Tipi di notifica
export const NOTIF_TYPES = {
    DAILY_STUDY:    'daily_study',      // promemoria studio quotidiano
    STREAK_DANGER:  'streak_danger',    // stai per perdere la streak
    CARDS_DUE:      'cards_due',        // hai N carte in scadenza oggi (PRO)
    ACHIEVEMENT:    'achievement',      // hai sbloccato un badge
    UPSELL:         'upsell',           // upgrade a Student Plan (FREE only)
    WIN_BACK:       'win_back',         // non studi da 3+ giorni
    DUELS_INVITE:   'duels_invite',     // qualcuno ti ha sfidato a Neural Duels
};

// ─── Permessi & Token ─────────────────────────────────────────────────────────

/**
 * Richiede il permesso notifiche e salva il token FCM su Firestore.
 * Da chiamare dopo il login, non all'avvio (evita il blocco immediato).
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        console.warn('[Notif] Notifiche non supportate in questo browser');
        return null;
    }

    if (Notification.permission === 'denied') {
        console.warn('[Notif] Permesso notifiche negato dall\'utente');
        return null;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') return null;

        const token = await _getFCMToken();
        if (token) {
            await _saveFCMToken(token);
            localStorage.setItem('cortex_notif_token', token);
            console.log('[Notif] Token FCM salvato');
        }
        return token;

    } catch (e) {
        console.error('[Notif] Errore richiesta permesso:', e);
        return null;
    }
}

async function _getFCMToken() {
    try {
        // TODO: sostituire VAPID key con quella reale da Firebase Console
        // Firebase Console → Project Settings → Cloud Messaging → Web Push certificates
        const VAPID_KEY = 'TODO_VAPID_KEY_DA_FIREBASE_CONSOLE';

        if (typeof firebase === 'undefined' || !firebase.messaging) return null;
        const messaging = firebase.messaging();
        return await messaging.getToken({ vapidKey: VAPID_KEY });
    } catch (e) {
        console.error('[Notif] Errore get FCM token:', e);
        return null;
    }
}

async function _saveFCMToken(token) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return;

    await firebase.firestore().collection('users').doc(uid).update({
        fcmToken: token,
        fcmTokenUpdatedAt: firebase.firestore.FieldValue.serverTimestamp(),
        notificationsEnabled: true,
    });
}

// ─── Preferenze utente ────────────────────────────────────────────────────────

/**
 * Legge/scrive le preferenze notifiche dell'utente.
 * Usare in Settings per mostrare i toggle.
 */
export function getNotificationSettings() {
    const defaults = {
        enabled: true,
        reminderHour: NOTIF_CONFIG.defaultReminderHour,
        dailyStudy: true,
        streakDanger: true,
        cardsDue: true,          // PRO only
        achievements: true,
        duelsInvite: true,
        upsell: true,            // FREE only — toggle nascosto ai PRO
    };

    try {
        const saved = JSON.parse(localStorage.getItem('cortex_notif_settings') || '{}');
        return { ...defaults, ...saved };
    } catch {
        return defaults;
    }
}

export function saveNotificationSettings(settings) {
    localStorage.setItem('cortex_notif_settings', JSON.stringify(settings));
    // TODO: sincronizzare su Firestore per invio server-side
    const uid = localStorage.getItem('cortex_uid');
    if (uid && typeof firebase !== 'undefined') {
        firebase.firestore().collection('users').doc(uid).update({
            notificationSettings: settings,
        }).catch(() => {});
    }
}

// ─── Invio locale (client-side) ───────────────────────────────────────────────
// Usato per notifiche immediate (achievement, duels) — non per promemoria schedulati

export function sendLocalNotification({ title, body, icon = '/pwa-192x192.png', url = '/app.html', tag }) {
    if (Notification.permission !== 'granted') return;

    const settings = getNotificationSettings();
    if (!settings.enabled) return;

    const notif = new Notification(title, {
        body,
        icon,
        badge: '/pwa-192x192.png',
        tag: tag || 'cortex-general',
        renotify: false,
        data: { url },
    });

    notif.onclick = () => {
        window.focus();
        notif.close();
    };
}

// ─── Logica promemoria (client-side scheduling) ───────────────────────────────
// Backup locale per quando le Cloud Functions non sono ancora attive

/**
 * Valuta se mandare una notifica ora.
 * Da chiamare ogni volta che l'app va in background (visibilitychange).
 */
export async function evaluateAndSendReminder() {
    const settings = getNotificationSettings();
    if (!settings.enabled || Notification.permission !== 'granted') return;

    const isPro = await _isPremiumUser();
    const now = new Date();
    const hour = now.getHours();

    // Fuori dall'orario preferito → niente
    if (Math.abs(hour - settings.reminderHour) > 1) return;

    if (isPro) {
        await _sendProReminder(settings);
    } else {
        await _sendFreeReminder(settings);
    }
}

async function _sendProReminder(settings) {
    // PRO: promemoria intelligente basato su carte realmente in scadenza
    if (!settings.dailyStudy) return;

    const lastSent = parseInt(localStorage.getItem('cortex_notif_last_pro') || '0', 10);
    if (Date.now() - lastSent < NOTIF_CONFIG.freeMaxFrequencyMs) return;

    const cardsDue = _countCardsDue();
    if (cardsDue < NOTIF_CONFIG.proMinCardsDue) return; // Niente da ripassare → niente notifica

    const messages = [
        { title: `📚 ${cardsDue} carte ti aspettano`, body: 'Il momento migliore per ripassare è adesso.' },
        { title: '🧠 Sessione di ripasso pronta', body: `Hai ${cardsDue} carte in scadenza oggi. 5 minuti bastano.` },
        { title: '⚡ Il tuo cervello è pronto', body: `${cardsDue} carte da ripassare. Non perdere la streak!` },
    ];

    const msg = messages[Math.floor(Math.random() * messages.length)];
    sendLocalNotification({ ...msg, tag: 'cortex-pro-reminder' });
    localStorage.setItem('cortex_notif_last_pro', Date.now().toString());
}

async function _sendFreeReminder(settings) {
    // FREE: promemoria generico ogni giorno + ogni 3 giorni un upsell
    if (!settings.dailyStudy) return;

    const lastSent = parseInt(localStorage.getItem('cortex_notif_last_free') || '0', 10);
    if (Date.now() - lastSent < NOTIF_CONFIG.freeMaxFrequencyMs) return;

    // Ogni 3 notifiche, la quarta è un upsell
    const sentCount = parseInt(localStorage.getItem('cortex_notif_free_count') || '0', 10);
    const isUpsellTime = settings.upsell && sentCount > 0 && sentCount % 3 === 0;

    if (isUpsellTime) {
        await _sendUpsellNotification();
    } else {
        const messages = [
            { title: '📖 Studia oggi!', body: 'Hai carte da ripassare. 5 minuti al giorno fanno la differenza.' },
            { title: '🔥 Mantieni la streak!', body: 'Non dimenticare la tua sessione di oggi.' },
            { title: '🎯 Obiettivo giornaliero', body: 'Mancano pochi ripetizioni per completare la sessione di oggi.' },
            { title: '⏰ Momento di studiare', body: 'I campioni mondiali di memoria studiano ogni giorno. Tu?' },
        ];
        const msg = messages[Math.floor(Math.random() * messages.length)];
        sendLocalNotification({ ...msg, tag: 'cortex-free-reminder' });
    }

    localStorage.setItem('cortex_notif_last_free', Date.now().toString());
    localStorage.setItem('cortex_notif_free_count', (sentCount + 1).toString());
}

async function _sendUpsellNotification() {
    const lastUpsell = parseInt(localStorage.getItem('cortex_notif_last_upsell') || '0', 10);
    if (Date.now() - lastUpsell < NOTIF_CONFIG.upsellCooldownMs) return;

    const upsells = [
        { title: '🚀 Sblocca Boss Mode', body: 'Interrogazione AI illimitata con Student Plan. Provalo gratis 7 giorni.' },
        { title: '⚡ Neural Sparks disponibili', body: 'Usa l\'AI senza limiti. Aggiorna a Student Plan.' },
        { title: '🏆 I tuoi compagni studiano di più', body: 'Con Student Plan: AI illimitata, mazzi illimitati, Neural Duels. Da €4.99/mese.' },
    ];

    const msg = upsells[Math.floor(Math.random() * upsells.length)];
    sendLocalNotification({ ...msg, url: '/app.html?action=upgrade', tag: 'cortex-upsell' });
    localStorage.setItem('cortex_notif_last_upsell', Date.now().toString());
}

// ─── Notifiche specifiche (da chiamare direttamente) ──────────────────────────

export function notifyStreakDanger(streakDays) {
    const settings = getNotificationSettings();
    if (!settings.streakDanger) return;

    sendLocalNotification({
        title: `🔥 Streak a rischio! (${streakDays} giorni)`,
        body: 'Studia almeno 1 carta oggi per non perdere la tua streak.',
        tag: 'cortex-streak-danger',
    });
}

export function notifyAchievement(badgeName, badgeEmoji = '🏆') {
    const settings = getNotificationSettings();
    if (!settings.achievements) return;

    sendLocalNotification({
        title: `${badgeEmoji} Badge sbloccato!`,
        body: `Hai guadagnato il badge "${badgeName}". Continua così!`,
        tag: 'cortex-achievement',
    });
}

export function notifyDuelsInvite(opponentName) {
    const settings = getNotificationSettings();
    if (!settings.duelsInvite) return;

    sendLocalNotification({
        title: '⚔️ Sfida ricevuta!',
        body: `${opponentName} ti ha sfidato a Neural Duels. Accetta la sfida!`,
        url: '/app.html?action=duels',
        tag: 'cortex-duels-invite',
    });
}

export function notifyWinBack(daysSinceLastStudy) {
    sendLocalNotification({
        title: '👋 Ci manchi!',
        body: `Sono ${daysSinceLastStudy} giorni che non studi. Il tuo cervello ti aspetta.`,
        tag: 'cortex-win-back',
    });
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function _countCardsDue() {
    // TODO: collegare al motore SRS reale
    // Per ora legge da localStorage — in futuro da IndexedDB
    try {
        const decks = JSON.parse(localStorage.getItem('cortex_decks') || '[]');
        const now = Date.now();
        let count = 0;
        decks.forEach(deck => {
            (deck.cards || []).forEach(card => {
                if (!card.nextReview || card.nextReview <= now) count++;
            });
        });
        return count;
    } catch {
        return 0;
    }
}

async function _isPremiumUser() {
    const plan = localStorage.getItem('cortex_plan');
    return plan === 'student_monthly' || plan === 'student_yearly';
}

// ─── Init (da chiamare in main.js dopo login) ─────────────────────────────────

export function initNotifications() {
    // Ascolta visibilitychange per valutare promemoria quando l'app va in background
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            evaluateAndSendReminder().catch(() => {});
        }
    });

    // TODO: dopo il 18 maggio, richiedere permesso con un modale carino
    // (non con il prompt nativo direttamente — troppo aggressivo)
    // if (localStorage.getItem('cortex_onboarded') === '1') {
    //     setTimeout(() => requestNotificationPermission(), 5000);
    // }

    console.log('[Notif] Sistema notifiche inizializzato');
}
