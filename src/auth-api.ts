import type {IncomingMessage,ServerResponse} from 'node:http';
import {changePassword,createUser,currentUser,listUsers,login,logout,readJson,requireUser,resetPassword,sameOrigin,setBranchActive,updateUser} from './auth.ts';
import {fetchLatestRatings} from './services/latest-ratings-proxy.ts';
import {registerBranchSources} from './services/branch-registry.ts';

function headers(response:ServerResponse){response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store, private');response.setHeader('X-Content-Type-Options','nosniff');}
function send(response:ServerResponse,status:number,body:unknown){response.statusCode=status;response.end(JSON.stringify(body));}
function publicError(code:string){return ({INVALID_USERNAME:'Username must be 3–80 characters and may include letters, numbers, dot, dash, underscore or @.',INVALID_DISPLAY_NAME:'Enter a display name.',INVALID_PASSWORD:'Password must be 12–128 characters.',INVALID_ROLE:'Select a valid role.',INVALID_SCOPE:'Select access that matches the chosen role.',USERNAME_EXISTS:'This username already exists.',SELF_DISABLE:'You cannot disable your own account.',USER_NOT_FOUND:'User not found.',OWNER_REQUIRED:'Owner access required.',INVALID_BRANCH:'Invalid branch request.',BRANCH_NOT_FOUND:'Branch not found.'} as Record<string,string>)[code]||code;}
export function createAuthHandler(route:'session'|'login'|'logout'|'changePassword'|'users'){
 return async(request:IncomingMessage,response:ServerResponse)=>{headers(response);try{
  if(route==='session'){if(request.method!=='GET')return send(response,405,{error:'Method not allowed'});const user=await currentUser(request);return send(response,200,{authenticated:Boolean(user),user});}
  if(request.method!=='POST'&&!(route==='users'&&request.method==='GET')&&!(route==='users'&&request.method==='PATCH'))return send(response,405,{error:'Method not allowed'});
  if(request.method!=='GET'&&!sameOrigin(request))return send(response,403,{error:'Forbidden'});
  if(route==='login'){const user=await login(await readJson(request),response);return user?send(response,200,{ok:true,user}):send(response,401,{error:'Invalid username or password'});}
  const user=await requireUser(request,response);if(!user)return;
  if(route==='logout'){await logout(request,response,user);return send(response,200,{ok:true});}
  if(route==='changePassword'){const body=await readJson(request);return await changePassword(user,body.currentPassword,body.newPassword,response)?send(response,200,{ok:true}):send(response,400,{error:'Password change failed'});}
  if(user.role!=='admin')return send(response,403,{error:'Administrator access required'});
  if(request.method==='GET')return send(response,200,{users:await listUsers()});
  const body=await readJson(request);
  if(request.method==='POST'){const id=await createUser(user,body);return send(response,201,{ok:true,id});}
  if(body.branchStatus){await setBranchActive(user,String(body.branchStatus.id||''),body.branchStatus.active,body.branchStatus.reason);return send(response,200,{ok:true});}const id=String(body.id||'');if(body.newPassword){await resetPassword(user,id,body.newPassword);return send(response,200,{ok:true});}await updateUser(user,id,body);return send(response,200,{ok:true});
 }catch(error:any){const code=String(error?.message||'');const status=code==='USERNAME_EXISTS'?409:code==='OWNER_REQUIRED'?403:code.startsWith('INVALID_')||code==='SELF_DISABLE'?400:['USER_NOT_FOUND','BRANCH_NOT_FOUND'].includes(code)?404:503;return send(response,status,{error:status===503?'Authentication service unavailable':publicError(code)});}};
}

export function createAccessOptionsHandler(env:NodeJS.ProcessEnv=process.env,fetcher:typeof fetch=fetch){
 return async(request:IncomingMessage,response:ServerResponse)=>{headers(response);try{
  if(request.method!=='GET')return send(response,405,{error:'Method not allowed'});
  const user=await requireUser(request,response);if(!user)return;if(user.role!=='admin')return send(response,403,{error:'Administrator access required'});
  const result=await fetchLatestRatings({host:'',port:0,talabatDatabasePath:'',publicDirectory:'',autoRefreshSeconds:60,ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''},fetcher);
  const registry=await registerBranchSources(result.ratings.map((row:any)=>({sourceType:`rating:${row.platform}`,sourceId:String(row.storeIdentityKey),storeName:String(row.storeName||'')}))),identities=[...new Map([...registry.values()].map(item=>[item.id,item])).values()];
  const brands=[...new Set(identities.map(item=>item.brand))].sort((a,b)=>a.localeCompare(b));
  const branches=identities.map(item=>({key:item.id,brand:item.brand,branch:item.branch,label:item.displayName,active:item.active})).sort((a,b)=>a.label.localeCompare(b.label));
  return send(response,200,{brands,branches});
 }catch{return send(response,503,{error:'Access options are temporarily unavailable'});}};
}
