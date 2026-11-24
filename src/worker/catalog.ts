import { BLOG_ORIGIN } from '../shared/contracts.ts';
import { fetchPost, sitemapIds } from '../shared/catalog.ts';

export async function refreshCatalog(db: D1Database, now: number): Promise<void> {
  const response = await fetch(`${BLOG_ORIGIN}/sitemap.xml`, { redirect:'manual', signal:AbortSignal.timeout(10_000) });
  if (!response.ok) throw new Error(`Sitemap HTTP ${response.status}`);
  const ids = sitemapIds(await response.text());
  // New entries stay inactive until their public article body is verified.
  await db.batch(ids.map(id => db.prepare('INSERT OR IGNORE INTO posts(id,title,url,active,verified_at) VALUES (?,?,?,0,0)').bind(id,'',`${BLOG_ORIGIN}/${id}`)));
  const idSet = new Set(ids);
  const existing = await db.prepare('SELECT id FROM posts WHERE active=1').all<{id:string}>();
  const missing = existing.results.filter(p => !idSet.has(p.id));
  if (missing.length) await db.batch(missing.map(p => db.prepare('UPDATE posts SET active=0 WHERE id=?').bind(p.id)));
  const pending = await db.prepare('SELECT id FROM posts WHERE id IN (SELECT value FROM json_each(?)) ORDER BY verified_at ASC,CAST(id AS INTEGER) DESC LIMIT 10').bind(JSON.stringify(ids)).all<{id:string}>();
  for (const {id} of pending.results) {
    if (!idSet.has(id)) continue;
    try {
      const post = await fetchPost(id, now);
      if (post) await db.prepare('UPDATE posts SET title=?,url=?,active=1,verified_at=? WHERE id=?').bind(post.title,post.url,now,id).run();
      else await db.prepare('UPDATE posts SET active=0,verified_at=? WHERE id=?').bind(now,id).run();
    } catch {
      // A temporary upstream failure leaves the last proof to expire after 24 hours.
      console.warn('catalog_refresh_failed', id);
    }
  }
}
