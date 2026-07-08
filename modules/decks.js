import { t } from '../core/i18n.js';
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
                <button class="btn btn-primary" data-fn="showView" data-params='["CreateDeckView"]' style="padding:10px 24px; border-radius:12px; font-weight:700; background:var(--accent-nebula); border:none; box-shadow:0 8px 24px var(--accent-glow);">
                    + Nuova Materia
                </button>
            </div>
        </div>
    `;

    if (state.decks.length === 0) {
        container.innerHTML = headerHtml + `
            <div style="padding:60px 24px; text-align:center; background:rgba(255,255,255,0.02); border:1px solid rgba(255,255,255,0.05); border-radius:24px; margin:0 10px;">
                <div style="font-size:3rem; margin-bottom:16px; opacity:0.5;">&#128218;</div>
                <p style="color:var(--text-muted); font-size:1rem; line-height:1.5;">${t('deck_empty_msg')}</p>
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
                    <h3 class="card-title-nebula">${d.name}</h3>
                    <div class="card-progress-row">
                        <div class="progress-aura-wrap" style="flex:1;">
                            <div class="progress-aura" style="width:${progress}%; background:${progressColor};"></div>
                        </div>
                        <span class="card-progress-pct" style="color:${progressColor};">${progress}%</span>
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
                        <button class="btn-deck-action" data-fn="openQuiz" data-params="[${i}]">&#10067; Quiz</button>
                        <button class="btn-deck-action" data-fn="startOral" data-params="[${i}]">&#127891; Prof AI</button>
                        <button class="btn-deck-action" data-fn="startBossMode" data-params="[${i}]">&#128737; Boss</button>
                    </div>

                    <!-- Menu espanso "Altro" -->
                    <div id="more-menu-${i}" style="display:none; flex-wrap:wrap; gap:8px; margin-top:8px;">
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

    container.innerHTML = headerHtml + '<div class="nebula-grid">' + listHtml + '</div>';
    window.cortexUpdateUIStrings?.();
}
