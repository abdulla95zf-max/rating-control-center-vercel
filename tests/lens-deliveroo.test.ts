import test from 'node:test';import assert from 'node:assert/strict';
import {deliverooLens,fetchLens} from '../src/services/lens.ts';
function fixture(orders=12,verified=true){return {state:'SUCCESS',snapshot:{days:7,startDate:'2026-10-14',endDate:'2026-10-20',observedAt:'2026-10-21T07:00:00Z',rows:[{storeId:'one',orgId:'org',storeName:'Preview brand — Preview',servicePeriodVerified:verified,metrics:[{name:'total_orders',total:orders},{name:'prep_time',total:18},{name:'prep_time_benchmark',total:12},{name:'total_rejected_orders',total:1},{name:'wait_time_past_target_5min_cnt',total:2},{name:'total_delivered_orders',total:10}],service:{cancelled:{total:1},inaccurate:{total:2}}}]}};}
test('Deliveroo adds dated service evidence without fabricating sales or reversing rounded percentage changes',()=>{
 const result=deliverooLens(fixture()),r=result.rows[0];assert.equal(r.current.sales,null);assert.equal(r.eligible,false);assert.equal(r.evidenceOnly,true);assert.equal(r.diagnostics.evidence.kind,'period');assert.ok(r.diagnostics.evidence.metrics.every(m=>m.previous.observed===null));assert.equal(r.current.orders,12);
 const unverified=deliverooLens(fixture(12,false)).rows[0];assert.ok(!unverified.diagnostics.evidence.metrics.some(m=>m.code==='missing'||m.code==='cancelled'));
 assert.equal(deliverooLens(fixture(0)).rows[0].diagnostics.evidence.metrics.find(m=>m.code==='prep')?.current.observed,null);
});
test('Lens gates Deliveroo independently and uses the branch-scoped payload',async()=>{
 let reads=0;const operations=async()=>{reads++;return fixture();},growth=async()=>({platforms:[]});
 const user:any={role:'admin',features:['lens']};const env={DELIVEROO_RATINGS_ENABLED:'true'};
 assert.deepEqual(await fetchLens(user,env,undefined,{growth,operations}),{platforms:[]});assert.equal(reads,0);
 user.features.push('deliveroo.operations');const data=await fetchLens(user,env,undefined,{growth,operations,scope:async(d:any)=>({...d,snapshot:{...d.snapshot,rows:[]}})});assert.equal(reads,1);assert.equal(data.platforms[0].rows.length,0);
});
