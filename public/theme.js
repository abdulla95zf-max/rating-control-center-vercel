(() => {
  const key='rcc-theme',root=document.documentElement;
  let theme='dark',saved=null;
  try{saved=localStorage.getItem(key);}catch{}
  if(saved==='light'||saved==='dark')theme=saved;
  else if(globalThis.matchMedia?.('(prefers-color-scheme: light)').matches)theme='light';
  function apply(value,persist=false){
    theme=value;root.dataset.theme=value;root.style.colorScheme=value;
    if(persist)try{localStorage.setItem(key,value);}catch{}
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content',value==='light'?'#f3f6fb':'#080d18');
    for(const button of document.querySelectorAll('[data-theme-toggle]')){
      const light=value==='light';button.innerHTML=light?'<span aria-hidden="true">☾</span><span>Dark</span>':'<span aria-hidden="true">☀</span><span>Light</span>';
      button.setAttribute('aria-label',light?'Switch to dark theme':'Switch to light theme');button.title=button.getAttribute('aria-label');
    }
    if(persist)document.dispatchEvent(new Event('rcc-theme-change'));
  }
  apply(theme);
  function button(){const node=document.createElement('button');node.type='button';node.className='theme-toggle';node.dataset.themeToggle='';node.addEventListener('click',()=>apply(theme==='dark'?'light':'dark',true));return node;}
  document.addEventListener('DOMContentLoaded',()=>{
    document.querySelector('.topbar')?.append(button());
    const login=document.querySelector('#loginForm');if(login)login.append(button());
    apply(theme);
  });
  globalThis.addEventListener('storage',event=>{if(event.key===key&&(event.newValue==='light'||event.newValue==='dark'))apply(event.newValue,true);});
})();
