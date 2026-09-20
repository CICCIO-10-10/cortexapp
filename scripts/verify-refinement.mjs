import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
import {registry,injectDesign,stripDesign} from './seo-design-plugin.mjs';
const require=createRequire(import.meta.url);
const {chromium}=require('C:/Users/User/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const dir='artifacts/metrics-2026-09-20';fs.mkdirSync(dir,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true});
const context=await browser.newContext();
await context.addInitScript(()=>localStorage.setItem('cortex_no_track','1'));
await context.route('**/*',route=>{
 const url=route.request().url();
 return /^(http:\/\/127\.0\.0\.1:5180|file:)/.test(url)?route.continue():route.abort();
});
const page=await context.newPage();const errors=[];
page.on('pageerror',e=>errors.push(e.message));
const snapshot=()=>page.evaluate(()=>({
 title:document.title,description:document.querySelector('meta[name=description]')?.content,
 canonical:document.querySelector('link[rel=canonical]')?.href,
 robots:[...document.querySelectorAll('meta[name=robots]')].map(x=>x.content),
 schema:[...document.querySelectorAll('script[type="application/ld+json"]')].map(x=>x.textContent),
 headings:[...document.querySelectorAll('h1,h2,h3')].map(x=>x.textContent.trim()),
 links:[...document.querySelectorAll('a')].map(x=>x.getAttribute('href')),
 // Exclude script/style source; preserve all content including collapsed FAQ answers.
 text:(()=>{const b=document.body.cloneNode(true);b.querySelectorAll('script,style').forEach(x=>x.remove());return b.textContent.replace(/\s+/g,' ').trim()})()
}));
const report={pages:[],dashboard:{},errors};
const selected=['tolc-sps','tolc-psi','tolc-e','tolc-su','tolc-s','ripetere-il-tolc','tolc-i'];
for(const slug of selected){
 const p=registry.pages.find(x=>x.slug===slug);
 const source=fs.readFileSync(p.source,'utf8');
 const before=execFileSync('git',['show',`HEAD:${p.source}`],{encoding:'utf8'});
 assert.equal(source,before,`${slug}: SEO source changed`);
 assert.equal(stripDesign(injectDesign(source,p)),source);
 await page.goto(`http://127.0.0.1:5180/${slug}?cortex-baseline=1&notrack=1`);
 const baseline=await snapshot(); const widths=[];
 for(const width of [1440,1024,768,390]){
  await page.setViewportSize({width,height:1000});
  await page.goto(`http://127.0.0.1:5180/${slug}?notrack=1&cortex-audit=1`);
  await page.evaluate(()=>document.fonts.ready);
  assert.deepEqual(await snapshot(),baseline,`${slug}: content invariants`);
  const layout=await page.evaluate(()=>({overflow:document.documentElement.scrollWidth>innerWidth,
   cls:Number(document.documentElement.dataset.cortexCls||0),
   brokenImages:[...document.images].filter(i=>!i.complete||i.naturalWidth===0).map(i=>i.getAttribute('src')),
   background:getComputedStyle(document.body).backgroundColor}));
  widths.push({width,...layout});
  assert.equal(layout.overflow,false,`${slug} ${width}: overflow`);
  assert.equal(layout.brokenImages.length,0,`${slug}: broken images`);
  if(['tolc-sps','ripetere-il-tolc'].includes(slug)&&[1440,390].includes(width))
   await page.screenshot({path:`${dir}/${slug}-${width}.png`,fullPage:true});
 }
 report.pages.push({slug,seoUnchanged:true,widths});
}
await page.setViewportSize({width:1440,height:1000});
await page.goto('file:///C:/Users/User/Desktop/AUTOMAZIONI/cortex_dashboard_local.html');
report.dashboard=await page.evaluate(()=>({
 error:document.getElementById('err-box').textContent,
 conversion:document.getElementById('reg-conv-val').textContent,
 sources:document.getElementById('social-ts').textContent,
 legacyLosses:/persi \(/.test(document.getElementById('funnel-macro').textContent),
 socialPopulated:document.getElementById('social-funnel').textContent.length>10
}));
assert.equal(report.dashboard.error,'');
assert.equal(report.dashboard.conversion,'n/d');
assert.equal(report.dashboard.legacyLosses,false);
assert.equal(report.dashboard.socialPopulated,true);
await page.screenshot({path:`${dir}/dashboard.png`,fullPage:false,maskColor:'#191820',mask:[page.locator('#users-detail')]});
// Exercise missing backend data and the new sequential response without calling production.
await page.evaluate(()=>{
 renderJourneys({journeyFunnel:{coverage:{status:'unavailable'}}});
 if(!document.getElementById('journey-funnel').textContent.includes('non disponibili')) throw Error('Missing data became zero');
 renderJourneys({journeyFunnel:{app_open:3,cards_generated:2,study_session_start:2,
  coverage:{status:'ok',from:1,to:5,eventCount:9,limited:true,ordered:true},
  sequential:[{event:'app_open',count:3},{event:'cards_generated',count:1},{event:'study_session_start',count:1}]}});
 if(!document.getElementById('journey-funnel').textContent.includes('CAMPIONE LIMITATO')) throw Error('Missing sample warning');
 renderData({firestore:{totalUsers:30},analytics:{},stripe:{}});
 if(document.getElementById('act-sparks-val').textContent!=='n/d') throw Error('Missing activation became zero');
});
fs.writeFileSync(`${dir}/verification.json`,JSON.stringify(report,null,2));
await browser.close();
assert.deepEqual(errors,[]);
console.log(JSON.stringify(report,null,2));
