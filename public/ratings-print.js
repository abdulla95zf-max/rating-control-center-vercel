(() => {
 const host=document.getElementById('report'),save=document.getElementById('savePdf');let received=false;
 const node=(tag,text,className)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=String(text);if(className)n.className=className;return n;};
 const date=value=>{const time=Date.parse(value);return Number.isFinite(time)?new Intl.DateTimeFormat('en-GB',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Dubai'}).format(time)+' UAE':'Unavailable';};
 function show(report){
  if(!report||!Array.isArray(report.rows)||report.rows.length>10000||!Array.isArray(report.columns)||report.columns.length<2||report.columns.length>6||!Array.isArray(report.filters))return false;
  if(report.rows.some(r=>typeof r.branch!=='string'||r.branch.length>1000||!Array.isArray(r.values)||r.values.length!==report.columns.length-1||r.values.some(v=>v!==null&&(typeof v!=='number'||!Number.isFinite(v)||v<0||v>5))))return false;
  const header=node('header',undefined,'report-header'),intro=node('div',undefined,'report-intro');intro.append(node('h1',report.platform==='portfolio'?'Portfolio':String(report.platform).replace(/^./,c=>c.toUpperCase()),'platform-title platform-'+report.platform),node('p','Branch ratings','subtitle'));const identity=node('div',undefined,'report-identity');identity.append(node('div','RC','report-mark'),node('p','ONLINE RATING\nCONTROL CENTER','eyebrow'));header.append(intro,identity);
  const meta=node('p',`Latest observation: ${date(report.observedAt)} · Generated: ${date(report.generatedAt)}`,'report-meta');
  const table=node('table',undefined,'report-table'),thead=node('thead'),heading=node('tr');for(const column of report.columns)heading.append(node('th',String(column.label).slice(0,100)));thead.append(heading);table.append(thead);const body=node('tbody');
  for(const row of report.rows){const tr=node('tr');tr.append(node('td',row.branch,'branch-name'));row.values.forEach((value,i)=>{const td=node('td'),status=value===null?'unknown':row.statuses?.[i]==='CRITICAL'?'critical':row.statuses?.[i]==='WARNING'?'warning':'';td.append(node('span',value===null?'—':value.toFixed(1),'rating-value'+(status?' rating-'+status:'')));tr.append(td);});body.append(tr);}table.append(body);
  const footer=node('footer',undefined,'report-footer');footer.append(node('span','Rating Control Center'),node('span',report.rows.length+' branches · '+(report.platform==='portfolio'?'Portfolio':String(report.platform).replace(/^./,c=>c.toUpperCase()))));
  host.replaceChildren(header,meta,table,footer);host.classList.toggle('portfolio',report.columns.length>2);document.title=`ratings-${String(report.platform).replace(/[^a-z0-9-]/gi,'')}-${String(report.generatedAt).slice(0,10)}`;save.disabled=false;return true;
 }
 save.onclick=()=>window.print();document.getElementById('closeReport').onclick=()=>window.close();
 window.addEventListener('message',event=>{if(received||event.origin!==location.origin||event.source!==window.opener||event.data?.type!=='ratings-print-report')return;if(!show(event.data.report))return;received=true;Promise.resolve(document.fonts?.ready).then(()=>window.print());});
 window.opener?.postMessage({type:'ratings-print-ready'},location.origin);
})();
