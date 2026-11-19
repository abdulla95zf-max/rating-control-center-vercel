/* Groups only already-authorized saved rows. No fetching or pooled platform metrics. */
(() => {
 const signals={OFFLINE:'Availability weakened',CANCELLATIONS:'Cancellations / rejections increased',VISITS:'Store visits fell',VISIBILITY:'Store exposure fell',ORDERING:'Reported ordering / visit ratio weakened'};
 const checks={OFFLINE:'Check shared store hours and availability settings.',CANCELLATIONS:'Review rejection/cancellation reasons and shared operational settings.',VISITS:'Check shared visibility, opening hours and advertising exposure.',VISIBILITY:'Check shared listing visibility and advertising settings.',ORDERING:'Check shared menu visibility, unavailable items, prices and the customer ordering flow.'};
 const day=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 function analyze(rows){
  const identified=rows.filter(r=>typeof r.branchKey==='string'&&r.branchKey&&typeof r.brand==='string'&&r.brand&&['talabat','keeta','noon','deliveroo'].includes(r.platform));
  const unique=new Map();for(const r of identified){const key=JSON.stringify([r.branchKey,r.platform]);unique.set(key,(unique.get(key)||0)+1);}
  const safe=identified.filter(r=>unique.get(JSON.stringify([r.branchKey,r.platform]))===1),buckets=new Map();
  for(const r of safe){if(!day(r.asOf))continue;const id=JSON.stringify([r.brand,r.platform,r.asOf]);if(!buckets.has(id))buckets.set(id,[]);buckets.get(id).push(r);}
  const groups=[];
  for(const [key,bucket] of buckets){
   const eligible=bucket.filter(r=>['EMERGENCY','NORMAL'].includes(r.state)&&Number.isSafeInteger(r.currentOrders)&&r.currentOrders>=0&&Number.isFinite(r.baselineAverage)&&r.baselineAverage>=4.5);
   const affected=eligible.filter(r=>r.state==='EMERGENCY');if(affected.length<2||affected.length*2<eligible.length)continue;
   const {brand,platform,asOf}=affected[0],sameScope=rows.filter(r=>r.brand===brand&&r.platform===platform);
   const common=Object.keys(signals).map(code=>({code,count:affected.filter(r=>{
    const d=r.diagnosis;return d?.state==='EVIDENCE'&&d.date===asOf&&d.baselineFrom===r.baselineFrom&&d.baselineTo===r.baselineTo&&[d.primary,...(d.supporting||[])].some(s=>s?.code===code);
   }).length})).filter(s=>s.count>=2&&s.count*2>=affected.length).sort((a,b)=>b.count-a.count||Object.keys(signals).indexOf(a.code)-Object.keys(signals).indexOf(b.code));
   const branches=new Set(affected.map(r=>r.branchKey));
   const otherPlatforms=[...new Set(safe.filter(r=>r.brand===brand&&r.platform!==platform&&r.asOf===asOf&&r.state==='EMERGENCY'&&branches.has(r.branchKey)).map(r=>r.platform))].sort();
   groups.push({key,brand,platform,date:asOf,affected:affected.map(r=>({key:r.key,name:r.name,branchKey:r.branchKey,startDate:r.startDate,baselineFrom:r.baselineFrom,baselineTo:r.baselineTo})),eligible:eligible.length,excluded:sameScope.length-eligible.length,common,otherPlatforms});
  }
  return groups.sort((a,b)=>b.affected.length-a.affected.length||a.brand.localeCompare(b.brand)||a.platform.localeCompare(b.platform)||b.date.localeCompare(a.date));
 }
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(groups,brand,platform,expanded){
  const visible=groups.filter(g=>(!brand||g.brand===brand)&&(!platform||g.platform===platform));
  return visible.length?`<div class="emergency-groups">${visible.map(g=>{const id='group:'+g.key;return `<details data-emergency-detail="${esc(id)}" ${expanded.has(id)?'open':''}><summary data-emergency-focus="${esc(id)}"><strong>${esc(g.brand)} · ${g.affected.length}/${g.eligible} assessed branches have urgent drops</strong><span>${esc(g.platform)} · <bdi>${esc(g.date)}</bdi></span></summary><div class="emergency-group-detail"><p>Coinciding order drops, not proof of a shared cause. Counts cover your authorized branches on this platform and report day; ${g.excluded} other source rows are excluded because of low volume, incomplete evidence, another report date or ambiguous identity.</p>${g.common.length?`<ul>${g.common.map(s=>`<li><strong>${esc(signals[s.code])} · ${s.count}/${g.affected.length} affected branches</strong><p>${esc(checks[s.code])}</p></li>`).join('')}</ul>`:'<p>No repeated measured signal meets the shared-evidence screen. Check common menu and availability settings before inferring a shared cause.</p>'}<p>${g.otherPlatforms.length?`Urgent drops are also confirmed for at least one of these same branches on ${g.otherPlatforms.map(esc).join(', ')} for this date. Platform totals remain separate.`:'No same-day urgent drop is confirmed on another authorized platform for these branches. Missing evidence does not establish that the issue is confined to this platform.'}</p><ul>${g.affected.map(r=>`<li>${esc(r.name)} · incident started <bdi>${esc(r.startDate||'unverified')}</bdi> · baseline <bdi>${esc(r.baselineFrom)} — ${esc(r.baselineTo)}</bdi></li>`).join('')}</ul><p>Individual measurements and checks remain in the branch rows below.</p></div></details>`;}).join('')}</div>`:'';
 }
 globalThis.EmergencyGroups={analyze,render};
})();
