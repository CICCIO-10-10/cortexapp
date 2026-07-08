import { TRANSLATIONS } from '../data/translations.js';
const _t = () => TRANSLATIONS[localStorage.getItem('mm_lang')||'it'] || TRANSLATIONS.it;
/**
 * modules/pomodoro.js — Phase 21
 *
 * Timer Pomodoro: modalità studio/pausa, soundscapes, quotes motivazionali.
 * Estratto da main.js (POMODORO TIMER block + saveTimerSettings).
 *
 * Esporta: pomoModes, pomoState (oggetti live), init,
 *          openPomodoro, closePomodoro, togglePomodoro, resetPomodoro,
 *          setPomoMode, setSoundscape, handleSoundscape, stopSoundscape,
 *          updatePomoDisplay, saveTimerSettings
 */

// ── Stato condiviso (esportato per main.js: openSettings, applySavedSettings) ─

export let pomoModes = {
    work:  { label: '🍅 Sessione di Studio', mins: 25, color: '#7c6af7' },
    short: { get label() { return (_t().pomo_break_short||'☕ Pausa Caffè'); },        mins: 5,  color: '#10b981' },
    long:  { get label() { return (_t().pomo_break_long||'🌿 Pausa Lunga'); },        mins: 15, color: '#f59e0b' },
};

export let pomoState = {
    mode: 'work', running: false,
    seconds: 25 * 60, sessionCount: 1,
    interval: null, sound: null,
};

// ── Dependency injection ──────────────────────────────────────────────────────

let _deps = { showToast: () => {} };

export function init(deps) { _deps = { ..._deps, ...deps }; }

// ── Quotes motivazionali ──────────────────────────────────────────────────────

const QUOTES = [
    "\"Il successo non è definitivo, il fallimento non è fatale: ciò che conta è il coraggio di andare avanti.\" — Winston Churchill",
    "\"Non ho fallito. Ho solo trovato 10.000 modi che non funzionano.\" — Thomas Edison",
    "\"La tua mente deve diventare più forte dei tuoi sentimenti. Domina l'istinto di mollare.\"",
    "\"Non stai studiando per passare un esame. Stai studiando per gestire un impero.\"",
    "\"Un guerriero non è colui che non ha paura, ma colui che la domina.\"",
    "\"L'unico limite alla nostra realizzazione di domani saranno i nostri dubbi di oggi.\"",
    "\"Fai oggi quello che gli altri non faranno, così domani potrai fare quello che gli altri non potranno.\"",
    "\"Il dolore dello studio è temporaneo. Il rimpianto della mediocrità è per sempre.\"",
    "\"Sii ossessionato o sarai mediocre. Non esiste via di mezzo per la grandezza.\"",
    "\"Il futuro appartiene a coloro che credono nella bellezza dei propri sogni.\" — Eleanor Roosevelt",
    "\"Memento Audere Semper: Ricorda di osare sempre.\"",
    "\"Alea Iacta Est: Il dado è tratto. Ora non si torna indietro.\"",
    "\"Per aspera ad astra: Attraverso le asperità, fino alle stelle.\"",
    "\"Chi ha un perché abbastanza forte, può superare qualsiasi come.\" — Friedrich Nietzsche",
    "\"La disciplina è scegliere tra ciò che vuoi ora e ciò che vuoi di più.\""
];

function updatePomoQuote() {
    const quoteEl    = document.getElementById('pomo-quote');
    const container  = document.getElementById('pomo-quote-container');
    if (!quoteEl) return;
    container.style.opacity = '0';
    setTimeout(() => {
        quoteEl.innerText = QUOTES[Math.floor(Math.random() * QUOTES.length)];
        container.style.opacity = '1';
    }, 500);
}

// ── Soundscapes via YouTube embed ─────────────────────────────────────────────

// Video ID YouTube per ogni preset (ambient/lofi di lunga durata, sempre disponibili)
const SOUNDSCAPES_YT = {
    lofi:   'jfKfPfyJRdk',  // Lofi Girl 24/7 live
    rain:   'nDq6TstdEi8',  // 10h rain sounds
    forest: 'xNN7iTA57jM',  // 8h forest ambience
    waves:  'bn9F19Hi1Lk',  // 8h ocean waves
};

let _currentYTId   = null;
let _ytFrameReady  = false;

function _getOrCreateYTFrame() {
    let iframe = document.getElementById('cortex-yt-iframe');
    if (!iframe) {
        iframe = document.createElement('iframe');
        iframe.id = 'cortex-yt-iframe';
        iframe.allow = 'autoplay; encrypted-media';
        iframe.style.cssText =
            'position:fixed;bottom:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:none;';
        document.body.appendChild(iframe);
    }
    return iframe;
}

function _loadYT(videoId) {
    if (!videoId) return;
    _currentYTId  = videoId;
    _ytFrameReady = false;
    const iframe  = _getOrCreateYTFrame();
    iframe.src    = `https://www.youtube.com/embed/${videoId}?autoplay=0&loop=1&playlist=${videoId}&enablejsapi=1&controls=0&rel=0`;
    // Aspetta che l'iframe sia pronto prima di inviare comandi
    iframe.onload = () => { _ytFrameReady = true; };
}

function _ytCmd(fn) {
    const iframe = document.getElementById('cortex-yt-iframe');
    if (!iframe || !iframe.src || !iframe.src.includes('youtube')) return;
    try {
        iframe.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: fn, args: [] }), '*'
        );
    } catch (e) { /* cross-origin silenced */ }
}

function _ytPlay()  { _ytCmd('playVideo');  }
function _ytPause() { _ytCmd('pauseVideo'); }
function _ytStop()  {
    _ytCmd('stopVideo');
    const iframe = document.getElementById('cortex-yt-iframe');
    if (iframe) iframe.src = '';
    _currentYTId  = null;
    _ytFrameReady = false;
}

export function handleSoundscape() {
    const activeBtn = document.querySelector('.sound-item.active');
    const sound     = activeBtn ? activeBtn.dataset.sound : 'none';

    if (sound === 'none') {
        _ytStop();
        return;
    }

    // Determina il video ID (preset o custom)
    const videoId = sound === 'custom'
        ? (localStorage.getItem('cortex_focus_yt_id') || null)
        : (SOUNDSCAPES_YT[sound] || null);

    if (!videoId) return;

    if (videoId !== _currentYTId) {
        _loadYT(videoId);
    }

    if (pomoState.running) {
        // Piccolo delay per dare tempo all'iframe di caricarsi
        setTimeout(_ytPlay, 800);
    }
}

export function setSoundscape(mode) {
    document.querySelectorAll('.sound-item').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.sound === mode);
    });

    // Mostra/nascondi input YouTube custom
    const ytInput = document.getElementById('pomo-yt-input-wrap');
    if (ytInput) ytInput.style.display = mode === 'custom' ? 'flex' : 'none';

    handleSoundscape();
}

export function stopSoundscape() { _ytPause(); }

// ── YouTube custom link ───────────────────────────────────────────────────────

export function applyYouTubeLink() {
    const input   = document.getElementById('pomo-yt-url');
    if (!input) return;
    const url     = input.value.trim();
    const videoId = _extractYTId(url);
    if (!videoId) {
        _deps.showToast('❌ Link YouTube non valido', 'error');
        return;
    }
    localStorage.setItem('cortex_focus_yt_id', videoId);
    _loadYT(videoId);
    if (pomoState.running) setTimeout(_ytPlay, 800);
    _deps.showToast('🎵 YouTube caricato!', 'success');
}

function _extractYTId(url) {
    const patterns = [
        /[?&]v=([^&#]+)/,
        /youtu\.be\/([^?&#]+)/,
        /embed\/([^?&#]+)/,
        /shorts\/([^?&#]+)/,
    ];
    for (const p of patterns) {
        const m = url.match(p);
        if (m) return m[1];
    }
    return null;
}

// ── Timer core ────────────────────────────────────────────────────────────────

function pomodoroTick() {
    if (pomoState.seconds <= 0) {
        clearInterval(pomoState.interval);
        pomoState.running = false;
        document.getElementById('pomo-play-btn').textContent = (_t().pomo_start||'▶ Inizia');
        if (pomoState.mode === 'work') {
            pomoState.sessionCount++;
            const nextMode = pomoState.sessionCount % 4 === 0 ? 'long' : 'short';
            setPomoMode(nextMode);
        } else {
            setPomoMode('work');
        }
        try { new Audio('data:audio/wav;base64,UklGRl9vT19XQVZFZm10IBAAAA').play(); } catch (e) { }
        _deps.showToast('⏱️ Pomodoro completato! Vai alla prossima fase.', 'success');
        return;
    }
    pomoState.seconds--;
    updatePomoDisplay();
    if (pomoState.mode === 'work' && pomoState.seconds > 0 && pomoState.seconds % 60 === 0) {
        updatePomoQuote();
    }
    if (pomoState.mode === 'work' && pomoState.sessionCount >= 2 && pomoState.seconds === 0) {
        document.getElementById('bio-break-msg').style.display = 'block';
        setTimeout(() => { document.getElementById('bio-break-msg').style.display = 'none'; }, 120000);
    }
}

export function pomodoroToggle() {
    const btn = document.getElementById('pomo-play-btn');
    if (pomoState.running) {
        clearInterval(pomoState.interval);
        pomoState.running = false;
        btn.innerHTML = (_t().pomo_start||'▶ Inizia');
        _ytPause();
    } else {
        pomoState.running = true;
        btn.innerHTML = (_t().pomo_pause||'⏸ Pausa');
        updatePomoQuote();
        pomoState.interval = setInterval(pomodoroTick, 1000);
        handleSoundscape(); // carica e fa partire il video se c'è un soundscape attivo
    }
}

export function pomodoroReset() {
    clearInterval(pomoState.interval);
    pomoState.running = false;
    pomoState.seconds = pomoModes[pomoState.mode].mins * 60;
    document.getElementById('pomo-play-btn').textContent = (_t().pomo_start||'▶ Inizia');
    updatePomoDisplay();
}

export function setPomoMode(mode) {
    clearInterval(pomoState.interval);
    pomoState.running = false;
    pomoState.mode    = mode;
    pomoState.seconds = pomoModes[mode].mins * 60;
    document.getElementById('pomo-play-btn').textContent   = (_t().pomo_start||'▶ Inizia');
    document.getElementById('pomo-mode-label').textContent = pomoModes[mode].label;
    document.getElementById('pomo-session-count').textContent = `Sessione ${pomoState.sessionCount}`;
    document.getElementById('pomo-ring').style.stroke = pomoModes[mode].color;
    ['work', 'short', 'long'].forEach(m => {
        document.getElementById('phase-' + m).classList.toggle('active', m === mode);
    });
    updatePomoDisplay();
}

export function updatePomoDisplay() {
    const m      = Math.floor(pomoState.seconds / 60);
    const s      = pomoState.seconds % 60;
    const timeEl = document.getElementById('pomo-time');
    if (timeEl) timeEl.textContent = `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    const ringEl = document.getElementById('pomo-ring');
    if (ringEl) {
        const total = pomoModes[pomoState.mode].mins * 60;
        const frac  = pomoState.seconds / total;
        const circ  = 326.7;
        ringEl.style.strokeDashoffset = circ * (1 - frac);
    }
}

// ── Open / Close ──────────────────────────────────────────────────────────────

export function openPomodoro() {
    const overlay = document.getElementById('pomo-overlay');
    overlay.style.display = 'flex';
    document.body.style.overflow = 'hidden'; // blocca scroll + copre nav mobile
    updatePomoDisplay();
    document.getElementById('pomo-mode-label').textContent = pomoModes[pomoState.mode].label;
    document.getElementById('phase-work').textContent  = `🍅 Lavoro (${pomoModes.work.mins}')`;
    document.getElementById('phase-short').textContent = `${_t().pomo_break_short||'☕ Pausa'} (${pomoModes.short.mins}')`;
    document.getElementById('phase-long').textContent  = `${_t().pomo_break_long||'🌿 Pausa lunga'} (${pomoModes.long.mins}')`;
    const elem = document.documentElement;
    if (elem.requestFullscreen) {
        elem.requestFullscreen().catch(() => {});
    } else if (elem.webkitRequestFullscreen) {
        elem.webkitRequestFullscreen();
    } else if (elem.msRequestFullscreen) {
        elem.msRequestFullscreen();
    }
}

export function closePomodoro() {
    document.getElementById('pomo-overlay').style.display = 'none';
    document.body.style.overflow = ''; // ripristina scroll
    stopSoundscape();
    if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
    }
}

// Alias chiamati dal registry
export function togglePomodoro() { pomodoroToggle(); }
export function resetPomodoro()  { pomodoroReset(); }

// ── Settings ──────────────────────────────────────────────────────────────────

export function saveTimerSettings() {
    const w = parseInt(document.getElementById('pomo-work-mins').value)  || 25;
    const s = parseInt(document.getElementById('pomo-short-mins').value) || 5;
    const l = parseInt(document.getElementById('pomo-long-mins').value)  || 15;
    pomoModes.work.mins  = w;
    pomoModes.short.mins = s;
    pomoModes.long.mins  = l;
    localStorage.setItem('mm_pomo_durations', JSON.stringify({ work: w, short: s, long: l }));
    if (!pomoState.running) {
        pomoState.seconds = pomoModes[pomoState.mode].mins * 60;
        updatePomoDisplay();
    }
    _deps.showToast('⏱️ Durate timer aggiornate!','success');
}
