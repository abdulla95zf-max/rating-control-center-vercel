import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {growthRow,readKeetaGrowth,readNoonGrowth} from '../src/services/growth.ts';
import {growthRecommendation,type RecommendationContext} from '../src/services/growth-recommendations.ts';
const period={from:'2026-10-10',to:'2026-10-16',previousFrom:'2026-10-03',previousTo:'2026-10-09'};
const keeta=()=>growthRow('KEETA;1644207314','Wasl',period,{sales:14969.73,orders:186},{sales:18813.5,orders:236});
const context=():RecommendationContext=>({identity:keeta().identity,period,conversion:[
 {code:'shop_expose_user_num',value:'5747',popValues:['7061']},
 {code:'shop_entry_user_num',value:'1251',popValues:['1791']},
 {code:'shop_expose_entry_cvr',value:'21.77%',popValues:['25.36%']},
 {code:'shop_entry_cartadd_cvr',value:'26.78%',popValues:['23.56%']}
],cancelled:'0',downtime:'0.0'});
test('Wasl Keeta recommendation locates discovery without claiming a cause',()=>{
 const c=context(),before=JSON.stringify(c),r=growthRecommendation(keeta(),c);
 assert.equal(r.code,'DISCOVERY');assert.equal(r.confidence,'MEDIUM');assert.ok(r.evidence.some(s=>s.includes('1,791 → 1,251')));assert.ok(r.evidence.some(s=>s.includes('Reported cancelled orders: 0')));assert.match(r.unknowns.join(' '),/not been verified|does not establish/);assert.equal(JSON.stringify(c),before);
});
test('wrong branch, wrong period, missing baseline or duplicate metric cannot drive funnel advice',()=>{
 const wrongId={...context(),identity:'KEETA;foreign'},wrongDates={...context(),period:{...period,to:'2026-10-15'}},missing=context(),duplicate=context();missing.conversion![1]!.popValues=[];duplicate.conversion!.push({...duplicate.conversion![1]!});
 for(const c of [undefined,wrongId,wrongDates,missing,duplicate])assert.equal(growthRecommendation(keeta(),c).code,'DEMAND_CHECK');
});
test('unknown operational values are not reported as zero and invalid rates do not isolate a stage',()=>{
 const c=context();delete c.cancelled;delete c.downtime;const r=growthRecommendation(keeta(),c);assert.ok(!r.evidence.some(s=>/downtime|cancelled/.test(s)));c.conversion![2]!.value='101%';assert.equal(growthRecommendation(keeta(),c).code,'DEMAND_CHECK');
});
test('menu and checkout recommendations require earlier stages not to have deteriorated',()=>{
 const c=context();c.conversion![1]!.value='1800';c.conversion![3]!.value='20%';assert.equal(growthRecommendation(keeta(),c).code,'MENU_CONVERSION');
 c.conversion![3]!.value='26%';c.conversion!.push({code:'shop_cartadd_submit_cvr',value:'40%',popValues:['56%']},{code:'shop_submit_pay_cvr',value:'97%',popValues:['98%']});assert.equal(growthRecommendation(keeta(),c).code,'CHECKOUT');
});
test('Wasl Noon basket recommendation keeps complaint cases separate from causal interpretation',()=>{
 const row=growthRow('NOON;R;O','Wasl',period,{sales:6590,orders:66},{sales:9523,orders:66}),r=growthRecommendation(row,{identity:row.identity,period,customerOrders:{currentOrders:33,previousOrders:27,currentSales:3510,previousSales:5397},complaints:{orders:2,total:66}});
 assert.equal(r.code,'BASKET');assert.match(r.evidence.join(' '),/199.89 → 106.36/);assert.match(r.qualityCheck!.evidence,/2 \/ 66/);assert.match(r.qualityCheck!.action,/do not establish a cause/);assert.match(r.unknowns.join(' '),/large individual orders/);
 assert.equal(growthRecommendation(row,{identity:row.identity,period,complaints:{orders:2,total:100}}).qualityCheck,undefined);
});
test('incomplete, stale, small, zero and minor changes do not produce strong interventions',()=>{
 const row=keeta();assert.equal(growthRecommendation({...row,eligible:false,reason:'CURRENT_DAYS_MISSING'}).confidence,'INSUFFICIENT');
 assert.equal(growthRecommendation(growthRow('x','x',period,{sales:10,orders:1},{sales:20,orders:2})).code,'SMALL_SAMPLE');
 assert.equal(growthRecommendation(growthRow('x','x',period,{sales:0,orders:0},{sales:1000,orders:20})).code,'ZERO_ORDERS');
 assert.equal(growthRecommendation(growthRow('x','x',period,{sales:990,orders:20},{sales:1000,orders:20})).code,'SMALL_CHANGE');
 assert.equal(growthRecommendation(growthRow('x','x',period,{sales:1200,orders:20},{sales:1000,orders:20})).code,'STABLE_OR_GROWING');
});
test('actual scoped Keeta reader binds source funnel to the matching authorized shop',async()=>{
 const c=context();const data={state:'SUCCESS',snapshot:{periodFrom:period.from,periodTo:period.to,comparisonFrom:period.previousFrom,comparisonTo:period.previousTo,observedAt:'2026-10-17T08:00:00Z',shops:[{shopId:'1644207314',business:{shop_income:'14969.73',shop_valid_order_num:'186'},businessComparison:{from:period.previousFrom,to:period.previousTo,sales:18813.5,orders:236,verifiedBy:'SOURCE_CHANGE_RATIOS'}}],customers:{byShop:[{shopId:'foreign',conversion:c.conversion}]}}};
 let result=await readKeetaGrowth(data,{query:async()=>{throw Error('no history needed')}},new Date('2026-10-17T10:00:00Z'));assert.equal(result.rows[0]!.recommendation.code,'DEMAND_CHECK');
 data.snapshot.customers.byShop[0]!.shopId='1644207314';result=await readKeetaGrowth(data,{query:async()=>{throw Error('no history needed')}},new Date('2026-10-17T10:00:00Z'));assert.equal(result.rows[0]!.recommendation.code,'DISCOVERY');
});
test('Noon reader rejects mismatched nested context dates while retaining its valid sales comparison',()=>{
 const data:any={state:'SUCCESS',snapshot:{period:{startDate:period.from,endDate:period.to,comparisonStartDate:period.previousFrom,comparisonEndDate:period.previousTo},observedAt:'2026-10-17T08:00:00Z',reports:[{scope:'STORE',restaurantId:'R',outletCode:'O',storeName:'Wasl',dashboard:{startDate:'2026-10-09',endDate:period.to,comparisonStartDate:period.previousFrom,comparisonEndDate:period.previousTo,salesInsights:{mainInsights:{revenue:6590,ordersCount:66},mainInsightsPrevious:{revenue:9523,ordersCount:66}},operationInsights:{complaintsInsights:{ordersWithComplaints:2,totalOrders:66}}}}]}};
 let r=readNoonGrowth(data,new Date('2026-10-17T10:00:00Z'));assert.equal(r.rows[0].recommendation.qualityCheck,undefined);data.snapshot.reports[0].dashboard.startDate=period.from;r=readNoonGrowth(data,new Date('2026-10-17T10:00:00Z'));assert.match(r.rows[0].recommendation.qualityCheck!.evidence,/2 \/ 66/);
});
test('recommendation UI escapes evidence and renders uncertainty and quality explicitly',()=>{
 const c=vm.createContext({Intl,escapeHtml:(s:string)=>String(s).replaceAll('<','&lt;').replaceAll('>','&gt;')});vm.runInContext(fs.readFileSync('public/growth.js','utf8'),c);c.row={recommendation:{title:'<script>',action:'inspect',confidence:'MEDIUM',evidence:['<img>'],unknowns:['cause unknown'],qualityCheck:{evidence:'2 / 66',action:'check independently'}}};
 const html=vm.runInContext('grRecommendationCard(row)',c);assert.doesNotMatch(html,/<script>|<img>/);assert.match(html,/&lt;script&gt;/);assert.match(html,/What remains unknown/);assert.match(html,/Separate quality check/);assert.match(html,/cause is unverified/);
});

test('review evidence never paints into another branch or an invalidated login',async()=>{
 for(const replaceTarget of [false,true]){let resolve:any;const target={innerHTML:'Loading'};let current=target;const c=vm.createContext({Intl,URLSearchParams,detailRequest:1,document:{getElementById:()=>current},api:()=>new Promise(r=>resolve=r),escapeHtml:String});vm.runInContext(fs.readFileSync('public/growth.js','utf8'),c);c.row={identity:'TB_AE;618821',period};const pending=vm.runInContext('grReviewEvidence(row)',c);if(replaceTarget)current={innerHTML:'New branch'};else c.detailRequest=2;resolve({state:'SUCCESS',total:1,rows:[],coverage:{complete:true}});await pending;assert.equal(target.innerHTML,'Loading');}
});
test('unavailable review evidence remains unknown instead of a clean quality assessment',async()=>{
 const target={innerHTML:''},c=vm.createContext({Intl,URLSearchParams,detailRequest:1,document:{getElementById:()=>target},api:async()=>{throw Error('timeout')},escapeHtml:String});vm.runInContext(fs.readFileSync('public/growth.js','utf8'),c);c.row={identity:'TB_AE;618821',period};await vm.runInContext('grReviewEvidence(row)',c);assert.match(target.innerHTML,/Quality remains unassessed/);
});
