import test from 'node:test';
import assert from 'node:assert/strict';
import {coreWebhookState,coreWebhookFingerprint,coreWebhookExample,signCoreWebhook,verifyCoreWebhook,webhookSigningExampleKey} from '../src/core-webhook-contract.ts';
import {createCoreWebhookSetupHandler} from '../src/core-webhook-api.ts';

test('webhook signature validates exact raw bytes, secret and five-minute replay window',()=>{
 const x=coreWebhookExample(),ts=x.headers['X-RCC-Timestamp'],sig=x.headers['X-RCC-Signature'];
 assert.equal(verifyCoreWebhook(x.rawBody,webhookSigningExampleKey,ts,sig,Number(ts)),true);
 for(const body of [x.rawBody+' ',JSON.stringify(x.payload,null,2)])assert.equal(verifyCoreWebhook(body,webhookSigningExampleKey,ts,sig,Number(ts)),false);
 assert.equal(verifyCoreWebhook(x.rawBody,'wrong-key'.repeat(8),ts,sig,Number(ts)),false);
 assert.equal(verifyCoreWebhook(x.rawBody,webhookSigningExampleKey,ts,sig,Number(ts)+301),false);
 assert.equal(verifyCoreWebhook(x.rawBody,webhookSigningExampleKey,ts,sig,Number(ts)-301),false);
 assert.equal(verifyCoreWebhook(x.rawBody,webhookSigningExampleKey,ts,'bad',Number(ts)),false);
 assert.throws(()=>signCoreWebhook(x.rawBody,'short',Number(ts)));
});

test('only rating number and branch/source identity changes affect semantic fingerprint',()=>{
 const example=coreWebhookExample(),catalog={brands:example.payload.brands,branches:example.payload.branches};
 const base={...example.payload.ratings[0],reviewCount:1,observedAt:'old',syncedAt:'old',freshness:'STALE'};
 const hash=(r:any)=>coreWebhookFingerprint(coreWebhookState(catalog,{ratings:[r]}));
 assert.equal(hash(base),hash({...base,reviewCount:100,observedAt:'new',syncedAt:'new',freshness:'LIVE'}));
 assert.notEqual(hash(base),hash({...base,rating:4.4}));assert.notEqual(hash(base),hash({...base,rating:null}));
 assert.notEqual(hash(base),hash({...base,sourceIdentity:'another'}));
 assert.equal(coreWebhookState({...catalog,branches:[]},{ratings:[base]}).ratings.length,0);
 assert.throws(()=>coreWebhookState(catalog,{ratings:[{...base,rating:0}]}),/INVALID/);
 const first=coreWebhookFingerprint(coreWebhookState(catalog,{ratings:[]}));
 const changed={...catalog,branches:catalog.branches.map(b=>({...b,sources:[{...b.sources[0]!,sourceIdentity:'TB_AE;ANOTHER'}]}))};
 assert.notEqual(first,coreWebhookFingerprint(coreWebhookState(changed,{ratings:[]})));
});

test('setup API is owner-only and template does not claim production delivery',async()=>{
 async function read(user:any,method='GET',query='integration=core-webhook'){
  const h=createCoreWebhookSetupHandler(async()=>user);let status=0,body='';
  await h({method,url:'/api/config?'+query} as any,{setHeader(){},set statusCode(v:number){status=v;},end(v:string){body=v;}} as any);return {status,body};
 }
 assert.equal((await read({role:'admin',isOwner:false})).status,403);
 assert.equal((await read({isOwner:true},'POST')).status,405);
 assert.equal((await read({isOwner:true},'GET','integration=core-webhook&extra=1')).status,400);
 const result=await read({isOwner:true});assert.equal(result.status,200);const c=JSON.parse(result.body);
 assert.equal(c.deliveryState,'NOT_CONNECTED');assert.equal(c.productionSecretConfigured,false);assert.equal(c.receiverUrl,null);assert.ok(!('reviewCount' in c.payload.ratings[0]));
});

test('downloadable Node verifier accepts the published test vector and rejects tampering',async()=>{
 const {verifyRccWebhook}=await import('../public/core-webhook-verifier.mjs');
 const x=coreWebhookExample(),timestamp=x.headers['X-RCC-Timestamp'],signature=x.headers['X-RCC-Signature'];
 assert.equal(verifyRccWebhook(Buffer.from(x.rawBody),timestamp,signature,x.testKey,Number(timestamp)),true);
 assert.equal(verifyRccWebhook(Buffer.from(x.rawBody+' '),timestamp,signature,x.testKey,Number(timestamp)),false);
 assert.equal(verifyRccWebhook(Buffer.alloc(2000001),timestamp,signature,x.testKey,Number(timestamp)),false);
});
