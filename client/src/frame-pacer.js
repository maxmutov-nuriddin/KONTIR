/** Bounds GPU work independently of the fixed 64 Hz gameplay accumulator. */
export class FramePacer {
  constructor(limit = 60) { this.setLimit(limit); this.next = null; }
  setLimit(value) {
    const n = Number(value);
    this.limit = [0, 30, 60, 120, 144, 240].includes(n) ? n : 60;
  }
  ready(now, { hidden = false, active = true } = {}) {
    if (hidden) { this.next = null; return false; }
    if (this.limit === 0 || this.limit >= 240) return true;
    const interval = 1000 / (active ? this.limit : Math.min(30, this.limit));
    if (this.next !== null && now + 0.25 < this.next) return false;
    this.next = this.next === null || now - this.next > interval ? now + interval : this.next + interval;
    return true;
  }
}
