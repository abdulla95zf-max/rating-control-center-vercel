const state = {
  tab: 'overview',
  platforms: [],
  search: '',
  brand: '',
  status: '',
  sort: 'name_asc',
  refreshSeconds: 60,
  timer: null,
  busy: false,
  cloudRatings: false,
  cloudResponse: null,
  actionBrand: ''
};

const main = document.getElementById('mainContent');
const tabs = document.getElementById('platformTabs');
const refreshState = document.getElementById('refreshState');
const detailPanel = document.getElementById('detailPanel');
const detailContent = document.getElementById('detailContent');
const talabatViewTabs = document.getElementById('talabatViewTabs');

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character]);
const formatRating = value => value === null ? '—' : Number(value).toFixed(1);
const formatNumber = value => value === null || value === undefined ? '—' : new Intl.NumberFormat('en-US').format(value);
const timestamp = value => { const v = String(value || '').trim().replace(' ', 'T'); return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(v) ? v : v + 'Z'); };
const formatTime = value => Number.isFinite(timestamp(value)) ? new Intl.DateTimeFormat('en-GB', { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp(value)) : 'No data';
const ago = value => { const minutes = Math.floor((Date.now() - timestamp(value)) / 60000); return !Number.isFinite(minutes) ? 'Unknown' : minutes < 0 ? 'Future timestamp' : minutes < 60 ? minutes + ' min ago' : Math.floor(minutes / 60) + 'h ' + minutes % 60 + 'm ago'; };
const healthHtml = p => statusHtml(p?.health || 'ERROR');
function healthBanner(p) {
  return '<section class="health-banner">' + escapeHtml(p?.name || 'Talabat') + ' • ' + healthHtml(p) +
    ' • Last successful sync ' + escapeHtml(ago(p?.lastSuccessfulSync)) +
    '<p>Last snapshot: ' + escapeHtml(formatTime(p?.lastSnapshot)) + ' (' + escapeHtml(ago(p?.lastSnapshot)) + ')</p>' +
    (p?.warning || p?.message ? '<p class="health-warning" role="alert">Warning: ' + escapeHtml(p.warning || p.message) + '</p>' : '') + '</section>';
}
function platformCards(overview) {
  return '<section class="platform-health-grid">' + state.platforms.map(p => '<article class="kpi-card"><h3>' + escapeHtml(p.name) + '</h3>' + healthHtml(p) +
    (p.id === 'talabat' ? '<p>Total stores: ' + (p.connected ? formatNumber(overview.totalStores) : 'Unavailable') + '</p><div class="health-counts">' + Object.entries(overview.counts).map(([k,v]) => '<span>' + escapeHtml(k) + ': ' + (p.connected ? formatNumber(v) : '—') + '</span>').join('') + '</div><p>Last Successful Sync<br>' + escapeHtml(formatTime(p.lastSuccessfulSync)) + '</p>' + (p.warning || p.message ? '<p class="health-warning">' + escapeHtml(p.warning || p.message) + '</p>' : '') : '<p>Not Connected</p>') + '</article>').join('') + '</section>';
}
let selectedStore = null;
let selectedRange = '24h';
let detailRequest = 0;
let chartData = [];
function redrawCharts() {
  drawChart(document.getElementById('ratingChart'), chartData, 'rating', '#56a5ff', { min: 1, max: 5, decimals: 1, label: 'Rating' });
}
new ResizeObserver(()=>{redrawCharts();globalThis.redrawPerformanceHistory?.();}).observe(detailContent);
const changeHtml = value => value === null ? '—' : `<span class="${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}">${value > 0 ? '+' : ''}${Number(value).toFixed(1)}</span>`;
const statusHtml = status => `<span class="status status-${String(status).toLowerCase()}">${escapeHtml(status)}</span>`;
const platformLogoHtml = platform => `<span class="platform-identity"><img src="/platforms/${escapeHtml(platform)}.svg" alt=""><span>${escapeHtml(platform)}</span></span>`;
const inlineStatusHtml = status => `<span class="inline-status inline-status-${String(status).toLowerCase()}"><i></i>${escapeHtml(status)}</span>`;
const ratingSortHeader=(label,key)=>{const active=state.sort.startsWith(key+'_'),direction=active&&state.sort.endsWith('_desc')?'desc':'asc',arrow=active?(direction==='asc'?'▲':'▼'):'↕';return `<button class="sort-button ${active?'active':''}" data-rating-sort="${key}" aria-label="Sort ${escapeHtml(label)} ${direction==='asc'?'descending':'ascending'}">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button>`;};
const actionNumber=value=>typeof value==='string'&&/^[-+]?\d+(?:\.\d+)?$/.test(value.trim())&&Number.isFinite(Number(value))?Number(value):null;
let currentActions=[];
let currentDataChecks=[];

const brandRules = [
  { brand: 'Taazaa Mumbai', patterns: [/^Taazaa\s+Mumbai\b/i] },
  { brand: 'FRB Shawarma', patterns: [/^FRB\s+Shawarma\b/i] },
  { brand: 'FRB Kabab', patterns: [/^FRB\s+Kabab\b/i] },
  { brand: 'Kabab Al Sham', patterns: [/^Kabab\s+Al\s+Sham\b/i] },
  { brand: 'Kabab Fareej', patterns: [/^Kabab\s+Fareej\b/i, /^KF\s*[-–—]/i] },
  { brand: 'Marwareed', patterns: [/^(?:Al\s+)?Morwarid\s+Restaurant\b/i, /^(?:Al\s+)?Marwareed\b/i] },
  { brand: 'Leekh', patterns: [/^Al\s+Leekh\s+Emirati\b/i, /^Leekh\b/i] },
  { brand: 'Tanoorna Ghyr', patterns: [/^TANOORNA\s+GHYR\b/i] }
];
const branchAliases = new Map([
  ['al warqa 1', 'Al Warqa'], ['al warqa', 'Al Warqa'],
  ['al twar 1', 'Al Twar'], ['twar', 'Al Twar'],
  ['al hamidiya', 'Ajman'], ['al hamidiya 2', 'Al Hamidiya 2'], ['ajman', 'Ajman'],
  ['international city', 'Dragon Mart'], ['dragon mart', 'Dragon Mart'],
  ['al qusais 2', 'Al Qusais'], ['qusais', 'Al Qusais'],
  ['al kharan', 'RAK'], ['rak', 'RAK'],
  ['mleha al bdai a suburb', 'Hay Hoshi'], ['al bdai a suburb', "Al Bdai'a Suburb"], ['hay hoshi', 'Hay Hoshi'],
  ['al barsha 2', 'Al Barsha'], ['al barsha', 'Al Barsha'],
  ['barsha al barsha 2', 'Al Barsha 2'],
  ['fujairah city center', 'Fujairah'], ['fujairah', 'Fujairah'],
  ['umm al daman', 'Umm Al Daman'], ['um aldaman', 'Umm Al Daman']
]);
const cleanWords = value => String(value || '').replace(/\(\s*DH\s+Kitchen\s*\)/ig, '').replace(/\bIndsutrial\b/ig, 'Industrial')
  .replace(/\bSubrub\b/ig, 'Suburb').replace(/\s*,\s*/g, ', ').replace(/\s+/g, ' ').replace(/^[-,\s]+|[-,\s]+$/g, '').trim();
const keyWords = value => cleanWords(value).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
function storeIdentity(row) {
  const raw = cleanWords(row.storeName || 'Unknown store');
  const rule = brandRules.find(item => item.patterns.some(pattern => pattern.test(raw)));
  const brand = rule?.brand || 'Other';
  let branch = raw;
  if (rule) for (const pattern of rule.patterns) branch = branch.replace(pattern, '');
  branch = cleanWords(branch.replace(/^\s*Al\s*,/i, '').replace(/^\s*[-–—,]+/, '')) || 'Unknown branch';
  const alias = branchAliases.get(keyWords(branch));
  branch = alias || branch.replace(/\bAl Dhait south\b/i, 'Al Dhait South');
  return { brand, branch, key: `${keyWords(brand)}|${keyWords(branch)}`, displayName: `${brand} — ${branch}` };
}
function groupCloudRows(rows) {
  const groups = new Map();
  for (const row of rows) {
    const identity = storeIdentity(row);
    const group = groups.get(identity.key) || { ...identity, rows: [] };
    group.rows.push({ ...row, displayName: identity.displayName, brand: identity.brand, branch: identity.branch });
    groups.set(identity.key, group);
  }
  return [...groups.values()].map(group => ({ ...group, rows: group.rows.sort((a,b) => a.platform.localeCompare(b.platform)) }));
}
const severity = {CRITICAL:0,WARNING:1,ACCEPTABLE:2,HEALTHY:3,UNKNOWN:4};
const groupStatus = group => group.rows.reduce((status,row) => severity[row.status] < severity[status] ? row.status : status, 'UNKNOWN');
const groupRating = group => { const values=group.rows.map(row=>row.rating).filter(value=>value!==null);return values.length?Math.min(...values):null; };

async function api(path) {
  const response = await fetch(path, { headers: { accept: 'application/json' }, cache: 'no-store' });
  const body = await response.json();
  if (response.status === 401) globalThis.dashboardAuth?.expired();
  if (!response.ok) throw new Error(body.error || `Request failed: ${response.status}`);
  return body;
}

async function initialize() {
  try {
    const config = await api('/api/config');
    state.cloudRatings = config.cloudRatings === true;
    state.platforms = state.cloudRatings ? ['talabat','keeta','noon','careem','deliveroo'].map(id => ({id, name: id[0].toUpperCase() + id.slice(1), health: ['talabat','keeta'].includes(id) ? 'UNKNOWN' : 'NOT CONNECTED'})) : (await api('/api/platforms')).platforms;
    state.refreshSeconds = config.autoRefreshSeconds;
    updatePlatformTabs();
    await renderCurrent();

  } catch (error) {
    renderError(error);
  } finally { state.timer = window.setInterval(renderCurrent, state.refreshSeconds * 1000); }
}

function updatePlatformTabs() {
  for (const button of tabs.querySelectorAll('[data-tab]')) {
    const platform = state.platforms.find(item => item.id === button.dataset.tab);
    if (platform) {
      const badge = button.querySelector('.tab-state');
      if (badge) badge.textContent = platform.health || 'NOT CONNECTED';
    }
  }
}

function updateTalabatViews() {
  const visible=state.tab==='talabat'||state.tab==='performance';
  talabatViewTabs.hidden=!visible;
  for(const button of talabatViewTabs.querySelectorAll('[data-talabat-view]'))button.classList.toggle('active',button.dataset.talabatView===state.tab);
}

async function renderCurrent() {
  updateTalabatViews();
  if(state.tab==='performance'){await renderPerformance();return;}
  if (state.busy) return;
  state.busy = true;
  refreshState.querySelector('span:last-child').textContent = 'Refreshing…';
  try {
    if (state.cloudRatings) {
      if (state.tab === 'overview' || state.tab === 'talabat' || state.tab === 'keeta') await renderCloudRatings();
      else renderDisconnected(state.tab);
      if(state.tab==='performance')return;
      refreshState.querySelector('span:last-child').textContent = `Auto-refresh ${state.refreshSeconds}s · checked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
      return;
    }
    state.platforms = (await api('/api/platforms')).platforms;
    updatePlatformTabs();
    refreshState.querySelector('.live-dot').dataset.health = state.platforms.find(p => p.id === 'talabat')?.health || 'ERROR';
    if (state.tab === 'overview') await renderOverview();
    else if (state.tab === 'talabat') await renderTalabat();
    else renderDisconnected(state.tab);
    if (selectedStore && detailPanel.classList.contains('open')) await openStore(selectedStore, selectedRange);
    refreshState.querySelector('span:last-child').textContent = `Auto-refresh ${state.refreshSeconds}s · checked ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (error) {
    if(state.tab==='performance')return;
    state.platforms = state.platforms.map(p => ['talabat','keeta'].includes(p.id) ? { ...p, health: 'ERROR' } : p);
    updatePlatformTabs();
    refreshState.querySelector('.live-dot').dataset.health = 'ERROR';
    renderError(error);
    if (detailPanel.classList.contains('open')) { ++detailRequest; detailContent.innerHTML = '<section class="error-card"><strong>ERROR — Freshness unavailable</strong><p>Dashboard refresh failed. Close and reopen this store to retry.</p></section>'; }
    refreshState.querySelector('span:last-child').textContent = 'Data unavailable';
  } finally {
    state.busy = false;
  }
}

async function renderOverview() {
  let overview;
  try { ({ overview } = await api('/api/overview')); }
  catch (error) {
    state.platforms = state.platforms.map(p => p.id === 'talabat' ? { ...p, connected: false, health: 'ERROR', message: error.message } : p);
    updatePlatformTabs();
    overview = { totalStores: 0, counts: {HEALTHY:0,ACCEPTABLE:0,WARNING:0,CRITICAL:0,UNKNOWN:0}, recentRapidDrops:0, lastUpdated:null, worstRatedStores:[], biggestRatingDrops:[] };
    main.innerHTML = healthBanner(state.platforms[0]) + platformCards(overview);
    return;
  }
  const cards = [
    ['Total stores', overview.totalStores, ''],
    ['Healthy', overview.counts.HEALTHY, 'healthy'],
    ['Acceptable', overview.counts.ACCEPTABLE, 'acceptable'],
    ['Warning', overview.counts.WARNING, 'warning'],
    ['Critical', overview.counts.CRITICAL, 'critical'],
    ['Unknown', overview.counts.UNKNOWN, 'unknown'],
    ['Rapid drops · 24h', overview.recentRapidDrops, 'critical']
  ];
  main.innerHTML = `
    <div class="page-heading">
      <div><h2>Portfolio overview</h2><p>Latest successful snapshots across connected platforms</p></div>
      <div class="updated">Last data update<br><strong>${escapeHtml(formatTime(overview.lastUpdated))}</strong></div>
    </div>
    ${healthBanner(state.platforms.find(p => p.id === 'talabat'))}
    ${platformCards(overview)}
    <section class="kpi-grid">${cards.map(([label, value, tone]) => `<article class="kpi-card ${tone ? `tone-${tone}` : ''}"><span class="kpi-label">${escapeHtml(label)}</span><strong class="kpi-value">${formatNumber(value)}</strong></article>`).join('')}</section>
    <section class="split-grid">
      ${rankPanel('Worst rated stores', 'Lowest current ratings', overview.worstRatedStores, store => `<span class="rating-number">${formatRating(store.currentRating)}</span>`)}
      ${rankPanel('Biggest rating drops', 'Latest change versus previous snapshot', overview.biggestRatingDrops, store => `<span class="rating-number negative">${formatRating(store.ratingChange)}</span>`)}
    </section>`;
  attachStoreClicks();
}

function rankPanel(title, subtitle, stores, valueRenderer) {
  return `<article class="panel"><header class="panel-header"><h3>${escapeHtml(title)}</h3><span>${escapeHtml(subtitle)}</span></header>
    ${stores.length ? `<ol class="rank-list">${stores.map(store => `<li class="rank-item" data-store-id="${escapeHtml(store.storeId)}"><div><div class="rank-name">${escapeHtml(store.storeName)}</div><div class="rank-meta">${escapeHtml(store.status)}</div></div>${valueRenderer(store)}</li>`).join('')}</ol>` : '<div class="empty">No matching data</div>'}
  </article>`;
}

async function renderTalabat() {
  const parameters = new URLSearchParams({ platform: 'talabat', sort: state.sort });
  if (state.search) parameters.set('search', state.search);
  if (state.status) parameters.set('status', state.status);
  const { stores, platform } = await api(`/api/stores?${parameters}`);
  main.innerHTML = `
    <div class="page-heading"><div><h2>Talabat stores</h2><p>${formatNumber(stores.length)} stores match the current view</p></div></div>
    ${healthBanner(platform)}
    <div class="toolbar">
      <input class="input" id="storeSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Search store name" autocomplete="off">
      <select class="select" id="storeSort" aria-label="Sort stores">
        ${[['name_asc','Name · A to Z'],['rating_asc','Rating · lowest first'],['rating_desc','Rating · highest first'],['change_asc','Change · biggest drop'],['change_desc','Change · biggest gain']].map(([value,label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <button class="filter-chip ${state.status === 'CRITICAL' ? 'active' : ''}" data-status="CRITICAL">Critical only</button>
    </div>
    <div class="status-filters">
      ${[['','All statuses'],['HEALTHY','Healthy'],['ACCEPTABLE','Acceptable'],['WARNING','Warning only'],['CRITICAL','Critical only'],['UNKNOWN','Unknown']].map(([value,label]) => `<button class="filter-chip ${state.status === value ? 'active' : ''}" data-status="${value}">${label}</button>`).join('')}
    </div>
    <div class="table-wrap"><table class="compact-table"><thead><tr><th>Store name</th><th>Current rating</th><th>Previous</th><th>Change</th><th>Status</th><th>Last updated</th></tr></thead>
      <tbody>${stores.length ? stores.map(store => `<tr data-store-id="${escapeHtml(store.storeId)}"><td class="store-name">${escapeHtml(store.storeName)}</td><td><strong>${formatRating(store.currentRating)}</strong></td><td>${formatRating(store.previousRating)}</td><td>${changeHtml(store.ratingChange)}</td><td>${statusHtml(store.status)}</td><td>${escapeHtml(formatTime(store.lastUpdated))}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No stores match these filters</td></tr>'}</tbody>
    </table></div>`;
  attachTalabatControls();
  attachStoreClicks();
}

function cloudHealth(result) {
  if (!result || result.state === 'ERROR') return 'ERROR';
  if (result.state === 'EMPTY') return 'EMPTY';
  const age = Date.now() - timestamp(result.syncTimestamp);
  const talabat=String(result.platform||'').toLowerCase()==='talabat';
  const delayedAfter=talabat?5*60*60*1000:90*60*1000;
  const staleAfter=talabat?8*60*60*1000:2*60*60*1000;
  return !Number.isFinite(age) || age < 0 ? 'UNKNOWN' : age > staleAfter ? 'STALE' : age >= delayedAfter ? 'DELAYED' : 'LIVE';
}
function cloudPlatformCards(platforms) {
  return '<section class="platform-health-grid">' + state.platforms.map(platform => {
    const result = platforms.find(item => item.platform === platform.id);
    if (!result) return '<article class="kpi-card platform-health-card is-disconnected"><h3>' + escapeHtml(platform.name) + '</h3>' + statusHtml('NOT CONNECTED') + '<p>Not Connected</p></article>';
    const health = cloudHealth(result);
    return '<article class="kpi-card platform-health-card is-connected"><h3>' + escapeHtml(platform.name) + '</h3>' + statusHtml(result.state) +
      '<p>Freshness: ' + statusHtml(health) + '</p><p>Total stores: ' + formatNumber(result.storeCount) + '</p>' +
      '<p>Last sync<br>' + escapeHtml(formatTime(result.syncTimestamp)) + '</p>' +
      (result.state === 'ERROR' ? '<p class="health-warning">Ratings source is unavailable.</p>' :
       result.state === 'EMPTY' ? '<p>No ratings in the selected latest run.</p>' : '') + '</article>';
  }).join('') + '</section>';
}
async function renderCloudRatings() {
  const requestedTab=state.tab;
  const [response,performance,actionHistory]=await Promise.all([api('/api/dashboard/ratings/latest'),state.tab==='overview'?api('/api/dashboard/performance/latest').catch(()=>null):Promise.resolve(null),state.tab==='overview'?api('/api/dashboard/performance/action-history?days=7').catch(()=>null):Promise.resolve(null)]);
  if(state.tab!==requestedTab)return;
  state.cloudResponse = response;
  const platformResults = response.platforms;
  state.platforms = state.platforms.map(platform => {
    const result = platformResults.find(item => item.platform === platform.id);
    return result ? {...platform, connected:result.state !== 'ERROR', state:result.state, health:cloudHealth(result),
      lastSuccessfulSync:result.syncTimestamp, message:result.state === 'ERROR' ? 'Ratings source unavailable' : null} : platform;
  });
  updatePlatformTabs();
  const selectedPlatform = state.tab === 'talabat' || state.tab === 'keeta' ? state.tab : null;
  const sourceRows = selectedPlatform ? response.ratings.filter(row => row.platform === selectedPlatform) : response.ratings;
  const allGroups = groupCloudRows(response.ratings);
  globalThis.ratingAccessOptions={
    brands:[...new Set(allGroups.map(group=>group.brand))].sort((a,b)=>a.localeCompare(b)),
    branches:allGroups.map(group=>({key:group.key,label:group.displayName})).sort((a,b)=>a.label.localeCompare(b.label))
  };
  const viewGroups = selectedPlatform ? groupCloudRows(sourceRows) : allGroups;
  const brands = [...new Set(allGroups.map(group => group.brand))].sort((a,b)=>a.localeCompare(b));
  const search = state.search.toLowerCase();
  const filteredGroups = viewGroups.filter(group => (!state.brand || group.brand === state.brand) &&
    (!state.status || (selectedPlatform ? group.rows.some(row=>row.status===state.status) : groupStatus(group)===state.status)) &&
    [group.displayName,group.brand,group.branch,...group.rows.map(row=>row.storeName||'')].some(value=>value.toLowerCase().includes(search)));
  filteredGroups.sort((a,b) => {
    const direction=state.sort.endsWith('_desc')?-1:1,key=state.sort.replace(/_(?:asc|desc)$/,'');
    if(key==='rating'){const av=groupRating(a),bv=groupRating(b);if(av===null&&bv!==null)return 1;if(av!==null&&bv===null)return -1;if(av!==bv)return direction*((av??0)-(bv??0));}
    if(key==='severity'){const difference=severity[groupStatus(a)]-severity[groupStatus(b)];if(difference)return direction*difference;}
    if(key==='observed'){const av=Math.max(...a.rows.map(row=>timestamp(row.timestamp)).filter(Number.isFinite)),bv=Math.max(...b.rows.map(row=>timestamp(row.timestamp)).filter(Number.isFinite));if(av!==bv)return direction*(av-bv);}
    return direction*a.displayName.localeCompare(b.displayName);
  });
  const counted = selectedPlatform ? sourceRows.map(row=>row.status) : viewGroups.map(group=>groupStatus(group));
  const counts = Object.fromEntries(['HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNKNOWN'].map(status => [status, counted.filter(value=>value===status).length]));
  const title=selectedPlatform ? selectedPlatform[0].toUpperCase()+selectedPlatform.slice(1)+' latest ratings' : 'Portfolio overview';
  const active=selectedPlatform ? platformResults.filter(item=>item.platform===selectedPlatform) : platformResults;
  const overallHealth=active.some(item=>item.state==='ERROR')?'ERROR':active.some(item=>cloudHealth(item)==='STALE')?'STALE':active.some(item=>cloudHealth(item)==='DELAYED')?'DELAYED':'LIVE';
  refreshState.querySelector('.live-dot').dataset.health=overallHealth;
  if(performance?.rows&&typeof performanceState!=='undefined'){performanceState.cache=performance;performanceState.cacheKey='';performanceState.checkedAt=Date.now();}
  const actionCenter=!selectedPlatform?renderActionCenter(allGroups,performance,actionHistory):'';
  const dataChecks=!selectedPlatform?renderDataChecks(performance,actionHistory):'';
  main.innerHTML = `<div class="page-heading"><div><h2>${escapeHtml(title)}</h2><p>Live latest data · ${formatNumber(viewGroups.length)} branches${selectedPlatform ? '' : ' across connected platforms'}</p></div></div>
    ${actionCenter}
    ${dataChecks}
    ${cloudPlatformCards(platformResults)}
    <section class="kpi-grid">${Object.entries(counts).map(([status,count]) => `<article class="kpi-card tone-${status.toLowerCase()}"><span class="kpi-label">${escapeHtml(status)}</span><strong class="kpi-value">${formatNumber(count)}</strong></article>`).join('')}</section>
    <div class="toolbar"><input class="input" id="storeSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Search brand or branch" autocomplete="off">
    <select class="select" id="brandFilter" aria-label="Filter by brand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.brand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select>
    <select class="select" id="storeSort" aria-label="Sort stores">${[['name_asc','Branch name · A to Z'],['name_desc','Branch name · Z to A'],['rating_asc','Rating · lowest first'],['rating_desc','Rating · highest first'],['severity_asc','Status · best first'],['severity_desc','Status · most severe first'],['observed_desc','Observed · newest first'],['observed_asc','Observed · oldest first']].map(([value,label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="status-filters">${['','HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNKNOWN'].map(status => `<button class="filter-chip ${state.status === status ? 'active' : ''}" data-status="${status}">${status || 'All statuses'}</button>`).join('')}</div>
    ${selectedPlatform ? renderPlatformTable(filteredGroups) : renderOverviewTable(filteredGroups)}`;
  attachTalabatControls();
  attachCloudStoreClicks(filteredGroups);
  attachActionCenter(allGroups);
  attachDataChecks();
}

function buildActionCenter(groups,performance,actionHistory){
 const actions=new Map(),levels={check:1,attention:2,critical:3};
 const add=(key,name,level,issue,target={})=>{const existing=actions.get(key)||{key,name,level:'check',issues:[],ratingKey:null,performanceId:null,openKind:null,recurrence:0};if(levels[level]>levels[existing.level]||!existing.openKind){existing.level=level;existing.openKind=target.performanceId?'performance':'rating';}existing.issues.push(issue);existing.recurrence=Math.max(existing.recurrence,target.recurrence||0);if(target.ratingKey)existing.ratingKey=target.ratingKey;if(target.performanceId)existing.performanceId=target.performanceId;actions.set(key,existing);};
 const historyFor=(storeId,field,threshold)=>{const points=(actionHistory?.points||[]).filter(point=>String(point.storeId)===String(storeId)).sort((a,b)=>b.reportDate.localeCompare(a.reportDate)),breaches=points.map(point=>point.orders>0&&point[field]!==null&&point[field]>threshold),count3=breaches.slice(0,3).filter(Boolean).length,count7=breaches.slice(0,7).filter(Boolean).length;return {score:count7,label:count3>=2?`Recurring ${count3}/3 days`:count7>=2?`Repeated ${count7}/7 days`:'Today only'};};
 for(const group of groups)for(const row of group.rows)if(row.rating!==null&&row.rating<4.1)add(group.key,group.displayName,'critical',`${row.platform} rating ${formatRating(row.rating)}`,{ratingKey:group.key});
 if(Array.isArray(performance?.rows))for(const raw of performance.rows){const identity=storeIdentity({storeName:raw.storeName||'Unnamed branch'}),target={performanceId:raw.storeId};if(!raw.present)continue;const values=raw.values||{},orders=actionNumber(values['Successful Orders']);if(orders===null||orders<=0)continue;const level=orders<10?'attention':'critical',metric=(key,field,label,threshold)=>{const value=actionNumber(values[key]);if(value!==null&&value>threshold){const recurrence=historyFor(raw.storeId,field,threshold);add(identity.key,identity.displayName,level,`${label} ${performanceFormat(values[key])} · ${recurrence.label}`,{...target,recurrence:recurrence.score});}};metric('Customer Complaint rate','complaints','Complaints',1);metric('Avoidable cancellation rate','cancellation','Avoidable cancellation',1.5);metric('Unavailable Time Duration Rate','offline','Offline',2);metric('Average preparation time (minutes)','prep','Prep time',16);const action=actions.get(identity.key);if(action&&action.performanceId&&!action.issues.some(issue=>issue.startsWith('Orders '))){action.issues.push(`Orders ${performanceFormat(values['Successful Orders'])}`);if(orders<10)action.issues.push('Low volume · monitor only');}}
 return [...actions.values()].sort((a,b)=>levels[b.level]-levels[a.level]||b.recurrence-a.recurrence||b.issues.length-a.issues.length||a.name.localeCompare(b.name));
}
function renderActionCenter(groups,performance,actionHistory){
 const allActions=buildActionCenter(groups,performance,actionHistory),brands=[...new Set(allActions.map(action=>storeIdentity({storeName:action.name}).brand))].sort(),filtered=state.actionBrand?allActions.filter(action=>storeIdentity({storeName:action.name}).brand===state.actionBrand):allActions;currentActions=filtered;const critical=filtered.filter(a=>a.level==='critical').length,attention=filtered.filter(a=>a.level==='attention').length,shown=filtered.slice(0,12),reportDate=performance?.reportDate||null;
 return `<section class="action-center"><header class="action-header"><div><span class="action-eyebrow">LATEST RATINGS · DAILY PERFORMANCE</span><h3>Action Center</h3><p>${filtered.length?`${filtered.length} branches need review`:'No current exceptions detected'}${reportDate?` · Performance ${escapeHtml(reportDate)}`:' · Performance unavailable'}</p></div><div class="action-summary"><label>Brand <select class="select" id="actionBrand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.actionBrand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select></label><span class="action-count critical">${critical} action</span><span class="action-count attention">${attention} monitor</span></div></header>${shown.length?`<ol class="action-list">${shown.map((action,index)=>`<li class="action-row"><span class="action-priority ${action.level}">${action.level==='attention'?'Monitor':'Action'}</span><div class="action-copy"><strong>${escapeHtml(action.name)}</strong><p>${action.issues.map(escapeHtml).join(' · ')}</p></div><button class="action-open" data-action-index="${index}">View</button></li>`).join('')}</ol>${filtered.length>shown.length?`<p class="action-more">Showing the 12 highest-priority branches · ${filtered.length-shown.length} more</p>`:''}`:'<div class="action-clear">No rating or operational threshold is currently breached.</div>'}<p class="action-rules">Action: rating below 4.1; complaints above 1%; avoidable cancellation above 1.5%; offline above 2%; prep time above 16 min. Operational breaches require at least 10 successful orders; 1–9 orders are marked Monitor, and zero orders create no operational action. Ratings use the latest platform snapshot.</p></section>`;
}
function attachActionCenter(groups){const lookup=new Map(groups.map(group=>[group.key,group])),brand=document.getElementById('actionBrand');if(brand)brand.onchange=()=>{state.actionBrand=brand.value;renderCurrent();};for(const button of main.querySelectorAll('[data-action-index]'))button.onclick=()=>{const action=currentActions[Number(button.dataset.actionIndex)];if(!action)return;if(action.openKind==='performance'&&action.performanceId&&typeof performanceDetail==='function')performanceDetail(action.performanceId);else if(action.ratingKey&&lookup.has(action.ratingKey))openCloudStore(lookup.get(action.ratingKey));else if(action.performanceId&&typeof performanceDetail==='function')performanceDetail(action.performanceId);};}

function buildDataChecks(performance,actionHistory){if(!Array.isArray(performance?.rows))return [];return performance.rows.flatMap(raw=>{const identity=storeIdentity({storeName:raw.storeName||'Unnamed branch'}),values=raw.values||{},orders=actionNumber(values['Successful Orders']);let issue=null;if(!raw.present)issue='Missing from Performance report';else if(orders===null)issue='Successful orders unavailable';else if(orders===0){const previous=(actionHistory?.points||[]).filter(point=>String(point.storeId)===String(raw.storeId)&&point.orders>0).sort((a,b)=>b.reportDate.localeCompare(a.reportDate))[0];issue=previous?`Zero orders today · last active ${previous.reportDate}`:'Zero orders today · no active day in 7-day history';}return issue?[{name:identity.displayName,performanceId:raw.storeId,issue,kind:!raw.present?'missing':orders===null?'unavailable':'zero'}]:[];}).sort((a,b)=>({missing:0,unavailable:1,zero:2}[a.kind]-{missing:0,unavailable:1,zero:2}[b.kind])||a.name.localeCompare(b.name));}
function renderDataChecks(performance,actionHistory){currentDataChecks=buildDataChecks(performance,actionHistory);if(!performance)return '<section class="data-checks"><header><div><span class="action-eyebrow">ACTIVITY & DATA</span><h3>Activity checks</h3></div><span class="action-count check">Unavailable</span></header></section>';const shown=currentDataChecks.slice(0,10),zero=currentDataChecks.filter(item=>item.kind==='zero').length,other=currentDataChecks.length-zero;return `<section class="data-checks"><header><div><span class="action-eyebrow">ACTIVITY & DATA</span><h3>Activity checks</h3><p>Separate from performance actions · ${escapeHtml(performance.reportDate||'latest report')}</p></div><div class="action-summary"><span class="action-count attention">${zero} zero orders</span><span class="action-count check">${other} data issues</span></div></header>${shown.length?`<ol class="action-list">${shown.map((item,index)=>`<li class="action-row"><span class="action-priority ${item.kind==='zero'?'attention':'check'}">${item.kind==='zero'?'No orders':'Check'}</span><div class="action-copy"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml(item.issue)}</p></div><button class="action-open" data-check-index="${index}">View</button></li>`).join('')}</ol>${currentDataChecks.length>shown.length?`<p class="action-more">Showing 10 · ${currentDataChecks.length-shown.length} more</p>`:''}`:'<div class="action-clear">All branches reported an order count and activity.</div>'}</section>`;}
function attachDataChecks(){for(const button of main.querySelectorAll('[data-check-index]'))button.onclick=()=>{const item=currentDataChecks[Number(button.dataset.checkIndex)];if(item?.performanceId&&typeof performanceDetail==='function')performanceDetail(item.performanceId);};}

function renderPlatformTable(groups) {
  const rows=groups.flatMap(group=>group.rows.map(row=>({group,row})));
  return `<div class="table-wrap"><table class="compact-table"><thead><tr><th>${ratingSortHeader('Brand / branch','name')}</th><th>${ratingSortHeader('Rating','rating')}</th><th>${ratingSortHeader('Status','severity')}</th><th>${ratingSortHeader('Observed','observed')}</th></tr></thead>
    <tbody>${rows.length?rows.map(({group,row})=>`<tr data-branch-key="${escapeHtml(group.key)}"><td data-label="Branch"><div class="store-name">${escapeHtml(group.displayName)}</div></td><td data-label="Rating"><strong>${formatRating(row.rating)}</strong></td><td data-label="Status">${statusHtml(row.status)}</td><td data-label="Observed"><time datetime="${escapeHtml(row.timestamp)}">${escapeHtml(formatTime(row.timestamp))}</time>${row.carriedForward?'<span class="carried-forward">Carried forward</span>':''}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">No branches match this view</td></tr>'}</tbody></table></div>`;
}
function renderOverviewTable(groups) {
  return `<div class="table-wrap"><table class="overview-table"><thead><tr><th>${ratingSortHeader('Brand / branch','name')}</th><th>${ratingSortHeader('Platform ratings','rating')}</th><th>${ratingSortHeader('Overall status','severity')}</th><th>${ratingSortHeader('Latest observation','observed')}</th></tr></thead>
    <tbody>${groups.length?groups.map(group=>{const latest=group.rows.map(row=>row.timestamp).sort().at(-1);return `<tr data-branch-key="${escapeHtml(group.key)}"><td data-label="Branch"><div class="store-name">${escapeHtml(group.displayName)}</div></td><td data-label="Ratings"><div class="platform-rating-list">${group.rows.map(row=>`<span class="platform-rating">${platformLogoHtml(row.platform)}<strong>${formatRating(row.rating)}</strong>${inlineStatusHtml(row.status)}</span>`).join('')}</div></td><td data-label="Overall">${statusHtml(groupStatus(group))}</td><td data-label="Observed">${escapeHtml(formatTime(latest))}</td></tr>`;}).join(''):'<tr><td colspan="4" class="empty">No branches match this view</td></tr>'}</tbody></table></div>`;
}

function attachTalabatControls() {
  const search = document.getElementById('storeSearch');
  let debounce;
  search?.addEventListener('input', event => {
    window.clearTimeout(debounce);
    debounce = window.setTimeout(() => { state.search = event.target.value.trim(); renderCurrent(); }, 280);
  });
  document.getElementById('brandFilter')?.addEventListener('change', event => { state.brand = event.target.value; renderCurrent(); });
  document.getElementById('storeSort')?.addEventListener('change', event => { state.sort = event.target.value; renderCurrent(); });
  for(const button of main.querySelectorAll('[data-rating-sort]'))button.addEventListener('click',()=>{const key=button.dataset.ratingSort,current=state.sort.startsWith(key+'_');state.sort=key+'_'+(current&&!state.sort.endsWith('_desc')?'desc':'asc');renderCurrent();});
  for (const button of main.querySelectorAll('[data-status]')) button.addEventListener('click', () => { state.status = button.dataset.status || ''; renderCurrent(); });
}

function attachCloudStoreClicks(groups) {
  const lookup=new Map(groups.map(group=>[group.key,group]));
  for(const row of main.querySelectorAll('[data-branch-key]')) {
    row.tabIndex=0;
    row.setAttribute('role','button');
    const open=()=>{const group=lookup.get(row.dataset.branchKey);if(group)openCloudStore(group);};
    row.addEventListener('click',open);
    row.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}});
  }
}

async function openCloudStore(group,range='30d') {
  const request=++detailRequest;
  selectedStore=group.key;
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden','false');
  detailContent.innerHTML=`<h2 class="detail-title" id="detailTitle">${escapeHtml(group.displayName)}</h2>
    <p class="detail-subtitle">Latest ratings by platform</p>
    <section class="cloud-detail-platforms">${group.rows.map(row=>`<article class="cloud-detail-card">
      <header>${platformLogoHtml(row.platform)}${statusHtml(row.status)}</header>
      <div class="cloud-detail-rating">${formatRating(row.rating)}</div>
      <dl><div><dt>Reviews</dt><dd>${formatNumber(row.reviewCount)}</dd></div><div><dt>One-star</dt><dd>${formatNumber(row.oneStarCount)}</dd></div>
      <div><dt>Observed</dt><dd>${escapeHtml(formatTime(row.timestamp))}</dd></div><div><dt>Freshness</dt><dd>${row.carriedForward?'Carried forward':'Latest observation'}</dd></div></dl>
    </article>`).join('')}</section>
    <section class="history-placeholder"><strong>Rating history</strong><p>Loading saved snapshots…</p></section>`;
  const talabat=group.rows.find(row=>row.platform==='talabat');
  const replaceHistory=html=>{detailContent.innerHTML=detailContent.innerHTML.replace(/<section class="history-placeholder">[\s\S]*?<\/section>/,html);};
  if(!talabat){replaceHistory('<section class="history-placeholder"><strong>Rating history</strong><p>Talabat history is not available for this branch.</p></section>');return;}
  try{const result=await api(`/api/dashboard/ratings/history?storeIdentityKey=${encodeURIComponent(talabat.storeIdentityKey)}&range=${encodeURIComponent(range)}`);if(request!==detailRequest)return;chartData=result.points;
    replaceHistory(`<div class="status-filters" aria-label="History range">${[['24h','24h'],['7d','7 days'],['30d','30 days'],['all','All']].map(([value,label])=>`<button class="filter-chip ${range===value?'active':''}" data-cloud-range="${value}">${label}</button>`).join('')}</div><div class="chart-card"><h4>Rating history</h4><p class="chart-hint">Hover or tap a point for its exact date and value.</p><canvas class="chart" id="ratingChart" aria-label="Rating history chart"></canvas></div><p class="updated">${formatNumber(chartData.length)} saved snapshots</p>`);
    for(const button of detailContent.querySelectorAll('[data-cloud-range]'))button.addEventListener('click',()=>openCloudStore(group,button.dataset.cloudRange));
    requestAnimationFrame(redrawCharts);
  }catch{if(request!==detailRequest)return;replaceHistory('<section class="history-placeholder"><strong>Rating history unavailable</strong><p>Cloud History is not available. Saved snapshots could not be loaded.</p></section>');}
}

function renderDisconnected(platformId) {
  const platform = state.platforms.find(item => item.id === platformId);
  main.innerHTML = `<div class="page-heading"><div><h2>${escapeHtml(platform?.name || platformId)}</h2><p>Platform adapter</p></div></div><section class="not-connected"><strong>Not Connected</strong><p>The adapter boundary is ready. No database has been configured for this platform.</p></section>`;
}

function renderError(error) {
  main.innerHTML = `<section class="error-card"><strong>Dashboard data is unavailable</strong><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p><p>${state.cloudRatings ? 'Check the dashboard server connection configuration.' : 'Check the Talabat database path in the local .env file.'}</p></section>`;
}

function attachStoreClicks() {
  for (const row of main.querySelectorAll('[data-store-id]')) {
    row.tabIndex = 0;
    row.setAttribute('aria-label', 'Open store ' + row.textContent.trim());
    row.addEventListener('click', () => openStore(row.dataset.storeId));
    row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openStore(row.dataset.storeId); } });
  }
}

async function openStore(storeId, range = '24h') {
  const request = ++detailRequest;
  selectedStore = storeId;
  selectedRange = range;
  detailPanel.classList.add('open');
  detailPanel.setAttribute('aria-hidden', 'false');
  detailContent.innerHTML = '<div class="loading-card">Loading store history…</div>';
  try {
    const { store, history, platform } = await api(`/api/stores/${encodeURIComponent(storeId)}?platform=talabat&range=${encodeURIComponent(range)}`);
    if (request !== detailRequest) return;
    chartData = history.filter(p => Number.isFinite(timestamp(p.recordedAt)));
    detailContent.innerHTML = `
      <h2 class="detail-title" id="detailTitle">${escapeHtml(store.storeName)}</h2>
      ${healthBanner(platform)}
      <section class="detail-kpis">
        <div class="mini-kpi"><span>Previous rating</span><strong>${formatRating(store.previousRating)}</strong></div>
        <div class="mini-kpi"><span>Current status</span><strong>${statusHtml(store.status)}</strong></div>
        <div class="mini-kpi"><span>Current rating</span><strong>${formatRating(store.currentRating)}</strong></div>
        <div class="mini-kpi"><span>Change</span><strong>${changeHtml(store.ratingChange)}</strong></div>
        <div class="mini-kpi"><span>Reviews</span><strong>${formatNumber(store.reviewCount)}</strong></div>
        <div class="mini-kpi"><span>One-star</span><strong>${formatNumber(store.oneStarCount)}</strong></div>
      </section>
      <div class="status-filters" aria-label="History range">        ${[['24h','Last 24 Hours'],['7d','Last 7 Days'],['30d','Last 30 Days'],['all','All History']].map(([value,label]) => `<button class="filter-chip ${range === value ? 'active' : ''}" data-range="${value}" aria-pressed="${range === value}">${label}</button>`).join('')}
      </div>
      <div class="chart-card"><h4>Rating history</h4><p class="chart-hint">Hover or tap a point for its exact date and value.</p><canvas class="chart" id="ratingChart" aria-label="Rating history chart"></canvas></div>
      <p class="updated">${formatNumber(history.length)} successful snapshots · Last updated ${escapeHtml(formatTime(store.lastUpdated))}</p>`;
    for (const button of detailContent.querySelectorAll('[data-range]')) button.addEventListener('click', () => openStore(storeId, button.dataset.range));
    requestAnimationFrame(redrawCharts);
  } catch (error) {
    if (request !== detailRequest) return;
    detailContent.innerHTML = `<section class="error-card"><strong>History unavailable</strong><p>${escapeHtml(error instanceof Error ? error.message : String(error))}</p></section>`;
  }
}

function drawChart(canvas, history, key, color, options) {
  if (!canvas) return;
  const values = history.map(point => point[key]).filter(value => value !== null && Number.isFinite(value));
  const rect = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.floor(rect.width * ratio));
  canvas.height = Math.max(1, Math.floor(rect.height * ratio));
  const context = canvas.getContext('2d');
  context.scale(ratio, ratio);
  const width = rect.width;
  const height = rect.height;
  const pad = { left: 42, right: 12, top: 12, bottom: 25 };
  context.font = '10px Segoe UI';
  context.fillStyle = '#93a3ba';
  if (!values.length) { context.fillText('No data', pad.left, height / 2); return; }
  let min = options.min ?? values.reduce((a,b) => Math.min(a,b), Infinity);
  let max = options.max ?? values.reduce((a,b) => Math.max(a,b), -Infinity);
  if (max === min) max = min + 1;
  for (let index = 0; index <= 4; index += 1) {
    const y = pad.top + ((height - pad.top - pad.bottom) * index / 4);
    context.strokeStyle = '#263247'; context.lineWidth = 1;
    context.beginPath(); context.moveTo(pad.left, y); context.lineTo(width - pad.right, y); context.stroke();
    const label = (max - ((max - min) * index / 4)).toFixed(options.decimals);
    context.fillText(label, 4, y + 3);
  }
  const firstTime = timestamp(history[0].recordedAt), lastTime = timestamp(history.at(-1).recordedAt);
  const x = index => pad.left + (width - pad.left - pad.right) * (lastTime === firstTime ? .5 : (timestamp(history[index].recordedAt) - firstTime) / (lastTime - firstTime));
  const y = value => pad.top + ((max - value) / (max - min)) * (height - pad.top - pad.bottom);
  context.strokeStyle = color; context.lineWidth = 2.4; context.lineJoin = 'round'; context.lineCap = 'round';
  context.beginPath();
  let active = false;
  history.forEach((point, index) => {
    const value = point[key];
    if (value === null || !Number.isFinite(value)) { active = false; return; }
    if (!active) context.moveTo(x(index), y(value)); else context.lineTo(x(index), y(value));
    active = true;
  });
  context.stroke();
  context.fillStyle = color;
  history.forEach((point,index) => { if (point[key] !== null && Number.isFinite(point[key])) { context.beginPath(); context.arc(x(index), y(point[key]), 2.5, 0, Math.PI * 2); context.fill(); } });
  const first = history[0]?.recordedAt;
  const last = history.at(-1)?.recordedAt;
  context.fillStyle = '#93a3ba';
  if (first) context.fillText(new Date(timestamp(first)).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}), pad.left, height - 5);
  if (last && last !== first) {
    const label = new Date(timestamp(last)).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
    const measure = context.measureText(label).width;
    context.fillText(label, width - pad.right - measure, height - 5);
  }
  const valid=history.map((point,index)=>({point,index,value:point[key],px:x(index)})).filter(item=>item.value!==null&&Number.isFinite(item.value));
  const redraw=()=>drawChart(canvas,history,key,color,options);
  canvas.onpointermove=event=>{const bounds=canvas.getBoundingClientRect(),pointerX=event.clientX-bounds.left;let nearest=null;for(const item of valid)if(!nearest||Math.abs(item.px-pointerX)<Math.abs(nearest.px-pointerX))nearest=item;if(nearest&&canvas._hoverIndex!==nearest.index){canvas._hoverIndex=nearest.index;redraw();}};
  canvas.onpointerleave=()=>{if(canvas._hoverIndex!==undefined){delete canvas._hoverIndex;redraw();}};
  const hovered=valid.find(item=>item.index===canvas._hoverIndex);
  if(hovered){const px=hovered.px,py=y(hovered.value),date=new Date(timestamp(hovered.point.recordedAt));const dateLabel=options.dateOnly?date.toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'}):date.toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});const valueLabel=`${options.label||key}: ${Number(hovered.value).toLocaleString('en-US',{minimumFractionDigits:options.decimals,maximumFractionDigits:options.decimals})}`;context.save();context.strokeStyle='#d9e8ff';context.lineWidth=1;context.setLineDash([4,4]);context.beginPath();context.moveTo(px,pad.top);context.lineTo(px,height-pad.bottom);context.stroke();context.setLineDash([]);context.fillStyle=color;context.beginPath();context.arc(px,py,5,0,Math.PI*2);context.fill();context.font='11px Segoe UI';const boxWidth=Math.max(context.measureText(dateLabel).width,context.measureText(valueLabel).width)+20,boxHeight=46,boxX=Math.min(Math.max(4,px-boxWidth/2),width-boxWidth-4),boxY=Math.max(4,py-boxHeight-12);context.fillStyle='#07111f';context.strokeStyle='#40516a';context.lineWidth=1;context.beginPath();context.roundRect(boxX,boxY,boxWidth,boxHeight,8);context.fill();context.stroke();context.fillStyle='#dce8f7';context.fillText(dateLabel,boxX+10,boxY+17);context.fillStyle=color;context.fillText(valueLabel,boxX+10,boxY+35);context.restore();}
}

tabs.addEventListener('click', event => {
  const button = event.target.closest('[data-tab]');
  if (!button) return;
  state.tab = button.dataset.tab;
  ++performanceState.generation;selectedStore=null;++detailRequest;detailPanel.classList.remove('open');detailPanel.setAttribute('aria-hidden','true');
  for (const tab of tabs.querySelectorAll('.tab')) tab.classList.toggle('active', tab === button);
  history.replaceState(null, '', `#${state.tab}`);
  renderCurrent();
});

talabatViewTabs.addEventListener('click',event=>{
  const button=event.target.closest('[data-talabat-view]');if(!button)return;
  state.tab=button.dataset.talabatView;updateTalabatViews();history.replaceState(null,'','#'+state.tab);renderCurrent();
});

for (const closer of document.querySelectorAll('[data-close-detail]')) closer.addEventListener('click', () => {
  selectedStore = null; ++detailRequest;
  detailPanel.classList.remove('open');
  detailPanel.setAttribute('aria-hidden', 'true');
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { selectedStore = null; ++detailRequest; detailPanel.classList.remove('open'); detailPanel.setAttribute('aria-hidden', 'true'); } });

const initialTab = location.hash.slice(1);
if (['overview', 'talabat', 'keeta', 'noon', 'careem', 'deliveroo', 'performance'].includes(initialTab)) {
  state.tab = initialTab;
  for (const button of tabs.querySelectorAll('.tab')) button.classList.toggle('active', button.dataset.tab === (state.tab === 'performance' ? 'talabat' : state.tab));
}
function bootDashboard(){if(globalThis.dashboardAuth)globalThis.dashboardAuth.boot(initialize);else initialize();}
bootDashboard();
