import { track } from '../core/analytics.js';

// Questions already saved as cards: no second AI request is needed to start.
export function startMaterialPractice(cards, mode) {
    if (!cards.length || !['multiple', 'open'].includes(mode)) return;
    document.getElementById('material-practice')?.remove();
    const previousFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.id = 'material-practice';
    dialog.setAttribute('aria-label', mode === 'open' ? 'Domande aperte' : 'Quiz a scelta multipla');
    dialog.style.cssText = 'width:min(92vw,620px);max-height:90dvh;overflow:auto;padding:24px;border:1px solid var(--border);border-radius:20px;background:var(--surface,#171722);color:var(--text,#fff);margin:auto;';
    let index = 0;
    let score = 0;
    function button(text, action) {
        const el = document.createElement('button');
        el.className = 'btn btn-outline';
        el.style.cssText = 'white-space:normal;text-align:left;min-height:44px;margin:6px 0;width:100%;';
        el.textContent = text;
        el.onclick = action;
        return el;
    }
    function close() { dialog.close(); }
    dialog.addEventListener('close', () => { dialog.remove(); previousFocus?.focus(); });
    function render() {
        dialog.replaceChildren(button('Chiudi', close));
        const heading = document.createElement('h2');
        heading.tabIndex = -1;
        dialog.append(heading);
        if (index === cards.length) {
            heading.textContent = mode === 'multiple' ? `Completato: ${score}/${cards.length} risposte corrette` : `Hai completato ${cards.length} domande`;
            const help = document.createElement('p');
            help.textContent = 'Le domande sono salvate in Materiale come flashcard, pronte per il ripasso.';
            dialog.append(help);
            track('material_practice_completed', { mode, count: cards.length });
            heading.focus();
            return;
        }
        const card = cards[index];
        heading.textContent = `${index + 1}/${cards.length} · ${card.q}`;
        const feedback = document.createElement('p');
        feedback.setAttribute('aria-live', 'polite');
        const next = button(index === cards.length - 1 ? 'Concludi' : 'Prossima domanda', () => { index++; render(); });
        next.hidden = true;
        let answered = false;
        function reveal(correct) {
            if (answered) return;
            answered = true;
            if (correct) score++;
            feedback.textContent = (mode === 'open' ? 'Risposta di riferimento: ' : correct ? 'Corretto! ' : 'Risposta corretta: ') + card.a;
            next.hidden = false;
            if (index === 0) track('material_first_answer', { mode });
        }
        if (mode === 'open') {
            const input = document.createElement('textarea');
            input.placeholder = 'Scrivi la risposta con parole tue…';
            input.setAttribute('aria-label', 'La tua risposta');
            input.style.cssText = 'width:100%;min-height:130px;margin-top:16px;';
            const submit = button('Confronta con la risposta', () => {
                if (!input.value.trim()) { input.focus(); return; }
                input.readOnly = true;
                submit.disabled = true;
                reveal(false);
            });
            const help = document.createElement('p');
            help.textContent = 'Rispondi, poi confronta i concetti: questa è un’autovalutazione, senza voto automatico.';
            dialog.append(help, input, submit);
        } else {
            const choices = [...card.options];
            for (let i = choices.length - 1; i > 0; i--) {
                const j = Math.floor(Math.random() * (i + 1));
                [choices[i], choices[j]] = [choices[j], choices[i]];
            }
            const buttons = choices.map(choice => button(choice, () => {
                buttons.forEach(el => { el.disabled = true; });
                reveal(choice === card.a);
            }));
            dialog.append(...buttons);
        }
        dialog.append(feedback, next);
        heading.focus();
    }
    document.body.append(dialog);
    dialog.showModal();
    render();
}
