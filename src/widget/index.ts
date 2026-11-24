import { BlogLiveRanking } from './ranking.ts';
import { postIdFromUrl,normalizeBlogOrigin } from '../shared/contracts.ts';

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
  const site=script?.dataset.site;
  const origin=site?normalizeBlogOrigin(location.origin):undefined;
  if(site&&!origin)return;
  const postId=postIdFromUrl(location.href,origin??undefined);
  const key=`${site??'legacy'}:${postId}`;
  if(!postId||!document.querySelector('#article-view,.contents_style,.tt_article_useless_p_margin')||document.querySelector('.area-protected,.article-header-protected,input[type=password]')||runtime.tracked.has(key))return;
  runtime.tracked.add(key);
  const endpoint=new URL('/api/views',runtime.base);if(site)endpoint.searchParams.set('site',site);
  void fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({postId}),credentials:'omit',keepalive:true}).catch(()=>{
    // Analytics must never interrupt article reading.
  });
};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
