/*
 * cortex-consent.js (25/09/2026) — collega il consenso cookie a Microsoft Clarity.
 *
 * Dal 31/10/2025 Clarity, per i visitatori UE, senza un segnale di consenso gira
 * SENZA cookie: ogni pagina = sessione nuova e utente nuovo (imbuti landing → app
 * inutilizzabili, 0% utenti di ritorno). Qui:
 *  - se l'utente ha già scelto (chiave condivisa con l'app: cortex_cookie_consent)
 *    → manda clarity('consentv2', ...) con la sua scelta;
 *  - se non ha ancora scelto e NON siamo nell'app (che ha il suo banner) → mostra
 *    un piccolo banner con le stesse due scelte dell'app.
 * "Solo essenziali" = Clarity resta senza cookie (come oggi). Fail-safe: ogni
 * errore viene ignorato, la pagina non si rompe mai.
 */
(function () {
  var KEY = 'cortex_cookie_consent';

  function leggi() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }

  function inviaAClarity(scelta) {
    try {
      if (typeof window.clarity !== 'function') return;
      window.clarity('consentv2', {
        ad_Storage: 'denied',
        analytics_Storage: scelta === 'accepted' ? 'granted' : 'denied'
      });
    } catch (e) {}
  }

  // usata anche dal banner dell'app (modules/gdpr.js)
  window.cortexSetCookieConsent = function (scelta) {
    try { localStorage.setItem(KEY, scelta); } catch (e) {}
    inviaAClarity(scelta);
    var b = document.getElementById('cortex-consent-banner');
    if (b && b.parentNode) b.parentNode.removeChild(b);
  };

  var scelta = leggi();
  if (scelta) { inviaAClarity(scelta); return; }

  // Nell'app il banner lo mostra già modules/gdpr.js
  if (/^\/app(\.html)?(\/|$)/.test(location.pathname)) return;

  function mostraBanner() {
    try {
      if (document.getElementById('cortex-consent-banner')) return;
      var d = document.createElement('div');
      d.id = 'cortex-consent-banner';
      d.setAttribute('role', 'dialog');
      d.setAttribute('aria-label', 'Consenso cookie');
      d.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483000;' +
        'background:rgba(10,10,20,.97);border-top:1px solid rgba(124,106,247,.35);' +
        'padding:14px 18px;display:flex;align-items:center;justify-content:space-between;' +
        'gap:14px;flex-wrap:wrap;font-family:-apple-system,Segoe UI,Roboto,Arial,sans-serif;' +
        'box-shadow:0 -8px 40px rgba(0,0,0,.45);';
      d.innerHTML =
        '<p style="flex:1;min-width:230px;margin:0;font-size:13.5px;line-height:1.5;color:#e8e8f0;">' +
        '🍪 Cortex usa cookie tecnici essenziali per il funzionamento del sito e cookie analitici ' +
        'per migliorare l’esperienza. ' +
        '<a href="/privacy" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Privacy Policy</a></p>' +
        '<div style="display:flex;gap:10px;flex-shrink:0;">' +
        '<button type="button" data-c="declined" style="padding:8px 16px;background:transparent;border:1px solid #3a3a55;' +
        'border-radius:10px;color:#b9b9d0;font:inherit;font-size:13.5px;cursor:pointer;">Solo essenziali</button>' +
        '<button type="button" data-c="accepted" style="padding:8px 16px;border:none;border-radius:10px;color:#fff;' +
        'font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#a855f7);">' +
        'Accetta tutto ✓</button></div>';
      d.addEventListener('click', function (ev) {
        var t = ev.target && ev.target.getAttribute && ev.target.getAttribute('data-c');
        if (t) window.cortexSetCookieConsent(t);
      });
      document.body.appendChild(d);
    } catch (e) {}
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostraBanner);
  else mostraBanner();
})();
