import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
const root=path.resolve(import.meta.dirname,'..');
const dist=path.join(root,'dist');
const files=[];
function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(/\.(html|js|json|css|map|txt)$/i.test(p))files.push(p);}}
walk(dist);
const envPath=path.join(root,'functions/.env');
const secrets=fs.existsSync(envPath)?fs.readFileSync(envPath,'utf8').split(/\r?\n/).flatMap(line=>{
  const match=line.match(/^(?:GEMINI_KEY|STRIPE_SECRET|DASHBOARD_SECRET|TIKTOK_CLIENT_SECRET)\s*=\s*(.+)$/);
  if(!match)return [];
  const value=match[1].replace(/^['"]|['"]$/g,'');return value.length>=16?[value]:[];
}):[];
for(const file of files){
  const content=fs.readFileSync(file,'utf8');
  assert(!content.includes('cx-journey-lite:'),'Legacy direct tracker: '+path.relative(dist,file));
  assert(!/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(content),'Private key marker: '+path.relative(dist,file));
  assert(!secrets.some(secret=>content.includes(secret)),'Server secret found: '+path.relative(dist,file));
}
assert(fs.readFileSync(path.join(dist,'app.html'),'utf8').includes('/cortex-telemetry.js'),'Missing app telemetry sender');
assert(fs.readFileSync(path.join(dist,'index.html'),'utf8').includes('/cortex-telemetry.js'),'Missing landing telemetry sender');
assert(!fs.readFileSync(path.join(dist,'admin-tiktok.html'),'utf8').includes("localStorage.setItem('cortex_admin_key'"),'Admin key persisted');
console.log(`${files.length} production text files checked; legacy tracker absent; ${secrets.length} configured server secrets absent.`);
