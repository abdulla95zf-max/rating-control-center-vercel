/* Descriptive medians over already authorized, loaded branch comparisons. No requests. */
(() => {
 const finite=v=>typeof v==='number'&&Number.isFinite(v),number=v=>finite(v)&&v>=0;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>finite(v)?new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(v):'—';
 const pct=v=>finite(v)?(v>0?'+':v<0?'−':'')+fmt(Math.abs(v))+'%':'—';
 const opened=new Set();
 if(typeof document!=='undefined'){
  document.addEventListener('toggle',event=>{const key=event.target?.dataset?.peerDisclosure;if(!key)return;if(event.target.open){if(opened.size>=512)opened.delete(opened.values().next().value);opened.add(key);}else opened.delete(key);},true);
  document.addEventListener('rcc-auth-reset',()=>opened.clear());
 }
 const disclosure=key=>`data-peer-disclosure="${esc(key)}" ${opened.has(key)?'open':''}`;
 const day=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\d$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
 function periodValid(p){return p&&['from','to','previousFrom','previousTo'].every(k=>day(p[k]))&&Date.parse(p.to)-Date.parse(p.from)===6*86400000&&Date.parse(p.previousTo)-Date.parse(p.previousFrom)===6*86400000&&Date.parse(p.from)-Date.parse(p.previousTo)===86400000;}
 const samePeriod=(a,b)=>['from','to','previousFrom','previousTo'].every(k=>a[k]===b[k]);
 function metrics(entry,group,assess){
  const r=entry.row;if(!r||!assess(entry,group.entries).valid||r.eligible!==true||!periodValid(r.period)||typeof r.identity!=='string'||!r.identity)return {reason:'INVALID'};
  if(![r.current?.sales,r.previous?.sales].every(number)||![r.current?.orders,r.previous?.orders].every(n=>Number.isSafeInteger(n)&&n>=0))return {reason:'INVALID'};
  if(Math.min(r.current.orders,r.previous.orders)<20)return {reason:'LOW_SAMPLE'};
  if(r.previous.sales<=0)return {reason:'ZERO_BASELINE'};
  const sales=(r.current.sales/r.previous.sales-1)*100,orders=(r.current.orders/r.previous.orders-1)*100,basket=((r.current.sales/r.current.orders)/(r.previous.sales/r.previous.orders)-1)*100;
  if(![sales,orders,basket].every(finite))return {reason:'INVALID'};
  return {reason:null,value:{sales,orders,basket}};
 }
 function median(values){if(!values.length||!values.every(finite))return null;const sorted=[...values].sort((a,b)=>a-b),mid=Math.floor(sorted.length/2);return sorted.length%2?sorted[mid]:sorted[mid-1]/2+sorted[mid]/2;}
 function compare(selected,groups,platform,assess){
  const excluded={NO_SOURCE:0,CONFLICT:0,OTHER_PERIOD:0,INVALID:0,LOW_SAMPLE:0,ZERO_BASELINE:0},sourceCounts=new Map(),groupCounts=new Map();
  if(typeof selected.brand!=='string'||!selected.brand)return {platform,state:'SUBJECT_UNAVAILABLE',reason:'INVALID',excluded,peers:[]};
  for(const group of groups){groupCounts.set(group.id,(groupCounts.get(group.id)||0)+1);for(const entry of group.entries.filter(e=>e.platform===platform)){const id=entry.row?.identity;if(id)sourceCounts.set(id,(sourceCounts.get(id)||0)+1);}}
  const subjectEntries=selected.entries.filter(e=>e.platform===platform),subject=subjectEntries[0];
  if(!subjectEntries.length)return {platform,state:'SUBJECT_UNAVAILABLE',reason:'INVALID',excluded,peers:[]};
  if(subjectEntries.length>1||groupCounts.get(selected.id)!==1||sourceCounts.get(subject?.row?.identity)>1)return {platform,state:'SUBJECT_UNAVAILABLE',reason:'CONFLICT',excluded,peers:[]};
  const subjectMetrics=metrics(subject,selected,assess);
  if(!subjectMetrics.value)return {platform,state:'SUBJECT_UNAVAILABLE',reason:subjectMetrics.reason,excluded,peers:[]};
  const peers=[];
  for(const group of groups){
   if(group.id===selected.id||group.brand!==selected.brand)continue;
   const entries=group.entries.filter(e=>e.platform===platform);if(!entries.length){excluded.NO_SOURCE++;continue;}
   if(entries.length>1||groupCounts.get(group.id)!==1||sourceCounts.get(entries[0]?.row?.identity)>1){excluded.CONFLICT++;continue;}
   const entry=entries[0],result=metrics(entry,group,assess);if(!result.value){excluded[result.reason]++;continue;}
   if(!samePeriod(subject.row.period,entry.row.period)){excluded.OTHER_PERIOD++;continue;}
   peers.push({id:group.id,name:group.name,...result.value});
  }
  peers.sort((a,b)=>a.name.localeCompare(b.name));
  const common={platform,period:subject.row.period,subject:subjectMetrics.value,excluded,peers};
  if(peers.length<3)return {...common,state:'INSUFFICIENT_PEERS'};
  const medians=Object.fromEntries(['sales','orders','basket'].map(key=>[key,median(peers.map(p=>p[key]))]));
  return {...common,state:'READY',medians,gap:subjectMetrics.value.sales-medians.sales,declining:peers.filter(p=>p.sales<0).length};
 }
 function render(selected,groups,assess,language){
  const fa=language==='fa',t=(en,faText)=>fa?faText:en,platforms=[...new Set(selected.entries.map(e=>e.platform))].filter(p=>['talabat','keeta','noon'].includes(p));
  if(!platforms.length)return '';
  const results=platforms.map(p=>compare(selected,groups,p,assess)),ready=results.filter(r=>r.state==='READY').length;
  const reasons={INVALID:t('Complete eligible comparison unavailable','مقایسهٔ کامل و معتبر موجود نیست'),CONFLICT:t('Source identity conflict','تداخل در هویت منبع'),LOW_SAMPLE:t('Fewer than 20 orders in a period','کمتر از ۲۰ سفارش در یکی از بازه‌ها'),ZERO_BASELINE:t('No positive sales baseline for percentages','مبنای مثبت فروش برای محاسبهٔ درصد وجود ندارد')};
  const gaps=r=>Math.abs(r.gap)<.01?t('Less than 0.01 percentage point from peer median','اختلاف کمتر از ۰٫۰۱ واحد درصد با میانهٔ نمونه'):fmt(Math.abs(r.gap))+' '+t('percentage points '+(r.gap<0?'below':'above')+' peer median',(r.gap<0?'واحد درصد پایین‌تر':'واحد درصد بالاتر')+' از میانهٔ نمونه');
  return `<details class="lp-panel" ${disclosure('branch:'+selected.id)}><summary><strong>${t('Same-brand comparison','مقایسه با شعب هم‌برند')}</strong><span>${ready}/${results.length} ${t('platform comparisons available · authorized scope only','مقایسهٔ پلتفرمی آماده · فقط در محدودهٔ دسترسی شما')}</span></summary><p>${t('Selected branch is excluded from its reference. Each branch has equal weight in the median; this is not total brand growth or a market benchmark.','شعبهٔ انتخاب‌شده از نمونهٔ مرجع کنار گذاشته می‌شود. وزن هر شعبه در میانه برابر است؛ این عدد رشد مجموع برند یا معیار بازار نیست.')}</p>${results.map(r=>`<details class="lp-source" ${disclosure('source:'+selected.id+':'+r.platform)}><summary><strong>${esc(r.platform)}</strong><span>${r.state==='READY'?`${t('Sales','فروش')} <bdi dir="ltr">${pct(r.subject.sales)}</bdi> · ${t('peer median','میانهٔ نمونه')} <bdi dir="ltr">${pct(r.medians.sales)}</bdi> · ${esc(gaps(r))} (${r.peers.length})`:r.state==='SUBJECT_UNAVAILABLE'?esc(reasons[r.reason]||reasons.INVALID):t('At least 3 other comparable authorized branches needed','حداقل ۳ شعبهٔ دیگرِ مجاز و قابل‌مقایسه لازم است')+` (${r.peers.length}/3)`}</span></summary>${r.period?`<p>${t('Current','این دوره')}: <bdi dir="ltr">${esc(r.period.from)} — ${esc(r.period.to)}</bdi> · ${t('Previous','دورهٔ قبل')}: <bdi dir="ltr">${esc(r.period.previousFrom)} — ${esc(r.period.previousTo)}</bdi></p>`:''}${r.state==='READY'?`<dl class="lp-metrics">${[['sales',t('Sales change','تغییر فروش')],['orders',t('Order change','تغییر سفارش')],['basket',t('Average basket change','تغییر میانگین سبد')]].map(([key,label])=>`<div><dt>${label}</dt><dd><bdi dir="ltr">${pct(r.subject[key])}</bdi> · ${t('peer median','میانهٔ نمونه')} <bdi dir="ltr">${pct(r.medians[key])}</bdi></dd></div>`).join('')}</dl><p>${r.declining}/${r.peers.length} ${t('reference branches had lower sales. This describes the sample; it does not establish a shared cause.','شعبهٔ مرجع افت فروش داشته‌اند. این توصیف نمونه است و علت مشترک را ثابت نمی‌کند.')}</p><ul class="lp-peers">${r.peers.map(peer=>`<li><strong>${esc(peer.name)}</strong><span>${t('Sales','فروش')} <bdi dir="ltr">${pct(peer.sales)}</bdi> · ${t('orders','سفارش')} <bdi dir="ltr">${pct(peer.orders)}</bdi> · ${t('basket','سبد')} <bdi dir="ltr">${pct(peer.basket)}</bdi></span></li>`).join('')}</ul>`:`<p>${t('No benchmark is inferred from insufficient or invalid evidence.','از شواهد ناکافی یا نامعتبر، معیار مقایسه ساخته نمی‌شود.')}</p>`}<details ${disclosure('method:'+selected.id+':'+r.platform)}><summary>${t('Cohort limits & exclusions','محدودیت نمونه و موارد کنارگذاشته‌شده')}</summary><p>${t('Only the same brand, platform and exact two periods; at least 20 orders in each period and a positive prior sales baseline. Locations, promotions and branch formats are not controlled. Independent metric medians are not additive. Numbers are rounded; gaps use unrounded values.','فقط برند و پلتفرم یکسان و دو بازهٔ دقیقاً یکسان؛ حداقل ۲۰ سفارش در هر بازه و مبنای مثبت فروش قبلی. تفاوت منطقه، تبلیغات و نوع شعبه کنترل نشده است. میانه‌های شاخص‌ها مستقل‌اند و جمع نمی‌شوند. اعداد گرد شده‌اند؛ اختلاف از مقادیر دقیق محاسبه می‌شود.')}</p><p>${t('Excluded authorized entries','موارد مجازِ کنارگذاشته‌شده')}: ${t('no loaded source','فاقد منبع در دادهٔ بارگذاری‌شده')} ${r.excluded.NO_SOURCE} · ${t('other dates','تاریخ متفاوت')} ${r.excluded.OTHER_PERIOD} · ${t('conflicting source','تداخل منبع')} ${r.excluded.CONFLICT} · ${t('invalid','نامعتبر')} ${r.excluded.INVALID} · ${t('small sample','نمونهٔ کم')} ${r.excluded.LOW_SAMPLE} · ${t('zero sales baseline','مبنای صفر فروش')} ${r.excluded.ZERO_BASELINE}.</p></details></details>`).join('')}</details>`;
 }
 globalThis.LensPeers={compare,render,median};
})();
