import {fetchGrowth} from './services/growth.ts';
import {readKeetaHistory} from './services/keeta-rating-history.ts';
import {validateNoonPeriod,requestStatus,enqueueNoonPerformance} from './services/noon-performance-requests.ts';
import {readNoonPerformance,scopeNoonPerformance} from './services/noon-performance.ts';
import {withNoonRatings,readNoonHistory} from './services/noon-ratings.ts';
import {fetchPerformance,fetchTstar,fetchKeetaPerformance,PerformanceError,requestPerformanceQuery} from './services/performance-proxy.ts';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {fetchLatestRatings, RatingsProxyError} from './services/latest-ratings-proxy.ts';
import {fetchActionHistory,fetchPerformanceHistory,fetchRatingHistory,HistoryProxyError} from './services/history-proxy.ts';
import {readJson,sameOrigin,requireUser} from './auth.ts';
import {scopePerformance,scopeRatings,scopeKeetaPerformance} from './services/branch-identity.ts';
import {registerBranchSources} from './services/branch-registry.ts';

/** Cloud-only entry point: never imports local configuration, SQLite or the Windows server. */
export function createCloudHandler(route: 'config' | 'health' | 'ratings' | 'performance' | 'ratingHistory' | 'performanceHistory' | 'actionHistory', env: NodeJS.ProcessEnv = process.env, fetcher: typeof fetch = fetch,authenticate:typeof requireUser=requireUser) {
  return async (request: IncomingMessage, response: ServerResponse) => {
    response.setHeader('Cache-Control', 'no-store, private');
    response.setHeader('Content-Type', 'application/json; charset=utf-8');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    const send = (status: number, body: unknown) => {response.statusCode = status; response.end(JSON.stringify(body));};
    const requestUrl=new URL(request.url||'','https://dashboard.invalid');
    if(route==='performance'&&request.method==='POST'&&requestUrl.searchParams.get('dataset')==='noon'){
      if(!sameOrigin(request))return send(403,{error:'Forbidden'});const user=await authenticate(request,response);if(!user)return;
      if(env.NOON_RATINGS_ENABLED!=='true')return send(503,{error:'Noon is disabled.'});
      try{if(!['admin','portfolio_manager'].includes(user.role))return send(403,{error:'Administrator or portfolio manager required.'});const body=await readJson(request),period=validateNoonPeriod(body.startDate,body.endDate);return send(202,await enqueueNoonPerformance(user,period,env,fetcher));}
      catch(e:any){const code=['PERIOD_INVALID','REQUEST_LIMIT_REACHED','DISPATCH_NOT_CONFIGURED','DISPATCH_FAILED','REQUEST_SAVE_FAILED'].includes(e.message)?e.message:'REQUEST_FAILED';return send(code==='PERIOD_INVALID'?400:code==='REQUEST_LIMIT_REACHED'?429:503,{error:code});}
    }
    if (request.method !== 'GET') {
      response.setHeader('Allow', 'GET');
      return send(405, {error: 'Method not allowed'});
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') return send(403, {error: 'Forbidden'});
    const user=await authenticate(request,response);if(!user)return;
    if (route === 'config') return send(200, {cloudRatings: true, autoRefreshSeconds: 60});
    if (route === 'health') return send(200, {ok: true, mode: 'cloud'});
    if(route==='performance'){
      try{if(requestUrl.searchParams.get('dataset')==='growth'){if([...requestUrl.searchParams.keys()].some(k=>k!=='dataset')||requestUrl.searchParams.getAll('dataset').length!==1)return send(400,{error:'Invalid Growth request.'});return send(200,await fetchGrowth(user,env,fetcher));}if(new URL(request.url||'','https://dashboard.invalid').searchParams.get('dataset')==='noon'){if(env.NOON_RATINGS_ENABLED!=='true')return send(200,{state:'EMPTY',snapshot:null,errorCode:null});const params=requestUrl.searchParams,from=params.get('startDate'),to=params.get('endDate'),period=from||to?validateNoonPeriod(from,to):undefined;const data=await scopeNoonPerformance(await readNoonPerformance(undefined,period),user);return send(200,{...data,request:period?await requestStatus(period):null,canRequest:['admin','portfolio_manager'].includes(user.role),dispatchConfigured:Boolean(env.NOON_GITHUB_DISPATCH_TOKEN)});}const query=requestPerformanceQuery(request.url||''),config={ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''};if(query.dataset==='keeta')return send(200,await scopeKeetaPerformance(await fetchKeetaPerformance(config,fetcher),user));return send(200,await scopePerformance(query.dataset==='tstar'?await fetchTstar(config,fetcher):await fetchPerformance(config,query.date,fetcher,query.period),user));}
      catch(error){return send(error instanceof Error&&error.message==='PERIOD_INVALID'?400:error instanceof PerformanceError?error.status:502,{error:error instanceof PerformanceError?error.message:'Performance reports are unavailable.'});}
    }
    if(route==='ratingHistory'||route==='performanceHistory'||route==='actionHistory'){
      try{const url=new URL(request.url||'','https://dashboard.invalid');const config={ratingsApiUrl:env.RATINGS_API_URL||'',ratingsApiToken:env.RATINGS_API_TOKEN||''};if(route==='ratingHistory'){const identity=url.searchParams.get('storeIdentityKey')||'',latest=await scopeRatings(await withNoonRatings(await fetchLatestRatings({host:'',port:0,talabatDatabasePath:'',publicDirectory:'',autoRefreshSeconds:60,ratingsApiUrl:config.ratingsApiUrl,ratingsApiToken:config.ratingsApiToken},fetcher),env.NOON_RATINGS_ENABLED==='true'),user),row=latest.ratings.find((item:any)=>item.storeIdentityKey===identity);if(!row)return send(403,{error:'Forbidden'});return send(200,identity.startsWith('KEETA;')?await readKeetaHistory(identity,url.searchParams.get('range')||'30d'):identity.startsWith('NOON;')?await readNoonHistory(identity,url.searchParams.get('range')||'30d'):await fetchRatingHistory(config,identity,url.searchParams.get('range')||'30d',fetcher));}if(route==='actionHistory'){const days=Number(url.searchParams.get('days')||30),[latest,history]=await Promise.all([fetchPerformance(config,undefined,fetcher),fetchActionHistory(config,days,fetcher)]),scoped=await scopePerformance(latest,user),allowedIds=new Set(scoped.rows.map((row:any)=>String(row.storeId)));return send(200,{...history,points:history.points.filter((point:{storeId:string})=>allowedIds.has(point.storeId))});}const storeId=url.searchParams.get('storeId')||'',latest=await scopePerformance(await fetchPerformance(config,undefined,fetcher),user),row=latest.rows.find((item:any)=>item.storeId===storeId);if(!row)return send(403,{error:'Forbidden'});return send(200,await fetchPerformanceHistory(config,storeId,Number(url.searchParams.get('days')||30),fetcher));}
      catch(error){return send(error instanceof HistoryProxyError?error.status:502,{error:error instanceof HistoryProxyError?error.message:'History is unavailable.'});}
    }
    try {
      const ratings = await fetchLatestRatings({
        // The existing proxy consumes only the two ratings settings. No local configuration is loaded.
        host: '', port: 0, talabatDatabasePath: '', publicDirectory: '', autoRefreshSeconds: 60,
        ratingsApiUrl: env.RATINGS_API_URL || '', ratingsApiToken: env.RATINGS_API_TOKEN || ''
      }, fetcher);
      return send(200, await scopeRatings(await withNoonRatings(ratings,env.NOON_RATINGS_ENABLED==='true'),user));
    } catch (error) {
      return send(error instanceof RatingsProxyError ? error.status : 502,
        {error: error instanceof RatingsProxyError ? error.message : 'Cloud ratings are unavailable.'});
    }
  };
}
