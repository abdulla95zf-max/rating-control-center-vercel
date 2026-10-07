const state = {
  tab: 'overview',
  platforms: [],
  search: '',
  brand: '',
  location: '',
  status: '',
  sort: 'name_asc',
  refreshSeconds: 60,
  timer: null,
  busy: false,
  cloudRatings: false,
  cloudResponse: null,
  actionBrand: '',
  actionTab: 'actions',
  actionExpanded: false,
  recentBrand: '',
  recentPlatform: '',
  recentTab: 'drops',
  recentExpanded: false
};

const main = document.getElementById('mainContent');
const tabs = document.getElementById('platformTabs');
const refreshState = document.getElementById('refreshState');
const detailPanel = document.getElementById('detailPanel');
const detailContent = document.getElementById('detailContent');
const talabatViewTabs = document.getElementById('talabatViewTabs');
const keetaViewTabs = document.getElementById('keetaViewTabs');
const noonViewTabs = document.getElementById('noonViewTabs');

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
const platformLogoHtml = platform => `<span class="platform-identity"><img src="/platforms/${escapeHtml(platform)}-icon.png" alt=""><span>${escapeHtml(platform)}</span></span>`;
const inlineStatusHtml = status => `<span class="inline-status inline-status-${String(status).toLowerCase()}"><i></i>${escapeHtml(status)}</span>`;
const ratingSortHeader=(label,key)=>{const active=state.sort.startsWith(key+'_'),direction=active&&state.sort.endsWith('_desc')?'desc':'asc',arrow=active?(direction==='asc'?'▲':'▼'):'↕';return `<button class="sort-button ${active?'active':''}" data-rating-sort="${key}" aria-label="Sort ${escapeHtml(label)} ${direction==='asc'?'descending':'ascending'}">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button>`;};
const actionNumber=value=>typeof value==='string'&&/^[-+]?\d+(?:\.\d+)?$/.test(value.trim())&&Number.isFinite(Number(value))?Number(value):null;
let currentActions=[];
let currentDataChecks=[];
let currentRecentChanges=[];

const brandRules = [
  { brand: 'Taazaa Mumbai', patterns: [/^Taazaa\s+Mumbai\b/i] },
  { brand: 'FRB Shawarma', patterns: [/^FRB\s+Shawarma\b/i] },
  { brand: 'FRB Kabab', patterns: [/^FRB\s+Kabab\b/i] },
  { brand: 'Kabab Al Sham', patterns: [/^Kabab\s+Al\s+Sham\b/i] },
  { brand: 'Kabab Fareej', patterns: [/^Kabab\s+Fareej\b/i, /^KF\s*[-–—]/i] },
  { brand: 'Morwarid', patterns: [/^(?:Al\s+)?Morwarid(?:\s+Restaurant)?\b/i, /^(?:Al\s+)?Marwareed\b/i] },
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
  const canonicalBranch=branch;branch=BranchLabels.branch(branch);
  return { brand, branch, key: `${keyWords(brand === 'Morwarid' ? 'Marwareed' : brand)}|${keyWords(canonicalBranch)}`, displayName: `${brand} — ${branch}` };
}
function displayStoreName(row){const identity=storeIdentity(row);return identity.brand==='Other'?identity.branch:identity.displayName;}
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
    state.platforms = state.cloudRatings ? ['talabat','keeta','noon','careem','deliveroo'].map(id => ({id, name: id[0].toUpperCase() + id.slice(1), health: ['talabat','keeta','noon'].includes(id) ? 'UNKNOWN' : 'NOT CONNECTED'})) : (await api('/api/platforms')).platforms;
    state.refreshSeconds = config.autoRefreshSeconds;
    updatePlatformTabs();
    await renderCurrent();

  } catch (error) {
    renderError(error);
  } finally { if(!globalThis.dashboardAuth||globalThis.dashboardAuth.user)state.timer = window.setInterval(()=>renderCurrent(true), state.refreshSeconds * 1000); }
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
  noonViewTabs.hidden=!(state.tab==='noon'||state.tab==='noon-performance');
  for(const button of noonViewTabs.querySelectorAll('[data-noon-view]'))button.classList.toggle('active',button.dataset.noonView===state.tab);
  const keetaVisible=state.tab==='keeta'||state.tab==='keeta-performance';keetaViewTabs.hidden=!keetaVisible;
  for(const button of keetaViewTabs.querySelectorAll('[data-keeta-view]'))button.classList.toggle('active',button.dataset.keetaView===state.tab);
}

async function renderCurrent(force=false) {
  updateTalabatViews();
  if(state.tab==='growth'){await renderGrowth();return;}
  if(state.tab==='performance'){await renderPerformance();return;}
  if(state.tab==='keeta-performance'){await renderKeetaPerformance();return;}
  if(state.tab==='noon-performance'){await renderNoonPerformance();return;}
  if(state.cloudRatings){
    if(['overview','talabat','keeta','noon'].includes(state.tab))await renderCloudRatings(force);
    else renderDisconnected(state.tab);
    return;
  }
  if (state.busy) return;
  state.busy = true;
  refreshState.querySelector('span:last-child').textContent = 'Refreshing…';
  try {
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
    state.platforms = state.platforms.map(p => ['talabat','keeta','noon'].includes(p.id) ? { ...p, health: 'ERROR' } : p);
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
    ${stores.length ? `<ol class="rank-list">${stores.map(store => `<li class="rank-item" data-store-id="${escapeHtml(store.storeId)}"><div><div class="rank-name">${escapeHtml(displayStoreName(store))}</div><div class="rank-meta">${escapeHtml(store.status)}</div></div>${valueRenderer(store)}</li>`).join('')}</ol>` : '<div class="empty">No matching data</div>'}
  </article>`;
}

async function renderTalabat() {
  const parameters = new URLSearchParams({ platform: 'talabat', sort: state.sort });
  if (state.search) parameters.set('search', state.search);
  const { stores: sourceStores, platform } = await api(`/api/stores?${parameters}`);
  const brands=[...new Set(sourceStores.map(store=>storeIdentity(store).brand))].sort();
  const locations=[...new Set(sourceStores.map(store=>storeIdentity(store).branch))].sort();
  const exportStores=sourceStores.filter(store=>{const identity=storeIdentity(store);return (!state.brand||identity.brand===state.brand)&&(!state.location||identity.branch===state.location);});
  const stores=exportStores.filter(store=>!state.status||store.status===state.status);
  main.innerHTML = `
    <div class="page-heading"><div><h2>Talabat stores</h2><p>${formatNumber(stores.length)} stores match the current view</p></div></div>
    ${healthBanner(platform)}
    <div class="toolbar">
      <input class="input" id="storeSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Search store name" autocomplete="off">
      <select class="select" id="brandFilter" aria-label="Filter by brand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.brand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select>
      <select class="select" id="locationFilter" aria-label="Filter by location"><option value="">All locations</option>${locations.map(location=>`<option value="${escapeHtml(location)}" ${state.location===location?'selected':''}>${escapeHtml(location)}</option>`).join('')}</select>
      <select class="select" id="storeSort" aria-label="Sort stores">
        ${[['name_asc','Name · A to Z'],['rating_asc','Rating · lowest first'],['rating_desc','Rating · highest first'],['change_asc','Change · biggest drop'],['change_desc','Change · biggest gain']].map(([value,label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}
      </select>
      <button class="filter-chip ${state.status === 'CRITICAL' ? 'active' : ''}" data-status="CRITICAL">Critical only</button>
    </div>
    <div class="ratings-table-actions"><div class="status-filters">
      ${[['','All statuses'],['HEALTHY','Healthy'],['ACCEPTABLE','Acceptable'],['WARNING','Warning only'],['CRITICAL','Critical only'],['UNKNOWN','Unknown']].map(([value,label]) => `<button class="filter-chip ${state.status === value ? 'active' : ''}" data-status="${value}">${label}</button>`).join('')}
    </div>${ratingExportControls(exportStores.length)}</div>
    <div class="table-wrap"><table class="compact-table"><thead><tr><th>Store name</th><th>Current rating</th><th>Previous</th><th>Change</th><th>Status</th><th>Last updated</th></tr></thead>
      <tbody>${stores.length ? stores.map(store => `<tr data-store-id="${escapeHtml(store.storeId)}"><td class="store-name">${escapeHtml(displayStoreName(store))}</td><td><strong>${formatRating(store.currentRating)}</strong></td><td>${formatRating(store.previousRating)}</td><td>${changeHtml(store.ratingChange)}</td><td>${statusHtml(store.status)}</td><td>${escapeHtml(formatTime(store.lastUpdated))}</td></tr>`).join('') : '<tr><td colspan="6" class="empty">No stores match these filters</td></tr>'}</tbody>
    </table></div>`;
  attachTalabatControls();
  attachStoreClicks();
  attachRatingExports(exportStores.map(store=>({...storeIdentity(store),rows:[{platform:'talabat',rating:store.currentRating,status:store.status,timestamp:store.lastUpdated}]})),{platform:'talabat',brand:state.brand,location:state.location,status:state.status,search:state.search});
}

function cloudHealth(result) {
  if (!result || result.state === 'ERROR') return 'ERROR';
  if (result.state === 'EMPTY') return 'EMPTY';
  const age = Date.now() - timestamp(result.syncTimestamp);
  const scheduledEveryFourHours=['talabat','keeta'].includes(String(result.platform||'').toLowerCase());
  const scheduledDaily=String(result.platform||'').toLowerCase()==='noon';
  const delayedAfter=scheduledDaily?26*60*60*1000:scheduledEveryFourHours?5*60*60*1000:90*60*1000;
  const staleAfter=scheduledDaily?48*60*60*1000:scheduledEveryFourHours?8*60*60*1000:2*60*60*1000;
  return !Number.isFinite(age) || age < 0 ? 'UNKNOWN' : age > staleAfter ? 'STALE' : age >= delayedAfter ? 'DELAYED' : 'LIVE';
}
function cloudPlatformCards(platforms) {
  return '<section class="platform-health-grid">' + state.platforms.map(platform => {
    const result = platforms.find(item => item.platform === platform.id);
    if (!result) return '<article class="kpi-card platform-health-card is-disconnected"><h3 class="platform-card-heading"><img src="/platforms/' + escapeHtml(platform.id) + '-icon.png" alt="">' + escapeHtml(platform.name) + '</h3>' + statusHtml('NOT CONNECTED') + '<p>Not Connected</p></article>';
    const health = cloudHealth(result);
    return '<article class="kpi-card platform-health-card is-connected"><h3 class="platform-card-heading"><img src="/platforms/' + escapeHtml(platform.id) + '-icon.png" alt="">' + escapeHtml(platform.name) + '</h3>' + statusHtml(result.state) +
      '<p>Freshness: ' + statusHtml(health) + '</p><p>Total stores: ' + formatNumber(result.storeCount) + '</p>' +
      '<p>Last sync<br>' + escapeHtml(formatTime(result.syncTimestamp)) + '</p>' +
      (result.state === 'ERROR' ? '<p class="health-warning">Ratings source is unavailable.</p>' :
       result.state === 'EMPTY' ? '<p>No ratings in the selected latest run.</p>' : '') + '</article>';
  }).join('') + '</section>';
}

function ratingExportControls(count){
 const excelIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#21a366" d="M8 2h12v20H8z"/><path fill="#107c41" d="M2 6h12v14H2z"/><path stroke="white" stroke-width="2" d="m6 10 4 6m0-6-4 6"/><path stroke="#b8e5c9" d="M16 7h2m-2 4h2m-2 4h2"/></svg>';
 const pdfIcon='<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#e94343" d="M5 2h10l4 4v16H5z"/><path fill="#ffb8b8" d="M15 2v5h4"/><path fill="none" stroke="white" stroke-width="1.5" d="M8 17c5-8 3-10 2-8-1 3 5 8 7 7-2-3-8-1-9 1Z"/></svg>';
 return `<div class="ratings-export-controls" aria-label="Export ratings"><button type="button" class="rating-export-button" data-export-ratings="excel" ${count?'':'disabled'}>${excelIcon} Excel</button><button type="button" class="rating-export-button" data-export-ratings="pdf" ${count?'':'disabled'}>${pdfIcon} PDF</button><span class="rating-export-message" role="status"></span></div>`;
}
function attachRatingExports(groups,options){
 const exporter=globalThis.RatingExports;if(!exporter){for(const button of main.querySelectorAll('[data-export-ratings]'))button.disabled=true;return;}
 for(const button of main.querySelectorAll('[data-export-ratings]'))button.addEventListener('click',()=>{
  document.getElementById('ratingsExportDialog')?.remove();
  const critical=groups.filter(group=>options.platform?group.rows.some(row=>row.status==='CRITICAL'):groupStatus(group)==='CRITICAL');
  const dialog=document.createElement('dialog');dialog.id='ratingsExportDialog';dialog.className='ratings-export-dialog';
  dialog.innerHTML=`<form method="dialog"><div class="export-dialog-heading"><h3>Export ${button.dataset.exportRatings==='excel'?'Excel':'PDF'}</h3><button class="export-dialog-close" aria-label="Close" value="cancel">×</button></div>${button.dataset.exportRatings==='pdf'?'<fieldset class="export-layout"><legend>PDF layout</legend><label><input type="radio" name="pdfLayout" value="table" checked> Table</label><label><input type="radio" name="pdfLayout" value="locations"> Location cards</label></fieldset>':''}<p>Choose which ratings to include.</p><p class="export-scope-note">Brand, location and search filters stay applied.</p><button type="button" class="export-choice" data-export-scope="all"><strong>All statuses</strong><span>${groups.length} branches</span></button><button type="button" class="export-choice critical-choice" data-export-scope="critical" ${critical.length?'':'disabled'}><strong>Critical only</strong><span>${critical.length} branches</span></button></form>`;
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.addEventListener('click',event=>{if(event.target===dialog)dialog.close();});
  for(const choice of dialog.querySelectorAll('[data-export-scope]'))choice.addEventListener('click',()=>{const selected=choice.dataset.exportScope==='critical',snapshot=exporter.fromGroups(selected?critical:groups,{...options,status:selected?'CRITICAL':''});snapshot.layout=dialog.querySelector('input[name="pdfLayout"]:checked')?.value||'table';const message=main.querySelector('.rating-export-message');try{message.textContent='';if(button.dataset.exportRatings==='excel')exporter.downloadExcel(snapshot);else exporter.printPdf(snapshot);dialog.close();}catch(error){message.textContent=error instanceof Error?error.message:'Export could not be opened.';dialog.close();}});
  dialog.showModal();
 });
}

const ratingsReports=createReportCache({ttl:60000});
const overviewReports=createReportCache({ttl:300000});
let cloudViewEpoch=0;
const ratingsReportPath='/api/dashboard/ratings/latest';
const overviewPerformancePath='/api/dashboard/performance/latest';
const overviewHistoryPath='/api/dashboard/performance/action-history?days=30';
function ratingsRefreshLabel(){
 const entry=ratingsReports.peek(ratingsReportPath),label=refreshState.querySelector('span:last-child');
 const checked=entry.checkedAt?new Date(entry.checkedAt).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}):null;
 label.textContent=entry.error?`Refresh failed · showing saved view${checked?' · checked '+checked:''}`:entry.pending?`Refreshing…${entry.value?' · showing saved view':''}`:checked?`Auto-refresh ${state.refreshSeconds}s · checked ${checked}`:'Reading saved ratings…';
}
function overviewActionPanel(groups){
 const p=overviewReports.peek(overviewPerformancePath),h=overviewReports.peek(overviewHistoryPath);
 if(p.value&&h.value){const panel=renderActionCenter(groups,p.value,h.value);return p.error||h.error?panel.replace('<section class="action-center">','<section class="action-center"><p class="perf-note">Refresh failed · showing previously loaded operational reports.</p>'):panel;}
 return '<section class="action-center"><header class="action-header"><h3>Operational Center</h3></header><p class="perf-note">'+(p.error||h.error?'Saved operational reports could not be refreshed. They will be retried automatically.':'Loading saved operational reports… Ratings are already available.')+'</p></section>';
}
function refreshOverviewActions(epoch){
 if(epoch!==cloudViewEpoch||state.tab!=='overview'||!state.cloudResponse)return;
 const existing=main.querySelector('.action-center');if(!existing)return;
 const groups=groupCloudRows(state.cloudResponse.ratings);
 existing.outerHTML=overviewActionPanel(groups);attachActionCenter(groups);
}
function loadOverviewReports(force,epoch){
 for(const path of [overviewPerformancePath,overviewHistoryPath]){
  const entry=overviewReports.peek(path);
  if(entry.pending||(!force&&entry.value&&Date.now()-entry.checkedAt<300000))continue;
  overviewReports.read(path,()=>api(path),{force}).then(value=>{
   if(epoch!==cloudViewEpoch)return;
   if(path===overviewPerformancePath&&value?.rows&&typeof performanceState!=='undefined'){performanceState.cache=value;performanceState.cacheKey='';performanceState.checkedAt=overviewReports.peek(path).checkedAt;}
  }).catch(()=>{}).finally(()=>refreshOverviewActions(epoch));
 }
}
async function renderCloudRatings(force=false) {
 const requestedTab=state.tab,epoch=cloudViewEpoch;
 if(requestedTab==='overview')loadOverviewReports(force,epoch);
 const cached=ratingsReports.peek(ratingsReportPath);
 if(cached.value)paintCloudRatings(cached.value);
 const request=ratingsReports.read(ratingsReportPath,()=>api(ratingsReportPath),{force});
 ratingsRefreshLabel();
 try{
  const response=await request;
  if(epoch!==cloudViewEpoch||state.tab!==requestedTab)return;
  paintCloudRatings(response);ratingsRefreshLabel();
 }catch(error){
  if(epoch!==cloudViewEpoch||state.tab!==requestedTab)return;
  if(ratingsReports.peek(ratingsReportPath).value){ratingsRefreshLabel();return;}
  renderError(error);refreshState.querySelector('span:last-child').textContent='Data unavailable';
 }
}
function paintCloudRatings(response) {
  const focused=document.activeElement,focusId=focused?.id,selection=focused?.id==='storeSearch'?[focused.selectionStart,focused.selectionEnd]:null,typedSearch=focused?.id==='storeSearch'?focused.value:null;
  state.cloudResponse = response;
  const platformResults = response.platforms;
  state.platforms = state.platforms.map(platform => {
    const result = platformResults.find(item => item.platform === platform.id);
    return result ? {...platform, connected:result.state !== 'ERROR', state:result.state, health:cloudHealth(result),
      lastSuccessfulSync:result.syncTimestamp, message:result.state === 'ERROR' ? 'Ratings source unavailable' : null} : platform;
  });
  updatePlatformTabs();
  const selectedPlatform = ['talabat','keeta','noon'].includes(state.tab) ? state.tab : null;
  const sourceRows = selectedPlatform ? response.ratings.filter(row => row.platform === selectedPlatform) : response.ratings;
  const allGroups = groupCloudRows(response.ratings);
  globalThis.ratingAccessOptions={
    brands:[...new Set(allGroups.map(group=>group.brand))].sort((a,b)=>a.localeCompare(b)),
    branches:allGroups.map(group=>({key:group.key,label:group.displayName})).sort((a,b)=>a.label.localeCompare(b.label))
  };
  const viewGroups = selectedPlatform ? groupCloudRows(sourceRows) : allGroups;
  const brands = [...new Set(viewGroups.map(group => group.brand))].sort((a,b)=>a.localeCompare(b));
  const locations = [...new Set(viewGroups.map(group => group.branch))].sort((a,b)=>a.localeCompare(b));
  if(state.brand&&!brands.includes(state.brand))state.brand='';
  if(state.location&&!locations.includes(state.location))state.location='';
  const search = state.search.toLowerCase();
  const exportGroups = viewGroups.filter(group => (!state.brand || group.brand === state.brand) && (!state.location || group.branch === state.location) &&
    [group.displayName,group.brand,group.branch,...group.rows.map(row=>row.storeName||'')].some(value=>value.toLowerCase().includes(search)));
  exportGroups.sort((a,b) => {
    const direction=state.sort.endsWith('_desc')?-1:1,key=state.sort.replace(/_(?:asc|desc)$/,'');
    if(key==='rating'){const av=groupRating(a),bv=groupRating(b);if(av===null&&bv!==null)return 1;if(av!==null&&bv===null)return -1;if(av!==bv)return direction*((av??0)-(bv??0));}
    if(key==='severity'){const difference=severity[groupStatus(a)]-severity[groupStatus(b)];if(difference)return direction*difference;}
    if(key==='observed'){const av=Math.max(...a.rows.map(row=>timestamp(row.timestamp)).filter(Number.isFinite)),bv=Math.max(...b.rows.map(row=>timestamp(row.timestamp)).filter(Number.isFinite));if(av!==bv)return direction*(av-bv);}
    return direction*a.displayName.localeCompare(b.displayName);
  });
  const filteredGroups=exportGroups.filter(group=>!state.status||(selectedPlatform?group.rows.some(row=>row.status===state.status):groupStatus(group)===state.status));
  const counted = selectedPlatform ? sourceRows.map(row=>row.status) : viewGroups.map(group=>groupStatus(group));
  const counts = Object.fromEntries(['HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNKNOWN'].map(status => [status, counted.filter(value=>value===status).length]));
  const title=selectedPlatform ? selectedPlatform[0].toUpperCase()+selectedPlatform.slice(1)+' latest ratings' : 'Portfolio overview';
  const active=selectedPlatform ? platformResults.filter(item=>item.platform===selectedPlatform) : platformResults;
  const overallHealth=['ERROR','STALE','DELAYED','EMPTY','UNKNOWN','LIVE'].find(health=>active.some(item=>cloudHealth(item)===health))||'UNKNOWN';
  refreshState.querySelector('.live-dot').dataset.health=overallHealth;
  const recentChanges=!selectedPlatform?renderRecentChanges(allGroups):'';
  const actionCenter=!selectedPlatform?overviewActionPanel(allGroups):'';
  main.innerHTML = `<div class="page-heading"><div><h2>${escapeHtml(title)}</h2><p>Latest saved ratings · ${formatNumber(viewGroups.length)} branches${selectedPlatform ? '' : ' across connected platforms'}</p></div>${selectedPlatform?`<div class="ratings-freshness">${statusHtml(overallHealth)}<span>Last sync <strong>${escapeHtml(formatTime(active[0]?.syncTimestamp))}</strong></span></div>`:''}</div>
    ${selectedPlatform?'':cloudPlatformCards(platformResults)}
    <section class="kpi-grid rating-status-grid">${Object.entries(counts).map(([status,count]) => `<article class="kpi-card tone-${status.toLowerCase()}"><span class="kpi-label">${escapeHtml(status)}</span><strong class="kpi-value">${formatNumber(count)}</strong></article>`).join('')}</section>
    ${selectedPlatform?'':`<div class="overview-panels">${recentChanges}${actionCenter}</div>${typeof renderGrowthOverview==='function'?'<section class="gr-overview" id="growthOverview"><h3>Sales decline priorities</h3><p>Reading saved comparisons…</p></section>':''}`}
    <div class="toolbar"><input class="input" id="storeSearch" type="search" value="${escapeHtml(state.search)}" placeholder="Search brand or branch" autocomplete="off">
    <select class="select" id="brandFilter" aria-label="Filter by brand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.brand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select>
    <select class="select" id="locationFilter" aria-label="Filter by location"><option value="">All locations</option>${locations.map(location=>`<option value="${escapeHtml(location)}" ${state.location===location?'selected':''}>${escapeHtml(location)}</option>`).join('')}</select>
    <select class="select" id="storeSort" aria-label="Sort stores">${[['name_asc','Branch name · A to Z'],['name_desc','Branch name · Z to A'],['rating_asc','Rating · lowest first'],['rating_desc','Rating · highest first'],['severity_asc','Status · best first'],['severity_desc','Status · most severe first'],['observed_desc','Observed · newest first'],['observed_asc','Observed · oldest first']].map(([value,label]) => `<option value="${value}" ${state.sort === value ? 'selected' : ''}>${label}</option>`).join('')}</select></div>
    <div class="ratings-table-actions"><div class="status-filters">${['','HEALTHY','ACCEPTABLE','WARNING','CRITICAL','UNKNOWN'].map(status => `<button class="filter-chip ${state.status === status ? 'active' : ''}" data-status="${status}">${status || 'All statuses'}</button>`).join('')}</div>${ratingExportControls(exportGroups.length)}</div>
    ${selectedPlatform ? renderPlatformTable(filteredGroups) : renderOverviewTable(filteredGroups)}`;
  attachTalabatControls();
  if(!selectedPlatform&&typeof renderGrowthOverview==='function')renderGrowthOverview();
  attachRatingExports(exportGroups,{platform:selectedPlatform,brand:state.brand,location:state.location,status:state.status,search:state.search});
  attachCloudStoreClicks(filteredGroups);
  attachRecentChanges(allGroups);
  attachActionCenter(allGroups);
  if(focusId){const next=document.getElementById(focusId);if(next){if(typedSearch!==null)next.value=typedSearch;next.focus();if(selection&&typeof next.setSelectionRange==='function')next.setSelectionRange(...selection);}}
}

function buildRecentChanges(groups){
 const changes=[];
 for(const group of groups)for(const row of group.rows){if(!row.previousTimestamp)continue;const ratingDelta=row.rating!==null&&row.previousRating!==null?Number((row.rating-row.previousRating).toFixed(1)):null,oneStarDelta=Number.isSafeInteger(row.oneStarCount)&&Number.isSafeInteger(row.previousOneStarCount)?row.oneStarCount-row.previousOneStarCount:null,reviewDelta=Number.isSafeInteger(row.reviewCount)&&Number.isSafeInteger(row.previousReviewCount)?row.reviewCount-row.previousReviewCount:null,base={key:group.key,name:group.displayName,brand:group.brand,platform:row.platform,timestamp:row.timestamp,rating:row.rating,previousRating:row.previousRating,ratingDelta,oneStarDelta,reviewDelta};if(ratingDelta!==null&&ratingDelta<0)changes.push({...base,type:'drops',score:(row.previousRating>=4.1&&row.rating<4.1?200:100)+Math.abs(ratingDelta)*100,label:row.previousRating>=4.1&&row.rating<4.1?'New critical':'Rating drop'});if(oneStarDelta!==null&&oneStarDelta>0)changes.push({...base,type:'oneStar',score:80+oneStarDelta*12,label:'New one-star'});if(ratingDelta!==null&&ratingDelta>0){const recovered=row.previousRating<4.1&&row.rating>=4.1;changes.push({...base,type:'improved',recovered,score:ratingDelta*100+(recovered?100:0),label:recovered?'Recovered above 4.1':row.rating<4.1?'Improved · still critical':'Rating improved'});}}
 return changes.sort((a,b)=>b.score-a.score||timestamp(b.timestamp)-timestamp(a.timestamp)||a.name.localeCompare(b.name));
}
function renderRecentChanges(groups){
 const all=buildRecentChanges(groups),brands=[...new Set(all.map(item=>item.brand))].sort(),filtered=all.filter(item=>(!state.recentBrand||item.brand===state.recentBrand)&&(!state.recentPlatform||item.platform===state.recentPlatform)),lists={drops:filtered.filter(item=>item.type==='drops'),oneStar:filtered.filter(item=>item.type==='oneStar'),improved:filtered.filter(item=>item.type==='improved')},selected=lists[state.recentTab]||lists.drops;currentRecentChanges=selected;const shown=state.recentExpanded?selected:selected.slice(0,5),detail=item=>item.type==='oneStar'?`+${formatNumber(item.oneStarDelta)} one-star${item.reviewDelta>0?` from +${formatNumber(item.reviewDelta)} reviews`:''}`:`${formatRating(item.previousRating)} → ${formatRating(item.rating)} (${item.ratingDelta>0?'+':''}${item.ratingDelta.toFixed(1)})`;
 const row=(item,index)=>`<li class="action-row recent-row"><span class="recent-change ${item.type}">${escapeHtml(item.label)}</span><div class="action-copy"><strong>${escapeHtml(item.name)}</strong><p>${platformLogoHtml(item.platform)} <span>${escapeHtml(detail(item))}</span> · ${escapeHtml(formatTime(item.timestamp))}</p></div><button class="action-open" data-recent-index="${index}">View</button></li>`;
 return `<section class="recent-changes"><header class="action-header"><div><span class="action-eyebrow">PREVIOUS SAVED SNAPSHOT</span><h3>Recent Changes</h3><p>What changed since each store’s previous collection</p></div><div class="recent-filters"><label>Brand <select class="select" id="recentBrand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.recentBrand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select></label><label>Platform <select class="select" id="recentPlatform"><option value="">All platforms</option>${['talabat','keeta','noon'].map(platform=>`<option value="${platform}" ${state.recentPlatform===platform?'selected':''}>${platform[0].toUpperCase()+platform.slice(1)}</option>`).join('')}</select></label></div></header><nav class="action-tabs">${[['drops','Rating drops',lists.drops.length],['oneStar','New one-star',lists.oneStar.length],['improved','Improved',lists.improved.length]].map(([key,label,count])=>`<button type="button" class="${state.recentTab===key?'active':''}" data-recent-tab="${key}">${label} <span>${count}</span></button>`).join('')}</nav>${shown.length?`<ol class="action-list">${shown.map(row).join('')}</ol>`:'<div class="action-clear">No recent changes in this category.</div>'}${selected.length>5?`<button class="action-full-list" id="recentFullList" type="button">${state.recentExpanded?'Show top 5':`View full list (${selected.length})`}</button>`:''}<details class="action-method"><summary>How changes are compared</summary><p class="action-rules">This compares the latest saved snapshot with the immediately previous one. Talabat normally collects every 4 hours; this is not a daily comparison.</p></details></section>`;
}
function attachRecentChanges(groups){const lookup=new Map(groups.map(group=>[group.key,group])),brand=document.getElementById('recentBrand'),platform=document.getElementById('recentPlatform');if(brand)brand.onchange=()=>{state.recentBrand=brand.value;state.recentExpanded=false;renderCurrent();};if(platform)platform.onchange=()=>{state.recentPlatform=platform.value;state.recentExpanded=false;renderCurrent();};for(const button of main.querySelectorAll('[data-recent-tab]'))button.onclick=()=>{state.recentTab=button.dataset.recentTab;state.recentExpanded=false;renderCurrent();};const full=document.getElementById('recentFullList');if(full)full.onclick=()=>{state.recentExpanded=!state.recentExpanded;renderCurrent();};for(const button of main.querySelectorAll('[data-recent-index]'))button.onclick=()=>{const item=currentRecentChanges[Number(button.dataset.recentIndex)];if(item&&lookup.has(item.key))openCloudStore(lookup.get(item.key));};}

function buildActionCenter(groups,performance,actionHistory){
 const actions=new Map(),levels={attention:1,critical:2},pointsByStore=new Map();for(const point of actionHistory?.points||[]){const id=String(point.storeId),rows=pointsByStore.get(id)||[];rows.push(point);pointsByStore.set(id,rows);}for(const rows of pointsByStore.values())rows.sort((a,b)=>b.reportDate.localeCompare(a.reportDate));
 const add=(key,name,level,issue,recommendation,target={})=>{const existing=actions.get(key)||{key,name,level:'attention',issues:[],recommendations:[],ratingKey:null,performanceId:null,openKind:null,recurrence:0,weeklyOrders:null,priorityScore:0,ratingPlatforms:0};if(levels[level]>levels[existing.level]||!existing.openKind){existing.level=level;existing.openKind=target.performanceId?'performance':'rating';}if(!existing.issues.includes(issue))existing.issues.push(issue);if(recommendation&&!existing.recommendations.includes(recommendation))existing.recommendations.push(recommendation);existing.recurrence=Math.max(existing.recurrence,target.recurrence||0);existing.priorityScore=Math.max(existing.priorityScore,target.priorityScore||0);existing.ratingPlatforms+=target.ratingPlatform?1:0;if(target.weeklyOrders!==undefined)existing.weeklyOrders=target.weeklyOrders;if(target.ratingKey)existing.ratingKey=target.ratingKey;if(target.performanceId)existing.performanceId=target.performanceId;actions.set(key,existing);};
 const aggregate=(rows,field,weighted=true)=>{const usable=rows.filter(point=>point[field]!==null&&(!weighted||point.orders>0));if(!usable.length)return null;if(!weighted)return usable.reduce((sum,point)=>sum+point[field],0)/usable.length;const orders=usable.reduce((sum,point)=>sum+point.orders,0);return orders>0?usable.reduce((sum,point)=>sum+point[field]*point.orders,0)/orders:null;};
 for(const group of groups)for(const row of group.rows)if(row.rating!==null&&row.rating<4.1){const reviews=Number.isSafeInteger(row.reviewCount)?row.reviewCount:null,oneStar=Number.isSafeInteger(row.oneStarCount)?row.oneStarCount:null,confidence=reviews===null?.55:.4+.6*Math.min(reviews/20,1),priorityScore=(4.1-row.rating)*100*confidence+Math.min(Math.log10((reviews||0)+1)*12,24),platform=row.platform[0].toUpperCase()+row.platform.slice(1),volume=reviews===null?'review volume unavailable':`${formatNumber(reviews)} review${reviews===1?'':'s'}${oneStar===null?'':` · ${formatNumber(oneStar)} one-star`}`,recommendation=reviews!==null&&reviews<5?'Inspect the available low-rating feedback now, but treat priority as provisional until more reviews arrive.':'Read the newest one-star feedback, group the repeated cause, and assign one corrective action to the branch manager.';add(group.key,group.displayName,'critical',`${platform} rating ${formatRating(row.rating)} · ${volume}`,recommendation,{ratingKey:group.key,ratingPlatform:true,priorityScore});}
 if(Array.isArray(performance?.rows))for(const raw of performance.rows){if(!raw.present)continue;const identity=storeIdentity({storeName:raw.storeName||'Unnamed branch'}),target={performanceId:raw.storeId},history=pointsByStore.get(String(raw.storeId))||[],week=history.slice(0,7),month=history.slice(0,30),monthDays=new Set(month.map(point=>point.reportDate)).size,values=raw.values||{},todayOrders=actionNumber(values['Successful Orders']);if(week.length<7)continue;const weeklyOrders=week.reduce((sum,point)=>sum+(point.orders||0),0);if(weeklyOrders<20){add(identity.key,identity.displayName,'critical',`Low sales · ${performanceFormat(String(weeklyOrders))} orders in 7 saved days`,'Check store availability, delivery coverage, menu visibility, ranking, promotions and operating hours.',{...target,weeklyOrders,priorityScore:110+(20-weeklyOrders)*2});continue;}const metric=(key,field,label,threshold,recommendation,weighted=true)=>{const unit=field==='prep'?' min':'%';const today=actionNumber(values[key]),weekly=aggregate(week,field,weighted),monthly=aggregate(month,field,weighted),breachDays=week.filter(point=>point[field]!==null&&point[field]>threshold).length,longLabel=monthDays>=30?'30d':`available ${monthDays}d`,monthlyText=monthly===null?'':` · ${longLabel} ${monthly.toFixed(2)}${unit}`,priorityScore=90+Math.min((weekly||0)/threshold*25,75)+breachDays*6;if(weekly!==null&&weekly>threshold)add(identity.key,identity.displayName,'critical',`${label} · 7d ${weekly.toFixed(2)}${unit}${monthlyText} · ${breachDays}/7 days`,recommendation,{...target,recurrence:breachDays,weeklyOrders,priorityScore});else if(today!==null&&today>threshold)add(identity.key,identity.displayName,'attention',`${label} today ${today.toFixed(2)}${unit} · 7d ${weekly===null?'—':weekly.toFixed(2)+unit}`,'Review today’s incident, but wait for sufficient 7-day evidence before escalation.',{...target,weeklyOrders,priorityScore:40+today/threshold*10});};metric('Customer Complaint rate','complaints','Complaints',1,'Review complaint categories and affected orders; correct the recurring food, packaging or item-quality cause.');metric('Avoidable cancellation rate','cancellation','Avoidable cancellation',1.5,'Split cancellations by rejection, stock, timeout and delay; fix menu availability and device acceptance.');metric('Unavailable Time Duration Rate','offline','Offline',2,'Check device connectivity, opening hours and auto-accept; assign a shift owner for availability.',false);metric('Average preparation time (minutes)','prep','Prep time',16,'Review peak-hour kitchen capacity and slow items; adjust staffing, prep settings or campaign load.');}
 for(const item of actions.values())if(item.ratingPlatforms>1)item.priorityScore+=35*(item.ratingPlatforms-1);
 return [...actions.values()].sort((a,b)=>levels[b.level]-levels[a.level]||b.priorityScore-a.priorityScore||b.recurrence-a.recurrence||b.issues.length-a.issues.length||a.name.localeCompare(b.name));
}
function actionReadiness(actionHistory){const dates=[...new Set((actionHistory?.points||[]).map(point=>point.reportDate).filter(Boolean))].sort().reverse();return {days:Math.min(dates.length,7),latest:dates[0]||null,ready:dates.length>=7};}
function renderActionCenter(groups,performance,actionHistory){
 const readiness=actionReadiness(actionHistory),allActions=buildActionCenter(groups,performance,actionHistory),checks=buildDataChecks(performance,actionHistory),actions=allActions.filter(item=>item.level==='critical'),monitors=allActions.filter(item=>item.level==='attention'),all=[...allActions,...checks],brands=[...new Set(all.map(item=>storeIdentity({storeName:item.name}).brand))].sort(),byBrand=items=>state.actionBrand?items.filter(item=>storeIdentity({storeName:item.name}).brand===state.actionBrand):items,lists={actions:byBrand(actions),monitor:byBrand(monitors),checks:byBrand(checks)},selected=lists[state.actionTab]||lists.actions;currentActions=selected;currentDataChecks=selected;const shown=state.actionExpanded?selected:selected.slice(0,5),reportDate=performance?.reportDate||null;
 const row=(item,index)=>`<li class="action-row"><span class="action-priority ${item.kind?item.kind==='zero'?'attention':'check':item.level}">${item.kind?item.kind==='zero'?'No orders':'Check':item.level==='attention'?'Monitor':'Action'}</span><div class="action-copy"><strong>${escapeHtml(item.name)}</strong><p>${escapeHtml((item.issues||[item.issue]).slice(0,2).join(' · '))}${item.issues?.length>2?` · +${item.issues.length-2} more`:''}</p>${item.recommendations?.length?`<details class="action-evidence"><summary>Details & action</summary><p>${escapeHtml(item.issues.join(' · '))}</p><p class="action-recommendation"><b>Recommended:</b> ${escapeHtml(item.recommendations.join(' '))}</p></details>`:''}</div><button class="action-open" data-operational-index="${index}">View</button></li>`;
 const readinessBanner=!readiness.ready?`<div class="action-readiness"><strong>7-day operational analysis is building</strong><span>${readiness.days}/7 saved daily reports collected${readiness.latest?` · latest ${escapeHtml(readiness.latest)}`:''}. Rating actions remain live; weekly sales and KPI actions start after report 7.</span></div>`:'';
 return `<section class="action-center"><header class="action-header"><div><span class="action-eyebrow">7-DAY DECISIONS · 30-DAY CONTEXT</span><h3>Operational Center</h3><p>${reportDate?`Latest daily report ${escapeHtml(reportDate)}`:'Performance unavailable'} · rates are calculated from saved daily reports</p></div><div class="action-summary"><label>Brand <select class="select" id="actionBrand"><option value="">All brands</option>${brands.map(brand=>`<option value="${escapeHtml(brand)}" ${state.actionBrand===brand?'selected':''}>${escapeHtml(brand)}</option>`).join('')}</select></label></div></header>${readinessBanner}<nav class="action-tabs">${[['actions','Actions',lists.actions.length],['monitor','Monitor',lists.monitor.length],['checks','Data checks',lists.checks.length]].map(([key,label,count])=>`<button type="button" class="${state.actionTab===key?'active':''}" data-action-tab="${key}">${label} <span>${count}</span></button>`).join('')}</nav>${shown.length?`<ol class="action-list">${shown.map(row).join('')}</ol>`:'<div class="action-clear">No items in this category.</div>'}${selected.length>5?`<button class="action-full-list" id="actionFullList" type="button">${state.actionExpanded?'Show top 5':`View full list (${selected.length})`}</button>`:''}<details class="action-method"><summary>Rules & thresholds</summary><p class="action-rules">Actions are ranked by severity, evidence volume, multi-platform confirmation and repeated KPI breaches. Weekly orders below 20 create a Low Sales action. With 20+ orders, 7-day weighted rates drive operational actions: complaints &gt;1%, cancellation &gt;1.5%, offline &gt;2%, prep &gt;16 min. A daily spike that is not confirmed by the 7-day rate remains Monitor. Rating below 4.1 is always an Action.</p></details></section>`;
}
function attachActionCenter(groups){const lookup=new Map(groups.map(group=>[group.key,group])),brand=document.getElementById('actionBrand');if(brand)brand.onchange=()=>{state.actionBrand=brand.value;state.actionExpanded=false;renderCurrent();};for(const button of main.querySelectorAll('[data-action-tab]'))button.onclick=()=>{state.actionTab=button.dataset.actionTab;state.actionExpanded=false;renderCurrent();};const full=document.getElementById('actionFullList');if(full)full.onclick=()=>{state.actionExpanded=!state.actionExpanded;renderCurrent();};for(const button of main.querySelectorAll('[data-operational-index]'))button.onclick=()=>{const action=currentActions[Number(button.dataset.operationalIndex)];if(!action)return;if(action.performanceId&&typeof performanceDetail==='function')performanceDetail(action.performanceId);else if(action.ratingKey&&lookup.has(action.ratingKey))openCloudStore(lookup.get(action.ratingKey));};}

function buildDataChecks(performance,actionHistory){if(!Array.isArray(performance?.rows))return [];return performance.rows.flatMap(raw=>{const identity=storeIdentity({storeName:raw.storeName||'Unnamed branch'}),values=raw.values||{},orders=actionNumber(values['Successful Orders']),history=(actionHistory?.points||[]).filter(point=>String(point.storeId)===String(raw.storeId)).sort((a,b)=>b.reportDate.localeCompare(a.reportDate));let issue=null,kind='check';if(!raw.present)issue='Missing from latest Performance report';else if(orders===null)issue='Successful orders unavailable';else if(orders===0){const previous=history.find(point=>point.orders>0);issue=previous?`Zero orders today · last active ${previous.reportDate}`:'Zero orders today · no active day in saved history';kind='zero';}return issue?[{name:identity.displayName,performanceId:raw.storeId,issue,kind}]:[];}).sort((a,b)=>({check:0,zero:1}[a.kind]-{check:0,zero:1}[b.kind])||a.name.localeCompare(b.name));}

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
  document.getElementById('locationFilter')?.addEventListener('change', event => { state.location = event.target.value; renderCurrent(); });
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

async function openCloudStore(group,range='30d',historyPlatform=state.tab) {
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
  const historyRows=group.rows.filter(row=>['talabat','keeta','noon'].includes(row.platform)),historyRow=historyRows.find(row=>row.platform===historyPlatform)||historyRows.find(row=>row.platform==='talabat')||historyRows.find(row=>row.platform==='noon')||historyRows[0];
  const replaceHistory=html=>{detailContent.innerHTML=detailContent.innerHTML.replace(/<section class="history-placeholder">[\s\S]*?<\/section>/,html);};
  if(!historyRow){replaceHistory('<section class="history-placeholder"><strong>Rating history</strong><p>No saved rating history is available for this platform.</p></section>');return;}
  try{const result=await api(`/api/dashboard/ratings/history?storeIdentityKey=${encodeURIComponent(historyRow.storeIdentityKey)}&range=${encodeURIComponent(range)}`);if(request!==detailRequest)return;chartData=result.points;
    replaceHistory(`<div class="status-filters" aria-label="History platform">${historyRows.map(row=>`<button class="filter-chip ${row.platform===historyRow.platform?'active':''}" data-history-platform="${escapeHtml(row.platform)}">${escapeHtml(row.platform==='keeta'?'Keeta':row.platform==='noon'?'Noon':'Talabat')}</button>`).join('')}</div><div class="status-filters" aria-label="History range">${[['24h','24h'],['7d','7 days'],['30d','30 days'],['all','All']].map(([value,label])=>`<button class="filter-chip ${range===value?'active':''}" data-cloud-range="${value}">${label}</button>`).join('')}</div><div class="chart-card"><h4>${escapeHtml(historyRow.platform==='keeta'?'Keeta':historyRow.platform==='noon'?'Noon':'Talabat')} rating history</h4><p class="chart-hint">Hover or tap a point for its exact date and value.</p><canvas class="chart" id="ratingChart" aria-label="Rating history chart"></canvas></div><p class="updated">${chartData.length?formatNumber(chartData.length)+' saved observations':'No saved observations in this range. Try a longer range.'}</p>`);
    for(const button of detailContent.querySelectorAll('[data-cloud-range]'))button.addEventListener('click',()=>openCloudStore(group,button.dataset.cloudRange,historyRow.platform));
    for(const button of detailContent.querySelectorAll('[data-history-platform]'))button.addEventListener('click',()=>openCloudStore(group,range,button.dataset.historyPlatform));
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
      <h2 class="detail-title" id="detailTitle">${escapeHtml(displayStoreName(store))}</h2>
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
  context.fillStyle = document.documentElement.dataset.theme==='light'?'#52647c':'#93a3ba';
  if (!values.length) { context.fillText('No data', pad.left, height / 2); return; }
  let min = options.min ?? values.reduce((a,b) => Math.min(a,b), Infinity);
  let max = options.max ?? values.reduce((a,b) => Math.max(a,b), -Infinity);
  if (max === min) max = min + 1;
  for (let index = 0; index <= 4; index += 1) {
    const y = pad.top + ((height - pad.top - pad.bottom) * index / 4);
    context.strokeStyle = document.documentElement.dataset.theme==='light'?'#d3deed':'#263247'; context.lineWidth = 1;
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
  context.fillStyle = document.documentElement.dataset.theme==='light'?'#52647c':'#93a3ba';
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
  if(hovered){const px=hovered.px,py=y(hovered.value),date=new Date(timestamp(hovered.point.recordedAt));const dateLabel=options.dateOnly?date.toLocaleDateString([], {year:'numeric',month:'short',day:'numeric'}):date.toLocaleString([], {year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});const valueLabel=`${options.label||key}: ${Number(hovered.value).toLocaleString('en-US',{minimumFractionDigits:options.decimals,maximumFractionDigits:options.decimals})}`;context.save();context.strokeStyle='#d9e8ff';context.lineWidth=1;context.setLineDash([4,4]);context.beginPath();context.moveTo(px,pad.top);context.lineTo(px,height-pad.bottom);context.stroke();context.setLineDash([]);context.fillStyle=color;context.beginPath();context.arc(px,py,5,0,Math.PI*2);context.fill();context.font='11px Segoe UI';const boxWidth=Math.max(context.measureText(dateLabel).width,context.measureText(valueLabel).width)+20,boxHeight=46,boxX=Math.min(Math.max(4,px-boxWidth/2),width-boxWidth-4),boxY=Math.max(4,py-boxHeight-12);context.fillStyle=document.documentElement.dataset.theme==='light'?'#ffffff':'#07111f';context.strokeStyle='#64748b';context.lineWidth=1;context.beginPath();context.roundRect(boxX,boxY,boxWidth,boxHeight,8);context.fill();context.stroke();context.fillStyle=document.documentElement.dataset.theme==='light'?'#15243b':'#dce8f7';context.fillText(dateLabel,boxX+10,boxY+17);context.fillStyle=color;context.fillText(valueLabel,boxX+10,boxY+35);context.restore();}
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
noonViewTabs.addEventListener('click',event=>{const button=event.target.closest('[data-noon-view]');if(!button)return;state.tab=button.dataset.noonView;updateTalabatViews();history.replaceState(null,'','#'+state.tab);renderCurrent();});
keetaViewTabs.addEventListener('click',event=>{const button=event.target.closest('[data-keeta-view]');if(!button)return;state.tab=button.dataset.keetaView;updateTalabatViews();history.replaceState(null,'','#'+state.tab);renderCurrent();});

for (const closer of document.querySelectorAll('[data-close-detail]')) closer.addEventListener('click', () => {
  selectedStore = null; ++detailRequest;
  detailPanel.classList.remove('open');
  detailPanel.setAttribute('aria-hidden', 'true');
});
document.addEventListener('keydown', event => { if (event.key === 'Escape') { selectedStore = null; ++detailRequest; detailPanel.classList.remove('open'); detailPanel.setAttribute('aria-hidden', 'true'); } });

const initialTab = location.hash.slice(1);
if (['overview', 'growth', 'talabat', 'keeta', 'noon', 'careem', 'deliveroo', 'performance','keeta-performance','noon-performance'].includes(initialTab)) {
  state.tab = initialTab;
  for (const button of tabs.querySelectorAll('.tab')) button.classList.toggle('active', button.dataset.tab === (state.tab === 'performance' ? 'talabat' : state.tab==='keeta-performance'?'keeta':state.tab==='noon-performance'?'noon':state.tab));
}
document.addEventListener('rcc-theme-change',()=>{redrawCharts();globalThis.redrawPerformanceHistory?.();});
document.addEventListener('rcc-auth-reset',()=>{
 ++cloudViewEpoch;ratingsReports.clear();overviewReports.clear();state.cloudResponse=null;state.busy=false;
 currentActions=[];currentDataChecks=[];currentRecentChanges=[];globalThis.ratingAccessOptions=null;document.getElementById('ratingsExportDialog')?.remove();
 if(state.timer){window.clearInterval(state.timer);state.timer=null;}
 if(typeof performanceState!=='undefined'){++performanceState.generation;performanceState.cache=null;performanceState.checkedAt=0;}
 if(typeof keetaPerformanceState!=='undefined'){keetaPerformanceState.cache=null;keetaPerformanceState.checkedAt=0;}
 if(typeof noonPerformanceState!=='undefined'){++noonPerformanceState.request;noonPerformanceState.cache=null;noonPerformanceState.checkedAt=0;if(noonPerformanceState.poll)window.clearInterval(noonPerformanceState.poll);noonPerformanceState.poll=null;}
 if(typeof growthState!=='undefined'){++growthState.generation;growthState.cache=null;growthState.pending=null;growthState.checkedAt=0;}
 selectedStore=null;++detailRequest;detailPanel.classList.remove('open');detailPanel.setAttribute('aria-hidden','true');detailContent.innerHTML='';
 main.innerHTML='<section class="loading-card">Loading authorized saved reports…</section>';
});
function bootDashboard(){if(globalThis.dashboardAuth)globalThis.dashboardAuth.boot(initialize);else initialize();}
bootDashboard();
