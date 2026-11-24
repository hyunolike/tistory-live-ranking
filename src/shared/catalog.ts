import { BLOG_ORIGIN, postIdFromUrl } from './contracts.ts';

export interface CatalogPost { id: string; title: string; url: string; verifiedAt: number }

function decode(value: string): string {
  return value.replace(/&#(x[0-9a-f]+|\d+);|&(amp|quot|apos|lt|gt|nbsp);/gi, (match, numeric: string, named: string) => {
    if (numeric) {
      const code = numeric[0].toLowerCase() === 'x' ? parseInt(numeric.slice(1),16) : Number(numeric);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ({amp:'&',quot:'"',apos:"'",lt:'<',gt:'>',nbsp:' '} as Record<string,string>)[named.toLowerCase()] ?? match;
  });
}

function attrs(tag: string): Record<string,string> {
  return Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map(m => [m[1].toLowerCase(),decode(m[2] ?? m[3])]));
}

export function parsePost(html: string, id: string, now: number): CatalogPost | null {
  const tags = [...html.matchAll(/<(?:meta|link|div|article)\b[^>]*>/gi)].map(m => ({tag:m[0], a:attrs(m[0])}));
  const meta = (property: string) => tags.find(t => t.a.property === property)?.a.content;
  const canonical = tags.find(t => t.a.rel === 'canonical')?.a.href;
  const protectedPage = tags.some(t => /(?:^|\s)(?:area-protected|article-header-protected)(?:\s|$)/.test(t.a.class ?? ''));
  const publicBody = tags.some(t => t.a.id === 'article-view');
  const title = meta('og:title')?.trim();
  if (protectedPage || !publicBody || meta('og:type') !== 'article' || !canonical || postIdFromUrl(canonical) !== id || !title || title.length > 300) return null;
  return { id, title, url:`${BLOG_ORIGIN}/${id}`, verifiedAt:now };
}

export function sitemapIds(xml: string): string[] {
  if (!/<urlset\b/i.test(xml) || !/<\/urlset>/i.test(xml)) throw new Error('Expected a complete sitemap urlset');
  const ids = [...new Set([...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => postIdFromUrl(decode(m[1]))).filter((id): id is string => id !== null))];
  if (!ids.length || ids.length > 1000) throw new Error('Sitemap has no supported posts or exceeds 1000 posts');
  return ids;
}

export async function fetchPost(id: string, now: number): Promise<CatalogPost | null> {
  const response = await fetch(`${BLOG_ORIGIN}/${id}`, { redirect:'manual', signal:AbortSignal.timeout(10_000) });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`Post ${id}: HTTP ${response.status}`);
  const html = await response.text();
  if (html.length > 2_000_000) throw new Error('Post HTML exceeds size limit');
  return parsePost(html, id, now);
}
