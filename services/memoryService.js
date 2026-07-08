/**
 * services/memoryService.js
 *
 * Gestisce la Memory Bank di Cortex:
 * - Salva le performance locali in Firestore (users/{uid}/memory).
 * - Genera suggerimenti dell'IA (Coach Insight) con throttle di 24 ore.
 */

import { getFunctions, callGeminiProxy } from './firebase.js';

/**
 * Aggiorna la memoria locale dei risultati dello studio.
 * @param {string} deckId 
 * @param {Object} stats { sessionCorrect, sessionWrong, sessionHard, pct }
 */
export async function updateMemoryBank(deckId, stats) {
    if (!window._fbUserId || !firebase?.apps?.length) return;
    const db = firebase.app().firestore();
    const memoryRef = db.collection('users').doc(window._fbUserId).collection('memory').doc(deckId.toString());

    try {
        await memoryRef.set({
            deckId,
            lastSession: stats,
            lastSessionAt: firebase.firestore.FieldValue.serverTimestamp(),
            // Accumuliamo i risultati per l'analisi storica
            totalSessions: firebase.firestore.FieldValue.increment(1),
            averageAccuracy: stats.pct // Semplificazione: sovrascriviamo l'ultima
        }, { merge: true });
        
        console.log(`[MemoryBank] Updated stats for deck: ${deckId}`);
    } catch (e) {
        console.error('[MemoryBank] Error updating stats:', e);
    }
}

/**
 * Recupera o genera un nuovo consiglio dal Coach AI.
 * Implementa un throttle di 24 ore per limitare le chiamate a Gemini.
 */
export async function getCoachInsight() {
    if (!window._fbUserId || !firebase?.apps?.length) return null;
    const db = firebase.app().firestore();
    const userRef = db.collection('users').doc(window._fbUserId);

    try {
        const doc = await userRef.get();
        const userData = doc.data() || {};
        const now = Date.now();
        const lastUpdated = userData.coachLastUpdated?.toDate()?.getTime() || 0;
        const ONE_DAY = 24 * 60 * 60 * 1000;

        // Se abbiamo un messaggio recente, usiamo quello
        if (userData.coachMessage && (now - lastUpdated < ONE_DAY)) {
            return {
                message: userData.coachMessage,
                suggestedDeckId: userData.coachSuggestedDeckId
            };
        }

        // Se è passato più di un giorno, chiediamo a Gemini
        console.log('[MemoryBank] Throttle 24h scaduto. Richiedo nuovo insight a Gemini...');
        
        // Recuperiamo i dati aggregati della memoria
        const memorySnap = await db.collection('users').doc(window._fbUserId).collection('memory').limit(10).get();
        const memoryData = [];
        memorySnap.forEach(d => memoryData.push(d.data()));

        if (memoryData.length === 0) return { message: "Benvenuto in Cortex! Inizia a studiare per ricevere consigli personalizzati. 🚀" };

        // Prepariamo il prompt per Gemini
        const prompt = `Analizza le performance di studio dell'utente e scrivi un breve consiglio motivazionale e strategico (max 20 parole). 
        Dati: ${JSON.stringify(memoryData)}. 
        Scegli il mazzo con la precisione più bassa come suggerimento.
        Rispondi ESCLUSIVAMENTE in JSON: {"message": "string", "suggestedDeckId": "string"}`;

        const res = await callGeminiProxy({
            model: 'gemini-2.5-flash',
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.7, response_mime_type: 'application/json' }
        });

        const insight = JSON.parse(res.data.candidates[0].content.parts[0].text);

        // Salviamo l'insight per le prossime 24 ore
        await userRef.set({
            coachMessage: insight.message,
            coachSuggestedDeckId: insight.suggestedDeckId,
            coachLastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        return insight;
    } catch (e) {
        console.error('[MemoryBank] Error generating coach insight:', e);
        return null;
    }
}
