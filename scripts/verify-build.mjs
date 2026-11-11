import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exit(1); };

if (!existsSync(join(dist, 'index.html'))) fail('dist/index.html missing — run `npm run build` first');

const html = readFileSync(join(dist, 'index.html'), 'utf8');
const assets = readdirSync(join(dist, 'assets'));
const js = assets.filter((f) => f.endsWith('.js'));
const css = assets.filter((f) => f.endsWith('.css'));

if (!js.length) fail('no JavaScript bundle emitted');
if (!css.length) fail('no CSS bundle emitted');
for (const f of [...js, ...css]) {
  if (!html.includes(`assets/${f}`)) fail(`index.html does not reference assets/${f}`);
  if (statSync(join(dist, 'assets', f)).size < 1000) fail(`asset ${f} is suspiciously small`);
}
if (/<script[^>]+src=["']https?:\/\//.test(html)) fail('production HTML loads an external script');
if (/\bTODO\b|\bFIXME\b/.test(html)) fail('unfinished placeholder in production HTML');

const bundle = readFileSync(join(dist, 'assets', js[0]), 'utf8');
if (!bundle.includes('KELVIN')) fail('bundle does not contain the app name');

console.log(`PASS build artifacts: ${js.length} JS / ${css.length} CSS, ${(statSync(join(dist, 'assets', js[0])).size / 1024).toFixed(0)} KB main bundle`);
console.log('PASS no external script tags, all emitted assets referenced');
