// Lightweight interface-language switcher. English is the default.
// `?lang=zh` (or the HUD LANG button) switches the DOM chrome to Chinese.
// No storage is used — the URL query is the only source of truth.
export type Lang = 'en' | 'zh';

const inBrowser = typeof window !== 'undefined' && typeof location !== 'undefined';
const fromQuery: Lang = inBrowser && new URLSearchParams(location.search).get('lang') === 'zh' ? 'zh' : 'en';
let lang: Lang = fromQuery;

type Listener = (l: Lang) => void;
const listeners = new Set<Listener>();

/** Pick a string by the current interface language. */
export function L<T>(en: T, zh: T): T { return lang === 'zh' ? zh : en; }

export function getLang(): Lang { return lang; }

export function onLangChange(cb: Listener): () => void {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

export function setLang(next: Lang) {
  if (next === lang) return;
  lang = next;
  if (inBrowser) {
    document.documentElement.lang = next === 'zh' ? 'zh-CN' : 'en';
    const url = new URL(location.href);
    if (next === 'zh') url.searchParams.set('lang', 'zh');
    else url.searchParams.delete('lang');
    history.replaceState(null, '', url.toString());
  }
  listeners.forEach((cb) => cb(lang));
}

export function initLang() {
  if (inBrowser) document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
}

/** Every translatable piece of UI chrome, keyed for easy re-rendering. */
export const DICT: Record<string, [string, string]> = {
  'skip': ['SKIP TO CONTENT', '跳到内容'],
  'brand.sub': ['AT ZERO, ONLY MATHEMATICS REMAINS.', '在零度，只剩数学。'],
  'brand.aria': ['KELVIN ZERO — back to the atrium', 'KELVIN ZERO — 返回中庭'],
  'status.live': ['● LIVE / WEBGL2', '● 实时渲染 / WEBGL2'],

  'nav.index': ['INDEX', '索引'],
  'nav.soundOn': ['SOUND ON', '声音 开'],
  'nav.soundOff': ['SOUND OFF', '声音 关'],
  'nav.zero': ['ABSOLUTE ZERO [Z]', '绝对零度 [Z]'],
  'nav.lang': ['中文', 'EN'],
  'nav.manifesto': ['MANIFESTO ↗', '策展声明 ↗'],
  'nav.prev': ['← PREV', '← 上一件'],
  'nav.next': ['NEXT →', '下一件 →'],
  'nav.indexAria': ['Open the exhibit index', '打开展品索引'],
  'nav.soundAria': ['Toggle sound', '开关声音'],
  'nav.zeroAria': ['Toggle absolute zero mode', '切换绝对零度模式'],
  'nav.langAria': ['Switch interface language to Chinese', '将界面语言切换为英文'],
  'nav.manifestoAria': ['Open the curatorial statement', '打开策展声明'],
  'nav.prevAria': ['Previous exhibit', '上一件展品'],
  'nav.nextAria': ['Next exhibit', '下一件展品'],

  'hud.select': ['SELECT AN EXHIBIT', '选择展品'],
  'hud.indexRoute': ['INDEX — 006 EXHIBITS', '索引 — 006 件展品'],
  'hud.esc': ['ESC — ATRIUM', 'ESC — 中庭'],
  'hud.enterHint': ['ENTER ↵', '进入 ↵'],
  'hud.enableSound': ['ENABLE SOUND TO PLAY', '开启声音即可演奏'],
  'hud.dragHint': ['DRAG · WHEEL · ← →', '拖动 · 滚轮 · ← →'],
  'hud.tempLabel': ['AMBIENT', '环境温度'],
  'hud.dossier': ['EXHIBIT DOSSIER', '展品档案'],
  'hud.specs': ['SPECIFICATIONS', '技术规格'],
  'hud.interaction': ['INTERACTION', '交互方式'],
  'hud.exhibit': ['EXHIBIT', '展品'],
  'hud.fps': ['FPS', '帧率'],
  'hud.frozen': ['ABSOLUTE ZERO', '绝对零度'],
  'hud.point': ['POINTER', '指针'],

  'panel.ctrl': ['CTRL', '控制'],
  'panel.reset': ['RESET', '重置'],

  'loader.kicker': ['BOOT SEQUENCE', '启动序列'],
  'loader.sub': ['A GALLERY OF COMPUTED PHENOMENA', '一座陈列「被计算出来的现象」的美术馆'],
  'loader.enter': ['ENTER GALLERY ↵', '进入美术馆 ↵'],
  'loader.silent': ['ENTER SILENT', '静音进入'],
  'loader.enterAria': ['Enter the gallery with sound', '开启声音并进入美术馆'],
  'loader.silentAria': ['Enter the gallery in silent mode', '静音进入美术馆'],
  'loader.init': ['INIT RENDERER — WEBGL2', '初始化渲染器 — WEBGL2'],
  'loader.build': ['BUILD', '构建'],
  'loader.warm': ['WARMING GPGPU + THUMBS', '预热 GPGPU 与缩略图'],
  'loader.compile': ['COMPILING SHADERS', '编译着色器'],
  'loader.programs': ['PROGRAMS · OK', '着色器程序 · OK'],
  'loader.ready': ['READY. — CHILLED TO 0 K', '就绪 — 已冷却至 0 K'],
  'loader.initialising': ['INITIALISING', '正在初始化'],
  'loader.chilling': ['CHILLING 300 K → 0 K', '冷却 300 K → 0 K'],

  'manifesto.tag': ['KELVIN ZERO — CURATORIAL STATEMENT', 'KELVIN ZERO — 策展声明'],
  'manifesto.title': ['MANIFESTO', '策展声明'],
  'manifesto.tagEn': ['EN / ENGLISH', 'EN / 英文'],
  'manifesto.tagZh': ['中文 / CHINESE', '中文 / 中文'],
  'manifesto.close': ['CLOSE ✕', '关闭 ✕'],
  'manifesto.closeAria': ['Close the curatorial statement', '关闭策展声明'],

  'index.heading': ['INDEX — 006 EXHIBITS', '索引 — 006 件展品'],
  'index.sub': ['SELECT AN EXHIBIT TO ENTER', '选择展品进入'],
  'index.stats': ['6 EXHIBITS · 100% PROCEDURAL · 0 EXTERNAL ASSETS', '6 件展品 · 全程序化生成 · 零外部资源'],
  'index.enter': ['ENTER →', '进入 →'],
  'index.rowAria': ['Enter exhibit', '进入展品'],

  'fallback.msg': ['THIS PAVILION REQUIRES WEBGL2. PLEASE VISIT WITH AN UP-TO-DATE CHROME / EDGE / FIREFOX / SAFARI.', '此展馆需要 WEBGL2。请使用最新版 Chrome / Edge / Firefox / Safari 访问。'],
  'fallback.hint': ['A gallery of computed phenomena. At zero, only mathematics remains.', '一座陈列「被计算出来的现象」的美术馆。在零度，只剩数学。'],

  'title.atrium': ['KELVIN ZERO — A Gallery of Computed Phenomena', 'KELVIN ZERO — 零度美术馆'],
  'title.index': ['INDEX — KELVIN ZERO', '索引 — KELVIN ZERO 零度美术馆'],
  'title.room': ['KELVIN ZERO — EXHIBIT', 'KELVIN ZERO — 展品'],
};

export function tr(key: string): string {
  const pair = DICT[key];
  if (!pair) return key;
  return L(pair[0], pair[1]);
}
