/**
 * modules/examMode.js
 *
 * Simulazione Esame con scelta multipla, timer a conto alla rovescia,
 * voto finale in trentesimi e resoconto delle risposte sbagliate.
 *
 * Sostituisce la vecchia modalità Neural Trial rimossa dalla Home (Phase 19).
 *
 * Dipendenze iniettate via init():
 *   state     — { decks: [] }
 *   showToast — (msg, type) => void
 */

import { fisherYatesShuffle } from '../js/utils.js';

let _deps = { state: { decks: [] }, showToast: () => {} };

/** Stato corrente dell'esame (null = nessun esame in corso) */
let _exam = null;

// ─── Init ──────────────────────────────────────────────────────────────────────

export function init(deps) {
    _deps = { ..._deps, ...deps };
}

// ─── Avvio ─────────────────────────────────────────────────────────────────────

/**
 * Inizializza l'esame sul mazzo all'indice deckIndex e naviga a 'exam'.
 * Richiede almeno 4 flashcard con front e back.
 */
export function startExam(deckIndex) {
    const { state, showToast } = _deps;
    const deck = state.decks[deckIndex];
    if (!deck) return;

    const validCards = (deck.cards || []).filter(c => c.q && c.a);
    if (validCards.length < 4) {
        showToast('Servono almeno 4 flashcard per simulare un esame.', 'info');
        return;
    }

    const shuffled = fisherYatesShuffle([...validCards]);

    const questions = shuffled.map(card => {
        // Costruisci le opzioni: 1 corretta + fino a 3 distrattori univoci
        const others  = validCards
            .filter(c => c !== card && c.a !== card.a)
            .map(c => c.a);
        const distract = fisherYatesShuffle([...others]).slice(0, 3);

        const options = fisherYatesShuffle([card.a, ...distract]);
        return {
            front:        card.q,
            correct:      card.a,
            options,
            correctIndex: options.indexOf(card.a),
        };
    });

    _exam = {
        deckName:  deck.name,
        deckIndex: Number(deckIndex),
        questions,
        current:   0,
        answers:   [],   // { chosen: number|null, correct: bool, timedOut: bool }
        done:      false,
    };

    if (typeof window.__cortexNav === 'function') {
        window.__cortexNav('exam');
    }
}

// ─── Accesso allo stato ────────────────────────────────────────────────────────

export function getExamState() { return _exam; }

// ─── Risposta ──────────────────────────────────────────────────────────────────

/**
 * Registra la risposta dell'utente.
 * @param {number|null} chosenIndex - indice dell'opzione scelta (null = timeout)
 * @param {boolean}     timedOut   - true se il tempo è scaduto senza risposta
 */
export function submitExamAnswer(chosenIndex, timedOut = false) {
    if (!_exam || _exam.done) return;

    const q       = _exam.questions[_exam.current];
    const correct = chosenIndex !== null && chosenIndex === q.correctIndex;

    _exam.answers.push({ chosen: chosenIndex, correct, timedOut });
    _exam.current++;

    if (_exam.current >= _exam.questions.length) {
        _exam.done = true;
    }
}

// ─── Risultati ─────────────────────────────────────────────────────────────────

/**
 * Calcola il voto e il resoconto delle risposte.
 * @returns {{ total, correctCount, pct, voto, votoColor, wrong, deckName, deckIndex }}
 */
export function getExamResults() {
    if (!_exam) return null;

    const total        = _exam.questions.length;
    const correctCount = _exam.answers.filter(a => a.correct).length;
    const pct          = total > 0 ? Math.round((correctCount / total) * 100) : 0;

    // Scala 18-30 con lode — mappatura percentuale
    let voto, votoColor;
    if      (pct >= 97) { voto = '30 e Lode 🏆'; votoColor = 'var(--gold)'; }
    else if (pct >= 90) { voto = '30';            votoColor = 'var(--gold)'; }
    else if (pct >= 83) { voto = '29';            votoColor = 'var(--green)'; }
    else if (pct >= 77) { voto = '28';            votoColor = 'var(--green)'; }
    else if (pct >= 70) { voto = '27';            votoColor = 'var(--green)'; }
    else if (pct >= 63) { voto = '26';            votoColor = 'var(--accent)'; }
    else if (pct >= 57) { voto = '25';            votoColor = 'var(--accent)'; }
    else if (pct >= 50) { voto = '24';            votoColor = 'var(--accent)'; }
    else if (pct >= 43) { voto = '23';            votoColor = 'var(--accent2)'; }
    else if (pct >= 37) { voto = '22';            votoColor = 'var(--accent2)'; }
    else if (pct >= 30) { voto = '18';            votoColor = 'var(--red)'; }
    else                { voto = 'Insufficiente'; votoColor = 'var(--red)'; }

    // Domande sbagliate (o scadute) con dettaglio
    const wrong = _exam.questions
        .map((q, i) => ({ q, a: _exam.answers[i] }))
        .filter(({ a }) => a && !a.correct);

    return {
        total,
        correctCount,
        pct,
        voto,
        votoColor,
        wrong,
        deckName:  _exam.deckName,
        deckIndex: _exam.deckIndex,
    };
}
