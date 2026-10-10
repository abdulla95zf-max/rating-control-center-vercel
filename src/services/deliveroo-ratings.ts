import {authDatabase} from '../auth.ts';import {displayStatus} from './rating-status.ts';
import {deliverooScope} from './deliveroo-scope.ts';import {validateDeliverooSnapshot} from './deliveroo-snapshot.ts';
import type {CloudRating,CloudPlatformResult} from './latest-ratings-proxy.ts';
type Database={query(text:any,values?:any[]):Promise<{rows:any[]}>};
const empty=():CloudPlatformResult=>({platform:'deliveroo',state:'EMPTY',storeCount:0,syncTimestamp:null,emptyReason:'NO_RUN',errorCode:null,ratings:[]});
export async function readDeliverooRatings(db:Database=authDatabase()):Promise<CloudPlatformResult>{
 try{
  const result=await db.query({text:`SELECT payload FROM (SELECT DISTINCT ON(observed_at) observed_at,created_at,id,payload FROM deliveroo_rating_snapshots ORDER BY observed_at DESC,created_at DESC,id DESC) s ORDER BY observed_at DESC LIMIT 2`,query_timeout:5000});
  if(!result.rows.length)return empty();
  const current=validateDeliverooSnapshot(result.rows[0].payload),previous=result.rows[1]?validateDeliverooSnapshot(result.rows[1].payload):null;
  if(previous&&Date.parse(previous.observedAt)>=Date.parse(current.observedAt))throw Error('SNAPSHOT_INVALID');
  const older=new Map<string,any>(previous?.rows.map((r:any)=>[r.id,r])??[]);
  const ratings:CloudRating[]=current.rows.map((r:any)=>{const p=older.get(r.id),b=deliverooScope.find(x=>x.id===r.id)!;return {
   platform:'deliveroo',storeIdentityKey:`DELIVEROO;${r.orgId};${r.id}`,storeName:`${b.brand} — ${b.location}`,rating:r.rating,reviewCount:r.ratingCount,oneStarCount:r.oneStarCount,
   timestamp:current.observedAt,syncTimestamp:current.observedAt,previousRating:p?.rating??null,previousReviewCount:p?.ratingCount??null,previousOneStarCount:p?.oneStarCount??null,previousTimestamp:previous?.observedAt??null,carriedForward:false,status:displayStatus(r.rating)
  };});
  return {platform:'deliveroo',state:'SUCCESS',storeCount:16,syncTimestamp:current.observedAt,emptyReason:null,errorCode:null,ratings};
 }catch(e:any){if(e?.code==='42P01')return empty();return {platform:'deliveroo',state:'ERROR',storeCount:0,syncTimestamp:null,emptyReason:null,errorCode:'RATINGS_READ_FAILED',ratings:[]};}
}
export async function withDeliverooRatings<T extends {ratings:CloudRating[];platforms:CloudPlatformResult[];storeCount:number}>(data:T,enabled:boolean,read=readDeliverooRatings):Promise<T>{
 if(!enabled)return data;let result:CloudPlatformResult;
 try{result=await read();}catch{result={platform:'deliveroo',state:'ERROR',storeCount:0,syncTimestamp:null,emptyReason:null,errorCode:'RATINGS_READ_FAILED',ratings:[]};}
 const ratings=[...data.ratings,...result.ratings].sort((a,b)=>a.platform.localeCompare(b.platform)||a.storeIdentityKey.localeCompare(b.storeIdentityKey));return {...data,ratings,storeCount:ratings.length,platforms:[...data.platforms,result]};
}
export async function readDeliverooHistory(identity:string,range:string,db:Database=authDatabase()){
 const match=identity.match(/^DELIVEROO;(\d+);(\d+)$/),b=match?deliverooScope.find(x=>x.id===match[2]&&x.orgId===match[1]):undefined;
 if(!b||!['24h','7d','30d','all'].includes(range))throw Error('INVALID_HISTORY_REQUEST');
 const hours=range==='24h'?24:range==='7d'?168:range==='30d'?720:null;
 const result=await db.query({text:`SELECT payload FROM deliveroo_rating_snapshots WHERE ($1::int IS NULL OR observed_at>=now()-$1*interval '1 hour') ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 2000`,values:[hours],query_timeout:5000});
 const points=result.rows.map(v=>{const s=validateDeliverooSnapshot(v.payload),r=s.rows.find((x:any)=>x.id===b.id)!;return {recordedAt:s.observedAt,rating:r.rating,reviewCount:r.ratingCount,oneStarCount:r.oneStarCount,status:displayStatus(r.rating)};});
 return {ok:true,storeIdentityKey:identity,range,points:[...new Map(points.map(p=>[p.recordedAt,p])).values()].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt))};
}
