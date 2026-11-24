(()=>{
 const form=document.getElementById('register-form'),input=document.getElementById('blog-url'),message=document.getElementById('message'),installation=document.getElementById('installation'),code=document.getElementById('install-code'),verify=document.getElementById('verify-site'),copy=document.getElementById('copy-code');
 let site=null,busy=false;
 const explain=error=>error instanceof Error&&/^[가-힣]/.test(error.message)?error.message:'연결이 지연되고 있습니다. 잠시 후 다시 시도해주세요.';
 const status=(text,error=false)=>{message.textContent=text;message.dataset.error=String(error);};
 const lock=value=>{busy=value;form.querySelector('button').disabled=value;input.disabled=value;verify.disabled=value;};
 const errors={400:'티스토리 기본 주소를 확인해주세요. 예: https://my-blog.tistory.com',403:'이 설치 페이지에서 다시 시도해주세요.',404:'등록 정보를 찾지 못했습니다. 주소를 다시 등록해주세요.',409:'아직 블로그 홈에서 설치 코드를 찾지 못했습니다. HTML을 저장한 뒤 다시 확인해주세요.',422:'블로그의 공개 글을 확인하지 못했습니다. 기본 주소와 글 공개 상태를 확인해주세요.',429:'요청이 많습니다. 잠시 후 다시 시도해주세요.',503:'지금 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'};
 async function request(path,body,timeout=20000){
  const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(timeout)});
  if(!response.ok)throw new Error(errors[response.status]||'요청을 완료하지 못했습니다. 다시 시도해주세요.');return response.json();
 }
 input.addEventListener('input',()=>{site=null;installation.hidden=true;});
 form.addEventListener('submit',async event=>{
  event.preventDefault();if(busy)return;site=null;installation.hidden=true;lock(true);status('블로그 주소를 등록하고 있습니다.');
  try{
   const value=await request('/api/sites',{url:input.value.trim()});
   if(!/^(?:hyunolike|[a-f0-9]{32})$/.test(value.id)||!/^https:\/\/[a-z0-9-]+\.tistory\.com$/.test(value.origin))throw new Error('설치 정보를 확인하지 못했습니다.');
   site=value;
   code.textContent=`<!-- 티스토리 인기글 위젯 시작 -->\n<div style="max-width:560px;margin:12px 0">\n  <blog-live-ranking site="${site.id}" blog-origin="${site.origin}" api-base="${location.origin}"></blog-live-ranking>\n</div>\n<script src="${location.origin}/widget.js" data-site="${site.id}" defer><`+`/script>\n<!-- 티스토리 인기글 위젯 끝 -->`;
   document.getElementById('registered-blog').textContent=site.origin;
   document.getElementById('open-blog').href=site.origin;
   document.getElementById('site-status').textContent=site.status==='active'?'집계 중':'설치 대기';
   installation.hidden=false;copy.textContent='설치 코드 복사';
   status(site.status==='active'?'이미 집계가 활성화된 블로그입니다. 같은 코드로 다시 설치할 수 있습니다.':'코드가 준비되었습니다. 스킨에 붙여 넣고 저장한 뒤 설치를 확인해주세요.');
  }catch(error){status(explain(error),true);}finally{lock(false);}
 });
 verify.addEventListener('click',async()=>{
  if(!site||busy)return;lock(true);status('블로그에서 설치 코드와 공개 글을 확인하고 있습니다.');
  try{const result=await request(`/api/sites/${site.id}/verify`,{},60000);site=result;document.getElementById('site-status').textContent='집계 중';status('설치를 확인했습니다. 이제 방문 집계를 시작합니다. 블로그를 새로 열어 확인해주세요.');}
  catch(error){status(explain(error),true);}finally{lock(false);}
 });
 copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(code.textContent);copy.textContent='복사했습니다';}catch{status('자동 복사를 사용할 수 없습니다. 코드 영역의 내용을 직접 복사해주세요.',true);}});
})();
