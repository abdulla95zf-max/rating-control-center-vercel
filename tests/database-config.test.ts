import test from 'node:test';import assert from 'node:assert/strict';import {Client} from 'pg';
import {dashboardDatabaseConfig} from '../src/database-config.ts';
test('DSN options cannot silently disable certificate verification for remote databases',()=>{
 const config=dashboardDatabaseConfig('postgresql://fixture:localhost@remote.example/db?sslmode=no-verify&ssl=false&sslrootcert=ignored&uselibpqcompat=true');
 assert.deepEqual(config.ssl,{rejectUnauthorized:true});
 const client=new Client(config);assert.deepEqual((client as any).connectionParameters.ssl,{rejectUnauthorized:true});
 assert.ok(!config.connectionString?.includes('sslmode'));assert.equal(config.max,3);
});
test('only exact loopback hosts retain local non-TLS development access',()=>{
 for(const host of ['localhost','127.0.0.1','[::1]'])assert.equal(dashboardDatabaseConfig(`postgresql://fixture:fixture@${host}/db`).ssl,false);
 for(const host of ['localhost.remote.example','remote.example'])assert.deepEqual(dashboardDatabaseConfig(`postgresql://localhost:localhost@${host}/localhost`).ssl,{rejectUnauthorized:true});
 for(const value of ['invalid','http://localhost/db'])assert.throws(()=>dashboardDatabaseConfig(value),/AUTH_DATABASE_CONFIG_INVALID/);
});
