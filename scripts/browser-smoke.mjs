/**
 * Headless browser smoke test for the production build.
 * Serves dist/ with a tiny built-in static server (no extra dependencies),
 * drives Chrome/Edge over the DevTools protocol, and fails on any runtime
 * error, white screen, or broken UI state.
 *
 * Run after `npm run build`:  npm run test:browser
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('FAIL dist/ is missing — run `npm run build` first');
  process.exit(1);
}

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.glsl': 'text/plain',
};
const server = createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  let file = join(dist, pathname === '/' ? 'index.html' : pathname);
  if (!file.startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(dist, 'index.html'); // SPA fallback
  }
  res.setHeader('Content-Type', MIME[extname(file)] || 'application/octet-stream');
  createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${server.address().port}`;

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'google-chrome', 'chromium',
].filter(Boolean);
const chrome = CANDIDATES.find((p) => !p.includes('/') || existsSync(p));
if (!chrome) {
  console.error('FAIL no Chrome/Chromium/Edge binary found (set CHROME_PATH)');
  server.close();
  process.exit(1);
}

const cdpPort = 9700 + Math.floor(Math.random() * 200);
const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
  '--disable-extensions', '--disable-background-networking',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--window-size=1440,900', '--force-device-scale-factor=1',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${join(tmpdir(), `kz-ci-chrome-${cdpPort}`)}`, 'about:blank',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`);
  if (!ok) failed++;
};

let ws;
try {
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      wsUrl = list.find((x) => x.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* browser still starting */ }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('CDP endpoint unavailable');

  ws = new WebSocket(wsUrl);
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve: ok, reject: no } = pending.get(msg.id);
      pending.delete(msg.id);
      msg.error ? no(new Error(JSON.stringify(msg.error))) : ok(msg.result);
    }
  });
  const send = (method, params = {}) => new Promise((ok, no) => {
    const n = ++id;
    pending.set(n, { resolve: ok, reject: no });
    ws.send(JSON.stringify({ id: n, method, params }));
  });
  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
    return r.result.value;
  };
  const state = () => evaluate(`JSON.stringify({
    errors: window.__kzErrors || [],
    title: document.title,
    loader: document.getElementById('loader')?.style.display,
    info: document.getElementById('info-block')?.hidden,
    panel: document.getElementById('panel')?.hidden,
    nav: document.getElementById('room-nav')?.hidden,
    selection: document.getElementById('selection-card')?.hidden,
    rows: document.querySelectorAll('.index-row').length,
    indexLabel: document.getElementById('t-index')?.textContent,
    lang: document.documentElement.lang
  })`).then(JSON.parse);

  await send('Page.enable'); await send('Runtime.enable');
  await send('Page.navigate', { url: `${base}/?autoenter&warm=3&lang=en` });

  let booted = false;
  for (let i = 0; i < 120 && !booted; i++) {
    await sleep(1000);
    booted = (await evaluate('document.getElementById("loader")?.style.display === "none"')) === true;
  }
  check('production build boots (loader completes)', booted);

  let s = await state();
  check('atrium HUD + selection card render', !s.selection && s.errors.length === 0, JSON.stringify(s));
  check('document title is set', /KELVIN ZERO/.test(s.title), s.title);

  await evaluate('location.hash = "#/room/2"');
  await sleep(3500);
  s = await state();
  check('exhibit route shows dossier, panel and prev/next', !s.info && !s.panel && !s.nav && s.errors.length === 0, JSON.stringify(s));

  await evaluate('location.hash = "#/index"');
  await sleep(3500);
  s = await state();
  check('index route lists six exhibits', s.rows === 6 && s.errors.length === 0, JSON.stringify(s));

  await evaluate('location.hash = "#/"');
  await sleep(3500);
  s = await state();
  check('returning to atrium restores selection card', !s.selection && s.errors.length === 0);

  await evaluate('window.__kz && window.__kz.setLang("zh")');
  await sleep(700);
  s = await state();
  check('language switch works without reload', s.lang === 'zh-CN' && s.indexLabel === '索引' && s.errors.length === 0, JSON.stringify(s));

  s = await state();
  check('zero console errors during the whole run', s.errors.length === 0, JSON.stringify(s.errors));
} catch (e) {
  console.error('FAIL browser smoke threw:', e.message);
  failed++;
} finally {
  ws?.close();
  child.kill();
  server.close();
}
console.log(failed === 0 ? 'BROWSER SMOKE: ALL PASS' : `BROWSER SMOKE: ${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
