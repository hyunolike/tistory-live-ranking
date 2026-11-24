import css from './ranking.css';
import { BLOG_ORIGIN, postIdFromUrl, type RankingResponse, type RankingWindow } from '../shared/contracts.ts';
import { demoRanking } from './demo-data.ts';

export class BlogLiveRanking extends HTMLElement {
  static observedAttributes=['api-base','demo'];
  private selected:RankingWindow='24h';
  private generation=0;
  private request?:AbortController;
  private interval?:ReturnType<typeof setInterval>;
  private mounted=false;
  private previous=new Map<RankingWindow,RankingResponse>();
  private root:ShadowRoot;
  private list:HTMLOListElement;
  private status:HTMLElement;
  private stamp:HTMLElement;
  private retry:HTMLButtonElement;
  private visibility=()=>{
    this.stopTimer();
    if(!document.hidden&&this.isConnected){void this.load();this.startTimer();}
    else {++this.generation;this.request?.abort();}
  };

  constructor(){
    super();
    this.root=this.attachShadow({mode:'open'});
    this.root.innerHTML=`<style>${css}</style>
      <section class="ranking" aria-labelledby="ranking-heading">
        <header class="heading"><div class="heading-copy"><span class="eyebrow"><span class="live-dot" aria-hidden="true"></span>지금 이 블로그에서</span><h2 id="ranking-heading">많이 읽는 글</h2></div><span class="demo-label" hidden>예시 데이터</span><span class="period-label">최근 24시간</span></header>
        <div class="toolbar"><div class="periods" role="group" aria-label="집계 기간"><button type="button" data-window="1h" aria-pressed="false">최근 1시간</button><button type="button" data-window="24h" aria-pressed="true">최근 24시간</button></div><span class="metric-label">중복 제외 조회</span></div>
        <ol class="posts" aria-label="인기글 순위"></ol>
        <div class="state" role="status" aria-live="polite" hidden></div>
        <button type="button" class="retry" hidden>다시 불러오기</button>
        <footer class="foot"><span class="basis">같은 IP의 같은 글은 30분에 한 번 반영합니다.</span><span class="stamp"></span></footer>
      </section>`;
    this.list=this.root.querySelector('ol')!;
    this.status=this.root.querySelector('.state')!;
    this.stamp=this.root.querySelector('.stamp')!;
    this.retry=this.root.querySelector('.retry')!;
    this.root.querySelectorAll<HTMLButtonElement>('[data-window]').forEach(button=>button.addEventListener('click',()=>{
      const window=button.dataset.window as RankingWindow;
      if(this.selected===window)return;
      this.selected=window;
      this.updateSelection();
      void this.load();
    }));
    this.retry.addEventListener('click',()=>void this.load());
  }

  connectedCallback(){this.mounted=true;document.addEventListener('visibilitychange',this.visibility);void this.load();this.startTimer();}
  disconnectedCallback(){this.mounted=false;++this.generation;this.request?.abort();this.stopTimer();document.removeEventListener('visibilitychange',this.visibility);}
  attributeChangedCallback(){if(this.mounted&&this.isConnected){this.previous.clear();void this.load();this.stopTimer();this.startTimer();}}
  private stopTimer(){if(this.interval)clearInterval(this.interval);this.interval=undefined;}
  private startTimer(){if(!this.hasAttribute('demo')&&!document.hidden&&!this.interval)this.interval=setInterval(()=>void this.load(),60_000);}
  private updateSelection(){
    this.root.querySelectorAll<HTMLButtonElement>('[data-window]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.window===this.selected)));
    this.root.querySelector('.period-label')!.textContent=this.selected==='1h'?'최근 1시간':'최근 24시간';
  }

  private async load(){
    const generation=++this.generation;
    this.request?.abort();
    this.updateSelection();
    const demo=this.hasAttribute('demo');
    (this.root.querySelector('.demo-label') as HTMLElement).hidden=!demo;
    (this.root.querySelector('.period-label') as HTMLElement).hidden=demo;
    this.retry.hidden=true;
    const previous=this.previous.get(this.selected);
    if(previous)this.render(previous);
    else {this.list.replaceChildren();this.list.hidden=true;this.status.hidden=false;this.status.textContent='인기글을 불러오는 중입니다.';this.stamp.textContent='';}
    this.setAttribute('aria-busy','true');
    if(demo){this.render(demoRanking(this.selected));this.removeAttribute('aria-busy');return;}
    const controller=new AbortController();
    this.request=controller;
    const timer=setTimeout(()=>controller.abort(),10_000);
    try{
      const base=new URL(this.getAttribute('api-base')||location.origin,location.href);
      if(!['http:','https:'].includes(base.protocol))throw new Error('Invalid API origin');
      const endpoint=new URL('/api/rankings',base);
      endpoint.searchParams.set('window',this.selected);
      const response=await fetch(endpoint,{signal:controller.signal,credentials:'omit'});
      if(!response.ok)throw new Error('Ranking request failed');
      const value=await response.json() as RankingResponse;
      if(value.window!==this.selected||value.metric!=='deduplicatedViews'||!Array.isArray(value.items)||!Number.isFinite(Date.parse(value.generatedAt)))throw new Error('Invalid ranking response');
      value.items=value.items.filter(item=>typeof item.title==='string'&&item.title.length<=300&&postIdFromUrl(item.url)===item.postId&&new URL(item.url).origin===BLOG_ORIGIN&&Number.isInteger(item.views)&&item.views>0).slice(0,5);
      if(generation!==this.generation||!this.isConnected)return;
      this.previous.set(this.selected,value);
      this.render(value);
    }catch{
      if(generation!==this.generation||!this.isConnected)return;
      this.status.hidden=false;
      this.status.textContent=previous?'갱신하지 못했습니다. 이전 결과를 표시합니다.':'인기글을 불러오지 못했습니다.';
      this.status.classList.toggle('compact',Boolean(previous));
      this.retry.hidden=false;
    }finally{
      clearTimeout(timer);
      if(generation===this.generation)this.removeAttribute('aria-busy');
    }
  }

  private render(data:RankingResponse){
    this.list.replaceChildren();
    this.list.hidden=!data.items.length;
    this.status.classList.remove('compact');
    this.status.hidden=Boolean(data.items.length);
    this.status.textContent=data.items.length?'':'아직 집계된 글이 없습니다.';
    for(const [i,item]of data.items.entries()){
      const li=document.createElement('li');
      const rank=document.createElement('span');rank.className='rank';rank.textContent=String(i+1).padStart(2,'0');rank.setAttribute('aria-hidden','true');
      const link=document.createElement('a');link.href=item.url;link.className='post-link';
      const category=/^\[([^\]]{1,24})\]\s*/.exec(item.title);
      if(category){const chip=document.createElement('span');chip.className='category';chip.textContent=category[1];link.append(chip);}
      const title=document.createElement('span');title.className='post-title';title.textContent=category?item.title.slice(category[0].length):item.title;link.append(title);
      const views=document.createElement('span');views.className='views';
      const count=document.createElement('span');count.textContent=item.views.toLocaleString('ko-KR');
      const label=document.createElement('span');label.className='views-label';label.textContent='조회';views.append(count,label);
      li.append(rank,link,views);this.list.append(li);
    }
    this.stamp.textContent=this.hasAttribute('demo')?'실제 방문 통계가 아닙니다.':`${new Date(data.generatedAt).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',hour12:false})} 갱신 / 60초마다`;
  }
}
