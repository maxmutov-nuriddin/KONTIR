// Procedural triangle-mesh primitives used by the map pipeline and the unit tests.
// Every mesh: { name, material, positions, normals, uvs, indices } with outward-facing CCW winding.

const FACES = [
  { n: [1, 0, 0], u: [0, 0, -1], v: [0, 1, 0] },
  { n: [-1, 0, 0], u: [0, 0, 1], v: [0, 1, 0] },
  { n: [0, 1, 0], u: [1, 0, 0], v: [0, 0, -1] },
  { n: [0, -1, 0], u: [1, 0, 0], v: [0, 0, 1] },
  { n: [0, 0, 1], u: [1, 0, 0], v: [0, 1, 0] },
  { n: [0, 0, -1], u: [-1, 0, 0], v: [0, 1, 0] },
];

/** Axis-aligned box centred at (cx,cy,cz). UVs are world-scaled (1 uv unit = `tile` metres) so textures never stretch. */
export function boxMesh(name, material, cx, cy, cz, sx, sy, sz, tile = 4) {
  const positions = [], normals = [], uvs = [], indices = [];
  const half = [sx / 2, sy / 2, sz / 2], c = [cx, cy, cz];
  for (const { n, u, v } of FACES) {
    const base = positions.length / 3;
    const axisU = u.findIndex(k => k !== 0), axisV = v.findIndex(k => k !== 0);
    for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      const p = [0, 1, 2].map(k => c[k] + n[k] * half[k] + u[k] * a * half[k] + v[k] * b * half[k]);
      positions.push(...p); normals.push(...n);
      uvs.push((p[axisU] + 0) / tile, (p[axisV] + 0) / tile);
    }
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const mesh = { name, material, positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
  fixWinding(mesh);
  return mesh;
}

/** Makes every triangle's geometric normal agree with its vertex normals. */
export function fixWinding(mesh) {
  const { positions: p, normals: n, indices: idx } = mesh;
  for (let i = 0; i < idx.length; i += 3) {
    const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    const g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    if (g[0] * n[a] + g[1] * n[a + 1] + g[2] * n[a + 2] < 0) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  }
  return mesh;
}

/** Wedge ramp rising along +dir from the low edge; footprint (w across, l along), height h. dir: 'x+','x-','z+','z-'. */
export function rampMesh(name, material, cx, baseY, cz, w, l, h, dir, tile = 4) {
  const rot = { 'z-': (x, z) => [x, z], 'z+': (x, z) => [-x, -z], 'x+': (x, z) => [-z, x], 'x-': (x, z) => [z, -x] }[dir];
  // local frame: ramp rises toward -z. Low edge at z=+l/2 (y=0), high edge at z=-l/2 (y=h).
  const hw = w / 2, hl = l / 2;
  const local = [[-hw, 0, hl], [hw, 0, hl], [hw, 0, -hl], [-hw, 0, -hl], [-hw, h, -hl], [hw, h, -hl]];
  const pts = local.map(([x, y, z]) => { const [rx, rz] = rot(x, z); return [cx + rx, baseY + y, cz + rz]; });
  const tris = [[0, 1, 5], [0, 5, 4], [3, 2, 1], [3, 1, 0], [2, 5, 1], [3, 0, 4], [3, 4, 5], [3, 5, 2]];
  const positions = [], indices = [], uvs = [];
  for (const t of tris) {
    for (const k of t) positions.push(...pts[k]);
    const b = positions.length / 3;
    indices.push(b - 3, b - 2, b - 1);
  }
  // Flat normals derived from geometry, orientation fixed against the solid centroid.
  const normals = new Float32Array(positions.length);
  const centre = pts.reduce((a, p) => [a[0] + p[0] / pts.length, a[1] + p[1] / pts.length, a[2] + p[2] / pts.length], [0, 0, 0]);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3, b = indices[i + 1] * 3, c = indices[i + 2] * 3;
    const p = positions;
    const e1 = [p[b] - p[a], p[b + 1] - p[a + 1], p[b + 2] - p[a + 2]], e2 = [p[c] - p[a], p[c + 1] - p[a + 1], p[c + 2] - p[a + 2]];
    let g = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    const l = Math.hypot(...g) || 1; g = g.map(v => v / l);
    const out = g[0] * (p[a] - centre[0]) + g[1] * (p[a + 1] - centre[1]) + g[2] * (p[a + 2] - centre[2]);
    if (out < 0) { g = g.map(v => -v); const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
    for (const k of [a, b, c]) { normals[k] = g[0]; normals[k + 1] = g[1]; normals[k + 2] = g[2]; }
  }
  // Box-project each face along its dominant normal axis so the vertical sides don't smear the texture.
  for (let i = 0; i < positions.length; i += 3) {
    const ax = Math.abs(normals[i]), ay = Math.abs(normals[i + 1]), az = Math.abs(normals[i + 2]);
    const [u, v] = ay >= ax && ay >= az ? [0, 2] : ax >= az ? [2, 1] : [0, 1];
    uvs.push(positions[i + u] / tile, positions[i + v] / tile);
  }
  return { name, material, positions: new Float32Array(positions), normals, uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
}

/** Vertical cylinder with smooth side normals and flat caps. */
export function cylMesh(name, material, cx, y0, cz, radius, height, sides = 14, tile = 2, cap = true) {
  const positions = [], normals = [], uvs = [], indices = [];
  for (let i = 0; i <= sides; i++) {
    const a = (i / sides) * Math.PI * 2, x = Math.cos(a), z = Math.sin(a);
    positions.push(cx + x * radius, y0, cz + z * radius, cx + x * radius, y0 + height, cz + z * radius);
    normals.push(x, 0, z, x, 0, z);
    uvs.push(i / sides * (2 * Math.PI * radius / tile), 0, i / sides * (2 * Math.PI * radius / tile), height / tile);
    if (i < sides) { const b = i * 2; indices.push(b, b + 1, b + 3, b, b + 3, b + 2); }
  }
  if (cap) {
    const base = positions.length / 3;
    positions.push(cx, y0 + height, cz); normals.push(0, 1, 0); uvs.push(0.5, 0.5);
    for (let i = 0; i <= sides; i++) {
      const a = (i / sides) * Math.PI * 2;
      positions.push(cx + Math.cos(a) * radius, y0 + height, cz + Math.sin(a) * radius); normals.push(0, 1, 0);
      uvs.push(0.5 + Math.cos(a) * 0.5, 0.5 + Math.sin(a) * 0.5);
      if (i < sides) indices.push(base, base + 2 + i, base + 1 + i);
    }
  }
  const mesh = { name, material, positions: new Float32Array(positions), normals: new Float32Array(normals), uvs: new Float32Array(uvs), indices: new Uint32Array(indices) };
  return fixWinding(mesh);
}

/** Concatenates meshes that share a material into one mesh. */
export function mergeMeshes(name, material, list) {
  let v = 0, i = 0;
  for (const m of list) { v += m.positions.length; i += m.indices.length; }
  const positions = new Float32Array(v), normals = new Float32Array(v), uvs = new Float32Array(v / 3 * 2), indices = new Uint32Array(i);
  let vo = 0, io = 0;
  for (const m of list) {
    positions.set(m.positions, vo * 3); normals.set(m.normals, vo * 3); uvs.set(m.uvs, vo * 2);
    for (let k = 0; k < m.indices.length; k++) indices[io + k] = m.indices[k] + vo;
    vo += m.positions.length / 3; io += m.indices.length;
  }
  return { name, material, positions, normals, uvs, indices };
}
