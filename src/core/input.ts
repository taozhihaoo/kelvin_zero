// Unified pointer / wheel / keyboard. Coordinates: x,y in NDC (-1..1, y up); px,py in CSS pixels.
type Handler = (p: any) => void;

export class Input {
  x = 0; y = 0;          // NDC
  px = 0; py = 0;        // pixels
  vx = 0; vy = 0;        // NDC per second (smoothed)
  down = false;
  dragDX = 0; dragDY = 0;
  wheelDelta = 0;
  isTouch = false;
  hasMoved = false;
  lastClick = { ux: 0.5, uy: 0.5, t: -99 }; // uv coords (0..1, y up)

  private handlers = new Map<string, Set<Handler>>();
  private downX = 0; downY = 0; moved = 0;
  private smx = 0; smy = 0;

  constructor(private target: HTMLElement) {
    this.isTouch = window.matchMedia('(pointer: coarse)').matches;
    window.addEventListener('pointermove', this.onMove, { passive: true });
    window.addEventListener('pointerdown', this.onDown, { passive: true });
    window.addEventListener('pointerup', this.onUp, { passive: true });
    window.addEventListener('pointercancel', this.onCancel, { passive: true });
    window.addEventListener('wheel', this.onWheel, { passive: true });
    window.addEventListener('keydown', this.onKey);
    window.addEventListener('blur', () => { this.down = false; });
  }

  on(kind: 'click' | 'drag' | 'wheel' | 'key' | 'move' | 'up', h: Handler): () => void {
    let s = this.handlers.get(kind);
    if (!s) { s = new Set(); this.handlers.set(kind, s); }
    s.add(h);
    return () => s!.delete(h);
  }

  private emit(kind: string, p: any) {
    const s = this.handlers.get(kind);
    if (s) s.forEach((h) => h(p));
  }

  private isUI(t: EventTarget | null): boolean {
    return !!(t instanceof Element && t.closest('button, a, input, select, textarea, [data-ui]'));
  }

  private onMove = (e: PointerEvent) => {
    this.hasMoved = true;
    const nx = (e.clientX / window.innerWidth) * 2 - 1;
    const ny = -((e.clientY / window.innerHeight) * 2 - 1);
    if (this.down) {
      const dx = e.clientX - this.px;
      const dy = e.clientY - this.py;
      this.dragDX += dx;
      this.dragDY += dy;
      this.moved += Math.abs(dx) + Math.abs(dy);
      this.emit('drag', { dx, dy, x: nx, y: ny });
    }
    this.px = e.clientX; this.py = e.clientY;
    this.x = nx; this.y = ny;
    this.emit('move', { x: nx, y: ny });
  };

  private onDown = (e: PointerEvent) => {
    if (this.isUI(e.target)) return;
    this.down = true;
    this.moved = 0;
    this.downX = e.clientX; this.downY = e.clientY;
    this.px = e.clientX; this.py = e.clientY;
  };

  private onUp = (e: PointerEvent) => {
    if (!this.down) return;
    this.down = false;
    // Always signal the end of a gesture. Rooms use this to release drag state;
    // without it, drags (moved >= 8px) would leave inertia/idle rotation frozen.
    this.emit('up', { dragged: this.moved >= 8 });
    if (this.moved < 8 && !this.isUI(e.target)) {
      const ux = e.clientX / window.innerWidth;
      const uy = 1 - e.clientY / window.innerHeight;
      this.lastClick = { ux, uy, t: performance.now() / 1000 };
      this.emit('click', {
        x: (e.clientX / window.innerWidth) * 2 - 1,
        y: -((e.clientY / window.innerHeight) * 2 - 1),
        ux, uy,
      });
    }
  };

  private onCancel = () => {
    if (!this.down) return;
    this.down = false;
    this.emit('up', { dragged: true });
  };

  private onWheel = (e: WheelEvent) => {
    if (this.isUI(e.target)) return;
    this.wheelDelta += e.deltaY;
    this.emit('wheel', { dy: e.deltaY });
  };

  private onKey = (e: KeyboardEvent) => {
    if (e.target instanceof HTMLInputElement) return;
    // Enter/Space belong to the focused control (button / link / index row),
    // otherwise pressing Enter on a HUD button also entered the selected exhibit.
    const interactive = e.target instanceof Element &&
      !!e.target.closest('button, a, input, select, textarea, [data-ui], [role="link"]');
    if (interactive && (e.code === 'Enter' || e.code === 'Space')) return;
    this.emit('key', { code: e.code, key: e.key, event: e });
  };

  /** call once per frame after handlers ran: smooth velocity, decay drag deltas */
  lateUpdate(dt: number) {
    const k = 1 - Math.exp(-dt * 9);
    this.vx += (this.x - this.smx - this.vx) * k;
    this.vy += (this.y - this.smy - this.vy) * k;
    this.smx = this.x; this.smy = this.y;
    this.dragDX = 0; this.dragDY = 0;
    this.wheelDelta = 0;
  }

  /** ray from camera through pointer, intersected with a world plane */
  pointerRay(
    cam: any, // THREE.PerspectiveCamera
    out0: any, out1: any, // preallocated Vector3 origin/dir
  ) {
    out0.set(this.x, this.y, 0.5).unproject(cam);
    out1.set(this.x, this.y, 1).unproject(cam);
    out1.sub(out0).normalize();
  }

  dispose() {
    window.removeEventListener('pointermove', this.onMove);
    window.removeEventListener('pointerdown', this.onDown);
    window.removeEventListener('pointerup', this.onUp);
    window.removeEventListener('pointercancel', this.onCancel);
    window.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKey);
  }
}
