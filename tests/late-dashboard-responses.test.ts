import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const source=(name:string)=>fs.readFileSync(new URL('../public/'+name,import.meta.url),'utf8').replace(/\r\n/g,'\n');
function harness(){
 const requests:any[]=[];
 const main={innerHTML:'new page'};
 const context=vm.createContext({Intl,URLSearchParams,main,state:{tab:'keeta-performance'},document:{getElementById:()=>null},api:()=>new Promise((resolve,reject)=>requests.push({resolve,reject}))});
 vm.runInContext(source('keeta-performance.js')+'\n'+source('growth.js'),context);
 const reset=source('app.js').match(/document.addEventListener\('rcc-auth-reset',\(\)=>\{([\s\S]*?)\n\}\);/)![1];
 // Execute the production reset clauses for these two loaders.
 const clauses=reset.split('\n').filter(line=>line.includes("typeof keetaPerformanceState")||line.includes("typeof growthState")).join('\n');
 return {requests,main,run:(code:string)=>vm.runInContext(code,context),reset:()=>vm.runInContext(clauses,context)};
}
test('Keeta late failure cannot overwrite a different page',async()=>{
 const h=harness();const pending=h.run('renderKeetaPerformance(true)');h.run("state.tab='growth'");h.main.innerHTML='Growth page';h.requests[0].reject(Error('late failure'));await pending;assert.equal(h.main.innerHTML,'Growth page');
});
test('Keeta old success and failure after auth reset cannot repopulate cache or paint',async()=>{
 for(const fail of [false,true]){const h=harness();const pending=h.run('renderKeetaPerformance(true)');h.reset();h.main.innerHTML='new login';if(fail)h.requests[0].reject(Error('old account'));else h.requests[0].resolve({snapshot:{oldAccount:true}});await pending;assert.equal(h.run('keetaPerformanceState.cache'),null);assert.equal(h.main.innerHTML,'new login');assert.equal(h.run('keetaPerformanceState.loading'),false);}
});
test('Growth old auth response cannot cache data or clear a new account pending request',async()=>{
 const h=harness();const old=h.run('grLoad()');const rejected=assert.rejects(old,/AUTH_STATE_CHANGED/);h.reset();const fresh=h.run('grLoad()');h.requests[0].resolve({account:'old'});await rejected;assert.equal(h.run('growthState.cache'),null);assert.equal(h.run('growthState.pending!==null'),true);h.requests[1].resolve({account:'new'});await fresh;assert.equal(h.run('growthState.cache.account'),'new');assert.equal(h.run('growthState.pending'),null);
});
test('Growth deduplicates current-account requests and retains fresh cache',async()=>{
 const h=harness();const first=h.run('grLoad()'),second=h.run('grLoad()');assert.equal(h.requests.length,1);h.requests[0].resolve({account:'current'});await Promise.all([first,second]);await h.run('grLoad()');assert.equal(h.requests.length,1);
});

test('old API 401 cannot expire a newer login',async()=>{
 let resolve:any,expired=0;
 const c=vm.createContext({fetch:()=>new Promise(r=>resolve=r),dashboardAuth:{expired:()=>expired++}});
 const apiSource=source('app.js').match(/let apiAuthGeneration=0;[\s\S]*?\n}\n/)![0];
 vm.runInContext(apiSource,c);const old=vm.runInContext("api('/old')",c);const rejected=assert.rejects(old,/AUTH_STATE_CHANGED/);vm.runInContext('++apiAuthGeneration',c);resolve({status:401,ok:false,json:async()=>({error:'expired'})});await rejected;assert.equal(expired,0);
});

test('Growth partial error cache expires quickly while successful reports stay cached',async()=>{
 const h=harness();const first=h.run('grLoad()');h.requests[0].resolve({platforms:[{state:'ERROR'}]});await first;
 h.run('growthState.checkedAt=Date.now()-16000');const retry=h.run('grLoad()');assert.equal(h.requests.length,2);h.requests[1].resolve({platforms:[{state:'SUCCESS'}]});await retry;h.run('growthState.checkedAt=Date.now()-16000');await h.run('grLoad()');assert.equal(h.requests.length,2);
});
