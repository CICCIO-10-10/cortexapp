/**
 * rewardedAds.js — Cortex Rewarded Ads System
 *
 * STATO: SCHELETRO — da completare dopo il 18 maggio (go-live Play Store)
 *
 * IDEA:
 *   L'utente free prova una feature premium → invece del paywall duro,
 *   gli offriamo: "Guarda 30 secondi di video → ottieni 5 Sparks gratis"
 *   Con 5 Sparks può usare la feature 1 volta.
 *
 * ARCHITETTURA:
 *   - Web/PWA puro      → fallback: mostra solo opzione acquisto Sparks
 *   - TWA (Play Store)  → chiama il bridge Android per AdMob rewarded video
 *   - AdMob rewarded    → onRewardEarned() → accredita Sparks → sblocca feature
 *
 * TODO DOPO 18 MAGGIO:
 *   1. Creare app Android nativa (o configurare TWA con AdMob SDK)
 *   2. Aggiungere AdMob SDK nel build.gradle
 *   3. Creare RewardedAdBridge.java che espone window.CortexAdBridge
 *   4. Inserire il vero Ad Unit ID da AdMob Console
 *   5. Collegare AdMob al progetto Firebase (già fatto su Firebase Console)
 *   6. Testare con Test Ad Unit ID prima di andare live
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const AD_CONFIG = {
    // TODO: sostituire con il vero Ad Unit ID da AdMob Console dopo go-live
    adUnitId: 'ca-app-pub-XXXXXXXXXXXXXXXX/XXXXXXXXXX',
    // Sparks accreditati per ogni video guardato
    sparksPerAd: 5,
    // Cooldown tra un ad e il prossimo (ms) — evita spam
    cooldownMs: 5 * 60 * 1000, // 5 minuti
};

let _lastAdTs = 0;

// ─── Rilevamento contesto ─────────────────────────────────────────────────────

/**
 * Restituisce true se l'app gira dentro la TWA Android con AdMob bridge.
 * Il bridge viene iniettato dall'app nativa come window.CortexAdBridge.
 */
function isTWA() {
    return typeof window !== 'undefined' && typeof window.CortexAdBridge !== 'undefined';
}

/**
 * Restituisce true se l'utente può vedere un ad ora
 * (non è in cooldown e il contesto lo supporta).
 */
export function canShowRewardedAd() {
    if (!isTWA()) return false;
    return Date.now() - _lastAdTs >= AD_CONFIG.cooldownMs;
}

// ─── Core ─────────────────────────────────────────────────────────────────────

/**
 * Mostra un rewarded ad. Se il contesto non lo supporta, fa fallback
 * alla schermata acquisto Sparks.
 *
 * @param {Object} options
 * @param {string} options.featureName  - Nome feature che si vuole sbloccare (per analytics)
 * @param {Function} options.onRewarded - Callback chiamata quando l'utente ottiene la ricompensa
 * @param {Function} options.onDismissed - Callback se l'utente chiude il video senza finirlo
 * @param {Function} options.onFallback  - Callback se il contesto non supporta gli ad
 */
export function showRewardedAd({ featureName = 'unknown', onRewarded, onDismissed, onFallback } = {}) {

    // Cooldown attivo
    const remainingMs = AD_CONFIG.cooldownMs - (Date.now() - _lastAdTs);
    if (remainingMs > 0) {
        const minutes = Math.ceil(remainingMs / 60000);
        if (window.showToast) {
            window.showToast(`Prossimo video disponibile tra ${minutes} min ⏱️`, 'info', 3000);
        }
        return;
    }

    // Contesto TWA con bridge Android → mostra ad vero
    if (isTWA()) {
        _showNativeAd({ featureName, onRewarded, onDismissed });
        return;
    }

    // Fallback web: nessun ad disponibile → offri acquisto Sparks
    if (typeof onFallback === 'function') {
        onFallback();
    } else {
        _showSparksFallback(featureName);
    }
}

// ─── Native bridge (TWA) ──────────────────────────────────────────────────────

function _showNativeAd({ featureName, onRewarded, onDismissed }) {
    // TODO: implementare quando il bridge Android è pronto

    // Il bridge Android chiamerà window.cortexOnAdRewarded() o window.cortexOnAdDismissed()
    // dopo che l'utente ha interagito con il video.

    window.cortexOnAdRewarded = () => {
        _lastAdTs = Date.now();
        const sparks = AD_CONFIG.sparksPerAd;
        _creditSparks(sparks);
        if (window.showToast) {
            window.showToast(`+${sparks} Sparks guadagnati! ⚡`, 'success', 3000);
        }
        _trackAdEvent('rewarded_ad_completed', featureName, sparks);
        if (typeof onRewarded === 'function') onRewarded(sparks);
        delete window.cortexOnAdRewarded;
        delete window.cortexOnAdDismissed;
    };

    window.cortexOnAdDismissed = () => {
        if (window.showToast) {
            window.showToast('Guarda il video fino alla fine per guadagnare Sparks 👀', 'info', 3000);
        }
        _trackAdEvent('rewarded_ad_dismissed', featureName, 0);
        if (typeof onDismissed === 'function') onDismissed();
        delete window.cortexOnAdRewarded;
        delete window.cortexOnAdDismissed;
    };

    try {
        // TODO: sostituire con la chiamata reale al bridge
        // window.CortexAdBridge.showRewardedAd(AD_CONFIG.adUnitId);
        console.log('[RewardedAds] TODO: chiamare window.CortexAdBridge.showRewardedAd()');
    } catch (e) {
        console.error('[RewardedAds] Bridge error:', e);
        _showSparksFallback(featureName);
    }
}

// ─── Sparks fallback (web) ────────────────────────────────────────────────────

function _showSparksFallback(featureName) {
    // Apre il modale acquisto Sparks già implementato nell'app
    if (typeof window.openSparksModal === 'function') {
        window.openSparksModal();
    } else if (typeof window.showPaywall === 'function') {
        window.showPaywall('sparks', featureName);
    }
}

// ─── Credito Sparks ───────────────────────────────────────────────────────────

async function _creditSparks(amount) {
    try {
        // Aggiorna Firestore + localStorage (stessa logica di buyStreakFreeze)
        const uid = localStorage.getItem('cortex_uid');
        if (!uid) return;

        const current = parseInt(localStorage.getItem('cortex_sparks_balance') || '0', 10);
        const newBalance = current + amount;
        localStorage.setItem('cortex_sparks_balance', newBalance.toString());

        // Sync Firestore
        if (typeof firebase !== 'undefined' && firebase.apps.length) {
            await firebase.firestore().collection('users').doc(uid).update({
                sparksBalance: firebase.firestore.FieldValue.increment(amount),
            });
        }

        // Aggiorna UI contatore Sparks se visibile
        const sparksEl = document.getElementById('sparks-balance-display');
        if (sparksEl) sparksEl.textContent = newBalance;

    } catch (e) {
        console.error('[RewardedAds] Errore credito Sparks:', e);
    }
}

// ─── Analytics ────────────────────────────────────────────────────────────────

function _trackAdEvent(eventName, featureName, sparksEarned) {
    try {
        if (typeof firebase !== 'undefined' && firebase.analytics) {
            firebase.analytics().logEvent(eventName, {
                feature_name: featureName,
                sparks_earned: sparksEarned,
            });
        }
    } catch (_) {}
}

// ─── UI Helper — bottone "Guarda un video" ────────────────────────────────────

/**
 * Crea e restituisce un elemento button "Guarda un video → +5 Sparks"
 * da inserire nel paywall al posto del solo bottone abbonamento.
 *
 * Uso:
 *   paywallEl.appendChild(createWatchAdButton({
 *     featureName: 'boss_mode',
 *     onRewarded: () => openBossMode(),
 *   }));
 */
export function createWatchAdButton({ featureName, onRewarded, onDismissed } = {}) {
    // TODO: mostrare solo se isTWA() === true (dopo go-live Play Store)

    const btn = document.createElement('button');
    btn.className = 'btn-watch-ad';
    btn.innerHTML = `
        <span style="font-size:1.3em">📺</span>
        Guarda 30 sec → +${AD_CONFIG.sparksPerAd} Sparks gratis
    `;
    btn.style.cssText = `
        display: flex; align-items: center; gap: 10px;
        background: linear-gradient(135deg, #f59e0b, #d97706);
        color: #fff; border: none; border-radius: 14px;
        padding: 14px 24px; font-size: 1rem; font-weight: 600;
        cursor: pointer; width: 100%; justify-content: center;
        margin-top: 12px;
    `;

    btn.addEventListener('click', () => {
        showRewardedAd({
            featureName,
            onRewarded,
            onDismissed,
            onFallback: () => {
                // Su web mostra messaggio spiegazione
                if (window.showToast) {
                    window.showToast(
                        'I video premio sono disponibili nell\'app Android 📱',
                        'info', 4000
                    );
                }
            },
        });
    });

    return btn;
}
