import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createServer} from 'node:http';
import type {AddressInfo} from 'node:net';
import {createCloudHandler} from '../src/cloud-api.ts';

const token='PRIVATE-UPSTREAM-TOKEN-'.repeat(3);
const env={RATINGS_API_URL:'https://talabat-rating-monitor-vercel-poc.vercel.app/api/ratings/latest',RATINGS_API_TOKEN:token};
const sourceRow={platform:'talabat',storeName:'Synthetic Marina',storeIdentityKey:'TB_AE;123',rating:4.4,reviewCount:22,oneStarCount:1,
  timestamp:'2026-09-17T12:00:00.000Z',syncTimestamp:'2026-09-17T12:00:00.000Z',carriedForward:false};
const emptyKeeta={platform:'keeta',state:'EMPTY',storeCount:0,syncTimestamp:null,emptyReason:'NO_RUN',errorCode:null,ratings:[]};
const payload={ok:true,selector:'all',storeCount:1,ratings:[sourceRow],platforms:[
  {platform:'talabat',state:'SUCCESS',storeCount:1,syncTimestamp:sourceRow.syncTimestamp,emptyReason:null,errorCode:null,ratings:[sourceRow]},emptyKeeta]};
const projected={...payload,ratings:[{...sourceRow,status:'HEALTHY'}],platforms:[
  {...payload.platforms[0],ratings:[{...sourceRow,status:'HEALTHY'}]},emptyKeeta]};
async function call(route:'config'|'health'|'ratings',fetcher:typeof fetch,settings:NodeJS.ProcessEnv=env,method='GET'){
  const handler=createCloudHandler(route,settings,fetcher);
  let body:any;const headers:Record<string,string>={};
  const response:any={statusCode:0,setHeader(k:string,v:string){headers[k]=v;},end(s:string){body=JSON.parse(s);}};
  await handler({method,headers:{}} as any,response);
  return {status:response.statusCode,headers,body};
}
test('Cloud ratings proxy retains names and fields with server-only authorization',async()=>{
  let count=0;
  const result=await call('ratings',async(url,options)=>{
    count++;assert.equal(url,env.RATINGS_API_URL+'?platform=all');assert.equal((options?.headers as any).Authorization,'Bearer '+token);
    assert.equal(options?.redirect,'error');return Response.json(payload);
  });
  assert.equal(result.status,200);assert.equal(count,1);assert.deepEqual(result.body,projected);
  assert.ok(!JSON.stringify(result).includes(token));
});
test('Cloud mode remains selected without configuration and missing token fails safely',async()=>{
  const never:typeof fetch=async()=>assert.fail('No upstream request');
  assert.deepEqual((await call('config',never,{})).body,{cloudRatings:true,autoRefreshSeconds:60});
  const missing=await call('ratings',never,{RATINGS_API_URL:env.RATINGS_API_URL});
  assert.equal(missing.status,503);assert.deepEqual(missing.body,{error:'Cloud ratings are not configured.'});
  assert.deepEqual((await call('health',never,{})).body,{ok:true,mode:'cloud'});
});
test('Cloud failures expose no upstream content and writes cannot proxy',async()=>{
  const failure=await call('ratings',async()=>{throw Error(token);});
  assert.equal(failure.status,502);assert.ok(!JSON.stringify(failure).includes(token));
  assert.equal((await call('ratings',async()=>assert.fail(),env,'POST')).status,405);
});
test('Cloud handlers do not read local environment file or database path',async()=>{
  const poisoned=new Proxy(env,{get(target,key){if(key==='TALABAT_DB_PATH')assert.fail('Local DB accessed');return Reflect.get(target,key);}});
  assert.equal((await call('ratings',async()=>Response.json(payload),poisoned)).status,200);
  const source=fs.readFileSync('src/cloud-api.ts','utf8');
  assert.doesNotMatch(source,/loadConfig|node:sqlite|from ['"].*(?:adapters|server|app|config)\.ts/);
  const proxy=fs.readFileSync('src/services/latest-ratings-proxy.ts','utf8');
  assert.match(proxy,/import type.*AppConfig/);
});
test('Vercel routes and public output are explicit, runtime is bounded and secrets excluded',()=>{
  const cfg=JSON.parse(fs.readFileSync('vercel.json','utf8'));
  assert.equal(cfg.framework,null);assert.equal(cfg.outputDirectory,'public');assert.equal(cfg.functions['api/**/*.ts'].maxDuration,30);
  assert.equal(cfg.crons,undefined);assert.equal(cfg.env,undefined);
  for(const file of ['api/config.ts','api/health.ts','api/dashboard/ratings/latest.ts'])assert.match(fs.readFileSync(file,'utf8'),/export default createCloudHandler/);
  const ignore=fs.readFileSync('.vercelignore','utf8');for(const value of ['.env','.secrets/','*.sqlite','*.db'])assert.ok(ignore.includes(value));
  for(const file of fs.readdirSync('public'))if(fs.statSync(path.join('public',file)).isFile())assert.doesNotMatch(fs.readFileSync(path.join('public',file),'utf8'),/RATINGS_API_TOKEN|PRIVATE-UPSTREAM|Bearer /);
  const headers=cfg.headers[0].headers;assert.ok(headers.some((h:any)=>h.key==='Content-Security-Policy'&&h.value.includes("connect-src 'self'")));
});
test('Cloud dashboard HTML and API load through HTTP without local server entry point',async()=>{
  const routes:Record<string,ReturnType<typeof createCloudHandler>>={
    '/api/config':createCloudHandler('config',env),'/api/health':createCloudHandler('health',env),
    '/api/dashboard/ratings/latest':createCloudHandler('ratings',env,async()=>Response.json(payload))};
  // Emulate Vercel's static public directory and three independent function routes.
  const server=createServer((req,res)=>{
    const route=routes[req.url||''];if(route){void route(req,res);return;}
    if(req.url==='/'){res.setHeader('Content-Type','text/html');res.end(fs.readFileSync('public/index.html'));return;}
    res.statusCode=404;res.end();
  }).listen(0,'127.0.0.1');
  await new Promise<void>(resolve=>server.once('listening',resolve));
  try{
    const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const page=await fetch(base);assert.equal(page.status,200);assert.match(await page.text(),/Online Rating Control Center/);
    const config=await fetch(base+'/api/config').then(r=>r.json()) as any;assert.equal(config.cloudRatings,true);
    assert.deepEqual(await fetch(base+'/api/dashboard/ratings/latest').then(r=>r.json()),projected);
  }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
