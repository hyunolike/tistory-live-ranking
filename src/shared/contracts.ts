export type RankingWindow = '1h' | '24h';

export interface RankingItem {
  postId: string;
  title: string;
  url: string;
  views: number;
  rank: number;
}

export interface RankingResponse {
  window: RankingWindow;
  generatedAt: string;
  collectedSince: string | null;
  metric: 'deduplicatedViews';
  items: RankingItem[];
}

export const BLOG_ORIGIN = 'https://hyunolike.tistory.com';

export function postIdFromUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.origin !== BLOG_ORIGIN) return null;
    return /^\/(?:m\/)?([1-9]\d{0,9})\/?$/.exec(url.pathname)?.[1] ?? null;
  } catch {
    return null;
  }
}
