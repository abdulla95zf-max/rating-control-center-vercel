import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
const read=(file:string)=>fs.readFileSync(path.join(process.cwd(),file),'utf8');
test('current Vercel dashboard distribution includes required entry points and branch data scope',()=>{
 for(const file of ['public/index.html','public/keeta-performance.js','src/services/keeta-snapshot-scope.ts','api/dashboard/performance/latest.ts'])assert.equal(fs.existsSync(file),true,`Missing ${file}`);
 const pkg=JSON.parse(read('package.json'));assert.equal(pkg.engines.node,'24.x');assert.match(pkg.scripts.build,/tsconfig.vercel.json/);
 assert.match(read('public/index.html'),/keeta-performance\.js/);
});
test('local adapters remain read-only and credentials remain excluded from git',()=>{
 assert.match(read('.gitignore'),/^\.env$/m);
 assert.match(read('src/adapters/talabat-data-source.ts'),/readOnly: true/);
 assert.match(read('src/adapters/talabat-data-source.ts'),/PRAGMA query_only = ON/);
 assert.equal(fs.existsSync('.env'),false);
});
