/* Reads saved reports only. No collector, session or external portal access. */
const performanceState={date:'',brand:'',branch:'',search:'',view:'sales',sortKey:'branch',sortDirection:'asc',cache:null,cacheKey:null,checkedAt:0,generation:0};
const performanceViews={
 sales:[['Successful Orders','Orders'],['Gross Sales','Gross sales · AED'],['Cancelled Orders','Cancelled']],
 operations:[['Customer Complaint rate','Complaints · %'],['Avoidable cancellation rate','Avoidable cancellation · %'],['Unavailable Time Duration Rate','Offline · %'],['Average preparation time (minutes)','Prep · min'],['Total AWT Duration (Minutes)','Total avoidable wait · min']],
 funnel:[['Impressions','Impressions'],['Viewed your menu','Viewed menu'],['Added items to cart','Added to cart'],['Placed an order','Placed order']]
};
function performanceNumber(v){if(v===null||v===undefined||typeof v!=='string'||!/^[-+]?\d+(?:\.\d+)?$/.test(v.trim()))return null;const n=Number(v);return Number.isFinite(n)?n:null;}
function performanceTotal(rows,key){const values=rows.filter(r=>r.present).map(r=>performanceNumber(r.values[key]));const usable=values.filter(v=>v!==null);return {value:usable.length?usable.reduce((a,b)=>a+b,0):null,populated:usable.length,total:values.length};}
function performanceFormat(v){const n=performanceNumber(v);return n===null?(v===null||v===undefined||v===''?'—':escapeHtml(v)):new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(n);}
function performanceRows(data){return data.rows.map(r=>({...r,...storeIdentity({storeName:r.storeName||'Unnamed branch'})}));}
function performanceFiltered(data){
 const p=performanceState,rows=performanceRows(data).filter(r=>(!p.brand||r.brand===p.brand)&&(!p.branch||r.storeId===p.branch)&&(!p.search||r.displayName.toLowerCase().includes(p.search.toLowerCase())));
 return rows.sort((a,b)=>{
  if(p.sortKey==='branch')return (p.sortDirection==='asc'?1:-1)*(a.displayName.localeCompare(b.displayName)||a.storeId.localeCompare(b.storeId));
  const av=performanceNumber(a.values[p.sortKey]),bv=performanceNumber(b.values[p.sortKey]);
  if(av===null&&bv!==null)return 1;if(av!==null&&bv===null)return -1;
  if(av!==bv)return (p.sortDirection==='asc'?1:-1)*((av??0)-(bv??0));
  return a.displayName.localeCompare(b.displayName);
 });
}
function performanceSortHeader(label,key){const p=performanceState,active=p.sortKey===key,arrow=active?(p.sortDirection==='asc'?'▲':'▼'):'↕';return `<button class="sort-button ${active?'active':''}" data-perf-sort="${escapeHtml(key)}" aria-label="Sort ${escapeHtml(label)} ${active&&p.sortDirection==='asc'?'descending':'ascending'}">${escapeHtml(label)} <span aria-hidden="true">${arrow}</span></button>`;}
function performanceCoverage(rows){const keys=performanceViews.funnel.map(x=>x[0]);const present=rows.filter(r=>r.present);if(!present.length)return 'No report rows in this selection';const cells=present.flatMap(r=>keys.map(k=>performanceNumber(r.values[k])));const filled=cells.filter(v=>v!==null).length;return filled===0?'Funnel data unavailable from Talabat':filled===cells.length?'Funnel fields populated':'Funnel data partially available';}
async function renderPerformance(force=false){
 const p=performanceState,key=p.date;const generation=++p.generation;
 if(force||!p.cache||p.cacheKey!==key||Date.now()-p.checkedAt>300000){
  main.innerHTML='<section class="loading-card">Loading saved Performance report…</section>';
  try{const data=await api('/api/dashboard/performance/latest'+(key?'?date='+encodeURIComponent(key):''));if(generation!==p.generation||state.tab!=='performance')return;p.cache=data;p.cacheKey=key;p.checkedAt=Date.now();}
  catch{if(generation!==p.generation||state.tab!=='performance')return;main.innerHTML='<section class="error-card"><h2>Performance unavailable</h2><p>The saved report could not be read. Ratings remain available in their tabs.</p><button class="tab active" id="performanceRetry">Retry</button></section>';document.getElementById('performanceRetry').onclick=()=>renderPerformance(true);refreshState.querySelector('span:last-child').textContent='Performance unavailable';refreshState.querySelector('.live-dot').dataset.health='ERROR';return;}
 }
 if(state.tab!=='performance')return;
 paintPerformance();
}
function paintPerformance(){
 const p=performanceState,data=p.cache,all=performanceRows(data),rows=performanceFiltered(data);
 const brands=[...new Set(all.map(r=>r.brand))].sort();const branches=all.filter(r=>!p.brand||r.brand===p.brand).sort((a,b)=>a.displayName.localeCompare(b.displayName));
 const dates=[...new Set([...data.availableDates,...(p.date?[p.date]:[])])].sort().reverse();
 const opt=(v,label,selected)=>`<option value="${escapeHtml(v)}" ${v===selected?'selected':''}>${escapeHtml(label)}</option>`;
 const cards=[['Gross Sales','Gross sales','AED'],['Successful Orders','Successful orders',''],['Cancelled Orders','Cancelled orders',''],['Total customer complaints received','Customer complaints','']];
 const coverage=performanceCoverage(rows),missing=rows.filter(r=>!r.present).length;
 main.innerHTML=`<section class="page-heading"><div><div class="perf-eyebrow">TALABAT · DAILY PERFORMANCE</div><h2>Performance</h2><p>Report date: <strong>${escapeHtml(data.reportDate||'No saved report')}</strong> · Dubai calendar</p></div><button class="tab active" id="performanceRefresh">Refresh saved data</button></section>
 <section class="perf-context"><span>Daily collection: 09:30 Dubai · two-day reporting lag</span><span>Saved: ${data.receivedAt?escapeHtml(new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Dubai',dateStyle:'medium',timeStyle:'short'}).format(new Date(data.receivedAt))):'No data'} Dubai</span></section>
 ${!p.date&&data.reportDate&&data.reportDate<data.expectedDate?`<p class="health-warning" role="status">Older report displayed. Expected reporting date: ${escapeHtml(data.expectedDate)}.</p>`:''}
 <section class="perf-controls" aria-label="Performance filters">
 <label>Report date<select class="select" id="performanceDate">${opt('','Latest available (two-day lag)',p.date)}${dates.map(d=>opt(d,d,p.date)).join('')}</select></label>
 <label>Brand<select class="select" id="performanceBrand">${opt('','All brands',p.brand)}${brands.map(b=>opt(b,b,p.brand)).join('')}</select></label>
 <label>Branch<select class="select" id="performanceBranch">${opt('','All branches',p.branch)}${branches.map(b=>opt(b.storeId,b.displayName,p.branch)).join('')}</select></label>
 <label>Search<input class="input" type="search" id="performanceSearch" value="${escapeHtml(p.search)}" placeholder="Brand or branch"></label>
 <label class="perf-sort-control">Sort<select class="select" id="performanceSort">${[['branch','Branch name'],...performanceViews[p.view]].flatMap(([key,label])=>[['asc','lowest first'],['desc','highest first']].map(([direction,suffix])=>opt(key+'|'+direction,label+' · '+(key==='branch'?(direction==='asc'?'A to Z':'Z to A'):suffix),p.sortKey+'|'+p.sortDirection))).join('')}</select></label></section>
 ${data.state==='EMPTY'?'<section class="loading-card">No saved report for this date. Choose another available date.</section>':`
 <section class="kpi-grid perf-kpis">${cards.map(([key,label,unit])=>{const t=performanceTotal(rows,key);return `<article class="kpi-card"><span class="kpi-label">${label}</span><strong class="kpi-value">${t.value===null?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(t.value)}</strong><p class="perf-card-note">${unit} · ${t.populated}/${t.total} report rows${t.populated<t.total?' · partial':''}</p></article>`;}).join('')}</section>
 <div class="perf-quality"><span>${rows.filter(r=>r.present).length} reported / ${rows.length} scoped branches${missing?` · ${missing} absent from CSV`:''}</span><span>${coverage}</span></div>
 <p class="perf-note">Totals cover the filtered report rows. Missing values are shown as —, never zero. Rates and average times are shown per branch.</p>
 <nav class="perf-view-tabs" aria-label="Metric group">${Object.keys(performanceViews).map(v=>`<button class="tab ${p.view===v?'active':''}" data-perf-view="${v}" aria-pressed="${p.view===v}">${v==='sales'?'Sales & orders':v==='operations'?'Operations':'Customer funnel'}</button>`).join('')}</nav>
 <div class="table-wrap perf-table-wrap"><table class="compact-table perf-table"><thead><tr><th>${performanceSortHeader('Brand / branch','branch')}</th>${performanceViews[p.view].map(c=>`<th>${performanceSortHeader(c[1],c[0])}</th>`).join('')}</tr></thead><tbody>${rows.length?rows.map(r=>`<tr><td data-label="Branch"><button class="perf-branch" data-perf-id="${escapeHtml(r.storeId)}">${escapeHtml(r.displayName)}</button>${!r.present?'<span class="carried-forward">Not included in source CSV</span>':''}</td>${performanceViews[p.view].map(c=>`<td data-label="${c[1]}">${performanceFormat(r.values[c[0]])}</td>`).join('')}</tr>`).join(''):`<tr><td colspan="${performanceViews[p.view].length+1}" class="empty">No branches match these filters.</td></tr>`}</tbody></table></div>`}`;
 document.getElementById('performanceDate').onchange=e=>{p.date=e.target.value;renderPerformance();};
 document.getElementById('performanceBrand').onchange=e=>{p.brand=e.target.value;p.branch='';paintPerformance();};
 document.getElementById('performanceBranch').onchange=e=>{p.branch=e.target.value;paintPerformance();};
 document.getElementById('performanceSearch').oninput=e=>{const input=e.target,value=input.value,pos=input.selectionStart;p.search=value;paintPerformance();const replacement=document.getElementById('performanceSearch');replacement.focus();replacement.setSelectionRange(pos,pos);};
 document.getElementById('performanceSort').onchange=e=>{[p.sortKey,p.sortDirection]=e.target.value.split('|');paintPerformance();};
 document.getElementById('performanceRefresh').onclick=()=>renderPerformance(true);
 for(const b of main.querySelectorAll('[data-perf-view]'))b.onclick=()=>{p.view=b.dataset.perfView;if(p.sortKey!=='branch'&&!performanceViews[p.view].some(c=>c[0]===p.sortKey)){p.sortKey='branch';p.sortDirection='asc';}paintPerformance();};
 for(const b of main.querySelectorAll('[data-perf-sort]'))b.onclick=()=>{const key=b.dataset.perfSort;if(p.sortKey===key)p.sortDirection=p.sortDirection==='asc'?'desc':'asc';else{p.sortKey=key;p.sortDirection=key==='branch'?'asc':'desc';}paintPerformance();};
 for(const b of main.querySelectorAll('[data-perf-id]'))b.onclick=()=>performanceDetail(b.dataset.perfId);
 refreshState.querySelector('span:last-child').textContent='Saved reports · checked every 5 min';refreshState.querySelector('.live-dot').dataset.health=data.state==='SUCCESS'?'HEALTHY':'UNKNOWN';
}
function performanceDetail(id){
 const data=performanceState.cache,row=performanceRows(data).find(r=>r.storeId===id);if(!row)return;
 selectedStore=null;++detailRequest;chartData=[];
 detailContent.innerHTML=`<p class="perf-eyebrow">TALABAT · ${escapeHtml(data.reportDate)}</p><h2 id="detailTitle">${escapeHtml(row.displayName)}</h2><p class="perf-note">${row.present?'Original fields from the saved Performance CSV.':'This branch was in the report scope but had no CSV row. Its values are unknown.'}</p><dl class="perf-details">${data.headers.map(h=>`<div><dt>${escapeHtml(h)}</dt><dd>${performanceFormat(row.values[h])}</dd></div>`).join('')}</dl>`;
 detailPanel.classList.add('open');detailPanel.setAttribute('aria-hidden','false');detailPanel.querySelector('[data-close-detail].close-button')?.focus();
}
