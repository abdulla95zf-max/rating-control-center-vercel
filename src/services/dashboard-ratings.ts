import {authDatabase} from '../auth.ts';
import {fetchLatestRatings, RatingsProxyError, type CloudPlatformResult} from './latest-ratings-proxy.ts';
import {readNoonRatings} from './noon-ratings.ts';
import {readDeliverooRatings} from './deliveroo-ratings.ts';

export type DashboardRatings = Awaited<ReturnType<typeof fetchLatestRatings>>;
export type RatingsReaders = {
  upstream: (signal: AbortSignal) => Promise<DashboardRatings>;
  noon: (signal: AbortSignal) => Promise<CloudPlatformResult>;
  deliveroo: (signal: AbortSignal) => Promise<CloudPlatformResult>;
};

const failed = (platform: CloudPlatformResult['platform']): CloudPlatformResult => ({
  platform, state: 'ERROR', storeCount: 0, syncTimestamp: null,
  emptyReason: null, errorCode: 'RATINGS_READ_FAILED', ratings: []
});

/** Bound waiting even when a dependency ignores cancellation; never expose a late result. */
export async function beforeDeadline<T>(deadline: number, read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  if (Date.now() >= deadline) throw new RatingsProxyError(504, 'Ratings request timed out.');
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new RatingsProxyError(504, 'Ratings request timed out.'));
      controller.abort();
    }, deadline - Date.now());
  });
  try { return await Promise.race([expired, Promise.resolve().then(() => read(controller.signal))]); }
  finally { clearTimeout(timer); }
}

// Existing readers retain their validation and query limits. Stop follow-up queries after
// expiration and shorten each query to the remaining budget; this is not SQL cancellation.
function deadlineDatabase(signal: AbortSignal, deadline: number) {
  return {query: async (input: any, values?: any[]) => {
    if (signal.aborted || Date.now() >= deadline) throw new Error('RATINGS_READ_FAILED');
    const query = typeof input === 'string' ? {text: input, values} : {...input};
    query.query_timeout = Math.max(1, Math.min(query.query_timeout ?? 5000, deadline - Date.now()));
    return authDatabase().query(query);
  }};
}

/** Independent reads share one absolute deadline. Disabled sources are never opened. */
export async function readDashboardRatings(
  env: NodeJS.ProcessEnv, fetcher: typeof fetch = fetch,
  readers: Partial<RatingsReaders> = {}, deadline = Date.now() + 12_000
): Promise<DashboardRatings> {
  const defaults: RatingsReaders = {
    upstream: signal => fetchLatestRatings({host: '', port: 0, talabatDatabasePath: '', publicDirectory: '',
      autoRefreshSeconds: 60, ratingsApiUrl: env.RATINGS_API_URL || '', ratingsApiToken: env.RATINGS_API_TOKEN || ''},
      (input, init) => fetcher(input, {...init, signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal})),
    noon: signal => readNoonRatings(deadlineDatabase(signal, deadline)),
    deliveroo: signal => readDeliverooRatings(deadlineDatabase(signal, deadline))
  };
  const read = {...defaults, ...readers};
  const jobs: Array<{platform: 'upstream' | 'noon' | 'deliveroo'; run: () => Promise<DashboardRatings | CloudPlatformResult>}> = [
    {platform: 'upstream', run: () => beforeDeadline(deadline, read.upstream)}
  ];
  if (env.NOON_RATINGS_ENABLED === 'true') jobs.push({platform: 'noon', run: () => beforeDeadline(deadline, read.noon)});
  if (env.DELIVEROO_RATINGS_ENABLED === 'true') jobs.push({platform: 'deliveroo', run: () => beforeDeadline(deadline, read.deliveroo)});
  const results = await Promise.allSettled(jobs.map(job => job.run()));
  const platforms: CloudPlatformResult[] = [];
  for (const [index, job] of jobs.entries()) {
    const result = results[index]!;
    if (job.platform === 'upstream') {
      platforms.push(...(result.status === 'fulfilled' ? (result.value as DashboardRatings).platforms : [failed('talabat'), failed('keeta')]));
    } else platforms.push(result.status === 'fulfilled' ? result.value as CloudPlatformResult : failed(job.platform));
  }
  const upstream = results[0]!;
  // A valid upstream response with explicit per-platform errors keeps its existing
  // response contract. A total transport/configuration outage remains a global error.
  if (upstream.status === 'rejected' && platforms.every(platform => platform.state === 'ERROR')) {
    if (upstream.reason instanceof RatingsProxyError) throw upstream.reason;
    throw new RatingsProxyError(502, 'Cloud ratings are unavailable. Please try again.');
  }
  const ratings = platforms.flatMap(platform => platform.ratings)
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.storeIdentityKey.localeCompare(b.storeIdentityKey));
  return {ok: true, selector: 'all', storeCount: ratings.length, ratings, platforms};
}
