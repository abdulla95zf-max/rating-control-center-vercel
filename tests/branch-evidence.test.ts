import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {talabatDiagnostics,keetaDiagnostics,noonDiagnostics} from '../src/services/branch-diagnostics.ts';
const period={from:'2026-10-14',to:'2026-10-20',previousFrom:'2026-10-07',previousTo:'2026-10-13'};
function history(){return Array.from({length:14},(_,i)=>({report_date:new Date(Date.parse('2026-10-07T00:00:00Z')+i*86400000).toISOString().slice(0,10),present:true,orders:'10',metrics:{'Successful Orders':'10','Impressions':'1000','Viewed your menu':'100','Added items to cart':'40','Placed an order':'10','Average preparation time (minutes)':'15','Total AWT Duration (Minutes)':'20','Scheduled Open Time (Minutes)':'600','Unavailable time duration (Minutes)':'12','Cancelled Orders':'1','Total customer complaints received':'0','Orders from new customers':'3','Orders from returning customers':'7','Pro Revenue':'80','Revenue loss from rejections':'10'}}));}
const context:any=vm.createContext({Intl});for(const name of ['branch-story','branch-evidence-view','branch-brief-view'])vm.runInContext(fs.readFileSync('public/'+name+'.js','utf8'),context);
const metric=(d:any,code:string)=>d.evidence.metrics.find((m:any)=>m.code===code);
test('missing latest-day funnel preserves older dated values without turning a six-day subset into a weekly total',()=>{
 const rows=history();for(const key of ['Impressions','Viewed your menu','Added items to cart','Placed an order'])rows[13]!.metrics[key as keyof typeof rows[13]['metrics']]=null as any;
 const d=talabatDiagnostics(rows,period),m=metric(d,'menuViews');assert.equal(d.funnel.stages[0]!.current,null);assert.deepEqual(m.current,{knownDays:6,totalDays:7,complete:false,observed:600});assert.deepEqual(m.latest,{from:'2026-10-19',to:'2026-10-19',value:100});assert.equal(d.evidence.funnelDaily.length,14);assert.equal(d.evidence.funnelDaily.at(-1)?.menuViews,null);
 const html=context.BranchEvidenceView.funnel(d,'en');assert.match(html,/2026-10-19/);assert.match(html,/LATEST COMPLETE DAY AVAILABLE/);assert.match(html,/2026-10-20/);assert.match(html,/separate daily observation/);assert.doesNotMatch(html,/NaN|Infinity/);
 const summary=context.BranchEvidenceView.render(d,'en');assert.match(summary,/6\/7 days/);assert.match(summary,/observed subset/);assert.match(summary,/Customers &amp; basket mix|Customers & basket mix/);
});
test('zero is known; unknown values, duplicate days and fractional event counts never become invented totals',()=>{
 const rows=history();rows[13]!.metrics['Viewed your menu']='0';let d=talabatDiagnostics(rows,period);assert.equal(metric(d,'menuViews').current.knownDays,7);assert.equal(metric(d,'menuViews').current.observed,600);assert.equal(metric(d,'menuViews').latest.value,0);
 rows[12]!.metrics['Viewed your menu']='3.5';d=talabatDiagnostics([...rows,rows[11]!],period);assert.equal(metric(d,'menuViews').current.knownDays,5);assert.equal(metric(d,'menuViews').current.complete,false);assert.equal(d.evidence.funnelDaily.find(p=>p.date===rows[11]!.report_date)?.menuViews,null);
});
test('partial weighted preparation, wait and offline use only valid matched denominators',()=>{
 const rows=history();rows[13]!.metrics['Average preparation time (minutes)']=null as any;rows[7]!.orders='30';rows[7]!.metrics['Average preparation time (minutes)']='20';
 const d=talabatDiagnostics(rows,period);assert.equal(metric(d,'prep').current.complete,false);assert.equal(metric(d,'prep').current.observed,(30*20+50*15)/80);assert.equal(metric(d,'wait').current.observed,140/90);assert.equal(metric(d,'offline').current.observed,2);
 const signals=context.BranchEvidenceView.reviewSignals(d);assert.ok(signals.some(s=>s.code==='prep'));assert.ok(signals.every(s=>s.from>=period.from));
});
test('period snapshots expose customers and service without claiming seven observed daily records',()=>{
 const d=keetaDiagnostics({business:{shop_valid_order_num:'10',shop_cancel_order_num:'1'},service:{shop_average_cooking_duration:'12'}},undefined,{pay:[{code:'shop_merchant_new_user_num',value:'5',popValues:['3']}],conversion:[]},period);
 const m=metric(d,'newCustomers');assert.equal(m.current.observed,5);assert.equal(m.previous.observed,3);assert.equal(m.current.knownDays,undefined);
 const html=context.BranchEvidenceView.render(d,'en');assert.match(html,/New customers/);assert.match(html,/Source period/);assert.doesNotMatch(html,/7\/7/);
});
test('Noon commercial values require matching source dates and retain unknown customer counts',()=>{
 const raw:any={startDate:period.from,endDate:period.to,comparisonStartDate:period.previousFrom,comparisonEndDate:period.previousTo,salesInsights:{mainInsights:{ordersCount:10}},customerInsights:{customerBaseInsights:{newCustomersOrdersCount:4,newCustomersRevenue:300}},operationInsights:{}};
 const d=noonDiagnostics(raw,period);assert.equal(metric(d,'newOrders').current.observed,4);assert.equal(metric(d,'returnOrders').current.observed,null);
 const invalid=noonDiagnostics({...raw,startDate:'2026-10-01'},period);assert.equal(invalid.matched,false);assert.equal(context.BranchEvidenceView.render(invalid,'en'),'');
});
test('partial or older evidence never creates a matched-week causal explanation, escapes labels and survives an ineligible sales comparison',()=>{
 const rows=history();rows[13]!.metrics['Viewed your menu']=null as any;const d=talabatDiagnostics(rows,period);
 const html=context.BranchBriefView.render({group:{brand:'<unsafe>',branch:'Preview'},entries:[{valid:false,platform:'talabat',row:{eligible:false,period,current:{sales:null,orders:null},previous:{sales:null,orders:null},diagnostics:d}}],language:'en',ratingsHtml:''});
 assert.match(html,/LATEST COMPLETE DAY AVAILABLE/);assert.match(html,/AVAILABLE EVIDENCE/);assert.match(html,/&lt;unsafe&gt;/);assert.doesNotMatch(html,/Slow preparation may be part of the problem/);
 const wrong={...d,evidence:{...d.evidence,period:{...period,to:'2026-10-19'}}};assert.equal(context.BranchEvidenceView.render(wrong,'en'),'');
});
