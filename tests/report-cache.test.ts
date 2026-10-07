import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function cache(){const context=vm.createContext({});vm.runInContext(fs.readFileSync('public/report-cache.js','utf8'),context);let now=0;return {value:vm.runInContext('createReportCache',context)({ttl:60,clock:()=>now}),advance:(n:number)=>now+=n};}
test('Saved reports coalesce concurrent reads, reuse fresh values and refresh once when stale',async()=>{
 const c=cache();let reads=0,resolve:any;const loader=()=>{reads++;return new Promise(r=>resolve=r);};
 const a=c.value.read('ratings',loader),b=c.value.read('ratings',loader,{force:true});assert.equal(a,b);await Promise.resolve();assert.equal(reads,1);resolve({version:1});await a;
 assert.equal((await c.value.read('ratings',loader)).version,1);assert.equal(reads,1);c.advance(61);
 const next=c.value.read('ratings',loader);assert.equal(c.value.peek('ratings').value.version,1);await Promise.resolve();resolve({version:2});await next;assert.equal(reads,2);
});
test('Refresh failure retains saved data and does not advance last-success time',async()=>{
 const c=cache();await c.value.read('ratings',()=>({version:1}));c.advance(70);
 await assert.rejects(c.value.read('ratings',()=>Promise.reject(Error('failed'))));
 assert.equal(c.value.peek('ratings').value.version,1);assert.equal(c.value.peek('ratings').checkedAt,0);assert.equal(c.value.peek('ratings').error,true);
});
test('Authentication reset clears reports and late responses cannot repopulate another account cache',async()=>{
 const c=cache();let resolve:any;const pending=c.value.read('ratings',()=>new Promise(r=>resolve=r));await Promise.resolve();c.value.clear();resolve({account:'old'});await pending;assert.equal(c.value.peek('ratings').value,null);
 const result=await c.value.read('ratings',()=>({account:'new'}));assert.equal(result.account,'new');
});
