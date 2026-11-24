import { build } from 'esbuild';
import { mkdir, cp } from 'node:fs/promises';

await mkdir('dist/public',{recursive:true});
await cp('demo','dist/public',{recursive:true});
await build({entryPoints:['src/widget/index.ts'],outfile:'dist/public/widget.js',bundle:true,format:'iife',target:'es2022',minify:true,loader:{'.css':'text'}});
console.log('Built standalone widget and demo → dist/public');
