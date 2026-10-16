import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function setup(){
 const source=fs.readFileSync('public/app.js','utf8');
 const context=vm.createContext({storeIdentity:()=>({key:'branch',displayName:'Test branch'}),actionNumber:(v:unknown)=>typeof v==='string'&&v.trim()!==''&&Number.isFinite(Number(v))?Number(v):null,performanceFormat:String});
 vm.runInContext(source.slice(source.indexOf('function actionWindow('),source.indexOf('function renderPlatformTable(')),context);
 return context;
}
const report=(values:Record<string,string|null>={'Successful Orders':'10'})=>({reportDate:'2026-10-15',rows:[{storeId:'1',storeName:'Test branch',present:true,values}]});
const points=()=>Array.from({length:7},(_,i)=>({storeId:'1',reportDate:new Date(Date.UTC(2026,9,15-i)).toISOString().slice(0,10),orders:10 as number|null,complaints:0 as number|null,cancellation:0,offline:0,prep:12 as number|null}));
function evaluate(context:vm.Context,p:any,h:any){context.report=p;context.history={points:h};return JSON.parse(vm.runInContext('JSON.stringify({actions:buildActionCenter([],report,history),checks:buildDataChecks(report,history)})',context));}

test('missing order counts do not become a zero-sales action; unknown coverage is visible',()=>{
 const r=evaluate(setup(),report({'Successful Orders':null}),points().map(p=>({...p,orders:null,complaints:null,prep:null})));
 assert.equal(r.actions.length,0);assert.match(r.checks[0].issue,/0\/7 calendar days known/);assert.match(r.checks[0].issue,/missing is not zero/);
});
test('one measured complaint day cannot confirm a weekly breach; a measured daily spike remains monitor',()=>{
 const h=points().map((p,i)=>({...p,complaints:i===0?8:null}));
 assert.equal(evaluate(setup(),report(),h).actions.length,0);
 const r=evaluate(setup(),report({'Successful Orders':'10','Customer Complaint rate':'8'}),h);
 assert.equal(r.actions[0].level,'attention');assert.match(r.actions[0].issues[0],/incomplete evidence/);assert.match(r.checks[0].issue,/Complaints 1\/7/);
});
test('a missing calendar day is not replaced by an older observation or duplicate',()=>{
 const h=points().filter(p=>p.reportDate!=='2026-10-12');h.push({...points()[0],reportDate:'2026-10-08'});
 const r=evaluate(setup(),report(),h.map(p=>({...p,orders:1,complaints:8})));
 assert.equal(r.actions.length,0);assert.match(r.checks[0].issue,/6\/7 calendar days known/);
 const duplicate=evaluate(setup(),report(),[...points(),points()[0]]);
 assert.match(duplicate.checks[0].issue,/6\/7 calendar days known/);
});
test('complete true zero days and complete low-volume weeks remain actionable',()=>{
 const zero=evaluate(setup(),report({'Successful Orders':'0'}),points().map(p=>({...p,orders:0,complaints:null,prep:null})));
 assert.match(zero.actions[0].issues[0],/Low sales.*0 orders/);assert.equal(zero.checks[0].kind,'zero');
 const low=evaluate(setup(),report(),points().map(p=>({...p,orders:2})));
 assert.match(low.actions[0].issues[0],/14 orders in 7 calendar days/);
});
test('complete weekly weighted rate stays correct and ignores no-order undefined rates',()=>{
 const h=points().map((p,i)=>({...p,orders:i===0?0:10,complaints:i===0?null:3,prep:i===0?null:12}));
 const r=evaluate(setup(),report(),h);assert.equal(r.actions[0].level,'critical');assert.match(r.actions[0].issues[0],/7d 3.00%/);assert.equal(r.checks.length,0);
});
test('windows align with the displayed report, not an unrelated newer history date',()=>{
 const h=points().map(p=>({...p,orders:2}));h.push({...points()[0],reportDate:'2026-10-16',orders:100});
 assert.match(evaluate(setup(),report(),h).actions[0].issues[0],/14 orders/);
 const context=setup();context.history={points:h.filter(p=>p.reportDate!=='2026-10-12')};
 assert.equal(vm.runInContext("actionReadiness(history,'2026-10-15').ready",context),false);
});
test('known offline percentages cannot bypass missing weekly order eligibility',()=>{
 const r=evaluate(setup(),report({'Successful Orders':null,'Unavailable Time Duration Rate':'10'}),points().map(p=>({...p,orders:null,offline:10})));
 assert.equal(r.actions[0].level,'attention');assert.match(r.actions[0].issues[0],/incomplete evidence/);assert.match(r.checks[0].issue,/0\/7 calendar days known/);
});
