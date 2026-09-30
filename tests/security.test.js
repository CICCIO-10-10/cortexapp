import {describe,it,expect} from 'vitest';
import {createRequire} from 'node:module';
import fs from 'node:fs';
import vm from 'node:vm';
import {secureTracking} from '../scripts/security-html-plugin.mjs';
const require=createRequire(import.meta.url);
const {signSession,verifySession,adminCredential}=require('../functions/security.js');
const {validateEvent}=require('../functions/telemetry.js');
describe('admin session boundary',()=>{
  const secret='test-only-secret';
  it('rejects forged, expired, wrong-key and malformed cookies',()=>{
    const cookie=signSession(secret,1000);
    expect(verifySession(cookie,secret,1001)).toBe(true);
    expect(verifySession(cookie,secret,1801000)).toBe(false);
    expect(verifySession(cookie,secret+'bad',1001)).toBe(false);
    expect(verifySession(cookie+'x',secret,1001)).toBe(false);
    expect(verifySession(cookie+'.extra',secret,1001)).toBe(false);
  });
  it('requires same-site origin for cookie mutations and ignores query keys',()=>{
    const cookie='__session='+signSession(secret);
    expect(adminCredential({method:'GET',headers:{},query:{key:secret}},secret)).toBeNull();
    expect(adminCredential({method:'GET',headers:{cookie}},secret)).toBeTruthy();
    for(const origin of [undefined,'https://evil.example'])expect(adminCredential({method:'POST',headers:{cookie,origin}},secret)).toBeNull();
    expect(adminCredential({method:'POST',headers:{cookie,origin:'https://cortexapp.it'}},secret)).toBeTruthy();
    expect(adminCredential({method:'POST',headers:{authorization:'Bearer '+secret}},secret)).toBe(secret);
  });
});
it('does not call the paid provider when quota storage is unavailable',async()=>{
  const source=fs.readFileSync(new URL('../functions/index.js',import.meta.url),'utf8');
  const start=source.indexOf('exports.callGeminiHttp =');
  const end=source.indexOf('\n});',start)+4;
  let providerCalls=0,status;
  const exports={};
  vm.runInNewContext(source.slice(start,end),{
    exports,functions:{https:{onRequest:fn=>fn}},
    admin:{auth:()=>({verifyIdToken:async()=>({uid:'ordinary-user'})})},
    db:{collection:()=>({doc:()=>({collection:()=>({doc:()=>({})})})}),runTransaction:async()=>{throw Error('unavailable');}},
    getClientIp:()=> '127.0.0.1',ipRateLimit:()=>true,
    fetch:async()=>{providerCalls++;},process:{env:{GEMINI_KEY:'test-only'}},console:{error:()=>{}},
  });
  const res={set(){return this;},status(v){status=v;return this;},json(){return this;}};
  await exports.callGeminiHttp({method:'POST',headers:{authorization:'Bearer test'},body:{model:'gemini-2.5-flash',contents:[]}},res);
  expect(status).toBe(503);expect(providerCalls).toBe(0);
});
describe('guest telemetry input',()=>{
  const event={visitor:'abc',eventId:'123',type:'session_start'};
  it('rejects paths and oversized values',()=>{
    expect(validateEvent({...event,visitor:'a/b'})).toBeNull();
    expect(validateEvent({...event,meta:{x:'a'.repeat(9000)}})).toBeNull();
  });
  it('strips query tokens and unexpected metadata',()=>{
    expect(validateEvent({...event,page:'/app?token=secret',referrer:'https://example.com/?key=secret',meta:{count:3,password:'secret',content:'private notes'}})).toMatchObject({page:'/app',referrer:'https://example.com/',meta:{count:3}});
  });
  it('replaces legacy inline writers without changing other scripts',()=>{
    const html='<script>keep()</script><script>/* cx-journey-lite: old */ unsafe()</script>';
    const secured=secureTracking(html);
    expect(secured).toBe('<script>keep()</script><script src="/cortex-telemetry.js" defer></script>');
    expect(secureTracking(secured)).toBe(secured);
  });
});
