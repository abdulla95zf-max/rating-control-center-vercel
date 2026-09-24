import {fetchPerformance,PerformanceError,requestDate} from './services/performance-proxy.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {fetchLatestRatings, RatingsProxyError} from './services/latest-ratings-proxy.ts';

/** Cloud-only entry point: never imports local configuration, SQLite or the Windows server. */
export function createCloudHandler(route: 'config' | 'health' | 'ratings' | 'performance', env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {response.statusCode = status; response.end(JSON.stringify(body));};
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(405, {error: 'Method not allowed'});
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') return send(403, {error: 'Forbidden'});
    if (route === 'config') return send(200, {cloudRatings: true, autoRefreshSeconds: 60});
    if (route === 'health') return send(200, {ok: true, mode: 'cloud'});
    if(route==='performance'){
      try{return send(200,await fetchPerformance({ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''},requestDate(request.url||''),fetcher));}
      catch(error){return send(error instanceof PerformanceError?error.status:502,{error:error instanceof PerformanceError?error.message:'Performance reports are unavailable.'});}
    }
    try {
      const ratings = await fetchLatestRatings({
        // The existing proxy consumes only the two ratings settings. No local configuration is loaded.
        host: '', port: 0, talabatDatabasePath: '', publicDirectory: '', autoRefreshSeconds: 60,
        ratingsApiUrl: env.RATINGS_API_URL || '', ratingsApiToken: env.RATINGS_API_TOKEN || ''
      }, fetcher);
      return send(200, ratings);
    } catch (error) {
      return send(error instanceof RatingsProxyError ? error.status : 502,
        {error: error instanceof RatingsProxyError ? error.message : 'Cloud ratings are unavailable.'});
    }
  };
}
