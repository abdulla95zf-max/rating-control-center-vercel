import type {IncomingMessage,ServerResponse} from 'node:http';
import {requireUser} from './auth.ts';
import {coreWebhookExample} from './core-webhook-contract.ts';
export function createCoreWebhookSetupHandler(authenticate:typeof requireUser=requireUser){
 return async(request:IncomingMessage,response:ServerResponse)=>{
  response.setHeader('Content-Type','application/json; charset=utf-8');response.setHeader('Cache-Control','private, no-store');response.setHeader('X-Content-Type-Options','nosniff');
  const send=(status:number,body:unknown)=>{response.statusCode=status;response.end(JSON.stringify(body));};
  if(request.method!=='GET'){response.setHeader('Allow','GET');return send(405,{error:'METHOD_NOT_ALLOWED'});}
  const url=new URL(request.url||'/','https://dashboard.invalid');
  if(url.searchParams.size!==1||url.searchParams.getAll('integration').length!==1||url.searchParams.get('integration')!=='core-webhook')return send(400,{error:'INVALID_REQUEST'});
  try{const user=await authenticate(request,response);if(!user)return;if(!user.isOwner)return send(403,{error:'OWNER_REQUIRED'});return send(200,coreWebhookExample());}
  catch{return send(503,{error:'SETUP_UNAVAILABLE'});}
 };
}
