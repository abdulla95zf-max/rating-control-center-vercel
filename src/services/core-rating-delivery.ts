import {createHash,randomUUID} from 'node:crypto';
import https from 'node:https';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {authDatabase} from '../auth.ts';
import {signCoreWebhook} from '../core-webhook-contract.ts';
import {coreRatingBrands,projectCoreRatings} from '../core-ratings-api.ts';
import {readRegisteredBranchSources} from './branch-registry.ts';
import {fetchLatestRatings} from './latest-ratings-proxy.ts';
import {readNoonRatings} from './noon-ratings.ts';
import {readDeliverooRatings} from './deliveroo-ratings.ts';
import {watchdogAuthorized} from './collector-watchdog.ts';

// Fixed approved receiver; no user-supplied upstream URL or redirects.
export const coreReceiver='https://me-central1-frb-core-production.cloudfunctions.net/receiveRccRatings';
export type CoreRating={branchId:string;brand:string;branch:string;platform:string;rating:number|null};
type Event={schemaVersion:'1';type:'rcc.ratings.changed';eventId:string;sequence:number;emittedAt:string;mode:'snapshot';ratings:CoreRating[]};
type Pending={event:Event;rawBody:string;fingerprint:string;attempts:number;nextAttempt:number};
export type DeliveryState={sequence:number;baseline:CoreRating[];fingerprint:string|null;pending:Pending|null;lastSuccess:string|null;lastError:string|null};
export type Claim={token:string;generation:number;handled:number;state:DeliveryState};
export interface CoreDeliveryStore{
 request():Promise<void>;
 claim():Promise<Claim|null>;
 save(claim:Claim,state:DeliveryState,handled:number):Promise<void>;
 release(claim:Claim):Promise<void>;
}
type Database={query:(query:any)=>Promise<{rows:any[];rowCount:number|null}>};
const initial=():DeliveryState=>({sequence:3,baseline:[],fingerprint:null,pending:null,lastSuccess:null,lastError:null});

/** Short atomic lease; events commit BEFORE network I/O. Token fences late workers. */
export class PostgresCoreDeliveryStore implements CoreDeliveryStore{
 private readonly db:Database;
 constructor(db:Database=authDatabase()){this.db=db;}
 async ready(){
  await this.db.query({text:`CREATE TABLE IF NOT EXISTS dashboard_core_delivery(id smallint PRIMARY KEY CHECK(id=1),generation bigint NOT NULL DEFAULT 0,handled bigint NOT NULL DEFAULT 0,state jsonb NOT NULL,lease text,lease_until timestamptz)`,query_timeout:4000});
  await this.db.query({text:`INSERT INTO dashboard_core_delivery(id,state) VALUES(1,$1::jsonb) ON CONFLICT(id) DO NOTHING`,values:[JSON.stringify(initial())],query_timeout:4000});
 }
 async request(){await this.ready();await this.db.query({text:'UPDATE dashboard_core_delivery SET generation=generation+1 WHERE id=1',query_timeout:4000});}
 async claim(){
  await this.ready();const token=randomUUID();
  const r=await this.db.query({text:`UPDATE dashboard_core_delivery SET lease=$1,lease_until=now()+interval '90 seconds' WHERE id=1 AND (lease IS NULL OR lease_until<now()) RETURNING generation,handled,state`,values:[token],query_timeout:4000});
  const row=r.rows[0];return row?{token,generation:Number(row.generation),handled:Number(row.handled),state:row.state as DeliveryState}:null;
 }
 async save(claim:Claim,state:DeliveryState,handled:number){
  const r=await this.db.query({text:`UPDATE dashboard_core_delivery SET state=$2::jsonb,handled=$3 WHERE id=1 AND lease=$1 AND lease_until>now()`,values:[claim.token,JSON.stringify(state),handled],query_timeout:4000});
  if(r.rowCount!==1)throw Error('CORE_LEASE_LOST');claim.state=state;claim.handled=handled;
 }
 async release(claim:Claim){await this.db.query({text:'UPDATE dashboard_core_delivery SET lease=NULL,lease_until=NULL WHERE id=1 AND lease=$1',values:[claim.token],query_timeout:4000});}
}

export function normalizeCoreRatings(rows:CoreRating[],previous:CoreRating[]=[]){
 if(!rows.length||rows.length>10000)throw Error('CORE_INCOMPLETE');
 const keys=new Set<string>();
 const clean=rows.map(r=>{
  if(!r.branchId||!r.brand||!r.branch||!['talabat','keeta','noon','deliveroo'].includes(r.platform)||!coreRatingBrands.includes(r.brand as any)&&r.brand!=='Morwarid'||r.rating!==null&&(!Number.isFinite(r.rating)||r.rating<1||r.rating>5))throw Error('CORE_INVALID');
  const key=r.branchId+'\0'+r.platform;if(keys.has(key))throw Error('CORE_AMBIGUOUS');keys.add(key);
  return {branchId:r.branchId,brand:r.brand,branch:r.branch,platform:r.platform,rating:r.rating};
 }).sort((a,b)=>(a.branchId+'\0'+a.platform).localeCompare(b.branchId+'\0'+b.platform));
 // Missing evidence never erases the baseline or becomes an inferred removal.
 if(previous.some(r=>!keys.has(r.branchId+'\0'+r.platform)))throw Error('CORE_INCOMPLETE');
 return clean;
}
const fingerprint=(rows:CoreRating[])=>createHash('sha256').update(JSON.stringify(rows)).digest('hex');
export function coreAccepted(value:any,event:Event){
 const update=value?.ratingUpdate;
 return value?.eventId===event.eventId&&update&&['applied','duplicate'].includes(update.status)&&update.unmapped===0&&Number.isSafeInteger(update.updates)&&update.updates>=0&&update.updates<=event.ratings.length;
}

export async function runCoreDelivery(store:CoreDeliveryStore,read:()=>Promise<CoreRating[]>,deliver:(event:Event,rawBody:string)=>Promise<unknown>,now:()=>number=Date.now){
 const claim=await store.claim();if(!claim)return {code:'BUSY'};
 let state=claim.state;
 try{
  // Drain oldest event first. A newer notification stays in generation until a later scan.
  if(!state.pending&&claim.generation>claim.handled){
   let rows:CoreRating[];
   try{rows=normalizeCoreRatings(await read(),state.baseline);}catch{state={...state,lastError:'SOURCE_INCOMPLETE'};await store.save(claim,state,claim.handled);return {code:'SOURCE_INCOMPLETE'};}
   const next=fingerprint(rows);
   if(next===state.fingerprint){await store.save(claim,{...state,lastError:null},claim.generation);return {code:'UNCHANGED'};}
   const event:Event={schemaVersion:'1',type:'rcc.ratings.changed',eventId:randomUUID(),sequence:state.sequence+1,emittedAt:new Date(now()).toISOString(),mode:'snapshot',ratings:rows};
   state={...state,sequence:event.sequence,pending:{event,rawBody:JSON.stringify(event),fingerprint:next,attempts:0,nextAttempt:0},lastError:null};
   await store.save(claim,state,claim.generation);
  }
  const pending=state.pending;
  if(!pending)return {code:'IDLE'};
  if(pending.nextAttempt>now())return {code:'BACKOFF',attempts:pending.attempts};
  // Persist attempt before sending. Same event/body/sequence survives ambiguous failures.
  state={...state,pending:{...pending,attempts:pending.attempts+1,nextAttempt:now()+Math.min(3600000,60000*2**Math.min(pending.attempts,6))}};
  await store.save(claim,state,claim.handled);
  let accepted=false;
  try{accepted=coreAccepted(await deliver(pending.event,pending.rawBody),pending.event);}catch{/* Retry durable event, never collection. */}
  if(!accepted){await store.save(claim,{...state,lastError:'CORE_NOT_APPLIED'},claim.handled);return {code:'RETRY_PENDING',eventId:pending.event.eventId,attempts:state.pending!.attempts};}
  await store.save(claim,{...state,pending:null,baseline:pending.event.ratings,fingerprint:pending.fingerprint,lastSuccess:new Date(now()).toISOString(),lastError:null},claim.handled);
  return {code:'APPLIED',eventId:pending.event.eventId,ratings:pending.event.ratings.length};
 }finally{await store.release(claim);}
}

/** Pinned HTTPS hostname is the approved Google receiver. TLS verification stays enabled. */
export function deliverCoreEvent(event:Event,secret:string,body=JSON.stringify(event)):Promise<unknown>{
 if(Buffer.byteLength(body)>2000000)throw Error('CORE_BODY_LIMIT');
 const timestamp=Math.floor(Date.now()/1000),signature=signCoreWebhook(body,secret,timestamp);
 return new Promise((resolve,reject)=>{
  const req=https.request(coreReceiver,{method:'POST',agent:false,rejectUnauthorized:true,headers:{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body),'X-RCC-Timestamp':String(timestamp),'X-RCC-Signature':signature,'X-RCC-Event-Id':event.eventId}},response=>{
   const chunks:Buffer[]=[];let bytes=0;
   response.on('error',()=>reject(Error('CORE_RESPONSE_FAILED')));
   response.on('data',(chunk:Buffer)=>{bytes+=chunk.length;if(bytes>65536){req.destroy(Error('CORE_RESPONSE_LIMIT'));return;}chunks.push(chunk);});
   response.on('end',()=>{if(response.statusCode!==200)return reject(Error('CORE_HTTP_FAILED'));try{resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(Error('CORE_RESPONSE_INVALID'));}});
  });
  // Wall-clock bound includes DNS/connect/TLS, not just socket inactivity.
  const timer=setTimeout(()=>req.destroy(Error('CORE_TIMEOUT')),6000);req.on('close',()=>clearTimeout(timer));req.on('error',()=>reject(Error('CORE_TRANSPORT_FAILED')));req.end(body);
 });
}

export async function readCoreDeliveryRatings(env:NodeJS.ProcessEnv,fetcher:typeof fetch=fetch){
 if(env.NOON_RATINGS_ENABLED!=='true'||env.DELIVEROO_RATINGS_ENABLED!=='true')throw Error('CORE_INCOMPLETE');
 const bounded:typeof fetch=(input,init)=>fetcher(input,{...init,signal:AbortSignal.timeout(8000)});
 const [upstream,noon,deliveroo]=await Promise.all([
  fetchLatestRatings({host:'',port:0,talabatDatabasePath:'',publicDirectory:'',autoRefreshSeconds:60,ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''},bounded),
  readNoonRatings(),readDeliverooRatings()
 ]);
 const platforms=[...upstream.platforms,noon,deliveroo];
 if(['talabat','keeta','noon','deliveroo'].some(p=>!platforms.some(s=>s.platform===p&&s.state==='SUCCESS'&&s.ratings.length)))throw Error('CORE_INCOMPLETE');
 const data=await projectCoreRatings({platforms,ratings:platforms.flatMap(p=>p.ratings)},coreRatingBrands,sources=>readRegisteredBranchSources(sources,4000),Date.now());
 if(data.partial)throw Error('CORE_INCOMPLETE');
 return data.ratings.map(r=>({branchId:r.branchId,brand:r.brand==='Marwareed'?'Morwarid':r.brand,branch:r.branchName,platform:r.platform,rating:r.rating}));
}

export function createCoreDeliveryHandler(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,dependencies:Partial<{store:CoreDeliveryStore;read:()=>Promise<CoreRating[]>;deliver:(event:Event,rawBody:string)=>Promise<unknown>}>={}){
 return async(request:IncomingMessage,response:ServerResponse)=>{
  const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
  if(request.method!=='POST')return send(405,{error:'METHOD_NOT_ALLOWED'});
  if(!watchdogAuthorized(request.headers.authorization,env.CORE_WEBHOOK_NOTIFY_SECRET))return send(401,{error:'UNAUTHORIZED'});
  if(env.CORE_WEBHOOK_ENABLED!=='1'||!/^[-_A-Za-z0-9]{43,512}$/.test(env.CORE_WEBHOOK_SIGNING_SECRET||''))return send(503,{error:'CORE_DISABLED'});
  const url=new URL(request.url||'/','https://rcc.invalid');
  if([...url.searchParams.keys()].some(k=>!['core-dispatch','retry'].includes(k))||url.searchParams.getAll('core-dispatch').length!==1||url.searchParams.get('core-dispatch')!=='1'||url.searchParams.getAll('retry').length>1||url.searchParams.has('retry')&&url.searchParams.get('retry')!=='1')return send(400,{error:'INVALID_REQUEST'});
  try{
   const store=dependencies.store??new PostgresCoreDeliveryStore();
   if(!url.searchParams.has('retry'))await store.request();
   const result=await runCoreDelivery(store,dependencies.read??(()=>readCoreDeliveryRatings(env,fetcher)),dependencies.deliver??((event,raw)=>deliverCoreEvent(event,env.CORE_WEBHOOK_SIGNING_SECRET!,raw)));
   return send(['RETRY_PENDING','SOURCE_INCOMPLETE'].includes(result.code)?503:result.code==='BUSY'?202:200,result);
  }catch{return send(503,{error:'CORE_DELIVERY_FAILED'});}
 };
}
