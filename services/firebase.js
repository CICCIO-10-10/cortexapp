// services/firebase.js
// Fase 1 — Estrazione da main.js
// Gestisce tutta la logica Firebase (Auth, Firestore, Cloud Sync, Feedback)
// e il SecurityManager per la chiave Gemini.
// Espone funzioni come window.* per compatibilità con il legacyBridge e main.js.

import { t } from '../core/i18n.js';
import { APP_CONFIG } from '../js/config.js';
import { onAuthStateChangedHandler } from '../core/appBoot.js';

const KEYS = APP_CONFIG.STORAGE_KEYS;

// ─── Security Manager ─────────────────────────────────────────────────────────
// Gestisce la chiave Gemini in sessionStorage (veloce) e localStorage (persistente).
export const SecurityManager = {
    getApiKey() {
        return sessionStorage.getItem('cortex_gemini_key')
            || localStorage.getItem('cortex_gemini_key')
            || localStorage.getItem('mm_gemini_key')
            || null;
    },
    setApiKey(key) {
        if (key && (key.startsWith('AIza') || key === 'PROXY')) {
            sessionStorage.setItem('cortex_gemini_key', key);
            localStorage.setItem('cortex_gemini_key', key);
            if (window.showToast) window.showToast('Chiave API configurata!', 'success');
            return true;
        }
        if (window.showToast) window.showToast('Chiave non valida (deve iniziare con AIza).', 'error');
        return false;
    }
};
window.SecurityManager = SecurityManager;


// ─── Firebase Init ────────────────────────────────────────────────────────────
let firebaseApp           = null;
let db                    = null;
let functions             = null;
let messaging             = null;
let _authListenerActive   = false; // guard: registra onAuthStateChanged una sola volta
let _trackerStarted       = false; // guard: avvia il tracker una sola volta

// ── Cortex App Analytics Tracker ─────────────────────────────────────────────
// Traccia presenza (online ora) e visite giornaliere per la dashboard admin.
function _startAppTracker(firestoreDb) {
    if (_trackerStarted || !firestoreDb) return;
    _trackerStarted = true;
    try {
        const params = new URLSearchParams(window.location.search);
        const source   = params.get('utm_source') || params.get('ref') || 'direct';
        const campaign = params.get('utm_campaign') || '';
        const sid      = 'app_' + Math.random().toString(36).slice(2) + '_' + Date.now();
        // Data odierna in timezone Europe/Rome (non UTC), per allinearsi alla dashboard
        const _romeNow = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
        const today    = `${_romeNow.getFullYear()}-${String(_romeNow.getMonth() + 1).padStart(2, '0')}-${String(_romeNow.getDate()).padStart(2, '0')}`;
        const FieldValue = firebase.firestore.FieldValue;

        function heartbeat() {
            firestoreDb.collection('analytics').doc('presence')
                .collection('sessions').doc(sid)
                .set({ page: 'app', source, campaign, lastSeen: FieldValue.serverTimestamp() }, { merge: true });
        }
        heartbeat();
        setInterval(heartbeat, 120000);

        firestoreDb.collection('analytics').doc('pageviews_' + today).set({
            app: FieldValue.increment(1),
            ['src_' + source]: FieldValue.increment(1)
        }, { merge: true });
    } catch (_) {}
}

/**
 * Lazy getter per Firestore DB.
 * Assicura che Firebase sia inizializzato prima di restituire l'istanza.
 */
export function getFirestoreDB() {
    if (db) return db;
    if (typeof firebase === 'undefined') {
        console.warn('[Firebase] Firebase SDK not loaded yet.');
        return null;
    }
    
    // Se non abbiamo ancora un'app ma abbiamo la config, proviamo a inizializzarla on-demand
    if (firebase.apps.length === 0) {
        const config = {
            apiKey:    localStorage.getItem('fb_api_key')    || 'AIzaSyA2Nnu6CYVauecQZQhvr4mud3aYJbdDVx0',
            authDomain:localStorage.getItem('fb_auth_domain')|| 'cortexapp.it',
            projectId: localStorage.getItem('fb_project_id') || 'cortex-74a4e',
        };
        if (config.apiKey && config.authDomain && config.projectId) {
            firebaseApp = firebase.initializeApp(config);
            db = firebaseApp.firestore(); // ← FIX: db era null, enablePersistence crashava
            functions = firebaseApp.functions();
            try {
                db.enablePersistence({ synchronizeTabs: true })
                  .catch(err => {
                      if (err.code === 'failed-precondition') console.warn('[Firebase] Persistence failed: multi-tab active.');
                      else if (err.code === 'unimplemented') console.warn('[Firebase] Persistence not supported by browser.');
                  });
            } catch (_) { /* ignore synchronous errors */ }
        }
    } else {
        firebaseApp = firebase.app();
        db = firebaseApp.firestore();
        functions = firebaseApp.functions();
    }

    _startAppTracker(db);
    return db;
}

/**
 * Lazy getter per Firebase Functions.
 */
/**
 * callGeminiProxy — chiama l'endpoint HTTP /api/gemini (callGeminiHttp).
 * NOTA: la callable "callGeminiProxy" non e' MAI esistita tra le functions
 * deployate — i moduli che la chiamavano ricevevano sempre "internal".
 * Restituisce { data } con la stessa shape di httpsCallable per compatibilita'.
 */
export async function callGeminiProxy(payload) {
    const user = (typeof firebase !== 'undefined' && firebase.auth) ? firebase.auth().currentUser : null;
    if (!user) throw new Error('Devi essere loggato per usare le funzioni AI.');
    const idToken = await user.getIdToken();
    const res = await fetch('/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + idToken },
        body: JSON.stringify(payload)
    });
    let data = {};
    try { data = await res.json(); } catch (_) {}
    if (!res.ok) {
        const msg = data.error === 'PAYWALL_LIMIT_REACHED'
            ? 'PAYWALL_LIMIT_REACHED'
            : (data.details || data.error || ('Errore AI (HTTP ' + res.status + ')'));
        throw new Error(msg);
    }
    return { data };
}

export function getFunctions() {
    if (functions) return functions;
    getFirestoreDB(); // Inizializza tutto se necessario
    if (!functions && typeof firebase !== 'undefined' && firebase.apps.length) {
        try { functions = firebase.app().functions(); } catch (_) {}
    }
    return functions;
}

/**
 * Lazy getter per Firebase Messaging.
 */
export function getMessaging() {
    if (messaging) return messaging;
    if (typeof firebase === 'undefined') return null;
    getFirestoreDB();
    try {
        if (firebase.messaging.isSupported()) {
            messaging = firebase.messaging();
        }
    } catch (e) {
        console.warn('[Firebase] Messaging not supported or blocked:', e);
    }
    return messaging;
}

export async function initFirebase() {
    if (typeof firebase === 'undefined') return;
    const fbConfig = { // Renamed config to fbConfig
        apiKey:    localStorage.getItem('fb_api_key')    || 'AIzaSyA2Nnu6CYVauecQZQhvr4mud3aYJbdDVx0',
        authDomain:localStorage.getItem('fb_auth_domain')|| 'cortexapp.it',
        projectId: localStorage.getItem('fb_project_id') || 'cortex-74a4e',
    };
    if (fbConfig.apiKey && fbConfig.authDomain && fbConfig.projectId) { // Changed condition and variable name
        try {
            // NON fare delete() se l'app è già inizializzata: cancellerebbe il redirect result
            if (!firebase.apps.length) {
                firebaseApp = firebase.initializeApp(fbConfig);
            } else {
                firebaseApp = firebase.app();
            }
            db = firebaseApp.firestore();
            // Bug fix "Proxy non disponibile": il boot normale settava solo `db`,
            // mai `functions` — e getFunctions() usciva subito perche' db esisteva.
            // Risultato: TUTTE le feature IA via proxy fallivano finche' non aprivi
            // per caso una sezione che passava da getFirestoreDB().
            try { functions = firebaseApp.functions(); } catch (_) {}
            // Fire-and-forget: NON aspettiamo enablePersistence — blocca il boot senza benefici visibili
            db.enablePersistence({ synchronizeTabs: true }).catch(err => {
                if (err.code !== 'failed-precondition' && err.code !== 'unimplemented') {
                    console.warn('[Firebase] Persistence warning:', err.code);
                }
            });

            // Bug fix: il tracker visite "app" (pageviews_<data>.app + presence) viveva SOLO
            // dentro getFirestoreDB(), che viene chiamato solo aprendo Community/Duelli Neurali.
            // Il boot normale dell'app (qui) inizializza `db` per conto suo e non lo chiamava mai
            // → visitesToday.app/visitesAllTime.app restavano a 0 per sempre, anche con utenti reali.
            _startAppTracker(db);

        // Auth State — registrato UNA SOLA VOLTA per evitare handler duplicati
        if (!_authListenerActive) {
            _authListenerActive = true;
            firebase.auth().onAuthStateChanged((user) => {
                onAuthStateChangedHandler(user, {
                    updateUserUI,
                    loadFromCloud,
                    setupPushNotifications: requestNotificationPermission  // era undefined → crash silenzioso
                });
            });
        }

        // Handle redirect result — risolve il login Google dopo signInWithRedirect.
        // Il flag cortex_redirect_pending viene settato SOLO da signInWithRedirect.
        // Controlliamo anche il timestamp: se il flag è più vecchio di 3 minuti è stale.
        const redirectPending = localStorage.getItem('cortex_redirect_pending') === '1';
        const redirectTs      = parseInt(localStorage.getItem('cortex_redirect_ts') || '0');
        const redirectFresh   = redirectTs > 0 && (Date.now() - redirectTs) < 3 * 60 * 1000;

        function clearRedirectState() {
            localStorage.removeItem('cortex_redirect_pending');
            localStorage.removeItem('cortex_redirect_ts');
            // Pulisci stato interno Firebase in ENTRAMBI i storage
            // Firebase v8 compat salva il pending redirect sia in localStorage che sessionStorage
            const fbKeys = k => k.startsWith('firebase:pendingRedirect') || k.startsWith('firebase:authEvent');
            Object.keys(localStorage).filter(fbKeys).forEach(k => localStorage.removeItem(k));
            Object.keys(sessionStorage).filter(fbKeys).forEach(k => sessionStorage.removeItem(k));
        }

        if (redirectPending && redirectFresh) {
            try {
                const result = await Promise.race([
                    firebase.auth().getRedirectResult(),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 4000))
                ]);
                clearRedirectState();
                if (result?.user) {
                    window._fbUserId   = result.user.uid;
                    window._fbLoggedIn = true;
                    completeAuth(result.user.displayName, result.user.photoURL);
                    if (window.showToast) window.showToast(`Benvenuto, ${result.user.displayName}! ✨`, 'success');
                    loadFromCloud();
                    const isTutorialOver = localStorage.getItem('cortex_onboarded') === '1';
                    if (!isTutorialOver) {
                        setTimeout(() => {
                            if (typeof window.triggerOnboardingOverlay === 'function') window.triggerOnboardingOverlay();
                        }, 600);
                    }
                }
            } catch (e) {
                clearRedirectState();
                console.warn('[Firebase] getRedirectResult:', e.message);
            }
        } else {
            // Flag assente o stale — pulizia completa per sicurezza
            clearRedirectState();
        }
    } catch (e) {
        localStorage.removeItem('cortex_redirect_pending');
        console.error('[Firebase] init/auth error:', e);
    }
    } // Closing brace for the new if (fbConfig...) block
}

export async function testFirebaseConnection() {
    await initFirebase();
    if (!db) { if (window.showToast) window.showToast('Configurazione Firebase incompleta.', 'error'); return; }
    try {
        if (window.showToast) window.showToast('Verifica in corso...', 'info');
        await db.collection('test').doc('ping').set({ time: Date.now() });
        if (window.showToast) window.showToast(t('firebase_connected'), 'success');
    } catch (e) {
        if (window.showToast) window.showToast(t('firebase_err_connection'), 'error');
    }
}

// ─── Cloud Sync ────────────────────────────────────────────────────────────────
// ─── Cloud Sync ────────────────────────────────────────────────────────────────
/**
 * Sincronizza i dati dell'utente sul Cloud.
 * Se viene fornito deckId, esegue un'operazione atomica (WriteBatch) per aggiornare
 * i metadati nel documento radice e il payload completo nella sub-collection.
 */
export async function syncToCloud(deckId = null) {
    if (!firebase?.apps?.length || !window._fbUserId) return;
    const _db = firebase.app().firestore();
    const batch = _db.batch();
    const userRef = _db.collection('users').doc(window._fbUserId);

    try {
        const legacyState = window._legacyState?.(); // hook per leggere lo state di main.js
        const plan = localStorage.getItem('cortex_user_plan') || 'free';
        
        // Prepariamo i metadati (versione leggera dei mazzi per caricamento veloce)
        const now = new Date();
        const decksMetadata = (legacyState?.decks || []).map(d => {
            // FIX: calcola dueCount dinamicamente dalle card invece di affidarsi
            // a un campo che potrebbe non essere aggiornato
            const cards = d.cards || [];
            const computedDueCount = cards.filter(
                c => !c.nextReview || new Date(c.nextReview) <= now
            ).length;
            return {
                id:          d.id || Date.now(),
                name:        d.name,
                subject:     d.subject || '',
                examDate:    d.examDate || '',
                studyMethod: d.studyMethod || 'cortex',
                cardsCount:  cards.length,
                dueCount:    computedDueCount,
                updatedAt:   firebase.firestore.FieldValue.serverTimestamp()
            };
        });

        const rootData = {
            decksMetadata: decksMetadata,
            sessions:      legacyState?.sessions      || [],
            recordings:    legacyState?.recordings    || [],
            gamification:  window.gState              || null,
            plan:          plan,
            lastSync:      firebase.firestore.FieldValue.serverTimestamp(),
            migratedToSubcollections: true
        };

        batch.set(userRef, rootData, { merge: true });

        // Se abbiamo un deckId specifico, aggiorniamo il suo documento nella sub-collection
        if (deckId) {
            const deck = (legacyState?.decks || []).find(d => d.id === deckId);
            if (deck) {
                const deckRef = userRef.collection('decks').doc(deckId.toString());
                batch.set(deckRef, {
                    ...deck,
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        await batch.commit();
        console.log(`[Firebase] syncToCloud completed (deckId: ${deckId || 'none'})`);
    } catch (e) {
        console.error('[Firebase] syncToCloud failed:', e);
    }
}

export async function loadFromCloud() {
    if (!firebase?.apps?.length || !window._fbUserId) return;
    const _db = firebase.app().firestore();
    try {
        const timeout = new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000));
        const doc = await Promise.race([
            _db.collection('users').doc(window._fbUserId).get(),
            timeout
        ]);

        if (doc.exists) {
            const data = doc.data();

            // 🔄 Migrazione Automatica: Legacy Array -> Sub-collections
            if (data.decks && !data.migratedToSubcollections) {
        
                if (window.showToast) window.showToast('Ottimizzazione database in corso...', 'info');
                await migrateDecksToSubcollections(data.decks);
                // Ricarichiamo i dati dopo la migrazione
                return loadFromCloud();
            }

            // 🔄 FIX: Carica i mazzi completi dalla sub-collection (non solo i metadati)
            // Necessario per il cross-device sync: il root doc ha solo decksMetadata (leggero),
            // mentre il contenuto completo (cards, nextReview ecc.) è nelle sub-collection.
            if (data.migratedToSubcollections) {
                try {
                    const decksSnap = await _db
                        .collection('users').doc(window._fbUserId)
                        .collection('decks').get();
                    const fullDecks = [];
                    decksSnap.forEach(d => fullDecks.push(d.data()));
                    if (fullDecks.length > 0) {
                        localStorage.setItem(KEYS.DECKS_V1, JSON.stringify(fullDecks));
                        if (window.__cortexDispatch) {
                            window.__cortexDispatch({ type: 'HYDRATE_STATE', payload: { decks: fullDecks } });
                        }

                    }
                } catch (subErr) {
                    console.error('[Firebase] loadFromCloud: errore lettura sub-collection decks:', subErr);
                    // Fallback ai metadati se la sub-collection non è leggibile
                    if (data.decksMetadata) {
                        localStorage.setItem(KEYS.DECKS_V1, JSON.stringify(data.decksMetadata));
                        if (window.__cortexDispatch) {
                            window.__cortexDispatch({ type: 'HYDRATE_STATE', payload: { decks: data.decksMetadata } });
                        }
                    }
                }
            } else if (data.decksMetadata || data.decks) {
                // Utenti non ancora migrati: usa il campo legacy
                const decks = data.decksMetadata || data.decks;
                localStorage.setItem(KEYS.DECKS_V1, JSON.stringify(decks));
                if (window.__cortexDispatch) window.__cortexDispatch({ type: 'HYDRATE_STATE', payload: { decks } });
            }

            // Determina il piano effettivo: piano pagato > trial attivo > free
            let effectivePlan = data.plan || 'free';
            if (effectivePlan === 'free' && data.trialPlan && data.trialExpiresAt) {
                const trialActive = data.trialExpiresAt > Date.now();
                if (trialActive) {
                    effectivePlan = data.trialPlan; // es. 'student'
                    console.log(`[Firebase] Trial attivo fino a ${new Date(data.trialExpiresAt).toLocaleDateString()}`);
                }
            }
            localStorage.setItem('cortex_user_plan', effectivePlan);
            // Salva trialExpiresAt per mostrare scadenza trial nelle impostazioni
            if (data.trialExpiresAt) {
                localStorage.setItem('cortex_trial_expires_at', String(data.trialExpiresAt));
            } else {
                localStorage.removeItem('cortex_trial_expires_at');
            }
            // Segnala che il piano è stato verificato dal cloud — isPremium() può fidarsi
            window._cortexPlanVerified = true;

            // Salva refCode se non è ancora presente nel doc (primo sync)
            const uid = window._fbUserId;
            if (uid && !data.refCode) {
                _db.collection('users').doc(uid).set(
                    { refCode: uid.slice(0, 8) },
                    { merge: true }
                ).catch(() => {});
            }

            // Win-back: mostra banner se l'utente ha cancellato e non ha già visto il messaggio
            if (data.winbackEligible && !data.winbackShownAt && effectivePlan === 'free') {
                setTimeout(() => _showWinbackBanner(), 2500);
                // Marca come mostrato subito (fire-and-forget)
                _db.collection('users').doc(window._fbUserId).update({
                    winbackShownAt: Date.now()
                }).catch(() => {});
            }

            // Sync Neural Sparks balance
            const sparksBalance = data.sparksBalance || 0;
            localStorage.setItem('cortex_sparks_balance', String(sparksBalance));

            if (data.sessions) localStorage.setItem(KEYS.SESSIONS || 'mm_sessions', JSON.stringify(data.sessions));
            
            if (data.gamification && window.gState) {
                Object.assign(window.gState, data.gamification);
                try { localStorage.setItem('mm_gstate', JSON.stringify(window.gState)); } catch (e) {}
                if (typeof window.renderNetworkAndStats === 'function') window.renderNetworkAndStats();
            }

            if (typeof window.renderDecks === 'function') window.renderDecks();
            if (window.showToast) window.showToast('Sincronizzato! ☁️', 'success');
        }
    } catch (e) {
        if (e.message !== 'timeout') console.error('[Firebase] loadFromCloud failed:', e);
    }
}

/**
 * Carica il contenuto completo di un mazzo (flashcard) dalla sub-collection.
 */
export async function loadDeckFromSubcollection(deckId) {
    if (!firebase?.apps?.length || !window._fbUserId) return null;
    const _db = firebase.app().firestore();
    try {
        const deckRef = _db.collection('users').doc(window._fbUserId).collection('decks').doc(deckId.toString());
        const snap = await deckRef.get();
        if (snap.exists) return snap.data();
        return null;
    } catch (e) {
        console.error(`[Firebase] loadDeckFromSubcollection(${deckId}) failed:`, e);
        return null;
    }
}

async function migrateDecksToSubcollections(legacyDecks) {
    const _db = firebase.app().firestore();
    const userRef = _db.collection('users').doc(window._fbUserId);
    
    // Processiamo i mazzi uno a uno (non possiamo usare un unico batch se i mazzi sono molti/pesanti)
    for (const deck of legacyDecks) {
        const deckId = deck.id || Date.now() + Math.random().toString(36).substr(2, 9);
        deck.id = deckId; // Assicuriamo che abbia un ID
        await userRef.collection('decks').doc(deckId.toString()).set(deck);
    }

    // Segnaliamo la migrazione completata e puliamo l'array originario
    await userRef.set({
        migratedToSubcollections: true,
        decks: firebase.firestore.FieldValue.delete() // Rimuoviamo il payload pesante dal root
    }, { merge: true });
    

    if (window.showToast) window.showToast('Database ottimizzato con successo! 🚀', 'success');
}

// ─── Auth ─────────────────────────────────────────────────────────────────────
const _isMobile = () => /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

function _doRedirect(provider) {
    localStorage.setItem('cortex_redirect_pending', '1');
    localStorage.setItem('cortex_redirect_ts', Date.now().toString());
    firebase.auth().signInWithRedirect(provider).catch(e => {
        localStorage.removeItem('cortex_redirect_pending');
        localStorage.removeItem('cortex_redirect_ts');
        alert('Errore login: ' + (e.message || e.code));
    });
}

export function loginWithGoogle() {
    if (typeof firebase === 'undefined') {
        alert(t('firebase_err_load'));
        return;
    }
    if (!firebase.apps.length) {
        // Firebase non ancora pronto: inizializza subito e riprova
        initFirebase().then(() => loginWithGoogle());
        return;
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    provider.addScope('email');
    provider.addScope('profile');
    provider.setCustomParameters({ prompt: 'select_account' });

    // Su mobile i popup vengono bloccati o chiusi dal browser → redirect diretto
    if (_isMobile()) {
        _doRedirect(provider);
        return;
    }

    // Desktop: popup (più fluido, nessun reload di pagina)
    firebase.auth().signInWithPopup(provider)
        .then(result => {
            if (!result || !result.user) return;
            const user = result.user;
            console.log('[Auth] Login OK:', user.displayName);
            localStorage.removeItem('cortex_redirect_pending');
            localStorage.removeItem('cortex_redirect_ts');
            completeAuth(user.displayName, user.photoURL);
            if (window.showToast) window.showToast(`Benvenuto, ${user.displayName}! ✨`, 'success');
            loadFromCloud();
            const isTutorialOver = localStorage.getItem('cortex_onboarded') === '1';
            if (!isTutorialOver) {
                setTimeout(() => {
                    if (typeof window.triggerOnboardingOverlay === 'function') window.triggerOnboardingOverlay();
                }, 600);
            }
        })
        .catch(err => {
            console.error('[Auth] Popup error:', err.code, err.message);

            // Popup bloccato dal browser → mostra istruzione, NON usare redirect
            // signInWithRedirect causa il doppio-Google-window e stato stale nel localStorage.
            if (err.code === 'auth/popup-blocked') {
                if (window.showToast) {
                    window.showToast('Popup bloccato. Clicca sull\'icona 🔒 nella barra dell\'indirizzo e consenti i popup per questo sito, poi riprova.', 'error', 6000);
                } else {
                    alert('Il popup è stato bloccato dal browser.\nClicca sull\'icona del lucchetto 🔒 nella barra dell\'indirizzo → "Popup" → Consenti → riprova.');
                }
                return;
            }
            if (err.code === 'auth/popup-cancelled-by-user') {
                // Popup bloccato in modo aggressivo senza UI → fallback silenzioso a redirect
                localStorage.setItem('cortex_redirect_pending', '1');
                localStorage.setItem('cortex_redirect_ts', Date.now().toString());
                firebase.auth().signInWithRedirect(provider).catch(e2 => {
                    localStorage.removeItem('cortex_redirect_pending');
                    localStorage.removeItem('cortex_redirect_ts');
                });
                return;
            }

            if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/user-cancelled') {
                // L'utente ha chiuso il popup — silenzioso
                return;
            }
            if (err.code === 'auth/popup-closed-by-user') {
                // Il browser ha chiuso il popup prima del completamento (comune su mobile/tablet)
                // Fallback silenzioso a redirect
                _doRedirect(provider);
                return;
            }

            const msgs = {
                'auth/unauthorized-domain':       'Dominio non autorizzato in Firebase. Aggiungi ' + window.location.hostname + ' su Firebase Console > Auth > Settings > Authorized Domains.',
                'auth/configuration-not-found':   "Abilita 'Google' come metodo di accesso in Firebase Console > Auth > Sign-in method.",
                'auth/operation-not-allowed':     "Accesso Google non abilitato su Firebase.",
                'auth/internal-error':            "Errore interno Firebase. Riprova.",
            };
            const msg = msgs[err.code] || ('Errore login: ' + (err.message || err.code));
            alert(msg);
        });
}

// Gestisce il risultato del redirect dopo signInWithRedirect
export async function handleRedirectResult() {
    if (typeof firebase === 'undefined') return;
    if (!firebase.apps.length) await initFirebase();
    try {
        const result = await firebase.auth().getRedirectResult();
        if (result && result.user) {
            window._fbUserId   = result.user.uid;
            window._fbLoggedIn = true;
            completeAuth(result.user.displayName, result.user.photoURL);
            if (window.showToast) window.showToast(`Bentornato, ${result.user.displayName}! ✨`, 'success');
            loadFromCloud();
        }
    } catch (err) {
        if (err.code !== 'auth/no-current-user') {
            console.warn('[Auth] Redirect result error:', err);
        }
    }
}

export function completeAuth(name, avatar = null) {
    localStorage.setItem('mm_user_name', name);
    if (avatar) localStorage.setItem('mm_user_avatar', avatar);
    localStorage.setItem('mm_is_logged_in', 'true');

    // Sync UID + profilo per i nuovi moduli (socialProfile, notifications, neuralCoach…)
    if (window._fbUserId) {
        localStorage.setItem('cortex_uid', window._fbUserId);
        localStorage.setItem('cortex_username', name);
        if (avatar) localStorage.setItem('cortex_photo', avatar);
    }

    updateUserUI(name, avatar);
    const overlay = document.getElementById('auth-overlay');
    if (overlay) overlay.classList.add('hidden');

    // Mostra subito app-root — era display:none nell'HTML, showPage potrebbe non essere ancora pronta
    const appRoot = document.getElementById('app-root');
    if (appRoot) appRoot.style.display = 'block';
    if (window.showPage) {
        window.showPage('home');
    } else {
        // showPage non ancora registrata (race condition) — riprova dopo l'init dei moduli
        setTimeout(() => window.showPage?.('home'), 200);
    }

    if (window.showToast) window.showToast(`Benvenuto, ${name}! È il momento di splendere.`, 'success');

    // Notifica i moduli post-login (widget, social, eventi, notifiche…)
    window.dispatchEvent(new CustomEvent('cortex:login', { detail: { uid: window._fbUserId, name, avatar } }));
}

export function handleLogin() {
    const rawName = document.getElementById('auth-name-input')?.value?.trim();
    if (!rawName) { if (window.showToast) window.showToast(t('firebase_enter_name'), 'info'); return; }
    // GDPR: verifica consenso età (solo al primo accesso)
    if (typeof window.__gdprValidateAge === 'function' && !window.__gdprValidateAge()) return;
    completeAuth(rawName === 'DIO' ? '👑 ' + rawName : rawName);
}

export function updateUserUI(name, avatar) {
    const nameEl     = document.getElementById('user-display-name');
    const initialsEl = document.getElementById('user-initials');
    const wrap       = document.getElementById('user-profile-wrap');
    if (!name) return;

    const initial = name.substring(0, 1).toUpperCase();

    if (nameEl) nameEl.textContent = name;

    if (initialsEl) {
        if (avatar) {
            // Usa <img> con referrerpolicy per foto Google.
            // Se l'immagine non carica (CORS / 403) mostra l'iniziale come fallback.
            initialsEl.style.background = 'linear-gradient(135deg, var(--accent), var(--accent2))';
            initialsEl.textContent = initial; // iniziale visibile mentre img carica
            const img = new Image();
            img.referrerPolicy = 'no-referrer';
            img.onload = () => {
                initialsEl.innerHTML = '';
                initialsEl.style.background = 'transparent';
                const el = document.createElement('img');
                el.src = avatar;
                el.alt = name;
                el.referrerPolicy = 'no-referrer';
                el.style.cssText = 'width:100%;height:100%;border-radius:50%;object-fit:cover;display:block;';
                initialsEl.appendChild(el);
            };
            img.onerror = () => {
                // L'immagine non è caricabile: mostra l'iniziale
                initialsEl.innerHTML = '';
                initialsEl.textContent = initial;
                initialsEl.style.background = 'linear-gradient(135deg, var(--accent), var(--accent2))';
            };
            img.src = avatar;
        } else {
            initialsEl.innerHTML = '';
            initialsEl.style.background = 'linear-gradient(135deg, var(--accent), var(--accent2))';
            initialsEl.textContent = initial;
        }
    }

    if (wrap) wrap.style.display = 'flex';

    const heroTitle = document.querySelector('.hero h1');
    if (heroTitle) heroTitle.innerHTML = `Eleva il tuo potenziale, <span class="text-gradient">${name}</span>`;
}

// Chiamata al DOMContentLoaded per ripristinare il profilo da localStorage
// (necessario se l'utente torna all'app senza passare dal redirect Google)
document.addEventListener('DOMContentLoaded', () => {
    const savedName   = localStorage.getItem('mm_user_name');
    const savedAvatar = localStorage.getItem('mm_user_avatar');
    const isLoggedIn  = localStorage.getItem('mm_is_logged_in') === 'true';
    if (isLoggedIn && savedName) {
        updateUserUI(savedName, savedAvatar || null);
    }
});

export async function logout() {
    if (typeof firebase !== 'undefined') {
        try { await firebase.auth().signOut(); } catch (_) {}
    }
    localStorage.removeItem('mm_user_name');
    localStorage.removeItem('mm_user_avatar');
    localStorage.removeItem('mm_is_logged_in');
    location.reload();
}

// ─── Import / Export ─────────────────────────────────────────────────────────
export function exportProgress() {
    const data = {
        decks:         localStorage.getItem(KEYS.DECKS_V1),
        sessions:      localStorage.getItem(KEYS.SESSIONS || 'mm_sessions'),
        gamification:  localStorage.getItem('mm_gamification'),
        user:          localStorage.getItem('mm_user_name')
    };
    const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = Object.assign(document.createElement('a'), { href: url, download: 'cortex-backup.json' });
    a.click();
    if (window.showToast) window.showToast('Backup scaricato!', 'success');
}

export function importProgress() {
    const input = Object.assign(document.createElement('input'), { type: 'file', accept: '.json' });
    input.onchange = e => {
        const reader = new FileReader();
        reader.onload = () => {
            try {
                const data = JSON.parse(reader.result);
                if (data.decks)        localStorage.setItem(KEYS.DECKS_V1, data.decks);
                if (data.sessions)     localStorage.setItem(KEYS.SESSIONS || 'mm_sessions', data.sessions);
                if (data.gamification) localStorage.setItem('mm_gamification', data.gamification);
                if (data.user)         localStorage.setItem('mm_user_name', data.user);
                if (window.showToast) window.showToast('Progressi caricati! Riavvio...', 'success');
                setTimeout(() => window.location.reload(), 1500);
            } catch (err) {
                if (window.showToast) window.showToast('File backup non valido! ❌', 'error');
            }
        };
        reader.readAsText(e.target.files[0]);
    };
    input.click();
}

// ─── Admin ────────────────────────────────────────────────────────────────────

/**
 * isAdminUser() — sempre true se l'utente loggato è l'admin.
 * NON rispetta l'admin-preview mode: serve per mostrare il toggle stesso.
 */
export function isAdminUser() {
    const ADMIN_UID   = 'f8oLEt3LDpT7VN9zFOa10mVE2Cf2';
    const ADMIN_EMAIL = 'francesco1cutugno@gmail.com';
    // Controlla window globals (settati da onAuthStateChanged / getRedirectResult)
    const uid   = window._fbUserId || '';
    const email = (window._cortexUserEmail || '').toLowerCase();
    if (uid === ADMIN_UID || email === ADMIN_EMAIL) return true;
    // Fallback: leggi direttamente Firebase Auth — copre il caso in cui
    // onAuthStateChanged non è ancora giunto ma il currentUser è già disponibile.
    try {
        const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
        if (user && (user.uid === ADMIN_UID || (user.email || '').toLowerCase() === ADMIN_EMAIL)) return true;
    } catch (_) { /* ignore */ }
    return false;
}

/**
 * isAdmin() — true solo se l'utente è admin E non è in modalità anteprima-utente.
 * Usata per decidere SE mostrare i bottoni admin nell'UI.
 */
export function isAdmin() {
    if (!isAdminUser()) return false;
    // In modalità anteprima-utente l'admin vede l'app come un utente normale
    return localStorage.getItem('cortex_admin_preview') !== '1';
}

// ─── Feedback ─────────────────────────────────────────────────────────────────

export async function submitFeedback() {
    const FEEDBACK_COOLDOWN_KEY = 'cortex_feedback_last';
    const last = parseInt(localStorage.getItem(FEEDBACK_COOLDOWN_KEY) || '0');
    const now = Date.now();
    if (now - last < 60_000) {
        if (window.showToast) window.showToast('Aspetta un momento prima di inviare un altro feedback.', 'info');
        return;
    }
    const textEl  = document.getElementById('feedback-text');
    const aliasEl = document.getElementById('feedback-alias');
    const nameEl  = document.getElementById('user-display-name');
    const text    = textEl?.value?.trim();
    const alias   = aliasEl?.value?.trim() || nameEl?.textContent || 'Anonimo';

    if (!text || text.length < 5)    { if (window.showToast) window.showToast('Messaggio troppo breve!', 'info'); return; }
    if (text.length > 2000)          { if (window.showToast) window.showToast('Messaggio troppo lungo (max 2000 caratteri).', 'info'); return; }

    // Fallback: salva in localStorage se Firebase non disponibile
    if (!firebase?.apps?.length) {
        const local = JSON.parse(localStorage.getItem('cortex_feedbacks_local') || '[]');
        local.unshift({ alias: alias || 'Anonimo', text, timestamp: now, local: true });
        localStorage.setItem('cortex_feedbacks_local', JSON.stringify(local.slice(0, 50)));
        if (window.showToast) window.showToast(t('feedback_thanks'), 'success');
        if (textEl) textEl.value = '';
        localStorage.setItem(FEEDBACK_COOLDOWN_KEY, now.toString());
        return;
    }

    const _db = firebase.app().firestore();
    try {
        await _db.collection('feedbacks').add({
            userId: window._fbUserId || 'anonymous', alias: alias || 'Anonimo', text,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        });
        if (window.showToast) window.showToast(t('feedback_thanks'), 'success');
        if (textEl) textEl.value = '';
        localStorage.setItem(FEEDBACK_COOLDOWN_KEY, now.toString());
        loadFeedbackMessages();
    } catch (e) {
        if (window.showToast) window.showToast('Errore. Riprova più tardi.', 'error');
        console.error('[submitFeedback]', e);
    }
}

export async function loadFeedbackMessages() {
    // Aspetta Firebase se non ancora pronto (max 3 secondi)
    if (!firebase?.apps?.length) {
        let waited = 0;
        await new Promise(resolve => {
            const check = setInterval(() => {
                waited += 200;
                if (firebase?.apps?.length || waited >= 3000) { clearInterval(check); resolve(); }
            }, 200);
        });
        if (!firebase?.apps?.length) return;
    }
    const container = document.getElementById('feedback-list');
    if (!container) return;
    const _db = firebase.app().firestore();
    try {
        const snap = await _db.collection('feedbacks').orderBy('timestamp', 'desc').limit(20).get();
        if (snap.empty) { container.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:20px;">Nessun feedback ancora. Sii il primo!</div>'; return; }
        container.innerHTML = '';
        snap.forEach(doc => {
            const el = document.createElement('div');
            el.innerHTML = renderSingleMessage(doc.id, doc.data());
            container.appendChild(el.firstElementChild);
        });
    } catch (e) {
        console.error('[Feedback] loadFeedbackMessages:', e);
        container.innerHTML = `<div style="text-align:center;color:var(--red);padding:20px;">⚠️ Errore: ${e.message}</div>`;
    }
}

function sanitizeHtml(str) {
    if (typeof str !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

function renderSingleMessage(id, data) {
    const pinned = data.pinned || false;
    // Usa data-attributes — ZERO dipendenza da window.* o timing.
    // Il listener (setupFeedbackDelegation) intercetta i click su qualsiasi bottone admin,
    // anche se il DOM viene ricreato dopo.
    // Pulsanti admin nel FLUSSO NORMALE (non position:absolute) — così non vengono
    // tagliati da overflow-y:auto del contenitore #feedback-list.
    const showAdminControls = isAdmin() || (window._cortexFeedbackAdminMode && isAdminUser());
    const adminControls = showAdminControls ? `
        <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap;">
            <button data-fb-action="delete" data-fb-id="${id}"
                style="background:rgba(239,68,68,0.1);border:1px solid var(--red);color:var(--red);border-radius:8px;padding:6px 12px;font-size:0.75rem;cursor:pointer;font-family:inherit;">🗑️ Elimina</button>
            <button data-fb-action="pin" data-fb-id="${id}" data-fb-pinned="${pinned}"
                style="background:rgba(124,106,247,0.1);border:1px solid var(--accent);color:var(--accent);border-radius:8px;padding:6px 12px;font-size:0.75rem;cursor:pointer;font-family:inherit;">📌 ${pinned?'Rimuovi Pin':'Fissa'}</button>
            <button data-fb-action="reply" data-fb-id="${id}"
                style="background:rgba(245,158,11,0.1);border:1px solid #f59e0b;color:#f59e0b;border-radius:8px;padding:6px 12px;font-size:0.75rem;cursor:pointer;font-family:inherit;">↩️ Rispondi</button>
        </div>` : '';
    let dateStr = 'Poco fa';
    if (data.timestamp) { const d = data.timestamp.toDate(); dateStr = d.toLocaleDateString()+' '+d.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}); }
    const pinnedBadge = data.pinned ? '<span style="background:rgba(124,106,247,0.2);color:var(--accent2);padding:2px 6px;border-radius:4px;font-size:0.7rem;font-weight:bold;margin-right:8px;">📌 FISSATO</span>' : '';
    const cleanAdminReply = data.adminReply ? sanitizeHtml(data.adminReply) : '';
    const adminReply  = cleanAdminReply ? `<div style="margin-top:10px;padding:12px;border-left:2px solid var(--accent);background:rgba(168,85,247,0.05);border-radius:6px;"><span style="font-size:0.75rem;font-weight:bold;color:var(--accent2);text-transform:uppercase;">👑 Risposta di Cortex:</span><p style="font-size:0.9rem;margin-top:6px;color:var(--text);line-height:1.4;">${cleanAdminReply.replace(/\n/g,'<br>')}</p></div>` : '';
    const cleanAlias = sanitizeHtml(data.alias || data.name || 'Anonimo');
    const cleanText = sanitizeHtml(data.text || '');
    return `<div class="message-card${data.pinned?' pinned':''}" style="background:rgba(255,255,255,0.02);border:1px solid rgba(255,255,255,0.05);border-radius:12px;padding:20px;">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
            <div>${pinnedBadge}<span style="font-weight:bold;color:var(--accent2);">${cleanAlias}</span></div>
            <span style="font-size:0.75rem;color:var(--text-muted);">${dateStr}</span>
        </div>
        <p style="line-height:1.5;color:var(--text);word-wrap:break-word;">${cleanText.replace(/\n/g,'<br>')}</p>
        ${adminReply}${adminControls}
    </div>`;
}

// ── Helper: forza refresh del token Firebase prima delle operazioni admin ──────
async function _refreshAuthToken() {
    try {
        const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
        if (user) await user.getIdToken(true); // forza refresh se il token è vecchio
    } catch (_) { /* ignora — Firestore riprova con il token corrente */ }
}

export async function deleteFeedback(docId) {
    if (!confirm('Sei sicuro di voler eliminare questo feedback?')) return;
    try {
        await _refreshAuthToken();
        const _db = firebase.app().firestore();
        await _db.collection('feedbacks').doc(docId).delete();
        if (window.showToast) window.showToast(t('feedback_deleted'), 'success');
        loadFeedbackMessages();
    } catch (e) {
        console.error('[Feedback] delete error:', e);
        const msg = e.code === 'permission-denied'
            ? '❌ Permesso negato. Assicurati di essere loggato con Google.'
            : 'Errore eliminazione: ' + e.message;
        if (window.showToast) window.showToast(msg, 'error');
    }
}

export async function pinFeedback(docId, currentPinned = false) {
    try {
        await _refreshAuthToken();
        const _db = firebase.app().firestore();
        await _db.collection('feedbacks').doc(docId).update({ pinned: !currentPinned });
        if (window.showToast) window.showToast(!currentPinned ? 'Feedback fissato!' : 'Rimosso dai fissati', 'success');
        loadFeedbackMessages();
    } catch (e) {
        console.error('[Feedback] pin error:', e);
        const msg = e.code === 'permission-denied'
            ? '❌ Permesso negato. Assicurati di essere loggato con Google.'
            : 'Errore pin: ' + e.message;
        if (window.showToast) window.showToast(msg, 'error');
    }
}

export async function replyFeedback(docId) {
    const reply = prompt('Inserisci la risposta dello sviluppatore:');
    if (!reply || !reply.trim()) return;
    try {
        await _refreshAuthToken();
        const _db = firebase.app().firestore();
        await _db.collection('feedbacks').doc(docId).update({ adminReply: reply.trim() });
        if (window.showToast) window.showToast(t('firebase_reply_added'), 'success');
        loadFeedbackMessages();
    } catch (e) {
        console.error('[Feedback] reply error:', e);
        const msg = e.code === 'permission-denied'
            ? '❌ Permesso negato. Assicurati di essere loggato con Google.'
            : "Errore risposta: " + e.message;
        if (window.showToast) window.showToast(msg, 'error');
    }
}

// ── Event delegation per i bottoni admin nei messaggi feedback ────────────────
// Un solo listener su document: funziona anche se il DOM viene ricreato.
// Viene registrato UNA SOLA VOLTA al caricamento del modulo.
(function setupFeedbackDelegation() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-fb-action]');
        if (!btn) return;
        e.preventDefault();
        e.stopPropagation();

        const action = btn.dataset.fbAction;
        const id     = btn.dataset.fbId;
        const pinned = btn.dataset.fbPinned === 'true';

        console.log('[Feedback] Admin action:', action, id);

        if (action === 'delete') deleteFeedback(id);
        else if (action === 'pin')    pinFeedback(id, pinned);
        else if (action === 'reply')  replyFeedback(id);
    });

})();

// Alias window.* per retrocompatibilità (non più usati nei bottoni, ma utili da console)
window._fbDeleteFeedback = deleteFeedback;
window._fbPinFeedback    = pinFeedback;
window._fbReplyFeedback  = replyFeedback;
window.isAdmin           = isAdmin;
window.isAdminUser       = isAdminUser;

// ─── Applica impostazioni salvate ─────────────────────────────────────────────
export async function applySavedSettings() {
    const savedName   = localStorage.getItem('mm_user_name');
    const savedAvatar = localStorage.getItem('mm_user_avatar');
    const isLoggedIn  = localStorage.getItem('mm_is_logged_in') === 'true';

    if (isLoggedIn && savedName) {
        window._fbLoggedIn = true;
        const overlay = document.getElementById('auth-overlay');
        if (overlay) overlay.classList.add('hidden');
        // Mostra subito app-root per utenti già loggati (returning user)
        const appRoot = document.getElementById('app-root');
        if (appRoot) appRoot.style.display = 'block';
        updateUserUI(savedName, savedAvatar);
        // showPage non è ancora registrata qui (prima di initNavigation)
        // — onAuthStateChanged la chiamerà quando Firebase risponde
    }

    if (localStorage.getItem('mm_high_readability') === '1') document.body.classList.add('high-readability');
    if (localStorage.getItem('mm_zen_mode') === '1')         document.body.classList.add('zen-mode');

    // Carica campi Firebase nelle impostazioni
    const fields = { 'fb-api-key': 'fb_api_key', 'fb-auth-domain': 'fb_auth_domain', 'fb-project-id': 'fb_project_id' };
    for (const [id, key] of Object.entries(fields)) {
        const el = document.getElementById(id);
        if (el) el.value = localStorage.getItem(key) || '';
    }

    await initFirebase();
}

// ─── Cloud Storage ─────────────────────────────────────────────────────────────
/**
 * Carica un file (immagine/audio) su Firebase Storage e restituisce l'URL pubblico.
 */
export async function uploadMediaToCloud(file, folder = 'flashcards') {
    // Controlliamo se Firebase è attivo
    if (!window.firebase || !firebase.storage) {
        throw new Error("Firebase Storage non è configurato.");
    }

    try {
        // Creiamo un nome unico per il file usando un timestamp
        const uniqueFileName = `${Date.now()}_${file.name}`;
        const storageRef = firebase.storage().ref(`${folder}/${uniqueFileName}`);
        
        // Iniziamo l'upload
        const snapshot = await storageRef.put(file);
        
        // Otteniamo l'URL pubblico per visualizzare l'immagine nell'app
        const downloadURL = await snapshot.ref.getDownloadURL();
        return downloadURL;
        
    } catch (error) {
        console.error("Errore durante l'upload su Firebase:", error);
        throw error;
    }
}

// ─── Push Notifications ───────────────────────────────────────────────────────

/**
 * Richiede il permesso per le notifiche push e salva il token FCM su Firestore.
 */
export async function requestNotificationPermission() {
    if (!('Notification' in window)) {
        if (window.showToast) window.showToast('Il tuo browser non supporta le notifiche push.', 'error');
        return;
    }

    try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
            const msg = getMessaging();
            if (!msg) {
                if (window.showToast) window.showToast('Servizio messaggistica non disponibile.', 'error');
                return;
            }
            
            // VAPID Key (Firebase Console → Impostazioni progetto → Cloud Messaging → Certificati web push)
            const vapidKey = localStorage.getItem('fb_vapid_key') || 'BAJ-5Wxyw_ITw_gRieCu8Lw_qMAAXvpIpe8XUb8Wn_wnLSAOPiUW1XoWiA0Nr7vA-7JXvRtFufzJJPLn8JjikNA';
            const token = await msg.getToken({ vapidKey });

            if (token) {
                console.log('[FCM] Token ottenuto:', token);
                // Salviamo il token nel documento utente
                if (window._fbUserId) {
                    const _db = firebase.app().firestore();
                    await _db.collection('users').doc(window._fbUserId).set({
                        fcmToken: token,
                        notificationsEnabled: true,
                        lastTokenUpdate: firebase.firestore.FieldValue.serverTimestamp()
                    }, { merge: true });
                }
                if (window.showToast) window.showToast('Notifiche attivate con successo! 🔔', 'success');
            }
        } else {
            if (window.showToast) window.showToast('Permesso notifiche negato.', 'info');
        }
    } catch (err) {
        console.error('[FCM] Errore autorizzazione:', err);
        if (window.showToast) window.showToast('Errore durante l\'attivazione delle notifiche.', 'error');
    }
}

// ─── Gemini Proxy Helper (centralizzato) ────────────────────────────────────
/**
 * Chiama Gemini tramite il proxy Firebase se l'utente è loggato,
 * altrimenti usa la chiave API dell'utente (fallback legacy).
 *
 * @param {string|Array} promptOrContents - Testo prompt oppure array `contents` nativo Gemini
 * @param {object} options - { model, temperature, responseMimeType, generationConfig }
 * @returns {Promise<string>} - Testo della risposta Gemini
 */
export async function callGemini(promptOrContents, options = {}) {
    const model = options.model || 'gemini-2.5-flash';
    const generationConfig = options.generationConfig || {
        temperature: options.temperature ?? 0.7,
        ...(options.responseMimeType ? { response_mime_type: options.responseMimeType } : {})
    };

    const contents = Array.isArray(promptOrContents)
        ? promptOrContents
        : [{ parts: [{ text: promptOrContents }] }];

    // ── Percorso 1: Proxy Firebase via raw fetch (onRequest, CORS gestito lato server) ──
    if (window._fbLoggedIn) {
        try {
            const user = typeof firebase !== 'undefined' ? firebase.auth().currentUser : null;
            if (!user) throw new Error('NO_USER');

            // Token fresco — forza refresh per evitare token scaduti
            const idToken = await user.getIdToken(true);

            const res = await fetch('/api/gemini', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${idToken}`
                },
                body: JSON.stringify({ model, contents, generationConfig }),
                signal: AbortSignal.timeout(25000)
            });

            if (res.status === 429) {
                const body = await res.json().catch(() => ({}));
                if (body.error === 'PAYWALL_LIMIT_REACHED') {
                    const e = new Error('PAYWALL_LIMIT_REACHED');
                    e.isPaywall = true;
                    throw e;
                }
                throw new Error('Rate limit raggiunto');
            }
            if (!res.ok) {
                const body = await res.json().catch(() => ({}));
                const proxyErr = new Error(body.error || `Proxy HTTP ${res.status}`);
                proxyErr.proxyStatus = res.status;
                throw proxyErr;
            }

            const data = await res.json();
            const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
            if (text) return text;
            throw new Error('Proxy: risposta vuota');
        } catch (err) {
            if (err.message === 'NO_USER') {
                // Non loggato: caduta sul percorso 2
            } else if (err.isPaywall) {
                throw err;
            } else if (err.proxyStatus === 404) {
                // Endpoint /api/gemini non disponibile (es. dev locale senza funzioni
                // Firebase deployate) → fallback sulla chiave API diretta invece di rompere il test.
                console.warn('[callGemini] Proxy non disponibile (404) — fallback su chiave API diretta (dev locale?)');
            } else {
                console.error('[callGemini] Proxy error:', err.message);
                throw err;
            }
        }
    }

    // ── Percorso 2: Chiave API diretta (fallback legacy) ─────────────────────
    const apiKey = SecurityManager.getApiKey()
        || (typeof window._state !== 'undefined' ? window._state?.geminiKey : null);
    if (!apiKey) {
        const err = new Error('NO_API_KEY');
        err.isNoApiKey = true;
        throw err;
    }

    const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
    const res = await fetch(
        `${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents, generationConfig })
        }
    );

    if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        const msg = errData.error?.message || '';
        const err = new Error(msg || `Gemini ${res.status}`);
        if (res.status === 429) { err.isRateLimit = true; }
        if (res.status === 503 || res.status === 500) { err.isDown = true; }
        if (res.status === 401 || res.status === 403) { err.isAuthError = true; }
        throw err;
    }

    const data = await res.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('Risposta Gemini vuota');
    return text;
}

// ─── Window exports (compatibilità con data-fn del registry) ─────────────────
export function registerFirebaseGlobals(registry) {
    const fns = {
        loginWithGoogle, logout, handleLogin, exportProgress, importProgress,
        submitFeedback, loadFeedbackMessages, deleteFeedback, pinFeedback, replyFeedback,
        testFirebaseConnection, syncToCloud, completeAuth,
        loadDeckFromSubcollection,
        requestNotifications: requestNotificationPermission,
        sendFeedback: submitFeedback
    };
    for (const [name, fn] of Object.entries(fns)) {
        window[name] = fn;
        if (registry) registry(name, fn);
    }
}

// ── WIN-BACK: banner per ex-abbonati al primo login dopo la cancellazione ─────
function _showWinbackBanner() {
    if (document.getElementById('winback-modal')) return;
    const modal = document.createElement('div');
    modal.id = 'winback-modal';
    modal.style.cssText = `
        position:fixed; inset:0; z-index:99998;
        background:rgba(0,0,0,0.6); backdrop-filter:blur(6px);
        display:flex; align-items:center; justify-content:center;
        animation:fadeIn 0.3s ease;
    `;
    modal.innerHTML = `
        <div style="
            background:var(--bg-card,#1e1e2e); border-radius:24px;
            padding:36px 28px; max-width:380px; width:calc(100% - 48px);
            text-align:center; box-shadow:0 24px 80px rgba(0,0,0,0.5);
            animation:scaleIn 0.4s cubic-bezier(0.16,1,0.3,1);
            border:1px solid rgba(239,68,68,0.3);
        ">
            <div style="font-size:3rem; margin-bottom:12px;">😢</div>
            <h2 style="margin:0 0 8px; font-size:1.3rem; color:var(--text-primary,#fff); font-weight:800;">
                Ci manchi!
            </h2>
            <p style="margin:0 0 20px; color:var(--text-secondary,rgba(255,255,255,0.7)); font-size:0.9rem; line-height:1.5;">
                Il tuo piano Student è scaduto. Torna a studiare con l'AI, Boss Mode e le sessioni orali — riattiva con lo stesso prezzo di prima.
            </p>
            <button onclick="
                document.getElementById('winback-modal')?.remove();
                if(window.showPaywall) window.showPaywall('feature');
            " style="
                background:linear-gradient(135deg,#7c6af7,#3b82f6);
                border:none; border-radius:14px; color:#fff;
                font-weight:700; font-size:0.95rem; padding:14px 28px;
                cursor:pointer; width:100%; font-family:inherit;
                box-shadow:0 8px 24px rgba(124,106,247,0.35);
                margin-bottom:10px;
            ">🔄 Riattiva Student</button>
            <button onclick="document.getElementById('winback-modal')?.remove();" style="
                color:var(--text-muted,rgba(255,255,255,0.4));
                font-size:0.82rem; cursor:pointer; font-family:inherit;
                padding:4px;">No grazie, continua gratis</button>
        </div>
    `;
    document.body.appendChild(el);
    el.addEventListener('click', (e) => { if (e.target === el) el.remove(); });
}
