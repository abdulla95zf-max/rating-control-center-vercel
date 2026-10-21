import {hasFeature} from '../feature-access.ts';
import type {AuthUser} from '../auth.ts';
import {fetchGrowth} from './growth.ts';
import {readDeliverooOperations,scopeDeliverooOperations} from './deliveroo-operations.ts';
import {periodEvidence} from './branch-evidence.ts';
const day=(date:string,offset:number)=>new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
export function deliverooLens(data:any){
 if(data.state!=='SUCCESS'||!data.snapshot)return {platform:'deliveroo',state:data.state,rows:[],period:null,observedAt:null,errorCode:data.errorCode||null};
 const s=data.snapshot,period={from:s.startDate,to:s.endDate,previousFrom:day(s.startDate,-s.days),previousTo:day(s.startDate,-1)};
 const rows=s.rows.map((r:any)=>{
  const value=(name:string)=>r.metrics.find((m:any)=>m.name===name)?.total??null,orders=value('total_orders');
  const measurements=[{code:'prep',group:'service',unit:'minutes',current:orders>0?value('prep_time'):null,previous:null},{code:'prepBenchmark',group:'service',unit:'minutes',current:orders>0&&value('prep_time_benchmark')>0?value('prep_time_benchmark'):null,previous:null},{code:'rejected',group:'service',unit:'orders',current:value('total_rejected_orders'),previous:null},{code:'latePrepared',group:'service',unit:'orders',current:value('wait_time_past_target_5min_cnt'),previous:null},{code:'delivered',group:'commercial',unit:'orders',current:value('total_delivered_orders'),previous:null}];
  // Service drawer dates must be verified independently by the collector.
  if(r.servicePeriodVerified===true)for(const code of ['cancelled','inaccurate'])measurements.push({code:code==='inaccurate'?'missing':code,group:'service',unit:'orders',current:r.service[code].total,previous:null});
  return {identity:`DELIVEROO;${r.orgId};${r.storeId}`,name:r.storeName,period,current:{sales:null,orders},previous:{sales:null,orders:null},eligible:false,evidenceOnly:true,reason:'SALES_NOT_COLLECTED',diagnostics:{version:1,period,matched:true,funnel:{kind:'events',stages:[]},operations:[],evidence:periodEvidence(period,measurements)}};
 });
 return {platform:'deliveroo',state:'SUCCESS',rows,period,observedAt:s.observedAt,errorCode:null};
}
export async function fetchLens(user:AuthUser,env:NodeJS.ProcessEnv,fetcher:typeof fetch=fetch,deps:any={}){
 const growth=(deps.growth||fetchGrowth)(user,env,fetcher);
 if(env.DELIVEROO_RATINGS_ENABLED!=='true'||!hasFeature(user,'deliveroo.operations'))return growth;
 const operations=async()=>{try{return deliverooLens(await (deps.scope||scopeDeliverooOperations)(await (deps.operations||readDeliverooOperations)(7),user));}catch{return {platform:'deliveroo',state:'ERROR',rows:[],period:null,observedAt:null,errorCode:'OPERATIONS_READ_FAILED'};}};
 const [data,service]=await Promise.all([growth,operations()]);return {...data,platforms:[...data.platforms,service]};
}
