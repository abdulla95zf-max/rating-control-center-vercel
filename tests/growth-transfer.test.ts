import test from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';
import {readTalabatGrowth} from '../src/services/growth.ts';

test('Growth SQL omits duplicate raw values on trading days but retains blank-day zero-order evidence',async()=>{
 const db=new PGlite();try{
  await db.exec(`CREATE TABLE performance_report_current(revision_id bigint,source_key text,report_date date,requested_at timestamptz);
   CREATE TABLE performance_report_revisions(revision_id bigint,source_key text,report_date date,requested_at timestamptz,received_at timestamptz);
   CREATE TABLE performance_report_rows(revision_id bigint,store_id text,present boolean,source_values jsonb);`);
  const trading=['Gross Sales','Successful Orders','Orders count','Cancelled Orders','Online Sales','Cash Sales','Delivery Sales','Pickup Sales','Online Orders','Cash Orders','Delivery Orders','Pickup Orders','Pro Orders','Pro Revenue','Items count'];
  for(let i=0;i<14;i++){
   const date=new Date(Date.parse('2026-10-21')+i*86400000).toISOString().slice(0,10),id=i+1;
   const values=i===0?{...Object.fromEntries(trading.map(k=>[k,null])),'Gross Sales':'\t','Successful Orders':'\u00a0','Placed an order':'0','Scheduled Open Time (Minutes)':'600',Impressions:'100'}:{'Gross Sales':'100','Successful Orders':'5'};
   await db.query('INSERT INTO performance_report_current VALUES($1,$2,$3,$4)',[id,'source',date,'2026-11-04T01:00Z']);
   await db.query('INSERT INTO performance_report_revisions VALUES($1,$2,$3,$4,$4)',[id,'source',date,'2026-11-04T01:00Z']);
   await db.query('INSERT INTO performance_report_rows VALUES($1,$2,true,$3)',[id,'1',JSON.stringify(values)]);
  }
  let rawCount=0;
  const wrapper={query:async(q:any)=>{const result=await db.query(q.text,q.values);rawCount=result.rows.filter((r:any)=>r.raw_metrics!==null).length;return result;}};
  const data={state:'SUCCESS',reportDate:'2026-11-03',receivedAt:'2026-11-04T01:00Z',rows:[{storeId:'1',storeName:'Kabab Fareej — Ajman',present:true,values:{'Gross Sales':'100','Successful Orders':'5'}}]};
  const actual:any=await readTalabatGrowth(data,wrapper,new Date('2026-11-04T02:00Z'));
  assert.equal(rawCount,1);assert.equal(actual.rows[0].eligible,true);assert.equal(actual.rows[0].previous.sales,600);assert.equal(actual.rows[0].current.sales,700);
 }finally{await db.close();}
});
