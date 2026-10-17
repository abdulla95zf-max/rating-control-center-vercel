/** Read-only next checks. Measured changes locate a stage, not a proven cause. */
type Period={from:string;to:string;previousFrom:string;previousTo:string};
type Row={identity:string;eligible:boolean;reason:string|null;period:Period;current:{sales:number|null;orders:number|null};previous:{sales:number|null;orders:number|null};delta:number|null;aov:number|null;previousAov:number|null;orderEffect:number|null;basketEffect:number|null};
type Metric={code:string;value:unknown;popValues?:unknown[]};
export type RecommendationContext={identity:string;period:Period;conversion?:Metric[];cancelled?:unknown;downtime?:unknown;customerOrders?:{currentOrders:unknown;previousOrders:unknown;currentSales:unknown;previousSales:unknown};complaints?:{orders:unknown;total:unknown}};
export type GrowthRecommendation={version:1;code:string;title:string;action:string;confidence:'MEDIUM'|'LOW'|'INSUFFICIENT';evidence:string[];unknowns:string[];qualityCheck?:{evidence:string;action:string}};
const number=(v:unknown):number|null=>{if(typeof v==='number')return Number.isFinite(v)&&v>=0?v:null;if(typeof v!=='string'||!v.trim())return null;const s=v.trim().replace(/%$/,'');if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(s))return null;const n=Number(s.replace(/,/g,''));return Number.isFinite(n)?n:null;};
const count=(v:unknown)=>{const n=number(v);return n!==null&&Number.isSafeInteger(n)?n:null;};
const fmt=(v:number|null)=>v===null?'unknown':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
const change=(label:string,previous:number|null,current:number|null,unit='')=>`${label}: ${fmt(previous)} → ${fmt(current)}${unit}`;
export function growthRecommendation(row:Row,input?:RecommendationContext):GrowthRecommendation{
 const context=input?.identity===row.identity&&(['from','to','previousFrom','previousTo'] as const).every(k=>input.period[k]===row.period[k])?input:undefined;
 const evidence=[change('Sales',row.previous.sales,row.current.sales,' AED'),change('Orders',row.previous.orders,row.current.orders),change('Average basket',row.previousAov,row.aov,' AED')];
 const unknowns=['Changes in promotions, prices, delivery fees and delivery estimates have not been verified.','This comparison does not establish what caused the change.'];
 const result=(code:string,title:string,action:string,confidence:GrowthRecommendation['confidence']='MEDIUM'):GrowthRecommendation=>({version:1,code,title,action,confidence,evidence:[...evidence],unknowns:[...unknowns]});
 if(!row.eligible)return {version:1,code:'DATA_CHECK',title:'Verify comparison coverage',action:'Resolve the reported data gap before choosing a sales intervention.',confidence:'INSUFFICIENT',evidence:[`Comparison excluded: ${row.reason??'unknown coverage'}`],unknowns:['A complete, valid comparison is unavailable.']};
 let qualityCheck:GrowthRecommendation['qualityCheck'];
 const complaintOrders=count(context?.complaints?.orders),complaintTotal=count(context?.complaints?.total);
 if(complaintOrders!==null&&complaintOrders>0&&complaintTotal!==null&&complaintTotal===row.current.orders&&complaintOrders<=complaintTotal)qualityCheck={evidence:`Orders with complaints: ${complaintOrders} / ${complaintTotal} in this period.`,action:'Inspect the affected orders and items separately. Complaint counts alone do not establish a cause of the sales change.'};
 const finish=(r:GrowthRecommendation)=>({...r,...(qualityCheck?{qualityCheck}:{})});
 if(row.delta===null||!Number.isFinite(row.delta))return finish(result('DATA_CHECK','Verify comparison coverage','A valid sales change is required before recommending an intervention.','INSUFFICIENT'));
 if(row.current.orders===0&&row.previous.orders!==null&&row.previous.orders>0)return finish(result('ZERO_ORDERS','Check availability and missing demand','Verify actual trading hours, store visibility and the absence of orders for this period. Basket analysis is unavailable with zero orders.','LOW'));
 if(row.current.orders===null||row.previous.orders===null||Math.min(row.current.orders,row.previous.orders)<20)return finish(result('SMALL_SAMPLE','Verify the change before intervening','Inspect individual orders and unusual large baskets before making broad pricing or marketing changes.','LOW'));
 if(row.delta>=0)return finish(result('STABLE_OR_GROWING','Review what sustained performance','Check which items and service conditions supported these results before repeating a promotion. Continue to review any quality issues separately.'));
 if(row.previous.sales!==null&&row.previous.sales>0&&-row.delta/row.previous.sales<0.05)return finish(result('SMALL_CHANGE','Monitor a small sales change','The sales decline is below the 5% screening threshold. Check whether it repeats before selecting a broad intervention.','LOW'));
 const metric=(code:string)=>{const rows=Array.isArray(context?.conversion)?context.conversion.filter(m=>m?.code===code):[];if(rows.length!==1)return null;const first=rows[0]!;const current=number(first.value),previous=number(first.popValues?.[0]);return current===null||previous===null?null:{current,previous};};
 const exposure=metric('shop_expose_user_num'),entries=metric('shop_entry_user_num'),entryRate=metric('shop_expose_entry_cvr'),cartRate=metric('shop_entry_cartadd_cvr'),checkoutRate=metric('shop_cartadd_submit_cvr'),paymentRate=metric('shop_submit_pay_cvr');
 // Rounded source rates and small numerators must not create confident diagnoses.
 const rate=(m:ReturnType<typeof metric>)=>m!==null&&m.current<=100&&m.previous<=100;
 if(row.current.orders<row.previous.orders&&entries&&entries.previous>=20&&entries.current<entries.previous&&rate(entryRate)&&rate(cartRate)&&cartRate!.current>=cartRate!.previous){
  evidence.push(change('Store entries',entries.previous,entries.current),change('Exposure → entry',entryRate!.previous,entryRate!.current,'%'),change('Entry → cart',cartRate!.previous,cartRate!.current,'%'));
  if(exposure)evidence.push(change('Source exposure count',exposure.previous,exposure.current));
  if(number(context?.downtime)===0)evidence.push('Reported daily downtime: 0 hours.');
  if(count(context?.cancelled)===0)evidence.push('Reported cancelled orders: 0.');
  return finish(result('DISCOVERY','Check store discovery and entry','Compare the store card, active offer, delivery fee and estimated delivery time with the previous period. Investigate lost visibility and entry before selecting a marketing change.'));
 }
 if(row.current.orders<row.previous.orders&&entries&&entries.previous>=20&&entries.current>=entries.previous&&rate(cartRate)&&cartRate!.current<cartRate!.previous){
  evidence.push(change('Store entries',entries.previous,entries.current),change('Entry → cart',cartRate!.previous,cartRate!.current,'%'));
  return finish(result('MENU_CONVERSION','Check menu-to-cart conversion','Inspect item availability, menu presentation and price or promotion changes for this period. Identify the affected items before changing the whole menu.'));
 }
 if(row.current.orders<row.previous.orders&&entries&&entries.current>=entries.previous&&rate(cartRate)&&cartRate!.current>=cartRate!.previous&&rate(checkoutRate)&&rate(paymentRate)&&(checkoutRate!.current<checkoutRate!.previous||paymentRate!.current<paymentRate!.previous)){
  evidence.push(change('Cart → checkout',checkoutRate!.previous,checkoutRate!.current,'%'),change('Checkout → payment',paymentRate!.previous,paymentRate!.current,'%'));
  return finish(result('CHECKOUT','Check checkout progression','Inspect fees, delivery estimates and checkout availability for the affected period. A lower source rate does not prove a payment-system fault.'));
 }
 if(row.orderEffect!==null&&row.basketEffect!==null&&row.basketEffect<0&&Math.min(row.basketEffect,0)<Math.min(row.orderEffect,0)){
  evidence.push(`Larger negative mathematical component: basket (${fmt(row.basketEffect)} AED).`);
  const customer=context?.customerOrders;
  if(customer){const co=count(customer.currentOrders),po=count(customer.previousOrders),cs=number(customer.currentSales),ps=number(customer.previousSales);if(co!==null&&po!==null&&co>0&&po>0&&cs!==null&&ps!==null&&co<=row.current.orders&&po<=row.previous.orders&&cs<=(row.current.sales??0)&&ps<=(row.previous.sales??0))evidence.push(change('New-customer orders',po,co),change('Average basket of new-customer orders',ps/po,cs/co,' AED'));}
  unknowns.push('Previous item mix, discounts and unusually large individual orders have not been reconciled.');
  return finish(result('BASKET','Compare basket size and large orders','Compare item mix, discounts and high-value orders between the two periods. Check whether the previous week had unusually large baskets before choosing a bundle or pricing change.'));
 }
 if(row.orderEffect!==null&&row.orderEffect<0)evidence.push(`Negative mathematical order-count component: ${fmt(row.orderEffect)} AED.`);
 unknowns.push('Comparable branch-level funnel evidence is unavailable or does not isolate one stage.');
 return finish(result('DEMAND_CHECK','Locate the lost demand','Compare visibility, store visits, conversion and actual availability for these dates. Establish the affected stage before choosing a growth intervention.'));
}
