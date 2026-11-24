export type RankingWindow = '1h' | '24h';

export interface RankingItem {
  postId: string;
  title: string;
  url: string;
  views: number;
  rank: number;
}

export interface RankingResponse {
  blogOrigin?: string;
  window: RankingWindow;
  generatedAt: string;
  collectedSince: string | null;
  metric: 'deduplicatedViews';
  items: RankingItem[];
}

export const BLOG_ORIGIN = 'https://hyunolike.tistory.com';

export function postIdFromUrl(value: string, origin=BLOG_ORIGIN): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== origin || url.username || url.password) return null;
    const numeric=/^\/(?:m\/)?([1-9]\d{0,9})\/?$/.exec(url.pathname)?.[1];
    if(numeric)return numeric;
    const slug=/^\/(?:m\/)?entry\/([^/]+)\/?$/.exec(url.pathname)?.[1];
    if(!slug)return null;
    const decoded=decodeURIComponent(slug);
    if(!decoded||decoded.length>180||/[\u0000-\u001f]/.test(decoded))return null;
    return 'entry/'+encodeURIComponent(decoded);
  } catch {
    return null;
  }
}

export function normalizeBlogOrigin(value:unknown):string|null {
  if(typeof value!=='string'||value.length>255)return null;
  try {
    const input=value.trim();
    const url=new URL(input.includes('://')?input:`https://${input}`);
    if(!['http:','https:'].includes(url.protocol)||url.username||url.password||url.port||url.pathname!=='/'||url.search||url.hash)return null;
    if(!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.tistory\.com$/.test(url.hostname))return null;
    return `https://${url.hostname}`;
  }catch{return null;}
}
