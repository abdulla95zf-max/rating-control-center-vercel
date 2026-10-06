/* Display names only. Persisted branch IDs, scope keys and source names stay stable. */
(() => {
 const brand=value=>String(value??'').replace(/^Marwareed$/i,'Morwarid');
 const branch=value=>{
  const original=String(value??'').trim(),key=original.toLowerCase().replace(/\bsubrub\b/g,'suburb').replace(/\bindsutrial\b/g,'industrial').replace(/[^a-z0-9]+/g,' ').trim();
  if(/^(?:aweer )?ras al khor industrial area ?3$/.test(key)||key==='aweer')return 'Aweer';
  if(['al noof','hay hoshi','al bdai a suburb','hoshi'].includes(key))return 'Hoshi';
  if(['al dhait south','al dhait rak al dhait south','rak'].includes(key))return 'RAK';
  if(['al barsha 1','al barsha','barsha'].includes(key))return 'Barsha';
  if(['al hamidiya 2','ajman'].includes(key))return 'Ajman';
  if(['al darfrah','mushrif mall al dafrah'].includes(key))return 'AbuDhabi';
  return original;
 };
 const full=value=>{const text=String(value??''),split=text.match(/^(.+?)\s+[—–]\s+(.+)$/);return split?brand(split[1])+' — '+branch(split[2]):text.replace(/^Marwareed\b/i,'Morwarid');};
 globalThis.BranchLabels={brand,branch,full};
})();
