(() => {
  const gate=document.getElementById('authGate'),form=document.getElementById('loginForm'),error=document.getElementById('loginError');
  const menu=document.getElementById('accountMenu'),name=document.getElementById('accountName'),manage=document.getElementById('manageUsers'),branches=document.getElementById('manageBranches');
  let user=null,start=null;
  async function request(path,options={}){const response=await fetch(path,{cache:'no-store',headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})},...options});const body=await response.json().catch(()=>({}));if(!response.ok)throw new Error(body.error||`Request failed: ${response.status}`);return body;}
  function showLogin(message=''){user=null;document.dispatchEvent(new Event('rcc-auth-reset'));document.body.classList.add('auth-locked');gate.hidden=false;menu.hidden=true;error.textContent=message;document.getElementById('loginUsername').focus();}
  function showApp(nextUser){document.dispatchEvent(new Event('rcc-auth-reset'));user=nextUser;document.body.classList.remove('auth-locked');gate.hidden=true;menu.hidden=false;name.textContent=user.displayName;manage.hidden=user.role!=='admin';branches.hidden=!user.isOwner;}
  async function boot(callback){start=callback;try{const session=await request('/api/auth/session');if(!session.authenticated)return showLogin();showApp(session.user);await callback();}catch{showLogin('Authentication is not configured or is temporarily unavailable.');}}
  async function expired(){if(gate.hidden)showLogin('Your session expired. Please sign in again.');}
  form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';const button=form.querySelector('button[type="submit"]');button.disabled=true;try{const data=Object.fromEntries(new FormData(form));const result=await request('/api/auth/login',{method:'POST',body:JSON.stringify(data)});form.reset();showApp(result.user);await start();}catch(e){showLogin(e.message);}finally{button.disabled=false;}});
  document.querySelector('[data-toggle-password]').addEventListener('click',event=>{const input=document.getElementById(event.currentTarget.dataset.togglePassword),show=input.type==='password';input.type=show?'text':'password';event.currentTarget.textContent=show?'Hide':'Show';event.currentTarget.setAttribute('aria-label',show?'Hide password':'Show password');});
  document.getElementById('logoutButton').addEventListener('click',async()=>{try{await request('/api/auth/logout',{method:'POST',body:'{}'});}finally{location.reload();}});
  manage.addEventListener('click',()=>{location.href='/users.html';});
  branches.addEventListener('click',()=>{location.href='/branches.html';});
  globalThis.dashboardAuth={boot,expired,get user(){return user;}};
})();
