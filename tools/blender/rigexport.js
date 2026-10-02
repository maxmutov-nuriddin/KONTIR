// Browser-side helper (loaded through the Vite dev server by tools/blender/export-rigs.mjs): builds a procedural weapon rig
// exactly as the game does and returns it as GLB bytes, with material names (darkMetal, wood, ...) and moving parts named
// (mag, bolt, slide, pump, cylinder) so the Blender pass can re-material, bake and keep them animatable.
import * as THREE from 'three';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { buildWeaponRig, weaponMaterials, RIG_IDS } from '../../client/src/viewmodels.js';
import { models } from '../../client/src/models.js';

export const ids = RIG_IDS;
export async function exportRig(id) {
  models.manifest.weapons = {};                           // always the procedural rig, never an earlier baked GLB
  const M = weaponMaterials();
  const names = new Map(Object.entries(M).map(([k, m]) => [m, k]));
  const rig = buildWeaponRig(id);
  for (const [k, o] of Object.entries(rig.parts || {})) o.name = k;
  const plain = new Map();
  rig.group.traverse(o => {
    if (!o.isMesh) return;
    const src = o.material;
    if (!plain.has(src)) plain.set(src, new THREE.MeshStandardMaterial({ name: names.get(src) || src.name || 'other', color: src.color?.clone(), roughness: src.roughness ?? 0.5, metalness: src.metalness ?? 0, transparent: !!src.transparent, opacity: src.opacity ?? 1 }));
    o.material = plain.get(src);
  });
  const buf = await new GLTFExporter().parseAsync(rig.group, { binary: true });
  let s = ''; const u8 = new Uint8Array(buf);
  for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
  return btoa(s);
}
