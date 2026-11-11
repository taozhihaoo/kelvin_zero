import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import simFrag from '../shaders/turing.sim.glsl?raw';
import dispVert from '../shaders/turing.vert.glsl?raw';
import dispFrag from '../shaders/turing.frag.glsl?raw';
import { PingPong } from '../core/pingpong';
import { Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';

const BLOOM: BloomSettings = { strength: 0.6, radius: 0.45, threshold: 0.3 };

const PRESETS: Array<{ name: string; f: number; k: number }> = [
  { name: 'SPOTS', f: 0.035, k: 0.065 },
  { name: 'MAZE', f: 0.029, k: 0.057 },
  { name: 'CORAL', f: 0.0545, k: 0.062 },
  { name: 'MITOSIS', f: 0.0367, k: 0.0649 },
];

/**
 * 001 TURING — Gray–Scott reaction–diffusion on a GPU ping-pong pair;
 * the v channel displaces a chrome heightfield you can paint into.
 */
export function createTuring(): Room {
  const thumb = makeThumb();
  const subs = new Subs();
  let ctx: Ctx;
  let size = 512;
  let steps = 8;
  let pp: PingPong;
  let scene: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let mesh: THREE.Mesh;
  let mat: THREE.ShaderMaterial;
  const ray = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let preset = 1; // MAZE
  let brushSize = 0.045;
  const mouseUv = new THREE.Vector2(0.5, 0.5);
  let panelSelection = preset;

  function floatType(r: THREE.WebGLRenderer): THREE.TextureDataType {
    return r.extensions.has('EXT_color_buffer_float') ? THREE.FloatType : THREE.HalfFloatType;
  }

  function buildSim(r: THREE.WebGLRenderer) {
    pp?.dispose();
    const type = floatType(r);
    const uniforms: Record<string, THREE.IUniform> = {
      uTex: { value: null },
      uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
      uF: { value: PRESETS[preset].f },
      uK: { value: PRESETS[preset].k },
      uBrush: { value: 0 },
      uMouse: { value: mouseUv },
      uAspect: { value: 1 },
    };
    pp = new PingPong(size, simFrag, uniforms, type);
    reseed(r);
  }

  function reseed(r: THREE.WebGLRenderer) {
    const data = new Float32Array(size * size * 4);
    for (let i = 0; i < size * size; i++) {
      data[i * 4] = 1; data[i * 4 + 1] = 0; data[i * 4 + 2] = 0; data[i * 4 + 3] = 1;
    }
    const blocks = 14;
    for (let b = 0; b < blocks; b++) {
      const bx = 8 + Math.floor(Math.random() * (size - 16));
      const by = 8 + Math.floor(Math.random() * (size - 16));
      const s = 3 + Math.floor(Math.random() * 5);
      for (let y = by; y < by + s; y++) {
        for (let x = bx; x < bx + s; x++) {
          const i = (y * size + x) * 4;
          data[i] = 0.2; data[i + 1] = 1;
        }
      }
    }
    const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat, THREE.FloatType);
    tex.needsUpdate = true;
    pp.seed(r, tex);
    tex.dispose();
  }

  function setPreset(i: number) {
    preset = i;
    panelSelection = i;
    if (pp) {
      pp.material.uniforms.uF.value = PRESETS[i].f;
      pp.material.uniforms.uK.value = PRESETS[i].k;
    }
    registry.panel?.set(makePanel(), '001 TURING');
  }

  function makePanel() {
    return [
      {
        type: 'buttons' as const, label: 'PATTERN', labelZh: '图案', options: PRESETS.map((p) => p.name),
        value: panelSelection, onChange: (i: number) => setPreset(i),
      },
      {
        type: 'slider' as const, label: 'BRUSH', labelZh: '画笔', min: 0.02, max: 0.12, step: 0.005,
        value: brushSize,
        fmt: (v: number) => v.toFixed(3),
        onChange: (v: number) => { brushSize = v; },
      },
      {
        type: 'buttons' as const, label: 'SEED', labelZh: '重置', options: ['RESET'],
        value: -1, onChange: () => { if (ctx) reseed(ctx.renderer); },
      },
    ];
  }

  return {
    id: 'r1',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      size = c.perf.params.rdSize;
      steps = c.perf.params.rdSteps;
      buildSim(c.renderer);

      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(46, 1.6, 0.1, 100);
      cam.position.set(0, 7.6, 7.2);
      cam.lookAt(0, 0, 0);
      mat = new THREE.ShaderMaterial({
        vertexShader: dispVert,
        fragmentShader: common + dispFrag,
        uniforms: {
          uTex: { value: pp.texture },
          uTexel: { value: new THREE.Vector2(1 / size, 1 / size) },
          uAmp: { value: 1.15 },
          uTime: { value: 0 },
        },
      });
      mesh = new THREE.Mesh(new THREE.PlaneGeometry(10, 10, 255, 255), mat);
      mesh.rotation.x = -Math.PI / 2;
      scene.add(mesh);

      // a few warm frames into the thumbnail
      for (let i = 0; i < 18; i++) {
        pp.step(c.renderer);
        mat.uniforms.uTime.value = i * 0.05;
      }
      this.render(c.renderer, thumb);
    },
    enter() {
      registry.panel?.set(makePanel(), '001 TURING');
      const offKey = ctx.input.on('key', ({ code }: any) => {
        if (code === 'Space') { reseed(ctx.renderer); }
        else if (code >= 'Digit1' && code <= 'Digit4') setPreset(parseInt(code.slice(5), 10) - 1);
      });
      const offTier = ctx.perf.onTier(() => {
        size = ctx.perf.params.rdSize;
        steps = ctx.perf.params.rdSteps;
        buildSim(ctx.renderer);
        mat.uniforms.uTex.value = pp.texture;
        (mat.uniforms.uTexel.value as THREE.Vector2).set(1 / size, 1 / size);
      });
      subs.add(offKey); subs.add(offTier);
    },
    leave() {
      subs.flush();
    },
    update(t, _dt) {
      mat.uniforms.uTime.value = t;
      const u = pp.material.uniforms;
      u.uF.value = PRESETS[preset].f;
      u.uK.value = PRESETS[preset].k;
      u.uAspect.value = 1;
      // brush: raycast pointer onto the plane
      ndc.set(ctx.input.x, ctx.input.y);
      ray.setFromCamera(ndc, cam);
      const hit = ray.intersectObject(mesh, false)[0];
      if (hit && hit.uv) { mouseUv.set(hit.uv.x, hit.uv.y); }
      u.uBrush.value = ctx.input.down && hit ? brushSize : 0;
      for (let i = 0; i < steps; i++) pp.step(ctx.renderer);
      mat.uniforms.uTex.value = pp.texture;
      // slow drifting overhead camera
      const a = t * 0.03 + ctx.input.x * 0.1;
      cam.position.set(Math.sin(a) * 1.8, 7.6 - ctx.input.y * 0.5, 7.2 + Math.cos(a) * 1.2);
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
      pp?.dispose();
      mesh?.geometry.dispose();
      mat?.dispose();
      thumb.dispose();
    },
  };
}
