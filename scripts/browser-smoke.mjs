/**
 * Headless browser smoke test for the production build.
 * Serves dist/ with a tiny built-in static server (no extra dependencies),
 * drives Chrome/Edge over the DevTools protocol, and fails on any runtime
 * error, white screen, or broken UI state.
 *
 * Run after `npm run build`:  npm run test:browser
 */
import { spawn, execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { join, extname, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const STAGE = () => new Date().toISOString().slice(11, 19);
const log = (msg) => console.log(`[${STAGE()}] ${msg}`);

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
if (!existsSync(join(dist, 'index.html'))) {
  console.error('FAIL dist/ is missing — run `npm run build` first');
  process.exit(1);
}

// ---------------------------------------------------------------- server ---
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
log(`static server on ${base}`);

// --------------------------------------------------------------- browser ---
function resolveChrome() {
  const env = process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const fixed = [
    '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium', '/usr/bin/chromium-browser',
    '/opt/google/chrome/chrome', '/opt/google/chrome/google-chrome',
    '/snap/bin/chromium', '/usr/bin/microsoft-edge',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  ];
  for (const p of fixed) if (existsSync(p)) return p;
  for (const name of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge']) {
    try {
      const p = execFileSync('which', [name], { encoding: 'utf8' }).trim();
      if (p && existsSync(p)) return p;
    } catch { /* not on PATH */ }
  }
  return null;
}

const chrome = resolveChrome();
if (!chrome) {
  console.error('FAIL no Chrome/Chromium/Edge binary found (set CHROME_PATH)');
  server.close();
  process.exit(1);
}
let chromeVersion = 'unknown';
try {
  chromeVersion = execFileSync(chrome, ['--version'], { encoding: 'utf8' }).trim();
} catch { /* ignore */ }
log(`browser: ${chrome} (${chromeVersion})`);

const cdpPort = 9700 + Math.floor(Math.random() * 200);
const child = spawn(chrome, [
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run',
  '--disable-extensions', '--disable-background-networking', '--disable-gpu-sandbox',
  '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader',
  '--hide-scrollbars', '--window-size=1440,900', '--force-device-scale-factor=1',
  `--remote-debugging-port=${cdpPort}`,
  `--user-data-dir=${join(tmpdir(), `kz-ci-chrome-${cdpPort}`)}`, 'about:blank',
], { stdio: ['ignore', 'ignore', 'pipe'] });

let chromeStderr = '';
child.stderr.on('data', (d) => {
  chromeStderr += d.toString();
  if (chromeStderr.length > 24000) chromeStderr = chromeStderr.slice(-24000);
});
let spawnError = null;
child.on('error', (e) => { spawnError = e; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failed = 0;
const check = (name, ok, extra = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? ' :: ' + extra : ''}`);
  if (!ok) failed++;
};

let ws;
let evaluate = async () => { throw new Error('CDP not connected'); };
try {
  let wsUrl;
  for (let i = 0; i < 80 && !wsUrl; i++) {
    if (spawnError) throw new Error(`browser failed to start: ${spawnError.message}`);
    try {
      const list = await (await fetch(`http://127.0.0.1:${cdpPort}/json/list`)).json();
      wsUrl = list.find((x) => x.type === 'page')?.webSocketDebuggerUrl;
    } catch { /* browser still starting */ }
    if (!wsUrl) await sleep(250);
  }
  if (!wsUrl) throw new Error('CDP endpoint unavailable');
  log('CDP connected');

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
  evaluate = async (expression) => {
    for (let attempt = 0; attempt < 2; attempt++) {
      const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
      if (!r.exceptionDetails) return r.result.value;
      const text = r.exceptionDetails.text || '';
      if (attempt === 0 && /context was destroyed|Cannot find context/i.test(text)) {
        await sleep(800);
        continue;
      }
      throw new Error(`evaluate failed: ${text} :: ${expression.slice(0, 120)}`);
    }
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
    lang: document.documentElement.lang,
    hasKz: !!window.__kz
  })`).then(JSON.parse);

  /** poll a JS predicate instead of assuming a fixed frame rate */
  const waitFor = async (expression, timeoutMs = 20000) => {
    const started = Date.now();
    while (Date.now() - started < timeoutMs) {
      try { if (await evaluate(expression)) return true; } catch { /* context may be swapping */ }
      await sleep(300);
    }
    return false;
  };

  await send('Page.enable'); await send('Runtime.enable');
  const throttle = Number(process.env.CPU_THROTTLE || 0);
  if (throttle > 0) {
    await send('Emulation.setCPUThrottlingRate', { rate: throttle });
    log(`CPU throttling ×${throttle} (slow-device simulation)`);
  }
  log(`navigating to ${base}/?autoenter&warm=3&lang=en`);
  await send('Page.navigate', { url: `${base}/?autoenter&warm=3&lang=en` });

  let booted = false;
  for (let i = 0; i < 120 && !booted; i++) {
    await sleep(1000);
    if (spawnError) throw new Error(`browser crashed: ${spawnError.message}`);
    booted = (await evaluate('document.getElementById("loader")?.style.display === "none"')) === true;
    if (!booted && i > 0 && i % 10 === 0) {
      log(`still booting (${i}s): ${await evaluate('document.getElementById("loader-pct")?.textContent')}`);
    }
  }
  check('production build boots (loader completes)', booted);
  if (!booted) {
    log('boot diagnostics: ' + await evaluate('JSON.stringify({pct:document.getElementById("loader-pct")?.textContent,log:document.getElementById("loader-log")?.innerText?.slice(-400),errors:window.__kzErrors||[],kz:!!window.__kz,ua:navigator.userAgent})'));
  }

  let s = await state();
  check('atrium HUD + selection card render', !s.selection && s.errors.length === 0, JSON.stringify(s));
  check('document title is set', /KELVIN ZERO/.test(s.title), s.title);

  await evaluate('location.hash = "#/room/2"');
  log('route → #/room/2');
  const roomReady = await waitFor('!document.getElementById("info-block").hidden && !document.getElementById("panel").hidden && !document.getElementById("room-nav").hidden');
  s = await state();
  check('exhibit route shows dossier, panel and prev/next', roomReady && s.errors.length === 0, JSON.stringify(s));

  await evaluate('location.hash = "#/index"');
  log('route → #/index');
  const indexReady = await waitFor('document.querySelectorAll(".index-row").length === 6');
  s = await state();
  check('index route lists six exhibits', indexReady && s.rows === 6 && s.errors.length === 0, JSON.stringify(s));

  await evaluate('location.hash = "#/"');
  log('route → #/');
  const atriumReady = await waitFor('!document.getElementById("selection-card").hidden');
  s = await state();
  check('returning to atrium restores selection card', atriumReady && s.errors.length === 0);

  await evaluate('window.__kz && window.__kz.setLang("zh")');
  await waitFor('document.documentElement.lang === "zh-CN"', 6000);
  await sleep(700);
  s = await state();
  check('language switch works without reload', s.lang === 'zh-CN' && s.indexLabel === '索引' && s.errors.length === 0, JSON.stringify(s));

  s = await state();
  check('zero console errors during the whole run', s.errors.length === 0, JSON.stringify(s.errors));
} catch (e) {
  console.error('FAIL browser smoke threw:', e.message);
  failed++;
  if (chromeStderr.trim()) console.error('--- browser stderr (tail) ---\n' + chromeStderr.slice(-4000));
  try {
    console.error('--- page state ---\n' + await evaluate('JSON.stringify({url:location.href,title:document.title,errors:window.__kzErrors||[],pct:document.getElementById("loader-pct")?.textContent,hasKz:!!window.__kz})'));
  } catch { /* page may be gone */ }
} finally {
  ws?.close();
  child.kill();
  server.close();
}
console.log(failed === 0 ? 'BROWSER SMOKE: ALL PASS' : `BROWSER SMOKE: ${failed} FAILURE(S)`);
process.exit(failed === 0 ? 0 : 1);
