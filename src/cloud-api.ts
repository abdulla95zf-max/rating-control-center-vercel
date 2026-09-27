import {fetchPerformance,fetchTstar,PerformanceError,requestPerformanceQuery} from './services/performance-proxy.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {fetchLatestRatings, RatingsProxyError} from './services/latest-ratings-proxy.ts';
import {fetchActionHistory,fetchPerformanceHistory,fetchRatingHistory,HistoryProxyError} from './services/history-proxy.ts';
import {requireUser} from './auth.ts';
import {scopePerformance,scopeRatings} from './services/branch-identity.ts';
import {registerBranchSources} from './services/branch-registry.ts';

/** Cloud-only entry point: never imports local configuration, SQLite or the Windows server. */
export function createCloudHandler(route: 'config' | 'health' | 'ratings' | 'performance' | 'ratingHistory' | 'performanceHistory' | 'actionHistory', env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch,authenticate:typeof requireUser=requireUser) {
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
    const user=await authenticate(request,response);if(!user)return;
    if (route === 'config') return send(200, {cloudRatings: true, autoRefreshSeconds: 60});
    if (route === 'health') return send(200, {ok: true, mode: 'cloud'});
    if(route==='performance'){
      try{const query=requestPerformanceQuery(request.url||''),config={ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''};return send(200,await scopePerformance(query.dataset==='tstar'?await fetchTstar(config,fetcher):await fetchPerformance(config,query.date,fetcher,query.period),user));}
      catch(error){return send(error instanceof PerformanceError?error.status:502,{error:error instanceof PerformanceError?error.message:'Performance reports are unavailable.'});}
    }
    if(route==='ratingHistory'||route==='performanceHistory'||route==='actionHistory'){
      try{const url=new URL(request.url||'','https://dashboard.invalid');const config={ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''};if(route==='ratingHistory'){const identity=url.searchParams.get('storeIdentityKey')||'',latest=await scopeRatings(await fetchLatestRatings({host:'',port:0,talabatDatabasePath:'',publicDirectory:'',autoRefreshSeconds:60,ratingsApiUrl:config.ratingsApiUrl,ratingsApiToken:config.ratingsApiToken},fetcher),user),row=latest.ratings.find((item:any)=>item.storeIdentityKey===identity);if(!row)return send(403,{error:'Forbidden'});return send(200,await fetchRatingHistory(config,identity,url.searchParams.get('range')||'30d',fetcher));}if(route==='actionHistory'){const days=Number(url.searchParams.get('days')||30),[latest,history]=await Promise.all([fetchPerformance(config,undefined,fetcher),fetchActionHistory(config,days,fetcher)]),scoped=await scopePerformance(latest,user),allowedIds=new Set(scoped.rows.map((row:any)=>String(row.storeId)));return send(200,{...history,points:history.points.filter((point:{storeId:string})=>allowedIds.has(point.storeId))});}const storeId=url.searchParams.get('storeId')||'',latest=await scopePerformance(await fetchPerformance(config,undefined,fetcher),user),row=latest.rows.find((item:any)=>item.storeId===storeId);if(!row)return send(403,{error:'Forbidden'});return send(200,await fetchPerformanceHistory(config,storeId,Number(url.searchParams.get('days')||30),fetcher));}
      catch(error){return send(error instanceof HistoryProxyError?error.status:502,{error:error instanceof HistoryProxyError?error.message:'History is unavailable.'});}
    }
    try {
      const ratings = await fetchLatestRatings({
        // The existing proxy consumes only the two ratings settings. No local configuration is loaded.
        host: '', port: 0, talabatDatabasePath: '', publicDirectory: '', autoRefreshSeconds: 60,
        ratingsApiUrl: env.RATINGS_API_URL || '', ratingsApiToken: env.RATINGS_API_TOKEN || ''
      }, fetcher);
      return send(200, await scopeRatings(ratings,user));
    } catch (error) {
      return send(error instanceof RatingsProxyError ? error.status : 502,
        {error: error instanceof RatingsProxyError ? error.message : 'Cloud ratings are unavailable.'});
    }
  };
}
