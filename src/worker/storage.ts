import type { RankingResponse, RankingWindow } from '../shared/contracts.ts';
import type { D1Database } from '@cloudflare/workers-types';

export const CATALOG_TTL = 24 * 3600_000;

export async function recordView(db: D1Database, postId: string, fingerprint: string, now: number): Promise<boolean> {
  // D1 batch is a transaction. changes() refers to the preceding conditional UPSERT.
  const result=await db.batch([
    db.prepare('SELECT id FROM posts WHERE id=? AND active=1 AND verified_at>=?').bind(postId,now-CATALOG_TTL),
    db.prepare(`INSERT INTO dedup(post_id,fingerprint,last_seen) SELECT id,?,? FROM posts WHERE id=? AND active=1 AND verified_at>=?
      ON CONFLICT(post_id,fingerprint) DO UPDATE SET last_seen=excluded.last_seen
      WHERE dedup.last_seen <= ?`).bind(fingerprint,now,postId,now-CATALOG_TTL,now-30*60_000),
    db.prepare('INSERT INTO views(post_id,viewed_at) SELECT ?,? WHERE changes()=1').bind(postId,now),
    db.prepare("INSERT OR IGNORE INTO metadata(key,value) SELECT 'collected_since',? WHERE EXISTS(SELECT 1 FROM views)").bind(String(now))
  ]);
  return result[0].results.length>0;
}

export async function ranking(db: D1Database, window: RankingWindow, now: number): Promise<RankingResponse> {
  const start = now - (window === '1h' ? 3600_000 : 24*3600_000);
  const [results, first] = await db.batch([
    db.prepare(`SELECT p.id AS postId,p.title,p.url,COUNT(*) AS views FROM views v
      JOIN posts p ON p.id=v.post_id WHERE p.active=1 AND p.verified_at>=?
      AND v.viewed_at>=? AND v.viewed_at<=? GROUP BY p.id
      ORDER BY views DESC,CAST(p.id AS INTEGER) ASC LIMIT 5`).bind(now-CATALOG_TTL,start,now),
    db.prepare("SELECT value FROM metadata WHERE key='collected_since'")
  ]);
  const since = (first.results[0] as {value:string} | undefined)?.value;
  return {
    window,generatedAt:new Date(now).toISOString(), collectedSince:since ? new Date(Number(since)).toISOString() : null,
    metric:'deduplicatedViews', items:results.results.map((row:any,i:number) => ({postId:row.postId,title:row.title,url:row.url,views:row.views,rank:i+1}))
  };
}

export async function cleanup(db: D1Database, now: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM views WHERE viewed_at < ?').bind(now-7*24*3600_000),
    db.prepare('DELETE FROM dedup WHERE last_seen < ?').bind(now-30*60_000),
    db.prepare('DELETE FROM rate_limits WHERE minute < ?').bind(Math.floor(now/60_000)-5)
  ]);
}
