import type { RatingDataSource } from '../adapters/data-source.ts';
import type { OverviewData, PlatformId, PlatformState } from '../types.ts';

export class DataSourceRegistry {
  private readonly sources = new Map<PlatformId, RatingDataSource>();

  constructor(sources: RatingDataSource[]) {
    for (const source of sources) this.sources.set(source.state.id, source);
  }

  states(): PlatformState[] {
    return [...this.sources.values()].map(source => source.state);
  }

  get(id: string): RatingDataSource | null {
    return this.sources.get(id as PlatformId) ?? null;
  }

  overview(): OverviewData {
    const overviews = [...this.sources.values()].filter(source => source.state.connected).map(source => source.getOverview());
    const counts = { HEALTHY: 0, ACCEPTABLE: 0, WARNING: 0, CRITICAL: 0, UNKNOWN: 0 };
    for (const overview of overviews) {
      for (const status of Object.keys(counts) as Array<keyof typeof counts>) counts[status] += overview.counts[status];
    }
    const allWorst = overviews.flatMap(overview => overview.worstRatedStores)
      .filter(store => store.currentRating !== null)
      .sort((left, right) => (left.currentRating ?? 6) - (right.currentRating ?? 6)).slice(0, 5);
    const allDrops = overviews.flatMap(overview => overview.biggestRatingDrops)
      .sort((left, right) => (left.ratingChange ?? 0) - (right.ratingChange ?? 0)).slice(0, 5);
    const updates = overviews.map(overview => overview.lastUpdated).filter((value): value is string => Boolean(value)).sort();
    return {
      totalStores: overviews.reduce((total, overview) => total + overview.totalStores, 0),
      counts,
      recentRapidDrops: overviews.reduce((total, overview) => total + overview.recentRapidDrops, 0),
      lastUpdated: updates.at(-1) ?? null,
      worstRatedStores: allWorst,
      biggestRatingDrops: allDrops
    };
  }
}
