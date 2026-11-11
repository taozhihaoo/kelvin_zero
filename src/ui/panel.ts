import { fadeUp } from './text';
import { tr, getLang } from '../config/i18n';

export interface PanelSlider {
  type: 'slider';
  label: string;
  labelZh?: string;
  min: number; max: number; step: number;
  value: number;
  fmt?: (v: number) => string;
  onChange: (v: number) => void;
}
export interface PanelButtons {
  type: 'buttons';
  label: string;
  labelZh?: string;
  options: string[];
  value: number; // selected index
  onChange: (index: number) => void;
}
export type PanelControl = PanelSlider | PanelButtons;

/**
 * Floating parameter panel (self-written, SPEC §5.6).
 * Keeps the last schema so language switches and same-route re-entries can
 * rebuild the DOM without re-entering the room (which would duplicate handlers).
 */
export class Panel {
  el: HTMLElement;
  private visible = false;
  private gated = false;
  private controls: PanelControl[] = [];
  private title = '';

  constructor() {
    this.el = document.getElementById('panel')!;
  }

  /** while a frost transition runs, build the controls but keep them hidden */
  setGate(blocked: boolean) {
    this.gated = blocked;
    if (!blocked) this.reveal();
  }

  set(controls: PanelControl[], title = 'CTRL / 参数') {
    this.controls = controls;
    this.title = title;
    this.render();
    this.reveal();
  }

  /** rebuild from the stored schema (language change / re-entering the same route) */
  remount() {
    if (!this.controls.length) return;
    this.render();
    this.reveal();
  }

  refresh() { this.remount(); }

  private label(c: PanelControl): string {
    return getLang() === 'zh' ? (c.labelZh ?? c.label) : c.label;
  }

  private sub(c: PanelControl): string {
    return getLang() === 'zh' ? c.label : (c.labelZh ?? '');
  }

  private render() {
    const isZh = getLang() === 'zh';
    this.el.innerHTML = `
      <div class="p-head">
        <span>${this.title}</span>
        <span class="p-head-tag">${tr('panel.ctrl')} ◇</span>
      </div>`;
    for (const c of this.controls) {
      const row = document.createElement('div');
      row.className = 'p-row';
      const sub = this.sub(c);
      const labelHtml = `<span>${this.label(c)}</span>${sub ? `<i class="p-sub">${sub}</i>` : ''}`;
      if (c.type === 'slider') {
        row.innerHTML = `
          <div class="p-label"><span class="p-label-main">${labelHtml}</span><b data-val></b></div>
          <input type="range" min="${c.min}" max="${c.max}" step="${c.step}" value="${c.value}"
                 aria-label="${this.label(c)}" />`;
        const input = row.querySelector('input')!;
        const val = row.querySelector('[data-val]')!;
        const fmt = c.fmt ?? ((v: number) => v.toFixed(2));
        const fill = () => {
          const pct = ((parseFloat(input.value) - c.min) / (c.max - c.min)) * 100;
          input.style.setProperty('--fill', `${Math.max(0, Math.min(100, pct))}%`);
        };
        val.textContent = fmt(c.value);
        fill();
        input.addEventListener('input', () => {
          const v = parseFloat(input.value);
          val.textContent = fmt(v);
          fill();
          c.onChange(v);
        });
      } else {
        row.innerHTML = `<div class="p-label"><span class="p-label-main">${labelHtml}</span></div>`;
        const btns = document.createElement('div');
        btns.className = 'p-btns';
        c.options.forEach((opt, i) => {
          const b = document.createElement('button');
          b.className = 'pbtn' + (i === c.value ? ' active' : '');
          b.textContent = opt === 'RESET' ? tr('panel.reset') : opt;
          b.setAttribute('aria-label', `${this.label(c)} ${opt}`);
          b.addEventListener('click', () => {
            btns.querySelectorAll('.pbtn').forEach((x) => x.classList.remove('active'));
            b.classList.add('active');
            c.onChange(i);
          });
          btns.appendChild(b);
        });
        row.appendChild(btns);
      }
      this.el.appendChild(row);
    }
    const foot = document.createElement('div');
    foot.className = 'p-foot';
    foot.innerHTML = `<span>${isZh ? '实时参数' : 'LIVE PARAMETERS'}</span><span>◇</span>`;
    this.el.appendChild(foot);
  }

  private reveal() {
    if (this.gated || !this.controls.length) return;
    if (!this.visible) {
      this.visible = true;
      this.el.hidden = false;
      requestAnimationFrame(() => this.el.classList.add('show'));
      fadeUp(this.el, 0.05);
    }
  }

  clear() {
    // Drop the schema too: a later reveal() must not resurrect stale controls
    // on the atrium / index pages.
    this.controls = [];
    this.title = '';
    if (!this.visible) { this.el.hidden = true; return; }
    this.visible = false;
    this.el.classList.remove('show');
    window.setTimeout(() => { if (!this.visible) this.el.hidden = true; }, 500);
  }
}
