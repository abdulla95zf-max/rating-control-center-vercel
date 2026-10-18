/* Progressive enhancement of existing brand filters; option values remain the authority. */
(() => {
 const assets={'kabab fareej':'kabab-fareej','kabab al fareej':'kabab-fareej','frb kabab':'frb-kabab','frb shawarma':'frb-shawarma','kabab al sham':'kabab-al-sham','morwarid':'morwarid','marwareed':'morwarid','taazaa mumbai':'taazaa-mumbai','taazaa':'taazaa-mumbai','leekh':'leekh','tanoorna ghyr':'tanoorna-ghyr'};
 const key=value=>String(value).toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const priority=['kabab-fareej','frb-shawarma','frb-kabab','taazaa-mumbai','kabab-al-sham','leekh','morwarid','tanoorna-ghyr'];
 const rank=option=>!option.value?-1:(priority.indexOf(assets[key(option.value||option.textContent)])<0?priority.length:priority.indexOf(assets[key(option.value||option.textContent)]));
 const asset=value=>assets[key(value)]?'/brands/'+assets[key(value)]+'.webp':null;
 const match=value=>{const text=key(value),name=Object.keys(assets).sort((a,b)=>b.length-a.length).find(name=>text===name||text.startsWith(name+' '));return name?asset(name):null;};
 const ids=['brandFilter','performanceBrand','growthBrand','npBrand','doBrand','branchBrand','actionBrand','recentBrand'];
 const state=new WeakMap();let pendingFocus=null;
 function sync(){
  for(const id of ids){
   const select=document.getElementById(id);if(!select)continue;
   const options=Array.from(select.options).filter(o=>!o.hidden).sort((a,b)=>rank(a)-rank(b)),signature=JSON.stringify(options.map(o=>[o.value,o.textContent,o.disabled]));
   let entry=state.get(select);
   if(!entry){
    const root=document.createElement('section');root.className='frb-brand-filter';root.setAttribute('aria-label',id==='actionBrand'?'Operational Center brand filter':id==='recentBrand'?'Recent Changes brand filter':'Brand filter');
    const inline=['actionBrand','recentBrand'].includes(id);if(inline)root.classList.add('frb-brand-inline');
    const heading=document.createElement('div');heading.className='frb-brand-heading';heading.textContent='Choose brand';const group=document.createElement('div');group.className='frb-brand-cards';group.setAttribute('role','group');group.setAttribute('aria-label','Choose brand');root.append(heading,group);
    const host=inline?select.closest('.action-header'):(select.closest('.np-date-controls')||select.closest('.gr-filters,.toolbar,.directory-head,.perf-controls'));
    if(inline&&host)host.append(root);else if(host)host.before(root);else (select.closest('label')||select).before(root);
    const label=select.closest('label');if(label)label.classList.add('frb-brand-native-label');select.classList.add('frb-brand-native');select.tabIndex=-1;
    entry={root,group,signature:null};state.set(select,entry);
    group.addEventListener('click',event=>{const button=event.target.closest('button[data-brand-value]');if(!button||button.disabled)return;pendingFocus={id,value:button.dataset.brandValue};select.value=button.dataset.brandValue;select.dispatchEvent(new Event('change',{bubbles:true}));sync();});
    select.addEventListener('change',sync);
   }
   if(entry.signature!==signature){
    entry.signature=signature;entry.group.replaceChildren();
    for(const option of options){
     const button=document.createElement('button');button.type='button';button.className='frb-brand-card';button.dataset.brandValue=option.value;button.disabled=option.disabled;
     const image=asset(option.value||option.textContent),frame=document.createElement('span');frame.className='frb-brand-logo';frame.setAttribute('aria-hidden','true');
     if(image){const img=document.createElement('img');img.src=image;img.alt='';img.width=44;img.height=44;img.loading='lazy';img.decoding='async';frame.append(img);}else{frame.classList.add('frb-brand-initial');frame.textContent=option.value?option.textContent.trim().slice(0,2).toUpperCase():'All';}
     const name=document.createElement('span');name.className='frb-brand-name';name.textContent=option.value?option.textContent:'All brands';const check=document.createElement('span');check.className='frb-brand-check';check.setAttribute('aria-hidden','true');check.textContent='✓';button.append(frame,name,check);entry.group.append(button);
    }
   }
   for(const button of entry.group.children){const selected=button.dataset.brandValue===select.value;button.setAttribute('aria-pressed',String(selected));}
   if(pendingFocus?.id===id){const button=Array.from(entry.group.children).find(b=>b.dataset.brandValue===pendingFocus.value);if(button){button.focus({preventScroll:true});pendingFocus=null;}}
  }
  globalThis.FRBVisuals?.polishRows?.();
 }
 globalThis.FRBBrands={asset,match,sync};
 if(typeof document==='undefined')return;
 new MutationObserver(sync).observe(document.body,{childList:true,subtree:true});sync();
})();

