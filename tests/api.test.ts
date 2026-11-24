import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare['getD1Database']>>;

before(async () => {
  const bundled = await build({ entryPoints: ['src/worker/index.ts'], bundle: true, format: 'esm', write: false });
  mf = new Miniflare({
    modules: true, script: bundled.outputFiles[0].text, compatibilityDate: '2026-07-30',
    d1Databases: ['DB'], bindings: {
      BLOG_ORIGIN: 'https://hyunolike.tistory.com', ENVIRONMENT: 'production',
      DEDUP_SECRET: 'test-only-secret-long-enough-for-hmac-key'
    }
  });
  db = await mf.getD1Database('DB');
});

after(async () => { await mf?.dispose(); });

beforeEach(async () => {
  const schema = await readFile('migrations/0001_initial.sql', 'utf8');
  await db.exec('DROP TABLE IF EXISTS views; DROP TABLE IF EXISTS dedup; DROP TABLE IF EXISTS rate_limits; DROP TABLE IF EXISTS metadata; DROP TABLE IF EXISTS posts;');
  await db.exec(schema.replace(/\n/g, ' '));
  await db.prepare("INSERT INTO posts (id, title, url, active) VALUES ('1','첫 번째 글','https://hyunolike.tistory.com/1',1),('2','두 번째 글','https://hyunolike.tistory.com/2',1),('3','삭제된 글','https://hyunolike.tistory.com/3',0)").run();
  await db.prepare('UPDATE posts SET verified_at = ?').bind(Date.now()).run();
});

function collect(postId: unknown = '1', ip = '192.0.2.1', origin = 'https://hyunolike.tistory.com') {
  return mf.dispatchFetch('https://ranking.test/api/views', {
    method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ postId })
  });
}

test('rejects a foreign origin without writing a view', async () => {
  assert.equal((await collect('1', '192.0.2.1', 'https://evil.test')).status, 403);
  assert.equal((await db.prepare('SELECT COUNT(*) AS n FROM views').first<{n:number}>())?.n, 0);
});

test('only registered active posts are counted and invalid payloads are rejected', async () => {
  assert.equal((await collect('999')).status, 404);
  assert.equal((await collect('3')).status, 404);
  assert.equal((await collect('../1')).status, 400);
  assert.equal((await collect(1)).status, 400);
  assert.equal((await collect('1')).status, 202);
});

test('concurrent duplicate views are inserted exactly once', async () => {
  const responses = await Promise.all(Array.from({ length: 8 }, () => collect()));
  assert.deepEqual(responses.map(r => r.status), [202,202,202,202,202,202,202,202]);
  const ranking = await (await mf.dispatchFetch('https://ranking.test/api/rankings?window=1h')).json() as any;
  assert.equal(ranking.items[0].views, 1);
  assert.equal(ranking.metric, 'deduplicatedViews');
  assert.equal(ranking.items[0].url, 'https://hyunolike.tistory.com/1');
});

test('dedup expires after 30 minutes and independent IPs count separately', async () => {
  await collect();
  await db.prepare('UPDATE dedup SET last_seen = ?').bind(Date.now() - 30 * 60_000 - 1000).run();
  await collect();
  await collect('1', '192.0.2.2');
  const row = await db.prepare('SELECT COUNT(*) AS n FROM views').first<{n:number}>();
  assert.equal(row?.n, 3);
});

test('ranking excludes old, future and inactive views with deterministic ties', async () => {
  const now = Date.now();
  for (const [id, at] of [['1',now-10_000],['2',now-20_000],['2',now-2*3600_000],['1',now-25*3600_000],['1',now+3600_000],['3',now-10_000]] as const) {
    await db.prepare('INSERT INTO views(post_id,viewed_at) VALUES (?,?)').bind(id,at).run();
  }
  const hour = await (await mf.dispatchFetch('https://ranking.test/api/rankings?window=1h')).json() as any;
  assert.deepEqual(hour.items.map((i:any) => [i.postId,i.views,i.rank]), [['1',1,1],['2',1,2]]);
  const day = await (await mf.dispatchFetch('https://ranking.test/api/rankings?window=24h')).json() as any;
  assert.deepEqual(day.items.map((i:any) => [i.postId,i.views]), [['2',2],['1',1]]);
  assert.equal((await mf.dispatchFetch('https://ranking.test/api/rankings?window=7d')).status, 400);
});

test('the 31st request in a minute is rate limited including duplicates', async () => {
  for (let n = 0; n < 30; n++) assert.equal((await collect()).status, 202);
  const response = await collect();
  assert.equal(response.status, 429);
  assert.ok(response.headers.get('Retry-After'));
});

test('API validation rejects oversized and non-JSON requests', async () => {
  const headers = { Origin: 'https://hyunolike.tistory.com', 'CF-Connecting-IP': '192.0.2.1' };
  const plain = await mf.dispatchFetch('https://ranking.test/api/views', { method:'POST', headers, body:'hello' });
  assert.equal(plain.status, 415);
  const huge = await mf.dispatchFetch('https://ranking.test/api/views', { method:'POST', headers:{...headers,'Content-Type':'application/json'}, body:JSON.stringify({postId:'1',padding:'x'.repeat(1100)}) });
  assert.equal(huge.status, 413);
  assert.equal((await mf.dispatchFetch('https://ranking.test/api/views')).status, 405);
});

test('preflight exposes only the configured origin', async () => {
  const response = await mf.dispatchFetch('https://ranking.test/api/views', { method:'OPTIONS', headers:{Origin:'https://hyunolike.tistory.com','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'} });
  assert.equal(response.status, 204);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), 'https://hyunolike.tistory.com');
  const denied = await mf.dispatchFetch('https://ranking.test/api/views', { method:'OPTIONS', headers:{Origin:'https://evil.test'} });
  assert.equal(denied.status, 403);
});

test('catalog entries unverified for 24 hours stop accepting views and disappear', async () => {
  await collect();
  await db.prepare('UPDATE posts SET verified_at = ?').bind(Date.now()-25*3600_000).run();
  assert.equal((await collect()).status, 404);
  const result = await (await mf.dispatchFetch('https://ranking.test/api/rankings')).json() as any;
  assert.deepEqual(result.items, []);
});

