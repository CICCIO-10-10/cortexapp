// services/settings.js
// Fase 3 — Estrazione da main.js
// Gestisce impostazioni UI, accessibilità, AI settings, timer.
// Si integra con registry.js per i data-fn.

import { populateVoiceList, updateVoicePreference, setVoiceGender, getVoiceGender } from './ai.js';
import { t } from '../core/i18n.js';
import { isGooglePlayAvailable, handleGooglePlayCheckout } from '../js/googlePlayBilling.js';
import { isAdminUser } from './firebase.js';

// ─── Settings Overlay ─────────────────────────────────────────────────────────
export function openSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (!overlay) return;
    overlay.style.display = 'flex';
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';

    document.getElementById('check-readability').checked = document.body.classList.contains('high-readability');
    document.getElementById('check-zen').checked         = document.body.classList.contains('zen-mode');

    // Sincronizza bottone tema nel settings overlay
    const isLight = document.body.classList.contains('light');
    const settingsThemeBtn = document.getElementById('settings-theme-btn');
    if (settingsThemeBtn) settingsThemeBtn.innerHTML = isLight ? '☀️ Chiaro' : '🌙 Scuro';

    const mode       = localStorage.getItem('mm_transcription_mode') || 'local';
    // Chiave: SecurityManager legge sessionStorage prima, poi localStorage legacy
    const apiKey     = (window.SecurityManager?.getApiKey?.()) ||
                       sessionStorage.getItem('cortex_gemini_key') ||
                       localStorage.getItem('cortex_gemini_key') ||
                       localStorage.getItem('mm_gemini_key') || '';;
    const severity   = parseInt(localStorage.getItem('mm_ai_severity') || '50');
    const style      = localStorage.getItem('mm_ai_feedback_style') || 'standard';
    const temp       = parseFloat(localStorage.getItem('mm_ai_temp') || '0.7');
 
    // Sincronizza piano da Firestore (fonte di verità)
    if (window._fbUserId && window.firebase) {
        const db = window.firebase.firestore();
        db.collection('users').doc(window._fbUserId).get().then(doc => {
            if (doc.exists) {
                const plan = doc.data().plan || 'free';
                localStorage.setItem('cortex_user_plan', plan);
                renderPlanSection(); // Re-renderizza se il piano è cambiato
            }
        }).catch(e => console.warn("[Settings] Plan sync failed:", e));
    }
 
    renderPlanSection();
    const sttSel     = document.getElementById('select-stt-mode');
    const keyInput   = document.getElementById('input-gemini-key');
    const keyCont    = document.getElementById('gemini-key-container');
    const sevInput   = document.getElementById('input-ai-severity');
    const sevLabel   = document.getElementById('label-ai-severity');
    const styleSel   = document.getElementById('select-ai-style');
    const tempInput  = document.getElementById('input-ai-temp');
    const tempLabel  = document.getElementById('label-ai-temp');

    if (sttSel)    sttSel.value         = mode;
    if (keyInput) {
        keyInput.dataset.realKey = apiKey;
        keyInput.value = apiKey ? "••••••••" + apiKey.slice(-4) : "";
    }
    if (keyCont) {
        const shouldShow = (mode === 'gemini' || window._fbLoggedIn || apiKey);
        keyCont.style.display = shouldShow ? 'block' : 'none';
    }

    // FEEDBACK PROXY
    const proxyBadge = document.getElementById('proxy-status-badge');
    if (proxyBadge) {
        if (window._fbLoggedIn) {
            proxyBadge.style.display = 'block';
            proxyBadge.innerHTML = '<span style="color:var(--green); font-weight:700;">🛡️ Cortex Proxy Attivo:</span> La tua privacy e i tuoi token sono ora gestiti in modo sicuro dal server.';
            if (keyInput) keyInput.placeholder = "Opzionale (Backup)";
        } else {
            proxyBadge.style.display = 'none';
            if (keyInput) keyInput.placeholder = "Incolla qui la tua chiave API";
        }
    }

    if (sevInput)  sevInput.value       = severity;
    if (sevLabel)  sevLabel.textContent = severity + '%';
    if (styleSel)  styleSel.value       = style;
    if (tempInput) tempInput.value      = temp;
    if (tempLabel) tempLabel.textContent = temp;

    populateVoiceList();

    // ── Voce Coach AI: Uomo/Donna gratis per tutti, controllo avanzato solo abbonati ──
    const voicePlanIsPaid = (localStorage.getItem('cortex_user_plan') || 'free') !== 'free';
    const advBlock  = document.getElementById('voice-advanced-controls');
    const lockBlock = document.getElementById('voice-advanced-lock');
    if (advBlock)  advBlock.style.display  = voicePlanIsPaid ? 'block' : 'none';
    if (lockBlock) lockBlock.style.display = voicePlanIsPaid ? 'none'  : 'block';

    const currentGender = getVoiceGender();
    const btnMale   = document.getElementById('voice-gender-male');
    const btnFemale = document.getElementById('voice-gender-female');
    if (btnMale)   { btnMale.style.background   = currentGender === 'male'   ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.03)'; btnMale.style.borderColor   = currentGender === 'male'   ? 'var(--accent)' : 'rgba(255,255,255,0.1)'; }
    if (btnFemale) { btnFemale.style.background = currentGender === 'female' ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.03)'; btnFemale.style.borderColor = currentGender === 'female' ? 'var(--accent)' : 'rgba(255,255,255,0.1)'; }

    // ── Sezione Admin: visibile SOLO per l'admin ─────────────────────────────
    // Toggle semantica: checked = Modalità Admin ON (default), unchecked = preview studente attiva.
    const adminSection = document.getElementById('admin-settings-section');
    if (adminSection) {
        if (isAdminUser()) {
            const isPreview = localStorage.getItem('cortex_admin_preview') === '1';
            adminSection.style.display = '';
            // Auto-carica stats registrazioni
            setTimeout(() => { if (typeof loadAdminRegStats === 'function') loadAdminRegStats(); }, 200);

            // Toggle: ON = admin mode, OFF = preview studente
            const previewCheck = document.getElementById('check-admin-preview');
            if (previewCheck) previewCheck.checked = !isPreview; // checked = admin ON

            // Titolo e descrizione cambiano in base al modo attuale
            const sectionTitle = document.getElementById('admin-section-title');
            const toggleTitle  = document.getElementById('admin-toggle-title');
            const toggleDesc   = document.getElementById('admin-toggle-desc');
            const uidRow       = document.getElementById('admin-uid-row');
            if (isPreview) {
                if (sectionTitle) { sectionTitle.textContent = '👁️ Anteprima Studente'; sectionTitle.style.color = 'rgba(255,255,255,0.4)'; }
                if (toggleTitle)  { toggleTitle.textContent  = '👁️ Modalità Admin'; toggleTitle.style.color = 'rgba(255,255,255,0.4)'; }
                if (toggleDesc)   toggleDesc.textContent = 'Stai vedendo l\'app come la vedono gli studenti. Riattiva per tornare admin.';
                if (uidRow)       uidRow.style.display = 'none';
                adminSection.querySelector('.settings-row').style.background    = 'rgba(255,255,255,0.03)';
                adminSection.querySelector('.settings-row').style.borderColor   = 'rgba(255,255,255,0.08)';
            } else {
                if (sectionTitle) { sectionTitle.textContent = '👑 Modalità Admin'; sectionTitle.style.color = '#f59e0b'; }
                if (toggleTitle)  { toggleTitle.textContent  = '👑 Modalità Admin'; toggleTitle.style.color = '#f59e0b'; }
                if (toggleDesc)   toggleDesc.textContent = 'Attiva per usare i poteri admin (Fissa, Elimina, Rispondi). Disattiva per vedere l\'app come la vedono gli studenti.';
                if (uidRow)       uidRow.style.display = '';
                adminSection.querySelector('.settings-row').style.background    = 'rgba(245,158,11,0.06)';
                adminSection.querySelector('.settings-row').style.borderColor   = 'rgba(245,158,11,0.2)';
                const uidDisplay = document.getElementById('admin-uid-display');
                if (uidDisplay) uidDisplay.textContent = window._fbUserId || 'non loggato';
            }
        } else {
            adminSection.style.display = 'none';
        }
    }

    // Carica timer Pomodoro
    if (window.pomoModes) {
        const w = document.getElementById('pomo-work-mins');
        const s = document.getElementById('pomo-short-mins');
        const l = document.getElementById('pomo-long-mins');
        if (w) w.value = window.pomoModes.work?.mins  || 25;
        if (s) s.value = window.pomoModes.short?.mins || 5;
        if (l) l.value = window.pomoModes.long?.mins  || 15;
    }
}

/**
 * Wrapper per il data-fn dei bottoni Uomo/Donna: applica la voce e
 * aggiorna subito l'evidenziazione del bottone attivo (senza richiudere il pannello).
 */
export function selectVoiceGender(gender) {
    setVoiceGender(gender);
    const btnMale   = document.getElementById('voice-gender-male');
    const btnFemale = document.getElementById('voice-gender-female');
    if (btnMale)   { btnMale.style.background   = gender === 'male'   ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.03)'; btnMale.style.borderColor   = gender === 'male'   ? 'var(--accent)' : 'rgba(255,255,255,0.1)'; }
    if (btnFemale) { btnFemale.style.background = gender === 'female' ? 'rgba(124,106,247,0.18)' : 'rgba(255,255,255,0.03)'; btnFemale.style.borderColor = gender === 'female' ? 'var(--accent)' : 'rgba(255,255,255,0.1)'; }
}

export function closeSettings() {
    const overlay = document.getElementById('settings-overlay');
    if (overlay) overlay.style.display = 'none';
    document.documentElement.style.overflow = '';
    document.body.style.overflow = '';
}

export function updateAISettings() {
    const mode      = document.getElementById('select-stt-mode')?.value    || 'local';
    const keyInput  = document.getElementById('input-gemini-key');
    let key         = keyInput?.value?.trim() || '';

    // Recupera i valori correnti dall'UI per evitare ReferenceError
    const severity  = parseInt(document.getElementById('input-ai-severity')?.value   || '50');
    const style     = document.getElementById('select-ai-style')?.value               || 'standard';
    const temp      = parseFloat(document.getElementById('input-ai-temp')?.value      || '0.7');

    // Se la chiave è mascherata, usa la realKey salvata nel dataset
    if (key.startsWith('•') && keyInput?.dataset?.realKey) {
        key = keyInput.dataset.realKey;
    }

    localStorage.setItem('mm_transcription_mode',  mode);
    localStorage.setItem('mm_ai_severity',         severity);
    localStorage.setItem('mm_ai_feedback_style',   style);
    localStorage.setItem('mm_ai_temp',             temp);
    // Chiave Gemini: usa SecurityManager (salva in sessionStorage + localStorage)
    if (key && window.SecurityManager) {
        window.SecurityManager.setApiKey(key);
    } else if (key && key.startsWith('AIza')) {
        // Fallback diretto se SecurityManager non ancora disponibile
        sessionStorage.setItem('cortex_gemini_key', key);
        localStorage.setItem('cortex_gemini_key', key);
    }

    const keyCont  = document.getElementById('gemini-key-container');
    const sevLabel = document.getElementById('label-ai-severity');
    const tempLabel = document.getElementById('label-ai-temp');
    if (keyCont)   keyCont.style.display   = mode === 'gemini' ? 'block' : 'none';
    if (sevLabel)  sevLabel.textContent    = severity + '%';
    if (tempLabel) tempLabel.textContent   = temp.toFixed(1);

    // Sync al legacy state (main.js) se disponibile
    if (window._legacySetAI) window._legacySetAI({ mode, key, severity, style, temp });
}

export function toggleReadability(silent = false) {
    const checked = document.getElementById('check-readability')?.checked;
    document.body.classList.toggle('high-readability', checked);
    localStorage.setItem('mm_high_readability', checked ? '1' : '0');
    if (!silent && window.showToast) window.showToast(checked ? '📖 Alta leggibilità attivata' : '📖 Alta leggibilità disattivata', 'info');
}

export function toggleZenMode(silent = false) {
    const checked = document.getElementById('check-zen')?.checked;
    document.body.classList.toggle('zen-mode', checked);
    localStorage.setItem('mm_zen_mode', checked ? '1' : '0');
    if (!silent && window.showToast) window.showToast(checked ? '🧘 Zen Mode attiva' : '🧘 Zen Mode disattivata', 'info');
}

export async function saveAllSettings() {
    try {
        toggleReadability(true);
        toggleZenMode(true);
        updateVoicePreference();
        updateAISettings();
        if (typeof window.saveTimerSettings === 'function') window.saveTimerSettings();

        // Se c'è la chiave API, rimuove TUTTI i banner di avviso dal DOM
        const savedKey = (window.SecurityManager?.getApiKey?.()) ||
                         sessionStorage.getItem('cortex_gemini_key');
        if (savedKey) {
            document.querySelectorAll('.api-warning-banner').forEach(el => el.remove());
            // Trigger refresh UI per moduli che dipendono dalla chiave (es. Stats / Architect)
            if (window.renderNetworkAndStats) window.renderNetworkAndStats();
            if (window.renderStats) window.renderStats();
        }

        // Firebase fields
        const fields = { 'fb-api-key': 'fb_api_key', 'fb-auth-domain': 'fb_auth_domain', 'fb-project-id': 'fb_project_id' };
        for (const [id, key] of Object.entries(fields)) {
            const el = document.getElementById(id);
            if (el) localStorage.setItem(key, el.value);
        }
        if (typeof window.initFirebase === 'function') await window.initFirebase();

        if (window.showToast) window.showToast(t('settings_saved'), 'success');
        const btn = document.querySelector('.settings-footer .btn-primary');
        if (btn) {
            const orig = btn.textContent;
            btn.textContent = t('saved_ok');
            btn.style.background = 'var(--accent2)';
            setTimeout(() => { btn.textContent = orig; btn.style.background = ''; closeSettings(); }, 800);
        } else {
            closeSettings();
        }
    } catch (e) {
        console.error('[Settings] saveAllSettings error:', e);
        if (window.showToast) window.showToast(t('settings_err_save'), 'error');
    }
}

export function showGeminiTutorial() {
    alert('PASSO 1: Vai su Google AI Studio (link blu).\nPASSO 2: Clicca "Create API Key".\nPASSO 3: Copia il codice e incollalo qui.\n\nÈ come dare un Super Cervello al tuo robottino! 🧠✨');
}

// ─── Plan Management ─────────────────────────────────────────────────────────
export function renderPlanSection() {
    const container = document.getElementById('plan-display-container');
    if (!container) return;

    const plan = localStorage.getItem('cortex_user_plan') || 'free';
    const usage = parseInt(localStorage.getItem('cortex_today_ai_calls') || '0');

    // Rileva trial da referral (trialExpiresAt salvato in Firestore, letto da loadFromCloud)
    const trialExpiresAt = parseInt(localStorage.getItem('cortex_trial_expires_at') || '0');
    const isTrial = plan === 'student' && trialExpiresAt > 0 && trialExpiresAt > Date.now();
    const trialDaysLeft = isTrial ? Math.ceil((trialExpiresAt - Date.now()) / 86400000) : 0;

    const limits = {
        free: 10,
        student: 100,
        pro: Infinity
    };

    const limit = limits[plan] || 10;
    const limitDisplay = limit === Infinity ? 'Illimitati' : limit;
    const usageText = usage >= limit && limit !== Infinity ?
        `<span style="color:var(--red); font-weight:700;">${usage} / ${limitDisplay}</span>` :
        `<b>${usage}</b> / ${limitDisplay}`;

    let actionButtons = '';
    let footerInfo = '';

    if (plan === 'free') {
        actionButtons = `
            <div style="display:flex; flex-direction:column; gap:10px; margin-top:16px;">
                <button class="btn btn-primary" onclick="showUpgradeModal('student_monthly')" style="width:100%; border-radius:12px; padding:12px; font-weight:700;">⚡ Passa a Student — €4.99/mese</button>
                <button class="btn btn-outline" onclick="showUpgradeModal('student_yearly')" style="width:100%; border-radius:12px; padding:12px; font-weight:700; border-color:rgba(139,92,246,0.5); color:var(--accent);">🏷️ Piano Annuale — €3.33/mese <span style="font-size:0.75rem; opacity:0.7;">(€39.99/anno)</span></button>
            </div>
        `;
    } else if (isTrial) {
        // Piano Student da trial referral — mostra scadenza e CTA upgrade
        footerInfo = `
            <div style="font-size:0.8rem; color:#f59e0b; margin-top:10px; padding:8px 10px; background:rgba(245,158,11,0.08); border-radius:8px; border:1px solid rgba(245,158,11,0.2);">
                ⏳ Trial attivo — scade tra <b>${trialDaysLeft} giorn${trialDaysLeft === 1 ? 'o' : 'i'}</b>
            </div>`;
        actionButtons = `
            <div style="display:flex; flex-direction:column; gap:8px; margin-top:12px;">
                <button class="btn btn-primary" onclick="showUpgradeModal('student_monthly')" style="width:100%; border-radius:12px; padding:11px; font-weight:700; font-size:0.9rem;">🔒 Attiva Student Prima che Scada</button>
                <button class="btn btn-outline" onclick="manageSubscription()" style="width:100%; border-radius:12px; padding:9px; font-size:0.82rem;">Gestisci abbonamento</button>
            </div>
        `;
    } else {
        footerInfo = `<div style="font-size:0.8rem; color:var(--text-muted); margin-top:12px;">Piano attivo • Rinnovo automatico abilitato</div>`;
        actionButtons = `
            <button class="btn btn-outline" onclick="manageSubscription()" style="width:100%; border-radius:12px; padding:10px; font-size:0.85rem; margin-top:12px;">Gestisci abbonamento</button>
        `;
    }

    // Saldo Neural Sparks (da localStorage, aggiornato al login da Firestore)
    const sparksBalance = parseInt(localStorage.getItem('cortex_sparks_balance') || '0');
    const gstate        = JSON.parse(localStorage.getItem('mm_gstate') || '{}');
    const freezeCount   = gstate.streakFreezes || 0;
    const sparksSection = `
        <div style="margin-top:20px; padding-top:16px; border-top:1px solid rgba(255,255,255,0.07);">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
                <span style="font-weight:700; font-size:0.95rem;">⚡ Neural Sparks</span>
                <span style="font-size:0.85rem; color:var(--text-muted);">Saldo: <b style="color:var(--accent);">${sparksBalance}</b></span>
            </div>
            <div style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px;">Pacchetti una-tantum di chiamate IA extra. Senza abbonamento.</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <button onclick="buyNeuralSparks('S')" style="flex:1; min-width:80px; padding:10px 6px; border-radius:10px; background:rgba(139,92,246,0.12); border:1px solid rgba(139,92,246,0.3); color:var(--accent); font-weight:700; cursor:pointer; font-size:0.8rem;">50 ⚡<br><span style="font-weight:400; font-size:0.75rem;">€2.99</span></button>
                <button onclick="buyNeuralSparks('M')" style="flex:1; min-width:80px; padding:10px 6px; border-radius:10px; background:rgba(139,92,246,0.18); border:1px solid rgba(139,92,246,0.5); color:var(--accent); font-weight:700; cursor:pointer; font-size:0.8rem;">150 ⚡<br><span style="font-weight:400; font-size:0.75rem;">€7.99</span></button>
                <button onclick="buyNeuralSparks('L')" style="flex:1; min-width:80px; padding:10px 6px; border-radius:10px; background:rgba(139,92,246,0.25); border:2px solid var(--accent); color:var(--accent); font-weight:700; cursor:pointer; font-size:0.8rem;">500 ⚡<br><span style="font-weight:400; font-size:0.75rem;">€14.99</span></button>
            </div>
        </div>

        <!-- 🧊 Streak Freeze — acquistabile con Neural Sparks -->
        <div style="margin-top:16px; padding:14px 16px; border-radius:14px; background:rgba(6,182,212,0.05); border:1px solid rgba(6,182,212,0.2);">
            <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;">
                <div>
                    <div style="font-weight:700; font-size:0.9rem; color:#06b6d4; margin-bottom:3px;">🧊 Streak Freeze</div>
                    <div style="font-size:0.75rem; color:rgba(255,255,255,0.45); line-height:1.4;">
                        Proteggi la tua streak se salti un giorno.<br>
                        Saldo attuale: <b style="color:#06b6d4;">${freezeCount} freeze</b>
                    </div>
                </div>
                <button onclick="buyStreakFreeze()" style="
                    background:rgba(6,182,212,0.15); border:1px solid rgba(6,182,212,0.4);
                    color:#06b6d4; border-radius:10px; padding:9px 16px;
                    font-weight:800; font-size:0.8rem; cursor:pointer; font-family:inherit;
                    white-space:nowrap;
                ">1 🧊 = 10 ⚡ Sparks</button>
            </div>
        </div>

        <!-- 🎯 Obiettivo Giornaliero -->
        ${(() => {
            const goal = parseInt(localStorage.getItem('cortex_daily_goal') || '10');
            const _d = new Date();
            const today = `${_d.getFullYear()}-${String(_d.getMonth()+1).padStart(2,'0')}-${String(_d.getDate()).padStart(2,'0')}`;
            const savedDate = localStorage.getItem('mm_today_date');
            const rawCount  = parseInt(localStorage.getItem('mm_today_cards') || '0');
            const todayCards = savedDate === today ? rawCount : 0;
            const opts = [5, 10, 20, 30, 50];
            return `
        <div style="margin-top:16px; padding:14px 16px; border-radius:14px; background:rgba(34,197,94,0.04); border:1px solid rgba(34,197,94,0.18);">
            <div style="font-weight:700; font-size:0.9rem; color:#22c55e; margin-bottom:8px;">🎯 Obiettivo Giornaliero</div>
            <div style="font-size:0.75rem; color:rgba(255,255,255,0.45); margin-bottom:10px;">
                Oggi: <b style="color:var(--text);">${todayCards}/${goal}</b> carte studiate
            </div>
            <div style="display:flex; gap:6px; flex-wrap:wrap;">
                ${opts.map(n => `
                    <button onclick="window._setDailyGoal && window._setDailyGoal(${n})" style="
                        flex:1; min-width:40px; padding:8px 4px; border-radius:8px;
                        background:${n===goal ? 'rgba(34,197,94,0.2)' : 'rgba(255,255,255,0.04)'};
                        border:${n===goal ? '1px solid rgba(34,197,94,0.5)' : '1px solid rgba(255,255,255,0.1)'};
                        color:${n===goal ? '#22c55e' : 'rgba(255,255,255,0.5)'};
                        font-family:inherit; font-weight:800; font-size:0.8rem; cursor:pointer;
                    ">${n}</button>
                `).join('')}
            </div>
        </div>`;
        })()}
    `;

    container.innerHTML = `
        <div class="plan-card">
            <div class="plan-badge ${plan}">${plan.toUpperCase()}</div>
            <div class="plan-calls">Chiamate IA oggi: ${usageText}</div>
            ${actionButtons}
            ${footerInfo}
            ${sparksSection}
        </div>
    `;
}

export async function buyNeuralSparks(pack) {
    if (!window.firebase) { if (window.showToast) window.showToast('Effettua il login prima.', 'info'); return; }
    if (window.showToast) window.showToast('Preparazione pagamento ⚡...', 'info');
    try {
        const createSparks = firebase.functions().httpsCallable('createSparksSession');
        const { data } = await createSparks({ pack });
        if (data.url) window.location.href = data.url;
        else throw new Error('URL non ricevuto');
    } catch (err) {
        if (window.showToast) window.showToast('Errore: ' + err.message, 'error');
    }
}

/**
 * buyStreakFreeze — scambia 10 Neural Sparks per 1 Streak Freeze.
 */
export function buyStreakFreeze() {
    const sparksBalance = parseInt(localStorage.getItem('cortex_sparks_balance') || '0');
    const FREEZE_COST   = 10;

    if (sparksBalance < FREEZE_COST) {
        if (window.showToast) window.showToast(`Sparks insufficienti. Ti servono ${FREEZE_COST} ⚡ (hai ${sparksBalance}).`, 'info');
        return;
    }

    // Scala sparks in localStorage (UI immediata)
    const newBalance = sparksBalance - FREEZE_COST;
    localStorage.setItem('cortex_sparks_balance', String(newBalance));

    // Scala sparks anche su Firestore (fonte di verità, atomic)
    try {
        if (window._fbUserId && window.firebase?.apps?.length) {
            window.firebase.firestore()
                .collection('users').doc(window._fbUserId)
                .update({ sparksBalance: window.firebase.firestore.FieldValue.increment(-FREEZE_COST) })
                .catch(e => console.warn('[Sparks] Firestore update failed:', e));
        }
    } catch (_) {}

    // Aggiungi freeze via gamification
    if (typeof window.addStreakFreezes === 'function') {
        window.addStreakFreezes(1);
    } else {
        // Fallback diretto su gState in localStorage
        const gstate = JSON.parse(localStorage.getItem('mm_gstate') || '{}');
        gstate.streakFreezes = (gstate.streakFreezes || 0) + 1;
        localStorage.setItem('mm_gstate', JSON.stringify(gstate));
        if (window.showToast) window.showToast('🧊 Streak Freeze acquistato! (Tot: ' + gstate.streakFreezes + ')', 'success');
    }

    // Aggiorna il saldo mostrato nel pannello (re-render)
    if (typeof renderPlanSection === 'function') renderPlanSection();
}

export function showUpgradeModal(target) {
    const modal = document.getElementById('upgrade-modal');
    if (!modal) return;

    const icon = document.getElementById('upgrade-icon');
    const title = document.getElementById('upgrade-title');
    const desc = document.getElementById('upgrade-desc');
    const price = document.getElementById('upgrade-price');

    if (target === 'pro') {
        icon.textContent = '🚀';
        title.textContent = 'Cortex Pro';
        desc.textContent = 'Il massimo della potenza: chiamate IA illimitate, analisi documenti giganti e priorità assoluta.';
        price.textContent = '€4.99 / mese';
    } else {
        icon.textContent = '⚡';
        title.textContent = 'Cortex Student';
        desc.textContent = 'Potenzia il tuo studio con 50 chiamate AI al giorno e tutte le funzionalità avanzate.';
        price.textContent = '€3.99 / mese';
    }

    const confirmBtn = modal.querySelector('.btn-primary');
    if (confirmBtn) confirmBtn.onclick = () => redirectToCheckout(target);

    modal.style.display = 'flex';
}

export async function redirectToCheckout(plan) {
    if (!window.firebase) return;

    // ── Rileva ambiente: TWA Android (Google Play) vs Web (Stripe) ──
    const useGooglePlay = await isGooglePlayAvailable();

    if (useGooglePlay) {
        // Siamo dentro la TWA Android → usa Google Play Billing
        await handleGooglePlayCheckout(plan);
        return;
    }

    // Siamo sul web → usa Stripe come sempre
    if (window.showToast) window.showToast(t('settings_payment_init'), 'info');

    try {
        const createCheckout = firebase.functions().httpsCallable('createCheckoutSession');
        const { data } = await createCheckout({ plan });

        if (data.url) {
            window.location.href = data.url;
        } else {
            throw new Error('URL di pagamento non ricevuto.');
        }
    } catch (err) {
        console.error('[Stripe] Checkout error:', err);
        if (window.showToast) window.showToast('Errore pagamento: ' + err.message, 'error');
    }
}

export async function manageSubscription() {
    if (!window.firebase) {
        if (window.showToast) window.showToast('Firebase non disponibile.', 'error');
        return;
    }
    if (window.showToast) window.showToast('Apertura portale abbonamento...', 'info');
    try {
        const createPortal = firebase.functions().httpsCallable('createPortalSession');
        const { data } = await createPortal();
        if (data?.url) {
            window.location.href = data.url; // Stripe gestisce tutto: upgrade, downgrade, disdetta
        } else {
            throw new Error('URL portale non ricevuto.');
        }
    } catch (err) {
        console.error('[Stripe] Portal error:', err);
        // Se l'utente non ha un abbonamento attivo, mostriamo un messaggio chiaro
        const msg = err.message?.includes('failed-precondition')
            ? 'Nessun abbonamento attivo da gestire.'
            : 'Errore apertura portale: ' + err.message;
        if (window.showToast) window.showToast(msg, 'error');
    }
}

// ─── Lingua ───────────────────────────────────────────────────────────────────
export function toggleLangMenu() {
    document.getElementById('lang-menu')?.classList.toggle('active');
}

// ─── Tema ─────────────────────────────────────────────────────────────────────
export function toggleTheme() {
    // Tema fisso: solo dark mode — funzione disabilitata
}

function _applyTheme(isLight) {
    if (isLight) {
        document.body.classList.add('light');
        document.body.classList.remove('dark');
    } else {
        document.body.classList.remove('light');
        document.body.classList.add('dark');
    }
    // Aggiorna bottone navbar
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = isLight ? '☀️' : '🌙';
    // Aggiorna bottone nel settings overlay
    const settingsBtn = document.getElementById('settings-theme-btn');
    if (settingsBtn) settingsBtn.innerHTML = isLight ? '☀️ Chiaro' : '🌙 Scuro';
    // Aggiorna meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) metaTheme.content = isLight ? '#ffffff' : '#0a0a0a';
}

export function applySavedTheme() {
    // Tema fisso: solo dark mode
    localStorage.setItem('mm_theme', 'dark');
    _applyTheme(false);
}

// ─── Accessibilità ────────────────────────────────────────────────────────────
export function applySavedAccessibility() {
    if (localStorage.getItem('mm_high_readability') === '1') document.body.classList.add('high-readability');
    if (localStorage.getItem('mm_zen_mode') === '1')         document.body.classList.add('zen-mode');
}

// ─── Admin Preview Mode ───────────────────────────────────────────────────────
/**
 * Toggles tra "Modalità Admin" e "Anteprima Utente".
 * In anteprima utente i bottoni admin (Elimina/Fissa/Rispondi) sono nascosti,
 * ma tutti i poteri admin restano attivi (puoi tornare indietro con il toggle).
 */
export function toggleAdminPreview() {
    if (!isAdminUser()) return; // Sicurezza: solo l'admin può chiamare questa funzione

    // Il checkbox ora è: checked = admin ON, unchecked = preview studente ON
    // Quindi newPreview = true quando il checkbox è appena diventato unchecked
    const cb = document.getElementById('check-admin-preview');
    const adminModeOn = cb ? cb.checked : true;
    const newPreview  = !adminModeOn; // preview = ON quando admin = OFF

    localStorage.setItem('cortex_admin_preview', newPreview ? '1' : '0');

    // Ri-renderizza i feedback per mostrare/nascondere i bottoni admin
    if (typeof window.loadFeedbackMessages === 'function') {
        window.loadFeedbackMessages();
    }
    // Ri-renderizza Network & Stats per mostrare/nascondere admin panel
    if (typeof window.renderNetworkAndStats === 'function') {
        window.renderNetworkAndStats();
    }

    // Aggiorna aspetto visivo della sezione admin nelle impostazioni
    const sectionTitle = document.getElementById('admin-section-title');
    const toggleTitle  = document.getElementById('admin-toggle-title');
    const toggleDesc   = document.getElementById('admin-toggle-desc');
    const uidRow       = document.getElementById('admin-uid-row');
    const adminRow     = document.querySelector('#admin-settings-section .settings-row');
    if (newPreview) {
        // Preview attiva: aspetto dimesso, niente UID
        if (sectionTitle) { sectionTitle.textContent = '👁️ Anteprima Studente'; sectionTitle.style.color = 'rgba(255,255,255,0.4)'; }
        if (toggleTitle)  { toggleTitle.textContent  = '👁️ Modalità Admin'; toggleTitle.style.color = 'rgba(255,255,255,0.4)'; }
        if (toggleDesc)   toggleDesc.textContent = 'Stai vedendo l\'app come la vedono gli studenti. Riattiva per tornare admin.';
        if (uidRow)       uidRow.style.display = 'none';
        if (adminRow)     { adminRow.style.background = 'rgba(255,255,255,0.03)'; adminRow.style.borderColor = 'rgba(255,255,255,0.08)'; }
    } else {
        // Admin mode: aspetto dorato pieno
        if (sectionTitle) { sectionTitle.textContent = '👑 Modalità Admin'; sectionTitle.style.color = '#f59e0b'; }
        if (toggleTitle)  { toggleTitle.textContent  = '👑 Modalità Admin'; toggleTitle.style.color = '#f59e0b'; }
        if (toggleDesc)   toggleDesc.textContent = 'Attiva per usare i poteri admin (Fissa, Elimina, Rispondi). Disattiva per vedere l\'app come la vedono gli studenti.';
        if (uidRow)       uidRow.style.display = '';
        if (adminRow)     { adminRow.style.background = 'rgba(245,158,11,0.06)'; adminRow.style.borderColor = 'rgba(245,158,11,0.2)'; }
    }

    // Badge visivo nell'header per ricordare all'admin che è in preview
    const badge = document.getElementById('admin-preview-badge');
    if (newPreview) {
        if (!badge) {
            const b = document.createElement('div');
            b.id = 'admin-preview-badge';
            b.style.cssText = `
                position: fixed; top: 0; left: 50%; transform: translateX(-50%);
                background: linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08));
                color: rgba(255,255,255,0.5); font-size: 0.68rem; font-weight: 800;
                padding: 4px 16px; border-radius: 0 0 10px 10px;
                z-index: 9999; letter-spacing: 0.08em; pointer-events: none;
                border: 1px solid rgba(255,255,255,0.12); border-top: none;
                backdrop-filter: blur(8px);
            `;
            b.textContent = '👁️ ANTEPRIMA STUDENTE';
            document.body.appendChild(b);
        }
        if (window.showToast) window.showToast('👁️ Anteprima studente attiva', 'info');
    } else {
        badge?.remove();
        if (window.showToast) window.showToast('👑 Modalità Admin attiva', 'success');
    }
}

/**
 * Da chiamare al boot: ripristina il badge admin-preview se era attivo.
 */
export function restoreAdminPreviewBadge() {
    if (!isAdminUser()) return;
    if (localStorage.getItem('cortex_admin_preview') === '1') {
        if (document.getElementById('admin-preview-badge')) return; // già presente
        const b = document.createElement('div');
        b.id = 'admin-preview-badge';
        b.style.cssText = `
            position: fixed; top: 0; left: 50%; transform: translateX(-50%);
            background: linear-gradient(90deg, rgba(255,255,255,0.15), rgba(255,255,255,0.08));
            color: rgba(255,255,255,0.5); font-size: 0.68rem; font-weight: 800;
            padding: 4px 16px; border-radius: 0 0 10px 10px;
            z-index: 9999; letter-spacing: 0.08em; pointer-events: none;
            border: 1px solid rgba(255,255,255,0.12); border-top: none;
            backdrop-filter: blur(8px);
        `;
        b.textContent = '👁️ ANTEPRIMA STUDENTE';
        document.body.appendChild(b);
    }
}

// ─── Admin: stats registrazioni ──────────────────────────────────────────────
export async function loadAdminRegStats() {
    const statusEl = document.getElementById('admin-reg-status');
    const todayEl  = document.getElementById('admin-reg-today');
    const totalEl  = document.getElementById('admin-reg-total');
    if (!todayEl || !totalEl) return;

    if (statusEl) statusEl.textContent = 'Caricamento…';
    todayEl.textContent = '…';
    totalEl.textContent = '…';

    try {
        const { getFirestore, collection, getCountFromServer, query, where, Timestamp } =
            await import('https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js');
        const db = getFirestore();

        // Totale: conta tutti i profili utente
        const totalSnap = await getCountFromServer(collection(db, 'userProfiles'));
        const total = totalSnap.data().count;
        totalEl.textContent = total.toLocaleString('it-IT');

        // Oggi: filtra per createdAt >= mezzanotte di oggi
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        const todayQ = query(
            collection(db, 'userProfiles'),
            where('createdAt', '>=', Timestamp.fromDate(startOfDay))
        );
        const todaySnap = await getCountFromServer(todayQ);
        todayEl.textContent = todaySnap.data().count.toLocaleString('it-IT');

        const now = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
        if (statusEl) statusEl.textContent = `Aggiornato alle ${now}`;
    } catch (e) {
        if (statusEl) statusEl.textContent = 'Errore: ' + e.message;
        todayEl.textContent = '!';
        totalEl.textContent = '!';
        console.error('[AdminRegStats]', e);
    }
}

// ─── Window exports ───────────────────────────────────────────────────────────
export function registerSettingsGlobals(registry) {
    const fns = {
        openSettings, closeSettings, saveAllSettings, updateAISettings,
        toggleReadability, toggleZenMode, showGeminiTutorial,
        toggleLangMenu, toggleTheme, applySavedTheme,
        renderPlanSection, showUpgradeModal, manageSubscription,
        redirectToCheckout, buyNeuralSparks, buyStreakFreeze,
        toggleAdminPreview, restoreAdminPreviewBadge,
        selectVoiceGender, loadAdminRegStats,
    };
    for (const [name, fn] of Object.entries(fns)) {
        window[name] = fn;
        if (registry) registry(name, fn);
    }
}
