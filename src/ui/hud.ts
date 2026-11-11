import gsap from 'gsap';
import { countTo, maskRise, fadeUp } from './text';
import { tr, L } from '../config/i18n';
import { ATRIUM_TEMP_K, type RoomMeta } from '../config/rooms';
import type { Route } from '../core/router';
import { T } from '../config/timings';

export interface HudDeps {
  onIndex: () => void;
  onSound: () => void;
  onZero: () => void;
  onLang: () => void;
  onPrev: () => void;
  onNext: () => void;
}

let fmtTemp: (k: number) => string = (k) => (k >= 1 ? k.toFixed(2) : k.toFixed(3)) + ' K';

const $ = (id: string) => document.getElementById(id)!;

/** HUD chrome: top bar, bottom bar, temp readout, dossier, selection card, hints. */
export class HUD {
  private routeEl = $('hud-route');
  private tempEl = $('hud-temp');
  private perfFps = $('perf-fps');
  private perfTier = $('perf-tier');
  private perfXY = $('perf-xy');
  private tierBars = $('tier-bars');
  private info = $('info-block');
  private hint = $('hint-overlay');
  private selection = $('selection-card');
  private soundBtn = $('btn-sound');
  private zeroBtn = $('btn-zero');
  private indexBtn = $('btn-index');
  private langBtn = $('btn-lang');
  private manifestoBtn = $('btn-manifesto');
  private nav = $('room-nav');
  private shownTemp = ATRIUM_TEMP_K;
  private zeroActive = false;
  private pendingTempK: number | null = ATRIUM_TEMP_K;
  private route: Route = { name: 'atrium' };
  private meta: RoomMeta | null = null;
  private infoCount: string | undefined;

  constructor(deps: HudDeps) {
    $('btn-index').addEventListener('click', deps.onIndex);
    this.soundBtn.addEventListener('click', deps.onSound);
    this.zeroBtn.addEventListener('click', deps.onZero);
    this.langBtn.addEventListener('click', deps.onLang);
    $('btn-prev').addEventListener('click', deps.onPrev);
    $('btn-next').addEventListener('click', deps.onNext);
    this.applyStatic();
  }

  /** all static chrome (re-applied when the interface language changes) */
  applyStatic() {
    $('skip-link').textContent = tr('skip');
    $('brand-sub').textContent = tr('brand.sub');
    $('status-live').textContent = tr('status.live');
    $('brand').setAttribute('aria-label', tr('brand.aria'));
    $('t-index').textContent = tr('nav.index');
    $('t-zero').textContent = tr('nav.zero');
    $('t-lang').textContent = tr('nav.lang');
    $('t-manifesto').textContent = tr('nav.manifesto');
    $('t-prev').textContent = tr('nav.prev');
    $('t-next').textContent = tr('nav.next');
    this.indexBtn.setAttribute('aria-label', tr('nav.indexAria'));
    this.soundBtn.setAttribute('aria-label', tr('nav.soundAria'));
    this.zeroBtn.setAttribute('aria-label', tr('nav.zeroAria'));
    this.langBtn.setAttribute('aria-label', tr('nav.langAria'));
    this.manifestoBtn.setAttribute('aria-label', tr('nav.manifestoAria'));
    $('btn-prev').setAttribute('aria-label', tr('nav.prevAria'));
    $('btn-next').setAttribute('aria-label', tr('nav.nextAria'));
    $('temp-label').textContent = tr('hud.tempLabel');
    $('sel-kicker').textContent = tr('hud.select');
    $('sel-keys').textContent = tr('hud.dragHint');
    this.setSound(this.soundBtn.classList.contains('active'));
  }

  /** rebuild everything that contains language-dependent copy */
  refresh() {
    this.applyStatic();
    this.setRoute(this.route, this.meta);
    if (this.meta) this.showInfoBlock(this.meta, this.infoCount);
    if (!this.selection.hidden) {
      $('sel-enter').textContent = tr('hud.enterHint');
    }
  }

  // ------------------------------------------------------------- routing --

  setRoute(route: Route, meta: RoomMeta | null) {
    this.route = route;
    this.meta = meta;
    let txt: string;
    if (meta) {
      txt = `00${meta.id} / 006 — ${L(meta.nameEn, meta.nameZh)}`;
    } else if (route.name === 'index') {
      txt = tr('hud.indexRoute');
    } else {
      txt = tr('hud.select');
    }
    this.routeEl.textContent = txt;
    this.manifestoBtn.hidden = route.name !== 'atrium';
    this.nav.hidden = route.name !== 'room';
    this.selection.hidden = route.name !== 'atrium';

    const target = this.zeroActive ? 0 : meta ? meta.tempK : ATRIUM_TEMP_K;
    this.rollTemp(target, meta?.tempLabel);
  }

  // ---------------------------------------------------------------- temp --

  private rollTemp(k: number, exactLabel?: string) {
    this.pendingTempK = k;
    this.tempEl.classList.toggle('frozen', this.zeroActive);
    $('hud-temp-state').textContent = this.zeroActive ? tr('hud.frozen') : (this.meta ? `00${this.meta.id}` : 'ATRIUM');
    const from = this.shownTemp;
    countTo(this.tempEl, from, k, T.counterDur, (v) => {
      this.shownTemp = v;
      return fmtTemp(v);
    });
    if (exactLabel && k < 0.01) {
      window.setTimeout(() => {
        if (this.pendingTempK === k && !this.zeroActive) {
          this.tempEl.textContent = exactLabel;
          this.shownTemp = k;
        }
      }, T.counterDur * 1000 + 30);
    }
  }

  setZeroActive(on: boolean, roomTemp: number | null, roomLabel?: string) {
    this.zeroActive = on;
    this.zeroBtn.classList.toggle('active', on);
    if (on) this.rollTemp(0);
    else this.rollTemp(roomTemp ?? ATRIUM_TEMP_K, roomLabel);
  }

  setSound(on: boolean) {
    $('t-sound').textContent = on ? tr('nav.soundOn') : tr('nav.soundOff');
    this.soundBtn.classList.toggle('active', on);
  }

  /** persistent highlight while the index page is the current route */
  setIndexActive(on: boolean) {
    this.indexBtn.classList.toggle('active', on);
  }

  // ----------------------------------------------------------- info block --

  showInfoBlock(meta: RoomMeta, countLabel?: string) {
    this.meta = meta;
    this.infoCount = countLabel;
    this.info.hidden = false;
    const primaryLine = L(meta.lineEn, meta.lineZh);
    const secondaryLine = L(meta.lineZh, meta.lineEn);
    this.info.innerHTML = `
      <div class="info-watermark" aria-hidden="true">00${meta.id}</div>
      <div class="info-kicker" data-i="kicker"><i></i>${tr('hud.dossier')}</div>
      <div class="info-num" data-i="num">${tr('hud.exhibit')} 00${meta.id} — ${meta.tempLabel}</div>
      <h2 class="info-name" data-i="name">${L(meta.nameEn, meta.nameZh)}</h2>
      <div class="info-zh" data-i="zh">${L(meta.nameZh, meta.nameEn)} · KELVIN ${meta.tempLabel}</div>
      <div class="info-quote">
        <p class="info-line-en" data-i="le">${primaryLine}</p>
        <p class="info-line-zh" data-i="lz">${secondaryLine}</p>
      </div>
      ${countLabel ? `<div class="info-count" data-i="count">${countLabel}</div>` : ''}
      <div class="info-sect" data-i="sect">${tr('hud.specs')}<span>${meta.tech.length.toString().padStart(2, '0')}</span></div>
      <ul class="info-tech" data-i="tech">${meta.tech.map((t) => `<li>${t}</li>`).join('')}</ul>
      <div class="info-sect" data-i="isect">${tr('hud.interaction')}<span>⌘</span></div>
      <div class="info-hint" data-i="hint">${L(meta.hints, meta.hintsZh)} · ${tr('hud.esc')}</div>
    `;
    const q = (s: string) => this.info.querySelector(s) as HTMLElement;
    maskRise(q('[data-i=name]'), { stagger: 0.024 });
    fadeUp(q('[data-i=kicker]'), 0.04, 10);
    fadeUp(q('[data-i=num]'), 0.08, 10);
    fadeUp(q('[data-i=zh]'), 0.14, 10);
    fadeUp(q('[data-i=le]'), 0.2, 12);
    fadeUp(q('[data-i=lz]'), 0.26, 12);
    fadeUp(q('[data-i=tech]'), 0.3, 14);
    fadeUp(q('[data-i=hint]'), 0.38, 10);
    if (countLabel) fadeUp(q('[data-i=count]'), 0.42, 10);
  }

  hideInfoBlock() {
    this.info.hidden = true;
    this.info.innerHTML = '';
    this.infoCount = undefined;
  }

  updateCountLabel(text: string) {
    this.infoCount = text;
    const el = this.info.querySelector('[data-i=count]');
    if (el) el.textContent = text;
  }

  // ------------------------------------------------------- selection card --

  showAtriumSelection(meta: RoomMeta) {
    this.selection.hidden = false;
    $('sel-count').textContent = `00${meta.id} / 006`;
    $('sel-num').textContent = `00${meta.id}`;
    $('sel-name').textContent = L(meta.nameEn, meta.nameZh);
    $('sel-zh').textContent = L(meta.nameZh, meta.nameEn);
    $('sel-temp').textContent = meta.tempLabel;
    $('sel-line').textContent = L(meta.lineEn, meta.lineZh);
    $('sel-enter').textContent = tr('hud.enterHint');
    this.routeEl.textContent = `00${meta.id} / 006 — ${L(meta.nameEn, meta.nameZh)}`;
    // the readout follows the carousel selection, not the atrium ambient value
    const target = this.zeroActive ? 0 : meta.tempK;
    this.rollTemp(target, meta.tempLabel);
    $('hud-temp-state').textContent = this.zeroActive ? tr('hud.frozen') : `00${meta.id}`;
  }

  // ---------------------------------------------------------------- hints --

  showHint(text: string, seconds: number) {
    this.hint.textContent = text;
    this.hint.hidden = false;
    gsap.fromTo(this.hint, { opacity: 0, y: -8 }, { opacity: 1, y: 0, duration: 0.5, overwrite: true });
    window.clearTimeout((this as any)._hintTimer);
    if (!isFinite(seconds)) return;
    (this as any)._hintTimer = window.setTimeout(() => {
      gsap.to(this.hint, { opacity: 0, duration: 0.5, overwrite: true, onComplete: () => { this.hint.hidden = true; } });
    }, seconds * 1000);
  }

  // ----------------------------------------------------------------- perf --

  private perfAcc = 0;
  frame(dt: number, x: number, y: number, fps: number, tier: string) {
    this.perfAcc += dt;
    this.perfXY.textContent = `X ${x.toFixed(3)} Y ${y.toFixed(3)}`;
    if (this.perfAcc > 0.5) {
      this.perfAcc = 0;
      this.perfFps.textContent = `${fps} ${tr('hud.fps')}`;
      this.perfTier.textContent = tier.toUpperCase();
      const n = tier === 'high' ? 3 : tier === 'mid' ? 2 : 1;
      this.tierBars.querySelectorAll('i').forEach((bar, i) => bar.classList.toggle('on', i < n));
    }
  }
}
