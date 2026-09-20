import assert from 'node:assert/strict';
import fs from 'node:fs';
import type { AddressInfo } from 'node:net';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { createApp } from '../src/app.ts';
import type { AppConfig } from '../src/config.ts';
import { createFixtureDatabase } from './test-database.ts';

test('local API returns overview, stores, history and disconnected platforms', async () => {
  const fixture = createFixtureDatabase();
  const config: AppConfig = {
    host: '127.0.0.1', port: 3000, talabatDatabasePath: fixture.databasePath,
    autoRefreshSeconds: 60, publicDirectory: fileURLToPath(new URL('../public', import.meta.url))
  };
  const server = createApp(config).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const port = (server.address() as AddressInfo).port;
  try {
    const platforms = await fetch(`http://127.0.0.1:${port}/api/platforms`).then(response => response.json()) as any;
    assert.equal(platforms.platforms.length, 5);
    assert.equal(platforms.platforms.find((item: any) => item.id === 'talabat').connected, true);
    assert.equal(platforms.platforms.find((item: any) => item.id === 'keeta').connected, false);

    const page = await fetch(`http://127.0.0.1:${port}/`);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Online Rating Control Center/);
    assert.match(page.headers.get('content-security-policy') ?? '', /default-src 'self'/);

    const overview = await fetch(`http://127.0.0.1:${port}/api/overview`).then(response => response.json()) as any;
    assert.equal(overview.overview.totalStores, 3);

    const stores = await fetch(`http://127.0.0.1:${port}/api/stores?status=CRITICAL&sort=rating_asc`).then(response => response.json()) as any;
    assert.equal(stores.stores.length, 1);
    assert.equal(stores.stores[0].storeId, '101');

    const detail = await fetch(`http://127.0.0.1:${port}/api/stores/101`).then(response => response.json()) as any;
    assert.equal(detail.history.length, 2);

    for (const range of ['24h','7d','30d','all']) {
      const result = await fetch(`http://127.0.0.1:${port}/api/stores/101?range=${range}`).then(r => r.json()) as any;
      assert.equal(result.history.length, 2);
    }
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/stores/101?range=bad`)).status,400);
    assert.equal((await fetch(`http://127.0.0.1:${port}/api/stores`,{method:'POST'})).status,404);
    const invalid = await fetch(`http://127.0.0.1:${port}/api/stores?sort=rating_asc%3BDROP%20TABLE%20stores`);
    assert.equal(invalid.status, 400);
    const disconnected = await fetch(`http://127.0.0.1:${port}/api/stores?platform=keeta`);
    assert.equal(disconnected.status,503);
    assert.deepEqual(await disconnected.json(),{error:'Dashboard data is unavailable.'});
  } finally {
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    fs.rmSync(fixture.directory, { recursive: true });
  }
});
