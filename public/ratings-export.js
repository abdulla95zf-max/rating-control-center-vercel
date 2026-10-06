/* Local exports contain only the already-authorized, visible table rows. No API calls. */
(() => {
 const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g,'');
 const rating=value=>value!==null&&value!==undefined&&value!==''&&Number.isFinite(Number(value))&&Number(value)>=0&&Number(value)<=5?Number(value):null;
 const platformName=value=>String(value).replace(/^./,c=>c.toUpperCase());
 function fromGroups(groups,{platform=null,brand='',location='',status='',search='',generatedAt=new Date().toISOString()}={}){
  const platforms=platform?[platform]:['talabat','keeta','noon','careem','deliveroo'].filter(id=>groups.some(g=>g.rows.some(r=>r.platform===id)));
  const columns=[{key:'branch',label:'Brand / branch'},...platforms.map(id=>({key:id,label:platform?'Rating':platformName(id)}))];
  const rows=groups.map(g=>({branch:g.displayName,brand:g.brand||g.displayName.split(' — ')[0],location:g.branch||g.displayName.split(' — ').slice(1).join(' — '),values:platforms.map(id=>rating(g.rows.find(r=>r.platform===id)?.rating)),statuses:platforms.map(id=>g.rows.find(r=>r.platform===id)?.status||'UNKNOWN')}));
  const dates=groups.flatMap(g=>g.rows.map(r=>r.timestamp)).filter(v=>typeof v==='string'&&Number.isFinite(Date.parse(v))).sort((a,b)=>Date.parse(a)-Date.parse(b));
  return {title:'Branch ratings',subtitle:platform?platformName(platform)+' · Latest saved ratings':'Portfolio · Latest saved ratings',platform:platform||'portfolio',columns,rows,filters:[brand||'All brands',status||'All statuses',...(location?['Location: '+location]:[]),...(search?['Search: '+search]:[])],generatedAt,observedAt:dates.at(-1)||null};
 }
 function locationCards(report){
  const locations=new Map();
  const lowest=row=>{const values=row.values.filter(value=>value!==null);return values.length?Math.min(...values):Infinity;};
  for(const row of report.rows){const location=row.location||'Unspecified location';if(!locations.has(location))locations.set(location,[]);locations.get(location).push({...row});}
  return [...locations].map(([location,rows])=>({location,rows:rows.sort((a,b)=>lowest(a)-lowest(b)||(a.brand||a.branch).localeCompare(b.brand||b.branch))})).sort((a,b)=>Math.min(...a.rows.map(lowest))-Math.min(...b.rows.map(lowest))||a.location.localeCompare(b.location));
 }
 const encoder=new TextEncoder(),bytes=text=>encoder.encode(text);
 const crcTable=Array.from({length:256},(_,n)=>{for(let k=0;k<8;k++)n=(n&1)?0xedb88320^(n>>>1):n>>>1;return n>>>0;});
 const crc32=data=>{let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&255]^(c>>>8);return (c^0xffffffff)>>>0;};
 function zip(entries){
  const parts=[],directory=[];let offset=0,centralSize=0;
  for(const [name,text] of entries){const filename=bytes(name),data=bytes(text),crc=crc32(data),local=new Uint8Array(30+filename.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint16(6,0x800,true);v.setUint16(12,33,true);v.setUint32(14,crc,true);v.setUint32(18,data.length,true);v.setUint32(22,data.length,true);v.setUint16(26,filename.length,true);local.set(filename,30);parts.push(local,data);
   const central=new Uint8Array(46+filename.length),d=new DataView(central.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint16(8,0x800,true);d.setUint16(14,33,true);d.setUint32(16,crc,true);d.setUint32(20,data.length,true);d.setUint32(24,data.length,true);d.setUint16(28,filename.length,true);d.setUint32(42,offset,true);central.set(filename,46);directory.push(central);centralSize+=central.length;offset+=local.length+data.length;
  }
  const end=new Uint8Array(22),e=new DataView(end.buffer);e.setUint32(0,0x06054b50,true);e.setUint16(8,entries.length,true);e.setUint16(10,entries.length,true);e.setUint32(12,centralSize,true);e.setUint32(16,offset,true);
  const result=new Uint8Array(offset+centralSize+end.length);let at=0;for(const part of [...parts,...directory,end]){result.set(part,at);at+=part.length;}return result;
 }
 const col=index=>{let s='';for(let n=index+1;n>0;n=Math.floor((n-1)/26))s=String.fromCharCode(65+(n-1)%26)+s;return s;};
 const textCell=(ref,value,style)=>`<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
 function excel(report){
  report={...report,columns:[{key:'brand',label:'Brand'},{key:'location',label:'Location'},...report.columns.slice(1)]};
  const last=col(report.columns.length-1),count=report.rows.length,end=count+6;
  const headerRows=[report.title,report.subtitle,report.filters.join(' · '),`As of ${report.observedAt?new Date(report.observedAt).toISOString().replace('T',' ').slice(0,16)+' UTC':'Unavailable'} · Exported ${new Date(report.generatedAt).toISOString().replace('T',' ').slice(0,16)} UTC`].map((text,i)=>`<row r="${i+1}" ht="${i===0?38:i===3?36:23}" customHeight="1">${textCell('A'+(i+1),text,i===0?1:2)}</row>`).join('');
  const header=`<row r="6" ht="27" customHeight="1">${report.columns.map((c,i)=>textCell(col(i)+'6',c.label,3)).join('')}</row>`;
  const body=report.rows.map((row,i)=>{const r=i+7,alternate=i%2;return `<row r="${r}" ht="${Math.max(34,Math.ceil(Math.max(row.brand.length,row.location.length)/30)*16+10)}" customHeight="1">${textCell('A'+r,row.brand,alternate?5:4)}${textCell('B'+r,row.location,alternate?5:4)}${row.values.map((value,j)=>{const ref=col(j+2)+r;if(value===null)return textCell(ref,'—',alternate?9:8);const base=row.statuses[j]==='CRITICAL'?10:row.statuses[j]==='WARNING'?12:6;return `<c r="${ref}" s="${base+alternate}"><v>${value}</v></c>`;}).join('')}</row>`;}).join('');
  const fonts=[['11','172B4D',false],['22','FFFFFF',true],['11','64748B',false],['10','FFFFFF',true],['12','0F766E',true],['11','94A3B8',false],['12','B42318',true],['12','B45309',true]].map(([size,color,bold])=>`<font>${bold?'<b/>':''}<sz val="${size}"/><color rgb="FF${color}"/><name val="Calibri"/></font>`).join('');
  const xf=(font,fill,format=0,align='left')=>`<xf numFmtId="${format===2?164:format}" fontId="${font}" fillId="${fill}" borderId="0" xfId="0" applyFont="1" applyFill="1" applyNumberFormat="1" applyAlignment="1"><alignment horizontal="${align}" vertical="center" wrapText="1"/></xf>`;
  const styles=`<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="0.0"/></numFmts><fonts count="8">${fonts}</fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF12243A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF2F6FA"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1">${xf(0,0)}</cellStyleXfs><cellXfs count="14">${xf(0,0)}${xf(1,2)}${xf(2,0)}${xf(3,2)}${xf(0,0)}${xf(0,3)}${xf(4,0,2,'center')}${xf(4,3,2,'center')}${xf(5,0,0,'center')}${xf(5,3,0,'center')}${xf(6,0,2,'center')}${xf(6,3,2,'center')}${xf(7,0,2,'center')}${xf(7,3,2,'center')}</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const sheet=`<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><dimension ref="A1:${last}${Math.max(end,6)}"/><sheetViews><sheetView workbookViewId="0"><pane ySplit="6" topLeftCell="A7" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><sheetFormatPr defaultRowHeight="24"/><cols><col min="1" max="1" width="30" customWidth="1"/>${report.columns.length>1?`<col min="2" max="2" width="30" customWidth="1"/><col min="3" max="${report.columns.length}" width="15" customWidth="1"/>`:''}</cols><sheetData>${headerRows}${header}${body}</sheetData>${count?`<autoFilter ref="A6:${last}${end}"/>`:''}<mergeCells count="4">${[1,2,3,4].map(r=>`<mergeCell ref="A${r}:${last}${r}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.45" right="0.45" top="0.6" bottom="0.6" header="0.25" footer="0.25"/><pageSetup paperSize="9" orientation="${report.columns.length>3?'landscape':'portrait'}" fitToWidth="1" fitToHeight="0"/><headerFooter><oddFooter>&amp;LRating Control Center&amp;RPage &amp;P of &amp;N</oddFooter></headerFooter></worksheet>`;
  return zip([
   ['[Content_Types].xml','<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'],
   ['_rels/.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'],
   ['xl/workbook.xml',`<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets><sheet name="Ratings" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm.Print_Titles" localSheetId="0">'Ratings'!$6:$6</definedName></definedNames><calcPr calcId="191029"/></workbook>`],
   ['xl/_rels/workbook.xml.rels','<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'],
   ['xl/styles.xml',styles],['xl/worksheets/sheet1.xml',sheet]
  ]);
 }
 const filename=report=>`ratings-${report.platform}-${String(report.generatedAt).slice(0,10)}`;
 function downloadExcel(report){const url=URL.createObjectURL(new Blob([excel(report)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'})),a=document.createElement('a');a.href=url;a.download=filename(report)+'.xlsx';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000);}
 function printPdf(report){
  const child=window.open('/ratings-print.html','_blank');if(!child)throw Error('Allow pop-ups to open the PDF report.');
  let timer;const ready=event=>{if(event.origin!==location.origin||event.source!==child||event.data?.type!=='ratings-print-ready')return;window.removeEventListener('message',ready);clearTimeout(timer);child.postMessage({type:'ratings-print-report',report},location.origin);};
  window.addEventListener('message',ready);timer=setTimeout(()=>window.removeEventListener('message',ready),30000);
 }
 globalThis.RatingExports={fromGroups,locationCards,excel,downloadExcel,printPdf,filename};
})();
