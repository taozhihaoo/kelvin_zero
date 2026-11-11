// Minimal hash router: #/ · #/room/1..6 · #/index — back/forward supported.
// Pure module: no DOM access at import time, so it is unit-testable in Node.
export type Route =
  | { name: 'atrium' }
  | { name: 'room'; id: string }
  | { name: 'index' };

export type Lang = 'en' | 'zh';

const NAMES_EN: Record<string, string> = {
  '1': 'TURING', '2': 'MERCURY', '3': 'CURL',
  '4': 'LATTICE', '5': 'ECHO', '6': 'HORIZON',
};
const NAMES_ZH: Record<string, string> = {
  '1': '图灵', '2': '水银', '3': '旋度',
  '4': '晶格', '5': '回声', '6': '事件视界',
};

export function parseHash(hash: string): Route {
  const h = (hash || '#/').replace(/^#/, '');
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'room' && parts[1] && /^[1-6]$/.test(parts[1])) {
    return { name: 'room', id: parts[1] };
  }
  if (parts[0] === 'index') return { name: 'index' };
  return { name: 'atrium' };
}

export function routeKey(r: Route): string {
  if (r.name === 'room') return 'r' + r.id;
  return r.name; // 'atrium' | 'index'
}

export function routeHash(r: Route): string {
  if (r.name === 'room') return `#/room/${r.id}`;
  if (r.name === 'index') return '#/index';
  return '#/';
}

export function routeTitle(r: Route, lang: Lang = 'en'): string {
  if (r.name === 'atrium') {
    return lang === 'zh' ? 'KELVIN ZERO — 零度美术馆' : 'KELVIN ZERO — A Gallery of Computed Phenomena';
  }
  if (r.name === 'index') return 'INDEX — KELVIN ZERO';
  const name = lang === 'zh'
    ? `${NAMES_EN[r.id] ?? ''} / ${NAMES_ZH[r.id] ?? ''}`
    : (NAMES_EN[r.id] ?? '');
  return `KELVIN ZERO — 00${r.id} ${name}`;
}

/** neighbour exhibit ids for the on-screen PREV / NEXT controls (wraps 1..6) */
export function neighbourIds(id: string, dir: number): string {
  let n = parseInt(id, 10);
  if (!Number.isFinite(n)) n = 1;
  n += dir;
  if (n < 1) n = 6;
  if (n > 6) n = 1;
  return String(n);
}

export class Router {
  private cbs = new Set<(r: Route) => void>();

  constructor() {
    window.addEventListener('hashchange', () => this.fire());
  }

  on(cb: (r: Route) => void): () => void {
    this.cbs.add(cb);
    return () => this.cbs.delete(cb);
  }

  private fire() {
    const r = this.current();
    this.cbs.forEach((cb) => cb(r));
  }

  current(): Route {
    return parseHash(location.hash);
  }

  go(hash: string) {
    if (location.hash === hash) this.fire();
    else location.hash = hash;
  }

  /** trigger listeners for the initial route */
  start() {
    this.fire();
  }
}
