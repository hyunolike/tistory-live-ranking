import { test, expect, type Page } from '@playwright/test';
import { readFile, mkdir } from 'node:fs/promises';

const data = (window = '24h', title = '[AI] HTTP 200인데 챗봇은 답하지 않았다') => ({
  window, generatedAt:'2026-11-24T08:30:00.000Z',collectedSince:'2026-11-23T08:30:00.000Z',metric:'deduplicatedViews',
  items:[{postId:'81',title,url:'https://hyunolike.tistory.com/81',views:28,rank:1}]
});

async function api(page:Page) {
  await page.route('**/api/rankings?*', async route => {
    await route.fulfill({json:data(new URL(route.request().url()).searchParams.get('window')!)});
  });
}

test('demo identifies sample data and makes no analytics requests', async ({page}) => {
  const requests:string[]=[];
  page.on('request',r => {if(r.url().includes('/api/'))requests.push(r.url());});
  await page.goto('/');
  await expect(page.getByText('예시 데이터',{exact:true})).toBeVisible();
  await expect(page.locator('blog-live-ranking').getByRole('listitem')).toHaveCount(5);
  await page.getByRole('button',{name:'최근 1시간',exact:true}).click();
  await expect(page.getByRole('button',{name:'최근 1시간',exact:true})).toHaveAttribute('aria-pressed','true');
  expect(requests).toEqual([]);
});

test('live ranking changes time range and links to the original post', async ({page}) => {
  await api(page);
  await page.goto('/?live=1');
  await expect(page.locator('.preview-note')).toContainText('실제 API 결과');
  await expect(page.getByRole('link',{name:/HTTP 200인데/})).toHaveAttribute('href','https://hyunolike.tistory.com/81');
  await page.getByRole('button',{name:'최근 1시간',exact:true}).click();
  await expect(page.getByRole('button',{name:'최근 1시간',exact:true})).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('blog-live-ranking').getByText('28',{exact:true})).toBeVisible();
});

test('scheduled refresh and failure retain keyboard focus on the same post',async({page})=>{
  await page.clock.install();
  let fail=false;
  await page.route('**/api/rankings?*',r=>r.fulfill(fail?{status:503,json:{error:'down'}}:{json:data()}));
  await page.goto('/?live=1');
  const link=page.getByRole('link',{name:/HTTP 200인데/});
  await link.focus();
  await page.clock.fastForward(60_000);
  await expect(link).toBeFocused();
  fail=true;
  await page.clock.fastForward(60_000);
  await expect(page.getByText('갱신하지 못했습니다. 이전 결과를 표시합니다.')).toBeVisible();
  await expect(link).toBeFocused();
});

test('empty and failure states offer retry without fabricating rankings', async ({page}) => {
  let fail=true;
  await page.route('**/api/rankings?*',route => fail ? route.fulfill({status:503,json:{error:'down'}}) : route.fulfill({json:{...data(),items:[]}}));
  await page.goto('/?live=1');
  await expect(page.getByText('인기글을 불러오지 못했습니다.')).toBeVisible();
  fail=false;
  await page.getByRole('button',{name:'다시 불러오기'}).click();
  await expect(page.getByText('아직 집계된 글이 없습니다.')).toBeVisible();
  await expect(page.locator('blog-live-ranking').getByRole('listitem')).toHaveCount(0);
});

test('late responses cannot overwrite a newly selected window', async ({page}) => {
  await page.route('**/api/rankings?*',async route => {
    const window=new URL(route.request().url()).searchParams.get('window')!;
    if(window==='24h')await new Promise(r=>setTimeout(r,400));
    try {await route.fulfill({json:data(window,window==='1h'?'한 시간 결과':'오래된 결과')});} catch {}
  });
  await page.goto('/?live=1');
  await page.getByRole('button',{name:'최근 1시간',exact:true}).click();
  await expect(page.getByRole('link',{name:'한 시간 결과'})).toBeVisible();
  await page.waitForTimeout(500);
  await expect(page.getByRole('link',{name:'오래된 결과'})).toHaveCount(0);
});

test('untrusted titles remain text and external ranking links are rejected', async ({page}) => {
  await page.route('**/api/rankings?*',route=>route.fulfill({json:{...data('24h','<img src=x onerror=alert(1)>'),items:[...data('24h','<img src=x onerror=alert(1)>').items,{postId:'2',title:'악성 링크',url:'https://evil.test/2',views:10,rank:2}]}}));
  await page.goto('/?live=1');
  await expect(page.getByRole('link',{name:'<img src=x onerror=alert(1)>'})).toBeVisible();
  await expect(page.locator('blog-live-ranking').locator('img')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'악성 링크'})).toHaveCount(0);
});

for(const width of [320,390,1440])test(`widget fits ${width}px with hostile host CSS and visible keyboard focus`,async({page})=>{
  await page.setViewportSize({width,height:1000});
  await page.goto('/');
  await expect(page.locator('blog-live-ranking').getByRole('listitem')).toHaveCount(5);
  await mkdir('docs/images',{recursive:true});
  await page.screenshot({path:`docs/images/preview-${width}.png`,fullPage:true});
  await page.addStyleTag({content:'h2{font-size:99px!important}ol{padding-left:200px!important}button{outline:none!important}'});
  await expect(page.locator('blog-live-ranking').getByRole('listitem')).toHaveCount(5);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  const button=page.getByRole('button',{name:'최근 1시간',exact:true});
  await button.focus();
  await page.keyboard.press('Enter');
  await expect(button).toHaveAttribute('aria-pressed','true');
  expect(await button.evaluate(el=>getComputedStyle(el).outlineStyle)).not.toBe('none');
});

test('polling pauses in a hidden tab and resumes when visible',async({page})=>{
  await page.clock.install();
  let calls=0;
  await page.route('**/api/rankings?*',r=>{calls++;return r.fulfill({json:data()});});
  await page.goto('/?live=1');
  await expect(page.getByRole('link',{name:/HTTP 200인데/})).toBeVisible();
  expect(calls).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>true});document.dispatchEvent(new Event('visibilitychange'));});
  await page.clock.fastForward(120_000);
  expect(calls).toBe(1);
  await page.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,get:()=>false});document.dispatchEvent(new Event('visibilitychange'));});
  await expect.poll(()=>calls).toBe(2);
});

test('a failed refresh retains the previous result for the same window',async({page})=>{
  await page.clock.install();
  let fail=false;
  await page.route('**/api/rankings?*',r=>r.fulfill(fail?{status:503,json:{error:'down'}}:{json:data()}));
  await page.goto('/?live=1');
  await expect(page.getByRole('link',{name:/HTTP 200인데/})).toBeVisible();
  fail=true;
  await page.clock.fastForward(60_000);
  await expect(page.getByText('갱신하지 못했습니다. 이전 결과를 표시합니다.')).toBeVisible();
  await expect(page.getByRole('link',{name:/HTTP 200인데/})).toBeVisible();
});

test('loader collects one public article even if the script is included twice', async ({page}) => {
  const widget=await readFile('dist/public/widget.js','utf8');
  const collects:unknown[]=[];
  await page.route('https://widgets.test/widget.js',r=>r.fulfill({contentType:'application/javascript',body:widget}));
  await page.route('https://widgets.test/api/views',async r=>{
    if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'https://hyunolike.tistory.com','Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'content-type'}});
    collects.push(r.request().postDataJSON());
    await r.fulfill({status:202,json:{accepted:true},headers:{'Access-Control-Allow-Origin':'https://hyunolike.tistory.com'}});
  });
  await page.route('https://hyunolike.tistory.com/81',r=>r.fulfill({contentType:'text/html',body:'<body id="tt-body-page"><div id="article-view">공개 본문</div><script src="https://widgets.test/widget.js"></script><script src="https://widgets.test/widget.js"></script></body>'}));
  await page.goto('https://hyunolike.tistory.com/81');
  await expect.poll(()=>collects.length).toBe(1);
  expect(collects).toEqual([{postId:'81'}]);
});
