import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function visuals(){const c:any={Intl,document:{getElementById:()=>null,body:{classList:{contains:()=>false}}}};vm.createContext(c);vm.runInContext(fs.readFileSync('public/frb-visuals.js','utf8'),c);return c.FRBVisuals;}
test('branch bars preserve zero versus missing, use one scale including previous, and escape labels under CSP',()=>{
 const html=visuals().chartBody({title:'Sales',rows:[{label:'<img src=x onerror=x>',value:10,old:20},{label:'Zero',value:0,old:0},{label:'Unknown',value:null,old:5}],metrics:[{key:'value',previous:'old',label:'Sales',unit:'AED'}]},'value');
 assert.match(html,/frb-bar-current" width="500"/);assert.match(html,/frb-bar-previous" y="13" width="1000"/);assert.match(html,/frb-bar-current" width="0"/);assert.match(html,/1 unavailable/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img|style=|NaN|Infinity/);
});
test('stage charts keep source order while ranked charts show the largest metric first',()=>{
 const c={title:'Stages',rows:[{label:'First stage',n:2},{label:'Second stage',n:10}],metrics:[{key:'n',label:'Count'}]};
 const ranked=visuals().chartBody(c,'n'),stages=visuals().chartBody({...c,rank:false},'n');
 assert.ok(ranked.indexOf('Second stage')<ranked.indexOf('First stage'));assert.ok(stages.indexOf('First stage')<stages.indexOf('Second stage'));
});
test('meal composition explicitly distinguishes reported denominator and retains missing data',()=>{
 const api=visuals(),html=api.composition({title:'Meal mix',rows:[{label:'Breakfast',value:2},{label:'Dinner',value:6}],denominator:10,period:'11–17 Oct'});
 assert.match(html,/total differs/);assert.match(html,/25%/);assert.match(html,/75%/);assert.match(html,/reported orders/);assert.doesNotMatch(html,/style=|NaN|Infinity/);
 const missing=api.composition({title:'Mix',rows:[{label:'Dinner',value:null}],denominator:10});assert.match(missing,/unavailable/);assert.doesNotMatch(missing,/<circle/);
 const zero=api.composition({title:'Mix',rows:[{label:'Dinner',value:0}],denominator:0});assert.match(zero,/No orders/);assert.doesNotMatch(zero,/NaN/);
});
test('review inbox keeps order identity visible and moves unavailable metadata into a closed disclosure',()=>{
 const c:any={Intl,Date,escapeHtml:(s:any)=>String(s).replaceAll('<','&lt;'),BranchLabels:{full:(s:any)=>s}};vm.createContext(c);vm.runInContext(fs.readFileSync('public/talabat-reviews.js','utf8'),c);
 const html=c.reviewArticle({globalVendorCode:'TB_AE;1',id:'r',rating:3,storeName:'Sample',date:'2026-10-17T12:00:00Z',orderId:'123',text:'Good',orderLinkState:'SOURCE_LINKED'});
 assert.match(html,/<summary>Order 123/);assert.match(html,/Customer history unavailable/);assert.match(html,/details pending/);assert.doesNotMatch(html,/<details[^>]*\bopen\b/);assert.ok(html.indexOf('review-meta-body')<html.indexOf('Customer history unavailable'));
});
test('Keeta customer bars render under strict CSP without converting missing values to zero',()=>{
 const c:any={Intl,escapeHtml:String};vm.createContext(c);vm.runInContext(fs.readFileSync('public/keeta-performance.js','utf8'),c);
 const html=c.kpBar(25,100,'Customers','#19b99c');assert.match(html,/width="250"/);assert.doesNotMatch(html,/style=/);
 assert.match(c.kpBar(null,100,'Unknown','#94a3b8'),/<strong>—/);assert.doesNotMatch(c.kpBar(null,100,'Unknown','#94a3b8'),/<strong>0/);
});
