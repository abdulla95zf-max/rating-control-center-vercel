import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function core(document?:any){const c:any={Intl,Date,...(document?{document}:{})};vm.createContext(c);vm.runInContext(fs.readFileSync('public/data-trust.js','utf8'),c);return c.DataTrust;}
test('rating confidence retains source-specific times, missing ratings and carried-forward provenance',()=>{
 const api=core(),rows=api.ratingRows({ratings:[{platform:'talabat',rating:0,timestamp:'2026-11-01T00:00:00Z',carriedForward:true},{platform:'talabat',rating:4.4,timestamp:'2026-11-03T00:00:00Z'},{platform:'noon',rating:3.9}],platforms:[{platform:'talabat',state:'SUCCESS',syncTimestamp:'2026-11-04T00:00:00Z'},{platform:'noon',state:'ERROR',syncTimestamp:null}]},(p:any)=>p.platform==='talabat'?'LIVE':'ERROR');
 assert.equal(rows[0].usable,1);assert.equal(rows[0].count,2);assert.equal(rows[0].carried,1);assert.equal(rows[0].oldest,'2026-11-01T00:00:00Z');assert.equal(rows[1].observedAt,null);
 const html=api.render(rows);assert.match(html,/Ratings.*1\/2/s);assert.match(html,/carried-forward/);assert.match(html,/Read failed/);assert.doesNotMatch(html,/All branches complete/);
});
test('comparison confidence separates valid zero, missing periods, service-only data and small samples',()=>{
 const api=core(),row=(eligible:boolean,current:any,previous:any,reason?:string)=>({eligible,current,previous,reason});
 const rows=api.comparisonRows({platforms:[{platform:'talabat',state:'SUCCESS',rows:[row(true,{sales:0,orders:0},{sales:10,orders:1}),row(false,{sales:null,orders:null},{sales:20,orders:2},'CURRENT_DAYS_MISSING'),row(true,{sales:null,orders:0},{sales:10,orders:1})]},{platform:'deliveroo',state:'SUCCESS',rows:[{evidenceOnly:true,eligible:false}]}]});
 assert.equal(rows[0].usable,1);assert.equal(rows[0].gaps.CURRENT_DAYS_MISSING,1);assert.equal(rows[0].gaps.METRICS_MISSING,1);assert.equal(rows[0].problem,true);assert.equal(rows[1].usable,null);
 assert.match(api.render(rows),/Current period has missing days/);assert.match(api.render(rows,{language:'fa'}),/روزهای دورهٔ فعلی ناقص است/);assert.match(api.render(rows),/sales not collected/);
});
test('period confidence requires per-metric days and discloses unknown legacy coverage without hiding partial totals',()=>{
 const api=core(),rows=[{present:true,values:{'Gross Sales':'100','Successful Orders':'1'},coverage:{presentDays:7,expectedDays:7,metricDays:{'Gross Sales':7,'Successful Orders':7}}},{present:true,values:{'Gross Sales':'200','Successful Orders':'2'},coverage:{presentDays:7,expectedDays:7,metricDays:{'Gross Sales':3,'Successful Orders':7}}},{present:true,values:{'Gross Sales':'0','Successful Orders':'0'}}];
 const model=api.performanceRows({period:'7d',state:'SUCCESS',rows});assert.equal(model[0].usable,1);assert.equal(model[0].count,3);assert.equal(model[0].days.unknown,1);
 const html=api.render(model);assert.match(html,/1\/3 complete for sales &amp; orders/);assert.match(html,/unknown/);assert.match(html,/Totals include partial observations/);assert.match(html,/Sales days:.*3\/7/);assert.match(html,/Order days:/);
});

test('platform-level failures keep their reason even when no branch rows were returned',()=>{
 const api=core(),rows=api.comparisonRows({platforms:[{platform:'keeta',state:'ERROR',rows:[],errorCode:'HISTORY_READ_TIMEOUT'}]});
 assert.equal(rows[0].sourceReason,'HISTORY_READ_TIMEOUT');assert.match(api.render(rows),/Saved history read timed out/);assert.match(api.render(rows,{language:'fa'}),/پایان زمان مجاز/);
});
test('confidence disclosure escapes dates/scope, survives refresh and clears on auth reset',()=>{
 const handlers:any={},api=core({addEventListener:(name:string,fn:any)=>handlers[name]=fn}),rows=[{platform:'talabat',dataset:'comparison',state:'SUCCESS',count:1,usable:0,period:{from:'<script>',to:'x'},gaps:{'<img>':1}}];
 const node={matches:()=>true,open:true,dataset:{trustKey:'overview:talabat'}};handlers.toggle({target:node});
 const html=api.render(rows,{scope:'<script>scope</script>'});assert.match(html,/data-trust-key="overview:talabat" open/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>|<img>/);
 handlers['rcc-auth-reset']();assert.doesNotMatch(api.render(rows),/data-trust-key="overview:talabat" open/);
});

test('failed Growth refresh keeps its success timestamp and stale post-logout completion cannot restore a failure flag',async()=>{
 const c:any=vm.createContext({Date,api:async()=>{throw Error('temporary');}});vm.runInContext(fs.readFileSync('public/growth.js','utf8'),c);
 vm.runInContext('growthState.cache={platforms:[]};growthState.checkedAt=123',c);
 await assert.rejects(vm.runInContext('grLoad(true)',c));assert.equal(vm.runInContext('growthState.lastReadFailed',c),true);assert.equal(vm.runInContext('growthState.checkedAt',c),123);
 let reject:any;c.api=()=>new Promise((_,r)=>reject=r);const request=vm.runInContext('grLoad(true)',c);
 vm.runInContext('growthState.authGeneration++;growthState.lastReadFailed=false;growthState.cache=null',c);reject(Error('old request'));await assert.rejects(request);
 assert.equal(vm.runInContext('growthState.lastReadFailed',c),false);assert.equal(vm.runInContext('growthState.cache',c),null);
});
