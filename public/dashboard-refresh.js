// Preference only; never store reports, credentials or authorization in browser storage.
(()=>{
 const key='rcc-refresh-mode-v1',interval=15*60*1000;
 function create({read,allowed=()=>true,visible=()=>true,changed=()=>{},storage,timers=globalThis}){
  let mode='manual',timer=null,active=false,pending=null,generation=0;
  try{if(storage===undefined)storage=globalThis.localStorage;if(storage?.getItem(key)==='15m')mode='15m';}catch{}
  const notify=()=>changed({mode,busy:!!pending,active});
  const clear=()=>{if(timer!==null)timers.clearInterval(timer);timer=null;};
  async function refresh(){
   if(!active||!allowed())return;if(pending)return pending;
   const epoch=generation;
   const task=Promise.resolve().then(()=>{if(epoch===generation&&active&&allowed())return read();});pending=task;notify();
   try{return await task;}finally{if(pending===task)pending=null;if(epoch===generation&&active&&allowed())notify();}
  }
  function schedule(){clear();if(active&&mode==='15m')timer=timers.setInterval(()=>{if(visible()&&allowed())refresh().catch(()=>{});},interval);}
  return {get mode(){return mode;},start(){active=true;schedule();notify();},stop(){active=false;generation++;pending=null;clear();notify();},setMode(value){mode=value==='15m'?'15m':'manual';try{storage?.setItem(key,mode);}catch{}schedule();notify();},refresh};
 }
 globalThis.RCCRefresh={create,interval};
})();
