/**
 * core/ui.js — Phase 21 Refactoring
 *
 * Utility visive e gestione dello stato della connessione:
 *  - showToast()         — visualizza notifiche toast
 *  - showPaywall()       — visualizza overlay sottoscrizione
 *  - updateOnlineStatus()— gestisce banner offline e notifiche di rete
 *  - initUI()            — inizializza i listener globali per la rete
 */

import { track } from './analytics.js';

let toastTimeout;

/**
 * Visualizza una notifica a scomparsa (toast).
 */
export function showToast(msg, type = '') {
    const el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.className = 'show ' + type;
    clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => el.className = '', 3000);
}

/**
 * Mostra il modal di upgrade (paywall) con messaggio contestuale.
 * @param {'ai'|'duels'|'share'|'feature'} reason  — motivo del blocco
 */
export function showPaywall(reason = 'ai') {
    // FIX 10/07/2026: un ospite non deve MAI vedere il paywall €4,99 — il suo
    // prossimo passo è la registrazione gratuita, non l'abbonamento. Redirect
    // al gate di login (window.showGuestLoginGate, definito in app.html).
    if (!window._fbLoggedIn && typeof window.showGuestLoginGate === 'function') {
        track('paywall_redirect_guest_gate', { reason });
        window.showGuestLoginGate(reason);
        return;
    }
    const CONTEXTS = {
        ai:      { icon: '🤖', title: 'Limite AI Raggiunto',           body: 'Hai esaurito le chiamate AI gratuite di oggi (10/giorno). Passa a Student per <strong>100 chiamate al giorno</strong>.' },
        duels:   { icon: '⚔️', title: 'Neural Duels — Piano Student', body: 'Le sfide 1v1 in tempo reale sono disponibili nel piano <strong>Student</strong>. Sfida i tuoi compagni di corso e scala la leaderboard!' },
        boss:    { icon: '🎤', title: 'Boss Mode — Piano Student',    body: 'L\'interrogazione orale AI è disponibile nel piano <strong>Student</strong>. Preparati come se fossi davanti al professore.' },
        oral:    { icon: '🗣️', title: 'Esame Orale AI — Piano Student', body: 'Le sessioni di esame orale con feedback AI richiedono il piano <strong>Student</strong>.' },
        audio:   { icon: '🎧', title: 'Sbobinatura AI — Piano Student', body: 'Converti audio e registrazioni in flashcard con l\'AI. Disponibile nel piano <strong>Student</strong>.' },
        studyplan: { icon: '📅', title: 'Piano di Studio AI — Piano Student', body: 'Genera un piano di studio personalizzato con l\'AI in base alle tue scadenze. Disponibile nel piano <strong>Student</strong>.' },
        share:   { icon: '🌍', title: 'Condivisione Community',       body: 'Condividere mazzi pubblicamente con la community richiede il piano <strong>Student</strong>.' },
        voice:   { icon: '🎙️', title: 'Voce Personalizzata — Piano Student', body: 'Scegli la voce esatta del Coach AI, il tono e la velocità. Disponibile nel piano <strong>Student</strong>.' },
        feature: { icon: '🚀', title: 'Funzione Premium',             body: 'Questa funzione è disponibile nel piano <strong>Student</strong>.' },
    };
    const ctx = CONTEXTS[reason] || CONTEXTS.feature;

    // Analytics
    track('paywall_shown', { reason });

    // Rimuovi gate precedente se esiste
    document.querySelector('.paywall-gate')?.remove();

    const gate = document.createElement('div');
    gate.className = 'paywall-gate';
    gate.innerHTML = `
        <div class="paywall-content">
            <div class="paywall-icon">${ctx.icon}</div>
            <h2 class="paywall-title">${ctx.title}</h2>
            <p class="paywall-text">${ctx.body}</p>

            <div class="paywall-features">
                <div class="paywall-feature">✅ 100 chiamate AI / giorno</div>
                <div class="paywall-feature">✅ Boss Mode & Esame Orale AI</div>
                <div class="paywall-feature">✅ Sbobinatura audio → flashcard</div>
                <div class="paywall-feature">✅ Piano di studio AI personalizzato</div>
                <div class="paywall-feature">✅ Neural Duels 1v1</div>
            </div>

            <!-- Toggle mensile/annuale -->
            <div class="paywall-plan-toggle">
                <button class="paywall-plan-btn active" id="paywall-plan-monthly">Mensile</button>
                <button class="paywall-plan-btn" id="paywall-plan-yearly">
                    Annuale <span class="paywall-save-badge">-33%</span>
                </button>
            </div>

            <button class="paywall-btn-upgrade" id="paywall-stripe-btn">
                🎓 Passa a Student — <span id="paywall-price">€4,99/mese</span>
            </button>
            <p class="paywall-price-note" id="paywall-price-note">Puoi annullare in qualsiasi momento.</p>
            <button class="paywall-btn-close" onclick="this.closest('.paywall-gate').classList.remove('active')">
                Magari più tardi
            </button>
        </div>
    `;
    document.body.appendChild(gate);

    // Toggle mensile / annuale
    let selectedPlan = 'student_monthly';
    const btnMonthly = gate.querySelector('#paywall-plan-monthly');
    const btnYearly  = gate.querySelector('#paywall-plan-yearly');
    const priceLabel = gate.querySelector('#paywall-price');
    const priceNote  = gate.querySelector('#paywall-price-note');

    btnMonthly.addEventListener('click', () => {
        selectedPlan = 'student_monthly';
        btnMonthly.classList.add('active');
        btnYearly.classList.remove('active');
        priceLabel.textContent = '€4,99/mese';
        priceNote.textContent  = t('pricing_cancel_note');
    });
    btnYearly.addEventListener('click', () => {
        selectedPlan = 'student_yearly';
        btnYearly.classList.add('active');
        btnMonthly.classList.remove('active');
        priceLabel.textContent = '€39,99/anno';
        priceNote.textContent  = t('pricing_annual_savings');
    });

    // Wiring Stripe: chiama Firebase function per creare sessione Checkout
    gate.querySelector('#paywall-stripe-btn').addEventListener('click', async () => {
        if (!window._fbLoggedIn) {
            showToast('Accedi con Google prima di abbonarti.', 'error');
            return;
        }
        const btn = gate.querySelector('#paywall-stripe-btn');
        const originalHTML = btn.innerHTML;
        btn.innerHTML = '⏳ Preparazione pagamento...';
        btn.disabled = true;
        try {
            const fns = window._getFunctions?.();
            if (!fns) throw new Error('Firebase non inizializzato');
            const createCheckout = fns.httpsCallable('createCheckoutSession');
            const result = await createCheckout({ plan: selectedPlan });
            if (result.data?.url) {
                track('upgrade_click', { reason, plan: selectedPlan });
                window.location.href = result.data.url;
            } else {
                throw new Error('URL Stripe mancante');
            }
        } catch (e) {
            btn.innerHTML = originalHTML;
            btn.disabled = false;
            showToast(t('ui_err_payment'), 'error');
            console.error('[Paywall] Stripe error:', e);
        }
    });

    setTimeout(() => gate.classList.add('active'), 10);
}

/**
 * Gestisce l'interfaccia in base allo stato della connessione internet.
 */
export function updateOnlineStatus() {
    const badge = document.getElementById('offline-badge');
    if (!badge) return;

    if (navigator.onLine) {
        const wasOffline = badge.style.display === 'block';
        badge.style.display = 'none';
        if (wasOffline) {
            showToast(t('ui_reconnected'), "success");
            // Risincronizzo dal cloud dopo la riconnessione
            setTimeout(() => {
                if (typeof window._fbLoggedIn !== 'undefined' && window._fbLoggedIn) {
                    if (typeof window.loadFromCloud === 'function') window.loadFromCloud();
                }
            }, 1500);
        }
    } else {
        badge.style.display = 'block';
        badge.innerHTML = t('ui_offline');
        showToast("Sei offline. Puoi ancora studiare i tuoi mazzi! 💾", "info");
    }
}

/**
 * Inizializza i listener di rete per gestire online/offline.
 */
export function initUI() {
    window.addEventListener('online',  updateOnlineStatus);
    window.addEventListener('offline', updateOnlineStatus);
    
    // Check iniziale
    updateOnlineStatus();
}
