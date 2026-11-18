import {createHash} from 'node:crypto';
import {authDatabase} from '../auth.ts';
import type {EmergencyDatabase} from './order-emergency-reader.ts';
import type {EmergencySnapshot,OrderAssessment} from './order-emergency-policy.ts';
export function emergencyEvents(next:EmergencySnapshot,previous?:EmergencySnapshot){
 const events:{id:string;body:string}[]=[];
 const clean=(s:string)=>s.replace(/[\r\n\u0000-\u001f]/g,' ').slice(0,100);
 for(const r of next.rows){
  const old=previous?.incidents[r.key];
  const type=r.state==='EMERGENCY'?'OPEN':r.state==='NORMAL'&&old&&r.asOf&&r.asOf>=old.lastConfirmed&&!next.incidents[r.key]?'EXIT':null;
  if(!type)continue;const start=type==='OPEN'?r.startDate:old!.startDate;
  const id=createHash('sha256').update(JSON.stringify([r.key,r.branchId,start,type])).digest('hex');
  const metric=(r:OrderAssessment)=>`${r.currentOrders} سفارش | مبنا ${r.baselineAverage?.toFixed(2)} در روز`;
  const body=type==='OPEN'?`افت اضطراری سفارش — ${clean(r.platform)}\n${clean(r.name)}\n${r.asOf}: ${metric(r)} | افت ${r.dropPercent?.toFixed(1)}٪\nشروع ${start} | ${r.consecutiveDays} روز تأییدشدهٔ متوالی. منو و دسترس‌پذیری بررسی شود؛ علت قطعی نیست.`:
   `خروج از آستانهٔ اضطرار — ${clean(r.platform)}\n${clean(r.name)}\n${r.asOf}: ${metric(r)}. افت کمتر از ۸۰٪ است؛ بازگشت کامل فروش تأیید نشده.`;
  events.push({id,body:body.slice(0,280)});
 }
 return events;
}
/** Durable outbox. A claim commits BEFORE Telegram; ambiguous delivery is never blindly retried. */
async function queueEvents(next:EmergencySnapshot,previous:EmergencySnapshot|undefined,db:EmergencyDatabase){
 const events=emergencyEvents(next,previous);if(events.length)await db.query({text:`INSERT INTO dashboard_order_emergency_notifications(id,body) SELECT * FROM unnest($1::text[],$2::text[]) ON CONFLICT(id) DO NOTHING`,values:[events.map(e=>e.id),events.map(e=>e.body)],query_timeout:4000});
}
export async function queueEmergencyEvents(next:EmergencySnapshot,previous?:EmergencySnapshot,db:EmergencyDatabase=authDatabase()){
 await db.query({text:`CREATE TABLE IF NOT EXISTS dashboard_order_emergency_notifications(id text PRIMARY KEY,body text NOT NULL,status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','CLAIMED','SENT','UNKNOWN')),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now())`,query_timeout:4000});
 await queueEvents(next,previous,db);
}
export async function drainEmergencyEvents(notify:(text:string)=>Promise<void>,db:EmergencyDatabase=authDatabase()){
 let sent=0;
 for(let i=0;i<1;i++){
  const result=await db.query({text:`UPDATE dashboard_order_emergency_notifications SET status='CLAIMED',updated_at=now() WHERE id IN (SELECT id FROM dashboard_order_emergency_notifications WHERE status='PENDING' ORDER BY created_at,id LIMIT 12 FOR UPDATE SKIP LOCKED) RETURNING id,body`,query_timeout:4000});
  if(!result.rows.length)return {sent,pending:false};
  const ids=result.rows.map(r=>r.id);
  try{await notify('FRB · پایش اضطراری سفارش\n\n'+result.rows.map(r=>r.body).join('\n\n'));}
  catch{await db.query({text:"UPDATE dashboard_order_emergency_notifications SET status='UNKNOWN',updated_at=now() WHERE id=ANY($1::text[])",values:[ids],query_timeout:4000});return {sent,pending:true};}
  await db.query({text:"UPDATE dashboard_order_emergency_notifications SET status='SENT',updated_at=now() WHERE id=ANY($1::text[])",values:[ids],query_timeout:4000});sent+=ids.length;
 }
 return {sent,pending:true};
}
