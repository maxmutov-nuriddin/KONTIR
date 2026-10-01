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
  /** Desert ground: fine grain, low wind ripples, scattered pebbles and grit, faint damp / trodden patches. */
  sand(u, v) {
    const ripple = fbm(u, v, 9, 4, 3, 4), grain = fbm(u, v, 192, 192, 2, 6), tone = fbm(u, v, 3, 3, 4, 7), trod = fbm(u, v, 6, 6, 3, 8);
    const [p1, p2] = worley(u, v, 26, 5), pebble = smooth(0.12, 0.02, p1) * smooth(0.55, 0.75, hash(Math.floor(p2 * 503), 7, 9));
    const grit = smooth(0.78, 0.9, fbm(u, v, 128, 128, 2, 10));
    const h = ripple * 0.35 + grain * 0.25 + pebble * 0.9 + grit * 0.15;
    const c = 0.84 + (tone - 0.5) * 0.16 + (grain - 0.5) * 0.1 - (trod - 0.5) * 0.08 - pebble * 0.22 + grit * 0.05;
    return { h, c: [c * 1.02, c, c * 0.93], r: 0.92 + grain * 0.06 - pebble * 0.1 };
  },
  /** Lime / cement stucco: sponge-float grain, soft mottling, a few hairline cracks and patched repairs. */
  plaster(u, v) {
    const mott = fbm(u, v, 5, 5, 4, 11), grain = fbm(u, v, 160, 160, 2, 12), sponge = fbm(u, v, 48, 48, 2, 16);
    const crack = smooth(0.988, 0.997, 1 - Math.abs(fbm(u, v, 6, 6, 4, 13) * 2 - 1)) * smooth(0.45, 0.6, fbm(u, v, 3, 3, 2, 17));
    const patch = smooth(0.66, 0.7, fbm(u, v, 4, 4, 2, 15)), streak = fbm(u, v, 18, 1, 3, 14);
    const h = sponge * 0.3 + grain * 0.2 + mott * 0.15 - crack * 0.6 + patch * 0.08;
    const c = 0.9 + (mott - 0.5) * 0.1 + (grain - 0.5) * 0.06 + (sponge - 0.5) * 0.05 - crack * 0.18 - (streak - 0.5) * 0.04 + patch * 0.035;
    return { h, c: [c, c * 0.99, c * 0.97], r: 0.88 + grain * 0.08 };
  },
  /** Cast concrete: formwork panel seams with tie holes, fine aggregate, pores and water staining. */
  concrete(u, v) {
    const pore = smooth(0.74, 0.82, fbm(u, v, 64, 64, 2, 21)), mott = fbm(u, v, 4, 4, 4, 22), grain = fbm(u, v, 192, 192, 2, 23);
    const pu = mod(u * 2, 1), pv = mod(v * 2, 1);
    const seam = Math.max(1 - smooth(0, 0.006, Math.min(pu, 1 - pu)), 1 - smooth(0, 0.006, Math.min(pv, 1 - pv)));
    const tie = smooth(0.012, 0.006, Math.hypot(mod(u * 4, 1) - 0.5, mod(v * 4, 1) - 0.5)) * (1 - seam);
    const stain = fbm(u, v, 12, 2, 3, 24);
    const h = mott * 0.25 + grain * 0.2 - pore * 0.35 - seam * 0.5 - tie * 0.8;
    const c = 0.86 + (mott - 0.5) * 0.14 + (grain - 0.5) * 0.08 - pore * 0.12 - seam * 0.16 - tie * 0.35 - (stain - 0.5) * 0.06;
    return { h, c: [c, c, c * 1.01], r: 0.86 + grain * 0.1 };
  },
  /** Random rubble masonry: rounded stones of varied tint and size bedded in recessed light mortar. */
  stone(u, v) {
    const [f1, f2] = worley(u, v, 12, 31), joint = 1 - smooth(0.02, 0.09, f2 - f1), id = hash(Math.floor(f2 * 911), Math.floor(f1 * 97), 32);
    const grain = fbm(u, v, 128, 128, 3, 33), mott = fbm(u, v, 6, 6, 3, 34), bulge = Math.max(0, 1 - f1 * 1.4);
    const stoneC = 0.6 + id * 0.3 + (grain - 0.5) * 0.14 + (mott - 0.5) * 0.08;
    const mortarC = 0.74 + (grain - 0.5) * 0.08;
    const h = (1 - joint) * (0.5 + bulge * 0.4 + grain * 0.1) + joint * grain * 0.1;
    const c = mix(stoneC, mortarC, joint);
    const warm = 0.96 + id * 0.08;
    return { h, c: [c * warm * 1.02, c, c * (0.94 - (warm - 1))], r: mix(0.84 + grain * 0.1, 0.97, joint) };
  },
  /** Cut stone paving: staggered rectangular slabs with worn rounded edges, tint per slab, grit in the joints. */
  paving(u, v) {
    const rows = 8, ry = v * rows, row = Math.floor(ry), fy = ry - row, cols = 5, rx = u * cols + (row % 2) * 0.5, col = Math.floor(rx), fx = rx - col;
    const edge = Math.min(Math.min(fx, 1 - fx) * 0.75, Math.min(fy, 1 - fy));
    const joint = 1 - smooth(0.0, 0.025, edge), bevel = smooth(0.025, 0.07, edge);
    const id = hash(mod(col, cols), mod(row, rows), 191), grain = fbm(u, v, 160, 160, 3, 192), wear = fbm(u, v, 8, 8, 3, 193), grime = fbm(u, v, 3, 3, 4, 195);
    const chip = smooth(0.8, 0.86, fbm(u, v, 24, 24, 2, 194)) * (1 - bevel);
    const h = (1 - joint) * (0.55 + bevel * 0.35 + grain * 0.1) - chip * 0.3;
    const c = ((1 - joint) * (0.74 + id * 0.16 + (grain - 0.5) * 0.12 + (wear - 0.5) * 0.08 - chip * 0.08) + joint * 0.46) * (1 - (grime - 0.5) * 0.18);
    return { h, c: [c * 1.02, c, c * 0.95], r: 0.86 + grain * 0.08 + joint * 0.06 };
  },
  /** Corrugated steel cladding: trapezoidal vertical ribs, painted, light rust runs below fixings. */
  cladding(u, v) {
    const n = 20, t = mod(u * n, 1), rib = smooth(0.08, 0.2, t) * (1 - smooth(0.5, 0.62, t));
    const facet = t < 0.2 ? 0.88 : t < 0.5 ? 1.0 : t < 0.62 ? 0.84 : 0.94;
    const runs = smooth(0.62, 0.8, fbm(u, v, 40, 2, 3, 201)) * fbm(u, v, 6, 6, 2, 202), dirt = fbm(u, v, 4, 4, 4, 203), scratch = smooth(0.9, 0.97, fbm(u, v, 8, 128, 2, 204));
    const h = rib * 0.9 + runs * 0.05;
    const c = (0.78 + (dirt - 0.5) * 0.14 - scratch * 0.1) * facet * (1 - runs * 0.25);
    return { h, c: [mix(c, c * 1.3, runs), mix(c, c * 0.9, runs), mix(c, c * 0.7, runs)], r: 0.56 + dirt * 0.2 + runs * 0.2, m: 0.3 - runs * 0.2 };
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
    const ring = fbm(u * 3 + plank * 0.37, v, 6, 1, 3, 53) * 14 + warp;          // periodic in v: no tile seam
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
    const brushed = fbm(u, v, 3, 96, 3, 61), scratch = smooth(0.9, 0.97, fbm(u, v, 5, 128, 2, 62)), dent = fbm(u, v, 5, 5, 4, 63), grime = fbm(u, v, 6, 6, 3, 64);
    const h = dent * 0.25 + brushed * 0.06 - scratch * 0.1;
    const c = 0.66 + brushed * 0.08 - scratch * 0.12 + (dent - 0.5) * 0.06 - (grime - 0.5) * 0.12;
    return { h, c: [c, c * 1.01, c * 1.02], r: 0.4 + brushed * 0.12 + grime * 0.2 + scratch * 0.1, m: 0.88 - scratch * 0.15 };
  },
  rust(u, v) {
    const base = RECIPES.metal(u, v), rust = smooth(0.42, 0.62, fbm(u, v, 5, 5, 5, 71)), flake = fbm(u, v, 40, 40, 3, 72);
    const c = mix(0.7, 0.42 + flake * 0.3, rust);
    return { h: base.h + rust * (0.3 + flake * 0.3), c: [mix(c, c * 1.45, rust), mix(c, c * 0.85, rust), mix(c, c * 0.6, rust)], r: mix(base.r, 0.85, rust), m: mix(0.9, 0.15, rust) };
  },
  container(u, v) {
    // ISO container corrugation pitch is ~27 cm (11 ribs over a 3 m UV tile); finer ribs alias into white specular stripes
    const n = 11, ridge = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * n);
    const edgeShade = 0.5 + 0.5 * Math.sin(u * Math.PI * 2 * n + 0.6);
    const wear = smooth(0.5, 0.75, fbm(u, v, 4, 4, 5, 81)), streak = fbm(u, v, 48, 2, 3, 82), scratch = smooth(0.88, 0.96, fbm(u, v, 6, 96, 2, 83));
    const rust = wear * smooth(0.45, 0.7, fbm(u, v, 10, 10, 4, 84)) * 0.9;
    const h = ridge * 0.7 + rust * 0.3;
    const c = (0.78 + edgeShade * 0.14 - streak * 0.14 - scratch * 0.2) * (1 - rust * 0.3);
    // painted steel: the paint is a dielectric (low metalness, satin roughness) — glossy metal ridges mirrored the sky as white stripes
    return { h, c: [mix(c, c * 1.4, rust), mix(c, c * 0.8, rust), mix(c, c * 0.55, rust)], r: mix(0.58 + streak * 0.16, 0.88, rust), m: mix(0.18, 0.08, rust) };
  },
  /** Weathered asphalt: dense fine aggregate, a few larger stones, glossy tar patches, sparse thin cracks. */
  asphalt(u, v) {
    const gravel = fbm(u, v, 192, 192, 2, 91), patch = fbm(u, v, 3, 3, 4, 92), crack = smooth(0.988, 0.997, 1 - Math.abs(fbm(u, v, 5, 5, 4, 93) * 2 - 1));
    const [s1] = worley(u, v, 40, 94), stone = smooth(0.18, 0.06, s1) * smooth(0.6, 0.8, fbm(u, v, 40, 40, 1, 95));
    const tar = smooth(0.62, 0.7, fbm(u, v, 4, 4, 3, 96));
    const h = gravel * 0.5 + stone * 0.5 - crack * 0.6 - tar * 0.1;
    const c = 0.78 + (gravel - 0.5) * 0.32 + (patch - 0.5) * 0.12 + stone * 0.2 - crack * 0.3 - tar * 0.22;
    // tar sealing is darker and only slightly smoother (a low roughness here mirrors the sky like a puddle)
    return { h, c: [c * 1.02, c, c * 0.97], r: 0.9 + gravel * 0.08 - tar * 0.12 };
  },
  cloth(u, v) {
    const weave = Math.sin(u * Math.PI * 2 * 48) * Math.sin(v * Math.PI * 2 * 48), stripe = Math.floor(u * 8) % 2;
    const n = fbm(u, v, 8, 8, 3, 101);
    return { h: weave * 0.5 + 0.5, c: [0.75 + stripe * 0.25 + n * 0.1, 0.75 + stripe * 0.2 + n * 0.1, 0.75 + stripe * 0.15 + n * 0.1], r: 0.96 };
  },
  /** Military ripstop: fine plain weave, a reinforcing grid every ~6 mm and faint fibre noise. Near-white albedo so
   *  vertex colours / camo carry the hue; used by the operators' uniforms and nylon gear. */
  ripstop(u, v) {
    const n = 64, wu = u * n, wv = v * n, cu = mod(wu, 1), cv = mod(wv, 1);
    const over = (Math.floor(wu) + Math.floor(wv)) % 2 === 0;
    const warp = Math.sin(cu * Math.PI), weft = Math.sin(cv * Math.PI);
    const yarn = over ? warp * (0.55 + 0.45 * weft) : weft * (0.55 + 0.45 * warp);
    const grid = Math.max(1 - smooth(0, 0.18, Math.min(mod(u * 8, 1), 1 - mod(u * 8, 1)) * 8), 1 - smooth(0, 0.18, Math.min(mod(v * 8, 1), 1 - mod(v * 8, 1)) * 8));
    const fibre = fbm(u, v, 32, 32, 2, 191), wear = fbm(u, v, 4, 4, 3, 192);
    const h = yarn * 0.55 + grid * 0.35 + fibre * 0.1;
    const c = 0.86 + yarn * 0.08 + grid * 0.03 + (fibre - 0.5) * 0.08 + (wear - 0.5) * 0.08;
    return { h, c: [c, c, c], r: 0.86 + fibre * 0.1 };
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
  /** Blued / parkerized steel: fine brushing, small edge-wear flecks (not blotches), slight roughness variation. */
  gunmetal(u, v) {
    const brushed = fbm(u, v, 2, 128, 3, 141), wear = smooth(0.74, 0.86, fbm(u, v, 22, 22, 3, 142)), speck = smooth(0.84, 0.96, fbm(u, v, 96, 96, 2, 143));
    const c = 0.34 + brushed * 0.08 + wear * 0.1 + speck * 0.05;
    return { h: 0.5 + brushed * 0.08, c: [c, c * 1.0, c * 1.02], r: 0.42 + wear * 0.14 + brushed * 0.08, m: 0.95 - wear * 0.1 };
  },
  polymer(u, v) {
    const stipple = fbm(u, v, 96, 96, 2, 151), n = fbm(u, v, 4, 4, 3, 152);
    return { h: stipple, c: [0.9 + stipple * 0.12, 0.9 + stipple * 0.12, 0.92 + n * 0.08], r: 0.55 + stipple * 0.25, m: 0.0 };
  },
  /** Lacquered walnut for stocks / handguards: long fine grain along the part, darker pores, subtle figure; no planks. */
  gunwood(u, v) {
    const figure = fbm(u, v, 2, 6, 3, 171), grain = fbm(u, v + figure * 0.08, 4, 90, 3, 172), pores = smooth(0.72, 0.9, fbm(u, v, 12, 180, 2, 173));
    const c = 0.62 + grain * 0.32 + figure * 0.12 - pores * 0.22;
    return { h: grain * 0.3 - pores * 0.4, c: [c * 1.0, c * 0.72, c * 0.46], r: 0.42 + pores * 0.3 + grain * 0.08, m: 0 };
  },
  /** Fine-textured matte polymer: very low-amplitude stipple (no aliasing noise), faint moulding variation. */
  gunpolymer(u, v) {
    const stipple = fbm(u, v, 32, 32, 2, 181), n = fbm(u, v, 3, 3, 3, 182);
    return { h: stipple * 0.25, c: [0.92 + n * 0.08, 0.92 + n * 0.08, 0.93 + n * 0.08], r: 0.62 + stipple * 0.12 + n * 0.06, m: 0 };
  },
  default(u, v) { const n = fbm(u, v, 6, 6, 4, 161); return { h: n, c: [0.85 + n * 0.2, 0.85 + n * 0.2, 0.85 + n * 0.2], r: 0.9 }; },
};

/** GLB material name -> recipe. Unknown names fall back to `default`. */
export function recipeFor(name) {
  const n = name.toLowerCase();
  if (n.includes('sand_ground') || n.includes('sand_raised') || n.includes('sand') && n.includes('ground') || n === 'dirt' || n === 'ground') return 'sand';
  if (n.includes('asphalt') || n.includes('road')) return 'asphalt';
  if (n.includes('container')) return 'container';
  if (n.includes('metal_wall') || n.includes('cladding')) return 'cladding';
  if (n.includes('floor') || n.includes('paving')) return 'paving';
  if (n.includes('rubble')) return 'stone';
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
export function textureSet(recipe, { size = 256, anisotropy = 8, normalStrength = 2.4 } = {}) {
  const key = `${recipe}:${size}:${normalStrength}`;
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
    // finite differences shrink with resolution: scale so a 512 px set has the same relief as a 256 px one
    const k = normalStrength * size / 256;
    let nx = (l - r) * k, ny = (t - d) * k; const nz = 1, len = Math.hypot(nx, ny, nz);
    nx /= len; ny /= len; const o = (y * size + x) * 4;
    normal.data[o] = (nx * 0.5 + 0.5) * 255; normal.data[o + 1] = (ny * 0.5 + 0.5) * 255; normal.data[o + 2] = (nz / len * 0.5 + 0.5) * 255; normal.data[o + 3] = 255;
  }
  const make = (data, srgb) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    canvas.getContext('2d').putImageData(data, 0, 0);
    const tex = new THREE.CanvasTexture(canvas); tex.userData.shared = true;
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
