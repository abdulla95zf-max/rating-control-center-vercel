import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type {AddressInfo} from 'node:net';
import {createApp} from '../src/app.ts';
import {fetchLatestRatings} from '../src/services/latest-ratings-proxy.ts';
import {displayStatus} from '../src/services/rating-status.ts';

const secret='PRIVATE-server-token-'.repeat(3);
const config={host:'127.0.0.1',port:3000,talabatDatabasePath:'',autoRefreshSeconds:60,
  publicDirectory:path.resolve('public'),ratingsApiUrl:'https://example.vercel.app/api/ratings/latest',ratingsApiToken:secret};
const talabat={platform:'talabat',storeIdentityKey:'TB_AE;one',storeName:'Synthetic Same',rating:4.4,reviewCount:25,oneStarCount:1,
  timestamp:'2026-09-17T12:00:00.000Z',syncTimestamp:'2026-09-17T12:00:00.000Z',carriedForward:false};
const keeta={platform:'keeta',storeIdentityKey:'KEETA;one',storeName:'Synthetic Same',rating:4.3,reviewCount:null,oneStarCount:null,
  timestamp:'2026-09-17T11:00:00.000Z',syncTimestamp:'2026-09-17T12:00:00.000Z',carriedForward:true};
const platform=(name:'talabat'|'keeta',ratings:any[],state='SUCCESS')=>({platform:name,state,storeCount:ratings.length,
  syncTimestamp:state==='ERROR'?null:'2026-09-17T12:00:00.000Z',emptyReason:state==='EMPTY'?'NO_RATINGS':null,
  errorCode:state==='ERROR'?'RATINGS_READ_FAILED':null,ratings});
const payload={ok:true,selector:'all',storeCount:2,ratings:[keeta,talabat],platforms:[platform('talabat',[talabat]),platform('keeta',[keeta])]};
const projected={ok:true,selector:'all',storeCount:2,
  ratings:[{...keeta,status:'ACCEPTABLE'},{...talabat,status:'HEALTHY'}],
  platforms:[{...platform('talabat',[talabat]),ratings:[{...talabat,status:'HEALTHY'}]},
    {...platform('keeta',[keeta]),ratings:[{...keeta,status:'ACCEPTABLE'}]}]};
async function serve(fetcher:typeof fetch,action:(base:string)=>Promise<void>,settings=config){
  const server=createApp(settings,undefined,fetcher).listen(0,'127.0.0.1');await new Promise<void>(r=>server.once('listening',r));
  try{await action(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);}finally{await new Promise<void>((r,j)=>server.close(e=>e?j(e):r()));}
}

test('display status uses one centralized final boundary rule',()=>{
  for(const [rating,status] of [[5,'HEALTHY'],[4.4,'HEALTHY'],[4.3,'ACCEPTABLE'],[4.2,'WARNING'],[4.1,'WARNING'],[4.0,'CRITICAL'],[3.9,'CRITICAL'],[null,'UNKNOWN']] as const)
    assert.equal(displayStatus(rating),status);
  assert.throws(()=>displayStatus(0),{message:'INVALID_RATING'});
});

test('dashboard proxy requests platform=all, authenticates server-to-server and normalizes legacy status',async()=>{
  let calls=0;
  const mock:typeof fetch=async(url,options)=>{calls++;assert.equal(url,config.ratingsApiUrl+'?platform=all');
    assert.equal((options?.headers as any).Authorization,'Bearer '+secret);assert.equal(options?.redirect,'error');
    return Response.json({...payload,debug:secret,ratings:payload.ratings.map(row=>({...row,status:'CRITICAL',token:secret}))});};
  await serve(mock,async base=>{
    const response=await fetch(base+'/api/dashboard/ratings/latest');assert.equal(response.status,200);
    const result=await response.json();assert.deepEqual(result,projected);assert.equal(calls,1);
    assert.ok(!JSON.stringify(result).includes(secret));
    const rejected=await fetch(base+'/api/dashboard/ratings/latest',{headers:{'Sec-Fetch-Site':'cross-site'}});
    assert.equal(rejected.status,403);assert.equal(calls,1);
  });
});

test('strict upstream validation, redirect rejection and response-size limit return fixed errors',async()=>{
  for(const mock of [async()=>new Response(secret,{status:401}),async()=>{throw Error(secret);},
    async()=>Response.json({...payload,storeCount:999}),async()=>Response.json({...payload,ratings:[{...keeta,platform:'noon'}]}),
    async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'application/json'}})]){
    await serve(mock as typeof fetch,async base=>{const response=await fetch(base+'/api/dashboard/ratings/latest');
      assert.equal(response.status,502);assert.deepEqual(await response.json(),{error:'Cloud ratings are unavailable. Please try again.'});});
  }
  for(const url of ['http://example.com/api/ratings/latest','https://user:pass@example.com/api/ratings/latest',
    'https://example.com/api/run','https://example.com/api/ratings/latest?x=1','https://example.com:444/api/ratings/latest'])
    await assert.rejects(fetchLatestRatings({...config,ratingsApiUrl:url},async()=>assert.fail()),{status:503});
});

test('partial failure and empty platform remain projected without hiding successful rows',async()=>{
  const partial={ok:true,selector:'all',storeCount:1,ratings:[talabat],
    platforms:[platform('talabat',[talabat]),platform('keeta',[],'ERROR')]};
  const result=await fetchLatestRatings(config,async()=>Response.json(partial));
  assert.equal(result.ratings.length,1);assert.equal(result.platforms[1].state,'ERROR');
  const empty={ok:true,selector:'all',storeCount:1,ratings:[talabat],
    platforms:[platform('talabat',[talabat]),platform('keeta',[],'EMPTY')]};
  assert.equal((await fetchLatestRatings(config,async()=>Response.json(empty))).platforms[1].state,'EMPTY');
});

test('cloud UI renders combined and isolated tabs, badges, nullable counts and no fabricated History',async()=>{
  const main:any={innerHTML:'',querySelectorAll:()=>[]};const node:any={querySelectorAll:()=>[],addEventListener:()=>{},querySelector:()=>({dataset:{}})};
  const urls:string[]=[];const context=vm.createContext({Intl,Date,URLSearchParams,console,
    document:{getElementById:(id:string)=>id==='mainContent'?main:node,querySelectorAll:()=>[],addEventListener:()=>{}},
    ResizeObserver:class{observe(){}},location:{hash:''},history:{replaceState(){}},window:{setInterval(){},clearTimeout(){},setTimeout(fn:any){fn();}},
    fetch:async(url:string)=>{urls.push(url);return {ok:true,json:async()=>projected};}});
  const source=fs.readFileSync('public/app.js','utf8').replace(/initialize\(\);\s*$/,'');vm.runInContext(source,context);
  assert.equal(vm.runInContext('formatNumber(null)',context),'—');assert.equal(vm.runInContext('formatNumber(0)',context),'0');
  await vm.runInContext('state.tab="overview";renderCloudRatings()',context);
  for(const text of ['TB_AE;one','KEETA;one','platform-talabat','platform-keeta','Carried forward','Cloud History is not available','>—<','UNKNOWN'])assert.ok(main.innerHTML.includes(text),text);
  await vm.runInContext('state.tab="talabat";renderCloudRatings()',context);assert.ok(main.innerHTML.includes('TB_AE;one'));assert.ok(!main.innerHTML.includes('KEETA;one'));
  await vm.runInContext('state.tab="keeta";renderCloudRatings()',context);assert.ok(main.innerHTML.includes('KEETA;one'));assert.ok(!main.innerHTML.includes('TB_AE;one'));
  assert.deepEqual(urls,['/api/dashboard/ratings/latest','/api/dashboard/ratings/latest','/api/dashboard/ratings/latest']);
});

test('missing token and public assets fail closed without exposing token or upstream URL',async()=>{
  await serve(async()=>assert.fail(),async base=>{const response=await fetch(base+'/api/dashboard/ratings/latest');assert.equal(response.status,503);},
    {...config,ratingsApiToken:''});
  for(const name of fs.readdirSync('public'))if(fs.statSync(path.join('public',name)).isFile()){
    const text=fs.readFileSync(path.join('public',name),'utf8');assert.doesNotMatch(text,/RATINGS_API_TOKEN|PRIVATE-server-token|Bearer /);
  }
});
