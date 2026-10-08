(() => {
 const screen=document.getElementById('startupScreen');if(!screen)return;
 const main=document.getElementById('mainContent'),gate=document.getElementById('authGate');
 const surfaces=[...document.querySelectorAll("body > header, body > nav, body > main, body > aside")].map(node=>({node,wasInert:node.inert}));surfaces.forEach(({node})=>{node.inert=true;});
 let finished=false,slowTimer,closeTimer;
 const observer=new MutationObserver(check);
 function finish(){if(finished)return;finished=true;clearTimeout(slowTimer);observer.disconnect();surfaces.forEach(({node,wasInert})=>{node.inert=wasInert;});screen.classList.add('is-ready');screen.setAttribute('aria-hidden','true');const remove=()=>{clearTimeout(closeTimer);screen.remove();};if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)remove();else closeTimer=setTimeout(remove,160);}
 function check(){if(gate&&!gate.hidden){finish();return;}if(main&&!document.body.classList.contains('auth-locked')&&main.childElementCount&&!main.querySelector('.loading-card'))finish();}
 observer.observe(document.body,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','class']});
 const retry=document.getElementById('startupRetry');retry.addEventListener('click',()=>location.reload());
 slowTimer=setTimeout(()=>{if(finished)return;screen.classList.add('is-slow');document.getElementById('startupMessage').textContent='Loading is taking longer than expected. You can retry.';retry.hidden=false;},12000);
 check();
})();
