import { BLOG_ORIGIN, postIdFromUrl } from './contracts.ts';
import { Parser } from 'htmlparser2';

export async function readLimited(response: Response, max: number): Promise<string> {
  if(Number(response.headers.get('Content-Length'))>max){await response.body?.cancel();throw new Error('Response exceeds byte limit');}
  const reader=response.body?.getReader();
  if(!reader)return '';
  const decoder=new TextDecoder();
  let size=0;
  const parts:string[]=[];
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      size+=value.byteLength;
      if(size>max){await reader.cancel();throw new Error('Response exceeds byte limit');}
      parts.push(decoder.decode(value,{stream:true}));
    }
    parts.push(decoder.decode());
    return parts.join('');
  }finally{reader.releaseLock();}
}

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

export function parsePost(html: string, id: string, now: number, origin=BLOG_ORIGIN): CatalogPost | null {
  let inHead=true, explicitHead=false, inertDepth=0, protectedPage=false, publicBody=false;
  let canonical:string|undefined, title:string|undefined, type:string|undefined;
  const inertStack:boolean[]=[];
  const headTags=new Set(['html','head','meta','link','title','base','script','style','template','noscript']);
  const parser=new Parser({
    onopentag(name,a){
      const inert=inertDepth>0||['script','style','template','noscript'].includes(name);
      inertStack.push(inert);if(inert){inertDepth++;return;}
      if(name==='head')explicitHead=true;
      // Tistory can place a custom widget before its generated canonical link.
      // Honor an explicit head boundary; infer it only for HTML fragments.
      if(name==='body'||(!explicitHead&&!headTags.has(name)))inHead=false;
      if(/(?:^|\s)(?:area-protected|article-header-protected)(?:\s|$)/.test(a.class??''))protectedPage=true;
      if(name==='input'&&a.type?.toLowerCase()==='password')protectedPage=true;
      if(name==='meta'&&inHead){if(a.property==='og:title')title??=a.content?.trim();if(a.property==='og:type')type??=a.content;}
      if(name==='link'&&inHead&&a.rel==='canonical')canonical??=a.href;
      if(!inHead&&(a.id==='article-view'||/(?:^|\s)(?:contents_style|tt_article_useless_p_margin)(?:\s|$)/.test(a.class??'')))publicBody=true;
    },
    onclosetag(name){const inert=inertStack.pop();if(inert)inertDepth--;if(name==='head'&&!inert){explicitHead=false;inHead=false;}}
  },{decodeEntities:true});
  parser.end(html);
  if (protectedPage || !publicBody || type !== 'article' || !canonical || postIdFromUrl(canonical,origin) !== id || !title || title.length > 300) return null;
  return { id, title, url:`${origin}/${id}`, verifiedAt:now };
}

export function sitemapIds(xml: string, origin=BLOG_ORIGIN): string[] {
  if (!/<urlset\b/i.test(xml) || !/<\/urlset>/i.test(xml)) throw new Error('Expected a complete sitemap urlset');
  const ids = [...new Set([...xml.matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)].map(m => postIdFromUrl(decode(m[1]),origin)).filter((id): id is string => id !== null))];
  if (!ids.length || ids.length > 1000) throw new Error('Sitemap has no supported posts or exceeds 1000 posts');
  return ids;
}

export async function fetchPost(id: string, now: number, origin=BLOG_ORIGIN): Promise<CatalogPost | null> {
  const response = await fetch(`${origin}/${id}`, { redirect:'manual', signal:AbortSignal.timeout(10_000) });
  if (response.status === 404 || response.status === 410) return null;
  if (!response.ok) throw new Error(`Post ${id}: HTTP ${response.status}`);
  const html = await readLimited(response,2*1024*1024);
  return parsePost(html, id, now, origin);
}
