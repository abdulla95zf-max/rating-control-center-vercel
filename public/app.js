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
  cloudResponse: null
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
  drawChart(document.getElementById('ratingChart'), chartData, 'rating', '#56a5ff', { min: 1, max: 5, decimals: 1 });
  drawChart(document.getElementById('reviewChart'), chartData, 'reviewCount', '#36d399', { min: 0, decimals: 0 });
  drawChart(document.getElementById('oneStarChart'), chartData, 'oneStarCount', '#ffad42', { min: 0, decimals: 0 });
}
new ResizeObserver(redrawCharts).observe(detailContent);
const changeHtml = value => value === null ? '—' : `<span class="${value < 0 ? 'negative' : value > 0 ? 'positive' : ''}">${value > 0 ? '+' : ''}${Number(value).toFixed(1)}</span>`;
const statusHtml = status => `<span class="status status-${String(status).toLowerCase()}">${escapeHtml(status)}</span>`;
const platformLogoHtml = platform => `<span class="platform-identity"><img src="/platforms/${escapeHtml(platform)}.svg" alt=""><span>${escapeHtml(platform)}</span></span>`;
const inlineStatusHtml = status => `<span class="inline-status inline-status-${String(status).toLowerCase()}"><i></i>${escapeHtml(status)}</span>`;

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
  return !Number.isFinite(age) || age < 0 ? 'UNKNOWN' : age > 7200000 ? 'STALE' : age >= 5400000 ? 'DELAYED' : 'LIVE';
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
  const response = await api('/api/dashboard/ratings/latest');
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
  const viewGroups = selectedPlatform ? groupCloudRows(sourceRows) : allGroups;
  const brands = [...new Set(allGroups.map(group => group.brand))].sort((a,b)=>a.localeCompare(b));
  const search = state.search.toLowerCase();
  const filteredGroups = viewGroups.filter(group => (!state.brand || group.brand === state.brand) &&
    (!state.status || (selectedPlatform ? group.rows.some(row=>row.status===state.status) : groupStatus(group)===state.status)) &&
    [group.displayName,group.brand,group.branch,...group.rows.map(row=>row.storeName||'')].some(value=>value.toLowerCase().includes(search)));
  filteredGroups.sort((a,b) => state.sort === 'rating_asc' ? (groupRating(a) ?? 6)-(groupRating(b) ?? 6)||a.displayName.localeCompare(b.displayName) :
    state.sort === 'rating_desc' ? (groupRating(b) ?? 0)-(groupRating(a) ?? 0)||a.displayName.localeCompare(b.displayName) :
    state.sort === 'severity_asc' ? severity[groupStatus(a)]-severity[groupStatus(b)]||a.displayName.localeCompare(b.displayName) :
    a.displayName.localeCompare(b.displayName));
  const counted = selectedPlatform ? sourceRows.map(row=>row.status) : viewGroups.map(group=>groupStatus(group));
  const counts = Object.fromEntries(['HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNKNOWN'].map(status => [status, counted.filter(value=>value===status).length]));
  const title=selectedPlatform ? selectedPlatform[0].toUpperCase()+selectedPlatform.slice(1)+' latest ratings' : 'Portfolio overview';
  const active=selectedPlatform ? platformResults.filter(item=>item.platform===selectedPlatform) : platformResults;
  const overallHealth=active.some(item=>item.state==='ERROR')?'ERROR':active.some(item=>cloudHealth(item)==='STALE')?'STALE':active.some(item=>cloudHealth(item)==='DELAYED')?'DELAYED':'LIVE';
  refreshState.querySelector('.live-dot').dataset.health=overallHealth;
  main.innerHTML = `<div class="page-heading"><div><h2>${escapeHtml(title)}</h2><p>Live latest data · ${formatNumber(viewGroups.length)} branches${selectedPlatform ? '' : ' across connected platforms'}</p></div></div>
    ${cloudPlatformCards(platformResults)}
    <section class="kpi-grid">${Object.entries(counts).map(([status,count]) => `<article class="kpi-card tone-${status.toLowerCase()}"><span class="kpi-label">${escapeHtml(status)}</span><strong class="kpi-value">${formatNumber(count)}</strong></article>`).join('')}</section>
    <div class="toolbar"><input class="input" id="storeSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Search brand or branch" autocomplete="off">
    <select class="select" id="brandFilter" aria-label="Filter by brand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.brand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select>
    <select class="select" id="storeSort" aria-label="Sort stores">${[['name_asc','Branch name · A to Z'],['rating_asc','Rating · lowest first'],['rating_desc','Rating · highest first'],['severity_asc','Status · most severe first']].map(([value,label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="status-filters">${['','HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNKNOWN'].map(status => `<button class="filter-chip ${state.status === status ? 'active' : ''}" data-status="${status}">${status || 'All statuses'}</button>`).join('')}</div>
    ${selectedPlatform ? renderPlatformTable(filteredGroups) : renderOverviewTable(filteredGroups)}`;
  attachTalabatControls();
  attachCloudStoreClicks(filteredGroups);
}

function renderPlatformTable(groups) {
  const rows=groups.flatMap(group=>group.rows.map(row=>({group,row})));
  return `<div class="table-wrap"><table class="compact-table"><thead><tr><th>Brand / branch</th><th>Rating</th><th>Status</th><th>Observed</th></tr></thead>
    <tbody>${rows.length?rows.map(({group,row})=>`<tr data-branch-key="${escapeHtml(group.key)}"><td data-label="Branch"><div class="store-name">${escapeHtml(group.displayName)}</div></td><td data-label="Rating"><strong>${formatRating(row.rating)}</strong></td><td data-label="Status">${statusHtml(row.status)}</td><td data-label="Observed"><time datetime="${escapeHtml(row.timestamp)}">${escapeHtml(formatTime(row.timestamp))}</time>${row.carriedForward?'<span class="carried-forward">Carried forward</span>':''}</td></tr>`).join(''):'<tr><td colspan="4" class="empty">No branches match this view</td></tr>'}</tbody></table></div>`;
}
function renderOverviewTable(groups) {
  return `<div class="table-wrap"><table class="overview-table"><thead><tr><th>Brand / branch</th><th>Platform ratings</th><th>Overall status</th><th>Latest observation</th></tr></thead>
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

function openCloudStore(group) {
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
    <section class="history-placeholder"><strong>Rating history</strong><p>Cloud History is not available yet. It will appear here after the historical API is added.</p></section>`;
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
      <div class="chart-card"><h4>Rating history</h4><canvas class="chart" id="ratingChart"></canvas></div>
      <div class="chart-card"><h4>Review count history</h4><canvas class="chart" id="reviewChart"></canvas></div>
      <div class="chart-card"><h4>One-star count history</h4><canvas class="chart" id="oneStarChart"></canvas></div>
      <p class="updated">${formatNumber(history.length)} successful snapshots · Last updated ${escapeHtml(formatTime(store.lastUpdated))}</p>`;
    for (const button of detailContent.querySelectorAll('[data-range]')) button.addEventListener('click', () => openStore(storeId, button.dataset.range));
    for (const [id,key] of [['reviewChart','reviewCount'],['oneStarChart','oneStarCount']]) {
      document.getElementById(id).parentElement.hidden = !chartData.some(p => p[key] !== null && Number.isFinite(p[key]));
    }
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
initialize();
