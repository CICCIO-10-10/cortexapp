import {it,expect} from 'vitest';
import vm from 'node:vm';
import fs from 'node:fs';
const code=fs.readFileSync(new URL('../core/journey.js',import.meta.url),'utf8');
it('retries rejected writes with the same event id and respects tracking opt-out',async()=>{
 const values=new Map();const writes=[];let tick;let fail=true;let id=0;
 const events={doc:key=>({set:async data=>{writes.push({key,data});if(fail)throw Error('offline')}})};
 const documentRef={collection:()=>events,set:async()=>{}};
 const db={collection:()=>({doc:()=>documentRef})};
 const firebase={apps:[{}],app:()=>({firestore:()=>db}),firestore:{FieldValue:{serverTimestamp:()=>123}}};
 const window={crypto:{randomUUID:()=>`id-${++id}`}};
 const context={window,crypto:window.crypto,firebase,localStorage:{getItem:k=>values.get(k),setItem:(k,v)=>values.set(k,v)},
 sessionStorage:{getItem:()=>null,setItem:()=>{}},document:{readyState:'loading',addEventListener:()=>{},visibilityState:'hidden'},
 location:{pathname:'/app',search:''},navigator:{userAgent:'test'},setInterval:fn=>{tick=fn},setTimeout:()=>{},URLSearchParams};
 vm.runInNewContext(code,context);
 window.__cxLogStep('cards_generated',{count:3});
 await new Promise(resolve=>setImmediate(resolve));
 expect(window.__cxJourneyDiagnostics.failed).toBe(1);
 fail=false;tick();await new Promise(resolve=>setImmediate(resolve));
 expect(writes.filter(x=>x.data.type==='cards_generated').map(x=>x.key)).toEqual(['id-2','id-2']);
 const count=writes.length;values.set('cortex_no_track','1');window.__cxLogStep('cards_generated');tick();
 await new Promise(resolve=>setImmediate(resolve));expect(writes.length).toBe(count);
});
