// Procedural, PBR-textured weapon rigs. Local space: +X right, +Y up, -Z toward the muzzle, origin near the grip.
// Each builder returns { group, muzzle, eject, parts, hands } so WeaponManager can animate slides / magazines
// and place the arms; characters.js reuses the same rigs in third person.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyPBR } from './materials.js';
import { mergeGeometries, toCreasedNormals } from 'three/addons/utils/BufferGeometryUtils.js';
import { models } from './models.js';
import { buildArms as makeArms, poseArms as placeArms } from './hands.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
let shared = null;

export function weaponMaterials() {
  if (shared) return shared;
  // Metals use MeshPhysicalMaterial with a thin clear coat (gun oil / bluing sheen); wood is lacquered; polymer is matte.
  const std = (o, recipe, extra) => { const m = new THREE.MeshStandardMaterial(o); if (recipe) applyPBR(m, recipe, { size: 512, ...extra }); return m; };
  const phys = (o, recipe, extra) => { const m = new THREE.MeshPhysicalMaterial(o); if (recipe) applyPBR(m, recipe, { size: 512, ...extra }); return m; };
  shared = {
    metal: phys({ color: 0x8e9398, metalness: 1, roughness: 0.9, clearcoat: 0.25, clearcoatRoughness: 0.4, envMapIntensity: 1.2 }, 'gunmetal', { normalScale: 0.35 }),
    darkMetal: phys({ color: 0x4b4f53, metalness: 1, roughness: 1, clearcoat: 0.35, clearcoatRoughness: 0.35, envMapIntensity: 1.15 }, 'gunmetal', { normalScale: 0.3 }),
    steel: phys({ color: 0xd9dde0, metalness: 1, roughness: 0.22, clearcoat: 0.2, clearcoatRoughness: 0.2, envMapIntensity: 1.3 }, null),
    silver: phys({ color: 0xbfc3c6, metalness: 1, roughness: 0.8, clearcoat: 0.3, clearcoatRoughness: 0.25, envMapIntensity: 1.25 }, 'gunmetal', { normalScale: 0.25 }),
    wood: phys({ color: 0x6a4026, roughness: 1, metalness: 0, clearcoat: 0.18, clearcoatRoughness: 0.5, envMapIntensity: 0.6 }, 'gunwood', { normalScale: 0.35 }),
    polymer: std({ color: 0x232426, roughness: 1, metalness: 0, envMapIntensity: 0.7 }, 'gunpolymer', { normalScale: 0.18 }),
    rubber: std({ color: 0x141516, roughness: 0.93, metalness: 0, envMapIntensity: 0.5 }, null),
    oliveMetal: phys({ color: 0x59613f, metalness: 0.5, roughness: 0.55, clearcoat: 0.2 }, null),
    grenadeGreen: phys({ color: 0x4a5a38, metalness: 0.3, roughness: 0.55, clearcoat: 0.4, clearcoatRoughness: 0.5 }, null),
    grenadeGrey: phys({ color: 0x8c9296, metalness: 0.75, roughness: 0.4, clearcoat: 0.3 }, null),
    smokeBody: phys({ color: 0x66726a, metalness: 0.5, roughness: 0.48, clearcoat: 0.3 }, null),
    accent: std({ color: 0xc9a24e, metalness: 0.85, roughness: 0.35 }, null),
    red: std({ color: 0xa02a22, metalness: 0.3, roughness: 0.5 }, null),
    c4: std({ color: 0x5a5f43, roughness: 0.75, metalness: 0.1 }, null),
    tape: std({ color: 0xc9c2a6, roughness: 0.9, metalness: 0 }, null),
    wire: std({ color: 0x9d2b25, roughness: 0.6, metalness: 0 }, null),
    olivePoly: std({ color: 0x3f4836, roughness: 1, metalness: 0, envMapIntensity: 0.7 }, 'gunpolymer', { normalScale: 0.18 }),
    tanPoly: std({ color: 0x7f7054, roughness: 1, metalness: 0, envMapIntensity: 0.7 }, 'gunpolymer', { normalScale: 0.18 }),
    blackSteel: phys({ color: 0x2c2f33, metalness: 1, roughness: 0.75, clearcoat: 0.4, clearcoatRoughness: 0.3, envMapIntensity: 1.2 }, 'gunmetal', { normalScale: 0.25 }),
    lens: new THREE.MeshPhysicalMaterial({ color: 0x1d3552, metalness: 0.1, roughness: 0.04, clearcoat: 1, emissive: 0x0a1a30, emissiveIntensity: 0.5 }),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x9fd2c0, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.42, clearcoat: 1 }),
    fuel: new THREE.MeshStandardMaterial({ color: 0xd8902a, roughness: 0.3, transparent: true, opacity: 0.85, emissive: 0x6a3a08, emissiveIntensity: 0.35 }),
    rag: std({ color: 0xb8ad90, roughness: 1, metalness: 0 }, null),
    flame: new THREE.MeshBasicMaterial({ color: 0xc8501a, transparent: true, opacity: 0.75, blending: THREE.AdditiveBlending, depthWrite: false }),
    decoyYellow: std({ color: 0xc8a52a, metalness: 0.4, roughness: 0.5 }, null),
    incRed: phys({ color: 0xa8321e, metalness: 0.45, roughness: 0.45, clearcoat: 0.4 }, null),
    wireBlue: std({ color: 0x24457a, roughness: 0.6, metalness: 0 }, null),
  };
  for (const m of Object.values(shared)) m.userData.shared = true;
  return shared;
}

/** Box-projected UVs (1 uv = `scale` metres) so world-space textures don't smear on procedural geometry. */
function project(geo, scale = 4) {
  geo.computeVertexNormals();
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
const box = (w, h, d, r = 0.002, uvScale = 4) => project(new RoundedBoxGeometry(w, h, d, 2, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), uvScale);
const cyl = (r, len, seg = 16, rTop = r) => project(new THREE.CylinderGeometry(rTop, r, len, seg, 1), 6).rotateX(Math.PI / 2); // axis along z
const cylY = (r, len, seg = 16, rTop = r) => project(new THREE.CylinderGeometry(rTop, r, len, seg, 1), 6);

/** Side-profile extrusion: points are [z, y] in weapon space, `width` along x (centred). */
function side(points, width, bevel = 0.0015, uvScale = 5) {
  const shape = new THREE.Shape(points.map(([z, y]) => V2(z, y)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: width - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 10 });
  geo.rotateY(-Math.PI / 2); geo.translate(width / 2 - bevel, 0, 0);
  return project(geo, uvScale);
}
/** Banana magazine: centre line from (z0,y0) sweeping to (z1,y1) with a bow. */
function bananaMag(z0, y0, z1, y1, bow, thick, width) {
  const front = [], back = [], n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n, cz = z0 + (z1 - z0) * t + Math.sin(t * Math.PI) * bow * -0.5 + bow * t * t, cy = y0 + (y1 - y0) * t;
    front.push([cz - thick / 2, cy]); back.push([cz + thick / 2, cy]);
  }
  return side([...front, ...back.reverse()], width, 0.001);
}

function part(parent, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, name) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true;
  if (name) m.name = name; parent.add(m); return m;
}
const marker = (parent, x, y, z, name) => { const o = new THREE.Object3D(); o.position.set(x, y, z); o.name = name; parent.add(o); return o; };

function serrations(parent, mat, count, x0, z0, dz, w, h, y) {
  for (let i = 0; i < count; i++) part(parent, box(w, h, 0.0022, 0.0004), mat, x0, y, z0 + i * dz);
}

// ---------------------------------------------------------------------------------------------- modelling helpers (v2)
/** Box-projected UVs without touching the normals (keeps creased / smooth shading from the builder). */
function uvBox(geo, scale = 5) {
  const p = geo.attributes.position, n = geo.attributes.normal, uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i)), az = Math.abs(n.getZ(i));
    let u, v;
    if (ax >= ay && ax >= az) { u = p.getZ(i); v = p.getY(i); } else if (ay >= az) { u = p.getX(i); v = p.getZ(i); } else { u = p.getX(i); v = p.getY(i); }
    uv[i * 2] = u * scale; uv[i * 2 + 1] = v * scale;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  return geo;
}
/** Closed outline from [z, y(, cornerRadius)] points with rounded corners (radius clamped to half of each edge). */
function outline(points, r = 0.004, target = new THREE.Shape()) {
  const n = points.length;
  for (let i = 0; i < n; i++) {
    const p = points[i], a = points[(i - 1 + n) % n], b = points[(i + 1) % n];
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]) || 1, db = Math.hypot(b[0] - p[0], b[1] - p[1]) || 1;
    const k = Math.min(p[2] ?? r, da / 2, db / 2);
    const p1x = p[0] + (a[0] - p[0]) / da * k, p1y = p[1] + (a[1] - p[1]) / da * k, p2x = p[0] + (b[0] - p[0]) / db * k, p2y = p[1] + (b[1] - p[1]) / db * k;
    if (i === 0) target.moveTo(p1x, p1y); else target.lineTo(p1x, p1y);
    if (k > 1e-6) target.quadraticCurveTo(p[0], p[1], p2x, p2y);
  }
  target.closePath();
  return target;
}
/**
 * Side-profile slab: a rounded outline in the weapon's (z, y) plane extruded `width` along x (centred), with a soft
 * bevel and creased normals — receivers, stocks, grips, guards. `holes` are inner outlines (trigger guards, thumbholes).
 */
function slab(points, width, { r = 0.004, bevel = 0.0015, holes = [], uv = 5, crease = 0.7, segments = 6 } = {}) {
  const shape = outline(points, r);
  for (const h of holes) shape.holes.push(outline(h, Math.min(r, 0.004), new THREE.Path()));
  let geo = new THREE.ExtrudeGeometry(shape, { depth: Math.max(1e-4, width - bevel * 2), bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: bevel > 0.002 ? 3 : 2, curveSegments: segments });
  geo.rotateY(-Math.PI / 2); geo.translate(width / 2 - bevel, 0, 0);
  geo.deleteAttribute('normal'); geo.deleteAttribute('uv');
  geo = toCreasedNormals(geo, crease);
  return uvBox(geo, uv);
}
/** Revolved part along the z axis from [z, radius] points listed rear (+z) to front (-z): barrels, tubes, scopes. */
function tube(profile, seg = 20, uv = 6) {
  const pts = profile.map(([z, r]) => new THREE.Vector2(Math.max(r, 1e-4), -z));
  const geo = new THREE.LatheGeometry(pts, seg); geo.rotateX(-Math.PI / 2);
  return uvBox(geo, uv);
}
/** Rounded box with smooth normals. */
const rb = (w, h, d, r = 0.003, seg = 3) => uvBox(new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4)), 4);
/** Small cylinder across the gun (x axis): pins, rivets, screws, knobs. */
const pinX = (r, len, seg = 10) => uvBox(new THREE.CylinderGeometry(r, r, len, seg).rotateZ(Math.PI / 2), 6);
/** Picatinny / Weaver rail along z from z0 (rear) to z1 (front) on top of height y. */
function railTop(g, mat, y, z0, z1, w = 0.021) {
  part(g, rb(w, 0.006, z0 - z1, 0.0012), mat, 0, y + 0.003, (z0 + z1) / 2);
  for (let z = z0 - 0.004; z > z1 + 0.003; z -= 0.01) part(g, rb(w + 0.003, 0.0045, 0.0052, 0.0008, 1), mat, 0, y + 0.0075, z);
}
/** Mirrored rivets / pins on both flanks at x = ±halfWidth. */
function rivets(g, mat, halfWidth, pts, r = 0.0026) { for (const [z, y] of pts) part(g, pinX(r, halfWidth * 2 + 0.002, 8), mat, 0, y, z); }

// ---------------------------------------------------------------------------------------------- rifles
/** AKM / AK-47: stamped receiver with rivets, ribbed dust cover, laminated wood furniture, slant brake, 30-rd mag. */
function buildAK47(M) {
  const g = new THREE.Group(), parts = {};
  // receiver: stamped sheet with the magwell dimple, rivets and the front trunnion
  part(g, slab([[-0.17, 0.034], [0.092, 0.034], [0.106, 0.024], [0.106, -0.012], [0.078, -0.034], [0.04, -0.034], [0.03, -0.03], [-0.112, -0.03], [-0.128, -0.037], [-0.17, -0.037]], 0.046, { r: 0.003, bevel: 0.0014 }), M.darkMetal);
  for (const s of [-1, 1]) part(g, slab([[-0.1, 0.012], [-0.048, 0.012], [-0.048, -0.012], [-0.1, -0.012]], 0.002, { r: 0.004, bevel: 0 }), M.blackSteel, s * 0.0232, 0, 0); // magwell dimples
  rivets(g, M.metal, 0.023, [[-0.155, -0.024], [-0.135, -0.024], [-0.022, -0.024], [0.022, -0.024], [0.058, -0.022], [0.07, 0.0], [-0.155, 0.02]]);
  // dust cover (rounded top, three stiffening ribs) and its rear release button
  part(g, rb(0.043, 0.026, 0.25, 0.012, 4), M.darkMetal, 0, 0.04, -0.03);
  for (const z of [-0.125, -0.07, -0.015]) part(g, rb(0.032, 0.004, 0.006, 0.0015, 1), M.darkMetal, 0, 0.0535, z);
  part(g, rb(0.012, 0.012, 0.012, 0.003, 2), M.metal, 0, 0.034, 0.102);
  // rear sight block + tangent leaf with notch
  part(g, slab([[-0.168, 0.034], [-0.122, 0.034], [-0.122, 0.048], [-0.14, 0.061], [-0.19, 0.061], [-0.205, 0.046], [-0.205, 0.034]], 0.03, { r: 0.004 }), M.darkMetal);
  part(g, slab([[-0.125, 0.06], [-0.2, 0.066], [-0.2, 0.071], [-0.125, 0.068]], 0.016, { r: 0.002, bevel: 0.0006 }), M.blackSteel);
  part(g, rb(0.018, 0.012, 0.006, 0.0015, 1), M.blackSteel, 0, 0.074, -0.124);
  // charging handle on the bolt carrier (right side) — the reload animation cycles it
  const bolt = new THREE.Group(); bolt.position.set(0.026, 0.016, -0.03); g.add(bolt); parts.bolt = bolt;
  part(bolt, rb(0.006, 0.012, 0.11, 0.002, 1), M.metal, 0, 0, -0.03);
  part(bolt, pinX(0.0055, 0.022, 10), M.metal, 0.012, 0, 0.018);
  part(bolt, new THREE.SphereGeometry(0.0068, 12, 8), M.metal, 0.024, 0, 0.018);
  part(g, rb(0.002, 0.016, 0.075, 0.002, 1), M.blackSteel, 0.0236, 0.017, -0.06);                         // ejection port shadow
  // selector lever along the right flank
  part(g, slab([[-0.075, 0.01], [0.055, 0.018], [0.066, 0.008], [0.06, 0.002], [-0.07, 0.0]], 0.003, { r: 0.003, bevel: 0.0006 }), M.blackSteel, 0.0245, 0, 0);
  // gas tube with vent holes, gas block (45 deg port), barrel, cleaning rod, front sight base with hood, slant brake
  part(g, tube([[-0.205, 0.0116], [-0.47, 0.0116], [-0.474, 0.0]]), M.metal, 0, 0.058, 0);
  for (let i = 0; i < 3; i++) part(g, pinX(0.0032, 0.0236, 8), M.blackSteel, 0, 0.058, -0.385 - i * 0.022);
  part(g, slab([[-0.46, 0.072], [-0.5, 0.072], [-0.528, 0.03], [-0.528, -0.002], [-0.46, -0.002]], 0.025, { r: 0.004 }), M.darkMetal);
  part(g, tube([[-0.19, 0.0105], [-0.21, 0.0096], [-0.6, 0.0088], [-0.63, 0.0088]]), M.blackSteel, 0, 0.012, 0);
  part(g, tube([[-0.23, 0.0034], [-0.6, 0.0034], [-0.605, 0.0045], [-0.612, 0.0045]], 8), M.steel, 0, -0.009, 0);
  part(g, slab([[-0.596, 0.032], [-0.636, 0.032], [-0.636, -0.016], [-0.6, -0.016]], 0.024, { r: 0.004 }), M.darkMetal);
  part(g, rb(0.004, 0.034, 0.004, 0.0008, 1), M.blackSteel, 0, 0.05, -0.618);                                // post
  part(g, new THREE.TorusGeometry(0.012, 0.0022, 6, 16, Math.PI), M.darkMetal, 0, 0.044, -0.618);              // open-top hood
  part(g, tube([[-0.632, 0.0128], [-0.668, 0.0128], [-0.672, 0.0108]]), M.darkMetal, 0, 0.012, 0);
  part(g, rb(0.018, 0.012, 0.014, 0.002, 1), M.blackSteel, 0, 0.022, -0.66, 0.4, 0, 0);                    // slant cut
  part(g, rb(0.01, 0.01, 0.02, 0.002, 1), M.darkMetal, 0, -0.022, -0.61);                                   // bayonet lug
  // wood: lower handguard with a palm swell, upper gas-tube cover, retainer bands
  part(g, slab([[-0.207, 0.024], [-0.398, 0.024], [-0.4, -0.006], [-0.388, -0.03], [-0.33, -0.042], [-0.26, -0.042], [-0.218, -0.034], [-0.207, -0.018]], 0.054, { r: 0.008, bevel: 0.009, uv: 4 }), M.wood);
  part(g, tube([[-0.212, 0.0], [-0.214, 0.0172], [-0.24, 0.0185], [-0.355, 0.0182], [-0.37, 0.0162], [-0.372, 0.0]]), M.wood, 0, 0.058, 0);
  for (const [z, h] of [[-0.204, 0.064], [-0.402, 0.04]]) part(g, rb(0.058, h, 0.008, 0.003, 2), M.darkMetal, 0, h === 0.064 ? 0.006 : 0.003, z);
  // trigger guard (stamped, with opening), trigger, pistol grip, stock with steel butt plate, sling swivels
  part(g, slab([[-0.014, -0.031], [0.052, -0.031], [0.052, -0.041], [0.042, -0.066], [-0.006, -0.066], [-0.014, -0.05]], 0.012, { r: 0.004, bevel: 0.0008, holes: [[[-0.004, -0.039], [0.043, -0.039], [0.036, -0.059], [0.0, -0.059]]] }), M.darkMetal);
  part(g, slab([[0.006, -0.033], [0.013, -0.033], [0.016, -0.05], [0.011, -0.057], [0.008, -0.05]], 0.006, { r: 0.002, bevel: 0.0006 }), M.metal);
  part(g, slab([[0.048, -0.03], [0.083, -0.03], [0.104, -0.138], [0.099, -0.152], [0.072, -0.156], [0.062, -0.146], [0.052, -0.082]], 0.033, { r: 0.007, bevel: 0.005, uv: 8 }), M.polymer);
  part(g, slab([[0.1, 0.031], [0.135, 0.031], [0.328, 0.014], [0.338, 0.004], [0.338, -0.098], [0.33, -0.108], [0.27, -0.084], [0.19, -0.056], [0.135, -0.036], [0.1, -0.022]], 0.04, { r: 0.012, bevel: 0.007, uv: 4 }), M.wood);
  part(g, slab([[0.337, 0.012], [0.345, 0.012], [0.345, -0.104], [0.337, -0.104]], 0.042, { r: 0.004, bevel: 0.002 }), M.darkMetal);
  for (const [z, y] of [[0.25, -0.078], [-0.62, -0.03]]) part(g, new THREE.TorusGeometry(0.008, 0.0016, 6, 14), M.metal, -0.006, y, z, 0, Math.PI / 2, 0);
  // 30-round steel magazine: banana body, side ribs, floor plate
  const mag = new THREE.Group(); mag.position.set(0, -0.03, -0.05); g.add(mag); parts.mag = mag;
  part(mag, slab([[0.014, 0.0], [-0.034, 0.0], [-0.047, -0.06], [-0.068, -0.12], [-0.094, -0.172], [-0.1, -0.188], [-0.058, -0.208], [-0.046, -0.192], [-0.026, -0.138], [-0.008, -0.08], [0.006, -0.032]], 0.031, { r: 0.006, bevel: 0.002 }), M.darkMetal);
  part(mag, slab([[-0.004, -0.02], [-0.022, -0.02], [-0.04, -0.08], [-0.062, -0.135], [-0.074, -0.16], [-0.06, -0.166], [-0.046, -0.13], [-0.026, -0.078]], 0.0345, { r: 0.004, bevel: 0.001 }), M.darkMetal); // stiffening rib
  part(mag, slab([[-0.104, -0.184], [-0.054, -0.21], [-0.05, -0.218], [-0.106, -0.192]], 0.036, { r: 0.002, bevel: 0.0012 }), M.blackSteel);   // floor plate
  return { group: g, muzzle: marker(g, 0, 0.012, -0.675, 'muzzle'), eject: marker(g, 0.03, 0.02, -0.05, 'eject'), parts,
    hands: { right: { p: [0.004, -0.085, 0.062], r: [0.15, 0, 0] }, left: { p: [0, -0.05, -0.31], r: [0.25, 0, 0] } }, length: 1 };
}

/** Galil AR (ARM pattern): milled AK-type receiver with the upturned charging handle, black ribbed polymer handguard,
 *  tall front-sight ears, slotted flash hider, folded bipod, straight 35-rd magazine and a tubular skeleton folding stock.
 *  Grip / handguard / magazine sit where the AK's do, so the AK hand pose fits. */
function buildGalil(M) {
  const g = new THREE.Group(), parts = {};
  // milled receiver (flat sides, no rivets) with a deep magwell, grooved top cover and rear peep sight
  part(g, slab([[-0.17, 0.034], [0.096, 0.034], [0.11, 0.022], [0.11, -0.014], [0.082, -0.036], [0.04, -0.036], [0.03, -0.03], [-0.112, -0.03], [-0.13, -0.044], [-0.17, -0.044]], 0.048, { r: 0.004 }), M.darkMetal);
  for (const s of [-1, 1]) part(g, slab([[-0.16, 0.022], [0.09, 0.022], [0.09, 0.016], [-0.16, 0.016]], 0.002, { r: 0.002, bevel: 0 }), M.blackSteel, s * 0.0242, 0, 0); // side flats
  part(g, rb(0.046, 0.024, 0.26, 0.007, 3), M.blackSteel, 0, 0.044, -0.032);
  for (const z of [-0.14, -0.1, -0.06, -0.02, 0.02, 0.06]) part(g, rb(0.047, 0.003, 0.007, 0.001, 1), M.darkMetal, 0, 0.0565, z);
  part(g, rb(0.026, 0.022, 0.024, 0.004, 2), M.darkMetal, 0, 0.066, 0.08);                                   // rear sight housing
  part(g, rb(0.012, 0.016, 0.004, 0.002, 1), M.blackSteel, 0, 0.083, 0.08);                                   // peep
  // charging handle on the right, bent upwards (Galil signature) — the reload animation cycles it
  const bolt = new THREE.Group(); bolt.position.set(0.026, 0.018, -0.03); g.add(bolt); parts.bolt = bolt;
  part(bolt, rb(0.006, 0.012, 0.11, 0.002, 1), M.metal, 0, 0, -0.03);
  part(bolt, rb(0.008, 0.046, 0.009, 0.003, 2), M.metal, 0.012, 0.018, 0.016, 0, 0, -0.45);
  part(g, rb(0.002, 0.016, 0.075, 0.002, 1), M.blackSteel, 0.0245, 0.017, -0.06);                            // ejection port
  // ambidextrous selector: thumb lever behind the grip on the left side
  part(g, slab([[0.07, 0.008], [0.1, 0.012], [0.104, 0.0], [0.072, -0.004]], 0.004, { r: 0.002, bevel: 0.0006 }), M.blackSteel, -0.026, 0, 0);
  // barrel, gas tube, gas block with the tall front-sight ears, slotted flash hider
  part(g, tube([[-0.19, 0.0105], [-0.21, 0.0098], [-0.64, 0.009], [-0.66, 0.009]]), M.blackSteel, 0, 0.012, 0);
  part(g, tube([[-0.205, 0.011], [-0.46, 0.011], [-0.465, 0.0]]), M.blackSteel, 0, 0.058, 0);
  part(g, slab([[-0.46, 0.074], [-0.51, 0.074], [-0.525, 0.032], [-0.525, -0.006], [-0.46, -0.006]], 0.028, { r: 0.004 }), M.darkMetal);
  for (const s of [-1, 1]) part(g, rb(0.004, 0.05, 0.018, 0.0015, 1), M.darkMetal, s * 0.0125, 0.098, -0.49);
  part(g, rb(0.003, 0.034, 0.003, 0.0006, 1), M.blackSteel, 0, 0.092, -0.49);
  part(g, tube([[-0.66, 0.0125], [-0.71, 0.0125], [-0.714, 0.0105]]), M.darkMetal, 0, 0.012, 0);
  for (let i = 0; i < 4; i++) part(g, rb(0.0032, 0.004, 0.034, 0.0008, 1), M.blackSteel, Math.cos(i * 1.57 + 0.78) * 0.0125, 0.012 + Math.sin(i * 1.57 + 0.78) * 0.0125, -0.69, 0, 0, i * 1.57 + 0.78);
  // folded bipod under the barrel (two legs, yoke at the gas block)
  part(g, rb(0.03, 0.012, 0.02, 0.004, 2), M.blackSteel, 0, -0.004, -0.455);
  for (const s of [-1, 1]) part(g, rb(0.006, 0.007, 0.21, 0.0025, 1), M.blackSteel, s * 0.009, -0.012, -0.56);
  // ribbed black polymer handguard with cooling slots, upper cover over the gas tube
  part(g, slab([[-0.207, 0.028], [-0.44, 0.028], [-0.445, -0.004], [-0.43, -0.034], [-0.34, -0.046], [-0.25, -0.046], [-0.215, -0.038], [-0.207, -0.02]], 0.058, { r: 0.01, bevel: 0.008 }), M.polymer);
  for (let i = 0; i < 8; i++) {
    part(g, rb(0.06, 0.006, 0.007, 0.002, 1), M.polymer, 0, -0.045, -0.235 - i * 0.026);
    for (const s of [-1, 1]) part(g, rb(0.002, 0.008, 0.016, 0.001, 1), M.blackSteel, s * 0.0292, 0.004, -0.235 - i * 0.026);
  }
  part(g, tube([[-0.212, 0.0], [-0.214, 0.0175], [-0.44, 0.0175], [-0.442, 0.0]]), M.polymer, 0, 0.058, 0);
  part(g, rb(0.06, 0.07, 0.008, 0.003, 2), M.darkMetal, 0, 0.012, -0.205);                                    // retainer
  // trigger guard, trigger, polymer pistol grip with finger groove
  part(g, slab([[-0.014, -0.031], [0.052, -0.031], [0.052, -0.041], [0.042, -0.066], [-0.006, -0.066], [-0.014, -0.05]], 0.012, { r: 0.004, bevel: 0.0008, holes: [[[-0.004, -0.039], [0.043, -0.039], [0.036, -0.059], [0.0, -0.059]]] }), M.darkMetal);
  part(g, slab([[0.006, -0.033], [0.013, -0.033], [0.016, -0.05], [0.011, -0.057], [0.008, -0.05]], 0.006, { r: 0.002, bevel: 0.0006 }), M.metal);
  part(g, slab([[0.048, -0.032], [0.084, -0.032], [0.108, -0.14], [0.102, -0.156], [0.074, -0.16], [0.064, -0.15], [0.058, -0.11], [0.05, -0.09], [0.056, -0.07]], 0.034, { r: 0.007, bevel: 0.005, uv: 8 }), M.polymer);
  // tubular skeleton stock folded out: hinge block, upper and lower tubes, rubber butt pad
  part(g, rb(0.044, 0.06, 0.03, 0.006, 2), M.darkMetal, 0, -0.004, 0.124);
  part(g, tube([[0.13, 0.0085], [0.335, 0.0085]], 14), M.blackSteel, 0, 0.022, 0);
  part(g, rb(0.016, 0.016, 0.235, 0.007, 3), M.blackSteel, 0, -0.06, 0.235, 0.24, 0, 0);
  part(g, rb(0.012, 0.11, 0.012, 0.005, 2), M.blackSteel, 0, -0.035, 0.33);
  part(g, rb(0.034, 0.13, 0.022, 0.009, 3), M.rubber, 0, -0.04, 0.348);
  // straight 35-round magazine with ribs and floor plate
  const mag = new THREE.Group(); mag.position.set(0, -0.03, -0.05); g.add(mag); parts.mag = mag;
  part(mag, slab([[0.014, 0.0], [-0.034, 0.0], [-0.04, -0.08], [-0.05, -0.16], [-0.058, -0.21], [-0.016, -0.218], [-0.008, -0.17], [0.002, -0.09], [0.008, -0.03]], 0.031, { r: 0.005, bevel: 0.002 }), M.darkMetal);
  part(mag, slab([[-0.062, -0.206], [-0.012, -0.214], [-0.01, -0.226], [-0.064, -0.218]], 0.035, { r: 0.002, bevel: 0.0012 }), M.blackSteel);
  return { group: g, muzzle: marker(g, 0, 0.012, -0.716, 'muzzle'), eject: marker(g, 0.03, 0.02, -0.05, 'eject'), parts,
    hands: { right: { p: [0.004, -0.085, 0.062], r: [0.15, 0, 0] }, left: { p: [0, -0.05, -0.31], r: [0.25, 0, 0] } }, length: 1 };
}

/** M4A4: flat-top upper with Picatinny rail, forward assist, quad-rail handguard, A2 grip, M4 stock, birdcage. */
function buildM4A4(M) {
  const g = new THREE.Group(), parts = {};
  // lower receiver with flared magwell, takedown pins, bolt catch, buffer tube, stock
  part(g, slab([[-0.11, 0.016], [0.07, 0.016], [0.096, 0.004], [0.104, -0.012], [0.07, -0.03], [0.02, -0.032], [-0.04, -0.03], [-0.052, -0.05], [-0.112, -0.05], [-0.118, -0.032], [-0.112, -0.01]], 0.044, { r: 0.004 }), M.darkMetal);
  rivets(g, M.metal, 0.022, [[0.085, -0.003], [-0.098, 0.004]], 0.0035);
  part(g, rb(0.004, 0.026, 0.014, 0.0015, 1), M.blackSteel, -0.0235, -0.012, -0.035);                     // bolt catch
  part(g, rb(0.004, 0.012, 0.012, 0.002, 1), M.blackSteel, -0.0235, -0.024, -0.098);                      // mag release side
  part(g, tube([[0.27, 0.0], [0.268, 0.0152], [0.11, 0.0152], [0.105, 0.017], [0.098, 0.017], [0.096, 0.0]]), M.darkMetal, 0, 0.022, 0);
  // collapsible M4 stock: slim body hugging the tube, latch lever, sling slot, angled toe down to the butt pad
  part(g, slab([[0.16, 0.044], [0.31, 0.044], [0.336, 0.036], [0.34, 0.0], [0.34, -0.074], [0.326, -0.08], [0.29, -0.05], [0.24, -0.008], [0.2, 0.0], [0.16, 0.002]], 0.036, { r: 0.007, bevel: 0.005, holes: [[[0.3, 0.012], [0.322, 0.012], [0.322, -0.03], [0.3, -0.02]]] }), M.polymer);
  part(g, slab([[0.17, 0.004], [0.23, 0.004], [0.235, -0.008], [0.172, -0.008]], 0.012, { r: 0.002 }), M.polymer);                               // latch lever
  part(g, slab([[0.338, 0.04], [0.35, 0.04], [0.35, -0.078], [0.338, -0.078]], 0.04, { r: 0.004, bevel: 0.002 }), M.rubber);
  // upper receiver: flat top + rail, forward assist, brass deflector, ejection port door, charging handle
  part(g, slab([[-0.125, 0.064], [0.07, 0.064], [0.084, 0.056], [0.084, 0.016], [-0.125, 0.016]], 0.04, { r: 0.004 }), M.darkMetal);
  railTop(g, M.darkMetal, 0.064, 0.08, -0.12);
  part(g, tube([[0.06, 0.0], [0.058, 0.0085], [0.02, 0.0085], [0.018, 0.0105], [0.004, 0.0105], [0.002, 0.0]], 14), M.darkMetal, 0.024, 0.048, 0, 0, -0.35, 0); // forward assist
  part(g, rb(0.01, 0.016, 0.02, 0.004, 2), M.darkMetal, 0.022, 0.054, 0.04);                              // brass deflector
  part(g, rb(0.003, 0.024, 0.06, 0.0015, 1), M.blackSteel, 0.0205, 0.036, -0.02);                         // port door
  const bolt = new THREE.Group(); bolt.position.set(0, 0.056, 0.09); g.add(bolt); parts.bolt = bolt;      // charging handle
  part(bolt, slab([[-0.01, 0.006], [0.012, 0.006], [0.016, 0.0], [0.012, -0.004], [-0.01, -0.004]], 0.05, { r: 0.003, bevel: 0.0015 }), M.darkMetal);
  // handguard: quad rail with rubber ladder covers, gas block with A-frame front sight, barrel, birdcage
  part(g, rb(0.05, 0.05, 0.245, 0.01, 4), M.darkMetal, 0, 0.034, -0.25);
  railTop(g, M.darkMetal, 0.059, -0.13, -0.37, 0.02);
  for (const s of [-1, 1]) for (let i = 0; i < 7; i++) part(g, rb(0.004, 0.026, 0.026, 0.0015, 1), M.rubber, s * 0.026, 0.034, -0.15 - i * 0.032);
  for (let i = 0; i < 7; i++) part(g, rb(0.026, 0.004, 0.026, 0.0015, 1), M.rubber, 0, 0.008, -0.15 - i * 0.032);
  part(g, tube([[-0.37, 0.0098], [-0.52, 0.0088], [-0.55, 0.0088]]), M.blackSteel, 0, 0.03, 0);
  part(g, slab([[-0.4, 0.04], [-0.43, 0.04], [-0.43, 0.018], [-0.4, 0.018]], 0.022, { r: 0.003 }), M.darkMetal);
  part(g, slab([[-0.41, 0.04], [-0.432, 0.04], [-0.442, 0.094], [-0.436, 0.1], [-0.428, 0.1], [-0.418, 0.06]], 0.016, { r: 0.003 }), M.darkMetal);     // A-frame
  part(g, rb(0.003, 0.016, 0.003, 0.0006, 1), M.blackSteel, 0, 0.104, -0.434);
  part(g, tube([[-0.55, 0.0122], [-0.6, 0.0122], [-0.602, 0.0105]]), M.darkMetal, 0, 0.03, 0);
  for (let i = 0; i < 4; i++) part(g, rb(0.0032, 0.004, 0.034, 0.0008, 1), M.blackSteel, Math.cos(i * 1.57 + 0.78) * 0.0122, 0.03 + Math.sin(i * 1.57 + 0.78) * 0.0122, -0.582, 0, 0, i * 1.57 + 0.78); // slots
  // flip-up rear sight, A2 pistol grip with finger nub, trigger guard, trigger
  part(g, slab([[0.066, 0.064], [0.04, 0.064], [0.044, 0.086], [0.06, 0.086]], 0.018, { r: 0.003 }), M.darkMetal);
  part(g, slab([[0.02, -0.03], [0.054, -0.03], [0.084, -0.14], [0.08, -0.15], [0.058, -0.152], [0.05, -0.142], [0.036, -0.086], [0.03, -0.074], [0.034, -0.062], [0.026, -0.052]], 0.034, { r: 0.006, bevel: 0.005, uv: 9 }), M.polymer);
  part(g, slab([[-0.036, -0.03], [0.02, -0.03], [0.02, -0.04], [0.012, -0.066], [-0.028, -0.066], [-0.036, -0.05]], 0.012, { r: 0.004, bevel: 0.0008, holes: [[[-0.028, -0.038], [0.012, -0.038], [0.006, -0.059], [-0.022, -0.059]]] }), M.darkMetal);
  part(g, slab([[-0.016, -0.032], [-0.009, -0.032], [-0.006, -0.048], [-0.011, -0.056], [-0.014, -0.048]], 0.006, { r: 0.002, bevel: 0.0006 }), M.metal);
  // 30-round STANAG: slightly curved aluminium body with ribs and floor plate
  const mag = new THREE.Group(); mag.position.set(0, -0.035, -0.075); g.add(mag); parts.mag = mag;
  part(mag, slab([[0.014, 0.0], [-0.032, 0.0], [-0.036, -0.08], [-0.046, -0.165], [-0.004, -0.17], [0.006, -0.085]], 0.026, { r: 0.004, bevel: 0.0015 }), M.darkMetal);
  part(mag, slab([[0.0, -0.03], [-0.02, -0.03], [-0.026, -0.08], [-0.03, -0.14], [-0.012, -0.142], [-0.004, -0.085]], 0.0285, { r: 0.004, bevel: 0.001 }), M.darkMetal);   // ribs
  part(mag, slab([[0.0, -0.166], [-0.05, -0.162], [-0.05, -0.176], [-0.002, -0.18]], 0.03, { r: 0.002, bevel: 0.0012 }), M.polymer);                      // floor plate
  return { group: g, muzzle: marker(g, 0, 0.03, -0.605, 'muzzle'), eject: marker(g, 0.03, 0.05, -0.04, 'eject'), parts,
    hands: { right: { p: [0.004, -0.088, 0.03], r: [0.15, 0, 0] }, left: { p: [0, -0.02, -0.3], r: [0.2, 0, 0] } }, length: 1 };
}

// ---------------------------------------------------------------------------------------------- pistols
/** Desert Eagle: fixed polygonal barrel with the triangular top rib, short reciprocating slide, Hogue-style grip. */
function buildDeagle(M) {
  const g = new THREE.Group(), parts = {};
  // barrel: rectangular body + triangular top rib (3-sided prism), bore, Weaver rail on top
  part(g, slab([[-0.045, 0.054], [-0.238, 0.054], [-0.246, 0.046], [-0.246, 0.022], [-0.238, 0.016], [-0.045, 0.016]], 0.03, { r: 0.003, bevel: 0.002 }), M.darkMetal);
  const rib = uvBox(new THREE.CylinderGeometry(0.0175, 0.0175, 0.19, 3).rotateX(Math.PI / 2).rotateZ(Math.PI).scale(1, 0.55, 1), 6);
  part(g, rib, M.darkMetal, 0, 0.056, -0.142);
  railTop(g, M.blackSteel, 0.064, -0.06, -0.225, 0.014);
  part(g, new THREE.CircleGeometry(0.0062, 14), M.rubber, 0, 0.034, -0.2465, 0, Math.PI, 0);
  // slide (rear): serrations, rear sight, ambidextrous safety, exposed hammer
  const slide = new THREE.Group(); g.add(slide); parts.slide = slide;
  part(slide, slab([[0.046, 0.058], [-0.045, 0.058], [-0.045, 0.016], [0.04, 0.016], [0.048, 0.03]], 0.032, { r: 0.004, bevel: 0.002 }), M.darkMetal);
  for (let i = 0; i < 8; i++) part(slide, rb(0.0335, 0.03, 0.0022, 0.0006, 1), M.blackSteel, 0, 0.038, 0.034 - i * 0.0065);
  part(slide, rb(0.02, 0.012, 0.012, 0.002, 1), M.blackSteel, 0, 0.066, 0.036);
  part(slide, rb(0.04, 0.008, 0.014, 0.003, 1), M.blackSteel, 0, 0.05, 0.022);
  part(g, slab([[0.05, 0.03], [0.062, 0.042], [0.068, 0.038], [0.058, 0.02]], 0.01, { r: 0.002 }), M.blackSteel);
  part(g, rb(0.004, 0.022, 0.006, 0.001, 1), M.blackSteel, 0, 0.064, -0.236);                                 // front sight
  // frame, squared trigger guard, trigger, rubber wrap-around grip with finger grooves
  part(g, slab([[0.056, 0.018], [-0.246, 0.018], [-0.246, 0.004], [-0.075, 0.004], [-0.064, -0.006], [0.056, -0.006]], 0.03, { r: 0.003, bevel: 0.0015 }), M.darkMetal);
  part(g, slab([[0.002, -0.004], [-0.064, -0.004], [-0.07, -0.04], [-0.06, -0.046], [0.008, -0.046], [0.006, -0.016]], 0.012, { r: 0.004, bevel: 0.0008, holes: [[[-0.002, -0.011], [-0.058, -0.011], [-0.062, -0.038], [-0.003, -0.038]]] }), M.darkMetal);
  part(g, slab([[-0.026, -0.006], [-0.018, -0.006], [-0.016, -0.026], [-0.022, -0.034], [-0.025, -0.024]], 0.007, { r: 0.002, bevel: 0.0006 }), M.metal);
  part(g, slab([[0.008, -0.004], [0.058, -0.004], [0.07, 0.008], [0.078, 0.0], [0.072, -0.02], [0.088, -0.14], [0.082, -0.148], [0.03, -0.15], [0.024, -0.128], [0.014, -0.116], [0.02, -0.1], [0.011, -0.083], [0.017, -0.064], [0.008, -0.05]], 0.036, { r: 0.006, bevel: 0.006, uv: 9 }), M.rubber);
  const mag = new THREE.Group(); mag.position.set(0, -0.15, 0.03); g.add(mag); parts.mag = mag;
  part(mag, slab([[0.03, 0.0], [-0.006, 0.0], [-0.016, 0.11], [0.018, 0.11]], 0.024, { r: 0.003, bevel: 0.001 }), M.darkMetal);
  part(mag, rb(0.03, 0.01, 0.05, 0.003, 2), M.darkMetal, 0, -0.004, 0.012);
  return { group: g, muzzle: marker(g, 0, 0.034, -0.252, 'muzzle'), eject: marker(g, 0.02, 0.04, -0.03, 'eject'), parts,
    hands: { right: { p: [0.014, -0.08, 0.065], r: [0.2, -0.12, 0.22] }, left: { p: [-0.02, -0.095, 0.055], r: [0.32, 0.25, -0.22], support: true } }, length: 0.4 };
}

/**
 * Polymer-frame service pistol family (Glock-18, USP-S, P250, Five-SeveN, CZ75, Tec-9 variant): chamfered slide with
 * rear serrations, ejection port, three-dot sights, accessory rail, undercut trigger guard, finger-groove grip.
 */
function buildPistol(M, o = {}) {
  const { slideLen = 0.2, slide = M.darkMetal, frame = M.polymer, top = M.metal, suppressor = false, forwardMag = false, hammer = false, sight = M.rubber, glock = false } = o;
  const g = new THREE.Group(), parts = {}, sl = new THREE.Group(); g.add(sl); parts.slide = sl;
  const zf = 0.032 - slideLen;                                                                              // slide front face
  part(sl, slab([[0.034, 0.052], [zf + 0.012, 0.052], [zf, 0.044], [zf - 0.002, 0.026], [zf + 0.006, 0.017], [0.034, 0.017]], 0.027, { r: 0.003, bevel: glock ? 0.003 : 0.0042 }), slide);
  part(sl, rb(0.012, 0.004, slideLen - 0.03, 0.0015, 1), top, 0, 0.053, (0.034 + zf) / 2 + 0.008);           // top flat / rib
  for (let i = 0; i < 7; i++) part(sl, rb(0.0282, 0.026, 0.0018, 0.0005, 1), M.blackSteel, 0, 0.033, 0.028 - i * 0.0052);
  part(sl, rb(0.002, 0.018, 0.042, 0.001, 1), M.blackSteel, 0.0136, 0.04, -0.035);                         // ejection port
  part(sl, rb(0.014, 0.01, 0.008, 0.0015, 1), sight, 0, 0.058, 0.026);                                       // rear sight
  part(sl, rb(0.004, 0.009, 0.006, 0.001, 1), sight, 0, 0.057, zf + 0.012);                                  // front sight
  for (const [x, z] of [[-0.004, 0.026], [0.004, 0.026], [0, zf + 0.012]]) part(sl, new THREE.SphereGeometry(0.0013, 6, 4), M.tape, x, 0.0605, z - 0.004);
  if (hammer) part(sl, slab([[0.034, 0.03], [0.05, 0.05], [0.056, 0.046], [0.04, 0.026]], 0.008, { r: 0.002 }), M.darkMetal);
  if (glock) part(sl, rb(0.003, 0.006, 0.014, 0.001, 1), M.blackSteel, -0.0145, 0.04, 0.022);              // Glock 18 selector
  // barrel crown, frame with accessory rail, trigger guard, trigger
  part(g, tube([[zf + 0.004, 0.0068], [zf - 0.002, 0.0068], [zf - 0.003, 0.0]], 14), M.metal, 0, 0.034, 0);
  part(g, new THREE.CircleGeometry(0.0042, 12), M.rubber, 0, 0.034, zf - 0.0031, 0, Math.PI, 0);
  part(g, slab([[0.04, 0.019], [zf + 0.002, 0.019], [zf + 0.002, 0.002], [zf + 0.03, -0.006], [-0.06, -0.006], [-0.048, -0.012], [0.04, -0.006]], 0.027, { r: 0.003, bevel: 0.0018 }), frame);
  for (let i = 0; i < 2; i++) part(g, rb(0.028, 0.003, 0.005, 0.0008, 1), M.blackSteel, 0, -0.005, zf + 0.04 + i * 0.016);
  part(g, slab([[0.004, -0.004], [-0.054, -0.004], [-0.06, -0.03], [-0.052, -0.036], [0.008, -0.036], [0.006, -0.014]], 0.011, { r: 0.004, bevel: 0.0008, holes: [[[-0.001, -0.01], [-0.049, -0.01], [-0.052, -0.029], [0.0, -0.029]]] }), frame);
  part(g, slab([[-0.03, -0.006], [-0.022, -0.006], [-0.02, -0.024], [-0.026, -0.03], [-0.029, -0.022]], 0.006, { r: 0.002, bevel: 0.0006 }), M.metal);
  // grip: beavertail, finger grooves on the front strap, slight backstrap hump
  part(g, slab([[0.006, -0.004], [0.05, -0.004], [0.058, 0.004], [0.066, -0.002], [0.06, -0.02], [0.078, -0.122], [0.072, -0.128], [0.026, -0.128], [0.02, -0.11], [0.012, -0.1], [0.018, -0.085], [0.009, -0.07], [0.015, -0.053], [0.006, -0.04]], 0.031, { r: 0.006, bevel: 0.0045, uv: 9 }), frame);
  if (suppressor) {
    const can = new THREE.Group(); can.name = 'suppressor'; g.add(can); parts.suppressor = can;
    part(can, tube([[zf - 0.002, 0.0118], [zf - 0.008, 0.0128], [zf - 0.13, 0.0128], [zf - 0.134, 0.0112], [zf - 0.136, 0.0]], 20), M.blackSteel, 0, 0.034, 0);
    for (let i = 0; i < 2; i++) part(can, tube([[zf - 0.03 - i * 0.07, 0.0131], [zf - 0.036 - i * 0.07, 0.0131]], 20), M.darkMetal, 0, 0.034, 0);
  }
  const mag = new THREE.Group(); mag.position.set(0, -0.125, 0.03); g.add(mag); parts.mag = mag;
  part(mag, slab([[0.032, 0.0], [-0.004, 0.0], [-0.012, 0.1], [0.022, 0.1]], 0.022, { r: 0.003, bevel: 0.001 }), frame);
  part(mag, rb(0.026, 0.01, 0.04, 0.003, 2), frame, 0, -0.002, 0.014);
  if (forwardMag) {
    part(g, slab([[-0.062, -0.006], [-0.094, -0.006], [-0.1, -0.13], [-0.068, -0.13]], 0.026, { r: 0.003, bevel: 0.0015 }), M.blackSteel);
    part(g, tube([[zf, 0.011], [zf - 0.07, 0.011], [zf - 0.072, 0.0]], 14), M.darkMetal, 0, 0.034, 0);
  }
  const muzzleZ = suppressor ? zf - 0.136 : forwardMag ? zf - 0.072 : zf - 0.003;
  return { group: g, muzzle: marker(g, 0, 0.034, muzzleZ, 'muzzle'), eject: marker(g, 0.018, 0.042, -0.03, 'eject'), parts, hands: {}, length: 0.3, bareMuzzleZ: zf - 0.003 };
}
const buildGlock = M => buildPistol(M, { slideLen: 0.19, slide: M.darkMetal, top: M.darkMetal, glock: true });

// ---------------------------------------------------------------------------------------------- melee / utility
/** Tactical fixed-blade (Ka-Bar / M9 bayonet family): clip-point blade with a ground primary bevel and a mirror-polished
 *  edge, fuller, serrated spine near the guard, steel crossguard with finger choil, stacked-ring paracord-wrapped grip
 *  with a lanyard hole in the steel pommel. Blade points to -Z, edge down. */
function buildKnife(M) {
  const g = new THREE.Group();
  // blade core (flat of the blade) and the bevel down to the edge, then a bright honed edge line
  part(g, side([[0.0, 0.012], [-0.15, 0.014], [-0.192, 0.006], [-0.226, -0.002], [-0.2, -0.012], [-0.15, -0.019], [-0.02, -0.019], [-0.004, -0.012], [0.0, 0.0]], 0.0055, 0.0006), M.blackSteel);
  part(g, side([[-0.012, -0.008], [-0.15, -0.0105], [-0.2, -0.008], [-0.226, -0.002], [-0.2, -0.0125], [-0.15, -0.0195], [-0.02, -0.0195], [-0.01, -0.014]], 0.0062, 0.0004), M.steel);   // primary bevel
  part(g, side([[-0.018, -0.0178], [-0.15, -0.0185], [-0.198, -0.012], [-0.224, -0.0035], [-0.2, -0.0135], [-0.15, -0.0202], [-0.018, -0.0202]], 0.0064, 0.0002), M.silver);   // honed edge
  part(g, side([[-0.192, 0.006], [-0.226, -0.002], [-0.205, 0.0005]], 0.0058, 0.0003), M.steel);                                                                                // clip swedge
  part(g, side([[-0.035, 0.0035], [-0.135, 0.0045], [-0.14, 0.0015], [-0.035, 0.0005]], 0.0068, 0.0003), M.darkMetal);                                                       // fuller
  for (let i = 0; i < 9; i++) part(g, side([[-0.012 - i * 0.0065, 0.012], [-0.0152 - i * 0.0065, 0.0165], [-0.0184 - i * 0.0065, 0.012]], 0.0045, 0.0002), M.blackSteel);   // spine serrations
  // crossguard with a lower finger quillon, and the ricasso choil
  part(g, side([[0.004, 0.024], [0.016, 0.024], [0.016, -0.03], [0.008, -0.04], [0.002, -0.036], [0.004, -0.022]], 0.022, 0.002), M.darkMetal);
  // grip: stacked rings (leather / paracord wrap) between steel spacers, flared toward the pommel
  const ringGeo = cyl(0.0135, 0.012, 16);
  for (let i = 0; i < 9; i++) {
    const r = part(g, ringGeo, i % 2 ? M.rubber : M.polymer, 0, -0.004, 0.024 + i * 0.0115); r.scale.set(1, 1.18 + Math.sin(i / 8 * Math.PI) * 0.12, 1);
  }
  for (const z of [0.019, 0.121]) part(g, cyl(0.0145, 0.004, 16), M.metal, 0, -0.004, z);
  // pommel with lanyard hole
  part(g, side([[0.122, 0.016], [0.146, 0.012], [0.152, 0.0], [0.146, -0.017], [0.122, -0.022]], 0.024, 0.003), M.darkMetal);
  part(g, pinX(0.0042, 0.026, 12), M.blackSteel, 0, -0.004, 0.141);
  return { group: g, muzzle: marker(g, 0, -0.002, -0.226, 'tip'), eject: null, parts: {}, hands: { right: { p: [0, -0.02, 0.07], r: [0.3, 0, 0] }, left: null }, length: 0.39 };
}
function buildHE(M) {
  const g = new THREE.Group(), parts = {};
  const body = new THREE.Mesh(new THREE.SphereGeometry(0.036, 20, 14), M.grenadeGreen); body.scale.set(1, 1.25, 1); body.castShadow = true; g.add(body);
  part(g, cylY(0.013, 0.03, 14), M.darkMetal, 0, 0.055, 0);
  for (let i = 0; i < 3; i++) part(g, new THREE.TorusGeometry(0.0345, 0.0016, 6, 24), M.darkMetal, 0, -0.03 + i * 0.03, 0, Math.PI / 2, 0, 0);
  const lever = part(g, side([[0.0, 0.0], [0.014, 0.0], [0.014, -0.09], [0.008, -0.1], [0.0, -0.09]], 0.008, 0.001), M.steel, 0.0, 0.07, -0.0); lever.position.set(0.0, 0.07, -0.018); lever.rotation.y = Math.PI; lever.position.z = 0.014; parts.lever = lever;
  const pin = part(g, new THREE.TorusGeometry(0.011, 0.0015, 6, 16), M.steel, 0.02, 0.066, 0.0, 0, Math.PI / 2, 0); parts.pin = pin;
  return { group: g, muzzle: null, eject: null, parts, hands: { right: { p: [0.01, -0.03, 0.0], r: [0.3, 0, 0] }, left: { p: [-0.05, -0.02, 0.0], r: [0.2, 0.3, 0.3], support: true } }, length: 0.2 };
}
function buildFlash(M) {
  const g = new THREE.Group(), parts = {};
  part(g, cylY(0.027, 0.115, 20), M.grenadeGrey, 0, 0, 0);
  part(g, cylY(0.0275, 0.02, 20), M.rubber, 0, 0.018, 0); part(g, cylY(0.0275, 0.012, 20), M.accent, 0, -0.03, 0);
  part(g, cylY(0.0195, 0.02, 16), M.darkMetal, 0, 0.066, 0);
  const lever = part(g, side([[0.0, 0.0], [0.012, 0.0], [0.012, -0.09], [0.006, -0.1], [0.0, -0.09]], 0.008, 0.001), M.steel, 0, 0.07, 0.024); parts.lever = lever; lever.rotation.y = Math.PI;
  parts.pin = part(g, new THREE.TorusGeometry(0.011, 0.0015, 6, 16), M.steel, 0.02, 0.066, 0.0, 0, Math.PI / 2, 0);
  return { group: g, muzzle: null, eject: null, parts, hands: { right: { p: [0.01, -0.025, 0.0], r: [0.3, 0, 0] }, left: { p: [-0.05, -0.02, 0.0], r: [0.2, 0.3, 0.3], support: true } }, length: 0.2 };
}
function buildSmoke(M) {
  const g = new THREE.Group(), parts = {};
  part(g, cylY(0.03, 0.15, 20), M.smokeBody, 0, 0, 0);
  part(g, cylY(0.0305, 0.03, 20), M.accent, 0, 0.02, 0); part(g, cylY(0.0305, 0.012, 20), M.rubber, 0, -0.045, 0);
  part(g, cylY(0.02, 0.022, 16), M.darkMetal, 0, 0.086, 0);
  const lever = part(g, side([[0.0, 0.0], [0.012, 0.0], [0.012, -0.11], [0.006, -0.12], [0.0, -0.11]], 0.008, 0.001), M.steel, 0, 0.09, 0.026); parts.lever = lever; lever.rotation.y = Math.PI;
  parts.pin = part(g, new THREE.TorusGeometry(0.011, 0.0015, 6, 16), M.steel, 0.02, 0.084, 0.0, 0, Math.PI / 2, 0);
  return { group: g, muzzle: null, eject: null, parts, hands: { right: { p: [0.01, -0.03, 0.0], r: [0.3, 0, 0] }, left: { p: [-0.05, -0.02, 0.0], r: [0.2, 0.3, 0.3], support: true } }, length: 0.2 };
}
function buildC4(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.2, 0.048, 0.125, 0.006), M.c4, 0, 0, 0);
  for (const z of [-0.035, 0.035]) part(g, box(0.202, 0.049, 0.016, 0.002), M.tape, 0, 0, z);
  const lcd = document.createElement('canvas'); lcd.width = 256; lcd.height = 96; parts.lcd = lcd;
  const ctx = lcd.getContext('2d'); ctx.fillStyle = '#0d1a10'; ctx.fillRect(0, 0, 256, 96); ctx.fillStyle = '#5cff7a'; ctx.font = 'bold 64px monospace'; ctx.textAlign = 'center'; ctx.fillText('0:40', 128, 70);
  const tex = new THREE.CanvasTexture(lcd); tex.colorSpace = THREE.SRGBColorSpace; parts.lcdTex = tex;
  const screen = part(g, new THREE.PlaneGeometry(0.075, 0.028), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 1.1, roughness: 0.2 }), 0, 0.0245, 0.0, -Math.PI / 2, 0, 0);
  for (let i = 0; i < 12; i++) part(g, box(0.012, 0.004, 0.012, 0.001), M.rubber, -0.06 + (i % 4) * 0.02, 0.025, 0.035 + Math.floor(i / 4) * 0.014 - 0.03);
  const w1 = part(g, new THREE.TorusGeometry(0.03, 0.002, 6, 20, Math.PI * 1.3), M.wire, -0.05, 0.03, -0.03, Math.PI / 2, 0, 0.4); const w2 = part(g, new THREE.TorusGeometry(0.026, 0.002, 6, 20, Math.PI * 1.2), M.wireBlue, 0.055, 0.03, -0.02, Math.PI / 2, 0, 2.2);
  void w1; void w2;
  part(g, cylY(0.0025, 0.07, 6), M.darkMetal, 0.085, 0.055, 0.04);
  parts.led = part(g, new THREE.SphereGeometry(0.004, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff2a1a }), 0.09, 0.027, -0.045);
  return { group: g, muzzle: null, eject: null, parts, hands: { right: { p: [0.07, -0.03, 0.03], r: [0.2, 0.0, 0] }, left: { p: [-0.07, -0.03, 0.03], r: [0.2, 0, 0], support: true } }, length: 0.25 };
}


// ---------------------------------------------------------------------------------------------- new arsenal
/**
 * AWP (Accuracy International AW-style) and SSG 08 (via options): chassis stock with thumbhole and adjustable cheek
 * piece, round action with a bolt knob, heavy barrel with a ported brake, and a variable-power scope with turrets.
 */
function buildAWP(M, { stock = M.olivePoly, scopeLen = 0.3, scopeR = 0.022, barrel = 0.66, thumbhole = true } = {}) {
  const g = new THREE.Group(), parts = {};
  const front = -0.2 - barrel;
  // stock / chassis
  const body = thumbhole
    ? [[-0.3, 0.012], [0.04, 0.012], [0.062, 0.03], [0.14, 0.036], [0.33, 0.03], [0.404, 0.022], [0.41, -0.008], [0.41, -0.118], [0.396, -0.126], [0.33, -0.112], [0.25, -0.106], [0.2, -0.086], [0.172, -0.122], [0.152, -0.168], [0.128, -0.174], [0.09, -0.168], [0.072, -0.152], [0.062, -0.066], [0.03, -0.062], [-0.04, -0.064], [-0.062, -0.076], [-0.3, -0.064], [-0.31, -0.03]]
    : [[-0.24, 0.012], [0.04, 0.012], [0.08, 0.026], [0.33, 0.024], [0.384, 0.016], [0.39, -0.01], [0.39, -0.112], [0.376, -0.12], [0.3, -0.1], [0.19, -0.072], [0.14, -0.13], [0.12, -0.158], [0.088, -0.16], [0.07, -0.148], [0.062, -0.066], [0.03, -0.06], [-0.24, -0.052], [-0.25, -0.026]];
  const holes = thumbhole ? [[[0.094, -0.022], [0.16, -0.022], [0.17, -0.07], [0.154, -0.094], [0.104, -0.088]]] : [];
  part(g, slab(body, thumbhole ? 0.05 : 0.044, { r: 0.012, bevel: 0.008, holes, uv: 4 }), stock);
  part(g, slab([[0.15, 0.054], [0.33, 0.05], [0.336, 0.034], [0.15, 0.036]], 0.04, { r: 0.008, bevel: 0.006 }), stock);           // cheek piece
  for (const z of [0.2, 0.29]) part(g, rb(0.006, 0.02, 0.006, 0.002, 1), M.metal, 0, 0.042, z);                                    // cheek posts
  part(g, slab([[0.41, 0.022], [0.426, 0.022], [0.426, -0.122], [0.41, -0.122]], 0.05, { r: 0.006, bevel: 0.003 }), M.rubber);   // butt pad
  for (const z of [0.413, 0.418]) part(g, rb(0.051, 0.13, 0.002, 0.001, 1), M.darkMetal, 0, -0.05, z);                           // spacers
  // action: round receiver, Picatinny base, bolt with a big knob (reload cycles it), magazine, trigger guard
  part(g, tube([[0.075, 0.0], [0.072, 0.0175], [-0.19, 0.0175], [-0.2, 0.012], [-0.2, 0.0]], 22), M.darkMetal, 0, 0.03, 0);
  railTop(g, M.blackSteel, 0.046, 0.06, -0.19, 0.02);
  part(g, rb(0.002, 0.014, 0.08, 0.001, 1), M.blackSteel, 0.0178, 0.034, -0.02);                                                  // ejection port
  const bolt = new THREE.Group(); bolt.position.set(0.018, 0.032, 0.05); g.add(bolt); parts.bolt = bolt;
  part(bolt, tube([[0.03, 0.0], [0.028, 0.009], [-0.02, 0.009], [-0.022, 0.0]], 12), M.steel);
  part(bolt, pinX(0.0042, 0.04, 10), M.steel, 0.022, -0.012, 0.0, 0, 0, -0.45);
  part(bolt, new THREE.SphereGeometry(0.0115, 16, 12), M.blackSteel, 0.04, -0.026, 0.0);
  part(g, slab([[-0.02, -0.06], [-0.1, -0.06], [-0.1, -0.104], [-0.024, -0.104]], 0.036, { r: 0.004, bevel: 0.002 }), M.darkMetal);
  part(g, slab([[0.064, -0.06], [-0.004, -0.06], [-0.01, -0.088], [0.0, -0.096], [0.07, -0.094], [0.074, -0.072]], 0.012, { r: 0.005, bevel: 0.0008, holes: [[[0.058, -0.066], [0.004, -0.066], [0.002, -0.088], [0.064, -0.088]]] }), M.darkMetal);
  part(g, slab([[0.03, -0.062], [0.038, -0.062], [0.04, -0.08], [0.034, -0.086], [0.031, -0.078]], 0.006, { r: 0.002, bevel: 0.0006 }), M.metal);
  // heavy barrel (step + taper) and ported muzzle brake
  part(g, tube([[-0.2, 0.0135], [-0.32, 0.0128], [front + 0.02, 0.0108], [front, 0.0108]], 18), M.blackSteel, 0, 0.03, 0);
  part(g, tube([[front + 0.004, 0.0148], [front - 0.07, 0.0148], [front - 0.074, 0.0125], [front - 0.075, 0.0]], 18), M.darkMetal, 0, 0.03, 0);
  for (let i = 0; i < 3; i++) for (const s of [-1, 1]) part(g, rb(0.003, 0.013, 0.012, 0.001, 1), M.rubber, s * 0.0142, 0.03, front - 0.016 - i * 0.02);
  // scope: eyepiece bell, power ring, 30 mm tube, turret saddle with elevation / windage / parallax, objective bell
  const sc = new THREE.Group(); sc.position.set(0, 0.104, -0.03); g.add(sc);
  const L = scopeLen, R = scopeR, zr = L / 2 + 0.06, zo = -L / 2 - 0.08;
  part(sc, tube([[zr, 0.0], [zr - 0.002, R * 1.02], [zr - 0.04, R * 1.08], [zr - 0.055, R * 0.82], [zr - 0.07, R * 0.76], [zr - 0.085, R * 0.74], [zo + 0.08, R * 0.7], [zo + 0.055, R * 0.72], [zo + 0.02, R * 1.3], [zo + 0.002, R * 1.32], [zo, 0.0]], 26), M.blackSteel);
  for (let i = 0; i < 6; i++) part(sc, tube([[zr - 0.06 - i * 0.004, R * 0.84], [zr - 0.062 - i * 0.004, R * 0.84]], 26), M.darkMetal);           // power ring grip
  part(sc, rb(R * 1.7, R * 1.25, 0.06, 0.005, 2), M.blackSteel, 0, 0, -0.005);
  part(sc, uvBox(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.024, 20), 6), M.darkMetal, 0, R * 1.05, -0.005);                       // elevation
  part(sc, uvBox(new THREE.CylinderGeometry(R * 0.62, R * 0.62, 0.022, 20).rotateZ(Math.PI / 2), 6), M.darkMetal, R * 1.1, 0, -0.005);   // windage
  part(sc, uvBox(new THREE.CylinderGeometry(R * 0.55, R * 0.55, 0.018, 20).rotateZ(Math.PI / 2), 6), M.darkMetal, -R * 1.05, 0, -0.005); // parallax
  part(sc, new THREE.CircleGeometry(R * 1.25, 24), M.lens, 0, 0, zo - 0.0005, 0, Math.PI, 0);
  part(sc, new THREE.CircleGeometry(R * 0.95, 24), M.lens, 0, 0, zr + 0.0005);
  for (const z of [-L * 0.32, L * 0.25]) {
    part(sc, tube([[z + 0.012, R * 0.86], [z - 0.012, R * 0.86]], 20), M.darkMetal);
    part(sc, rb(0.022, 0.03, 0.022, 0.003, 2), M.darkMetal, 0, -R - 0.012, z);
    part(sc, pinX(0.0028, 0.03, 8), M.metal, 0, -R * 0.2, z);
  }
  return { group: g, muzzle: marker(g, 0, 0.03, front - 0.075, 'muzzle'), eject: marker(g, 0.03, 0.03, 0.0, 'eject'), parts, hands: {}, length: 1.3 };
}
const buildSSG = M => buildAWP(M, { stock: M.polymer, scopeLen: 0.26, scopeR: 0.02, barrel: 0.5, thumbhole: false });

function buildFamas(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.048, 0.088, 0.46, 0.006), M.olivePoly, 0, 0.0, 0.05);                                // bullpup body
  part(g, box(0.038, 0.03, 0.34, 0.006), M.olivePoly, 0, 0.078, 0.06);                               // carry handle
  part(g, box(0.042, 0.014, 0.05, 0.003), M.darkMetal, 0, 0.098, 0.2);                               // rear sight
  part(g, box(0.006, 0.026, 0.004, 0.0008), M.darkMetal, 0, 0.1, -0.11);
  part(g, cyl(0.0095, 0.32, 16), M.metal, 0, 0.022, -0.36);                                          // barrel
  part(g, box(0.038, 0.055, 0.12, 0.006), M.olivePoly, 0, 0.005, -0.22);                             // handguard
  part(g, cyl(0.016, 0.06, 14), M.darkMetal, 0, 0.022, -0.53);                                       // muzzle
  part(g, box(0.01, 0.028, 0.03, 0.002), M.darkMetal, 0, 0.05, -0.15);                               // front sight
  part(g, side([[-0.045, -0.04], [-0.005, -0.04], [0.02, -0.14], [-0.03, -0.145]], 0.03, 0.003), M.polymer, 0, 0, 0); // grip
  const tg = part(g, new THREE.TorusGeometry(0.03, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.058, -0.07); tg.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.04, 0.09, 0.014, 0.003), M.rubber, 0, -0.005, 0.29);                                 // butt
  const mag = new THREE.Group(); mag.position.set(0, -0.04, 0.115); g.add(mag); parts.mag = mag;
  part(mag, bananaMag(0, 0, 0.018, -0.14, 0.03, 0.04, 0.03), M.polymer, 0, 0, 0);
  part(g, box(0.006, 0.014, 0.03, 0.001), M.metal, 0.026, 0.03, 0.0, 0, 0, 0, 'bolt'); parts.bolt = g.getObjectByName('bolt');
  return { group: g, muzzle: marker(g, 0, 0.022, -0.575, 'muzzle'), eject: marker(g, -0.028, 0.03, 0.12, 'eject'), parts, hands: {}, length: 0.9 };
}

function buildSMG(M, kind) {
  const g = new THREE.Group(), parts = {}, mac = kind === 'mac10';
  if (mac) {
    part(g, box(0.05, 0.078, 0.2, 0.005), M.blackSteel, 0, 0.0, -0.06);                              // boxy receiver
    part(g, box(0.052, 0.012, 0.2, 0.003), M.darkMetal, 0, 0.044, -0.06);
    part(g, cyl(0.014, 0.16, 16), M.darkMetal, 0, 0.012, -0.24);                                     // barrel shroud
    part(g, cyl(0.021, 0.11, 16), M.blackSteel, 0, 0.012, -0.36);                                    // suppressor
    for (let i = 0; i < 4; i++) part(g, cyl(0.0215, 0.004, 16), M.darkMetal, 0, 0.012, -0.32 - i * 0.026);
    part(g, side([[-0.02, -0.03], [0.03, -0.03], [0.05, -0.135], [0.0, -0.14]], 0.032, 0.003), M.polymer, 0, 0, 0);
    for (const [z, y] of [[0.09, 0.03], [0.18, 0.03]]) part(g, cyl(0.004, 0.09, 6), M.steel, 0, y - 0.01, z + 0.02, 0, 0, 0);
    part(g, box(0.018, 0.09, 0.008, 0.002), M.steel, 0, 0.0, 0.16);                                  // folded wire stock
    part(g, box(0.028, 0.04, 0.01, 0.002), M.darkMetal, 0, -0.02, 0.2);
    const mag = new THREE.Group(); mag.position.set(0, -0.14, 0.01); g.add(mag); parts.mag = mag; part(mag, box(0.024, 0.01, 0.036, 0.002), M.blackSteel);
    part(g, box(0.004, 0.02, 0.006, 0.001), M.darkMetal, 0, -0.03, -0.005);
  } else {
    part(g, box(0.042, 0.07, 0.24, 0.006), M.polymer, 0, 0.0, -0.05);                                // polymer receiver
    part(g, box(0.03, 0.014, 0.28, 0.002), M.darkMetal, 0, 0.042, -0.05);                            // top rail
    for (let i = 0; i < 12; i++) part(g, box(0.032, 0.005, 0.005, 0.0005), M.darkMetal, 0, 0.05, -0.17 + i * 0.02);
    part(g, cyl(0.0125, 0.11, 16), M.darkMetal, 0, 0.015, -0.24);                                    // shroud
    part(g, cyl(0.0185, 0.1, 16), M.blackSteel, 0, 0.015, -0.32);                                    // suppressor
    part(g, side([[-0.02, -0.035], [0.035, -0.035], [0.06, -0.14], [0.005, -0.145]], 0.032, 0.003), M.polymer, 0, 0, 0);
    part(g, box(0.008, 0.014, 0.16, 0.002), M.darkMetal, 0, -0.03, -0.135);                          // foregrip rail
    part(g, cyl(0.004, 0.16, 6), M.steel, 0, 0.0, 0.2);                                              // skeletal stock
    part(g, box(0.03, 0.06, 0.01, 0.002), M.rubber, 0, -0.005, 0.29);
    for (const y of [0.028, -0.028]) part(g, box(0.006, 0.006, 0.19, 0.001), M.darkMetal, 0, y, 0.19);
    const mag = new THREE.Group(); mag.position.set(0, -0.14, 0.015); g.add(mag); parts.mag = mag; part(mag, box(0.026, 0.01, 0.038, 0.002), M.polymer);
    part(g, box(0.004, 0.02, 0.006, 0.001), M.darkMetal, 0, -0.03, -0.005);
  }
  const tg = part(g, new THREE.TorusGeometry(0.026, 0.003, 6, 18, Math.PI), M.darkMetal, 0, -0.035, -0.045); tg.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.006, 0.014, 0.03, 0.001), M.metal, 0.026, 0.035, -0.02, 0, 0, 0, 'bolt'); parts.bolt = g.getObjectByName('bolt');
  return { group: g, muzzle: marker(g, 0, 0.015, mac ? -0.42 : -0.375, 'muzzle'), eject: marker(g, 0.03, 0.035, -0.02, 'eject'), parts, hands: {}, length: 0.6 };
}

function buildNova(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.044, 0.07, 0.24, 0.005), M.darkMetal, 0, 0.0, -0.02);                                // receiver
  part(g, cyl(0.0125, 0.62, 18), M.blackSteel, 0, 0.032, -0.44);                                     // barrel
  part(g, cyl(0.0118, 0.56, 18), M.blackSteel, 0, 0.0, -0.4);                                        // magazine tube
  part(g, cyl(0.0135, 0.014, 18), M.darkMetal, 0, 0.0, -0.69);                                       // tube cap
  part(g, box(0.004, 0.016, 0.004, 0.0008), M.steel, 0, 0.056, -0.745);                              // bead
  part(g, cyl(0.004, 0.62, 6), M.darkMetal, 0, 0.049, -0.44);                                        // rib
  const pump = new THREE.Group(); g.add(pump); parts.pump = pump;                                    // pump forend
  part(pump, box(0.05, 0.046, 0.19, 0.01), M.polymer, 0, 0.0, -0.31);
  for (let i = 0; i < 9; i++) part(pump, box(0.052, 0.036, 0.003, 0.0006), M.rubber, 0, 0.0, -0.4 + i * 0.02);
  part(g, side([[0.12, 0.03], [0.34, 0.032], [0.4, 0.0], [0.4, -0.09], [0.32, -0.06], [0.12, -0.03]], 0.04, 0.004), M.polymer, 0, 0, 0);      // straight stock
  part(g, box(0.038, 0.092, 0.014, 0.003), M.rubber, 0, -0.03, 0.404);
  const tg = part(g, new THREE.TorusGeometry(0.03, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.05, 0.03); tg.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.004, 0.02, 0.006, 0.001), M.darkMetal, 0, -0.03, 0.038);
  part(g, box(0.008, 0.012, 0.05, 0.001), M.steel, 0.0225, 0.03, -0.02);                             // loading port
  return { group: g, muzzle: marker(g, 0, 0.032, -0.76, 'muzzle'), eject: marker(g, 0.028, 0.03, -0.02, 'eject'), parts, hands: {}, length: 1.1 };
}

/** Pistol family sharing the Glock construction: slide length/material, frame, grip, optional suppressor / forward magazine. */
const buildUSP = M => buildPistol(M, { slideLen: 0.205, slide: M.silver, top: M.steel, suppressor: true });
const buildP250 = M => buildPistol(M, { slideLen: 0.19, slide: M.silver, frame: M.tanPoly, top: M.steel });
const buildFiveSeven = M => buildPistol(M, { slideLen: 0.215, slide: M.blackSteel, frame: M.tanPoly, top: M.darkMetal, hammer: true });
const buildTec9 = M => buildPistol(M, { slideLen: 0.22, slide: M.blackSteel, frame: M.polymer, top: M.darkMetal, forwardMag: true });

function buildMolotov(M) {
  const g = new THREE.Group(), parts = {};
  const profile = [[0, 0], [0.034, 0.002], [0.04, 0.03], [0.042, 0.075], [0.032, 0.11], [0.018, 0.135], [0.014, 0.17], [0.016, 0.19], [0.012, 0.195]].map(([r, y]) => V2(r, y - 0.09));
  part(g, project(new THREE.LatheGeometry(profile, 20), 6), M.glass, 0, 0, 0);
  part(g, project(new THREE.LatheGeometry(profile.slice(0, 5).map(v => V2(v.x * 0.9, v.y)), 20), 6), M.fuel, 0, 0, 0);
  part(g, cylY(0.0125, 0.06, 10), M.rag, 0, 0.115, 0).scale.set(1, 1, 1);                            // rag wick
  const flame = new THREE.Group(); flame.position.set(0, 0.16, 0); g.add(flame); parts.flame = flame;
  for (const [r, h, y] of [[0.013, 0.04, 0.02], [0.008, 0.03, 0.034]]) { const c = new THREE.Mesh(new THREE.ConeGeometry(r, h, 12), M.flame); c.position.y = y; flame.add(c); }
  part(g, cylY(0.033, 0.004, 20), M.rag, 0, -0.06, 0);                                               // label band
  const label = part(g, cylY(0.0425, 0.03, 20), M.rag, 0, 0.03, 0); label.scale.set(1, 1, 1);
  return { group: g, muzzle: null, eject: null, parts, hands: {}, length: 0.28 };
}
function grenadeCan(M, { r, h, body, band, cap }) {
  const g = new THREE.Group(), parts = {};
  part(g, cylY(r, h, 24), body, 0, 0, 0);
  part(g, cylY(r * 1.02, 0.012, 24), band, 0, h * 0.25, 0);
  part(g, cylY(r * 0.75, 0.02, 20), cap, 0, h / 2 + 0.01, 0);
  part(g, cylY(r * 1.02, 0.01, 24), M.rubber, 0, -h / 2 + 0.005, 0);
  const lever = part(g, side([[0.0, 0.0], [0.012, 0.0], [0.012, -h * 0.85], [0.006, -h * 0.9], [0.0, -h * 0.8]], 0.008, 0.001), M.steel, 0, h / 2 + 0.02, r * 0.85); parts.lever = lever; lever.rotation.y = Math.PI;
  parts.pin = part(g, new THREE.TorusGeometry(0.011, 0.0015, 6, 16), M.steel, 0.02, h / 2 + 0.014, 0, 0, Math.PI / 2, 0);
  return { group: g, muzzle: null, eject: null, parts, hands: {}, length: 0.2 };
}
const buildIncendiary = M => grenadeCan(M, { r: 0.029, h: 0.135, body: M.incRed, band: M.accent, cap: M.blackSteel });
const buildDecoy = M => grenadeCan(M, { r: 0.028, h: 0.12, body: M.decoyYellow, band: M.rubber, cap: M.darkMetal });

// ---------------------------------------------------------------------------------------------- arsenal expansion
/** Picatinny rail with teeth along z. */
function rail(g, M, x, y, z0, z1, w = 0.024) {
  part(g, box(w, 0.008, z1 - z0, 0.001), M.darkMetal, x, y, (z0 + z1) / 2);
  for (let z = z0 + 0.006; z < z1 - 0.004; z += 0.012) part(g, box(w + 0.004, 0.005, 0.005, 0.0005), M.darkMetal, x, y + 0.006, z);
}
/** Tube scope with rings: centre height y, from z0 (eyepiece) to z1 (objective). */
function scopeTube(g, M, y, z0, z1, r = 0.018) {
  const len = z0 - z1, mid = (z0 + z1) / 2;
  part(g, cyl(r, len * 0.6, 20), M.blackSteel, 0, y, mid);
  part(g, cyl(r * 1.4, len * 0.22, 20, r * 1.05), M.blackSteel, 0, y, z1 + len * 0.11);
  part(g, cyl(r * 1.25, len * 0.18, 20, r), M.blackSteel, 0, y, z0 - len * 0.09);
  part(g, new THREE.CircleGeometry(r * 1.3, 20), M.lens, 0, y, z1 - 0.001, 0, Math.PI, 0);
  for (const z of [mid - len * 0.15, mid + len * 0.15]) part(g, box(r * 1.6, 0.03, 0.018, 0.003), M.darkMetal, 0, y - r - 0.012, z);
}
function buildM4A1S(M) {
  const rig = buildM4A4(M), g = rig.group;
  const can = new THREE.Group(); can.name = 'suppressor'; g.add(can); rig.parts.suppressor = can;
  part(can, cyl(0.0175, 0.2, 20), M.blackSteel, 0, 0.03, -0.69);                        // suppressor
  for (let i = 0; i < 3; i++) part(can, cyl(0.018, 0.004, 20), M.darkMetal, 0, 0.03, -0.62 - i * 0.05);
  part(can, cyl(0.0182, 0.012, 20), M.darkMetal, 0, 0.03, -0.595);
  rig.bareMuzzleZ = rig.muzzle.position.z; rig.muzzle.position.z = -0.8; rig.suppressed = true;
  return rig;
}
function buildAUG(M) {
  const g = new THREE.Group(), parts = {};
  part(g, side([[-0.28, 0.03], [0.02, 0.035], [0.3, 0.02], [0.32, -0.02], [0.3, -0.07], [0.12, -0.075], [0.02, -0.04], [-0.28, -0.02]], 0.05, 0.008), M.olivePoly, 0, 0, 0); // bullpup stock body
  part(g, box(0.042, 0.03, 0.3, 0.004), M.darkMetal, 0, 0.045, -0.12);                   // receiver top
  scopeTube(g, M, 0.1, 0.04, -0.2, 0.016);
  part(g, box(0.03, 0.05, 0.24, 0.006), M.olivePoly, 0, 0.07, -0.08);                    // scope housing
  part(g, cyl(0.0115, 0.32, 16), M.metal, 0, 0.01, -0.42);                               // barrel
  part(g, cyl(0.015, 0.05, 14), M.darkMetal, 0, 0.01, -0.6);
  part(g, side([[-0.24, -0.03], [-0.2, -0.03], [-0.19, -0.14], [-0.23, -0.14]], 0.03, 0.004), M.olivePoly, 0, 0, 0);   // vertical foregrip
  part(g, side([[-0.04, -0.035], [0.01, -0.035], [0.03, -0.14], [-0.02, -0.14]], 0.03, 0.004), M.olivePoly, 0, 0, 0);  // pistol grip
  part(g, side([[-0.26, -0.03], [0.04, -0.03], [0.05, -0.045], [-0.25, -0.05]], 0.052, 0.004), M.olivePoly, 0, 0, 0); // trigger guard shroud
  const mag = new THREE.Group(); mag.position.set(0, -0.06, 0.12); g.add(mag); parts.mag = mag;
  part(mag, bananaMag(0, 0, 0.01, -0.13, 0.02, 0.04, 0.03), M.glass, 0, 0, 0);          // translucent mag
  part(g, box(0.006, 0.014, 0.03, 0.001), M.metal, 0.028, 0.03, 0.05, 0, 0, 0, 'bolt'); parts.bolt = g.getObjectByName('bolt');
  part(g, box(0.042, 0.1, 0.014, 0.003), M.rubber, 0, -0.02, 0.325);
  return { group: g, muzzle: marker(g, 0, 0.01, -0.63, 'muzzle'), eject: marker(g, 0.03, 0.02, 0.12, 'eject'), parts, hands: {}, length: 0.9 };
}
function buildSG553(M) {
  const rig = buildAKFamilyLike(M, { stockFold: true, furniture: M.polymer }), g = rig.group;
  scopeTube(g, M, 0.105, 0.02, -0.16, 0.015);
  part(g, box(0.03, 0.03, 0.18, 0.004), M.darkMetal, 0, 0.07, -0.07);
  return rig;
}
/** AK-shaped rifle with polymer furniture (SG 553 base): side-folding skeleton stock, gas tube, curved mag. */
function buildAKFamilyLike(M, { furniture }) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.042, 0.068, 0.27, 0.005), M.blackSteel, 0, 0.0, -0.03);
  part(g, box(0.04, 0.02, 0.25, 0.006), M.darkMetal, 0, 0.04, -0.03);
  part(g, cyl(0.0105, 0.24, 14), M.metal, 0, 0.05, -0.34);
  part(g, cyl(0.009, 0.33, 16), M.metal, 0, 0.012, -0.48);
  part(g, box(0.05, 0.05, 0.2, 0.01, 5), furniture, 0, 0.005, -0.3);
  for (let i = 0; i < 5; i++) part(g, box(0.052, 0.006, 0.012, 0.001), M.rubber, 0, 0.03, -0.37 + i * 0.035);
  part(g, cyl(0.0135, 0.07, 14), M.darkMetal, 0, 0.012, -0.68);
  part(g, side([[0.045, -0.03], [0.078, -0.03], [0.098, -0.145], [0.068, -0.15], [0.05, -0.075]], 0.034, 0.003), furniture, 0, 0, 0);
  for (const y of [0.03, -0.03]) part(g, box(0.012, 0.012, 0.24, 0.002), M.darkMetal, 0, y, 0.22);          // skeleton stock tubes
  part(g, box(0.035, 0.095, 0.02, 0.004), furniture, 0, 0.0, 0.34);
  const trig = part(g, new THREE.TorusGeometry(0.03, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.06, 0.005); trig.rotation.set(0, Math.PI / 2, Math.PI);
  const mag = new THREE.Group(); mag.position.set(0, -0.03, -0.05); g.add(mag); parts.mag = mag;
  part(mag, bananaMag(0, 0, -0.03, -0.18, -0.06, 0.042, 0.03), M.polymer, 0, 0, 0);
  parts.bolt = part(g, box(0.008, 0.008, 0.02, 0.001), M.metal, 0.028, 0.015, -0.03);
  return { group: g, muzzle: marker(g, 0, 0.012, -0.72, 'muzzle'), eject: marker(g, 0.03, 0.02, -0.05, 'eject'), parts, hands: {}, length: 1 };
}
function buildUMP(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.046, 0.075, 0.3, 0.008), M.polymer, 0, 0.0, -0.08);                       // boxy receiver
  rail(g, M, 0, 0.042, -0.2, 0.05);
  part(g, cyl(0.012, 0.09, 16), M.metal, 0, 0.012, -0.27);
  part(g, cyl(0.016, 0.03, 14), M.darkMetal, 0, 0.012, -0.325);
  for (let i = 0; i < 4; i++) part(g, box(0.048, 0.008, 0.02, 0.002), M.rubber, 0, 0.0, -0.2 + i * 0.03);
  part(g, side([[-0.01, -0.035], [0.04, -0.035], [0.06, -0.14], [0.015, -0.145]], 0.032, 0.004), M.polymer, 0, 0, 0);
  part(g, side([[0.07, 0.03], [0.2, 0.03], [0.3, 0.02], [0.3, -0.06], [0.2, -0.02], [0.07, -0.02]], 0.03, 0.004), M.polymer, 0, 0, 0);   // folding stock
  const mag = new THREE.Group(); mag.position.set(0, -0.035, -0.09); g.add(mag); parts.mag = mag;
  part(mag, side([[0.0, 0], [0.04, 0], [0.034, -0.17], [-0.004, -0.17]], 0.03, 0.003), M.polymer, 0, 0, 0);          // straight mag
  const trig = part(g, new THREE.TorusGeometry(0.024, 0.0032, 6, 18, Math.PI), M.polymer, 0, -0.045, -0.02); trig.rotation.set(0, Math.PI / 2, Math.PI);
  parts.bolt = part(g, box(0.008, 0.012, 0.03, 0.001), M.metal, -0.026, 0.03, -0.15);
  return { group: g, muzzle: marker(g, 0, 0.012, -0.345, 'muzzle'), eject: marker(g, 0.03, 0.03, -0.05, 'eject'), parts, hands: {}, length: 0.7 };
}
/** FN P90: bullpup with the 50-round translucent magazine lying on top, the ring-sight housing over the front, an
 *  ambidextrous trigger guard formed by two openings in the one-piece stock (rear thumbhole for the firing hand, front
 *  hand stop for the support hand), short barrel with a flash hider, charging handles on both sides. Muzzle -Z. */
function buildP90(M) {
  const g = new THREE.Group(), parts = {};
  // one-piece polymer stock with the two hand openings
  part(g, slab([[0.27, 0.03], [0.25, 0.05], [-0.17, 0.05], [-0.215, 0.038], [-0.235, 0.008], [-0.236, -0.03], [-0.218, -0.118], [-0.192, -0.136], [-0.13, -0.136],
    [-0.06, -0.142], [0.0, -0.142], [0.03, -0.122], [0.13, -0.102], [0.22, -0.092], [0.262, -0.062]], 0.058, { r: 0.012, bevel: 0.008, uv: 6,
    holes: [[[-0.192, -0.03], [-0.128, -0.03], [-0.122, -0.104], [-0.186, -0.11]], [[-0.03, -0.036], [0.112, -0.042], [0.11, -0.084], [0.0, -0.112], [-0.026, -0.102]]] }), M.polymer);
  // grip column texture (stippled panel) on both sides
  // receiver flat on top, magazine well rails
  part(g, rb(0.05, 0.006, 0.36, 0.002, 1), M.blackSteel, 0, 0.052, -0.01);
  for (const s_ of [-1, 1]) part(g, rb(0.004, 0.024, 0.33, 0.0015, 1), M.darkMetal, s_ * 0.024, 0.064, -0.01);
  // 50-round magazine on top: smoked translucent body, cartridges visible inside, black follower / feed lips
  const mag = new THREE.Group(); mag.position.set(0, 0.066, -0.01); g.add(mag); parts.mag = mag;
  part(mag, rb(0.044, 0.026, 0.33, 0.006, 3), M.blackSteel);                                   // smoked body
  for (const s_ of [-1, 1]) part(mag, rb(0.002, 0.012, 0.26, 0.001, 1), M.lens, s_ * 0.0222, 0.002, 0);   // window strips
  for (let i = 0; i < 2; i++) part(mag, cyl(0.0035, 0.26, 8), M.accent, (i ? 1 : -1) * 0.009, 0.0, 0);   // cartridges seen through the window
  part(mag, rb(0.046, 0.03, 0.02, 0.004, 2), M.polymer, 0, 0.0, 0.16);
  part(mag, rb(0.046, 0.03, 0.03, 0.004, 2), M.polymer, 0, 0.0, -0.15);
  // ring sight housing over the front of the magazine, backup iron notches on the sides of the housing
  part(g, slab([[-0.055, 0.079], [-0.165, 0.079], [-0.175, 0.098], [-0.15, 0.122], [-0.07, 0.122], [-0.05, 0.1]], 0.05, { r: 0.008, bevel: 0.004 }), M.polymer);
  part(g, cyl(0.016, 0.004, 20), M.blackSteel, 0, 0.104, -0.168, 0, 0, 0); part(g, new THREE.CircleGeometry(0.014, 20), M.lens, 0, 0.104, -0.171, 0, Math.PI, 0);
  part(g, cyl(0.016, 0.004, 20), M.blackSteel, 0, 0.104, -0.052, 0, 0, 0); part(g, new THREE.CircleGeometry(0.014, 20), M.lens, 0, 0.104, -0.049, 0, 0, 0);
  for (const s_ of [-1, 1]) part(g, rb(0.004, 0.014, 0.012, 0.001, 1), M.blackSteel, s_ * 0.027, 0.112, -0.11);
  // barrel and flash hider out of the front of the stock
  part(g, cyl(0.0105, 0.075, 16), M.blackSteel, 0, 0.012, -0.27);
  part(g, tube([[-0.3, 0.0135], [-0.336, 0.0135], [-0.338, 0.011]]), M.darkMetal, 0, 0.012, 0);
  for (let i = 0; i < 4; i++) part(g, rb(0.003, 0.004, 0.028, 0.0008, 1), M.blackSteel, Math.cos(i * 1.57 + 0.78) * 0.0135, 0.012 + Math.sin(i * 1.57 + 0.78) * 0.0135, -0.322, 0, 0, i * 1.57 + 0.78);
  // trigger inside the rear opening, rotary fire selector disc under it, charging handles (bolt) on both sides
  part(g, slab([[-0.028, -0.04], [-0.02, -0.04], [-0.018, -0.07], [-0.024, -0.075], [-0.027, -0.068]], 0.007, { r: 0.002, bevel: 0.0006 }), M.metal);
  part(g, cyl(0.011, 0.006, 16), M.darkMetal, 0, -0.118, -0.01, Math.PI / 2, 0, 0);
  const bolt = new THREE.Group(); bolt.position.set(0, 0.02, -0.13); g.add(bolt); parts.bolt = bolt;
  for (const s_ of [-1, 1]) part(bolt, rb(0.012, 0.012, 0.018, 0.004, 2), M.darkMetal, s_ * 0.034, 0, 0);
  // ejection chute underneath (casings go down), rear sling loop
  part(g, rb(0.022, 0.003, 0.05, 0.001, 1), M.blackSteel, 0, -0.096, 0.17);
  part(g, new THREE.TorusGeometry(0.008, 0.0018, 6, 14), M.metal, 0, -0.06, 0.262, 0, Math.PI / 2, 0);
  return { group: g, muzzle: marker(g, 0, 0.012, -0.34, 'muzzle'), eject: marker(g, 0, -0.1, 0.17, 'eject'), parts, hands: {}, length: 0.62 };
}
function buildMP7(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.042, 0.06, 0.22, 0.008), M.polymer, 0, 0.005, -0.06);
  rail(g, M, 0, 0.04, -0.17, 0.05);
  part(g, box(0.02, 0.03, 0.05, 0.004), M.blackSteel, 0, 0.065, -0.02);                   // red dot
  part(g, cyl(0.01, 0.07, 16), M.metal, 0, 0.012, -0.2);
  part(g, cyl(0.015, 0.03, 14), M.darkMetal, 0, 0.012, -0.245);
  part(g, side([[-0.19, -0.02], [-0.16, -0.02], [-0.155, -0.11], [-0.185, -0.11]], 0.026, 0.004), M.polymer, 0, 0, 0);   // folding foregrip
  part(g, side([[-0.005, -0.03], [0.04, -0.03], [0.055, -0.15], [0.01, -0.155]], 0.032, 0.004), M.polymer, 0, 0, 0);
  for (const y of [0.02, -0.01]) part(g, box(0.008, 0.008, 0.16, 0.002), M.darkMetal, 0.018, y, 0.12);
  part(g, box(0.04, 0.06, 0.015, 0.004), M.polymer, 0, 0.005, 0.2);
  const mag = new THREE.Group(); mag.position.set(0, -0.15, 0.03); g.add(mag); parts.mag = mag; part(mag, box(0.026, 0.02, 0.04, 0.004), M.polymer);
  const trig = part(g, new THREE.TorusGeometry(0.022, 0.003, 6, 18, Math.PI), M.polymer, 0, -0.03, -0.035); trig.rotation.set(0, Math.PI / 2, Math.PI);
  parts.bolt = part(g, box(0.02, 0.01, 0.02, 0.001), M.metal, 0, 0.045, 0.06);
  return { group: g, muzzle: marker(g, 0, 0.012, -0.26, 'muzzle'), eject: marker(g, 0.03, 0.03, -0.02, 'eject'), parts, hands: {}, length: 0.5 };
}
function buildShotgunFamily(M, kind) {
  const g = new THREE.Group(), parts = {};
  const short = kind === 'sawedoff', mag7 = kind === 'mag7', barrel = short ? 0.3 : mag7 ? 0.36 : 0.56;
  part(g, box(0.046, 0.075, mag7 ? 0.2 : 0.24, 0.006), mag7 ? M.polymer : M.blackSteel, 0, 0.0, -0.02);
  part(g, cyl(0.013, barrel, 18), M.blackSteel, 0, 0.034, -0.14 - barrel / 2);
  if (!mag7) part(g, cyl(0.0122, barrel - 0.06, 18), M.blackSteel, 0, 0.0, -0.11 - barrel / 2);
  part(g, box(0.004, 0.014, 0.004, 0.0008), M.steel, 0, 0.056, -0.14 - barrel + 0.01);
  const pump = new THREE.Group(); g.add(pump); parts.pump = pump;
  if (kind !== 'xm1014') {
    part(pump, box(0.05, 0.05, 0.16, 0.01), short ? M.wood : M.polymer, 0, 0.0, -0.26);
    for (let i = 0; i < 7; i++) part(pump, box(0.052, 0.04, 0.003, 0.0006), M.rubber, 0, 0.0, -0.32 + i * 0.02);
  } else part(g, box(0.05, 0.046, 0.2, 0.01), M.polymer, 0, 0.0, -0.26);                  // fixed forend (semi-auto)
  if (short) part(g, side([[0.03, 0.02], [0.08, 0.02], [0.12, -0.12], [0.06, -0.13], [0.03, -0.04]], 0.04, 0.005), M.wood, 0, 0, 0);          // pistol grip wood
  else part(g, side([[0.08, 0.03], [0.3, 0.035], [0.37, 0.0], [0.37, -0.09], [0.28, -0.06], [0.16, -0.05], [0.1, -0.13], [0.06, -0.13], [0.06, -0.03]], 0.04, 0.005), M.polymer, 0, 0, 0);
  if (!short) part(g, box(0.038, 0.094, 0.014, 0.003), M.rubber, 0, -0.03, 0.374);
  if (mag7) { const mag = new THREE.Group(); mag.position.set(0, -0.04, -0.02); g.add(mag); parts.mag = mag; part(mag, box(0.04, 0.13, 0.05, 0.004), M.polymer, 0, -0.065, 0); }
  const tg = part(g, new THREE.TorusGeometry(0.028, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.05, 0.03); tg.rotation.set(0, Math.PI / 2, Math.PI);
  parts.bolt = part(g, box(0.008, 0.012, 0.05, 0.001), M.steel, 0.0235, 0.02, -0.02);
  return { group: g, muzzle: marker(g, 0, 0.034, -0.14 - barrel - 0.01, 'muzzle'), eject: marker(g, 0.028, 0.03, -0.02, 'eject'), parts, hands: {}, length: short ? 0.7 : 1.1 };
}
function buildNegev(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.056, 0.09, 0.34, 0.006), M.blackSteel, 0, 0.0, -0.06);
  part(g, box(0.05, 0.03, 0.28, 0.006), M.darkMetal, 0, 0.058, -0.06);                    // feed cover
  part(g, cyl(0.013, 0.46, 18), M.metal, 0, 0.018, -0.46);
  for (let i = 0; i < 10; i++) part(g, cyl(0.017, 0.012, 16), M.darkMetal, 0, 0.018, -0.3 - i * 0.03);    // barrel cooling rings
  part(g, cyl(0.018, 0.06, 14), M.darkMetal, 0, 0.018, -0.71);
  part(g, box(0.02, 0.06, 0.03, 0.004), M.darkMetal, 0, 0.085, -0.02);                    // carry handle posts
  part(g, box(0.02, 0.012, 0.16, 0.004), M.darkMetal, 0, 0.12, -0.08);
  for (const s of [-1, 1]) part(g, box(0.008, 0.01, 0.22, 0.002), M.darkMetal, s * 0.022, -0.012, -0.55, 0, 0, 0);           // folded bipod legs under the barrel
  part(g, side([[0.02, -0.04], [0.06, -0.04], [0.085, -0.15], [0.05, -0.155], [0.03, -0.075]], 0.036, 0.004), M.polymer, 0, 0, 0);
  part(g, side([[0.11, 0.035], [0.3, 0.03], [0.38, 0.0], [0.38, -0.09], [0.3, -0.07], [0.11, -0.04]], 0.04, 0.005), M.polymer, 0, 0, 0);
  const mag = new THREE.Group(); mag.position.set(-0.02, -0.05, -0.08); g.add(mag); parts.mag = mag;
  part(mag, box(0.06, 0.12, 0.13, 0.008), M.oliveMetal, -0.04, -0.06, 0);                  // ammo box
  part(mag, box(0.03, 0.01, 0.1, 0.002), M.accent, 0.0, 0.0, 0);                           // belt
  const tg = part(g, new THREE.TorusGeometry(0.03, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.07, 0.0); tg.rotation.set(0, Math.PI / 2, Math.PI);
  parts.bolt = part(g, box(0.008, 0.014, 0.04, 0.001), M.steel, 0.032, 0.02, -0.12);
  return { group: g, muzzle: marker(g, 0, 0.018, -0.75, 'muzzle'), eject: marker(g, 0.035, 0.0, -0.05, 'eject'), parts, hands: {}, length: 1.2 };
}
const buildCZ75 = M => buildPistol(M, { slideLen: 0.2, slide: M.blackSteel, frame: M.darkMetal, top: M.steel, hammer: true });
function buildR8(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.028, 0.05, 0.1, 0.004), M.silver, 0, 0.02, -0.03);                         // frame
  const cylinder = new THREE.Group(); cylinder.position.set(0, 0.022, -0.04); g.add(cylinder); parts.cylinder = cylinder;
  part(cylinder, cyl(0.022, 0.05, 16), M.silver, 0, 0, 0);
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2; part(cylinder, cyl(0.004, 0.051, 8), M.darkMetal, Math.cos(a) * 0.014, Math.sin(a) * 0.014, 0); }
  part(g, cyl(0.009, 0.16, 16), M.silver, 0, 0.034, -0.17);                                // barrel
  part(g, box(0.014, 0.012, 0.16, 0.002), M.silver, 0, 0.046, -0.17);                      // rib
  part(g, box(0.004, 0.014, 0.01, 0.001), M.darkMetal, 0, 0.056, -0.24);
  part(g, box(0.008, 0.016, 0.02, 0.002), M.darkMetal, 0, 0.05, 0.03);                     // hammer
  part(g, side([[0.0, 0.0], [0.045, 0.0], [0.075, -0.11], [0.03, -0.12], [0.0, -0.04]], 0.032, 0.004), M.wood, 0, 0, 0.0);
  const tg = part(g, new THREE.TorusGeometry(0.02, 0.003, 6, 18, Math.PI), M.silver, 0, -0.008, -0.03); tg.rotation.set(0, Math.PI / 2, Math.PI);
  parts.mag = cylinder;
  return { group: g, muzzle: marker(g, 0, 0.034, -0.255, 'muzzle'), eject: null, parts, hands: {}, length: 0.35 };
}

// ---------------------------------------------------------------------------------------------- hand poses (weapon-local)
const R = Math.PI / 2;
// p: palm centre, r: euler (roll about the finger axis first), elbow: sleeve target, grip: finger curl preset
const HANDS = {
  ak47: { right: { p: [0.033, -0.088, 0.088], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.62], grip: 'grip' }, left: { p: [0, -0.07, -0.29], r: [0.1, 0.15, 2.2], elbow: [-0.3, -0.36, 0.5], grip: 'wrap' } },
  m4a4: { right: { p: [0.033, -0.09, 0.05], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.6], grip: 'grip' }, left: { p: [-0.012, -0.035, -0.29], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.5], grip: 'wrap' } },
  awp: { right: { p: [0.033, -0.1, 0.115], r: [0.15, 0.12, -R], elbow: [0.14, -0.42, 0.62], grip: 'grip' }, left: { p: [-0.01, -0.094, -0.17], r: [0.1, 0.1, 2.5], elbow: [-0.3, -0.38, 0.5], grip: 'wrap' } },
  ssg08: { right: { p: [0.033, -0.09, 0.07], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.6], grip: 'grip' }, left: { p: [-0.01, -0.088, -0.16], r: [0.1, 0.1, 2.5], elbow: [-0.3, -0.38, 0.5], grip: 'wrap' } },
  famas: { right: { p: [0.033, -0.085, -0.055], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.55], grip: 'grip' }, left: { p: [-0.012, -0.03, -0.22], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.4], grip: 'wrap' } },
  mp9: { right: { p: [0.033, -0.085, 0.005], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.55], grip: 'grip' }, left: { p: [-0.012, -0.03, -0.15], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.45], grip: 'wrap' } },
  mac10: { right: { p: [0.033, -0.085, 0.015], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.55], grip: 'grip' }, left: { p: [-0.012, -0.025, -0.13], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.45], grip: 'wrap' } },
  nova: { right: { p: [0.033, -0.04, 0.09], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.6], grip: 'grip' }, left: { p: [-0.006, -0.055, -0.31], r: [0.1, 0.1, 2.5], elbow: [-0.3, -0.38, 0.4], grip: 'wrap' } },
  aug: { right: { p: [0.033, -0.09, 0.0], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.55], grip: 'grip' }, left: { p: [0.0, -0.1, -0.215], r: [0.15, 0.12, -R], elbow: [-0.28, -0.4, 0.35], grip: 'grip' } },
  p90: { right: { p: [0.033, -0.075, -0.06], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.5], grip: 'grip' }, left: { p: [-0.02, -0.07, -0.2], r: [0.1, 0.15, 2.2], elbow: [-0.3, -0.36, 0.3], grip: 'wrap' } },
  mp7: { right: { p: [0.033, -0.09, 0.03], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.55], grip: 'grip' }, left: { p: [0.0, -0.08, -0.17], r: [0.15, 0.12, -R], elbow: [-0.28, -0.4, 0.35], grip: 'grip' } },
  ump: { right: { p: [0.033, -0.09, 0.03], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.55], grip: 'grip' }, left: { p: [-0.012, -0.03, -0.18], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.4], grip: 'wrap' } },
  negev: { right: { p: [0.033, -0.095, 0.06], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.6], grip: 'grip' }, left: { p: [-0.014, -0.02, -0.3], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.45], grip: 'wrap' } },
  sawedoff: { right: { p: [0.033, -0.08, 0.1], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.6], grip: 'grip' }, left: { p: [-0.006, -0.055, -0.27], r: [0.1, 0.1, 2.5], elbow: [-0.3, -0.38, 0.4], grip: 'wrap' } },
  molotov: { right: { p: [0.048, -0.02, 0.0], r: [0.2, 0.1, -R], elbow: [0.24, -0.35, 0.55], grip: 'wrap' }, left: { p: [-0.05, 0.02, 0.02], r: [0.25, -0.2, R], elbow: [-0.25, -0.32, 0.5], grip: 'pinch' } },
  pistol: { right: { p: [0.03, -0.075, 0.06], r: [0.2, 0.12, -R], elbow: [0.16, -0.36, 0.6], grip: 'grip' }, left: { p: [-0.035, -0.085, 0.045], r: [0.25, -0.2, R], elbow: [-0.2, -0.34, 0.55], grip: 'wrap' } },
  knife: { right: { p: [0.03, -0.065, 0.07], r: [R, 0, -0.3], elbow: [0.16, -0.34, 0.2], grip: 'grip' }, left: null },   // hammer grip: fist axis along the handle, thumb at the guard, forearm from below
  grenade: { right: { p: [0.03, -0.035, 0.0], r: [0.2, 0.1, -R], elbow: [0.22, -0.35, 0.55], grip: 'wrap' }, left: { p: [-0.045, -0.02, 0.02], r: [0.25, -0.2, R], elbow: [-0.25, -0.32, 0.5], grip: 'pinch' } },
  c4: { right: { p: [0.085, -0.035, 0.03], r: [0.15, 0.1, -R], elbow: [0.22, -0.34, 0.55], grip: 'wrap' }, left: { p: [-0.085, -0.035, 0.03], r: [0.15, -0.1, R], elbow: [-0.24, -0.34, 0.55], grip: 'wrap' } },
};
const HAND_CLASS = { ak47: 'ak47', galil: 'ak47', sg553: 'ak47', m4a4: 'm4a4', m4a1s: 'm4a4', famas: 'famas', aug: 'aug', awp: 'awp', ssg08: 'ssg08', mp9: 'mp9', mac10: 'mac10', mp7: 'mp7', ump45: 'ump', p90: 'p90', nova: 'nova', xm1014: 'nova', mag7: 'nova', sawedoff: 'sawedoff', negev: 'negev', glock: 'pistol', usp: 'pistol', p250: 'pistol', fiveseven: 'pistol', tec9: 'pistol', cz75: 'pistol', r8: 'pistol', deagle: 'pistol', knife: 'knife', he: 'grenade', flash: 'grenade', smoke: 'grenade', decoy: 'grenade', incendiary: 'grenade', molotov: 'molotov', c4: 'c4' };

const BUILDERS = { ak47: buildAK47, galil: buildGalil, m4a4: buildM4A4, famas: buildFamas, awp: buildAWP, ssg08: buildSSG, mp9: M => buildSMG(M, 'mp9'), mac10: M => buildSMG(M, 'mac10'), nova: buildNova, xm1014: M => buildShotgunFamily(M, 'xm1014'), mag7: M => buildShotgunFamily(M, 'mag7'), sawedoff: M => buildShotgunFamily(M, 'sawedoff'), negev: buildNegev, m4a1s: buildM4A1S, aug: buildAUG, sg553: buildSG553, ump45: buildUMP, p90: buildP90, mp7: buildMP7, cz75: buildCZ75, r8: buildR8, deagle: buildDeagle, glock: buildGlock, usp: buildUSP, p250: buildP250, fiveseven: buildFiveSeven, tec9: buildTec9, knife: buildKnife, he: buildHE, flash: buildFlash, smoke: buildSmoke, molotov: buildMolotov, incendiary: buildIncendiary, decoy: buildDecoy, c4: buildC4 };
export const RIG_IDS = Object.keys(BUILDERS);

/** Rig from a real GLB (see models.js conventions); hands come from hand_right / hand_left empties when present. */
function rigFromModel(id, gltf) {
  const group = gltf.scene.clone(true), find = n => group.getObjectByName(n) || null;
  const parts = {}; for (const n of ['mag', 'bolt', 'slide', 'pump', 'cylinder', 'suppressor']) { const o = find(n); if (o) parts[n] = o; }
  const hands = { ...(HANDS[HAND_CLASS[id] || 'ak47'] || {}) };
  for (const [key, node] of [['right', 'hand_right'], ['left', 'hand_left']]) {
    const o = find(node); if (!o) continue;
    hands[key] = { ...(hands[key] || {}), p: o.position.toArray(), r: [o.rotation.x, o.rotation.y, o.rotation.z], grip: o.userData?.grip || (key === 'right' ? 'grip' : 'wrap') };
  }
  const box = new THREE.Box3().setFromObject(group);
  const muzzle = find('muzzle') || marker(group, 0, 0.03, box.min.z, 'muzzle');
  const bareMuzzleZ = parts.suppressor ? muzzle.position.z + new THREE.Box3().setFromObject(parts.suppressor).getSize(new THREE.Vector3()).z * 0.92 : undefined;
  return { group, muzzle, eject: find('eject'), parts, hands, length: box.max.z - box.min.z, fromModel: true, bareMuzzleZ };
}

/** Detail pass for guns: receiver cross-pins (trigger/hammer/takedown) with domed heads on both sides and a stamped
 *  data plate, found from the largest direct-child mesh (the receiver in every builder). Tiny geometry, shared material. */
const NO_PINS = new Set(['knife', 'he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy', 'c4']);
const pinGeo = new THREE.CylinderGeometry(0.0026, 0.0026, 1, 10).rotateZ(Math.PI / 2), headGeo = new THREE.SphereGeometry(0.0034, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).rotateZ(-Math.PI / 2);
pinGeo.userData.shared = headGeo.userData.shared = true;
const tmpBox = new THREE.Box3(), tmpSize = new THREE.Vector3();
function addPins(g, M) {
  let best = null, vol = 0;
  for (const o of g.children) {
    if (!o.isMesh || o.geometry.type !== 'RoundedBoxGeometry' || o.material === M.wood || o.material === M.rubber) continue;
    o.updateMatrix(); tmpBox.copy(o.geometry.boundingBox || (o.geometry.computeBoundingBox(), o.geometry.boundingBox)).applyMatrix4(o.matrix);
    tmpBox.getSize(tmpSize); const v = tmpSize.x * tmpSize.y * tmpSize.z;
    if (v > vol && tmpSize.z > tmpSize.x) { vol = v; best = tmpBox.clone(); }
  }
  if (!best) return;
  const { min, max } = best, w = max.x - min.x, len = max.z - min.z, h = max.y - min.y;
  for (const t of [0.3, 0.55, 0.78]) {
    const y = min.y + h * (t === 0.55 ? 0.62 : 0.3), z = min.z + len * t;
    const pin = part(g, pinGeo, M.metal, (min.x + max.x) / 2, y, z); pin.scale.x = w + 0.003;
    for (const sx of [-1, 1]) { const hd = part(g, headGeo, M.metal, (min.x + max.x) / 2 + sx * (w / 2 + 0.0012), y, z); if (sx < 0) hd.rotation.y = Math.PI; }
  }
  part(g, box(0.0012, h * 0.22, len * 0.16, 0.0004), M.metal, max.x + 0.0006, min.y + h * 0.5, min.z + len * 0.42); // data plate
}

export function buildWeaponRig(id) {
  const model = models.weapon(id);
  if (model) { const rig = rigFromModel(id, model); rig.id = id; rig.group.name = `weapon_${id}`; return rig; }
  const M = weaponMaterials(), rig = BUILDERS[id](M);
  if (!NO_PINS.has(id)) addPins(rig.group, M);
  rig.id = id; rig.group.name = `weapon_${id}`;
  rig.hands = HANDS[HAND_CLASS[id] || 'ak47'];
  return rig;
}

/** Third-person weapon: the same rig baked into one static mesh per material (cached geometry, shared by every operator). */
const tpCache = new Map();
export function buildWeaponRigTP(id) {
  const model = models.weapon(id);
  if (model) { const rig = rigFromModel(id, model); rig.group.traverse(o => { if (o.isMesh) o.castShadow = true; }); return { group: rig.group, hands: rig.hands, muzzle: rig.muzzle, id }; }
  let c = tpCache.get(id);
  if (!c) {
    const full = buildWeaponRig(id); full.group.updateMatrixWorld(true);
    const buckets = new Map();
    full.group.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
      for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      g.applyMatrix4(o.matrixWorld);
      const list = buckets.get(o.material) || []; list.push(g); buckets.set(o.material, list);
    });
    const meshes = [];
    for (const [mat, list] of buckets) { const geo = mergeGeometries(list, false); geo.userData.shared = true; mat.userData.shared = true; meshes.push({ geo, mat }); }
    c = { meshes, hands: full.hands, muzzle: full.muzzle ? full.muzzle.position.clone() : new THREE.Vector3(0, 0, -0.4) };
    tpCache.set(id, c);
  }
  const group = new THREE.Group(); group.name = `tp_${id}`;
  for (const { geo, mat } of c.meshes) { const m = new THREE.Mesh(geo, mat); m.castShadow = true; group.add(m); }
  const muzzle = new THREE.Object3D(); muzzle.position.copy(c.muzzle); group.add(muzzle);
  return { group, hands: c.hands, muzzle, id };
}

// ---------------------------------------------------------------------------------------------- arms
const sleeves = { TERRORIST: 0x7a6a49, COUNTER_TERRORIST: 0x6f6a50 };   // CT: multicam base (matches the operator)
const armMats = {};
/** First-person arms: sleeved forearms + gloved hands, posed by poseArms(arms, rig). */
export function buildArms(team = 'TERRORIST') {
  if (!armMats.glove) { armMats.glove = new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.72, metalness: 0 }); armMats.glove.userData.shared = true; applyPBR(armMats.glove, 'polymer', { size: 256, normalScale: 0.6 }); }
  if (!armMats['glove' + team]) { const gm = armMats.glove.clone(); gm.color.set(team === 'TERRORIST' ? 0x6a5a44 : 0x6c5c45); gm.userData.shared = true; gm.userData.glove = true; armMats['glove' + team] = gm; }
  if (!armMats[team]) { const m = new THREE.MeshStandardMaterial({ color: sleeves[team], roughness: 1 }); applyPBR(m, 'cloth', { size: 256, normalScale: 1 }); m.userData.shared = true; armMats[team] = m; }
  return makeArms(team, armMats['glove' + team], armMats[team]);
}
export const poseArms = placeArms;
