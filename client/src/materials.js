// Procedural PBR texture sets (albedo detail + tangent-space normal + roughness/metalness) baked on canvases.
// Everything is tileable (periodic value noise / worley), so world-scale UVs from the GLB never show seams.
import * as THREE from 'three';

const mod = (n, m) => ((n % m) + m) % m;
const mix = (a, b, t) => a + (b - a) * t;
const clamp01 = v => (v < 0 ? 0 : v > 1 ? 1 : v);
const smooth = (a, b, x) => { const t = clamp01((x - a) / (b - a)); return t * t * (3 - 2 * t); };

function hash(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x, y, px, py, seed) {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const x0 = mod(xi, px), x1 = mod(xi + 1, px), y0 = mod(yi, py), y1 = mod(yi + 1, py);
  return mix(mix(hash(x0, y0, seed), hash(x1, y0, seed), u), mix(hash(x0, y1, seed), hash(x1, y1, seed), u), v);
}
/** Periodic fractal noise; (u,v) in [0,1) tile with `fx`/`fy` base lattice cells. */
function fbm(u, v, fx, fy, octaves, seed = 1) {
  let sum = 0, amp = 0.5, total = 0;
  for (let i = 0; i < octaves; i++) {
    const px = fx << i, py = fy << i;
    sum += amp * vnoise(u * px, v * py, px, py, seed + i * 17); total += amp; amp *= 0.5;
  }
  return sum / total;
}
/** Tileable worley: returns [F1, F2] distances in cell units. */
function worley(u, v, cells, seed = 3) {
  const x = u * cells, y = v * cells, xi = Math.floor(x), yi = Math.floor(y);
  let f1 = 9, f2 = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = xi + i, cy = yi + j, wx = mod(cx, cells), wy = mod(cy, cells);
    const px = cx + hash(wx, wy, seed), py = cy + hash(wx, wy, seed + 9);
    const d = Math.hypot(px - x, py - y);
    if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
  }
  return [f1, f2];
}

const RECIPES = {
  sand(u, v) {
    const ripple = fbm(u, v, 5, 3, 3, 4), ridge = 1 - Math.abs(fbm(u, v * 2, 6, 6, 3, 5) * 2 - 1);
    const grain = fbm(u, v, 96, 96, 2, 6), tone = fbm(u, v, 3, 3, 4, 7);
    const h = ripple * 0.5 + ridge * 0.35 + grain * 0.15;
    const c = 0.82 + tone * 0.3 + (grain - 0.5) * 0.14;
    return { h, c: [c * 1.02, c, c * 0.94], r: 0.94 };
  },
  plaster(u, v) {
    const mott = fbm(u, v, 4, 4, 4, 11), grain = fbm(u, v, 128, 128, 2, 12);
    const crackN = 1 - Math.abs(fbm(u, v, 9, 9, 3, 13) * 2 - 1), crack = smooth(0.955, 0.99, crackN);
    const streak = fbm(u * 3, v * 0.35, 6, 2, 3, 14), chip = smooth(0.78, 0.86, fbm(u, v, 24, 24, 2, 15));
    const h = mott * 0.35 + grain * 0.25 - crack * 0.9 - chip * 0.4;
    const c = 0.88 + mott * 0.16 + (grain - 0.5) * 0.12 - crack * 0.4 - streak * 0.1 - chip * 0.08;
    return { h, c: [c, c, c * 0.985], r: 0.9 + grain * 0.08 };
  },
  concrete(u, v) {
    const pore = smooth(0.7, 0.8, fbm(u, v, 48, 48, 2, 21)), mott = fbm(u, v, 4, 4, 4, 22), grain = fbm(u, v, 160, 160, 2, 23);
    const seamH = smooth(0.985, 1, Math.abs(Math.sin(v * Math.PI * 2))) , seamV = smooth(0.985, 1, Math.abs(Math.sin(u * Math.PI * 2)));
    const seam = Math.max(seamH, seamV) * 0.9;
    const h = mott * 0.3 + grain * 0.2 - pore * 0.4 - seam * 0.6;
    const c = 0.84 + mott * 0.2 + (grain - 0.5) * 0.12 - pore * 0.22 - seam * 0.35;
    return { h, c: [c, c, c], r: 0.88 + grain * 0.1 };
  },
  stone(u, v) {
    const [f1, f2] = worley(u, v, 7, 31), edge = smooth(0.0, 0.14, f2 - f1), tint = hash(Math.floor(f1 * 977), 3, 32);
    const grain = fbm(u, v, 96, 96, 3, 33), mott = fbm(u, v, 5, 5, 3, 34);
    const h = edge * 0.8 + mott * 0.25 + grain * 0.15;
    const c = (0.62 + tint * 0.28 + (grain - 0.5) * 0.18 + mott * 0.12) * (0.55 + 0.45 * edge);
    return { h, c: [c * 1.03, c, c * 0.93], r: 0.93 };
  },
  brick(u, v) {
    const rows = 32, cols = 9, ry = v * rows, row = Math.floor(ry), fy = ry - row;
    const rx = u * cols + (row % 2) * 0.5, col = Math.floor(rx), fx = rx - col;
    const mortar = Math.max(1 - smooth(0, 0.08, Math.min(fy, 1 - fy)), 1 - smooth(0, 0.05, Math.min(fx, 1 - fx)));
    const jitter = hash(mod(col, cols), row, 41), grain = fbm(u, v, 96, 96, 3, 42), blot = fbm(u, v, 6, 6, 3, 43);
    const h = (1 - mortar) * (0.65 + grain * 0.35);
    const base = 0.62 + jitter * 0.34 + blot * 0.12 + (grain - 0.5) * 0.2;
    const c = mortar > 0.5 ? 0.78 + grain * 0.12 : base;
    return { h, c: mortar > 0.5 ? [c, c * 0.97, c * 0.9] : [c * 1.08, c * 0.82, c * 0.72], r: mortar > 0.5 ? 0.98 : 0.86 };
  },
  wood(u, v) {
    const planks = 6, pu = u * planks, plank = Math.floor(pu), fu = pu - plank;
    const tint = hash(plank, 5, 51), warp = fbm(u, v, 3, 2, 3, 52) * 3;
    const ring = fbm(u * 3 + plank * 0.37, v * 0.5, 6, 2, 3, 53) * 14 + warp;
    const fiber = fbm(u, v, 64, 3, 3, 54), g = 0.5 + 0.5 * Math.sin(ring * 6.283) ;
    const seam = 1 - smooth(0, 0.035, Math.min(fu, 1 - fu));
    const knot = smooth(0.82, 0.88, fbm(u * 2 + plank, v * 2, 5, 5, 2, 55));
    const h = g * 0.35 + fiber * 0.3 - seam * 0.9 - knot * 0.2;
    const c = (0.62 + tint * 0.25 + g * 0.16 + (fiber - 0.5) * 0.18) * (1 - seam * 0.6) * (1 - knot * 0.25);
    return { h, c: [c * 1.1, c * 0.88, c * 0.68], r: 0.72 + fiber * 0.18 };
  },
  crate(u, v) {
    const b = RECIPES.wood(u, v), edge = Math.min(u, v, 1 - u, 1 - v), frame = 1 - smooth(0.06, 0.1, edge);
    const nail = smooth(0.6, 0.9, 1 - Math.hypot(mod(u * 4, 1) - 0.5, mod(v * 4, 1) - 0.5) * 8) * frame;
    return { h: b.h + frame * 0.35 + nail * 0.3, c: b.c.map(x => x * (1 - frame * 0.2)), r: b.r };
  },
  metal(u, v) {
    const brushed = fbm(u, v, 3, 96, 3, 61), scratch = smooth(0.86, 0.95, fbm(u, v, 5, 128, 2, 62)), dent = fbm(u, v, 5, 5, 4, 63);
    const h = dent * 0.3 + brushed * 0.1 - scratch * 0.15;
    const c = 0.7 + brushed * 0.18 - scratch * 0.25 + dent * 0.08;
    return { h, c: [c, c * 1.01, c * 1.03], r: 0.32 + brushed * 0.24 + scratch * 0.2, m: 0.92 - scratch * 0.2 };
  },
  rust(u, v) {
    const base = RECIPES.metal(u, v), rust = smooth(0.42, 0.62, fbm(u, v, 5, 5, 5, 71)), flake = fbm(u, v, 40, 40, 3, 72);
    const c = mix(0.7, 0.42 + flake * 0.3, rust);
    return { h: base.h + rust * (0.3 + flake * 0.3), c: [mix(c, c * 1.45, rust), mix(c, c * 0.85, rust), mix(c, c * 0.6, rust)], r: mix(base.r, 0.85, rust), m: mix(0.9, 0.15, rust) };
  },
  container(u, v) {
    const n = 24, ridge = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * n);
    const edgeShade = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * n + 0.6);
    const wear = smooth(0.5, 0.75, fbm(u, v, 4, 4, 5, 81)), streak = fbm(u * 8, v * 0.6, 24, 3, 3, 82), scratch = smooth(0.88, 0.96, fbm(u, v, 6, 96, 2, 83));
    const rust = wear * smooth(0.45, 0.7, fbm(u, v, 10, 10, 4, 84)) * 0.9;
    const h = ridge * 0.9 + rust * 0.3;
    const c = (0.72 + edgeShade * 0.24 - streak * 0.14 - scratch * 0.2) * (1 - rust * 0.3);
    return { h, c: [mix(c, c * 1.4, rust), mix(c, c * 0.8, rust), mix(c, c * 0.55, rust)], r: mix(0.38 + streak * 0.2, 0.85, rust), m: mix(0.55, 0.1, rust) };
  },
  asphalt(u, v) {
    const gravel = fbm(u, v, 128, 128, 3, 91), patch = fbm(u, v, 3, 3, 4, 92), crack = smooth(0.978, 0.995, 1 - Math.abs(fbm(u, v, 7, 7, 3, 93) * 2 - 1));
    const h = gravel * 0.7 - crack * 0.5;
    const c = 0.72 + gravel * 0.42 + patch * 0.12 - crack * 0.22;
    return { h, c: [c * 1.03, c, c * 0.96], r: 0.88 + gravel * 0.1 };
  },
  cloth(u, v) {
    const weave = Math.sin(u * Math.PI * 2 * 48) * Math.sin(v * Math.PI * 2 * 48), stripe = Math.floor(u * 8) % 2;
    const n = fbm(u, v, 8, 8, 3, 101);
    return { h: weave * 0.5 + 0.5, c: [0.75 + stripe * 0.25 + n * 0.1, 0.75 + stripe * 0.2 + n * 0.1, 0.75 + stripe * 0.15 + n * 0.1], r: 0.96 };
  },
  glass(u, v) {
    const grime = fbm(u, v, 5, 5, 4, 111);
    return { h: 0.5, c: [0.85 + grime * 0.15, 0.9 + grime * 0.1, 0.95], r: 0.06 + grime * 0.25 };
  },
  sandbag(u, v) {
    const [f1, f2] = worley(u, v, 5, 121), lump = smooth(0, 0.35, f2 - f1), weave = 0.5 + 0.5 * Math.sin((u + v) * Math.PI * 2 * 60), n = fbm(u, v, 24, 24, 3, 122);
    const c = 0.7 + n * 0.3 - (1 - lump) * 0.28;
    return { h: lump * 0.8 + weave * 0.1, c: [c * 1.02, c, c * 0.92], r: 0.98 };
  },
  foliage(u, v) { const n = fbm(u, v, 12, 12, 4, 131); return { h: n, c: [0.7 + n * 0.4, 0.8 + n * 0.3, 0.6], r: 0.85 }; },
  gunmetal(u, v) {
    const brushed = fbm(u, v, 2, 128, 3, 141), wear = smooth(0.62, 0.8, fbm(u, v, 9, 9, 4, 142)), speck = smooth(0.8, 0.95, fbm(u, v, 96, 96, 2, 143));
    const c = 0.32 + brushed * 0.1 + wear * 0.28 + speck * 0.12;
    return { h: 0.5 + brushed * 0.1, c: [c, c * 1.02, c * 1.06], r: 0.36 + wear * 0.3 + brushed * 0.1, m: 0.95 - wear * 0.25 };
  },
  polymer(u, v) {
    const stipple = fbm(u, v, 96, 96, 2, 151), n = fbm(u, v, 4, 4, 3, 152);
    return { h: stipple, c: [0.9 + stipple * 0.12, 0.9 + stipple * 0.12, 0.92 + n * 0.08], r: 0.55 + stipple * 0.25, m: 0.0 };
  },
  default(u, v) { const n = fbm(u, v, 6, 6, 4, 161); return { h: n, c: [0.85 + n * 0.2, 0.85 + n * 0.2, 0.85 + n * 0.2], r: 0.9 }; },
};

/** GLB material name -> recipe. Unknown names fall back to `default`. */
export function recipeFor(name) {
  const n = name.toLowerCase();
  if (n.includes('sand_ground') || n.includes('sand') && n.includes('ground') || n === 'dirt' || n === 'ground') return 'sand';
  if (n.includes('asphalt') || n.includes('road')) return 'asphalt';
  if (n.includes('container')) return 'container';
  if (n.includes('rust')) return 'rust';
  if (n.includes('brick')) return 'brick';
  if (n.includes('crate')) return 'crate';
  if (n.includes('wood')) return 'wood';
  if (n.includes('stone')) return 'stone';
  if (n.includes('concrete') || n.includes('cement')) return 'concrete';
  if (n.includes('plaster') || n.includes('wall') || n.includes('stucco')) return 'plaster';
  if (n.includes('metal') || n.includes('steel') || n.includes('iron')) return 'metal';
  if (n.includes('cloth') || n.includes('fabric') || n.includes('canvas')) return 'cloth';
  if (n.includes('window') || n.includes('glass')) return 'glass';
  if (n.includes('sandbag')) return 'sandbag';
  if (n.includes('foliage') || n.includes('leaf')) return 'foliage';
  return 'default';
}

const cache = new Map();
/** Bakes albedo / normal / ORM canvases for a recipe. Result textures are shared (never dispose per-material). */
export function textureSet(recipe, { size = 512, anisotropy = 8, normalStrength = 2.4 } = {}) {
  const key = `${recipe}:${size}`;
  if (cache.has(key)) return cache.get(key);
  const fn = RECIPES[recipe] || RECIPES.default;
  const height = new Float32Array(size * size), albedo = new ImageData(size, size), orm = new ImageData(size, size), normal = new ImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const s = fn(x / size, y / size), i = y * size + x, o = i * 4;
    height[i] = s.h;
    albedo.data[o] = clamp01(s.c[0]) * 255; albedo.data[o + 1] = clamp01(s.c[1]) * 255; albedo.data[o + 2] = clamp01(s.c[2]) * 255; albedo.data[o + 3] = 255;
    orm.data[o] = 255; orm.data[o + 1] = clamp01(s.r) * 255; orm.data[o + 2] = clamp01(s.m ?? 1) * 255; orm.data[o + 3] = 255;
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const l = height[y * size + mod(x - 1, size)], r = height[y * size + mod(x + 1, size)], d = height[mod(y - 1, size) * size + x], t = height[mod(y + 1, size) * size + x];
    let nx = (l - r) * normalStrength, ny = (t - d) * normalStrength; const nz = 1, len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; const o = (y * size + x) * 4;
    normal.data[o] = (nx * 0.5 + 0.5) * 255; normal.data[o + 1] = (ny * 0.5 + 0.5) * 255; normal.data[o + 2] = (nz / len * 0.5 + 0.5) * 255; normal.data[o + 3] = 255;
  }
  const make = (data, srgb) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    canvas.getContext('2d').putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = anisotropy; tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
    return tex;
  };
  const set = { map: make(albedo, true), normalMap: make(normal, false), ormMap: make(orm, false), metalTexture: recipe === 'metal' || recipe === 'rust' || recipe === 'container' || recipe === 'gunmetal' };
  cache.set(key, set);
  return set;
}

/** Applies a procedural PBR set to a MeshStandardMaterial (tint colour / factors from the GLB are kept). */
export function applyPBR(material, recipe, opts = {}) {
  const set = textureSet(recipe, opts);
  material.map = set.map; material.normalMap = set.normalMap; material.roughnessMap = set.ormMap;
  material.metalnessMap = set.metalTexture ? set.ormMap : null;
  material.normalScale = new THREE.Vector2(opts.normalScale ?? 1, opts.normalScale ?? 1);
  if (recipe === 'glass') { material.roughness = 1; material.metalness = 0.1; }
  if (recipe === 'sand' || recipe === 'asphalt') { material.envMapIntensity = 0.6; }
  material.needsUpdate = true;
  return material;
}

export function clearTextureCache() { for (const s of cache.values()) for (const k of ['map', 'normalMap', 'ormMap']) s[k].dispose(); cache.clear(); }
