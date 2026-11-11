import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ROOMS, roomByKey, roomById, ATRIUM_TEMP_K } from '../src/config/rooms.ts';
import { TIERS } from '../src/core/perf.ts';
import { DICT, L, tr, getLang, setLang } from '../src/config/i18n.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(root, p), 'utf8');

function walk(dir) {
  return readdirSync(join(root, dir), { withFileTypes: true }).flatMap((e) => {
    const rel = `${dir}/${e.name}`;
    return e.isDirectory() ? walk(rel) : [rel];
  });
}

test('every ?raw GLSL import resolves to a real shader file', () => {
  const tsFiles = walk('src').filter((f) => f.endsWith('.ts'));
  let count = 0;
  for (const f of tsFiles) {
    const src = read(f);
    const re = /from\s+['"]([^'"]+\.glsl\?raw)['"]/g;
    let m;
    while ((m = re.exec(src))) {
      const target = resolve(dirname(join(root, f)), m[1].replace('?raw', ''));
      assert.ok(existsSync(target), `${f} imports missing shader ${m[1]}`);
      count++;
    }
  }
  assert.ok(count > 30, `expected many shader imports, found ${count}`);
});

test('index.html has the complete UI skeleton and no external resources', () => {
  const html = read('index.html');
  const ids = [
    'gl', 'hud-top', 'hud-bottom', 'marquee', 'panel', 'manifesto', 'loader',
    'fallback', 'cursor', 'info-block', 'selection-card', 'room-nav',
    'btn-lang', 'btn-index', 'btn-sound', 'btn-zero', 'btn-prev', 'btn-next',
    'btn-manifesto', 'btn-enter', 'btn-enter-silent', 'hud-temp', 'hud-route',
    'perf-fps', 'perf-tier', 'tier-bars', 'loader-pct', 'loader-bar-fill',
  ];
  for (const id of ids) assert.match(html, new RegExp(`id=["']${id}["']`), `missing #${id}`);
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']https?:\/\//, 'external resource in index.html');
  assert.match(html, /<html lang="en">/, 'English must be the default document language');
  assert.match(html, /skip-link/);
});

test('CSS has no external font/image/CDN requests', () => {
  const css = read('src/style.css');
  assert.doesNotMatch(css, /url\(\s*["']?https?:\/\//, 'external url() in CSS');
  assert.match(css, /--acid:\s*#c8ff2e/i);
  assert.match(css, /prefers-reduced-motion/);
});

test('six exhibits: descending temperatures, bilingual copy, unique keys', () => {
  assert.equal(ROOMS.length, 6);
  assert.ok(ATRIUM_TEMP_K > ROOMS[0].tempK);
  for (let i = 0; i < ROOMS.length; i++) {
    const r = ROOMS[i];
    assert.equal(r.id, String(i + 1));
    assert.equal(r.key, `r${i + 1}`);
    assert.ok(r.nameEn && r.nameZh && r.lineEn && r.lineZh);
    assert.ok(r.hints && r.hintsZh, `room ${r.id} needs both hint languages`);
    assert.ok(r.tech.length >= 2);
    if (i > 0) assert.ok(ROOMS[i - 1].tempK > r.tempK, 'temperatures must descend');
  }
  assert.equal(roomByKey('r6')?.nameEn, 'HORIZON');
  assert.equal(roomById('5')?.droneHz, 0, 'ECHO disables the drone');
});

test('quality tiers are monotonic and low tier drops the expensive effects', () => {
  assert.ok(TIERS.high.curlN > TIERS.mid.curlN && TIERS.mid.curlN > TIERS.low.curlN);
  assert.ok(TIERS.high.latticeN > TIERS.mid.latticeN && TIERS.mid.latticeN > TIERS.low.latticeN);
  assert.ok(TIERS.high.rdSteps > TIERS.mid.rdSteps && TIERS.mid.rdSteps > TIERS.low.rdSteps);
  assert.equal(TIERS.high.useBloom, true);
  assert.equal(TIERS.low.useBloom, false);
  assert.equal(TIERS.low.useReflector, false);
});

test('i18n dictionary is complete and language switching is deterministic', () => {
  for (const [key, pair] of Object.entries(DICT)) {
    assert.equal(pair.length, 2, `${key} needs [en, zh]`);
    assert.ok(pair[0] && pair[1], `${key} has an empty translation`);
  }
  assert.equal(getLang(), 'en', 'English is the default');
  assert.equal(L('EN', '中文'), 'EN');
  assert.equal(tr('nav.index'), 'INDEX');
  setLang('zh');
  assert.equal(getLang(), 'zh');
  assert.equal(L('EN', '中文'), '中文');
  assert.equal(tr('nav.index'), '索引');
  assert.equal(tr('key.that.does.not.exist'), 'key.that.does.not.exist');
  setLang('en');
  assert.equal(tr('nav.index'), 'INDEX');
});

test('both READMEs exist, use the right screenshots, and keep Security/License in English', () => {
  const en = read('README.md');
  const zh = read('README.zh-CN.md');
  for (const name of ['atrium', 'exhibit', 'index']) {
    assert.match(en, new RegExp(`docs/screenshots/${name}-en\\.jpg`), `English README needs ${name}-en.jpg`);
    assert.match(zh, new RegExp(`docs/screenshots/${name}-zh\\.jpg`), `Chinese README needs ${name}-zh.jpg`);
    assert.doesNotMatch(en, new RegExp(`docs/screenshots/${name}-zh\\.jpg`));
    assert.doesNotMatch(zh, new RegExp(`docs/screenshots/${name}-en\\.jpg`));
    for (const lang of ['en', 'zh']) {
      const file = join(root, `docs/screenshots/${name}-${lang}.jpg`);
      assert.ok(existsSync(file), `missing screenshot ${file}`);
      assert.ok(statSync(file).size > 50_000, `screenshot ${file} looks empty`);
    }
  }
  for (const doc of [en, zh]) {
    assert.match(doc, /^## Security$/m, 'Security heading must be English in both READMEs');
    assert.match(doc, /^## License$/m, 'License heading must be English in both READMEs');
  }
  assert.match(zh, /README\.md/, 'Chinese README links back to the default English README');
});

test('project scripts and CI workflow are wired', () => {
  const pkg = JSON.parse(read('package.json'));
  for (const s of ['dev', 'build', 'preview', 'typecheck', 'test', 'verify:build', 'test:browser', 'ci']) {
    assert.ok(pkg.scripts[s], `missing script ${s}`);
  }
  assert.equal(pkg.license, 'MIT');
  const ci = read('.github/workflows/ci.yml');
  assert.match(ci, /npm ci/);
  assert.match(ci, /npm run typecheck/);
  assert.match(ci, /npm test/);
  assert.match(ci, /npm run build/);
  assert.match(ci, /npm run test:browser/);
  assert.match(ci, /actions\/setup-node/);
});
