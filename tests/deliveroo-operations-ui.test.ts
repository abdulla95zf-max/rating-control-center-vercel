import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
import {readDeliverooOperations} from '../src/services/deliveroo-operations.ts';
test('UI switches period values, shows source mismatch, hides zero-order prep and renders scoped data only',async()=>{
 const body=fs.readFileSync('public/deliveroo-operations.js','utf8'),main:any={innerHTML:'',querySelectorAll:()=>[]};
 const context:any={main,document:{getElementById:()=>null},refreshState:{querySelector:()=>({})},escapeHtml:(v:any)=>String(v??'').replace(/[<>&"]/g,(c:string)=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])),ago:()=>'',Intl,Date,console};vm.createContext(context);vm.runInContext(body,context);
 for(const days of [7,30]){const fixture=JSON.parse(fs.readFileSync(`tests/fixtures/operations-${days}.json`,'utf8'));const data=await readDeliverooOperations(days,{query:async()=>({rows:[{payload:fixture}]})});context.data=data;context.days=days;
 vm.runInContext("deliverooOperationsState.cache=data;deliverooOperationsState.days=days;deliverooOperationsState.branch='621364';paintDeliverooOperations();",context);
 assert.ok(main.innerHTML.includes(days===7?'77':'356'));assert.ok(main.innerHTML.includes(days===7?'2026-10-03':'2026-09-10'));assert.ok(!main.innerHTML.includes('style='));
 vm.runInContext("deliverooOperationsState.branch='621379';paintDeliverooOperations();",context);assert.ok(main.innerHTML.includes('Your prep time</span><strong class="kpi-value">—'));
 if(days===30){vm.runInContext("deliverooOperationsState.branch='621377';paintDeliverooOperations();",context);assert.ok(main.innerHTML.includes('card and daily-chart sources differ'));}
 context.data={...data,snapshot:{...data.snapshot,rows:[data.snapshot.rows.find((r:any)=>r.storeId==='621364')]}};vm.runInContext("deliverooOperationsState.cache=data;deliverooOperationsState.branch='';paintDeliverooOperations();",context);assert.ok(!main.innerHTML.includes('FRB Kabab'));assert.ok(!main.innerHTML.includes('data-do-branch="621377"'));
 }
});
test('daily Deliveroo rating freshness stays live through the next day and detects missed runs',()=>{
 const source=fs.readFileSync('public/app.js','utf8'),start=source.indexOf('function cloudHealth(result)'),end=source.indexOf('function noonSessionWarning',start);
 const now=Date.parse('2026-10-10T12:00:00Z');class Clock extends Date{static now(){return now;}}
 const context:any={Date:Clock,timestamp:Date.parse};vm.createContext(context);vm.runInContext(source.slice(start,end),context);
 for(const [hours,expected]of [[6,'LIVE'],[24,'LIVE'],[27,'DELAYED'],[49,'STALE']] as const){const r={platform:'deliveroo',state:'SUCCESS',syncTimestamp:new Date(now-hours*3600000).toISOString()};assert.equal(context.cloudHealth(r),expected);}
 assert.equal(context.cloudHealth({platform:'talabat',state:'SUCCESS',syncTimestamp:new Date(now-6*3600000).toISOString()}),'DELAYED');
});
