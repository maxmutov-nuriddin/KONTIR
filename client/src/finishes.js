// Procedural weapon finishes ("skins"): painted patterns baked to canvas textures and applied as material variants
// on a rig's painted surfaces (receiver, polymer, furniture). Barrels, bolts, rubber and glass keep their base look.
import * as THREE from 'three';

export const FINISHES = {
  standard: { name: 'Standart', price: 0 },
  desert: { name: 'Cho‘l kamuflyaji', price: 250, pattern: 'camo', colors: ['#b39b6e', '#8a7449', '#d4c29a', '#6b5a3a'] },
  forest: { name: 'O‘rmon', price: 250, pattern: 'camo', colors: ['#4a5a36', '#2f3a24', '#6d7550', '#1f2418'] },
  urban: { name: 'Shahar', price: 300, pattern: 'digital', colors: ['#6d7277', '#3d4145', '#a3a8ac', '#25282b'] },
  arctic: { name: 'Arktika', price: 350, pattern: 'digital', colors: ['#dfe5e8', '#b3bcc2', '#8f9aa1', '#f4f7f8'] },
  tiger: { name: 'Yo‘lbars', price: 600, pattern: 'tiger', colors: ['#d98a2b', '#1a1512'] },
  crimson: { name: 'Qirmizi to‘r', price: 800, pattern: 'web', colors: ['#7a1414', '#140a0a'] },
  cobalt: { name: 'Kobalt anodlash', price: 450, pattern: 'solid', colors: ['#1f4fa8'], metal: 0.85, rough: 0.28 },
  emerald: { name: 'Zumrad anodlash', price: 450, pattern: 'solid', colors: ['#1c7a4a'], metal: 0.85, rough: 0.28 },
  fade: { name: 'Fade', price: 1200, pattern: 'fade', colors: ['#f2c14e', '#e0457b', '#5b3fd6'], metal: 0.9, rough: 0.22 },
  carbon: { name: 'Karbon tola', price: 700, pattern: 'carbon', colors: ['#1a1b1d', '#34373b'], rough: 0.35 },
  gold: { name: 'Oltin', price: 2500, pattern: 'solid', colors: ['#d4a73a'], metal: 1, rough: 0.2 },
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

/** Material variant of `base` painted with finish `id` (cached, shared). */
function finishMaterial(base, id) {
  const key = `${id}:${base.uuid}`;
  if (matCache.has(key)) return matCache.get(key);
  const f = FINISHES[id];
  const m = new THREE.MeshPhysicalMaterial({ map: paint(id), normalMap: base.normalMap, normalScale: base.normalScale, roughness: f.rough ?? 0.55, metalness: f.metal ?? 0.25, clearcoat: 0.5, clearcoatRoughness: 0.35, envMapIntensity: 1 });
  m.userData.shared = true; m.userData.finish = id;
  matCache.set(key, m);
  return m;
}

/** Repaints a rig (first-person or third-person group) with a finish; 'standard' restores the base materials. */
export function applyFinish(root, id, baseMaterials) {
  const names = new Map(Object.entries(baseMaterials).map(([k, v]) => [v.uuid, k]));
  root.traverse(o => {
    if (!o.isMesh) return;
    o.userData.baseMaterial ??= o.material;
    const base = o.userData.baseMaterial, name = names.get(base.uuid);
    o.material = id && id !== 'standard' && FINISHES[id] && painted.has(name) ? finishMaterial(base, id) : base;
  });
}
