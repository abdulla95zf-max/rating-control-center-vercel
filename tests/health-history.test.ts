import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { TalabatDataSource } from '../src/adapters/talabat-data-source.ts';
import { createFixtureDatabase } from './test-database.ts';

for (const [minutes, expected] of [[89.99,'LIVE'],[90,'DELAYED'],[119,'DELAYED'],[120,'DELAYED'],[120.01,'STALE'],[180,'STALE']] as const) {
  test(`Freshness at ${minutes} minutes is ${expected}`, t => {
    const fixture = createFixtureDatabase();
    const now = Date.now();
    t.mock.method(Date, 'now', () => now);
    try {
      const db = new DatabaseSync(fixture.databasePath);
      db.prepare('UPDATE rating_snapshots SET recorded_at = ?').run(new Date(now - minutes * 60000).toISOString());
      db.close();
      assert.equal(new TalabatDataSource(fixture.databasePath).state.health, expected);
    } finally { fs.rmSync(fixture.directory, {recursive:true}); }
  });
}
test('Failed latest run warns while previous successful store and history remain visible', () => {
  const f = createFixtureDatabase();
  try {
    const source = new TalabatDataSource(f.databasePath);
    assert.equal(source.state.health, 'LIVE');
    assert.match(source.state.warning!, /unsuccessful/);
    assert.equal(source.state.latestRunStatus, 'incomplete');
    assert.ok(source.state.lastSuccessfulSync);
    assert.ok(source.state.lastSnapshot);
    assert.equal(source.getStore('101')!.currentRating, 4);
    assert.equal(source.getHistory('101', -1).length, 2);
  } finally { fs.rmSync(f.directory, {recursive:true}); }
});
test('No successful snapshot produces ERROR rather than LIVE', () => {
  const f = createFixtureDatabase();
  try {
    const db = new DatabaseSync(f.databasePath);
    db.exec("UPDATE monitor_runs SET status='failed'"); db.close();
    assert.equal(new TalabatDataSource(f.databasePath).state.health, 'ERROR');
  } finally { fs.rmSync(f.directory, {recursive:true}); }
});
test('Invalid and future timestamps cannot produce LIVE', () => {
  const f = createFixtureDatabase();
  try {
    const db = new DatabaseSync(f.databasePath);
    for (const value of ['invalid', new Date(Date.now()+3600000).toISOString()]) {
      db.prepare('UPDATE rating_snapshots SET recorded_at=?').run(value);
      assert.equal(new TalabatDataSource(f.databasePath).state.health, 'ERROR');
    }
    db.close();
  } finally { fs.rmSync(f.directory, {recursive:true}); }
});
test('State recovers without restart when database becomes available', () => {
  const f = createFixtureDatabase();
  const moved = f.databasePath + '.moved';
  try {
    fs.renameSync(f.databasePath,moved);
    const source = new TalabatDataSource(f.databasePath);
    assert.equal(source.state.health,'ERROR');
    fs.renameSync(moved,f.databasePath);
    assert.equal(source.state.health,'LIVE');
  } finally { fs.rmSync(f.directory, {recursive:true}); }
});
test('All history exceeds the old 2000 limit; date ranges exclude older snapshots', () => {
  const f = createFixtureDatabase();
  try {
    const db = new DatabaseSync(f.databasePath);
    const insert = db.prepare("INSERT INTO rating_snapshots(run_id, recorded_at,store_id,store_name,rating_value,review_count,one_star_count,health_status,event_status) VALUES('run-1',?,'101','Critical Store',4,20,2,'CRITICAL','NONE')");
    for(let i=0;i<2100;i++) insert.run(new Date(Date.now()-40*86400000-i*60000).toISOString());
    db.close();
    const source = new TalabatDataSource(f.databasePath);
    assert.equal(source.getHistory('101',-1).length,2102);
    for(const days of [1,7,30]) assert.equal(source.getHistory('101',-1,new Date(Date.now()-days*86400000).toISOString()).length,2);
  } finally { fs.rmSync(f.directory, {recursive:true}); }
});
test('Every adapter query leaves database bytes unchanged and writes are rejected', () => {
  const f = createFixtureDatabase();
  try {
    const before = fs.readFileSync(f.databasePath);
    const source = new TalabatDataSource(f.databasePath);
    source.state; source.getStores(); source.getStore('101'); source.getHistory('101',-1); source.getOverview();
    // Exercise the actual connection factory using a disposable test database only.
    (source as any).withDatabase((db: DatabaseSync) => {
      assert.equal(db.prepare('PRAGMA query_only').get()!.query_only,1);
      assert.throws(()=>db.exec("INSERT INTO monitor_runs(run_id,run_type,started_at,status) VALUES('forbidden','test','2026-01-01','success')"),/readonly/i);
    });
    assert.deepEqual(fs.readFileSync(f.databasePath), before);
  } finally { fs.rmSync(f.directory, {recursive:true}); }
});
