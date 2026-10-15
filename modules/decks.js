import { libraryToolbar, bindLibraryTools } from '../ui/components/LibraryTools.js';
import { t } from '../core/i18n.js';
import { getActiveEvent, buildEventBanner } from '../services/seasonalEvents.js';
import { escapeHTML } from '../js/utils.js';
/**
 * modules/decks.js — Cortex Nebula
 *
 * Rendering della lista mazzi con estetica olografica Nebula.
 */

let _deps = { state: { decks: [] } };

export function init(deps) {
    _deps = deps;
}

// Subject icon map
function getSubjectIcon(subject) {
    const s = (subject || '').toLowerCase();
    if (s.includes('fisica') || s.includes('chimica') || s.includes('atom'))    return '\u26DB\uFE0F';
    if (s.includes('bio') || s.includes('anatom') || s.includes('cellul'))      return '\uD83E\uDDEC';
    if (s.includes('mat') || s.includes('calcolo') || s.includes('algebra') || s.includes('geomet')) return '\uD83D\uDCCF';
    if (s.includes('storia') || s.includes('storica'))                          return '\uD83D\uDCDC';
    if (s.includes('lingue') || s.includes('inglese') || s.includes('spagnolo') ||
        s.includes('francese') || s.includes('tedesco') || s.includes('latino') ||
        s.includes('greco'))                                                     return '\uD83D\uDDE3\uFE0F';
    if (s.includes('diritto') || s.includes('giuridic') || s.includes('legge')) return '\u2696\uFE0F';
    if (s.includes('economia') || s.includes('econom') || s.includes('finanz')) return '\uD83D\uDCB9';
    if (s.includes('informatica') || s.includes('programm') || s.includes('codice') ||
        s.includes('algoritm'))                                                  return '\uD83D\uDCBB';
    if (s.includes('arte') || s.includes('disegno') || s.includes('pittura'))   return '\uD83C\uDFA8';
    if (s.includes('musica'))                                                    return '\uD83C\uDFB5';
    if (s.includes('geograf') || s.includes('cartograf'))                       return '\uD83C\uDF0D';
    if (s.includes('filosofia') || s.includes('filos'))                         return '\uD83C\uDFDB\uFE0F';
    if (s.includes('psicolog') || s.includes('mente'))                          return '\uD83E\uDDE0';
    if (s.includes('medicina') || s.includes('medic') || s.includes('farmac'))  return '\uD83E\uDE7A';
    if (s.includes('letteratura') || s.includes('poesia') || s.includes('dante')) return '\uD83D\uDCD6';
    if (s.includes('scienz') || s.includes('naturale'))                         return '\uD83D\uDD2C';
    return '\uD83D\uDCDA';
}

// Progress calculation based on actual studied cards (interval > 0)
function calcProgress(deck) {
    const cards = deck.cards;
    if (!cards || cards.length === 0) return 0;
    const studied = cards.filter(function(c) { return c.interval && c.interval > 0; }).length;
    return Math.min(100, Math.round((studied / cards.length) * 100));
}

export function renderDecks() {
    const { state } = _deps;
    if (!state || !state.decks) return;

    const container = document.getElementById('home-decks-list') ||
                      document.getElementById('decks-list') ||
                      document.getElementById('decks-container');
    if (!container) return;

    const headerHtml = `
        <div style="display:flex; flex-wrap:wrap; justify-content:space-between; align-items:flex-end; gap:14px; margin-bottom:24px; padding:0 10px;">
            <div>
                <h2 style="font-size:1.8rem; font-weight:800; color:var(--text); margin:0;">Le tue materie</h2>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:4px;">${state.decks.length} ${state.decks.length === 1 ? 'materia attiva' : t('deck_subjects_active')}</p>
            </div>
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
                <button class="btn btn-outline" data-fn="promptImportDeck" style="white-space:nowrap; padding:10px 16px; border-radius:12px; font-weight:700; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.04);">
                    Importa
                </button>
                <button class="btn btn-outline" data-fn="openImportaLezione" style="white-space:nowrap; padding:10px 16px; border-radius:12px; font-weight:700; border:1px solid rgba(139,92,246,0.35); background:rgba(139,92,246,0.10); color:#c084fc;">
                    Importa lezione
                </button>
                <button class="btn btn-primary" data-fn="showView" data-params='["CreateDeckView"]' style="white-space:nowrap; padding:10px 20px; border-radius:12px; font-weight:700; background:var(--accent-nebula); border:none; box-shadow:0 8px 24px var(--accent-glow);">
                    ＋ Nuova materia
                </button>
            </div>
        </div>
    `;

    if (state.decks.length === 0) {
        // ATTIVAZIONE: primo mazzo. Prima schermata di un nuovo utente -> CTA forte.
        container.innerHTML = `
            <section class="cx-library-empty">
              <div class="cx-eyebrow">LA TUA LIBRERIA</div>
              <h2>Ogni materia, il suo spazio.</h2>
              <p>Raccogli i tuoi appunti e trasformali in materiale da ripassare. Comincia da un testo, una foto o un PDF.</p>
              <button type="button" class="cx-example-card" aria-label="Mostra o nascondi la risposta della flashcard di esempio" aria-expanded="false" onclick="var f=this.querySelector('.demo-front'),b=this.querySelector('.demo-back');var show=f.style.display!=='none';f.style.display=show?'none':'';b.style.display=show?'':'none';this.setAttribute('aria-expanded',String(show));">
                <span class="demo-front"><span class="cx-eyebrow">COME FUNZIONA UNA FLASHCARD · ESEMPIO</span><strong>Quante ossa ha il corpo umano adulto?</strong><small>Tocca per scoprire la risposta →</small></span>
                <span class="demo-back" style="display:none"><span class="cx-eyebrow">LA RISPOSTA</span><strong>206</strong><small>Un concetto alla volta. Ora prova con i tuoi appunti.</small></span>
              </button>
              <div class="cx-library-actions"><button class="cx-primary" data-fn="showView" data-params='["CreateDeckView"]'>Crea una materia ＋</button><button class="cx-secondary" data-fn="promptImportDeck">Importa un mazzo</button><button class="cx-secondary" data-fn="openImportaLezione">Importa una lezione</button></div>
            </section>
        `;
        return;
    }

    const SUBJECT_COLORS = {
        'bio': '#10b981', 'anatom': '#10b981', 'cellul': '#10b981',
        'mat': '#3b82f6', 'calcolo': '#3b82f6', 'algebra': '#3b82f6', 'geomet': '#3b82f6',
        'fisica': '#f59e0b', 'chimica': '#f59e0b',
        'storia': '#f97316', 'storica': '#f97316',
        'lingue': '#ec4899', 'inglese': '#ec4899', 'spagnolo': '#ec4899',
        'diritto': '#64748b', 'legge': '#64748b',
        'economia': '#06b6d4', 'econom': '#06b6d4',
        'informatica': '#6366f1', 'programm': '#6366f1',
        'filosofia': '#a855f7', 'filos': '#a855f7',
        'medicina': '#ef4444', 'medic': '#ef4444',
        'letteratura': '#84cc16', 'poesia': '#84cc16',
    };
    function getSubjectColor(subject) {
        var s = (subject || '').toLowerCase();
        for (var k in SUBJECT_COLORS) { if (s.includes(k)) return SUBJECT_COLORS[k]; }
        return '#8b5cf6';
    }

    const listHtml = state.decks.map(function(d, i) {
        const dueCount    = (typeof d.dueCount === 'number') ? d.dueCount : (d.cards ? d.cards.length : 0);
        const progress    = calcProgress(d);
        const totalCards  = d.cards ? d.cards.length : 0;
        const subjectLabel = d.subject || 'Generale';
        const accentColor = getSubjectColor(subjectLabel);
        const progressColor = progress >= 80 ? '#10b981' : progress >= 40 ? '#8b5cf6' : '#6366f1';

        return `
            <div class="nebula-card reveal-anim" data-cx-deck-index="${i}" style="animation-delay:${i * 0.06}s; --card-accent:${accentColor};">
                <div class="card-accent-bar"></div><div class="cx-library-cover" aria-hidden="true"><span>${escapeHTML((d.name || d.title || 'M').trim().slice(0,2).toUpperCase())}</span><small>MATERIA DI STUDIO</small></div>

                <div class="card-top-row">
                <span class="card-subject-pill" style="--pill-color:${accentColor};">${escapeHTML(subjectLabel)}</span>
                    <button class="card-more-btn" id="more-btn-${i}" aria-label="Altre azioni sulla materia" aria-expanded="false" onclick="
                        var m=document.getElementById('more-menu-${i}');
                        var open = m.style.display!=='flex';
                        m.style.display=open?'flex':'none';
                        this.classList.toggle('active', open); this.setAttribute('aria-expanded', String(open));
                    ">···</button>
                </div>

                <div class="card-body-nebula">
                    <h3 class="card-title-nebula">${escapeHTML(d.name || d.title || 'Materia senza nome')}</h3>
                    <div class="card-progress-row" title="Quota di carte con intervallo di ripasso già assegnato (maggiore di zero). Non indica la preparazione né i ripassi completati.">
                        <div class="progress-aura-wrap" style="flex:1;">
                            <div class="progress-aura" style="width:${progress}%; background:${progressColor};"></div>
                        </div>
                        <span class="card-progress-pct" style="color:${progressColor};">${progress}% con intervallo di ripasso</span>
                    </div>
                    <div class="card-stats-inline">
                        <span><strong>${totalCards}</strong> card</span>
                        <span class="card-dot">·</span>
                        <span style="color:${dueCount > 0 ? '#f59e0b' : 'var(--text-muted)'}"><strong>${dueCount}</strong> da ripassare</span>
                    </div>
                </div>

                <details class="cx-material-detail"><summary>Appunti e contenuti <span aria-hidden="true">＋</span></summary><div class="cx-material-excerpt">${d.text ? escapeHTML(String(d.text).slice(0,1600)) : 'Non hai ancora aggiunto appunti di testo a questa materia.'}</div>${d.text && String(d.text).length > 1600 ? '<p class="cx-excerpt-note">Anteprima degli appunti. Apri la materia per leggere e modificare il testo completo.</p>' : ''}<button class="btn-deck-action" data-fn="editDeck" data-params="[${i}]">Apri e modifica materia →</button></details><div class="card-actions-nebula">
                    <button class="btn-nebula-main" data-fn="startStudy" data-params="[${i}]">
                        ${t('deck_study_now')}
                    </button>
                    <div class="card-sub-actions">
                        <button class="btn-deck-action" data-fn="startQuiz" data-params="[${i}]">Quiz</button>
                        <button class="btn-deck-action" data-fn="startOral" data-params="[${i}]">Interrogazione</button>
                        <button class="btn-deck-action" data-fn="startBossMode" data-params="[${i}]">Sfida</button>
                    </div>

                    <!-- Menu espanso "Altro" -->
                    <div id="more-menu-${i}" class="deck-more-menu" style="display:none; flex-wrap:wrap; gap:8px; margin-top:8px;">
                        ${d.hasLesson ? `<button class="btn-deck-action" data-fn="openLezioneNota" data-params="[${i}]"><span>&#128214;</span> Lezione</button>` : ''}
                        <button class="btn-deck-action" data-fn="openMindMap" data-params="[${i}]">
                            <span>&#128506;&#65039;</span> Mind Map
                        </button>
                        <button class="btn-deck-action" data-fn="openLoci" data-params="[${i}]">
                            <span>&#127963;&#65039;</span> Palazzo
                        </button>
                        <button class="btn-deck-action" data-fn="openPodcast" data-params="[${i}]">
                            <span>&#127897;&#65039;</span> Podcast
                        </button>
                        <button class="btn-deck-action" data-fn="shareDeck" data-params="[${i}]">
                            <span>&#128279;</span> Condividi
                        </button>
                        <button class="btn-deck-action" data-fn="openAddMaterial" data-params="[${i}]">
                            <span>&#10133;</span> Materiale
                        </button>
                        <button class="btn-deck-action" data-fn="editDeck" data-params="[${i}]">
                            <span>&#9999;&#65039;</span> Modifica
                        </button>
                        <button class="btn-deck-action btn-del" data-fn="confirmDelete" data-params="[${i}]" id="del-btn-${i}">
             
                            <span>&#128465;&#65039;</span> Elimina
                        </button>
                    </div>
                </div>

                <div id="voice-player-wrap-${i}" style="display:none;width:100%;margin-top:6px;"><audio id="voice-player-${i}" controls style="width:100%;"></audio></div>
            </div>`;
    }).join('');

    // FIX 15/07/2026: ghost-card "+ Nuova Materia" in coda alla griglia —
    // riempie il vuoto quando le materie sono poche e invita a crearne altre.
    const ghostHtml = `
        <button data-fn="showView" data-params='["CreateDeckView"]' style="
            min-height:220px; border-radius:18px; cursor:pointer; font-family:inherit;
            background:rgba(139,92,246,0.04); border:2px dashed rgba(139,92,246,0.30);
            display:flex; flex-direction:column; align-items:center; justify-content:center; gap:10px;
            color:var(--text-muted); transition:border-color .2s, background .2s, transform .15s;
        " onmouseover="this.style.borderColor='rgba(139,92,246,0.6)';this.style.background='rgba(139,92,246,0.08)';this.style.transform='translateY(-2px)'"
          onmouseout="this.style.borderColor='rgba(139,92,246,0.30)';this.style.background='rgba(139,92,246,0.04)';this.style.transform='none'">
            <span style="font-size:2.2rem; line-height:1; color:var(--accent);">+</span>
            <span style="font-weight:800; font-size:0.95rem; color:var(--text);">Nuova Materia</span>
            <span style="font-size:0.72rem;">appunti o foto → flashcard AI</span>
        </button>`;

    // PUSH NUDGE: riattiva le notifiche (reminder ripasso) al momento giusto — 1 sola volta.
    let pushNudge = '';
    try {
      if ('Notification' in window && Notification.permission === 'default' && !localStorage.getItem('cortex_push_asked')) {
        pushNudge = `<div id="push-nudge" style="margin:0 10px 16px; padding:14px 16px; display:flex; align-items:center; gap:12px; flex-wrap:wrap; background:rgba(139,92,246,0.10); border:1px solid rgba(139,92,246,0.28); border-radius:16px;">
          <span style="font-size:1.4rem;">&#128276;</span>
          <span style="flex:1; min-width:180px; color:var(--text); font-size:0.92rem;">Vuoi un promemoria quando hai carte da ripassare? Cos&igrave; non perdi lo streak.</span>
          <button data-fn="requestNotifications" onclick="try{localStorage.setItem('cortex_push_asked','1')}catch(e){}; var n=this.closest('#push-nudge'); if(n) n.remove();" style="padding:9px 16px; border-radius:10px; border:none; font-weight:700; color:#fff; background:var(--accent-nebula,#7c3aed); cursor:pointer;">Attiva</button>
          <button onclick="try{localStorage.setItem('cortex_push_asked','1')}catch(e){}; var n=this.closest('#push-nudge'); if(n) n.remove();" style="padding:9px 12px; border-radius:10px; border:none; background:transparent; color:var(--text-muted); cursor:pointer; font-size:0.85rem;">No grazie</button>
        </div>`;
      }
    } catch(e){}
    container.innerHTML = headerHtml + libraryToolbar + pushNudge + '<div class="nebula-grid">' + listHtml + ghostHtml + '</div>';
    bindLibraryTools(container, state.decks);
    // Banner evento stagionale (spostato dalla Home 23/09/2026): in cima a Materiale.
    try {
        const _ev = getActiveEvent();
        if (_ev) {
            const _b = buildEventBanner(_ev);
            if (_b) { _b.style.margin = '0 10px 20px'; container.insertBefore(_b, container.firstChild); }
        }
    } catch (e) {}
    window.cortexUpdateUIStrings?.();
}
