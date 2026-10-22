/** Filter every branch dataset together; unique brand customers cannot be summed
 * or reconstructed from a subset of stores. */
export function scopeKeetaSnapshot(snapshot:any,allowedIds:ReadonlySet<string>){
 const shops=snapshot.shops.filter((shop:any)=>allowedIds.has(String(shop.shopId)));
 const effectiveIds=new Set(shops.map((shop:any)=>String(shop.shopId)));
 const completeSnapshot=shops.length===snapshot.shops.length&&shops.length>0;
 const accountReports=(snapshot.accountReports??[]).filter((a:any)=>Array.isArray(a.shopIds)&&a.shopIds.length&&a.shopIds.every((id:string)=>effectiveIds.has(String(id))));
 const oneAccount=accountReports.length===1&&accountReports[0].shopIds.length===shops.length?accountReports[0]:null;
 const brandScopeAvailable=Boolean(oneAccount)||completeSnapshot&&!snapshot.accountReports;
 const byShop=(snapshot.customers?.byShop??[]).filter((shop:any)=>effectiveIds.has(String(shop.shopId)));
 const customers=oneAccount?{...oneAccount.customers,byShop}:brandScopeAvailable?{...snapshot.customers,byShop}:{pay:[],frequency:[],conversion:[],byShop};
 const itemsByShop=(snapshot.itemsByShop??[]).filter((shop:any)=>effectiveIds.has(String(shop.shopId)));
 const result={...snapshot,shops,customers,items:oneAccount?oneAccount.items:brandScopeAvailable?snapshot.items:[],itemsByShop,brandScopeAvailable};
 if(snapshot.accountReports){result.accountReports=accountReports;result.accountCoverage={included:accountReports.map((a:any)=>a.accountKey),missing:[]};}
 return result;
}
