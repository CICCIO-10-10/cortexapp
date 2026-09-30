/**
 * core/journey.js — Registro percorso PER-VISITATORE (guest inclusi), da oggi in avanti.
 * Scrive su Firestore:  journeys/{vid}  (riassunto)  +  journeys/{vid}/events  (ogni passo).
 * Cattura: da dove arriva (sorgente 1° tocco), da dove entra (pagina), ogni evento del
 * funnel, tempo-on (last_seen), e l'uscita. Fail-open: try/catch ovunque, non rompe l'app.
 * Rispetta cortex_no_track. Aggancio globale: window.__cxLogStep(type, meta).
 */
(function () {
  'use strict';
  var LS_VID = 'cx_vid', LS_SRC = 'cx_src0', LS_CAMPAIGN = 'cx_campaign0', SS_SESS = 'cx_sess';
  var ANDROID_TWA_REFERRER = /^android-app:\/\/app\.web\.cortex_app\.twa(?:\/|$)/i;
  var queue = [], started = false, ticks = 0;
  var diagnostics = { version: 3, delivered: 0, failed: 0, pending: 0 };
  window.__cxJourneyDiagnostics = diagnostics;

  function noTrack(){ try { return localStorage.getItem('cortex_cookie_consent') !== 'accepted' || localStorage.getItem('cortex_no_track') === '1' || window.__cortexTrackingDisabled === true; } catch (_) { return true; } }
  function uuid(){ try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (_) {} return 'v-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10); }
  function vid(){ try { var v = localStorage.getItem(LS_VID); if (!v) { v = uuid(); localStorage.setItem(LS_VID, v); } return v; } catch (_) { return 'nostore-' + uuid(); } }

  function source(){
    try {
      var s = localStorage.getItem(LS_SRC); if (s) return s;
      var qs = new URLSearchParams(location.search); s = qs.get('utm_source') || qs.get('src');
      if (!s) { var r = document.referrer || '';
        // The package referrer identifies the installed TWA, not the acquisition campaign.
        // Keep Play Store installs separate in Play Console; do not infer that attribution here.
        if (ANDROID_TWA_REFERRER.test(r)) s = 'android_twa';
        else if (!r) s = 'diretto';
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
  function campaign(){
    try {
      var c = localStorage.getItem(LS_CAMPAIGN);
      if (!c) c = new URLSearchParams(location.search).get('utm_campaign') || '';
      c = String(c).trim().replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
      if (c) try { localStorage.setItem(LS_CAMPAIGN, c); } catch (_) {}
      return c;
    } catch (_) { return ''; }
  }
  function platform(){
    try {
      var ua = navigator.userAgent || '';
      var ref = document.referrer || '';
      if (ANDROID_TWA_REFERRER.test(ref)) return 'android_twa';
      if (/iPad|Tablet/i.test(ua)) return 'tablet_web';
      if (/Android/i.test(ua)) return 'android_web';
      if (/iPhone|iPod|Mobile/i.test(ua)) return 'mobile_web';
      return 'desktop_web';
    } catch (_) { return 'unknown'; }
  }
  function flush(){
    if(noTrack()){queue=[];diagnostics.pending=0;return;}
    if(!queue.length || typeof window.__cxSendTelemetry!=='function')return;
    var batch=queue.splice(0,queue.length);diagnostics.pending+=batch.length;
    batch.forEach(function(e){var eventId=e.id||(e.id=uuid());
      Promise.resolve().then(function(){return window.__cxSendTelemetry({visitor:vid(),eventId:eventId,type:e.type,page:e.page,meta:e.meta});})
      .then(function(){diagnostics.delivered++;},function(){diagnostics.failed++;e.attempts=(e.attempts||0)+1;if(e.attempts<3&&!noTrack())queue.push(e);})
      .finally(function(){diagnostics.pending--;});
    });
  }
  function logStep(type, meta){
    if (noTrack() || !type) return;
    try {
      var details = (meta && typeof meta === 'object') ? Object.assign({}, meta) : {};
      details.platform = platform();
      details.acquisition_source = source();
      var camp = campaign(); if (camp) details.acquisition_campaign = camp;
      queue.push({ type: String(type).slice(0, 60), page: location.pathname, meta: details, t: Date.now() });
      flush();
    } catch (_) {}
  }
  function start(){
    if(started||noTrack()||typeof window.__cxSendTelemetry!=='function')return;started=true;
    var newSess=false;try{newSess=!sessionStorage.getItem(SS_SESS);if(newSess)sessionStorage.setItem(SS_SESS,uuid());}catch(_){}
    logStep(newSess?'session_start':'session_resume',{entry:location.pathname,source:source()});
  }

  try { window.__cxLogStep = logStep; } catch (_) {}
  try { window.__cxGetPlatform = platform; window.__cxGetSource = source; window.__cxGetCampaign = campaign; } catch (_) {}

  setInterval(function () {
    ticks++;
    if (!started) start();
    flush();
    if(started&&!noTrack()&&document.visibilityState==='visible'&&ticks%7===0)logStep('heartbeat');
  }, 3000);

  try { document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') logStep('leave', { path: location.pathname }); }); } catch (_) {}
  try {
    if (document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(start, 300);
    else document.addEventListener('DOMContentLoaded', function () { setTimeout(start, 300); });
  } catch (_) {}
})();
