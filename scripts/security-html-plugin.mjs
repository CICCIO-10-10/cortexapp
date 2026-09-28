import fs from 'node:fs';
import path from 'node:path';
export function secureTracking(html){return html.replace(/<script>\/\* cx-journey-lite:[\s\S]*?<\/script>/g,'<script src="/cortex-telemetry.js" defer></script>');}
export default function securityHtmlPlugin(){
 let out;
 return {name:'cortex-security-html',enforce:'post',transformIndexHtml:{order:'pre',handler:secureTracking},
 configResolved:c=>{out=path.resolve(c.root,c.build.outDir);},
 closeBundle:{order:'post',sequential:true,handler(){
  function walk(dir){for(const item of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,item.name);if(item.isDirectory())walk(p);else if(p.endsWith('.html')){const before=fs.readFileSync(p,'utf8'),after=secureTracking(before);if(after!==before)fs.writeFileSync(p,after);}}}
  if(out&&fs.existsSync(out))walk(out);
 }}};
}
