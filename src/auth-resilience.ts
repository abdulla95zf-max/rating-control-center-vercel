/** A transient initialization failure must not poison a warm instance forever. */
export function retryableInitializer(initialize:()=>Promise<void>){
 let pending:Promise<void>|undefined;
 return ()=>pending??=(Promise.resolve().then(initialize).catch(error=>{pending=undefined;throw error;}));
}

export function parseSessionCookie(header:unknown,name='rcc_session'):string|null{
 for(const part of String(header??'').split(';')){
  const [key,...value]=part.trim().split('=');if(key!==name)continue;
  try{const token=decodeURIComponent(value.join('='));return /^[A-Za-z0-9_-]{43}$/.test(token)?token:null;}catch{return null;}
 }
 return null;
}
