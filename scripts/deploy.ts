import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';

const config=JSON.parse(await readFile('wrangler.jsonc','utf8'));
if(config.vars?.ENVIRONMENT!=='production')throw new Error('Set ENVIRONMENT to production in wrangler.jsonc before deploying.');
const id=config.d1_databases?.[0]?.database_id;
if(typeof id!=='string'||!/^\w{8}-\w{4}-\w{4}-\w{4}-\w{12}$/.test(id)||id==='00000000-0000-0000-0000-000000000000')throw new Error('Create a production D1 database and set its database_id first.');
for(const args of [['build'],['exec','wrangler','deploy']]){
  const result=spawnSync('pnpm',args,{stdio:'inherit'});
  if(result.status!==0)process.exit(result.status??1);
}
