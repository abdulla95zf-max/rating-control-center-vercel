/* Early screening over already authorized, loaded weekly evidence. No requests or storage. */
(() => {
 const number=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 const day=s=>typeof s==='string'&&/^\d{4}-\d\d-\d\d$/.test(s)&&Number.isFinite(Date.parse(s))&&new Date(s).toISOString().slice(0,10)===s;
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const fmt=v=>typeof v==='number'&&Number.isFinite(v)?new Intl.NumberFormat('en',{maximumFractionDigits:2}).format(v):'—';
 const change=drop=>typeof drop==='number'&&Number.isFinite(drop)?(drop>0?'−':drop<0?'+':'')+fmt(Math.abs(drop))+'%':'—';
 const close=(a,b)=>number(a)&&number(b)&&Math.abs(a-b)<1e-6;
 const opened=new Set();
 if(typeof document!=='undefined'){
  document.addEventListener('toggle',event=>{const key=event.target?.dataset?.earlyDisclosure;if(!key)return;if(event.target.open){if(opened.size>=512)opened.delete(opened.values().next().value);opened.add(key);}else opened.delete(key);},true);
  document.addEventListener('rcc-auth-reset',()=>opened.clear());
 }
 const disclosure=key=>`data-early-disclosure="${esc(key)}" ${opened.has(key)?'open':''}`;
 function validWeek(w){return w?.complete===true&&!w.reason&&day(w.from)&&day(w.to)&&Date.parse(w.to)-Date.parse(w.from)===6*86400000&&number(w.sales)&&Number.isSafeInteger(w.orders)&&w.orders>=0&&(w.orders>0||w.sales===0);}
 function decline(weeks,key){let steps=0;for(let i=weeks.length-1;i>0;i--){const before=weeks[i-1][key],after=weeks[i][key];if(before<=0||after>before*.95)break;steps++;}return steps;}
 function screen(entry,assessment){
  const r=entry.row,weeks=r.trend?.weeks;
  if(!assessment.valid||r.eligible!==true||r.trend?.state!=='SUCCESS'||!Array.isArray(weeks)||weeks.length!==4)return {reason:'UNAVAILABLE'};
  const tail=[];for(let i=weeks.length-1;i>=0;i--){const w=weeks[i];if(!validWeek(w))break;if(tail.length&&Date.parse(tail[0].from)-Date.parse(w.to)!==86400000)break;tail.unshift(w);}
  if(tail.length<3)return {reason:'INCOMPLETE'};
  const current=tail.at(-1),prior=tail.at(-2);
  if(current.from!==r.period?.from||current.to!==r.period?.to||prior.from!==r.period?.previousFrom||prior.to!==r.period?.previousTo||!close(current.sales,r.current?.sales)||!close(current.orders,r.current?.orders)||!close(prior.sales,r.previous?.sales)||!close(prior.orders,r.previous?.orders))return {reason:'CONFLICT'};
  if(tail.slice(-3).some(w=>w.orders<20))return {reason:'LOW_SAMPLE'};
  // A low-volume older week cannot strengthen a three-week sample.
  if(tail.length===4&&tail[0].orders<20)tail.shift();
  const salesSteps=decline(tail,'sales'),orderSteps=decline(tail,'orders'),steps=Math.max(salesSteps,orderSteps);
  if(steps<2)return {reason:null};
  const selected=tail.slice(-(steps+1)),first=selected[0],latest=selected.at(-1),salesDrop=first.sales>0?(first.sales-latest.sales)/first.sales*100:null,orderDrop=(first.orders-latest.orders)/first.orders*100;
  if(!(salesSteps>=2&&salesDrop>=10||orderSteps>=2&&orderDrop>=10))return {reason:null};
  const oldBasket=prior.sales/prior.orders,basket=current.sales/current.orders,orderEffect=(current.orders-prior.orders)*(basket+oldBasket)/2,basketEffect=(basket-oldBasket)*(current.orders+prior.orders)/2;
  if(!Number.isFinite(orderEffect)||!Number.isFinite(basketEffect))return {reason:'CONFLICT'};
  return {reason:null,item:{row:r,weeks:selected,steps,salesSteps,orderSteps,salesDrop,orderDrop,loss:Math.max(0,prior.sales-current.sales),orderEffect,basketEffect,minOrders:Math.min(...selected.map(w=>w.orders))}};
 }
 function collect(groups,assess){
  const periods=new Map(),excluded={UNAVAILABLE:0,INCOMPLETE:0,CONFLICT:0,LOW_SAMPLE:0};let inspected=0;
  for(const group of groups)for(const entry of group.entries){
   if(!['talabat','keeta','noon'].includes(entry.platform))continue;inspected++;
   if(group.entries.filter(e=>e.platform===entry.platform).length!==1){excluded.CONFLICT++;continue;}
   const result=screen(entry,assess(entry,group.entries));if(result.reason){excluded[result.reason]++;continue;}if(!result.item)continue;
   const key=JSON.stringify([entry.platform,entry.row.period.from,entry.row.period.to]);
   if(!periods.has(key))periods.set(key,{key,platform:entry.platform,period:entry.row.period,rows:[]});
   periods.get(key).rows.push({...result.item,id:group.id,name:group.name,group,entry});
  }
  for(const period of periods.values())period.rows.sort((a,b)=>b.loss-a.loss||b.weeks.length-a.weeks.length||b.minOrders-a.minOrders||a.name.localeCompare(b.name));
  return {periods:[...periods.values()].sort((a,b)=>a.platform.localeCompare(b.platform)||b.period.to.localeCompare(a.period.to)),excluded,inspected};
 }
 function context(item,language,ratingsFor){
  const fa=language==='fa',t=(en,faText)=>fa?faText:en,r=item.row,d=r.diagnostics,p=r.period;
  const matched=d?.matched===true&&['from','to','previousFrom','previousTo'].every(k=>d.period?.[k]===p[k]),lines=[];
  if(matched){
   const visits=(d.funnel?.stages||[]).filter(m=>['visitors','menuViews'].includes(m.code));
   if(visits.length===1&&number(visits[0].current)&&number(visits[0].previous))lines.push({label:t('Store/menu visits','بازدید فروشگاه/منو'),previous:visits[0].previous,current:visits[0].current,unit:t(d.funnel.kind==='customers'?'customers':'events',d.funnel.kind==='customers'?'مشتری':'رویداد'),percent:false});
   const offline=(d.operations||[]).filter(m=>m.code==='offline'&&m.unit==='percent');
   if(offline.length===1&&number(offline[0].current)&&number(offline[0].previous)&&offline[0].current<=100&&offline[0].previous<=100)lines.push({label:t('Unavailable share','سهم عدم دسترسی'),previous:offline[0].previous,current:offline[0].current,unit:'',percent:true});
  }
  const ratings=typeof ratingsFor==='function'?ratingsFor(item.group).filter(r=>r.platform===item.entry.platform):[],rating=ratings.length===1?ratings[0]:null;
  const ratingText=rating&&number(rating.rating)&&rating.rating<=5&&Number.isFinite(Date.parse(rating.timestamp))?`${t('Independent latest rating snapshot','آخرین امتیاز؛ مشاهدهٔ مستقل')}: ${fmt(rating.rating)} / 5 · ${rating.timestamp}${number(rating.previousRating)&&rating.previousRating<=5&&Number.isFinite(Date.parse(rating.previousTimestamp))?' · '+t('previous saved snapshot','مشاهدهٔ ذخیره‌شدهٔ قبل')+': '+fmt(rating.previousRating)+' / 5 · '+rating.previousTimestamp:''}`:t('No authorized dated rating snapshot for this platform.','مشاهدهٔ تاریخ‌دار و مجازِ امتیاز این پلتفرم در دسترس نیست.');
  return `<p>${t('Context below compares only the latest two weeks','زمینهٔ زیر فقط مقایسهٔ دو هفتهٔ آخر است')}: <bdi>${esc(p.previousFrom)} — ${esc(p.previousTo)}</bdi> / <bdi>${esc(p.from)} — ${esc(p.to)}</bdi>.</p><ul>${lines.length?lines.map(l=>`<li>${esc(l.label)}: <bdi dir="ltr">${fmt(l.previous)}${l.percent?'%':'} → ${fmt(l.current)}${l.percent?'%':'}</bdi> ${esc(l.unit)}</li>`).join(''):'<li>'+t('Matched visits/availability context is unavailable.','زمینهٔ هم‌بازهٔ بازدید/دسترس‌پذیری موجود نیست.')+'</li>'}</ul><p dir="auto">${esc(ratingText)}</p>`;
 }
 function render(groups,assess,language,ratingsFor){
  const fa=language==='fa',t=(en,faText)=>fa?faText:en,data=collect(groups,assess),count=data.periods.reduce((n,p)=>n+p.rows.length,0);
  const pattern=item=>item.salesSteps===item.steps?(item.orderSteps===item.steps?t('Sales & orders','فروش و سفارش'):t('Sales','فروش')):t('Orders','سفارش');
  const row=item=>`<li class="le-row"><div><strong>${esc(item.name)}</strong><p>${esc(pattern(item))} · ${item.steps} ${t('consecutive weekly declines','افت هفتگی پیاپی')}</p><p>${t('Across','تغییر در')} ${item.weeks.length} ${t('displayed weeks','هفتهٔ نمایش‌داده‌شده')} · ${t('Sales','فروش')} <bdi>${change(item.salesDrop)}</bdi> · ${t('Orders','سفارش')} <bdi>${change(item.orderDrop)}</bdi></p></div><div><bdi>${item.loss>0?'−'+fmt(item.loss)+' AED':t('No latest-week sales decline','فروش هفتهٔ آخر افت نکرده')}</bdi><button type="button" aria-label="${esc(t('Inspect branch','بررسی شعبه')+' · '+item.name+' · '+item.entry.platform)}" data-lens-priority="${esc(item.id)}">${t('Inspect branch','بررسی شعبه')} ↗</button></div><details ${disclosure('row:'+item.entry.platform+':'+item.id)}><summary>${t('Weeks, components & context','هفته‌ها، اجزای تغییر و شواهد همراه')}</summary><ul>${item.weeks.map(w=>`<li><bdi>${esc(w.from)} — ${esc(w.to)}</bdi> · <bdi>${fmt(w.sales)} AED</bdi> · ${fmt(w.orders)} ${t('orders','سفارش')} · ${t('basket','سبد')} <bdi>${fmt(w.sales/w.orders)} AED</bdi></li>`).join('')}</ul><p>${t('Latest weekly mathematical components','اجزای ریاضیِ تغییر فروش در هفتهٔ آخر')}: ${t('orders','سفارش')} <bdi>${fmt(item.orderEffect)} AED</bdi> · ${t('basket','سبد')} <bdi>${fmt(item.basketEffect)} AED</bdi>. ${t('These reconcile to sales change; they are not proven causes.','جمع این دو با تغییر فروش برابر است؛ علت قطعی محسوب نمی‌شوند.')}</p>${context(item,language,ratingsFor)}</details></li>`;
  return `<section class="le-panel"><header><span class="lt-note">${t('MULTI-WEEK SCREEN','پایش چند‌هفته‌ای')}</span><h3>${t('Early attention','توجه زودهنگام')} · ${count}</h3><p>${t('Two or more weekly steps down at least 5% each, at least 10% overall; minimum 20 orders in every included week. Not a statistical or causal test.','حداقل دو گام هفتگیِ نزولی با افت حداقل ۵٪ در هر گام و ۱۰٪ در مجموع؛ حداقل ۲۰ سفارش در هر هفتهٔ بررسی‌شده. این غربالگری، آزمون آماری یا علت‌یابی قطعی نیست.')}</p></header>${data.periods.map(p=>`<details ${disclosure('platform:'+p.key)}><summary><strong>${esc(p.platform)} · ${p.rows.length}</strong><span><bdi>${esc(p.period.from)} — ${esc(p.period.to)}</bdi> · ${t('largest latest-week decline','بیشترین افت هفتهٔ آخر')}: <bdi>${fmt(p.rows[0].loss)} AED</bdi></span></summary><ol>${p.rows.slice(0,3).map(row).join('')}</ol>${p.rows.length>3?`<details ${disclosure('more:'+p.key)}><summary>${t('All candidates','همهٔ موارد')} (${p.rows.length})</summary><ol start="4">${p.rows.slice(3).map(row).join('')}</ol></details>`:''}</details>`).join('')||`<p class="lt-note">${t('No qualifying repeated decline in the available evidence. Check exclusions before interpreting this as normal trading.','در شواهد موجود افت پیاپیِ واجد شرایط دیده نشد. پیش از برداشتِ وضعیت عادی، موارد کنارگذاشته‌شده را بررسی کنید.')}</p>`}<details ${disclosure('coverage')}><summary>${t('Coverage & ranking','پوشش و ترتیب اولویت')}</summary><p>${data.inspected} ${t('source/branch entries screened','مورد شعبه/پلتفرم بررسی شد')} · ${data.excluded.INCOMPLETE} ${t('incomplete history','سابقهٔ ناقص')} · ${data.excluded.LOW_SAMPLE} ${t('small samples','نمونهٔ کم')} · ${data.excluded.UNAVAILABLE} ${t('unavailable comparison/history','مقایسه/سابقهٔ ناموجود')} · ${data.excluded.CONFLICT} ${t('conflicting evidence','شواهد متناقض')}.</p><p>${t('Ranking uses the latest weekly sales decline in AED within each platform and identical dates, then complete weeks and sample size. Platforms are never pooled. Deliveroo sales are not collected; this sales screen does not cover it. Weekly screening complements the daily emergency monitor.','ترتیب بر اساس مبلغ افت فروشِ هفتهٔ آخر در هر پلتفرم و تاریخ یکسان است؛ سپس تعداد هفته‌های کامل و حجم نمونه. پلتفرم‌ها تجمیع نمی‌شوند. فروش دلیورو جمع‌آوری نمی‌شود و در این پایش فروش پوشش ندارد. این بخش مکمل پایش اضطراری روزانه است.')}</p></details></section>`;
 }
 globalThis.LensEarlyWarnings={collect,screen,render};
})();
