import {test,expect} from '@playwright/test';
import {readFile} from 'node:fs/promises';
const id='a'.repeat(32),origin='https://other-blog.tistory.com';

test('a blog owner registers an address, receives code and checks installation',async({page})=>{
 let checks=0;
 await page.route('**/api/sites',async route=>{expect(route.request().postDataJSON()).toEqual({url:origin});await route.fulfill({status:201,json:{id,origin,status:'pending'}});});
 await page.route(`**/api/sites/${id}/verify`,async route=>{checks++;await route.fulfill(checks===1?{status:409,json:{error:'Installation code was not found on the blog homepage'}}:{json:{id,origin,status:'active'}});});
 await page.goto('/start/');
 await page.getByLabel('티스토리 블로그 주소').fill(origin);await page.getByRole('button',{name:'설치 코드 만들기'}).click();
 await expect(page.locator('#install-code')).toContainText(`data-site="${id}"`);
 await expect(page.locator('#install-code')).toContainText(`blog-origin="${origin}"`);
 expect(checks).toBe(0);
 await page.getByRole('button',{name:'설치 확인하기'}).click();
 await expect(page.getByRole('status')).toContainText('설치 코드');
 await page.getByRole('button',{name:'설치 확인하기'}).click();
 await expect(page.getByRole('status')).toContainText('집계를 시작');
});
test('registration errors do not reveal an obsolete installation result',async({page})=>{
 let good=true;
 await page.route('**/api/sites',r=>r.fulfill(good?{status:201,json:{id,origin,status:'pending'}}:{status:429,json:{error:'Too many requests'}}));
 await page.goto('/start/');await page.getByLabel('티스토리 블로그 주소').fill(origin);await page.getByRole('button',{name:'설치 코드 만들기'}).click();await expect(page.locator('#installation')).toBeVisible();
 good=false;await page.getByLabel('티스토리 블로그 주소').fill('https://next-blog.tistory.com');await page.getByRole('button',{name:'설치 코드 만들기'}).click();
 await expect(page.getByRole('status')).toContainText('잠시');await expect(page.locator('#installation')).toBeHidden();
});
for(const width of [320,1440])test(`installation page fits a ${width}px viewport with generated code`,async({page})=>{
 await page.setViewportSize({width,height:1000});await page.route('**/api/sites',r=>r.fulfill({status:201,json:{id,origin,status:'pending'}}));
 await page.goto('/start/');await page.getByLabel('티스토리 블로그 주소').fill(origin);await page.getByRole('button',{name:'설치 코드 만들기'}).click();await expect(page.locator('#installation')).toBeVisible();
 expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
 await page.screenshot({path:`docs/images/onboarding-${width}.png`,fullPage:true});
});
test('a generic Tistory skin sends the site ID and renders only its own article links',async({page})=>{
 const widget=await readFile('dist/public/widget.js','utf8');const requests:any[]=[];
 await page.route('https://widgets.test/widget.js',r=>r.fulfill({contentType:'application/javascript',body:widget}));
 await page.route('https://widgets.test/api/**',async r=>{
  const url=new URL(r.request().url());
  if(r.request().method()==='OPTIONS')return r.fulfill({status:204,headers:{'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type'}});
  if(url.pathname==='/api/views'){requests.push({site:url.searchParams.get('site'),...r.request().postDataJSON()});return r.fulfill({status:202,json:{accepted:true},headers:{'Access-Control-Allow-Origin':origin}});}
  await r.fulfill({json:{blogOrigin:origin,window:'24h',generatedAt:new Date().toISOString(),collectedSince:null,metric:'deduplicatedViews',items:[{postId:'entry/hello',title:'다른 블로그 글',url:`${origin}/entry/hello`,views:1,rank:1},{postId:'1',title:'다른 곳의 글',url:'https://third-blog.tistory.com/1',views:9,rank:2}]},headers:{'Access-Control-Allow-Origin':'*'}});
 });
 await page.route(`${origin}/entry/hello`,r=>r.fulfill({contentType:'text/html',body:`<meta property="og:type" content="article"><div class="contents_style">본문</div><blog-live-ranking site="${id}" blog-origin="${origin}"></blog-live-ranking><script src="https://widgets.test/widget.js" data-site="${id}" defer></script>`}));
 await page.goto(`${origin}/entry/hello`);await expect.poll(()=>requests.length).toBe(1);expect(requests).toEqual([{site:id,postId:'entry/hello'}]);
 await expect(page.locator('blog-live-ranking').getByRole('link',{name:/다른 블로그 글/})).toHaveAttribute('href',`${origin}/entry/hello`);
 await expect(page.getByRole('link',{name:'다른 곳의 글'})).toHaveCount(0);
});
