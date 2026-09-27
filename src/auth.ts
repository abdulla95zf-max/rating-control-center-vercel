import {createHash, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual} from 'node:crypto';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {Pool} from 'pg';

function scrypt(value:string,salt:Buffer,length:number,options:Parameters<typeof scryptCallback>[3]){
 return new Promise<Buffer>((resolve,reject)=>scryptCallback(value,salt,length,options,(error,key)=>error?reject(error):resolve(key)));
}
const COOKIE='rcc_session';
const SESSION_SECONDS=60*60*12;
const USERNAME=/^[a-z0-9][a-z0-9._@-]{2,79}$/;
const ROLES=['admin','portfolio_manager','brand_manager','branch_manager','viewer'] as const;
export type DashboardRole=typeof ROLES[number];
export type AccessScope={type:'brand'|'branch';key:string};
export type AuthUser={id:string;username:string;displayName:string;role:DashboardRole;scopes:AccessScope[];mustChangePassword:boolean};

let pool:Pool|undefined;
let initialized:Promise<void>|undefined;
function database(){
 const url=process.env.DATABASE_URL?.trim();
 if(!url)throw new Error('AUTH_NOT_CONFIGURED');
 pool??=new Pool({connectionString:url,max:3,connectionTimeoutMillis:8_000,idleTimeoutMillis:10_000,ssl:url.includes('localhost')?false:{rejectUnauthorized:false}});
 return pool;
}
export function authDatabase(){return database();}
function text(value:unknown,max:number){return typeof value==='string'&&value.trim().length>0&&value.trim().length<=max?value.trim():null;}
function username(value:unknown){const normalized=typeof value==='string'?value.trim().toLowerCase():'';return USERNAME.test(normalized)?normalized:null;}
function password(value:unknown){return typeof value==='string'&&value.length>=12&&value.length<=128?value:null;}
function hashToken(token:string){return createHash('sha256').update(token).digest('hex');}
async function hashPassword(value:string){const salt=randomBytes(16),key=await scrypt(value,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024}) as Buffer;return `scrypt$32768$8$1$${salt.toString('base64')}$${key.toString('base64')}`;}
async function verifyPassword(value:string,encoded:string){try{const [kind,n,r,p,salt,key]=encoded.split('$');if(kind!=='scrypt'||!n||!r||!p||!salt||!key)return false;const expected=Buffer.from(key,'base64'),actual=await scrypt(value,Buffer.from(salt,'base64'),expected.length,{N:Number(n),r:Number(r),p:Number(p),maxmem:64*1024*1024}) as Buffer;return expected.length===actual.length&&timingSafeEqual(expected,actual);}catch{return false;}}
function parseScopes(value:unknown):AccessScope[]{if(!Array.isArray(value))return [];const seen=new Set<string>(),out:AccessScope[]=[];for(const item of value){if(!item||typeof item!=='object')continue;const type=(item as any).type,key=text((item as any).key,200);if((type!=='brand'&&type!=='branch')||!key)continue;const signature=type+'\0'+key;if(!seen.has(signature)){seen.add(signature);out.push({type,key});}}return out.slice(0,200);}
function validRoleScopes(role:DashboardRole,scopes:AccessScope[]){return role==='brand_manager'?scopes.length>0&&scopes.every(scope=>scope.type==='brand'):role==='branch_manager'?scopes.length>0&&scopes.every(scope=>scope.type==='branch'):true;}
function publicUser(row:any):AuthUser{return {id:String(row.id),username:String(row.username),displayName:String(row.display_name),role:row.role as DashboardRole,scopes:parseScopes(row.scopes),mustChangePassword:Boolean(row.must_change_password)};}

async function schema(){
 initialized??=(async()=>{
  const db=database();
  await db.query(`CREATE TABLE IF NOT EXISTS dashboard_users(
   id text PRIMARY KEY, username text NOT NULL UNIQUE, display_name text NOT NULL,
   password_hash text NOT NULL, role text NOT NULL CHECK(role IN ('admin','portfolio_manager','brand_manager','branch_manager','viewer')),
   scopes jsonb NOT NULL DEFAULT '[]'::jsonb, active boolean NOT NULL DEFAULT true,
   must_change_password boolean NOT NULL DEFAULT false, session_version integer NOT NULL DEFAULT 1,
   failed_attempts integer NOT NULL DEFAULT 0, locked_until timestamptz,
   created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), last_login_at timestamptz)`);
  await db.query(`CREATE TABLE IF NOT EXISTS dashboard_sessions(
   token_hash text PRIMARY KEY, user_id text NOT NULL REFERENCES dashboard_users(id) ON DELETE CASCADE,
   session_version integer NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL)`);
  await db.query(`CREATE INDEX IF NOT EXISTS dashboard_sessions_user_idx ON dashboard_sessions(user_id)`);
  await db.query(`CREATE INDEX IF NOT EXISTS dashboard_sessions_expiry_idx ON dashboard_sessions(expires_at)`);
  await db.query(`CREATE TABLE IF NOT EXISTS dashboard_audit_log(
   id bigserial PRIMARY KEY, actor_user_id text REFERENCES dashboard_users(id) ON DELETE SET NULL,
   event text NOT NULL, target_user_id text, detail jsonb NOT NULL DEFAULT '{}'::jsonb,
   created_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS dashboard_branches(
   id text PRIMARY KEY, canonical_key text NOT NULL UNIQUE, brand text NOT NULL, branch_name text NOT NULL,
   display_name text NOT NULL, active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now())`);
  await db.query(`CREATE TABLE IF NOT EXISTS dashboard_branch_sources(
   source_type text NOT NULL, source_id text NOT NULL, branch_id text NOT NULL REFERENCES dashboard_branches(id),
   source_name text NOT NULL, last_seen_at timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(source_type,source_id))`);
  await db.query(`CREATE INDEX IF NOT EXISTS dashboard_branch_sources_branch_idx ON dashboard_branch_sources(branch_id)`);
  const count=Number((await db.query('SELECT COUNT(*)::int AS value FROM dashboard_users')).rows[0]?.value||0);
  if(count===0){const u=username(process.env.AUTH_BOOTSTRAP_USERNAME),p=password(process.env.AUTH_BOOTSTRAP_PASSWORD),name=text(process.env.AUTH_BOOTSTRAP_DISPLAY_NAME,120)||'Dashboard Administrator';if(u&&p){await db.query('INSERT INTO dashboard_users(id,username,display_name,password_hash,role,scopes,active,must_change_password) VALUES($1,$2,$3,$4,$5,$6,true,false)',[randomUUID(),u,name,await hashPassword(p),'admin','[]']);}}
 })();
 return initialized;
}
function cookieToken(request:IncomingMessage){for(const part of String(request.headers.cookie||'').split(';')){const [name,...rest]=part.trim().split('=');if(name===COOKIE)return decodeURIComponent(rest.join('='));}return null;}
function setCookie(response:ServerResponse,token:string,maxAge=SESSION_SECONDS){response.setHeader('Set-Cookie',`${COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`);}
async function newSession(userId:string,version:number,response:ServerResponse){const token=randomBytes(32).toString('base64url');await database().query('INSERT INTO dashboard_sessions(token_hash,user_id,session_version,expires_at) VALUES($1,$2,$3,now()+$4*interval \'1 second\')',[hashToken(token),userId,version,SESSION_SECONDS]);setCookie(response,token);}
export async function currentUser(request:IncomingMessage):Promise<AuthUser|null>{await schema();const token=cookieToken(request);if(!token)return null;const result=await database().query(`SELECT u.* FROM dashboard_sessions s JOIN dashboard_users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active=true AND s.session_version=u.session_version`,[hashToken(token)]);return result.rowCount?publicUser(result.rows[0]):null;}
export async function requireUser(request:IncomingMessage,response:ServerResponse){const user=await currentUser(request);if(!user){response.statusCode=401;response.end(JSON.stringify({error:'Authentication required'}));return null;}return user;}
export function sameOrigin(request:IncomingMessage){const origin=request.headers.origin;if(!origin)return false;try{const url=new URL(origin);return url.protocol==='https:'&&url.host===request.headers.host;}catch{return false;}}
export async function readJson(request:IncomingMessage,limit=16_384){const chunks:Buffer[]=[];let size=0;for await(const chunk of request){size+=chunk.length;if(size>limit)throw new Error('BODY_TOO_LARGE');chunks.push(Buffer.from(chunk));}return JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}
export async function login(input:any,response:ServerResponse){await schema();const u=username(input?.username),p=typeof input?.password==='string'?input.password:'';if(!u||!p)return null;const result=await database().query('SELECT * FROM dashboard_users WHERE username=$1',[u]);const row=result.rows[0];if(!row||!row.active||row.locked_until&&new Date(row.locked_until).getTime()>Date.now()||!await verifyPassword(p,row.password_hash)){if(row){const attempts=Number(row.failed_attempts||0)+1;await database().query(`UPDATE dashboard_users SET failed_attempts=$2,locked_until=CASE WHEN $2>=5 THEN now()+interval '15 minutes' ELSE locked_until END WHERE id=$1`,[row.id,attempts]);}return null;}await database().query('UPDATE dashboard_users SET failed_attempts=0,locked_until=NULL,last_login_at=now() WHERE id=$1',[row.id]);await newSession(row.id,row.session_version,response);await audit(row.id,'login',row.id,{});return publicUser(row);}
export async function logout(request:IncomingMessage,response:ServerResponse,user:AuthUser){const token=cookieToken(request);if(token)await database().query('DELETE FROM dashboard_sessions WHERE token_hash=$1',[hashToken(token)]);setCookie(response,'',0);await audit(user.id,'logout',user.id,{});}
export async function changePassword(user:AuthUser,current:string,next:string,response:ServerResponse){const valid=password(next);if(!valid)return false;const result=await database().query('SELECT password_hash,session_version FROM dashboard_users WHERE id=$1',[user.id]);if(!result.rowCount||!await verifyPassword(current,result.rows[0].password_hash))return false;const version=Number(result.rows[0].session_version)+1;await database().query('UPDATE dashboard_users SET password_hash=$2,must_change_password=false,session_version=$3,failed_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1',[user.id,await hashPassword(valid),version]);await database().query('DELETE FROM dashboard_sessions WHERE user_id=$1',[user.id]);await newSession(user.id,version,response);await audit(user.id,'password_changed',user.id,{});return true;}
export async function listUsers(){await schema();const result=await database().query('SELECT id,username,display_name,role,scopes,active,must_change_password,created_at,last_login_at FROM dashboard_users ORDER BY display_name,username');return result.rows.map(row=>({...publicUser(row),active:Boolean(row.active),createdAt:row.created_at,lastLoginAt:row.last_login_at}));}
export async function createUser(actor:AuthUser,input:any){await schema();const u=username(input?.username),name=text(input?.displayName,120),p=password(input?.password),role=ROLES.includes(input?.role)?input.role as DashboardRole:null,scopes=parseScopes(input?.scopes);if(!u)throw new Error('INVALID_USERNAME');if(!name)throw new Error('INVALID_DISPLAY_NAME');if(!p)throw new Error('INVALID_PASSWORD');if(!role)throw new Error('INVALID_ROLE');if(!validRoleScopes(role,scopes))throw new Error('INVALID_SCOPE');const id=randomUUID();try{await database().query('INSERT INTO dashboard_users(id,username,display_name,password_hash,role,scopes,active,must_change_password) VALUES($1,$2,$3,$4,$5,$6,true,false)',[id,u,name,await hashPassword(p),role,JSON.stringify(scopes)]);}catch(error:any){if(error?.code==='23505')throw new Error('USERNAME_EXISTS');throw error;}await audit(actor.id,'user_created',id,{role,scopes});return id;}
export async function updateUser(actor:AuthUser,id:string,input:any){await schema();if(id===actor.id&&input.active===false)throw new Error('SELF_DISABLE');const role=ROLES.includes(input?.role)?input.role as DashboardRole:null,name=text(input?.displayName,120),scopes=parseScopes(input?.scopes);if(!role||!name||typeof input?.active!=='boolean'||!validRoleScopes(role,scopes))throw new Error('INVALID_USER');const result=await database().query('UPDATE dashboard_users SET display_name=$2,role=$3,scopes=$4,active=$5,session_version=session_version+1,updated_at=now() WHERE id=$1 RETURNING id',[id,name,role,JSON.stringify(scopes),input.active]);if(!result.rowCount)throw new Error('USER_NOT_FOUND');await database().query('DELETE FROM dashboard_sessions WHERE user_id=$1',[id]);await audit(actor.id,'user_updated',id,{role,scopes,active:input.active});}
export async function resetPassword(actor:AuthUser,id:string,next:string){const valid=password(next);if(!valid)throw new Error('INVALID_PASSWORD');const result=await database().query('UPDATE dashboard_users SET password_hash=$2,must_change_password=false,session_version=session_version+1,failed_attempts=0,locked_until=NULL,updated_at=now() WHERE id=$1 RETURNING id',[id,await hashPassword(valid)]);if(!result.rowCount)throw new Error('USER_NOT_FOUND');await database().query('DELETE FROM dashboard_sessions WHERE user_id=$1',[id]);await audit(actor.id,'password_reset',id,{});}
async function audit(actor:string|null,event:string,target:string|null,detail:unknown){await database().query('INSERT INTO dashboard_audit_log(actor_user_id,event,target_user_id,detail) VALUES($1,$2,$3,$4)',[actor,event,target,JSON.stringify(detail||{})]);}
export function canAccess(user:AuthUser,brand:string,branchKey:string){if(user.role==='admin'||user.role==='portfolio_manager')return true;return user.scopes.some(scope=>scope.type==='brand'&&scope.key===brand||scope.type==='branch'&&scope.key===branchKey);}
