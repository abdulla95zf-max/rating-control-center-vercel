/* Approved FRB visual shell. Keeps the existing authorized readers and controls. */
(() => {
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=value=>new Intl.NumberFormat('en-US').format(value);
 const labels={HEALTHY:'Healthy',ACCEPTABLE:'Acceptable',WARNING:'Warning',CRITICAL:'Critical',UNKNOWN:'Unknown'};
 function overview({counts,total,platforms}){
  const known=Object.entries(labels).map(([key,label])=>({key,label,value:counts[key]??0}));
  const attention=(counts.CRITICAL??0)+(counts.WARNING??0),unknown=counts.UNKNOWN??0;
  const segments=known.filter(s=>s.value>0),sum=segments.reduce((n,s)=>n+s.value,0);let x=0;const available=1000-Math.max(0,segments.length-1)*5;
  const meter=segments.map(s=>{const width=s.value/sum*available;const rect=`<rect x="${x}" y="0" width="${width}" height="10" rx="2" class="frb-meter-${s.key.toLowerCase()}"/>`;x+=width+5;return rect;}).join('');
  const connected=platforms.filter(p=>p.state==='SUCCESS').length;
  const reviewStatus=counts.CRITICAL?'CRITICAL':counts.WARNING?'WARNING':unknown?'UNKNOWN':'';
  const reviewLabel=reviewStatus?'Review '+labels[reviewStatus].toLowerCase():'Review ratings';
  return `<section class="frb-overview-lead" aria-label="Portfolio rating summary"><article class="frb-portfolio-hero"><div class="frb-hero-heading"><span class="frb-eyebrow">Your portfolio, in focus</span><span class="frb-orbit" aria-hidden="true">↗</span></div><h3>A clearer view of every branch.</h3><div class="frb-hero-total"><strong>${fmt(total)}</strong><span>accessible branches<br> <small>Grouped across platform ratings</small></span></div><svg class="frb-rating-meter" viewBox="0 0 1000 10" preserveAspectRatio="none" role="img" aria-label="${esc(known.map(s=>s.label+': '+s.value).join(', '))}">${meter}</svg><div class="frb-hero-legend">${known.map(s=>`<span><i class="frb-meter-${s.key.toLowerCase()}"></i>${s.label} <b>${fmt(s.value)}</b></span>`).join('')}</div><div class="frb-hero-footer"><span>Lowest known rating determines branch status</span><span>${connected} / ${platforms.length} ratings sources successful</span></div></article><article class="frb-attention-card"><span class="frb-eyebrow">Where to look first</span><h3>${!total?'No branch ratings<br> available yet.':attention?fmt(attention)+' branches<br> need a closer look.':unknown?'Check the missing<br> rating evidence.':'Keep the whole<br> picture in view.'}</h3><p>${!total?'Ratings are not available in this view. Check the source status before drawing a conclusion.':attention?'Critical and warning ratings deserve a branch-level check. Open the evidence before choosing an intervention.':unknown?'Some branch ratings remain unknown. Review those gaps before treating the portfolio as clear.':'No branches are currently marked critical or warning in the accessible saved ratings.'}</p><div class="frb-attention-counts"><span><b>${fmt(counts.CRITICAL??0)}</b> Critical</span><span><b>${fmt(counts.WARNING??0)}</b> Warning</span><span><b>${fmt(unknown)}</b> Unknown</span></div><div class="frb-attention-actions"><button type="button" data-status="${reviewStatus}" ${total?'': 'disabled'}>${reviewLabel} <span aria-hidden="true">↗</span></button><a href="#growth" id="frbExploreGrowth">Explore Growth <span aria-hidden="true">→</span></a></div><small>Unknown data is kept separate from healthy ratings.</small></article></section>`;
 }
 const API={overview,sync};globalThis.FRBDesign=API;
 const nav=document.getElementById('platformTabs'),header=document.querySelector('.topbar');
 if(!nav||!header)return;
 document.body.classList.add('frb-design');
 const side=document.createElement('aside');side.className='frb-sidebar';side.id='frbSidebar';side.setAttribute('aria-label','Dashboard navigation');
 const identity=document.createElement('div');identity.className='frb-sidebar-brand';
 const mark=header.querySelector('.brand-mark'),copy=header.querySelector('.brand-copy');if(mark)identity.append(mark);if(copy)identity.append(copy);
 const sideHead=document.createElement('div');sideHead.className='frb-sidebar-head';sideHead.append(identity);const collapse=document.createElement('button');collapse.type='button';collapse.className='frb-collapse';collapse.innerHTML='‹';collapse.setAttribute('aria-label','Collapse navigation');collapse.setAttribute('aria-expanded','true');sideHead.append(collapse);side.append(sideHead);
 const portfolio=document.createElement('div');portfolio.className='frb-workspace';portfolio.innerHTML='<span aria-hidden="true">F</span><div>Restaurant portfolio<small>FRB Control Center</small></div>';side.append(portfolio);
 const label=document.createElement('p');label.className='frb-nav-label';label.textContent='Workspace & platforms';side.append(label);side.append(nav);
 const note=document.createElement('div');note.className='frb-sidebar-note';note.innerHTML='<span aria-hidden="true">✳</span><strong>From numbers<br> to your next move.</strong><p>Ratings, performance and evidence in one place.</p>';side.append(note);
 document.body.prepend(side);
 const skip=document.createElement('a');skip.href='#mainContent';skip.className='frb-skip';skip.textContent='Skip to dashboard content';document.body.prepend(skip);
 const menu=document.createElement('button');menu.type='button';menu.id='frbMenu';menu.className='frb-menu-button';menu.setAttribute('aria-controls','frbSidebar');menu.setAttribute('aria-expanded','false');menu.setAttribute('aria-label','Open navigation');menu.innerHTML='<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16"/></svg>';
 const crumb=document.createElement('div');crumb.className='frb-breadcrumb';crumb.innerHTML='<span>Workspace</span><span aria-hidden="true">/</span><strong id="frbCurrentPage">Overview</strong>';header.prepend(crumb);header.prepend(menu);
 const backdrop=document.createElement('button');backdrop.className='frb-nav-backdrop';backdrop.type='button';backdrop.setAttribute('aria-label','Close navigation');backdrop.tabIndex=-1;document.body.append(backdrop);
 const narrow=()=>globalThis.matchMedia('(max-width: 1000px)').matches;
 function drawer(open){side.inert=narrow()&&!open;document.body.classList.toggle('frb-nav-open',open);menu.setAttribute('aria-expanded',String(open));menu.setAttribute('aria-label',open?'Close navigation':'Open navigation');if(open){collapse.focus();}else if(side.contains(document.activeElement))menu.focus();}
 menu.addEventListener('click',()=>drawer(!document.body.classList.contains('frb-nav-open')));backdrop.addEventListener('click',()=>drawer(false));
 collapse.addEventListener('click',()=>{if(narrow())return drawer(false);const folded=document.body.classList.toggle('frb-nav-folded');collapse.setAttribute('aria-expanded',String(!folded));collapse.setAttribute('aria-label',folded?'Expand navigation':'Collapse navigation');collapse.textContent=folded?'›':'‹';});
 nav.addEventListener('click',event=>{if(event.target.closest('[data-tab]')&&narrow())drawer(false);});
 side.addEventListener('keydown',event=>{if(event.key==='Escape'&&narrow())drawer(false);if(event.key==='Tab'&&narrow()&&document.body.classList.contains('frb-nav-open')){const focusable=[...side.querySelectorAll('button:not([disabled]),a[href]')].filter(e=>e.getClientRects().length),first=focusable[0],last=focusable.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}}});
 globalThis.addEventListener('resize',()=>drawer(false));
 for(const button of nav.querySelectorAll('[data-tab]')){button.title=button.querySelector('.tab-label')?.textContent||button.textContent;button.setAttribute('aria-label',button.title);}
 const overviewIcon=nav.querySelector('[data-tab="overview"] .tab-logo');if(overviewIcon){const icon=document.createElementNS('http://www.w3.org/2000/svg','svg');icon.setAttribute('viewBox','0 0 24 24');icon.setAttribute('class','tab-logo');icon.setAttribute('aria-hidden','true');icon.innerHTML='<g fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></g>';overviewIcon.replaceWith(icon);}
 new MutationObserver(()=>{if(document.body.classList.contains('auth-locked'))drawer(false);}).observe(document.body,{attributes:true,attributeFilter:['class']});
 function sync(tab='overview'){
  if(!document.body.classList.contains('frb-design'))return;
  const parent=['performance','talabat-reviews'].includes(tab)?'talabat':tab.replace(/-(?:performance|operations)$/,'');
  const title=tab==='performance'?'Talabat · Performance':tab==='talabat-reviews'?'Talabat · Reviews':tab==='overview'?'Overview':tab==='growth'?'Growth':tab.split('-').map(s=>s[0].toUpperCase()+s.slice(1)).join(' · ');
  const current=document.getElementById('frbCurrentPage');if(current)current.textContent=title;
  document.body.dataset.frbPage=tab;
  for(const button of nav.querySelectorAll('[data-tab]')){const active=button.dataset.tab===parent;button.classList.toggle('active',active);button.setAttribute('aria-current',active?'page':'false');}
 }
 sync(location.hash.slice(1)||'overview');drawer(false);
})();
