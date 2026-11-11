import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { Pass } from 'three/examples/jsm/postprocessing/Pass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { SceneManager } from './sceneManager';
import type { BloomSettings } from '../rooms/room';
import { DEFAULT_BLOOM } from '../rooms/room';
import quadVert from '../shaders/quad.vert.glsl?raw';
import finalFrag from '../shaders/final.frag.glsl?raw';
import { TIERS, type Tier } from './perf';

class RoomPass extends Pass {
  constructor(private mgr: SceneManager) {
    super();
    this.needsSwap = false;
  }
  render(renderer: THREE.WebGLRenderer, _write: THREE.WebGLRenderTarget, readBuffer: THREE.WebGLRenderTarget) {
    this.mgr.renderInto(renderer, this.renderToScreen ? null : readBuffer);
    renderer.setRenderTarget(null);
  }
}

export class Post {
  composer: EffectComposer;
  bloom: UnrealBloomPass;
  finalPass: ShaderPass;
  roomPass: RoomPass;

  constructor(renderer: THREE.WebGLRenderer, mgr: SceneManager, w: number, h: number) {
    this.composer = new EffectComposer(renderer);
    this.roomPass = new RoomPass(mgr);
    this.bloom = new UnrealBloomPass(new THREE.Vector2(w, h), DEFAULT_BLOOM.strength, DEFAULT_BLOOM.radius, DEFAULT_BLOOM.threshold);
    this.finalPass = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null },
        uTime: { value: 0 },
        uRTime: { value: 0 },
        uVel: { value: 0 },
        uFrost: { value: 0 },
        uGrain: { value: 0.032 },
        uAberr: { value: 0 },
        uRes: { value: new THREE.Vector2(w, h) },
      },
      vertexShader: quadVert,
      fragmentShader: finalFrag,
    });
    const output = new OutputPass();
    this.composer.addPass(this.roomPass);
    this.composer.addPass(this.bloom);
    this.composer.addPass(this.finalPass);
    this.composer.addPass(output);
  }

  setBloom(s: BloomSettings) {
    this.bloom.strength = s.strength;
    this.bloom.radius = s.radius;
    this.bloom.threshold = s.threshold;
  }

  setTier(t: Tier, w: number, h: number) {
    const p = TIERS[t];
    if (p.useBloom) this.bloom.enabled = true;
    else this.bloom.enabled = false;
    this.resize(w, h);
  }

  /** per-frame uniform feed */
  feed(t: number, realT: number, vel: number, frost: number, aberr: number) {
    const u = this.finalPass.uniforms;
    u.uTime.value = t;
    u.uRTime.value = realT;
    u.uVel.value = vel;
    u.uFrost.value = frost;
    u.uAberr.value = aberr;
  }

  resize(w: number, h: number) {
    this.composer.setSize(w, h);
    this.bloom.setSize(w, h);
    (this.finalPass.uniforms.uRes.value as THREE.Vector2).set(w, h);
  }

  render() {
    this.composer.render();
  }

  dispose() {
    this.composer.dispose?.();
    this.bloom.dispose();
    this.finalPass.dispose?.();
  }
}
