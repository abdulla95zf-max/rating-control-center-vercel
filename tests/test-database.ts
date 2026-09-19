import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export function createFixtureDatabase(): { directory: string; databasePath: string } {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'rating-control-center-'));
  const databasePath = path.join(directory, 'talabat-monitor.db');
  const database = new DatabaseSync(databasePath);
  database.exec(`
    CREATE TABLE stores (
      store_id TEXT PRIMARY KEY, country_code TEXT NOT NULL, portal_store_name TEXT NOT NULL,
      portal_address TEXT NOT NULL DEFAULT '', active INTEGER NOT NULL DEFAULT 1,
      first_seen_at TEXT NOT NULL, last_seen_at TEXT NOT NULL, mapping_updated_at TEXT NOT NULL
    );
    CREATE TABLE monitor_runs (
      run_id TEXT PRIMARY KEY, run_type TEXT NOT NULL, started_at TEXT NOT NULL,
      finished_at TEXT, status TEXT NOT NULL, expected_store_count INTEGER,
      actual_row_count INTEGER, mapped_row_count INTEGER, error_code TEXT,
      error_message TEXT, session_valid INTEGER
    );
    CREATE TABLE rating_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT, run_id TEXT NOT NULL, recorded_at TEXT NOT NULL,
      store_id TEXT NOT NULL, store_name TEXT NOT NULL, rating_value REAL,
      review_count INTEGER NOT NULL, one_star_count INTEGER NOT NULL,
      previous_rating REAL, rating_change REAL, health_status TEXT NOT NULL,
      event_status TEXT NOT NULL
    );
  `);
  const timestamp = new Date(Date.now() - 60_000).toISOString();
  const previousTimestamp = new Date(Date.now() - 3_660_000).toISOString();
  const invalidTimestamp = new Date(Date.now() - 30_000).toISOString();
  const store = database.prepare('INSERT INTO stores VALUES (?, ?, ?, ?, 1, ?, ?, ?)');
  store.run('101', 'TB_AE', 'Critical Store', 'Dubai', timestamp, timestamp, timestamp);
  store.run('102', 'TB_AE', 'Healthy Store', 'Sharjah', timestamp, timestamp, timestamp);
  store.run('103', 'TB_AE', 'New Unrated Store', 'Ajman', timestamp, timestamp, timestamp);
  database.prepare("INSERT INTO monitor_runs(run_id, run_type, started_at, finished_at, status, expected_store_count, actual_row_count, mapped_row_count, session_valid) VALUES ('run-1','hourly-monitor',?,?,'success',3,3,3,1)").run(previousTimestamp, previousTimestamp);
  database.prepare("INSERT INTO monitor_runs(run_id, run_type, started_at, finished_at, status, expected_store_count, actual_row_count, mapped_row_count, session_valid) VALUES ('run-2','hourly-monitor',?,?,'success',3,3,3,1)").run(timestamp, timestamp);
  database.prepare("INSERT INTO monitor_runs(run_id, run_type, started_at, finished_at, status) VALUES ('bad-run','hourly-monitor',?,?,'incomplete')").run(invalidTimestamp, invalidTimestamp);
  const snapshot = database.prepare('INSERT INTO rating_snapshots(run_id, recorded_at, store_id, store_name, rating_value, review_count, one_star_count, previous_rating, rating_change, health_status, event_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)');
  snapshot.run('run-1', previousTimestamp, '101', 'Critical Store', 4.3, 20, 4, null, null, 'WARNING', 'NONE');
  snapshot.run('run-1', previousTimestamp, '102', 'Healthy Store', 4.5, 40, 2, null, null, 'HEALTHY', 'NONE');
  snapshot.run('run-1', previousTimestamp, '103', 'New Unrated Store', null, 0, 0, null, null, 'UNRATED', 'NONE');
  snapshot.run('run-2', timestamp, '101', 'Critical Store', 4.0, 22, 7, 4.3, -0.3, 'CRITICAL', 'RAPID_DROP');
  snapshot.run('run-2', timestamp, '102', 'Healthy Store', 4.6, 42, 2, 4.5, 0.1, 'HEALTHY', 'NONE');
  snapshot.run('run-2', timestamp, '103', 'New Unrated Store', null, 0, 0, null, null, 'UNRATED', 'NONE');
  snapshot.run('bad-run', invalidTimestamp, '101', 'Critical Store', 1.0, 0, 0, 4.0, -3.0, 'CRITICAL', 'RAPID_DROP');
  database.close();
  return { directory, databasePath };
}
