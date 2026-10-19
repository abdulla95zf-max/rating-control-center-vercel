import type {PoolConfig} from 'pg';
/** Keep DSN SSL options from silently overriding certificate verification. */
export function dashboardDatabaseConfig(value:string):PoolConfig{
 let url:URL;try{url=new URL(value);}catch{throw Error('AUTH_DATABASE_CONFIG_INVALID');}
 if(!['postgres:','postgresql:'].includes(url.protocol)||!url.hostname)throw Error('AUTH_DATABASE_CONFIG_INVALID');
 const hostname=url.hostname.replace(/^\[|\]$/g,'');
 const local=['localhost','127.0.0.1','::1'].includes(hostname);
 for(const key of ['ssl','sslmode','sslcert','sslkey','sslrootcert','uselibpqcompat','sslnegotiation'])url.searchParams.delete(key);
 return {connectionString:url.href,ssl:local?false:{rejectUnauthorized:true},max:3,connectionTimeoutMillis:8000,idleTimeoutMillis:10000};
}
