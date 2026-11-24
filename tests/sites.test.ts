import {test,before,beforeEach,after} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {build} from 'esbuild';
import {Miniflare} from 'miniflare';
let mf:Miniflare,db:any;
let installed=new Map<string,string>();let upstream:string[]=[];let ids=['1','entry/hello'];let invalid=new Set<string>();let proofType='';
before(async()=>{
 const bundled=await build({entryPoints:['src/worker/index.ts'],bundle:true,format:'esm',write:false});
 mf=new Miniflare({modules:true,script:bundled.outputFiles[0].text,compatibilityDate:'2026-07-30',d1Databases:['DB'],bindings:{BLOG_ORIGIN:'https://hyunolike.tistory.com',ENVIRONMENT:'production',DEDUP_SECRET:'test-only-secret-long-enough-for-hmac-key'},outboundService:async(request:Request)=>{
  upstream.push(request.url);const url=new URL(request.url),site=installed.get(url.origin);
  if(url.pathname==='/')return new Response(site?`<script src="https://ranking.test/widget.js" data-site="${site}" ${proofType} defer></script>`:'<pre>&lt;script data-site="fake"&gt;</pre>');
  if(url.pathname==='/sitemap.xml')return new Response(`<urlset>${ids.map(id=>`<loc>${url.origin}/${id}</loc>`).join('')}</urlset>`);
  if(invalid.has(url.pathname.slice(1)))return new Response('<input type="password">');
  return new Response(`<meta property="og:type" content="article"><meta property="og:title" content="${url.hostname} 글"><link rel="canonical" href="${request.url}"><div class="contents_style">본문</div>`);
 }});db=await mf.getD1Database('DB');
});
after(async()=>mf?.dispose());
beforeEach(async()=>{
 installed=new Map();upstream=[];ids=['1','entry/hello'];invalid=new Set();proofType='';
 await db.exec('DROP TABLE IF EXISTS site_views; DROP TABLE IF EXISTS site_dedup; DROP TABLE IF EXISTS site_posts; DROP TABLE IF EXISTS site_limits; DROP TABLE IF EXISTS sites; DROP TABLE IF EXISTS views; DROP TABLE IF EXISTS dedup; DROP TABLE IF EXISTS rate_limits; DROP TABLE IF EXISTS metadata; DROP TABLE IF EXISTS posts;');
 for(const file of ['0001_initial.sql','0002_catalog_attempts.sql','0003_sites.sql']){
  try{await db.exec((await readFile(`migrations/${file}`,'utf8')).replace(/\n/g,' '));}catch(error:any){if(error.code!=='ENOENT')throw error;}
 }
 await db.prepare('INSERT INTO posts(id,title,url,active,verified_at) VALUES (?,?,?,?,?)').bind('1','기존 글','https://hyunolike.tistory.com/1',1,Date.now()).run();
});
function post(path:string,value:any,origin='https://ranking.test',ip='192.0.2.1'){
 return mf.dispatchFetch('https://ranking.test'+path,{method:'POST',headers:{Origin:origin,'Content-Type':'application/json','CF-Connecting-IP':ip},body:JSON.stringify(value)});
}
async function register(url='https://first-blog.tistory.com'){
 const response=await post('/api/sites',{url});assert.equal(response.status,201);return response.json() as Promise<any>;
}
async function activate(origin:string){const site=await register(origin);installed.set(origin,site.id);const r=await post(`/api/sites/${site.id}/verify`,{});assert.equal(r.status,200,await r.clone().text());return site;}

test('registration issues a stable pending ID and performs no crawl until installation',async()=>{
 const a=await register(),b=await register('first-blog.tistory.com');assert.equal(a.id,b.id);assert.equal(a.status,'pending');assert.equal(a.origin,'https://first-blog.tistory.com');assert.equal(upstream.length,0);
 assert.equal((await post(`/api/views?site=${a.id}`,{postId:'1'},a.origin)).status,409);
 assert.equal((await post(`/api/sites/${a.id}/verify`,{})).status,409);
 assert.deepEqual(upstream,['https://first-blog.tistory.com/']);
});
test('registration rejects SSRF-shaped inputs and non-service writes',async()=>{
 for(const url of ['https://evil.test','https://a.tistory.com.evil.test','https://a.b.tistory.com','https://a.tistory.com@127.0.0.1','https://first-blog.tistory.com:9443','https://first-blog.tistory.com/path','https://first-blog.tistory.com?x=1'])assert.equal((await post('/api/sites',{url})).status,400,url);
 assert.equal((await post('/api/sites',{url:'https://first-blog.tistory.com'},'https://evil.test')).status,403);assert.equal(upstream.length,0);
});
test('verified installations isolate identical post IDs, counts and collection dates by site',async()=>{
 const a=await activate('https://first-blog.tistory.com'),b=await activate('https://second-blog.tistory.com');
 assert.equal((await post(`/api/views?site=${a.id}`,{postId:'1'},a.origin)).status,202);
 assert.equal((await post(`/api/views?site=${b.id}`,{postId:'1'},b.origin)).status,202);
 assert.equal((await post(`/api/views?site=${a.id}`,{postId:'1'},b.origin)).status,403);
 for(const site of [a,b]){const value:any=await(await mf.dispatchFetch(`https://ranking.test/api/rankings?site=${site.id}`)).json();assert.equal(value.items.length,1);assert.equal(value.items[0].views,1);assert.equal(value.items[0].url,`${site.origin}/1`);assert.equal(value.blogOrigin,site.origin);assert.ok(value.collectedSince);}
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM views').first()).n,0);
});
test('concurrent duplicates and string-address posts use the selected site catalog',async()=>{
 const site=await activate('https://first-blog.tistory.com');
 const responses=await Promise.all(Array.from({length:8},()=>post(`/api/views?site=${site.id}`,{postId:'entry/hello'},site.origin)));
 assert.ok(responses.every(r=>r.status===202));const value:any=await(await mf.dispatchFetch(`https://ranking.test/api/rankings?site=${site.id}`)).json();assert.equal(value.items[0].views,1);assert.equal(value.items[0].postId,'entry/hello');
});
test('new registration limits do not allow unlimited anonymous creation',async()=>{
 for(let i=0;i<5;i++)assert.equal((await post('/api/sites',{url:`https://new-${i}.tistory.com`})).status,201);
 assert.equal((await post('/api/sites',{url:'https://one-too-many.tistory.com'})).status,429);
});
test('site selection preserves legacy collection and rank API behavior',async()=>{
 assert.equal((await post('/api/views',{postId:'1'},'https://hyunolike.tistory.com')).status,202);
 const site=await register('https://hyunolike.tistory.com');assert.equal(site.id,'hyunolike');
 const ranking:any=await(await mf.dispatchFetch(`https://ranking.test/api/rankings?site=${site.id}`)).json();assert.equal(ranking.items[0].views,1);assert.equal(ranking.items[0].url,'https://hyunolike.tistory.com/1');
});


test('installation verification rotates failed candidates rather than getting stuck on the first three',async()=>{
 ids=['1','2','3','4'];invalid=new Set(['1','2','3']);
 const site=await register();installed.set(site.origin,site.id);
 await post(`/api/sites/${site.id}/verify`,{});
 await db.prepare('UPDATE sites SET checked_at=0 WHERE id=?').bind(site.id).run();
 const next=await post(`/api/sites/${site.id}/verify`,{});
 assert.equal(next.status,200,await next.clone().text());
});
test('inert script types and disabled collectors do not prove an installation',async()=>{
 const site=await register();installed.set(site.origin,site.id);
 for(const type of ['type="module"','type="text/plain"','data-track="false"','nomodule']){
  proofType=type;await db.prepare('UPDATE sites SET checked_at=0 WHERE id=?').bind(site.id).run();
  assert.equal((await post(`/api/sites/${site.id}/verify`,{})).status,409,type);
 }
});
test('a sitemap article outside the initial batch is verified on its first real visit',async()=>{
 ids=['1','2','3','4'];const site=await activate('https://first-blog.tistory.com');
 const target=(await db.prepare('SELECT id FROM site_posts WHERE site_id=? AND active=0 LIMIT 1').bind(site.id).first()).id;
 assert.equal((await post(`/api/views?site=${site.id}`,{postId:target},site.origin)).status,202);
 assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM site_views WHERE site_id=? AND post_id=?').bind(site.id,target).first()).n,1);
});

test('legacy and site-qualified hyunolike collectors share the same rate budget',async()=>{
 for(let i=0;i<30;i++)assert.equal((await post(i%2?'/api/views?site=hyunolike':'/api/views',{postId:'1'},'https://hyunolike.tistory.com')).status,202);
 assert.equal((await post('/api/views?site=hyunolike',{postId:'1'},'https://hyunolike.tistory.com')).status,429);
});

test('a sitemap-removed article stays out of collection and ranking even with a late public proof',async()=>{
 const site=await activate('https://first-blog.tistory.com');
 await post(`/api/views?site=${site.id}`,{postId:'1'},site.origin);
 await db.prepare('UPDATE site_posts SET listed=0,active=1 WHERE site_id=? AND id=?').bind(site.id,'1').run();
 assert.equal((await post(`/api/views?site=${site.id}`,{postId:'1'},site.origin,'192.0.2.9')).status,404);
 const value:any=await(await mf.dispatchFetch(`https://ranking.test/api/rankings?site=${site.id}`)).json();assert.deepEqual(value.items,[]);
});
