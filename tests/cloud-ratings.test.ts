import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import type {AddressInfo} from 'node:net';
import {createServer} from 'node:http';
import {createApp} from '../src/app.ts';
import {fetchLatestRatings} from '../src/services/latest-ratings-proxy.ts';
import {displayStatus} from '../src/services/rating-status.ts';

const secret='PRIVATE-server-token-'.repeat(3);
const config={host:'127.0.0.1',port:3000,talabatDatabasePath:'',autoRefreshSeconds:60,
  publicDirectory:path.resolve('public'),ratingsApiUrl:'https://example.vercel.app/api/ratings/latest',ratingsApiToken:secret};
const talabat={platform:'talabat',storeIdentityKey:'TB_AE;one',storeName:'Synthetic Same',rating:4.4,reviewCount:25,oneStarCount:1,
  previousRating:4.6,previousReviewCount:23,previousOneStarCount:0,previousTimestamp:'2026-09-17T08:00:00.000Z',
  timestamp:'2026-09-17T12:00:00.000Z',syncTimestamp:'2026-09-17T12:00:00.000Z',carriedForward:false};
const keeta={platform:'keeta',storeIdentityKey:'KEETA;one',storeName:'Synthetic Same',rating:4.3,reviewCount:null,oneStarCount:null,
  previousRating:null,previousReviewCount:null,previousOneStarCount:null,previousTimestamp:null,
  timestamp:'2026-09-17T11:00:00.000Z',syncTimestamp:'2026-09-17T12:00:00.000Z',carriedForward:true};
const platform=(name:'talabat'|'keeta',ratings:any[],state='SUCCESS')=>({platform:name,state,storeCount:ratings.length,
  syncTimestamp:state==='ERROR'?null:'2026-09-17T12:00:00.000Z',emptyReason:state==='EMPTY'?'NO_RATINGS':null,
  errorCode:state==='ERROR'?'RATINGS_READ_FAILED':null,ratings});
const payload={ok:true,selector:'all',storeCount:2,ratings:[keeta,talabat],platforms:[platform('talabat',[talabat]),platform('keeta',[keeta])]};
const projected={ok:true,selector:'all',storeCount:2,
  ratings:[{...keeta,status:'ACCEPTABLE'},{...talabat,status:'HEALTHY'}],
  platforms:[{...platform('talabat',[talabat]),ratings:[{...talabat,status:'HEALTHY'}]},
    {...platform('keeta',[keeta]),ratings:[{...keeta,status:'ACCEPTABLE'}]}]};
let nextTestPort=49152;
async function serve(fetcher:typeof fetch,action:(base:string)=>Promise<void>,settings=config){
  // Windows can assign a port blocked by Fetch when listen(0) is used.
  // Bind only in a high range outside Fetch's blocked ports; retain real HTTP tests.
  // Never reuse a port across servers: Fetch can retain pooled connections after close.
  const server=createServer(createApp(settings,undefined,fetcher));
  for(let attempt=0;attempt<64;attempt++){
    const port=nextTestPort++;if(port>65535)throw Error('TEST_PORT_RANGE_EXHAUSTED');
    try{
      await new Promise<void>((resolve,reject)=>{
        const cleanup=()=>{server.off('error',onError);server.off('listening',onListening);};
        const onError=(error:Error)=>{cleanup();reject(error);};
        const onListening=()=>{cleanup();resolve();};
        server.once('error',onError);server.once('listening',onListening);server.listen(port,'127.0.0.1');
      });break;
    }catch(error:any){if(error?.code!=='EADDRINUSE'||attempt===63)throw error;}
  }
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
    async()=>Response.json({...payload,ratings:[{...keeta,previousTimestamp:'2026-09-18T11:00:00.000Z'}]}),
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

test('cloud UI groups matching branches, filters brands and keeps counts in the detail drawer',async()=>{
  const talabatBranch={...talabat,storeIdentityKey:'TB_AE;fareej',storeName:'Kabab Fareej, Al Warqa 1'};
  const keetaBranch={...keeta,storeIdentityKey:'KEETA;fareej',storeName:'KF - Al Warqa'};
  const grouped={...projected,ratings:[{...talabatBranch,status:'HEALTHY'},{...keetaBranch,status:'ACCEPTABLE'}],
    platforms:[{...projected.platforms[0],ratings:[{...talabatBranch,status:'HEALTHY'}]},
      {...projected.platforms[1],ratings:[{...keetaBranch,status:'ACCEPTABLE'}]}]};
  const main:any={innerHTML:'',querySelectorAll:()=>[],querySelector:()=>null};
  const detail:any={innerHTML:'',querySelectorAll:()=>[]};
  const panel:any={classList:{add:()=>{},remove:()=>{},contains:()=>false},setAttribute:()=>{}};
  const node:any={querySelectorAll:()=>[],addEventListener:()=>{},querySelector:()=>({dataset:{}})};
  const performance={reportDate:'2026-09-20',rows:[{storeId:'1',storeName:'Kabab Fareej, Al Warqa',present:true,values:{'Successful Orders':'8','Customer Complaint rate':'1.2','Avoidable cancellation rate':'0','Unavailable Time Duration Rate':'0','Average preparation time (minutes)':'12'}}]};
  const actionHistory={points:Array.from({length:7},(_,index)=>({reportDate:`2026-09-${String(20-index).padStart(2,'0')}`,storeId:'1',orders:8,complaints:1.2,cancellation:0,offline:0,prep:12}))};
  const urls:string[]=[];const context=vm.createContext({Intl,Date,URLSearchParams,TextEncoder,console,performanceState:{},performanceFormat:(value:any)=>String(value),performanceDetail:()=>{},
    document:{getElementById:(id:string)=>id==='mainContent'?main:id==='detailContent'?detail:id==='detailPanel'?panel:node,querySelectorAll:()=>[],addEventListener:()=>{}},
    ResizeObserver:class{observe(){}},location:{hash:''},history:{replaceState(){}},window:{setInterval(){},clearTimeout(){},setTimeout(fn:any){fn();}},
    fetch:async(url:string)=>{urls.push(url);return {ok:true,json:async()=>url.includes('action-history')?actionHistory:url.includes('/performance/')?performance:grouped};}});
  vm.runInContext(fs.readFileSync('public/branch-labels.js','utf8'),context);
  vm.runInContext(fs.readFileSync('public/ratings-export.js','utf8'),context);
  vm.runInContext(fs.readFileSync('public/report-cache.js','utf8'),context);
  const source=fs.readFileSync('public/app.js','utf8').replace(/bootDashboard\(\);\s*$/,'');vm.runInContext(source,context);
  assert.equal(vm.runInContext('formatNumber(null)',context),'—');assert.equal(vm.runInContext('formatNumber(0)',context),'0');
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(storeIdentity({storeName:"KF-Fujairah"}))',context)),
    {brand:'Kabab Fareej',branch:'Fujairah',key:'kabab fareej|fujairah',displayName:'Kabab Fareej — Fujairah'});
  assert.equal(vm.runInContext('storeIdentity({storeName:"Kabab Fareej, International City"}).branch',context),'Dragon Mart');
  assert.equal(vm.runInContext('storeIdentity({storeName:"Kabab Fareej, Al Hamidiya"}).branch',context),'Ajman');
  assert.equal(vm.runInContext(`storeIdentity({storeName:"Kabab Fareej, Mleha, Al Bdai'a Subrub"}).branch`,context),'Hoshi');
  assert.equal(vm.runInContext(`storeIdentity({storeName:"KF - Hay Hoshi"}).branch`,context),'Hoshi');
  assert.equal(vm.runInContext(`storeIdentity({storeName:"Kabab Fareej, Mleha, Al Bdai'a Subrub"}).key===storeIdentity({storeName:"KF - Hay Hoshi"}).key`,context),true);
  assert.deepEqual(JSON.parse(vm.runInContext('JSON.stringify(storeIdentity({storeName:"Taazaa Mumbai, Al Dhait South"}))',context)),
    {brand:'Taazaa Mumbai',branch:'RAK',key:'taazaa mumbai|al dhait south',displayName:'Taazaa Mumbai — RAK'});
  assert.equal(vm.runInContext('storeIdentity({storeName:"Taazaa Mumbai, Al Noof"}).branch',context),'Hoshi');
  assert.equal(vm.runInContext('storeIdentity({storeName:"Taazaa Mumbai, Al Qusais Industrial Area 1"}).branch',context),'Al Qusais Industrial Area 1');
  assert.equal(vm.runInContext('storeIdentity({storeName:"Taazaa Mumbai, Barsha, Al Barsha 2"}).branch',context),'Al Barsha 2');
  await vm.runInContext('state.tab="overview";renderCloudRatings()',context);
  await vm.runInContext('Promise.all([overviewReports.read(overviewPerformancePath,()=>api(overviewPerformancePath)),overviewReports.read(overviewHistoryPath,()=>api(overviewHistoryPath))])',context);
  vm.runInContext('paintCloudRatings(state.cloudResponse)',context);
  for(const text of ['Recent Changes','Rating drops','New one-star','Improved','4.6 → 4.4','id="recentBrand"','id="recentPlatform"','Operational Center','Actions','Complaints · 7d 1.20','Recommended:','Latest daily report 2026-09-20','id="actionBrand"'])assert.ok(main.innerHTML.includes(text),text);
  assert.equal(vm.runInContext(`buildRecentChanges([{key:'x',displayName:'Brand — Branch',brand:'Brand',rows:[{platform:'talabat',timestamp:'2026-09-20T12:00:00.000Z',rating:4,previousRating:4.2,previousTimestamp:'2026-09-20T08:00:00.000Z',reviewCount:12,previousReviewCount:10,oneStarCount:3,previousOneStarCount:1}]}]).map(item=>item.type).sort().join(',')`,context),'drops,oneStar');
  assert.equal(vm.runInContext(`buildRecentChanges([{key:'x',displayName:'Brand — Branch',brand:'Brand',rows:[{platform:'talabat',timestamp:'2026-09-20T12:00:00.000Z',rating:2.9,previousRating:2.7,previousTimestamp:'2026-09-20T08:00:00.000Z',reviewCount:12,previousReviewCount:10,oneStarCount:3,previousOneStarCount:3}]}])[0].label`,context),'Improved · still critical');
  assert.equal(vm.runInContext(`buildRecentChanges([{key:'x',displayName:'Brand — Branch',brand:'Brand',rows:[{platform:'talabat',timestamp:'2026-09-20T12:00:00.000Z',rating:4.1,previousRating:4,previousTimestamp:'2026-09-20T08:00:00.000Z',reviewCount:12,previousReviewCount:10,oneStarCount:3,previousOneStarCount:3}]}])[0].label`,context),'Recovered above 4.1');
  assert.equal(vm.runInContext(`buildActionCenter([{key:'x',displayName:'Kabab Fareej — Test',rows:[{platform:'talabat',rating:4.1}]}],null).length`,context),0);
  assert.equal(vm.runInContext(`buildActionCenter([{key:'x',displayName:'Kabab Fareej — Test',rows:[{platform:'talabat',rating:4.0}]}],null).length`,context),1);
  assert.ok(vm.runInContext(`buildActionCenter([{key:'x',displayName:'Kabab Fareej — Test',rows:[{platform:'talabat',rating:4.0,reviewCount:12,oneStarCount:4}]}],null)[0].issues[0]`,context).includes('12 reviews · 4 one-star'));
  assert.equal(vm.runInContext(`buildActionCenter([{key:'less',displayName:'Brand — Less',rows:[{platform:'talabat',rating:3.9,reviewCount:20,oneStarCount:2}]},{key:'urgent',displayName:'Brand — Urgent',rows:[{platform:'talabat',rating:2.5,reviewCount:2,oneStarCount:1}]}],null)[0].key`,context),'urgent');
  assert.equal(vm.runInContext(`buildActionCenter([],{rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'0','Customer Complaint rate':'9','Avoidable cancellation rate':'9','Unavailable Time Duration Rate':'9','Average preparation time (minutes)':'99'}}]}).length`,context),0);
  assert.equal(vm.runInContext(`buildDataChecks({rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'0'}}]},{points:[{reportDate:'2026-09-19',storeId:'2',orders:11}]} )[0].issue`,context),'Zero orders today · last active 2026-09-19');
  assert.equal(vm.runInContext(`buildDataChecks({rows:[{storeId:'3',storeName:'Kabab Fareej, Missing',present:false,values:{}}]},null)[0].kind`,context),'check');
  assert.equal(vm.runInContext(`buildDataChecks({rows:[{storeId:'3',storeName:'Kabab Fareej, Ready',present:true,values:{'Successful Orders':'2'}}]},{points:[{reportDate:'2026-09-20',storeId:'3',orders:2}]}).length`,context),0);
  assert.equal(vm.runInContext(`actionReadiness({points:[{reportDate:'2026-09-20'},{reportDate:'2026-09-19'},{reportDate:'2026-09-20'}]}).days`,context),2);
  assert.ok(vm.runInContext(`buildActionCenter([],{rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'2'}}]},{points:Array.from({length:7},(_,i)=>({reportDate:'2026-09-'+(20-i),storeId:'2',orders:2,complaints:0,cancellation:0,offline:0,prep:12}))})[0].issues[0]`,context).includes('Low sales'));
  assert.equal(vm.runInContext(`buildActionCenter([],{rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'10','Customer Complaint rate':'3'}}]},{points:Array.from({length:7},(_,i)=>({reportDate:'2026-09-'+(20-i),storeId:'2',orders:10,complaints:i?0:3,cancellation:0,offline:0,prep:12}))})[0].level`,context),'attention');
  assert.ok(vm.runInContext(`buildActionCenter([],{rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'10','Customer Complaint rate':'3'}}]},{points:Array.from({length:7},(_,i)=>({reportDate:'2026-09-'+(20-i),storeId:'2',orders:10,complaints:3,cancellation:0,offline:0,prep:12}))})[0].issues[0]`,context).includes('7d 3.00'));
  assert.ok(vm.runInContext(`buildActionCenter([],{rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'10','Customer Complaint rate':'3'}}]},{points:Array.from({length:7},(_,i)=>({reportDate:'2026-09-'+(20-i),storeId:'2',orders:10,complaints:3,cancellation:0,offline:0,prep:12}))})[0].issues[0]`,context).includes('available 7d 3.00'));
  assert.ok(vm.runInContext(`buildActionCenter([],{rows:[{storeId:'2',storeName:'Kabab Fareej, Test',present:true,values:{'Successful Orders':'10','Customer Complaint rate':'3'}}]},{points:Array.from({length:30},(_,i)=>({reportDate:'2026-'+String(9-Math.floor(i/28)).padStart(2,'0')+'-'+String(28-i%28).padStart(2,'0'),storeId:'2',orders:10,complaints:3,cancellation:0,offline:0,prep:12}))})[0].issues[0]`,context).includes('30d 3.00'));
  for(const text of ['Kabab Fareej — Al Warqa','/platforms/talabat-icon.png','/platforms/keeta-icon.png','All brands','inline-status-healthy'])assert.ok(main.innerHTML.includes(text),text);
  for(const hidden of ['TB_AE;fareej','KEETA;fareej','Review count','One-star count'])assert.ok(!main.innerHTML.includes(hidden),hidden);
  assert.equal((main.innerHTML.match(/Kabab Fareej — Al Warqa/g)||[]).length,3);
  await vm.runInContext('openCloudStore(groupCloudRows(state.cloudResponse.ratings)[0])',context);
  for(const text of ['Latest ratings by platform','Reviews','One-star','Cloud History is not available'])assert.ok(detail.innerHTML.includes(text),text);
  await vm.runInContext('state.tab="talabat";renderCloudRatings()',context);assert.ok(main.innerHTML.includes('Kabab Fareej — Al Warqa'));assert.ok(!main.innerHTML.includes('/platforms/keeta.svg'));
  await vm.runInContext('state.tab="keeta";renderCloudRatings()',context);assert.ok(main.innerHTML.includes('Kabab Fareej — Al Warqa'));assert.ok(!main.innerHTML.includes('/platforms/talabat.svg'));
  assert.deepEqual([...urls].sort(),['/api/dashboard/ratings/latest','/api/dashboard/performance/latest','/api/dashboard/performance/action-history?days=30','/api/dashboard/ratings/history?storeIdentityKey=TB_AE%3Bfareej&range=30d'].sort());
});

test('missing token and public assets fail closed without exposing token or upstream URL',async()=>{
  await serve(async()=>assert.fail(),async base=>{const response=await fetch(base+'/api/dashboard/ratings/latest');assert.equal(response.status,503);},
    {...config,ratingsApiToken:''});
  for(const name of fs.readdirSync('public'))if(fs.statSync(path.join('public',name)).isFile()){
    const text=fs.readFileSync(path.join('public',name),'utf8');assert.doesNotMatch(text,/RATINGS_API_TOKEN|PRIVATE-server-token|Bearer /);
  }
});

test('dashboard packages local identity artwork, sticky platform navigation and mobile cards',()=>{
 const html=fs.readFileSync('public/index.html','utf8'),css=fs.readFileSync('public/styles.css','utf8');
 for(const asset of ['favicon.svg','favicon.ico','apple-touch-icon.png','platforms/overview.svg','platforms/talabat.svg','platforms/keeta.svg','platforms/noon.svg','platforms/careem.svg','platforms/deliveroo.svg'])
  assert.equal(fs.statSync(path.join('public',asset)).isFile(),true,asset);
 assert.match(html,/rel="icon" href="\/favicon\.svg"/);assert.match(html,/class="tab-logo"/);
 assert.match(css,/\.platform-tabs \{ position: sticky;/);assert.match(css,/@media \(max-width: 760px\)/);assert.match(css,/\.overview-table tr \{ display: grid;/);
});


test('Keeta and Talabat freshness accommodates four-hour schedules without hiding missed cycles',()=>{
 const source=fs.readFileSync('public/app.js','utf8'),segment=source.slice(source.indexOf('function cloudHealth('),source.indexOf('function cloudPlatformCards('));
 const now=Date.parse('2026-10-06T12:00:00Z'),context=vm.createContext({Date:{now:()=>now},timestamp:Date.parse});vm.runInContext(segment+';globalThis.health=cloudHealth',context);
 for(const platform of ['talabat','keeta']){
  const health=(hours:number)=>context.health({platform,state:'SUCCESS',syncTimestamp:new Date(now-hours*3600000).toISOString()});
  assert.equal(health(3),'LIVE');assert.equal(health(4.99),'LIVE');assert.equal(health(5),'DELAYED');assert.equal(health(8),'DELAYED');assert.equal(health(8.01),'STALE');assert.equal(health(-1),'UNKNOWN');
  assert.equal(context.health({platform,state:'ERROR'}),'ERROR');assert.equal(context.health({platform,state:'EMPTY'}),'EMPTY');assert.equal(context.health({platform,state:'SUCCESS',syncTimestamp:'invalid'}),'UNKNOWN');
 }
 for(const platform of ['noon','deliveroo'])for(const [hours,expected] of [[3,'LIVE'],[24,'LIVE'],[25.99,'LIVE'],[26,'DELAYED'],[48,'DELAYED'],[48.01,'STALE']] as const)assert.equal(context.health({platform,state:'SUCCESS',syncTimestamp:new Date(now-hours*3600000).toISOString()}),expected);
 assert.equal(context.health({platform:'careem',state:'SUCCESS',syncTimestamp:new Date(now-3*3600000).toISOString()}),'STALE');
});
