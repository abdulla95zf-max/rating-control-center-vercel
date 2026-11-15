import {randomUUID} from 'node:crypto';
import type {QueryConfig} from 'pg';
import {authDatabase} from '../auth.ts';
import {branchIdentity} from './branch-identity.ts';

export type BranchSource={sourceType:string;sourceId:string;storeName:string};
export type RegistryBranch={id:string;canonicalKey:string;brand:string;branch:string;displayName:string;active:boolean};
export type CatalogBranch=RegistryBranch&{sourceType:string|null;sourceId:string|null};
const signature=(source:Pick<BranchSource,'sourceType'|'sourceId'>)=>`${source.sourceType}\0${source.sourceId}`;

/** Saved active roster, including branches which have no rating source yet. */
export async function readIntegrationBranchCatalog(brands:readonly string[]):Promise<CatalogBranch[]>{
 const query:QueryConfig&{query_timeout:number}={text:`SELECT b.id,b.canonical_key,b.brand,b.branch_name,b.display_name,b.active,s.source_type,s.source_id FROM dashboard_branches b LEFT JOIN dashboard_branch_sources s ON s.branch_id=b.id AND s.source_type=ANY($2::text[]) WHERE b.active=true AND b.brand=ANY($1::text[]) ORDER BY b.id,s.source_type,s.source_id LIMIT 10001`,values:[brands,['rating:talabat','rating:keeta','rating:noon','rating:deliveroo']],query_timeout:5000};
 const result=await authDatabase().query(query);
 return result.rows.map(row=>({id:row.id,canonicalKey:row.canonical_key,brand:row.brand,branch:row.branch_name,displayName:row.display_name,active:row.active===true,sourceType:row.source_type,sourceId:row.source_id}));
}

/** Read existing identities only; external read integrations must not register new branches. */
export async function readRegisteredBranchSources(sources:BranchSource[],timeoutMs?:number){
 const out=new Map<string,RegistryBranch>();if(!sources.length)return out;
 const text=`SELECT s.source_type,s.source_id,b.id,b.canonical_key,b.brand,b.branch_name,b.display_name,b.active FROM dashboard_branch_sources s JOIN dashboard_branches b ON b.id=s.branch_id JOIN unnest($1::text[],$2::text[]) q(source_type,source_id) ON q.source_type=s.source_type AND q.source_id=s.source_id`;
 const values=[sources.map(x=>x.sourceType),sources.map(x=>x.sourceId)];
 const query:QueryConfig&{query_timeout:number}={text,values,query_timeout:timeoutMs??5000};
 const rows=timeoutMs===undefined?await authDatabase().query(text,values):await authDatabase().query(query);
 for(const row of rows.rows)out.set(`${row.source_type}\0${row.source_id}`,{id:row.id,canonicalKey:row.canonical_key,brand:row.brand,branch:row.branch_name,displayName:row.display_name,active:Boolean(row.active)});
 return out;
}

export async function registerBranchSources(sources:BranchSource[]){
 const unique=[...new Map(sources.filter(source=>source.sourceType&&source.sourceId).map(source=>[signature(source),source])).values()],out=new Map<string,RegistryBranch>();
 if(!unique.length)return out;const db=authDatabase();
 const existing=await readRegisteredBranchSources(unique);
 for(const [key,row] of existing)out.set(key,row);
 const missing=unique.filter(source=>!out.has(signature(source)));if(!missing.length)return out;
 const candidates=[...new Map(missing.map(source=>{const identity=branchIdentity(source.storeName);return [identity.key,{id:randomUUID(),...identity,displayName:`${identity.brand} — ${identity.branch}`}];})).values()];
 await db.query(`INSERT INTO dashboard_branches(id,canonical_key,brand,branch_name,display_name) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[]) ON CONFLICT(canonical_key) DO NOTHING`,[candidates.map(x=>x.id),candidates.map(x=>x.key),candidates.map(x=>x.brand),candidates.map(x=>x.branch),candidates.map(x=>x.displayName)]);
 const branchRows=await db.query('SELECT id,canonical_key,brand,branch_name,display_name,active FROM dashboard_branches WHERE canonical_key=ANY($1::text[])',[candidates.map(x=>x.key)]),byKey=new Map(branchRows.rows.map(row=>[row.canonical_key,row]));
 const branchIds=missing.map(source=>byKey.get(branchIdentity(source.storeName).key).id);
 await db.query(`INSERT INTO dashboard_branch_sources(source_type,source_id,branch_id,source_name) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[]) ON CONFLICT(source_type,source_id) DO UPDATE SET source_name=excluded.source_name,last_seen_at=now()`,[missing.map(x=>x.sourceType),missing.map(x=>x.sourceId),branchIds,missing.map(x=>x.storeName)]);
 missing.forEach((source,index)=>{const row=byKey.get(branchIdentity(source.storeName).key);out.set(signature(source),{id:row.id,canonicalKey:row.canonical_key,brand:row.brand,branch:row.branch_name,displayName:row.display_name,active:Boolean(row.active)});});return out;
}
