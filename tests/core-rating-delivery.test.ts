import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {PostgresCoreDeliveryStore,runCoreDelivery,normalizeCoreRatings,coreAccepted,createCoreDeliveryHandler,type CoreDeliveryStore,type Claim,type DeliveryState,type CoreRating} from '../src/services/core-rating-delivery.ts';
import {createCloudHandler} from '../src/cloud-api.ts';

const row=(rating:number|null=4.3):CoreRating=>({branchId:'synthetic-branch',brand:'FRB Kabab',branch:'Synthetic',platform:'talabat',rating});
class MemoryStore implements CoreDeliveryStore{
 generation=1;handled=0;locked=false;saves:DeliveryState[]=[];
 state:DeliveryState={sequence:3,baseline:[],fingerprint:null,pending:null,lastSuccess:null,lastError:null};
 async request(){this.generation++;}
 async claim(){if(this.locked)return null;this.locked=true;return {token:'test',generation:this.generation,handled:this.handled,state:structuredClone(this.state)};}
 async save(c:Claim,s:DeliveryState,h:number){this.state=structuredClone(s);this.handled=h;c.handled=h;c.state=s;this.saves.push(structuredClone(s));}
 async release(){this.locked=false;}
}
const ack=(event:any)=>({eventId:event.eventId,ratingUpdate:{status:'applied',updates:event.ratings.length,unmapped:0}});

test('only five business fields; null distinct from zero; ambiguous or missing rows fail closed',()=>{
 const result=normalizeCoreRatings([{...row(null),reviewCount:25,observedAt:'synthetic'} as any]);
 assert.deepEqual(Object.keys(result[0]!),['branchId','brand','branch','platform','rating']);assert.equal(result[0]!.rating,null);
 for(const rows of [[row(0)],[row(NaN)],[row(),row()],[]])assert.throws(()=>normalizeCoreRatings(rows));
 assert.throws(()=>normalizeCoreRatings([row()],[{...row(),branchId:'missing'}]));
});

test('durable before send, sequence above manual deliveries, unchanged reviews/time do not send',async()=>{
 const store=new MemoryStore();let sends=0;
 const send=async(event:any)=>{sends++;assert.equal(store.state.pending!.event.eventId,event.eventId);assert.equal(event.sequence,4);return ack(event);};
 assert.equal((await runCoreDelivery(store,async()=>[row()],send)).code,'APPLIED');
 await store.request();assert.equal((await runCoreDelivery(store,async()=>[{...row(),reviewCount:100} as any],send)).code,'UNCHANGED');
 assert.equal(sends,1);assert.equal(store.state.pending,null);
});

test('unmapped and HTTP-like success do not count as applied; retry identical event before newer generation',async()=>{
 const store=new MemoryStore();let clock=1000;const events:any[]=[];
 const send=async(e:any)=>{events.push(structuredClone(e));return events.length===1?{eventId:e.eventId,ratingUpdate:{status:'applied',updates:0,unmapped:1}}:ack(e);};
 assert.equal((await runCoreDelivery(store,async()=>[row()],send,()=>clock)).code,'RETRY_PENDING');
 await store.request();assert.equal((await runCoreDelivery(store,async()=>{throw Error('must drain first');},send,()=>clock)).code,'BACKOFF');
 clock+=61000;
 assert.equal((await runCoreDelivery(store,async()=>{throw Error('must drain first');},send,()=>clock)).code,'APPLIED');
 assert.deepEqual(events[0],events[1]);assert.equal(store.handled,1);assert.equal(store.generation,2);
 assert.equal((await runCoreDelivery(store,async()=>[row(4.4)],async e=>{assert.equal(e.sequence,5);return ack(e);},()=>clock)).code,'APPLIED');
});

test('read outages preserve baseline, pending notifications and null; duplicate ack is bounded and tied to event',async()=>{
 const store=new MemoryStore();await runCoreDelivery(store,async()=>[row(null)],async e=>ack(e));await store.request();
 assert.equal((await runCoreDelivery(store,async()=>{throw Error('outage');},async()=>{throw Error('must not send');})).code,'SOURCE_INCOMPLETE');
 assert.equal(store.state.baseline[0]!.rating,null);assert.equal(store.handled,1);
 const e={eventId:'event',ratings:[row()]} as any;
 assert.equal(coreAccepted({eventId:'event',ratingUpdate:{status:'applied',updates:0,unmapped:0}},e),true);
 for(const v of [{},{eventId:'other',ratingUpdate:{status:'applied',updates:1,unmapped:0}},{eventId:'event',ratingUpdate:{status:'applied',updates:1,unmapped:1}}])assert.ok(!coreAccepted(v,e));
});

test('notifications arriving while leased remain durable and are scanned later',async()=>{
 const store=new MemoryStore();let reads=0;
 await runCoreDelivery(store,async()=>{reads++;await store.request();assert.equal((await runCoreDelivery(store,async()=>[],async()=>({}))).code,'BUSY');return [row()];},async e=>ack(e));
 assert.equal(store.handled,1);assert.equal(store.generation,2);
 assert.equal((await runCoreDelivery(store,async()=>{reads++;return [row()];},async()=>{throw Error();})).code,'UNCHANGED');assert.equal(reads,2);
});

test('PostgreSQL claim excludes concurrent workers; lease fencing and generation survive state saves',async()=>{
 const pg=new PGlite();
 const db={query:async(q:any)=>{const r=await pg.query(q.text,q.values);return {...r,rowCount:r.affectedRows};}} as any;
 try{
  const store=new PostgresCoreDeliveryStore(db);await store.request();const c=await store.claim();assert.ok(c);assert.equal(await store.claim(),null);
  await store.request();await store.save(c,c.state,c.generation);await store.release(c);
  const next=await store.claim();assert.ok(next);assert.equal(next.generation,2);assert.equal(next.handled,1);
  await assert.rejects(()=>store.save(c,c.state,2),/CORE_LEASE_LOST/);
  await store.release(c);assert.equal(await store.claim(),null);await store.release(next);
 }finally{await pg.close();}
});

test('PostgreSQL JSONB reload and process restart retain exact signed request bytes',async()=>{
 const pg=new PGlite();const db={query:async(q:any)=>{const r=await pg.query(q.text,q.values);return {...r,rowCount:r.affectedRows};}} as any;
 try{
  const store=new PostgresCoreDeliveryStore(db);await store.request();let first='';let clock=1000;
  assert.equal((await runCoreDelivery(store,async()=>[row()],async(e,raw)=>{first=raw;throw Error('ambiguous timeout');},()=>clock)).code,'RETRY_PENDING');
  clock+=61000;const restarted=new PostgresCoreDeliveryStore(db);
  assert.equal((await runCoreDelivery(restarted,async()=>{throw Error('must drain persisted event');},async(e,raw)=>{assert.equal(raw,first);assert.deepEqual(JSON.parse(raw),e);return ack(e);},()=>clock)).code,'APPLIED');
 }finally{await pg.close();}
});

async function request(handler:any,method='POST',url='/api/config?core-dispatch=1',authorization='Bearer '+'n'.repeat(48)){
 let status=0,body='';await handler({method,url,headers:{authorization}} as any,{setHeader(){},set statusCode(v:number){status=v;},end(v:string){body=v;}});return {status,body:JSON.parse(body)};
}
test('protected POST fails closed before data reads; retry does not manufacture a notification',async()=>{
 const store=new MemoryStore();store.generation=0;let reads=0;
 const env={CORE_WEBHOOK_ENABLED:'1',CORE_WEBHOOK_NOTIFY_SECRET:'n'.repeat(48),CORE_WEBHOOK_SIGNING_SECRET:'s'.repeat(48)};
 const handler=createCoreDeliveryHandler(env,fetch,{store,read:async()=>{reads++;return [row()];},deliver:async e=>ack(e)});
 assert.equal((await request(handler,'GET')).status,405);assert.equal((await request(handler,'POST',undefined,'Bearer bad')).status,401);
 assert.equal((await request(handler,'POST','/api/config?core-dispatch=1&retry=bad')).status,400);assert.equal(reads,0);
 assert.equal((await request(handler,'POST','/api/config?core-dispatch=1&retry=1')).body.code,'IDLE');assert.equal(reads,0);
 assert.equal((await request(handler)).body.code,'APPLIED');assert.equal(reads,1);
 assert.equal((await request(createCloudHandler('config',env,fetch),'POST','/api/config?core-dispatch=1','Bearer bad')).status,401);
});
