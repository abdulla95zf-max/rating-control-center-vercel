/** Merge exact matching periods; never add unique-customer or product brand aggregates. */
export function mergeKeetaAccounts(input:{accountKey?:string;payload:any;observedAt:unknown}[]){
 const allowed=['kabab-fareej','frb-shawarma','frb-kabab','taazaa-mumbai','kabab-al-sham'];
 const latest=new Map<string,{accountKey:string;payload:any;observedAt:string}>();
 for(const row of input){
  const accountKey=row.accountKey??'kabab-fareej',p=row.payload,at=new Date(row.observedAt as any).toISOString();
  if(!allowed.includes(accountKey)||!p||!Array.isArray(p.shops)||!Array.isArray(p.items)||!p.customers||!/^\d{4}-\d{2}-\d{2}$/.test(p.periodFrom)||!/^\d{4}-\d{2}-\d{2}$/.test(p.periodTo))throw Error('KEETA_PERFORMANCE_READ_FAILED');
  const old=latest.get(accountKey);
  if(!old||p.periodTo>old.payload.periodTo||p.periodTo===old.payload.periodTo&&at>old.observedAt)latest.set(accountKey,{accountKey,payload:p,observedAt:at});
 }
 const rows=[...latest.values()].sort((a,b)=>b.payload.periodTo.localeCompare(a.payload.periodTo)||b.observedAt.localeCompare(a.observedAt));
 if(!rows.length)return null;
 const first=rows[0]!,same=(p:any)=>['periodFrom','periodTo','comparisonFrom','comparisonTo'].every(k=>p[k]===first.payload[k]);
 const included=rows.filter(r=>same(r.payload)),missing=rows.filter(r=>!same(r.payload)).map(r=>r.accountKey);
 if(rows.length===1)return {...first.payload,itemsByShop:first.payload.itemsByShop??[],observedAt:first.observedAt};
 const seen=new Set<string>(),shops:any[]=[],byShop:any[]=[],itemsByShop:any[]=[],accountReports:any[]=[];
 for(const row of included){
  const p=row.payload,ids=p.shops.map((s:any)=>String(s.shopId)),own=new Set(ids);
  if(!ids.length||ids.some((id:string)=>seen.has(id))||new Set(ids).size!==ids.length)throw Error('KEETA_ACCOUNT_SCOPE_CONFLICT');
  ids.forEach((id:string)=>seen.add(id));
  if((p.customers.byShop??[]).some((s:any)=>!own.has(String(s.shopId)))||(p.itemsByShop??[]).some((s:any)=>!own.has(String(s.shopId))))throw Error('KEETA_ACCOUNT_SCOPE_CONFLICT');
  shops.push(...p.shops.map((s:any)=>({...s,accountKey:row.accountKey})));
  byShop.push(...(p.customers.byShop??[]));itemsByShop.push(...(p.itemsByShop??[]));
  accountReports.push({accountKey:row.accountKey,shopIds:ids,observedAt:row.observedAt,customers:{pay:p.customers.pay??[],frequency:p.customers.frequency??[],conversion:p.customers.conversion??[]},items:p.items,coverage:p.coverage??{}});
 }
 if(shops.length>500)throw Error('KEETA_ACCOUNT_SCOPE_CONFLICT');
 const all=(key:string)=>included.every(r=>r.payload.coverage?.[key]===true),sum=(key:string)=>included.reduce((n,r)=>n+Number(r.payload.coverage?.[key]??0),0);
 const observedAt=included.map(r=>r.observedAt).sort()[0]!;
 return {...first.payload,observedAt,shops,customers:{pay:[],frequency:[],conversion:[],byShop},items:[],itemsByShop,accountReports,
  accountCoverage:{included:included.map(r=>r.accountKey),missing},coverage:{business:all('business'),service:all('service'),opening:sum('opening'),ready:sum('ready'),customers:Math.min(...included.map(r=>Number(r.payload.coverage?.customers??0))),items:all('items'),itemStores:sum('itemStores')}};
}
