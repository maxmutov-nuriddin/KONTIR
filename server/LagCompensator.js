import { TICK_RATE, RULES, angleDelta } from '../shared/constants.js';

const STRIDE = 8; // x, y, z, yaw, crouch, alive, life, valid

/**
 * Ring buffer of past player poses (default 1000 ms @ 64 Hz = 64 frames + margin).
 * The slot for tick T is T % capacity and carries its own tick stamp, so stale slots can never be
 * mistaken for history. sample() linearly interpolates between the two frames bracketing a fractional tick.
 */
export class LagCompensator {
  constructor({ tickRate = TICK_RATE, seconds = RULES.rewindMaxSeconds, maxPlayers = 10 } = {}) {
    this.capacity = Math.ceil(tickRate * seconds) + 2;
    this.maxPlayers = maxPlayers;
    this.frames = Array.from({ length: this.capacity }, () => ({ tick: -1, count: 0, ids: new Array(maxPlayers).fill(null), data: new Float64Array(maxPlayers * STRIDE) }));
    this.newest = -1;
  }
  get maxRewindTicks() { return this.capacity - 2; }
  reset() { for (const f of this.frames) { f.tick = -1; f.count = 0; } this.newest = -1; }

  /** Stores the pose of every player for `tick`. players: iterable of { id, char, alive, life }. */
  record(tick, players) {
    const f = this.frames[tick % this.capacity];
    f.tick = tick; f.count = 0;
    for (const p of players) {
      if (f.count >= this.maxPlayers) break;
      const o = f.count * STRIDE, c = p.char;
      f.ids[f.count] = p.id;
      f.data[o] = c.x; f.data[o + 1] = c.y; f.data[o + 2] = c.z; f.data[o + 3] = c.yaw; f.data[o + 4] = c.crouch;
      f.data[o + 5] = p.alive ? 1 : 0; f.data[o + 6] = p.life; f.data[o + 7] = 1;
      f.count++;
    }
    this.newest = tick;
  }
  frameAt(tick) { const f = this.frames[((tick % this.capacity) + this.capacity) % this.capacity]; return f.tick === tick ? f : null; }
  slot(f, id) { for (let i = 0; i < f.count; i++) if (f.ids[i] === id) return i * STRIDE; return -1; }

  /** Clamp a client-claimed view tick into what the buffer and the measured latency allow. */
  clampTick(claimed, now, maxBehindTicks = this.maxRewindTicks) {
    const floor = Math.max(now - Math.min(this.maxRewindTicks, maxBehindTicks), this.newest - this.maxRewindTicks);
    return Math.min(now, Math.max(floor, claimed));
  }

  /** Pose of `id` at (possibly fractional) `tick`, or null when it was not alive / not recorded. */
  sample(id, tick) {
    const t0 = Math.floor(tick), t1 = Math.ceil(tick);
    const a = this.frameAt(t0), b = this.frameAt(t1);
    if (!a && !b) return null;
    const fa = a || b, fb = b || a;
    const ia = this.slot(fa, id), ib = this.slot(fb, id);
    if (ia < 0 || ib < 0) return null;
    const da = fa.data, db = fb.data;
    if (!da[ia + 5] || !db[ib + 5] || da[ia + 6] !== db[ib + 6]) return null;
    const k = t1 === t0 ? 0 : tick - t0;
    return {
      x: da[ia] + (db[ib] - da[ia]) * k, y: da[ia + 1] + (db[ib + 1] - da[ia + 1]) * k, z: da[ia + 2] + (db[ib + 2] - da[ia + 2]) * k,
      yaw: da[ia + 3] + angleDelta(db[ib + 3], da[ia + 3]) * k, crouch: da[ia + 4] + (db[ib + 4] - da[ia + 4]) * k, life: da[ia + 6],
    };
  }
}
