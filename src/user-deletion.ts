import type {Pool} from 'pg';

/** Keep authorization, audit and session revocation atomic with account deletion. */
export async function deleteDashboardUser(db:Pick<Pool,'connect'>,actorId:string,id:string,confirmation:unknown){
 if(!id||id.length>200)throw new Error('INVALID_USER');
 const client=await db.connect();
 try{
  await client.query('BEGIN');
  // Serializes deletions with role/status updates, including concurrent requests.
  await client.query('LOCK TABLE dashboard_users IN SHARE ROW EXCLUSIVE MODE');
  const actor=(await client.query('SELECT id,role,active FROM dashboard_users WHERE id=$1',[actorId])).rows[0];
  if(!actor?.active||actor.role!=='admin')throw new Error('ADMIN_REQUIRED');
  const target=(await client.query('SELECT id,username,role,active,is_owner FROM dashboard_users WHERE id=$1',[id])).rows[0];
  if(!target)throw new Error('USER_NOT_FOUND');
  if(id===actorId)throw new Error('SELF_DELETE');
  if(target.is_owner)throw new Error('OWNER_DELETE');
  if(typeof confirmation!=='string'||confirmation!==target.username)throw new Error('DELETE_CONFIRMATION_REQUIRED');
  if(target.active&&target.role==='admin'){
   const count=Number((await client.query("SELECT COUNT(*)::int AS value FROM dashboard_users WHERE role='admin' AND active=true")).rows[0]?.value);
   if(!Number.isFinite(count)||count<=1)throw new Error('LAST_ADMIN');
  }
  await client.query('INSERT INTO dashboard_audit_log(actor_user_id,event,target_user_id,detail) VALUES($1,$2,$3,$4)',[actorId,'user_deleted',id,JSON.stringify({username:target.username,role:target.role})]);
  // Existing ON DELETE CASCADE removes every login session for this account.
  const removed=await client.query('DELETE FROM dashboard_users WHERE id=$1 RETURNING id',[id]);
  if(!removed.rowCount)throw new Error('USER_NOT_FOUND');
  await client.query('COMMIT');
 }catch(error){await client.query('ROLLBACK');throw error;}
 finally{client.release();}
}
