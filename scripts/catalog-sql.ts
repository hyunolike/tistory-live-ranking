import type { CatalogPost } from '../src/shared/catalog.ts';

export function catalogSql(posts:CatalogPost[]):string{
  if(!posts.length)throw new Error('Cannot replace catalog with an empty list');
  const quote=(s:string)=>`'${s.replaceAll("'","''")}'`;
  // D1 remote import owns the transaction. Explicit BEGIN/COMMIT are unsupported.
  return ['-- Public article metadata only. Contains no view events.','UPDATE posts SET active=0;',...posts.map(p=>
    `INSERT INTO posts(id,title,url,active,verified_at,checked_at) VALUES (${quote(p.id)},${quote(p.title)},${quote(p.url)},1,${p.verifiedAt},${p.verifiedAt}) ON CONFLICT(id) DO UPDATE SET title=excluded.title,url=excluded.url,active=1,verified_at=excluded.verified_at,checked_at=excluded.checked_at;`
  ),''].join('\n');
}
