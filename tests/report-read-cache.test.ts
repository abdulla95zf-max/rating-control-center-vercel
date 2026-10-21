import test from 'node:test';import assert from 'node:assert/strict';
import {createReportReadCache,reportRead} from '../src/services/report-read-cache.ts';

test('concurrent readers share one source read and receive isolated copies until TTL expiry',async()=>{
 let time=0,reads=0;const cache=createReportReadCache({clock:()=>time});
 const load=async()=>{reads++;return {state:'SUCCESS',rows:[{branch:'one',value:1}]};};
 const values=await Promise.all(Array.from({length:50},()=>cache.read('source',load,300_000)));
 assert.equal(reads,1);values[0]!.rows[0]!.value=99;assert.equal(values[1]!.rows[0]!.value,1);
 assert.equal((await cache.read('source',load,300_000)).rows[0]!.value,1);
 time=300_000;await cache.read('source',load);assert.equal(reads,2);
});
test('source failures retry, distinct sources do not mix, and bounded oversized entries are not retained',async()=>{
 const cache=createReportReadCache({maxBytes:100,maxEntries:1});let reads=0;
 const failed=async()=>{reads++;return {state:'ERROR'};};await cache.read('x',failed);await cache.read('x',failed);assert.equal(reads,2);
 await assert.rejects(cache.read('throw',async()=>{throw Error('source');}));assert.equal(await cache.read('throw',async()=>1),1);
 const large=async()=>{reads++;return 'x'.repeat(101);};await cache.read('big',large);await cache.read('big',large);assert.equal(reads,4);
 assert.equal(await reportRead({},'same',async()=>1),1);assert.equal(await reportRead({},'same',async()=>2),2);
 await cache.read('one',async()=>1);await cache.read('two',async()=>2);assert.equal(await cache.read('one',async()=>3),3);
});
test('cached raw source data remains unscoped; each caller scopes its own copy',async()=>{
 const cache=createReportReadCache();let reads=0;const source=async()=>{reads++;return {rows:[{branch:'A'},{branch:'B'}]};};
 const a=await cache.read('raw',source);a.rows=a.rows.filter(r=>r.branch==='A');
 const b=await cache.read('raw',source);b.rows=b.rows.filter(r=>r.branch==='B');
 assert.deepEqual(a.rows,[{branch:'A'}]);assert.deepEqual(b.rows,[{branch:'B'}]);assert.equal(reads,1);
});
