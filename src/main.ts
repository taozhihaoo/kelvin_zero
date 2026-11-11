import './style.css';
import gsap from 'gsap';
import { createRenderer, hasWebGL2 } from './core/renderer';
import { Clock } from './core/clock';
import { Input } from './core/input';
import { Perf } from './core/perf';
import { Router, routeKey, routeTitle, neighbourIds, type Route } from './core/router';
import { SceneManager } from './core/sceneManager';
import { Post } from './core/post';
import { AudioEngine } from './audio/engine';
import type { Ctx, Room } from './rooms/room';
import { showFallback } from './ui/fallback';
import { HUD } from './ui/hud';
import { Loader, type LoaderStep } from './ui/loader';
import { Panel } from './ui/panel';
import { Manifesto } from './ui/manifesto';
import { initMarquee } from './ui/marquee';
import { initCursor, cursor } from './ui/cursor';
import { registry } from './ui/registry';
import { createAtrium } from './rooms/atrium';
import { createTuring } from './rooms/turing';
import { createMercury } from './rooms/mercury';
import { createCurl } from './rooms/curl';
import { createLattice } from './rooms/lattice';
import { createEcho } from './rooms/echo';
import { createHorizon } from './rooms/horizon';
import { createIndexPage } from './rooms/indexPage';
import { roomByKey } from './config/rooms';
import { initLang, getLang, setLang, onLangChange, tr } from './config/i18n';
import { initDebugStats } from './core/debug';

initLang();

// WebGL frames can occasionally exceed 500 ms (software rendering, shader
// compilation, heavy simulations). GSAP's default lag smoothing would then
// advance timelines by only 33 ms per frame, stretching a 1.6 s frost wipe to
// tens of seconds. Run animations on real elapsed time instead.
gsap.ticker.lagSmoothing(0);

const canvas = document.getElementById('gl') as HTMLCanvasElement;

// router is created inside boot(); rooms reach it through the registry
const routerShim = { go(hash: string) { location.hash = hash; } };

function boot() {
  initDebugStats();
  const renderer = createRenderer(canvas);
  const clock = new Clock();
  const input = new Input(canvas);
  const perf = new Perf();
  const audio = new AudioEngine();
  const panel = new Panel();
  registry.panel = panel;

  const ctx: Ctx = { renderer, input, clock, perf, audio };
  const mgr = new SceneManager(ctx);
  registry.mgr = mgr;
  registry.router = routerShim;
  registry.blip = () => audio.blip();
  registry.cursorHot = (label) => cursor.current?.setHot(!!label, label);
  const post = new Post(renderer, mgr, window.innerWidth, window.innerHeight);
  // Bloom/Reflector must honour the starting tier (mobile begins on low/mid).
  post.setTier(perf.tier, window.innerWidth, window.innerHeight);

  const rooms: Room[] = [
    createAtrium(), createTuring(), createMercury(), createCurl(),
    createLattice(), createEcho(), createHorizon(), createIndexPage(),
  ];
  rooms.forEach((r) => mgr.register(r));

  // ------------------------------------------------------------------ UI ---
  initMarquee();
  initCursor(input);
  const hud = new HUD({
    onIndex: () => router.go('#/index'),
    onSound: () => {
      if (audio.enabled) audio.disable();
      else {
        void audio.enable();
        audio.setDrone(currentDrone());
      }
      hud.setSound(audio.enabled);
      if (audio.enabled) audio.blip();
    },
    onZero: () => toggleZero(),
    onLang: () => setLang(getLang() === 'en' ? 'zh' : 'en'),
    onPrev: () => goNeighbour(-1),
    onNext: () => goNeighbour(1),
  });
  const manifesto = new Manifesto(() => manifesto.close());
  registry.hud = hud;
  document.getElementById('btn-manifesto')!
    .addEventListener('click', () => manifesto.open());

  // subtle hover ticks on every button
  let lastTick = 0;
  window.addEventListener('pointerover', (e) => {
    if ((e.target as Element)?.closest?.('button')) {
      const now = performance.now();
      if (now - lastTick > 90) { lastTick = now; audio.hoverTick(); }
    }
  });

  // language switch: rebuild all DOM chrome without reloading the WebGL scene
  onLangChange(() => {
    hud.refresh();
    manifesto.refresh();
    panel.refresh();
    registry.refreshIndex?.();
    registry.refreshSelection?.();
    document.title = routeTitle(router.current(), getLang());
  });

  // ----------------------------------------------------------- loader -------
  const loader = new Loader();
  const steps: LoaderStep[] = [{ label: tr('loader.init') }];
  for (const r of rooms) {
    steps.push({
      label: `${tr('loader.build')} ${r.id.toUpperCase()}`,
      run: () => r.init(ctx),
    });
  }
  steps.push({
    label: tr('loader.chilling'),
    run: async () => {
      // `?warm=N` shortens the thumbnail warm-up for automated screenshot runs.
      const q = Number(new URLSearchParams(location.search).get('warm'));
      const frames = Number.isFinite(q) && q > 0 ? Math.min(24, Math.floor(q)) : 24;
      for (const r of rooms) mgr.warmThumb(r, frames);
    },
  });
  steps.push({
    label: tr('loader.compile'),
    run: () => { void renderer; },
    live: (el) => {
      el.textContent = `${renderer.info.programs?.length ?? 0} ${tr('loader.programs')}`;
    },
  });

  // ------------------------------------------------------------ routing ----
  const pendingOrigin = { x: 0.5, y: 0.5 };
  let clickPending = false;
  input.on('click', (p: any) => { clickPending = true; pendingOrigin.x = p.ux; pendingOrigin.y = p.uy; });

  const router = new Router();
  let currentKey = 'atrium';

  const applyRoute = (route: Route) => {
    const key = routeKey(route);
    if (!mgr.rooms.has(key)) return;
    const sameRoom = key === mgr.currentId;
    const origin = clickPending ? pendingOrigin : { x: 0.5, y: 0.5 };
    clickPending = false;
    currentKey = key;
    const meta = roomByKey(key) ?? null;
    hud.setRoute(route, meta);
    hud.setIndexActive(route.name === 'index');
    hud.hideInfoBlock();
    if (!sameRoom) panel.clear();
    document.title = routeTitle(route, getLang());
    mgr.go(key, origin);
    // If `go` did not start a wipe (same route, or immediate boot), refresh the
    // dossier + panel here instead of losing them behind the lastSettled guard.
    if (!mgr.transitioning) onSettledKey(key, sameRoom);
  };
  router.on(applyRoute);

  mgr.onTransitionStart = () => {
    audio.crack();
    panel.setGate(true); // controls reveal only after the frost settles
  };
  mgr.onBloom = (b) => post.setBloom(b);
  mgr.onSettled = (id) => onSettledKey(id);

  function onSettledKey(key: string, force = false) {
    if (key === lastSettled && !force) return;
    lastSettled = key;
    const meta = roomByKey(key);
    if (meta) {
      const count = key === 'r3'
        ? `${(perf.params.curlN * perf.params.curlN).toLocaleString('en-US')} PARTICLES`
        : meta.countLabel || undefined;
      hud.showInfoBlock(meta, count);
      if (force) panel.remount();
    } else {
      hud.hideInfoBlock();
    }
    panel.setGate(false);
    if (key === 'atrium') {
      hud.showHint(tr('hud.dragHint'), 3);
      // re-sync the readout with the carousel selection (applyRoute resets it
      // to the atrium ambient value)
      registry.refreshSelection?.();
    }
    (window as any).__roomSettled?.(key);
  }
  let lastSettled = '';

  function goNeighbour(dir: number) {
    const cur = router.current();
    const id = cur.name === 'room' ? cur.id : (dir > 0 ? '0' : '1');
    router.go(`#/room/${neighbourIds(id, dir)}`);
  }

  // ------------------------------------------------------ absolute zero ----
  let zeroOn = false;
  const frost = { v: 0 };
  function toggleZero() {
    zeroOn = !zeroOn;
    clock.setZero(zeroOn);
    gsap.to(frost, { v: zeroOn ? 1 : 0, duration: 1.7, ease: 'power2.out', overwrite: true });
    audio.setLowpassTarget(zeroOn ? 200 : 18000);
    const meta = roomByKey(currentKey) ?? null;
    hud.setZeroActive(zeroOn, meta ? meta.tempK : null, meta?.tempLabel);
    audio.blip();
  }

  // ---------------------------------------------------------- keyboard -----
  input.on('key', ({ code, event }: any) => {
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      event?.preventDefault();
      // the atrium carousel consumes the arrows while it is current
      if (currentKey === 'atrium' && registry.arrowHandler) {
        registry.arrowHandler(code === 'ArrowRight' ? 1 : -1);
        return;
      }
      goNeighbour(code === 'ArrowRight' ? 1 : -1);
      return;
    }
    if (code === 'Escape') {
      if (manifesto.isOpen) manifesto.close();
      else if (router.current().name !== 'atrium') router.go('#/');
      return;
    }
    if (code === 'KeyZ' && !loaderVisible) toggleZero();
  });

  // ------------------------------------------------------------ mainloop ---
  let last = performance.now();
  let loaderVisible = true;
  function loop(now: number) {
    requestAnimationFrame(loop);
    const realDt = Math.min((now - last) / 1000, 0.1);
    last = now;
    if (document.hidden) return;
    clock.update(realDt);
    const dt = realDt * clock.timeScale;
    mgr.update(clock.t, dt);
    audio.tick();
    const vel = Math.min(1, Math.hypot(input.vx, input.vy) * 1.4 + (mgr.transitioning ? 0.5 : 0));
    post.feed(clock.t, now / 1000, vel, frost.v, mgr.transitioning ? 1 : 0);
    post.render();
    perf.frame(realDt * 1000);
    hud.frame(realDt, input.x, input.y, perf.fps, perf.tier);
    input.lateUpdate(realDt);
  }

  // -------------------------------------------------------------- start ----
  const enter = async () => {
    await loader.run(steps);
    const auto = new URLSearchParams(location.search).has('autoenter'); // test hook
    const choice = auto ? 'silent' : await loader.awaitEnter();
    loaderVisible = false;
    loader.hide();
    if (choice === 'gallery') {
      audio.enable().then(() => {
        audio.setDrone(currentDrone());
        hud.setSound(audio.enabled);
      });
    }
    mgr.enterImmediate(routeKey(router.current()));
    router.start();
    requestAnimationFrame((n) => { last = n; loop(n); });
  };
  enter();

  function currentDrone(): number {
    return roomByKey(currentKey)?.droneHz ?? 110;
  }

  // test/automation hook (also handy in console)
  (window as any).__kz = {
    mgr,
    clock,
    audio,
    getLang,
    setLang,
    advance(n: number, step = 1 / 60) {
      for (let i = 0; i < n; i++) mgr.update(clock.t += step, step);
    },
  };

  window.addEventListener('resize', () => {
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    post.resize(window.innerWidth, window.innerHeight);
    mgr.resize(window.innerWidth, window.innerHeight);
  });

  perf.onTier(() => {
    post.setTier(perf.tier, window.innerWidth, window.innerHeight);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) audio.noteOff(true);
  });

  window.addEventListener('beforeunload', () => {
    mgr.dispose();
    audio.dispose();
    input.dispose();
    post.dispose();
  });
}

// lightweight error sink (used by automated checks; no console spam)
(window as any).__kzErrors = [];
window.addEventListener('error', (e) => (window as any).__kzErrors.push('' + (e.message || e.error)));
window.addEventListener('unhandledrejection', (e) => (window as any).__kzErrors.push('' + (e.reason)));
const _origErr = console.error.bind(console);
console.error = (...a: any[]) => {
  (window as any).__kzErrors.push(a.map((x) => (typeof x === 'string' ? x : String(x?.message || x))).join(' ').slice(0, 300));
  _origErr(...a);
};

if (!hasWebGL2()) {
  showFallback();
  onLangChange(() => showFallback());
} else {
  boot();
}
