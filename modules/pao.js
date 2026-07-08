import { t } from '../core/i18n.js';
import { TRANSLATIONS } from '../data/translations.js';
const _t = () => TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it;
/**
 * modules/pao.js — Sistema P.A.O. (Persona-Azione-Oggetto) (Phase 10)
 *
 * Estratto da main.js. Zero dipendenze esterne: solo DOM manipulation.
 * Fonema fonetico italiano per la memorizzazione di sequenze numeriche.
 *
 * Funzioni esportate (usate da window/registry in main.js):
 *   generatePAO()          — oninput su #pao-input
 *   renderPAOTable()       — chiamata da showPage('pao') in main.js
 *   togglePAOTable(el)     — data-fn="togglePAOTable" data-self="true"
 */

const PHONETIC_MAP = {
    '0': { c: 'S, Z', p: 'Zorro',  a: 'Zappa',   o: 'Sasso' },
    '1': { c: 'T, D', p: 'Thor',   a: 'Taglia',   o: 'Tubo'  },
    '2': { c: 'N',    p: 'Nonna',  a: 'Nasconde',  o: 'Nave'  },
    '3': { c: 'M',    p: 'Mago',   a: 'Mangia',    o: 'Mela'  },
    '4': { c: 'R',    p: 'Re',     a: 'Rema',      o: 'Rana'  },
    '5': { c: 'L',    p: 'Lupo',   a: 'Lancia',    o: 'Lama'  },
    '6': { c: 'C/G',  p: 'Cinese', a: 'Cucina',    o: 'Cesto' },
    '7': { c: 'K, Q', p: 'Cane',   a: 'Corre',     o: 'Casa'  },
    '8': { c: 'F, V', p: 'Fata',   a: 'Fuma',      o: 'Faro'  },
    '9': { c: 'P, B', p: 'Papa',   a: 'Pesa',      o: 'Palla' }
};

function getPAOForTwoDigits(numStr) {
    const d1 = numStr[0];
    const d2 = numStr.length > 1 ? numStr[1] : '0';
    const fallback = { p: 'Ignoto', a: 'Tocca', o: 'Cosa' };
    const first  = PHONETIC_MAP[d1] || fallback;
    const second = PHONETIC_MAP[d2] || fallback;
    return {
        num: numStr,
        p: `${first.p}`,
        a: `${second.a}`,
        o: `${first.o} ${second.o.toLowerCase()}`
    };
}

export function generatePAO() {
    const input = document.getElementById('pao-input').value.replace(/[^0-9]/g, '');
    const resultDiv = document.getElementById('pao-result');
    if (input.length === 0) {
        resultDiv.innerHTML = '<div style="color:var(--text-muted); font-size:0.9rem;">Digita un numero (es. 1492).</div>';
        return;
    }

    let pairs = [];
    for (let i = 0; i < input.length; i += 2) {
        pairs.push(input.substring(i, Math.min(i + 2, input.length)));
    }

    let html = '';
    let sentenceObj = { p: null, a: null, o: null };

    pairs.forEach((pair, idx) => {
        const pao = getPAOForTwoDigits(pair);
        let role = '', roleSymbol = '', value = '';
        if (idx % 3 === 0)      { role = t('pao_character'); roleSymbol = '👤'; value = pao.p; sentenceObj.p = pao.p; }
        else if (idx % 3 === 1) { role = t('pao_action');       roleSymbol = '🎬'; value = pao.a; sentenceObj.a = pao.a; }
        else                    { role = t('pao_object');       roleSymbol = '📦'; value = pao.o; sentenceObj.o = pao.o; }

        html += `
            <div style="background:var(--surface2); border:1px solid var(--border); border-radius:12px; padding:16px; min-width:140px; text-align:center;">
                <div style="font-size:1.8rem; font-weight:800; color:var(--accent); margin-bottom:8px;">${pair}</div>
                <div style="font-size:0.8rem; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">${roleSymbol} ${role}</div>
                <div style="font-size:1.1rem; font-weight:700;">${value}</div>
            </div>`;
    });

    const absurdAdjectives = ["gigante", "infuocato", "fatto di cioccolato", "che balla la samba", "trasparente", "che urla come un pirata", "volante", "miniaturizzato"];
    const randAdj = absurdAdjectives[Math.floor(Math.random() * absurdAdjectives.length)];
    const pStr = sentenceObj.p || "Qualcuno";
    const aStr = sentenceObj.a ? sentenceObj.a.toLowerCase() : "fa qualcosa a";
    const oStr = sentenceObj.o ? sentenceObj.o.toLowerCase() : "un oggetto misterioso";
    const finalStory = `${pStr} ${aStr} un ${oStr} ${randAdj}!`;

    html += `<div style="width:100%; text-align:center; margin-top:16px; padding:16px; background:rgba(124,106,247,0.1); border:1px dashed var(--accent); border-radius:12px;">
                <h4 style="color:var(--accent2); margin-bottom:8px;">🎬 La tua Scena Mentale (Assurda):</h4>
                <p style="font-size:1.2rem; font-weight:700; line-height:1.4;">${finalStory}</p>
                <small style="color:var(--text-muted);">Più l'immagine è strana, più è facile da ricordare.</small>
             </div>`;

    resultDiv.innerHTML = html;
}

export function renderPAOTable() {
    const table = document.getElementById('pao-table-container');
    if (table.innerHTML.trim() !== '') return;

    let html = '<table style="width:100%; border-collapse:collapse; margin-top:8px; font-size:0.9rem; margin-bottom:24px;">';
    html += `<tr><th style="padding:10px; border-bottom:1px solid var(--border); color:var(--text-muted); text-align:left;">Num</th><th style="padding:10px; border-bottom:1px solid var(--border); color:var(--text-muted); text-align:left;">${t('pao_character')}</th><th style="padding:10px; border-bottom:1px solid var(--border); color:var(--text-muted); text-align:left;">${t('pao_action')}</th><th style="padding:10px; border-bottom:1px solid var(--border); color:var(--text-muted); text-align:left;">${t('pao_object')}</th></tr>`;
    for (let i = 0; i < 100; i++) {
        const num = i < 10 ? '0' + i : i.toString();
        const pao = getPAOForTwoDigits(num);
        html += `<tr>
            <td style="padding:10px; border-bottom:1px solid var(--surface3); font-weight:800; color:var(--accent);">${num}</td>
            <td style="padding:10px; border-bottom:1px solid var(--surface3);">${pao.p}</td>
            <td style="padding:10px; border-bottom:1px solid var(--surface3);">${pao.a}</td>
            <td style="padding:10px; border-bottom:1px solid var(--surface3);">${pao.o}</td>
        </tr>`;
    }
    html += '</table>';
    table.innerHTML = html;
}

/**
 * @param {HTMLElement} el — bottone che ha ricevuto il click (data-self="true")
 */
export function togglePAOTable(el) {
    const container = document.getElementById('pao-table-container');
    if (container.style.display === 'none') {
        container.style.display = 'block';
        if (el) el.textContent = (T.pao_hide||'Nascondi Tabella 00-99');
        renderPAOTable();
        if (typeof window.earnBadge === 'function') window.earnBadge('pao_master');
    } else {
        container.style.display = 'none';
        if (el) el.textContent = (T.pao_show||'Rivela Tabella 00-99');
    }
}
