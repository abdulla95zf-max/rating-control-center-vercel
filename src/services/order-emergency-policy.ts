import {diagnoseOrderEmergency,type EmergencyContext,type EmergencyDiagnosis} from './order-emergency-diagnostics.ts';
export const emergencyPolicy={version:1,baselineDays:7,minAverage:4.5,minDropPercent:80,timezone:'Asia/Dubai',maxReportLagDays:1} as const;
export type EmergencyPlatform='talabat'|'keeta'|'noon'|'deliveroo';
export type EmergencyBranch={key:string;platform:EmergencyPlatform;sourceId:string;branchId:string;brand:string;name:string};
export type DailyOrders={date:string;orders:number|null;complete:boolean;observedAt:string;revision:string;context?:EmergencyContext};
export type OrderSeries=EmergencyBranch&{lineage:string;asOf:string|null;points:DailyOrders[];error?:string};
export type OrderIncident={branchId:string;lineage:string;startDate:string;lastConfirmed:string;baselineFrom:string;baselineTo:string;baselineTotal:number;consecutiveDays:number;zeroDays:number};
export type OrderAssessment=EmergencyBranch&{state:'EMERGENCY'|'NORMAL'|'LOW_VOLUME'|'INSUFFICIENT'|'UNKNOWN';reason:string|null;asOf:string|null;expectedDate:string;currentOrders:number|null;baselineAverage:number|null;baselineTotal:number|null;baselineFrom:string|null;baselineTo:string|null;dropPercent:number|null;startDate:string|null;lastConfirmed:string|null;consecutiveDays:number;zeroDays:number;lagDays:number|null};
export type EmergencySnapshot={version:1;checkedAt:string;expectedDate:string;rows:(OrderAssessment&{diagnosis?:EmergencyDiagnosis})[];incidents:Record<string,OrderIncident>;sourceErrors:Partial<Record<EmergencyPlatform,string>>};
export const calendarDay=(date:string,offset:number)=>new Date(Date.parse(date+'T00:00:00Z')+offset*86400000).toISOString().slice(0,10);
export const dubaiDay=(now:Date)=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Dubai',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
export const validDay=(value:unknown):value is string=>typeof value==='string'&&/^\d{4}-\d\d-\d\d$/.test(value)&&Number.isFinite(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const count=(v:unknown):v is number=>Number.isSafeInteger(v)&&Number(v)>=0;
const severe=(orders:number,total:number)=>orders*35<=total; // Exact >=80% drop against total/7; no rounded averages.
function pointValid(point:DailyOrders,date:string,now:Date){return point.date===date&&point.complete===true&&count(point.orders)&&typeof point.revision==='string'&&!!point.revision&&Number.isFinite(Date.parse(point.observedAt))&&Date.parse(point.observedAt)>=Date.parse(date+'T20:00:00Z')&&Date.parse(point.observedAt)<=now.getTime()+300000;}
function incidentValid(value:OrderIncident){return value&&typeof value.branchId==='string'&&typeof value.lineage==='string'&&[value.startDate,value.lastConfirmed,value.baselineFrom,value.baselineTo].every(validDay)&&calendarDay(value.baselineTo,1)===value.startDate&&calendarDay(value.baselineFrom,6)===value.baselineTo&&value.lastConfirmed>=value.startDate&&count(value.baselineTotal)&&value.baselineTotal>=31.5&&count(value.consecutiveDays)&&value.consecutiveDays>0&&count(value.zeroDays)&&value.zeroDays<=value.consecutiveDays;}

export function assessOrderSeries(series:OrderSeries,now:Date,previous?:OrderIncident):{row:OrderAssessment;incident?:OrderIncident}{
 const expectedDate=calendarDay(dubaiDay(now),-1),asOf=series.asOf;
 const base:OrderAssessment={key:series.key,platform:series.platform,sourceId:series.sourceId,branchId:series.branchId,brand:series.brand,name:series.name,state:'UNKNOWN',reason:null,asOf,expectedDate,currentOrders:null,baselineAverage:null,baselineTotal:null,baselineFrom:null,baselineTo:null,dropPercent:null,startDate:null,lastConfirmed:null,consecutiveDays:0,zeroDays:0,lagDays:validDay(asOf)?(Date.parse(expectedDate)-Date.parse(asOf))/86400000:null};
 let open=previous&&incidentValid(previous)&&previous.branchId===series.branchId?{...previous}:undefined;
 const describe=(row:OrderAssessment,incident:OrderIncident|undefined)=>incident?{...row,baselineAverage:incident.baselineTotal/7,baselineTotal:incident.baselineTotal,baselineFrom:incident.baselineFrom,baselineTo:incident.baselineTo,startDate:incident.startDate,lastConfirmed:incident.lastConfirmed,consecutiveDays:incident.consecutiveDays,zeroDays:incident.zeroDays}:row;
 const unknown=(reason:string)=>({row:describe({...base,state:'UNKNOWN',reason},open),...(open?{incident:open}:{})});
 if(series.error)return unknown(series.error);
 if(!validDay(asOf)||asOf>expectedDate||base.lagDays!<0||base.lagDays!>emergencyPolicy.maxReportLagDays)return unknown('REPORT_NOT_CURRENT');
 if(previous&&(!open||previous.lineage!==series.lineage||asOf<previous.lastConfirmed))return unknown('SOURCE_CHANGED_OR_REGRESSED');
 const days=new Map<string,DailyOrders[]>();
 for(const point of series.points){if(!validDay(point.date)||point.date>asOf)continue;const rows=days.get(point.date)||[];rows.push(point);days.set(point.date,rows);}
 const read=(date:string)=>{const matches=days.get(date)||[];return matches.length===1&&pointValid(matches[0]!,date,now)?matches[0]!:null;};
 const latest=read(asOf);if(!latest)return unknown('DAY_MISSING_OR_INVALID');
 if(now.getTime()-Date.parse(latest.observedAt)>48*3600000)return unknown('COLLECTION_STALE');
 if(open){const dates=Array.from({length:7},(_,i)=>calendarDay(open!.baselineFrom,i)),old=dates.map(read);if(old.every(Boolean)&&old.reduce((n,p)=>n+p!.orders!,0)!==open.baselineTotal)return unknown('BASELINE_REVISED');}
 const dates=[...days.keys()].sort();let first=dates[0]??asOf;if(open)first=open.lastConfirmed;
 let final=base;
 for(let date=first;date<=asOf;date=calendarDay(date,1)){
  const p=read(date);if(!p){if(date===asOf)return unknown('DAY_MISSING_OR_INVALID');continue;}
  let closed:OrderIncident|undefined;
  if(open&&!severe(p.orders!,open.baselineTotal)){closed=open;open=undefined;}
  if(!open&&!closed){
   const window=Array.from({length:7},(_,i)=>read(calendarDay(date,i-7)));
   if(window.some(p=>!p)){if(date===asOf)final={...base,state:'INSUFFICIENT',reason:'SEVEN_COMPLETE_BASELINE_DAYS_REQUIRED',currentOrders:p.orders};continue;}
   const total=window.reduce((n,p)=>n+p!.orders!,0);
   if(total<31.5){if(date===asOf)final={...base,state:'LOW_VOLUME',reason:'BASELINE_BELOW_4_5',currentOrders:p.orders,baselineTotal:total,baselineAverage:total/7,baselineFrom:calendarDay(date,-7),baselineTo:calendarDay(date,-1)};continue;}
   if(severe(p.orders!,total))open={branchId:series.branchId,lineage:series.lineage,startDate:date,lastConfirmed:date,baselineFrom:calendarDay(date,-7),baselineTo:calendarDay(date,-1),baselineTotal:total,consecutiveDays:0,zeroDays:0};
   else if(date===asOf)final={...base,state:'NORMAL',reason:null,currentOrders:p.orders,baselineTotal:total,baselineAverage:total/7,baselineFrom:calendarDay(date,-7),baselineTo:calendarDay(date,-1),dropPercent:(1-p.orders!*7/total)*100};
  }
  if(open){
   const same=date===open.lastConfirmed&&open.consecutiveDays>0,contiguous=date===calendarDay(open.lastConfirmed,1);
   open={...open,lastConfirmed:date,consecutiveDays:same?open.consecutiveDays:contiguous?open.consecutiveDays+1:1,zeroDays:p.orders===0?(same?Math.max(1,open.zeroDays):contiguous?open.zeroDays+1:1):0};
   if(date===asOf)final=describe({...base,state:'EMERGENCY',reason:null,currentOrders:p.orders,dropPercent:(1-p.orders!*7/open.baselineTotal)*100},open);
  }else if(closed&&date===asOf)final=describe({...base,state:'NORMAL',reason:'EXITED_EMERGENCY_THRESHOLD',currentOrders:p.orders,dropPercent:(1-p.orders!*7/closed.baselineTotal)*100},closed);
 }
 return {row:final,...(open?{incident:open}:{})};
}

export function evaluateEmergencySnapshot(series:OrderSeries[],now:Date,previous?:EmergencySnapshot,sourceErrors:EmergencySnapshot['sourceErrors']={}):EmergencySnapshot{
 if(series.length>500||new Set(series.map(s=>s.key)).size!==series.length)throw Error('EMERGENCY_SCOPE_INVALID');
 const rows:EmergencySnapshot['rows']=[],incidents:Record<string,OrderIncident>={};
 for(const s of series){const result=assessOrderSeries(s,now,previous?.incidents[s.key]);const diagnosis=diagnoseOrderEmergency(result.row,s.points.filter(p=>pointValid(p,p.date,now)));rows.push({...result.row,...(diagnosis?{diagnosis}:{})});if(result.incident)incidents[s.key]=result.incident;}
 return {version:1,checkedAt:now.toISOString(),expectedDate:calendarDay(dubaiDay(now),-1),rows,incidents,sourceErrors};
}

export function validEmergencySnapshot(value:any):value is EmergencySnapshot{
 if(!value||value.version!==1||!Number.isFinite(Date.parse(value.checkedAt))||!validDay(value.expectedDate)||!Array.isArray(value.rows)||value.rows.length>500||!value.incidents||typeof value.incidents!=='object'||Array.isArray(value.incidents)||Object.keys(value.incidents).length>500||!value.sourceErrors||typeof value.sourceErrors!=='object')return false;
 if(Buffer.byteLength(JSON.stringify(value))>500000)return false;
 return value.rows.every((r:any)=>r&&typeof r.key==='string'&&r.key.length<512&&typeof r.branchId==='string'&&typeof r.sourceId==='string'&&typeof r.brand==='string'&&typeof r.name==='string'&&['talabat','keeta','noon','deliveroo'].includes(r.platform)&&['EMERGENCY','NORMAL','LOW_VOLUME','INSUFFICIENT','UNKNOWN'].includes(r.state))&&Object.values(value.incidents).every(v=>incidentValid(v as OrderIncident));
}
