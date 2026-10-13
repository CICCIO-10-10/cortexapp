// 13/10/2026 — Arrivo da "Studia <materia> con Cortex" (pagina /unime): ?area=universita&materia=<slug>[&nome=<nome>].
// Prima l'app ignorava materia e area: l'utente finiva su onboarding → home → Materiale e perdeva
// l'intenzione (Clarity drke73, 05/10). Ora: niente domande ridondanti, si apre "Nuova materia" con il
// nome già scritto e un avviso chiaro su cosa serve (gli appunti: Cortex non ha il materiale del corso).

export const MATERIA_KEY = 'cortex_materia_arrivo';

// Nome leggibile: prima &nome= (con maiuscole e accenti), altrimenti dallo slug.
export function materiaDaParametri(search) {
  const p = new URLSearchParams(search || '');
  if (p.get('sim')) return null;                       // i link TOLC hanno la loro strada
  const nome = (p.get('nome') || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  if (nome) return nome;
  const slug = (p.get('materia') || '').trim().toLowerCase();
  if (!/^[a-z0-9-]{2,90}$/.test(slug)) return null;
  const t = slug.replace(/-+/g, ' ').trim();
  return t ? (t.charAt(0).toUpperCase() + t.slice(1)).slice(0, 80) : null;
}

// Materia già presente tra i mazzi (stesso nome, senza maiuscole/accenti)?
export function trovaMazzo(decks, nome) {
  const norm = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  const n = norm(nome);
  return (Array.isArray(decks) ? decks : []).find(d => d && norm(d.name || d.title) === n) || null;
}

export function arrivoDaMateria() {
  try { return !!sessionStorage.getItem(MATERIA_KEY); } catch (_) { return false; }
}

export function handleMateriaArrival({ track, getDecks, showView, showPage } = {}) {
  const nome = materiaDaParametri(window.location.search);
  if (!nome) return null;
  try { sessionStorage.setItem(MATERIA_KEY, nome); } catch (_) {}
  try { localStorage.setItem('cortex_guest', '1'); } catch (_) {}
  window.history.replaceState({}, '', '/app');           // Indietro torna alla pagina dell'insegnamento
  let tries = 0;
  const iv = setInterval(() => {
    tries++;
    const sv = showView || window.showView;
    if (typeof sv !== 'function') { if (tries > 40) clearInterval(iv); return; }
    clearInterval(iv);
    const esiste = trovaMazzo(getDecks ? getDecks() : [], nome);
    try { track && track('materia_arrival', { has_deck: !!esiste }); } catch (_) {}
    if (esiste) { (showPage || window.showPage)?.('materiale'); return; }
    // L'app all'avvio disegna la home e può coprire la vista aperta troppo presto: si controlla
    // ogni 200 ms e si riapre finché "Nuova materia" resta a schermo per 2 secondi (max ~12 s).
    let t2 = 0, stabile = 0, vista = false, tocco = false;
    // Se lo studente tocca qualcosa dopo aver visto il modulo, non lo si riporta indietro.
    const segna = () => { if (vista) tocco = true; };
    window.addEventListener('pointerdown', segna, true); window.addEventListener('keydown', segna, true);
    const fine = () => { clearInterval(iv2); window.removeEventListener('pointerdown', segna, true); window.removeEventListener('keydown', segna, true); };
    const iv2 = setInterval(() => {
      t2++;
      const input = document.getElementById('deck-name');
      if (tocco) return fine();
      if (!input || !input.offsetParent) {
        stabile = 0;
        if (t2 % 5 === 1) { try { sv('CreateDeckView'); } catch (_) {} }
        if (t2 > 60) fine();
        return;
      }
      if (!input.value) { input.value = nome; input.dispatchEvent(new Event('input', { bubbles: true })); }
      if (!document.getElementById('materia-arrivo-hint')) {
        const p = document.createElement('p');
        p.id = 'materia-arrivo-hint';
        p.style.cssText = 'margin:8px 0 0;font-size:0.85rem;line-height:1.5;color:var(--text-muted);';
        p.textContent = 'Stai preparando ' + nome + '. Cortex non ha il materiale del tuo corso: incolla gli appunti o carica il PDF della dispensa e crea le flashcard da lì.';
        input.insertAdjacentElement('afterend', p);
      }
      vista = true;
      if (++stabile >= 10) fine();
    }, 200);
  }, 150);
  return nome;
}
