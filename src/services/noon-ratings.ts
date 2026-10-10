import {readNoonSessionHealth} from './noon-session-health.ts';
import {authDatabase} from '../auth.ts';
import {displayStatus} from './rating-status.ts';
import type {CloudRating,CloudPlatformResult} from './latest-ratings-proxy.ts';
type Database={query(text:any,values?:any[]):Promise<{rows:any[]}>};
export const noonScope:Record<string,{restaurantId:string;brand:string;location:string}>={"KBBFRJKRTU": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Al Barsha"}, "KBBLFR091K": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Ajman"}, "KBBLFR0QC3": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Al Qusais"}, "KBBLFR5RJC": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Al Twar"}, "KBBLFR6A8A": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Al Wasl"}, "KBBLFRAPKV": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Fujairah"}, "KBBLFRCJSD": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Mirdif"}, "KBBLFRCR7N": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Al Warqa"}, "KBBLFRG8U0": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Hay Hoshi"}, "KBBLFRH256": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "RAK"}, "KBBLFRJKWG": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Dragon Mart"}, "KBBLFRP7ZM": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Umm Al Daman"}, "KBBLFRSTOG": {"restaurantId": "R2813694825370398006896956A", "brand": "Kabab Fareej", "location": "Muteena"}, "FRBKBB08PH": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Mirdif"}, "FRBKBB25EW": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Al Qusais"}, "FRBKBB4N21": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Al Barsha"}, "FRBKBB5Y5X": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Al Warqa"}, "FRBKBB74GE": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Hay Hoshi"}, "FRBKBBIEQF": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Ajman"}, "FRBKBBM5NA": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Al Wasl"}, "FRBKBBS0X9": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Umm Al Daman"}, "FRBKBBUK24": {"restaurantId": "R9408821663380305655608737A", "brand": "FRB Kabab", "location": "Fujairah"}};
type SnapshotRow={platform:'noon';restaurantId:string;outletCode:string;brand:string;branchName:string;rating:number|null;reviewCount:number};
type Snapshot={version:1;observedAt:string;rows:SnapshotRow[]};
const iso=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value));
export function validateNoonSnapshot(value:any):Snapshot{
 if(value?.version!==1||!iso(value.observedAt)||!Array.isArray(value.rows)||value.rows.length!==22)throw Error('SNAPSHOT_INVALID');
 const seen=new Set<string>();
 for(const r of value.rows){const expected=noonScope[r?.outletCode];
  if(!expected||seen.has(r.outletCode)||r.platform!=='noon'||r.restaurantId!==expected.restaurantId||r.brand!==expected.brand||typeof r.branchName!=='string'||!r.branchName.trim()||r.branchName.length>512||/[\u0000-\u001f\u007f]/.test(r.branchName)||!Number.isSafeInteger(r.reviewCount)||r.reviewCount<0||(r.reviewCount===0?r.rating!==null:typeof r.rating!=='number'||!Number.isFinite(r.rating)||r.rating<1||r.rating>5))throw Error('SNAPSHOT_INVALID');
  seen.add(r.outletCode);
 }
 return {version:1,observedAt:value.observedAt,rows:value.rows.map((r:SnapshotRow)=>({...r}))};
}
function empty():CloudPlatformResult{return {platform:'noon',state:'EMPTY',storeCount:0,syncTimestamp:null,emptyReason:'NO_RUN',errorCode:null,ratings:[]};}
export async function readNoonRatings(db:Database=authDatabase()):Promise<CloudPlatformResult>{
 try{
  const result=await db.query({text:`SELECT payload FROM (SELECT DISTINCT ON(observed_at) observed_at,created_at,id,payload FROM noon_rating_snapshots ORDER BY observed_at DESC,created_at DESC,id DESC) s ORDER BY observed_at DESC LIMIT 2`,query_timeout:5000});
  const sessionHealth=await readNoonSessionHealth(db);
  if(!result.rows.length)return {...empty(),sessionHealth};
  const current=validateNoonSnapshot(result.rows[0].payload),previous=result.rows[1]?validateNoonSnapshot(result.rows[1].payload):null;
  if(previous&&Date.parse(previous.observedAt)>=Date.parse(current.observedAt))throw Error('SNAPSHOT_INVALID');
  const older=new Map(previous?.rows.map(r=>[r.outletCode,r])??[]);
  const ratings:CloudRating[]=current.rows.map(r=>{const prev=older.get(r.outletCode),expected=noonScope[r.outletCode]!;return {
   platform:'noon',storeIdentityKey:`NOON;${r.restaurantId};${r.outletCode}`,storeName:`${r.brand} — ${expected.location}`,rating:r.rating,reviewCount:r.reviewCount,oneStarCount:null,
   timestamp:current.observedAt,syncTimestamp:current.observedAt,previousRating:prev?.rating??null,previousReviewCount:prev?.reviewCount??null,previousOneStarCount:null,previousTimestamp:previous?.observedAt??null,carriedForward:false,status:displayStatus(r.rating)
  };});
  return {platform:'noon',sessionHealth,state:'SUCCESS',storeCount:22,syncTimestamp:current.observedAt,emptyReason:null,errorCode:null,ratings};
 }catch(error:any){if(error?.code==='42P01')return empty();return {platform:'noon',state:'ERROR',storeCount:0,syncTimestamp:null,emptyReason:null,errorCode:'RATINGS_READ_FAILED',ratings:[]};}
}
export async function withNoonRatings<T extends {ratings:CloudRating[];platforms:CloudPlatformResult[];storeCount:number}>(data:T,enabled:boolean,read=readNoonRatings):Promise<T>{
 if(!enabled)return data;
 let noon:CloudPlatformResult;try{noon=await read();}catch{noon={platform:'noon',state:'ERROR',storeCount:0,syncTimestamp:null,emptyReason:null,errorCode:'RATINGS_READ_FAILED',ratings:[]};}
 const ratings=[...data.ratings,...noon.ratings].sort((a,b)=>a.platform.localeCompare(b.platform)||a.storeIdentityKey.localeCompare(b.storeIdentityKey));
 return {...data,ratings,storeCount:ratings.length,platforms:[...data.platforms,noon]};
}

export async function readNoonHistory(identity:string,range:string,db:Database=authDatabase()){
 const match=identity.match(/^NOON;([A-Z0-9]+);([A-Z0-9]+)$/),entry=match?noonScope[match[2]!]:undefined;
 if(!match||!entry||entry.restaurantId!==match[1]||!['24h','7d','30d','all'].includes(range))throw Error('INVALID_HISTORY_REQUEST');
 const hours=range==='24h'?24:range==='7d'?168:range==='30d'?720:null;
 const result=await db.query({text:`SELECT payload FROM noon_rating_snapshots WHERE ($1::int IS NULL OR observed_at>=now()-$1*interval '1 hour') ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 2000`,values:[hours],query_timeout:5000});
 const points=result.rows.map(value=>{const snapshot=validateNoonSnapshot(value.payload),row=snapshot.rows.find(r=>r.outletCode===match[2])!;return {recordedAt:snapshot.observedAt,rating:row.rating,reviewCount:row.reviewCount,oneStarCount:null,status:displayStatus(row.rating)};});
 const unique=[...new Map(points.map(point=>[point.recordedAt,point])).values()].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt));
 return {ok:true,storeIdentityKey:identity,range,points:unique};
}
