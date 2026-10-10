type Database={query(text:any,values?:any[]):Promise<{rows:any[]}>};
export async function readNoonSessionHealth(db:Database):Promise<'EXPIRED'|'OK'|'UNKNOWN'>{
 try {
  const result=await db.query({text:'SELECT expired FROM noon_session_health WHERE id=1',query_timeout:5000});
  return result.rows[0]?.expired===true?'EXPIRED':result.rows[0]?.expired===false?'OK':'UNKNOWN';
 }catch{return 'UNKNOWN';}
}
