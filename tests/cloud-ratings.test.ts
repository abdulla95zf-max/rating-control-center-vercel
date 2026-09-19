import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type {AddressInfo} from 'node:net';
import {createApp} from '../src/app.ts';
import {fetchLatestRatings} from '../src/services/latest-ratings-proxy.ts';

const secret = 'PRIVATE-server-token-'.repeat(3);
const config = {host:'127.0.0.1',port:3000,talabatDatabasePath:'',autoRefreshSeconds:60,
  publicDirectory:path.resolve('public'),ratingsApiUrl:'https://example.vercel.app/api/ratings/latest',ratingsApiToken:secret};
const row = {storeIdentityKey:'synthetic:branch-a',storeName:'Synthetic Marina فرع',rating:4.5,reviewCount:25,oneStarCount:1,status:'HEALTHY',timestamp:'2026-09-17T12:00:00.000Z'};
const payload = {ok:true,storeCount:1,ratings:[row]};
async function serve(fetcher:typeof fetch, action:(base:string)=>Promise<void>, settings=config) {
  const server=createApp(settings,undefined,fetcher).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try {await action(`http://127.0.0.1:${(server.address() as AddressInfo).port}`);}
  finally {await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()));}
}

test('dashboard proxy authenticates server-to-server and projects only rating fields',async()=>{
  let calls=0;
  const mock:typeof fetch=async(url,options)=>{
    calls++;assert.equal(url,config.ratingsApiUrl);assert.equal(options?.method,'GET');
    assert.equal((options?.headers as any).Authorization,'Bearer '+secret);
    assert.equal(options?.redirect,'error');assert.ok(options?.signal);
    return Response.json({...payload,debug:secret,ratings:[{...row,token:secret}]});
  };
  await serve(mock,async base=>{
    const result=await fetch(base+'/api/dashboard/ratings/latest');
    assert.equal(result.status,200);assert.deepEqual(await result.json(),payload);
    assert.equal(calls,1);assert.match(result.headers.get('cache-control')!,/no-store/);
    const rejected=await fetch(base+'/api/dashboard/ratings/latest',{headers:{'Sec-Fetch-Site':'cross-site'}});
    assert.equal(rejected.status,403);assert.equal(calls,1);
  });
});

test('upstream failures and malformed payloads return a fixed error without leaking secrets',async()=>{
  for(const mock of [async()=>new Response(secret,{status:401}),async()=>{throw Error(secret);},
    async()=>Response.json({ok:true,storeCount:1,ratings:[{...row,rating:secret}]}),
    async()=>Response.json({ok:true,storeCount:1,ratings:[{...row,storeIdentityKey:secret}]}),
    async()=>new Response('x'.repeat(2_000_001),{headers:{'content-type':'application/json'}})]){
    await serve(mock as typeof fetch,async base=>{
      const response=await fetch(base+'/api/dashboard/ratings/latest');assert.equal(response.status,502);
      assert.deepEqual(await response.json(),{error:'Cloud ratings are unavailable. Please try again.'});
    });
  }
});

test('missing token fails closed before upstream access',async()=>{
  await serve((async()=>assert.fail('upstream must not be called')) as typeof fetch,async base=>{
    const response=await fetch(base+'/api/dashboard/ratings/latest');assert.equal(response.status,503);
    assert.deepEqual(await response.json(),{error:'Cloud ratings are not configured.'});
  },{...config,ratingsApiToken:''});
});

test('unsafe upstream URL configurations never receive credentials',async()=>{
  for(const url of ['http://example.com/api/ratings/latest','https://user:pass@example.com/api/ratings/latest','https://example.com/api/run','https://example.com/api/ratings/latest?token=x','https://example.com:444/api/ratings/latest']){
    await assert.rejects(fetchLatestRatings({...config,ratingsApiUrl:url},(async()=>assert.fail()) as typeof fetch),{status:503});
  }
});

test('empty ratings pass through and token is absent from browser assets/config/HTML',async()=>{
  await serve((async()=>Response.json({ok:true,storeCount:0,ratings:[]})) as typeof fetch,async base=>{
    assert.deepEqual(await (await fetch(base+'/api/dashboard/ratings/latest')).json(),{ok:true,storeCount:0,ratings:[]});
    for(const route of ['/','/api/config','/app.js','/styles.css']){
      const response=await fetch(base+route);assert.equal(response.status,200);
      const text=await response.text();assert.ok(!text.includes(secret));assert.doesNotMatch(text,/RATINGS_API_TOKEN|example\.vercel\.app|Bearer /);
    }
  });
  for(const name of fs.readdirSync('public')){
    if(fs.statSync(path.join('public',name)).isFile())assert.doesNotMatch(fs.readFileSync(path.join('public',name),'utf8'),/RATINGS_API_TOKEN|PRIVATE-server-token/);
  }
});

test('cloud UI fetches only internal endpoint and renders fields using existing status colors',async()=>{
  const main={innerHTML:'',querySelectorAll:()=>[]};
  const node={querySelectorAll:()=>[],addEventListener:()=>{},querySelector:()=>({dataset:{}})};
  const urls:string[]=[];
  const context=vm.createContext({Intl,Date,URLSearchParams,console,
    document:{getElementById:(id:string)=>id==='mainContent'?main:node,querySelectorAll:()=>[],addEventListener:()=>{}},
    ResizeObserver:class{observe(){}},location:{hash:''},
    fetch:async(url:string,options:any)=>{urls.push(url);assert.deepEqual(Object.keys(options.headers),['accept']);return {ok:true,json:async()=>payload};}
  });
  const source=fs.readFileSync('public/app.js','utf8').replace(/initialize\(\);\s*$/,'');
  vm.runInContext(source,context);
  await vm.runInContext('renderCloudRatings()',context);
  assert.deepEqual(urls,['/api/dashboard/ratings/latest']);
  for(const text of [row.storeName,row.storeIdentityKey,'4.5','25','HEALTHY',row.timestamp,'One-star count','status-healthy'])assert.ok(main.innerHTML.includes(text),text);
  assert.ok(main.innerHTML.indexOf(row.storeName)<main.innerHTML.indexOf(row.storeIdentityKey));
  await vm.runInContext("state.search='Marina'; renderCloudRatings()",context);
  assert.ok(main.innerHTML.includes(row.storeName));
  await vm.runInContext("state.search='branch-a'; renderCloudRatings()",context);
  assert.ok(main.innerHTML.includes(row.storeName));
  const css=fs.readFileSync('public/styles.css','utf8');
  for(const status of ['healthy','acceptable','warning','critical'])assert.match(css,new RegExp('status-'+status));
});

test('Missing names remain null and names cannot reflect the server token',async()=>{
 const result=await fetchLatestRatings(config,(async()=>Response.json({...payload,ratings:[{...row,storeName:undefined}]})) as typeof fetch);
 assert.deepEqual(result.ratings[0],{...row,storeName:null});
 await assert.rejects(fetchLatestRatings(config,(async()=>Response.json({...payload,ratings:[{...row,storeName:secret}]})) as typeof fetch),{status:502});
});
