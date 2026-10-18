/* Shared visual presentation. Receives only the authorized rows already loaded by each page. */
(() => {
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0?v:null;
 const fmt=v=>v===null?'Unavailable':new Intl.NumberFormat('en-US',{maximumFractionDigits:2}).format(v);
 function comparison(config){
  if(!config.rows?.length||!config.metrics?.length)return '';
  return `<section class="frb-chart" data-frb-chart="${esc(JSON.stringify(config))}"></section>`;
 }
 function chartBody(config,key,expanded=false){
  const metric=config.metrics.find(m=>m.key===key)||config.metrics[0],unit=metric.unit||'';
  let rows=config.rows.map(r=>({...r,value:number(r[metric.key]),previous:metric.previous?number(r[metric.previous]):null}));
  if(config.rank!==false)rows.sort((a,b)=>(b.value??-Infinity)-(a.value??-Infinity)||String(a.label).localeCompare(String(b.label)));
  const max=Math.max(1,...rows.flatMap(r=>[r.value??0,r.previous??0])),shown=expanded?rows:rows.slice(0,6),unknown=rows.filter(r=>r.value===null).length;
  const bars=shown.map((r,i)=>`<div class="frb-chart-row"><div class="frb-chart-row-head"><span><small>${config.rank===false?'':String(i+1).padStart(2,'0')}</small>${esc(r.label)}</span><strong>${esc(fmt(r.value))}${r.value!==null&&unit?' <small>'+esc(unit)+'</small>':''}</strong></div><svg viewBox="0 0 1000 ${metric.previous?22:12}" preserveAspectRatio="none" aria-hidden="true"><rect class="frb-bar-track" width="1000" height="${metric.previous?22:12}" rx="6"/>${r.value===null?'':`<rect class="frb-bar-current" width="${r.value/max*1000}" height="${metric.previous?10:12}" rx="5"/>`}${metric.previous&&r.previous!==null?`<rect class="frb-bar-previous" y="13" width="${r.previous/max*1000}" height="7" rx="3.5"/>`:''}</svg>${metric.previous?`<small class="frb-previous-value">Previous: ${esc(fmt(r.previous))}${r.previous!==null?' '+esc(unit):''}</small>`:''}</div>`).join('');
  return `<header><div><span class="frb-chart-eyebrow">${esc(config.eyebrow||(config.rank===false?'SOURCE STAGES':'BRANCH COMPARISON'))}</span><h3>${esc(config.title)}</h3><p>${esc(config.period||'Selected saved period')} · ${config.rank===false?'source order':'sorted by selected metric'}</p></div>${config.metrics.length>1?`<label>Metric<select class="input" data-frb-chart-metric>${config.metrics.map(m=>`<option value="${esc(m.key)}" ${m.key===metric.key?'selected':''}>${esc(m.label)}${m.unit?' · '+esc(m.unit):''}</option>`).join('')}</select></label>`:`<span class="frb-chart-unit">${esc(metric.label)}${unit?' · '+esc(unit):''}</span>`}</header>${metric.previous?'<div class="frb-chart-legend"><span>Current</span><span>Previous equal-length period</span></div>':''}<div class="frb-chart-bars" role="group" aria-label="${esc(metric.label)} by ${esc(config.category||(config.rank===false?'stage':'branch'))}">${bars}</div><footer><p>${esc(config.note||'Values follow the current page filters.')} ${unknown?esc(unknown)+' unavailable; missing values are not zero.':''}</p>${rows.length>6?`<button class="tab" data-frb-chart-more aria-expanded="${expanded}">${expanded?'Show top 6':'Show all '+rows.length}</button>`:''}</footer><details class="frb-chart-values"><summary>Exact values · ${esc(metric.label)}</summary><div class="table-wrap"><table><thead><tr><th>${esc(config.category||(config.rank===false?'Stage':'Branch'))}</th><th>${esc(metric.label)}${unit?' · '+esc(unit):''}</th>${metric.previous?'<th>Previous</th>':''}</tr></thead><tbody>${rows.map(r=>`<tr><td>${esc(r.label)}</td><td>${esc(fmt(r.value))}</td>${metric.previous?'<td>'+esc(fmt(r.previous))+'</td>':''}</tr>`).join('')}</tbody></table></div></details>`;
 }
 const pageCopy={growth:'A closer look at the branches behind the change.',performance:'Sales, service and visibility, brought into focus.','keeta-performance':'Your branches. A clearer picture of performance.','noon-performance':'From sales patterns to the details that matter.','deliveroo-operations':'A clearer view of preparation, service and rider wait.','talabat-reviews':'Every review, with the order behind it.',talabat:'Every branch, with its rating in focus.',keeta:'Every branch, with its rating in focus.',noon:'Every branch, with its rating in focus.',deliveroo:'Every branch, with its rating in focus.',careem:'Your platform workspace.'};
 function decorate(container){
  const page=document.body.dataset.frbPage;
  const heading=container.querySelector(':scope > .page-heading');
  if(heading&&page!=='overview'&&!heading.classList.contains('frb-section-hero')){
   heading.classList.add('frb-section-hero');
   let copy=heading.querySelector(':scope > div:not(.ratings-freshness):not(.review-buttons)');
   if(!copy){copy=document.createElement('div');const title=heading.querySelector('h2');if(title){heading.prepend(copy);copy.append(title);}}
   if(copy){if(!copy.querySelector('.perf-eyebrow,.gr-eyebrow')){const eyebrow=document.createElement('span');eyebrow.className='frb-section-eyebrow';eyebrow.textContent='FRB · '+(page||'workspace').replaceAll('-',' ').toUpperCase();copy.prepend(eyebrow);}const caption=document.createElement('p');caption.className='frb-section-caption';caption.textContent=pageCopy[page]||'Your portfolio, brought into focus.';copy.append(caption);}
   if(container.firstElementChild!==heading)container.prepend(heading);
  }
  const noonDates=container.querySelector('.np-date-controls'),noonBrand=container.querySelector('#npBrand');
  if(noonDates&&noonBrand&&!noonDates.contains(noonBrand)){const filters=noonBrand.closest('.perf-controls');if(filters){filters.classList.add('np-inline-brand');noonDates.append(filters);}}
  const operationSummary=container.querySelector('.frb-operation-summary'),complaints=container.querySelector('.np-complaints');
  if(operationSummary&&complaints&&!operationSummary.contains(complaints))operationSummary.prepend(complaints);
  polishRows();
  for(const chart of container.querySelectorAll('[data-frb-chart]')){
   if(chart.dataset.frbBound)continue;chart.dataset.frbBound='true';
   try{const config=JSON.parse(chart.dataset.frbChart);let key=config.metrics[0].key,expanded=false;
    const paint=()=>{chart.innerHTML=chartBody(config,key,expanded);chart.querySelector('[data-frb-chart-metric]')?.addEventListener('change',e=>{key=e.target.value;paint();chart.querySelector('select')?.focus();});chart.querySelector('[data-frb-chart-more]')?.addEventListener('click',()=>{expanded=!expanded;paint();chart.querySelector('[data-frb-chart-more]')?.focus();});};paint();
   }catch{chart.textContent='Chart unavailable. Exact source values remain available in the report.';}
  }
 }
 function composition({title,rows,denominator,period}){
  const valid=rows.length>0&&rows.every(r=>number(r.value)!==null),total=valid?rows.reduce((n,r)=>n+r.value,0):null;
  if(total===null||total<=0)return `<section class="np-panel frb-composition"><header><h3>${esc(title)}</h3></header><p class="perf-note">${total===0?'No orders reported for these meal times.':'Meal-time source values are unavailable.'}</p></section>`;
  let offset=0;const circumference=2*Math.PI*54;
  const segments=rows.map((r,i)=>{const length=r.value/total*circumference,part=`<circle class="frb-slice frb-slice-${i%5}" cx="80" cy="80" r="54" stroke-dasharray="${length} ${circumference-length}" stroke-dashoffset="${-offset}"/>`;offset+=length;return part;}).join('');
  return `<section class="np-panel frb-composition"><header><div><span class="frb-chart-eyebrow">ORDER MIX</span><h3>${esc(title)}</h3></div></header><div class="frb-composition-content"><svg viewBox="0 0 160 160" role="img" aria-label="${esc(title)}: ${esc(rows.map(r=>r.label+' '+fmt(r.value)+' orders').join(', '))}"><g transform="rotate(-90 80 80)">${segments}</g><text x="80" y="79" text-anchor="middle" class="frb-ring-total">${esc(fmt(total))}</text><text x="80" y="98" text-anchor="middle" class="frb-ring-label">reported orders</text></svg><ul>${rows.map((r,i)=>`<li><span><i class="frb-slice-${i%5}" aria-hidden="true"></i>${esc(r.label)}</span><strong>${esc(fmt(r.value))}</strong><small>${esc(fmt(r.value/total*100))}%</small></li>`).join('')}</ul></div><p class="perf-note">${esc(period||'Selected saved period')} · Share of reported meal-time orders.${denominator!==total?' Meal-time total differs from the selected report total ('+esc(fmt(number(denominator)))+'); missing coverage is not zero.':''}</p></section>`;
 }
 function polishRows(){
  if(!globalThis.FRBBrands)return;
  for(const cell of document.querySelectorAll('.perf-table tbody td:first-child,.gr-table tbody td:first-child,.do-branch-table tbody td:first-child')){
   if(cell.dataset.frbIdentity)continue;cell.dataset.frbIdentity='true';
   const name=cell.querySelector('strong')?.textContent||cell.textContent,asset=FRBBrands.match(name);if(!asset)continue;
   const frame=document.createElement('span');frame.className='frb-row-logo';frame.setAttribute('aria-hidden','true');const img=document.createElement('img');img.src=asset;img.alt='';img.width=31;img.height=31;img.loading='lazy';frame.append(img);cell.classList.add('frb-row-identity');cell.prepend(frame);
  }
 }
 globalThis.FRBVisuals={comparison,chartBody,composition,polishRows};
 const main=document.getElementById('mainContent');
 if(main){new MutationObserver(()=>decorate(main)).observe(main,{childList:true});new MutationObserver(()=>decorate(main)).observe(document.body,{attributes:true,attributeFilter:['data-frb-page']});decorate(main);}
 /* Management pages share the same identity without duplicating their controls. */
 if(document.body.classList.contains('users-page')){
  document.body.classList.add('frb-management');
  const header=document.querySelector('.topbar'),mark=header?.querySelector('.brand-mark'),copy=header?.querySelector('.brand-copy');
  if(mark){const home=document.createElement('a');home.href='/';home.className='frb-management-home';home.setAttribute('aria-label','FRB · Portfolio overview');header.insertBefore(home,mark);home.append(mark);if(copy)home.append(copy);}
 }
})();
