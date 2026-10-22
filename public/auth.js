(() => {
  const gate=document.getElementById('authGate'),form=document.getElementById('loginForm'),error=document.getElementById('loginError');
  const menu=document.getElementById('accountMenu'),name=document.getElementById('accountName'),manage=document.getElementById('manageUsers'),branches=document.getElementById('manageBranches');
  let user=null,start=null;
  function failureMessage(status,body){
    if(status===403)return 'Your connection needs a security check. Reload this page, wait for verification, then sign in again.';
    if(status===429)return 'Too many sign-in requests. Please wait a few minutes before trying again.';
    if(status>=500)return 'The sign-in service is temporarily unavailable. Please try again shortly.';
    if(status===401)return 'Invalid username or password. If you recently tried several times, wait a few minutes and try again.';
    return typeof body?.error==='string'&&body.error.length<200?body.error:'Sign-in could not be completed. Reload the page and try again.';
  }
  async function request(path,options={}){const response=await fetch(path,{cache:'no-store',headers:{accept:'application/json','content-type':'application/json',...(options.headers||{})},...options});const body=await response.json().catch(()=>null);if(!response.ok)throw new Error(failureMessage(response.status,body));if(!body||typeof body!=='object'||body.error)throw new Error('The sign-in service returned an unexpected response. Reload the page and try again.');return body;}
  function showLogin(message=''){user=null;document.dispatchEvent(new Event('rcc-auth-reset'));document.body.classList.add('auth-locked');gate.hidden=false;menu.hidden=true;error.textContent=message;document.getElementById('loginUsername').focus();}
  function showApp(nextUser){document.dispatchEvent(new Event('rcc-auth-reset'));user=nextUser;document.body.classList.remove('auth-locked');gate.hidden=true;menu.hidden=false;name.textContent=user.displayName;manage.hidden=user.role!=='admin'||!RCCAccess.allows(user,'users.manage');branches.hidden=!user.isOwner;RCCAccess.apply(user);name.title=user.isOwner?'Super administrator':user.role;}
  async function boot(callback){start=callback;try{const session=await request('/api/auth/session');if(!session.authenticated)return showLogin();showApp(session.user);await callback();}catch{showLogin('Authentication is not configured or is temporarily unavailable.');}}
  async function expired(){if(gate.hidden)showLogin('Your session expired. Please sign in again.');}
  form.addEventListener('submit',async event=>{event.preventDefault();error.textContent='';const button=form.querySelector('button[type="submit"]');button.disabled=true;try{const data=Object.fromEntries(new FormData(form));const result=await request('/api/auth/login',{method:'POST',body:JSON.stringify(data)});form.reset();showApp(result.user);await start();}catch(e){showLogin(e.message);}finally{button.disabled=false;}});
  document.querySelector('[data-toggle-password]').addEventListener('click',event=>{const input=document.getElementById(event.currentTarget.dataset.togglePassword),show=input.type==='password';input.type=show?'text':'password';event.currentTarget.textContent=show?'Hide':'Show';event.currentTarget.setAttribute('aria-label',show?'Hide password':'Show password');});
  document.getElementById('logoutButton').addEventListener('click',async()=>{try{await request('/api/auth/logout',{method:'POST',body:'{}'});}finally{location.reload();}});
  manage.addEventListener('click',()=>{location.href='/users.html';});
  branches.addEventListener('click',()=>{location.href='/branches.html';});
  globalThis.dashboardAuth={boot,expired,can:key=>RCCAccess.allows(user,key),get user(){return user;}};
})();
