const deliverooOperationsState={days:7,brand:'',branch:'',cache:null,checkedAt:0,request:0};
const doMetric=(r,name)=>r.metrics.find(m=>m.name===name);
const doNumber=(v,suffix='')=>v===null||v===undefined?'—':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v)+suffix;
const doDay=t=>new Date(t*1000+4*3600000).toISOString().slice(0,10);
function doChange(metric,lower=false){if(!metric||!metric.total)return '';const v=metric.change*100;return `<small class="${v===0?'':(v>0)!==lower?'positive':'negative'}">${v>0?'+':''}${doNumber(v)}% vs previous ${deliverooOperationsState.days} days</small>`;}
function doCard(label,value,note='',change=''){return `<article class="kpi-card"><span class="kpi-label">${escapeHtml(label)}</span><strong class="kpi-value">${doNumber(value)}</strong><p class="perf-card-note">${escapeHtml(note)}</p>${change}</article>`;}
function doDuration(v){if(v===null||v===undefined)return '—';const seconds=Math.round(v*60);return Math.floor(seconds/60)+'m '+String(seconds%60).padStart(2,'0')+'s';}
function doChart(row,snapshot){
 const names=[['prep_time','Your prep','#56a5ff'],['prep_time_benchmark','Zone prep','#a78bfa'],['wait_time_past_target_sum','Wait past target','#f5b64c']];
 const maps=names.map(([name])=>new Map(doMetric(row,name).series.map(p=>[doDay(p.time),p.value]))),orders=new Map(doMetric(row,'total_orders').series.map(p=>[doDay(p.time),p.value]));
 const days=Array.from({length:snapshot.days},(_,i)=>new Date(Date.parse(snapshot.startDate)+i*86400000).toISOString().slice(0,10));
 const points=days.map(day=>({day,values:maps.map(m=>orders.get(day)>0?m.get(day)??null:null)}));
 const max=Math.max(1,...points.flatMap(p=>p.values.filter(v=>v!==null))),W=window.innerWidth<=650?Math.max(260,window.innerWidth-68):960,plot=W-100,X=i=>58+i*plot/(days.length-1),Y=v=>204-v/max*166;
 const lines=names.map(([,label,color],k)=>{const segments=[];let current=[];points.forEach((p,i)=>{const v=p.values[k];if(v===null){if(current.length)segments.push(current);current=[];}else current.push(`${X(i)},${Y(v)}`);});if(current.length)segments.push(current);return `<g stroke="${color}" fill="none" stroke-width="1.6">${segments.map(s=>`<polyline vector-effect="non-scaling-stroke" points="${s.join(' ')}"/>`).join('')}${points.map((p,i)=>p.values[k]===null?'':`<circle cx="${X(i)}" cy="${Y(p.values[k])}" r="2.5" stroke="none" fill="${color}"/>`).join('')}</g>`;}).join('');
 const grid=Array.from({length:5},(_,i)=>{const v=max*i/4;return `<line class="do-grid" x1="58" x2="${W-42}" y1="${Y(v)}" y2="${Y(v)}"/><text class="do-axis" x="50" y="${Y(v)+4}" text-anchor="end">${doNumber(v)}</text>`;}).join('');
 const labels=days.map((day,i)=>i!==days.length-1&&i%Math.ceil(days.length/6)!==0?'':`<text class="do-axis" x="${X(i)}" y="232" text-anchor="middle">${day.slice(5)}</text>`).join('');

 // Hit areas cover each date, so touch and hover do not require hitting a tiny dot.
 const targets=points.map((p,i)=>`<rect class="do-chart-hit" data-do-day="${i}" tabindex="0" role="button" aria-label="${p.day}: ${p.values.map((v,k)=>names[k][1]+': '+doDuration(v)).join(', ')}" x="${Math.max(58,X(i)-plot/2/(days.length-1))}" y="28" width="${(i===0||i===days.length-1?plot/2:plot)/(days.length-1)}" height="184"/>`).join('');
 deliverooOperationsState.chartPoints=points;deliverooOperationsState.chartWidth=W;
 return `<section class="np-panel do-chart-panel"><header><div><h3>Preparation and rider wait</h3><p class="do-chart-branch">${escapeHtml(row.brand)} · ${escapeHtml(BranchLabels.branch(row.location))}</p></div><span class="do-legend">${names.map(([,name],i)=>`<span class="do-series-${i}">${name}</span>`).join('')}</span></header><div class="do-chart-stage"><svg class="do-chart" viewBox="0 0 ${W} 250" role="group" aria-label="Daily preparation and rider wait in minutes">${grid}${lines}${labels}<line class="do-crosshair" x1="58" x2="58" y1="28" y2="212" hidden/>${targets}</svg><div class="do-tooltip" role="status" hidden></div></div><p class="perf-note">Hover or tap a day for exact times. Days without orders are gaps.</p><details><summary>Daily values</summary><div class="table-wrap"><table><thead><tr><th>Date</th>${names.map(([,n])=>`<th>${n}</th>`).join('')}</tr></thead><tbody>${points.map(p=>`<tr><td>${p.day}</td>${p.values.map(v=>`<td>${doDuration(v)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details></section>`;
}
function paintDeliverooOperations(){
 main.dataset.doPeriod=String(deliverooOperationsState.days);
 const data=deliverooOperationsState.cache;
 const controls=`<nav class="perf-view-tabs">${[7,30].map(days=>`<button type="button" class="tab ${days===deliverooOperationsState.days?'active':''}" data-do-days="${days}">Last ${days} days</button>`).join('')}</nav>`;
 if(data?.state!=='SUCCESS'||!data.snapshot){main.innerHTML=`<section class="page-heading"><h2>Deliveroo Operations</h2><button class="tab" id="doRefresh">Refresh saved data</button></section>${controls}<section class="loading-card">${data?.state==='ERROR'?'Saved Operations could not be read.':'No saved Operations for this period yet. Run the Deliveroo Operations collector.'}</section>`;doBind();return;}
 const snap=data.snapshot,all=snap.rows,brands=[...new Set(all.map(r=>r.brand))].sort();
 if(!brands.includes(deliverooOperationsState.brand))deliverooOperationsState.brand='';
 const available=all.filter(r=>!deliverooOperationsState.brand||r.brand===deliverooOperationsState.brand);
 if(deliverooOperationsState.branch&&!available.some(r=>r.storeId===deliverooOperationsState.branch))deliverooOperationsState.branch='';
 const rows=available.filter(r=>!deliverooOperationsState.branch||r.storeId===deliverooOperationsState.branch),single=rows.length===1?rows[0]:null,sum=get=>rows.reduce((n,r)=>n+get(r),0);
 const age=(Date.now()-Date.parse(snap.observedAt))/3600000,health=age<0?'UNKNOWN':age<=26?'FRESH':age<=48?'DELAYED':'STALE';
 const cards=rows.length?[doCard('Orders',sum(r=>doMetric(r,'total_orders').total),'Deliveroo metrics',single?doChange(doMetric(single,'total_orders')):''),...['rejected','cancelled','latePrepared','inaccurate'].map(key=>doCard({rejected:'Rejected orders',cancelled:'Cancelled orders',latePrepared:'Late prepared orders',inaccurate:'Inaccurate orders'}[key],sum(r=>r.service[key].total),single?doNumber(single.service[key].pct,'% of orders'):'Order count · see branch rates below')),doCard('Item claims',sum(r=>r.service.totalItemClaims),'Claims on items, including modifiers')].join(''):'';
 const details=single?`<section class="do-summary">${doCard('Your prep time',doMetric(single,'total_orders').total?doMetric(single,'prep_time').total:null,'Minutes',doChange(doMetric(single,'prep_time'),true))}${doCard('Zone prep time',doMetric(single,'prep_time_benchmark').total||null,'Minutes')}${doCard('Period rating',doMetric(single,'order_rating').total||null,'Rating for this date range')}${doCard('Zone period rating',doMetric(single,'order_rating_benchmark').total||null,'Rating for this date range')}</section>${doChart(single,snap)}`:'<p class="perf-note">Select one branch for preparation, zone comparison and daily charts.</p>';
 const warnings=rows.filter(r=>r.disagreements.length);
 const claims=rows.flatMap(r=>r.service.claimedItems.map(i=>({...i,storeName:r.storeName})));
 main.innerHTML=`<section class="page-heading"><div><div class="perf-eyebrow"><img class="perf-platform-logo" src="/platforms/deliveroo-icon.png" alt="">DELIVEROO · OPERATIONS</div><h2>Operations</h2><p>${snap.startDate} — ${snap.endDate} · completed days</p></div><button class="tab active" id="doRefresh">Refresh saved data</button></section>${controls}<section class="perf-controls"><label>Brand<select class="input" id="doBrand"><option value="">All accessible brands</option>${brands.map(b=>`<option ${b===deliverooOperationsState.brand?'selected':''}>${escapeHtml(b)}</option>`).join('')}</select></label><label>Branch<select class="input" id="doBranch"><option value="">All active branches</option>${available.map(r=>`<option value="${r.storeId}" ${r.storeId===deliverooOperationsState.branch?'selected':''}>${escapeHtml(r.storeName)}</option>`).join('')}</select></label><span>${health} · ${rows.length} branches · saved ${escapeHtml(ago(snap.observedAt))}</span></section><section class="do-cards">${cards}</section>${warnings.length?`<p class="do-warning">Deliveroo’s card and daily-chart sources differ for ${warnings.map(r=>escapeHtml(r.storeName)).join(', ')}. Late/rejected order counts and rates use the Operations card source.</p>`:''}<section class="np-panel"><header><h3>Branch operations</h3></header><div class="table-wrap"><table class="do-branch-table"><thead><tr><th>Branch</th><th>Orders</th><th>Rejected</th><th>Cancelled</th><th>Late prepared</th><th>Inaccurate</th><th>Prep · min</th></tr></thead><tbody>${rows.map(r=>{const order=doMetric(r,'total_orders').total;return `<tr><td><button type="button" class="do-branch-button" aria-pressed="${r.storeId===deliverooOperationsState.branch}" data-do-branch="${r.storeId}">${escapeHtml(r.brand)}<small>${escapeHtml(BranchLabels.branch(r.location))}</small></button>${order<20?'<small class="do-low-volume">Low volume · &lt;20 orders</small>':''}</td><td>${doNumber(order)}</td>${['rejected','cancelled','latePrepared','inaccurate'].map(key=>`<td>${doNumber(r.service[key].pct,'%')}<small>${doNumber(r.service[key].total)} orders</small></td>`).join('')}<td>${doNumber(order?doMetric(r,'prep_time').total:null)}</td></tr>`;}).join('')}</tbody></table></div></section>${rows.length?details:''}<section class="np-panel"><header><h3>Claimed items</h3></header>${claims.length?`<div class="table-wrap"><table><thead><tr><th>Branch / item</th><th>Claims</th><th>Reason</th></tr></thead><tbody>${claims.map(i=>`<tr><td>${escapeHtml(i.name)}<small>${escapeHtml(i.storeName)} · ${escapeHtml(i.category)}</small></td><td>${i.claims}</td><td>${[['missing','Missing items'],['incomplete','Incomplete items'],['incorrectlyCooked','Cooked incorrectly'],['wrongOrder','Wrong order'],['dietary','Dietary requirements']].filter(([k])=>i[k]>0).map(([k,l])=>`${l}: ${i[k]}`).join(' · ')}</td></tr>`).join('')}</tbody></table></div>`:'<p>No item claims reported in this period.</p>'}</section><p class="perf-note">Late prepared: rider wait more than 5 minutes past target prep. Inaccurate orders and item claims count different things. Rates are Deliveroo’s branch rates; they are not averaged across branches. Refunds are not included yet.</p>`;
 doBind();doBindChart();refreshState.querySelector('span:last-child').textContent='Deliveroo daily Operations · '+health;
}
function doBind(){document.getElementById('doRefresh')?.addEventListener('click',()=>renderDeliverooOperations(true));for(const b of main.querySelectorAll('[data-do-days]'))b.onclick=()=>{deliverooOperationsState.days=Number(b.dataset.doDays);deliverooOperationsState.cache=null;renderDeliverooOperations(true);};for(const [id,key]of [['doBrand','brand'],['doBranch','branch']])document.getElementById(id)?.addEventListener('change',e=>{deliverooOperationsState[key]=e.target.value;paintDeliverooOperations();});for(const b of main.querySelectorAll('[data-do-branch]'))b.onclick=()=>{deliverooOperationsState.branch=b.dataset.doBranch;paintDeliverooOperations();};}
function doBindChart(){
 const stage=main.querySelector('.do-chart-stage');if(!stage)return;
 const tip=stage.querySelector('.do-tooltip'),line=stage.querySelector('.do-crosshair');
 const show=index=>{const p=deliverooOperationsState.chartPoints[index];if(!p)return;tip.replaceChildren();const title=document.createElement('strong');title.textContent=p.day;tip.append(title);['Your prep','Zone prep','Wait past target'].forEach((label,k)=>{const item=document.createElement('div');item.textContent=label+': '+doDuration(p.values[k]);tip.append(item);});tip.hidden=false;line.removeAttribute('hidden');const W=deliverooOperationsState.chartWidth,x=58+index*(W-100)/(deliverooOperationsState.chartPoints.length-1);line.setAttribute('x1',x);line.setAttribute('x2',x);const svg=stage.querySelector('svg'),point=svg.createSVGPoint();point.x=x;const screen=point.matrixTransform(svg.getScreenCTM());tip.style.left=Math.min(Math.max(0,screen.x-stage.getBoundingClientRect().left-tip.offsetWidth/2),Math.max(0,stage.clientWidth-tip.offsetWidth))+'px';};
 for(const hit of stage.querySelectorAll('[data-do-day]')){const index=Number(hit.dataset.doDay);hit.addEventListener('pointerenter',()=>show(index));hit.addEventListener('focus',()=>show(index));hit.addEventListener('click',()=>show(index));hit.addEventListener('keydown',e=>{if(e.key==='Escape'){tip.hidden=true;line.setAttribute('hidden','');}if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();stage.querySelector(`[data-do-day="${Math.max(0,Math.min(deliverooOperationsState.chartPoints.length-1,index+(e.key==='ArrowRight'?1:-1)))}"]`)?.focus();}});}
 stage.addEventListener('pointerleave',e=>{if(e.pointerType==='mouse'){tip.hidden=true;line.setAttribute('hidden','');}});
}
async function renderDeliverooOperations(force=false){
 const days=deliverooOperationsState.days;
 if(deliverooOperationsState.pendingDays===days)return;
 const token=++deliverooOperationsState.request;
 const preserve=deliverooOperationsState.cache?.state==='SUCCESS'&&main.dataset.doPeriod===String(days)&&!!main.querySelector('#doRefresh');
 if(force||!deliverooOperationsState.cache||Date.now()-deliverooOperationsState.checkedAt>300000){
  deliverooOperationsState.pendingDays=days;deliverooOperationsState.pendingToken=token;
  if(preserve){const button=document.getElementById('doRefresh');button.disabled=true;button.textContent='Updating…';}else main.innerHTML='<section class="loading-card">Loading Deliveroo Operations…</section>';
  try{
   const data=await api('/api/dashboard/performance/latest?dataset=deliveroo-operations&days='+days);
   if(token!==deliverooOperationsState.request||state.tab!=='deliveroo-operations'||days!==deliverooOperationsState.days)return;
   if(preserve&&data.state!=='SUCCESS')throw Error('READ_FAILED');
   const unchanged=JSON.stringify(data)===JSON.stringify(deliverooOperationsState.cache);
   deliverooOperationsState.cache=data;deliverooOperationsState.checkedAt=Date.now();
   if(preserve&&unchanged)return;
  }catch{
   if(token!==deliverooOperationsState.request||state.tab!=='deliveroo-operations')return;
   if(preserve){refreshState.querySelector('span:last-child').textContent='Update failed · showing saved Operations';return;}
   deliverooOperationsState.cache={state:'ERROR'};
  }finally{
   if(deliverooOperationsState.pendingToken===token)deliverooOperationsState.pendingDays=null;
   if(token===deliverooOperationsState.request&&state.tab==='deliveroo-operations'){const button=document.getElementById('doRefresh');if(button){button.disabled=false;button.textContent='Refresh saved data';}}
  }
 }
 if(state.tab==='deliveroo-operations'){
  const x=window.scrollX,y=window.scrollY,focus=document.activeElement?.id;
  const open=[...main.querySelectorAll('details')].map(d=>d.open),scroll=[...main.querySelectorAll('.table-wrap')].map(d=>d.scrollLeft);
  paintDeliverooOperations();
  if(preserve){main.querySelectorAll('details').forEach((d,i)=>d.open=!!open[i]);main.querySelectorAll('.table-wrap').forEach((d,i)=>d.scrollLeft=scroll[i]||0);if(focus)document.getElementById(focus)?.focus({preventScroll:true});window.scrollTo(x,y);}
 }
}
