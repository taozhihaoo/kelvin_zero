import gsap from 'gsap';
import { T } from '../config/timings';

/** Split element text into masked chars (self-written, no paid plugins). */
export function splitChars(el: HTMLElement): HTMLElement[] {
  const text = el.textContent ?? '';
  el.textContent = '';
  const chars: HTMLElement[] = [];
  for (const ch of text) {
    const mask = document.createElement('span');
    mask.className = 'char-mask';
    const c = document.createElement('span');
    c.className = 'char';
    c.textContent = ch === ' ' ? '\u00A0' : ch;
    mask.appendChild(c);
    el.appendChild(mask);
    chars.push(c);
  }
  return chars;
}

/** Character-by-character masked rise-in (SPEC §2 文字入场). */
export function maskRise(
  el: HTMLElement,
  opts: { delay?: number; stagger?: number; dur?: number } = {},
): gsap.core.Timeline {
  const chars = splitChars(el);
  gsap.set(chars, { yPercent: 115 });
  const tl = gsap.timeline({ delay: opts.delay ?? 0 });
  tl.to(chars, {
    yPercent: 0,
    duration: opts.dur ?? T.textDur,
    ease: T.easeEnter,
    stagger: opts.stagger ?? T.textStagger,
  });
  return tl;
}

/** soft fade-up for paragraphs / lists */
export function fadeUp(el: HTMLElement, delay = 0, dist = 16) {
  gsap.fromTo(
    el,
    { opacity: 0, y: dist },
    { opacity: 1, y: 0, duration: 0.75, ease: T.easeEnter, delay },
  );
}

/** rolling number counter — one stable tween target per element so rapid
 *  route changes cannot leave two tweens fighting over the same readout. */
const counters = new WeakMap<HTMLElement, { v: number }>();

export function countTo(
  el: HTMLElement,
  from: number,
  to: number,
  dur: number,
  fmt: (v: number) => string,
) {
  let o = counters.get(el);
  if (o) gsap.killTweensOf(o);
  else { o = { v: from }; counters.set(el, o); }
  o.v = from;
  gsap.to(o, {
    v: to,
    duration: dur,
    ease: 'power2.out',
    onUpdate: () => { el.textContent = fmt(o!.v); },
  });
}
