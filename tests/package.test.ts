import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

test('Windows installer and operator files are complete', () => {
  for (const file of ['install-windows.ps1', 'start-dashboard.bat', 'check-connection.bat', 'WINDOWS-SETUP-FA.md']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `Missing ${file}`);
  }
  const installer = read('install-windows.ps1');
  assert.match(installer, /npm\.cmd ci/);
  assert.match(installer, /npm\.cmd run build/);
  assert.doesNotMatch(installer, /Telegram|Cookie|OTP|Password\s*=/i);
});

test('local-only and secret-exclusion safeguards are packaged', () => {
  assert.match(read('.env.example'), /HOST=127\.0\.0\.1/);
  assert.match(read('.gitignore'), /^\.env$/m);
  assert.match(read('src/adapters/talabat-data-source.ts'), /readOnly: true/);
  assert.match(read('src/adapters/talabat-data-source.ts'), /PRAGMA query_only = ON/);
  assert.equal(fs.existsSync(path.join(root, '.env')), false);
});
