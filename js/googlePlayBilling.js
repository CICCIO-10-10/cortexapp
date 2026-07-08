/**
 * js/googlePlayBilling.js
 * Google Play Billing via Digital Goods API (TWA only)
 *
 * Usato solo quando l'app gira dentro la TWA Android.
 * Sul web si usa Stripe normalmente.
 */

// SKU Google Play — devono corrispondere ESATTAMENTE agli ID prodotti
// creati nella Play Console → Monetizzazione → Abbonamenti
export const PLAY_SKUS = {
    student: 'cortex_student_monthly',
    pro:     'cortex_pro_monthly',
    sparks_s: 'cortex_sparks_50',
    sparks_m: 'cortex_sparks_150',
    sparks_l: 'cortex_sparks_500',
};

let _digitalGoodsService = null;

/**
 * Ritorna true se l'app sta girando dentro la TWA Android
 * con supporto al Google Play Billing.
 */
export async function isGooglePlayAvailable() {
    if (!('getDigitalGoodsService' in window)) return false;
    try {
        _digitalGoodsService = await window.getDigitalGoodsService(
            'https://play.google.com/billing'
        );
        return !!_digitalGoodsService;
    } catch {
        return false;
    }
}

/**
 * Avvia il flusso di acquisto Google Play per un abbonamento.
 * @param {string} plan - 'student' | 'pro'
 * @returns {Promise<{success: boolean, purchaseToken?: string, sku?: string}>}
 */
export async function purchaseWithGooglePlay(plan) {
    const sku = PLAY_SKUS[plan];
    if (!sku) throw new Error(`SKU non trovato per il piano: ${plan}`);

    if (!_digitalGoodsService) {
        const available = await isGooglePlayAvailable();
        if (!available) throw new Error('Google Play Billing non disponibile.');
    }

    // Verifica dettagli prodotto
    let itemDetails;
    try {
        itemDetails = await _digitalGoodsService.getDetails([sku]);
    } catch (e) {
        throw new Error('Impossibile recuperare i dettagli del prodotto da Play Store.');
    }

    if (!itemDetails || itemDetails.length === 0) {
        throw new Error(`Prodotto "${sku}" non trovato nel Play Store. Verifica la Play Console.`);
    }

    // Avvia Payment Request (Digital Goods API)
    const paymentRequest = new PaymentRequest(
        [{
            supportedMethods: 'https://play.google.com/billing',
            data: { sku }
        }],
        {
            total: {
                label: itemDetails[0].title || plan,
                amount: { currency: 'EUR', value: '0' } // Il prezzo reale è gestito da Play Store
            }
        }
    );

    let paymentResponse;
    try {
        paymentResponse = await paymentRequest.show();
    } catch (e) {
        if (e.name === 'AbortError') return { success: false }; // Utente ha annullato
        throw new Error('Errore durante il pagamento: ' + e.message);
    }

    const purchaseToken = paymentResponse.details?.purchaseToken;
    if (!purchaseToken) {
        await paymentResponse.complete('fail');
        throw new Error('Token di acquisto non ricevuto da Google Play.');
    }

    // Completa il pagamento lato client (la verifica avviene sul backend)
    await paymentResponse.complete('success');

    return { success: true, purchaseToken, sku };
}

/**
 * Invia il purchaseToken al backend Firebase per verifica e attivazione piano.
 * @param {string} purchaseToken
 * @param {string} sku
 * @param {string} plan - 'student' | 'pro'
 */
export async function verifyAndActivateGooglePlayPurchase(purchaseToken, sku, plan) {
    if (!window.firebase) throw new Error('Firebase non disponibile.');

    const verifyFn = window.firebase.functions().httpsCallable('verifyGooglePlayPurchase');
    const { data } = await verifyFn({ purchaseToken, sku, plan });

    if (!data?.success) {
        throw new Error(data?.error || 'Verifica acquisto fallita.');
    }

    return data;
}

/**
 * Flusso completo: acquisto + verifica backend + attivazione.
 * Chiamato da settings.js quando siamo in TWA.
 * @param {string} plan - 'student' | 'pro'
 */
export async function handleGooglePlayCheckout(plan) {
    if (window.showToast) window.showToast('Apertura Google Play... 🛒', 'info');

    let result;
    try {
        result = await purchaseWithGooglePlay(plan);
    } catch (e) {
        if (window.showToast) window.showToast('Errore acquisto: ' + e.message, 'error');
        return;
    }

    if (!result.success) return; // Annullato dall'utente

    if (window.showToast) window.showToast('Verifica acquisto in corso... ⏳', 'info');

    try {
        await verifyAndActivateGooglePlayPurchase(result.purchaseToken, result.sku, plan);
        if (window.showToast) window.showToast('🎉 Piano attivato! Benvenuto in Cortex ' + plan + '.', 'success');

        // Ricarica la pagina impostazioni per mostrare il nuovo piano
        setTimeout(() => {
            if (window.openSettings) window.openSettings();
        }, 1500);
    } catch (e) {
        if (window.showToast) window.showToast('Errore verifica: ' + e.message, 'error');
    }
}
