import {createHash} from 'node:crypto';

/** Process-local, bounded source-report reuse. Never cache authentication or scoped users. */
export function createReportReadCache({clock=Date.now,maxBytes=12_000_000,maxEntries=32}={}){
 const values=new Map<string,{value:any;until:number;bytes:number}>(),pending=new Map<string,Promise<any>>();let bytes=0;
 const remove=(key:string)=>{const old=values.get(key);if(old)bytes-=old.bytes;values.delete(key);};
 async function read<T>(key:string,load:()=>Promise<T>,ttl=60_000):Promise<T>{
  for(const [k,v] of values)if(v.until<=clock())remove(k);
  const saved=values.get(key);if(saved)return structuredClone(saved.value);
  let task=pending.get(key);
  if(!task){
   task=Promise.resolve().then(load).then(value=>{
    const x=value as any,good=x?.state!=='ERROR'&&x?.ok!==false&&!(x?.platforms||[]).some((p:any)=>p.state==='ERROR');
    const size=Buffer.byteLength(JSON.stringify(value)??'');
    if(good&&ttl>0&&size<=maxBytes){while(values.size>=maxEntries||bytes+size>maxBytes){const oldest=values.keys().next().value;if(oldest===undefined)break;remove(oldest);}values.set(key,{value:structuredClone(value),until:clock()+ttl,bytes:size});bytes+=size;}
    return value;
   }).finally(()=>{if(pending.get(key)===task)pending.delete(key);});
   // Bound key cardinality even while slow source reads are pending.
   if(pending.size<maxEntries)pending.set(key,task);
  }
  return structuredClone(await task);
 }
 return {read};
}
const owners=new WeakMap<object,ReturnType<typeof createReportReadCache>>();
export const reportKey=(...parts:unknown[])=>createHash('sha256').update(JSON.stringify(parts)).digest('hex');
export function reportRead<T>(owner:object,key:string,load:()=>Promise<T>,ttl=60_000):Promise<T>{let cache=owners.get(owner);if(!cache){cache=createReportReadCache();owners.set(owner,cache);}return cache.read(key,load,ttl);}
