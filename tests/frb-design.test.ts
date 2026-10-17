import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function overview(counts:Record<string,number>,total:number,platforms:any[]=[]){const context:any={Intl,document:{getElementById:()=>null,querySelector:()=>null}};vm.createContext(context);vm.runInContext(fs.readFileSync('public/frb-design.js','utf8'),context);return context.FRBDesign.overview({counts,total,platforms});}
test('empty authorized ratings never become an all-clear summary',()=>{
 const html=overview({HEALTHY:0,ACCEPTABLE:0,WARNING:0,CRITICAL:0,UNKNOWN:0},0,[{state:'ERROR'}]);
 assert.match(html,/No branch ratings/);assert.match(html,/Check the source status/);assert.match(html,/0 \/ 1 ratings sources successful/);assert.match(html,/disabled/);assert.doesNotMatch(html,/No branches are currently marked critical/);
});
test('unknown-only portfolio directs attention to missing evidence instead of healthy ratings',()=>{
 const html=overview({HEALTHY:0,ACCEPTABLE:0,WARNING:0,CRITICAL:0,UNKNOWN:4},4,[{state:'SUCCESS'}]);
 assert.match(html,/data-status="UNKNOWN"/);assert.match(html,/before treating the portfolio as clear/);assert.match(html,/Unknown: 4/);assert.doesNotMatch(html,/No branches are currently marked critical/);
});
test('warning-only portfolio opens warnings and retains separate source success and freshness concepts',()=>{
 const html=overview({HEALTHY:2,ACCEPTABLE:0,WARNING:3,CRITICAL:0,UNKNOWN:1},6,[{state:'SUCCESS'},{state:'ERROR'},{state:'EMPTY'}]);
 assert.match(html,/data-status="WARNING"/);assert.match(html,/Review warning/);assert.match(html,/3 branches/);assert.match(html,/1 \/ 3 ratings sources successful/);assert.match(html,/Unknown: 1/);assert.doesNotMatch(html,/all sources live/i);
});
test('approved light default preserves explicit theme preferences and works without browser storage',()=>{
 for(const saved of [null,'dark','light','blocked']){
  const root:any={dataset:{},style:{}};const context:any={localStorage:{getItem:()=>{if(saved==='blocked')throw Error('unavailable');return saved;}},document:{documentElement:root,querySelector:()=>null,querySelectorAll:()=>[],addEventListener:()=>{}},addEventListener:()=>{}};
  vm.createContext(context);vm.runInContext(fs.readFileSync('public/theme.js','utf8'),context);assert.equal(root.dataset.theme,saved==='dark'?'dark':'light');assert.equal(root.style.colorScheme,root.dataset.theme);
 }
});
