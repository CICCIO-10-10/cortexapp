import { TRANSLATIONS } from '../data/translations.js';

let gLang = localStorage.getItem('mm_lang') || 'it';

document.addEventListener('DOMContentLoaded', () => {
    updateUIStrings();
});

export function t(key) {
    return (TRANSLATIONS[gLang] && TRANSLATIONS[gLang][key]) ??
           (TRANSLATIONS.it && TRANSLATIONS.it[key]) ??
           key;
}

export function updateUIStrings() {
    document.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (TRANSLATIONS[gLang] && TRANSLATIONS[gLang][key]) {
            el.textContent = TRANSLATIONS[gLang][key];
        }
    });
    if (TRANSLATIONS[gLang] && TRANSLATIONS[gLang].hero_title) {
        document.title = TRANSLATIONS[gLang].hero_title;
    }
    const flagMap = { it: 'it', en: 'gb', es: 'es', fr: 'fr', de: 'de' };
    const langNames = { it: 'Italiano', en: 'English', es: 'Español', fr: 'Français', de: 'Deutsch' };
    const langBtn = document.getElementById('lang-btn');
    if (langBtn) {
        const countryCode = flagMap[gLang] || 'it';
        langBtn.innerHTML = `<img src="https://flagcdn.com/w40/${countryCode}.png" style="width: 100%; height: 100%; object-fit: cover; opacity:0.9;" alt="${gLang}">`;
        langBtn.setAttribute('aria-label', `Lingua attuale: ${langNames[gLang] || gLang}. Clicca per cambiare.`);
    }
    document.querySelectorAll('.lang-option').forEach(btn => {
        const lang = btn.getAttribute('data-params')?.match(/"([^"]+)"/)?.[1] || '';
        if (lang && langNames[lang]) {
            btn.setAttribute('aria-label', `Seleziona ${langNames[lang]}`);
        }
    });
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn && !themeBtn.getAttribute('aria-label')) {
        themeBtn.setAttribute('aria-label', 'Cambia tema chiaro/scuro');
    }
}

export function changeLanguage(langCode) {
    if (langCode) {
        gLang = langCode;
    } else {
        gLang = document.getElementById('select-lang') ? document.getElementById('select-lang').value : gLang;
    }
    localStorage.setItem('mm_lang', gLang);
    updateUIStrings();
    const flagMap = { it: 'it', en: 'gb', es: 'es', fr: 'fr', de: 'de' };
    const langBtn = document.getElementById('lang-btn');
    if (langBtn) {
        const countryCode = flagMap[gLang] || 'it';
        langBtn.innerHTML = `<img src="https://flagcdn.com/w40/${countryCode}.png" style="width: 100%; height: 100%; object-fit: cover; opacity:0.9;" alt="${gLang}">`;
    }
    const menu = document.getElementById('lang-menu');
    if (menu) menu.classList.remove('active');
    if (window.showToast && TRANSLATIONS[gLang] && TRANSLATIONS[gLang].toast_lang_changed) {
        window.showToast(TRANSLATIONS[gLang].toast_lang_changed, 'info');
    }
    window.dispatchEvent(new CustomEvent('cortex:lang-changed', { detail: { lang: gLang } }));
    // Re-render home se attiva (home-root invece di section-home che non esiste)
    if (typeof window.renderHome === 'function') {
        const homeRoot = document.getElementById('home-root');
        if (homeRoot) {
            window.renderHome();
        }
    }
    // Re-render audio page se attiva
    if (typeof window.showPage === 'function' && location.pathname === '/lezioni') {
        window.showPage('audio');
    }
}

export function getCurrentLang() { return gLang; }

window.cortexUpdateUIStrings = updateUIStrings;

export function toggleLangMenu() {
    document.getElementById('lang-menu').classList.toggle('active');
}

document.addEventListener('click', (e) => {
    if (!e.target.closest('.lang-selector-wrap')) {
        const menu = document.getElementById('lang-menu');
        if (menu) menu.classList.remove('active');
    }
});
