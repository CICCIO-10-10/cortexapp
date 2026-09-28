/* Guest telemetry goes through a bounded server endpoint, never direct database writes. */
(function(){
  'use strict';
  if(window.__cxSendTelemetry)return;
  function id(){return (window.crypto&&crypto.randomUUID)?crypto.randomUUID():'v-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,12);}
  function optedOut(){try{return localStorage.getItem('cortex_no_track')==='1'||new URLSearchParams(location.search).get('notrack')==='1';}catch(_){return true;}}
  function visitor(){var v=localStorage.getItem('cx_vid');if(!v){v=id();localStorage.setItem('cx_vid',v);}return v;}
  function source(){var s=localStorage.getItem('cx_src0');if(!s){var p=new URLSearchParams(location.search),r=document.referrer||'';s=p.get('utm_source')||p.get('src')||(!r?'direct':/tiktok/i.test(r)?'tiktok':/instagram/i.test(r)?'instagram':/google\./i.test(r)?'google':'referral');s=String(s).slice(0,40);localStorage.setItem('cx_src0',s);}return s;}
  window.__cxSendTelemetry=function(event){
    if(optedOut()||!/^https:\/\/(www\.)?cortexapp\.it$|^https:\/\/cortex-(74a4e|app)\.(web\.app|firebaseapp\.com)$/.test(location.origin))return Promise.resolve();
    var payload=Object.assign({visitor:visitor(),eventId:id(),page:location.pathname,source:source(),referrer:document.referrer||''},event);
    return fetch('/api/telemetry',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload),keepalive:true}).then(function(r){if(!r.ok)throw new Error('Telemetry '+r.status);});
  };
  try{if(!optedOut()&&!/^\/app(?:\.html)?\/?$/.test(location.pathname))window.__cxSendTelemetry({type:'landing_view'}).catch(function(){});}catch(_){}
})();
