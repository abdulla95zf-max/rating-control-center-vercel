import type {Pool,PoolClient} from 'pg';
import {hasFeature,rowFeatureUser} from './feature-access.ts';
export async function withAccountAdmin<T>(db:Pick<Pool,'connect'>,actorId:string,work:(client:PoolClient,actor:any)=>Promise<T>):Promise<T>{
 const client=await db.connect();let discard=false;
 try{
  await client.query('BEGIN');await client.query('LOCK TABLE dashboard_users IN SHARE ROW EXCLUSIVE MODE');
  const actor=(await client.query('SELECT * FROM dashboard_users WHERE id=$1',[actorId])).rows[0];
  if(!actor?.active||actor.role!=='admin'||!hasFeature(rowFeatureUser(actor),'users.manage'))throw Error('ADMIN_REQUIRED');
  const result=await work(client,actor);await client.query('COMMIT');return result;
 }catch(error){try{await client.query('ROLLBACK');}catch{discard=true;}throw error;}
 finally{client.release(discard);}
}
