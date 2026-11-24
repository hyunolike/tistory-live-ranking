import {Parser} from 'htmlparser2';
import {normalizeBlogOrigin,postIdFromUrl,type RankingResponse,type RankingWindow} from '../shared/contracts.ts';
import {fetchPost,readLimited,sitemapIds} from '../shared/catalog.ts';
import {ranking,recordView,CATALOG_TTL} from './storage.ts';
import {HttpError,json,readJson,fingerprint,type Env} from './http.ts';

interface Site {id:string;origin:string;status:'pending'|'active';checked_at:number;sync_at:number}
async function siteById(db:D1Database,id:string):Promise<Site>{
 if(!/^(?:hyunolike|[a-f0-9]{32})$/.test(id))throw new HttpError(404,'Site not found');
 const site=await db.prepare('SELECT * FROM sites WHERE id=?').bind(id).first<Site>();
 if(!site)throw new HttpError(404,'Site not found');return site;
}
function publicSite(site:Site){return {id:site.id,origin:site.origin,status:site.status};}
function installed(html:string,site:Site,serviceOrigin:string){
 let found=false,inert=0;const stack:boolean[]=[];
 const parser=new Parser({onopentag(name,a){
  const hidden=inert>0||['template','noscript','style'].includes(name);stack.push(hidden);if(hidden)inert++;
  if(!hidden&&name==='script'&&a['data-site']===site.id&&a['data-track']!=='false'&&!('nomodule' in a)&&(!a.type||['text/javascript','application/javascript'].includes(a.type))){try{const url=new URL(a.src);if(url.origin===serviceOrigin&&url.pathname==='/widget.js')found=true;}catch{}}
 },onclosetag(){if(stack.pop())inert--;}});parser.end(html);return found;
}
async function attemptLimit(db:D1Database,key:string,bucket:number,max:number){
 const row=await db.prepare('INSERT INTO site_limits(fingerprint,bucket,hits) VALUES (?,?,1) ON CONFLICT(fingerprint,bucket) DO UPDATE SET hits=hits+1 RETURNING hits').bind(key,bucket).first<{hits:number}>();
 if(!row||row.hits>max)throw new HttpError(429,'Too many requests');
}
async function sitemap(db:D1Database,site:Site,now:number){
 const response=await fetch(`${site.origin}/sitemap.xml`,{redirect:'manual',signal:AbortSignal.timeout(10_000)});
 if(!response.ok)throw new HttpError(422,'Could not read this blog sitemap');
 const ids=sitemapIds(await readLimited(response,256*1024),site.origin);
 await db.batch(ids.map(id=>db.prepare('INSERT INTO site_posts(site_id,id,url) VALUES (?,?,?) ON CONFLICT(site_id,id) DO UPDATE SET listed=1').bind(site.id,id,`${site.origin}/${id}`)));
 await db.prepare('UPDATE site_posts SET active=0,listed=0 WHERE site_id=? AND id NOT IN (SELECT value FROM json_each(?))').bind(site.id,JSON.stringify(ids)).run();
 await db.prepare('UPDATE sites SET sync_at=? WHERE id=?').bind(now,site.id).run();
 return ids;
}
async function checkPost(db:D1Database,site:Site,id:string,now:number){
 await db.prepare('UPDATE site_posts SET checked_at=? WHERE site_id=? AND id=?').bind(now,site.id,id).run();
 const post=await fetchPost(id,now,site.origin);
 if(post)await db.prepare('UPDATE site_posts SET title=?,url=?,active=1,verified_at=? WHERE site_id=? AND id=? AND listed=1').bind(post.title,post.url,now,site.id,id).run();
 else await db.prepare('UPDATE site_posts SET active=0 WHERE site_id=? AND id=?').bind(site.id,id).run();
 return Boolean(post);
}
async function verify(db:D1Database,site:Site,serviceOrigin:string,now:number){
 // Reserve the attempt atomically, including failures, before any network request.
 const claimed=await db.prepare('UPDATE sites SET checked_at=? WHERE id=? AND checked_at<=? RETURNING id').bind(now,site.id,now-60_000).first();
 if(!claimed)throw new HttpError(429,'Wait one minute before checking again');
 const response=await fetch(`${site.origin}/`,{redirect:'manual',signal:AbortSignal.timeout(10_000)});
 if(!response.ok)throw new HttpError(422,'Could not open this blog');
 if(!installed(await readLimited(response,1024*1024),site,serviceOrigin))throw new HttpError(409,'Installation code was not found on the blog homepage');
 const ids=await sitemap(db,site,now);let count=0;
 const candidates=await db.prepare('SELECT id FROM site_posts WHERE site_id=? AND id IN (SELECT value FROM json_each(?)) ORDER BY checked_at,id LIMIT 3').bind(site.id,JSON.stringify(ids)).all<{id:string}>();
 for(const {id} of candidates.results){try{if(await checkPost(db,site,id,now))count++;}catch{}}
 if(!count)throw new HttpError(422,'No supported public articles were verified');
 await db.prepare("UPDATE sites SET status='active',verified_at=? WHERE id=?").bind(now,site.id).run();
 return {...publicSite(site),status:'active'};
}
async function ensurePost(db:D1Database,site:Site,id:string,now:number){
 const post=await db.prepare('SELECT active,verified_at,checked_at FROM site_posts WHERE site_id=? AND id=? AND listed=1').bind(site.id,id).first<{active:number;verified_at:number;checked_at:number}>();
 if(!post)return false;
 if(post.active&&post.verified_at>=now-CATALOG_TTL)return true;
 // Only crawl paths already present in the verified site's sitemap.
 if(post.checked_at>now-60_000)return false;
 const claim=await db.prepare('UPDATE site_posts SET checked_at=? WHERE site_id=? AND id=? AND checked_at<=? RETURNING id').bind(now,site.id,id,now-60_000).first();
 if(!claim)return false;
 try{return await checkPost(db,site,id,now);}catch{return false;}
}
async function collect(db:D1Database,site:Site,id:string,hash:string,now:number){
 if(!await ensurePost(db,site,id,now))return false;
 const result=await db.batch([
  db.prepare('SELECT id FROM site_posts WHERE site_id=? AND id=? AND active=1 AND listed=1 AND verified_at>=?').bind(site.id,id,now-CATALOG_TTL),
  db.prepare(`INSERT INTO site_dedup(site_id,post_id,fingerprint,last_seen) SELECT site_id,id,?,? FROM site_posts WHERE site_id=? AND id=? AND active=1 AND listed=1 AND verified_at>=?
   ON CONFLICT(site_id,post_id,fingerprint) DO UPDATE SET last_seen=excluded.last_seen WHERE site_dedup.last_seen<=?`).bind(hash,now,site.id,id,now-CATALOG_TTL,now-30*60_000),
  db.prepare('INSERT INTO site_views(site_id,post_id,viewed_at) SELECT ?,?,? WHERE changes()=1').bind(site.id,id,now),
  db.prepare('UPDATE sites SET collected_since=COALESCE(collected_since,?) WHERE id=? AND EXISTS(SELECT 1 FROM site_views WHERE site_id=?)').bind(now,site.id,site.id)
 ]);return result[0].results.length>0;
}
async function ranks(db:D1Database,site:Site,window:RankingWindow,now:number):Promise<RankingResponse>{
 if(site.id==='hyunolike')return {...await ranking(db,window,now),blogOrigin:site.origin};
 const [posts,meta]=await db.batch([
  db.prepare(`SELECT p.id AS postId,p.title,p.url,COUNT(*) AS views FROM site_views v JOIN site_posts p ON p.site_id=v.site_id AND p.id=v.post_id
   WHERE p.site_id=? AND p.active=1 AND p.listed=1 AND p.verified_at>=? AND v.viewed_at>=? AND v.viewed_at<=? GROUP BY p.id
   ORDER BY views DESC,CAST(p.id AS INTEGER),p.id LIMIT 5`).bind(site.id,now-CATALOG_TTL,now-(window==='1h'?3600_000:24*3600_000),now),
  db.prepare('SELECT collected_since FROM sites WHERE id=?').bind(site.id)
 ]);
 const since=(meta.results[0] as {collected_since:number|null}).collected_since;
 return {blogOrigin:site.origin,window,generatedAt:new Date(now).toISOString(),collectedSince:since?new Date(since).toISOString():null,metric:'deduplicatedViews',items:posts.results.map((p:any,i:number)=>({...p,rank:i+1}))};
}

export async function siteRoute(request:Request,env:Env):Promise<Response|null>{
 const url=new URL(request.url),match=/^\/api\/sites\/([^/]+)(\/verify)?$/.exec(url.pathname);
 const selected=url.searchParams.get('site');
 if(url.pathname!=='/api/sites'&&!match&&!(selected!==null&&['/api/views','/api/rankings'].includes(url.pathname)))return null;
 let cors:Record<string,string>={};
 try{
  const now=Date.now();
  if(url.pathname==='/api/sites'||match){
   if(request.method==='GET'&&match&&!match[2])return json(publicSite(await siteById(env.DB,match[1])));
   if(request.method!=='POST')throw new HttpError(405,'POST required');
   if(request.headers.get('Origin')!==url.origin)throw new HttpError(403,'Use the installation page to register');
   if(match){await readJson(request);return json(await verify(env.DB,await siteById(env.DB,match[1]),url.origin,now));}
   const value=await readJson(request),origin=normalizeBlogOrigin(value.url);
   if(!origin)throw new HttpError(400,'Enter a Tistory blog homepage address');
   const existing=await env.DB.prepare('SELECT * FROM sites WHERE origin=?').bind(origin).first<Site>();
   if(existing)return json(publicSite(existing),201);
   await attemptLimit(env.DB,'register:'+await fingerprint(request,env,now),Math.floor(now/3600_000),5);
   const id=crypto.randomUUID().replaceAll('-','');
   await env.DB.prepare('INSERT OR IGNORE INTO sites(id,origin,created_at) VALUES (?,?,?)').bind(id,origin,now).run();
   return json(publicSite((await env.DB.prepare('SELECT * FROM sites WHERE origin=?').bind(origin).first<Site>())!),201);
  }
  if(!selected)throw new HttpError(404,'Site not found');
  const site=await siteById(env.DB,selected);
  if(url.pathname==='/api/rankings'){
   cors={'Access-Control-Allow-Origin':'*'};
   if(request.method!=='GET')throw new HttpError(405,'GET required');
   if(site.status!=='active')throw new HttpError(409,'Install and verify the widget first');
   const window=url.searchParams.get('window')??'24h';if(window!=='1h'&&window!=='24h')throw new HttpError(400,'Window must be 1h or 24h');
   return json(await ranks(env.DB,site,window,now),200,{...cors,'Cache-Control':'public, max-age=30'});
  }
  if(request.headers.get('Origin')!==site.origin)throw new HttpError(403,'Origin not allowed');
  cors={'Access-Control-Allow-Origin':site.origin,'Vary':'Origin'};
  if(request.method==='OPTIONS'){
   if(request.headers.get('Access-Control-Request-Method')!=='POST')throw new HttpError(405,'POST required');
   if((request.headers.get('Access-Control-Request-Headers')??'').split(',').some(h=>h.trim()&&h.trim().toLowerCase()!=='content-type'))throw new HttpError(403,'Header not allowed');
   return new Response(null,{status:204,headers:{...cors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
  }
  if(request.method!=='POST')throw new HttpError(405,'POST required');
  if(site.status!=='active')throw new HttpError(409,'Install and verify the widget first');
  const value=await readJson(request),id=value.postId;
  if(typeof id!=='string'||postIdFromUrl(`${site.origin}/${id}`,site.origin)!==id)throw new HttpError(400,'Invalid post ID');
  const hash=await fingerprint(request,env,now);
  if(site.id==='hyunolike'){
   const rate=await env.DB.prepare('INSERT INTO rate_limits(fingerprint,minute,hits) VALUES (?,?,1) ON CONFLICT(fingerprint,minute) DO UPDATE SET hits=hits+1 RETURNING hits').bind(hash,Math.floor(now/60_000)).first<{hits:number}>();
   if(!rate||rate.hits>30)throw new HttpError(429,'Too many requests');
  }else await attemptLimit(env.DB,`views:${site.id}:${hash}`,Math.floor(now/60_000),30);
  const accepted=site.id==='hyunolike'?await recordView(env.DB,id,hash,now):await collect(env.DB,site,id,hash,now);
  if(!accepted)throw new HttpError(404,'Post not found');return json({accepted:true},202,cors);
 }catch(error){
  const status=error instanceof HttpError?error.status:503;
  if(status===503)console.error('site_request_failed');
  return json({error:error instanceof HttpError?error.message:'Service temporarily unavailable'},status,{...cors,...(status===429?{'Retry-After':'60'}:{})});
 }
}
export async function refreshSites(db:D1Database,now:number){
 await db.batch([
  db.prepare('DELETE FROM site_views WHERE viewed_at<?').bind(now-7*24*3600_000),
  db.prepare('DELETE FROM site_dedup WHERE last_seen<?').bind(now-30*60_000),
  db.prepare("DELETE FROM site_limits WHERE (fingerprint LIKE 'register:%' AND bucket<?) OR (fingerprint LIKE 'views:%' AND bucket<?)").bind(Math.floor(now/3600_000)-48,Math.floor(now/60_000)-5)
 ]);
 const sites=await db.prepare("SELECT * FROM sites WHERE status='active' AND id!='hyunolike' ORDER BY sync_at,id LIMIT 3").all<Site>();
 for(const site of sites.results){try{
  await sitemap(db,site,now);
  const posts=await db.prepare('SELECT id FROM site_posts WHERE site_id=? AND listed=1 ORDER BY checked_at,id LIMIT 5').bind(site.id).all<{id:string}>();
  for(const {id} of posts.results){try{await checkPost(db,site,id,now);}catch{}}
 }catch{await db.prepare('UPDATE sites SET sync_at=? WHERE id=?').bind(now,site.id).run();}}
}
