import test from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {scanOrderEmergencies} from '../src/services/order-emergency-reader.ts';
import {calendarDay} from '../src/services/order-emergency-policy.ts';
test('all four SQL enrichments retain exact source revisions, daily units and derived fields',async()=>{
 const pg=new PGlite(),db={query:async(q:any)=>pg.query(q.text,q.values)},now=new Date('2026-11-19T10:00:00Z');
 try{
 await pg.exec(`CREATE TABLE dashboard_branches(id text,canonical_key text,brand text,display_name text,active boolean);
 CREATE TABLE dashboard_branch_sources(source_type text,source_id text,branch_id text);
 CREATE TABLE performance_report_current(source_key text,report_date date,revision_id text,requested_at timestamptz);
 CREATE TABLE performance_report_revisions(source_key text,report_date date,revision_id text,requested_at timestamptz,received_at timestamptz);
 CREATE TABLE performance_report_rows(revision_id text,store_id text,present boolean,source_values jsonb);
 CREATE TABLE keeta_performance_period_snapshots(id uuid,period_from date,period_to date,observed_at timestamptz,account_key text,payload jsonb);
 CREATE TABLE noon_performance_snapshots(id uuid,period_from date,period_to date,observed_at timestamptz,created_at timestamptz,payload jsonb);
 CREATE TABLE deliveroo_operations_snapshots(id uuid,days integer,period_from date,period_to date,observed_at timestamptz,created_at timestamptz,payload jsonb);`);
 const platforms=['talabat','keeta','noon','deliveroo'];
 for(const p of platforms){await pg.query('INSERT INTO dashboard_branches VALUES($1,$1,$1,$1,true)',[p]);await pg.query('INSERT INTO dashboard_branch_sources VALUES($1,$2,$3)',[p==='talabat'||p==='keeta'?'performance:'+p:'rating:'+p,p==='noon'?'NOON;n;1':p==='deliveroo'?'DELIVEROO;o;1':'1',p]);}
 const series:any[]=[],rejections:any[]=[];
 for(let i=0;i<8;i++){
  const date=calendarDay('2026-11-11',i),last=i===7,orders=last?0:5,stamp=now.toISOString(),revision=randomUUID();
  await pg.query('INSERT INTO performance_report_current VALUES($1,$2,$3,$4)',['source',date,revision,stamp]);
  await pg.query('INSERT INTO performance_report_revisions VALUES($1,$2,$3,$4,$4)',['source',date,revision,stamp]);
  await pg.query('INSERT INTO performance_report_rows VALUES($1,$2,true,$3::jsonb)',[revision,'1',JSON.stringify({'Successful Orders':orders,'Gross Sales':orders*50,'Impressions':1000,'Viewed your menu':100,'Added items to cart':20,'Placed an order':last?1:10,'Cancelled Orders':0,'Unavailable time duration (Minutes)':0,'Scheduled Open Time (Minutes)':720})]);
  const payload={periodFrom:date,periodTo:date,coverage:{business:true},shops:[{shopId:'1',business:{shop_valid_order_num:orders,shop_income:orders*50,shop_cancel_order_num:0},opening:[{code:'shop_avg_closing_duration',value:last?2:0},{code:'shop_daily_average_opening_duration',value:last?10:12}]}],customers:{byShop:[{shopId:'1',conversion:[{code:'shop_expose_user_num',value:1000},{code:'shop_entry_user_num',value:last?10:100},{code:'shop_cartadd_user_num',value:20},{code:'shop_pay_user_num',value:last?0:10}]}]}};
  await pg.query('INSERT INTO keeta_performance_period_snapshots VALUES($1,$2,$2,$3,$4,$5::jsonb)',[randomUUID(),date,stamp,'kabab-fareej',JSON.stringify(payload)]);
  const noon={period:{startDate:date,endDate:date},reports:[{scope:'STORE',restaurantId:'n',outletCode:'1',dashboard:{startDate:date,endDate:date,salesInsights:{mainInsights:{ordersCount:orders,revenue:orders*50}},customerInsights:{conversionFunnel:{menuViewsCount:100,addedToCartCount:20,orderCompletedCount:10}},operationInsights:{mainInsights:{lostOrders:0,offHours:last?2:0,totalHours:10}}}}]};
  await pg.query('INSERT INTO noon_performance_snapshots VALUES($1,$2,$2,$3,$3,$4::jsonb)',[randomUUID(),date,stamp,JSON.stringify(noon)]);
  const time=Date.parse(date+'T00:00:00Z')/1000;series.push({time,value:orders});rejections.push({time,value:last?3:0});
 }
 const deliveroo={startDate:'2026-10-20',endDate:'2026-11-18',rows:[{storeId:'1',orgId:'o',code:'SUCCESS',startDate:'2026-10-20',endDate:'2026-11-18',metrics:[{name:'total_orders',series},{name:'total_rejected_orders',series:rejections}]}]};
 await pg.query('INSERT INTO deliveroo_operations_snapshots VALUES($1,30,$2,$3,$4,$4,$5::jsonb)',[randomUUID(),'2026-10-20','2026-11-18',now.toISOString(),JSON.stringify(deliveroo)]);
 const result=await scanOrderEmergencies(undefined,now,db,{NOON_RATINGS_ENABLED:'true',DELIVEROO_RATINGS_ENABLED:'true'});
 assert.deepEqual(result.sourceErrors,{});assert.equal(result.rows.length,4);assert.ok(result.rows.every(r=>r.state==='EMERGENCY'));
 const get=(p:string)=>result.rows.find(r=>r.platform===p)!.diagnosis!;
 assert.equal(get('talabat').primary?.code,'ORDERING');assert.equal(get('keeta').primary?.code,'OFFLINE');assert.equal(get('keeta').measurements.find(m=>m.metric==='offlineMinutes')!.current,120);
 assert.equal(get('noon').primary?.code,'OFFLINE');assert.equal(get('deliveroo').primary?.metric,'Rejected orders');
 }finally{await pg.close();}
});
