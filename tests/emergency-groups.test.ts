import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';
function api(){const c:any={};vm.runInNewContext(fs.readFileSync('public/emergency-groups.js','utf8'),c);return c.EmergencyGroups;}
function row(i:number,extra:any={}){return {key:'keeta:'+i,branchKey:'branch'+i,brand:'FRB Kabab',name:'FRB Kabab — '+i,platform:'keeta',asOf:'2026-11-18',state:'EMERGENCY',currentOrders:1,baselineAverage:7,baselineFrom:'2026-11-10',baselineTo:'2026-11-16',startDate:'2026-11-17',...extra};}
test('same-day same-platform group requires two unique affected branches and at least half assessed',()=>{
 const a=api();assert.equal(a.analyze([row(1)]).length,0);assert.equal(a.analyze([row(1),row(2),row(3,{state:'NORMAL'}),row(4,{state:'NORMAL'})])[0].eligible,4);
 assert.equal(a.analyze([row(1),row(2),...Array.from({length:3},(_,i)=>row(i+3,{state:'NORMAL'}))]).length,0);
 for(const extra of [{brand:'Other'},{asOf:'2026-11-17'},{platform:'noon'},{asOf:'2026-02-30'}])assert.equal(a.analyze([row(1),row(2,extra)]).length,0);
});
test('denominator excludes missing evidence, low volume, dates and duplicate branch/source identities',()=>{
 const a=api(),rows=[row(1),row(2),row(3,{state:'UNKNOWN'}),row(4,{state:'LOW_VOLUME',baselineAverage:1}),row(5,{asOf:'2026-11-17',state:'NORMAL'})];
 const g=a.analyze(rows)[0];assert.equal(g.eligible,2);assert.equal(g.excluded,3);assert.equal(g.affected.length,2);
 assert.equal(a.analyze([row(1),row(2),row(3,{branchKey:'branch1'})]).length,0);
 assert.equal(a.analyze([row(1,{branchKey:undefined}),row(2)]).length,0);
});
test('shared measured signals are deduplicated per branch and require matched dates/baselines',()=>{
 const a=api(),d={state:'EVIDENCE',date:'2026-11-18',baselineFrom:'2026-11-10',baselineTo:'2026-11-16',primary:{code:'VISITS'},supporting:[{code:'VISITS'}]};
 let groups=a.analyze([row(1,{diagnosis:d}),row(2,{diagnosis:d}),row(3),row(4)]);assert.equal(groups[0].common[0].count,2);
 groups=a.analyze([row(1,{diagnosis:d}),row(2,{diagnosis:{...d,date:'2026-11-17'}})]);assert.equal(groups[0].common.length,0);
 groups=a.analyze([row(1,{diagnosis:d}),row(2,{diagnosis:d}),row(3),row(4),row(5)]);assert.equal(groups[0].common.length,0);
});
test('other-platform evidence matches exact authorized branch and date, never unrelated branches',()=>{
 const a=api(),rows=[row(1),row(2),row(1,{platform:'noon',key:'noon:1'}),row(3,{platform:'talabat'}),row(2,{platform:'deliveroo',asOf:'2026-11-17'})];
 const g=a.analyze(rows).find((g:any)=>g.platform==='keeta');assert.equal(JSON.stringify(g.otherPlatforms),'["noon"]');
 const html=a.render([g],'FRB Kabab','keeta',new Set());assert.match(html,/Coinciding order drops, not proof/);assert.match(html,/incident started/);assert.equal(a.render([g],'Other','',new Set()),'');
 g.brand='<script>';assert.doesNotMatch(a.render([g],'','',new Set()),/<script>/);
});
