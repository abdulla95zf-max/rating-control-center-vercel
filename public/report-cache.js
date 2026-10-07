// Memory only: never persist authorized reports in browser storage.
function createReportCache({ttl=60000,clock=()=>Date.now()}={}){
 const entries=new Map();let epoch=0;
 function peek(key){return entries.get(key)||{value:null,checkedAt:0,pending:null,error:null};}
 function read(key,load,{force=false}={}){
  const existing=peek(key);
  if(existing.pending)return existing.pending;
  if(!force&&existing.value!==null&&clock()-existing.checkedAt<ttl)return Promise.resolve(existing.value);
  const entry={...existing,error:null},generation=epoch;entries.set(key,entry);
  entry.pending=Promise.resolve().then(load).then(value=>{
   if(generation===epoch){entry.value=value;entry.checkedAt=clock();entry.error=null;}
   return value;
  },error=>{if(generation===epoch)entry.error=true;throw error;}).finally(()=>{entry.pending=null;});
  return entry.pending;
 }
 return {peek,read,clear(){epoch++;entries.clear();}};
}
