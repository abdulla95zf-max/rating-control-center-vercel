import test from 'node:test';import assert from 'node:assert/strict';
import {mergeKeetaAccounts,keetaAccountShopName} from '../src/services/keeta-account-merge.ts';
import {scopeKeetaSnapshot} from '../src/services/keeta-snapshot-scope.ts';
import {branchIdentity} from '../src/services/branch-identity.ts';
test('account identity supplies brand when Keeta shop codes contain only a location',()=>{
 for(const [profile,raw,expected,brand] of [['frb-shawarma','FRB-Barsha','FRB Shawarma — Barsha','FRB Shawarma'],['frb-kabab','FRB- Um Aldaman','FRB Kabab — Um Aldaman','FRB Kabab'],['kabab-al-sham','KS - Twar','Kabab Al Sham — Twar','Kabab Al Sham'],['taazaa-mumbai','RAK','Taazaa Mumbai — RAK','Taazaa Mumbai']]){const name=keetaAccountShopName(profile,raw);assert.equal(name,expected);assert.equal(branchIdentity(name).brand,brand);}
 assert.equal(keetaAccountShopName('kabab-fareej','KF - Ajman'),'KF - Ajman');
 assert.equal(keetaAccountShopName('frb-kabab','FRB Kabab — Ajman'),'FRB Kabab — Ajman');
});
const payload=(id:string)=>({periodFrom:'2026-10-15',periodTo:'2026-10-21',comparisonFrom:'2026-10-08',comparisonTo:'2026-10-14',shops:[{shopId:id,shopName:'Brand '+id,business:{shop_income:100}}],customers:{pay:[{value:9}],frequency:[],conversion:[],byShop:[{shopId:id,pay:[{value:3}]}]},items:[{product:'Brand '+id}],itemsByShop:[{shopId:id,items:[{product:id}]}],coverage:{business:true,service:true,opening:1,ready:1,customers:3,items:true,itemStores:1}});
test('unverified historical frequency is withheld without hiding sales, pay or conversion; verified snapshots retain it',()=>{
 const source:any=payload('1');source.customers.frequency=[{value:'35.28%'}];source.customers.byShop[0].frequency=[{value:'35.28%'}];
 const read=()=>mergeKeetaAccounts([{accountKey:'frb-shawarma',payload:source,observedAt:'2026-10-22T08:00:00Z'}]);
 const old=read();assert.deepEqual(old.customers.frequency,[]);assert.deepEqual(old.customers.byShop[0].frequency,[]);assert.equal(old.customers.pay[0].value,9);assert.equal(old.shops[0].business.shop_income,100);assert.equal(source.customers.frequency[0].value,'35.28%');
 source.coverage.frequencyContextVerified=true;const current=read();assert.equal(current.customers.frequency[0].value,'35.28%');assert.equal(current.coverage.customers,3);
});
test('reports retain all accounts, choose latest per account, and never sum brand unique customers',()=>{
 const result=mergeKeetaAccounts([{accountKey:'kabab-fareej',payload:payload('1'),observedAt:'2026-10-22T04:00:00Z'},{accountKey:'frb-shawarma',payload:payload('2'),observedAt:'2026-10-22T05:00:00Z'}]);
 assert.equal(result.shops.length,2);assert.equal(result.observedAt,'2026-10-22T04:00:00.000Z');assert.deepEqual(result.customers.pay,[]);assert.deepEqual(result.items,[]);assert.equal(result.customers.byShop.length,2);
 const scoped=scopeKeetaSnapshot(result,new Set(['2']));assert.deepEqual(scoped.customers.pay,[{value:9}]);assert.deepEqual(scoped.items,[{product:'Brand 2'}]);assert.equal(scoped.accountReports.length,1);assert.deepEqual(scoped.accountReports[0].shopIds,['2']);assert.equal(scoped.shops.length,1);
});
test('partial branch access cannot reveal another account or its unique-customer/product aggregates',()=>{
 const one=payload('1');one.shops.push({shopId:'3',shopName:'Other',business:{shop_income:100}});
 const result=mergeKeetaAccounts([{accountKey:'kabab-fareej',payload:one,observedAt:'2026-10-22T04:00:00Z'},{accountKey:'frb-shawarma',payload:payload('2'),observedAt:'2026-10-22T05:00:00Z'}]);
 const scoped=scopeKeetaSnapshot(result,new Set(['1']));assert.deepEqual(scoped.accountReports,[]);assert.deepEqual(scoped.customers.pay,[]);assert.deepEqual(scoped.items,[]);assert.equal(scoped.brandScopeAvailable,false);
});
test('different periods remain explicitly missing and duplicate shop ownership fails closed',()=>{
 const rows=[{accountKey:'kabab-fareej',payload:payload('1'),observedAt:'2026-10-22T04:00:00Z'},{accountKey:'frb-shawarma',payload:{...payload('2'),periodTo:'2026-10-20'},observedAt:'2026-10-22T05:00:00Z'}];
 const result=mergeKeetaAccounts(rows);assert.equal(result.shops.length,1);assert.deepEqual(result.accountCoverage.missing,['frb-shawarma']);
 rows[1]!.payload=payload('1');assert.throws(()=>mergeKeetaAccounts(rows),/SCOPE_CONFLICT/);
});
