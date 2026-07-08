/**
 * referralLeaderboard.js — Cortex Referral Leaderboard
 *
 * STATO: SCHELETRO — struttura completa, Cloud Function da creare
 *
 * IDEA:
 *   Chi porta più amici su Cortex vince premi mensili.
 *   Classifica pubblica dei top referrer → crea competizione virale.
 *   Premio top 1: mese gratis Student Plan.
 *   Premio top 2-3: 200 Sparks.
 *   Premio top 4-10: 50 Sparks.
 *   Tutti i referrer attivi: badge esclusivo "Ambassador".
 *
 * MECCANICA:
 *   - Ogni utente ha un codice referral univoco (già implementato)
 *   - Quando un amico si registra con il codice → +1 referral confermato
 *   - Un referral è "confermato" solo se l'amico studia almeno 3 sessioni
 *     (anti-spam: evita account fake)
 *   - Classifica si azzera il 1° di ogni mese → ogni mese è una gara nuova
 *   - Premi assegnati automaticamente il 28 di ogni mese via Cloud Function
 *
 * TODO:
 *   1. Creare Cloud Function "updateReferralLeaderboard" (trigger: scrittura su /referrals)
 *   2. Creare Cloud Function "assignMonthlyPrizes" (trigger: pubsub il 28 di ogni mese)
 *   3. Aggiungere UI leaderboard in app.html (sezione "Amici" o nuova tab)
 *   4. Inviare notifica push ai vincitori il giorno dei premi
 *   5. Collegare il badge "Ambassador" a gamification.js
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const LB_CONFIG = {
    // Soglia per referral "confermato" (sessioni minime dell'amico invitato)
    minSessionsToConfirm: 3,

    // Premi mensili
    prizes: [
        { rank: 1,      reward: 'month_free',   label: '1 mese Student gratis 🏆',  sparks: 0 },
        { rank: 2,      reward: 'sparks',        label: '200 Sparks ⚡',              sparks: 200 },
        { rank: 3,      reward: 'sparks',        label: '200 Sparks ⚡',              sparks: 200 },
        { rank: '4-10', reward: 'sparks',        label: '50 Sparks ⚡',               sparks: 50 },
    ],

    // Badge per chi ha almeno 1 referral confermato nel mese
    ambassadorBadge: { id: 'ambassador', name: 'Ambassador', emoji: '🌟' },

    // Quanti top referrer mostrare in classifica
    leaderboardSize: 10,
};

// ─── Lettura classifica ───────────────────────────────────────────────────────

/**
 * Carica la classifica referral del mese corrente da Firestore.
 * Ritorna array di { rank, displayName, photoURL, referrals, isCurrentUser }
 */
export async function getMonthlyLeaderboard() {
    const monthId = _getCurrentMonthId();

    try {
        if (typeof firebase === 'undefined') return _getMockLeaderboard();

        const snap = await firebase.firestore()
            .collection('referralLeaderboard')
            .doc(monthId)
            .collection('entries')
            .orderBy('confirmedReferrals', 'desc')
            .limit(LB_CONFIG.leaderboardSize)
            .get();

        const uid = localStorage.getItem('cortex_uid');
        const entries = snap.docs.map((doc, i) => ({
            rank: i + 1,
            uid: doc.id,
            displayName: doc.data().displayName || 'Studente',
            photoURL: doc.data().photoURL || null,
            referrals: doc.data().confirmedReferrals || 0,
            isCurrentUser: doc.id === uid,
        }));

        return entries;
    } catch (e) {
        console.error('[ReferralLB] Errore caricamento classifica:', e);
        return [];
    }
}

/**
 * Posizione e punteggio dell'utente corrente nel mese.
 */
export async function getCurrentUserRank() {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return null;

    const monthId = _getCurrentMonthId();

    try {
        const doc = await firebase.firestore()
            .collection('referralLeaderboard')
            .doc(monthId)
            .collection('entries')
            .doc(uid)
            .get();

        if (!doc.exists) return { rank: null, referrals: 0 };

        const data = doc.data();
        return {
            rank: data.rank || null,
            referrals: data.confirmedReferrals || 0,
            pendingReferrals: data.pendingReferrals || 0,
        };
    } catch {
        return null;
    }
}

// ─── Registrazione referral ───────────────────────────────────────────────────

/**
 * Da chiamare quando un nuovo utente completa la registrazione con codice referral.
 * Aggiunge un referral "pending" al referrer — diventa "confermato" dopo 3 sessioni.
 *
 * Nota: la logica principale è in Cloud Functions (processReferral già esistente).
 * Questo è il layer client per aggiornamenti real-time.
 */
export async function registerReferral(referrerUid, newUserUid) {
    if (!referrerUid || !newUserUid || typeof firebase === 'undefined') return;

    const monthId = _getCurrentMonthId();

    try {
        const lbRef = firebase.firestore()
            .collection('referralLeaderboard')
            .doc(monthId)
            .collection('entries')
            .doc(referrerUid);

        await lbRef.set({
            pendingReferrals: firebase.firestore.FieldValue.increment(1),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        // Salva il referral in /referrals/{newUserUid} per tracking
        await firebase.firestore()
            .collection('referrals')
            .doc(newUserUid)
            .set({
                referrerUid,
                status: 'pending',
                sessionsCompleted: 0,
                createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                monthId,
            });

    } catch (e) {
        console.error('[ReferralLB] Errore registrazione referral:', e);
    }
}

/**
 * Conferma un referral quando l'utente invitato completa N sessioni.
 * TODO: chiamare in main.js dopo ogni sessione di studio completata,
 * controllando se l'utente ha un referrer e sessioni < soglia.
 */
export async function checkAndConfirmReferral(uid) {
    if (!uid || typeof firebase === 'undefined') return;

    try {
        const refDoc = await firebase.firestore().collection('referrals').doc(uid).get();
        if (!refDoc.exists) return;

        const data = refDoc.data();
        if (data.status === 'confirmed') return;

        const newSessions = (data.sessionsCompleted || 0) + 1;

        await refDoc.ref.update({ sessionsCompleted: newSessions });

        if (newSessions >= LB_CONFIG.minSessionsToConfirm) {
            // Conferma il referral → aggiorna la classifica del referrer
            await refDoc.ref.update({ status: 'confirmed' });

            const monthId = _getCurrentMonthId();
            await firebase.firestore()
                .collection('referralLeaderboard')
                .doc(monthId)
                .collection('entries')
                .doc(data.referrerUid)
                .set({
                    confirmedReferrals: firebase.firestore.FieldValue.increment(1),
                    pendingReferrals: firebase.firestore.FieldValue.increment(-1),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
                }, { merge: true });

            // Notifica al referrer (se ha le notifiche attive)
            console.log(`[ReferralLB] Referral confermato per ${data.referrerUid}`);
        }
    } catch (e) {
        console.error('[ReferralLB] Errore conferma referral:', e);
    }
}

// ─── Assegnazione premi ───────────────────────────────────────────────────────

/**
 * Assegna i premi mensili.
 * In produzione: Cloud Function "assignMonthlyPrizes" schedulata il 28 del mese.
 * Questa versione è client-side per test/preview.
 *
 * TODO: spostare interamente in Cloud Functions
 */
export async function assignMonthlyPrizes(monthId = null) {
    const id = monthId || _getCurrentMonthId();
    if (typeof firebase === 'undefined') return;

    try {
        const snap = await firebase.firestore()
            .collection('referralLeaderboard')
            .doc(id)
            .collection('entries')
            .orderBy('confirmedReferrals', 'desc')
            .limit(LB_CONFIG.leaderboardSize)
            .get();

        const winners = snap.docs.map((doc, i) => ({ uid: doc.id, rank: i + 1, ...doc.data() }));

        for (const winner of winners) {
            if (winner.confirmedReferrals < 1) continue; // nessun referral → nessun premio

            const prize = _getPrize(winner.rank);
            if (!prize) continue;

            await _deliverPrize(winner.uid, prize, winner.rank);

            // Badge Ambassador per tutti con almeno 1 referral
            await firebase.firestore().collection('users').doc(winner.uid).update({
                [`badges.${LB_CONFIG.ambassadorBadge.id}`]: true,
                [`monthlyPrizes.${id}`]: { rank: winner.rank, prize: prize.reward },
            }).catch(() => {});
        }

        console.log(`[ReferralLB] Premi assegnati per ${id}`);
    } catch (e) {
        console.error('[ReferralLB] Errore assegnazione premi:', e);
    }
}

async function _deliverPrize(uid, prize, rank) {
    if (prize.reward === 'month_free') {
        // Estende abbonamento di 30 giorni
        // TODO: chiamare Stripe API per aggiungere credito
        await firebase.firestore().collection('users').doc(uid).update({
            plan: 'student_monthly',
            planExpiry: firebase.firestore.FieldValue.serverTimestamp(), // TODO: + 30 giorni
        }).catch(() => {});

    } else if (prize.reward === 'sparks' && prize.sparks > 0) {
        await firebase.firestore().collection('users').doc(uid).update({
            sparksBalance: firebase.firestore.FieldValue.increment(prize.sparks),
        }).catch(() => {});
    }

    // Notifica push al vincitore
    // TODO: chiamare Cloud Function per inviare notifica FCM al vincitore
    console.log(`[ReferralLB] Premio consegnato a ${uid}: rank ${rank} → ${prize.label}`);
}

function _getPrize(rank) {
    if (rank === 1) return LB_CONFIG.prizes[0];
    if (rank === 2) return LB_CONFIG.prizes[1];
    if (rank === 3) return LB_CONFIG.prizes[2];
    if (rank >= 4 && rank <= 10) return LB_CONFIG.prizes[3];
    return null;
}

// ─── UI ───────────────────────────────────────────────────────────────────────

/**
 * Genera l'HTML della classifica referral.
 * TODO: inserire in app.html nella sezione Amici/Referral
 */
export async function buildLeaderboardUI(containerEl) {
    if (!containerEl) return;

    containerEl.innerHTML = `<div style="text-align:center;color:#9ca3af;padding:24px">Caricamento classifica...</div>`;

    const entries = await getMonthlyLeaderboard();
    const myRank = await getCurrentUserRank();
    const daysLeft = _getDaysToEndOfMonth();
    const monthName = new Date().toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

    const medals = ['🥇', '🥈', '🥉'];

    containerEl.innerHTML = `
        <div style="padding:16px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
            <div style="text-align:center;margin-bottom:20px">
                <h2 style="color:var(--text);font-size:1.2rem;margin:0 0 4px">🌟 Top Ambassador</h2>
                <p style="color:#9ca3af;font-size:0.85rem;margin:0">${monthName} · ${daysLeft} giorni rimasti</p>
            </div>

            ${myRank ? `
            <div style="background:#1e1040;border:1px solid #4b3f72;border-radius:12px;padding:14px;margin-bottom:16px">
                <div style="display:flex;justify-content:space-between;align-items:center">
                    <div>
                        <div style="color:#8b5cf6;font-weight:700">La tua posizione</div>
                        <div style="color:#9ca3af;font-size:0.82rem">${myRank.referrals} confermati · ${myRank.pendingReferrals || 0} in attesa</div>
                    </div>
                    <div style="font-size:1.8rem;font-weight:800;color:#8b5cf6">
                        ${myRank.rank ? `#${myRank.rank}` : '—'}
                    </div>
                </div>
            </div>
            ` : ''}

            <div style="display:flex;flex-direction:column;gap:8px">
                ${entries.length === 0 ? `
                    <div style="text-align:center;color:#9ca3af;padding:32px">
                        Nessun referral questo mese ancora.<br>Sii il primo! 🚀
                    </div>
                ` : entries.map((e, i) => `
                    <div style="
                        display:flex;align-items:center;gap:12px;
                        background:${e.isCurrentUser ? '#2d1f5e' : '#1a1030'};
                        border:1px solid ${e.isCurrentUser ? '#8b5cf6' : '#2d2050'};
                        border-radius:12px;padding:12px 14px;
                    ">
                        <div style="font-size:1.4rem;width:28px;text-align:center">
                            ${i < 3 ? medals[i] : `<span style="color:#6b7280;font-weight:700">${i + 1}</span>`}
                        </div>
                        ${e.photoURL
                            ? `<img src="${e.photoURL}" style="width:36px;height:36px;border-radius:50%;object-fit:cover">`
                            : `<div style="width:36px;height:36px;border-radius:50%;background:#4b3f72;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700">${e.displayName[0]}</div>`
                        }
                        <div style="flex:1">
                            <div style="color:var(--text);font-weight:600;font-size:0.95rem">
                                ${e.displayName}${e.isCurrentUser ? ' <span style="color:#8b5cf6;font-size:0.75rem">(tu)</span>' : ''}
                            </div>
                            <div style="color:#9ca3af;font-size:0.78rem">${_getPrize(e.rank)?.label || ''}</div>
                        </div>
                        <div style="text-align:right">
                            <div style="color:#8b5cf6;font-weight:800;font-size:1.1rem">${e.referrals}</div>
                            <div style="color:#6b7280;font-size:0.72rem">amici</div>
                        </div>
                    </div>
                `).join('')}
            </div>

            <div style="margin-top:20px;background:#0f0c1a;border:1px solid #2d2050;border-radius:12px;padding:14px">
                <div style="color:var(--text);font-weight:600;margin-bottom:8px">Come funziona?</div>
                <div style="color:#9ca3af;font-size:0.82rem;line-height:1.6">
                    Condividi il tuo link referral. Ogni amico che si registra e studia almeno 3 sessioni vale 1 punto.
                    Chi ne porta di più a fine mese vince! 🏆
                </div>
            </div>
        </div>
    `;
}

// ─── Mock data (per preview senza Firebase) ───────────────────────────────────

function _getMockLeaderboard() {
    return [
        { rank: 1, displayName: 'Marco R.', referrals: 12, isCurrentUser: false },
        { rank: 2, displayName: 'Sofia M.', referrals: 8,  isCurrentUser: false },
        { rank: 3, displayName: 'Luca B.',  referrals: 6,  isCurrentUser: true  },
        { rank: 4, displayName: 'Anna P.',  referrals: 4,  isCurrentUser: false },
        { rank: 5, displayName: 'Gioia T.', referrals: 3,  isCurrentUser: false },
    ];
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function _getCurrentMonthId() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function _getDaysToEndOfMonth() {
    const now = new Date();
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return Math.ceil((end - now) / (1000 * 60 * 60 * 24));
}
