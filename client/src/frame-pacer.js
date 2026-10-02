/** Bounds GPU work independently of the fixed 64 Hz gameplay accumulator. */
export const MENU_FPS = 30;          // the menu background is a still scene: 30 fps keeps fanless laptops cool
export class FramePacer {
  constructor(limit = 0) { this.setLimit(limit); this.next = null; }
  setLimit(value) {
    const n = Number(value);
    this.limit = [0, 30, 60, 120, 144, 240].includes(n) ? n : 0;
  }
  ready(now, { hidden = false, active = true } = {}) {
    if (hidden) { this.next = null; return false; }
    // menu / pause / death screen never needs more than 60 FPS, even with an uncapped limit: old GPUs stay cool
    const targetFps = active ? this.limit : Math.min(MENU_FPS, this.limit || MENU_FPS);
    if (targetFps === 0 || targetFps >= 240) return true;
    const interval = 1000 / targetFps;
    if (this.next !== null && now + 0.25 < this.next) return false;
    this.next = this.next === null || now - this.next > interval ? now + interval : this.next + interval;
    return true;
  }
}
