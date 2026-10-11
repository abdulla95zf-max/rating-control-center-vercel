import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('display aliases join cross-platform ratings without changing identities or dropping same-platform outlets',()=>{
 const context:any={};vm.createContext(context);vm.runInContext(fs.readFileSync('public/branch-labels.js','utf8'),context);
 const source=fs.readFileSync('public/app.js','utf8');vm.runInContext(source.slice(source.indexOf('const brandRules ='),source.indexOf('const severity =')),context);
 for(const [first,second] of [['FRB Kabab, Al Bdai\'a Subrub','FRB Kabab - Hay Hoshi'],['FRB Kabab, Al Hamidiya 2','FRB Kabab - Ajman'],['Kabab Al Sham, Ras Al Khor Industrial Area 3','Kabab Al Sham - Aweer']]){
  context.rows=[{platform:'talabat',storeName:first,storeIdentityKey:'t',rating:3.6},{platform:'noon',storeName:second,storeIdentityKey:'n',rating:4.1}];
  const groups=vm.runInContext('groupCloudRows(rows)',context);assert.equal(groups.length,1,first);assert.equal(groups[0].rows.length,2);assert.equal(groups[0].rows.find((r:any)=>r.platform==='talabat').storeIdentityKey,'t');assert.equal(groups[0].rows.find((r:any)=>r.platform==='noon').rating,4.1);
  context.rows.push({...context.rows[0],storeIdentityKey:'other',rating:4.5});const duplicate=vm.runInContext('groupCloudRows(rows)',context);assert.equal(duplicate.length,2);assert.equal(new Set(duplicate.map((g:any)=>g.key)).size,2);assert.equal(duplicate.reduce((n:number,g:any)=>n+g.rows.length,0),3);
 }
 assert.equal(context.BranchLabels.branch('Oud Al Muteena'),'Muteena');assert.equal(context.BranchLabels.branch('Muteena'),'Muteena');
});
test('Deliveroo background refresh retains the view on unchanged data, read errors and missing snapshots',async()=>{
 const button:any={disabled:false,textContent:'Refresh saved data'},main:any={innerHTML:'selected branch and open chart',dataset:{doPeriod:'7'},querySelector:()=>button};const status:any={textContent:''};let resolve:any;
 const context:any={main,document:{getElementById:()=>button},refreshState:{querySelector:()=>status},state:{tab:'deliveroo-operations'},api:()=>new Promise(r=>resolve=r),Date,JSON};vm.createContext(context);vm.runInContext(fs.readFileSync('public/deliveroo-operations.js','utf8'),context);
 vm.runInContext("deliverooOperationsState.cache={state:'SUCCESS',snapshot:{rows:[]}};deliverooOperationsState.branch='621364'",context);
 for(const data of [{state:'SUCCESS',snapshot:{rows:[]}},{state:'ERROR'},{state:'EMPTY'}]){
  const promise=vm.runInContext('renderDeliverooOperations(true)',context);assert.equal(main.innerHTML,'selected branch and open chart');assert.equal(button.disabled,true);await vm.runInContext('renderDeliverooOperations(true)',context);resolve(data);await promise;assert.equal(main.innerHTML,'selected branch and open chart');assert.equal(button.disabled,false);assert.equal(vm.runInContext('deliverooOperationsState.branch',context),'621364');
 }
 assert.match(status.textContent,/Update failed/);
});
