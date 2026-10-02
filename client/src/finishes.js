// Procedural weapon finishes ("skins"): painted patterns baked to canvas textures and applied as material variants
// on a rig's painted surfaces (receiver, polymer, furniture). Barrels, bolts, rubber and glass keep their base look.
import * as THREE from 'three';

export const FINISHES = {
  standard: { name: 'Standart' },
  desert: { name: 'Cho‘l kamuflyaji', pattern: 'camo', colors: ['#b39b6e', '#8a7449', '#d4c29a', '#6b5a3a'] },
  forest: { name: 'O‘rmon', pattern: 'camo', colors: ['#4a5a36', '#2f3a24', '#6d7550', '#1f2418'] },
  urban: { name: 'Shahar', pattern: 'digital', colors: ['#6d7277', '#3d4145', '#a3a8ac', '#25282b'] },
  arctic: { name: 'Arktika', pattern: 'digital', colors: ['#dfe5e8', '#b3bcc2', '#8f9aa1', '#f4f7f8'] },
  tiger: { name: 'Yo‘lbars', pattern: 'tiger', colors: ['#d98a2b', '#1a1512'] },
  crimson: { name: 'Qirmizi to‘r', pattern: 'web', colors: ['#7a1414', '#140a0a'] },
  cobalt: { name: 'Kobalt anodlash', pattern: 'solid', colors: ['#1f4fa8'], metal: 0.85, rough: 0.28 },
  emerald: { name: 'Zumrad anodlash', pattern: 'solid', colors: ['#1c7a4a'], metal: 0.85, rough: 0.28 },
  fade: { name: 'Fade', pattern: 'fade', colors: ['#f2c14e', '#e0457b', '#5b3fd6'], metal: 0.9, rough: 0.22 },
  carbon: { name: 'Karbon tola', pattern: 'carbon', colors: ['#1a1b1d', '#34373b'], rough: 0.35 },
  gold: { name: 'Oltin', pattern: 'solid', colors: ['#d4a73a'], metal: 1, rough: 0.2 },
  ruby: { name: 'Yoqut', pattern: 'fade', colors: ['#5a0610', '#c4142c', '#ff4d5e', '#7a0a18'], metal: 0.95, rough: 0.16 },
  sapphire: { name: 'Safir', pattern: 'fade', colors: ['#06205a', '#1450c4', '#4da3ff', '#0a2a7a'], metal: 0.95, rough: 0.16 },
  vanilla: { name: 'Vanilla' },                                                   // knives only: bare steel, no paint
  sand_dune: { name: 'Qum barxan', pattern: 'stripes', colors: ['#c8b07e', '#a88f5e', '#e0cc9e'] },
  safari_mesh: { name: 'Safari to‘ri', pattern: 'hex', colors: ['#8a7a58', '#5e5238'] },
  boreal: { name: 'Shimol o‘rmoni', pattern: 'camo', colors: ['#5a5236', '#3a4a2c', '#7a6a48', '#2a2a1e'] },
  night_ops: { name: 'Tungi amaliyot', pattern: 'digital', colors: ['#24272c', '#14161a', '#3a3e46', '#0c0d10'] },
  storm: { name: 'Bo‘ron', pattern: 'marble', colors: ['#5c646c', '#9aa2aa', '#2e3338'] },
  tide: { name: 'To‘lqin', pattern: 'wave', colors: ['#1a4a6a', '#2f7fa8', '#9fd6ef'] },
  neon_grid: { name: 'Neon to‘r', pattern: 'circuit', colors: ['#0b1418', '#19e0d0'], rough: 0.4 },
  lime: { name: 'Laym anodlash', pattern: 'solid', colors: ['#6fbf2a'], metal: 0.85, rough: 0.28 },
  zebra: { name: 'Zebra', pattern: 'zigzag', colors: ['#e8e8e8', '#141414'] },
  copper: { name: 'Mis', pattern: 'solid', colors: ['#b8673a'], metal: 1, rough: 0.3 },
  hex_red: { name: 'Qizil asal ari', pattern: 'hex', colors: ['#8a1c1c', '#1a0a0a'] },
  cyber: { name: 'Kiber', pattern: 'circuit', colors: ['#1a0c2a', '#c040ff'], rough: 0.35 },
  jade: { name: 'Nefrit marmar', pattern: 'marble', colors: ['#1f6a4e', '#7fd6a8', '#0e3a28'], metal: 0.3, rough: 0.25 },
  pop_dots: { name: 'Pop-art', pattern: 'dots', colors: ['#f2d02a', '#e0306a', '#1a1a1a'] },
  damascus: { name: 'Damashq po‘lati', pattern: 'damascus', colors: ['#5e646a', '#b8bec4', '#2a2e32'], metal: 1, rough: 0.25 },
  splatter: { name: 'Bo‘yoq sachrami', pattern: 'splatter', colors: ['#1c1c1c', '#e04a2a', '#f2c14e', '#2ab0e0'] },
  doppler: { name: 'Doppler', pattern: 'doppler', colors: ['#2a0a3a', '#c02a8a', '#ff7ad0', '#5a1a7a'], metal: 0.95, rough: 0.14 },
  aqua_wave: { name: 'Akva', pattern: 'wave', colors: ['#06303a', '#10a8b8', '#a8f2f0'], metal: 0.7, rough: 0.22 },
  emerald_doppler: { name: 'Zumrad Doppler', pattern: 'doppler', colors: ['#022a12', '#0a9a4a', '#6af0a0', '#05401e'], metal: 0.95, rough: 0.12 },
  gold_damascus: { name: 'Oltin Damashq', pattern: 'damascus', colors: ['#8a6a20', '#f2d27a', '#4a3410'], metal: 1, rough: 0.2 },
  inferno: { name: 'Do‘zax olovi', pattern: 'splatter', colors: ['#2a0602', '#e83a0a', '#ffb02a', '#ff5a1a'], rough: 0.3 },
  galaxy: { name: 'Galaktika', pattern: 'dots', colors: ['#0a0620', '#5a2ab0', '#e8e0ff'], metal: 0.6, rough: 0.2 },
};

const painted = new Set(['darkMetal', 'blackSteel', 'polymer', 'olivePoly', 'tanPoly', 'silver', 'wood', 'blade']);
const texCache = new Map(), matCache = new Map();

function paint(id) {
  if (texCache.has(id)) return texCache.get(id);
  const f = FINISHES[id], c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d'), col = f.colors;
  let seed = [...id].reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) >>> 0;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  // every shape is drawn at 9 offsets so the texture tiles seamlessly
  const wrap = draw => { for (const dx of [-512, 0, 512]) for (const dy of [-512, 0, 512]) { g.save(); g.translate(dx, dy); draw(); g.restore(); } };
  g.fillStyle = col[0]; g.fillRect(0, 0, 512, 512);
  if (f.pattern === 'camo') for (let layer = 1; layer < col.length; layer++) for (let i = 0; i < 26; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 30 + rnd() * 70, pts = Array.from({ length: 9 }, (_, k) => { const a = k / 9 * Math.PI * 2, rr = r * (0.6 + rnd() * 0.6); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr * 0.7]; });
    g.fillStyle = col[layer]; wrap(() => { g.beginPath(); pts.forEach(([px, py], k) => (k ? g.lineTo(px, py) : g.moveTo(px, py))); g.closePath(); g.fill(); });
  } else if (f.pattern === 'digital') for (let i = 0; i < 900; i++) {
    const s = 16 * (1 + Math.floor(rnd() * 3)), x = Math.floor(rnd() * 32) * 16, y = Math.floor(rnd() * 32) * 16;
    g.fillStyle = col[1 + Math.floor(rnd() * (col.length - 1))]; wrap(() => g.fillRect(x, y, s, s));
  } else if (f.pattern === 'tiger') for (let i = 0; i < 22; i++) {
    const y = rnd() * 512, w = 6 + rnd() * 18;
    g.fillStyle = col[1]; wrap(() => { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + Math.sin(x * 0.03 + i) * 22 + (rnd() - 0.5) * 10); for (let x = 512; x >= 0; x -= 32) g.lineTo(x, y + w + Math.sin(x * 0.03 + i) * 22); g.closePath(); g.fill(); });
  } else if (f.pattern === 'web') {
    g.strokeStyle = col[1]; g.lineWidth = 4;
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; wrap(() => { g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(a) * 400, 256 + Math.sin(a) * 400); g.stroke(); }); }
    for (let r = 30; r < 380; r += 42) wrap(() => { g.beginPath(); for (let i = 0; i <= 16; i++) { const a = i / 16 * Math.PI * 2, rr = r * (i % 2 ? 0.88 : 1); g.lineTo(256 + Math.cos(a) * rr, 256 + Math.sin(a) * rr); } g.stroke(); });
  } else if (f.pattern === 'fade') {
    const gr = g.createLinearGradient(0, 0, 512, 512); col.forEach((cc, i) => gr.addColorStop(i / (col.length - 1), cc)); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
  } else if (f.pattern === 'stripes') for (let i = 0; i < 14; i++) {
    const y = rnd() * 512, h = 8 + rnd() * 30;
    g.fillStyle = col[1 + (i % (col.length - 1))]; wrap(() => { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 512; x += 16) g.lineTo(x, y + Math.sin(x / 512 * Math.PI * 2 * 2 + i) * 14); for (let x = 512; x >= 0; x -= 16) g.lineTo(x, y + h + Math.sin(x / 512 * Math.PI * 2 * 2 + i) * 14); g.closePath(); g.fill(); });
  } else if (f.pattern === 'hex') {
    const r = 22, w = r * Math.sqrt(3); g.strokeStyle = col[1]; g.lineWidth = 3.5;
    for (let row = -1; row < 512 / (r * 1.5) + 1; row++) for (let c = -1; c < 512 / w + 1; c++) {
      const cx = c * w + (row % 2 ? w / 2 : 0), cy = row * r * 1.5;
      g.beginPath(); for (let k = 0; k <= 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); } g.stroke();
    }
  } else if (f.pattern === 'marble') {
    for (let i = 0; i < 70; i++) {
      const x0 = rnd() * 512, y0 = rnd() * 512; g.strokeStyle = col[1 + (i % (col.length - 1))]; g.globalAlpha = 0.25 + rnd() * 0.5; g.lineWidth = 1 + rnd() * 5;
      wrap(() => { g.beginPath(); g.moveTo(x0, y0); let x = x0, y = y0; for (let k = 0; k < 18; k++) { x += (rnd() - 0.3) * 40; y += (rnd() - 0.5) * 40; g.lineTo(x, y); } g.stroke(); });
    }
    g.globalAlpha = 1;
  } else if (f.pattern === 'wave') for (let i = 0; i < 26; i++) {
    const y = i * 20; g.strokeStyle = col[1 + (i % (col.length - 1))]; g.lineWidth = 6 + (i % 3) * 3;
    wrap(() => { g.beginPath(); for (let x = 0; x <= 512; x += 8) g.lineTo(x, y + Math.sin(x / 512 * Math.PI * 2 * 3 + i * 0.7) * 12); g.stroke(); });
  } else if (f.pattern === 'circuit') {
    g.strokeStyle = col[1]; g.fillStyle = col[1]; g.lineWidth = 2.5;
    for (let i = 0; i < 90; i++) {
      let x = Math.floor(rnd() * 32) * 16, y = Math.floor(rnd() * 32) * 16;
      wrap(() => { g.beginPath(); g.moveTo(x, y); let px = x, py = y; for (let k = 0; k < 5; k++) { if (rnd() < 0.5) px += (rnd() < 0.5 ? -1 : 1) * 32; else py += (rnd() < 0.5 ? -1 : 1) * 32; g.lineTo(px, py); } g.stroke(); g.beginPath(); g.arc(px, py, 4, 0, Math.PI * 2); g.fill(); });
    }
  } else if (f.pattern === 'zigzag') for (let i = 0; i < 18; i++) {
    const y = i * 30 + rnd() * 10; g.fillStyle = col[1];
    wrap(() => { g.beginPath(); g.moveTo(0, y); for (let x = 0; x <= 512; x += 32) g.lineTo(x, y + ((x / 32) % 2 ? 14 : -6) + rnd() * 6); for (let x = 512; x >= 0; x -= 32) g.lineTo(x, y + 10 + ((x / 32) % 2 ? 14 : -6)); g.closePath(); g.fill(); });
  } else if (f.pattern === 'dots') for (let i = 0; i < 260; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 2 + rnd() * (col.length > 2 ? 10 : 6);
    g.fillStyle = col[1 + Math.floor(rnd() * (col.length - 1))]; g.globalAlpha = 0.6 + rnd() * 0.4; wrap(() => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
    g.globalAlpha = 1;
  } else if (f.pattern === 'damascus') for (let i = 0; i < 60; i++) {
    const y = i * 9; g.strokeStyle = col[1 + (i % (col.length - 1))]; g.lineWidth = 2 + (i % 4);
    wrap(() => { g.beginPath(); for (let x = 0; x <= 512; x += 6) g.lineTo(x, y + Math.sin(x / 512 * Math.PI * 2 * 2 + i * 0.35) * 22 + Math.sin(x / 512 * Math.PI * 2 * 7 + i) * 5); g.stroke(); });
  } else if (f.pattern === 'splatter') for (let i = 0; i < 120; i++) {
    const x = rnd() * 512, y = rnd() * 512, r = 4 + rnd() * 26; g.fillStyle = col[1 + Math.floor(rnd() * (col.length - 1))];
    wrap(() => { g.beginPath(); for (let k = 0; k < 11; k++) { const a = k / 11 * Math.PI * 2, rr = r * (0.5 + rnd() * 0.8); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } g.closePath(); g.fill();
      for (let k = 0; k < 4; k++) { g.beginPath(); g.arc(x + (rnd() - 0.5) * r * 3, y + (rnd() - 0.5) * r * 3, 1 + rnd() * 3, 0, Math.PI * 2); g.fill(); } });
  } else if (f.pattern === 'doppler') {
    const gr = g.createLinearGradient(0, 0, 512, 512); col.forEach((cc, i) => gr.addColorStop(i / (col.length - 1), cc)); g.fillStyle = gr; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 160; i++) { const x = rnd() * 512, y = rnd() * 512, r = 6 + rnd() * 40; g.fillStyle = col[Math.floor(rnd() * col.length)]; g.globalAlpha = 0.18 + rnd() * 0.3; wrap(() => { g.beginPath(); g.ellipse(x, y, r, r * (0.3 + rnd() * 0.6), rnd() * Math.PI, 0, Math.PI * 2); g.fill(); }); }
    g.globalAlpha = 1;
  } else if (f.pattern === 'carbon') for (let y = 0; y < 512; y += 16) for (let x = 0; x < 512; x += 16) {
    const lit = ((x + y) / 16) % 2 === 0, gr = lit ? g.createLinearGradient(x, y, x + 16, y) : g.createLinearGradient(x, y, x, y + 16);
    gr.addColorStop(0, col[0]); gr.addColorStop(0.5, col[1]); gr.addColorStop(1, col[0]); g.fillStyle = gr; g.fillRect(x, y, 16, 16);
  }
  // fine grain so flat colours still read as paint, not plastic
  const img = g.getImageData(0, 0, 512, 512), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (rnd() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.userData.shared = true;
  tex.repeat.set(0.35, 0.35);
  texCache.set(id, tex);
  return tex;
}

/** Painted texture with wear: chipped flakes and scratches that expose bare steel, more of them the higher the float. */
const WEAR_STEPS = [0, 0.1, 0.25, 0.42, 0.7];               // FN, MW, FT, WW, BS (texture is cached per step)
const wearStep = w => WEAR_STEPS.reduce((best, v, i) => (w >= v ? i : best), 0);
function wornPaint(id, step) {
  const key = `${id}:w${step}`; if (texCache.has(key)) return texCache.get(key);
  const clean = paint(id); if (!step) return clean;
  const src = clean.image, c = document.createElement('canvas'); c.width = c.height = 512; const g = c.getContext('2d');
  g.drawImage(src, 0, 0);
  let seed = 9001 + step * 131; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const amount = WEAR_STEPS[step];
  g.fillStyle = '#5b5f63'; g.strokeStyle = '#8d9296';
  for (let i = 0; i < 260 * amount; i++) {                    // paint flakes
    const x = rnd() * 512, y = rnd() * 512, r = 2 + rnd() * 9 * amount * 2;
    g.globalAlpha = 0.65 + rnd() * 0.35; g.beginPath();
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (0.5 + rnd()); g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.closePath(); g.fill();
  }
  g.lineWidth = 0.8;
  for (let i = 0; i < 500 * amount; i++) {                    // fine scratches
    const x = rnd() * 512, y = rnd() * 512, a = rnd() * Math.PI, l = 6 + rnd() * 40;
    g.globalAlpha = 0.25 + rnd() * 0.45; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8; tex.userData.shared = true;
  tex.repeat.copy(clean.repeat); texCache.set(key, tex); return tex;
}

/** Material variant of `base` painted with finish `id` at wear `wear` (cached, shared). */
function finishMaterial(base, id, wear = 0) {
  const step = wearStep(wear), key = `${id}:${step}:${base.uuid}`;
  if (matCache.has(key)) return matCache.get(key);
  const f = FINISHES[id];
  const m = new THREE.MeshPhysicalMaterial({ map: wornPaint(id, step), normalMap: base.normalMap, normalScale: base.normalScale, roughness: Math.min(1, (f.rough ?? 0.55) + step * 0.06), metalness: f.metal ?? 0.25, clearcoat: Math.max(0, 0.5 - step * 0.1), clearcoatRoughness: 0.35, envMapIntensity: 1 });
  m.userData.shared = true; m.userData.finish = id;
  matCache.set(key, m);
  return m;
}
/** Small square swatch of a finish (store / inventory thumbnails for gloves). */
const swatches = new Map(), swatchQueue = [];
function swatchNow(id, step) {
  const t = wornPaint(id, step), c = document.createElement('canvas'); c.width = c.height = 128;
  c.getContext('2d').drawImage(t.image, 0, 0, 128, 128); return c.toDataURL('image/jpeg', 0.85);
}
/** Swatch URL for a finish (glove thumbnails). Uncached ones return '' and are painted between frames; elements with
 *  data-swatch="id:step" get their background filled in when ready. */
export function finishSwatch(id, wear = 0) {
  const step = wearStep(wear), k = `${id}:${step}`;
  if (swatches.has(k)) return swatches.get(k);
  if (!swatchQueue.includes(k)) { swatchQueue.push(k); if (swatchQueue.length === 1) requestAnimationFrame(pumpSwatches); }
  return '';
}
export const swatchKey = (id, wear = 0) => `${id}:${wearStep(wear)}`;
function pumpSwatches() {
  const k = swatchQueue.shift(); if (!k) return;
  const [id, step] = k.split(':'); const url = swatchNow(id, Number(step)); swatches.set(k, url);
  for (const el of document.querySelectorAll(`[data-swatch="${k}"]`)) el.style.backgroundImage = `url(${url})`;
  if (swatchQueue.length) requestAnimationFrame(pumpSwatches);
}

/** Repaints a rig (first-person or third-person group) with a finish; 'standard' restores the base materials. */
export function applyFinish(root, id, baseMaterials, wear = 0) {
  const names = new Map(Object.entries(baseMaterials).map(([k, v]) => [v.uuid, k]));
  root.traverse(o => {
    if (!o.isMesh) return;
    o.userData.baseMaterial ??= o.material;
    const base = o.userData.baseMaterial, name = names.get(base.uuid);
    // procedural rigs: known painted materials; real models: materials named paint / body / receiver / frame / stock / furniture
    const paintable = painted.has(name) || /paint|body|receiver|frame|stock|furniture|skin/i.test(base.name || '');
    o.material = id && FINISHES[id]?.pattern && paintable ? finishMaterial(base, id, wear) : base;
  });
}

/** Glove skin: repaints every mesh of the first-person arms whose material is flagged `glove`. */
export function applyGloveFinish(arms, id, wear = 0) {
  arms.traverse(o => {
    if (!o.isMesh) return;
    o.userData.baseMaterial ??= o.material; const base = o.userData.baseMaterial;
    if (!base.userData?.glove) return;
    o.material = id && FINISHES[id]?.pattern ? finishMaterial(base, id, wear) : base;
  });
}
