import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import {createCoreRatingsHandler,projectCoreRatings,projectCoreCatalog} from '../src/core-ratings-api.ts';
import {createCloudHandler} from '../src/cloud-api.ts';
import type {DashboardRatings} from '../src/services/dashboard-ratings.ts';
import type {RegistryBranch} from '../src/services/branch-registry.ts';

const token='a'.repeat(64),now=Date.parse('2026-11-15T10:00:00.000Z');
const env={CORE_RATINGS_ENABLED:'1',CORE_RATINGS_TOKEN_SHA256:createHash('sha256').update(token).digest('hex'),CORE_RATINGS_BRANDS:JSON.stringify(['FRB Kabab'])};
function data():DashboardRatings{
 const rows=['allowed','inactive','other','unmapped'].map(storeIdentityKey=>({platform:'keeta' as const,storeIdentityKey,storeName:'Synthetic source name',rating:storeIdentityKey==='allowed'?4.39:null,reviewCount:null,oneStarCount:null,timestamp:'2026-11-13T09:00:00.000Z',syncTimestamp:'2026-11-15T09:00:00.000Z',previousRating:null,previousReviewCount:null,previousOneStarCount:null,previousTimestamp:null,carriedForward:true,status:'WARNING' as const}));
 return {ok:true,selector:'all',storeCount:rows.length,ratings:rows,platforms:[{platform:'keeta',state:'SUCCESS',storeCount:rows.length,syncTimestamp:rows[0]!.syncTimestamp,emptyReason:null,errorCode:null,ratings:rows}]};
}
const branch=(id:string,brand='FRB Kabab',active=true):RegistryBranch=>({id,brand,active,canonicalKey:brand+'|synthetic',branch:'Synthetic',displayName:brand+' — Synthetic'});
const registry=async()=>new Map([['rating:keeta\0allowed',branch('branch-a')],['rating:keeta\0inactive',branch('branch-b','FRB Kabab',false)],['rating:keeta\0other',branch('branch-c','Kabab Fareej')]]);
async function request(handler:ReturnType<typeof createCoreRatingsHandler>,{method='GET',url='/api/integrations/core/ratings',headers={authorization:'Bearer '+token}}:{method?:string;url?:string;headers?:Record<string,string>}={}){
 const result={status:0,headers:{} as Record<string,any>,body:''};
 await handler({method,url,headers} as any,{setHeader:(k:string,v:unknown)=>{result.headers[k]=v;},set statusCode(v:number){result.status=v;},end:(body='')=>{result.body=body;}} as any);
 return {...result,json:()=>JSON.parse(result.body)};
}
function handler(extraEnv:NodeJS.ProcessEnv={},overrides:any={}){return createCoreRatingsHandler({...env,...extraEnv},async()=>{throw Error('unexpected network');},{clock:()=>now,read:async()=>data(),registry,...overrides});}

test('machine API fails closed before opening data and cannot accept dashboard cookies or query keys',async()=>{
 let reads=0;const h=handler({}, {read:async()=>{reads++;return data();}});
 for(const headers of [{},{cookie:'rcc_session=synthetic'},{authorization:'Bearer wrong'},{authorization:'Bearer '+token+' extra'}])assert.equal((await request(h,{headers})).status,401);
 assert.equal(reads,0);
 assert.equal((await request(h,{url:'/api/integrations/core/ratings?token='+token})).status,400);
 assert.equal((await request(h,{method:'POST'})).status,405);
 assert.equal((await request(handler({CORE_RATINGS_ENABLED:'0'}))).status,503);
 for(const brands of ['', '[]','["Other"]','["FRB Kabab","FRB Kabab"]'])assert.equal((await request(handler({CORE_RATINGS_BRANDS:brands}))).status,503);
 assert.equal(reads,0);
});

test('exports only active registered authorized source identities, exact precision and observation age',async()=>{
 const response=await request(handler());assert.equal(response.status,200);const body=response.json();
 assert.equal(body.pollIntervalSeconds,14400);assert.equal(body.ratings.length,1);
 const row=body.ratings[0];assert.equal(row.branchId,'branch-a');assert.equal(row.sourceIdentity,'allowed');assert.equal(row.rating,4.39);assert.equal(row.ratingStatus,'ACCEPTABLE');assert.equal(row.freshness,'STALE');assert.equal(row.carriedForward,true);
 assert.match(row.id,/^[a-f0-9]{64}$/);assert.equal(row.reviewCount,null);
 assert.ok(!response.body.includes(token));assert.ok(!response.body.includes('branch-b'));assert.ok(!response.body.includes('branch-c'));assert.ok(!response.body.includes('oneStarCount'));assert.ok(!response.body.includes('sessionHealth'));
 assert.deepEqual(body.sources.find((p:any)=>p.platform==='keeta'),{platform:'keeta',state:'SUCCESS',count:1});
});

test('warm cache coalesces reads, validates auth before 304, and scope changes isolate cache',async()=>{
 let reads=0;const fetcher=async()=>{throw Error();};const deps={clock:()=>now,read:async()=>{reads++;return data();},registry};
 const h=createCoreRatingsHandler(env,fetcher,deps);const results=await Promise.all(Array.from({length:10},()=>request(h)));
 assert.equal(reads,1);const etag=results[0]!.headers.ETag;
 const unchanged=await request(h,{headers:{authorization:'Bearer '+token,'if-none-match':etag}});assert.equal(unchanged.status,304);assert.equal(unchanged.body,'');
 assert.equal((await request(h,{headers:{'if-none-match':etag}})).status,401);
 const other=createCoreRatingsHandler({...env,CORE_RATINGS_BRANDS:'["Kabab Fareej"]'},fetcher,deps);assert.equal((await request(other)).json().ratings[0].branchId,'branch-c');assert.equal(reads,2);
});

test('partial failures remain explicit, do not cache, and total outage is sanitized',async()=>{
 let reads=0;const h=handler({}, {read:async()=>{reads++;const d=data();d.platforms.push({platform:'talabat',state:'ERROR',ratings:[],storeCount:0,syncTimestamp:null,emptyReason:null,errorCode:'RATINGS_READ_FAILED'});return d;}});
 for(let i=0;i<2;i++){const r=await request(h);assert.equal(r.status,200);assert.equal(r.json().partial,true);assert.equal(r.json().ratings.length,1);}assert.equal(reads,2);
 const failure=await request(handler({}, {read:async()=>{throw Error('private database diagnostic');}}));assert.equal(failure.status,503);assert.equal(failure.body,'{"error":"RATINGS_UNAVAILABLE"}');
 const allFailed=await request(handler({}, {read:async()=>({...data(),ratings:[],platforms:[{platform:'talabat',state:'ERROR',ratings:[],storeCount:0,syncTimestamp:null,emptyReason:null,errorCode:'RATINGS_READ_FAILED'}]})}));assert.equal(allFailed.status,503);
});

test('registry failure clears the pending projection so a later poll can recover',async()=>{
 let calls=0;const h=handler({}, {registry:async()=>{if(++calls===1)throw Error('query timeout: private diagnostic');return registry();}});
 const failed=await request(h);assert.equal(failed.status,503);assert.ok(!failed.body.includes('diagnostic'));
 assert.equal((await request(h)).status,200);assert.equal(calls,2);
 const source=fs.readFileSync('src/services/branch-registry.ts','utf8');assert.match(source,/query_timeout:timeoutMs/);
});

test('null ratings stay unknown, source identities stay distinct, freshness boundaries are explicit',async()=>{
 const d=data();d.ratings=[d.ratings[0]!,{...d.ratings[0]!,storeIdentityKey:'another',rating:null,timestamp:'2026-11-15T09:00:00.000Z'}];
 const reg=async()=>new Map([['rating:keeta\0allowed',branch('same')],['rating:keeta\0another',branch('same')]]);
 const p=await projectCoreRatings(d,['FRB Kabab'],reg,now);assert.equal(p.ratings.length,2);assert.equal(new Set(p.ratings.map(r=>r.id)).size,2);
 const missing=p.ratings.find(r=>r.sourceIdentity==='another')!;assert.equal(missing.rating,null);assert.equal(missing.ratingStatus,'UNKNOWN');assert.equal(missing.freshness,'LIVE');
 d.ratings.push(d.ratings[0]!);await assert.rejects(projectCoreRatings(d,['FRB Kabab'],reg,now),/DUPLICATE/);
});

test('per-instance request limit is bounded and cached responses remain private',async()=>{
 const h=handler();for(let i=0;i<60;i++)assert.equal((await request(h)).status,200);
 const r=await request(h);assert.equal(r.status,429);assert.equal(r.headers['Retry-After'],'60');assert.equal(r.headers['Cache-Control'],'private, no-store');
 const route=fs.readFileSync('src/cloud-api.ts','utf8');assert.match(route,/createCoreRatingsHandler/);assert.ok(!route.includes("from './server.ts'"));
 assert.equal((await request(handler(),{url:'/api/config?integration=core-ratings'})).status,200);
 assert.equal((await request(handler(),{url:'/api/config?integration=core-ratings&integration=core-ratings'})).status,400);
});

test('existing config route retains dashboard auth while machine route fails closed independently',async()=>{
 let logins=0;
 const route=createCloudHandler('config',{CORE_RATINGS_ENABLED:'0'},fetch,async(_req,res)=>{logins++;res.statusCode=401;res.end('{"error":"LOGIN_REQUIRED"}');return null;});
 assert.equal((await request(route,{url:'/api/config?integration=core-ratings',headers:{}})).status,503);assert.equal(logins,0);
 assert.equal((await request(route,{url:'/api/config',headers:{}})).status,401);assert.equal(logins,1);
 const cfg=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 assert.deepEqual(cfg.rewrites,[{source:'/api/integrations/core/ratings',destination:'/api/config?integration=core-ratings'},{source:'/api/integrations/core/catalog',destination:'/api/config?integration=core-catalog'}]);
});

test('catalog includes active registered branches without any rating source, groups sources by fixed branch ID',()=>{
 const rows=[{...branch('branch-a'),sourceType:'rating:keeta',sourceId:'KEETA;ACCOUNT1;SHOP1'},
  {...branch('branch-a'),sourceType:'rating:talabat',sourceId:'TB_AE;SHOP2'},
  {...branch('branch-no-rating'),sourceType:null,sourceId:null},
  {...branch('inactive','FRB Kabab',false),sourceType:null,sourceId:null},
  {...branch('outside','Leekh'),sourceType:null,sourceId:null}];
 const result=projectCoreCatalog(rows,['FRB Kabab','Tanoorna Ghyr'],now);
 assert.equal(result.brands.length,2);assert.equal(result.branches.length,2);assert.equal(result.branches.find(b=>b.id==='branch-a')!.sources.length,2);
 assert.deepEqual(result.branches.find(b=>b.id==='branch-no-rating')!.sources,[]);
 assert.equal(result.brands.find(b=>b.name==='Tanoorna Ghyr')!.branchCount,0);
 assert.equal(new Set(result.branches.map(b=>b.id)).size,2);assert.ok(!JSON.stringify(result).includes('canonicalKey'));
 const shuffled=projectCoreCatalog([...rows].reverse(),['Tanoorna Ghyr','FRB Kabab'],now);assert.deepEqual(result,shuffled);
});

test('catalog auth/cache/errors stay independent of ratings and keep unchanged responses small',async()=>{
 let reads=0,ratingReads=0;const h=handler({}, {read:async()=>{ratingReads++;throw Error();},catalog:async()=>{reads++;return [{...branch('new-branch'),sourceType:null,sourceId:null}];}});
 const url='/api/config?integration=core-catalog';
 assert.equal((await request(h,{url,headers:{}})).status,401);assert.equal(reads,0);
 const r=await request(h,{url});assert.equal(r.status,200);assert.equal(r.json().branches[0].id,'new-branch');
 const unchanged=await request(h,{url,headers:{authorization:'Bearer '+token,'if-none-match':r.headers.ETag}});assert.equal(unchanged.status,304);assert.equal(reads,1);assert.equal(ratingReads,0);
 const bad=await request(handler({}, {catalog:async()=>{throw Error('private SQL');}}),{url});assert.equal(bad.status,503);assert.equal(bad.body,'{"error":"CATALOG_UNAVAILABLE"}');
 assert.equal((await request(h,{url:url+'&brand=Leekh'})).status,400);
});

test('catalog rejects conflicting source ownership instead of guessing a physical branch merge',()=>{
 const rows=[{...branch('a'),sourceType:'rating:keeta',sourceId:'same'}, {...branch('b'),sourceType:'rating:keeta',sourceId:'same'}];
 assert.throws(()=>projectCoreCatalog(rows,['FRB Kabab'],now),/CONFLICT/);
 const sql=fs.readFileSync('src/services/branch-registry.ts','utf8');assert.match(sql,/LEFT JOIN dashboard_branch_sources/);assert.match(sql,/LIMIT 10001/);
});
