import { mkdir, writeFile, rename } from 'node:fs/promises';
import { BLOG_ORIGIN } from '../src/shared/contracts.ts';
import { fetchPost, sitemapIds, readLimited, type CatalogPost } from '../src/shared/catalog.ts';
import { catalogSql } from './catalog-sql.ts';

const response = await fetch(`${BLOG_ORIGIN}/sitemap.xml`,{signal:AbortSignal.timeout(15_000),redirect:'error'});
if(!response.ok)throw new Error(`Sitemap HTTP ${response.status}`);
const ids = sitemapIds(await readLimited(response,256*1024));
const posts:CatalogPost[]=[];
for(let offset=0;offset<ids.length;offset+=4){
  const batch=await Promise.all(ids.slice(offset,offset+4).map(id=>fetchPost(id,Date.now())));
  posts.push(...batch.filter((post):post is CatalogPost=>post!==null));
}
if(!posts.length)throw new Error('No verified public posts; existing catalog preserved');
posts.sort((a,b)=>Number(a.id)-Number(b.id));
const sql=catalogSql(posts);
await mkdir('data',{recursive:true});
await writeFile('data/posts.json.tmp',JSON.stringify(posts,null,2)+'\n');
await writeFile('data/catalog.sql.tmp',sql);
await rename('data/posts.json.tmp','data/posts.json');
await rename('data/catalog.sql.tmp','data/catalog.sql');
console.log(`Verified ${posts.length}/${ids.length} public posts → data/posts.json and data/catalog.sql (no view counts imported)`);
