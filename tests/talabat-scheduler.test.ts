import test from 'node:test';
import assert from 'node:assert/strict';
import {dueTalabatSlots,runTalabatScheduler,schedulerGithub,createTalabatSchedulerHandler,PostgresSchedulerStore,type SchedulerStore,type SchedulerGithub,type SchedulerSlot} from '../src/services/talabat-scheduler.ts';
import {createCloudHandler} from '../src/cloud-api.ts';

const start='2026-10-14T00:00:00.000Z',now=Date.parse('2026-10-14T05:45:00Z');
const flags={TALABAT_EXTERNAL_SCHEDULER_ENABLED:'1',TALABAT_COLLECTOR_MODE:'github',REPORT_COLLECTOR_MODE:'github',TSTAR_COLLECTOR_MODE:'github',REPORT_DAILY_SCHEDULE_ENABLED:'1',TSTAR_DAILY_SCHEDULE_ENABLED:'1'};
const sig=(slot:SchedulerSlot)=>slot.kind+';'+slot.at;
test('ratings have exactly four six-hour UTC slots per day and no four-hour extras',()=>{
 const slots=new Set<string>();
 for(let minute=0;minute<1440;minute++)for(const slot of dueTalabatSlots(Date.parse(start)+minute*60000,start))if(slot.kind==='ratings')slots.add(slot.at);
 assert.deepEqual([...slots],['00','06','12','18'].map(h=>`2026-10-14T${h}:17:00.000Z`));
});
function memory(){const rows=new Map<string,any>();const store:SchedulerStore={
 async claim(slot){if(rows.has(sig(slot)))return false;rows.set(sig(slot),{state:'DISPATCHING',runId:null});return true;},
 async state(slot){return rows.get(sig(slot));},async finish(slot,state,runId){rows.set(sig(slot),{state,runId});}
};return {rows,store};}
function github(overrides:Partial<SchedulerGithub>={}){return {flags:async()=>flags,busy:async()=>false,dispatch:async()=>({state:'ACCEPTED' as const,runId:'123'}),...overrides};}

test('UTC schedule, midnight, exact boundary and activation exclude previous slots',()=>{
 assert.deepEqual(dueTalabatSlots(Date.parse('2026-10-14T00:16:59Z'),start),[]);
 assert.deepEqual(dueTalabatSlots(Date.parse('2026-10-14T00:17:00Z'),start),[{kind:'ratings',at:'2026-10-14T00:17:00.000Z'}]);
 assert.deepEqual(dueTalabatSlots(Date.parse('2026-10-14T00:17:00Z'),start),[{kind:'ratings',at:'2026-10-14T00:17:00.000Z'}]);
 assert.deepEqual(dueTalabatSlots(now,start).map(s=>s.kind),['performance','tstar']);
 assert.deepEqual(dueTalabatSlots(now,'2026-10-14T05:46:00.000Z'),[]);
 assert.throws(()=>dueTalabatSlots(now,'2026-02-30T00:00:00.000Z'),/SCHEDULER_START_INVALID/);
});

test('one accepted dispatch per slot across repeated and simultaneous ticks, one new job per tick',async()=>{
 const db=memory();let dispatched=0;
 const remote=github({dispatch:async()=>{dispatched++;return {state:'ACCEPTED',runId:String(dispatched)};}});
 const at=Date.parse('2026-10-14T00:17:00Z');
 await Promise.all([runTalabatScheduler(db.store,remote,at,start),runTalabatScheduler(db.store,remote,at,start)]);
 assert.equal(dispatched,1);await runTalabatScheduler(db.store,remote,at+60000,start);assert.equal(dispatched,1);
 const first=await runTalabatScheduler(db.store,remote,now,start);assert.equal((first as any).slot.kind,'performance');
 const second=await runTalabatScheduler(db.store,remote,now+60000,start);assert.equal((second as any).slot.kind,'tstar');
 assert.equal(dispatched,3);
});

test('disabled internal cutover or wrong runner fails before claim or dispatch; busy job defers without claim',async()=>{
 const db=memory();
 for(const values of [{...flags,TALABAT_EXTERNAL_SCHEDULER_ENABLED:'0'},{...flags,TALABAT_COLLECTOR_MODE:'vercel'}])await assert.rejects(runTalabatScheduler(db.store,github({flags:async()=>values,dispatch:async()=>assert.fail()}),now,start));
 assert.equal(db.rows.size,0);
 const result=await runTalabatScheduler(db.store,github({busy:async()=>true,dispatch:async()=>assert.fail()}),now,start);
 assert.equal(result.code,'BUSY');assert.equal(db.rows.size,0);
 const disabled=await runTalabatScheduler(db.store,github({flags:async()=>({...flags,REPORT_DAILY_SCHEDULE_ENABLED:'0',TSTAR_DAILY_SCHEDULE_ENABLED:'0'}),dispatch:async()=>assert.fail()}),now,start);
 assert.equal(disabled.code,'CHECKED');
});

test('unknown delivery and failed ledger completion never resend or hide need for review',async()=>{
 const db=memory();let calls=0;
 const remote=github({dispatch:async()=>{calls++;return {state:'UNKNOWN',runId:null};}}),at=Date.parse('2026-10-14T00:17:00Z');
 assert.equal((await runTalabatScheduler(db.store,remote,at,start)).code,'REVIEW_REQUIRED');
 assert.equal((await runTalabatScheduler(db.store,remote,at+60000,start)).code,'REVIEW_REQUIRED');assert.equal(calls,1);
 const db2=memory();const store={...db2.store,finish:async()=>{throw Error('synthetic DB failure');}};
 await assert.rejects(runTalabatScheduler(store,github(),at,start));
 const retry=await runTalabatScheduler(db2.store,github({dispatch:async()=>assert.fail()}),at+60000,start);
 assert.equal(retry.code,'REVIEW_REQUIRED');
});

test('GitHub boundary uses fixed repo/main/allowlisted workflow, numeric run ID and sanitized uncertain errors',async()=>{
 const token='synthetic-token-'.repeat(4),requests:any[]=[];
 const remote=schedulerGithub(token,async(url,options)=>{requests.push({url,options});return Response.json({workflow_run_id:123});});
 const slot:SchedulerSlot={kind:'tstar',at:'2026-10-14T05:45:00.000Z'};
 assert.deepEqual(await remote.dispatch(slot),{state:'ACCEPTED',runId:'123'});
 assert.equal(requests[0].url,'https://api.github.com/repos/abdulla95zf-max/talabat-rating-monitor-vercel-poc/actions/workflows/talabat-tstar-daily.yml/dispatches');
 assert.deepEqual(JSON.parse(requests[0].options.body),{ref:'main',inputs:{runner:'github',scheduler_slot:slot.at}});
 assert.equal(requests[0].options.redirect,'error');
 for(const [fetcher,state] of [[async()=>{throw Error(token);},'UNKNOWN'],[async()=>new Response(token,{status:500}),'UNKNOWN'],[async()=>new Response(null,{status:403}),'REJECTED'],[async()=>new Response(null,{status:204}),'ACCEPTED']] as const){
  const result=await schedulerGithub(token,fetcher).dispatch(slot);assert.equal(result.state,state);assert.ok(!JSON.stringify(result).includes(token));
 }
});

test('unconfigured, unauthorized and mixed-query requests cannot read database or GitHub; config route remains compatible',async()=>{
 const secret='s'.repeat(64),base={TALABAT_SCHEDULER_SECRET:secret};
 const store:SchedulerStore={claim:async()=>assert.fail(),state:async()=>assert.fail(),finish:async()=>assert.fail()};
 for(const [headers,settings,status,url] of [[{},base,401,'/api/config?scheduler=talabat'],[{authorization:'Bearer '+secret},base,503,'/api/config?scheduler=talabat'],[{authorization:'Bearer '+secret},base,400,'/api/config?scheduler=talabat&watchdog=1']] as const){
  const response:any={setHeader(){},end(text:string){this.body=JSON.parse(text);}};
  await createTalabatSchedulerHandler(settings,async()=>assert.fail(),store)({method:'POST',headers,url} as any,response);assert.equal(response.statusCode,status);
 }
 const response:any={setHeader(){},end(text:string){this.body=JSON.parse(text);}};
 await createCloudHandler('config',{},async()=>assert.fail(),async()=>assert.fail())({method:'POST',headers:{},url:'/api/config?scheduler=talabat'} as any,response);
 assert.equal(response.statusCode,401);
});

test('Postgres slot claim commits before external call and uses unique workflow/UTC key',async()=>{
 const queries:any[]=[];
 const db:any={query:async(query:any)=>{queries.push(query);return {rows:query.text.includes('INSERT INTO')?[{workflow:'ratings'}]:[]};}};
 const store=new PostgresSchedulerStore(()=>db);
 const slot:SchedulerSlot={kind:'ratings',at:'2026-10-14T00:17:00.000Z'};
 assert.equal(await store.claim(slot),true);
 assert.match(queries[0].text,/PRIMARY KEY\(workflow,slot_at\)/);
 assert.match(queries[1].text,/ON CONFLICT\(workflow,slot_at\) DO NOTHING/);
 assert.deepEqual(queries[1].values,[slot.kind,slot.at]);
});

test('accepted slots reuse committed results across per-request store instances without repeating SQL',async()=>{
 const queries:string[]=[];
 const db:any={query:async({text}:any)=>{queries.push(text);return {rows:text.startsWith('SELECT state')?[{state:'ACCEPTED',run_id:'123'}]:[]};}};
 const slot:SchedulerSlot={kind:'ratings',at:'2026-10-14T00:17:00.000Z'};
 let clock=0;const create=()=>new PostgresSchedulerStore(()=>db,()=>clock);
 assert.equal(await create().claim(slot),false);assert.deepEqual(await create().state(slot),{state:'ACCEPTED',runId:'123'});
 assert.equal(queries.length,3);
 for(let n=0;n<60;n++){assert.equal(await create().claim(slot),false);const saved=await create().state(slot);saved.runId='changed';}
 assert.equal(queries.length,3);assert.equal((await create().state(slot)).runId,'123');
 clock=(6*60+1)*60*1000;await create().claim(slot);await create().state(slot);
 assert.equal(queries.length,5);assert.equal(queries.filter(q=>q.startsWith('CREATE TABLE')).length,1);
 const otherQueries:string[]=[];const otherDb:any={query:async({text}:any)=>{otherQueries.push(text);return {rows:[]};}};
 await new PostgresSchedulerStore(()=>otherDb).claim(slot);assert.equal(otherQueries.length,2);
});

test('uncertain or failed finishes are not cached; only persisted acceptance skips later claims',async()=>{
 const slot:SchedulerSlot={kind:'ratings',at:'2026-10-14T00:17:00.000Z'};
 for(const state of ['DISPATCHING','UNKNOWN','REJECTED'] as const){
  let selects=0;const db:any={query:async({text}:any)=>({rows:text.startsWith('SELECT state')?(selects++,[{state,run_id:null}]):[]})};
  const store=new PostgresSchedulerStore(()=>db);await store.state(slot);await store.state(slot);assert.equal(selects,2);
 }
 let fail=true,claims=0;
 const db:any={query:async({text}:any)=>{if(text.startsWith('UPDATE'))return {rows:fail?[]:[{workflow:'ratings'}]};if(text.startsWith('INSERT'))claims++;return {rows:[]};}};
 const store=new PostgresSchedulerStore(()=>db);
 await assert.rejects(store.finish(slot,'ACCEPTED','7'),/SCHEDULER_SAVE_FAILED/);
 await store.claim(slot);assert.equal(claims,1);fail=false;await store.finish(slot,'ACCEPTED','7');
 await store.claim(slot);assert.equal(claims,1);assert.deepEqual(await store.state(slot),{state:'ACCEPTED',runId:'7'});
});

test('schema initialization coalesces concurrent stores, retries failures, and accepted cache stays bounded',async()=>{
 let creates=0,fail=true;
 const db:any={query:async({text}:any)=>{if(text.startsWith('CREATE TABLE')){creates++;if(fail)throw Error('temporary');}return {rows:text.startsWith('SELECT state')?[{state:'ACCEPTED',run_id:null}]:[]};}};
 const slot:SchedulerSlot={kind:'ratings',at:'2026-10-14T00:17:00.000Z'};
 await assert.rejects(new PostgresSchedulerStore(()=>db).claim(slot),/temporary/);fail=false;
 await Promise.all(Array.from({length:20},()=>new PostgresSchedulerStore(()=>db).claim(slot)));assert.equal(creates,2);
 const store=new PostgresSchedulerStore(()=>db);let reads=0;
 const originalQuery=db.query;db.query=async(q:any)=>{if(q.text.startsWith('SELECT state'))reads++;return originalQuery(q);};
 for(let n=0;n<65;n++)await store.state({...slot,at:new Date(Date.parse(slot.at)+n*86400000).toISOString()});
 await store.state(slot);assert.equal(reads,66);
});

test('one-day repeated accepted scheduler ticks keep the same outcomes with bounded SQL',async()=>{
 let sql=0,dispatches=0;
 const db:any={query:async({text}:any)=>{sql++;return {rows:text.startsWith('SELECT state')?[{state:'ACCEPTED',run_id:null}]:[]};}};
 const day=Date.parse('2026-11-08T00:00:00Z');
 const remote=github({dispatch:async()=>{dispatches++;return {state:'ACCEPTED',runId:null};}});
 for(let minute=0;minute<1440;minute++)await runTalabatScheduler(new PostgresSchedulerStore(()=>db,()=>day+minute*60000),remote,day+minute*60000,start);
 assert.equal(dispatches,0);assert.equal(sql,13);
});
