import test from 'node:test';
import assert from 'node:assert/strict';
import {deleteDashboardUser} from '../src/user-deletion.ts';
function fixture(overrides:any={}){
 const actor={id:'actor',role:'admin',active:true},target={id:'target',username:'branch.manager',role:'viewer',active:true,is_owner:false,...overrides};
 const events:string[]=[],audit:any[]=[],deleted:string[]=[];
 const client={async query(sql:string,args:any[]=[]){events.push(sql);if(sql.includes('SELECT id,role,active'))return {rows:[actor]};if(sql.includes('SELECT id,username'))return {rows:overrides.missing?[]:[target]};if(sql.includes('COUNT(*)'))return {rows:[{value:overrides.adminCount??2}]};if(sql.startsWith('INSERT INTO dashboard_audit')){if(overrides.auditFailure)throw new Error('DB_FAILURE');audit.push(args);return {rowCount:1,rows:[]};}if(sql.startsWith('DELETE FROM dashboard_users')){deleted.push(args[0]);return {rowCount:1,rows:[{id:args[0]}]};}return {rows:[]};},release(){events.push('RELEASE');}};
 return {actor,target,events,audit,deleted,db:{connect:async()=>client} as any};
}
test('deletion requires a live administrator and exact confirmation; protected accounts remain intact',async()=>{
 for(const [options,code] of [[{self:true},'SELF_DELETE'],[{is_owner:true},'OWNER_DELETE'],[{missing:true},'USER_NOT_FOUND'],[{confirmation:'wrong'},'DELETE_CONFIRMATION_REQUIRED'],[{actorRole:'viewer'},'ADMIN_REQUIRED'],[{actorActive:false},'ADMIN_REQUIRED'],[{role:'admin',adminCount:1},'LAST_ADMIN']] as [any,string][]){
  const f=fixture(options);if(options.actorRole)f.actor.role=options.actorRole;if(options.actorActive===false)f.actor.active=false;
  await assert.rejects(deleteDashboardUser(f.db,'actor',options.self?'actor':'target',options.confirmation??'branch.manager'),new RegExp(code));
  assert.deepEqual(f.deleted,[]);assert.deepEqual(f.audit,[]);assert.ok(f.events.includes('ROLLBACK'));assert.equal(f.events.at(-1),'RELEASE');
 }
});
test('confirmed deletion commits with audit, and an audit failure leaves the account intact',async()=>{
 const f=fixture();await deleteDashboardUser(f.db,'actor','target','branch.manager');assert.deepEqual(f.deleted,['target']);assert.equal(f.audit[0][1],'user_deleted');assert.deepEqual(JSON.parse(f.audit[0][3]),{username:'branch.manager',role:'viewer'});assert.ok(f.events.includes('LOCK TABLE dashboard_users IN SHARE ROW EXCLUSIVE MODE'));assert.equal(f.events.at(-2),'COMMIT');
 const failed=fixture({auditFailure:true});await assert.rejects(deleteDashboardUser(failed.db,'actor','target','branch.manager'),/DB_FAILURE/);assert.deepEqual(failed.deleted,[]);assert.ok(failed.events.includes('ROLLBACK'));assert.ok(!failed.events.includes('COMMIT'));
});
test('another administrator can be deleted; an inactive admin is not counted as the last active admin',async()=>{
 for(const options of [{role:'admin',adminCount:2},{role:'admin',active:false,adminCount:1}]){const f=fixture(options);await deleteDashboardUser(f.db,'actor','target','branch.manager');assert.deepEqual(f.deleted,['target']);}
});
