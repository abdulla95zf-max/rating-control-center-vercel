import test from 'node:test';import assert from 'node:assert/strict';
import {evaluateEmergencySnapshot,calendarDay,type OrderSeries} from '../src/services/order-emergency-policy.ts';
import {publicEmergencyDiagnosis,type EmergencyContext} from '../src/services/order-emergency-diagnostics.ts';
import {emergencyContext,scanOrderEmergencies,readScopedEmergencies} from '../src/services/order-emergency-reader.ts';
const now=new Date('2026-11-19T10:00:00Z');
const context=(overrides:Partial<EmergencyContext>={}):EmergencyContext=>({kind:'events',impressions:1000,visits:100,cart:20,placed:10,cancelled:0,offlineMinutes:0,scheduledMinutes:600,...overrides});
function input(current:Partial<EmergencyContext>={}):OrderSeries{return {key:'talabat:1',platform:'talabat',sourceId:'1',branchId:'b',brand:'FRB',name:'Branch',lineage:'source',asOf:'2026-11-18',points:Array.from({length:8},(_,i)=>({date:calendarDay('2026-11-11',i),orders:i===7?1:5,complete:true,revision:'r'+i,observedAt:now.toISOString(),context:context(i===7?current:{})}))};}
const diagnose=(s:OrderSeries)=>evaluateEmergencySnapshot([s],now).rows[0]!.diagnosis!;
test('matched visibility and ordering evidence selects a specific next check without asserting a cause',()=>{
 const traffic=diagnose(input({visits:10,impressions:100,placed:1}));assert.equal(traffic.primary?.code,'VISITS');assert.equal(traffic.primary?.baseline,100);assert.equal(traffic.primary?.current,10);
 const ordering=diagnose(input({placed:1}));assert.equal(ordering.primary?.code,'ORDERING');assert.equal(ordering.primary?.baseline,10);assert.equal(ordering.primary?.current,1);assert.match(ordering.primary?.check||'',/menu/);assert.match(ordering.limits.at(-1)!,/do not establish/);
 assert.ok(ordering.measurements.some(m=>m.metric==='cart'&&m.baseline===20));
});
test('availability uses ratio of summed minutes, not average daily percentages',()=>{
 const s=input({offlineMinutes:120,scheduledMinutes:600});s.points[0]!.context=context({offlineMinutes:60,scheduledMinutes:60});
 const result=diagnose(s);assert.equal(result.primary?.code,'OFFLINE');assert.equal(result.primary?.baseline,60/3660*100);assert.equal(result.primary?.current,20);
});
test('cancellation denominator and rejected daily counts stay distinct',()=>{
 const result=diagnose(input({cancelled:2}));assert.equal(result.primary?.code,'CANCELLATIONS');assert.equal(result.primary?.current,2/3*100);
 const s=input({rejected:3});s.platform='deliveroo';s.points.forEach((p,i)=>{p.context=context({impressions:null,visits:null,cart:null,placed:null,cancelled:null,offlineMinutes:null,scheduledMinutes:null,rejected:i===7?3:0});});
 const rejection=diagnose(s);assert.equal(rejection.primary?.metric,'Rejected orders');assert.equal(rejection.primary?.unit,'orders');assert.equal(rejection.primary?.changeUnit,'count');
});
test('missing, duplicate, mismatched-unit and invalid baseline context suppresses explanations',()=>{
 for(const mutate of [(s:OrderSeries)=>{delete s.points[0]!.context;},(s:OrderSeries)=>{s.points[0]!.context!.kind='customers';},(s:OrderSeries)=>{s.points[0]!.complete=false;}]){const s=input({placed:0});mutate(s);const result=diagnose(s);if(result)assert.equal(result.primary,null);}
 const s=input({visits:0,placed:1});assert.notEqual(diagnose(s).primary?.code,'ORDERING');
 const small=input({visits:3,placed:0});small.points.forEach((p,i)=>{p.context=context({visits:i===7?3:5,impressions:5,placed:0});});assert.equal(diagnose(small).primary,null);
});
test('explanations use frozen pre-incident dates through a continued outage and disappear on unknown data',()=>{
 const s=input({visits:10}),initial=evaluateEmergencySnapshot([s],now);s.asOf='2026-11-19';s.points.push({...s.points.at(-1)!,date:'2026-11-19',revision:'r8',observedAt:'2026-11-20T00:00:00Z',context:context({visits:5})});
 const next=evaluateEmergencySnapshot([s],new Date('2026-11-20T10:00:00Z'),initial);assert.equal(next.rows[0]!.diagnosis?.baselineFrom,'2026-11-11');assert.equal(next.rows[0]!.diagnosis?.primary?.baseline,100);
 s.error='READ_FAILED';assert.equal(evaluateEmergencySnapshot([s],now,initial).rows[0]!.diagnosis,undefined);
});
test('platform mapping rejects duplicate Keeta shop contexts and preserves Noon hour units',()=>{
 const conversion=[{code:'shop_entry_user_num',value:100},{code:'shop_pay_user_num',value:10}];
 assert.equal(emergencyContext('keeta',{customers:[conversion]}).visits,100);
 assert.equal(emergencyContext('keeta',{customers:[conversion,conversion]}).visits,null);
 assert.equal(emergencyContext('keeta',{customers:[[{code:'shop_entry_user_num',value:2},{code:'shop_entry_user_num',value:3}]]}).visits,null);
 assert.equal(emergencyContext('noon',{offHours:2,totalHours:10}).offlineMinutes,120);
 assert.equal(emergencyContext('keeta',{opening:[{code:'shop_avg_closing_duration',value:1},{code:'shop_daily_average_opening_duration',value:11}]}).scheduledMinutes,720);
 assert.equal(emergencyContext('talabat',{visits:1.5}).visits,null);
 assert.equal(emergencyContext('deliveroo',{rejected:[2,3]}).rejected,null);
});
test('derived response projection rejects malformed evidence and strips extra private fields',()=>{
 const d=diagnose(input({visits:1}));assert.equal(publicEmergencyDiagnosis({...d,private:'hidden'})?.primary?.code,'VISITS');assert.equal('private' in publicEmergencyDiagnosis({...d,private:'hidden'})!,false);
 assert.equal(publicEmergencyDiagnosis({...d,measurements:[{metric:'x',current:Infinity,baseline:1,unit:'events'}]}),undefined);
});
test('Talabat enrichment failures cannot erase an emergency or trigger collection',async()=>{
 const s=input(),roster=[{source_type:'performance:talabat',source_id:'1',id:'b',canonical_key:'b',brand:'FRB',display_name:'Branch'}];let reads=0;
 const db={query:async(q:any)=>{reads++;if(q.text.includes('dashboard_branch_sources'))return {rows:roster};if(q.values?.length===3)throw Error('enrichment unavailable');return {rows:s.points.map(p=>({source_id:'1',lineage:'source',anchor:s.asOf,date:p.date,observed_at:p.observedAt,revision:p.revision,complete:true,orders:p.orders,sales:p.orders!*50}))};}};
 const snap=await scanOrderEmergencies(undefined,now,db,{});assert.equal(reads,3);assert.equal(snap.rows[0]!.state,'EMERGENCY');assert.equal(snap.rows[0]!.diagnosis?.primary,null);
 const response=await readScopedEmergencies({role:'admin',features:null,isOwner:true} as any,{query:async(q:any)=>({rows:q.text.includes('dashboard_branch_sources')?roster:[{snapshot:snap}]})},now);assert.equal(response.rows[0]!.diagnosis?.state,'INSUFFICIENT');
});
