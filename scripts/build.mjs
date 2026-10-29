import { build } from 'esbuild';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
const sdk = resolve(process.env.AVATAR_RENDERER_PATH || 'node_modules/@ekza/avatar-renderer');
const entry=existsSync(`${sdk}/src/runtime.ts`)?`${sdk}/src/runtime.ts`:`${sdk}/dist/runtime.js`;
if (!existsSync(entry)) throw new Error(`SDK runtime missing: ${sdk}. Run npm ci (with prepare scripts enabled).`);
const result = await build({metafile: true,entryPoints: [entry], bundle: true, splitting: true, format: 'esm', platform: 'browser', outdir: 'public/sdk', external: ['three', 'three/*', '@pixiv/three-vrm'], sourcemap: true});
if (Object.keys(result.metafile.inputs).some(path => /(?:^|\/)react(?:-dom)?(?:\/|$)/.test(path))) throw new Error('Runtime must remain React-free');
console.log(`Built shared avatar runtime from ${sdk}`);
