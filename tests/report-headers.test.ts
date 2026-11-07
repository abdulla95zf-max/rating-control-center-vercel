import test from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {REPORT_HEADERS,canonicalHeaderSql} from '../src/services/report-headers.ts';

test('SQL canonical headers preserve every supported label, aliases and unknown source fields',async()=>{
 const db=new PGlite();
 try{
  const inputs=REPORT_HEADERS.flatMap(name=>[name,'  '+name.toLowerCase().replaceAll(' ','  ')+'  ']);
  inputs.push('New customer orders',' RETURNING   CUSTOMER ORDERS ','Unrecognized vendor field',"Vendor's custom field");
  const expected=REPORT_HEADERS.flatMap(name=>[name,name]);expected.push('Orders from new customers','Orders from returning customers','Unrecognized vendor field',"Vendor's custom field");
  const result=await db.query(`SELECT ${canonicalHeaderSql} AS name FROM unnest($1::text[]) WITH ORDINALITY AS e(key,n) ORDER BY n`,[inputs]);
  assert.deepEqual(result.rows.map((r:any)=>r.name),expected);
 }finally{await db.close();}
});
