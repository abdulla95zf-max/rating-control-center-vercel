/** Filter every branch dataset together; unique brand customers cannot be summed
 * or reconstructed from a subset of stores. */
export function scopeKeetaSnapshot(snapshot:any,allowedIds:ReadonlySet<string>){
 const shops=snapshot.shops.filter((shop:any)=>allowedIds.has(String(shop.shopId)));
 const effectiveIds=new Set(shops.map((shop:any)=>String(shop.shopId)));
 const brandScopeAvailable=shops.length===snapshot.shops.length&&shops.length>0;
 const byShop=(snapshot.customers?.byShop??[]).filter((shop:any)=>effectiveIds.has(String(shop.shopId)));
 const customers=brandScopeAvailable?{...snapshot.customers,byShop}:{pay:[],frequency:[],conversion:[],byShop};
 const itemsByShop=(snapshot.itemsByShop??[]).filter((shop:any)=>effectiveIds.has(String(shop.shopId)));
 return {...snapshot,shops,customers,items:brandScopeAvailable?snapshot.items:[],itemsByShop,brandScopeAvailable};
}
