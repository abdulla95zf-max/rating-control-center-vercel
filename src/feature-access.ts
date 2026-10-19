export const featureCatalog=[
 {id:'overview',group:'Workspace',label:'Overview'},
 {id:'lens',group:'Workspace',label:'Branch Lens'},
 {id:'growth',group:'Workspace',label:'Growth'},
 {id:'talabat.ratings',group:'Talabat',label:'Ratings'},
 {id:'talabat.performance',group:'Talabat',label:'Performance'},
 {id:'talabat.tstar',group:'Talabat',label:'tStar period'},
 {id:'talabat.reviews',group:'Talabat',label:'Reviews'},
 {id:'keeta.ratings',group:'Keeta',label:'Ratings'},
 {id:'keeta.performance',group:'Keeta',label:'Performance'},
 {id:'noon.ratings',group:'Noon',label:'Ratings'},
 {id:'noon.performance',group:'Noon',label:'Performance'},
 {id:'deliveroo.ratings',group:'Deliveroo',label:'Ratings'},
 {id:'deliveroo.operations',group:'Deliveroo',label:'Operations'},
 {id:'careem.ratings',group:'Careem',label:'Ratings (when connected)'},
 {id:'users.manage',group:'Administration',label:'User management (administrator role only)'},
] as const;
export type Feature=typeof featureCatalog[number]['id'];
export const defaultAccountFeatures:Feature[]=featureCatalog.filter(f=>f.id.endsWith('.ratings')).map(f=>f.id);
export type FeatureUser={role:string;isOwner?:boolean;features?:Feature[]|null};
const known=new Set<string>(featureCatalog.map(f=>f.id));
export function parseFeatures(value:unknown):Feature[]|null{
 if(value===null)return null;
 if(!Array.isArray(value)||value.length>featureCatalog.length||value.some(id=>typeof id!=='string'||!known.has(id))||new Set(value).size!==value.length)throw Error('INVALID_FEATURES');
 return [...value] as Feature[];
}
export function storedFeatures(value:unknown):Feature[]|null{if(value===undefined||value===null)return null;try{return parseFeatures(value);}catch{return [];}}
export function hasFeature(user:FeatureUser,key:string){return known.has(key)&&(user.isOwner===true||user.features==null||user.features.includes(key as Feature));}
export const ratingFeature=(platform:string)=>`${platform}.ratings`;
export function rowFeatureUser(row:any):FeatureUser{return {role:row.role,isOwner:row.is_owner===true,features:storedFeatures(row.feature_access)};}
export function canManageAccount(actor:FeatureUser,target:FeatureUser){
 if(actor.isOwner)return true;
 if(actor.role!=='admin'||!hasFeature(actor,'users.manage')||target.isOwner)return false;
 return featureCatalog.every(f=>!hasFeature(target,f.id)||hasFeature(actor,f.id));
}
export function assertManageAccount(actor:any,target:any){if(!canManageAccount(rowFeatureUser(actor),rowFeatureUser(target)))throw Error(target.is_owner?'OWNER_REQUIRED':'ACCOUNT_ACCESS_DENIED');}
export function selectFeatureAccess(input:any,actor:any,target?:any){
 if(Object.hasOwn(input,'features')){
  if(!actor.is_owner)throw Error('OWNER_REQUIRED');
  const features=parseFeatures(input.features);
  if(target?.is_owner&&features!==null)throw Error('OWNER_ACCESS_FIXED');
  return features;
 }
 // The owner's default policy grants only ratings on admin-created accounts.
 // Brand/branch scopes still apply; all other sections require an owner grant.
 return target?storedFeatures(target.feature_access):actor.is_owner?null:[...defaultAccountFeatures];
}
export function filterRatingFeatures<T extends {ratings:any[];platforms:any[];storeCount:number}>(data:T,user:FeatureUser):T{
 const platforms=data.platforms.filter(p=>hasFeature(user,ratingFeature(p.platform)));
 const ratings=data.ratings.filter(r=>hasFeature(user,ratingFeature(r.platform)));
 return {...data,platforms,ratings,storeCount:ratings.length};
}
export function performanceFeature(platform:string){return platform==='deliveroo'?'deliveroo.operations':`${platform}.performance`;}
