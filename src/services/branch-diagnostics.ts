import {talabatEvidence,periodEvidence} from './branch-evidence.ts';
/** Matched-period measurements for Branch Lens. No causal inference or source mutation. */
type Period={from:string;to:string;previousFrom:string;previousTo:string};
const n=(v:unknown):number|null=>{if(v===null||v===undefined||String(v).trim()==='')return null;const s=String(v).trim().replace(/%$/,'').replace(/,/g,'');if(!/^\d+(?:\.\d+)?$/.test(s))return null;const x=Number(s);return Number.isFinite(x)?x:null;};
const rate=(a:number|null,b:number|null)=>a!==null&&b!==null&&b>0&&a<=b?a/b*100:null;
const m=(code:string,unit:string,current:unknown,previous:unknown)=>{const value=(v:unknown)=>{const x=n(v);return ['orders','events','customers','records'].includes(unit)&&x!==null&&!Number.isSafeInteger(x)?null:x;};return {code,unit,current:value(current),previous:value(previous)};};
const one=(rows:any[],code:string,key='value')=>{const found=(rows||[]).filter(x=>x?.code===code);return found.length===1?found[0]?.[key]:null;};
export function talabatDiagnostics(history:any[],period:Period){
 const window=(from:string,to:string)=>{
  const rows=history.filter(x=>x.report_date>=from&&x.report_date<=to),complete=rows.length===7&&new Set(rows.map(x=>x.report_date)).size===7&&rows.every(x=>x.present===true);
  const sum=(key:string)=>{if(!complete)return null;const values=rows.map(x=>n(x.metrics?.[key]));return values.every(x=>x!==null)?values.reduce<number>((s,x)=>s+x!,0):null;};
  const weighted=(key:string)=>{if(!complete)return null;let total=0,weight=0;for(const row of rows){const orders=n(row.orders);if(orders===null)return null;if(orders===0)continue;const v=n(row.metrics?.[key]);if(v===null)return null;total+=orders*v;weight+=orders;}return weight?total/weight:null;};
  const orders=sum('Successful Orders'),cancelled=sum('Cancelled Orders'),scheduled=sum('Scheduled Open Time (Minutes)'),offline=sum('Unavailable time duration (Minutes)');
  return {views:sum('Viewed your menu'),cart:sum('Added items to cart'),placed:sum('Placed an order'),prep:weighted('Average preparation time (minutes)'),cancelled,complaints:sum('Total customer complaints received'),offline:rate(offline,scheduled),wait:orders&&sum('Total AWT Duration (Minutes)')!==null?sum('Total AWT Duration (Minutes)')!/orders:null};
 };
 const c=window(period.from,period.to),p=window(period.previousFrom,period.previousTo);
 return {version:1,period,matched:true,evidence:talabatEvidence(history,period),funnel:{kind:'events',stages:[m('menuViews','events',c.views,p.views),m('cart','events',c.cart,p.cart),m('placed','events',c.placed,p.placed)]},operations:[m('prep','minutes',c.prep,p.prep),m('cancelled','orders',c.cancelled,p.cancelled),m('complaints','records',c.complaints,p.complaints),m('offline','percent',c.offline,p.offline),m('wait','minutes/order',c.wait,p.wait)]};
}
export function keetaDiagnostics(shop:any,old:any,customer:any,period:Period){
 const metrics=(s:any)=>{const b=s?.business||{},service=s?.service||{},orders=n(b.shop_valid_order_num),cancel=n(b.shop_cancel_order_num),down=n(one(s?.opening,'shop_avg_closing_duration')),open=n(one(s?.opening,'shop_daily_average_opening_duration')),wrong=n(service.shop_refund_wlmeal_order_num);return {prep:n(service.shop_average_cooking_duration),cancelled:cancel,cancelRate:orders!==null&&cancel!==null?rate(cancel,orders+cancel):null,offline:down!==null&&open!==null?rate(down,down+open):null,missing:wrong,missingRate:rate(wrong,orders)};};
 const c=metrics(shop),p=metrics(old),conversion=customer?.conversion||[];
 const result={version:1,period,matched:true,funnel:{kind:'customers',stages:[['visitors','shop_entry_user_num'],['cart','shop_cartadd_user_num'],['orderingCustomers','shop_pay_user_num']].map(([code,key])=>m(code!,'customers',one(conversion,key!),one(conversion,key!,'popValues')?.[0]))},operations:[m('prep','minutes',c.prep,p.prep),m('cancelled','orders',c.cancelled,p.cancelled),m('cancelRate','percent',c.cancelRate,p.cancelRate),m('offline','percent',c.offline,p.offline),m('missing','orders',c.missing,p.missing),m('missingRate','percent',c.missingRate,p.missingRate)]};
 const customerRows=[...(customer?.pay||[]),...(customer?.frequency||[]),...(customer?.conversion||[])];
 const customers=[['newCustomers','shop_merchant_new_user_num','customers'],['returnCustomers','shop_merchant_regular_user_num','customers'],['orderCustomers','shop_merchant_txn_user_num','customers']].map(([code,key,unit])=>({...m(code!,unit!,one(customerRows,key!),one(customerRows,key!,'popValues')?.[0]),group:'commercial'}));
 const exposure={...m('exposureCustomers','customers',one(conversion,'shop_expose_user_num'),one(conversion,'shop_expose_user_num','popValues')?.[0]),group:'traffic'};
 return {...result,evidence:periodEvidence(period,[...result.funnel.stages.map(x=>({...x,group:'traffic'})),exposure,...result.operations.map(x=>({...x,group:'service'})),...customers])};
}
export function noonDiagnostics(d:any,period:Period){
 const matched=d?.startDate===period.from&&d?.endDate===period.to&&d?.comparisonStartDate===period.previousFrom&&d?.comparisonEndDate===period.previousTo;
 if(!matched)return {version:1,period,matched:false,funnel:{kind:'events',stages:[]},operations:[]};
 const values=(suffix:string)=>{const o=d.operationInsights?.['mainInsights'+suffix],live=d.operationInsights?.['liveOrdersInsights'+suffix],orders=n(d.salesInsights?.['mainInsights'+suffix]?.ordersCount);return {prep:orders?live?.averagePreparationTime:null,wait:orders?o?.avarageDaWaitTime:null,offline:rate(n(o?.offHours),n(o?.totalHours)),cancelled:o?.lostOrders,cancelRate:rate(n(o?.lostOrders),orders),complaints:o?.ordersWithComplaints,complaintRate:rate(n(o?.ordersWithComplaints),orders)};};
 const c=values(''),p=values('Previous'),f=d.customerInsights?.conversionFunnel,previous=d.customerInsights?.conversionFunnelPrevious;
 // Prior funnel is deliberately unknown if the validated payload does not supply it.
 const result={version:1,period,matched:true,funnel:{kind:'events',stages:[m('menuViews','events',f?.menuViewsCount,previous?.menuViewsCount),m('cart','events',f?.addedToCartCount,previous?.addedToCartCount),m('completed','orders',f?.orderCompletedCount,previous?.orderCompletedCount)]},operations:[m('prep','minutes',c.prep,p.prep),m('wait','minutes/order',c.wait,p.wait),m('offline','percent',c.offline,p.offline),m('cancelled','orders',c.cancelled,p.cancelled),m('cancelRate','percent',c.cancelRate,p.cancelRate),m('complaints','orders',c.complaints,p.complaints),m('complaintRate','percent',c.complaintRate,p.complaintRate)]};
 const customerBase=d.customerInsights?.customerBaseInsights,priorBase=d.customerInsights?.customerBaseInsightsPrevious;
 const commercial=[['newOrders','newCustomersOrdersCount','orders'],['returnOrders','returningCustomersOrdersCount','orders'],['newRevenue','newCustomersRevenue','AED'],['returnRevenue','returningCustomersRevenue','AED']].map(([code,key,unit])=>({...m(code!,unit!,customerBase?.[key!],priorBase?.[key!]),group:'commercial'}));
 return {...result,evidence:periodEvidence(period,[...result.funnel.stages.map(x=>({...x,group:'traffic'})),...result.operations.map(x=>({...x,group:'service'})),...commercial])};
}
