export const matchesMaterial = (deck, query, filter) => {
    const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('it');
    return normalize(`${deck.name || deck.title || ''} ${deck.subject || ''}`).includes(normalize(query).trim()) &&
        (filter !== 'due' || Number(deck.dueCount) > 0);
};
export const libraryToolbar = `<div class="cx-library-toolbar"><label class="cx-search"><span>Cerca una materia</span><input type="search" id="cx-library-search" placeholder="Nome o argomento…" autocomplete="off"></label><label class="cx-filter"><span>Mostra</span><select id="cx-library-filter"><option value="all">Tutte le materie</option><option value="due">Da ripassare</option></select></label></div><p id="cx-library-count" class="cx-library-count" role="status" aria-live="polite"></p><div id="cx-library-no-results" hidden class="cx-no-results"><h3>Nessuna materia trovata.</h3><p>Prova un altro nome oppure mostra tutte le materie.</p><button type="button" class="cx-secondary" id="cx-library-reset">Azzera i filtri</button></div>`;
export function bindLibraryTools(container, decks) {
    const search = container.querySelector('#cx-library-search');
    const filter = container.querySelector('#cx-library-filter');
    if (!search || !filter) return;
    const update = () => {
        let visible = 0;
        container.querySelectorAll('[data-cx-deck-index]').forEach(card => {
            const deck = decks[Number(card.dataset.cxDeckIndex)];
            card.hidden = !deck || !matchesMaterial(deck, search.value, filter.value);
            if (!card.hidden) visible++;
        });
        container.querySelector('#cx-library-count').textContent = `${visible} ${visible === 1 ? 'materia' : 'materie'} su ${decks.length}`;
        container.querySelector('#cx-library-no-results').hidden = visible > 0;
    };
    search.addEventListener('input', update);
    filter.addEventListener('change', update);
    container.querySelector('#cx-library-reset').addEventListener('click', () => {search.value = '';filter.value = 'all';update();search.focus();});
    update();
}
