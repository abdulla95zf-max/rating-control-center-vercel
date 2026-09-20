export type PlatformId = 'talabat' | 'keeta' | 'noon' | 'careem' | 'deliveroo';
export type RatingStatus = 'HEALTHY' | 'ACCEPTABLE' | 'WARNING' | 'CRITICAL' | 'UNKNOWN';

export interface PlatformState {
  id: PlatformId;
  name: string;
  connected: boolean;
  message: string | null;
  health?: 'LIVE' | 'DELAYED' | 'STALE' | 'NOT CONNECTED' | 'ERROR';
  lastSuccessfulSync?: string | null;
  lastSnapshot?: string | null;
  latestRunStatus?: string | null;
  warning?: string | null;
}

export interface StoreSummary {
  platform: PlatformId;
  storeId: string;
  storeName: string;
  currentRating: number | null;
  previousRating: number | null;
  ratingChange: number | null;
  reviewCount: number | null;
  oneStarCount: number | null;
  status: RatingStatus;
  eventStatus: string;
  lastUpdated: string | null;
}

export interface HistoryPoint {
  recordedAt: string;
  rating: number | null;
  reviewCount: number | null;
  oneStarCount: number | null;
  status: RatingStatus;
  eventStatus: string;
}

export interface StatusCounts {
  HEALTHY: number;
  ACCEPTABLE: number;
  WARNING: number;
  CRITICAL: number;
  UNKNOWN: number;
}

export interface OverviewData {
  totalStores: number;
  counts: StatusCounts;
  recentRapidDrops: number;
  lastUpdated: string | null;
  worstRatedStores: StoreSummary[];
  biggestRatingDrops: StoreSummary[];
}

export interface StoreQuery {
  search?: string;
  status?: RatingStatus;
  sort?: 'name_asc' | 'rating_asc' | 'rating_desc' | 'change_asc' | 'change_desc';
}
