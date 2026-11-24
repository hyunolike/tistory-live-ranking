import css from './ranking.css';
import { BLOG_ORIGIN, normalizeBlogOrigin, postIdFromUrl, type RankingResponse, type RankingWindow } from '../shared/contracts.ts';
import { demoRanking } from './demo-data.ts';

export class BlogLiveRanking extends HTMLElement {
  static observedAttributes=['api-base','demo','site','blog-origin'];
  private selected:RankingWindow='24h';
  private generation=0;
  private request?:AbortController;
  private interval?:ReturnType<typeof setInterval>;
  private mounted=false;
  private rotation?:ReturnType<typeof setInterval>;
  private items:RankingResponse['items']=[];
  private current=0;
  private paused=false;
  private hovered=false;
  private expanded=false;
  private motion=matchMedia('(prefers-reduced-motion: reduce)');
  private motionChanged=()=>this.syncRotation();
  private outside=(event:PointerEvent)=>{if(!event.composedPath().includes(this))this.setExpanded(false);};
  private ticker!:HTMLAnchorElement;
  private placeholder!:HTMLElement;
  private toggle!:HTMLButtonElement;
  private pause!:HTMLButtonElement;
  private panel!:HTMLElement;
  private previous=new Map<RankingWindow,RankingResponse>();
  private root:ShadowRoot;
  private list:HTMLOListElement;
  private status:HTMLElement;
  private stamp:HTMLElement;
  private retry:HTMLButtonElement;
  private visibility=()=>{
    this.stopTimer();
    this.syncRotation();
    if(!document.hidden&&this.isConnected){void this.load();this.startTimer();}
    else {++this.generation;this.request?.abort();}
  };

  constructor(){
    super();
    this.root=this.attachShadow({mode:'open'});
    this.root.innerHTML=`<style>${css}</style>
      <section class="ranking" aria-label="실시간 인기글">
        <div class="ticker">
          <span class="hot">HOT</span>
          <a class="ticker-link" hidden><span class="ticker-content"><span class="ticker-rank"></span><span class="ticker-title"></span></span></a>
          <span class="ticker-placeholder" role="status">인기글을 불러오는 중입니다.</span>
          <span class="refresh-warning" hidden title="갱신하지 못해 이전 결과를 표시합니다." aria-label="갱신 지연">!</span>
          <span class="demo-label" hidden>예시 데이터</span>
          <button class="rotation" type="button" aria-label="자동 순환 일시정지" aria-pressed="false" hidden><span class="pause-icon" aria-hidden="true"></span></button>
          <button class="toggle" type="button" aria-label="인기글 전체 보기" aria-expanded="false" aria-controls="ranking-panel"><svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16"><path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.5"/></svg></button>
        </div>
        <div class="retry-slot"><button type="button" class="retry" hidden>다시 불러오기</button></div>
        <div class="panel" id="ranking-panel" hidden>
          <header class="heading"><h2>지금 많이 읽는 글 <span>TOP 5</span></h2><span class="period-label">최근 24시간</span></header>
          <div class="toolbar"><div class="periods" role="group" aria-label="집계 기간"><button type="button" data-window="1h" aria-pressed="false">최근 1시간</button><button type="button" data-window="24h" aria-pressed="true">최근 24시간</button></div><span class="metric-label">중복 제외 조회</span></div>
          <ol class="posts" aria-label="인기글 순위"></ol>
          <div class="state" role="status" aria-live="polite" hidden></div>
          <footer class="foot"><span class="basis">같은 IP의 같은 글은 30분에 한 번 반영합니다.</span><span class="stamp"></span></footer>
        </div>
      </section>`;
    this.ticker=this.root.querySelector('.ticker-link')!;
    this.placeholder=this.root.querySelector('.ticker-placeholder')!;
    this.toggle=this.root.querySelector('.toggle')!;
    this.pause=this.root.querySelector('.rotation')!;
    this.panel=this.root.querySelector('.panel')!;
    this.toggle.addEventListener('click',()=>this.setExpanded(!this.expanded));
    this.pause.addEventListener('click',()=>{this.paused=!this.paused;this.syncRotation();});
    this.addEventListener('pointerenter',()=>{this.hovered=true;this.syncRotation();});
    this.addEventListener('pointerleave',()=>{this.hovered=false;this.syncRotation();});
    this.addEventListener('focusin',()=>this.syncRotation());
    this.addEventListener('focusout',()=>queueMicrotask(()=>this.syncRotation()));
    this.root.addEventListener('keydown',event=>{if(event instanceof KeyboardEvent&&event.key==='Escape'&&this.expanded){event.preventDefault();this.setExpanded(false);this.toggle.focus();}});
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

  connectedCallback(){this.mounted=true;this.motion.addEventListener('change',this.motionChanged);document.addEventListener('pointerdown',this.outside);document.addEventListener('visibilitychange',this.visibility);void this.load();this.startTimer();}
  disconnectedCallback(){this.mounted=false;this.hovered=false;++this.generation;this.request?.abort();this.stopTimer();this.stopRotation();this.motion.removeEventListener('change',this.motionChanged);document.removeEventListener('pointerdown',this.outside);document.removeEventListener('visibilitychange',this.visibility);}
  attributeChangedCallback(){if(this.mounted&&this.isConnected){this.previous.clear();void this.load();this.stopTimer();this.startTimer();}}
  private setExpanded(expanded:boolean){
    this.expanded=expanded;this.panel.hidden=!expanded;
    this.toggle.setAttribute('aria-expanded',String(expanded));
    this.syncRotation();
  }
  private stopRotation(){if(this.rotation)clearInterval(this.rotation);this.rotation=undefined;this.root.querySelector('.ticker-content')?.getAnimations().forEach(animation=>animation.cancel());}
  private syncRotation(){
    this.stopRotation();
    this.pause.hidden=this.items.length<2||this.motion.matches;
    this.pause.setAttribute('aria-label',this.paused?'자동 순환 시작':'자동 순환 일시정지');
    this.pause.setAttribute('aria-pressed',String(this.paused));
    if(this.mounted&&this.isConnected&&this.items.length>1&&!this.paused&&!this.hovered&&!this.expanded&&!this.root.activeElement&&!document.hidden&&!this.motion.matches){
      this.rotation=setInterval(()=>{this.current=(this.current+1)%this.items.length;this.showTicker(true);},5_000);
    }
  }
  private showTicker(animate=false){
    const item=this.items[this.current];if(!item)return;
    this.ticker.hidden=false;this.placeholder.hidden=true;
    this.ticker.href=item.url;this.ticker.title=item.title;
    this.root.querySelector('.ticker-rank')!.textContent=String(this.current+1);
    this.root.querySelector('.ticker-title')!.textContent=item.title;
    if(animate&&!this.motion.matches){
      const style=getComputedStyle(this);
      const distance=style.getPropertyValue('--text-swap-translate-y').trim()||'4px';
      const duration=parseFloat(style.getPropertyValue('--text-swap-dur'))||150;
      this.root.querySelector('.ticker-content')!.animate([{opacity:0,transform:`translateY(${distance})`},{opacity:1,transform:'translateY(0)'}],{duration,easing:'ease-in-out'});
    }
  }
  private tickerMessage(message:string){
    this.items=[];this.ticker.hidden=true;this.ticker.removeAttribute('href');
    this.placeholder.hidden=false;this.placeholder.textContent=message;
    this.syncRotation();
  }
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
    (this.root.querySelector('.refresh-warning') as HTMLElement).hidden=true;
    const previous=this.previous.get(this.selected);
    if(previous)this.render(previous);
    else {this.list.replaceChildren();this.list.hidden=true;this.status.hidden=true;this.tickerMessage('인기글을 불러오는 중입니다.');this.stamp.textContent='';}
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
      const site=this.getAttribute('site');
      const blogOrigin=site?normalizeBlogOrigin(this.getAttribute('blog-origin')):BLOG_ORIGIN;
      if(site&&!blogOrigin)throw new Error('Blog origin is required');
      if(site)endpoint.searchParams.set('site',site);
      const response=await fetch(endpoint,{signal:controller.signal,credentials:'omit'});
      if(!response.ok)throw new Error('Ranking request failed');
      const value=await response.json() as RankingResponse;
      if((site&&value.blogOrigin!==blogOrigin)||value.window!==this.selected||value.metric!=='deduplicatedViews'||!Array.isArray(value.items)||!Number.isFinite(Date.parse(value.generatedAt)))throw new Error('Invalid ranking response');
      value.items=value.items.filter(item=>typeof item.title==='string'&&item.title.length<=300&&postIdFromUrl(item.url,blogOrigin!)===item.postId&&new URL(item.url).origin===blogOrigin&&Number.isInteger(item.views)&&item.views>0).slice(0,5);
      if(generation!==this.generation||!this.isConnected)return;
      this.previous.set(this.selected,value);
      this.render(value);
    }catch{
      if(generation!==this.generation||!this.isConnected)return;
      this.status.hidden=!previous;
      if(!previous)this.tickerMessage('인기글을 불러오지 못했습니다.');
      (this.root.querySelector('.refresh-warning') as HTMLElement).hidden=!previous;
      this.status.textContent=previous?'갱신하지 못했습니다. 이전 결과를 표시합니다.':'';
      this.status.classList.toggle('compact',Boolean(previous));
      this.retry.hidden=false;
    }finally{
      clearTimeout(timer);
      if(generation===this.generation)this.removeAttribute('aria-busy');
    }
  }

  private render(data:RankingResponse){
    const focused=this.root.activeElement;
    const focusedUrl=focused instanceof HTMLAnchorElement&&focused.classList.contains('post-link')?focused.href:null;
    const currentId=this.items[this.current]?.postId;
    this.items=data.items;
    this.current=Math.max(0,this.items.findIndex(item=>item.postId===currentId));
    if(this.items.length)this.showTicker();else this.tickerMessage('아직 집계된 글이 없습니다.');
    this.syncRotation();
    this.list.replaceChildren();
    this.list.hidden=!data.items.length;
    this.status.classList.remove('compact');
    this.status.hidden=true;
    this.status.textContent='';
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
    if(focusedUrl)this.root.querySelectorAll<HTMLAnchorElement>('.post-link').forEach(link=>{if(link.href===focusedUrl)link.focus({preventScroll:true});});
  }
}
