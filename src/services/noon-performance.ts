import {readNoonSessionHealth} from './noon-session-health.ts';
import {authDatabase,canAccess} from '../auth.ts';
import type {AuthUser} from '../auth.ts';
import {registerBranchSources} from './branch-registry.ts';
import {noonScope} from './noon-ratings.ts';
type Database={query(text:any,values?:any[]):Promise<{rows:any[]}>};
const fields=new Set(["AOV", "addedToCartCount", "avarageDaWaitTime", "avarageDaWaitTimeDirection", "avarageDaWaitTimeGoal", "avarageDaWaitTimeGoalMet", "avarageEstimatedPreparationTime", "avaragePreparationTime", "averageDaWaitTime", "averagePreparationTime", "cartToOrderConversionRate", "categoryName", "charts", "chartsPrevious", "comparisonEndDate", "comparisonStartDate", "complaintIssues", "complaintsChart", "complaintsInsights", "complaintsInsightsPrevious", "conversionFunnel", "customerBaseInsights", "customerBaseInsightsPrevious", "customerInsights", "dateRange", "day", "downtimeChart", "downtimeInsights", "downtimeInsightsPrevious", "endDate", "issue", "itemName", "lapsedCustomersLast30Days", "lapsedCustomersLast60Days", "lapsedCustomersLast90Days", "lastUpdatedAt", "liveOrdersChart", "liveOrdersInsights", "liveOrdersInsightsPrevious", "lostOrders", "lostRevenue", "lostRevenueAfterAcceptance", "lostRevenueBeforeAcceptance", "lostRevenueChart", "lostRevenueInsights", "lostRevenueInsightsPrevious", "lostRevenueReasons", "mainInsights", "mainInsightsPrevious", "mealTimeSplit", "mealTimes", "menuToCartConversionRate", "menuViewsCount", "newCustomersOrdersCount", "newCustomersRevenue", "nextUpdateAt", "numberOfComplaints", "numberOfFiveStarReviews", "numberOfFourStarReviews", "numberOfLostOrders", "numberOfOneStarReviews", "numberOfOrdersCancelledAfterAcceptance", "numberOfOrdersCancelledBeforeAcceptance", "numberOfThreeStarReviews", "numberOfTwoStarReviews", "offHours", "openHours", "operationInsights", "orderCompletedCount", "ordersCount", "ordersMarkedAsReadyForPickup", "ordersWithAvoidableDaWait", "ordersWithComplaints", "ordersWithDaWait5To10Minutes", "ordersWithDaWaitLessThan5Minutes", "ordersWithDaWaitMoreThan10Minutes", "overallRating", "overallRatingPrevious", "percentage", "percentageOfFiveStarReviews", "percentageOfFourStarReviews", "percentageOfLostOrders", "percentageOfLostOrdersDirection", "percentageOfLostOrdersGoal", "percentageOfLostOrdersGoalMet", "percentageOfOffHours", "percentageOfOffHoursDirection", "percentageOfOffHoursGoal", "percentageOfOffHoursGoalMet", "percentageOfOneStarReviews", "percentageOfOrdersCancelledAfterAcceptance", "percentageOfOrdersCancelledAfterAcceptanceDirection", "percentageOfOrdersCancelledAfterAcceptanceGoal", "percentageOfOrdersCancelledAfterAcceptanceGoalMet", "percentageOfOrdersCancelledBeforeAcceptance", "percentageOfOrdersCancelledBeforeAcceptanceDirection", "percentageOfOrdersCancelledBeforeAcceptanceGoal", "percentageOfOrdersCancelledBeforeAcceptanceGoalMet", "percentageOfOrdersMarkedAsReadyForPickup", "percentageOfOrdersMarkedAsReadyForPickupDirection", "percentageOfOrdersMarkedAsReadyForPickupGoal", "percentageOfOrdersMarkedAsReadyForPickupGoalMet", "percentageOfOrdersWithComplaints", "percentageOfOrdersWithComplaintsDirection", "percentageOfOrdersWithComplaintsGoal", "percentageOfOrdersWithComplaintsGoalMet", "percentageOfOrdersWithDaWait5To10Minutes", "percentageOfOrdersWithDaWaitLessThan5Minutes", "percentageOfOrdersWithDaWaitMoreThan10Minutes", "percentageOfThreeStarReviews", "percentageOfTwoStarReviews", "price", "quantity", "ratingsInsights", "returningCustomersOrdersCount", "returningCustomersRevenue", "revenue", "salesInsights", "startDate", "timeOfDay", "topSellingItems", "totalHours", "totalOrders"]);
const itemFields=new Set(['itemName','categoryName','price','quantity','revenue']);
const invalid=()=>{throw Error('PERFORMANCE_SNAPSHOT_INVALID');};
const count=(v:any)=>Number.isSafeInteger(v)&&v>=0;
const num=(v:any)=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
function safe(value:any,allowed:Set<string>,depth=0):any{
 if(depth>12)invalid();if(value===null||typeof value==='boolean')return value;
 if(typeof value==='number'){if(!Number.isFinite(value))invalid();return value;}
 if(typeof value==='string'){if(value.length>2048||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value))invalid();return value;}
 if(Array.isArray(value)){if(value.length>10000)invalid();return value.map(x=>safe(x,allowed,depth+1));}
 if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).filter(([k])=>allowed.has(k)).map(([k,v])=>[k,safe(v,allowed,depth+1)]));
 invalid();
}
export function validateNoonPerformance(value:any){
 if(value?.version!==1||typeof value.observedAt!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.observedAt)||!Number.isFinite(Date.parse(value.observedAt))||!Array.isArray(value.reports)||value.reports.length!==24)invalid();
 const p=value.period;
 for(const k of ['startDate','endDate'])if(typeof p?.[k]!=='string'||!/^\d{4}-\d\d-\d\d$/.test(p[k])||!Number.isFinite(Date.parse(p[k]))||new Date(p[k]).toISOString().slice(0,10)!==p[k])invalid();
 const days=(Date.parse(p.endDate)-Date.parse(p.startDate))/86400000+1;if(days<1||days>90)invalid();
 const seen=new Set<string>(),brands=new Map(Object.values(noonScope).map(s=>[s.restaurantId,s.brand]));
 const reports=value.reports.map((r:any)=>{
  const store=r.scope==='STORE',e=store?noonScope[r.outletCode]:null,brand=brands.get(r.restaurantId),key=r.restaurantId+';'+(store?r.outletCode:'BRAND');
  if(!brand||r.brand!==brand||!['STORE','BRAND'].includes(r.scope)||seen.has(key)||(store?!e||e.restaurantId!==r.restaurantId: r.outletCode!==null))invalid();seen.add(key);
  const d=safe(r.dashboard,fields),s=d?.salesInsights,c=d?.customerInsights,o=d?.operationInsights;
  if(d?.startDate!==p.startDate||d?.endDate!==p.endDate||!s||!c||!o||!count(s.mainInsights?.ordersCount)||!num(s.mainInsights?.revenue)||!count(c.customerBaseInsights?.newCustomersOrdersCount)||!count(c.customerBaseInsights?.returningCustomersOrdersCount)||!count(o.mainInsights?.totalOrders))invalid();
  const comparison={startDate:d.comparisonStartDate,endDate:d.comparisonEndDate};for(const k of ['startDate','endDate'] as const)if(typeof comparison[k]!=='string'||!/^\d{4}-\d\d-\d\d$/.test(comparison[k])||new Date(comparison[k]).toISOString().slice(0,10)!==comparison[k])invalid();if(comparison.startDate>comparison.endDate||comparison.endDate>=p.startDate||(Date.parse(comparison.endDate)-Date.parse(comparison.startDate))/86400000>=90)invalid();
  if(!Array.isArray(r.items)||r.items.length>10000)invalid();
  // Lapsed customer branch attribution was not verified; do not expose it in branch-scoped API results.
  if(store)for(const key of ['customerBaseInsights','customerBaseInsightsPrevious'])for(const name of Object.keys(c[key]??{}))if(name.startsWith('lapsedCustomers'))delete c[key][name];
  const items=r.items.map((x:any)=>{if(!x||!['itemName','categoryName','price'].every(k=>typeof x[k]==='string')||!x.itemName.trim()||!count(x.quantity)||!num(x.revenue))invalid();return safe(x,itemFields);});
  return {brand,restaurantId:r.restaurantId,scope:r.scope,outletCode:store?r.outletCode:null,storeName:store?`${brand} — ${e!.location}`:brand,dashboard:d,items};
 });
 for(const [id] of brands){if(!seen.has(id+';BRAND'))invalid();for(const [code,e] of Object.entries(noonScope))if(e.restaurantId===id&&!seen.has(id+';'+code))invalid();}
 const comparisons=new Set(reports.map((r:any)=>r.dashboard.comparisonStartDate+';'+r.dashboard.comparisonEndDate));if(comparisons.size!==1)invalid();
 return {version:1,observedAt:value.observedAt,period:{startDate:p.startDate,endDate:p.endDate,comparisonStartDate:reports[0].dashboard.comparisonStartDate,comparisonEndDate:reports[0].dashboard.comparisonEndDate},reports};
}
export async function readNoonPerformance(db:Database=authDatabase(),period?:{startDate:string;endDate:string}):Promise<any>{
 try{
  const result=await db.query({text:period?'SELECT payload FROM noon_performance_snapshots WHERE period_from=$1 AND period_to=$2 ORDER BY observed_at DESC,created_at DESC,id DESC LIMIT 1':'SELECT payload FROM noon_performance_snapshots WHERE period_to-period_from=6 ORDER BY period_to DESC,observed_at DESC,created_at DESC,id DESC LIMIT 1',values:period?[period.startDate,period.endDate]:[],query_timeout:5000});
  const sessionHealth=await readNoonSessionHealth(db);
  if(!result.rows.length)return {state:'EMPTY',snapshot:null,errorCode:null,sessionHealth};
  return {state:'SUCCESS',snapshot:validateNoonPerformance(result.rows[0].payload),errorCode:null,sessionHealth};
 }catch(error:any){if(error?.code==='42P01')return {state:'EMPTY',snapshot:null,errorCode:null};return {state:'ERROR',snapshot:null,errorCode:'PERFORMANCE_READ_FAILED'};}
}
export function restrictNoonPerformance(data:any,allowed:Set<string>){
 if(data.state!=='SUCCESS'||!data.snapshot)return data;
 const all=data.snapshot.reports,stores=all.filter((r:any)=>r.scope==='STORE'&&allowed.has(r.outletCode));
 const brands=all.filter((r:any)=>r.scope==='BRAND'&&Object.entries(noonScope).filter(([,e])=>e.restaurantId===r.restaurantId).every(([code])=>allowed.has(code)));
 return {...data,snapshot:{...data.snapshot,reports:[...brands,...stores],storeCount:stores.length}};
}
export async function scopeNoonPerformance(data:any,user:AuthUser,register=registerBranchSources){
 if(data.state!=='SUCCESS'||!data.snapshot)return data;
 const stores=data.snapshot.reports.filter((r:any)=>r.scope==='STORE');
 if((user.role==='admin'||user.role==='portfolio_manager')&&!process.env.DATABASE_URL)return restrictNoonPerformance(data,new Set(stores.map((r:any)=>r.outletCode)));
 // Reuse Noon ratings identities so manual disable and branch roles match the ratings page.
 const registry=await register(stores.map((r:any)=>({sourceType:'rating:noon',sourceId:`NOON;${r.restaurantId};${r.outletCode}`,storeName:r.storeName})));
 const allowed=stores.filter((r:any)=>{const b=registry.get(`rating:noon\0NOON;${r.restaurantId};${r.outletCode}`);return b?.active&&(user.role==='admin'||user.role==='portfolio_manager'||canAccess(user,b.brand,b.id)||canAccess(user,b.brand,b.canonicalKey));});
 return restrictNoonPerformance(data,new Set(allowed.map((r:any)=>r.outletCode)));
}
