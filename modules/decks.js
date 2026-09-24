import { t } from '../core/i18n.js';
import { getActiveEvent, buildEventBanner } from '../services/seasonalEvents.js';
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
        <div style="display:flex; justify-content:space-between; align-items:flex-end; margin-bottom:24px; padding:0 10px;">
            <div>
                <h2 style="font-size:1.8rem; font-weight:800; color:var(--text); margin:0;">I Tuoi Mazzi</h2>
                <p style="color:var(--text-muted); font-size:0.9rem; margin-top:4px;">${state.decks.length} ${t('deck_subjects_active')}</p>
            </div>
            <div style="display:flex; gap:12px;">
                <button class="btn btn-outline" data-fn="promptImportDeck" style="padding:10px 16px; border-radius:12px; font-weight:700; border:1px solid rgba(255,255,255,0.18); background:rgba(255,255,255,0.04);">
                    📥 Importa
                </button>
                <button class="btn btn-outline" data-fn="openImportaLezione" style="padding:10px 16px; border-radius:12px; font-weight:700; border:1px solid rgba(139,92,246,0.35); background:rgba(139,92,246,0.10); color:#c084fc;">
                    🎓 Importa lezione
                </button>
                <button class="btn btn-primary" data-fn="showView" data-params='["CreateDeckView"]' style="padding:10px 24px; border-radius:12px; font-weight:700; background:var(--accent-nebula); border:none; box-shadow:0 8px 24px var(--accent-glow);">
                    + Nuova Materia
                </button>
            </div>
        </div>
    `;

    if (state.decks.length === 0) {
        // ATTIVAZIONE: primo mazzo. Prima schermata di un nuovo utente -> CTA forte.
        container.innerHTML = `
            <div style="max-width:560px; margin:20px auto 0; padding:0 10px;">
              <div style="text-align:center; padding:44px 26px; background:linear-gradient(160deg, rgba(139,92,246,0.14), rgba(99,102,241,0.05)); border:1px solid rgba(139,92,246,0.25); border-radius:26px; box-shadow:0 12px 40px var(--accent-glow, rgba(139,92,246,0.25));">
                <div style="font-size:3.2rem; margin-bottom:10px;">&#128640;</div>
                <h2 style="font-size:1.55rem; font-weight:800; color:var(--text); margin:0 0 8px;">Crea il tuo primo mazzo</h2>
                <p style="color:var(--text-muted); font-size:1.02rem; line-height:1.5; margin:0 auto 22px; max-width:430px;">
                  Scegli una materia o incolla i tuoi appunti: <strong style="color:var(--text)">l'AI li trasforma in flashcard</strong> e ti interroga. Bastano 30 secondi.
                </p>
                <div style="display:flex; justify-content:center; align-items:center; gap:10px; flex-wrap:wrap; margin-bottom:26px; font-size:0.8rem; color:var(--text-muted);">
                  <span>1 · Scegli la materia</span><span style="opacity:.4">&rarr;</span>
                  <span>2 · L'AI genera</span><span style="opacity:.4">&rarr;</span>
                  <span>3 · Ripassa</span>
                </div>
                <div onclick="var f=this.querySelector('.demo-front'),b=this.querySelector('.demo-back');var sb=f.style.display!=='none';f.style.display=sb?'none':'';b.style.display=sb?'':'none';" style="cursor:pointer; max-width:360px; margin:0 auto 22px; padding:24px 20px; border-radius:18px; background:rgba(139,92,246,0.10); border:1px solid rgba(139,92,246,0.35); min-height:118px; display:flex; align-items:center; justify-content:center; transition:background .15s;">
                  <div class="demo-front" style="text-align:center;">
                    <div style="font-size:0.68rem; letter-spacing:.12em; text-transform:uppercase; color:var(--text-muted); margin-bottom:8px;">Prova &middot; esempio</div>
                    <div style="font-size:1.14rem; font-weight:700; color:var(--text);">Quante ossa ha il corpo umano adulto?</div>
                    <div style="margin-top:12px; font-size:0.85rem; color:#a78bfa; font-weight:600;">&#128072; Tocca per la risposta</div>
                  </div>
                  <div class="demo-back" style="display:none; text-align:center;">
                    <div style="font-size:0.68rem; letter-spacing:.12em; text-transform:uppercase; color:#22c55e; margin-bottom:6px;">Risposta</div>
                    <div style="font-size:2.1rem; font-weight:800; color:var(--text);">206</div>
                    <div style="margin-top:10px; font-size:0.85rem; color:var(--text-muted);">Ecco com'&egrave; una flashcard. Ora crea le tue &#128071;</div>
                  </div>
                </div>
                <button data-fn="showView" data-params='["CreateDeckView"]' style="width:100%; max-width:340px; padding:16px; border-radius:14px; font-weight:800; font-size:1.05rem; color:#fff; background:var(--accent-nebula, #7c3aed); border:none; cursor:pointer; box-shadow:0 10px 30px var(--accent-glow, rgba(124,58,237,0.45));">
                  &#10024; Crea il primo mazzo
                </button>
                <button data-fn="openImportaLezione" style="width:100%; max-width:340px; margin-top:12px; padding:14px; border-radius:14px; font-weight:800; font-size:1rem; color:#c084fc; background:rgba(139,92,246,0.10); border:1px solid rgba(139,92,246,0.35); cursor:pointer;">
                  🎓 Importa una lezione &rarr; flashcard
                </button>
                <div style="margin-top:14px;">
                  <button data-fn="promptImportDeck" style="background:none; border:none; color:var(--text-muted); font-size:0.9rem; text-decoration:underline; cursor:pointer;">oppure importa un mazzo che hai gi&agrave;</button>
                </div>
              </div>
            </div>
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
            <div class="nebula-card reveal-anim" style="animation-delay:${i * 0.06}s; --card-accent:${accentColor};">
                <div class="card-accent-bar"></div>

                <div class="card-top-row">
                    <span class="card-subject-pill" style="--pill-color:${accentColor};">${subjectLabel}</span>
                    <button class="card-more-btn" id="more-btn-${i}" onclick="
                        var m=document.getElementById('more-menu-${i}');
                        var open = m.style.display!=='flex';
                        m.style.display=open?'flex':'none';
                        this.classList.toggle('active', open);
                    ">···</button>
                </div>

                <div class="card-body-nebula">
                    <h3 class="card-title-nebula">${d.name || d.title || 'Materia senza nome'}</h3>
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

                <div class="card-actions-nebula">
                    <button class="btn-nebula-main" data-fn="startStudy" data-params="[${i}]">
                        ${t('deck_study_now')}
                    </button>
                    <div class="card-sub-actions">
                        <button class="btn-deck-action" data-fn="startQuiz" data-params="[${i}]">&#10067; Quiz</button>
                        <button class="btn-deck-action" data-fn="startOral" data-params="[${i}]">&#127891; Prof AI</button>
                        <button class="btn-deck-action" data-fn="startBossMode" data-params="[${i}]">&#128737; Boss</button>
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
    container.innerHTML = headerHtml + pushNudge + '<div class="nebula-grid">' + listHtml + ghostHtml + '</div>';
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
