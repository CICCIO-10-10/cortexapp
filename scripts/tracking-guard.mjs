// Transform the existing Clarity bootstrap without rewriting generated SEO sources.
export const clarityPrefix = '(function(c,l,a,r,i,t,y){';
export const clarityGuard = '/* cortex-clarity-guard */try{if(!/^(www\\.)?cortexapp\\.it$/.test(location.hostname)||new URLSearchParams(location.search).get("notrack")==="1"||localStorage.getItem("cortex_no_track")==="1")return;}catch(_){return;}';
export function guardTracking(html) { return html.includes(clarityGuard) ? html : html.replace(clarityPrefix, clarityPrefix + clarityGuard); }
export function stripTrackingGuard(html) { return html.replace(clarityGuard, ''); }
