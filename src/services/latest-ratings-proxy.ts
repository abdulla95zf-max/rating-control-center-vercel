import type {AppConfig} from '../config.ts';
import {displayStatus} from './rating-status.ts';

export class RatingsProxyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

type CloudPlatform='talabat'|'keeta';
type PlatformState='SUCCESS'|'EMPTY'|'ERROR';
export interface CloudRating {
  platform:CloudPlatform;storeIdentityKey:string;storeName:string|null;rating:number|null;
  reviewCount:number|null;oneStarCount:number|null;timestamp:string;syncTimestamp:string|null;
  carriedForward:boolean|null;status:ReturnType<typeof displayStatus>;
}
export interface CloudPlatformResult {
  platform:CloudPlatform;state:PlatformState;storeCount:number;syncTimestamp:string|null;
  emptyReason:'NO_RUN'|'LATEST_RUN_EMPTY'|'NO_RATINGS'|null;
  errorCode:'RATINGS_READ_FAILED'|null;ratings:CloudRating[];
}

const iso=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)&&Number.isFinite(Date.parse(value));
function count(value:unknown):value is number|null{return value===null||(Number.isSafeInteger(value)&&Number(value)>=0);}
function projectRating(row:any,token:string):CloudRating{
  if(!row||!['talabat','keeta'].includes(row.platform)||typeof row.storeIdentityKey!=='string'||row.storeIdentityKey.length>128||
    !/^[A-Za-z0-9][A-Za-z0-9:;_.-]*$/.test(row.storeIdentityKey)||row.storeIdentityKey.includes(token)||
    (row.platform==='talabat'&&!row.storeIdentityKey.startsWith('TB_AE;'))||
    (row.platform==='keeta'&&!row.storeIdentityKey.startsWith('KEETA;'))||
    !iso(row.timestamp)||(row.syncTimestamp!==null&&!iso(row.syncTimestamp))||
    (row.rating!==null&&(typeof row.rating!=='number'||!Number.isFinite(row.rating)||row.rating<1||row.rating>5))||
    !count(row.reviewCount)||!count(row.oneStarCount)||
    (row.reviewCount!==null&&row.oneStarCount!==null&&row.oneStarCount>row.reviewCount)||
    ![true,false,null].includes(row.carriedForward))throw Error();
  if(row.storeName!=null&&(typeof row.storeName!=='string'||!row.storeName.trim()||row.storeName.length>512||
    /[\u0000-\u001f\u007f]/.test(row.storeName)||row.storeName.includes(token)))throw Error();
  if(row.platform==='talabat'&&row.carriedForward!==false)throw Error();
  if(row.platform==='keeta'&&row.syncTimestamp===null)throw Error();
  return {platform:row.platform,storeIdentityKey:row.storeIdentityKey,storeName:row.storeName??null,rating:row.rating,
    reviewCount:row.reviewCount,oneStarCount:row.oneStarCount,timestamp:row.timestamp,syncTimestamp:row.syncTimestamp,
    carriedForward:row.carriedForward,status:displayStatus(row.rating)};
}
function projectPlatform(value:any,token:string):CloudPlatformResult{
  if(!value||!['talabat','keeta'].includes(value.platform)||!['SUCCESS','EMPTY','ERROR'].includes(value.state)||
    !Number.isSafeInteger(value.storeCount)||value.storeCount<0||(value.syncTimestamp!==null&&!iso(value.syncTimestamp))||
    ![null,'NO_RUN','LATEST_RUN_EMPTY','NO_RATINGS'].includes(value.emptyReason)||
    ![null,'RATINGS_READ_FAILED'].includes(value.errorCode)||!Array.isArray(value.ratings)||value.ratings.length>10000)throw Error();
  const ratings:CloudRating[]=value.ratings.map((row:any)=>projectRating(row,token));
  if(ratings.some(row=>row.platform!==value.platform)||value.storeCount!==ratings.length)throw Error();
  if(ratings.some(row=>row.syncTimestamp!==value.syncTimestamp))throw Error();
  if(value.platform==='keeta'&&ratings.some(row=>Date.parse(row.timestamp)>Date.parse(row.syncTimestamp!)||
    row.carriedForward!==(row.timestamp!==row.syncTimestamp)))throw Error();
  if(value.state==='SUCCESS'&&(!ratings.length||value.errorCode!==null||value.emptyReason!==null))throw Error();
  if(value.state==='EMPTY'&&(ratings.length||value.errorCode!==null||value.emptyReason===null))throw Error();
  if(value.state==='ERROR'&&(ratings.length||value.storeCount!==0||value.errorCode!=='RATINGS_READ_FAILED'||value.emptyReason!==null||value.syncTimestamp!==null))throw Error();
  return {platform:value.platform,state:value.state,storeCount:ratings.length,syncTimestamp:value.syncTimestamp,
    emptyReason:value.emptyReason,errorCode:value.errorCode,ratings};
}

export async function fetchLatestRatings(config:AppConfig,fetcher:typeof fetch=fetch){
  const token=config.ratingsApiToken;
  if(!token||token.length<32||token.length>512||/[\r\n]/.test(token))throw new RatingsProxyError(503,'Cloud ratings are not configured.');
  let url:URL;
  try{
    url=new URL(config.ratingsApiUrl||'');
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/api/ratings/latest'||url.search||url.hash)throw Error();
    url.searchParams.set('platform','all');
  }catch{throw new RatingsProxyError(503,'Cloud ratings are not configured.');}
  try{
    const response=await fetcher(url.href,{method:'GET',headers:{Authorization:`Bearer ${token}`,Accept:'application/json'},
      redirect:'error',signal:AbortSignal.timeout(25000),cache:'no-store'});
    if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body){await response.body?.cancel();throw Error();}
    const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
    try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>2_000_000){await reader.cancel();throw Error();}chunks.push(value);}}
    finally{reader.releaseLock();}
    const data=JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if(data?.ok!==true||data.selector!=='all'||!Array.isArray(data.platforms)||data.platforms.length!==2||!Array.isArray(data.ratings))throw Error();
    const platforms=data.platforms.map((item:any)=>projectPlatform(item,token));
    if(new Set(platforms.map((item:CloudPlatformResult)=>item.platform)).size!==2)throw Error();
    const ratings=platforms.filter((item:CloudPlatformResult)=>item.state!=='ERROR').flatMap((item:CloudPlatformResult)=>item.ratings)
      .sort((a:CloudRating,b:CloudRating)=>a.platform.localeCompare(b.platform)||a.storeIdentityKey.localeCompare(b.storeIdentityKey));
    const identities=new Set<string>();
    for(const row of ratings){const key=row.platform+'\0'+row.storeIdentityKey;if(identities.has(key))throw Error();identities.add(key);}
    const upstream=data.ratings.map((row:any)=>projectRating(row,token))
      .sort((a:CloudRating,b:CloudRating)=>a.platform.localeCompare(b.platform)||a.storeIdentityKey.localeCompare(b.storeIdentityKey));
    if(data.storeCount!==ratings.length||JSON.stringify(upstream)!==JSON.stringify(ratings))throw Error();
    return {ok:true,selector:'all' as const,storeCount:ratings.length,ratings,platforms};
  }catch{throw new RatingsProxyError(502,'Cloud ratings are unavailable. Please try again.');}
}
