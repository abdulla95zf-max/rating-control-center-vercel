/* Presentation-only request feedback and per-operation locks; server authorization remains authoritative. */
(() => {
 const pending=new Set();
 const validation=new Set(['Enter a display name.','Password must be 6–128 characters.','Select a valid role.','Select access that matches the chosen role.','This username already exists.','You cannot disable your own account.','You cannot delete your own account.','The owner account cannot be deleted.','The last active administrator cannot be deleted.','Type the exact username to confirm deletion.','User not found.','Only the super administrator can change section permissions or manage this account.','This account must be managed by the super administrator.','The super administrator always has full access.','Choose valid site sections.','Invalid branch request.','Branch not found.','Administrator access required.','Username must be 3–80 characters and may include letters, numbers, dot, dash, underscore or @.']);
 function http(status,body){
  if(status===401)return 'Your session has expired. Sign in again to continue.';
  if(status===429)return 'Too many requests. Wait a moment before trying again.';
  if(status>=500)return 'The service is temporarily unavailable. Please try again shortly.';
  if(validation.has(body?.error))return body.error;
  if(status===403)return 'Access was denied. Check your assigned access or reload the page if a security check is required.';
  if(status===404)return 'The requested information is no longer available. Refresh the page.';
  if(status===409)return 'This information changed or already exists. Refresh before trying again.';
  return 'The request could not be completed. Check your entries and try again.';
 }
 function network(){return 'The connection was interrupted. Check your network and try again. For a saved change, refresh first to check whether it completed.';}
 async function read(response){try{return await response.json();}catch(error){if(error?.name==='SyntaxError')return null;throw Error(network());}}
 function begin(key,controls=[]){
  if(pending.has(key))return null;
  pending.add(key);const saved=[...controls].map(node=>({node,disabled:node.disabled,busy:node.getAttribute?.('aria-busy')}));
  for(const {node}of saved){node.disabled=true;node.setAttribute?.('aria-busy','true');}
  let released=false;return ()=>{if(released)return;released=true;pending.delete(key);for(const {node,disabled,busy}of saved){node.disabled=disabled;if(busy==null)node.removeAttribute?.('aria-busy');else node.setAttribute?.('aria-busy',busy);}};
 }
 globalThis.UIFeedback={http,network,read,begin,has:key=>pending.has(key)};
})();
