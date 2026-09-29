// Grid-painted level builder. Paints a character grid, then emits (a) collidable world meshes and
// (b) non-colliding decor meshes, merged per material, plus spawn/site marker nodes for the GLB.
import { boxMesh, cylMesh, mergeMeshes, rampMesh } from '../../shared/geometry.js';
import { makeRandom } from '../../shared/weapons.js';

// glTF baseColorFactor is *linear*; the palette below is authored as sRGB hex.
const toLinear = c => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const hex = h => [toLinear(((h >> 16) & 255) / 255), toLinear(((h >> 8) & 255) / 255), toLinear((h & 255) / 255), 1];
// name -> { color, roughness, metalness }. The client keys its procedural PBR texture sets on these names.
export const MATERIALS = {
  sand_ground: { color: hex(0xc2ab7c), roughness: 0.96, metalness: 0 },
  asphalt: { color: hex(0x4a4845), roughness: 0.88, metalness: 0 },
  concrete: { color: hex(0x9a9c99), roughness: 0.9, metalness: 0 },
  sand_wall: { color: hex(0xd4b98a), roughness: 0.94, metalness: 0 },
  plaster_blue: { color: hex(0x5f8497), roughness: 0.9, metalness: 0 },
  plaster_white: { color: hex(0xe6dfd0), roughness: 0.92, metalness: 0 },
  stone_base: { color: hex(0x8d7c62), roughness: 0.97, metalness: 0 },
  brick: { color: hex(0xa8664a), roughness: 0.93, metalness: 0 },
  wood: { color: hex(0x8b5d38), roughness: 0.78, metalness: 0 },
  wood_dark: { color: hex(0x4a3020), roughness: 0.8, metalness: 0 },
  crate: { color: hex(0xa27a45), roughness: 0.82, metalness: 0 },
  metal: { color: hex(0x767e82), roughness: 0.42, metalness: 0.85 },
  rust_metal: { color: hex(0x8a5638), roughness: 0.62, metalness: 0.7 },
  container_red: { color: hex(0x9c3c2e), roughness: 0.5, metalness: 0.6 },
  container_blue: { color: hex(0x2f5f86), roughness: 0.5, metalness: 0.6 },
  container_green: { color: hex(0x40694e), roughness: 0.5, metalness: 0.6 },
  container_yellow: { color: hex(0xc99a2a), roughness: 0.5, metalness: 0.6 },
  container_grey: { color: hex(0x7e878b), roughness: 0.5, metalness: 0.6 },
  cloth_red: { color: hex(0xa8402f), roughness: 0.95, metalness: 0 },
  cloth_cream: { color: hex(0xdccfae), roughness: 0.95, metalness: 0 },
  window_dark: { color: hex(0x1b242a), roughness: 0.18, metalness: 0.1 },
  sandbag: { color: hex(0xb49b6a), roughness: 1, metalness: 0 },
  foliage: { color: hex(0x5f7a3c), roughness: 0.9, metalness: 0 },
};

/** Rotates a mesh about a pivot: rx (pitch, around X) applied first, then ry (yaw). Normals follow. */
function rotateMesh(mesh, { ry = 0, rx = 0, rz = 0, px = 0, py = 0, pz = 0 }) {
  const cy = Math.cos(ry), sy = Math.sin(ry), cx = Math.cos(rx), sx = Math.sin(rx), cz = Math.cos(rz), sz = Math.sin(rz);
  const apply = (arr, translate) => {
    for (let i = 0; i < arr.length; i += 3) {
      let x = arr[i] - (translate ? px : 0), y = arr[i + 1] - (translate ? py : 0), z = arr[i + 2] - (translate ? pz : 0);
      let t = y * cx - z * sx; z = y * sx + z * cx; y = t;               // pitch
      t = x * cz - y * sz; y = x * sz + y * cz; x = t;                    // roll
      t = x * cy + z * sy; z = -x * sy + z * cy; x = t;                   // yaw
      arr[i] = x + (translate ? px : 0); arr[i + 1] = y + (translate ? py : 0); arr[i + 2] = z + (translate ? pz : 0);
    }
  };
  apply(mesh.positions, true); apply(mesh.normals, false);
  return mesh;
}

const SOLID = { '#': 9, '3': 5.5, '2': 3.2 };
const RAMP_DIR = { '^': 'z-', v: 'z+', '<': 'x-', '>': 'x+' };

export class GridMap {
  constructor({ id, cols, rows, cell = 3, seed = 1, wallMaterials, containers = false }) {
    Object.assign(this, { id, cols, rows, cell, containers });
    this.grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
    this.rand = makeRandom(seed);
    this.wallMaterials = wallMaterials || ['sand_wall'];
    this.solid = []; this.decor = []; this.markers = [];
    this.x0 = -cols * cell / 2; this.z0 = -rows * cell / 2;
  }
  set(c, r, ch) { if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.grid[r][c] = ch; return this; }
  at(c, r) { return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? '#' : this.grid[r][c]; }
  fill(c0, r0, c1, r1, ch) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, ch); return this; }
  border(ch = '#') { return this.fill(0, 0, this.cols - 1, 0, ch).fill(0, this.rows - 1, this.cols - 1, this.rows - 1, ch).fill(0, 0, 0, this.rows - 1, ch).fill(this.cols - 1, 0, this.cols - 1, this.rows - 1, ch); }
  cx(c) { return this.x0 + c * this.cell + this.cell / 2; }
  cz(r) { return this.z0 + r * this.cell + this.cell / 2; }
  isSolid(ch) { return ch in SOLID; }
  wallMat(c, r) { return this.wallMaterials[Math.floor((Math.sin(c * 12.9898 + r * 78.233) * 43758.5453 % 1 + 1) * 3) % this.wallMaterials.length]; }

  addSolid(mat, x0, y0, z0, x1, y1, z1, tile = 4) { this.solid.push(boxMesh('s', mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tile)); }
  addDecor(mat, x0, y0, z0, x1, y1, z1, tile = 4) { this.decor.push(boxMesh('d', mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tile)); }
  addCyl(mat, cx, y0, cz, r, h, { solid = false, sides = 14, tile = 2 } = {}) { (solid ? this.solid : this.decor).push(cylMesh('c', mat, cx, y0, cz, r, h, sides, tile)); }

  build() {
    const { cols, rows, cell } = this;
    // world ground (collidable) with generous apron
    this.addSolid('sand_ground', this.x0 - 40, -1, this.z0 - 40, -this.x0 + 40, 0, -this.z0 + 40, 6);

    // --- structural pass: horizontal runs of identical cells merge into one box
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols;) {
        const ch = this.at(c, r); let end = c;
        const mergeable = this.isSolid(ch) || ch === 'R' || ch === 'H' || ch === 'P' || ch === 'a' || ch === 'K' || ch === 'L';
        const maxRun = ch === 'K' || ch === 'L' ? 2 : Infinity;
        if (mergeable) while (end + 1 < cols && end - c + 1 < maxRun && this.at(end + 1, r) === ch && (!this.isSolid(ch) || this.wallMat(end + 1, r) === this.wallMat(c, r))) end++;
        const xa = this.x0 + c * cell, xb = this.x0 + (end + 1) * cell, za = this.z0 + r * cell, zb = za + cell;
        if (this.isSolid(ch)) this.addSolid(this.wallMat(c, r), xa, 0, za, xb, SOLID[ch], zb);
        else if (ch === 'R') { this.addSolid('concrete', xa, 3.9, za, xb, 4.4, zb); this.addDecor('metal', xa, 3.5, za + cell * 0.45, xb, 3.9, za + cell * 0.55); }
        else if (ch === 'H') { this.addSolid('stone_base', xa, 0, za + cell * 0.3, xb, 1.3, zb - cell * 0.3, 2); this.addDecor('sandbag', xa, 1.3, za + cell * 0.25, xb, 1.45, zb - cell * 0.25, 1); }
        else if (ch === 'P') this.addSolid('concrete', xa, 0, za, xb, 1.2, zb);
        else if (ch === 'a') { this.addSolid(this.wallMat(c, r), xa, 3.8, za, xb, 9, zb); this.addDecor('wood_dark', xa, 3.5, za, xb, 3.8, zb, 1); }
        else if (ch in RAMP_DIR) {
          if (end === c) { this.solid.push(rampMesh('r', 'concrete', this.cx(c), 0, this.cz(r), cell, cell * 1.0, 1.2, RAMP_DIR[ch])); }
        }
        else if (ch === 'c') { const s = 1.4 + this.rand() * 0.6; this.addSolid('crate', this.cx(c) - s / 2, 0, this.cz(r) - s / 2, this.cx(c) + s / 2, s, this.cz(r) + s / 2, 1.5); this.crateDetail(this.cx(c), this.cz(r), s); }
        else if (ch === 'C') { const s = 1.5; this.addSolid('crate', this.cx(c) - s, 0, this.cz(r) - s / 2, this.cx(c), s, this.cz(r) + s / 2, 1.5); this.addSolid('crate', this.cx(c) - s / 2, s, this.cz(r) - s / 2, this.cx(c) + s / 2, s * 2, this.cz(r) + s / 2, 1.5); this.addSolid('crate', this.cx(c), 0, this.cz(r) - s / 2, this.cx(c) + s, s, this.cz(r) + s / 2, 1.5); }
        else if (ch === 'b') { for (const [dx, dz] of [[-0.55, -0.4], [0.55, -0.3], [0, 0.6]]) this.addCyl(this.rand() < 0.5 ? 'rust_metal' : 'container_blue', this.cx(c) + dx, 0, this.cz(r) + dz, 0.36, 0.95, { solid: true, sides: 12, tile: 1 }); }
        else if (ch === 'T') this.palm(this.cx(c), this.cz(r));
        else if (ch === 'p') { this.addSolid('concrete', this.cx(c) - 0.45, 0, this.cz(r) - 0.45, this.cx(c) + 0.45, 4.2, this.cz(r) + 0.45, 2); this.addDecor('stone_base', this.cx(c) - 0.55, 0, this.cz(r) - 0.55, this.cx(c) + 0.55, 0.5, this.cz(r) + 0.55, 1); }
        else if (ch === 'K' || ch === 'L') {
          // shipping container: a run of two cells (6 m x 3 m); 'L' stacks a second container on top
          const len = (end - c + 1) * cell; const w = 2.5;
          const mats = ['container_red', 'container_blue', 'container_green', 'container_yellow', 'container_grey'];
          const mat = mats[Math.floor(this.rand() * mats.length)];
          this.container(xa, za + (cell - w) / 2, xb, za + (cell + w) / 2, 0, mat);
          if (ch === 'L') this.container(xa, za + (cell - w) / 2, xb, za + (cell + w) / 2, 2.6, mats[Math.floor(this.rand() * mats.length)]);
        }
        else if (ch === ',') this.addDecor('asphalt', xa, 0, za, xb, 0.025, zb, 6);
        else if (ch === 'A' || ch === 'B') this.markers.push({ name: `site_${ch}`, x: this.cx(c), y: 0, z: this.cz(r), sx: 1, sy: 1, sz: 1, pending: true });
        c = end + 1;
      }
    }
    this.dress();
    return this.output();
  }

  /** Date palm: gently curved trunk (collidable core), ring texture bands and drooping fronds. */
  palm(x, z, height = 6.2, seed = this.rand()) {
    const lean = (seed - 0.5) * 0.5, dir = seed * 6.28;
    let px = x, pz = z;
    const segs = 5, segH = height / segs;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.24 - i * 0.022;
      const m = cylMesh('t', 'wood', px, i * segH, pz, r0, segH * 1.06, 9, 1, false);
      rotateMesh(m, { rx: 0, rz: 0 });
      (i === 0 ? this.solid : this.decor).push(m);
      if (i === 0) this.solid.push(cylMesh('t', 'wood', px, 0, pz, 0.22, height * 0.5, 8, 1)); // trunk core for collision
      px += Math.cos(dir) * lean * segH * 0.5; pz += Math.sin(dir) * lean * segH * 0.5;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + seed * 3, len = 2.4 + this.rand() * 0.8;
      const frond = boxMesh('f', 'foliage', px + len / 2, height, pz, len, 0.025, 0.55, 1);
      rotateMesh(frond, { rz: -0.32 - this.rand() * 0.25, ry: a, px, py: height, pz });
      this.decor.push(frond);
      const rib = boxMesh('f', 'wood', px + len / 2, height + 0.02, pz, len, 0.03, 0.05, 1);
      rotateMesh(rib, { rz: -0.32, ry: a, px, py: height, pz }); this.decor.push(rib);
    }
    this.addCyl('foliage', px, height - 0.25, pz, 0.34, 0.5, { sides: 8 });
  }
  /** Utility poles with sagging cables between them (axis-aligned run). */
  poleLine(x0, z0, x1, z1, spacing = 14) {
    const alongX = Math.abs(x1 - x0) >= Math.abs(z1 - z0), len = alongX ? Math.abs(x1 - x0) : Math.abs(z1 - z0), n = Math.max(1, Math.round(len / spacing));
    const pts = [];
    for (let i = 0; i <= n; i++) pts.push({ x: x0 + (x1 - x0) * i / n, z: z0 + (z1 - z0) * i / n });
    for (const p of pts) { this.addSolid('wood_dark', p.x - 0.13, 0, p.z - 0.13, p.x + 0.13, 7.2, p.z + 0.13, 2); this.addDecor('wood', p.x - 0.9, 6.7, p.z - 0.05, p.x + 0.9, 6.85, p.z + 0.05, 1); for (const dx of [-0.75, 0, 0.75]) this.addDecor('metal', p.x + dx - 0.04, 6.85, p.z - 0.04, p.x + dx + 0.04, 7.0, p.z + 0.04, 1); }
    for (let i = 0; i < pts.length - 1; i++) for (const off of [-0.75, 0, 0.75]) {
      const a = pts[i], b = pts[i + 1], mid = { x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 };
      const cable = (p, q, y0, y1) => {
        // orient so p has the smaller coordinate along the run; slope the thin box between the two heights
        let lo = p, hi = q, ylo = y0, yhi = y1;
        if ((alongX && q.x < p.x) || (!alongX && q.z < p.z)) { lo = q; hi = p; ylo = y1; yhi = y0; }
        const L = alongX ? hi.x - lo.x : hi.z - lo.z, cx = (lo.x + hi.x) / 2 + (alongX ? 0 : off), cz = (lo.z + hi.z) / 2 + (alongX ? off : 0), cy = (ylo + yhi) / 2;
        const m = alongX ? boxMesh('cb', 'wood_dark', cx, cy, cz, L, 0.03, 0.03, 1) : boxMesh('cb', 'wood_dark', cx, cy, cz, 0.03, 0.03, L, 1);
        const rise = Math.atan2(yhi - ylo, L);
        rotateMesh(m, alongX ? { rz: rise, px: cx, py: cy, pz: cz } : { rx: -rise, px: cx, py: cy, pz: cz });
        this.decor.push(m);
      };
      cable(a, mid, 6.95, 6.55); cable(mid, b, 6.55, 6.95);
    }
  }
  /** Loose rubble / rocks / planks along wall bases (decor only). */
  rubble(count = 120) {
    const open = [];
    for (let r = 1; r < this.rows - 1; r++) for (let c = 1; c < this.cols - 1; c++) { const ch = this.at(c, r); if ((ch === '.' || ch === ',') && [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dc, dr]) => this.isSolid(this.at(c + dc, r + dr)))) open.push([c, r]); }
    for (let i = 0; i < count && open.length; i++) {
      const [c, r] = open[Math.floor(this.rand() * open.length)];
      const x = this.cx(c) + (this.rand() - 0.5) * this.cell * 0.9, z = this.cz(r) + (this.rand() - 0.5) * this.cell * 0.9, s = 0.12 + this.rand() * 0.34;
      const rock = boxMesh('rk', this.rand() < 0.5 ? 'stone_base' : 'concrete', x, s * 0.4, z, s * (1 + this.rand()), s * 0.8, s * (1 + this.rand()), 1);
      rotateMesh(rock, { ry: this.rand() * 3, rx: (this.rand() - 0.5) * 0.4, px: x, py: s * 0.4, pz: z }); this.decor.push(rock);
    }
  }

  container(x0, z0, x1, z1, y0, mat) {
    const h = 2.6;
    this.addSolid(mat, x0, y0, z0, x1, y0 + h, z1, 3);
    // corrugation ribs and door end
    for (let x = x0 + 0.4; x < x1 - 0.2; x += 0.8) { this.addDecor(mat, x, y0 + 0.08, z0 - 0.04, x + 0.22, y0 + h - 0.08, z0, 1); this.addDecor(mat, x, y0 + 0.08, z1, x + 0.22, y0 + h - 0.08, z1 + 0.04, 1); }
    this.addDecor('metal', x0 - 0.02, y0, z0, x0 + 0.08, y0 + 0.12, z1, 1); this.addDecor('metal', x1 - 0.08, y0, z0, x1 + 0.02, y0 + h, z1, 1);
    this.addDecor('rust_metal', x0, y0 + h, z0, x1, y0 + h + 0.05, z1, 1);
  }
  crateDetail(x, z, s) {
    const h = s / 2, t = 0.09;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.addDecor('wood_dark', x + sx * h - t + (sx > 0 ? 0.03 : -0.03) - (sx > 0 ? 0 : 0), 0, z + sz * h - t + (sz > 0 ? 0.03 : -0.03), x + sx * h + t + (sx > 0 ? 0.03 : -0.03), s, z + sz * h + t + (sz > 0 ? 0.03 : -0.03), 1);
  }

  faces(c, r) { return [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]].filter(([, dc, dr]) => !this.isSolid(this.at(c + dc, r + dr)) && this.at(c + dc, r + dr) !== 'a'); }
  dress() {
    const { cell } = this, rnd = this.rand;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const ch = this.at(c, r);
      if (!this.isSolid(ch)) continue;
      const h = SOLID[ch], xa = this.x0 + c * cell, xb = xa + cell, za = this.z0 + r * cell, zb = za + cell;
      const edgeCell = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
      for (const [f] of this.faces(c, r)) {
        // along-face axis helper: emit box in (u = along face, d = out of face)
        const box = (mat, u0, u1, y0, y1, d0, d1, tile = 1) => {
          if (f === 'n') this.addDecor(mat, xa + u0, y0, za - d1, xa + u1, y1, za - d0, tile);
          else if (f === 's') this.addDecor(mat, xa + u0, y0, zb + d0, xa + u1, y1, zb + d1, tile);
          else if (f === 'w') this.addDecor(mat, xa - d1, y0, za + u0, xa - d0, y1, za + u1, tile);
          else this.addDecor(mat, xb + d0, y0, za + u0, xb + d1, y1, za + u1, tile);
        };
        box('stone_base', 0, cell, 0, 0.9, 0, 0.1, 2);
        box('sand_wall', -0.02, cell + 0.02, h - 0.35, h, 0, 0.22, 2);
        box('stone_base', -0.02, cell + 0.02, h - 0.42, h - 0.35, 0, 0.16, 2);
        if (edgeCell || h < 3.5) continue;
        const roll = rnd();
        if (roll < 0.42) { // window: recessed pane, frame, sill, shutters
          const u = cell * (0.25 + rnd() * 0.2), w = 1.1, y = ch === '#' ? 3.4 + (rnd() < 0.4 ? 3.2 : 0) : 2.4;
          box('window_dark', u, u + w, y, y + 1.5, 0, 0.05);
          for (const [a, b, y0, y1] of [[u - 0.1, u, y - 0.1, y + 1.6], [u + w, u + w + 0.1, y - 0.1, y + 1.6], [u - 0.1, u + w + 0.1, y + 1.5, y + 1.6], [u - 0.14, u + w + 0.14, y - 0.14, y - 0.04]]) box('wood_dark', a, b, y0, y1, 0, a === u - 0.14 ? 0.16 : 0.09);
          box('wood_dark', u + w / 2 - 0.03, u + w / 2 + 0.03, y, y + 1.5, 0, 0.08);
          if (rnd() < 0.5) { box('plaster_blue', u - 0.75, u - 0.1, y - 0.05, y + 1.55, 0.02, 0.09); box('plaster_blue', u + w + 0.1, u + w + 0.75, y - 0.05, y + 1.55, 0.02, 0.09); }
        } else if (roll < 0.58) { // door with arch frame
          const u = cell * 0.3, w = 1.3;
          box('wood_dark', u - 0.12, u + w + 0.12, 0, 2.7, 0, 0.1); box('wood', u, u + w, 0, 2.55, 0.05, 0.14, 1);
          box('metal', u + w - 0.25, u + w - 0.17, 1.1, 1.2, 0.14, 0.2, 1);
        } else if (roll < 0.7) { // striped awning + posts
          const u = cell * 0.1, w = cell * 0.8;
          box(rnd() < 0.5 ? 'cloth_red' : 'cloth_cream', u, u + w, 2.9, 3.0, 0.05, 1.7, 1);
          box('wood_dark', u, u + 0.1, 0, 2.9, 1.6, 1.7); box('wood_dark', u + w - 0.1, u + w, 0, 2.9, 1.6, 1.7);
        } else if (roll < 0.78 && h > 6) { // wall pipe + vent
          box('metal', cell * 0.8, cell * 0.8 + 0.14, 0, h - 0.4, 0.1, 0.24, 1); box('metal', cell * 0.15, cell * 0.55, 4.6, 5.3, 0.08, 0.3, 1);
        }
      }
      // roof clutter for skyline
      if (h >= 5.5 && rnd() < 0.18) { const cx = xa + cell / 2, cz = za + cell / 2; this.addCyl('metal', cx, h, cz, 0.7, 1.6, { sides: 10 }); this.addCyl('rust_metal', cx, h + 1.6, cz, 0.8, 0.12, { sides: 10 }); }
      else if (h >= 5.5 && rnd() < 0.14) { this.addDecor('wood_dark', xa + 0.6, h, za + 0.6, xa + 0.7, h + 2.2, za + 0.7); this.addDecor('metal', xa + 0.2, h + 1.9, za + 0.65, xa + 1.4, h + 1.95, za + 0.66); }
    }
  }

  output() {
    const groups = new Map();
    const push = (kind, m) => { const key = `${kind}_${m.material}`; if (!groups.has(key)) groups.set(key, { kind, material: m.material, list: [] }); groups.get(key).list.push(m); };
    for (const m of this.solid) push('world', m);
    for (const m of this.decor) push('decor', m);
    const meshes = [...groups.values()].map(g => mergeMeshes(`${g.kind}_${g.material}`, g.material, g.list));
    const used = new Set(meshes.map(m => m.material));
    return { meshes, materials: [...used].map(name => ({ name, ...MATERIALS[name] })), markers: this.markers };
  }
}

/** Places spawn markers on 't'/'x' cells and finalises site radius. */
export function finalizeMarkers(map, out) {
  const t = [], x = [];
  for (let r = 0; r < map.rows; r++) for (let c = 0; c < map.cols; c++) {
    const ch = map.at(c, r);
    if (ch === 't') t.push({ x: map.cx(c), z: map.cz(r) });
    if (ch === 'x') x.push({ x: map.cx(c), z: map.cz(r) });
  }
  const pick = (list, n) => { const step = Math.max(1, Math.floor(list.length / n)); return Array.from({ length: n }, (_, i) => list[Math.min(list.length - 1, i * step)]); };
  const markers = [];
  pick(t, 5).forEach((p, i) => markers.push({ name: `spawn_T_${i + 1}`, x: p.x, y: 0, z: p.z, yaw: 0 }));
  pick(x, 5).forEach((p, i) => markers.push({ name: `spawn_CT_${i + 1}`, x: p.x, y: 0, z: p.z, yaw: Math.PI }));
  // sites: centroid of all A / B cells with a radius covering them
  for (const id of ['A', 'B']) {
    const cells = out.markers.filter(m => m.name === `site_${id}`);
    if (!cells.length) continue;
    const cx = cells.reduce((a, m) => a + m.x, 0) / cells.length, cz = cells.reduce((a, m) => a + m.z, 0) / cells.length;
    const radius = Math.max(4.5, Math.max(...cells.map(m => Math.hypot(m.x - cx, m.z - cz))) + map.cell);
    markers.push({ name: `site_${id}`, x: cx, y: 0, z: cz, sx: radius, sy: 1, sz: radius });
  }
  return markers;
}
