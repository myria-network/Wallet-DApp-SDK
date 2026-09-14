import {build} from 'esbuild';
import {copyFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
await mkdir(new URL('./dist/',import.meta.url),{recursive:true});
await Promise.all([
 build({entryPoints:[fileURLToPath(new URL('./src/index.js',import.meta.url))],outfile:fileURLToPath(new URL('./dist/index.js',import.meta.url)),bundle:true,format:'esm',platform:'browser',target:['chrome120','firefox140'],minify:true,sourcemap:true}),
 build({entryPoints:[fileURLToPath(new URL('./src/index.js',import.meta.url))],outfile:fileURLToPath(new URL('./dist/myria-dapp.iife.js',import.meta.url)),bundle:true,format:'iife',globalName:'MyriaDapp',platform:'browser',target:['chrome120','firefox140'],minify:true,sourcemap:true}),
 copyFile(new URL('./src/index.d.ts',import.meta.url),new URL('./dist/index.d.ts',import.meta.url)),
]);
