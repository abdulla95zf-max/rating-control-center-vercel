import {randomUUID} from 'node:crypto';
import {authDatabase} from '../auth.ts';
import {branchIdentity} from './branch-identity.ts';

export type BranchSource={sourceType:string;sourceId:string;storeName:string};
export type RegistryBranch={id:string;canonicalKey:string;brand:string;branch:string;displayName:string;active:boolean};
const signature=(source:Pick<BranchSource,'sourceType'|'sourceId'>)=>`${source.sourceType}\0${source.sourceId}`;

export async function registerBranchSources(sources:BranchSource[]){
 const unique=[...new Map(sources.filter(source=>source.sourceType&&source.sourceId).map(source=>[signature(source),source])).values()],out=new Map<string,RegistryBranch>();
 if(!unique.length)return out;const db=authDatabase(),types=unique.map(x=>x.sourceType),ids=unique.map(x=>x.sourceId);
 const existing=await db.query(`SELECT s.source_type,s.source_id,b.id,b.canonical_key,b.brand,b.branch_name,b.display_name,b.active FROM dashboard_branch_sources s JOIN dashboard_branches b ON b.id=s.branch_id JOIN unnest($1::text[],$2::text[]) q(source_type,source_id) ON q.source_type=s.source_type AND q.source_id=s.source_id`,[types,ids]);
 for(const row of existing.rows)out.set(`${row.source_type}\0${row.source_id}`,{id:row.id,canonicalKey:row.canonical_key,brand:row.brand,branch:row.branch_name,displayName:row.display_name,active:Boolean(row.active)});
 const missing=unique.filter(source=>!out.has(signature(source)));if(!missing.length)return out;
 const candidates=[...new Map(missing.map(source=>{const identity=branchIdentity(source.storeName);return [identity.key,{id:randomUUID(),...identity,displayName:`${identity.brand} — ${identity.branch}`}];})).values()];
 await db.query(`INSERT INTO dashboard_branches(id,canonical_key,brand,branch_name,display_name) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[],$5::text[]) ON CONFLICT(canonical_key) DO NOTHING`,[candidates.map(x=>x.id),candidates.map(x=>x.key),candidates.map(x=>x.brand),candidates.map(x=>x.branch),candidates.map(x=>x.displayName)]);
 const branchRows=await db.query('SELECT id,canonical_key,brand,branch_name,display_name,active FROM dashboard_branches WHERE canonical_key=ANY($1::text[])',[candidates.map(x=>x.key)]),byKey=new Map(branchRows.rows.map(row=>[row.canonical_key,row]));
 const branchIds=missing.map(source=>byKey.get(branchIdentity(source.storeName).key).id);
 await db.query(`INSERT INTO dashboard_branch_sources(source_type,source_id,branch_id,source_name) SELECT * FROM unnest($1::text[],$2::text[],$3::text[],$4::text[]) ON CONFLICT(source_type,source_id) DO UPDATE SET source_name=excluded.source_name,last_seen_at=now()`,[missing.map(x=>x.sourceType),missing.map(x=>x.sourceId),branchIds,missing.map(x=>x.storeName)]);
 missing.forEach((source,index)=>{const row=byKey.get(branchIdentity(source.storeName).key);out.set(signature(source),{id:row.id,canonicalKey:row.canonical_key,brand:row.brand,branch:row.branch_name,displayName:row.display_name,active:Boolean(row.active)});});return out;
}
