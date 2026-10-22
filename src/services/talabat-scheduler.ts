import {authDatabase} from '../auth.ts';
import {watchdogAuthorized} from './collector-watchdog.ts';
import type {IncomingMessage,ServerResponse} from 'node:http';

const REPO='abdulla95zf-max/talabat-rating-monitor-vercel-poc';
const MINUTE=60_000;
const workflows={ratings:'talabat-hourly.yml',performance:'talabat-performance-daily.yml',tstar:'talabat-tstar-daily.yml'} as const;
type Kind=keyof typeof workflows;
export type SchedulerSlot={kind:Kind;at:string};
type State='DISPATCHING'|'ACCEPTED'|'UNKNOWN'|'REJECTED';
type SchedulerDatabase={query(config:{text:string;values?:Array<string|null>;query_timeout:number}):Promise<{rows:any[]}>};
export interface SchedulerStore{
 claim(slot:SchedulerSlot):Promise<boolean>;
 state(slot:SchedulerSlot):Promise<{state:State;runId:string|null}>;
 finish(slot:SchedulerSlot,state:State,runId:string|null):Promise<void>;
}

export function dueTalabatSlots(now:number,startAt:string):SchedulerSlot[]{
 if(!Number.isFinite(now)||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.000Z$/.test(startAt)||!Number.isFinite(Date.parse(startAt))||new Date(Date.parse(startAt)).toISOString()!==startAt)throw Error('SCHEDULER_START_INVALID');
 const cutoff=Date.parse(startAt),day=new Date(now);day.setUTCHours(0,0,0,0);
 const dates:Record<Kind,number>={ratings:day.getTime()+Math.floor(new Date(now).getUTCHours()/6)*6*60*MINUTE+17*MINUTE,
  performance:day.getTime()+(5*60+30)*MINUTE,tstar:day.getTime()+(5*60+45)*MINUTE};
 if(dates.ratings>now)dates.ratings-=6*60*MINUTE;
 for(const kind of ['performance','tstar'] as const)if(dates[kind]>now)dates[kind]-=24*60*MINUTE;
 return (Object.keys(workflows) as Kind[]).filter(kind=>dates[kind]>=cutoff&&dates[kind]<=now&&now-dates[kind]<=(kind==='ratings'?60:360)*MINUTE)
  .sort((a,b)=>dates[a]-dates[b]).map(kind=>({kind,at:new Date(dates[kind]).toISOString()}));
}

export class PostgresSchedulerStore implements SchedulerStore{
 private readonly getDatabase:()=>SchedulerDatabase;
 constructor(getDatabase:()=>SchedulerDatabase=authDatabase){this.getDatabase=getDatabase;}
 private async db(){const db=this.getDatabase();await db.query({text:`CREATE TABLE IF NOT EXISTS dashboard_talabat_scheduler(
  workflow text NOT NULL CHECK(workflow IN('ratings','performance','tstar')),slot_at timestamptz NOT NULL,
  state text NOT NULL CHECK(state IN('DISPATCHING','ACCEPTED','UNKNOWN','REJECTED')),run_id text,
  created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workflow,slot_at))`,query_timeout:3000});return db;}
 async claim(slot:SchedulerSlot){const db=await this.db();const result=await db.query({text:"INSERT INTO dashboard_talabat_scheduler(workflow,slot_at,state) VALUES($1,$2,'DISPATCHING') ON CONFLICT(workflow,slot_at) DO NOTHING RETURNING workflow",values:[slot.kind,slot.at],query_timeout:3000});return result.rows.length===1;}
 async state(slot:SchedulerSlot){const db=await this.db();const result=await db.query({text:'SELECT state,run_id FROM dashboard_talabat_scheduler WHERE workflow=$1 AND slot_at=$2',values:[slot.kind,slot.at],query_timeout:3000});const row=result.rows[0];if(!row||!['DISPATCHING','ACCEPTED','UNKNOWN','REJECTED'].includes(row.state))throw Error('SCHEDULER_STATE_INVALID');return {state:row.state as State,runId:row.run_id??null};}
 async finish(slot:SchedulerSlot,state:State,runId:string|null){const db=this.getDatabase();const result=await db.query({text:"UPDATE dashboard_talabat_scheduler SET state=$3,run_id=$4,updated_at=now() WHERE workflow=$1 AND slot_at=$2 AND state='DISPATCHING' RETURNING workflow",values:[slot.kind,slot.at,state,runId],query_timeout:3000});if(result.rows.length!==1)throw Error('SCHEDULER_SAVE_FAILED');}
}

type Flags=Record<string,string>;
export type SchedulerGithub={flags():Promise<Flags>;busy():Promise<boolean>;dispatch(slot:SchedulerSlot):Promise<{state:'ACCEPTED'|'UNKNOWN'|'REJECTED';runId:string|null}>};
export function schedulerGithub(token:string,fetcher:typeof fetch=fetch,signal?:AbortSignal):SchedulerGithub{
 const request=(path:string,init:RequestInit={})=>{
  signal?.throwIfAborted();return fetcher(`https://api.github.com/repos/${REPO}/${path}`,{...init,redirect:'error',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000),headers:{Accept:'application/vnd.github+json',Authorization:'Bearer '+token,'X-GitHub-Api-Version':'2026-03-10',...init.headers}});
 };
 return {
  async flags(){
   const response=await request('actions/variables?per_page=100');if(!response.ok)throw Error('SCHEDULER_FLAGS_UNAVAILABLE');
   const body=await response.json() as any;if(!Array.isArray(body.variables)||!Number.isSafeInteger(body.total_count)||body.total_count>100||body.variables.length!==body.total_count)throw Error('SCHEDULER_FLAGS_UNAVAILABLE');
   const allowed=['TALABAT_EXTERNAL_SCHEDULER_ENABLED','TALABAT_COLLECTOR_MODE','REPORT_COLLECTOR_MODE','TSTAR_COLLECTOR_MODE','REPORT_DAILY_SCHEDULE_ENABLED','TSTAR_DAILY_SCHEDULE_ENABLED'];
   const out:Flags={};for(const row of body.variables)if(allowed.includes(row?.name)&&typeof row.value==='string')out[row.name]=row.value;return out;
  },
  async dispatch(slot){
   try{
    const response=await request(`actions/workflows/${workflows[slot.kind]}/dispatches`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:'main',inputs:{runner:'github',scheduler_slot:slot.at}})});
    if(response.status===204)return {state:'ACCEPTED',runId:null};
    if(response.status===200){const body=await response.json() as any;const id=body?.workflow_run_id;if(Number.isSafeInteger(id)&&id>0)return {state:'ACCEPTED',runId:String(id)};return {state:'UNKNOWN',runId:null};}
    await response.body?.cancel();return {state:[400,401,403,404,422,429].includes(response.status)?'REJECTED':'UNKNOWN',runId:null};
   }catch{return {state:'UNKNOWN',runId:null};}
  },
  async busy(){
   // Current jobs are short-lived; use the latest page and fail closed on malformed data.
   const response=await request('actions/runs?per_page=100');if(!response.ok)throw Error('SCHEDULER_RUNS_UNAVAILABLE');
   const body=await response.json() as any;if(!Array.isArray(body.workflow_runs))throw Error('SCHEDULER_RUNS_UNAVAILABLE');
   const paths=Object.values(workflows).map(file=>'.github/workflows/'+file);
   return body.workflow_runs.some((row:any)=>paths.includes(row?.path)&&row.status!=='completed');
  }
 };
}

export async function runTalabatScheduler(store:SchedulerStore,github:SchedulerGithub,now:number,startAt:string,signal?:AbortSignal){
 const slots=dueTalabatSlots(now,startAt);
 if(!slots.length)return {code:'NOT_DUE',slots:[]};
 const flags=await github.flags();
 if(flags.TALABAT_EXTERNAL_SCHEDULER_ENABLED!=='1')throw Error('NATIVE_SCHEDULER_NOT_SWITCHED');
 const required=['TALABAT_COLLECTOR_MODE','REPORT_COLLECTOR_MODE','TSTAR_COLLECTOR_MODE'];
 if(required.some(name=>flags[name]!=='github'))throw Error('SCHEDULER_RUNNER_INVALID');
 if(await github.busy())return {code:'BUSY',slots};
 const enabled=slots.filter(slot=>slot.kind==='ratings'||flags[slot.kind==='performance'?'REPORT_DAILY_SCHEDULE_ENABLED':'TSTAR_DAILY_SCHEDULE_ENABLED']==='1');
 const issues:Array<{slot:SchedulerSlot;state:State;runId:string|null}>=[];
 for(const slot of enabled){
  signal?.throwIfAborted();
  if(!await store.claim(slot)){
   const previous=await store.state(slot);
   if(previous.state!=='ACCEPTED')issues.push({slot,...previous});
   continue;
  }
  // Claim is committed before sending. Unknown delivery is never blindly resent.
  if(signal?.aborted){await store.finish(slot,'REJECTED',null);return {code:'REVIEW_REQUIRED',slot,state:'REJECTED',runId:null};}
  const result=await github.dispatch(slot);await store.finish(slot,result.state,result.runId);
  return {code:result.state==='ACCEPTED'&&!issues.length?'DISPATCHED':'REVIEW_REQUIRED',slot,...result,issues};
 }
 return {code:issues.length?'REVIEW_REQUIRED':'CHECKED',slots:enabled,issues};
}

export function createTalabatSchedulerHandler(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,store:SchedulerStore=new PostgresSchedulerStore()){
 return async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('Cache-Control','no-store, private');response.setHeader('Content-Type','application/json; charset=utf-8');
  const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
  if(request.method!=='POST'){response.setHeader('Allow','POST');return send(405,{error:'METHOD_NOT_ALLOWED'});}
  const url=new URL(request.url||'','https://dashboard.invalid');
  if(url.searchParams.size!==1||url.searchParams.get('scheduler')!=='talabat')return send(400,{error:'INVALID_SCHEDULER_REQUEST'});
  if(!watchdogAuthorized(request.headers.authorization,env.TALABAT_SCHEDULER_SECRET))return send(401,{error:'UNAUTHORIZED'});
  if(env.TALABAT_SCHEDULER_ENABLED!=='1')return send(503,{error:'SCHEDULER_DISABLED'});
  const token=env.TALABAT_GITHUB_DISPATCH_TOKEN;
  if(!token||token.length<32||token.length>1024||/\s/.test(token))return send(503,{error:'SCHEDULER_NOT_CONFIGURED'});
  const controller=new AbortController();let timer:ReturnType<typeof setTimeout>|undefined;
  try{
   const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(Error('SCHEDULER_TIMEOUT'));},22000);});
   const result=await Promise.race([runTalabatScheduler(store,schedulerGithub(token,fetcher,controller.signal),Date.now(),env.TALABAT_SCHEDULER_START_AT||'',controller.signal),deadline]);
   return send(result.code==='REVIEW_REQUIRED'?503:result.code==='BUSY'?202:200,result);
  }catch(error){
   const codes=['NATIVE_SCHEDULER_NOT_SWITCHED','SCHEDULER_FLAGS_UNAVAILABLE','SCHEDULER_RUNS_UNAVAILABLE','SCHEDULER_RUNNER_INVALID','SCHEDULER_START_INVALID','SCHEDULER_TIMEOUT'];
   return send(503,{error:error instanceof Error&&codes.includes(error.message)?error.message:'SCHEDULER_CHECK_FAILED'});
  }finally{clearTimeout(timer);}
 };
}
