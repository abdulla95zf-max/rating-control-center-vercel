(() => {
 const screen=document.getElementById('startupScreen');if(!screen)return;
 const gate=document.getElementById('authGate'),menu=document.getElementById('accountMenu');
 const surfaces=[...document.querySelectorAll('body > header, body > nav, body > main, body > aside')].map(node=>({node,wasInert:node.inert}));surfaces.forEach(({node})=>{node.inert=true;});
 let finished=false,limitTimer,closeTimer;
 const observer=new MutationObserver(check);
 function finish(){
  if(finished)return;finished=true;clearTimeout(limitTimer);observer.disconnect();
  surfaces.forEach(({node,wasInert})=>{node.inert=wasInert;});
  screen.classList.add('is-ready');screen.setAttribute('aria-hidden','true');
  const remove=()=>{clearTimeout(closeTimer);screen.remove();};
  if(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches)remove();else closeTimer=setTimeout(remove,160);
 }
 // Reveal the shell at the authentication decision, independently of every data request.
 function check(){if((gate&&!gate.hidden)||(menu&&!menu.hidden))finish();}
 for(const node of [gate,menu])if(node)observer.observe(node,{attributes:true,attributeFilter:['hidden']});
 // A visual introduction must never gate the site on a slow or stalled request.
 limitTimer=setTimeout(finish,1500);
 check();
})();
