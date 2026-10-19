/** One atomic update: parallel failures cannot overwrite each other's counters. */
export async function recordFailedLogin(db:{query:(sql:string,values:any[])=>Promise<unknown>},id:string){
 await db.query(`UPDATE dashboard_users SET
  failed_attempts=CASE WHEN locked_until IS NOT NULL THEN 1 ELSE failed_attempts+1 END,
  locked_until=CASE WHEN locked_until IS NOT NULL THEN NULL
   WHEN failed_attempts+1>=5 THEN now()+interval '15 minutes' ELSE NULL END
  WHERE id=$1 AND active=true AND (locked_until IS NULL OR locked_until<=now())`,[id]);
}
