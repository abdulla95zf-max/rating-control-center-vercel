import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const context=vm.createContext({Intl,Date});vm.runInContext(fs.readFileSync('public/lens-early-warning.js','utf8'),context);const api=context.LensEarlyWarnings;
const shift=(d:string,n:number)=>new Date(Date.parse(d)+n*86400000).toISOString().slice(0,10);
function entry(sales=[1200,1100,1000,850],orders=[100,90,80,65],platform='talabat'){
 const weeks=sales.map((s,i)=>({from:shift('2026-10-22',i*7),to:shift('2026-10-28',i*7),sales:s,orders:orders[i],complete:true}));
 const current=weeks[3]!,previous=weeks[2]!;return {platform,row:{eligible:true,period:{from:current.from,to:current.to,previousFrom:previous.from,previousTo:previous.to},current:{sales:current.sales,orders:current.orders},previous:{sales:previous.sales,orders:previous.orders},trend:{state:'SUCCESS',weeks}}};
}
const group=(id:string,e:any)=>({id,name:id,entries:[e]});const assess=()=>({valid:true});
test('repeated falls require complete contiguous windows, exact current comparison and eligible sample',()=>{
 const base=entry();assert.equal(api.screen(base,assess()).item.steps,3);
 for(const change of [(e:any)=>e.row.trend.weeks[2].complete=false,(e:any)=>e.row.trend.weeks[2].from='2026-10-01',(e:any)=>e.row.current.sales=999,(e:any)=>e.row.eligible=false,(e:any)=>e.row.trend.state='ERROR']){const e=entry();change(e);assert.equal(api.screen(e,assess()).item,undefined);}
 const weak=entry(undefined,[100,90,19,15]);assert.equal(api.screen(weak,assess()).reason,'LOW_SAMPLE');
 const missingOld=entry();missingOld.row.trend.weeks[0]!.complete=false;assert.equal(api.screen(missingOld,assess()).item.weeks.length,3);
});
test('tiny fluctuations, recovery and sales/orders divergence stay distinct',()=>{
 assert.equal(api.screen(entry([1000,999,998,997],[100,100,100,100]),assess()).item,undefined);
 assert.equal(api.screen(entry([1200,1100,1000,1200],[100,90,80,100]),assess()).item,undefined);
 const demand=api.screen(entry([1000,1100,1200,1300],[100,90,80,65]),assess()).item;assert.equal(demand.loss,0);assert.ok(demand.salesDrop<0);assert.ok(demand.orderDrop>0);
 const html=api.render([group('Demand',entry([1000,1100,1200,1300],[100,90,80,65]))],assess,'en');assert.match(html,/No latest-week sales decline/);assert.match(html,/\+30%/);
});
test('ranking uses the same latest-week span; weekly components reconcile exactly',()=>{
 const a=entry(),b=entry([5000,4000,3000,2900]);const d=api.collect([group('A',a),group('B',b)],assess);assert.equal(d.periods[0].rows[0].id,'A');
 const row=d.periods[0].rows[0];assert.ok(Math.abs(row.orderEffect+row.basketEffect-(a.row.current.sales-a.row.previous.sales))<1e-8);
 const other=entry(undefined,undefined,'keeta');const split=api.collect([group('A',a),group('K',other)],assess);assert.equal(split.periods.length,2);
 const dates=entry();dates.row.period={...dates.row.period,from:shift(dates.row.period.from,-7),to:shift(dates.row.period.to,-7),previousFrom:shift(dates.row.period.previousFrom,-7),previousTo:shift(dates.row.period.previousTo,-7)};dates.row.trend.weeks=dates.row.trend.weeks.map(w=>({...w,from:shift(w.from,-7),to:shift(w.to,-7)}));assert.equal(api.collect([group('A',a),group('D',dates)],assess).periods.length,2);
});
test('duplicate same-platform sources cannot contribute ranked rows; unsupported sales sources are excluded',()=>{
 const e=entry(),duplicate={id:'collision',name:'Collision',entries:[e,entry()]};assert.equal(api.collect([duplicate],assess).periods.length,0);assert.equal(api.collect([duplicate],assess).excluded.CONFLICT,2);
 assert.equal(api.collect([group('D',entry(undefined,undefined,'deliveroo'))],assess).inspected,0);
});
test('context keeps exact latest two-week dates and independently dated authorized ratings',()=>{
 const e:any=entry();e.row.diagnostics={matched:true,period:e.row.period,funnel:{kind:'customers',stages:[{code:'visitors',current:100,previous:200}]},operations:[{code:'offline',unit:'percent',current:5,previous:1}]};
 const g=group('<Branch>',e),ratings=()=>[{platform:'talabat',rating:3.9,timestamp:'2026-11-19T07:00:00Z',previousRating:4.2,previousTimestamp:'2026-11-18T07:00:00Z'}];
 const html=api.render([g],assess,'en',ratings);assert.match(html,/Context below compares only the latest two weeks/);assert.match(html,/Independent latest rating snapshot/);assert.match(html,/&lt;Branch&gt;/);assert.match(html,/data-lens-priority="&lt;Branch&gt;"/);
 e.row.diagnostics.period={...e.row.period,from:'2020-01-01'};assert.doesNotMatch(api.render([g],assess,'en',ratings),/200 → 100/);
 const fa=api.render([g],assess,'fa',()=>[]);assert.match(fa,/توجه زودهنگام/);assert.match(fa,/در دسترس نیست/);
});
