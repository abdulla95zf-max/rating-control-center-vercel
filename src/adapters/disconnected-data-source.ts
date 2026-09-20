import type { RatingDataSource } from './data-source.ts';
import type { HistoryPoint, OverviewData, PlatformId, PlatformState, StoreQuery, StoreSummary } from '../types.ts';

const emptyOverview = (): OverviewData => ({
  totalStores: 0,
  counts: { HEALTHY: 0, ACCEPTABLE: 0, WARNING: 0, CRITICAL: 0, UNKNOWN: 0 },
  recentRapidDrops: 0,
  lastUpdated: null,
  worstRatedStores: [],
  biggestRatingDrops: []
});

export class DisconnectedDataSource implements RatingDataSource {
  readonly state: PlatformState;

  constructor(id: Exclude<PlatformId, 'talabat'>, name: string) {
    this.state = { id, name, connected: false, message: 'Not Connected', health: 'NOT CONNECTED' };
  }

  getOverview(): OverviewData { return emptyOverview(); }
  getStores(_query: StoreQuery): StoreSummary[] { return []; }
  getStore(_storeId: string): StoreSummary | null { return null; }
  getHistory(_storeId: string, _limit: number): HistoryPoint[] { return []; }
}
