import type { HistoryPoint, OverviewData, PlatformState, StoreQuery, StoreSummary } from '../types.ts';

export interface RatingDataSource {
  readonly state: PlatformState;
  getOverview(): OverviewData;
  getStores(query: StoreQuery): StoreSummary[];
  getStore(storeId: string): StoreSummary | null;
  getHistory(storeId: string, limit: number, since?: string): HistoryPoint[];
}
