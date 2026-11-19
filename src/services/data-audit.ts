import {authDatabase,canAccess,type AuthUser} from '../auth.ts';
import {hasFeature,performanceFeature} from '../feature-access.ts';
import {fetchGrowth} from './growth.ts';
import {emergencyRoster,emergencySourceTypes,type EmergencyDatabase} from './order-emergency-reader.ts';
import {validEmergencySnapshot,validDay,type DailyAudit} from './order-emergency-policy.ts';

const amount=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function projectAudit(a:any):DailyAudit|null{
 if(!a||!validDay(a.from)||!validDay(a.to)||!Array.isArray(a.missing)||a.missing.length>28||!a.missing.every(validDay)||!Array.isArray(a.weeks)||a.weeks.length!==4||a.latestComplete!==null&&!validDay(a.latestComplete))return null;
 if(!a.weeks.every((w:any)=>validDay(w.from)&&validDay(w.to)&&Number.isInteger(w.orderDays)&&w.orderDays>=0&&w.orderDays<=7&&Number.isInteger(w.salesDays)&&w.salesDays>=0&&w.salesDays<=7&&(w.orders===null||amount(w.orders))&&(w.sales===null||amount(w.sales))))return null;
 return {accountKey:typeof a.accountKey==='string'&&a.accountKey.length<=200?a.accountKey:null,from:a.from,to:a.to,latestComplete:a.latestComplete,missing:[...a.missing],weeks:a.weeks.map((w:any)=>({from:w.from,to:w.to,orderDays:w.orderDays,salesDays:w.salesDays,orders:w.orders,sales:w.sales}))};
}
/** One explicit disclosure read. No daily-history rescan, collection, scheduling or new background polling. */
export async function readDataAudit(user:AuthUser,env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,deps:{db?:EmergencyDatabase;now?:Date;growth?:typeof fetchGrowth}={}){
 if(!hasFeature(user,'overview.confidence'))throw Error('AUDIT_FORBIDDEN');
 const db=deps.db||authDatabase(),now=deps.now||new Date();
 const roster=(await emergencyRoster(db)).filter(r=>hasFeature(user,performanceFeature(emergencySourceTypes[r.source_type]))&&canAccess(user,r.brand,r.canonical_key));
 if(!roster.length)return {state:'READY',checkedAt:null,expectedDate:null,rows:[]};
 const saved=await db.query({text:"SELECT payload->'orderEmergencies' AS snapshot,payload->>'emergencyError' AS monitor_error FROM dashboard_collector_watchdog WHERE id=1",query_timeout:4000});
 const snapshot=saved.rows[0]?.snapshot;
 if(!validEmergencySnapshot(snapshot))return {state:'PENDING',checkedAt:null,expectedDate:null,rows:[]};
 const stale=now.getTime()-Date.parse(snapshot.checkedAt)>7200000||Date.parse(snapshot.checkedAt)>now.getTime()+300000||saved.rows[0]?.monitor_error==='true';
 // Growth performs source-feature, brand and active-branch scoping before calculations.
 const growth=await (deps.growth||fetchGrowth)(user,env,fetcher);
 const rows=roster.map(r=>{
  const platform=emergencySourceTypes[r.source_type],key=platform+':'+r.source_id;
  const found=snapshot.rows.filter(x=>x.key===key&&x.branchId===r.id),row=found.length===1?found[0]:null,audit=row?projectAudit(row.audit):null;
  const source=growth.platforms.find((p:any)=>p.platform===platform);
  const identity=platform==='talabat'?'TB_AE;'+r.source_id:platform==='keeta'?'KEETA;'+r.source_id:r.source_id;
  const matches=(source?.rows||[]).filter((x:any)=>x.identity===identity);
  const report=matches.length===1?matches[0]:null;
  const periods=report?.period?[{from:report.period.from,to:report.period.to,values:report.current},{from:report.period.previousFrom,to:report.period.previousTo,values:report.previous}]:[];
  const reconciliation=platform==='deliveroo'?'SALES_NOT_COLLECTED':platform==='talabat'?'DERIVED_FROM_DAILY':!report?'REPORT_UNAVAILABLE':source?.state!=='SUCCESS'||!report.eligible?'REPORT_INELIGIBLE':stale||!audit?'DAILY_AUDIT_UNAVAILABLE':periods.length!==2?'PERIOD_UNVERIFIED':periods.some((p:any)=>!audit.weeks.some(w=>w.from===p.from&&w.to===p.to&&w.orderDays===7&&w.salesDays===7))?'DAILY_PERIOD_INCOMPLETE':platform==='keeta'&&(!report.accountKey||report.accountKey!==audit.accountKey||report.previousAccountKey!==audit.accountKey)?'ACCOUNT_UNVERIFIED':'READY';
  // Account identity is projected separately from private incident state; never join by display name.
  const totals=reconciliation==='READY'?periods.map((p:any)=>{const day=audit!.weeks.find(w=>w.from===p.from&&w.to===p.to)!;return {from:p.from,to:p.to,dailyOrders:day.orders,reportOrders:p.values.orders,dailySales:day.sales,reportSales:p.values.sales,ordersDifference:amount(p.values.orders)?day.orders!-p.values.orders:null,salesDifference:amount(p.values.sales)?day.sales!-p.values.sales:null};}):[];
  const mismatch=totals.some((p:any)=>p.ordersDifference!==null&&p.ordersDifference!==0||p.salesDifference!==null&&Math.abs(p.salesDifference)>0.01);
  return {key,platform,brand:r.brand,name:r.display_name,audit:stale?null:audit,emergencyState:!hasFeature(user,'overview.emergencies')?'NOT_PERMITTED':stale?'UNKNOWN':row?.state||'UNKNOWN',emergencyReason:!hasFeature(user,'overview.emergencies')?null:stale?'MONITOR_NOT_CURRENT':row?.reason||null,comparisonEligible:report?.eligible===true,comparisonReason:report?.reason||source?.errorCode||null,reconciliation:mismatch?'DIFFERENCE':reconciliation,totals};
 });
 return {state:stale?'STALE':'READY',checkedAt:snapshot.checkedAt,expectedDate:snapshot.expectedDate,rows};
}
