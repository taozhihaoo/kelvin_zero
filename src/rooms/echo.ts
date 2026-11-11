import * as THREE from 'three';
import common from '../shaders/common.glsl?raw';
import worldQuadVert from '../shaders/worldQuad.vert.glsl?raw';
import wVert from '../shaders/echo.vert.glsl?raw';
import wFrag from '../shaders/echo.frag.glsl?raw';
import motesVert from '../shaders/echoMotes.vert.glsl?raw';
import motesFrag from '../shaders/echoMotes.frag.glsl?raw';
import ringFrag from '../shaders/echoRing.frag.glsl?raw';
import { Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';
import { AudioEngine } from '../audio/engine';
import { tr } from '../config/i18n';

const BLOOM: BloomSettings = { strength: 0.8, radius: 0.5, threshold: 0.25 };
const ROWS = 64, COLS = 128;

/**
 * 005 ECHO — the pointer is a theremin (X = pentatonic pitch, Y = filter/volume);
 * an FFT waterfall renders as an occlusion-line terrain; CMB motes twinkle behind.
 */
export function createEcho(): Room {
  const thumb = makeThumb();
  const subs = new Subs();
  let ctx: Ctx;
  let scene: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let mat: THREE.ShaderMaterial;
  let spectrum: THREE.DataTexture;
  let rowPtr = 0;
  let ring: THREE.Mesh;
  let ringMat: THREE.ShaderMaterial;
  let waterfall: THREE.Mesh;
  let motesGeo: THREE.BufferGeometry;
  const rowBuf = new Uint8Array(COLS);
  let octave = 0;
  let playing = false;
  let curFreq = 220;

  function writeRow(data: Uint8Array) {
    const px = (spectrum.image as any).data as Uint8Array;
    px.set(data, rowPtr * COLS);
    spectrum.needsUpdate = true;
    mat.uniforms.uRow.value = rowPtr;
    rowPtr = (rowPtr + 1) % ROWS;
  }

  function fakeSpectrum(t: number, px: number) {
    for (let i = 0; i < COLS; i++) {
      const base = Math.sin(i * .085 - t * 2.1) * .5 + .5;
      const swell = Math.pow(Math.sin(t * .5 + i * .021) * .5 + .5, 3.);
      let v = (.1 + .55 * base * swell) * 255;
      const d = Math.abs(i / COLS - px);
      v += Math.exp(-d * d * 90.) * (playing ? 130 : 60);
      rowBuf[i] = Math.min(255, v);
    }
  }

  function freqFor(x: number): number {
    const n = AudioEngine.PENTATONIC.length;
    const idx = Math.min(n - 1, Math.max(0, Math.round((x * .5 + .5) * (n - 1))));
    return AudioEngine.PENTATONIC[idx] * Math.pow(2, octave);
  }

  function makePanel() {
    return [
      {
        type: 'buttons' as const, label: 'OCTAVE', labelZh: '八度', options: ['-1', '0', '+1'],
        value: octave + 1,
        onChange: (i: number) => { octave = i - 1; },
      },
      {
        type: 'slider' as const, label: 'DELAY', labelZh: '回声', min: 0, max: 1, step: 0.01,
        value: 0.35,
        fmt: (v: number) => v.toFixed(2),
        onChange: (v: number) => { ctx?.audio.setDelayWet(v); },
      },
    ];
  }

  return {
    id: 'r5',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050507);
      cam = new THREE.PerspectiveCamera(52, 1.6, 0.1, 120);
      cam.position.set(0, 2.5, 7.6);
      cam.lookAt(0, 1.1, -1);

      spectrum = new THREE.DataTexture(new Uint8Array(COLS * ROWS), COLS, ROWS,
        THREE.RedFormat, THREE.UnsignedByteType);
      spectrum.magFilter = THREE.NearestFilter;
      spectrum.minFilter = THREE.NearestFilter;
      spectrum.needsUpdate = true;

      mat = new THREE.ShaderMaterial({
        vertexShader: wVert,
        fragmentShader: common + wFrag,
        uniforms: { tSpectrum: { value: spectrum }, uRow: { value: 0 } },
      });
      const geo = new THREE.PlaneGeometry(10, 6, COLS - 1, ROWS - 1);
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2 + 0.42;
      mesh.position.y = 0.4;
      scene.add(mesh);
      waterfall = mesh;

      // cosmic-microwave-background motes
      const N = 700;
      const pos = new Float32Array(N * 3);
      const seed = new Float32Array(N);
      for (let i = 0; i < N; i++) {
        const r = 26 + Math.random() * 22;
        const th = Math.random() * Math.PI * 2;
        const ph = Math.acos(Math.random() * 1.6 - 0.6);
        pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
        pos[i * 3 + 1] = Math.abs(r * Math.cos(ph)) * .6 + 1;
        pos[i * 3 + 2] = -Math.abs(r * Math.sin(ph) * Math.sin(th)) - 4;
        seed[i] = Math.random() * 100;
      }
      const pg = new THREE.BufferGeometry();
      pg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      pg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
      motesGeo = pg;
      const pmat = new THREE.ShaderMaterial({
        vertexShader: motesVert,
        fragmentShader: common + motesFrag,
        uniforms: { uTime: { value: 0 } },
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        transparent: true,
      });
      const motes = new THREE.Points(pg, pmat);
      motes.frustumCulled = false;
      scene.add(motes);
      (this as any)._motes = pmat;

      // pitch ring at the pointer
      ringMat = new THREE.ShaderMaterial({
        vertexShader: worldQuadVert,
        fragmentShader: common + ringFrag,
        uniforms: { uOpacity: { value: 0.25 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      ring = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.6), ringMat);
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.06;
      scene.add(ring);
    },
    enter() {
      registry.panel?.set(makePanel(), '005 ECHO');
      const audio = ctx.audio;
      const playAt = (p: any) => {
        curFreq = freqFor(p.x);
        const vol = .1 + (p.y * .5 + .5) * .3;
        const cutoff = 200 + (p.y * .5 + .5) * 3800;
        if (!playing) { playing = true; audio.noteOn(curFreq, cutoff, vol); }
        else audio.noteMove(curFreq, cutoff, vol);
      };
      const offDown = ctx.input.on('click', playAt);
      const offDrag = ctx.input.on('drag', playAt);
      const offMove = ctx.input.on('move', playAt);
      const offUp2 = (() => {
        const h = () => { if (playing) { audio.noteOff(); playing = false; } };
        window.addEventListener('pointerup', h);
        return () => window.removeEventListener('pointerup', h);
      })();
      [offDown, offDrag, offMove, offUp2].forEach(subs.add, subs);
      if (!audio.enabled) registry.hud?.showHint(tr('hud.enableSound'), 4);
    },
    leave() {
      subs.flush();
      ctx.audio.noteOff(true);
      playing = false;
    },
    update(t, _dt) {
      const audio = ctx.audio;
      if (audio.enabled) {
        rowBuf.set(audio.fft.slice(0, COLS));
      } else {
        fakeSpectrum(t, ctx.input.x * .5 + .5);
      }
      writeRow(rowBuf);
      (this as any)._motes.uniforms.uTime.value = t;
      // pitch ring follows the pointer on the floor plane
      ring.position.x = ctx.input.x * 5.4;
      ring.position.z = 2.4 - (ctx.input.y * .5 + .5) * 4.4;
      const s = .55 + (Math.log2(curFreq / 110) + 2.5) * .3;
      ring.scale.setScalar(playing ? s : s * .5);
      ringMat.uniforms.uOpacity.value = playing ? 1 : 0.25;
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
      ring?.geometry.dispose();
      ringMat?.dispose();
      mat?.dispose();
      waterfall?.geometry.dispose();
      motesGeo?.dispose();
      (this as any)._motes?.dispose();
      spectrum?.dispose();
      thumb.dispose();
    },
  };
}
