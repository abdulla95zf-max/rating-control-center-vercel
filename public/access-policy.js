(() => {
 const tabs={overview:'overview',brief:'lens',growth:'growth',talabat:'talabat.ratings',performance:'talabat.performance','talabat-reviews':'talabat.reviews',keeta:'keeta.ratings','keeta-performance':'keeta.performance',noon:'noon.ratings','noon-performance':'noon.performance',deliveroo:'deliveroo.ratings','deliveroo-operations':'deliveroo.operations',careem:'careem.ratings'};
 const ids=[...new Set([...Object.values(tabs),'talabat.tstar','users.manage'])];
 const allows=(user,key)=>ids.includes(key)&&!!user&&(user.isOwner===true||user.features==null||user.features.includes(key));
 const canTab=(user,tab)=>allows(user,tabs[tab])||(tab==='performance'&&allows(user,'talabat.tstar'));
 const landing=user=>Object.keys(tabs).find(tab=>canTab(user,tab))||'no-access';
 const platformTab=(user,platform)=>Object.keys(tabs).find(tab=>tabs[tab].startsWith(platform+'.')&&canTab(user,tab));
 function apply(user){
  for(const button of document.querySelectorAll('#platformTabs [data-tab]')){const tab=button.dataset.tab;button.hidden=['talabat','keeta','noon','deliveroo','careem'].includes(tab)?!platformTab(user,tab):!canTab(user,tab);}
  for(const attr of ['talabatView','keetaView','noonView','deliverooView'])for(const b of document.querySelectorAll('[data-'+attr.replace(/[A-Z]/g,m=>'-'+m.toLowerCase())+']'))b.hidden=!canTab(user,b.dataset[attr]);
 }
 globalThis.RCCAccess={ids,tabs,allows,canTab,landing,platformTab,apply};
})();
