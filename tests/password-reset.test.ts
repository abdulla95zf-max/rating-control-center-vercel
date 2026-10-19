import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {resetDashboardPassword} from '../src/password-reset.ts';
async function fixture(){
 const db=new PGlite();await db.exec(`CREATE TABLE dashboard_users(id text PRIMARY KEY,role text,active boolean,is_owner boolean,password_hash text,must_change_password boolean DEFAULT false,session_version int DEFAULT 1,failed_attempts int DEFAULT 0,locked_until timestamptz,updated_at timestamptz DEFAULT now());
 CREATE TABLE dashboard_sessions(user_id text,token text);
 CREATE TABLE dashboard_audit_log(actor_user_id text,event text,target_user_id text,detail jsonb);
 INSERT INTO dashboard_users(id,role,active,is_owner,password_hash) VALUES('owner','admin',true,true,'old'),('admin','admin',true,false,'old'),('viewer','viewer',true,false,'old');
 INSERT INTO dashboard_sessions VALUES('owner','owner-session'),('viewer','viewer-session');`);
 const pool:any={connect:async()=>({query:(sql:string,values?:any[])=>db.query(sql,values),release(){}})};
 return {db,pool};
}
test('ordinary admin cannot take over owner; database privileges override stale request claims',async()=>{
 const {db,pool}=await fixture();try{
  await assert.rejects(resetDashboardPassword(pool,'admin','owner','new'),/OWNER_REQUIRED/);
  await assert.rejects(resetDashboardPassword(pool,'viewer','owner','new'),/ADMIN_REQUIRED/);
  await db.query("UPDATE dashboard_users SET active=false WHERE id='admin'");
  await assert.rejects(resetDashboardPassword(pool,'admin','viewer','new'),/ADMIN_REQUIRED/);
  assert.equal((await db.query("SELECT password_hash FROM dashboard_users WHERE id='owner'")).rows[0].password_hash,'old');
  assert.equal((await db.query('SELECT * FROM dashboard_sessions')).rows.length,2);
  assert.equal((await db.query('SELECT * FROM dashboard_audit_log')).rows.length,0);
 }finally{await db.close();}
});
test('owner and admin resets revoke only target sessions and audit atomically',async()=>{
 const {db,pool}=await fixture();try{
  await resetDashboardPassword(pool,'admin','viewer','new');
  assert.deepEqual((await db.query("SELECT password_hash,session_version FROM dashboard_users WHERE id='viewer'")).rows[0],{password_hash:'new',session_version:2});
  assert.equal((await db.query('SELECT * FROM dashboard_sessions')).rows.length,1);
  await resetDashboardPassword(pool,'owner','owner','new-owner');
  assert.equal((await db.query('SELECT * FROM dashboard_sessions')).rows.length,0);
  assert.equal((await db.query('SELECT * FROM dashboard_audit_log')).rows.length,2);
 }finally{await db.close();}
});
test('audit failure rolls back password and session revocation together',async()=>{
 const {db,pool}=await fixture();try{
  await db.exec("ALTER TABLE dashboard_audit_log ADD CONSTRAINT fail_audit CHECK(event<>'password_reset')");
  await assert.rejects(resetDashboardPassword(pool,'owner','owner','new'));
  assert.equal((await db.query("SELECT password_hash,session_version FROM dashboard_users WHERE id='owner'")).rows[0].password_hash,'old');
  assert.equal((await db.query('SELECT * FROM dashboard_sessions')).rows.length,2);
 }finally{await db.close();}
});
