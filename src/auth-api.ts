import type {IncomingMessage,ServerResponse} from 'node:http';
import {changePassword,createUser,currentUser,listUsers,login,logout,readJson,requireUser,resetPassword,sameOrigin,updateUser} from './auth.ts';

function headers(response:ServerResponse){response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','no-store, private');response.setHeader('X-Content-Type-Options','nosniff');}
function send(response:ServerResponse,status:number,body:unknown){response.statusCode=status;response.end(JSON.stringify(body));}
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
  const id=String(body.id||'');if(body.newPassword){await resetPassword(user,id,body.newPassword);return send(response,200,{ok:true});}await updateUser(user,id,body);return send(response,200,{ok:true});
 }catch(error:any){const code=String(error?.message||'');const status=code==='USERNAME_EXISTS'?409:code.startsWith('INVALID_')||code==='SELF_DISABLE'?400:code==='USER_NOT_FOUND'?404:503;return send(response,status,{error:status===503?'Authentication service unavailable':code});}};
}
