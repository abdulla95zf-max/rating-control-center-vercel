import {deliverooScope as scope} from './deliveroo-scope.ts';
const names=['total_orders','total_delivered_orders','total_rejected_orders','wait_time_past_target_5min_cnt','prep_time','prep_time_benchmark','wait_time_past_target_sum','order_rating','order_rating_benchmark'];
const numeric=(v:any)=>typeof v==='number'&&Number.isFinite(v);
const count=(v:any)=>Number.isSafeInteger(v)&&v>=0;
function bad():never{throw Error('OPERATIONS_INVALID');}
export function validateOperations(value:any){
 if(value?.version!==1||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observedAt)||!Number.isFinite(Date.parse(value.observedAt))||![7,30].includes(value.days)||!Array.isArray(value.rows)||value.rows.length!==16)bad();
 for(const k of ['startDate','endDate'])if(!/^\d{4}-\d\d-\d\d$/.test(value[k])||!Number.isFinite(Date.parse(value[k]))||new Date(value[k]).toISOString().slice(0,10)!==value[k])bad();
 if((Date.parse(value.endDate)-Date.parse(value.startDate))/86400000+1!==value.days)bad();
 const seen=new Set();const rows=value.rows.map((r:any)=>{
  const b=scope.find(b=>b.id===r.storeId);if(!b||seen.has(b.id)||r.startDate!==value.startDate||r.endDate!==value.endDate||r.days!==value.days||r.code!=='SUCCESS')bad();seen.add(b.id);
  if(!Array.isArray(r.metrics)||r.metrics.length!==names.length||new Set(r.metrics.map((m:any)=>m.name)).size!==names.length)bad();
  const metrics=r.metrics.map((m:any)=>{
   if(!names.includes(m.name)||!numeric(m.total)||m.total<0||!numeric(m.change)||!Array.isArray(m.series)||m.series.length>value.days)bad();
   if(['total_orders','total_delivered_orders','total_rejected_orders','wait_time_past_target_5min_cnt'].includes(m.name)&&!count(m.total))bad();
   if(m.name.startsWith('order_rating')&&m.total>5)bad();
   let previous=0;const series=m.series.map((p:any)=>{
    if(!Number.isSafeInteger(p.time)||p.time<=previous||(p.value!==null&&(!numeric(p.value)||p.value<0)))bad();previous=p.time;
    const date=new Date(p.time*1000+4*3600000).toISOString().slice(0,10);if(date<value.startDate||date>value.endDate)bad();
    return {time:p.time,value:p.value};
   });return {name:m.name,total:m.total,change:m.change,series};
  });
  const service:Record<string,any>={};for(const key of ['rejected','cancelled','latePrepared','inaccurate']){
   const p=r.service?.[key];if(!count(p?.total)||!numeric(p.pct)||p.pct<0||p.pct>100)bad();service[key]={total:p.total,pct:p.pct};
  }
  if(!count(r.service?.totalItemClaims)||!Array.isArray(r.service?.claimedItems)||r.service.claimedItems.length>100)bad();
  service.totalItemClaims=r.service.totalItemClaims;
  service.claimedItems=r.service.claimedItems.map((i:any)=>{
   if(typeof i.name!=='string'||!i.name.trim()||i.name.length>512||typeof i.category!=='string'||i.category.length>512)bad();
   const x:Record<string,any>={name:i.name,category:i.category};for(const k of ['claims','missing','incomplete','incorrectlyCooked','wrongOrder','dietary']){if(!count(i[k]))bad();x[k]=i[k];}return x;
  });
  const disagreements=[];for(const [metric,key] of [['total_rejected_orders','rejected'],['wait_time_past_target_5min_cnt','latePrepared']] as const)if(metrics.find((m:any)=>m.name===metric).total!==service[key].total)disagreements.push(key);
  return {storeId:b.id,orgId:b.orgId,storeName:b.name,startDate:r.startDate,endDate:r.endDate,days:r.days,code:'SUCCESS',metrics,service,servicePeriodVerified:r.servicePeriodVerified===true,disagreements};
 });return {version:1,observedAt:value.observedAt,days:value.days,startDate:value.startDate,endDate:value.endDate,rows};
}
