import {authDatabase,canAccess} from '../auth.ts';import type {AuthUser} from '../auth.ts';
import {registerBranchSources} from './branch-registry.ts';import {deliverooScope} from './deliveroo-scope.ts';import {validateOperations} from './deliveroo-operations-model.ts';
type Database={query(text:any,values?:any[]):Promise<{rows:any[]}>};
export async function readDeliverooOperations(days:number,db:Database=authDatabase()):Promise<any>{
 if(![7,30].includes(days))throw Error('OPERATIONS_PERIOD_INVALID');
 try{
  const result=await db.query({text:'SELECT payload FROM deliveroo_operations_snapshots WHERE days=$1 ORDER BY period_to DESC,observed_at DESC,created_at DESC,id DESC LIMIT 1',values:[days],query_timeout:5000});
  if(!result.rows.length)return {state:'EMPTY',snapshot:null,errorCode:null};
  const snapshot=validateOperations(result.rows[0].payload);if(snapshot.days!==days)throw Error('OPERATIONS_INVALID');
  snapshot.rows=snapshot.rows.map((r:any)=>{const b=deliverooScope.find(b=>b.id===r.storeId)!;return {...r,brand:b.brand,location:b.location,storeName:`${b.brand} — ${b.location}`};});
  return {state:'SUCCESS',snapshot,errorCode:null};
 }catch(e:any){if(e?.code==='42P01')return {state:'EMPTY',snapshot:null,errorCode:null};return {state:'ERROR',snapshot:null,errorCode:'OPERATIONS_READ_FAILED'};}
}
export function restrictDeliverooOperations(data:any,allowed:Set<string>){if(data.state!=='SUCCESS'||!data.snapshot)return data;const rows=data.snapshot.rows.filter((r:any)=>allowed.has(r.storeId));return {...data,snapshot:{...data.snapshot,rows,storeCount:rows.length}};}
export async function scopeDeliverooOperations(data:any,user:AuthUser,register=registerBranchSources){
 if(data.state!=='SUCCESS'||!data.snapshot)return data;
 const rows=data.snapshot.rows;
 if((user.role==='admin'||user.role==='portfolio_manager')&&!process.env.DATABASE_URL)return restrictDeliverooOperations(data,new Set(rows.map((r:any)=>r.storeId)));
 const registry=await register(rows.map((r:any)=>({sourceType:'rating:deliveroo',sourceId:`DELIVEROO;${r.orgId};${r.storeId}`,storeName:r.storeName})));
 const allowed=rows.filter((r:any)=>{const b=registry.get(`rating:deliveroo\0DELIVEROO;${r.orgId};${r.storeId}`);return b?.active&&(user.role==='admin'||user.role==='portfolio_manager'||canAccess(user,b.brand,b.id)||canAccess(user,b.brand,b.canonicalKey));});
 return restrictDeliverooOperations(data,new Set(allowed.map((r:any)=>r.storeId)));
}
