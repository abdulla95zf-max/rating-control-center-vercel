import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {recordFailedLogin} from '../src/login-attempts.ts';
test('parallel failed logins accumulate atomically and cannot extend an existing lock',async()=>{
 const db=new PGlite();try{
  await db.exec("CREATE TABLE dashboard_users(id text PRIMARY KEY,active boolean,failed_attempts int,locked_until timestamptz); INSERT INTO dashboard_users VALUES('a',true,0,NULL)");
  await Promise.all(Array.from({length:5},()=>recordFailedLogin(db,'a')));
  const row=(await db.query("SELECT * FROM dashboard_users WHERE id='a'")).rows[0];assert.equal(row.failed_attempts,5);assert.ok(row.locked_until);
  await recordFailedLogin(db,'a');const locked=(await db.query("SELECT * FROM dashboard_users WHERE id='a'")).rows[0];assert.deepEqual(locked,row);
  await db.exec("UPDATE dashboard_users SET locked_until=now()-interval '1 second'");
  await recordFailedLogin(db,'a');const recovered=(await db.query("SELECT * FROM dashboard_users WHERE id='a'")).rows[0];assert.equal(recovered.failed_attempts,1);assert.equal(recovered.locked_until,null);
  await db.exec("UPDATE dashboard_users SET active=false");await recordFailedLogin(db,'a');assert.equal((await db.query('SELECT failed_attempts FROM dashboard_users')).rows[0].failed_attempts,1);
 }finally{await db.close();}
});
