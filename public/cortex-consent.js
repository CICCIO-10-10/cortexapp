/* Centralized analytics consent. Optional trackers are not downloaded before opt-in. */
(function () {
  'use strict';
  var KEY = 'cortex_cookie_consent';
  var GA_ID = 'G-DFJ42477QK';
  var CLARITY_ID = 'y5ldvczo6y';
  var clarityLoaded = false;
  var gaLoaded = false;

  function optedOut() {
    try {
      if (new URLSearchParams(location.search).get('notrack') === '1') {
        localStorage.setItem('cortex_no_track', '1');
      }
      return localStorage.getItem('cortex_no_track') === '1';
    } catch (_) { return true; }
  }

  function hasConsent() {
    try { return localStorage.getItem(KEY) === 'accepted' && !optedOut(); }
    catch (_) { return false; }
  }

  window.cortexHasAnalyticsConsent = hasConsent;

  function loadClarity() {
    if (clarityLoaded) return;
    clarityLoaded = true;
    var c = window.clarity = window.clarity || function () {
      (c.q = c.q || []).push(arguments);
    };
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/' + CLARITY_ID;
    document.head.appendChild(script);
    c('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
  }

  function loadGoogleAnalytics() {
    if (gaLoaded) return;
    gaLoaded = true;
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
    window.gtag('consent', 'default', {
      analytics_storage: 'granted',
      ad_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied'
    });
    window.gtag('js', new Date());
    window.gtag('config', GA_ID);
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(script);
  }

  function startOptionalAnalytics() {
    if (!hasConsent()) return;
    loadClarity();
    loadGoogleAnalytics();
    try { window.__cxStartTelemetry?.(); } catch (_) {}
  }

  window.cortexSetCookieConsent = function (choice) {
    if (choice !== 'accepted' && choice !== 'declined') return;
    try { localStorage.setItem(KEY, choice); } catch (_) {}
    var banner = document.getElementById('cortex-consent-banner');
    if (banner) banner.remove();

    if (choice === 'accepted') {
      startOptionalAnalytics();
      return;
    }

    // Stop future first-party events immediately. Reloading tears down optional SDKs
    // already loaded after a previous opt-in, so they cannot keep recording this page.
    window.__cortexTrackingDisabled = true;
    try {
      if (typeof window.clarity === 'function') {
        window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' });
      }
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: 'denied', ad_storage: 'denied',
          ad_user_data: 'denied', ad_personalization: 'denied'
        });
      }
    } catch (_) {}
    if (clarityLoaded || gaLoaded) location.reload();
  };

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
        '🍪 Cortex usa cookie tecnici essenziali. Con il consenso abilitiamo gli strumenti analitici ' +
        'facoltativi per migliorare il servizio. ' +
        '<a href="/privacy" target="_blank" rel="noopener" style="color:#a78bfa;text-decoration:underline;">Privacy Policy</a></p>' +
        '<div style="display:flex;gap:10px;flex-shrink:0;">' +
        '<button type="button" data-c="declined" style="padding:8px 16px;background:transparent;border:1px solid #3a3a55;' +
        'border-radius:10px;color:#b9b9d0;font:inherit;font-size:13.5px;cursor:pointer;">Solo essenziali</button>' +
        '<button type="button" data-c="accepted" style="padding:8px 16px;border:none;border-radius:10px;color:#fff;' +
        'font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;background:linear-gradient(135deg,#7c3aed,#a855f7);">' +
        'Accetta analisi facoltative</button></div>';
      d.addEventListener('click', function (event) {
        var target = event.target;
        var choice = target && target.getAttribute && target.getAttribute('data-c');
        if (choice) window.cortexSetCookieConsent(choice);
      });
      document.body.appendChild(d);
    } catch (_) {}
  }

  if (hasConsent()) startOptionalAnalytics();
  var consentChoice = null;
  try { consentChoice = localStorage.getItem(KEY); } catch (_) {}
  if (!consentChoice) {
    if (/^\/app(?:\.html)?(?:\/|$)/.test(location.pathname)) return; // app banner managed by modules/gdpr.js
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mostraBanner);
    else mostraBanner();
  }
})();
