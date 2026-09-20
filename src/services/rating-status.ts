import type {RatingStatus} from '../types.ts';

export function displayStatus(rating: number|null): RatingStatus {
  if (rating === null) return 'UNKNOWN';
  if (!Number.isFinite(rating) || rating < 1 || rating > 5) throw new Error('INVALID_RATING');
  if (rating >= 4.4) return 'HEALTHY';
  if (rating >= 4.3) return 'ACCEPTABLE';
  if (rating > 4.0) return 'WARNING';
  return 'CRITICAL';
}

export const severity: Record<RatingStatus,number> = {
  CRITICAL:0, WARNING:1, ACCEPTABLE:2, HEALTHY:3, UNKNOWN:4
};
