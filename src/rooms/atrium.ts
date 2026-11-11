import * as THREE from 'three';
import gsap from 'gsap';
import common from '../shaders/common.glsl?raw';
import worldQuadVert from '../shaders/worldQuad.vert.glsl?raw';
import chromeTextFrag from '../shaders/chromeText.frag.glsl?raw';
import portalFrag from '../shaders/portal.frag.glsl?raw';
import beamVert from '../shaders/beam.vert.glsl?raw';
import beamFrag from '../shaders/beam.frag.glsl?raw';
import gridFrag from '../shaders/grid.frag.glsl?raw';
import dustVert from '../shaders/dust.vert.glsl?raw';
import dustFrag from '../shaders/dust.frag.glsl?raw';
import { Reflector } from 'three/examples/jsm/objects/Reflector.js';
import { Subs, makeThumb, type Room, type Ctx, type BloomSettings } from './room';
import { registry } from '../ui/registry';
import { ROOMS } from '../config/rooms';
import { REDUCED_MOTION, T } from '../config/timings';

const BLOOM: BloomSettings = { strength: 0.55, radius: 0.4, threshold: 0.3 };
const RING_R = 5.5;
const PORTAL_W = 2.6, PORTAL_H = 3.6;

function labelTexture(txt: string): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000';
  g.fillRect(0, 0, 256, 96);
  g.fillStyle = '#fff';
  g.font = '700 44px ui-monospace, Menlo, Consolas, monospace';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(txt, 128, 50);
  const t = new THREE.CanvasTexture(c);
  t.minFilter = THREE.LinearFilter;
  return t;
}

/**
 * ATRIUM — dark hall: chrome KELVIN ZERO title, six-thumbnail portal carousel
 * (drag/wheel/arrows + snap), mirror floor, beams, dust. Enter pushes the camera.
 */
export function createAtrium(): Room {
  const thumb = makeThumb();
  const subs = new Subs();
  let ctx: Ctx;
  let scene: THREE.Scene;
  let cam: THREE.PerspectiveCamera;
  let reflector: Reflector | null = null;
  let textMat: THREE.ShaderMaterial;
  let portalMats: THREE.ShaderMaterial[] = [];
  let portals: THREE.Mesh[] = [];
  let ringGroup: THREE.Group;
  let beamMats: THREE.ShaderMaterial[] = [];
  let dustMat: THREE.ShaderMaterial;
  const ring = { angle: 0, vel: 0, target: 0, dragging: false };
  let selected = 0;
  let hovered = -1;
  let liveTimer = 0;
  let thumbsWired = false;

  function wireThumbs() {
    if (!registry.mgr) return false;
    let missing = false;
    ROOMS.forEach((meta, i) => {
      const room = registry.mgr!.rooms.get(meta.key);
      if (room?.thumb && !portalMats[i].uniforms.tThumb.value) {
        portalMats[i].uniforms.tThumb.value = room.thumb.texture;
      }
      if (!portalMats[i].uniforms.tThumb.value) missing = true;
    });
    return !missing;
  }

  function updateCamera(t: number) {
    const parX = REDUCED_MOTION ? 0 : ctx.input.x * 0.5;
    const parY = REDUCED_MOTION ? 0 : ctx.input.y * 0.25;
    cam.position.x += ((parX + Math.sin(t * 0.05) * 0.35) - cam.position.x) * 0.04;
    cam.position.y += ((1.6 + parY + Math.sin(t * 0.083) * 0.12) - cam.position.y) * 0.04;
    cam.lookAt(0, 1.8, 0);
  }

  function enterSelected() {
    const meta = ROOMS[selected];
    if (!meta) return;
    gsap.to(cam.position, {
      z: 8.4, y: 1.85, duration: T.cameraPush, ease: 'power3.in',
      onComplete: () => { registry.router?.go(`#/room/${meta.id}`); },
    });
  }

  /** bring a clicked side portal to the front of the carousel */
  function focusPortal(i: number) {
    const cur = Math.round(ring.angle / 60);
    let delta = ((i - selected) % 6 + 6) % 6;
    if (delta > 3) delta -= 6;
    ring.target = (cur + delta) * 60;
    ring.vel = 0;
  }

  return {
    id: 'atrium',
    bloom: BLOOM,
    init(c: Ctx) {
      ctx = c;
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x050507);
      cam = new THREE.PerspectiveCamera(55, 1.6, 0.1, 200);
      cam.position.set(0, 1.6, 12);

      // --- chrome title -----------------------------------------------------
      const cnv = document.createElement('canvas');
      cnv.width = 2048; cnv.height = 512;
      const g = cnv.getContext('2d')!;
      g.fillStyle = '#000';
      g.fillRect(0, 0, 2048, 512);
      g.fillStyle = '#fff';
      try { (g as any).letterSpacing = '-14px'; } catch { /* older browsers */ }
      g.font = '900 285px "Helvetica Neue", "Arial Black", sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('KELVIN ZERO', 1024, 268);
      const textTex = new THREE.CanvasTexture(cnv);
      textTex.generateMipmaps = true;
      textTex.minFilter = THREE.LinearMipmapLinearFilter;
      textMat = new THREE.ShaderMaterial({
        vertexShader: worldQuadVert,
        fragmentShader: common + chromeTextFrag,
        glslVersion: THREE.GLSL3,
        uniforms: {
          tText: { value: textTex },
          uTime: { value: 0 },
          uPar: { value: new THREE.Vector2() },
          uAspect: { value: 4 },
        },
        transparent: true,
      });
      const textMesh = new THREE.Mesh(new THREE.PlaneGeometry(26, 6.5), textMat);
      textMesh.position.set(0, 5.4, -16);
      scene.add(textMesh);

      // --- portal carousel --------------------------------------------------
      ringGroup = new THREE.Group();
      portalMats = [];
      portals = [];
      ROOMS.forEach((meta, i) => {
        const mat = new THREE.ShaderMaterial({
          vertexShader: worldQuadVert,
          fragmentShader: common + portalFrag,
          uniforms: {
            tThumb: { value: null },
            uHover: { value: 0 },
            uPar: { value: new THREE.Vector2() },
          },
          transparent: true,
          side: THREE.DoubleSide,
        });
        const p = new THREE.Mesh(new THREE.PlaneGeometry(PORTAL_W, PORTAL_H), mat);
        const a = (-i / 6) * Math.PI * 2;
        p.position.set(Math.sin(a) * RING_R, 2.1, Math.cos(a) * RING_R);
        p.rotation.y = a;
        ringGroup.add(p);
        portals.push(p);
        portalMats.push(mat);
        const label = new THREE.Mesh(
          new THREE.PlaneGeometry(1.05, 0.4),
          new THREE.MeshBasicMaterial({ map: labelTexture(`00${meta.id}`), transparent: true, opacity: 0.85 }),
        );
        label.position.set(0, PORTAL_H / 2 + 0.42, 0);
        p.add(label);
      });
      scene.add(ringGroup);

      // --- mirror floor + grid overlay --------------------------------------
      if (c.perf.params.useReflector) {
        reflector = new Reflector(new THREE.PlaneGeometry(60, 60), {
          clipBias: 0.003, textureWidth: 512, textureHeight: 512, color: 0x0a0a0d,
        });
        reflector.rotation.x = -Math.PI / 2;
        scene.add(reflector);
      }
      const grid = new THREE.Mesh(
        new THREE.PlaneGeometry(60, 60),
        new THREE.ShaderMaterial({ vertexShader: worldQuadVert, fragmentShader: common + gridFrag, transparent: true, depthWrite: false }),
      );
      grid.rotation.x = -Math.PI / 2;
      grid.position.y = 0.02;
      scene.add(grid);

      // --- beams -------------------------------------------------------------
      ROOMS.forEach((_, i) => {
        const a = (-i / 6) * Math.PI * 2;
        const bm = new THREE.ShaderMaterial({
          vertexShader: beamVert,
          fragmentShader: common + beamFrag,
          uniforms: { uTime: { value: 0 }, uH: { value: 7 } },
          transparent: true,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
          side: THREE.DoubleSide,
        });
        const cone = new THREE.Mesh(new THREE.ConeGeometry(1.35, 7, 20, 1, true), bm);
        cone.position.set(Math.sin(a) * RING_R, 5.6, Math.cos(a) * RING_R);
        cone.rotation.z = Math.sin(a) * 0.34;
        cone.rotation.x = -Math.cos(a) * 0.34;
        scene.add(cone);
        beamMats.push(bm);
      });

      // --- dust ---------------------------------------------------------------
      const DN = 2000;
      const dpos = new Float32Array(DN * 3);
      const dseed = new Float32Array(DN);
      for (let i = 0; i < DN; i++) {
        dpos[i * 3] = (Math.random() - .5) * 24;
        dpos[i * 3 + 1] = Math.random() * 7.5;
        dpos[i * 3 + 2] = (Math.random() - .5) * 24;
        dseed[i] = Math.random() * 100;
      }
      const dg = new THREE.BufferGeometry();
      dg.setAttribute('position', new THREE.BufferAttribute(dpos, 3));
      dg.setAttribute('aSeed', new THREE.BufferAttribute(dseed, 1));
      dustMat = new THREE.ShaderMaterial({
        vertexShader: dustVert,
        fragmentShader: common + dustFrag,
        uniforms: { uTime: { value: 0 } },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      });
      const dust = new THREE.Points(dg, dustMat);
      dust.frustumCulled = false;
      scene.add(dust);

      // portal thumbnails appear as the loader warms them — keep trying lazily
      wireThumbs();
    },
    enter() {
      registry.arrowHandler = (dir) => {
        ring.target += dir * 60;
      };
      cam.position.set(0, 1.6, 12);
      const offDrag = ctx.input.on('drag', (p: any) => {
        ring.dragging = true;
        ring.angle += p.dx * 0.22;
        ring.vel = p.dx * 0.22;
        ring.target = ring.angle;
      });
      const offUp = ctx.input.on('up', () => {
        if (!ring.dragging) return;
        ring.dragging = false;
        ring.target = Math.round((ring.angle + ring.vel * 14) / 60) * 60;
        ring.vel = 0;
      });
      const offWheel = ctx.input.on('wheel', (p: any) => {
        const cur = Math.round(ring.target / 60) * 60;
        ring.target = cur + (p.dy > 0 ? 60 : -60);
      });
      const offClick = ctx.input.on('click', () => {
        if (hovered < 0) return;
        if (hovered === selected) enterSelected();
        else focusPortal(hovered);
      });
      const offKey = ctx.input.on('key', ({ code, event }: any) => {
        // Enter on a focused HUD button must activate that button only
        const interactive = event?.target instanceof Element &&
          !!event.target.closest('button, a, input, [data-ui], [role="link"]');
        if (code === 'Enter' && !interactive) enterSelected();
      });
      [offDrag, offUp, offWheel, offClick, offKey].forEach(subs.add, subs);
      registry.refreshSelection = () => registry.hud?.showAtriumSelection(ROOMS[selected]);
      registry.hud?.showAtriumSelection(ROOMS[selected]);
    },
    leave() {
      subs.flush();
      registry.arrowHandler = null;
      registry.refreshSelection = null;
      gsap.killTweensOf(cam.position);
      cam.position.set(0, 1.6, 12);
      ring.dragging = false;
    },
    update(t, dt) {
      if (!thumbsWired && (thumbsWired = wireThumbs())) {
        registry.hud?.showAtriumSelection(ROOMS[selected]);
      }
      // carousel physics: drag follows the pointer; otherwise ease to the snap target
      if (ring.dragging) {
        ring.vel = 0;
      } else {
        ring.angle += (ring.target - ring.angle) * (1 - Math.exp(-dt * 5));
      }
      ringGroup.rotation.y = THREE.MathUtils.degToRad(ring.angle);
      const norm = ((Math.round(ring.angle / 60) % 6) + 6) % 6;
      if (norm !== selected) {
        selected = norm;
        registry.hud?.showAtriumSelection(ROOMS[selected]);
        registry.blip?.();
      }
      // camera + parallax
      updateCamera(t);
      // uniforms
      textMat.uniforms.uTime.value = t;
      (textMat.uniforms.uPar.value as THREE.Vector2).set(ctx.input.x, ctx.input.y);
      beamMats.forEach((m) => { m.uniforms.uTime.value = t; });
      dustMat.uniforms.uTime.value = t;
      // portal hover (raycast front-facing portals)
      const ray = new THREE.Raycaster();
      ray.setFromCamera(new THREE.Vector2(ctx.input.x, ctx.input.y), cam);
      const hits = ray.intersectObjects(portals, false);
      const newHover = hits.length ? portals.indexOf(hits[0].object as THREE.Mesh) : -1;
      if (newHover !== hovered) {
        hovered = newHover;
        registry.cursorHot?.(hovered === selected && hovered >= 0 ? 'ENTER' : hovered >= 0 ? 'ROTATE' : '');
      }      portalMats.forEach((m, i) => {
        const target = i === hovered ? 1 : 0;
        m.uniforms.uHover.value += (target - m.uniforms.uHover.value) * (1 - Math.exp(-dt * 10));
        (m.uniforms.uPar.value as THREE.Vector2).set(ctx.input.x, ctx.input.y);
      });
      // live-update only the hovered portal's thumbnail at ~20fps
      liveTimer += dt;
      if (hovered >= 0 && liveTimer > 0.05) {
        liveTimer = 0;
        const room = registry.mgr?.rooms.get(ROOMS[hovered].key);
        if (room?.thumb) {
          room.update(ctx.clock.t, 1 / 30);
          room.render(ctx.renderer, room.thumb);
          portalMats[hovered].uniforms.tThumb.value = room.thumb.texture;
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
      subs.flush();
      portals.forEach((p) => p.geometry.dispose());
      portalMats.forEach((m) => m.dispose());
      beamMats.forEach((m) => m.dispose());
      textMat.dispose();
      dustMat.dispose();
      reflector?.dispose();
      thumb.dispose();
    },
  };
}
