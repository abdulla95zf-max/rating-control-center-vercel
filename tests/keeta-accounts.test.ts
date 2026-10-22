import test from 'node:test';import assert from 'node:assert/strict';
import {mergeKeetaAccounts} from '../src/services/keeta-account-merge.ts';
import {scopeKeetaSnapshot} from '../src/services/keeta-snapshot-scope.ts';
const payload=(id:string)=>({periodFrom:'2026-10-15',periodTo:'2026-10-21',comparisonFrom:'2026-10-08',comparisonTo:'2026-10-14',shops:[{shopId:id,shopName:'Brand '+id,business:{shop_income:100}}],customers:{pay:[{value:9}],frequency:[],conversion:[],byShop:[{shopId:id,pay:[{value:3}]}]},items:[{product:'Brand '+id}],itemsByShop:[{shopId:id,items:[{product:id}]}],coverage:{business:true,service:true,opening:1,ready:1,customers:3,items:true,itemStores:1}});
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
