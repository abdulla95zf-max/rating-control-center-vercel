import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { TalabatDataSource } from '../src/adapters/talabat-data-source.ts';
import { createFixtureDatabase } from './test-database.ts';

test('Talabat adapter reads only latest snapshots from successful runs', () => {
  const fixture = createFixtureDatabase();
  try {
    const source = new TalabatDataSource(fixture.databasePath);
    assert.equal(source.state.connected, true);
    const stores = source.getStores({ sort: 'rating_asc' });
    assert.equal(stores.length, 3);
    assert.equal(stores[0]?.storeId, '101');
    assert.equal(stores[0]?.currentRating, 4.0);
    assert.equal(stores[0]?.previousRating, 4.3);
    assert.equal(stores[0]?.ratingChange, -0.3);
    assert.equal(stores[2]?.status, 'UNRATED');
  } finally { fs.rmSync(fixture.directory, { recursive: true }); }
});

test('Overview uses stored monitor statuses and reports rapid drops', () => {
  const fixture = createFixtureDatabase();
  try {
    const overview = new TalabatDataSource(fixture.databasePath).getOverview();
    assert.equal(overview.totalStores, 3);
    assert.deepEqual(overview.counts, { HEALTHY: 1, ACCEPTABLE: 0, WARNING: 0, CRITICAL: 1, UNRATED: 1 });
    assert.equal(overview.recentRapidDrops, 1);
    assert.equal(overview.worstRatedStores[0]?.storeId, '101');
    assert.equal(overview.biggestRatingDrops[0]?.ratingChange, -0.3);
  } finally { fs.rmSync(fixture.directory, { recursive: true }); }
});

test('Search, status filter, sorting and history work without changing the database', () => {
  const fixture = createFixtureDatabase();
  try {
    const beforeDatabase = new DatabaseSync(fixture.databasePath, { readOnly: true });
    const before = beforeDatabase.prepare('SELECT COUNT(*) AS value FROM rating_snapshots').get() as any;
    beforeDatabase.close();
    const source = new TalabatDataSource(fixture.databasePath);
    assert.equal(source.getStores({ search: '101' }).length, 1);
    assert.equal(source.getStores({ status: 'HEALTHY' }).at(0)?.storeId, '102');
    assert.equal(source.getStores({ sort: 'change_desc' }).at(0)?.storeId, '102');
    const history = source.getHistory('101', 100);
    assert.equal(history.length, 2);
    assert.equal(history[0]?.rating, 4.3);
    assert.equal(history[1]?.rating, 4.0);
    const verify = new DatabaseSync(fixture.databasePath, { readOnly: true });
    const after = verify.prepare('SELECT COUNT(*) AS value FROM rating_snapshots').get() as any;
    verify.close();
    assert.equal(after.value, before.value);
  } finally { fs.rmSync(fixture.directory, { recursive: true }); }
});

test('Missing or incompatible Talabat database is reported as disconnected', () => {
  const source = new TalabatDataSource('Z:/missing/talabat-monitor.db');
  assert.equal(source.state.connected, false);
  assert.throws(() => source.getOverview(), /not found/i);
});
