import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function page(status:number,body:unknown){
 const handlers=new Map<string,Function>(),nodes=new Map<string,any>();
 const node=(id:string)=>{if(!nodes.has(id))nodes.set(id,{hidden:false,textContent:'',focus(){},reset(){},addEventListener(event:string,handler:Function){handlers.set(id+':'+event,handler);},querySelector(){return {disabled:false};}});return nodes.get(id);};
 const context:any=vm.createContext({document:{getElementById:node,querySelector:()=>node('toggle'),dispatchEvent(){},body:{classList:{add(){},remove(){}}}},Event:class{},FormData:class{*[Symbol.iterator](){yield ['username','fixture'];yield ['password','fixture'];}},fetch:async()=>({ok:status===200,status,json:async()=>{if(body===null)throw Error('HTML response');return body;}})});
 vm.runInContext(fs.readFileSync('public/auth.js','utf8'),context);
 return {async submit(){await handlers.get('loginForm:submit')!({preventDefault(){}});return node('loginError').textContent;}};
}

test('security challenges including structured edge errors produce actionable login guidance',async()=>{
 for(const body of [null,{error:{code:'SECURITY_CHECKPOINT',message:'verification required'}}]){
  const message=await page(403,body).submit();assert.match(message,/security check.*Reload/);assert.doesNotMatch(message,/\[object Object\]/);
 }
});
test('login distinguishes rejected credentials, throttling and service failures without exposing provider errors',async()=>{
 assert.match(await page(401,{error:'Invalid username or password'}).submit(),/Invalid username or password/);
 assert.match(await page(429,{error:{code:'RATE_LIMITED'}}).submit(),/wait a few minutes/);
 assert.match(await page(503,{error:'private database diagnostic'}).submit(),/temporarily unavailable/);
 assert.match(await page(200,null).submit(),/unexpected response/);
});
