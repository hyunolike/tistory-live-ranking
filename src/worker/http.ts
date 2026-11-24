export interface Env { DB:D1Database; ASSETS?:Fetcher; BLOG_ORIGIN:string; ENVIRONMENT:string; DEDUP_SECRET?:string }
export class HttpError extends Error { constructor(public status: number, message: string) { super(message); } }

export function json(value: unknown, status = 200, headers: Record<string,string> = {}): Response {
  return Response.json(value, {status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
}

export async function readJson(request: Request): Promise<Record<string,unknown>> {
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
  if(!value||typeof value!=='object'||Array.isArray(value))throw new HttpError(400,'JSON object required');
  return value as Record<string,unknown>;
}

export async function fingerprint(request: Request, env: Env, now: number): Promise<string> {
  const ip = request.headers.get('CF-Connecting-IP') || (env.ENVIRONMENT === 'development' ? '127.0.0.1' : null);
  if (!ip || !env.DEDUP_SECRET || env.DEDUP_SECRET.length < 32) throw new HttpError(503,'Collector is not configured');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw',encoder.encode(env.DEDUP_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  const signature = await crypto.subtle.sign('HMAC',key,encoder.encode(`${new Date(now).toISOString().slice(0,10)}:${ip}`));
  return [...new Uint8Array(signature)].map(n => n.toString(16).padStart(2,'0')).join('');
}

