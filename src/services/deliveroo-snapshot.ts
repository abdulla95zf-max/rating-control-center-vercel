import {deliverooScope as scope} from './deliveroo-scope.ts';
export function validateDeliverooSnapshot(snapshot:any){
 if(snapshot?.version!==1||typeof snapshot.observedAt!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(snapshot.observedAt)||!Number.isFinite(Date.parse(snapshot.observedAt))||!Array.isArray(snapshot.rows)||snapshot.rows.length!==16)throw Error('SNAPSHOT_INVALID');
 const seen=new Set();const rows=snapshot.rows.map((r:any)=>{const b=scope.find(x=>x.id===r?.id);
  if(!b||seen.has(b.id)||(['name','orgId','drnId'] as const).some(k=>r[k]!==b[k]))throw Error('SNAPSHOT_INVALID');seen.add(b.id);
  if(r.state==='NO_RATING_RETURNED'){if([r.rating,r.ratingCount,r.oneStarCount].some(v=>v!==null))throw Error('SNAPSHOT_INVALID');return {id:b.id,name:b.name,orgId:b.orgId,drnId:b.drnId,state:r.state,rating:null,ratingCount:null,oneStarCount:null};}
  if(!['SUCCESS','NO_RATINGS'].includes(r.state)||!Number.isSafeInteger(r.ratingCount)||r.ratingCount<0||!r.breakdown)throw Error('SNAPSHOT_INVALID');
  const breakdown:Record<string,number>={};for(const k of ['one_star_count','two_star_count','three_star_count','four_star_count','five_star_count']){if(!Number.isSafeInteger(r.breakdown[k])||r.breakdown[k]<0)throw Error('SNAPSHOT_INVALID');breakdown[k]=r.breakdown[k];}
  if(Object.values(breakdown).reduce((a,b)=>a+b,0)!==r.ratingCount||r.oneStarCount!==breakdown.one_star_count)throw Error('SNAPSHOT_INVALID');
  if(r.state==='NO_RATINGS'?(r.ratingCount!==0||r.rating!==null):(r.ratingCount===0||typeof r.rating!=='number'||!Number.isFinite(r.rating)||r.rating<1||r.rating>5))throw Error('SNAPSHOT_INVALID');
  return {id:b.id,name:b.name,orgId:b.orgId,drnId:b.drnId,state:r.state,rating:r.rating,ratingCount:r.ratingCount,oneStarCount:r.oneStarCount,breakdown};
 });return {version:1,observedAt:snapshot.observedAt,rows};
}
