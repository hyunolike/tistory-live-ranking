import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePost, sitemapIds } from '../src/shared/catalog.ts';
import { postIdFromUrl } from '../src/shared/contracts.ts';

test('numeric and mobile paths normalize without admitting external links', () => {
  assert.equal(postIdFromUrl('https://hyunolike.tistory.com/m/81?from=x'), '81');
  assert.equal(postIdFromUrl('https://hyunolike.tistory.com/81/'), '81');
  for (const url of ['https://evil.test/81','https://hyunolike.tistory.com/category/81','https://hyunolike.tistory.com/entry/test','https://hyunolike.tistory.com/0']) assert.equal(postIdFromUrl(url), null);
});

const publicHtml = '<meta property="og:type" content="article"><meta content="A &amp; B" property="og:title"><link href="https://hyunolike.tistory.com/81" rel="canonical"><div id="article-view">실제 본문</div>';

test('catalog requires article metadata, matching canonical and public body', () => {
  assert.deepEqual(parsePost(publicHtml, '81', 1000), { id:'81', title:'A & B', url:'https://hyunolike.tistory.com/81', verifiedAt:1000 });
  assert.equal(parsePost(publicHtml.replace('id="article-view"','id="other"'), '81', 1000), null);
  assert.equal(parsePost(publicHtml.replace('/81" rel=', '/80" rel='), '81', 1000), null);
  assert.equal(parsePost(publicHtml + '<div class="area-protected">password</div>', '81', 1000), null);
  assert.equal(parsePost(publicHtml.replace('article"','website"'), '81', 1000), null);
});

test('sitemap deduplicates desktop/mobile IDs and rejects non-urlset documents', () => {
  const xml = '<urlset><url><loc>https://hyunolike.tistory.com/81</loc></url><url><loc>https://hyunolike.tistory.com/m/81</loc></url><url><loc>https://evil.test/1</loc></url></urlset>';
  assert.deepEqual(sitemapIds(xml), ['81']);
  assert.throws(() => sitemapIds('<html>Error</html>'));
  assert.throws(() => sitemapIds('<urlset></urlset>'));
});
