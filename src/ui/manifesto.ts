import gsap from 'gsap';
import { COPY } from '../config/copy';
import { tr, getLang } from '../config/i18n';
import { maskRise, fadeUp } from './text';
import { cursor } from './cursor';

/** Full-screen bilingual manifesto overlay (atrium, bottom-left button). */
export class Manifesto {
  el: HTMLElement;
  isOpen = false;
  private closeBtn: HTMLElement;

  constructor(private onRequestClose: () => void) {
    this.el = document.getElementById('manifesto')!;
    this.closeBtn = document.createElement('button');
    this.closeBtn.className = 'manifesto-close';
    this.closeBtn.dataset.cursor = 'CLOSE';
    this.closeBtn.addEventListener('click', () => this.onRequestClose());
    this.build(false);
  }

  private build(animate: boolean) {
    const m = COPY.manifesto;
    const isZh = getLang() === 'zh';
    this.el.innerHTML = `
      <div class="mani-frame" aria-hidden="true"></div>
      <div class="mani-inner">
        <div class="mani-top">
          <span class="mani-tag">${tr('manifesto.tag')}</span>
          <span class="mani-index">00 / 03</span>
        </div>
        <h2 data-mani-title>${tr('manifesto.title')}</h2>
        <div class="mani-rule"></div>
        <div class="mani-cols">
          <div class="mani-col ${isZh ? 'dim' : 'lead'}">
            <div class="mani-lang">${tr('manifesto.tagEn')}</div>
            ${m.lines.map((l) => `<p data-mani-en>${l.en}</p>`).join('')}
            <p class="mani-sign">${COPY.taglineEn}<br/>${COPY.subEn}</p>
          </div>
          <div class="mani-col ${isZh ? 'lead' : 'dim'}">
            <div class="mani-lang">${tr('manifesto.tagZh')}</div>
            ${m.lines.map((l) => `<p data-mani-zh>${l.zh}</p>`).join('')}
            <p class="mani-sign">${COPY.taglineZh}<br/>${COPY.subZh}</p>
          </div>
        </div>
      </div>`;
    this.closeBtn.textContent = tr('manifesto.close');
    this.closeBtn.setAttribute('aria-label', tr('manifesto.closeAria'));
    this.el.appendChild(this.closeBtn);
    if (animate) {
      maskRise(this.el.querySelector('[data-mani-title]')!, { stagger: 0.02 });
      this.el.querySelectorAll('[data-mani-en], [data-mani-zh]').forEach((p, i) =>
        fadeUp(p as HTMLElement, 0.18 + (i % 3) * 0.12, 18));
      this.el.querySelectorAll('.mani-sign').forEach((p) => fadeUp(p as HTMLElement, 0.6, 12));
    }
  }

  /** rebuild for a language change without replaying the entrance animation */
  refresh() { this.build(false); }

  open() {
    if (this.isOpen) return;
    this.isOpen = true;
    this.el.hidden = false;
    this.build(true);
    gsap.fromTo(this.el, { opacity: 0 }, { opacity: 1, duration: 0.35, overwrite: true });
    this.closeBtn.focus();
    cursor.current?.setHot(true, 'CLOSE');
  }

  close() {
    if (!this.isOpen) return;
    this.isOpen = false;
    cursor.current?.setHot(false);
    const el = this.el;
    gsap.to(el, {
      opacity: 0, duration: 0.3, overwrite: true,
      onComplete: () => { el.hidden = true; },
    });
  }

  toggle() { this.isOpen ? this.close() : this.open(); }
}
