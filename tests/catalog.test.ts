import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parsePost, sitemapIds, readLimited } from '../src/shared/catalog.ts';
import { postIdFromUrl } from '../src/shared/contracts.ts';

test('numeric and mobile paths normalize without admitting external links', () => {
  assert.equal(postIdFromUrl('https://hyunolike.tistory.com/m/81?from=x'), '81');
  assert.equal(postIdFromUrl('https://hyunolike.tistory.com/81/'), '81');
  for (const url of ['https://evil.test/81','https://hyunolike.tistory.com/category/81','https://hyunolike.tistory.com/0']) assert.equal(postIdFromUrl(url), null);
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

test('inert markup cannot prove a public body or spoof head metadata',()=>{
  const withoutBody=publicHtml.replace('<div id="article-view">실제 본문</div>','');
  for(const extra of ['<!-- <div id="article-view">본문</div> -->','<script>const html=\'<div id="article-view">본문</div>\'</script>','<template><div id="article-view">본문</div></template>']){
    assert.equal(parsePost(withoutBody+extra,'81',1000),null);
  }
  assert.equal(parsePost(publicHtml+'<section class="area-protected">잠김</section>','81',1000),null);
  assert.equal(parsePost('<body>'+publicHtml+'</body>','81',1000),null);
});

test('upstream limits count streamed bytes rather than decoded characters',async()=>{
  const response=new Response(new ReadableStream({start(controller){controller.enqueue(new TextEncoder().encode('가나'));controller.enqueue(new TextEncoder().encode('다라'));controller.close();}}));
  await assert.rejects(()=>readLimited(response,10),/limit/i);
  assert.equal(await readLimited(new Response('가'),3),'가');
});


test('Tistory explicit head remains recognizable around an embedded custom widget',()=>{
  const html='<html><head><meta property="og:type" content="article"><meta property="og:title" content="공개 글"><script type="module" src="https://example.com/widget.js"></script><visitor-village count="10"></visitor-village><link rel="canonical" href="https://hyunolike.tistory.com/81"></head><body><div id="article-view">공개 본문</div></body></html>';
  assert.deepEqual(parsePost(html,'81',1000),{id:'81',title:'공개 글',url:'https://hyunolike.tistory.com/81',verifiedAt:1000});
});


test('site-specific origins and string addresses use generic public bodies without accepting protected forms',()=>{
 const origin='https://other-blog.tistory.com';
 const html='<meta property="og:type" content="article"><meta property="og:title" content="제목"><link rel="canonical" href="'+origin+'/entry/hello"><div class="contents_style">본문</div>';
 assert.equal(postIdFromUrl(origin+'/entry/hello',origin),'entry/hello');
 assert.equal(parsePost(html,'entry/hello',1000,origin)?.url,origin+'/entry/hello');
 assert.equal(parsePost(html+'<input type="password">','entry/hello',1000,origin),null);
 assert.equal(parsePost(html.replace(origin,'https://third-blog.tistory.com'),'entry/hello',1000,origin),null);
});
