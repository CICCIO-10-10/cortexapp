'use strict';
const {hash, ORIGINS} = require('./security');
function validateEvent(body) {
  if (!body || typeof body !== 'object' || JSON.stringify(body).length > 8192) return null;
  const {visitor, eventId, type} = body;
  if (![visitor,eventId].every(v=>typeof v==='string' && /^[a-zA-Z0-9_-]{1,100}$/.test(v)) || typeof type!=='string' || !/^[a-zA-Z0-9_-]{1,60}$/.test(type)) return null;
  const text=(v,n)=>typeof v==='string'?v.slice(0,n):'';
  const source=text(body.source,40).toLowerCase().replace(/[^a-z0-9_-]/g,'_') || 'direct';
  const meta={};
  const allowed=new Set(['count','card_count','flow','step','reason','duration','duration_ms','score','correct','total','source','entry','tracking_version','deck_id','type','mode','success','format','status','error_code']);
  for(const [k,v] of Object.entries(body.meta && typeof body.meta==='object' ? body.meta : {}))if(allowed.has(k) && (typeof v==='string'||typeof v==='boolean'||(typeof v==='number'&&Number.isFinite(v))))meta[k]=typeof v==='string'?v.slice(0,160):v;
  return {visitor,eventId,type,page:text(body.page,120).split(/[?#]/)[0],source,referrer:text(body.referrer,200).split(/[?#]/)[0],meta};
}
function handler({db,admin,secret,now=()=>Date.now(),ipRateLimit}) {
 return async (req,res)=>{
  res.set('Cache-Control','no-store');res.set('Vary','Origin');
  if(ORIGINS.has(req.headers.origin))res.set('Access-Control-Allow-Origin',req.headers.origin);
  if(req.method==='OPTIONS'){res.set('Access-Control-Allow-Methods','POST');res.set('Access-Control-Allow-Headers','Content-Type');res.status(204).send('');return;}
  if(req.method!=='POST'){res.status(405).json({error:'Method not allowed'});return;}
  if(req.headers.origin && !ORIGINS.has(req.headers.origin)){res.status(403).json({error:'Origin not allowed'});return;}
  const event=validateEvent(req.body);if(!event){res.status(400).json({error:'Invalid event'});return;}
  const ip=req.ip || req.socket?.remoteAddress || 'unknown';
  if(!ipRateLimit(ip,{maxRequests:120,windowMs:60000})){res.status(429).json({error:'Rate limited'});return;}
  const salt=secret();if(!salt){res.status(503).json({error:'Telemetry unavailable'});return;}
  const time=now(),minute=Math.floor(time/60000),day=Math.floor(time/864e5),client=hash(salt+'|'+ip);
  const rate=db.collection('_telemetryLimits').doc(client);
  const parent=db.collection('journeys').doc(event.visitor),record=parent.collection('events').doc(event.eventId);
  try{
   await db.runTransaction(async tx=>{
    const [r,existing,summary]=await Promise.all([tx.get(rate),tx.get(record),tx.get(parent)]);
    const limits=r.exists?r.data():{};
    const calls=limits.minute===minute?limits.calls:0,dayCalls=limits.day===day?limits.dayCalls:0;
    if(calls>=120||dayCalls>=2500){const e=new Error('Rate limited');e.limited=true;throw e;}
    tx.set(rate,{minute,day,calls:calls+1,dayCalls:dayCalls+1,expiresAt:new Date(time+2*864e5)});
    if(existing.exists)return; // Retry cannot overwrite an event or inflate totals.
    const stamp=admin.firestore.FieldValue.serverTimestamp();
    tx.create(record,{type:event.type,page:event.page,source:event.source,referrer:event.referrer,meta:event.meta,tracking_version:3,ts:stamp});
    tx.set(parent,{vid:event.visitor,last_seen:stamp,...(!summary.exists?{first_seen:stamp,source:event.source,entry:event.page,referrer:event.referrer}:{})},{merge:true});
    const pageGroup=/^\/app(?:\.html)?\/?$/.test(event.page)?'app':'landing';
    tx.set(db.collection('analytics').doc('presence').collection('sessions').doc(event.visitor),{page:pageGroup,path:event.page,source:event.source,lastSeen:stamp},{merge:true});
    if(['landing_view','session_start'].includes(event.type)){
      const date=new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(time));
      const page=event.type==='session_start'?'app':'landing';
      tx.set(db.collection('analytics').doc('pageviews_'+date),{[page]:admin.firestore.FieldValue.increment(1),['src_'+event.source]:admin.firestore.FieldValue.increment(1)},{merge:true});
    }
   });res.status(202).json({ok:true});
  }catch(e){res.status(e.limited?429:503).json({error:e.limited?'Rate limited':'Telemetry unavailable'});}
 };
}
module.exports={validateEvent,handler};
