import {timingSafeEqual} from 'node:crypto';
import {authDatabase} from '../auth.ts';
import {fetchLatestRatings, type CloudPlatformResult} from './latest-ratings-proxy.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';

const HOUR=3_600_000;
const PLATFORMS=['talabat','keeta'] as const;
type Platform=typeof PLATFORMS[number];
type Health='OK'|'DELAYED'|'UNKNOWN';
type State={health:Health;lastSuccess:string|null};
type Saved={checkedAt:string;platforms:Partial<Record<Platform,State>>};
export interface WatchdogStore {
  locked<T>(action:(previous:Saved|null,save:(next:Saved)=>Promise<void>)=>Promise<T>):Promise<T|null>;
}
type Observation=Pick<CloudPlatformResult,'platform'|'state'|'syncTimestamp'|'storeCount'>;
export function evaluateWatchdog(observed:Observation[],previous:Saved|null,now:number){
  const platforms={} as Record<Platform,State>,messages:string[]=[];
  for(const platform of PLATFORMS){
    const row=observed.find(r=>r.platform===platform),old=previous?.platforms[platform];
    const stamp=row?.syncTimestamp,ms=stamp?Date.parse(stamp):NaN;
    const valid=row?.state==='SUCCESS'&&row.storeCount>0&&Number.isFinite(ms)&&ms<=now+60_000&&
      (!old?.lastSuccess||ms>=Date.parse(old.lastSuccess));
    const health:Health=!valid?'UNKNOWN':now-ms>5*HOUR?'DELAYED':'OK';
    const lastSuccess=valid?stamp!:old?.lastSuccess??null;
    platforms[platform]={health,lastSuccess};
    const name=platform==='talabat'?'Talabat':'Keeta';
    if(health==='DELAYED'&&old?.health!=='DELAYED')messages.push(`${name}: بیش از ۵ ساعت بدون sync موفق ریتینگ. آخرین sync: ${dubai(lastSuccess)}. این هشدار علت توقف را مشخص نمی‌کند.`);
    if(health==='UNKNOWN'&&old?.health!=='UNKNOWN')messages.push(`${name}: بررسی sync ناموفق است؛ تازگی داده قابل تأیید نیست. این پیام به معنی انقضای session نیست.`);
    if(health==='OK'&&old&&old.health!=='OK')messages.push(`${name}: بررسی رفع شد؛ sync موفق و تازه تأیید شد. آخرین sync: ${dubai(lastSuccess)}.`);
  }
  return {next:{checkedAt:new Date(now).toISOString(),platforms},messages};
}
function dubai(value:string|null){return value?new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',dateStyle:'short',timeStyle:'short'}).format(new Date(value))+' Dubai':'unknown';}

export class PostgresWatchdogStore implements WatchdogStore {
  private readonly getDatabase:typeof authDatabase;
  constructor(getDatabase:typeof authDatabase=authDatabase){this.getDatabase=getDatabase;}
  async locked<T>(action:(previous:Saved|null,save:(next:Saved)=>Promise<void>)=>Promise<T>):Promise<T|null>{
    const db=this.getDatabase(),client=await db.connect();
    try{
      await client.query('BEGIN');
      await client.query("SET LOCAL statement_timeout = '4000ms'");
      const lease=await client.query('SELECT pg_try_advisory_xact_lock(186534,7312) AS acquired');
      if(lease.rows[0]?.acquired!==true){await client.query('ROLLBACK');return null;}
      await client.query(`CREATE TABLE IF NOT EXISTS dashboard_collector_watchdog(
        id smallint PRIMARY KEY CHECK(id=1),payload jsonb NOT NULL,updated_at timestamptz NOT NULL DEFAULT now())`);
      const result=await client.query('SELECT payload FROM dashboard_collector_watchdog WHERE id=1');
      const previous=result.rows[0]?.payload??null;
      if(previous&&!validSaved(previous))throw Error('WATCHDOG_STATE_INVALID');
      const value=await action(previous,async next=>{await client.query(`INSERT INTO dashboard_collector_watchdog(id,payload)
        VALUES(1,$1::jsonb) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload,updated_at=now()`,[JSON.stringify(next)]);});
      await client.query('COMMIT');return value;
    }catch{await client.query('ROLLBACK').catch(()=>{});throw Error('WATCHDOG_CHECK_FAILED');}
    finally{client.release();}
  }
}
function validSaved(value:any):value is Saved{
  return value&&Number.isFinite(Date.parse(value.checkedAt))&&value.platforms&&PLATFORMS.every(p=>{
    const s=value.platforms[p];return s&&['OK','DELAYED','UNKNOWN'].includes(s.health)&&
      (s.lastSuccess===null||typeof s.lastSuccess==='string'&&Number.isFinite(Date.parse(s.lastSuccess)));
  });
}
export async function runWatchdog(store:WatchdogStore,read:()=>Promise<Observation[]>,notify:(text:string)=>Promise<void>,now:()=>number=Date.now){
  return store.locked(async(previous,save)=>{
    const at=now();
    if(previous&&at-Date.parse(previous.checkedAt)>=0&&at-Date.parse(previous.checkedAt)<60_000)return {code:'THROTTLED',alertsSent:false};
    let observed:Observation[]=[];
    try{observed=await read();}catch{/* Unknown must never be reported as delayed or recovered. */}
    const plan=evaluateWatchdog(observed,previous,at);
    if(plan.messages.length)await notify('Rating collector monitor\n\n'+plan.messages.join('\n\n'));
    await save(plan.next);
    return {code:'CHECKED',alertsSent:plan.messages.length>0,checkedAt:plan.next.checkedAt,platforms:plan.next.platforms};
  });
}
export function watchdogAuthorized(header:unknown,secret:unknown){
  if(typeof secret!=='string'||secret.length<32||secret.length>512||/[\r\n]/.test(secret)||typeof header!=='string')return false;
  const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
  return expected.length===actual.length&&timingSafeEqual(expected,actual);
}
async function telegram(text:string,env:NodeJS.ProcessEnv,fetcher:typeof fetch){
  const token=env.TELEGRAM_BOT_TOKEN!,chat=env.TELEGRAM_CHAT_ID!;
  const response=await fetcher(`https://api.telegram.org/bot${token}/sendMessage`,{method:'POST',redirect:'error',
    signal:AbortSignal.timeout(5000),headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text})});
  if(!response.ok){await response.body?.cancel();throw Error('WATCHDOG_NOTIFY_FAILED');}
  const data=await response.json();if(data?.ok!==true)throw Error('WATCHDOG_NOTIFY_FAILED');
}
export function createWatchdogHandler(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,store:WatchdogStore=new PostgresWatchdogStore()){
  return async(request:IncomingMessage,response:ServerResponse)=>{
    response.setHeader('Cache-Control','no-store, private');response.setHeader('Content-Type','application/json; charset=utf-8');
    const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
    if(request.method!=='POST'){response.setHeader('Allow','POST');return send(405,{error:'METHOD_NOT_ALLOWED'});}
    if(!watchdogAuthorized(request.headers.authorization,env.COLLECTOR_WATCHDOG_SECRET))return send(401,{error:'UNAUTHORIZED'});
    if(env.COLLECTOR_WATCHDOG_ENABLED!=='1')return send(503,{error:'WATCHDOG_DISABLED'});
    if(!/^\d+:[A-Za-z0-9_-]+$/.test(env.TELEGRAM_BOT_TOKEN||'')||!(/^-?\d+$/.test(env.TELEGRAM_CHAT_ID||'')))return send(503,{error:'WATCHDOG_TELEGRAM_NOT_CONFIGURED'});
    try{
      // Bound upstream latency below the 30-second function limit, keeping the proxy's validation intact.
      const bounded:typeof fetch=(input,init)=>fetcher(input,{...init,signal:init?.signal?
        AbortSignal.any([init.signal,AbortSignal.timeout(10_000)]):AbortSignal.timeout(10_000)});
      const result=await runWatchdog(store,async()=>{
        const result=await fetchLatestRatings({host:'',port:0,talabatDatabasePath:'',publicDirectory:'',autoRefreshSeconds:60,
          ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''},bounded);
        return result.platforms;
      },text=>telegram(text,env,fetcher));
      return send(result?200:202,result??{code:'BUSY',alertsSent:false});
    }catch{return send(503,{error:'WATCHDOG_CHECK_FAILED'});}
  };
}
