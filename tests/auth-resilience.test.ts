import test from 'node:test';import assert from 'node:assert/strict';
import {retryableInitializer,parseSessionCookie} from '../src/auth-resilience.ts';
test('concurrent initialization shares work; a transient failure permits the next request to recover',async()=>{
 let calls=0;const initialize=retryableInitializer(async()=>{if(++calls===1)throw Error('temporary');});
 const first=await Promise.allSettled([initialize(),initialize()]);
 assert.equal(calls,1);assert.ok(first.every(x=>x.status==='rejected'));
 await Promise.all([initialize(),initialize()]);assert.equal(calls,2);
 await initialize();assert.equal(calls,2);
});
test('malformed or foreign cookies are unauthenticated without throwing',()=>{
 const token='a'.repeat(43);assert.equal(parseSessionCookie(`other=1; rcc_session=${token}`),token);
 for(const header of [undefined,'rcc_session=%','rcc_session=%E0%A4%A','rcc_session=','rcc_session=abc','other='+token,'rcc_session='+token+'%0A'])assert.equal(parseSessionCookie(header),null);
});
