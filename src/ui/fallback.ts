import { COPY } from '../config/copy';
import { ROOMS } from '../config/rooms';
import { tr, L } from '../config/i18n';

/** Pure-DOM page shown when WebGL2 is unavailable (SPEC §1 降级文案). */
export function showFallback() {
  const canvas = document.getElementById('gl');
  if (canvas) (canvas as HTMLCanvasElement).style.display = 'none';
  ['loader', 'hud-top', 'hud-bottom', 'marquee', 'panel', 'cursor', 'room-nav', 'selection-card'].forEach((id) => {
    document.getElementById(id)?.setAttribute('hidden', '');
  });

  const el = document.getElementById('fallback');
  if (!el) return;
  el.hidden = false;
  el.innerHTML = `
    <div class="fb-kicker">KELVIN ZERO — WEBGL2 REQUIRED</div>
    <h1>${L('KELVIN ZERO', '零度美术馆')}</h1>
    <p class="msg">${tr('fallback.msg')}</p>
    <p class="msg fb-hint">${tr('fallback.hint')}</p>
    <div class="fb-rule"></div>
    ${ROOMS.map((r) => `
      <div class="fb-room">
        <span class="fb-num">00${r.id}</span>
        <span class="fb-name">${L(r.nameEn, r.nameZh)}</span>
        <span class="fb-line">${L(r.lineEn, r.lineZh)} — ${r.tempLabel}</span>
      </div>`).join('')}
    <p class="fb-foot">${COPY.taglineEn} / ${COPY.taglineZh}</p>
  `;
}
