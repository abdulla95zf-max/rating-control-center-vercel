(() => {
 const host=document.getElementById('report'),save=document.getElementById('savePdf');let received=false;
 const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
 const date=value=>{const time=Date.parse(value);return Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(time)+' UAE':'Unavailable';};
 function show(report){
  if(!report||!Array.isArray(report.rows)||report.rows.length>10000||!Array.isArray(report.columns)||report.columns.length<2||report.columns.length>6||!Array.isArray(report.filters))return false;
  if(report.rows.some(r=>typeof r.branch!=='string'||r.branch.length>1000||!Array.isArray(r.values)||r.values.length!==report.columns.length-1||r.values.some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>5))))return false;
  const header=node('header',undefined,'report-header'),intro=node('div',undefined,'report-intro');intro.append(node('h1',report.platform==='portfolio'?'Portfolio':String(report.platform).replace(/^./,c=>c.toUpperCase()),'platform-title platform-'+report.platform),node('p',(report.layout==='locations'?'Ratings by location':'Branch ratings')+(report.filters.includes('CRITICAL')?' · Critical only':''),'subtitle'));const identity=node('div',undefined,'report-identity');const identityLogo=node('img',undefined,'report-control-logo');identityLogo.src='/brand/lockup-light.svg';identityLogo.alt='FRB Control Center';identity.append(identityLogo);header.append(intro,identity);
  const wordmarks={talabat:'talabat-wordmark.png',keeta:'keeta-wordmark.png',noon:'noon-wordmark.png',careem:'careem-wordmark.svg',deliveroo:'deliveroo-wordmark.png'};
  if(wordmarks[report.platform]){const image=node('img',undefined,'report-platform-logo');image.src='/platforms/'+wordmarks[report.platform];image.alt=String(report.platform).replace(/^./,c=>c.toUpperCase());intro.querySelector('h1').replaceChildren(image);image.addEventListener('error',()=>intro.querySelector('h1').replaceChildren(node('span',image.alt)));}
  host.dataset.platform=wordmarks[report.platform]?report.platform:'portfolio';
  const meta=node('p',`Latest observation: ${date(report.observedAt)} · Generated: ${date(report.generatedAt)}`,'report-meta');
  const table=node('table',undefined,'report-table'),thead=node('thead'),heading=node('tr');for(const column of report.columns)heading.append(node('th',String(column.label).slice(0,100)));thead.append(heading);table.append(thead);const body=node('tbody');
  for(const row of report.rows){const tr=node('tr');tr.append(node('td',row.branch,'branch-name'));row.values.forEach((value,i)=>{const td=node('td'),status=value===null?'unknown':row.statuses?.[i]==='CRITICAL'?'critical':row.statuses?.[i]==='WARNING'?'warning':'';td.append(node('span',value===null?'—':value.toFixed(1),'rating-value'+(status?' rating-'+status:'')));tr.append(td);});body.append(tr);}table.append(body);
  let content=table;
  if(report.layout==='locations'){
   content=node('div',undefined,'location-cards');
   for(const card of RatingExports.locationCards(report)){
    const article=node('article',undefined,'location-card');article.append(node('h2',card.location,'location-card-title'));
    for(const row of card.rows){const line=node('div',undefined,'location-brand-row');line.append(node('span',row.brand||row.branch,'location-brand-name'));const values=node('div',undefined,'location-brand-ratings');row.values.forEach((value,i)=>{const cell=node('div',undefined,'location-platform-rating');if(report.columns.length>2)cell.append(node('span',report.columns[i+1].label,'location-platform-name'));const status=value===null?'unknown':row.statuses?.[i]==='CRITICAL'?'critical':row.statuses?.[i]==='WARNING'?'warning':'';cell.append(node('span',value===null?'—':value.toFixed(1),'rating-value'+(status?' rating-'+status:'')));values.append(cell);});line.append(values);article.append(line);}content.append(article);
   }
  }
  const footer=node('footer',undefined,'report-footer');footer.append(node('span','FRB Control Center'),node('span',report.rows.length+' branches · '+(report.platform==='portfolio'?'Portfolio':String(report.platform).replace(/^./,c=>c.toUpperCase()))));
  host.replaceChildren(header,meta,content,footer);host.classList.toggle('portfolio',report.columns.length>2);document.title=`ratings-${String(report.platform).replace(/[^a-z0-9-]/gi,'')}-${String(report.generatedAt).slice(0,10)}`;save.disabled=false;return true;
 }
 save.onclick=()=>window.print();document.getElementById('closeReport').onclick=()=>window.close();
 window.addEventListener('message',event=>{if(received||event.origin!==location.origin||event.source!==window.opener||event.data?.type!=='ratings-print-report')return;if(!show(event.data.report))return;received=true;Promise.all([document.fonts?.ready,...[...host.querySelectorAll('img')].map(img=>img.decode().catch(()=>{}))]).then(()=>window.print());});
 window.opener?.postMessage({type:'ratings-print-ready'},location.origin);
})();
