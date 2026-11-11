import * as THREE from 'three';
import gsap from 'gsap';
import common from '../shaders/common.glsl?raw';
import worldQuadVert from '../shaders/worldQuad.vert.glsl?raw';
import previewFrag from '../shaders/preview.frag.glsl?raw';
import { makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';
import { ROOMS } from '../config/rooms';
import { tr, L } from '../config/i18n';

const BLOOM: BloomSettings = { strength: 0.5, radius: 0.4, threshold: 0.3 };

/**
 * INDEX — giant DOM row list; a WebGL preview card trails the pointer showing
 * the hovered exhibit's live thumbnail, with velocity dispersion.
 */
export function createIndexPage(): Room {
  const thumb = makeThumb();
  let ctx: Ctx;
  let scene: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let mat: THREE.ShaderMaterial;
  let mesh: THREE.Mesh;
  let dom: HTMLElement | null = null;
  let hovered = -1;
  let refreshAcc = 0;
  const pos = { x: 0, y: 0 };
  const vel = { v: 0 };

  function fadePreview(on: boolean) {
    gsap.to(mat.uniforms.uOpacity, { value: on ? 1 : 0, duration: 0.32, overwrite: true });
    if (!on) hovered = -1;
  }

  function buildDom() {
    dom?.remove();
    gsap.killTweensOf(mat.uniforms.uOpacity);
    mat.uniforms.uOpacity.value = 0;
    hovered = -1;
    dom = document.createElement('div');
    dom.innerHTML = `
      <div class="index-head"><span>${tr('index.heading')}</span><span>${tr('index.sub')}</span></div>
      <ol class="index-list">
        ${ROOMS.map((r, i) => `
          <li class="index-row" data-i="${i}" data-cursor="ENTER" tabindex="0" role="link"
              aria-label="${tr('index.rowAria')} 00${r.id} ${L(r.nameEn, r.nameZh)}">
            <span class="idx">00${r.id}</span>
            <span class="nm">${L(r.nameEn, r.nameZh)}</span>
            <span class="zh">${L(r.nameZh, r.nameEn)}</span>
            <span class="tmp">${r.tempLabel}</span>
            <span class="tech">${r.tech[0]}</span>
            <span class="row-go">${tr('index.enter')}</span>
          </li>`).join('')}
      </ol>
      <div class="index-stats">${tr('index.stats')}</div>`;
    dom.querySelectorAll('.index-row').forEach((el) => {
      const i = parseInt((el as HTMLElement).dataset.i!, 10);
      el.addEventListener('pointerenter', () => {
        hovered = i;
        const room = registry.mgr?.rooms.get(ROOMS[i].key);
        if (room?.thumb) mat.uniforms.tThumb.value = room.thumb.texture;
        fadePreview(true);
        registry.blip?.();
      });
      const go = () => registry.router?.go(`#/room/${ROOMS[i].id}`);
      el.addEventListener('click', go);
      el.addEventListener('keydown', (e) => {
        const code = (e as KeyboardEvent).code;
        if (code === 'Enter' || code === 'Space') { (e as KeyboardEvent).preventDefault(); go(); }
      });
    });
    // moving out of the list hides the card again (previously it stayed forever)
    dom.querySelector('.index-list')!.addEventListener('pointerleave', () => fadePreview(false));
    document.getElementById('room-dom')!.appendChild(dom);
  }

  return {
    id: 'index',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 50);
      cam.position.set(0, 0, 6);
      mat = new THREE.ShaderMaterial({
        vertexShader: worldQuadVert,
        fragmentShader: common + previewFrag,
        uniforms: {
          tThumb: { value: null },
          uVel: { value: 0 },
          uOpacity: { value: 0 },
          uTime: { value: 0 },
        },
        transparent: true,
        depthTest: false,
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 2.625), mat);
      mesh.position.z = 2;
      mesh.frustumCulled = false;
      scene.add(mesh);
    },
    enter() {
      buildDom();
      registry.refreshIndex = buildDom;
      hovered = -1;
      refreshAcc = 0;
    },
    leave() {
      registry.refreshIndex = null;
      dom?.remove();
      dom = null;
      hovered = -1;
      gsap.killTweensOf(mat.uniforms.uOpacity);
      mat.uniforms.uOpacity.value = 0;
    },
    update(t, dt) {
      mat.uniforms.uTime.value = t;
      const asp = cam.aspect;
      const tx = ctx.input.x * asp * 3.1;
      const ty = ctx.input.y * 2.3;
      const k = 1 - Math.exp(-dt * 5);
      const px = pos.x + (tx - pos.x) * k;
      const py = pos.y + (ty - pos.y) * k;
      vel.v += (Math.min(1.6, Math.hypot(px - pos.x, py - pos.y) / Math.max(dt, 1e-3) * .35) - vel.v) * k;
      pos.x = px; pos.y = py;
      mesh.position.set(pos.x, pos.y, 2);
      mat.uniforms.uVel.value = vel.v;
      // refresh preview content at ~15fps while hovering (frame-rate independent)
      refreshAcc += dt;
      if (hovered >= 0 && refreshAcc > 1 / 15) {
        refreshAcc = 0;
        const room = registry.mgr?.rooms.get(ROOMS[hovered].key);
        if (room?.thumb) {
          room.update(ctx.clock.t, 1 / 30);
          room.render(ctx.renderer, room.thumb);
        }
      }
    },
    render(r, target) {
      const w = target ? target.width : r.domElement.width;
      const h = target ? target.height : r.domElement.height;
      cam.aspect = w / h;
      cam.updateProjectionMatrix();
      r.setRenderTarget(target);
      r.clear();
      r.render(scene, cam);
    },
    resize() {},
    thumb,
    dispose() {
      dom?.remove();
      mesh?.geometry.dispose();
      mat?.dispose();
      thumb.dispose();
    },
  };
}
