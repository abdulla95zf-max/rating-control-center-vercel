import {authDatabase} from '../auth.ts';
import {displayStatus} from './rating-status.ts';
import {HistoryProxyError} from './history-proxy.ts';
type Database={query(text:any,values?:any[]):Promise<{rows:any[]}>};
export async function readKeetaHistory(identity:string,range:string,db:Database=authDatabase()){
 if(!/^KEETA;[0-9]{1,80}$/.test(identity)||!['24h','7d','30d','all'].includes(range))throw new HistoryProxyError(400,'Invalid history request.');
 const hours=range==='24h'?24:range==='7d'?168:range==='30d'?720:null;
 try{
  const result=await db.query({text:`SELECT DISTINCT ON (observed_at) observed_at,rating,review_count,one_star_count FROM keeta_rating_snapshots WHERE store_identity_key=$1 AND platform='KEETA' AND ($2::int IS NULL OR observed_at>=now()-$2*interval '1 hour') ORDER BY observed_at DESC,run_id DESC LIMIT 2000`,values:[identity,hours],query_timeout:5000});
  const count=(value:unknown)=>{if(value===null)return null;if(typeof value!=='number'&&!(typeof value==='string'&&/^\d+$/.test(value)))throw Error();const n=Number(value);if(!Number.isSafeInteger(n)||n<0)throw Error();return n;};
  const points=result.rows.map(r=>{const recordedAt=r.observed_at instanceof Date?r.observed_at.toISOString():r.observed_at;if(typeof recordedAt!=='string'||!Number.isFinite(Date.parse(recordedAt)))throw Error();if(r.rating!==null&&typeof r.rating!=='number'&&!(typeof r.rating==='string'&&/^\d+(\.\d+)?$/.test(r.rating)))throw Error();const rating=r.rating===null?null:Number(r.rating),reviewCount=count(r.review_count),oneStarCount=count(r.one_star_count);if(rating!==null&&(!Number.isFinite(rating)||rating<1||rating>5)||reviewCount!==null&&oneStarCount!==null&&oneStarCount>reviewCount)throw Error();return {recordedAt:new Date(recordedAt).toISOString(),rating,reviewCount,oneStarCount,status:displayStatus(rating)};}).sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
  return {ok:true,storeIdentityKey:identity,range,points};
 }catch(e:any){if(e?.code==='42P01')return {ok:true,storeIdentityKey:identity,range,points:[]};throw new HistoryProxyError(502,'Keeta history is unavailable. Please try again.');}
}
