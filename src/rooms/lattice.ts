import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import vert from '../shaders/lattice.vert.glsl?raw';
import frag from '../shaders/lattice.frag.glsl?raw';
import { Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';

const BLOOM: BloomSettings = { strength: 0.65, radius: 0.5, threshold: 0.3 };
const SHOCK_SLOTS = 4;

/**
 * 004 LATTICE — an N×N InstancedMesh ocean of pillars displaced in the vertex
 * shader; clicks launch expanding shockwave rings, audio bass breathes through it.
 */
export function createLattice(): Room {
  const thumb = makeThumb();
  const subs = new Subs();
  let ctx: Ctx;
  let N = 200;
  let span = 210;
  let scene: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let mesh: THREE.InstancedMesh;
  let mat: THREE.ShaderMaterial;
  const shocks: THREE.Vector4[] = Array.from({ length: SHOCK_SLOTS }, () => new THREE.Vector4(0, 0, -99, 0));
  let slot = 0;
  let amp = 1.1;
  let waveSpeed = 1;
  const orbit = { theta: 0.5, vTheta: 0, dragging: false, idle: 0 };

  function build() {
    if (mesh) {
      scene.remove(mesh);
      mesh.geometry.dispose();
      mesh.dispose();
    }
    const geo = new THREE.BoxGeometry(0.8, 1, 0.8);
    const grids = new Float32Array(N * N * 2);
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        const k = i * N + j;
        grids[k * 2] = (j + 0.5) / N;
        grids[k * 2 + 1] = (i + 0.5) / N;
      }
    }
    geo.setAttribute('aGrid', new THREE.InstancedBufferAttribute(grids, 2));
    mat.uniforms.uSpan.value = span = N * 1.05;
    mat.uniforms.uN.value = N;
    mesh = new THREE.InstancedMesh(geo, mat, N * N);
    mesh.frustumCulled = false;
    scene.add(mesh);
  }

  function makePanel() {
    return [
      {
        type: 'slider' as const, label: 'AMPLITUDE', labelZh: '振幅', min: 0.4, max: 2, step: 0.05,
        value: amp, onChange: (v: number) => { amp = v; },
      },
      {
        type: 'slider' as const, label: 'WAVE SPEED', labelZh: '波速', min: 0.5, max: 2, step: 0.05,
        value: waveSpeed, onChange: (v: number) => { waveSpeed = v; },
      },
    ];
  }

  return {
    id: 'r4',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      N = c.perf.params.latticeN;
      scene = new THREE.Scene();
      cam = new THREE.PerspectiveCamera(50, 1.6, 0.1, 300);
      mat = new THREE.ShaderMaterial({
        vertexShader: common + vert,
        fragmentShader: common + frag,
        uniforms: {
          uTime: { value: 0 },
          uAmp: { value: amp },
          uWaveSpeed: { value: waveSpeed },
          uBass: { value: 0 },
          uSpan: { value: 210 },
          uN: { value: N },
          uShock: { value: shocks },
          uFogNear: { value: 30 },
          uFogFar: { value: 68 },
        },
      });
      build();
      // warm the thumbnail with a shockwave mid-flight
      mat.uniforms.uTime.value = 2.6;
      shocks[0].set(0.5, 0.5, 1.6, 1.1);
      for (let i = 0; i < 20; i++) { mat.uniforms.uTime.value += 0.05; }
      this.render(c.renderer, thumb);
      shocks[0].set(0, 0, -99, 0);
      mat.uniforms.uTime.value = 0;
    },
    enter() {
      registry.panel?.set(makePanel(), '004 LATTICE');
      const offClick = ctx.input.on('click', (p: any) => {
        // ray → ground plane y=0 → grid uv
        const ray = new THREE.Raycaster();
        ray.setFromCamera(new THREE.Vector2(p.x, p.y), cam);
        const hit = new THREE.Vector3();
        if (ray.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hit)) {
          const gx = hit.x / span + 0.5;
          const gz = hit.z / span + 0.5;
          if (gx >= -0.05 && gx <= 1.05 && gz >= -0.05 && gz <= 1.05) {
            shocks[slot % SHOCK_SLOTS].set(
              Math.min(Math.max(gx, 0), 1), Math.min(Math.max(gz, 0), 1),
              ctx.clock.t, 1.5,
            );
            slot++;
          }
        }
      });
      const offDrag = ctx.input.on('drag', (p: any) => {
        orbit.dragging = true;
        orbit.idle = 0;
        orbit.theta += p.dx * 0.004;
        orbit.vTheta = p.dx * 0.004;
      });
      const offUp = ctx.input.on('up', () => { orbit.dragging = false; });
      const offTier = ctx.perf.onTier(() => {
        N = ctx.perf.params.latticeN;
        build();
      });
      [offClick, offDrag, offUp, offTier].forEach(subs.add, subs);
    },
    leave() {
      subs.flush();
      orbit.dragging = false;
      orbit.vTheta = 0;
    },
    update(t, dt) {
      mat.uniforms.uTime.value = t;
      mat.uniforms.uAmp.value = amp;
      mat.uniforms.uWaveSpeed.value = waveSpeed;
      mat.uniforms.uBass.value = ctx.audio.enabled ? ctx.audio.bands.bass : 0;
      if (!orbit.dragging) {
        orbit.theta += orbit.vTheta;
        orbit.vTheta *= Math.pow(0.05, dt);
        orbit.idle += dt;
        if (orbit.idle > 4) orbit.theta += dt * 0.02;
      }
      const r = 26;
      cam.position.set(Math.sin(orbit.theta) * r, 9.5, Math.cos(orbit.theta) * r);
      cam.lookAt(0, 0.5, 0);
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
      mesh?.geometry.dispose();
      mesh?.dispose();
      mat?.dispose();
      thumb.dispose();
    },
  };
}
