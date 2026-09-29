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
  plaster_ochre: { color: hex(0xd6a468), roughness: 0.92, metalness: 0 },
  plaster_rose: { color: hex(0xcf9a7e), roughness: 0.92, metalness: 0 },
  stone_floor: { color: hex(0xb6a283), roughness: 0.95, metalness: 0 },
  stone_wall: { color: hex(0xc9b48f), roughness: 0.96, metalness: 0 },
  sand_raised: { color: hex(0xbfa272), roughness: 0.97, metalness: 0 },
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
// stairs: same collision as a ramp (smooth for movement, like CS clip brushes) with visible steps on top
const STAIR_DIR = { N: 'z-', S: 'z+', W: 'x-', E: 'x+' };
/** Height of one elevation level: one ramp / stair cell climbs exactly one level. */
export const LEVEL = 1.2;

export class GridMap {
  constructor({ id, cols, rows, cell = 3, seed = 1, wallMaterials, containers = false, groundMaterial = 'sand_ground', raisedMaterial = 'sand_raised', stairMaterial = 'stone_base', spawnYaw = { T: 0, CT: Math.PI } }) {
    Object.assign(this, { id, cols, rows, cell, containers, groundMaterial, raisedMaterial, stairMaterial, spawnYaw });
    this.grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
    this.levels = Array.from({ length: rows }, () => Array(cols).fill(0));
    this.rand = makeRandom(seed);
    this.wallMaterials = wallMaterials || ['sand_wall'];
    this.solid = []; this.decor = []; this.markers = [];
    this.x0 = -cols * cell / 2; this.z0 = -rows * cell / 2;
  }
  set(c, r, ch) { if (c >= 0 && r >= 0 && c < this.cols && r < this.rows) this.grid[r][c] = ch; return this; }
  at(c, r) { return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? '#' : this.grid[r][c]; }
  fill(c0, r0, c1, r1, ch) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) this.set(c, r, ch); return this; }
  border(ch = '#') { return this.fill(0, 0, this.cols - 1, 0, ch).fill(0, this.rows - 1, this.cols - 1, this.rows - 1, ch).fill(0, 0, 0, this.rows - 1, ch).fill(this.cols - 1, 0, this.cols - 1, this.rows - 1, ch); }
  /** Paints the layout from ASCII rows (and an optional same-sized elevation layer of digits 0-3). */
  paint(lines, levelLines = null) {
    lines.forEach((line, r) => { for (let c = 0; c < line.length; c++) this.set(c, r, line[c] === ' ' ? '.' : line[c]); });
    if (levelLines) levelLines.forEach((line, r) => { for (let c = 0; c < line.length; c++) if (line[c] >= '0' && line[c] <= '9') this.levels[r][c] = Number(line[c]); });
    return this;
  }
  lv(c, r) { return c < 0 || r < 0 || c >= this.cols || r >= this.rows ? 0 : this.levels[r][c]; }
  base(c, r) { return this.lv(c, r) * LEVEL; }
  setLevel(c0, r0, c1, r1, l) { for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) if (r >= 0 && c >= 0 && r < this.rows && c < this.cols) this.levels[r][c] = l; return this; }
  /** Walls rise from the highest walkable floor next to them. */
  wallBase(c, r) { let b = this.base(c, r); for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!this.isSolid(this.at(c + dc, r + dr))) b = Math.max(b, this.base(c + dc, r + dr)); return b; }
  cx(c) { return this.x0 + c * this.cell + this.cell / 2; }
  cz(r) { return this.z0 + r * this.cell + this.cell / 2; }
  isSolid(ch) { return ch in SOLID; }
  /** Wall material by building-sized blocks (5x5 cells) so facades read as whole houses instead of stripes. */
  wallMat(c, r) { const bc = Math.floor(c / (this.blockSize || 5)), br = Math.floor(r / (this.blockSize || 5)); return this.wallMaterials[Math.floor((Math.sin(bc * 12.9898 + br * 78.233) * 43758.5453 % 1 + 1) * 7) % this.wallMaterials.length]; }

  addSolid(mat, x0, y0, z0, x1, y1, z1, tile = 4) { this.solid.push(boxMesh('s', mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tile)); }
  addDecor(mat, x0, y0, z0, x1, y1, z1, tile = 4) { this.decor.push(boxMesh('d', mat, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, x1 - x0, y1 - y0, z1 - z0, tile)); }
  addCyl(mat, cx, y0, cz, r, h, { solid = false, sides = 14, tile = 2 } = {}) { (solid ? this.solid : this.decor).push(cylMesh('c', mat, cx, y0, cz, r, h, sides, tile)); }

  build() {
    const { cols, rows, cell } = this;
    // world ground (collidable) with generous apron
    this.addSolid(this.groundMaterial, this.x0 - 40, -1, this.z0 - 40, -this.x0 + 40, 0, -this.z0 + 40, 6);

    // --- elevation pass: raised floor blocks (runs of equal level merge), with a stone lip where a ledge drops
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols;) {
        const l = this.lv(c, r); let end = c;
        if (l > 0 && !this.isSolid(this.at(c, r))) {
          while (end + 1 < cols && this.lv(end + 1, r) === l && !this.isSolid(this.at(end + 1, r))) end++;
          const xa = this.x0 + c * cell, xb = this.x0 + (end + 1) * cell, za = this.z0 + r * cell;
          this.addSolid(this.raisedMaterial, xa, 0, za, xb, l * LEVEL, za + cell, 4);
          for (let k = c; k <= end; k++) this.ledgeTrim(k, r);
        }
        c = end + 1;
      }
    }

    // --- structural pass: horizontal runs of identical cells merge into one box
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols;) {
        const ch = this.at(c, r); let end = c;
        const mergeable = this.isSolid(ch) || ch === 'R' || ch === 'H' || ch === 'P' || ch === 'a' || ch === 'K' || ch === 'L';
        const maxRun = ch === 'K' || ch === 'L' ? 2 : Infinity;
        const same = k => this.at(k, r) === ch && (this.isSolid(ch) ? this.wallMat(k, r) === this.wallMat(c, r) && this.wallBase(k, r) === this.wallBase(c, r) : this.lv(k, r) === this.lv(c, r));
        if (mergeable) while (end + 1 < cols && end - c + 1 < maxRun && same(end + 1)) end++;
        const xa = this.x0 + c * cell, xb = this.x0 + (end + 1) * cell, za = this.z0 + r * cell, zb = za + cell, y = this.base(c, r);
        if (this.isSolid(ch)) this.addSolid(this.wallMat(c, r), xa, 0, za, xb, SOLID[ch] + this.wallBase(c, r), zb);
        else if (ch === 'R') { this.addSolid('concrete', xa, y + 3.9, za, xb, y + 4.4, zb); this.addDecor('metal', xa, y + 3.5, za + cell * 0.45, xb, y + 3.9, za + cell * 0.55); }
        else if (ch === 'H') { this.addSolid('stone_base', xa, y, za + cell * 0.3, xb, y + 1.3, zb - cell * 0.3, 2); this.addDecor('sandbag', xa, y + 1.3, za + cell * 0.25, xb, y + 1.45, zb - cell * 0.25, 1); }
        else if (ch === 'P') this.addSolid('concrete', xa, y, za, xb, y + 1.2, zb);
        else if (ch === 'a') { this.addSolid(this.wallMat(c, r), xa, y + 3.8, za, xb, Math.max(y + 9, this.wallBase(c, r) + 9), zb); this.addDecor('wood_dark', xa, y + 3.5, za, xb, y + 3.8, zb, 1); }
        else if (ch in RAMP_DIR) this.solid.push(rampMesh('r', 'concrete', this.cx(c), y, this.cz(r), cell, cell * 1.0, LEVEL, RAMP_DIR[ch]));
        else if (ch in STAIR_DIR) this.stairs(c, r, STAIR_DIR[ch]);
        else if (ch === 'c') { const s = 1.4 + this.rand() * 0.6; this.addSolid('crate', this.cx(c) - s / 2, y, this.cz(r) - s / 2, this.cx(c) + s / 2, y + s, this.cz(r) + s / 2, 1.5); this.crateDetail(this.cx(c), this.cz(r), s, y); }
        else if (ch === 'C') { const s = 1.5; this.addSolid('crate', this.cx(c) - s, y, this.cz(r) - s / 2, this.cx(c), y + s, this.cz(r) + s / 2, 1.5); this.addSolid('crate', this.cx(c) - s / 2, y + s, this.cz(r) - s / 2, this.cx(c) + s / 2, y + s * 2, this.cz(r) + s / 2, 1.5); this.addSolid('crate', this.cx(c), y, this.cz(r) - s / 2, this.cx(c) + s, y + s, this.cz(r) + s / 2, 1.5); }
        else if (ch === 'b') { for (const [dx, dz] of [[-0.55, -0.4], [0.55, -0.3], [0, 0.6]]) this.addCyl(this.rand() < 0.5 ? 'rust_metal' : 'container_blue', this.cx(c) + dx, y, this.cz(r) + dz, 0.36, 0.95, { solid: true, sides: 12, tile: 1 }); }
        else if (ch === 'T') this.palm(this.cx(c), this.cz(r), 6.2, this.rand(), y);
        else if (ch === 'p') { this.addSolid('concrete', this.cx(c) - 0.45, y, this.cz(r) - 0.45, this.cx(c) + 0.45, y + 4.2, this.cz(r) + 0.45, 2); this.addDecor('stone_base', this.cx(c) - 0.55, y, this.cz(r) - 0.55, this.cx(c) + 0.55, y + 0.5, this.cz(r) + 0.55, 1); }
        else if (ch === 'k') this.car(this.cx(c), this.cz(r), y, this.rand() < 0.5);
        else if (ch === 'w') this.well(this.cx(c), this.cz(r), y);
        else if (ch === 'K' || ch === 'L') {
          // shipping container: a run of two cells (6 m x 3 m); 'L' stacks a second container on top
          const w = 2.5;
          const mats = ['container_red', 'container_blue', 'container_green', 'container_yellow', 'container_grey'];
          const mat = mats[Math.floor(this.rand() * mats.length)];
          this.container(xa, za + (cell - w) / 2, xb, za + (cell + w) / 2, y, mat);
          if (ch === 'L') this.container(xa, za + (cell - w) / 2, xb, za + (cell + w) / 2, y + 2.6, mats[Math.floor(this.rand() * mats.length)]);
        }
        else if (ch === ',') this.addDecor('asphalt', xa, y, za, xb, y + 0.025, zb, 6);
        else if (ch === 'A' || ch === 'B') this.markers.push({ name: `site_${ch}`, x: this.cx(c), y, z: this.cz(r), sx: 1, sy: 1, sz: 1, pending: true });
        c = end + 1;
      }
    }
    this.dress();
    return this.output();
  }

  /** Stone lip on every edge where this raised cell drops to a lower, open neighbour. */
  ledgeTrim(c, r) {
    const l = this.lv(c, r), y = l * LEVEL, xa = this.x0 + c * this.cell, xb = xa + this.cell, za = this.z0 + r * this.cell, zb = za + this.cell;
    const ramp = ch => ch in RAMP_DIR || ch in STAIR_DIR;
    if (ramp(this.at(c, r))) return;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const n = this.at(c + dc, r + dr);
      if (this.isSolid(n) || this.lv(c + dc, r + dr) >= l || ramp(n)) continue;
      const t = 0.08;
      if (dc === 1) this.addDecor('stone_base', xb, y - 0.3, za, xb + t, y + 0.04, zb, 1);
      else if (dc === -1) this.addDecor('stone_base', xa - t, y - 0.3, za, xa, y + 0.04, zb, 1);
      else if (dr === 1) this.addDecor('stone_base', xa, y - 0.3, zb, xb, y + 0.04, zb + t, 1);
      else this.addDecor('stone_base', xa, y - 0.3, za - t, xb, y + 0.04, za, 1);
    }
  }
  /** Stairs: invisible-smooth ramp collision plus four visible treads (decor) climbing one level. */
  stairs(c, r, dir) {
    const y = this.base(c, r), cell = this.cell, x = this.cx(c), z = this.cz(r), n = 4, rise = LEVEL / n, run = cell / n;
    this.solid.push(rampMesh('st', this.stairMaterial, x, y, z, cell, cell, LEVEL, dir));
    for (let i = 0; i < n; i++) {
      const h = y + rise * (i + 1), d0 = -cell / 2 + i * run;                  // tread i spans [d0, d0+run] from the low end
      const a = d0, b = d0 + run;
      if (dir === 'z-') this.addDecor(this.stairMaterial, x - cell / 2, y, z - b, x + cell / 2, h, z - a, 1);
      else if (dir === 'z+') this.addDecor(this.stairMaterial, x - cell / 2, y, z + a, x + cell / 2, h, z + b, 1);
      else if (dir === 'x+') this.addDecor(this.stairMaterial, x + a, y, z - cell / 2, x + b, h, z + cell / 2, 1);
      else this.addDecor(this.stairMaterial, x - b, y, z - cell / 2, x - a, h, z + cell / 2, 1);
    }
  }
  /** Parked car wreck (solid body + cabin, decor wheels) — classic cover. */
  car(x, z, y, alongX) {
    const L = 4.2, W = 1.8, body = this.rand() < 0.5 ? 'container_blue' : 'plaster_white';
    const box = (mat, l0, l1, y0, y1, w0, w1, solid) => { const b = alongX ? [x + l0, y + y0, z + w0, x + l1, y + y1, z + w1] : [x + w0, y + y0, z + l0, x + w1, y + y1, z + l1]; (solid ? this.addSolid : this.addDecor).call(this, mat, ...b, 1); };
    box(body, -L / 2, L / 2, 0.3, 1.05, -W / 2, W / 2, true);
    box(body, -L / 4, L / 4, 1.05, 1.55, -W / 2 + 0.1, W / 2 - 0.1, true);
    box('window_dark', -L / 4 - 0.02, L / 4 + 0.02, 1.1, 1.5, -W / 2 + 0.08, W / 2 - 0.08, false);
    for (const [l, w] of [[-1.35, -0.8], [1.35, -0.8], [-1.35, 0.8], [1.35, 0.8]]) {
      const cx = alongX ? x + l : x + w, cz = alongX ? z + w : z + l;
      this.addCyl('rust_metal', cx, y, cz, 0.36, 0.34, { sides: 10, tile: 1 });
    }
    box('rust_metal', -L / 2 - 0.05, -L / 2 + 0.05, 0.4, 0.8, -W / 2, W / 2, false);
  }
  /** Stone well / planter (solid ring) used as mid-area cover. */
  well(x, z, y) {
    this.addCyl('stone_base', x, y, z, 1.05, 0.95, { solid: true, sides: 16, tile: 1 });
    this.addCyl('stone_wall', x, y + 0.95, z, 1.12, 0.12, { sides: 16, tile: 1 });
    this.addDecor('wood_dark', x - 1.0, y + 0.95, z - 0.05, x + 1.0, y + 2.4, z + 0.05, 1);
    this.addDecor('wood_dark', x - 1.05, y + 2.35, z - 0.08, x + 1.05, y + 2.45, z + 0.08, 1);
  }

  /** Date palm: gently curved trunk (collidable core), ring texture bands and drooping fronds. */
  palm(x, z, height = 6.2, seed = this.rand(), y0 = 0) {
    const lean = (seed - 0.5) * 0.5, dir = seed * 6.28;
    let px = x, pz = z;
    const segs = 5, segH = height / segs;
    for (let i = 0; i < segs; i++) {
      const r0 = 0.24 - i * 0.022;
      const m = cylMesh('t', 'wood', px, y0 + i * segH, pz, r0, segH * 1.06, 9, 1, false);
      rotateMesh(m, { rx: 0, rz: 0 });
      (i === 0 ? this.solid : this.decor).push(m);
      if (i === 0) this.solid.push(cylMesh('t', 'wood', px, y0, pz, 0.22, height * 0.5, 8, 1)); // trunk core for collision
      px += Math.cos(dir) * lean * segH * 0.5; pz += Math.sin(dir) * lean * segH * 0.5;
    }
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2 + seed * 3, len = 2.4 + this.rand() * 0.8;
      const frond = boxMesh('f', 'foliage', px + len / 2, y0 + height, pz, len, 0.025, 0.55, 1);
      rotateMesh(frond, { rz: -0.32 - this.rand() * 0.25, ry: a, px, py: y0 + height, pz });
      this.decor.push(frond);
      const rib = boxMesh('f', 'wood', px + len / 2, y0 + height + 0.02, pz, len, 0.03, 0.05, 1);
      rotateMesh(rib, { rz: -0.32, ry: a, px, py: y0 + height, pz }); this.decor.push(rib);
    }
    this.addCyl('foliage', px, y0 + height - 0.25, pz, 0.34, 0.5, { sides: 8 });
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
      const x = this.cx(c) + (this.rand() - 0.5) * this.cell * 0.9, z = this.cz(r) + (this.rand() - 0.5) * this.cell * 0.9, s = 0.12 + this.rand() * 0.34, y0 = this.base(c, r);
      const rock = boxMesh('rk', this.rand() < 0.5 ? 'stone_base' : 'concrete', x, y0 + s * 0.4, z, s * (1 + this.rand()), s * 0.8, s * (1 + this.rand()), 1);
      rotateMesh(rock, { ry: this.rand() * 3, rx: (this.rand() - 0.5) * 0.4, px: x, py: y0 + s * 0.4, pz: z }); this.decor.push(rock);
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
  crateDetail(x, z, s, y = 0) {
    const h = s / 2, t = 0.09;
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) this.addDecor('wood_dark', x + sx * h - t + (sx > 0 ? 0.03 : -0.03), y, z + sz * h - t + (sz > 0 ? 0.03 : -0.03), x + sx * h + t + (sx > 0 ? 0.03 : -0.03), y + s, z + sz * h + t + (sz > 0 ? 0.03 : -0.03), 1);
  }

  faces(c, r) { return [['n', 0, -1], ['s', 0, 1], ['w', -1, 0], ['e', 1, 0]].filter(([, dc, dr]) => !this.isSolid(this.at(c + dc, r + dr)) && this.at(c + dc, r + dr) !== 'a'); }
  dress() {
    const { cell } = this, rnd = this.rand;
    for (let r = 0; r < this.rows; r++) for (let c = 0; c < this.cols; c++) {
      const ch = this.at(c, r);
      if (!this.isSolid(ch)) continue;
      const h = SOLID[ch] + this.wallBase(c, r), xa = this.x0 + c * cell, xb = xa + cell, za = this.z0 + r * cell, zb = za + cell;
      const edgeCell = c === 0 || r === 0 || c === this.cols - 1 || r === this.rows - 1;
      for (const [f, dc, dr] of this.faces(c, r)) {
        const nb = this.base(c + dc, r + dr), top = h;
        // along-face axis helper: emit box in (u = along face, d = out of face); y is relative to the neighbour floor except the cornice
        const box = (mat, u0, u1, y0r, y1r, d0, d1, tile = 1) => {
          const y0 = y0r >= top - 0.5 ? y0r : y0r + nb, y1 = y1r >= top - 0.5 ? y1r : y1r + nb;
          if (f === 'n') this.addDecor(mat, xa + u0, y0, za - d1, xa + u1, y1, za - d0, tile);
          else if (f === 's') this.addDecor(mat, xa + u0, y0, zb + d0, xa + u1, y1, zb + d1, tile);
          else if (f === 'w') this.addDecor(mat, xa - d1, y0, za + u0, xa - d0, y1, za + u1, tile);
          else this.addDecor(mat, xb + d0, y0, za + u0, xb + d1, y1, za + u1, tile);
        };
        box('stone_base', 0, cell, 0, 0.9, 0, 0.1, 2);
        if (h - nb < 3.5) continue;
        box('sand_wall', -0.02, cell + 0.02, h - 0.35, h, 0, 0.22, 2);
        box('stone_base', -0.02, cell + 0.02, h - 0.42, h - 0.35, 0, 0.16, 2);
        if (edgeCell) continue;
        const roll = rnd(), inside = this.at(c + dc, r + dr) === 'R';
        if (inside && roll > 0.3) continue;              // tunnels: bare walls with the odd window
        if (roll < 0.42) { // window: recessed pane, frame, sill, shutters
          const u = cell * (0.25 + rnd() * 0.2), w = 1.1, y = ch === '#' && h - nb > 7.5 ? 3.4 + (rnd() < 0.4 ? 3.2 : 0) : 2.0;
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
        } else if (roll < 0.78 && h - nb > 6) { // wall pipe + vent
          box('metal', cell * 0.8, cell * 0.8 + 0.14, 0, h - 0.4, 0.1, 0.24, 1); box('metal', cell * 0.15, cell * 0.55, 4.6, 5.3, 0.08, 0.3, 1);
        }
      }
      // roof clutter for skyline (only on facades that face an open street)
      if (!this.faces(c, r).length) continue;
      if (h >= 5.5 && rnd() < 0.09) { const cx = xa + cell / 2, cz = za + cell / 2; this.addCyl('metal', cx, h, cz, 0.7, 1.6, { sides: 10 }); this.addCyl('rust_metal', cx, h + 1.6, cz, 0.8, 0.12, { sides: 10 }); }
      else if (h >= 5.5 && rnd() < 0.06) { this.addDecor('wood_dark', xa + 0.6, h, za + 0.6, xa + 0.7, h + 2.2, za + 0.7); this.addDecor('metal', xa + 0.2, h + 1.9, za + 0.65, xa + 1.4, h + 1.95, za + 0.66); }
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
    if (ch === 't') t.push({ x: map.cx(c), y: map.base(c, r), z: map.cz(r) });
    if (ch === 'x') x.push({ x: map.cx(c), y: map.base(c, r), z: map.cz(r) });
  }
  // up to 10 spread-out spawn points per team: the server shuffles which five are used every round
  const pick = (list, n) => { n = Math.min(n, list.length); const step = list.length / n; return Array.from({ length: n }, (_, i) => list[Math.min(list.length - 1, Math.floor(i * step))]); };
  const markers = [];
  const yaw = map.spawnYaw || { T: 0, CT: Math.PI };
  pick(t, 10).forEach((p, i) => markers.push({ name: `spawn_T_${i + 1}`, x: p.x, y: p.y, z: p.z, yaw: yaw.T }));
  pick(x, 10).forEach((p, i) => markers.push({ name: `spawn_CT_${i + 1}`, x: p.x, y: p.y, z: p.z, yaw: yaw.CT }));
  // sites: centroid of all A / B cells with a radius covering them
  for (const id of ['A', 'B']) {
    const cells = out.markers.filter(m => m.name === `site_${id}`);
    if (!cells.length) continue;
    const cx = cells.reduce((a, m) => a + m.x, 0) / cells.length, cz = cells.reduce((a, m) => a + m.z, 0) / cells.length;
    const radius = Math.max(4.5, Math.max(...cells.map(m => Math.hypot(m.x - cx, m.z - cz))) + map.cell);
    const cy = cells.reduce((a, m) => a + m.y, 0) / cells.length;
    markers.push({ name: `site_${id}`, x: cx, y: cy, z: cz, sx: radius, sy: 1, sz: radius });
  }
  return markers;
}
