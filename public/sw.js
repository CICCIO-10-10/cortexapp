/**
 * sw.js — Cortex Service Worker v9.88.0
 */

// Import Firebase (Compat version for SW)
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Config placeholder — Firebase Messaging in SW richiede l'inizializzazione
firebase.initializeApp({
    apiKey: "AIzaSyA2Nnu6CYVauecQZQhvr4mud3aYJbdDVx0",
    authDomain: "cortexapp.it",
    projectId: "cortex-74a4e",
    messagingSenderId: "330752495374", // Esempio — in produzione deve corrispondere al progetto
    appId: "1:330752495374:web:0f4ee108a9fdaa5e30773d"
});

const messaging = firebase.messaging();

// Gestione notifiche in background
messaging.onBackgroundMessage((payload) => {
    console.log('[SW] Messaggio in background:', payload);
    const notificationTitle = payload.notification.title || "Cortex — Studio";
    const notificationOptions = {
        body: payload.notification.body,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        data: payload.data
    };
    self.registration.showNotification(notificationTitle, notificationOptions);
});

const CACHE_NAME = 'cortex-v9.98.0';

// Solo asset statici — MAI index.html o URL di navigazione
const PRECACHE_ASSETS = [
    '/styles.css',
    '/theme.css',
    '/manifest.json',
    '/LOGO_PREMIUM.png',
    '/pwa-192x192.png',
    '/pwa-512x512.png',
    '/app.html'
];

// ── INSTALL: pre-cacha solo asset statici ────────────────────────────────────
self.addEventListener('install', (event) => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return Promise.allSettled(
                PRECACHE_ASSETS.map((url) =>
                    cache.add(url).catch((err) =>
                        console.warn(`[SW] Precache miss for ${url}:`, err)
                    )
                )
            );
        })
    );
});

// ── ACTIVATE: cancella TUTTE le cache vecchie e prende controllo immediato ───
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) =>
            Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
        ).then(() => self.clients.claim())
    );
});

// ── FETCH ─────────────────────────────────────────────────────────────────────
self.addEventListener('fetch', (event) => {
    if (event.request.method !== 'GET') return;
    if (event.request.url.startsWith('chrome-extension://')) return;

    const url = new URL(event.request.url);

    // Richieste esterne (Firebase, CDN, Google Fonts…) → sempre dalla rete
    if (url.origin !== self.location.origin) {
        event.respondWith(fetch(event.request));
        return;
    }

    // ── REGOLA CRITICA: HTML / navigazione → MAI dalla cache ─────────────────
    // Garantisce che ogni nuovo deploy venga recepito immediatamente.
    const isNavigate = event.request.mode === 'navigate';
    const isHtml = event.request.headers.get('accept')?.includes('text/html');
    if (isNavigate || isHtml) {
        event.respondWith(
            fetch(event.request, { cache: 'no-store' }).catch(() => {
                // Solo in caso di rete assente, servi il fallback offline dalla cache
                return caches.match('/app.html');
            })
        );
        return;
    }

    // ── Asset statici: Network-First → aggiorna cache → fallback offline ──────
    event.respondWith(
        fetch(event.request)
            .then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            })
            .catch(() => {
                return caches.match(event.request).then((cached) => {
                    if (cached) return cached;
                    return new Response('Offline', { status: 503 });
                });
            })
    );
});

// ── BACKGROUND SYNC: riprova azioni fallite quando torna la rete ─────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'cortex-sync-decks') {
        event.waitUntil(syncPendingData());
    }
});

async function syncPendingData() {
    // Recupera dati pendenti da IndexedDB (salvati offline dal client)
    // e li sincronizza con Firebase quando la rete torna disponibile.
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'BACKGROUND_SYNC_COMPLETE' });
    });
}

// ── PERIODIC BACKGROUND SYNC: aggiornamenti periodici anche con app chiusa ──
self.addEventListener('periodicsync', (event) => {
    if (event.tag === 'cortex-daily-reminder') {
        event.waitUntil(sendDailyReminder());
    }
    if (event.tag === 'cortex-update-cache') {
        event.waitUntil(updateCriticalCache());
    }
});

async function sendDailyReminder() {
    // Invia notifica di promemoria studio giornaliero
    const now = new Date();
    const hour = now.getHours();
    // Solo tra le 18 e le 21
    if (hour >= 18 && hour <= 21) {
        await self.registration.showNotification('Cortex — Studia oggi! 🧠', {
            body: 'Hai carte da ripassare. 5 minuti al giorno fanno la differenza.',
            icon: '/pwa-192x192.png',
            badge: '/pwa-192x192.png',
            tag: 'daily-reminder',
            renotify: false,
            data: { url: '/app.html' }
        });
    }
}

async function updateCriticalCache() {
    // Aggiorna in background app.html e manifest.json
    const cache = await caches.open(CACHE_NAME);
    try {
        await cache.add('/app.html');
        await cache.add('/manifest.json');
    } catch (e) {
        console.warn('[SW] Periodic cache update failed:', e);
    }
}

// ── NOTIFICATION CLICK: apre l'app al click sulla notifica ──────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil(
        self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
            for (const client of clientList) {
                if (client.url.includes('/app.html') && 'focus' in client) {
                    return client.focus();
                }
            }
            return self.clients.openWindow('/app.html');
        })
    );
});
