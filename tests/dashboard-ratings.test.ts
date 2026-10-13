import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setImmediate as nextTurn} from 'node:timers/promises';
import {beforeDeadline, readDashboardRatings, type RatingsReaders} from '../src/services/dashboard-ratings.ts';
import {type CloudPlatformResult} from '../src/services/latest-ratings-proxy.ts';
import {readNoonRatings} from '../src/services/noon-ratings.ts';
import {readDeliverooRatings} from '../src/services/deliveroo-ratings.ts';
import {createCloudHandler} from '../src/cloud-api.ts';
import {authDatabase} from '../src/auth.ts';

const secret = 'synthetic-private-value';
const noonSnapshot = JSON.parse(fs.readFileSync('tests/fixtures/noon-snapshot.json', 'utf8'));
const deliverooSnapshot = JSON.parse(fs.readFileSync('tests/fixtures/deliveroo-snapshot.json', 'utf8'));
const empty = (platform: CloudPlatformResult['platform']): CloudPlatformResult => ({
  platform, state: 'EMPTY', storeCount: 0, syncTimestamp: null, emptyReason: 'NO_RUN', errorCode: null, ratings: []
});
const upstream = async () => ({ok: true, selector: 'all' as const, storeCount: 0, ratings: [], platforms: [empty('talabat'), empty('keeta')]});
const noon = () => readNoonRatings({query: async (query: any) => ({rows: query.text.includes('noon_session_health') ? [{expired: true}] : [{payload: noonSnapshot}]})});
const deliveroo = () => readDeliverooRatings({query: async () => ({rows: [{payload: deliverooSnapshot}]})});
const env = {NOON_RATINGS_ENABLED: 'true', DELIVEROO_RATINGS_ENABLED: 'true'};
const fail = async (): Promise<never> => {throw Error(secret);};
const readers: RatingsReaders = {upstream, noon, deliveroo};

test('failed or malformed upstream preserves validated Noon/Deliveroo rows and session health', async () => {
  for (const fetcher of [async () => {throw Error(secret);}, async () => Response.json({ok: true, ratings: [secret]})]) {
    const result = await readDashboardRatings({...env, RATINGS_API_URL: 'https://example.com/api/ratings/latest', RATINGS_API_TOKEN: 'synthetic-token-'.repeat(4)}, fetcher, {noon, deliveroo});
    assert.equal(result.storeCount, 38);
    assert.deepEqual(result.platforms.map(p => [p.platform, p.state]), [['talabat', 'ERROR'], ['keeta', 'ERROR'], ['noon', 'SUCCESS'], ['deliveroo', 'SUCCESS']]);
    assert.equal(result.platforms[2]!.sessionHealth, 'EXPIRED');
    assert.equal(new Set(result.ratings.map(row => row.storeIdentityKey)).size, 38);
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test('either optional source fails independently, and disabled readers are never invoked', async () => {
  const result = await readDashboardRatings(env, fetch, {...readers, noon: fail});
  assert.equal(result.storeCount, 16);
  assert.equal(result.platforms[2]!.state, 'ERROR');
  assert.equal(result.platforms[3]!.state, 'SUCCESS');
  const other = await readDashboardRatings(env, fetch, {...readers, deliveroo: fail});
  assert.equal(other.storeCount, 22);
  const disabled = await readDashboardRatings({}, fetch, {upstream, noon: async () => assert.fail(), deliveroo: async () => assert.fail()});
  assert.equal(disabled.platforms.length, 2);
  assert.equal(disabled.storeCount, 0);
});

test('total outage preserves sanitized global errors, while genuine EMPTY stays valid', async () => {
  await assert.rejects(readDashboardRatings(env, fetch, {upstream: fail, noon: fail, deliveroo: fail}),
    {status: 502, message: 'Cloud ratings are unavailable. Please try again.'});
  await assert.rejects(readDashboardRatings({}, fetch), {status: 503, message: 'Cloud ratings are not configured.'});
  const result = await readDashboardRatings({NOON_RATINGS_ENABLED: 'true'}, fetch, {upstream: fail, noon: async () => empty('noon')});
  assert.equal(result.platforms[2]!.state, 'EMPTY');
  assert.equal(result.platforms[0]!.state, 'ERROR');
  assert.equal(result.storeCount, 0);
  const declared = await readDashboardRatings({}, fetch, {upstream: async () => ({
    ...await upstream(), platforms: ['talabat', 'keeta'].map(platform => ({
      ...empty(platform as 'talabat' | 'keeta'), state: 'ERROR' as const,
      emptyReason: null, errorCode: 'RATINGS_READ_FAILED' as const
    }))
  })});
  assert.equal(declared.ok, true);
  assert.ok(declared.platforms.every(platform => platform.state === 'ERROR'));
});

test('all reads start together; one never-settling source cannot hide completed sources', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1000});
  const started: string[] = [];
  let signal: AbortSignal | undefined;
  let finish: ((value: Awaited<ReturnType<typeof upstream>>) => void) | undefined;
  const pending = readDashboardRatings(env, fetch, {
    upstream: s => {started.push('upstream'); signal = s; return new Promise(resolve => {finish = resolve;});},
    noon: async () => {started.push('noon'); return noon();},
    deliveroo: async () => {started.push('deliveroo'); return deliveroo();}
  }, 1100);
  await nextTurn();
  assert.deepEqual(started, ['upstream', 'noon', 'deliveroo']);
  t.mock.timers.tick(100);
  const result = await pending;
  assert.equal(signal!.aborted, true);
  assert.equal(result.storeCount, 38);
  finish!(await upstream());
  await nextTurn();
  assert.equal(result.platforms[0]!.state, 'ERROR');
  assert.equal(result.storeCount, 38);
});

test('default upstream fetch receives cancellation, including stalled response body', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1000});
  let signal: AbortSignal | undefined;
  const pending = readDashboardRatings({...env, RATINGS_API_URL: 'https://example.com/api/ratings/latest', RATINGS_API_TOKEN: 'synthetic-token-'.repeat(4)},
    async (_input, init) => {
      signal = init!.signal as AbortSignal;
      return new Response(new ReadableStream({start(controller) {
        signal!.addEventListener('abort', () => controller.error(Error(secret)), {once: true});
      }}), {headers: {'content-type': 'application/json'}});
    }, {noon, deliveroo}, 1100);
  await nextTurn();
  t.mock.timers.tick(100);
  const result = await pending;
  assert.equal(signal!.aborted, true);
  assert.equal(result.storeCount, 38);
  assert.ok(!JSON.stringify(result).includes(secret));
});

test('expired deadline does not begin a read and late rejection is consumed', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1000});
  await assert.rejects(beforeDeadline(1000, async () => assert.fail()), {status: 504});
  let reject: ((reason: unknown) => void) | undefined;
  const pending = beforeDeadline(1050, () => new Promise((_, fail) => {reject = fail;}));
  const checked = assert.rejects(pending, {status: 504});
  await nextTurn(); t.mock.timers.tick(50); await checked;
  reject!(Error(secret)); await nextTurn();
});

test('cloud route applies real branch scope to partial results and history denies inaccessible branches', async t => {
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://synthetic:synthetic@localhost:5432/synthetic';
  const db = authDatabase();
  let historyReads = 0;
  t.mock.method(db, 'query', async (query: any, values?: any[]) => {
    const sql = typeof query === 'string' ? query : query.text;
    if (sql.includes('dashboard_branch_sources s JOIN')) {
      const [types, ids] = values!;
      return {rows: ids.map((id: string, index: number) => {
        const allowed = id.includes('FRB') || id.endsWith(';621382');
        return {source_type: types[index], source_id: id, id: 'synthetic-' + index,
          canonical_key: 'synthetic|' + index, brand: allowed ? 'FRB Kabab' : 'Kabab Fareej', branch_name: 'Synthetic', display_name: 'Synthetic', active: !id.includes('FRBKBB25EW')};
      })};
    }
    if (sql.includes('noon_rating_snapshots')) {historyReads++; return {rows: [{payload: noonSnapshot}]};}
    assert.fail('Unexpected database query: ' + sql);
  });
  const user = {id: 'test', username: 'test', displayName: 'Test', role: 'brand_manager' as const,
    scopes: [{type: 'brand' as const, key: 'FRB Kabab'}], mustChangePassword: false, isOwner: false};
  const call = async (route: 'ratings' | 'ratingHistory', url: string) => {
    const response: any = {setHeader() {}, end(text: string) {this.body = JSON.parse(text);}};
    await createCloudHandler(route, env, fetch, async () => user, {...readers, upstream: fail})({method: 'GET', url, headers: {}} as any, response);
    return response;
  };
  try {
    const result = await call('ratings', '/api/dashboard/ratings/latest');
    assert.equal(result.statusCode, 200);
    assert.ok(result.body.ratings.length > 0 && result.body.ratings.length < 38);
    assert.ok(result.body.ratings.every((row: any) => row.storeIdentityKey.includes('FRB') || row.storeIdentityKey.endsWith(';621382')));
    assert.ok(!result.body.ratings.some((row: any) => row.storeIdentityKey.includes('FRBKBB25EW')));
    assert.equal(result.body.storeCount, result.body.ratings.length);
    assert.ok(result.body.platforms.every((p: any) => p.storeCount === p.ratings.length));
    const denied = await call('ratingHistory', '/api/dashboard/ratings/history?storeIdentityKey=NOON;R2813694825370398006896956A;KBBFRJKRTU');
    assert.equal(denied.statusCode, 403);
    assert.equal(historyReads, 0);
    const allowed = await call('ratingHistory', '/api/dashboard/ratings/history?storeIdentityKey=NOON;R9408821663380305655608737A;FRBKBB08PH&range=7d');
    assert.equal(allowed.statusCode, 200);
    assert.equal(historyReads, 1);
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});

test('unauthenticated and cross-site requests never open ratings sources', async () => {
  for (const crossSite of [false, true]) {
    const response: any = {setHeader() {}, end(text: string) {this.body = JSON.parse(text);}};
    await createCloudHandler('ratings', env, fetch, async (_request, res) => {
      res.statusCode = 401; res.end(JSON.stringify({error: 'Authentication required'})); return null;
    }, {upstream: async () => assert.fail(), noon: async () => assert.fail(), deliveroo: async () => assert.fail()})
    ({method: 'GET', headers: crossSite ? {'sec-fetch-site': 'cross-site'} : {}} as any, response);
    assert.equal(response.statusCode, crossSite ? 403 : 401);
  }
});

test('authorization timeout fails closed and never emits unscoped or late rows', async t => {
  t.mock.timers.enable({apis: ['Date', 'setTimeout'], now: 1000});
  const previousUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://synthetic:synthetic@localhost:5432/synthetic';
  let finish: ((value: any) => void) | undefined;
  t.mock.method(authDatabase(), 'query', () => new Promise(resolve => {finish = resolve;}));
  const user = {id: 'test', username: 'test', displayName: 'Test', role: 'viewer' as const,
    scopes: [], mustChangePassword: false, isOwner: false};
  let responses = 0;
  const response: any = {setHeader() {}, end(text: string) {responses++; this.body = JSON.parse(text);}};
  try {
    const pending = createCloudHandler('ratings', env, fetch, async () => user, {...readers, upstream: fail})
      ({method: 'GET', headers: {}} as any, response);
    await nextTurn();
    assert.ok(finish);
    t.mock.timers.tick(24000);
    await pending;
    assert.equal(response.statusCode, 504);
    assert.deepEqual(response.body, {error: 'Ratings request timed out.'});
    assert.equal(responses, 1);
    finish!({rows: []}); await nextTurn();
    assert.equal(responses, 1);
    assert.ok(!('ratings' in response.body));
  } finally {
    if (previousUrl === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = previousUrl;
  }
});
