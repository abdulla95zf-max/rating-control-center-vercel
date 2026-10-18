import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {talabatDiagnostics,keetaDiagnostics,noonDiagnostics} from '../src/services/branch-diagnostics.ts';
const period={from:'2026-10-11',to:'2026-10-17',previousFrom:'2026-10-04',previousTo:'2026-10-10'};
const metric=(result:any,code:string)=>result.operations.find((m:any)=>m.code===code);
test('Talabat visits are summed only over complete unique days; preparation is order-weighted, wait is per order',()=>{
 const rows=Array.from({length:14},(_,i)=>({report_date:`2026-10-${String(i+4).padStart(2,'0')}`,present:true,orders:i===7?'30':'10',metrics:{'Successful Orders':i===7?'30':'10','Viewed your menu':'100','Added items to cart':'50','Placed an order':'12','Average preparation time (minutes)':i===7?'20':'10','Total AWT Duration (Minutes)':'30','Scheduled Open Time (Minutes)':'600','Unavailable time duration (Minutes)':'12','Cancelled Orders':'1','Total customer complaints received':'0'}}));
 const d=talabatDiagnostics(rows,period);assert.equal(d.funnel.stages[0]!.current,700);assert.equal(metric(d,'prep').current,(30*20+60*10)/90);assert.equal(metric(d,'wait').current,210/90);assert.equal(metric(d,'offline').current,2);assert.equal(metric(d,'complaints').current,0);
 rows[8]!.metrics['Viewed your menu']='';assert.equal(talabatDiagnostics(rows,period).funnel.stages[0]!.current,null);
 assert.equal(talabatDiagnostics([...rows,rows[8]],period).funnel.stages[1]!.current,null);
});
test('Keeta counts customer stages separately from valid orders and never invents prior service values',()=>{
 const shop={business:{shop_valid_order_num:'90',shop_cancel_order_num:'10'},service:{shop_average_cooking_duration:'18.3',shop_refund_wlmeal_order_num:'2'},opening:[{code:'shop_avg_closing_duration',value:'1'},{code:'shop_daily_average_opening_duration',value:'9'}]};
 const customer={conversion:[{code:'shop_entry_user_num',value:'1000',popValues:['1200']},{code:'shop_pay_user_num',value:'80',popValues:['100']}]};
 const d=keetaDiagnostics(shop,undefined,customer,period);assert.equal(d.funnel.kind,'customers');assert.equal(d.funnel.stages[2]!.current,80);assert.equal(d.funnel.stages[0]!.previous,1200);assert.equal(metric(d,'cancelRate').current,10);assert.equal(metric(d,'offline').current,10);assert.equal(metric(d,'prep').previous,null);
 const duplicate={conversion:[...customer.conversion,customer.conversion[0]]};assert.equal(keetaDiagnostics(shop,undefined,duplicate,period).funnel.stages[0]!.current,null);
});
test('Noon refuses mismatched nested dates, uses source funnel completions and suppresses zero-order averages',()=>{
 const d:any={startDate:period.from,endDate:period.to,comparisonStartDate:period.previousFrom,comparisonEndDate:period.previousTo,salesInsights:{mainInsights:{ordersCount:0},mainInsightsPrevious:{ordersCount:10}},customerInsights:{conversionFunnel:{menuViewsCount:100,addedToCartCount:25,orderCompletedCount:0}},operationInsights:{mainInsights:{offHours:2,totalHours:10,lostOrders:0,ordersWithComplaints:0,avarageDaWaitTime:99},liveOrdersInsights:{averagePreparationTime:99}}};
 const result=noonDiagnostics(d,period);assert.equal(result.matched,true);assert.equal(metric(result,'prep').current,null);assert.equal(metric(result,'wait').current,null);assert.equal(metric(result,'offline').current,20);assert.equal(result.funnel.stages[2]!.current,0);assert.equal(result.funnel.stages[0]!.previous,null);
 assert.equal(noonDiagnostics({...d,startDate:'2026-10-10'},period).matched,false);
 d.customerInsights.conversionFunnel.menuViewsCount=3.5;assert.equal(noonDiagnostics(d,period).funnel.stages[0]!.current,null);
});
const c:any={};vm.createContext(c);vm.runInContext(fs.readFileSync('public/branch-story.js','utf8'),c);const analyze=c.BranchStoryCore.analyze;
const row=(diagnostics:any,orders=50)=>({eligible:true,period,current:{orders},previous:{orders:100},diagnostics});
const d=(prep=20,previous=15)=>({matched:true,period,funnel:{kind:'events',stages:[{code:'menuViews',current:1000,previous:1000},{code:'completed',current:50,previous:100}]},operations:[{code:'prep',unit:'minutes',current:prep,previous}]});
test('slow-preparation explanations are hypotheses, never claimed when orders grew, dates mismatch or service is absent',()=>{
 const model=analyze(row(d()),'talabat');assert.equal(model.hypothesis.code,'DELAY_POSSIBLE');assert.equal(model.hypothesis.basis,'HYPOTHESIS');assert.equal(model.ratio,5);
 assert.equal(analyze(row(d(),120),'talabat').hypothesis,null);assert.equal(analyze(row({...d(),period:{...period,to:'2026-10-16'}}),'talabat').available,false);
 assert.equal(analyze(row(d(),10),'talabat').hypothesis,null);
 assert.equal(analyze(row({...d(),operations:[]}), 'talabat').hypothesis,null);
 assert.equal(analyze({...row(d()),eligible:false},'talabat').issues.length,0);
});
test('observed traffic decline takes precedence over an unsupported delay explanation; invalid ratios stay unknown',()=>{
 const diag=d();diag.funnel.stages[0]!.previous=2000;const model=analyze(row(diag),'keeta');assert.equal(model.hypothesis.code,'VISITS_DOWN');assert.equal(model.hypothesis.basis,'OBSERVED');
 diag.funnel.stages[1]!.current=2000;assert.equal(analyze(row(diag),'keeta').ratio,null);
});
vm.runInContext(fs.readFileSync('public/branch-brief-view.js','utf8'),c);
test('brief explicitly renders exact current/previous sales and service evidence without inventing a cohort or cause',()=>{
 const r={...row(d()),current:{sales:15000,orders:50},previous:{sales:18000,orders:100},aov:300,previousAov:180,period,recommendation:{confidence:'LOW'}};
 const html=c.BranchBriefView.render({group:{brand:'Kabab Fareej',branch:'Ajman'},entries:[{valid:true,platform:'keeta',change:-3000,percent:-100/6,row:r}],language:'fa',ratingsHtml:''});
 assert.match(html,/15,000/);assert.match(html,/18,000/);assert.match(html,/-3,000/);assert.match(html,/برداشت احتمالی/);assert.match(html,/اثبات‌نشده/);assert.match(html,/نسبت توصیفی/);assert.doesNotMatch(html,/NaN|Infinity|style=/);
});
test('invalid comparison suppresses operational explanations even when raw diagnostic numbers are present',()=>{
 const html=c.BranchBriefView.render({group:{brand:'<script>',branch:'<unsafe>'},entries:[{valid:false,platform:'talabat',reason:'SOURCE_AMBIGUOUS',row:row(d())}],language:'fa',ratingsHtml:''});
 assert.doesNotMatch(html,/کندی آماده‌سازی ممکن است|<script>|<unsafe>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/disabled/);
});
