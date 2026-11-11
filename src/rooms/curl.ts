import * as THREE from 'three';
import gsap from 'gsap';
import { GPUComputationRenderer } from 'three/examples/jsm/misc/GPUComputationRenderer.js';
import common from '../shaders/common.glsl?raw';
import posFrag from '../shaders/curl.pos.glsl?raw';
import ptsVert from '../shaders/curl.vert.glsl?raw';
import ptsFrag from '../shaders/curl.frag.glsl?raw';
import { Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';
import { T } from '../config/timings';

const BLOOM: BloomSettings = { strength: 0.6, radius: 0.5, threshold: 0.35 };
const MODES = ['FLOW', 'AIZAWA', 'THOMAS', 'LORENZ'];

/**
 * 003 CURL — up to 1,048,576 GPGPU particles advected by curl noise or three
 * strange attractors; pointer attracts (flow) and clicks detonate a burst.
 */
export function createCurl(): Room {
  const thumb = makeThumb();
  const subs = new Subs();
  let ctx: Ctx;
  let N = 512;
  let gpu: GPUComputationRenderer | null = null;
  let posVar: any;
  let scene: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let points: THREE.Points;
  let mat: THREE.ShaderMaterial;
  const burst = { v: 0 };
  let mode = 0;
  let speed = 1;
  let resetPulse = false;
  let panelSel = 0;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const mouse3 = new THREE.Vector3(0, 0, 0);
  const planeZ = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
  const hitP = new THREE.Vector3();

  function fillInitial() {
    const dt = gpu!.createTexture();
    const arr = dt.image.data as unknown as Float32Array;
    for (let i = 0; i < arr.length; i += 4) {
      arr[i] = (Math.random() - 0.5) * 5;
      arr[i + 1] = (Math.random() - 0.5) * 5;
      arr[i + 2] = (Math.random() - 0.5) * 5;
      arr[i + 3] = 0.4 + Math.random() * 1.0; // life
    }
    dt.needsUpdate = true;
    return dt;
  }

  function build(r: THREE.WebGLRenderer) {
    if (gpu) { gpu.dispose(); gpu = null; }
    gpu = new GPUComputationRenderer(N, N, r);
    gpu.setDataType(r.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType);
    const init = fillInitial();
    posVar = gpu.addVariable('texturePosition', common + posFrag, init);
    gpu.setVariableDependencies(posVar, [posVar]);
    Object.assign(posVar.material.uniforms, {
      uTime: { value: 0 },
      uDt: { value: 1 / 60 },
      uSpeed: { value: speed },
      uBurst: { value: 0 },
      uMode: { value: mode },
      uMouse: { value: mouse3 },
      uReset: { value: 0 },
    });
    posVar.material.wrapS = THREE.RepeatWrapping;
    posVar.material.wrapT = THREE.RepeatWrapping;
    const err = gpu.init();
    if (err) console.error('[curl] GPUComputationRenderer:', err);

    // points geometry: reference uv per particle
    const count = N * N;
    const refs = new Float32Array(count * 2);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        refs[k * 2] = (j + 0.5) / N;
        refs[k * 2 + 1] = (i + 0.5) / N;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('aRef', new THREE.BufferAttribute(refs, 2));
    if (mat) { mat.dispose(); }
    mat = new THREE.ShaderMaterial({
      vertexShader: ptsVert,
      fragmentShader: common + ptsFrag,
      uniforms: { tPos: { value: null }, uSize: { value: 1.35 } },
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    });
    if (points) { points.geometry.dispose(); scene.remove(points); }
    points = new THREE.Points(geo, mat);
    points.frustumCulled = false;
    if (!scene) scene = new THREE.Scene();
    scene.add(points);
    registry.hud?.updateCountLabel(`${count.toLocaleString('en-US')} PARTICLES`);
  }

  function setMode(i: number) {
    mode = i;
    panelSel = i;
    resetPulse = true;
    registry.panel?.set(makePanel(), '003 CURL');
  }

  function makePanel() {
    return [
      { type: 'buttons' as const, label: 'MODE', labelZh: '模式', options: MODES, value: panelSel, onChange: setMode },
      {
        type: 'slider' as const, label: 'SPEED', labelZh: '速度', min: 0.1, max: 3, step: 0.05,
        value: speed, onChange: (v: number) => { speed = v; },
      },
    ];
  }

  return {
    id: 'r3',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      N = c.perf.params.curlN;
      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 100);
      cam.position.set(0, 2.4, 9);
      build(c.renderer);
      // warm frames so thumbnails show a formed shape
      for (let i = 0; i < 26; i++) {
        gpu!.compute();
        mat.uniforms.tPos.value = gpu!.getCurrentRenderTarget(posVar).texture;
      }
      this.render(c.renderer, thumb);
    },
    enter() {
      registry.panel?.set(makePanel(), '003 CURL');
      const offClick = ctx.input.on('click', () => {
        burst.v = 1;
        gsap.to(burst, { v: 0, duration: T.burstDecay, ease: T.easeDecay, overwrite: true });
      });
      const offKey = ctx.input.on('key', ({ code }: any) => {
        if (code >= 'Digit1' && code <= 'Digit4') setMode(parseInt(code.slice(5), 10) - 1);
      });
      const offTier = ctx.perf.onTier(() => {
        N = ctx.perf.params.curlN;
        build(ctx.renderer);
      });
      [offClick, offKey, offTier].forEach(subs.add, subs);
    },
    leave() {
      subs.flush();
    },
    update(t, dt) {
      const u = posVar.material.uniforms;
      const step = Math.min(dt, 1 / 30);
      u.uTime.value = t;
      u.uDt.value = step;
      u.uSpeed.value = speed;
      u.uMode.value = mode;
      u.uBurst.value = burst.v;
      u.uReset.value = resetPulse ? 1 : 0;
      // pointer → world point on z=0 plane (park far away until the pointer actually moves)
      if (ctx.input.hasMoved) {
        ndc.set(ctx.input.x, ctx.input.y);
        ray.setFromCamera(ndc, cam);
        ray.ray.intersectPlane(planeZ, hitP);
        if (hitP) mouse3.copy(hitP);
      } else {
        mouse3.set(999, 999, 999);
      }
      gpu!.compute();
      if (resetPulse) resetPulse = false;
      mat.uniforms.tPos.value = gpu!.getCurrentRenderTarget(posVar).texture;
      // slow orbit + parallax
      const a = t * 0.06 + ctx.input.x * 0.15;
      cam.position.set(Math.sin(a) * 9, 2.4 + ctx.input.y * 1.2, Math.cos(a) * 9);
      cam.lookAt(0, 0, 0);
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
      subs.flush();
      gpu?.dispose();
      points?.geometry.dispose();
      mat?.dispose();
      thumb.dispose();
    },
  };
}
