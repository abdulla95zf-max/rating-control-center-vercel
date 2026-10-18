/* Explain only matched branch-period measurements. Correlation is never proof of cause. */
(() => {
 const known=v=>typeof v==='number'&&Number.isFinite(v)&&v>=0;
 function analyze(row,platform){
  const d=row?.diagnostics,period=row?.period;
  const matched=row?.eligible===true&&d?.matched===true&&period&&['from','to','previousFrom','previousTo'].every(k=>d.period?.[k]===period[k]);
  if(!matched)return {available:false,issues:[],hypothesis:null,stages:[],metrics:[],ratio:null};
  const metrics=(d.operations||[]).filter(m=>typeof m.code==='string'),stages=(d.funnel?.stages||[]).map(m=>({...m,current:known(m.current)?m.current:null,previous:known(m.previous)?m.previous:null}));
  const get=code=>{const matches=metrics.filter(m=>m.code===code);return matches.length===1?matches[0]:null;};
  const issues=[],add=(code,metric)=>issues.push({code,metric});
  const prep=get('prep'),wait=get('wait'),offline=get('offline'),cancelled=get('cancelled'),complaints=get('complaints'),missing=get('missing');
  const prepWorse=known(prep?.current)&&known(prep?.previous)&&prep.current>prep.previous+.5;
  if(prepWorse)add('PREP_WORSE',prep);else if(platform==='keeta'&&known(prep?.current)&&prep.current>16)add('PREP_HIGH',prep);
  if(known(wait?.current)&&known(wait?.previous)&&wait.current>wait.previous+.5)add('WAIT_WORSE',wait);
  if(known(offline?.current)&&offline.current>2)add('OFFLINE',offline);
  if(known(cancelled?.current)&&cancelled.current>0)add('CANCELLED',cancelled);
  if(known(complaints?.current)&&complaints.current>0)add('COMPLAINTS',complaints);
  if(known(missing?.current)&&missing.current>0)add('MISSING',missing);
  const views=stages[0],last=stages.at(-1),ratio=known(views?.current)&&views.current>0&&known(last?.current)&&last.current<=views.current?last.current/views.current*100:null;
  const ordersDown=known(row.current?.orders)&&known(row.previous?.orders)&&Math.min(row.current.orders,row.previous.orders)>=20&&row.current.orders<row.previous.orders;
  let hypothesis=null;
  if(ordersDown&&known(views?.current)&&known(views?.previous)&&views.previous>=20&&views.current<views.previous)hypothesis={code:'VISITS_DOWN',basis:'OBSERVED',evidence:[views.current,views.previous,row.current.orders,row.previous.orders]};
  else if(ordersDown&&(prepWorse||platform==='keeta'&&known(prep?.current)&&prep.current>16))hypothesis={code:'DELAY_POSSIBLE',basis:'HYPOTHESIS',evidence:[prep.current,prep.previous,row.current.orders,row.previous.orders]};
  else if(ordersDown&&known(offline?.current)&&offline.current>2)hypothesis={code:'AVAILABILITY_POSSIBLE',basis:'HYPOTHESIS',evidence:[offline.current,row.current.orders,row.previous.orders]};
  return {available:true,issues,hypothesis,stages,kind:d.funnel?.kind,metrics,ratio};
 }
 globalThis.BranchStoryCore={analyze};
})();
