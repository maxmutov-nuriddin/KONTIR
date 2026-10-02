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
};

const painted = new Set(['darkMetal', 'blackSteel', 'polymer', 'olivePoly', 'tanPoly', 'silver', 'wood']);
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
    o.material = id && id !== 'standard' && FINISHES[id] && paintable ? finishMaterial(base, id, wear) : base;
  });
}

/** Glove skin: repaints every mesh of the first-person arms whose material is flagged `glove`. */
export function applyGloveFinish(arms, id, wear = 0) {
  arms.traverse(o => {
    if (!o.isMesh) return;
    o.userData.baseMaterial ??= o.material; const base = o.userData.baseMaterial;
    if (!base.userData?.glove) return;
    o.material = id && id !== 'standard' && FINISHES[id] ? finishMaterial(base, id, wear) : base;
  });
}
