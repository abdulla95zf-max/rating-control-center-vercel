import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {readKeetaGrowth} from '../src/services/growth.ts';

test('Keeta historical comparison transfers only needed fields and preserves comparison results',async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE keeta_performance_snapshots (period_from date,period_to date,observed_at timestamptz,run_id text,payload jsonb)');
  const payload={periodFrom:'2026-10-01',periodTo:'2026-10-07',shops:[{shopId:'1',business:{shop_income:'1200',shop_valid_order_num:'20'}}],customers:{unused:'x'.repeat(10000)},items:Array.from({length:200},()=>({unused:'x'.repeat(200)})),itemsByShop:[{unused:'x'.repeat(10000)}]};
  await db.query('INSERT INTO keeta_performance_snapshots VALUES ($1,$2,$3,$4,$5)',[payload.periodFrom,payload.periodTo,'2026-10-08','run',JSON.stringify(payload)]);
  let transferred=0;const result=await readKeetaGrowth({state:'SUCCESS',snapshot:{periodFrom:'2026-10-08',periodTo:'2026-10-14',comparisonFrom:'2026-10-01',comparisonTo:'2026-10-07',observedAt:'2026-10-15T08:00:00Z',shops:[{shopId:'1',business:{shop_income:'500',shop_valid_order_num:'10'}}]}},{query:async(q:any)=>{const r=await db.query(q.text,q.values);transferred=Buffer.byteLength(JSON.stringify(r.rows));return r;}},new Date('2026-10-15T09:00:00Z'));
  assert.equal(result.rows[0].delta,-700);assert.equal(result.rows[0].previous.orders,20);assert.ok(transferred<Buffer.byteLength(JSON.stringify(payload))*.05);
 }finally{await db.close();}
});
