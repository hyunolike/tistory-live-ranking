import { ranking, recordView, cleanup } from './storage.ts';
import { refreshCatalog } from './catalog.ts';

interface Env {
  DB: D1Database;
  ASSETS?: Fetcher;
  BLOG_ORIGIN: string;
  ENVIRONMENT: string;
  DEDUP_SECRET?: string;
}

class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

function json(value: unknown, status = 200, headers: Record<string,string> = {}): Response {
  return Response.json(value, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}

function allowed(request: Request, env: Env): string | null {
  const origin = request.headers.get('Origin');
  if (origin === env.BLOG_ORIGIN) return origin;
  if (env.ENVIRONMENT === 'development' && origin === new URL(request.url).origin) return origin;
  return null;
}

async function body(request: Request): Promise<{postId:string}> {
  if (request.headers.get('Content-Type')?.split(';')[0].trim().toLowerCase() !== 'application/json') throw new HttpError(415,'JSON body required');
  if (Number(request.headers.get('Content-Length')) > 1024) throw new HttpError(413,'Body exceeds 1KiB');
  const reader = request.body?.getReader();
  if (!reader) throw new HttpError(400,'Body required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const chunk = await reader.read();
    if (chunk.done) break;
    size += chunk.value.byteLength;
    if (size > 1024) { await reader.cancel(); throw new HttpError(413,'Body exceeds 1KiB'); }
    chunks.push(chunk.value);
  }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk,offset); offset += chunk.length; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(buffer)); } catch { throw new HttpError(400,'Invalid JSON'); }
  if (!value || typeof value !== 'object' || !('postId' in value) || typeof value.postId !== 'string' || !/^[1-9]\d{0,9}$/.test(value.postId)) throw new HttpError(400,'Invalid post ID');
  return {postId:value.postId};
}

async function fingerprint(request: Request, env: Env, now: number): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || (env.ENVIRONMENT === 'development' ? '127.0.0.1' : null);
  if (!ip || !env.DEDUP_SECRET || env.DEDUP_SECRET.length < 32) throw new HttpError(503,'Collector is not configured');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',encoder.encode(env.DEDUP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,encoder.encode(`${new Date(now).toISOString().slice(0,10)}:${ip}`));
  return [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2,'0')).join('');
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const readCors = {'Access-Control-Allow-Origin':'*'};
    const origin = allowed(request,env);
    const writeCors: Record<string,string> = origin ? {'Access-Control-Allow-Origin':origin,'Vary':'Origin'} : {};
    try {
      if (url.pathname === '/health') return json({status:'ok',service:'tistory-live-ranking'});
      if (url.pathname === '/api/views') {
        if (request.method === 'OPTIONS') {
          if (!origin) throw new HttpError(403,'Origin not allowed');
          if (request.headers.get('Access-Control-Request-Method') !== 'POST') throw new HttpError(405,'POST required');
          const requested = request.headers.get('Access-Control-Request-Headers')?.split(',').map(s => s.trim().toLowerCase()) ?? [];
          if (requested.some(h => h !== 'content-type')) throw new HttpError(403,'Header not allowed');
          return new Response(null,{status:204,headers:{...writeCors,'Access-Control-Allow-Methods':'POST','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'}});
        }
        if (request.method !== 'POST') return json({error:'POST required'},405,{'Allow':'POST, OPTIONS',...writeCors});
        if (!origin) throw new HttpError(403,'Origin not allowed');
        const {postId} = await body(request);
        const now = Date.now();
        const hash = await fingerprint(request,env,now);
        const minute = Math.floor(now/60_000);
        const rate = await env.DB.prepare(`INSERT INTO rate_limits(fingerprint,minute,hits) VALUES (?,?,1)
          ON CONFLICT(fingerprint,minute) DO UPDATE SET hits=hits+1 RETURNING hits`).bind(hash,minute).first<{hits:number}>();
        if (!rate || rate.hits > 30) return json({error:'Too many requests'},429,{...writeCors,'Retry-After':String(60-Math.floor(now/1000)%60)});
        if (!await recordView(env.DB,postId,hash,now)) throw new HttpError(404,'Post not found');
        return json({accepted:true},202,writeCors);
      }
      if (url.pathname === '/api/rankings') {
        if (request.method !== 'GET') return json({error:'GET required'},405,{...readCors,'Allow':'GET'});
        const window = url.searchParams.get('window') ?? '24h';
        if (window !== '1h' && window !== '24h') throw new HttpError(400,'Window must be 1h or 24h');
        return json(await ranking(env.DB,window,Date.now()),200,{...readCors,'Cache-Control':'public, max-age=30'});
      }
      if (env.ASSETS) {
        const response = await env.ASSETS.fetch(request);
        if (url.pathname === '/widget.js' && response.ok) {
          const headers = new Headers(response.headers);
          headers.set('Access-Control-Allow-Origin','*');
          headers.set('Cache-Control','public, max-age=300');
          headers.set('X-Content-Type-Options','nosniff');
          return new Response(response.body,{status:response.status,headers});
        }
        return response;
      }
      return json({error:'Not found'},404);
    } catch (error) {
      const status = error instanceof HttpError ? error.status : 503;
      if (!(error instanceof HttpError)) console.error('request_failed',error instanceof Error ? error.message : 'unknown');
      return json({error:error instanceof HttpError ? error.message : 'Service temporarily unavailable'},status,url.pathname === '/api/rankings' ? readCors : writeCors);
    }
  },
  async scheduled(_event: ScheduledController, env: Env): Promise<void> {
    await cleanup(env.DB,Date.now());
    await refreshCatalog(env.DB,Date.now());
  }
} satisfies ExportedHandler<Env>;
