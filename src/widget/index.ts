import { BlogLiveRanking } from './ranking.ts';
import { postIdFromUrl } from '../shared/contracts.ts';

interface Runtime { base:string; tracked:Set<string> }
const global=window as typeof window & { __hyunolikeRanking?:Runtime };
const script=document.currentScript as HTMLScriptElement | null;
const base=script?.src ? new URL(script.src).origin : location.origin;
const runtime=global.__hyunolikeRanking ??= {base,tracked:new Set()};

if(!customElements.get('blog-live-ranking')){
  // Set the external API origin before upgrade triggers connectedCallback.
  document.querySelectorAll('blog-live-ranking:not([api-base])').forEach(el=>el.setAttribute('api-base',runtime.base));
  customElements.define('blog-live-ranking',BlogLiveRanking);
}

const start=()=>{
  document.querySelectorAll('blog-live-ranking:not([api-base])').forEach(el=>el.setAttribute('api-base',runtime.base));
  if(script?.dataset.track==='false')return;
  const postId=postIdFromUrl(location.href);
  if(!postId||!document.querySelector('#article-view')||document.querySelector('.area-protected,.article-header-protected')||runtime.tracked.has(postId))return;
  runtime.tracked.add(postId);
  void fetch(new URL('/api/views',runtime.base),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId}),credentials:'omit',keepalive:true}).catch(()=>{
    // Analytics must never interrupt article reading.
  });
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
