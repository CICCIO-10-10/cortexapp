/* Local-only regression checks. Start Firestore emulator on 127.0.0.1:8189 first. */
'use strict';
process.env.FIRESTORE_EMULATOR_HOST = '127.0.0.1:8189';
const assert = require('node:assert/strict');
const {createRequire} = require('node:module');
const requireFunctions = createRequire(require.resolve('../functions/package.json'));
const {initializeApp} = requireFunctions('firebase-admin/app');
const {getFirestore, FieldValue, Timestamp} = requireFunctions('firebase-admin/firestore');
const {getAuth} = requireFunctions('firebase-admin/auth');
const {getMessaging} = requireFunctions('firebase-admin/messaging');
const admin = {
  initializeApp,
  firestore: Object.assign(() => getFirestore(), {FieldValue, Timestamp}),
  auth: () => getAuth(),
  messaging: () => getMessaging(),
};
const security = require('../functions/security');
const {handler} = require('../functions/telemetry');
const project = 'demo-cortex-security';
admin.initializeApp({projectId:project});
const db = admin.firestore();
const root = `projects/${project}/databases/(default)/documents`;
const base = `http://127.0.0.1:8189/v1/${root}`;
const run = Date.now().toString(36);
let checks = 0;
function jwt(uid, claims={}) {
  const now = Math.floor(Date.now()/1000);
  return [Buffer.from(JSON.stringify({alg:'none',typ:'JWT'})).toString('base64url'),Buffer.from(JSON.stringify({sub:uid,user_id:uid,aud:project,iss:`https://securetoken.google.com/${project}`,iat:now,exp:now+3600,auth_time:now,firebase:{sign_in_provider:'custom',identities:{}},...claims})).toString('base64url'),''].join('.');
}
function value(v) {
  if(v===null)return {nullValue:null};
  if(Array.isArray(v))return {arrayValue:{values:v.map(value)}};
  if(typeof v==='object')return {mapValue:{fields:fields(v)}};
  if(typeof v==='number')return {integerValue:String(v)};
  return {[typeof v==='boolean'?'booleanValue':'stringValue']:v};
}
function fields(data){return Object.fromEntries(Object.entries(data).map(([k,v])=>[k,value(v)]));}
async function request(method,path,data,token,expected,stamp=false) {
  const url=stamp?base+':commit':base+'/'+path;
  const body=stamp?{writes:[{update:{name:root+'/'+path,fields:fields(data)},updateTransforms:[{fieldPath:'timestamp',setToServerValue:'REQUEST_TIME'}]}]}:data?{fields:fields(data)}:undefined;
  const res=await fetch(url,{method:stamp?'POST':method,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:body?JSON.stringify(body):undefined});
  const result=await res.json();
  assert.equal(res.status,expected,`${method} ${path}: ${JSON.stringify(result)}`);checks++;
}
class HttpsError extends Error {constructor(code,message){super(message);this.code=code;}}
async function main(){
  const a='alice-'+run,b='bob-'+run,alice=jwt(a),bob=jwt(b);
  await request('PATCH','users/'+a,{plan:'free',sparksBalance:0,name:'Alice'},alice,200);
  await request('GET','users/'+a,null,undefined,403);
  await request('GET','users/'+a,null,bob,403);
  await request('GET','users/'+a,null,alice,200);
  for(const data of [{plan:'pro'},{sparksBalance:999},{googlePlayPurchases:[]}])await request('PATCH','users/'+a,data,alice,403);
  await request('DELETE','users/'+a,null,alice,403);
  await request('PATCH',`users/${a}/decks/one`,{name:'My deck'},alice,200);
  await request('GET',`users/${a}/decks/one`,null,bob,403);
  const deck='publicDecks/'+run,valid={ownerId:a,name:'Deck',cardsCount:2};
  await request('PATCH',deck,valid,alice,200);
  await request('PATCH',deck,{...valid,cardsCount:'<img src=x onerror=alert(1)>'},alice,403);
  await request('PATCH',deck,{...valid,ownerId:b},alice,403);
  await request('PATCH',deck+'bad',{...valid,cardsCount:'<svg onload=alert(1)>'},alice,403);
  await request('GET',deck,null,undefined,200);
  const feedback={userId:a,alias:'Alice',text:'Hello'};
  await request('PATCH','feedbacks/'+run,feedback,alice,200,true);
  for(const extra of [{adminReply:'Fake official answer'},{pinned:true},{userId:b}])await request('PATCH','feedbacks/'+run+'bad'+checks,{...feedback,...extra},alice,403,true);
  await request('PATCH','feedbacks/'+run,{...feedback,adminReply:'Official'},jwt('moderator',{admin:true}),200);
  await request('PATCH','feedbacks/'+run,{...feedback,adminReply:'Official UID'},jwt('f8oLEt3LDpT7VN9zFOa10mVE2Cf2'),200);
  for(const path of ['analytics/pageviews_test','analytics/presence/sessions/test','journeys/test','journeys/test/events/test','_purchaseReceipts/test','_oauthStates/test','_telemetryLimits/test']){
    for(const token of [undefined,alice])await request('PATCH',path,{value:1},token,403);
    await request('GET',path,null,alice,403);
  }
  await request('PATCH','userProfiles/'+run,{uid:a,xp:10},alice,200);
  await request('PATCH','userProfiles/'+run,{uid:b,xp:20},bob,403);

  const input={db,admin,uid:a,sku:'cortex_sparks_50',purchaseToken:'test-receipt-'+run,purchase:{purchaseState:0},HttpsError};
  await Promise.all([security.applyPurchase(input),security.applyPurchase(input)]);
  assert.equal((await db.doc('users/'+a).get()).data().sparksBalance,50);checks++;
  assert.equal((await security.applyPurchase(input)).alreadyProcessed,true);checks++;
  await assert.rejects(security.applyPurchase({...input,uid:b}),{code:'permission-denied'});checks++;
  await assert.rejects(security.applyPurchase({...input,purchase:{purchaseState:1}}),{code:'failed-precondition'});checks++;
  await assert.rejects(security.applyPurchase({...input,sku:'__proto__'}),{code:'invalid-argument'});checks++;
  await assert.rejects(security.applyPurchase({...input,sku:'cortex_pro_monthly',purchase:{paymentState:1,expiryTimeMillis:Date.now()-1000}}),{code:'failed-precondition'});checks++;
  const legacyToken='legacy-'+run;
  await db.doc('users/'+a).set({googlePlayPurchases:[{purchaseToken:legacyToken,sku:'cortex_sparks_50'}]},{merge:true});
  await assert.rejects(security.applyPurchase({...input,uid:b,purchaseToken:legacyToken}),{code:'permission-denied'});checks++;
  assert.equal((await security.applyPurchase({...input,purchaseToken:legacyToken})).alreadyProcessed,true);checks++;
  const tombstone='deleted-'+run;
  await db.doc('users/'+a).set({googlePlayPurchases:[{purchaseToken:tombstone,sku:'cortex_sparks_50'}]},{merge:true});
  await security.retainLegacyReceipts(db,a);await db.doc('users/'+a).delete();
  await assert.rejects(security.applyPurchase({...input,uid:b,purchaseToken:tombstone}),{code:'permission-denied'});checks++;

  const state='a'.repeat(64),ref=db.doc('_oauthStates/'+security.hash(state));
  await ref.set({credentialHash:'session',expiresAt:Date.now()+60000});
  await assert.rejects(security.consumeOAuthState(db,state,'other'));checks++;
  const outcomes=await Promise.allSettled([security.consumeOAuthState(db,state,'session'),security.consumeOAuthState(db,state,'session')]);
  assert.equal(outcomes.filter(x=>x.status==='fulfilled').length,1);checks++;
  await ref.set({credentialHash:'session',expiresAt:Date.now()-1000});
  await assert.rejects(security.consumeOAuthState(db,state,'session'));checks++;

  const event={visitor:'visitor-'+run,eventId:'event-'+run,type:'landing_view',page:'/?secret=redact',source:'security_test'};
  const endpoint=handler({db,admin,secret:()=> 'test-only-secret',ipRateLimit:()=>true});
  async function send(body=event,origin='https://cortexapp.it'){
    let status;const res={set(){return this;},status(v){status=v;return this;},json(){return this;},send(){return this;}};
    await endpoint({method:'POST',headers:{origin},ip:'127.0.0.1-'+run,body},res);return status;
  }
  assert.equal(await send(),202);checks++;
  assert.equal(await send(),202);checks++;
  const events=await db.collection('journeys').doc(event.visitor).collection('events').get();
  assert.equal(events.size,1);assert.equal(events.docs[0].data().page,'/');checks++;
  assert.equal(await send(event,'https://evil.example'),403);checks++;
  assert.equal(await send({...event,visitor:'../users/admin'}),400);checks++;
  const limit=db.doc('_telemetryLimits/'+security.hash('test-only-secret|127.0.0.1-'+run));
  await limit.update({calls:120});assert.equal(await send(),429);checks++;
  console.log(`${checks} security integration checks passed (local emulator only).`);
}
main().then(()=>db.terminate()).catch(async err=>{console.error(err);await db.terminate();process.exitCode=1;});
