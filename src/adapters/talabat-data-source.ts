import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import type { RatingDataSource } from './data-source.ts';
import type { HistoryPoint, OverviewData, PlatformState, StoreQuery, StoreSummary } from '../types.ts';
import {displayStatus} from '../services/rating-status.ts';

function parseTimestamp(value: string): number {
  const normalized = value.trim().replace(' ', 'T');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(normalized) ? normalized : normalized + 'Z');
}

const REQUIRED_TABLES = ['stores', 'monitor_runs', 'rating_snapshots'];

const LATEST_CTE = `
  WITH ranked AS (
    SELECT rs.*,
      ROW_NUMBER() OVER (PARTITION BY rs.store_id ORDER BY julianday(rs.recorded_at) DESC, rs.id DESC) AS row_number
    FROM rating_snapshots rs
    INNER JOIN monitor_runs mr ON mr.run_id = rs.run_id
    WHERE mr.status = 'success'
  ), latest AS (
    SELECT * FROM ranked WHERE row_number = 1
  )
`;

const STORE_SELECT = `
  SELECT
    s.store_id,
    s.portal_store_name,
    l.rating_value,
    l.previous_rating,
    l.rating_change,
    COALESCE(l.review_count, 0) AS review_count,
    COALESCE(l.one_star_count, 0) AS one_star_count,
    COALESCE(l.health_status, 'UNRATED') AS health_status,
    COALESCE(l.event_status, 'NONE') AS event_status,
    l.recorded_at
  FROM stores s
  LEFT JOIN latest l ON l.store_id = s.store_id
  WHERE s.active = 1
`;

const SORT_SQL: Record<NonNullable<StoreQuery['sort']>, string> = {
  name_asc: 's.portal_store_name COLLATE NOCASE ASC',
  rating_asc: 'l.rating_value IS NULL ASC, l.rating_value ASC, s.portal_store_name COLLATE NOCASE ASC',
  rating_desc: 'l.rating_value IS NULL ASC, l.rating_value DESC, s.portal_store_name COLLATE NOCASE ASC',
  change_asc: 'l.rating_change IS NULL ASC, l.rating_change ASC, s.portal_store_name COLLATE NOCASE ASC',
  change_desc: 'l.rating_change IS NULL ASC, l.rating_change DESC, s.portal_store_name COLLATE NOCASE ASC'
};

function toStore(row: any): StoreSummary {
  return {
    platform: 'talabat',
    storeId: String(row.store_id),
    storeName: String(row.portal_store_name),
    currentRating: row.rating_value === null ? null : Number(row.rating_value),
    previousRating: row.previous_rating === null ? null : Number(row.previous_rating),
    ratingChange: row.rating_change === null ? null : Number(row.rating_change),
    reviewCount: Number(row.review_count),
    oneStarCount: Number(row.one_star_count),
    status: displayStatus(row.rating_value === null ? null : Number(row.rating_value)),
    eventStatus: String(row.event_status),
    lastUpdated: row.recorded_at === null ? null : String(row.recorded_at)
  };
}

export class TalabatDataSource implements RatingDataSource {

  private readonly databasePath: string;

  constructor(databasePath: string) {
    this.databasePath = databasePath;

  }

  get state(): PlatformState {
    const base = { id: 'talabat' as const, name: 'Talabat' };
    const problem = this.connectionProblem();
    if (problem) return { ...base, connected: false, message: problem, health: this.databasePath ? 'ERROR' : 'NOT CONNECTED' };
    try {
      return this.withDatabase(database => {
        const success = database.prepare("SELECT COALESCE(finished_at, started_at) AS timestamp FROM monitor_runs WHERE status = 'success' ORDER BY julianday(COALESCE(finished_at, started_at)) DESC LIMIT 1").get() as any;
        const snapshot = database.prepare("SELECT rs.recorded_at AS timestamp FROM rating_snapshots rs JOIN monitor_runs mr ON mr.run_id = rs.run_id WHERE mr.status = 'success' ORDER BY julianday(rs.recorded_at) DESC, rs.id DESC LIMIT 1").get() as any;
        const latest = database.prepare("SELECT status FROM monitor_runs ORDER BY julianday(started_at) DESC, rowid DESC LIMIT 1").get() as any;
        const lastSuccessfulSync = success?.timestamp ?? null;
        const lastSnapshot = snapshot?.timestamp ?? null;
        const age = lastSnapshot ? Date.now() - parseTimestamp(lastSnapshot) : NaN;
        const failed = latest && !['success', 'running', 'started', 'in_progress'].includes(latest.status);
        const health = !Number.isFinite(age) || age < -60_000 ? 'ERROR' : age < 90 * 60_000 ? 'LIVE' : age <= 120 * 60_000 ? 'DELAYED' : 'STALE';
        return { ...base, connected: true, message: null, health,
          lastSuccessfulSync, lastSnapshot, latestRunStatus: latest?.status ?? null,
          warning: failed ? 'Latest monitor run was unsuccessful (' + latest.status + '). Showing last successful snapshots.' : health === 'ERROR' ? 'No valid snapshot timestamp is available. Data freshness cannot be verified.' : null };
      });
    } catch (error) {
      return { ...base, connected: false, health: 'ERROR', message: error instanceof Error ? error.message : 'Database read failed' };
    }
  }

  private connectionProblem(): string | null {
    if (!this.databasePath) return 'Database path is not configured';
    if (!fs.existsSync(this.databasePath)) return 'Database file was not found';
    try {
      return this.withDatabase(database => {
        const tables = new Set((database.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as any[]).map(row => String(row.name)));
        const missing = REQUIRED_TABLES.filter(table => !tables.has(table));
        return missing.length === 0 ? null : `Required tables are missing: ${missing.join(', ')}`;
      });
    } catch (error) {
      return error instanceof Error ? error.message : 'Database could not be opened';
    }
  }

  private withDatabase<T>(work: (database: DatabaseSync) => T): T {
    const database = new DatabaseSync(this.databasePath, { readOnly: true });
    try {
      database.exec('PRAGMA query_only = ON; PRAGMA busy_timeout = 3000;');
      return work(database);
    } finally {
      database.close();
    }
  }

  private requireConnected(): void {
    if (!this.state.connected) throw new Error(this.state.message ?? 'Talabat is not connected');
  }

  getStores(query: StoreQuery = {}): StoreSummary[] {
    this.requireConnected();
    return this.withDatabase(database => {
      const conditions: string[] = [];
      const parameters: Array<string> = [];
      if (query.search) {
        conditions.push('(s.portal_store_name LIKE ? ESCAPE \'\\\' OR s.store_id LIKE ? ESCAPE \'\\\')');
        const escaped = query.search.replace(/[\\%_]/g, value => `\\${value}`);
        parameters.push(`%${escaped}%`, `%${escaped}%`);
      }
      const additional = conditions.length ? ` AND ${conditions.join(' AND ')}` : '';
      const order = SORT_SQL[query.sort ?? 'name_asc'];
      const rows = database.prepare(`${LATEST_CTE}${STORE_SELECT}${additional} ORDER BY ${order}`).all(...parameters) as any[];
      const stores=rows.map(toStore);
      return query.status?stores.filter(store=>store.status===query.status):stores;
    });
  }

  getStore(storeId: string): StoreSummary | null {
    this.requireConnected();
    return this.withDatabase(database => {
      const row = database.prepare(`${LATEST_CTE}${STORE_SELECT} AND s.store_id = ? LIMIT 1`).get(storeId) as any;
      return row ? toStore(row) : null;
    });
  }

  getHistory(storeId: string, limit: number, since?: string): HistoryPoint[] {
    this.requireConnected();
    return this.withDatabase(database => (database.prepare(`
      SELECT * FROM (
        SELECT rs.id, rs.recorded_at, rs.rating_value, rs.review_count, rs.one_star_count,
          rs.health_status, rs.event_status
        FROM rating_snapshots rs
        INNER JOIN monitor_runs mr ON mr.run_id = rs.run_id
        WHERE rs.store_id = ? AND mr.status = 'success' AND (? IS NULL OR julianday(rs.recorded_at) >= julianday(?))
        ORDER BY julianday(rs.recorded_at) DESC, rs.id DESC
        LIMIT ?
      ) recent
      ORDER BY julianday(recorded_at) ASC, id ASC
    `).all(storeId, since ?? null, since ?? null, limit) as any[]).map(row => ({
      recordedAt: String(row.recorded_at),
      rating: row.rating_value === null ? null : Number(row.rating_value),
      reviewCount: row.review_count === null ? null : Number(row.review_count),
      oneStarCount: row.one_star_count === null ? null : Number(row.one_star_count),
      status: displayStatus(row.rating_value === null ? null : Number(row.rating_value)),
      eventStatus: String(row.event_status)
    })));
  }

  getOverview(): OverviewData {
    this.requireConnected();
    const stores = this.getStores({ sort: 'rating_asc' });
    const counts = { HEALTHY: 0, ACCEPTABLE: 0, WARNING: 0, CRITICAL: 0, UNKNOWN: 0 };
    for (const store of stores) counts[store.status] += 1;
    const recentRapidDrops = this.withDatabase(database => {
      const row = database.prepare(`
        SELECT COUNT(*) AS value FROM rating_snapshots rs
        INNER JOIN monitor_runs mr ON mr.run_id = rs.run_id
        WHERE mr.status = 'success' AND rs.event_status = 'RAPID_DROP'
          AND julianday(rs.recorded_at) >= julianday('now', '-1 day')
      `).get() as any;
      return Number(row?.value ?? 0);
    });
    const rated = stores.filter(store => store.currentRating !== null);
    return {
      totalStores: stores.length,
      counts,
      recentRapidDrops,
      lastUpdated: stores.reduce<string | null>((latest, store) => !store.lastUpdated || (latest && latest >= store.lastUpdated) ? latest : store.lastUpdated, null),
      worstRatedStores: rated.slice(0, 5),
      biggestRatingDrops: stores.filter(store => store.ratingChange !== null && store.ratingChange < 0)
        .sort((left, right) => (left.ratingChange ?? 0) - (right.ratingChange ?? 0)).slice(0, 5)
    };
  }
}
