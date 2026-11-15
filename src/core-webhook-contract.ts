import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const webhookSigningExampleKey='test_only_not_a_production_webhook_secret_123456789';
export function signCoreWebhook(rawBody:string,secret:string,timestamp:number){
 if(secret.length<43||secret.length>512||!Number.isSafeInteger(timestamp)||timestamp<0)throw Error('WEBHOOK_SIGNING_INVALID');
 return 'v1='+createHmac('sha256',secret).update(String(timestamp)+'.').update(rawBody,'utf8').digest('hex');
}
export function verifyCoreWebhook(rawBody:string,secret:string,timestamp:string,signature:string,now=Math.floor(Date.now()/1000)){
 if(!/^\d{10}$/.test(timestamp)||Math.abs(now-Number(timestamp))>300||!/^v1=[a-f0-9]{64}$/.test(signature))return false;
 try{return timingSafeEqual(Buffer.from(signCoreWebhook(rawBody,secret,Number(timestamp))),Buffer.from(signature));}catch{return false;}
}

/** Only branch metadata and rating numbers participate in change detection. */
export function coreWebhookState(catalog:{brands:any[];branches:any[]},data:{ratings:any[]}){
 const sort=(rows:any[])=>rows.sort((a,b)=>String(a.id).localeCompare(String(b.id)));
 const brands=sort(catalog.brands.map(b=>({id:b.id,name:b.name,displayName:b.displayName})));
 const branches=sort(catalog.branches.map(b=>({id:b.id,brandId:b.brandId,name:b.name,displayName:b.displayName,active:b.active,
  sources:[...(b.sources||[])].map((s:any)=>({platform:s.platform,sourceIdentity:s.sourceIdentity,ratingId:s.ratingId})).sort((a,b)=>String(a.ratingId).localeCompare(String(b.ratingId)))})));
 const allowed=new Set(branches.filter(b=>b.active).map(b=>b.id));
 const ratings=sort(data.ratings.filter(r=>allowed.has(r.branchId)).map(r=>({id:r.id,branchId:r.branchId,platform:r.platform,sourceIdentity:r.sourceIdentity,rating:r.rating})));
 if(ratings.some(r=>r.rating!==null&&(typeof r.rating!=='number'||!Number.isFinite(r.rating)||r.rating<1||r.rating>5)))throw Error('WEBHOOK_RATING_INVALID');
 return {brands,branches,ratings};
}
export function coreWebhookFingerprint(state:ReturnType<typeof coreWebhookState>){return createHash('sha256').update(JSON.stringify(state)).digest('hex');}

export function coreWebhookExample(){
 const payload={schemaVersion:'1',type:'rcc.ratings.changed',eventId:'00000000-0000-4000-8000-000000000001',sequence:1,emittedAt:'2026-11-15T12:00:00.000Z',mode:'snapshot',
  brands:[{id:'example-brand-id',name:'FRB Kabab',displayName:'FRB Kabab'}],
  branches:[{id:'example-branch-id',brandId:'example-brand-id',name:'Example branch',displayName:'FRB Kabab — Example branch',active:true,sources:[{platform:'talabat',sourceIdentity:'TB_AE;EXAMPLE',ratingId:'example-rating-id'}]}],
  ratings:[{id:'example-rating-id',branchId:'example-branch-id',platform:'talabat',sourceIdentity:'TB_AE;EXAMPLE',rating:4.3}],removedRatingIds:[],deactivatedBranchIds:[]};
 const rawBody=JSON.stringify(payload),timestamp=1794744000;
 return {deliveryState:'NOT_CONNECTED',receiverUrl:null,signing:'HMAC-SHA256',productionSecretConfigured:false,
  changeFields:['rating','brand metadata','branch metadata','source mapping','branch activation'],ignoredFields:['reviewCount','observedAt','syncedAt','freshness'],
  headers:{'Content-Type':'application/json','X-RCC-Timestamp':String(timestamp),'X-RCC-Signature':signCoreWebhook(rawBody,webhookSigningExampleKey,timestamp),'X-RCC-Event-Id':payload.eventId},payload,rawBody,
  deltaExample:{...payload,eventId:'00000000-0000-4000-8000-000000000002',sequence:2,mode:'delta',brands:[],branches:[],ratings:[{...payload.ratings[0],rating:4.4}]},
  testKey:webhookSigningExampleKey,warning:'Synthetic test vector only. No receiver, production signing secret, dispatch queue or automatic webhook sender has been activated.'};
}
