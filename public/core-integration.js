(()=>{
 const message=document.getElementById('accessMessage'),content=document.getElementById('setupContent'),retry=document.getElementById('retrySetup');let contract=null,busy=false;
 function download(name,text){const url=URL.createObjectURL(new Blob([text],{type:'application/json;charset=utf-8'})),link=document.createElement('a');link.href=url;link.download=name;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
 async function load(){if(busy)return;busy=true;retry.hidden=true;content.hidden=true;message.textContent='در حال بررسی دسترسی…';try{
  const response=await fetch('/api/config?integration=core-webhook',{cache:'no-store',signal:AbortSignal.timeout(15000)});
  if(response.status===401){message.textContent='ابتدا با حساب خودت وارد داشبورد شو.';return;}
  if(response.status===403){message.textContent='این بخش فقط در دسترس سوپرادمین است.';return;}
  if(!response.ok)throw Error();const data=await response.json();if(!data.payload||!data.headers||!data.rawBody)throw Error();contract=data;
  document.getElementById('samplePayload').textContent=JSON.stringify(data.payload,null,2);document.getElementById('sampleHeaders').textContent=JSON.stringify({headers:data.headers,testKey:data.testKey},null,2);document.getElementById('rawPayload').textContent=data.rawBody;document.getElementById('deltaPayload').textContent=JSON.stringify(data.deltaExample,null,2);
  message.textContent='';content.hidden=false;
 }catch{message.textContent='دریافت اطلاعات کامل نشد. دوباره تلاش کن.';retry.hidden=false;}finally{busy=false;}}
 document.getElementById('copyPayload').onclick=async()=>{if(!contract)return;const status=document.getElementById('copyMessage');try{await navigator.clipboard.writeText(JSON.stringify(contract.payload,null,2));status.textContent='قالب کپی شد؛ برای تست امضا از بدنهٔ دقیقِ نمونه استفاده کن.';}catch{status.textContent='کپی خودکار ممکن نشد؛ متن قالب را انتخاب و کپی کن.';}};
 document.getElementById('downloadContract').onclick=()=>{if(contract)download('FRB-Core-Webhook-Test-Vector.json',JSON.stringify(contract,null,2));};
 document.getElementById('downloadVerifier').onclick=()=>{const a=document.createElement('a');a.href='/core-webhook-verifier.mjs';a.download='core-webhook-verifier.mjs';a.click();};retry.onclick=load;load();
})();

