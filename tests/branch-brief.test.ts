import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const context:any={};vm.createContext(context);vm.runInContext(fs.readFileSync('public/branch-brief.js','utf8'),context);
const core=context.BranchBriefCore;
const row=(brand='Kabab Fareej',branch='Ajman',extra={})=>({identity:'TB_AE;123',brand,branch,name:brand+' — '+branch,eligible:true,current:{sales:800,orders:20},previous:{sales:1000,orders:25},...extra});
const report=(rows:any[])=>({platforms:[{platform:'talabat',state:'SUCCESS',rows}]});
test('Branch Lens resolves a Persian request only to the unique authorized brand and branch',()=>{
 const groups=core.catalog(report([row(),row('FRB Kabab'),row('Kabab Fareej','Hoshi')]));
 assert.equal(core.find(groups,'برام شعبه عجمان کباب فریج رو تحلیل کن').length,1);
 assert.equal(core.find(groups,'برام شعبه عجمان کباب فریج رو تحلیل کن')[0].name,'Kabab Fareej — Ajman');
 assert.equal(core.find(groups,'عجمان').length,2);
 assert.equal(core.find(groups,'Analyze Kabab Fareej Ajman')[0].name,'Kabab Fareej — Ajman');
 assert.equal(core.find(groups,'کباب شام عجمان').length,0);
 assert.equal(core.find(groups,'unknown unauthorized store').length,0);
});
test('same-platform branch collisions are not merged into a trusted comparison',()=>{
 const groups=core.catalog(report([row(),row('Kabab Fareej','Ajman',{identity:'TB_AE;999'})]));
 assert.equal(groups.length,1);assert.equal(groups[0].entries.length,2);
 assert.equal(core.assess(groups[0].entries[0],groups[0].entries).valid,false);
 assert.equal(core.assess(groups[0].entries[0],groups[0].entries).reason,'SOURCE_AMBIGUOUS');
});
test('comparison recomputes change, preserves zero, and never turns missing metrics into a decline',()=>{
 const entry={platform:'noon',state:'SUCCESS',row:row('Kabab Fareej','Ajman',{delta:999999,current:{sales:0,orders:0},previous:{sales:1000,orders:25}})};
 const known=core.assess(entry,[entry]);assert.equal(known.valid,true);assert.equal(known.change,-1000);assert.equal(known.percent,-100);assert.equal(known.small,true);
 const missing={...entry,row:{...entry.row,current:{sales:null,orders:0}}};assert.equal(core.assess(missing,[missing]).valid,false);assert.equal(core.assess(missing,[missing]).change,null);
 const excluded={...entry,row:{...entry.row,eligible:false,reason:'COLLECTION_STALE'}};assert.equal(core.assess(excluded,[excluded]).valid,false);
 const failed={...entry,state:'ERROR'};assert.equal(core.assess(failed,[failed]).valid,false);
 const zeroBaseline={...entry,row:{...entry.row,current:{sales:200,orders:4},previous:{sales:0,orders:0}}};assert.equal(core.assess(zeroBaseline,[zeroBaseline]).percent,null);
});
test('source groups retain separate platforms, source identities, and evidence without inventing a total',()=>{
 const data={platforms:[{platform:'talabat',state:'SUCCESS',rows:[row()]},{platform:'keeta',state:'SUCCESS',rows:[row('Kabab Fareej','Ajman',{identity:'KEETA;77'})]}]};
 const group=core.catalog(data)[0];assert.deepEqual(Array.from(group.entries,(x:any)=>x.row.identity),['TB_AE;123','KEETA;77']);assert.equal(group.total,undefined);
});
test('ratings match the selected canonical brand and location without mixing nearby stores',()=>{
 context.storeIdentity=(r:any)=>{const [brand,branch]=r.storeName.split(' — ');return {brand,branch};};
 const group=core.catalog(report([row()]))[0];
 const response={ratings:[{storeName:'Kabab Fareej — Ajman',rating:4.1},{storeName:'FRB Kabab — Ajman',rating:4.8},{storeName:'Kabab Fareej — Hoshi',rating:3.9}]};
 const selected=core.ratingsFor(response,group);assert.equal(selected.length,1);assert.equal(selected[0].rating,4.1);
});
