/** Bounds GPU work independently of the fixed 64 Hz gameplay accumulator. */
export class FramePacer {
  constructor(limit = 60) { this.setLimit(limit); this.next = null; }
  setLimit(value) { this.limit = [30, 60, 90, 120].includes(Number(value)) ? Number(value) : 60; }
  ready(now, { hidden = false, active = true } = {}) {
    if (hidden) { this.next = null; return false; }
    const interval = 1000 / (active ? this.limit : Math.min(30, this.limit));
    if (this.next !== null && now + 0.25 < this.next) return false;
    this.next = this.next === null || now - this.next > interval ? now + interval : this.next + interval;
    return true;
  }
}
