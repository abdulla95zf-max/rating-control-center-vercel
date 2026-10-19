import test from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {authDatabase,listUsers,createUser,updateUser} from '../src/auth.ts';

test('owner is hidden from admins; feature updates, account creation and session revocation use live database privileges',async()=>{
 const oldUrl=process.env.DATABASE_URL;process.env.DATABASE_URL='postgres://test:test@127.0.0.1/test';
 const db=new PGlite(),pool=authDatabase(),originalQuery=pool.query,originalConnect=pool.connect;
 (pool as any).query=(sql:string,args?:any[])=>db.query(sql,args);
 (pool as any).connect=async()=>({query:(sql:string,args?:any[])=>db.query(sql,args),release(){}});
 const owner:any={id:'owner',role:'admin',isOwner:true,features:null},admin:any={id:'admin',role:'admin',isOwner:false,features:null};
 try{
  await listUsers(owner); // Run the real additive schema initializer.
  await db.exec(`INSERT INTO dashboard_users(id,username,display_name,password_hash,role,is_owner) VALUES('owner','owner','Owner','hash','admin',true),('admin','admin','Admin','hash','admin',false),('viewer','viewer','Viewer','hash','viewer',false);`);
  assert.equal((await listUsers(admin)).some(u=>u.isOwner),false);
  assert.equal((await listUsers(owner)).some(u=>u.isOwner),true);
  const input={displayName:'Viewer',role:'viewer',scopes:[],active:true};
  await assert.rejects(updateUser(admin,'owner',{...input,role:'admin'}),/OWNER_REQUIRED/);
  await assert.rejects(updateUser(admin,'viewer',{...input,features:['lens']}),/OWNER_REQUIRED/);
  await db.query("INSERT INTO dashboard_sessions(token_hash,user_id,session_version,expires_at) VALUES('session','viewer',1,now()+interval '1 hour')");
  await updateUser(owner,'viewer',{...input,features:['lens','talabat.ratings']});
  assert.deepEqual((await listUsers(owner)).find(u=>u.id==='viewer')?.features,['lens','talabat.ratings']);
  assert.equal((await db.query("SELECT * FROM dashboard_sessions WHERE user_id='viewer'")).rows.length,0);
  await updateUser(owner,'admin',{...input,displayName:'Admin',role:'admin',features:['users.manage','talabat.ratings']});
  // Deliberately stale request says full access, but database actor now has fewer sections.
  await assert.rejects(updateUser(admin,'viewer',input),/ACCOUNT_ACCESS_DENIED/);
  const created=await createUser(admin,{username:'newviewer',password:'synthetic-test-only',displayName:'New viewer',role:'viewer',scopes:[]});
  assert.deepEqual((await listUsers(owner)).find(u=>u.id===created)?.features,['users.manage','talabat.ratings']);
  await assert.rejects(createUser(admin,{username:'blocked',password:'synthetic-test-only',displayName:'Blocked',role:'admin',features:null}),/OWNER_REQUIRED/);
  assert.equal(Number((await db.query("SELECT count(*) AS count FROM dashboard_users WHERE username='blocked'")).rows[0].count),0);
  await db.exec("ALTER TABLE dashboard_audit_log ADD CONSTRAINT audit_reject CHECK(event<>'user_updated') NOT VALID");
  await assert.rejects(updateUser(owner,'viewer',{...input,features:[]}),/audit_reject/);
  assert.deepEqual((await listUsers(owner)).find(u=>u.id==='viewer')?.features,['lens','talabat.ratings']);
 }finally{(pool as any).query=originalQuery;(pool as any).connect=originalConnect;if(oldUrl===undefined)delete process.env.DATABASE_URL;else process.env.DATABASE_URL=oldUrl;await db.close();await pool.end();}
});
