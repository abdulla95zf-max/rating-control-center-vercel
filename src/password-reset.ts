import type {Pool} from 'pg';

/** Recheck privileges and revoke sessions atomically; the request's user may be stale. */
export async function resetDashboardPassword(db:Pick<Pool,'connect'>,actorId:string,id:string,passwordHash:string){
 if(!id||id.length>200)throw Error('INVALID_USER');
 const client=await db.connect();let discard=false;
 try{
  await client.query('BEGIN');
  await client.query('LOCK TABLE dashboard_users IN SHARE ROW EXCLUSIVE MODE');
  const actor=(await client.query('SELECT id,role,active,is_owner FROM dashboard_users WHERE id=$1',[actorId])).rows[0];
  if(!actor?.active||actor.role!=='admin')throw Error('ADMIN_REQUIRED');
  const target=(await client.query('SELECT id,is_owner FROM dashboard_users WHERE id=$1',[id])).rows[0];
  if(!target)throw Error('USER_NOT_FOUND');
  if(target.is_owner&&!actor.is_owner)throw Error('OWNER_REQUIRED');
  await client.query('UPDATE dashboard_users SET password_hash=$2,must_change_password=false,session_version=session_version+1,failed_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1',[id,passwordHash]);
  await client.query('DELETE FROM dashboard_sessions WHERE user_id=$1',[id]);
  await client.query('INSERT INTO dashboard_audit_log(actor_user_id,event,target_user_id,detail) VALUES($1,$2,$3,$4)',[actorId,'password_reset',id,'{}']);
  await client.query('COMMIT');
 }catch(error){try{await client.query('ROLLBACK');}catch{discard=true;}throw error;}
 finally{client.release(discard);}
}
