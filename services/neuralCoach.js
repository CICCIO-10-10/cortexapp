import { callGeminiProxy } from './firebase.js';

/**
 * neuralCoach.js — Cortex Neural Coach
 *
 * Genera un report settimanale AI personalizzato ogni domenica sera.
 * Chiama callGeminiProxy (Cloud Function) con i dati di studio della settimana.
 * Fallback statico se l'AI non è disponibile (offline, limite raggiunto, ecc.).
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const COACH_CONFIG = {
    reportDay: 0,           // domenica (0 = Sunday)
    reportHour: 20,         // ore 20:00
    maxReportAge: 8,        // settimane di storico conservate
    minCardsForReport: 1,   // report anche se ha studiato pochissimo
};

// ─── Raccolta dati settimanali ────────────────────────────────────────────────

/**
 * Raccoglie le statistiche della settimana corrente dai dati locali.
 * In futuro leggerà da Firestore per dati cross-device.
 */
export function collectWeeklyStats() {
    const now = new Date();
    const weekStart = _getWeekStart(now);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 7);

    // Dati base da localStorage
    const decks = _getDecks();
    const sessions = _getStudySessions(weekStart, weekEnd);

    // Calcoli
    const totalCards = sessions.reduce((s, x) => s + (x.cardsStudied || 0), 0);
    const totalMinutes = sessions.reduce((s, x) => s + (x.durationMin || 0), 0);
    const studyDays = new Set(sessions.map(s => new Date(s.ts).toDateString())).size;
    const streak = parseInt(localStorage.getItem('cortex_streak') || '0', 10);
    const userName = localStorage.getItem('cortex_username') || 'Studente';

    // Materie più studiate
    const deckStats = {};
    sessions.forEach(s => {
        if (s.deckName) {
            deckStats[s.deckName] = (deckStats[s.deckName] || 0) + (s.cardsStudied || 0);
        }
    });
    const topDeck = Object.entries(deckStats).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
    const weakestDeck = Object.entries(deckStats).sort((a, b) => a[1] - b[1])[0]?.[0] || null;

    // Performance media (% risposte corrette)
    const avgAccuracy = sessions.length > 0
        ? Math.round(sessions.reduce((s, x) => s + (x.accuracy || 0), 0) / sessions.length)
        : 0;

    // Confronto con settimana precedente
    const prevWeekStart = new Date(weekStart);
    prevWeekStart.setDate(prevWeekStart.getDate() - 7);
    const prevSessions = _getStudySessions(prevWeekStart, weekStart);
    const prevCards = prevSessions.reduce((s, x) => s + (x.cardsStudied || 0), 0);
    const trend = totalCards > prevCards ? 'up' : totalCards < prevCards ? 'down' : 'same';
    const trendPct = prevCards > 0 ? Math.round(((totalCards - prevCards) / prevCards) * 100) : null;

    return {
        userName,
        weekLabel: _getWeekLabel(weekStart),
        totalCards,
        totalMinutes,
        studyDays,
        streak,
        topDeck,
        weakestDeck,
        avgAccuracy,
        totalDecks: decks.length,
        trend,
        trendPct,
        isPro: ['student_monthly', 'student_yearly'].includes(localStorage.getItem('cortex_plan')),
    };
}

// ─── Generazione report AI ────────────────────────────────────────────────────

/**
 * Genera il report settimanale via AI.
 * Ritorna { title, body, emoji, tips[] } oppure il report di fallback statico.
 */
export async function generateWeeklyReport(stats = null) {
    const data = stats || collectWeeklyStats();

    // Se ha studiato 0 carte → report di win-back, non serve AI
    if (data.totalCards === 0) {
        return _fallbackZeroReport(data);
    }

    try {
        const report = await _callAI(data);
        return report;
    } catch (e) {
        console.warn('[NeuralCoach] AI non disponibile, uso fallback:', e.message);
        return _fallbackStaticReport(data);
    }
}

async function _callAI(data) {
    const prompt = `Sei il Neural Coach di Cortex, un'app di studio con flashcard e spaced repetition.
Scrivi un report settimanale BREVE (max 4 paragrafi) e MOTIVAZIONALE per ${data.userName}.

DATI SETTIMANA (${data.weekLabel}):
- Carte studiate: ${data.totalCards}
- Minuti di studio: ${data.totalMinutes}
- Giorni attivi: ${data.studyDays}/7
- Streak attuale: ${data.streak} giorni
- Materia più studiata: ${data.topDeck || 'nessuna'}
- Materia più debole: ${data.weakestDeck || 'nessuna'}
- Accuratezza media: ${data.avgAccuracy}%
- Trend vs settimana scorsa: ${data.trend === 'up' ? `+${data.trendPct}%` : data.trend === 'down' ? `${data.trendPct}%` : 'stabile'}
- Piano: ${data.isPro ? 'Student (PRO)' : 'Free'}

REGOLE:
- Tono: coach amichevole, diretto, mai condescendente
- Usa il nome dell'utente almeno una volta
- Paragrafo 1: riepilogo numeri + tono emotivo (orgoglioso se ha fatto bene, empatico se poco)
- Paragrafo 2: analisi materie (punti di forza e debolezze)
- Paragrafo 3: 1-2 consigli concreti e specifici per la prossima settimana
- Paragrafo 4: motivazione finale, breve
- Aggiungi 2-3 emoji in modo naturale, non eccessivo
- Lingua: italiano, colloquiale ma serio
- NON inventare dati non presenti

Rispondi SOLO con JSON: { "title": "...", "body": "...", "tips": ["...", "..."] }`;

    // Usa callGeminiProxy (Cloud Function) se l'utente è loggato
    if (window._fbLoggedIn && typeof firebase !== 'undefined' && firebase.apps?.length) {
        const result = await callGeminiProxy({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.8, maxOutputTokens: 600 }
        });
        const text = result.data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!text) throw new Error('Proxy: risposta vuota');
        // Pulisce eventuale markdown ```json ... ``` attorno al JSON
        const clean = text.replace(/^```json\s*/i, '').replace(/\s*```$/, '').trim();
        return JSON.parse(clean);
    }

    throw new Error('Utente non autenticato — impossibile chiamare il proxy AI');
}

// ─── Report di fallback (no AI) ───────────────────────────────────────────────

function _fallbackStaticReport(data) {
    const { userName, totalCards, studyDays, streak, topDeck, trend, trendPct } = data;

    const trendMsg = trend === 'up'
        ? `Hai migliorato del ${trendPct}% rispetto alla settimana scorsa 📈`
        : trend === 'down'
        ? `Questa settimana hai studiato un po' meno della scorsa — capita, ripartiamo forte 💪`
        : `Rendimento stabile rispetto alla settimana scorsa.`;

    return {
        title: `Il tuo report settimanale, ${userName} 🧠`,
        body: `Questa settimana hai studiato ${totalCards} carte in ${studyDays} giorni. ${trendMsg}

${topDeck ? `La materia su cui ti sei concentrato di più è stata "${topDeck}" — continua così.` : ''}

Streak attuale: ${streak} giorni. ${streak >= 7 ? 'Stai costruendo un\'abitudine vera — non mollare!' : 'Prova a studiare ogni giorno questa settimana, anche solo 5 minuti.'}

Ci vediamo domenica prossima con il prossimo report. Vai forte! 🚀`,
        tips: [
            streak < 7 ? 'Imposta un promemoria fisso ogni sera per mantenere la streak' : 'Mantieni la streak — è il tuo superpotere',
            topDeck ? `Alterna "${topDeck}" con le materie meno studiate per un ripasso equilibrato` : 'Crea un mazzo per ogni materia che stai studiando',
        ],
    };
}

function _fallbackZeroReport(data) {
    return {
        title: `Ci manchi, ${data.userName} 👋`,
        body: `Questa settimana non hai aperto Cortex neanche una volta. Succede — ma il tuo cervello ha bisogno di allenamento costante per ricordare davvero.

Anche solo 5 minuti al giorno fanno una differenza enorme nel lungo periodo. Torna quando vuoi — le tue carte ti aspettano.`,
        tips: [
            'Parti da 5 minuti al giorno — meno di una storia su Instagram',
            'Attiva i promemoria per non dimenticare',
        ],
    };
}

// ─── Salvataggio & recupero report ───────────────────────────────────────────

export async function saveReport(report, weekId = null) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return;

    const id = weekId || _getCurrentWeekId();

    try {
        await firebase.firestore()
            .collection('users').doc(uid)
            .collection('coachReports').doc(id)
            .set({
                ...report,
                generatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                weekId: id,
            });

        // Cache locale dell'ultimo report
        localStorage.setItem('cortex_last_coach_report', JSON.stringify({ ...report, weekId: id }));
    } catch (e) {
        console.error('[NeuralCoach] Errore salvataggio report:', e);
    }
}

export function getLastReport() {
    try {
        return JSON.parse(localStorage.getItem('cortex_last_coach_report') || 'null');
    } catch {
        return null;
    }
}

export async function getReportHistory(limitWeeks = 8) {
    const uid = localStorage.getItem('cortex_uid');
    if (!uid || typeof firebase === 'undefined') return [];

    try {
        const snap = await firebase.firestore()
            .collection('users').doc(uid)
            .collection('coachReports')
            .orderBy('generatedAt', 'desc')
            .limit(limitWeeks)
            .get();

        return snap.docs.map(d => d.data());
    } catch {
        return [];
    }
}

// ─── Trigger domenicale ───────────────────────────────────────────────────────

/**
 * Da chiamare in main.js all'avvio.
 * Controlla se è domenica sera e se il report non è ancora stato inviato.
 */
export async function checkAndSendWeeklyReport() {
    const now = new Date();
    if (now.getDay() !== COACH_CONFIG.reportDay) return;
    if (now.getHours() < COACH_CONFIG.reportHour) return;

    const lastWeekId = localStorage.getItem('cortex_coach_last_sent');
    const thisWeekId = _getCurrentWeekId();
    if (lastWeekId === thisWeekId) return; // già inviato questa settimana

    const stats = collectWeeklyStats();
    const report = await generateWeeklyReport(stats);
    await saveReport(report, thisWeekId);

    // Notifica
    if (Notification.permission === 'granted') {
        const notif = new Notification(`🧠 Neural Coach — ${report.title}`, {
            body: report.body.substring(0, 120) + '...',
            icon: '/pwa-192x192.png',
            tag: 'cortex-coach-report',
            data: { url: '/app.html?page=coach' },
        });
        notif.onclick = () => { window.focus(); notif.close(); };
    }

    localStorage.setItem('cortex_coach_last_sent', thisWeekId);
    console.log('[NeuralCoach] Report settimanale inviato');
}

// ─── Utils ────────────────────────────────────────────────────────────────────

function _getCurrentWeekId() {
    const d = _getWeekStart(new Date());
    return `${d.getFullYear()}-W${String(Math.ceil(d.getDate() / 7)).padStart(2, '0')}`;
}

function _getWeekStart(date) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // lunedì
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function _getWeekLabel(weekStart) {
    const end = new Date(weekStart);
    end.setDate(end.getDate() + 6);
    const fmt = (d) => d.toLocaleDateString('it-IT', { day: 'numeric', month: 'long' });
    return `${fmt(weekStart)} – ${fmt(end)}`;
}

function _getDecks() {
    try { return JSON.parse(localStorage.getItem('cortex_decks') || '[]'); }
    catch { return []; }
}

function _getStudySessions(from, to) {
    // TODO: leggere da IndexedDB (memoryService) invece di localStorage
    try {
        const all = JSON.parse(localStorage.getItem('cortex_study_sessions') || '[]');
        return all.filter(s => s.ts >= from.getTime() && s.ts < to.getTime());
    } catch { return []; }
}
