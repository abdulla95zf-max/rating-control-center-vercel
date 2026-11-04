import {growthNumber,validGrowthPeriod} from './growth.ts';
import {reportRead,reportKey} from './report-read-cache.ts';

const day=(d:string,n:number)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function trendWindows(to:string){return [3,2,1,0].map(i=>({from:day(to,-i*7-6),to:day(to,-i*7)}));}
export function trendPoint(period:{from:string;to:string},sales:unknown,orders:unknown,meta:any={}){
 const s=growthNumber(sales),o=growthNumber(orders),valid=s!==null&&o!==null&&Number.isSafeInteger(o)&&(o!==0||s===0);
 return {...period,sales:valid?s:null,orders:valid?o:null,basket:valid&&o!>0?s!/o!:null,complete:valid,lowSample:valid&&o!<20,...meta};
}
function comparisonPoint(w:{from:string;to:string},r:any,p:any){
 if(r.eligible!==true)return null;
 const values=w.from===r.period?.from&&w.to===r.period?.to?r.current:w.from===r.period?.previousFrom&&w.to===r.period?.previousTo?r.previous:null;
 return values?trendPoint(w,values.sales,values.orders,{basis:'CURRENT_COMPARISON',observedAt:values===r.current?p.observedAt??null:null}):null;
}
/** Attach only source-matched historical weeks to already authorized Growth rows. */
export async function attachSnapshotTrends(data:any,db:any){
 const platforms=await Promise.all(data.platforms.map(async(p:any)=>{
  if(!['keeta','noon'].includes(p.platform)||p.state!=='SUCCESS'||!p.rows.length||!p.period||!validGrowthPeriod(p.period))return p;
  const windows=trendWindows(p.period.to),ids=p.rows.map((r:any)=>r.identity);
  if(ids.length>500)return p;
  try{
   const rows=await reportRead(db,reportKey('lens-trend-v1',p.platform,ids,windows),async()=>{
    // Project metrics in SQL: no whole payload, customer or item aggregates cross the wire.
    const text=p.platform==='keeta'?`WITH latest AS (
     SELECT DISTINCT ON (coalesce(to_jsonb(s)->>'account_key','kabab-fareej'),period_from,period_to)
      period_from,period_to,observed_at,run_id,coalesce(to_jsonb(s)->>'account_key','kabab-fareej') AS account_key,payload
     FROM keeta_performance_snapshots s WHERE period_to=ANY($1::date[]) AND period_to-period_from=6
     ORDER BY coalesce(to_jsonb(s)->>'account_key','kabab-fareej'),period_from,period_to,observed_at DESC,run_id DESC)
     SELECT period_from::text AS "from",period_to::text AS "to",observed_at::text AS "observedAt",run_id::text AS revision,account_key AS account,
      'KEETA;'||(shop->>'shopId') AS identity,shop->'business'->>'shop_income' AS sales,shop->'business'->>'shop_valid_order_num' AS orders
     FROM latest CROSS JOIN LATERAL jsonb_array_elements(payload->'shops') shop
     WHERE 'KEETA;'||(shop->>'shopId')=ANY($2::text[]) AND payload->>'periodFrom'=period_from::text AND payload->>'periodTo'=period_to::text LIMIT 2001`:
    `WITH latest AS (SELECT DISTINCT ON (period_from,period_to) * FROM noon_performance_snapshots
      WHERE period_to=ANY($1::date[]) AND period_to-period_from=6 ORDER BY period_from,period_to,observed_at DESC,created_at DESC,id DESC)
     SELECT period_from::text AS "from",period_to::text AS "to",observed_at::text AS "observedAt",id::text AS revision,
      'NOON;'||(report->>'restaurantId')||';'||(report->>'outletCode') AS identity,
      report->'dashboard'->'salesInsights'->'mainInsights'->>'revenue' AS sales,
      report->'dashboard'->'salesInsights'->'mainInsights'->>'ordersCount' AS orders
     FROM latest CROSS JOIN LATERAL jsonb_array_elements(payload->'reports') report
     WHERE report->>'scope'='STORE' AND 'NOON;'||(report->>'restaurantId')||';'||(report->>'outletCode')=ANY($2::text[])
      AND report->'dashboard'->>'startDate'=period_from::text AND report->'dashboard'->>'endDate'=period_to::text LIMIT 2001`;
    const result=await db.query({text,values:[windows.map(w=>w.to),ids],query_timeout:5000});
    if(result.rows.length>2000)throw Error('TREND_TOO_LARGE');return result.rows;
   },300_000);
   return {...p,rows:p.rows.map((r:any)=>({...r,trend:{state:'SUCCESS',weeks:windows.map(w=>{
    const matches=rows.filter((x:any)=>x.identity===r.identity&&x.from===w.from&&x.to===w.to);
    if(matches.length!==1)return !matches.length&&comparisonPoint(w,r,p)||trendPoint(w,null,null,{reason:matches.length?'SOURCE_AMBIGUOUS':'REPORT_MISSING'});
    const x=matches[0];if(p.platform==='keeta'&&r.accountKey&&r.accountKey!==x.account)return trendPoint(w,null,null,{reason:'SOURCE_AMBIGUOUS'});
    return trendPoint(w,x.sales,x.orders,{observedAt:x.observedAt,revision:x.revision,account:x.account??null});
   })}}))};
  }catch{return {...p,rows:p.rows.map((r:any)=>({...r,trend:{state:'ERROR',weeks:windows.map(w=>comparisonPoint(w,r,p)||trendPoint(w,null,null,{reason:'HISTORY_READ_FAILED'})),reason:'HISTORY_READ_FAILED'}}))};}
 }));return {...data,platforms};
}
