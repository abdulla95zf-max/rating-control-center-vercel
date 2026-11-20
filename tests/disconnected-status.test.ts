import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
test('disconnected view replaces previous platform freshness without fetching data',()=>{
 const source=fs.readFileSync('public/app.js','utf8'),label={textContent:'Deliveroo daily Operations · FRESH'},dot={dataset:{health:'LIVE'}},main={innerHTML:''},c:any={state:{platforms:[{id:'careem',name:'Careem'}]},refreshState:{querySelector:(s:string)=>s==='.live-dot'?dot:label},main,escapeHtml:String};vm.createContext(c);
 vm.runInContext(source.slice(source.indexOf('function renderDisconnected('),source.indexOf('function renderError(')),c);vm.runInContext("renderDisconnected('careem')",c);
 assert.equal(label.textContent,'Careem · Not connected');assert.equal(dot.dataset.health,'EMPTY');assert.match(main.innerHTML,/Not Connected/);assert.doesNotMatch(label.textContent,/Deliveroo|FRESH/);
});
