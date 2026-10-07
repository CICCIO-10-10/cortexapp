/* 07/10/2026: link "App Android" nel piè di pagina, SOLO per chi visita da un telefono Android
   nel browser (non dentro l'app installata). Nessun popup: un link in più tra quelli del footer. */
(function () {
  try {
    if (!/Android/i.test(navigator.userAgent)) return;
    if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return;
    if (/^android-app:/.test(document.referrer)) return;
    var f = document.querySelector('footer');
    if (!f || f.querySelector('.cx-play-footer')) return;
    var page = location.pathname.replace(/^\//, '').replace(/\.html$/, '').slice(0, 60) || 'home';
    var a = document.createElement('a');
    a.className = 'cx-play-footer';
    a.href = 'https://play.google.com/store/apps/details?id=app.web.cortex_app.twa&referrer=' +
      encodeURIComponent('utm_source=sito&utm_medium=seo&utm_content=' + page);
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'App Android';
    var col = Array.prototype.filter.call(f.querySelectorAll('h4'), function (h) { return /cortex/i.test(h.textContent); })[0];
    if (col) { col.parentNode.appendChild(a); return; }
    var box = document.createElement('div');
    box.style.marginTop = '10px';
    box.appendChild(a);
    f.appendChild(box);
  } catch (_) {}
})();
