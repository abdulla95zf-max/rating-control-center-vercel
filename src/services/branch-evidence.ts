/** Dated observations supplement strict period totals; never impute missing days. */
type Period={from:string;to:string;previousFrom:string;previousTo:string};
type Definition={code:string;key:string;group:string;unit:string;weight?:string;denominator?:string};
const number=(value:unknown):number|null=>{if(value===null||value===undefined||String(value).trim()==='')return null;const text=String(value).trim().replace(/%$/,'').replace(/,/g,'');if(!/^\d+(?:\.\d+)?$/.test(text))return null;const n=Number(text);return Number.isFinite(n)?n:null;};
const comparable=(p:Period)=>Date.parse(p.to)-Date.parse(p.from)===6*86400000&&Date.parse(p.previousTo)-Date.parse(p.previousFrom)===6*86400000&&Date.parse(p.from)-Date.parse(p.previousTo)===86400000;
const definitions:Definition[]=[
 {code:'impressions',key:'Impressions',group:'traffic',unit:'events'},
 {code:'menuViews',key:'Viewed your menu',group:'traffic',unit:'events'},
 {code:'cart',key:'Added items to cart',group:'traffic',unit:'events'},
 {code:'placed',key:'Placed an order',group:'traffic',unit:'events'},
 {code:'prep',key:'Average preparation time (minutes)',group:'service',unit:'minutes',weight:'orders'},
 {code:'cancelled',key:'Cancelled Orders',group:'service',unit:'orders'},
 {code:'avoidableCancelled',key:'Avoidable cancellation count',group:'service',unit:'orders'},
 {code:'complaints',key:'Total customer complaints received',group:'service',unit:'records'},
 {code:'offlineMinutes',key:'Unavailable time duration (Minutes)',group:'service',unit:'minutes'},
 {code:'offline',key:'Unavailable time duration (Minutes)',group:'service',unit:'percent',denominator:'Scheduled Open Time (Minutes)'},
 {code:'waitTotal',key:'Total AWT Duration (Minutes)',group:'service',unit:'minutes'},
 {code:'wait',key:'Total AWT Duration (Minutes)',group:'service',unit:'minutes/order',denominator:'orders'},
 {code:'ordersWait',key:'Orders with AWT',group:'service',unit:'orders'},
 {code:'waitFees',key:'Total Fee applied',group:'service',unit:'AED'},
 {code:'rejectionLoss',key:'Revenue loss from rejections',group:'commercial',unit:'AED'},
 {code:'salesLoss',key:'Sales loss',group:'commercial',unit:'AED'},
 {code:'newOrders',key:'Orders from new customers',group:'commercial',unit:'orders'},
 {code:'returnOrders',key:'Orders from returning customers',group:'commercial',unit:'orders'},
 {code:'proOrders',key:'Pro Orders',group:'commercial',unit:'orders'},
 {code:'proRevenue',key:'Pro Revenue',group:'commercial',unit:'AED'},
 {code:'items',key:'Items count',group:'commercial',unit:'items'},
 {code:'deliverySales',key:'Delivery Sales',group:'commercial',unit:'AED'},
 {code:'pickupSales',key:'Pickup Sales',group:'commercial',unit:'AED'},
 {code:'onlineOrders',key:'Online Orders',group:'commercial',unit:'orders'},
 {code:'cashOrders',key:'Cash Orders',group:'commercial',unit:'orders'}
];
export function talabatEvidence(history:any[],period:Period){
 const candidates=history.filter(r=>r.present===true&&typeof r.report_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(r.report_date)&&r.report_date>=period.previousFrom&&r.report_date<=period.to);
 const counts=new Map<string,number>();for(const r of candidates)counts.set(r.report_date,(counts.get(r.report_date)||0)+1);
 const rows=candidates.filter(r=>counts.get(r.report_date)===1).sort((a,b)=>a.report_date.localeCompare(b.report_date));
 const read=(r:any,key:string)=>number(key==='orders'?r.orders:r.metrics?.[key]);
 const point=(row:any,d:Definition)=>{
  const raw=read(row,d.key),base=d.denominator?read(row,d.denominator):d.weight?read(row,d.weight):1;
  if(d.weight&&base===0)return {valid:true,value:null,numerator:0,base:0};
  const valid=raw!==null&&base!==null&&(!(d.weight||d.denominator==='orders')||Number.isSafeInteger(base))&&(!['events','orders','records','items'].includes(d.unit)||Number.isSafeInteger(raw))&&(!d.denominator||base>0)&&(!(d.unit==='percent')||raw<=base!);
  return {valid,value:valid?(d.denominator?raw!/base!*(d.unit==='percent'?100:1):raw):null,numerator:valid?(d.weight?raw!*base!:raw!):0,base:valid?base!:0};
 };
 const metrics=definitions.map(d=>{
  const aggregate=(from:string,to:string)=>{
   const selected=rows.filter(r=>r.report_date>=from&&r.report_date<=to).map(r=>point(r,d)),available=selected.filter(p=>p.valid),knownDays=available.length;
   const numerator=available.reduce((s,p)=>s+p.numerator,0),base=available.reduce((s,p)=>s+p.base,0);
   const observed=knownDays?(d.weight||d.denominator?base>0?numerator/base*(d.unit==='percent'?100:1):null:numerator):null;
   return {knownDays,totalDays:7,complete:knownDays===7,observed};
  };
  const latest=rows.map(r=>({from:r.report_date,to:r.report_date,value:point(r,d).value})).filter(p=>p.value!==null).at(-1)||null;
  return {code:d.code,group:d.group,unit:d.unit,current:aggregate(period.from,period.to),previous:aggregate(period.previousFrom,period.previousTo),latest};
 });
 const funnelDaily=Array.from({length:14},(_,i)=>{
  const date=new Date(Date.parse(period.previousFrom+'T00:00:00Z')+i*86400000).toISOString().slice(0,10),row=rows.find(r=>r.report_date===date);
  return {date,...Object.fromEntries(definitions.filter(d=>d.group==='traffic').map(d=>[d.code,row?point(row,d).value:null]))};
 });
 return {version:1,kind:'daily',period,comparable:comparable(period),metrics,funnelDaily};
}
/** Aggregate snapshots supply period values, not a count of observed daily rows. */
export function periodEvidence(period:Period,measurements:{code:string;group:string;unit:string;current:unknown;previous:unknown}[]){
 const metrics=measurements.map(m=>{
  const value=(v:unknown)=>{const x=number(v);return x!==null&&(['events','orders','customers','records','items'].includes(m.unit)&&!Number.isSafeInteger(x)||m.unit==='percent'&&x>100)?null:x;};
  const current=value(m.current),previous=value(m.previous),part=(observed:number|null)=>({complete:observed!==null,observed});
  return {code:m.code,group:m.group,unit:m.unit,current:part(current),previous:part(previous),latest:current!==null?{from:period.from,to:period.to,value:current}:previous!==null?{from:period.previousFrom,to:period.previousTo,value:previous}:null};
 });
 return {version:1,kind:'period',period,comparable:comparable(period),metrics,funnelDaily:[]};
}
