import test from 'node:test';
import assert from 'node:assert/strict';
import {evaluateWatchdog,runWatchdog,watchdogAuthorized,createWatchdogHandler,PostgresWatchdogStore,type WatchdogStore} from '../src/services/collector-watchdog.ts';
import {createCloudHandler} from '../src/cloud-api.ts';

const at=Date.parse('2026-10-13T14:00:00.000Z'),hour=3_600_000;
function rows(age:number){return ['talabat','keeta'].map(platform=>({platform,state:'SUCCESS',storeCount:platform==='talabat'?58:13,syncTimestamp:new Date(at-age*hour).toISOString()})) as any;}
function memory(){let saved:any=null,busy=false;
  const store:WatchdogStore={async locked(action){if(busy)return null;busy=true;try{return await action(saved,async next=>{saved=structuredClone(next);});}finally{busy=false;}}};
  return {store,get:()=>saved};
}
test('per-platform schedule thresholds use successful sync; exact boundaries are healthy',()=>{
  assert.equal(evaluateWatchdog(rows(24),null,at).next.platforms.keeta.health,'OK');
  assert.equal(evaluateWatchdog(rows(26),null,at).next.platforms.keeta.health,'OK');
  assert.equal(evaluateWatchdog(rows(7.01),null,at).next.platforms.talabat.health,'DELAYED');
  assert.equal(evaluateWatchdog(rows(7),null,at).messages.length,0);
  const plan=evaluateWatchdog(rows(26.01),null,at);
  assert.equal(plan.messages.length,2);assert.equal(plan.next.platforms.keeta.health,'DELAYED');
  const carried=rows(1);carried[1].timestamp='2026-09-01T00:00:00.000Z';carried[1].carriedForward=true;
  assert.equal(evaluateWatchdog(carried,null,at).next.platforms.keeta.health,'OK');
});
test('missing, error, empty, future and regressing timestamps cannot recover',()=>{
  const old=evaluateWatchdog(rows(8),null,at).next;
  for(const input of [[],rows(1).map((r:any)=>({...r,state:'ERROR'})),rows(1).map((r:any)=>({...r,state:'EMPTY'})),
    rows(1).map((r:any)=>({...r,syncTimestamp:'invalid'})),rows(-1),rows(9)]){
    const plan=evaluateWatchdog(input,old,at);assert.equal(plan.next.platforms.talabat.health,'UNKNOWN');
    assert.equal(plan.next.platforms.talabat.lastSuccess,old.platforms.talabat.lastSuccess);
    assert.ok(plan.messages.every(m=>!m.includes('رفع شد')));
  }
});
test('stale notification deduplicates; recovery only once; next outage alerts again',async()=>{
  const db=memory(),sent:string[]=[];let time=at;
  const notify=async(text:string)=>{sent.push(text);};
  await runWatchdog(db.store,async()=>rows(8),notify,()=>time);assert.equal(sent.length,1);
  time+=900_000;await runWatchdog(db.store,async()=>rows(8),notify,()=>time);assert.equal(sent.length,1);
  time+=900_000;await runWatchdog(db.store,async()=>rows(1),notify,()=>time);assert.equal(sent.length,2);assert.match(sent[1]!,/رفع شد/);
  time+=900_000;await runWatchdog(db.store,async()=>rows(1),notify,()=>time);assert.equal(sent.length,2);
  time+=900_000;await runWatchdog(db.store,async()=>rows(8),notify,()=>time);assert.equal(sent.length,3);
});
test('upstream failure is unknown, deduplicated and not false recovery',async()=>{
  const db=memory(),sent:string[]=[];let time=at;
  const notify=async(t:string)=>{sent.push(t);};
  await runWatchdog(db.store,async()=>rows(8),notify,()=>time);
  time+=900_000;await runWatchdog(db.store,async()=>{throw Error('private');},notify,()=>time);
  assert.equal(db.get().platforms.keeta.health,'UNKNOWN');assert.doesNotMatch(sent[1]!,/private|رفع شد/);
  time+=900_000;await runWatchdog(db.store,async()=>{throw Error('private');},notify,()=>time);assert.equal(sent.length,2);
  time+=900_000;await runWatchdog(db.store,async()=>rows(1),notify,()=>time);assert.match(sent[2]!,/رفع شد/);
});
test('failed delivery leaves state unchanged and next check retries',async()=>{
  const db=memory();await assert.rejects(runWatchdog(db.store,async()=>rows(8),async()=>{throw Error('failed');},()=>at));
  assert.equal(db.get(),null);let sent=0;
  await runWatchdog(db.store,async()=>rows(8),async()=>{sent++;},()=>at+900_000);assert.equal(sent,1);
});
test('overlapping invocation does not notify twice; rapid repeat is throttled',async()=>{
  const db=memory();let release!:()=>void,entered!:()=>void,sent=0;
  const ready=new Promise<void>(r=>{entered=r;}),gate=new Promise<void>(r=>{release=r;});
  const first=runWatchdog(db.store,async()=>{entered();await gate;return rows(8);},async()=>{sent++;},()=>at);
  await ready;assert.equal(await runWatchdog(db.store,async()=>rows(8),async()=>{sent++;},()=>at),null);
  release();await first;assert.equal(sent,1);
  const result=await runWatchdog(db.store,async()=>assert.fail('throttled'),async()=>assert.fail(),()=>at+1000);
  assert.equal(result?.code,'THROTTLED');
});
test('bearer authorization fails closed and does not accept dashboard session or query secret',()=>{
  const secret='s'.repeat(64);assert.equal(watchdogAuthorized('Bearer '+secret,secret),true);
  for(const header of [undefined,['Bearer '+secret],'Bearer short','Basic '+secret,'Bearer '+secret+'x'])assert.equal(watchdogAuthorized(header,secret),false);
  for(const secret of [undefined,'short','x'.repeat(513),'x'.repeat(32)+'\n'])assert.equal(watchdogAuthorized('Bearer '+secret,secret),false);
});
function response(){const headers:any={};return {headers,statusCode:0,body:'',setHeader(k:string,v:any){headers[k]=v;},end(t:string){this.body=t;}};}
test('unauthorized/disabled requests never touch database or upstream; existing config GET remains intact',async()=>{
  const env={COLLECTOR_WATCHDOG_SECRET:'s'.repeat(64),COLLECTOR_WATCHDOG_ENABLED:'1'},store:WatchdogStore={locked:async()=>assert.fail('DB')};
  const h=createWatchdogHandler(env,async()=>assert.fail('network'),store);
  const res=response();await h({method:'POST',headers:{},url:'/api/config?watchdog=1'} as any,res as any);assert.equal(res.statusCode,401);
  const get=response();await h({method:'GET',headers:{authorization:'Bearer '+env.COLLECTOR_WATCHDOG_SECRET}} as any,get as any);assert.equal(get.statusCode,405);
  const disabled=response();await createWatchdogHandler({...env,COLLECTOR_WATCHDOG_ENABLED:'0'},async()=>assert.fail(),store)(
    {method:'POST',headers:{authorization:'Bearer '+env.COLLECTOR_WATCHDOG_SECRET}} as any,disabled as any);assert.equal(disabled.statusCode,503);
  let authenticated=0;const config=createCloudHandler('config',env,async()=>assert.fail(),async()=>{authenticated++;return {} as any;});
  const normal=response();await config({method:'GET',headers:{},url:'/api/config'} as any,normal as any);
  assert.equal(authenticated,1);assert.deepEqual(JSON.parse(normal.body),{cloudRatings:true,autoRefreshSeconds:60});
  const bad=response();await config({method:'POST',headers:{},url:'/api/config?watchdog=1'} as any,bad as any);
  assert.equal(bad.statusCode,401);assert.equal(authenticated,1);
});
test('Telegram rejection is redacted and not persisted',async()=>{
  const db=memory(),secret='s'.repeat(64),env={COLLECTOR_WATCHDOG_ENABLED:'1',COLLECTOR_WATCHDOG_SECRET:secret,
    TELEGRAM_BOT_TOKEN:'123456:private_token',TELEGRAM_CHAT_ID:'-123456',RATINGS_API_URL:'https://test.invalid/api/ratings/latest',RATINGS_API_TOKEN:'t'.repeat(64)};
  const fetcher:typeof fetch=async(url,init)=>{
    if(String(url).startsWith('https://api.telegram.org/')){assert.equal(init?.method,'POST');assert.equal(init?.redirect,'error');return Response.json({ok:false,description:env.TELEGRAM_BOT_TOKEN});}
    throw Error('upstream unavailable');
  };
  const res=response();await createWatchdogHandler(env,fetcher,db.store)({method:'POST',headers:{authorization:'Bearer '+secret}} as any,res as any);
  assert.equal(res.statusCode,503);assert.equal(db.get(),null);assert.doesNotMatch(res.body,/private_token|tttt|ssss/);
});
test('validated upstream success alerts only the delayed platform and confirms Telegram acknowledgement',async()=>{
  const db=memory(),secret='s'.repeat(64),env={COLLECTOR_WATCHDOG_ENABLED:'1',COLLECTOR_WATCHDOG_SECRET:secret,
    TELEGRAM_BOT_TOKEN:'123456:test_token',TELEGRAM_CHAT_ID:'-123456',RATINGS_API_URL:'https://test.invalid/api/ratings/latest',RATINGS_API_TOKEN:'t'.repeat(64)};
  const current=new Date().toISOString(),old=new Date(Date.now()-8*hour).toISOString();
  const platform=(name:string,stamp:string)=>{
    const row={platform:name,storeIdentityKey:name==='talabat'?'TB_AE;1':'KEETA;1',storeName:'Synthetic',rating:4.4,
      reviewCount:10,oneStarCount:0,timestamp:stamp,syncTimestamp:stamp,carriedForward:false,
      previousRating:null,previousReviewCount:null,previousOneStarCount:null,previousTimestamp:null};
    return {platform:name,state:'SUCCESS',storeCount:1,syncTimestamp:stamp,emptyReason:null,errorCode:null,ratings:[row]};
  };
  const platforms=[platform('talabat',old),platform('keeta',current)];let telegrams=0;
  const fetcher:typeof fetch=async(url,init)=>{
    if(String(url).startsWith('https://api.telegram.org/')){
      telegrams++;const body=JSON.parse(String(init?.body));assert.equal(body.chat_id,env.TELEGRAM_CHAT_ID);
      assert.match(body.text,/Talabat/);assert.doesNotMatch(body.text,/Keeta/);
      return Response.json({ok:true,result:{message_id:1}});
    }
    assert.match(String(url),/platform=all/);assert.equal((init?.headers as any).Authorization,'Bearer '+env.RATINGS_API_TOKEN);
    return Response.json({ok:true,selector:'all',storeCount:2,platforms,ratings:platforms.flatMap(p=>p.ratings)});
  };
  const res=response();await createWatchdogHandler(env,fetcher,db.store)({method:'POST',headers:{authorization:'Bearer '+secret}} as any,res as any);
  assert.equal(res.statusCode,200);assert.equal(telegrams,1);assert.equal(db.get().platforms.keeta.health,'OK');
  assert.equal(db.get().platforms.talabat.health,'DELAYED');assert.doesNotMatch(res.body,/test_token|tttt|ssss/);
});
test('Postgres transaction lock, busy, rollback and release paths',async()=>{
  for(const mode of ['success','busy','failure','corrupt'] as const){
    const queries:string[]=[];let released=0,called=0;
    const client={release(){released++;},async query(sql:string){queries.push(sql);
      if(sql.includes('pg_try'))return {rows:[{acquired:mode!=='busy'}]};
      if(sql.startsWith('SELECT payload'))return {rows:mode==='corrupt'?[{payload:{checkedAt:'bad'}}]:[]};return {rows:[]};}};
    const store=new PostgresWatchdogStore((()=>({connect:async()=>client})) as any);
    const action=async(previous:any,save:any)=>{called++;assert.equal(previous,null);if(mode==='failure')throw Error('secret');await save(evaluateWatchdog(rows(1),null,at).next);return 42;};
    if(mode==='failure'||mode==='corrupt')await assert.rejects(store.locked(action),{message:'WATCHDOG_CHECK_FAILED'});
    else assert.equal(await store.locked(action),mode==='busy'?null:42);
    assert.equal(released,1);assert.equal(called,mode==='busy'||mode==='corrupt'?0:1);
    assert.ok(queries.includes(mode==='success'?'COMMIT':'ROLLBACK'));
    if(mode==='busy')assert.ok(!queries.some(q=>q.includes('CREATE TABLE')));
  }
});
