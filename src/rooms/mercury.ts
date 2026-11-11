import * as THREE from 'three';
import gsap from 'gsap';
import common from '../shaders/common.glsl?raw';
import frag from '../shaders/mercury.frag.glsl?raw';
import { QuadRoomBase, Blitter, Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';
import { T } from '../config/timings';

const BLOOM: BloomSettings = { strength: 0.7, radius: 0.5, threshold: 0.25 };

/**
 * 002 MERCURY — raymarched liquid-metal SDF: smooth-union droplets, mouse-lured
 * bead, click shockwave; chromatic-dispersion reflections of a procedural studio.
 */
export function createMercury(): Room {
  const base = new QuadRoomBase(common + frag, {
    uRes: { value: new THREE.Vector2(2, 2) },
    uTime: { value: 0 },
    uPulse: { value: 0 },
    uWarp: { value: 1 },
    uMouse3: { value: new THREE.Vector3(99, 99, 0) },
  });
  const blit = new Blitter();
  const rt = new THREE.WebGLRenderTarget(640, 360, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    generateMipmaps: false,
  });
  const thumb = makeThumb();
  const subs = new Subs();
  let ctx: Ctx;
  let scale = 0.75;
  const mouse = new THREE.Vector3(99, 99, 0);
  const pulse = { v: 0 };

  function rtSizeFor(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    const w = target ? target.width : r.domElement.width;
    const h = target ? target.height : r.domElement.height;
    const tw = Math.max(96, Math.floor(w * scale));
    const th = Math.max(64, Math.floor(h * scale));
    if (rt.width !== tw || rt.height !== th) rt.setSize(tw, th);
    return rt;
  }

  return {
    id: 'r2',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      scale = c.perf.params.renderScale;
      base.renderInto(c.renderer, thumb); // initial thumb frame
    },
    enter() {
      const offClick = ctx.input.on('click', () => {
        pulse.v = 1;
        gsap.to(pulse, { v: 0, duration: T.pulseDecay, ease: T.easeDecay, overwrite: true });
      });
      const offTier = ctx.perf.onTier(() => { scale = ctx.perf.params.renderScale; });
      subs.add(offClick);
      subs.add(offTier);
      registry.panel?.set(
        [
          {
            type: 'slider', label: 'WARP', labelZh: '形变', min: 0, max: 2, step: 0.01,
            value: base.material.uniforms.uWarp.value,
            onChange: (v) => { base.material.uniforms.uWarp.value = v; },
          },
        ],
        '002 MERCURY',
      );
    },
    leave() {
      subs.flush();
    },
    update(t, dt) {
      base.material.uniforms.uTime.value = t;
      base.material.uniforms.uPulse.value = pulse.v;
      // pointer mapped to the z=0 plane, lerp-smoothed
      const asp = rt.width / rt.height;
      const tx = ctx.input.x * asp * 2.2;
      const ty = ctx.input.y * 2.2;
      const k = 1 - Math.exp(-dt * 6);
      mouse.x += (tx - mouse.x) * k;
      mouse.y += (ty - mouse.y) * k;
      (base.material.uniforms.uMouse3.value as THREE.Vector3).copy(mouse);
    },
    render(r, target) {
      const b = rtSizeFor(r, target);
      (base.material.uniforms.uRes.value as THREE.Vector2).set(b.width, b.height);
      base.renderInto(r, b);
      blit.blit(r, b.texture, target);
    },
    resize() {},
    thumb,
    dispose() {
      base.disposeBase();
      blit.dispose();
      rt.dispose();
      thumb.dispose();
    },
  };
}
