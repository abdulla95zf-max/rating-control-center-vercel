import {fetchPerformance,PerformanceError,requestDate} from './services/performance-proxy.ts';
import express, { type NextFunction, type Request, type Response } from 'express';
import type { AppConfig } from './config.ts';
import { TalabatDataSource } from './adapters/talabat-data-source.ts';
import { DisconnectedDataSource } from './adapters/disconnected-data-source.ts';
import { DataSourceRegistry } from './services/data-source-registry.ts';
import type { RatingStatus, StoreQuery } from './types.ts';
import { fetchLatestRatings, RatingsProxyError } from './services/latest-ratings-proxy.ts';

const VALID_STATUSES = new Set<RatingStatus>(['HEALTHY', 'ACCEPTABLE', 'WARNING', 'CRITICAL', 'UNKNOWN']);
const VALID_SORTS = new Set<NonNullable<StoreQuery['sort']>>(['name_asc', 'rating_asc', 'rating_desc', 'change_asc', 'change_desc']);

export function createRegistry(config: AppConfig): DataSourceRegistry {
  return new DataSourceRegistry([
    new TalabatDataSource(config.talabatDatabasePath),
    new DisconnectedDataSource('keeta', 'Keeta'),
    new DisconnectedDataSource('noon', 'Noon'),
    new DisconnectedDataSource('careem', 'Careem'),
    new DisconnectedDataSource('deliveroo', 'Deliveroo')
  ]);
}

export function createApp(config: AppConfig, registry = createRegistry(config), ratingsFetch: typeof fetch = fetch): express.Express {
  const app = express();
  app.disable('x-powered-by');
  app.use((_request, response, next) => {
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Cache-Control', 'no-store');
    next();
  });

  app.get('/api/health', (_request, response) => response.json({ ok: true, localOnly: true }));
  app.get('/api/config', (_request, response) => response.json({ autoRefreshSeconds: config.autoRefreshSeconds, cloudRatings: Boolean(config.ratingsApiUrl) }));
  app.get('/api/dashboard/ratings/latest', async (request, response) => {
    if (request.get('sec-fetch-site') === 'cross-site') return response.status(403).json({ error: 'Forbidden' });
    try { return response.json(await fetchLatestRatings(config, ratingsFetch)); }
    catch (error) {
      return response.status(error instanceof RatingsProxyError ? error.status : 502)
        .json({ error: error instanceof RatingsProxyError ? error.message : 'Cloud ratings are unavailable.' });
    }
  });
  app.get('/api/dashboard/performance/latest',async(request,response)=>{
    if(request.get('sec-fetch-site')==='cross-site')return response.status(403).json({error:'Forbidden'});
    try{return response.json(await fetchPerformance(config,requestDate(request.originalUrl),ratingsFetch));}
    catch(error){return response.status(error instanceof PerformanceError?error.status:502).json({error:error instanceof PerformanceError?error.message:'Performance reports are unavailable.'});}
  });
  app.get('/api/platforms', (_request, response) => response.json({ platforms: registry.states() }));

  app.get('/api/overview', (request, response, next) => {
    try {
      const platform = String(request.query.platform ?? 'all').toLowerCase();
      if (platform === 'all') return response.json({ platform: 'all', overview: registry.overview() });
      const source = requireSource(registry, platform);
      return response.json({ platform: source.state, overview: source.getOverview() });
    } catch (error) { next(error); }
  });

  app.get('/api/stores', (request, response, next) => {
    try {
      const source = requireSource(registry, String(request.query.platform ?? 'talabat'));
      const statusText = request.query.status ? String(request.query.status).toUpperCase() : '';
      if (statusText && !VALID_STATUSES.has(statusText as RatingStatus)) return response.status(400).json({ error: 'Invalid status filter' });
      const sortText = String(request.query.sort ?? 'name_asc');
      if (!VALID_SORTS.has(sortText as NonNullable<StoreQuery['sort']>)) return response.status(400).json({ error: 'Invalid sort option' });
      const search = String(request.query.search ?? '').trim().slice(0, 100);
      const query: StoreQuery = { sort: sortText as NonNullable<StoreQuery['sort']> };
      if (search) query.search = search;
      if (statusText) query.status = statusText as RatingStatus;
      return response.json({ platform: source.state, stores: source.getStores(query) });
    } catch (error) { next(error); }
  });

  app.get('/api/stores/:storeId', (request, response, next) => {
    try {
      const source = requireSource(registry, String(request.query.platform ?? 'talabat'));
      const storeId = request.params.storeId ?? '';
      if (!/^[A-Za-z0-9_-]{1,80}$/.test(storeId)) return response.status(400).json({ error: 'Invalid store ID' });
      const store = source.getStore(storeId);
      if (!store) return response.status(404).json({ error: 'Store not found' });
      const range = request.query.range ? String(request.query.range) : null;
      if (range && !['24h', '7d', '30d', 'all'].includes(range)) return response.status(400).json({ error: 'Invalid history range' });
      const days = range === '24h' ? 1 : range === '7d' ? 7 : 30;
      const since = range && range !== 'all' ? new Date(Date.now() - days * 86400000).toISOString() : undefined;
      const requestedLimit = Number(request.query.limit ?? 500);
      const limit = Number.isInteger(requestedLimit) ? Math.min(Math.max(requestedLimit, 1), 2000) : 500;
      return response.json({ platform: source.state, store, history: source.getHistory(storeId, range ? -1 : limit, since) });
    } catch (error) { next(error); }
  });

  app.use('/api', (_request, response) => response.status(404).json({ error: 'API route not found' }));
  app.use(express.static(config.publicDirectory, { index: 'index.html', fallthrough: true, etag: true }));
  app.get('*path', (_request, response) => response.sendFile('index.html', { root: config.publicDirectory }));

  app.use((error: unknown, _request: Request, response: Response, _next: NextFunction) => {
    console.error(JSON.stringify({ timestamp: new Date().toISOString(), level: 'error', event: 'request_failed', code: 'DASHBOARD_DATA_UNAVAILABLE' }));
    response.status(503).json({ error: 'Dashboard data is unavailable.' });
  });
  return app;
}

function requireSource(registry: DataSourceRegistry, platform: string) {
  const source = registry.get(platform.toLowerCase());
  if (!source) throw new Error('Unknown platform');
  if (!source.state.connected) throw new Error(source.state.message ?? `${source.state.name} is not connected`);
  return source;
}
