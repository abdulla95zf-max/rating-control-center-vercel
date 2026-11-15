import {createHash,timingSafeEqual} from 'node:crypto';
import type {IncomingMessage,ServerResponse} from 'node:http';
import {beforeDeadline,readDashboardRatings} from './services/dashboard-ratings.ts';
import type {CloudRating,CloudPlatformResult} from './services/latest-ratings-proxy.ts';
import {readRegisteredBranchSources,readIntegrationBranchCatalog,type BranchSource,type RegistryBranch,type CatalogBranch} from './services/branch-registry.ts';
import {reportKey,reportRead} from './services/report-read-cache.ts';
import {displayStatus} from './services/rating-status.ts';

const platforms=['talabat','keeta','noon','deliveroo'] as const;
export const coreRatingBrands=['Kabab Fareej','FRB Shawarma','FRB Kabab','Taazaa Mumbai','Kabab Al Sham','Leekh','Marwareed','Tanoorna Ghyr'] as const;
const digest=(value:string)=>createHash('sha256').update(value).digest('hex');
type RatingData={ratings:CloudRating[];platforms:CloudPlatformResult[]};
type Dependencies={read:()=>Promise<RatingData>;registry:(sources:BranchSource[])=>Promise<Map<string,RegistryBranch>>;catalog:(brands:readonly string[])=>Promise<CatalogBranch[]>;clock:()=>number};
const brandId=(brand:string)=>digest('brand\0'+brand);

export function projectCoreCatalog(rows:CatalogBranch[],brands:readonly string[],now:number){
 if(rows.length>10000)throw Error('CATALOG_LIMIT');
 const branches=new Map<string,{id:string;brandId:string;brand:string;name:string;displayName:string;active:true;sources:Array<{platform:string;sourceIdentity:string;ratingId:string}>}>();
 const owners=new Map<string,string>();
 for(const row of rows){
  if(!row.active||!brands.includes(row.brand))continue;
  const entry=branches.get(row.id)||{id:row.id,brandId:brandId(row.brand),brand:row.brand,name:row.branch,displayName:row.displayName,active:true as const,sources:[]};
  if(entry.brand!==row.brand||entry.name!==row.branch||entry.displayName!==row.displayName)throw Error('CATALOG_CONFLICT');
  if(row.sourceType!==null||row.sourceId!==null){
   const platform=row.sourceType?.replace(/^rating:/,'');
   if(!platforms.includes(platform as any)||!row.sourceType?.startsWith('rating:')||!row.sourceId)throw Error('CATALOG_INVALID_SOURCE');
   const ratingId=digest(platform+'\0'+row.sourceId),owner=owners.get(ratingId);
   if(owner&&owner!==row.id)throw Error('CATALOG_CONFLICT');
   if(!owner)entry.sources.push({platform:platform!,sourceIdentity:row.sourceId,ratingId});
   owners.set(ratingId,row.id);
  }
  branches.set(row.id,entry);
 }
 const sorted=[...branches.values()].map(branch=>({...branch,sources:branch.sources.sort((a,b)=>a.ratingId.localeCompare(b.ratingId))})).sort((a,b)=>a.id.localeCompare(b.id));
 return {schemaVersion:'1',asOf:new Date(now).toISOString(),pollIntervalSeconds:14400,scope:{brands:[...brands].sort(),activeBranchesOnly:true},
  inventory:'RCC_REGISTERED_ACTIVE_BRANCHES',brands:brands.map(name=>({id:brandId(name),name,displayName:name==='Marwareed'?'Morwarid':name,branchCount:sorted.filter(b=>b.brand===name).length})).sort((a,b)=>a.id.localeCompare(b.id)),branches:sorted};
}

function freshness(at:string|null,platform:string,now:number){
 const age=at===null?NaN:now-Date.parse(at);
 if(!Number.isFinite(age)||age<0)return 'UNKNOWN';
 const daily=platform!=='talabat';
 return age>(daily?48:12)*3600000?'STALE':age>=(daily?26:7)*3600000?'DELAYED':'LIVE';
}

/** Explicit projection: never export users, sessions, credentials or unscoped source counts. */
export async function projectCoreRatings(data:RatingData,brands:readonly string[],registry:Dependencies['registry'],now:number){
 if(data.ratings.length>10000)throw Error('RATINGS_LIMIT');
 const records=await registry(data.ratings.map(row=>({sourceType:`rating:${row.platform}`,sourceId:row.storeIdentityKey,storeName:row.storeName||''})));
 const seen=new Set<string>();
 const ratings=data.ratings.flatMap(row=>{
  const branch=records.get(`rating:${row.platform}\0${row.storeIdentityKey}`);
  if(!branch?.active||!brands.includes(branch.brand))return [];
  if(!platforms.includes(row.platform)||!Number.isFinite(Date.parse(row.timestamp)))throw Error('RATINGS_INVALID');
  const id=digest(row.platform+'\0'+row.storeIdentityKey);if(seen.has(id))throw Error('RATINGS_DUPLICATE');seen.add(id);
  return [{id,branchId:branch.id,brandId:brandId(branch.brand),brand:branch.brand,branchName:branch.branch,displayName:branch.displayName,
   platform:row.platform,sourceIdentity:row.storeIdentityKey,sourceName:row.storeName,rating:row.rating,
   ratingStatus:displayStatus(row.rating),reviewCount:row.reviewCount,observedAt:row.timestamp,
   syncedAt:row.syncTimestamp,carriedForward:row.carriedForward,freshness:freshness(row.timestamp,row.platform,now)}];
 }).sort((a,b)=>a.id.localeCompare(b.id));
 const sources=platforms.map(platform=>{
  const source=data.platforms.find(p=>p.platform===platform),rows=ratings.filter(row=>row.platform===platform);
  const state=!source?'DISABLED':source.state==='ERROR'?'ERROR':rows.length?'SUCCESS':'EMPTY';
  return {platform,state,count:rows.length};
 });
 return {schemaVersion:'1',asOf:new Date(now).toISOString(),pollIntervalSeconds:14400,scope:{brands:[...brands].sort(),activeBranchesOnly:true},
  partial:sources.some(source=>source.state==='ERROR'),sources,ratings};
}

export function createCoreRatingsHandler(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch,overrides:Partial<Dependencies>={}){
 const deps:Dependencies={read:()=>readDashboardRatings(env,fetcher),registry:sources=>readRegisteredBranchSources(sources,5000),catalog:readIntegrationBranchCatalog,clock:Date.now,...overrides};
 let windowAt=0,requests=0;
 return async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('Cache-Control','private, no-store');response.setHeader('Content-Type','application/json; charset=utf-8');
  response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Vary','Authorization');
  const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
  if(request.method!=='GET'){response.setHeader('Allow','GET');return send(405,{error:'METHOD_NOT_ALLOWED'});}
  if(env.CORE_RATINGS_ENABLED!=='1')return send(503,{error:'INTEGRATION_DISABLED'});
  let brands:string[];
  try{const parsed=JSON.parse(env.CORE_RATINGS_BRANDS||'');if(!Array.isArray(parsed)||!parsed.length||parsed.length>8||parsed.some(b=>!coreRatingBrands.includes(b))||new Set(parsed).size!==parsed.length)throw Error();brands=parsed;}catch{return send(503,{error:'INTEGRATION_NOT_CONFIGURED'});}
  const expected=env.CORE_RATINGS_TOKEN_SHA256||'';
  if(!/^[a-f0-9]{64}$/.test(expected))return send(503,{error:'INTEGRATION_NOT_CONFIGURED'});
  const authorization=request.headers.authorization;
  if(typeof authorization!=='string'||!/^Bearer [A-Za-z0-9_-]{43,128}$/.test(authorization)||!timingSafeEqual(Buffer.from(digest(authorization.slice(7)),'hex'),Buffer.from(expected,'hex'))){response.setHeader('WWW-Authenticate','Bearer');return send(401,{error:'UNAUTHORIZED'});}
  const url=new URL(request.url||'/','https://integration.invalid');
  const integration=url.searchParams.get('integration');
  const catalog=integration==='core-catalog'||url.pathname==='/api/integrations/core/catalog';
  const routed=url.searchParams.size===1&&url.searchParams.getAll('integration').length===1&&['core-ratings','core-catalog'].includes(integration||'');
  if((url.search&&!routed)||request.headers['sec-fetch-site']==='cross-site')return send(400,{error:'INVALID_REQUEST'});
  const now=deps.clock();if(now-windowAt>=60000){windowAt=now;requests=0;}
  if(++requests>60){response.setHeader('Retry-After','60');return send(429,{error:'RATE_LIMITED'});}
  if(catalog){
   try{
    const body=await beforeDeadline(Date.now()+20000,()=>reportRead(fetcher,reportKey('core-catalog-v1',expected,brands,env.DATABASE_URL),()=>beforeDeadline(Date.now()+18000,async()=>projectCoreCatalog(await deps.catalog(brands),brands,deps.clock())),300000));
    const {asOf,...semantic}=body;const etag='W/"'+digest(JSON.stringify(semantic))+'"';
    if(Buffer.byteLength(JSON.stringify(body))>2000000)throw Error('CATALOG_LIMIT');
    response.setHeader('ETag',etag);response.setHeader('X-Snapshot-As-Of',asOf);response.setHeader('X-Poll-Interval-Seconds','14400');
    if(request.headers['if-none-match']===etag){response.statusCode=304;return response.end();}
    return send(200,body);
   }catch{return send(503,{error:'CATALOG_UNAVAILABLE'});}
  }
  try{
   const key=reportKey('core-ratings-v1',expected,brands,env.DATABASE_URL,env.RATINGS_API_URL,env.RATINGS_API_TOKEN,env.NOON_RATINGS_ENABLED,env.DELIVEROO_RATINGS_ENABLED);
   const payload=await beforeDeadline(Date.now()+20000,()=>reportRead(fetcher,key,()=>beforeDeadline(Date.now()+18000,async()=>{
    const result=await projectCoreRatings(await deps.read(),brands,deps.registry,deps.clock());
    // Failed sources retry on the next request instead of being cached as a healthy snapshot.
    return {...result,ok:!result.partial};
   }),300000));
   if(payload.sources.every(source=>source.state==='ERROR'||source.state==='DISABLED'))return send(503,{error:'RATINGS_UNAVAILABLE'});
   const {ok:_,...body}=payload;
   if(Buffer.byteLength(JSON.stringify(body))>2000000)return send(503,{error:'RATINGS_UNAVAILABLE'});
   const {asOf,...semanticBody}=body;
   const etag='W/"'+digest(JSON.stringify(semanticBody))+'"';response.setHeader('ETag',etag);
   response.setHeader('X-Snapshot-As-Of',asOf);
   response.setHeader('X-Poll-Interval-Seconds','14400');
   if(request.headers['if-none-match']===etag){response.statusCode=304;return response.end();}
   return send(200,body);
  }catch{return send(503,{error:'RATINGS_UNAVAILABLE'});}
 };
}
