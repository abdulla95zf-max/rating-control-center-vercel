import type { AppConfig } from '../config.ts';

export class RatingsProxyError extends Error {
  readonly status: number;
  constructor(status: number, message: string) { super(message); this.status = status; }
}

export async function fetchLatestRatings(config: AppConfig, fetcher: typeof fetch = fetch) {
  const token = config.ratingsApiToken;
  if (!token || token.length < 32 || token.length > 512 || /[\r\n]/.test(token)) {
    throw new RatingsProxyError(503, 'Cloud ratings are not configured.');
  }
  let url: URL;
  try {
    url = new URL(config.ratingsApiUrl || '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port ||
        url.pathname !== '/api/ratings/latest' || url.search || url.hash) throw Error();
  } catch { throw new RatingsProxyError(503, 'Cloud ratings are not configured.'); }
  try {
    const response = await fetcher(url.href, {
      method: 'GET', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
      redirect: 'error', signal: AbortSignal.timeout(25000), cache: 'no-store'
    });
    if (!response.ok || !response.headers.get('content-type')?.includes('application/json') || !response.body) {
      await response.body?.cancel(); throw Error();
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = []; let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 2_000_000) { await reader.cancel(); throw Error(); }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    if (data?.ok !== true || !Array.isArray(data.ratings) || data.ratings.length > 10000 || data.storeCount !== data.ratings.length) throw Error();
    const identities = new Set<string>();
    const ratings = data.ratings.map((row: any) => {
      if (!row || typeof row.storeIdentityKey !== 'string' || row.storeIdentityKey.length > 128 ||
          !/^[A-Za-z0-9][A-Za-z0-9:;_.-]*$/.test(row.storeIdentityKey) || row.storeIdentityKey.includes(token) ||
          identities.has(row.storeIdentityKey) || typeof row.timestamp !== 'string' ||
          !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(row.timestamp) ||
          !Number.isFinite(Date.parse(row.timestamp)) ||
          (row.rating !== null && (typeof row.rating !== 'number' || !Number.isFinite(row.rating) || row.rating < 1 || row.rating > 5)) ||
          !Number.isSafeInteger(row.reviewCount) || row.reviewCount < 0 ||
          !Number.isSafeInteger(row.oneStarCount) || row.oneStarCount < 0 || row.oneStarCount > row.reviewCount ||
          !['HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNRATED'].includes(row.status) ||
          (row.rating === null) !== (row.status === 'UNRATED')) throw Error();
      identities.add(row.storeIdentityKey);
      if(row.storeName!=null&&(typeof row.storeName!=='string'||!row.storeName.trim()||row.storeName.length>512||/[\u0000-\u001f\u007f]/.test(row.storeName)||row.storeName.includes(token)))throw Error();
      return { storeIdentityKey: row.storeIdentityKey as string, storeName: (row.storeName??null) as string|null, rating: row.rating as number | null,
        reviewCount: row.reviewCount as number, oneStarCount: row.oneStarCount as number,
        status: row.status as string, timestamp: row.timestamp as string };
    });
    return { ok: true, storeCount: ratings.length, ratings };
  } catch { throw new RatingsProxyError(502, 'Cloud ratings are unavailable. Please try again.'); }
}
