import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
function fixture(saved?:string){
 let tick:(()=>void)|undefined,delay=0,reads=0,visible=true,allowed=true;const changes:any[]=[];
 const context:any={};vm.createContext(context);vm.runInContext(fs.readFileSync('public/dashboard-refresh.js','utf8'),context);
 const storage={getItem:()=>saved,setItem:(_:string,value:string)=>{saved=value;}};
 const controller=context.RCCRefresh.create({read:async()=>{reads++;},allowed:()=>allowed,visible:()=>visible,storage,timers:{setInterval:(fn:()=>void,ms:number)=>{tick=fn;delay=ms;return 1;},clearInterval:()=>{tick=undefined;}},changed:(value:any)=>changes.push(value)});
 return {controller,changes,get reads(){return reads;},get delay(){return delay;},get tick(){return tick;},hide:()=>{visible=false;},show:()=>{visible=true;},revoke:()=>{allowed=false;},get saved(){return saved;}};
}
const settle=()=>new Promise(resolve=>setImmediate(resolve));

test('forced Lens refresh repaints and preserves an open branch picker',async()=>{
 const source=fs.readFileSync('public/branch-brief.js','utf8');
 const render=source.slice(source.indexOf('globalThis.renderBranchBrief='),source.indexOf(" document.addEventListener('rcc-auth-reset'"));
 let paints=0;const group={id:'authorized-branch'};
 const brief={generation:0,groups:[group],selected:group.id,open:true,ratings:null,unavailable:[]};
 const context=vm.createContext({brief,state:{cloudRatings:true,tab:'brief'},main:{innerHTML:''},loading:()=> 'loading',
  lensReports:{read:async()=>({platforms:[]})},ratingsReports:{read:async()=>({ratings:[]})},ratingsReportPath:'/ratings',api:()=>{},
  catalog:()=>[group],paint:()=>{paints++;},refreshState:{querySelector:()=>({textContent:''})},document:{activeElement:{closest:()=>true}}});
 vm.runInContext(render,context);await vm.runInContext('renderBranchBrief(true)',context);
 assert.equal(paints,1);assert.equal(brief.open,true);assert.equal(brief.selected,group.id);
});
test('manual default creates no timer and refresh occurs only on explicit request',async()=>{const f=fixture();f.controller.start();assert.equal(f.tick,undefined);assert.equal(f.reads,0);await f.controller.refresh();assert.equal(f.reads,1);assert.equal(f.controller.mode,'manual');});
test('opt-in auto refresh is exactly fifteen minutes, skips hidden/revoked sessions and stops on reset',async()=>{const f=fixture();f.controller.start();f.controller.setMode('15m');assert.equal(f.delay,900000);assert.equal(f.reads,0);f.tick!();await settle();assert.equal(f.reads,1);f.hide();f.tick!();await settle();assert.equal(f.reads,1);f.show();f.revoke();f.tick!();await settle();assert.equal(f.reads,1);f.controller.stop();assert.equal(f.tick,undefined);await f.controller.refresh();assert.equal(f.reads,1);});
test('manual selection cancels auto timer, persists only a valid preference and survives start without duplicates',()=>{const f=fixture('15m');f.controller.start();assert.equal(f.delay,900000);f.controller.start();f.controller.setMode('manual');assert.equal(f.tick,undefined);assert.equal(f.saved,'manual');f.controller.setMode('invalid');assert.equal(f.controller.mode,'manual');assert.equal(fixture('60').controller.mode,'manual');});
test('storage failures do not block startup, and overlapping clicks coalesce with no late reset update',async()=>{const context:any={};Object.defineProperty(context,'localStorage',{get(){throw Error('Blocked storage');}});vm.createContext(context);vm.runInContext(fs.readFileSync('public/dashboard-refresh.js','utf8'),context);let resolve!:()=>void,reads=0;const changes:any[]=[];const c=context.RCCRefresh.create({read:()=>{reads++;return new Promise<void>(done=>{resolve=done;});},changed:(value:any)=>changes.push(value)});c.start();const a=c.refresh(),b=c.refresh();await settle();assert.equal(reads,1);c.stop();const count=changes.length;resolve();await Promise.all([a,b]);assert.equal(changes.length,count);assert.equal(changes.at(-1).active,false);});
