import {reportRead,reportKey} from './report-read-cache.ts';
import {authDatabase} from '../auth.ts';
async function loadReport(period:{startDate:string;endDate:string}|undefined,db:any=authDatabase()){
 const values=period?[period.startDate,period.endDate]:[];
 const rows:any[]=[];
 // Existing seven-day snapshots stay usable; exact dates are never synthesized.
 for(const table of ['keeta_performance_snapshots','keeta_performance_period_snapshots']){
  try{const r=await db.query({text:`SELECT payload,observed_at FROM ${table} WHERE ${period?'period_from=$1 AND period_to=$2':'period_to-period_from=6'} ORDER BY ${period?'':'period_to DESC,'}observed_at DESC LIMIT 1`,values,query_timeout:5000});rows.push(...r.rows);}catch(e:any){if(e?.code!=='42P01')throw Error('KEETA_PERFORMANCE_READ_FAILED');}
 }
 rows.sort((a,b)=>(period?0:Date.parse(b.payload?.periodTo)-Date.parse(a.payload?.periodTo))||Date.parse(b.observed_at)-Date.parse(a.observed_at));
 const row=rows[0];if(!row)return {ok:true,platform:'keeta',state:'EMPTY',snapshot:null};
 const x=row.payload;if(!x||Buffer.byteLength(JSON.stringify(x))>3000000||!Array.isArray(x.shops)||!Array.isArray(x.items)||!x.customers||(period?(x.periodFrom!==period.startDate||x.periodTo!==period.endDate):(!/^\d{4}-\d{2}-\d{2}$/.test(x.periodFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(x.periodTo)||Date.parse(x.periodTo)-Date.parse(x.periodFrom)!==6*86400000)))throw Error('KEETA_PERFORMANCE_READ_FAILED');
 return {ok:true,platform:'keeta',state:'SUCCESS',snapshot:{...x,itemsByShop:x.itemsByShop??[],observedAt:new Date(row.observed_at).toISOString()}};
}

export function readKeetaPeriod(period:{startDate:string;endDate:string}|undefined,db:any=authDatabase()){return reportRead(db,reportKey('keeta-period',period),()=>loadReport(period,db),300_000);}
