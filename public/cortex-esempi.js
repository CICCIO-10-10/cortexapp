/* 13/10/2026 — Esempi TOLC come mini-esercizi.
   Prima le risposte degli esempi erano voci di elenco con la soluzione già segnata: sembravano cliccabili
   ma non facevano nulla (Clarity coihkb, 10/10: clic ripetuti su "120" e "180" in /tolc-e).
   Ora: scegli una risposta → vedi se è giusta, la soluzione e il "Perché", più il link alla prova veloce.
   Senza JavaScript la pagina resta com'era (soluzione visibile). Nessun dato inviato. */
(function () {
  'use strict';
  var m = location.pathname.match(/^\/(tolc-[a-z]+)(?:\.html)?\/?$/);
  var key = m ? m[1] : null;
  var nome = key ? key.toUpperCase() : 'TOLC';
  var link = '/app?guest=1&sim=' + (key || 'tolc') + (key ? '&veloce=1' : '') + '&utm_source=seo&utm_campaign=' + (key || 'quiz-logica') + '&utm_content=esempio';
  var css = document.createElement('style');
  css.textContent =
    '.cx-ex li{cursor:pointer;transition:border-color .15s,background .15s}' +
    '.cx-ex li:hover,.cx-ex li:focus-visible{border-color:rgba(168,85,247,.6);outline:none}' +
    '.cx-ex.cx-done li{cursor:default}' +
    '.cx-ex li.cx-ok{border-color:rgba(74,222,128,.6)!important;background:rgba(74,222,128,.10);color:#bbf7d0}' +
    '.cx-ex li.cx-no{border-color:rgba(248,113,113,.6)!important;background:rgba(248,113,113,.10);color:#fecaca}' +
    '.cx-ask{font-size:.85rem;color:rgba(255,255,255,.55);margin:10px 0 0}' +
    '.cx-esito{font-weight:700;margin:10px 0 4px}' +
    '.cx-go{display:inline-block;margin-top:8px;color:#c084fc;font-weight:700}';
  document.head.appendChild(css);

  function prepara(ul) {
    var items = ul.querySelectorAll(':scope > li');
    var ok = ul.querySelectorAll(':scope > li.ok');
    if (items.length < 2 || ok.length !== 1) return;
    var giusta = ok[0];
    giusta.classList.remove('ok');
    giusta.textContent = giusta.textContent.replace(/^\s*✅\s*/, '');
    // Spiegazione: <p><strong>Perché</strong> nelle pagine tolc-X, <div class="sol"> nel quiz di logica.
    var box = ul.parentNode, spieg = [];
    for (var el = ul.nextElementSibling; el; el = el.nextElementSibling) {
      if (el.matches('p') && /Perch/.test(el.textContent) && el.querySelector('strong')) spieg.push(el);
      else if (el.matches('.sol')) spieg.push(el);
      else break;
    }
    spieg.forEach(function (e) { e.hidden = true; });
    ul.classList.add('cx-ex');
    ul.setAttribute('role', 'list');
    var ask = document.createElement('p');
    ask.className = 'cx-ask';
    ask.textContent = 'Scegli una risposta: poi vedi la soluzione.';
    ul.parentNode.insertBefore(ask, ul);
    Array.prototype.forEach.call(items, function (li) {
      li.setAttribute('role', 'button');
      li.setAttribute('tabindex', '0');
      function scegli() {
        if (ul.classList.contains('cx-done')) return;
        ul.classList.add('cx-done');
        giusta.classList.add('cx-ok');
        giusta.textContent = '✅ ' + giusta.textContent;
        var esatta = li === giusta;
        if (!esatta) li.classList.add('cx-no');
        Array.prototype.forEach.call(items, function (x) { x.removeAttribute('tabindex'); x.removeAttribute('role'); });
        ask.className = 'cx-esito';
        ask.textContent = esatta ? 'Giusto!' : 'Non è questa: la risposta giusta è segnata in verde.';
        ask.style.color = esatta ? '#4ade80' : '#fca5a5';
        spieg.forEach(function (e) { e.hidden = false; });
        var go = document.createElement('a');
        go.className = 'cx-go';
        go.href = link;
        go.textContent = key ? 'Allenati con 10 domande come questa: prova veloce ' + nome + ' →' : 'Fai la simulazione a tempo →';
        (spieg.length ? spieg[spieg.length - 1] : ul).insertAdjacentElement('afterend', go);
      }
      li.addEventListener('click', scegli);
      li.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); scegli(); } });
    });
  }
  function avvia() { document.querySelectorAll('details > ul, .q > ul').forEach(prepara); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', avvia); else avvia();
})();
