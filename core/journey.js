/**
 * core/journey.js — Registro percorso PER-VISITATORE (guest inclusi), da oggi in avanti.
 * Scrive su Firestore:  journeys/{vid}  (riassunto)  +  journeys/{vid}/events  (ogni passo).
 * Cattura: da dove arriva (sorgente 1° tocco), da dove entra (pagina), ogni evento del
 * funnel, tempo-on (last_seen), e l'uscita. Fail-open: try/catch ovunque, non rompe l'app.
 * Rispetta cortex_no_track. Aggancio globale: window.__cxLogStep(type, meta).
 */
(function () {
  'use strict';
  var LS_VID = 'cx_vid', LS_SRC = 'cx_src0', SS_SESS = 'cx_sess';
  var queue = [], started = false, ticks = 0;

  function noTrack(){ try { return localStorage.getItem('cortex_no_track') === '1'; } catch (_) { return false; } }
  function uuid(){ try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {} return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function vid(){ try { var v = localStorage.getItem(LS_VID); if (!v) { v = uuid(); localStorage.setItem(LS_VID, v); } return v; } catch (_) { return 'nostore-' + uuid(); } }

  function source(){
    try {
      var s = localStorage.getItem(LS_SRC); if (s) return s;
      var qs = new URLSearchParams(location.search); s = qs.get('utm_source') || qs.get('src');
      if (!s) { var r = document.referrer || '';
        if (!r) s = 'diretto';
        else if (/tiktok/i.test(r)) s = 'tiktok';
        else if (/instagram/i.test(r)) s = 'instagram';
        else if (/youtube/i.test(r)) s = 'youtube';
        else if (/google\./i.test(r)) s = 'google';
        else if (/reddit/i.test(r)) s = 'reddit';
        else if (/cortexapp\.it/i.test(r)) s = 'interno';
        else s = 'referral';
      }
      s = String(s).slice(0, 40); try { localStorage.setItem(LS_SRC, s); } catch (_) {} return s;
    } catch (_) { return 'n/d'; }
  }
  function db(){ try { if (typeof firebase !== 'undefined' && firebase.apps && firebase.apps.length) return firebase.app().firestore(); } catch (_) {} return null; }

  function flush(){
    if (!queue.length) return; var d = db(); if (!d) return;
    var FV = firebase.firestore.FieldValue, id = vid(), col = d.collection('journeys').doc(id).collection('events');
    var batch = queue.splice(0, queue.length);
    batch.forEach(function (e) { try { col.add({ type: e.type, page: e.page, meta: e.meta || null, ts: FV.serverTimestamp(), t_client: e.t }); } catch (_) {} });
    try { d.collection('journeys').doc(id).set({ vid: id, last_seen: FV.serverTimestamp() }, { merge: true }); } catch (_) {}
  }
  function logStep(type, meta){
    if (noTrack() || !type) return;
    try { queue.push({ type: String(type).slice(0, 60), page: location.pathname, meta: (meta && typeof meta === 'object') ? meta : null, t: Date.now() }); flush(); } catch (_) {}
  }
  function start(){
    if (started || noTrack()) return; var d = db(); if (!d) return; started = true;
    try {
      var FV = firebase.firestore.FieldValue, id = vid(), newSess = false;
      try { newSess = !sessionStorage.getItem(SS_SESS); if (newSess) sessionStorage.setItem(SS_SESS, uuid()); } catch (_) {}
      d.collection('journeys').doc(id).set({
        vid: id, source: source(), referrer: (document.referrer || '').slice(0, 200),
        entry: location.pathname, ua: (navigator.userAgent || '').slice(0, 200),
        first_seen: FV.serverTimestamp(), last_seen: FV.serverTimestamp()
      }, { merge: true });
      logStep(newSess ? 'session_start' : 'session_resume', { entry: location.pathname, source: source() });
    } catch (_) {}
  }

  try { window.__cxLogStep = logStep; } catch (_) {}

  setInterval(function () {
    ticks++;
    if (!started) start();
    flush();
    try { if (started && document.visibilityState === 'visible' && ticks % 7 === 0) { var d = db(); if (d) d.collection('journeys').doc(vid()).set({ last_seen: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true }); } } catch (_) {}
  }, 3000);

  try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') logStep('leave', { path: location.pathname }); }); } catch (_) {}
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(start, 300);
    else document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 300); });
  } catch (_) {}
})();
