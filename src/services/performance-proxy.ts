import type {AppConfig} from '../config.ts';
export const PERFORMANCE_HEADERS:readonly string[]=["Successful Orders", "Gross Sales", "Delivery Sales", "Pickup Sales", "Orders count", "Cancelled Orders", "Online Orders", "Cash Orders", "Delivery Orders", "Pickup Orders", "Pro Orders", "Pro Revenue", "Items count", "Unavailable time duration (Minutes)", "Unavailable Time Duration Rate", "Scheduled Open Time (Minutes)", "Unavailable time reason", "Unavailable Time Duration count", "Orders with Avoidable cancellations", "Avoidable cancellation rate", "Revenue loss from rejections", "Avoidable Cancellation Reason", "Avoidable cancellation count", "Sales loss", "Average preparation time (minutes)", "Orders marked as ready", "Orders marked rate", "Total AWT Duration (Minutes)", "Orders with AWT", "Order with AWT Fee", "Total Fee applied", "Orders in Bucket1: < 5 minutes", "Orders with fees in Bucket1: < 5 minutes", "Orders in Bucket2: >= 5 Mins and < 10 Mins", "Orders with fees in Bucket2: >= 5 Mins and < 10 Mins", "Orders in Bucket3: >= 10 Mins", "Orders with fees in Bucket3: >= 10 Mins", "Total customer complaints received", "Customer Complaint rate", "Customer Complaint Reason", "Customer Complaint Contacts", "Own delivery contacts count", "Vendor delivery contacts counts", "Orders from new customers", "Orders from new customers rate", "Orders from returning customers", "Orders from returning customers rate", "Impressions", "Viewed your menu", "Added items to cart", "Placed an order"];
export class PerformanceError extends Error {readonly status:number;constructor(status:number,message:string){super(message);this.status=status;}}
export function validReportDate(v:unknown):v is string {return typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v+'T00:00:00Z'))&&new Date(v+'T00:00:00Z').toISOString().slice(0,10)===v;}
export function requestDate(raw:string):string|undefined {
 try{const u=new URL(raw,'https://internal.invalid');if([...u.searchParams.keys()].some(k=>k!=='date')||u.searchParams.getAll('date').length>1)throw Error();const d=u.searchParams.get('date');if(d!==null&&!validReportDate(d))throw Error();return d??undefined;}
 catch{throw new PerformanceError(400,'Invalid report date.');}
}
export function projectPerformance(data:any,token:string){
 const text=(v:unknown,max:number):v is string=>typeof v==='string'&&v.length<=max&&!/[\x00-\x1f\x7f]/.test(v)&&!v.includes(token);
 const iso=(v:unknown)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}T/.test(v)&&Number.isFinite(Date.parse(v));
 if(data?.ok!==true||data.platform!=='talabat'||!['SUCCESS','EMPTY'].includes(data.state)||!validReportDate(data.expectedDate)||
  (data.reportDate!==null&&!validReportDate(data.reportDate))||!Array.isArray(data.availableDates)||data.availableDates.length>90||data.availableDates.some((d:unknown)=>!validReportDate(d))||
  !Array.isArray(data.rows)||data.rows.length>10000||data.scopeCount!==data.rows.length||!Number.isInteger(data.observedCount)||
  !Array.isArray(data.headers)||data.headers.length!==PERFORMANCE_HEADERS.length||data.headers.some((h:unknown,i:number)=>h!==PERFORMANCE_HEADERS[i]))throw Error();
 const ids=new Set<string>();
 const rows=data.rows.map((r:any)=>{
  if(!text(r.storeId,80)||!/^\d+$/.test(r.storeId)||ids.has(r.storeId)||typeof r.present!=='boolean'||(r.storeName!==null&&!text(r.storeName,512))||!r.values||typeof r.values!=='object'||Array.isArray(r.values))throw Error();ids.add(r.storeId);
  const values:Record<string,string|null>={};for(const h of PERFORMANCE_HEADERS){const v=r.values[h];if(v!==null&&!text(v,2048))throw Error();if(!r.present&&v!==null)throw Error();values[h]=v;}
  return {storeId:r.storeId as string,storeName:r.storeName as string|null,present:r.present as boolean,values};
 });
 if(rows.filter((r:{present:boolean})=>r.present).length!==data.observedCount)throw Error();
 if(data.state==='SUCCESS'&&(!rows.length||!validReportDate(data.reportDate)||!iso(data.requestedAt)||!iso(data.receivedAt)))throw Error();
 if(data.state==='EMPTY'&&(rows.length||data.requestedAt!==null||data.receivedAt!==null))throw Error();
 return {ok:true,platform:'talabat',state:data.state as 'SUCCESS'|'EMPTY',reportDate:data.reportDate as string|null,expectedDate:data.expectedDate as string,availableDates:[...data.availableDates] as string[],
  requestedAt:data.requestedAt as string|null,receivedAt:data.receivedAt as string|null,scopeCount:rows.length,observedCount:data.observedCount as number,headers:[...PERFORMANCE_HEADERS],rows};
}
export async function fetchPerformance(config:Pick<AppConfig,'ratingsApiUrl'|'ratingsApiToken'>,date?:string,fetcher:typeof fetch=fetch){
 const token=config.ratingsApiToken;let url:URL;
 try{if(!token||token.length<32||token.length>512||/\s/.test(token))throw Error();url=new URL(config.ratingsApiUrl??'');
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.pathname!=='/api/ratings/latest'||url.search||url.hash)throw Error();
  url.pathname='/api/performance/latest';if(date){if(!validReportDate(date))throw Error();url.searchParams.set('date',date);}
 }catch{throw new PerformanceError(503,'Performance reports are not configured.');}
 try{
  const response=await fetcher(url.href,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},redirect:'error',cache:'no-store',signal:AbortSignal.timeout(25000)});
  if(!response.ok||!response.headers.get('content-type')?.includes('application/json')||!response.body){await response.body?.cancel();throw Error();}
  const reader=response.body.getReader(),chunks:Uint8Array[]=[];let length=0;
  try{for(;;){const p=await reader.read();if(p.done)break;length+=p.value.length;if(length>2000000){await reader.cancel();throw Error();}chunks.push(p.value);}}finally{reader.releaseLock();}
  const body=projectPerformance(JSON.parse(Buffer.concat(chunks).toString('utf8')),token);
  if(date&&body.reportDate!==date)throw Error();return body;
 }catch{throw new PerformanceError(502,'Performance reports are unavailable. Please retry.');}
}
