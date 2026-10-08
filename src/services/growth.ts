import {revisionProjection} from './report-revision-projection.ts';
import {authDatabase,type AuthUser} from '../auth.ts';
import {fetchPerformance,fetchKeetaPerformance,validReportDate} from './performance-proxy.ts';
import {scopePerformance,scopeKeetaPerformance} from './branch-identity.ts';
import {readNoonPerformance,scopeNoonPerformance} from './noon-performance.ts';
type Database={query(q:any):Promise<{rows:any[]}>};
export type GrowthPeriod={from:string;to:string;previousFrom:string;previousTo:string};
export const growthNumber=(v:unknown):number|null=>{if(v===null||v===undefined||v==='')return null;const s=String(v).trim();if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;const n=Number(s.replaceAll(',',''));return Number.isFinite(n)?n:null;};
const day=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
const days=(f:string,t:string)=>(Date.parse(t)-Date.parse(f))/86400000+1;
export function validGrowthPeriod(p:GrowthPeriod){return Object.values(p).every(validReportDate)&&days(p.from,p.to)===7&&days(p.previousFrom,p.previousTo)===7&&p.previousTo<p.from;}
const today=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export function growthRow(identity:string,name:string,period:GrowthPeriod,current:{sales:number|null;orders:number|null},previous:{sales:number|null;orders:number|null},reason:string|null=null){
 const integer=(v:number|null)=>v!==null&&Number.isSafeInteger(v)&&v>=0;
 if(!reason&&(!integer(current.orders)||!integer(previous.orders)||current.sales===null||previous.sales===null||!Number.isFinite(current.sales)||!Number.isFinite(previous.sales)||current.sales<0||previous.sales<0))reason='METRICS_MISSING';
 if(!reason&&(current.orders===0&&current.sales!==0||previous.orders===0&&previous.sales!==0))reason='SALES_ORDERS_MISMATCH';
 const aov=current.orders&&current.sales!==null?current.sales/current.orders:null,previousAov=previous.orders&&previous.sales!==null?previous.sales/previous.orders:null,delta=reason?null:current.sales!-previous.sales!,ordersDelta=reason?null:current.orders!-previous.orders!;
 // Symmetric decomposition splits the interaction equally; effects reconcile exactly.
 const orderEffect=delta!==null&&aov!==null&&previousAov!==null?(current.orders!-previous.orders!)*(aov+previousAov)/2:null,basketEffect=delta!==null&&aov!==null&&previousAov!==null?(aov-previousAov)*(current.orders!+previous.orders!)/2:null;
 return {identity,name,period,current,previous,aov,previousAov,delta,deltaPercent:delta!==null&&previous.sales!>0?delta/previous.sales!*100:null,ordersDelta,orderEffect,basketEffect,reason,eligible:reason===null,lowVolume:current.orders!==null&&current.orders<20};
}
const freshness=(period:GrowthPeriod,observedAt:unknown,now:Date)=>{if(!validGrowthPeriod(period))return 'PERIOD_NOT_COMPARABLE';if(period.to>=today(now))return 'PERIOD_INCOMPLETE';const lag=days(period.to,today(now))-1;if(lag>3)return 'REPORT_STALE';if(typeof observedAt!=='string'||!Number.isFinite(Date.parse(observedAt))||Date.parse(observedAt)>now.getTime()+300000||now.getTime()-Date.parse(observedAt)>48*3600000)return 'COLLECTION_STALE';return null;};
/** Talabat's confirmed no-order export pattern; applies only to Growth, never raw storage. */
export function talabatZeroOrderDay(row:any):boolean{
 const v=row.raw_metrics;if(row.raw_present!==true||!v||typeof v!=='object'||Array.isArray(v))return false;
 const identity=(s:string)=>s.trim().toLowerCase().replace(/\s+/g,' ');
 const entries=Object.entries(v),values=(key:string)=>entries.filter(([name])=>identity(name)===identity(key)).map(([,value])=>value);
 const value=(key:string)=>{const matches=values(key);return matches.length===1?matches[0]:undefined;};
 const blank=(x:unknown)=>x===null||x===undefined||typeof x==='string'&&x.trim()==='';
 if(!blank(row.sales)||!blank(row.orders))return false;
 if(growthNumber(value('Placed an order'))!==0||!(growthNumber(value('Scheduled Open Time (Minutes)'))!>0))return false;
 if(!(growthNumber(value('Impressions'))!>0||growthNumber(value('Viewed your menu'))!>0))return false;
 const trading=['Gross Sales','Successful Orders','Orders count','Cancelled Orders','Online Sales','Cash Sales','Delivery Sales','Pickup Sales','Online Orders','Cash Orders','Delivery Orders','Pickup Orders','Pro Orders','Pro Revenue','Items count'];
 const projected=row.metrics;if(!projected||typeof projected!=='object'||Array.isArray(projected))return false;
 const noContradictions=Object.entries(projected).every(([key,x])=>!trading.some(name=>identity(name)===identity(key))||blank(x)||growthNumber(x)===0);
 return noContradictions&&trading.every(key=>{const matches=values(key);return matches.length>0&&matches.every(x=>blank(x)||growthNumber(x)===0);});
}
export async function readTalabatGrowth(data:any,db:Database,now=new Date()){
 if(data.state!=='SUCCESS'||!validReportDate(data.reportDate))return {platform:'talabat',state:'EMPTY',rows:[],period:null,observedAt:null,errorCode:null};
 const to=data.reportDate,p={from:day(to,-6),to,previousFrom:day(to,-13),previousTo:day(to,-7)},ids=data.rows.map((r:any)=>r.storeId);if(ids.length>500)throw Error('SCOPE_TOO_LARGE');
 if(!ids.length)return {platform:'talabat',state:'SUCCESS',rows:[],period:p,observedAt:data.receivedAt,errorCode:null};
 const result=await db.query({text:`SELECT c.source_key,c.report_date::text AS report_date,r.store_id,(r.present OR resolved.values IS NOT NULL) AS present,resolved.values->>'Successful Orders' AS orders,resolved.values->>'Gross Sales' AS sales,resolved.values AS metrics,r.present AS raw_present,r.source_values AS raw_metrics FROM public.performance_report_current c JOIN public.performance_report_rows r USING(revision_id) ${revisionProjection} WHERE r.store_id=ANY($1::text[]) AND c.report_date BETWEEN $2::date AND $3::date ORDER BY c.source_key,c.report_date,r.store_id LIMIT 14001`,values:[ids,p.previousFrom,p.to],query_timeout:6000});
 if(result.rows.length>14000)throw Error('HISTORY_TOO_LARGE');
 const sources=[...new Set(result.rows.map(r=>r.source_key))].filter(source=>data.rows.filter((r:any)=>r.present).every((r:any)=>{const candidates=result.rows.filter(x=>x.source_key===source&&x.report_date===to&&x.store_id===r.storeId);return candidates.length===1&&candidates[0].present===true&&growthNumber(candidates[0].orders)===growthNumber(r.values['Successful Orders'])&&growthNumber(candidates[0].sales)===growthNumber(r.values['Gross Sales']);}));
 if(sources.length!==1)throw Error(sources.length?'SOURCE_AMBIGUOUS':'HISTORY_SOURCE_UNCONFIRMED');
 const rows=data.rows.map((r:any)=>{const history=result.rows.filter(x=>x.source_key===sources[0]&&x.store_id===r.storeId).map(x=>talabatZeroOrderDay(x)?{...x,sales:'0',orders:'0'}:x),sum=(from:string,to:string)=>{const selected=history.filter(x=>x.report_date>=from&&x.report_date<=to),unique=new Set(selected.map(x=>x.report_date));const complete=selected.length===7&&unique.size===7&&selected.every(x=>x.present===true&&growthNumber(x.sales)!==null&&growthNumber(x.orders)!==null&&Number.isSafeInteger(growthNumber(x.orders)));return {complete,sales:complete?selected.reduce((n,x)=>n+growthNumber(x.sales)!,0):null,orders:complete?selected.reduce((n,x)=>n+growthNumber(x.orders)!,0):null};},current=sum(p.from,p.to),previous=sum(p.previousFrom,p.previousTo),reason=freshness(p,data.receivedAt,now)||(!current.complete?'CURRENT_DAYS_MISSING':!previous.complete?'PREVIOUS_DAYS_MISSING':null);return growthRow('TB_AE;'+r.storeId,r.storeName||'Unnamed branch',p,current,previous,reason);});
 return {platform:'talabat',state:'SUCCESS',rows,period:p,observedAt:data.receivedAt,errorCode:null};
}
export async function readKeetaGrowth(data:any,db:Database,now=new Date()){
 if(data.state!=='SUCCESS'||!data.snapshot)return {platform:'keeta',state:'EMPTY',rows:[],period:null,observedAt:null,errorCode:null};
 const s=data.snapshot,p={from:s.periodFrom,to:s.periodTo,previousFrom:s.comparisonFrom,previousTo:s.comparisonTo};
 const ids=s.shops.map((shop:any)=>String(shop?.shopId));if(ids.length>500||ids.some((id:string)=>!/^\d{1,80}$/.test(id))||new Set(ids).size!==ids.length)throw Error('SCOPE_INVALID');
 if(!validGrowthPeriod(p))return {platform:'keeta',state:'ERROR',rows:[],period:p,observedAt:s.observedAt,errorCode:'PERIOD_NOT_COMPARABLE'};
 const embedded=(shop:any)=>{const c=shop.businessComparison;if(c?.from!==p.previousFrom||c?.to!==p.previousTo||c?.verifiedBy!=='SOURCE_CHANGE_RATIOS')return null;const sales=growthNumber(c.sales),orders=growthNumber(c.orders);return sales!==null&&orders!==null&&Number.isSafeInteger(orders)?{sales,orders}:null;};
 const old=s.shops.every((shop:any)=>embedded(shop))?{rows:[]}:await db.query({text:'SELECT payload FROM keeta_performance_snapshots WHERE period_from=$1::date AND period_to=$2::date ORDER BY observed_at DESC,run_id DESC LIMIT 1',values:[p.previousFrom,p.previousTo],query_timeout:6000});
 const payload=old.rows[0]?.payload;if(payload&&(payload.periodFrom!==p.previousFrom||payload.periodTo!==p.previousTo||!Array.isArray(payload.shops)||payload.shops.length>500))throw Error('PREVIOUS_REPORT_INVALID');
 const previous=(payload?.shops??[]) as any[],rows=s.shops.map((r:any)=>{const matches=previous.filter(x=>String(x.shopId)===String(r.shopId));if(matches.length>1)throw Error('PREVIOUS_REPORT_INVALID');const old=matches[0],direct=embedded(r),metric=(shop:any)=>({sales:growthNumber(shop?.business?.shop_income),orders:growthNumber(shop?.business?.shop_valid_order_num)});return growthRow('KEETA;'+r.shopId,r.shopName||'Unnamed branch',p,metric(r),direct??metric(old),freshness(p,s.observedAt,now)||(!direct&&!old?'PREVIOUS_REPORT_MISSING':null));});
 return {platform:'keeta',state:'SUCCESS',rows,period:p,observedAt:s.observedAt,errorCode:null};
}
export function readNoonGrowth(data:any,now=new Date()){
 if(data.state!=='SUCCESS'||!data.snapshot)return {platform:'noon',state:data.state||'EMPTY',rows:[],period:null,observedAt:null,errorCode:data.errorCode||null};
 const s=data.snapshot,p={from:s.period.startDate,to:s.period.endDate,previousFrom:s.period.comparisonStartDate,previousTo:s.period.comparisonEndDate},reason=freshness(p,s.observedAt,now);
 const metric=(v:any)=>({sales:growthNumber(v?.revenue),orders:growthNumber(v?.ordersCount)}),rows=s.reports.filter((r:any)=>r.scope==='STORE').map((r:any)=>growthRow('NOON;'+r.restaurantId+';'+r.outletCode,r.storeName,p,metric(r.dashboard.salesInsights.mainInsights),metric(r.dashboard.salesInsights.mainInsightsPrevious),reason));
 return {platform:'noon',state:'SUCCESS',rows,period:p,observedAt:s.observedAt,errorCode:null};
}
export async function fetchGrowth(user:AuthUser,env:NodeJS.ProcessEnv,fetcher:typeof fetch=fetch,deps:any={}){
 const now=deps.now||new Date(),db=()=>deps.db||authDatabase(),config={ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''};
 const jobs=[async()=>readTalabatGrowth(await (deps.scopeTalabat||scopePerformance)(await (deps.talabat||fetchPerformance)(config,undefined,fetcher),user),db(),now),async()=>readKeetaGrowth(await (deps.scopeKeeta||scopeKeetaPerformance)(await (deps.keeta||fetchKeetaPerformance)(config,fetcher),user),db(),now),async()=>env.NOON_RATINGS_ENABLED==='true'?readNoonGrowth(await (deps.scopeNoon||scopeNoonPerformance)(await (deps.noon||readNoonPerformance)(),user),now):{platform:'noon',state:'DISABLED',rows:[],period:null,observedAt:null,errorCode:null}];
 const results=await Promise.allSettled(jobs.map(job=>job()));
 const platforms=results.map((r,i)=>{if(r.status==='fulfilled')return r.value;const code=r.reason?.code==='42P01'?'HISTORY_TABLE_UNAVAILABLE':['SOURCE_AMBIGUOUS','HISTORY_SOURCE_UNCONFIRMED','PREVIOUS_REPORT_INVALID','HISTORY_TOO_LARGE','SCOPE_TOO_LARGE'].includes(r.reason?.message)?r.reason.message:'GROWTH_READ_FAILED';return {platform:['talabat','keeta','noon'][i],state:'ERROR',rows:[],period:null,observedAt:null,errorCode:code};});
 return {ok:true,generatedAt:now.toISOString(),platforms};
}
