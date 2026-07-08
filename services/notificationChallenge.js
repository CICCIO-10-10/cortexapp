import { t } from '../core/i18n.js';
/**
 * notificationChallenge.js — Cortex Anti-Procrastination Challenges
 *
 * STATO: SCHELETRO — UI da rifinire, logica core completa
 *
 * IDEA:
 *   Quando l'utente apre l'app da una notifica di promemoria,
 *   invece di poter semplicemente chiudere o rimandare,
 *   deve completare una mini-sfida fisica/mentale prima di poter
 *   rimandare il promemoria. Se completa la sfida → apre lo studio.
 *
 *   Ispirato alle app sveglia anti-procrastinazione (Alarmy, ecc.)
 *
 * SFIDE DISPONIBILI:
 *   - shake        → scuoti il telefono N volte
 *   - tap          → tocca lo schermo N volte velocemente
 *   - math         → risolvi un'operazione matematica semplice
 *   - type         → scrivi una parola specifica
 *   - steps        → (futuro) fai X passi con l'accelerometro
 *
 * FLOW:
 *   Notifica → tap → app aperta con ?challenge=1 → overlay sfida →
 *   [completa sfida] → sessione di studio
 *   [rimanda]        → deve comunque fare metà sfida per rimandare
 *
 * TODO:
 *   1. Collegare showChallenge() all'apertura da notifica (controllare URL params in main.js)
 *   2. Salvare la sfida preferita dell'utente nelle impostazioni
 *   3. Aumentare difficoltà progressivamente (più giorni di streak = sfida più dura)
 *   4. Aggiungere animazioni e suoni
 *   5. Testare DeviceMotionEvent su iOS (richiede permesso esplicito su iOS 13+)
 */

// ─── Config ──────────────────────────────────────────────────────────────────

const CHALLENGE_CONFIG = {
    // Difficoltà base (aumenta con streak e piano)
    shake: {
        free:    { count: 20,  label: 'Scuoti il telefono' },
        pro:     { count: 15,  label: 'Scuoti il telefono' },  // PRO: un po' più facile
    },
    tap: {
        free:    { count: 30,  label: 'Tocca lo schermo' },
        pro:     { count: 20,  label: 'Tocca lo schermo' },
    },
    math: {
        free:    { difficulty: 'hard',   label: 'Risolvi il calcolo' },
        pro:     { difficulty: 'medium', label: 'Risolvi il calcolo' },
    },
    type: {
        free:    { word: 'STUDIARE',  label: 'Scrivi la parola' },
        pro:     { word: 'CORTEX',    label: 'Scrivi la parola' },
    },
};

// Moltiplicatore difficoltà basato sulla streak
const STREAK_MULTIPLIER = (streakDays) => {
    if (streakDays >= 30) return 1.5;
    if (streakDays >= 14) return 1.25;
    return 1.0;
};

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Mostra l'overlay sfida anti-procrastinazione.
 * Da chiamare quando l'app viene aperta da una notifica di studio.
 *
 * @param {Object} options
 * @param {string} options.type       - 'shake' | 'tap' | 'math' | 'type' | 'random'
 * @param {boolean} options.isPro     - Difficoltà ridotta per utenti PRO
 * @param {number} options.streakDays - Giorni streak correnti
 * @param {Function} options.onComplete - Callback: utente ha completato la sfida → avvia studio
 * @param {Function} options.onSnooze  - Callback: utente ha rimandato (dopo sfida ridotta)
 */
export function showChallenge({ type = 'random', isPro = false, streakDays = 0, onComplete, onSnooze } = {}) {
    const chosenType = type === 'random' ? _randomChallengeType() : type;
    const plan = isPro ? 'pro' : 'free';
    const streak = Math.floor(STREAK_MULTIPLIER(streakDays));

    const overlay = _buildOverlay();
    document.body.appendChild(overlay);

    switch (chosenType) {
        case 'shake': _startShakeChallenge(overlay, plan, streak, onComplete, onSnooze); break;
        case 'tap':   _startTapChallenge(overlay, plan, streak, onComplete, onSnooze);   break;
        case 'math':  _startMathChallenge(overlay, plan, streak, onComplete, onSnooze);  break;
        case 'type':  _startTypeChallenge(overlay, plan, streak, onComplete, onSnooze);  break;
        default:      _startTapChallenge(overlay, plan, streak, onComplete, onSnooze);
    }
}

function _randomChallengeType() {
    const types = ['shake', 'tap', 'math', 'type'];
    return types[Math.floor(Math.random() * types.length)];
}

// ─── Overlay base ─────────────────────────────────────────────────────────────

function _buildOverlay() {
    const overlay = document.createElement('div');
    overlay.id = 'cortex-challenge-overlay';
    overlay.style.cssText = `
        position: fixed; inset: 0; z-index: 99999;
        background: linear-gradient(135deg, #0f0c1a 0%, #1a0933 100%);
        display: flex; flex-direction: column; align-items: center;
        justify-content: center; padding: 32px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        color: #fff;
    `;
    return overlay;
}

function _buildProgress(current, total, color = '#8b5cf6') {
    const pct = Math.min(100, Math.round((current / total) * 100));
    return `
        <div style="width:100%;background:#2a1f4a;border-radius:99px;height:12px;margin:16px 0">
            <div style="width:${pct}%;background:${color};height:12px;border-radius:99px;
                        transition:width 0.15s ease"></div>
        </div>
        <div style="font-size:0.85rem;color:#9ca3af">${current} / ${total}</div>
    `;
}

function _buildSnoozeBtn(label = 'Rimanda (5 min)') {
    const btn = document.createElement('button');
    btn.textContent = label;
    btn.style.cssText = `
        margin-top: 24px; background: transparent; border: 1px solid #4b3f72;
        color: #9ca3af; padding: 10px 24px; border-radius: 99px;
        font-size: 0.9rem; cursor: pointer;
    `;
    return btn;
}

function _closeOverlay() {
    document.getElementById('cortex-challenge-overlay')?.remove();
}

// ─── SFIDA 1: Shake ──────────────────────────────────────────────────────────

function _startShakeChallenge(overlay, plan, multiplier, onComplete, onSnooze) {
    const target = Math.round(CHALLENGE_CONFIG.shake[plan].count * multiplier);
    let shakeCount = 0;
    let lastAccel = { x: 0, y: 0, z: 0 };
    const SHAKE_THRESHOLD = 15;

    overlay.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:8px">📱</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin:0 0 8px">Scuoti il telefono!</h2>
        <p style="color:#9ca3af;text-align:center;margin:0 0 16px">
            Scuotilo <strong style="color:#8b5cf6">${target} volte</strong> per avviare lo studio
        </p>
        <div id="ch-progress-wrap" style="width:100%;max-width:300px"></div>
        <div id="ch-count" style="font-size:3rem;font-weight:800;color:#8b5cf6;margin:16px 0">0</div>
    `;

    const progressWrap = overlay.querySelector('#ch-progress-wrap');
    const countEl = overlay.querySelector('#ch-count');
    progressWrap.innerHTML = _buildProgress(0, target);

    const snoozeBtn = _buildSnoozeBtn();
    overlay.appendChild(snoozeBtn);

    // iOS 13+ richiede permesso esplicito per DeviceMotion
    if (typeof DeviceMotionEvent?.requestPermission === 'function') {
        DeviceMotionEvent.requestPermission().catch(() => {
            // Fallback a tap se permesso negato
            _closeOverlay();
            const newOverlay = _buildOverlay();
            document.body.appendChild(newOverlay);
            _startTapChallenge(newOverlay, plan, multiplier, onComplete, onSnooze);
        });
    }

    function onMotion(e) {
        const acc = e.accelerationIncludingGravity;
        if (!acc) return;
        const delta = Math.abs(acc.x - lastAccel.x) +
                      Math.abs(acc.y - lastAccel.y) +
                      Math.abs(acc.z - lastAccel.z);
        lastAccel = { x: acc.x || 0, y: acc.y || 0, z: acc.z || 0 };

        if (delta > SHAKE_THRESHOLD) {
            shakeCount++;
            countEl.textContent = shakeCount;
            progressWrap.innerHTML = _buildProgress(shakeCount, target);

            if (shakeCount >= target) {
                window.removeEventListener('devicemotion', onMotion);
                _onChallengeComplete(overlay, onComplete);
            }
        }
    }

    window.addEventListener('devicemotion', onMotion);

    snoozeBtn.addEventListener('click', () => {
        window.removeEventListener('devicemotion', onMotion);
        _onSnooze(overlay, onSnooze);
    });
}

// ─── SFIDA 2: Tap ────────────────────────────────────────────────────────────

function _startTapChallenge(overlay, plan, multiplier, onComplete, onSnooze) {
    const target = Math.round(CHALLENGE_CONFIG.tap[plan].count * multiplier);
    let tapCount = 0;

    overlay.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:8px">👆</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin:0 0 8px">Tocca lo schermo!</h2>
        <p style="color:#9ca3af;text-align:center;margin:0 0 16px">
            Tocca il cerchio <strong style="color:#8b5cf6">${target} volte</strong>
        </p>
        <button id="ch-tap-btn" style="
            width:160px;height:160px;border-radius:50%;
            background:linear-gradient(135deg,#7c3aed,#4f46e5);
            border:none;color:#fff;font-size:3rem;font-weight:800;
            cursor:pointer;user-select:none;transition:transform 0.08s;
            box-shadow:0 0 40px rgba(139,92,246,0.5);
        ">0</button>
        <div id="ch-progress-wrap" style="width:100%;max-width:300px;margin-top:16px"></div>
    `;

    const btn = overlay.querySelector('#ch-tap-btn');
    const progressWrap = overlay.querySelector('#ch-progress-wrap');
    progressWrap.innerHTML = _buildProgress(0, target);

    const snoozeBtn = _buildSnoozeBtn();
    overlay.appendChild(snoozeBtn);

    btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        tapCount++;
        btn.textContent = tapCount;
        btn.style.transform = 'scale(0.92)';
        setTimeout(() => { btn.style.transform = ''; }, 80);
        progressWrap.innerHTML = _buildProgress(tapCount, target);

        if (tapCount >= target) {
            _onChallengeComplete(overlay, onComplete);
        }
    });

    snoozeBtn.addEventListener('click', () => _onSnooze(overlay, onSnooze));
}

// ─── SFIDA 3: Math ───────────────────────────────────────────────────────────

function _startMathChallenge(overlay, plan, multiplier, onComplete, onSnooze) {
    const { question, answer } = _generateMathProblem(plan, multiplier);

    overlay.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:8px">🧮</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin:0 0 8px">Risolvi il calcolo</h2>
        <p style="color:#9ca3af;text-align:center;margin:0 0 24px">Niente calcolatrice!</p>
        <div style="
            font-size:2.2rem;font-weight:800;color:#8b5cf6;
            background:#1e1040;padding:20px 40px;border-radius:16px;
            margin-bottom:24px;letter-spacing:2px;
        ">${question} = ?</div>
        <input id="ch-math-input" type="number" inputmode="numeric" placeholder="Risposta"
            style="
                width:100%;max-width:220px;padding:14px;text-align:center;
                font-size:1.5rem;font-weight:700;border-radius:14px;
                border:2px solid #4b3f72;background:#1e1040;color:#fff;
                outline:none;
            ">
        <div id="ch-math-error" style="color:#ef4444;margin-top:8px;min-height:20px"></div>
        <button id="ch-math-confirm" style="
            margin-top:16px;padding:14px 40px;background:#7c3aed;
            border:none;border-radius:14px;color:#fff;font-size:1rem;
            font-weight:700;cursor:pointer;
        ">Conferma</button>
    `;

    const input = overlay.querySelector('#ch-math-input');
    const error = overlay.querySelector('#ch-math-error');
    const confirm = overlay.querySelector('#ch-math-confirm');

    const snoozeBtn = _buildSnoozeBtn();
    overlay.appendChild(snoozeBtn);

    input.focus();

    const check = () => {
        const val = parseInt(input.value, 10);
        if (val === answer) {
            _onChallengeComplete(overlay, onComplete);
        } else {
            error.textContent = t('notif_wrong_answer');
            input.value = '';
            input.focus();
            setTimeout(() => { error.textContent = ''; }, 1500);
        }
    };

    confirm.addEventListener('click', check);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') check(); });
    snoozeBtn.addEventListener('click', () => _onSnooze(overlay, onSnooze));
}

function _generateMathProblem(plan, multiplier) {
    const hard = plan === 'free' || multiplier > 1;
    let a, b, op, answer;

    if (hard) {
        // Moltiplicazioni e sottrazioni con numeri più grandi
        const ops = ['+', '-', '×'];
        op = ops[Math.floor(Math.random() * ops.length)];
        if (op === '×') {
            a = Math.floor(Math.random() * 9) + 2;
            b = Math.floor(Math.random() * 9) + 2;
            answer = a * b;
        } else if (op === '-') {
            a = Math.floor(Math.random() * 50) + 20;
            b = Math.floor(Math.random() * 20) + 1;
            answer = a - b;
        } else {
            a = Math.floor(Math.random() * 50) + 10;
            b = Math.floor(Math.random() * 50) + 10;
            answer = a + b;
        }
    } else {
        // Somme semplici
        a = Math.floor(Math.random() * 20) + 5;
        b = Math.floor(Math.random() * 20) + 5;
        op = '+';
        answer = a + b;
    }

    return { question: `${a} ${op} ${b}`, answer };
}

// ─── SFIDA 4: Type ───────────────────────────────────────────────────────────

function _startTypeChallenge(overlay, plan, multiplier, onComplete, onSnooze) {
    const words = plan === 'free'
        ? ['STUDIARE', 'IMPEGNO', 'CERVELLO', 'MEMORIA', 'RIPASSO']
        : ['CORTEX', 'FOCUS', 'STUDIA'];
    const word = words[Math.floor(Math.random() * words.length)];

    overlay.innerHTML = `
        <div style="font-size:3.5rem;margin-bottom:8px">⌨️</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin:0 0 8px">Scrivi la parola</h2>
        <p style="color:#9ca3af;text-align:center;margin:0 0 24px">Dimostra che sei sveglio!</p>
        <div style="
            font-size:2rem;font-weight:800;color:#8b5cf6;
            letter-spacing:6px;margin-bottom:24px;
        ">${word}</div>
        <input id="ch-type-input" type="text" autocomplete="off" autocorrect="off"
            autocapitalize="characters" spellcheck="false"
            placeholder="Scrivi qui..."
            style="
                width:100%;max-width:280px;padding:14px;text-align:center;
                font-size:1.4rem;font-weight:700;letter-spacing:4px;
                border-radius:14px;border:2px solid #4b3f72;
                background:#1e1040;color:#fff;outline:none;
            ">
        <div id="ch-type-error" style="color:#ef4444;margin-top:8px;min-height:20px"></div>
    `;

    const input = overlay.querySelector('#ch-type-input');
    const error = overlay.querySelector('#ch-type-error');

    const snoozeBtn = _buildSnoozeBtn();
    overlay.appendChild(snoozeBtn);

    input.focus();

    input.addEventListener('input', () => {
        const val = input.value.toUpperCase().trim();
        if (val === word) {
            _onChallengeComplete(overlay, onComplete);
        } else if (val.length >= word.length) {
            error.textContent = 'Non è corretto, riprova! 😅';
            setTimeout(() => {
                input.value = '';
                error.textContent = '';
            }, 800);
        }
    });

    snoozeBtn.addEventListener('click', () => _onSnooze(overlay, onSnooze));
}

// ─── Completamento & Snooze ───────────────────────────────────────────────────

function _onChallengeComplete(overlay, onComplete) {
    overlay.innerHTML = `
        <div style="font-size:4rem;animation:pulse 0.5s ease">✅</div>
        <h2 style="font-size:1.6rem;font-weight:800;margin:16px 0 8px">Sei pronto!</h2>
        <p style="color:#9ca3af">Avvio sessione di studio...</p>
    `;
    setTimeout(() => {
        _closeOverlay();
        if (typeof onComplete === 'function') onComplete();
    }, 1200);
}

function _onSnooze(overlay, onSnooze) {
    const SNOOZE_MINUTES = 5;
    overlay.innerHTML = `
        <div style="font-size:3.5rem">⏰</div>
        <h2 style="font-size:1.4rem;font-weight:700;margin:16px 0 8px">Promemoria rimandato</h2>
        <p style="color:#9ca3af;text-align:center">
            Ti ricordo tra <strong style="color:#8b5cf6">${SNOOZE_MINUTES} minuti</strong>.
            <br>Non ti sfuggo! 😈
        </p>
    `;

    // Schedula notifica locale tra 5 minuti
    if (Notification.permission === 'granted') {
        setTimeout(() => {
            new Notification('⏰ Cortex — Ora di studiare!', {
                body: 'Hai rimandato prima. Adesso è il momento!',
                icon: '/pwa-192x192.png',
                tag: 'cortex-snooze',
            });
        }, SNOOZE_MINUTES * 60 * 1000);
    }

    setTimeout(() => {
        _closeOverlay();
        if (typeof onSnooze === 'function') onSnooze();
    }, 2000);
}

// ─── Init: rileva apertura da notifica ───────────────────────────────────────

/**
 * Da chiamare in main.js all'avvio.
 * Se l'app è stata aperta da una notifica, mostra la sfida.
 */
export function checkAndShowChallengeOnLaunch() {
    const params = new URLSearchParams(window.location.search);
    if (params.get('challenge') !== '1') return;

    // Rimuovi il param dall'URL senza ricaricare
    const url = new URL(window.location.href);
    url.searchParams.delete('challenge');
    history.replaceState({}, '', url.toString());

    const isPro = ['student_monthly', 'student_yearly'].includes(localStorage.getItem('cortex_plan'));
    const streakDays = parseInt(localStorage.getItem('cortex_streak') || '0', 10);

    // Piccolo delay per far caricare l'app prima
    setTimeout(() => {
        showChallenge({
            type: 'random',
            isPro,
            streakDays,
            onComplete: () => {
                // Apre direttamente la sessione di studio
                if (typeof window.startStudySession === 'function') {
                    window.startStudySession();
                }
            },
            onSnooze: () => {
                // Torna alla home
            },
        });
    }, 800);
}
