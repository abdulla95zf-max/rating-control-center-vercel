import {authDatabase,canAccess,type AuthUser} from '../auth.ts';
import {hasFeature,performanceFeature} from '../feature-access.ts';
import {revisionProjection} from './report-revision-projection.ts';
import {growthNumber,talabatZeroOrderDay} from './growth.ts';
import {calendarDay,dubaiDay,evaluateEmergencySnapshot,validEmergencySnapshot,type EmergencyPlatform,type EmergencySnapshot,type OrderSeries} from './order-emergency-policy.ts';

export type EmergencyDatabase={query(q:any):Promise<{rows:any[]}>};
export const emergencySourceTypes={'performance:talabat':'talabat','performance:keeta':'keeta','rating:noon':'noon','rating:deliveroo':'deliveroo'} as const;
type Roster={source_type:keyof typeof emergencySourceTypes;source_id:string;id:string;canonical_key:string;brand:string;display_name:string};
const ordersProjection=revisionProjection.replace("AND e.value<>'null'::jsonb","AND e.value<>'null'::jsonb AND mapped.key IN ('Successful Orders','Gross Sales')");
const zeroProjection=revisionProjection.replace('WHERE pv.source_key=c.source_key',"WHERE coalesce(resolved.values->>'Successful Orders','') !~ '[0-9]' AND coalesce(resolved.values->>'Gross Sales','') !~ '[0-9]' AND pv.source_key=c.source_key").replace(') resolved ON true',') zero_resolved ON true');
export async function emergencyRoster(db:EmergencyDatabase){
 const r=await db.query({text:`SELECT s.source_type,s.source_id,b.id,b.canonical_key,b.brand,b.display_name FROM dashboard_branch_sources s JOIN dashboard_branches b ON b.id=s.branch_id WHERE b.active=true AND s.source_type=ANY($1::text[]) ORDER BY s.source_type,s.source_id LIMIT 501`,values:[Object.keys(emergencySourceTypes)],query_timeout:4000});
 if(r.rows.length>500)throw Error('EMERGENCY_SCOPE_TOO_LARGE');return r.rows as Roster[];
}
const queries:Record<EmergencyPlatform,string>={
 talabat:`WITH anchors AS (SELECT source_key,max(report_date)::text AS anchor FROM public.performance_report_current WHERE report_date<=$1::date GROUP BY source_key)
 SELECT r.store_id AS source_id,c.source_key AS lineage,a.anchor,c.report_date::text AS date,v.received_at AS observed_at,c.revision_id::text AS revision,(r.present OR resolved.values IS NOT NULL) AS complete,resolved.values->>'Successful Orders' AS orders,resolved.values->>'Gross Sales' AS sales,zero_resolved.values AS metrics,CASE WHEN zero_resolved.values IS NOT NULL THEN r.source_values ELSE NULL END AS raw_metrics,r.present AS raw_present
 FROM public.performance_report_current c JOIN anchors a USING(source_key) JOIN public.performance_report_revisions v USING(revision_id) JOIN public.performance_report_rows r USING(revision_id) ${ordersProjection} ${zeroProjection}
 WHERE c.report_date BETWEEN $2::date AND $1::date ORDER BY c.report_date,r.store_id LIMIT 18001`,
 keeta:`WITH latest AS (SELECT DISTINCT ON(coalesce(to_jsonb(s)->>'account_key','kabab-fareej'),period_from) coalesce(to_jsonb(s)->>'account_key','kabab-fareej') AS account,period_from,period_to,observed_at,id,payload FROM keeta_performance_period_snapshots s WHERE period_from=period_to AND period_to BETWEEN $2::date AND $1::date ORDER BY coalesce(to_jsonb(s)->>'account_key','kabab-fareej'),period_from,observed_at DESC,id DESC), anchors AS (SELECT account,max(period_to)::text AS anchor FROM latest GROUP BY account)
 SELECT x->>'shopId' AS source_id,s.account AS lineage,a.anchor,s.period_to::text AS date,s.observed_at,s.id::text AS revision,(s.payload->>'periodFrom'=s.period_from::text AND s.payload->>'periodTo'=s.period_to::text AND s.payload->'coverage'->>'business'='true') AS complete,x->'business'->>'shop_valid_order_num' AS orders,x->'business'->>'shop_income' AS sales FROM latest s JOIN anchors a USING(account) CROSS JOIN LATERAL jsonb_array_elements(s.payload->'shops') x LIMIT 18001`,
 noon:`WITH latest AS (SELECT DISTINCT ON(period_from) period_from,period_to,observed_at,id,payload FROM noon_performance_snapshots WHERE period_from=period_to AND period_to BETWEEN $2::date AND $1::date AND observed_at>=((period_to+1)::timestamp AT TIME ZONE 'Asia/Dubai') ORDER BY period_from,observed_at DESC,created_at DESC,id DESC),anchor AS (SELECT max(period_to)::text AS anchor FROM latest)
 SELECT 'NOON;'||(x->>'restaurantId')||';'||(x->>'outletCode') AS source_id,'noon' AS lineage,a.anchor,s.period_to::text AS date,s.observed_at,s.id::text AS revision,(s.payload->'period'->>'startDate'=s.period_from::text AND s.payload->'period'->>'endDate'=s.period_to::text AND x->'dashboard'->>'startDate'=s.period_from::text AND x->'dashboard'->>'endDate'=s.period_to::text) AS complete,x->'dashboard'->'salesInsights'->'mainInsights'->>'ordersCount' AS orders,x->'dashboard'->'salesInsights'->'mainInsights'->>'revenue' AS sales FROM latest s CROSS JOIN anchor a CROSS JOIN LATERAL jsonb_array_elements(s.payload->'reports') x WHERE x->>'scope'='STORE' LIMIT 18001`,
 deliveroo:`WITH latest AS (SELECT id,period_from,period_to,observed_at,payload FROM deliveroo_operations_snapshots WHERE days=30 AND period_to<=$1::date AND period_to>=$2::date ORDER BY period_to DESC,observed_at DESC,created_at DESC,id DESC LIMIT 1)
 SELECT 'DELIVEROO;'||(x->>'orgId')||';'||(x->>'storeId') AS source_id,'deliveroo' AS lineage,s.period_to::text AS anchor,to_char(to_timestamp((p->>'time')::double precision) AT TIME ZONE 'Asia/Dubai','YYYY-MM-DD') AS date,s.observed_at,s.id::text AS revision,(x->>'code'='SUCCESS' AND x->>'startDate'=s.period_from::text AND x->>'endDate'=s.period_to::text AND s.payload->>'startDate'=s.period_from::text AND s.payload->>'endDate'=s.period_to::text) AS complete,p->>'value' AS orders,NULL AS sales FROM latest s CROSS JOIN LATERAL jsonb_array_elements(s.payload->'rows') x CROSS JOIN LATERAL jsonb_array_elements(x->'metrics') m CROSS JOIN LATERAL jsonb_array_elements(m->'series') p WHERE m->>'name'='total_orders' LIMIT 18001`
};
/** Read saved daily evidence only. No collection, registration, portal calls or inferred missing days. */
export async function readEmergencySeries(db:EmergencyDatabase,now:Date,env:NodeJS.ProcessEnv=process.env){
 const roster=await emergencyRoster(db),to=calendarDay(dubaiDay(now),-1),from=calendarDay(to,-34),sourceErrors:EmergencySnapshot['sourceErrors']={};
 const series:OrderSeries[]=[];
 await Promise.all((['talabat','keeta','noon','deliveroo'] as const).map(async platform=>{
  const entries=roster.filter(r=>emergencySourceTypes[r.source_type]===platform);if(!entries.length)return;
  let rows:any[]=[];let error:string|undefined;
  if((platform==='noon'&&env.NOON_RATINGS_ENABLED!=='true')||(platform==='deliveroo'&&env.DELIVEROO_RATINGS_ENABLED!=='true'))error='SOURCE_DISABLED';
  else try{rows=(await db.query({text:queries[platform],values:[to,from],query_timeout:5000})).rows;if(rows.length>18000)throw Error('TOO_LARGE');}catch{error='DAILY_EVIDENCE_READ_FAILED';}
  if(error)sourceErrors[platform]=error;
  for(const r of entries){
   const history=rows.filter(x=>x.source_id===r.source_id),lineages=[...new Set(history.map(x=>x.lineage))];
   const lineage=lineages.length===1?String(lineages[0]):'',asOf=history.length?history.map(x=>x.anchor).sort().at(-1):null;
   // Multiple account/source identities may not be combined, even when display names match.
   const failure=error||(lineages.length>1?'SOURCE_AMBIGUOUS':undefined);
   series.push({key:platform+':'+r.source_id,platform,sourceId:r.source_id,branchId:r.id,brand:r.brand,name:r.display_name,lineage,asOf,points:history.map(x=>{
    const zero=platform==='talabat'&&talabatZeroOrderDay({...x,store_id:x.source_id,report_date:x.date});
    const orders=zero?0:growthNumber(x.orders),sales=zero?0:growthNumber(x.sales);
    return {date:x.date,orders,complete:x.complete===true&&!(orders===0&&sales!==null&&sales>0),observedAt:x.observed_at instanceof Date?x.observed_at.toISOString():String(x.observed_at),revision:String(x.revision)};
   }),...(failure?{error:failure}:{})});
  }
 }));
 return {series,sourceErrors};
}
export async function scanOrderEmergencies(previous:EmergencySnapshot|undefined,now:Date,db:EmergencyDatabase=authDatabase(),env:NodeJS.ProcessEnv=process.env){const input=await readEmergencySeries(db,now,env);return evaluateEmergencySnapshot(input.series,now,previous,input.sourceErrors);}

/** Scope persisted evidence against the CURRENT roster and grants on EVERY request. */
export async function readScopedEmergencies(user:AuthUser,db:EmergencyDatabase=authDatabase(),now=new Date()){
 if(!hasFeature(user,'overview.emergencies'))throw Error('EMERGENCY_FORBIDDEN');
 const roster=(await emergencyRoster(db)).filter(r=>hasFeature(user,performanceFeature(emergencySourceTypes[r.source_type]))&&canAccess(user,r.brand,r.canonical_key));
 const result=await db.query({text:"SELECT payload->'orderEmergencies' AS snapshot,payload->>'emergencyError' AS monitor_error,payload->>'emergencyDeliveryUncertain' AS delivery_uncertain FROM dashboard_collector_watchdog WHERE id=1",query_timeout:4000});
 const snapshot=result.rows[0]?.snapshot;if(!validEmergencySnapshot(snapshot))return {state:'PENDING',checkedAt:null,expectedDate:null,rows:[]};
 const allowed=new Map(roster.map(r=>[emergencySourceTypes[r.source_type]+':'+r.source_id,r]));
 // Explicit projection prevents internal incident/source revision metadata reaching the browser.
 const stale=now.getTime()-Date.parse(snapshot.checkedAt)>2*3600000||Date.parse(snapshot.checkedAt)>now.getTime()+300000||result.rows[0]?.monitor_error==='true';
 const rows=snapshot.rows.flatMap(r=>{const active=allowed.get(r.key);return !active||active.id!==r.branchId?[]:[{key:r.key,platform:r.platform,brand:active.brand,name:active.display_name,state:stale?'UNKNOWN':r.state,reason:stale?'MONITOR_NOT_CURRENT':r.reason,asOf:r.asOf,expectedDate:r.expectedDate,currentOrders:r.currentOrders,baselineAverage:r.baselineAverage,baselineFrom:r.baselineFrom,baselineTo:r.baselineTo,dropPercent:r.dropPercent,startDate:r.startDate,lastConfirmed:r.lastConfirmed,consecutiveDays:r.consecutiveDays,zeroDays:r.zeroDays,lagDays:r.lagDays}];});
 return {state:'READY',checkedAt:snapshot.checkedAt,expectedDate:snapshot.expectedDate,rows,...(user.isOwner?{telegramNeedsReview:result.rows[0]?.delivery_uncertain==='true'}:{})};
}

