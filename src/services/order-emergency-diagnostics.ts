import type {DailyOrders,OrderAssessment} from './order-emergency-policy.ts';
export type EmergencyContext={kind:'events'|'customers';impressions:number|null;visits:number|null;cart:number|null;placed:number|null;cancelled:number|null;offlineMinutes:number|null;scheduledMinutes:number|null;rejected?:number|null};
export type EmergencySignal={code:'VISIBILITY'|'VISITS'|'ORDERING'|'OFFLINE'|'CANCELLATIONS';title:string;check:string;metric:string;unit:string;current:number;baseline:number;change:number;changeUnit:'percent'|'points'|'count';strength:'matched daily evidence'};
export type EmergencyDiagnosis={version:1;state:'EVIDENCE'|'NO_STRONG_SIGNAL'|'INSUFFICIENT';date:string;baselineFrom:string;baselineTo:string;primary:EmergencySignal|null;supporting:EmergencySignal[];measurements:{metric:string;unit:string;current:number;baseline:number}[];limits:string[]};
const valid=(n:unknown):n is number=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const ratio=(a:number|null,b:number|null)=>a!==null&&b!==null&&b>0&&a<=b?a/b*100:null;
/** Screens plausible investigation paths, never estimates causal contribution to lost sales. */
export function diagnoseOrderEmergency(row:OrderAssessment,points:DailyOrders[]):EmergencyDiagnosis|undefined{
 if(row.state!=='EMERGENCY'||!row.asOf||!row.baselineFrom||!row.baselineTo)return;
 const dates=Array.from({length:7},(_,i)=>new Date(Date.parse(row.baselineFrom!+'T00:00:00Z')+i*86400000).toISOString().slice(0,10));
 const one=(date:string)=>{const found=points.filter(p=>p.date===date);return found.length===1?found[0]!.context:undefined;};
 const current=one(row.asOf),baseline=dates.map(one),signals:(EmergencySignal&{score:number})[]=[],limits:string[]=[],measurements:EmergencyDiagnosis['measurements']=[];
 const result=():EmergencyDiagnosis=>{signals.sort((a,b)=>b.score-a.score||a.code.localeCompare(b.code));const clean=({score,...signal}:EmergencySignal&{score:number})=>signal;return {version:1,state:signals.length?'EVIDENCE':measurements.length?'NO_STRONG_SIGNAL':'INSUFFICIENT',date:row.asOf!,baselineFrom:row.baselineFrom!,baselineTo:row.baselineTo!,primary:signals[0]?clean(signals[0]):null,supporting:signals.slice(1,3).map(clean),measurements,limits:[...limits,'Associated measurements only; they do not establish the cause of the order decline.']};};
 if(!current||baseline.some(c=>!c||c.kind!==current.kind)){limits.push('Matched daily context is unavailable for the incident day or all seven frozen baseline days.');return result();}
 const sum=(key:keyof Omit<EmergencyContext,'kind'>)=>{const values=baseline.map(c=>c![key]);return values.every(valid)?values.reduce<number>((n,v)=>n+v!,0):null;};
 const metric=(key:keyof Omit<EmergencyContext,'kind'>)=>{const total=sum(key),value=current[key];return total!==null&&valid(value)?{current:value,baseline:total/7,total}:null;};
 for(const key of ['impressions','visits','cart','placed','cancelled','offlineMinutes','scheduledMinutes','rejected'] as const){const m=metric(key);if(m)measurements.push({metric:key,unit:key.endsWith('Minutes')?'minutes':['cancelled','rejected'].includes(key)||key==='placed'&&row.platform==='noon'?'orders':current.kind,current:m.current,baseline:m.baseline});}
 const add=(code:EmergencySignal['code'],title:string,check:string,metric:string,unit:string,current:number,baseline:number,change:number,changeUnit:EmergencySignal['changeUnit'],score:number)=>signals.push({code,title,check,metric,unit,current,baseline,change,changeUnit,score,strength:'matched daily evidence'});
 for(const [key,code,title,threshold] of [['visits','VISITS','Fewer visits reached the store',20],['impressions','VISIBILITY','Store visibility fell',50]] as const){
  const m=metric(key);if(!m){limits.push(`${key}: matched evidence unavailable.`);continue;}
  if(m.baseline>=threshold&&m.current<=m.baseline*.7){const drop=(1-m.current/m.baseline)*100;add(code,title,'Check store visibility, operating hours and advertising exposure.',key,current.kind,m.current,m.baseline,-drop,'percent',70+drop/5+(code==='VISITS'?1:0));}
 }
 const visits=metric('visits'),placed=metric('placed');
 if(visits&&placed){const before=ratio(placed.total,visits.total),after=ratio(placed.current,visits.current);
  if(before!==null&&after!==null&&before>0&&visits.baseline>=20&&visits.current>=20&&after<=before*.7)add('ORDERING',visits.current>=visits.baseline*.7?'Visits held up, ordering weakened':'Ordering / visit ratio also weakened','Check menu visibility, unavailable items, prices and whether an order can be completed in the customer app.','Reported ordering / visit ratio','percent',after,before,after-before,'points',70+(1-after/before)*20);
  else if(before===null||after===null)limits.push('Ordering / visit ratio is unavailable or inconsistent.');
 }else limits.push('Ordering / visit comparison lacks matched daily evidence.');
 if(visits&&placed)limits.push('Reported stage ratios do not track the same individual customers through the ordering journey.');
 const down=metric('offlineMinutes'),scheduled=metric('scheduledMinutes');
 if(down&&scheduled){const before=ratio(down.total,scheduled.total),after=ratio(down.current,scheduled.current);if(before!==null&&after!==null&&down.current>=20&&after>=10&&after-before>=5)add('OFFLINE','Unavailability increased','Verify store online status, scheduled opening hours and menu availability for these dates.','Unavailable share of scheduled time','percent',after,before,after-before,'points',100+after-before);else if(before===null||after===null)limits.push('Availability denominator is unavailable or inconsistent.');}else limits.push('Matched daily availability evidence unavailable.');
 const cancelled=metric('cancelled');
 if(cancelled&&row.currentOrders!==null&&row.baselineTotal!==null){const before=ratio(cancelled.total,row.baselineTotal+cancelled.total),after=ratio(cancelled.current,row.currentOrders+cancelled.current);if(before!==null&&after!==null&&cancelled.current>=2&&after>=10&&after-before>=5)add('CANCELLATIONS','Cancelled / lost order share increased','Inspect affected orders and rejection reasons; check item availability and acceptance settings.','Cancelled / lost order share','percent',after,before,after-before,'points',90+after-before);}
 else limits.push('Matched daily cancellation evidence unavailable.');
 if(cancelled)limits.push('Cancelled/lost share uses reported successful plus cancelled/lost counts; it is not the vendor cancellation-rate definition.');
 const rejected=metric('rejected');if(rejected&&rejected.current>=2&&rejected.current>=rejected.baseline+2)add('CANCELLATIONS','More orders were rejected','Inspect rejected orders and item availability for this date.','Rejected orders','orders',rejected.current,rejected.baseline,rejected.current-rejected.baseline,'count',90+Math.min(20,rejected.current-rejected.baseline));
 return result();
}
/** Project bounded derived evidence only; older snapshots simply have no diagnosis. */
export function publicEmergencyDiagnosis(value:any):EmergencyDiagnosis|undefined{
 const text=(v:unknown):v is string=>typeof v==='string'&&v.length<=500;
 const signal=(s:any):s is EmergencySignal=>s&&['VISIBILITY','VISITS','ORDERING','OFFLINE','CANCELLATIONS'].includes(s.code)&&['title','check','metric','unit'].every(k=>text(s[k]))&&['current','baseline'].every(k=>valid(s[k]))&&typeof s.change==='number'&&Number.isFinite(s.change)&&['percent','points','count'].includes(s.changeUnit)&&s.strength==='matched daily evidence';
 if(!value||value.version!==1||!['EVIDENCE','NO_STRONG_SIGNAL','INSUFFICIENT'].includes(value.state)||![value.date,value.baselineFrom,value.baselineTo].every(v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v))||value.primary!==null&&!signal(value.primary)||!Array.isArray(value.supporting)||value.supporting.length>2||!value.supporting.every(signal)||!Array.isArray(value.measurements)||value.measurements.length>8||!value.measurements.every((m:any)=>m&&text(m.metric)&&text(m.unit)&&valid(m.current)&&valid(m.baseline))||!Array.isArray(value.limits)||value.limits.length>10||!value.limits.every(text))return;
 const project=(s:EmergencySignal)=>({code:s.code,title:s.title,check:s.check,metric:s.metric,unit:s.unit,current:s.current,baseline:s.baseline,change:s.change,changeUnit:s.changeUnit,strength:s.strength});
 return {version:1,state:value.state,date:value.date,baselineFrom:value.baselineFrom,baselineTo:value.baselineTo,primary:value.primary?project(value.primary):null,supporting:value.supporting.map(project),measurements:value.measurements.map((m:any)=>({metric:m.metric,unit:m.unit,current:m.current,baseline:m.baseline})),limits:[...value.limits]};
}
