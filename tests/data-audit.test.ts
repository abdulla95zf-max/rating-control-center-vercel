import test from 'node:test';import assert from 'node:assert/strict';
import {dailyAudit,evaluateEmergencySnapshot,calendarDay,validEmergencySnapshot,type OrderSeries} from '../src/services/order-emergency-policy.ts';
import {readDataAudit} from '../src/services/data-audit.ts';
import {createCloudHandler} from '../src/cloud-api.ts';
const now=new Date('2026-11-19T10:00:00Z');
function series():OrderSeries{return {key:'keeta:1',platform:'keeta',sourceId:'1',branchId:'branch1',brand:'FRB Kabab',name:'FRB Kabab — Barsha',lineage:'frb-kabab',asOf:'2026-11-18',points:Array.from({length:28},(_,i)=>({date:calendarDay('2026-10-22',i),orders:5,sales:100,complete:true,observedAt:now.toISOString(),revision:'private-revision'}))};}
const user={role:'branch_manager',features:['overview','overview.confidence','keeta.performance'],scopes:[{type:'branch',key:'frb-kabab|barsha'}]} as any;
const roster=[{source_type:'performance:keeta',source_id:'1',id:'branch1',canonical_key:'frb-kabab|barsha',brand:'FRB Kabab',display_name:'FRB Kabab — Barsha'},{source_type:'performance:talabat',source_id:'secret',id:'other',canonical_key:'other',brand:'Other',display_name:'Private'}];
function setup(s=series()){
 const snapshot=evaluateEmergencySnapshot([s],now),db={query:async(q:any)=>({rows:q.text.includes('dashboard_branch_sources')?roster:[{snapshot}]})};
 const row={identity:'KEETA;1',accountKey:'frb-kabab',previousAccountKey:'frb-kabab',eligible:true,period:{from:'2026-11-12',to:'2026-11-18',previousFrom:'2026-11-05',previousTo:'2026-11-11'},current:{orders:35,sales:700},previous:{orders:35,sales:700}};
 return {snapshot,db,row,growth:async()=>({ok:true,generatedAt:now.toISOString(),platforms:[{platform:'keeta',state:'SUCCESS',rows:[row]}]})};
}
test('daily audit keeps zero, missing, duplicate, invalid and unknown sales separate',()=>{
 const s=series();s.points[0]!.orders=0;s.points[0]!.sales=0;s.points.splice(1,1);s.points.push({...s.points[2]!});s.points[5]!.sales=null;
 const a=dailyAudit(s,now);assert.equal(a.missing.length,2);assert.equal(a.latestComplete,'2026-11-18');assert.equal(a.weeks[0]!.orders,null);assert.equal(a.weeks[0]!.sales,null);assert.equal(a.weeks.at(-1)!.orders,35);
 s.error='FAILED';assert.equal(dailyAudit(s,now).missing.length,28);
});
test('audit denies missing parent/feature before any database query and cloud route denies access',async()=>{
 let reads=0;const db={query:async()=>{reads++;return {rows:[]};}};
 await assert.rejects(readDataAudit({...user,features:['overview.confidence']},{},fetch,{db}),/FORBIDDEN/);assert.equal(reads,0);
 let code=0;const response={setHeader(){},statusCode:0,end(){code=this.statusCode;}};
 await createCloudHandler('performance',{},fetch,async()=>({...user,features:['overview']}))({method:'GET',url:'/api/dashboard/performance/latest?dataset=data-audit',headers:{}} as any,response as any);assert.equal(code,403);
});
test('audit scopes rows and reconciles only matching source/account/exact complete periods',async()=>{
 const d=setup(),read=()=>readDataAudit(user,{},fetch,{...d,now,growth:d.growth as any});
 let r=await read();assert.equal(r.rows.length,1);assert.equal(r.rows[0]!.emergencyState,'NOT_PERMITTED');assert.equal(r.rows[0]!.emergencyReason,null);assert.equal(r.rows[0]!.reconciliation,'READY');assert.equal(r.rows[0]!.totals.length,2);assert.doesNotMatch(JSON.stringify(r),/Private|private-revision|branch1|incidents|sourceId/);
 d.row.current.sales=710;r=await read();assert.equal(r.rows[0]!.reconciliation,'DIFFERENCE');assert.equal(r.rows[0]!.totals[0]!.salesDifference,-10);
 d.row.previousAccountKey='another-account';r=await read();assert.equal(r.rows[0]!.reconciliation,'ACCOUNT_UNVERIFIED');assert.deepEqual(r.rows[0]!.totals,[]);
 d.row.previousAccountKey='frb-kabab';d.row.period.to='2026-11-17';r=await read();assert.equal(r.rows[0]!.reconciliation,'DAILY_PERIOD_INCOMPLETE');
});
test('stale/legacy daily snapshots do not assert current coverage or produce false differences',async()=>{
 const d=setup();let r=await readDataAudit(user,{},fetch,{...d,now:new Date('2026-11-20T10:00:00Z'),growth:d.growth as any});assert.equal(r.state,'STALE');assert.equal(r.rows[0]!.audit,null);assert.equal(r.rows[0]!.reconciliation,'DAILY_AUDIT_UNAVAILABLE');
 delete d.snapshot.rows[0]!.audit;r=await readDataAudit(user,{},fetch,{...d,now,growth:d.growth as any});assert.equal(r.rows[0]!.audit,null);assert.equal(r.rows[0]!.reconciliation,'DAILY_AUDIT_UNAVAILABLE');
});
test('an incomplete exact daily period cannot reconcile against a complete weekly report',async()=>{
 const s=series();s.points.pop();const d=setup(s);const r=await readDataAudit(user,{},fetch,{...d,now,growth:d.growth as any});assert.equal(r.rows[0]!.reconciliation,'DAILY_PERIOD_INCOMPLETE');assert.equal(r.rows[0]!.totals.length,0);
});
test('optional coverage cannot invalidate emergency snapshots at large allowed rosters',()=>{
 const input=Array.from({length:400},(_,i)=>({...series(),key:'keeta:'+i,branchId:'branch'+i,sourceId:String(i),points:[],error:'FAILED'}));
 const snapshot=evaluateEmergencySnapshot(input,now);assert.equal(validEmergencySnapshot(snapshot),true);assert.ok(snapshot.rows.every(r=>!r.audit));assert.equal(snapshot.rows.length,400);
});
