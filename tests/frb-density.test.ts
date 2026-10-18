import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
function keeta(){const c:any={Intl,escapeHtml:(s:string)=>s.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!)),storeIdentity:({storeName}:any)=>({displayName:storeName})};vm.createContext(c);vm.runInContext(fs.readFileSync('public/keeta-performance.js','utf8'),c);return c;}
const snapshot=()=>({shops:[{shopId:'a',shopName:'Kabab Fareej — Hoshi'}],items:Array.from({length:9},(_,i)=>({shop_brand_product_info:JSON.stringify({name:'Item '+i}),shop_brand_salevm:String(i),shop_brand_expose_uv:String(100+i)})),itemsByShop:[{shopId:'a',complete:true,items:[{shop_product_name:'Branch-only item',shop_salevm:'21'}]}],customers:{},coverage:{items:true}});
test('Keeta shows the top five by volume, expands to all, and preserves exact branch scope and search',()=>{
 const c=keeta();c.snap=snapshot();let html=vm.runInContext('kpItems(snap)',c);
 assert.equal((html.match(/<tbody>[\s\S]*?<\/tbody>/)![0].match(/<tr>/g)||[]).length,5);assert.ok(html.indexOf('Item 8')<html.indexOf('Item 7'));assert.doesNotMatch(html,/Item 0<\/td>/);assert.match(html,/View all 9 items/);
 vm.runInContext('keetaPerformanceState.itemExpanded=true',c);html=vm.runInContext('kpItems(snap)',c);assert.equal((html.match(/<tr>/g)||[]).length,10);assert.match(html,/Show top 5/);
 vm.runInContext("keetaPerformanceState.itemShop='a';keetaPerformanceState.itemExpanded=false",c);html=vm.runInContext('kpItems(snap)',c);assert.match(html,/Branch-only item/);assert.doesNotMatch(html,/Item 8/);
 vm.runInContext("keetaPerformanceState.itemShop='all';keetaPerformanceState.search='Item 3'",c);html=vm.runInContext('kpItems(snap)',c);assert.match(html,/1 of 1 matching/);assert.doesNotMatch(html,/Item 8/);
});
test('Keeta Visible columns starts open and honors a deliberate close',()=>{
 const c=keeta();c.snap=snapshot();assert.match(vm.runInContext('kpCustomerTable(snap)',c),/<details class="kp-columns" open>/);vm.runInContext('keetaPerformanceState.columnsOpen=false',c);assert.doesNotMatch(vm.runInContext('kpCustomerTable(snap)',c),/<details class="kp-columns" open/);
});
test('supplied logos map to confirmed brand identities and never substitute a different brand logo',()=>{
 const c:any={};vm.createContext(c);vm.runInContext(fs.readFileSync('public/brand-cards.js','utf8'),c);
 assert.equal(c.FRBBrands.asset('FRB Kabab'),'/brands/frb-kabab.png');assert.equal(c.FRBBrands.asset('FRB Shawarma'),'/brands/frb-shawarma.png');assert.equal(c.FRBBrands.asset('Taazaa Mumbai'),'/brands/taazaa-mumbai.png');assert.equal(c.FRBBrands.asset('Leekh'),null);assert.equal(c.FRBBrands.match('Kabab Fareej — Hoshi'),'/brands/kabab-fareej.png');assert.equal(c.FRBBrands.match('Unknown Kabab Fareej'),null);
 for(const name of ['Kabab Fareej','FRB Kabab','FRB Shawarma','Kabab Al Sham','Morwarid','Taazaa Mumbai'])assert.ok(fs.existsSync('public'+c.FRBBrands.asset(name)));
});
test('wait distribution uses one source count scale and distinguishes unknown from genuine zero',()=>{
 const c:any={Intl,escapeHtml:String};vm.createContext(c);vm.runInContext(fs.readFileSync('public/noon-performance.js','utf8'),c);
 const html=c.npWaitBuckets([['Under 5',100],['5–10',0],['Over 10',null]]);assert.match(html,/width="1000"/);assert.match(html,/width="0"/);assert.match(html,/— orders/);assert.doesNotMatch(html,/style=|NaN|Infinity/);
});
test('Noon item list defaults to five highest quantities and expands without changing source totals',()=>{
 const c:any={Intl,escapeHtml:String};vm.createContext(c);vm.runInContext(fs.readFileSync('public/noon-performance.js','utf8'),c);
 const rows=[{items:Array.from({length:8},(_,i)=>({itemName:'Meal '+i,categoryName:'Meals',price:'10',quantity:i+1,revenue:(i+1)*10}))}];
 c.rows=rows;let html=vm.runInContext('npItemTable(rows,{revenue:360})',c);assert.match(html,/Top sellers/);assert.match(html,/View all 8 items/);assert.equal((html.match(/<tr>/g)||[]).length,6);assert.ok(html.indexOf('Meal 7')<html.indexOf('Meal 6'));assert.doesNotMatch(html,/Meal 0<\/strong>/);
 vm.runInContext('noonPerformanceState.expanded=true',c);html=vm.runInContext('npItemTable(rows,{revenue:360})',c);assert.equal((html.match(/<tr>/g)||[]).length,9);assert.match(html,/Show top 5/);assert.match(html,/Item revenue 360 AED/);
});
