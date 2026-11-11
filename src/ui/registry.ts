import type { Panel } from './panel';
import type { HUD } from './hud';
import type { SceneManager } from '../core/sceneManager';

/** Set by main at boot — lets rooms reach shared UI / scene state without circular imports. */
export const registry = {
  panel: null as Panel | null,
  hud: null as HUD | null,
  mgr: null as SceneManager | null,
  router: null as { go(hash: string): void } | null,
  blip: null as (() => void) | null,
  cursorHot: null as ((label: string) => void) | null,
  /** atrium installs this to capture ←/→ while it is current */
  arrowHandler: null as ((dir: number) => void) | null,
  /** language-switch hooks: rebuild DOM owned by the current room */
  refreshIndex: null as (() => void) | null,
  refreshSelection: null as (() => void) | null,
};
