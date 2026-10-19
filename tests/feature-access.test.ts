import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {featureCatalog,hasFeature,parseFeatures,storedFeatures,selectFeatureAccess,canManageAccount,filterRatingFeatures} from '../src/feature-access.ts';
import {createCloudHandler} from '../src/cloud-api.ts';
import {fetchGrowth} from '../src/services/growth.ts';
import {resetDashboardPassword} from '../src/password-reset.ts';
import {withAccountAdmin} from '../src/account-admin.ts';

test('feature permissions distinguish legacy full access from explicit none and reject malformed grants',()=>{
 assert.equal(hasFeature({role:'viewer'},'lens'),true);
 assert.equal(hasFeature({role:'admin',features:[]},'lens'),false);
 assert.equal(hasFeature({role:'admin',features:[],isOwner:true},'lens'),true);
 assert.equal(hasFeature({role:'admin',isOwner:true},'unknown'),false);
 for(const value of [{},'lens',['unknown'],['lens','lens'],[1],undefined])assert.throws(()=>parseFeatures(value),/INVALID_FEATURES/);
 assert.deepEqual(storedFeatures(['unknown']),[]);assert.equal(parseFeatures(null),null);
});
test('only owner may assign sections; ordinary admins inherit rather than expand permissions',()=>{
 const actor={role:'admin',is_owner:false,feature_access:['users.manage','talabat.ratings']};
 for(const features of [null,[],['lens']])assert.throws(()=>selectFeatureAccess({features},actor),/OWNER_REQUIRED/);
 assert.deepEqual(selectFeatureAccess({},actor),actor.feature_access);
 assert.deepEqual(selectFeatureAccess({},actor,{feature_access:['lens']}),['lens']);
 assert.deepEqual(selectFeatureAccess({features:[]},{is_owner:true}),[]);
 assert.throws(()=>selectFeatureAccess({features:[]},{is_owner:true},{is_owner:true}),/OWNER_ACCESS_FIXED/);
 assert.equal(canManageAccount({role:'admin',features:['users.manage']},{role:'viewer',features:['lens']}),false);
 assert.equal(canManageAccount({role:'admin'},{role:'admin',isOwner:true}),false);
});
test('ratings filter removes forbidden platform metadata, counts and nested rows',()=>{
 const data={storeCount:2,ratings:[{platform:'talabat',private:'allowed'},{platform:'noon',private:'denied'}],platforms:[{platform:'talabat',ratings:[{private:'allowed'}]},{platform:'noon',ratings:[{private:'denied'}]}]};
 const filtered=filterRatingFeatures(data,{role:'admin',features:['talabat.ratings']});
 assert.equal(filtered.storeCount,1);assert.ok(!JSON.stringify(filtered).includes('denied'));
 assert.deepEqual(filterRatingFeatures(data,{role:'admin',features:[]}),{storeCount:0,ratings:[],platforms:[]});
});
test('server denies every performance route before reading upstream or database, including direct writes',async()=>{
 const user:any={id:'restricted',role:'admin',isOwner:false,features:[],scopes:[]};
 const never=async()=>assert.fail('Forbidden source must not be read');
 const cases=[['performance','?dataset=talabat-reviews','GET'],['performance','?dataset=keeta&latest=1','GET'],['performance','?dataset=keeta&startDate=2026-10-01&endDate=2026-10-07','GET'],['performance','?dataset=keeta','POST'],['performance','?dataset=noon','POST'],['performance','?dataset=noon','GET'],['performance','?dataset=deliveroo-operations','GET'],['performance','?dataset=growth','GET'],['performance','?dataset=lens','GET'],['performance','?dataset=tstar','GET'],['performance','','GET'],['performanceHistory','','GET'],['actionHistory','','GET']];
 for(const [route,query,method]of cases){let result:any;const response:any={statusCode:0,setHeader(){},end(body:string){result=JSON.parse(body);}};
  await createCloudHandler(route as any,{},never as any,async()=>user)({method,url:'/api/test'+query,headers:{host:'dashboard.test',origin:'https://dashboard.test'}} as any,response);
  assert.equal(response.statusCode,403,route+query+method);assert.equal(result.error,'Section access denied');
 }
});
test('aggregate Growth never queries unauthorized platform sources',async()=>{
 const fail=()=>assert.fail('Unauthorized source read');
 const user:any={role:'admin',features:['growth'],scopes:[]};
 const result=await fetchGrowth(user,{},fail as any,{db:{},talabat:fail,keeta:fail,noon:fail});assert.deepEqual(result.platforms,[]);
});
test('Lens and Growth have independent route permissions without implied platform access',async()=>{
 const user:any={id:'lens-only',role:'admin',isOwner:false,features:['lens'],scopes:[]};
 for(const [dataset,status]of [['lens',200],['growth',403]] as const){let body:any;const response:any={statusCode:0,setHeader(){},end(s:string){body=JSON.parse(s);}};
  await createCloudHandler('performance',{},async()=>assert.fail('No source access'),async()=>user)({method:'GET',url:'/?dataset='+dataset,headers:{}} as any,response);
  assert.equal(response.statusCode,status);if(status===200)assert.deepEqual(body.platforms,[]);
 }
});
test('browser policy matches server catalog, chooses allowed landing and performance-only tabs',()=>{
 const context:any=vm.createContext({});vm.runInContext(fs.readFileSync('public/access-policy.js','utf8'),context);const policy=context.RCCAccess;
 assert.deepEqual([...policy.ids].sort(),featureCatalog.map(f=>f.id).sort());
 const user={role:'viewer',features:['talabat.performance']};assert.equal(policy.landing(user),'performance');assert.equal(policy.platformTab(user,'talabat'),'performance');assert.equal(policy.canTab(user,'talabat'),false);
 assert.equal(policy.landing({features:[]}), 'no-access');
});
test('additive database migration preserves legacy accounts and explicit deny-all; password reset cannot bypass restrictions',async()=>{
 const db=new PGlite();const pool:any={connect:async()=>({query:(sql:string,args?:any[])=>db.query(sql,args),release(){}})};
 try{
  await db.exec(`CREATE TABLE dashboard_users(id text PRIMARY KEY,role text,active boolean,is_owner boolean,password_hash text,must_change_password boolean,session_version int DEFAULT 1,failed_attempts int,locked_until timestamptz,updated_at timestamptz);
  INSERT INTO dashboard_users(id,role,active,is_owner,password_hash) VALUES('owner','admin',true,true,'old'),('admin','admin',true,false,'old'),('viewer','viewer',true,false,'old');
  ALTER TABLE dashboard_users ADD COLUMN IF NOT EXISTS feature_access jsonb;
  CREATE TABLE dashboard_sessions(user_id text); INSERT INTO dashboard_sessions VALUES('viewer');
  CREATE TABLE dashboard_audit_log(actor_user_id text,event text,target_user_id text,detail jsonb);`);
  assert.equal((await db.query("SELECT feature_access FROM dashboard_users WHERE id='viewer'")).rows[0].feature_access,null);
  await db.query("UPDATE dashboard_users SET feature_access=$1 WHERE id='admin'",[JSON.stringify(['users.manage'])]);
  await assert.rejects(resetDashboardPassword(pool,'admin','viewer','new'),/ACCOUNT_ACCESS_DENIED/);
  await assert.rejects(resetDashboardPassword(pool,'admin','owner','new'),/OWNER_REQUIRED/);
  await db.query("UPDATE dashboard_users SET feature_access='[]'::jsonb WHERE id='viewer'");
  assert.deepEqual((await db.query("SELECT feature_access FROM dashboard_users WHERE id='viewer'")).rows[0].feature_access,[]);
  await resetDashboardPassword(pool,'admin','viewer','new');
  await db.query("UPDATE dashboard_users SET feature_access='[]'::jsonb WHERE id='admin'");
  await assert.rejects(withAccountAdmin(pool,'admin',async()=>assert.fail()),/ADMIN_REQUIRED/);
  assert.equal((await db.query('SELECT * FROM dashboard_sessions')).rows.length,0);
 }finally{await db.close();}
});
