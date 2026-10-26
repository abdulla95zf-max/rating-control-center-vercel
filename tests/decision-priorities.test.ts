import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function setup(){const context=vm.createContext({Intl,escapeHtml:esc,storeIdentity:({storeName}:any)=>({displayName:storeName})});vm.runInContext(fs.readFileSync('public/growth.js','utf8'),context);return context;}
const row=(identity:string,delta:number,eligible=true)=>({identity,name:identity,delta,eligible,current:{orders:30},previous:{orders:50},period:{from:'2026-10-19',to:'2026-10-25',previousFrom:'2026-10-12',previousTo:'2026-10-18'},recommendation:{title:'Check <menu>',action:'Inspect availability & prices'}});
test('sales priority uses only the largest eligible decline and displays its exact next check and periods',()=>{
 const context=setup();context.platform={platform:'keeta',state:'SUCCESS',rows:[row('Excluded',-99999,false),row('Growing',100),row('Largest',-500),row('Smaller',-100)]};
 const html=vm.runInContext('grPriorityCard(platform)',context);
 assert.match(html,/Largest/);assert.match(html,/-500 AED/);assert.match(html,/50 → 30/);assert.match(html,/2026-10-12/);assert.match(html,/Check &lt;menu&gt;/);assert.match(html,/Inspect availability &amp; prices/);
 assert.doesNotMatch(html,/Excluded|Growing|Smaller|99999/);
});
test('no eligible comparison produces no invented decline or recommendation',()=>{
 const context=setup();context.platform={platform:'noon',state:'ERROR',rows:[row('Excluded',-500,false)]};
 const html=vm.runInContext('grPriorityCard(platform)',context);assert.match(html,/Comparison unavailable/);assert.doesNotMatch(html,/AED|Inspect availability|Inspect branch evidence/);
});
