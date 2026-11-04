import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {PGlite} from '@electric-sql/pglite';
import {attachSnapshotTrends,trendPoint,trendWindows} from '../src/services/lens-trends.ts';
import {readTalabatGrowth} from '../src/services/growth.ts';
const period={from:'2026-10-28',to:'2026-11-03',previousFrom:'2026-10-21',previousTo:'2026-10-27'};
test('trend windows do not overlap; zero and unknown and invalid denominators remain distinct',()=>{
 const weeks=trendWindows(period.to);assert.deepEqual(weeks[0],{from:'2026-10-07',to:'2026-10-13'});assert.deepEqual(weeks[3],{from:period.from,to:period.to});
 assert.equal(trendPoint(weeks[0]!,0,0).complete,true);assert.equal(trendPoint(weeks[0]!,0,0).basket,null);
 for(const [s,o]of [[null,0],[50,0],[100,1.5],[-1,2]])assert.equal(trendPoint(weeks[0]!,s,o).complete,false);
});
test('Talabat current Lens comparison retains 14-day bounds; older placeholders never invalidate current weeks',async()=>{
 const history=Array.from({length:28},(_,i)=>({source_key:'one',revision:'r'+i,report_date:new Date(Date.parse('2026-10-07')+i*86400000).toISOString().slice(0,10),store_id:'1',present:true,orders:'5',sales:'100'})).filter((_,i)=>i!==8);
 const data={state:'SUCCESS',reportDate:period.to,receivedAt:'2026-11-04T07:00:00Z',rows:[{storeId:'1',storeName:'Kabab Fareej — Ajman',present:true,values:{'Successful Orders':'5','Gross Sales':'100'}}]};
 const db={query:async(q:any)=>{assert.equal(q.values[1],period.previousFrom);return {rows:history.filter(x=>x.report_date>=period.previousFrom)};}};
 const r:any=await readTalabatGrowth(data,db,new Date('2026-11-04T08:00Z'),4),weeks=r.rows[0].trend.weeks;
 assert.equal(weeks.length,4);assert.equal(weeks[0].sales,null);assert.equal(weeks[1].complete,false);assert.equal(weeks[1].sales,null);assert.equal(weeks[2].complete,true);assert.equal(weeks[3].orders,35);assert.equal(weeks[3].revisions.length,7);
 const ordinary:any=await readTalabatGrowth(data,{query:async(q:any)=>{assert.equal(q.values[1],period.previousFrom);return {rows:history};}},new Date('2026-11-04T08:00Z'));assert.equal(ordinary.rows[0].trend,undefined);
 const contradictory=history.map(x=>x.report_date>=period.from?{...x,orders:'0'}:x);
 const invalidData={...data,rows:data.rows.map(r=>({...r,values:{...r.values,'Successful Orders':'0'}}))};
 const invalid:any=await readTalabatGrowth(invalidData,{query:async(q:any)=>({rows:contradictory.filter(x=>x.report_date>=q.values[1]&&x.report_date<=q.values[2])})},new Date('2026-11-04T08:00Z'),4);
 assert.equal(invalid.rows[0].trend.weeks[3].complete,false);assert.equal(invalid.rows[0].trend.weeks[3].sales,null);
});
test('snapshot SQL projects authorized metrics, keeps latest revisions, rejects cross-account collisions and never leaks another shop',async()=>{
 const pg=new PGlite();await pg.exec(`CREATE TABLE keeta_performance_snapshots(period_from date,period_to date,observed_at timestamptz,run_id text,account_key text,payload jsonb);
 CREATE TABLE noon_performance_snapshots(period_from date,period_to date,observed_at timestamptz,created_at timestamptz,id text,payload jsonb);`);
 const payload=(sales:number)=>({periodFrom:period.from,periodTo:period.to,shops:[{shopId:'1',business:{shop_income:sales,shop_valid_order_num:25}},{shopId:'forbidden',business:{shop_income:999,shop_valid_order_num:2}}]});
 for(const [time,id,sales] of [['2026-11-04T01:00Z','old',100],['2026-11-04T02:00Z','new',200]] as const)await pg.query('INSERT INTO keeta_performance_snapshots VALUES ($1,$2,$3,$4,$5,$6)',[period.from,period.to,time,id,'frb-kabab',JSON.stringify(payload(sales))]);
 const noon={reports:[{scope:'STORE',restaurantId:'r',outletCode:'o',dashboard:{startDate:period.from,endDate:period.to,salesInsights:{mainInsights:{revenue:300,ordersCount:30}}}}]};
 await pg.query('INSERT INTO noon_performance_snapshots VALUES($1,$2,$3,$3,$4,$5)',[period.from,period.to,'2026-11-04T02:00Z','n',JSON.stringify(noon)]);
 const db={query:async(q:any)=>{assert.match(q.text,/ANY\(\$2::text\[\]\)/);return pg.query(q.text,q.values);}};
 const input={platforms:[{platform:'keeta',state:'SUCCESS',period,rows:[{identity:'KEETA;1',accountKey:'frb-kabab'}]},{platform:'noon',state:'SUCCESS',period,rows:[{identity:'NOON;r;o'}]}]};
 const result:any=await attachSnapshotTrends(input,db);assert.equal(result.platforms[0].rows[0].trend.weeks[3].sales,200);assert.equal(result.platforms[0].rows[0].trend.weeks[3].revision,'new');assert.equal(result.platforms[1].rows[0].trend.weeks[3].basket,10);assert.ok(!JSON.stringify(result).includes('forbidden'));assert.equal(result.platforms[0].rows[0].trend.weeks[0].complete,false);
 await pg.query('INSERT INTO keeta_performance_snapshots VALUES($1,$2,$3,$4,$5,$6)',[period.from,period.to,'2026-11-04T03:00Z','collision','frb-shawarma',JSON.stringify(payload(500))]);
 const conflict:any=await attachSnapshotTrends(input,{query:(q:any)=>pg.query(q.text,q.values)});assert.equal(conflict.platforms[0].rows[0].trend.weeks[3].reason,'SOURCE_AMBIGUOUS');
 await pg.close();
});
test('history failure is sanitized and leaves the latest comparison intact',async()=>{
 const input={platforms:[{platform:'noon',state:'SUCCESS',period,rows:[{identity:'NOON;r;o',current:{sales:20,orders:2}}]}]};
 const result:any=await attachSnapshotTrends(input,{query:async()=>{throw Error('private connection details');}});
 assert.equal(result.platforms[0].rows[0].current.sales,20);assert.equal(result.platforms[0].rows[0].trend.state,'ERROR');assert.ok(!JSON.stringify(result).includes('private'));
 const valid={platforms:[{platform:'noon',state:'SUCCESS',period,observedAt:'2026-11-04T07:00Z',rows:[{identity:'NOON;r;o',eligible:true,period,current:{sales:200,orders:20},previous:{sales:300,orders:30}}]}]};
 const fallback:any=await attachSnapshotTrends(valid,{query:async()=>{throw Error('unavailable');}});
 assert.equal(fallback.platforms[0].rows[0].trend.weeks[2].observedAt,null);assert.equal(fallback.platforms[0].rows[0].trend.weeks[3].observedAt,'2026-11-04T07:00Z');
 assert.equal(fallback.platforms[0].rows[0].trend.weeks[3].sales,200);
});
test('Talabat older SQL retains exact source revisions and gaps; failures never remove current comparison',async()=>{
 const pg=new PGlite();await pg.exec(`CREATE TABLE performance_report_current(revision_id text,source_key text,report_date date,requested_at timestamptz);
 CREATE TABLE performance_report_revisions(revision_id text,source_key text,report_date date,requested_at timestamptz,received_at timestamptz);
 CREATE TABLE performance_report_rows(revision_id text,store_id text,present boolean,source_values jsonb);`);
 for(let i=0;i<7;i++){
  const date=new Date(Date.parse('2026-10-07')+i*86400000).toISOString().slice(0,10),id='r'+i;
  await pg.query('INSERT INTO performance_report_current VALUES($1,$2,$3,$4)',[id,'allowed',date,'2026-11-04T01:00Z']);
  await pg.query('INSERT INTO performance_report_revisions VALUES($1,$2,$3,$4,$4)',[id,'allowed',date,'2026-11-04T01:00Z']);
  await pg.query('INSERT INTO performance_report_rows VALUES($1,$2,true,$3)',[id,'1',JSON.stringify({'Gross Sales':'100','Successful Orders':'5'})]);
 }
 // Carry a missing published sales field from an older revision; ignore future revisions and other sources.
 for(const [revision,source,at,sales]of [['prior','allowed','2026-11-03T01:00Z','50'],['future','allowed','2026-11-05T01:00Z','9999'],['forbidden','other','2026-11-04T01:00Z','9999']]){
  await pg.query('INSERT INTO performance_report_revisions VALUES($1,$2,$3,$4,$4)',[revision,source,'2026-10-07',at]);
  await pg.query('INSERT INTO performance_report_rows VALUES($1,$2,true,$3)',[revision,'1',JSON.stringify({'Gross Sales':sales,'Successful Orders':'5'})]);
 }
 await pg.query(`UPDATE performance_report_rows SET source_values='{"Gross Sales":null,"Successful Orders":"5"}' WHERE revision_id='r0'`);
 await pg.query('INSERT INTO performance_report_current VALUES($1,$2,$3,$4)',['forbidden','other','2026-10-07','2026-11-04T01:00Z']);
 const weeks=trendWindows(period.to).map(w=>trendPoint(w,500,25));const input={platforms:[{platform:'talabat',state:'SUCCESS',period,historySourceKey:'allowed',rows:[{identity:'TB_AE;1',eligible:true,current:{sales:500,orders:25},trend:{state:'SUCCESS',weeks}}]}]};
 const result:any=await attachSnapshotTrends(input,{query:(q:any)=>pg.query(q.text,q.values)});
 assert.equal(result.platforms[0].rows[0].trend.weeks[0].sales,650);assert.equal(result.platforms[0].rows[0].trend.weeks[1].complete,false);assert.equal(result.platforms[0].rows[0].trend.weeks[3].sales,500);
 await pg.query(`UPDATE performance_report_rows SET source_values='{"Gross Sales":"100","Successful Orders":"0"}'`);
 const invalid:any=await attachSnapshotTrends(input,{query:(q:any)=>pg.query(q.text,q.values)});assert.equal(invalid.platforms[0].rows[0].trend.weeks[0].complete,false);
 const failed:any=await attachSnapshotTrends(input,{query:async()=>{throw Error('timeout');}});assert.equal(failed.platforms[0].rows[0].current.sales,500);assert.equal(failed.platforms[0].rows[0].trend.weeks[3].sales,500);assert.equal(failed.platforms[0].state,'SUCCESS');await pg.close();
});
test('priority lists are per platform, measured loss first; repeated declines stop at gaps and markup is escaped',()=>{
 const context:any={};vm.createContext(context);vm.runInContext(fs.readFileSync('public/lens-trends.js','utf8'),context);const core=context.LensTrends;
 const row=(sales:number,orders:number)=>({current:{sales,orders},previous:{sales:1000,orders:30}}),groups=[{id:'one',name:'<unsafe>',entries:[{platform:'talabat',row:row(500,30)},{platform:'noon',row:row(400,2)}]},{id:'two',name:'Other',entries:[{platform:'talabat',row:row(100,10)}]}];
 const assess=(e:any)=>({valid:true,change:e.row.current.sales-e.row.previous.sales});const p=core.priorities(groups,assess);assert.equal(p[0].rows[0].group,'two');assert.equal(p[1].rows.length,1);assert.equal(p[1].rows[0].strong,false);
 assert.ok(core.priorityView(groups,assess,'fa').includes('&lt;unsafe&gt;'));assert.ok(!core.priorityView(groups,assess,'fa').includes('<unsafe>'));
 assert.equal(core.movement([{complete:true,sales:400},{complete:false,sales:null},{complete:true,sales:200},{complete:true,sales:100}]),1);
 assert.equal(core.movement([400,300,200,100].map(sales=>({complete:true,sales}))),3);
});
test('weekly and provenance disclosure state survives repaint and clears on auth reset',()=>{
 const events:any={},context:any={document:{addEventListener:(name:string,fn:any)=>events[name]=fn}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/lens-trends.js','utf8'),context);
 const group={id:'one',entries:[{platform:'talabat',row:{trend:{state:'SUCCESS',weeks:[{from:period.from,to:period.to,sales:100,orders:20,complete:true}]}}}]};
 for(const key of ['trend:one','provenance:one:talabat'])events.toggle({target:{dataset:{lensDisclosure:key},open:true}});
 const html=context.LensTrends.render(group,'fa');assert.match(html,/data-lens-disclosure="trend:one" open/);assert.match(html,/data-lens-disclosure="provenance:one:talabat" open/);
 events['rcc-auth-reset']();assert.ok(!context.LensTrends.render(group,'en').includes('" open'));
});
