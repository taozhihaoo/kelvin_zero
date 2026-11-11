import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import frag from '../shaders/horizon.frag.glsl?raw';
import { QuadRoomBase, Blitter, Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';
import { REDUCED_MOTION } from '../config/timings';

const BLOOM: BloomSettings = { strength: 0.85, radius: 0.55, threshold: 0.45 };

/**
 * 006 HORIZON — Schwarzschild-ish geodesic ray bending: photon ring, Doppler-beamed
 * accretion disk, lensed starfield. Orbit camera with inertia; wheel = distance.
 */
export function createHorizon(): Room {
  const base = new QuadRoomBase(common + frag, {
    uRes: { value: new THREE.Vector2(2, 2) },
    uTime: { value: 0 },
    uMass: { value: 1.0 },
    uDisk: { value: 1.0 },
    uCam: { value: new THREE.Vector3(0, 1.4, 12) },
    uRight: { value: new THREE.Vector3(1, 0, 0) },
    uUp: { value: new THREE.Vector3(0, 1, 0) },
    uFwd: { value: new THREE.Vector3(0, 0, -1) },
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

  // orbit state
  const st = {
    theta: 0.6, phi: 0.21, dist: 13,
    vTheta: 0, vPhi: 0,
    idle: 0,
    dragging: false,
  };

  function rtSizeFor(r: THREE.WebGLRenderer, target: THREE.WebGLRenderTarget | null) {
    const w = target ? target.width : r.domElement.width;
    const h = target ? target.height : r.domElement.height;
    const tw = Math.max(96, Math.floor(w * scale));
    const th = Math.max(64, Math.floor(h * scale));
    if (rt.width !== tw || rt.height !== th) rt.setSize(tw, th);
    return rt;
  }

  function updateCamera() {
    const cp = Math.cos(st.phi), sp = Math.sin(st.phi);
    const cam = base.material.uniforms.uCam.value as THREE.Vector3;
    cam.set(Math.sin(st.theta) * cp, sp, Math.cos(st.theta) * cp).multiplyScalar(st.dist);
    const fwd = base.material.uniforms.uFwd.value as THREE.Vector3;
    fwd.copy(cam).multiplyScalar(-1).normalize();
    const right = base.material.uniforms.uRight.value as THREE.Vector3;
    right.crossVectors(fwd, new THREE.Vector3(0, 1, 0)).normalize();
    const up = base.material.uniforms.uUp.value as THREE.Vector3;
    up.crossVectors(right, fwd).normalize();
  }

  return {
    id: 'r6',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      scale = c.perf.params.renderScale;
      updateCamera();
      base.renderInto(c.renderer, thumb);
    },
    enter() {
      st.idle = 0;
      const offDrag = ctx.input.on('drag', (p: any) => {
        st.dragging = true;
        st.idle = 0;
        st.vTheta = -p.dx * 0.0035;
        st.vPhi = p.dy * 0.0022;
        st.theta += st.vTheta;
        st.phi = Math.min(1.25, Math.max(0.04, st.phi + st.vPhi));
      });
      const offWheel = ctx.input.on('wheel', (p: any) => {
        st.idle = 0;
        st.dist = Math.min(16, Math.max(4.5, st.dist + p.dy * 0.006));
      });
      const offUp = ctx.input.on('up', () => { st.dragging = false; });
      const offTier = ctx.perf.onTier(() => { scale = ctx.perf.params.renderScale; });
      [offDrag, offWheel, offUp, offTier].forEach(subs.add, subs);
      registry.panel?.set(
        [
          {
            type: 'slider', label: 'MASS', labelZh: '质量', min: 0.6, max: 1.6, step: 0.01,
            value: base.material.uniforms.uMass.value,
            onChange: (v) => { base.material.uniforms.uMass.value = v; },
          },
          {
            type: 'slider', label: 'DISK', labelZh: '吸积盘', min: 0, max: 2, step: 0.01,
            value: base.material.uniforms.uDisk.value,
            onChange: (v) => { base.material.uniforms.uDisk.value = v; },
          },
        ],
        '006 HORIZON',
      );
    },
    leave() {
      subs.flush();
      st.dragging = false;
      st.vTheta = 0; st.vPhi = 0;
    },
    update(t, dt) {
      base.material.uniforms.uTime.value = t;
      // inertia + idle drift
      if (!st.dragging) {
        st.theta += st.vTheta;
        st.phi = Math.min(1.25, Math.max(0.04, st.phi + st.vPhi));
        st.vTheta *= Math.pow(0.04, dt);
        st.vPhi *= Math.pow(0.04, dt);
        st.idle += dt;
        if (st.idle > 3 && !REDUCED_MOTION) st.theta += dt * 0.05;
      }
      updateCamera();
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
