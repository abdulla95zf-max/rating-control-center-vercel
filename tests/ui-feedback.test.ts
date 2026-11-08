import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function core(){const c:any=vm.createContext({});vm.runInContext(fs.readFileSync('public/ui-feedback.js','utf8'),c);return c.UIFeedback;}
test('pending operation locks survive repeated events, isolate resources and restore original control states',()=>{
 const ui=core(),control={disabled:false},alreadyDisabled={disabled:true};
 const release=ui.begin('user:one',[control,alreadyDisabled]);assert.equal(control.disabled,true);assert.equal(ui.begin('user:one'),null);assert.equal(ui.has('user:one'),true);
 const other=ui.begin('user:two');assert.ok(other);other();assert.equal(ui.has('user:one'),true);
 release();release();assert.equal(control.disabled,false);assert.equal(alreadyDisabled.disabled,true);assert.equal(ui.has('user:one'),false);assert.ok(ui.begin('user:one'));
});
test('request errors preserve actionable validation but never raw server objects, database diagnostics or HTML',()=>{
 const ui=core();assert.equal(ui.http(409,{error:'This username already exists.'}),'This username already exists.');
 assert.match(ui.http(401,{}),/Sign in again/);assert.match(ui.http(403,{error:'PRIVATE DATABASE HOST'}),/Access was denied/);assert.match(ui.http(503,{error:'postgresql://PRIVATE'}),/temporarily unavailable/);
 for(const body of [null,{error:{secret:'PRIVATE'}},{error:'<html>PRIVATE</html>'}])assert.ok(!ui.http(400,body).includes('PRIVATE'));
 assert.match(ui.network(),/refresh first/);
});
test('an interrupted response body preserves uncertain-write guidance; malformed JSON stays a separate case',async()=>{
 const ui=core();assert.equal(await ui.read({json:async()=>{throw Object.assign(Error('PRIVATE'),{name:'SyntaxError'});}}),null);
 await assert.rejects(ui.read({json:async()=>{throw Object.assign(Error('PRIVATE'),{name:'AbortError'});}}),/refresh first/);
});
test('native username pattern compiles in current HTML Unicode mode and preserves accepted characters',()=>{
 const pattern=fs.readFileSync('public/users.html','utf8').match(/pattern="([^"]+)"/)?.[1];assert.ok(pattern);
 const valid=new RegExp('^(?:'+pattern+')$','v');
 for(const name of ['bm@frb.ae','branch-manager','user_name','abc123'])assert.ok(valid.test(name));
 for(const name of ['ab','wrong name','<user>','-user','کاربر'])assert.equal(valid.test(name),false);
});
