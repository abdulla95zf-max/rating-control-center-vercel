import test from 'node:test';
import assert from 'node:assert/strict';
import {assessOrderSeries,calendarDay,evaluateEmergencySnapshot,type OrderSeries} from '../src/services/order-emergency-policy.ts';
const now=new Date('2026-11-19T10:00:00Z');
function series(values:number[],start='2026-11-11'):OrderSeries{return {key:'talabat:1',platform:'talabat',sourceId:'1',branchId:'b1',brand:'FRB',name:'Branch',lineage:'source1',asOf:calendarDay(start,values.length-1),points:values.map((orders,i)=>({date:calendarDay(start,i),orders,complete:true,observedAt:'2026-11-19T00:00:00Z',revision:'r1'}))};}
test('exact 80% threshold and seven-day average permit one quieter baseline day',()=>{
 assert.equal(assessOrderSeries(series([5,5,5,5,5,5,3,0]),now).row.state,'EMERGENCY');
 assert.equal(assessOrderSeries(series([5,5,5,5,5,5,3,1]),now).row.state,'NORMAL');
 assert.equal(assessOrderSeries(series([5,5,5,5,5,5,5,1]),now).row.state,'EMERGENCY');
 assert.equal(assessOrderSeries(series([5,5,5,5,5,5,1,0]),now).row.state,'LOW_VOLUME');
 assert.equal(assessOrderSeries(series([5,5,5,5,5,5,2,0]),now).row.state,'EMERGENCY');
});
test('missing, duplicate, partial, null and current-day reports never establish zero',()=>{
 for(const change of [(s:OrderSeries)=>{s.points.pop();},(s:OrderSeries)=>{s.points.push({...s.points.at(-1)!});},(s:OrderSeries)=>{s.points.at(-1)!.complete=false;},(s:OrderSeries)=>{s.points.at(-1)!.orders=null;},(s:OrderSeries)=>{s.asOf='2026-11-19';}]){const s=series([5,5,5,5,5,5,5,0]);change(s);assert.equal(assessOrderSeries(s,now).row.state,'UNKNOWN');}
 const s=series([5,5,5,5,5,5,5,0]);s.points.splice(2,1);assert.equal(assessOrderSeries(s,now).row.state,'INSUFFICIENT');
});
test('baseline freezes through prolonged zero sales and replay is idempotent',()=>{
 const s=series([...Array(7).fill(5),...Array(10).fill(0)],'2026-11-02');
 const first=assessOrderSeries(s,now);assert.equal(first.row.state,'EMERGENCY');assert.equal(first.row.baselineAverage,5);assert.equal(first.row.consecutiveDays,10);
 const replay=assessOrderSeries(s,now,first.incident);assert.equal(replay.row.consecutiveDays,10);assert.equal(replay.row.zeroDays,10);
});
test('unknown does not resolve an incident; valid exit is not claimed to be normal trading',()=>{
 const s=series([5,5,5,5,5,5,5,0]),initial=assessOrderSeries(s,now);
 s.points.pop();const missing=assessOrderSeries(s,now,initial.incident);assert.deepEqual(missing.incident,initial.incident);assert.equal(missing.row.state,'UNKNOWN');
 s.points.push({date:'2026-11-18',orders:2,complete:true,observedAt:'2026-11-19T00:00:00Z',revision:'r2'});
 const exit=assessOrderSeries(s,now,initial.incident);assert.equal(exit.incident,undefined);assert.equal(exit.row.reason,'EXITED_EMERGENCY_THRESHOLD');
});
test('stale data, changed frozen baseline and future observations are unknown',()=>{
 const s=series([5,5,5,5,5,5,5,0]),open=assessOrderSeries(s,now).incident;
 s.points[0]!.orders=6;assert.equal(assessOrderSeries(s,now,open).row.reason,'BASELINE_REVISED');
 s.points.at(-1)!.observedAt='2026-11-20T00:00:00Z';assert.equal(assessOrderSeries(s,now).row.state,'UNKNOWN');
 s.asOf='2026-11-16';assert.equal(assessOrderSeries(s,now).row.state,'UNKNOWN');
});
test('snapshot rejects duplicate source identities and never aggregates platforms',()=>{
 const s=series([5,5,5,5,5,5,5,0]);assert.throws(()=>evaluateEmergencySnapshot([s,s],now));
 const other={...s,key:'noon:1',platform:'noon' as const};const snapshot=evaluateEmergencySnapshot([s,other],now);assert.equal(snapshot.rows.length,2);
});
