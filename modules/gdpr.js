/**
 * modules/gdpr.js — GDPR & Privacy Compliance
 *
 * Features:
 *  • Cookie consent banner (mostra una volta, localStorage)
 *  • Age check al login (16+ per GDPR EU)
 *  • Delete account con conferma + pulizia dati
 *  • Data export (diritto alla portabilità GDPR Art. 20)
 *  • Stripe Customer Portal (gestione/disdetta abbonamento)
 */

import { getFunctions } from '../services/firebase.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => (TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it);

const _getLang = () => localStorage.getItem('mm_lang') || 'it';

const COOKIE_KEY     = 'cortex_cookie_consent';   // 'accepted' | 'declined'
const AGE_CHECK_KEY  = 'cortex_age_verified';

// ─── Cookie Banner ────────────────────────────────────────────────────────────

/**
 * Mostra il cookie banner se l'utente non ha ancora scelto.
 * Chiamare all'avvio dell'app (bootApp o DOMContentLoaded).
 */
export function initCookieBanner() {
    if (localStorage.getItem(COOKIE_KEY)) return; // già scelto
    if (document.getElementById('gdpr-cookie-banner')) return;

    const banner = document.createElement('div');
    banner.id = 'gdpr-cookie-banner';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-label', 'Consenso cookie');
    banner.innerHTML = `
        <div style="
            position:fixed; bottom:0; left:0; right:0; z-index:99999;
            background:rgba(10,10,20,0.97); backdrop-filter:blur(20px);
            border-top:1px solid rgba(124,106,247,0.3);
            padding:16px 20px; display:flex; align-items:center;
            justify-content:space-between; gap:16px; flex-wrap:wrap;
            box-shadow:0 -8px 40px rgba(0,0,0,0.5);
            animation:slideUp 0.4s ease;">
            <div style="flex:1; min-width:240px;">
                <p style="font-size:0.85rem; color:var(--text); margin:0; line-height:1.5;">
                    🍪 Cortex usa cookie tecnici essenziali per il funzionamento dell'app e
                    cookie analitici anonimi per migliorare l'esperienza.
                    <a href="https://cortexapp.it/privacy" target="_blank" rel="noopener"
                        style="color:var(--accent); text-decoration:underline; margin-left:4px;">
                        Privacy Policy
                    </a>
                </p>
            </div>
            <div style="display:flex; gap:10px; flex-shrink:0;">
                <button id="gdpr-decline-btn" style="
                    padding:8px 18px; background:transparent;
                    border:1px solid var(--border); border-radius:10px;
                    color:var(--text-muted); font-family:inherit;
                    font-size:0.85rem; cursor:pointer;">
                    Solo essenziali
                </button>
                <button id="gdpr-accept-btn" style="
                    padding:8px 18px;
                    background:linear-gradient(135deg,var(--accent),var(--accent2));
                    border:none; border-radius:10px;
                    color:#fff; font-family:inherit;
                    font-size:0.85rem; font-weight:700; cursor:pointer;">
                    Accetta tutto ✓
                </button>
            </div>
        </div>`;

    document.body.appendChild(banner);

    document.getElementById('gdpr-accept-btn').onclick = () => _setCookieConsent('accepted');
    document.getElementById('gdpr-decline-btn').onclick = () => _setCookieConsent('declined');
}

function _setCookieConsent(choice) {
    localStorage.setItem(COOKIE_KEY, choice);
    const banner = document.getElementById('gdpr-cookie-banner');
    if (banner) banner.remove();
}

export function getCookieConsent() {
    return localStorage.getItem(COOKIE_KEY); // 'accepted' | 'declined' | null
}

// ─── Age Check ────────────────────────────────────────────────────────────────

/**
 * Aggiunge il checkbox "Ho almeno 16 anni" al form di login, se non già verificato.
 * Chiamare dopo DOMContentLoaded.
 */
export function injectAgeCheck() {
    if (localStorage.getItem(AGE_CHECK_KEY)) return;
    const authCard = document.querySelector('.auth-card');
    if (!authCard || document.getElementById('gdpr-age-check')) return;

    const wrapper = document.createElement('div');
    wrapper.id = 'gdpr-age-check';
    wrapper.style.cssText = `
        display:flex; align-items:flex-start; gap:10px;
        margin-top:16px; text-align:left;`;
    wrapper.innerHTML = `
        <input type="checkbox" id="age-consent-check" aria-label="Conferma età minima 16 anni"
            style="width:18px; height:18px; accent-color:var(--accent);
                margin-top:2px; cursor:pointer; flex-shrink:0;">
        <label for="age-consent-check" style="font-size:0.8rem; color:var(--text-muted); cursor:pointer; line-height:1.5;">
            Confermo di avere almeno <strong style="color:var(--text);">16 anni</strong> e di aver letto la
            <a href="https://cortexapp.it/privacy" target="_blank" rel="noopener"
                style="color:var(--accent); text-decoration:underline;">Privacy Policy</a>.
            (Richiesto dal GDPR per utenti EU.)
        </label>`;

    // Inserisce prima dei bottoni
    const firstBtn = authCard.querySelector('.btn');
    if (firstBtn) authCard.insertBefore(wrapper, firstBtn);
    else authCard.appendChild(wrapper);
}

/**
 * Verifica che il checkbox età sia selezionato.
 * @returns {boolean} true se ok, false e mostra errore se non selezionato
 */
export function validateAgeConsent() {
    if (localStorage.getItem(AGE_CHECK_KEY)) return true;
    const check = document.getElementById('age-consent-check');
    if (!check) return true; // se non iniettato, non bloccare
    if (check.checked) {
        localStorage.setItem(AGE_CHECK_KEY, '1');
        return true;
    }
    // Shake animation
    const wrapper = document.getElementById('gdpr-age-check');
    if (wrapper) {
        wrapper.style.animation = 'none';
        wrapper.offsetHeight; // reflow
        wrapper.style.animation = 'shake 0.4s ease';
    }
    if (window.showToast) window.showToast('⚠️ Devi confermare di avere almeno 16 anni per continuare.', 'error');
    return false;
}

// ─── Delete Account ───────────────────────────────────────────────────────────

/**
 * Apre il modale di conferma eliminazione account.
 */
export function openDeleteAccountModal() {
    if (document.getElementById('gdpr-delete-modal')) return;

    const modal = document.createElement('div');
    modal.id = 'gdpr-delete-modal';
    modal.innerHTML = `
        <div style="
            position:fixed; inset:0; z-index:999999;
            background:rgba(0,0,0,0.85); backdrop-filter:blur(16px);
            display:flex; align-items:center; justify-content:center; padding:24px;">
            <div style="
                width:100%; max-width:400px;
                background:var(--surface); border:1px solid rgba(239,68,68,0.3);
                border-radius:24px; padding:32px; text-align:center;
                box-shadow:0 32px 80px rgba(0,0,0,0.6);">
                <div style="font-size:3rem; margin-bottom:16px;">⚠️</div>
                <h2 style="font-size:1.3rem; font-weight:900; margin-bottom:12px; color:var(--text);">
                    Eliminare l'account?
                </h2>
                <p style="font-size:0.85rem; color:var(--text-muted); line-height:1.6; margin-bottom:8px;">
                    Questa azione è <strong style="color:rgb(239,68,68);">irreversibile</strong>.
                    Verranno eliminati permanentemente:
                </p>
                <ul style="text-align:left; font-size:0.82rem; color:var(--text-muted); margin:12px 0 20px; padding-left:20px; line-height:2;">
                    <li>Il tuo profilo e tutti i mazzi</li>
                    <li>Il tuo storico di studio e XP</li>
                    <li>Le tue sessioni cloud sincronizzate</li>
                    <li>I tuoi acquisti Neural Sparks</li>
                </ul>
                <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:24px;">
                    Scrivi <strong style="color:var(--text);">ELIMINA</strong> per confermare:
                </p>
                <input id="delete-confirm-input" type="text" placeholder="ELIMINA"
                    autocomplete="off" aria-label="Scrivi ELIMINA per confermare"
                    style="width:100%; padding:12px 16px; border-radius:12px;
                        background:var(--surface2); border:1px solid var(--border);
                        color:var(--text); font-family:inherit; font-size:1rem;
                        text-align:center; box-sizing:border-box; margin-bottom:16px;">
                <div style="display:flex; gap:12px;">
                    <button onclick="document.getElementById('gdpr-delete-modal').remove()"
                        style="flex:1; padding:12px; background:var(--surface2);
                            border:1px solid var(--border); border-radius:12px;
                            color:var(--text); font-family:inherit; cursor:pointer;
                            font-weight:600;">Annulla</button>
                    <button id="delete-confirm-btn"
                        onclick="window.__gdprConfirmDelete()"
                        style="flex:1; padding:12px; background:rgba(239,68,68,0.1);
                            border:1px solid rgba(239,68,68,0.4); border-radius:12px;
                            color:rgb(239,68,68); font-family:inherit; cursor:pointer;
                            font-weight:700;">🗑️ Elimina</button>
                </div>
            </div>
        </div>`;

    document.body.appendChild(modal);
}

window.__gdprConfirmDelete = async function() {
    const val = document.getElementById('delete-confirm-input')?.value?.trim();
    if (val !== 'ELIMINA') {
        if (window.showToast) window.showToast('❌ Scrivi esattamente "ELIMINA" per confermare.', 'error');
        return;
    }

    const btn = document.getElementById('delete-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = (_t().deleting||'Eliminazione...'); }

    try {
        // 1. Cancella dati Firestore tramite Firebase Auth + Cloud Function
        const user = window.firebase?.auth?.()?.currentUser
                  || window._firebaseUser
                  || null;

        if (user) {
            // Prova a eliminare il documento utente da Firestore
            const db = window.firebase?.firestore?.();
            if (db) {
                await db.collection('users').doc(user.uid).delete().catch(() => {});
                await db.collection('usage').doc(user.uid).delete().catch(() => {});
            }
            // Elimina account Auth
            await user.delete();
        }

        // 2. Pulisci localStorage
        localStorage.clear();
        sessionStorage.clear();

        // 3. Feedback e reload
        document.getElementById('gdpr-delete-modal')?.remove();
        alert(t('gdpr_deleted'));
        window.location.href = '/';
    } catch (err) {
        console.error('[GDPR] Delete error:', err);
        if (err.code === 'auth/requires-recent-login') {
            if (window.showToast) window.showToast('⚠️ Per sicurezza, esci e rientra prima di eliminare l\'account.', 'error');
        } else {
            if (window.showToast) window.showToast(t('gdpr_err_delete'), 'error');
        }
        if (btn) { btn.disabled = false; btn.textContent = '🗑️ Elimina'; }
    }
};

// ─── Data Export (GDPR Art. 20) ───────────────────────────────────────────────

/**
 * Esporta tutti i dati dell'utente in un file JSON scaricabile.
 * Diritto alla portabilità dei dati (GDPR Art. 20).
 */
export function exportUserData() {
    try {
        const data = {
            exportDate:  new Date().toISOString(),
            gdprNote:    'Esportazione dati personali ai sensi del GDPR Art. 20.',
            decks:       JSON.parse(localStorage.getItem('mm_decks_v1') || '[]'),
            sessions:    JSON.parse(localStorage.getItem('mm_sessions') || '[]'),
            settings: {
                theme:       localStorage.getItem('mm_theme'),
                lang:        localStorage.getItem('mm_lang'),
                zenMode:     localStorage.getItem('mm_zen'),
                readability: localStorage.getItem('mm_readability'),
            },
            gamification: {
                xp:       localStorage.getItem('cortex_xp'),
                badges:   localStorage.getItem('cortex_badges'),
                streak:   localStorage.getItem('cortex_streak'),
            }
        };

        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `cortex-dati-${new Date().toISOString().split('T')[0]}.json`;
        a.click();
        URL.revokeObjectURL(url);

        if (window.showToast) window.showToast('📦 Dati esportati correttamente!', 'success');
    } catch (err) {
        console.error('[GDPR] Export error:', err);
        if (window.showToast) window.showToast('❌ Errore durante l\'esportazione.', 'error');
    }
}

// ─── Stripe Customer Portal ───────────────────────────────────────────────────

/**
 * Apre il Stripe Customer Portal per gestire/disdire l'abbonamento.
 * Richiede che l'utente sia loggato e abbia un abbonamento attivo.
 */
export async function openStripePortal() {
    if (window.showToast) window.showToast('⏳ Apertura portale Stripe...', 'info');

    try {
        // Link diretto generato dalla Dashboard Stripe (No-code customer portal)
        const portalUrl = "https://billing.stripe.com/p/login/test_fZuaEY0GpgjEgtc6Pl3gkO0";
        window.open(portalUrl, '_blank', 'noopener');
    } catch (err) {
        console.error('[Stripe Portal]', err);
        if (window.showToast) window.showToast(t('gdpr_err_portal'), 'error');
    }
}

// ─── Registrazione globali ────────────────────────────────────────────────────

export function registerGDPRGlobals(registry) {
    registry('openDeleteAccountModal', openDeleteAccountModal);
    registry('exportUserData',         exportUserData);
    registry('openStripePortal',       openStripePortal);
}
