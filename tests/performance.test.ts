import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {createServer} from 'node:http';
import {PERFORMANCE_HEADERS,fetchPerformance,fetchTstar,projectPerformance,requestDate,requestPerformanceQuery} from '../src/services/performance-proxy.ts';
import {createCloudHandler} from '../src/cloud-api.ts';
const token='server-only-secret-'.repeat(4);
const config={ratingsApiUrl:'https://example.vercel.app/api/ratings/latest',ratingsApiToken:token};
function fixture(){return {ok:true,platform:'talabat',state:'SUCCESS',reportDate:'2026-09-20',expectedDate:'2026-09-22',availableDates:['2026-09-20'],requestedAt:'2026-09-22T09:00:00.000Z',receivedAt:'2026-09-22T09:01:00.000Z',scopeCount:2,observedCount:1,headers:[...PERFORMANCE_HEADERS],rows:[{storeId:'1',storeName:'Kabab Fareej, Test',present:true,values:Object.fromEntries(PERFORMANCE_HEADERS.map(h=>[h,h==='Gross Sales'?'120':h==='Viewed your menu'?'0':null]))},{storeId:'2',storeName:null,present:false,values:Object.fromEntries(PERFORMANCE_HEADERS.map(h=>[h,null]))}]};}
test('proxy fixes upstream path and projects data, never exposing unknown fields',async()=>{
 const payload={...fixture(),privateUrl:token};const mock:typeof fetch=async(url,opts)=>{assert.equal(url,'https://example.vercel.app/api/performance/latest?date=2026-09-20');assert.equal((opts?.headers as any).Authorization,'Bearer '+token);assert.equal(opts?.redirect,'error');return Response.json(payload);};
 const result=await fetchPerformance(config,'2026-09-20',mock);assert.equal(result.rows[0]!.values['Viewed your menu'],'0');assert.equal(result.rows[1]!.values['Gross Sales'],null);assert.ok(!JSON.stringify(result).includes(token));
});
test('malformed dates, scope mismatches, secret-bearing fields and oversized responses are rejected',async()=>{
 for(const q of ['?date=2026-02-30','?date=','?date=2026-09-20&date=2026-09-20','?platform=all'])assert.throws(()=>requestDate(q));
 for(const mutate of [(v:any)=>v.rows.push(v.rows[0]),(v:any)=>v.rows[0].storeName=token,(v:any)=>v.rows[1].values['Gross Sales']='0',(v:any)=>v.reportDate='2026-02-30']){const f=fixture();mutate(f);assert.throws(()=>projectPerformance(f,token));}
 await assert.rejects(fetchPerformance({...config,ratingsApiUrl:'http://bad/api/ratings/latest'}));
 await assert.rejects(fetchPerformance(config,undefined,async()=>new Response('x'.repeat(2000001),{headers:{'content-type':'application/json'}})),/unavailable/);
 await assert.rejects(fetchPerformance(config,'2026-09-19',async()=>Response.json(fixture())),/unavailable/);
});
test('cloud performance endpoint uses server credentials and blocks cross-site/non-GET calls',async()=>{
 let calls=0;const mock:typeof fetch=async()=>{calls++;return Response.json(fixture());};
 const s=createServer(createCloudHandler('performance',{RATINGS_API_URL:config.ratingsApiUrl,RATINGS_API_TOKEN:token},mock));await new Promise<void>(r=>s.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+(s.address() as {port:number}).port;
 try{assert.equal((await fetch(url,{method:'POST'})).status,405);assert.equal((await fetch(url,{headers:{'sec-fetch-site':'cross-site'}})).status,403);assert.equal(calls,0);assert.equal((await fetch(url+'?date=invalid')).status,400);const r=await fetch(url+'?date=2026-09-20');assert.equal(r.status,200);assert.ok(!(await r.text()).includes(token));}
 finally{s.closeAllConnections();await new Promise<void>(r=>s.close(()=>r()));}
});
test('UI calculations exclude missing rows and empty cells, preserve zero and disclose partial totals',()=>{
 const context=vm.createContext({Intl,console});vm.runInContext(readFileSync('public/performance.js','utf8'),context);
 const run=(s:string)=>vm.runInContext(s,context);
 assert.equal(run("performanceNumber(null)"),null);assert.equal(run("performanceNumber('')"),null);assert.equal(run("performanceNumber('0')"),0);assert.equal(run("performanceNumber('Infinity')"),null);
 const total=run("performanceTotal([{present:true,values:{x:'0'}},{present:true,values:{x:'12.5'}},{present:true,values:{x:null}},{present:false,values:{x:null}}],'x')");
 assert.equal(total.value,12.5);assert.equal(total.populated,2);assert.equal(total.total,3);
 assert.equal(run("performanceTotal([{present:true,values:{x:null}}],'x').value"),null);
 assert.equal(run("performanceCoverage([{present:true,values:{}}])"),'Funnel data unavailable from Talabat');
});

test('period and tStar requests reuse the existing protected Performance route',async()=>{
 assert.deepEqual(requestPerformanceQuery('/x?period=7d'),{period:'7d'});assert.deepEqual(requestPerformanceQuery('/x?dataset=tstar'),{dataset:'tstar'});assert.throws(()=>requestPerformanceQuery('/x?dataset=tstar&period=month'));
 const tstar={ok:true,platform:'talabat',state:'SUCCESS',observedAt:'2026-09-26T10:00:00.000Z',receivedAt:'2026-09-26T10:00:01.000Z',scopeCount:1,activeCount:1,rows:[{storeId:'1',storeName:'Kabab Fareej, Test',tier:'ADVANCED',periodFrom:'2026-09-01',periodTo:'2026-09-30',metrics:{avoidableWaitingTime:1,inaccurateOrders:2,offlineRate:3,failRate:4}}]};
 let requested='';const result=await fetchTstar(config,async url=>{requested=String(url);return Response.json(tstar);});assert.equal(requested,'https://example.vercel.app/api/performance/latest?dataset=tstar');assert.equal(result.rows[0]?.metrics.failRate,4);
});
