import { MOVEMENT as M } from '../shared/constants.js';

/**
 * Walkable-cell grid baked from the same BVH the physics uses (no separate authoring step).
 * A cell is walkable when a standing capsule fits at the floor found by a downward ray; neighbours are linked
 * when the height change is a step or a walkable slope. Multi-level geometry (roofs) is handled by casting from
 * a fixed head height, which is below every roof in shipped maps.
 */
export class Navigation {
  constructor(collider, { cell = 1.5, probeHeight = 3.0 } = {}) {
    this.cell = cell;
    const b = collider.bounds;
    this.minX = Math.floor(b.min.x + 1); this.minZ = Math.floor(b.min.z + 1);
    // ground plane extends past the outer walls; navigation only covers the enclosed region
    this.cols = Math.max(1, Math.min(200, Math.floor((Math.min(b.max.x, -this.minX + 0) - this.minX) / cell)));
    this.rows = Math.max(1, Math.min(240, Math.floor((Math.min(b.max.z, -this.minZ + 0) - this.minZ) / cell)));
    this.floor = new Float32Array(this.cols * this.rows).fill(NaN);
    this.walkable = new Uint8Array(this.cols * this.rows);
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const p = this.world(c, r), y = collider.floorHeight(p.x, probeHeight, p.z, probeHeight + 1);
      if (y === null || y > 2.6) continue;
      this.floor[r * this.cols + c] = y;
      if (!collider.capsuleBlocked(p.x, y + 0.03, p.z, 0.3, M.standHeight, 0.02)) this.walkable[r * this.cols + c] = 1;
    }
  }
  world(c, r) { return { x: this.minX + (c + 0.5) * this.cell, z: this.minZ + (r + 0.5) * this.cell }; }
  index(x, z) {
    const c = Math.max(0, Math.min(this.cols - 1, Math.floor((x - this.minX) / this.cell)));
    const r = Math.max(0, Math.min(this.rows - 1, Math.floor((z - this.minZ) / this.cell)));
    return r * this.cols + c;
  }
  nearest(x, z) {
    let best = this.index(x, z);
    if (this.walkable[best]) return best;
    const c0 = best % this.cols, r0 = Math.floor(best / this.cols);
    for (let d = 1; d < 8; d++) for (let r = r0 - d; r <= r0 + d; r++) for (let c = c0 - d; c <= c0 + d; c++) {
      if (c < 0 || r < 0 || c >= this.cols || r >= this.rows || Math.max(Math.abs(c - c0), Math.abs(r - r0)) !== d) continue;
      if (this.walkable[r * this.cols + c]) return r * this.cols + c;
    }
    return best;
  }
  linked(a, b, dist) {
    if (!this.walkable[b]) return false;
    const dy = Math.abs(this.floor[b] - this.floor[a]);
    return dy <= M.stepHeight || dy / dist <= 0.5;
  }
  /** A* over the grid (binary heap). Returns waypoints [{x,y,z}] (excluding the start cell). */
  path(from, to) {
    const start = this.nearest(from.x, from.z), goal = this.nearest(to.x, to.z);
    if (start === goal) return [];
    const total = this.cols * this.rows, g = new Float32Array(total).fill(Infinity), came = new Int32Array(total).fill(-1), closed = new Uint8Array(total);
    const heap = []; // [f, index]
    const push = (f, i) => { heap.push([f, i]); let k = heap.length - 1; while (k > 0) { const p = (k - 1) >> 1; if (heap[p][0] <= heap[k][0]) break; [heap[p], heap[k]] = [heap[k], heap[p]]; k = p; } };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) { heap[0] = last; let k = 0; for (;;) { const l = 2 * k + 1, r = l + 1; let m = k; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === k) break; [heap[m], heap[k]] = [heap[k], heap[m]]; k = m; } }
      return top;
    };
    const gx = goal % this.cols, gz = Math.floor(goal / this.cols);
    const h = i => Math.hypot((i % this.cols) - gx, Math.floor(i / this.cols) - gz);
    g[start] = 0; push(h(start), start);
    let found = false, guard = 0;
    while (heap.length && guard++ < 30000) {
      const [, cur] = pop();
      if (cur === goal) { found = true; break; }
      if (closed[cur]) continue; closed[cur] = 1;
      const c = cur % this.cols, r = Math.floor(cur / this.cols);
      for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
        if (!dc && !dr) continue;
        const nc = c + dc, nr = r + dr;
        if (nc < 0 || nr < 0 || nc >= this.cols || nr >= this.rows) continue;
        const n = nr * this.cols + nc, dist = Math.hypot(dc, dr) * this.cell;
        if (closed[n] || !this.linked(cur, n, dist)) continue;
        if (dc && dr && (!this.walkable[r * this.cols + nc] || !this.walkable[nr * this.cols + c])) continue; // no corner cutting
        const cost = g[cur] + Math.hypot(dc, dr);
        if (cost < g[n]) { g[n] = cost; came[n] = cur; push(cost + h(n), n); }
      }
    }
    if (!found) return [];
    const out = [];
    for (let i = goal; i !== start; i = came[i]) { const c = i % this.cols, r = Math.floor(i / this.cols); out.push({ ...this.world(c, r), y: this.floor[i] }); }
    return out.reverse();
  }
  reachable(from, to) { return this.path(from, to).length > 0 || this.nearest(from.x, from.z) === this.nearest(to.x, to.z); }
}
