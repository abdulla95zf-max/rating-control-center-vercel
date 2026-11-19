import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {hasFeature} from '../src/feature-access.ts';
import {readEmergencySeries,readScopedEmergencies} from '../src/services/order-emergency-reader.ts';
import {evaluateEmergencySnapshot,calendarDay,type OrderSeries} from '../src/services/order-emergency-policy.ts';
import {emergencyEvents,queueEmergencyEvents,drainEmergencyEvents} from '../src/services/order-emergency-notifications.ts';
import {runWatchdog,type WatchdogStore} from '../src/services/collector-watchdog.ts';
import {createCloudHandler} from '../src/cloud-api.ts';
const now=new Date('2026-11-19T10:00:00Z');
const s:OrderSeries={key:'talabat:1',platform:'talabat',sourceId:'1',branchId:'branch1',brand:'Kabab Fareej',name:'Kabab Fareej — Ajman',lineage:'source',asOf:'2026-11-18',points:Array.from({length:8},(_,i)=>({date:calendarDay('2026-11-11',i),orders:i===7?0:5,complete:true,observedAt:now.toISOString(),revision:'r1'}))};
const snapshot=()=>evaluateEmergencySnapshot([s],now);
const roster=[{source_type:'performance:talabat',source_id:'1',id:'branch1',canonical_key:'fareej|ajman',brand:'Kabab Fareej',display_name:s.name},{source_type:'performance:keeta',source_id:'2',id:'branch2',canonical_key:'other|ajman',brand:'Other',display_name:'Other — Ajman'}];
test('server rejects missing section permission before reading database',async()=>{
 let reads=0;await assert.rejects(readScopedEmergencies({features:['overview'],role:'admin'} as any,{query:async()=>{reads++;return {rows:[]};}}));assert.equal(reads,0);
 assert.equal(hasFeature({role:'viewer',features:['overview.emergencies']},'overview.emergencies'),false);
 let code=0;const response={setHeader(){},statusCode:0,end(body:string){code=this.statusCode;assert.match(body,/denied/);}};
 await createCloudHandler('performance',{},fetch,async()=>({features:['overview'],role:'admin'} as any))({method:'GET',url:'/api/dashboard/performance/latest?dataset=order-emergencies',headers:{}} as any,response as any);assert.equal(code,403);
});
test('response enforces current active identity, platform grant and branch scope; never exposes incidents',async()=>{
 const snap=snapshot(),db={query:async(q:any)=>({rows:q.text.includes('dashboard_branch_sources')?roster:[{snapshot:snap}]})};
 const user={role:'branch_manager',features:['overview','overview.emergencies','talabat.performance'],scopes:[{type:'branch',key:'fareej|ajman'}]} as any;
 const result=await readScopedEmergencies(user,db,now);assert.equal(result.rows.length,1);assert.equal(result.rows[0]!.name,s.name);assert.equal('incidents' in result,false);assert.equal('branchId' in result.rows[0]!,false);
 assert.equal((await readScopedEmergencies({...user,features:['overview','overview.emergencies','keeta.performance']},db,now)).rows.length,0);
 assert.equal((await readScopedEmergencies({...user,scopes:[]},db,now)).rows.length,0);
 snap.rows[0]!.branchId='old-mapping';assert.equal((await readScopedEmergencies(user,db,now)).rows.length,0);
});
test('stale persisted results cannot appear as current emergencies',async()=>{
 const result=await readScopedEmergencies({role:'admin',features:null} as any,{query:async(q:any)=>({rows:q.text.includes('dashboard_branch_sources')?roster:[{snapshot:snapshot()}]})},new Date('2026-11-20T10:00:00Z'));
 assert.equal(result.rows[0]!.state,'UNKNOWN');assert.equal(result.rows[0]!.lastConfirmed,'2026-11-18');
});
test('source failure is isolated and disabled sources are unknown; no missing row becomes zero',async()=>{
 let queries=0;const db={query:async(q:any)=>{queries++;if(q.text.includes('dashboard_branch_sources'))return {rows:[...roster,{...roster[0],source_type:'rating:noon',source_id:'NOON;1;x'}]};if(q.text.includes('performance_report_current'))throw Error('private details');return {rows:[]};}};
 const result=await readEmergencySeries(db,now,{});assert.equal(queries,3);assert.equal(result.series[0]?.points.length,0);assert.equal(result.sourceErrors.talabat,'DAILY_EVIDENCE_READ_FAILED');assert.ok(result.series.some(s=>s.error==='SOURCE_DISABLED'));assert.doesNotMatch(JSON.stringify(result),/private details/);
});
test('durable outbox deduplicates opens, sends exits only with valid evidence, and does not retry ambiguous delivery',async()=>{
 const pg=new PGlite(),db={query:async(q:any)=>pg.query(q.text,q.values)};
 try{
  const snap=snapshot();await queueEmergencyEvents(snap,undefined,db);await queueEmergencyEvents(snap,snap,db);
  let sent=0;await drainEmergencyEvents(async text=>{sent++;assert.match(text,/Ajman/);assert.doesNotMatch(text,/cause is confirmed/);},db);await drainEmergencyEvents(async()=>{sent++;},db);assert.equal(sent,1);
  const missing=structuredClone(s);missing.points.pop();assert.equal(emergencyEvents(evaluateEmergencySnapshot([missing],now,snap),snap).length,0);
  const recovered=structuredClone(s);recovered.points.at(-1)!.orders=2;
  const exit=evaluateEmergencySnapshot([recovered],now,snap);assert.match(emergencyEvents(exit,snap)[0]!.body,/خروج/);
  await queueEmergencyEvents(exit,snap,db);await drainEmergencyEvents(async()=>{throw Error('timeout');},db);await drainEmergencyEvents(async()=>{sent++;},db);assert.equal(sent,1);
  const states=await pg.query<{status:string}>('SELECT status FROM dashboard_order_emergency_notifications ORDER BY status');assert.deepEqual(states.rows.map(r=>r.status),['SENT','UNKNOWN']);
 }finally{await pg.close();}
});
test('hourly scan preserves incident state across 15-minute watchdog checks and failures',async()=>{
 let saved:any=null,at=now.getTime(),scans=0,queues=0;
 const store:WatchdogStore={async locked(action){return action(saved,async next=>{saved=structuredClone(next);});}};
 const observed=async()=>['talabat','keeta'].map(platform=>({platform,state:'SUCCESS',syncTimestamp:new Date(at).toISOString(),storeCount:10})) as any;
 const hooks={scan:async()=>{scans++;return snapshot();},queue:async()=>{queues++;},drain:async()=>({sent:0,pending:false})};
 await runWatchdog(store,observed,async()=>{},()=>at,hooks);at+=900000;await runWatchdog(store,observed,async()=>{},()=>at,hooks);assert.equal(scans,1);assert.equal(queues,1);assert.ok(saved.orderEmergencies.incidents[s.key]);
 at+=3600000;await runWatchdog(store,observed,async()=>{},()=>at,{...hooks,scan:async()=>{throw Error('failed');}});assert.equal(saved.emergencyError,true);assert.ok(saved.orderEmergencies.incidents[s.key]);
});
test('Telegram health failure cannot block emergency evidence persistence',async()=>{
 let saved:any=null;const store:WatchdogStore={async locked(action){return action(null,async next=>{saved=next;});}};
 await runWatchdog(store,async()=>[],async()=>{throw Error('offline');},()=>now.getTime(),{scan:async()=>snapshot(),queue:async()=>{},drain:async()=>({sent:0,pending:false})});
 assert.ok(saved.orderEmergencies.incidents[s.key]);assert.equal(saved.platforms.talabat.health,'UNKNOWN');
});
test('initial unknown collector health notification is retried after failed Telegram delivery',async()=>{
 let saved:any=null,at=now.getTime(),sent=0;const store:WatchdogStore={async locked(action){return action(saved,async next=>{saved=next;});}};
 const hooks={scan:async()=>snapshot(),queue:async()=>{},drain:async()=>({sent:0,pending:false})};
 await runWatchdog(store,async()=>[],async()=>{throw Error('offline');},()=>at,hooks);assert.equal(saved.healthNotificationPending,true);
 at+=900000;await runWatchdog(store,async()=>[],async()=>{sent++;},()=>at,hooks);assert.equal(sent,1);assert.equal(saved.healthNotificationPending,false);
 at+=900000;await runWatchdog(store,async()=>[],async()=>{sent++;},()=>at,hooks);assert.equal(sent,1);
});
test('old emergencies get one diagnosis upgrade without waiting an hour or repeating scans',async()=>{
 const legacy=snapshot();delete legacy.rows[0]!.diagnosis;
 let saved:any={checkedAt:new Date(now.getTime()-900000).toISOString(),platforms:{talabat:{health:'UNKNOWN',lastSuccess:null},keeta:{health:'UNKNOWN',lastSuccess:null}},orderEmergencies:legacy},at=now.getTime(),scans=0;
 const store:WatchdogStore={async locked(action){return action(saved,async next=>{saved=next;});}};
 const hooks={scan:async()=>{scans++;return snapshot();},queue:async()=>{},drain:async()=>({sent:0,pending:false})};
 await runWatchdog(store,async()=>[],async()=>{},()=>at,hooks);assert.equal(scans,1);assert.ok(saved.orderEmergencies.rows[0].diagnosis);
 at+=900000;await runWatchdog(store,async()=>[],async()=>{},()=>at,hooks);assert.equal(scans,1);
});
