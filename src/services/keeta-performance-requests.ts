import {randomUUID} from 'node:crypto';
import {authDatabase} from '../auth.ts';import type {AuthUser} from '../auth.ts';
export const periodTable=`CREATE TABLE IF NOT EXISTS keeta_performance_period_snapshots(id uuid PRIMARY KEY,period_from date NOT NULL,period_to date NOT NULL,observed_at timestamptz NOT NULL,payload jsonb NOT NULL)`;
export const requestTable=`CREATE TABLE IF NOT EXISTS keeta_performance_requests(id uuid PRIMARY KEY,period_from date NOT NULL,period_to date NOT NULL,requested_by text NOT NULL,status text NOT NULL CHECK(status IN ('QUEUED','RUNNING','COMPLETE','FAILED')),error_code text,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`;
export function validateKeetaPeriod(from:unknown,to:unknown,now=new Date()){
 const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
 for(const date of [from,to])if(typeof date!=='string'||!/^\d{4}-\d\d-\d\d$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date)throw Error('PERIOD_INVALID');
 const startDate=from as string,endDate=to as string,days=(Date.parse(endDate)-Date.parse(startDate))/86400000+1;
 if(days<1||days>90||endDate>=today||Date.parse(startDate)<Date.parse(today)-730*86400000)throw Error('PERIOD_INVALID');
 return {startDate,endDate};
}
export async function requestStatus(period:{startDate:string;endDate:string},db:any=authDatabase()){
 try{const r=await db.query({text:"SELECT status,error_code,updated_at FROM keeta_performance_requests WHERE period_from=$1 AND period_to=$2 ORDER BY created_at DESC,id DESC LIMIT 1",values:[period.startDate,period.endDate],query_timeout:5000});if(!r.rows.length)return null;const x=r.rows[0];if(['QUEUED','RUNNING'].includes(x.status)&&Date.now()-Date.parse(x.updated_at)>1800000)return {status:'FAILED',errorCode:'REQUEST_TIMED_OUT'};return {status:x.status,errorCode:x.error_code};}catch(e:any){if(e?.code==='42P01')return null;throw Error('REQUEST_READ_FAILED');}
}
export async function enqueueKeetaPerformance(user:AuthUser,period:{startDate:string;endDate:string},env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,pool:any=authDatabase()){
 if(!['admin','portfolio_manager'].includes(user.role))throw Error('ADMIN_REQUIRED');
 validateKeetaPeriod(period.startDate,period.endDate);
 if(!env.KEETA_GITHUB_DISPATCH_TOKEN?.trim())throw Error('DISPATCH_NOT_CONFIGURED');
 let c:any,id:string|undefined;
 try{
  c=await pool.connect();await c.query('BEGIN');await c.query("SELECT pg_advisory_xact_lock(hashtext('keeta-performance-request-queue'))");await c.query(requestTable);await c.query(periodTable);
  await c.query("UPDATE keeta_performance_requests SET status='FAILED',error_code='REQUEST_TIMED_OUT',updated_at=now() WHERE status IN ('QUEUED','RUNNING') AND updated_at<now()-interval '30 minutes'");
  const pending=await c.query("SELECT id FROM keeta_performance_requests WHERE period_from=$1 AND period_to=$2 AND status IN ('QUEUED','RUNNING') LIMIT 1",[period.startDate,period.endDate]);
  if(pending.rows.length){await c.query('COMMIT');return {status:'QUEUED',deduplicated:true};}
  const recent=await c.query("SELECT payload->>'observedAt' AS observed_at FROM keeta_performance_period_snapshots WHERE period_from=$1 AND period_to=$2 ORDER BY observed_at DESC LIMIT 1",[period.startDate,period.endDate]);
  const today=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()),ttl=period.endDate===today?3600000:86400000;
  if(recent.rows.length&&Date.now()-Date.parse(recent.rows[0].observed_at)<ttl){await c.query('COMMIT');return {status:'COMPLETE',cached:true};}
  const limits=await c.query("SELECT count(*) FILTER(WHERE created_at>now()-interval '24 hours') AS daily,count(*) FILTER(WHERE requested_by=$1 AND created_at>now()-interval '24 hours') AS personal,count(*) FILTER(WHERE status IN ('QUEUED','RUNNING')) AS pending FROM keeta_performance_requests",[user.id]);
  const x=limits.rows[0];if(Number(x.daily)>=12||Number(x.personal)>=6||Number(x.pending)>=3)throw Error('REQUEST_LIMIT_REACHED');
  id=randomUUID();await c.query("INSERT INTO keeta_performance_requests(id,period_from,period_to,requested_by,status) VALUES($1,$2,$3,$4,'QUEUED')",[id,period.startDate,period.endDate,user.id]);await c.query('COMMIT');
 }catch(e:any){await c?.query('ROLLBACK').catch(()=>{});throw Error(['REQUEST_LIMIT_REACHED'].includes(e.message)?e.message:'REQUEST_SAVE_FAILED');}finally{c?.release();}
 try{
  const response=await fetcher('https://api.github.com/repos/abdulla95zf-max/keeta-rating-monitor-cloud/actions/workflows/keeta-performance-collector.yml/dispatches',{method:'POST',redirect:'error',signal:AbortSignal.timeout(8000),headers:{accept:'application/vnd.github+json',authorization:'Bearer '+env.KEETA_GITHUB_DISPATCH_TOKEN,'X-GitHub-Api-Version':'2026-03-10','content-type':'application/json'},body:JSON.stringify({ref:'main',inputs:{period_from:period.startDate,period_to:period.endDate,request_id:id}})});
  if(![200,204].includes(response.status))throw Error('DISPATCH_FAILED');
  return {status:'QUEUED',deduplicated:false};
 }catch{await pool.query("UPDATE keeta_performance_requests SET status='FAILED',error_code='DISPATCH_FAILED',updated_at=now() WHERE id=$1 AND status='QUEUED'",[id]).catch(()=>{});throw Error('DISPATCH_FAILED');}
}
