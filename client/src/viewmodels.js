// Procedural, PBR-textured weapon rigs. Local space: +X right, +Y up, -Z toward the muzzle, origin near the grip.
// Each builder returns { group, muzzle, eject, parts, hands } so WeaponManager can animate slides / magazines
// and place the arms; characters.js reuses the same rigs in third person.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { applyPBR } from './materials.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildArms as makeArms, poseArms as placeArms } from './hands.js';

const V2 = (x, y) => new THREE.Vector2(x, y);
let shared = null;

export function weaponMaterials() {
  if (shared) return shared;
  const std = (o, recipe, extra) => { const m = new THREE.MeshStandardMaterial(o); if (recipe) applyPBR(m, recipe, { size: 256, ...extra }); return m; };
  shared = {
    metal: std({ color: 0x9aa1a6, metalness: 1, roughness: 1 }, 'gunmetal', { normalScale: 0.5 }),
    darkMetal: std({ color: 0x565b60, metalness: 1, roughness: 1 }, 'gunmetal', { normalScale: 0.5 }),
    steel: std({ color: 0xdfe3e6, metalness: 1, roughness: 0.28 }, null),
    silver: std({ color: 0xc9cdd0, metalness: 1, roughness: 1 }, 'gunmetal', { normalScale: 0.35 }),
    wood: std({ color: 0xc58a55, roughness: 1, metalness: 0 }, 'wood', { normalScale: 0.6 }),
    polymer: std({ color: 0x2a2d30, roughness: 1, metalness: 0 }, 'polymer', { normalScale: 0.7 }),
    rubber: std({ color: 0x151617, roughness: 0.92, metalness: 0 }, null),
    oliveMetal: std({ color: 0x59613f, metalness: 0.5, roughness: 0.55 }, null),
    grenadeGreen: std({ color: 0x4a5d3a, metalness: 0.35, roughness: 0.5 }, null),
    grenadeGrey: std({ color: 0x8c9296, metalness: 0.7, roughness: 0.4 }, null),
    smokeBody: std({ color: 0x69756d, metalness: 0.5, roughness: 0.48 }, null),
    accent: std({ color: 0xd6b45a, metalness: 0.8, roughness: 0.35 }, null),
    red: std({ color: 0xa02a22, metalness: 0.3, roughness: 0.5 }, null),
    c4: std({ color: 0x5a5f43, roughness: 0.75, metalness: 0.1 }, null),
    tape: std({ color: 0xc9c2a6, roughness: 0.9, metalness: 0 }, null),
    wire: std({ color: 0x9d2b25, roughness: 0.6, metalness: 0 }, null),
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

// ---------------------------------------------------------------------------------------------- rifles
function buildAK47(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.044, 0.07, 0.27, 0.004), M.darkMetal, 0, 0.0, -0.03);                       // receiver
  part(g, box(0.038, 0.02, 0.25, 0.006), M.darkMetal, 0, 0.041, -0.03);                      // dust cover
  part(g, box(0.05, 0.006, 0.09, 0.001), M.metal, 0, -0.032, -0.01);                         // magwell floor lip
  for (let i = 0; i < 6; i++) part(g, box(0.046, 0.002, 0.003, 0.0005), M.darkMetal, 0, 0.052, -0.11 + i * 0.03);
  part(g, cyl(0.011, 0.24, 14), M.metal, 0, 0.056, -0.36);                                   // gas tube
  part(g, cyl(0.0085, 0.34, 16), M.metal, 0, 0.012, -0.49);                                  // barrel
  part(g, box(0.05, 0.048, 0.2, 0.008, 5), M.wood, 0, -0.005, -0.31);                        // lower handguard
  part(g, box(0.048, 0.03, 0.17, 0.007, 5), M.wood, 0, 0.037, -0.33);                        // upper handguard
  part(g, box(0.052, 0.008, 0.024, 0.001), M.darkMetal, 0, 0.022, -0.2);                     // handguard ferrule
  part(g, box(0.021, 0.06, 0.028, 0.003), M.darkMetal, 0, 0.038, -0.625);                    // gas block + front sight base
  part(g, box(0.004, 0.028, 0.004, 0.0008), M.darkMetal, 0, 0.078, -0.625);                  // front sight post
  part(g, box(0.03, 0.006, 0.006, 0.001), M.darkMetal, 0, 0.066, -0.625);
  part(g, cyl(0.0125, 0.045, 14), M.darkMetal, 0, 0.012, -0.665);                            // muzzle brake
  part(g, box(0.006, 0.012, 0.03, 0.001), M.darkMetal, 0, 0.055, -0.13);                     // rear sight leaf
  part(g, box(0.03, 0.02, 0.05, 0.003), M.darkMetal, 0, 0.056, -0.16);
  part(g, side([[0.045, -0.03], [0.078, -0.03], [0.098, -0.145], [0.068, -0.15], [0.05, -0.075]], 0.034, 0.003), M.polymer, 0, 0, 0); // grip
  part(g, side([[0.15, 0.028], [0.24, 0.02], [0.325, -0.008], [0.322, -0.078], [0.235, -0.058], [0.15, -0.038]], 0.036, 0.003), M.wood, 0, 0, 0.0); // stock
  part(g, box(0.038, 0.088, 0.012, 0.002), M.rubber, 0, -0.03, 0.331);                       // butt plate
  const trig = part(g, new THREE.TorusGeometry(0.03, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.06, 0.005, 0, 0, Math.PI); trig.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.004, 0.02, 0.006, 0.001), M.darkMetal, 0, -0.038, 0.012);                    // trigger
  const mag = new THREE.Group(); mag.position.set(0, -0.03, -0.05); g.add(mag); parts.mag = mag;
  part(mag, bananaMag(0, 0, -0.045, -0.2, -0.09, 0.043, 0.031), M.darkMetal, 0, 0, 0);
  for (let i = 0; i < 4; i++) part(mag, box(0.033, 0.003, 0.038, 0.0005), M.metal, 0, -0.045 - i * 0.04, -0.01 - i * i * 0.0038 - i * 0.0065);
  const bolt = part(g, box(0.008, 0.008, 0.02, 0.001), M.metal, 0.028, 0.015, -0.03); parts.bolt = bolt; bolt.position.z = -0.03;
  part(g, box(0.004, 0.02, 0.06, 0.001), M.rubber, 0.0225, 0.014, -0.045);                   // ejection port
  return { group: g, muzzle: marker(g, 0, 0.012, -0.69, 'muzzle'), eject: marker(g, 0.03, 0.02, -0.05, 'eject'), parts,
    hands: { right: { p: [0.004, -0.085, 0.062], r: [0.15, 0, 0] }, left: { p: [0, -0.05, -0.31], r: [0.25, 0, 0] } }, length: 1 };
}

function buildM4A4(M) {
  const g = new THREE.Group(), parts = {};
  part(g, box(0.043, 0.07, 0.17, 0.004), M.polymer, 0, -0.005, 0.0);                        // lower receiver
  part(g, box(0.04, 0.055, 0.215, 0.004), M.darkMetal, 0, 0.042, -0.055);                   // upper receiver
  part(g, box(0.027, 0.014, 0.33, 0.001), M.darkMetal, 0, 0.076, -0.03);                     // rail
  for (let i = 0; i < 22; i++) part(g, box(0.029, 0.005, 0.005, 0.0005), M.darkMetal, 0, 0.085, -0.19 + i * 0.0137);
  part(g, cyl(0.0295, 0.235, 18), M.polymer, 0, 0.03, -0.3);                                 // handguard
  for (let i = 0; i < 6; i++) part(g, box(0.033, 0.007, 0.022, 0.001), M.rubber, 0, 0.056, -0.22 - i * 0.033);
  for (let i = 0; i < 6; i++) part(g, box(0.033, 0.007, 0.022, 0.001), M.rubber, 0, 0.004, -0.22 - i * 0.033);
  part(g, cyl(0.0085, 0.16, 16), M.metal, 0, 0.03, -0.5);                                    // barrel
  part(g, box(0.024, 0.052, 0.022, 0.003), M.darkMetal, 0, 0.056, -0.455);                   // gas block
  part(g, box(0.004, 0.03, 0.004, 0.0008), M.darkMetal, 0, 0.11, -0.455);                    // front sight post
  part(g, cyl(0.0125, 0.06, 14), M.darkMetal, 0, 0.03, -0.585);                              // flash hider
  part(g, box(0.02, 0.032, 0.012, 0.002), M.darkMetal, 0, 0.1, 0.03);                        // rear sight
  part(g, side([[0.02, -0.035], [0.055, -0.035], [0.085, -0.14], [0.058, -0.145], [0.033, -0.07]], 0.034, 0.003), M.polymer, 0, 0, 0); // grip
  part(g, cyl(0.014, 0.19, 12), M.darkMetal, 0, 0.035, 0.24);                                // buffer tube
  part(g, side([[0.19, 0.055], [0.27, 0.05], [0.335, 0.0], [0.33, -0.085], [0.27, -0.06], [0.19, -0.015]], 0.038, 0.003), M.polymer, 0, 0, 0); // stock
  part(g, box(0.038, 0.09, 0.012, 0.003), M.rubber, 0, -0.02, 0.338);
  const trig = part(g, new THREE.TorusGeometry(0.03, 0.0035, 6, 20, Math.PI), M.darkMetal, 0, -0.058, -0.015); trig.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.004, 0.02, 0.006, 0.001), M.darkMetal, 0, -0.036, -0.005);
  const mag = new THREE.Group(); mag.position.set(0, -0.035, -0.075); g.add(mag); parts.mag = mag;
  part(mag, bananaMag(0, 0, -0.015, -0.16, -0.04, 0.045, 0.028), M.polymer, 0, 0, 0);
  part(mag, box(0.03, 0.006, 0.05, 0.001), M.darkMetal, 0, -0.005, -0.005);
  part(g, box(0.008, 0.012, 0.03, 0.001), M.metal, 0.024, 0.06, -0.05, 0, 0, 0, 'bolt'); parts.bolt = g.getObjectByName('bolt');
  part(g, box(0.006, 0.024, 0.024, 0.001), M.darkMetal, 0.0215, 0.05, -0.05);                // dust cover
  return { group: g, muzzle: marker(g, 0, 0.03, -0.62, 'muzzle'), eject: marker(g, 0.03, 0.05, -0.04, 'eject'), parts,
    hands: { right: { p: [0.004, -0.088, 0.03], r: [0.15, 0, 0] }, left: { p: [0, -0.02, -0.3], r: [0.2, 0, 0] } }, length: 1 };
}

// ---------------------------------------------------------------------------------------------- pistols
function buildDeagle(M) {
  const g = new THREE.Group(), parts = {};
  const slide = new THREE.Group(); g.add(slide); parts.slide = slide;
  part(slide, box(0.032, 0.046, 0.27, 0.005), M.silver, 0, 0.03, -0.09);
  part(slide, box(0.034, 0.008, 0.27, 0.002), M.darkMetal, 0, 0.056, -0.09);                 // rib
  serrations(slide, M.darkMetal, 8, 0.0165, 0.07, -0.007, 0.001, 0.03, 0.03);
  serrations(slide, M.darkMetal, 8, -0.0165, 0.07, -0.007, 0.001, 0.03, 0.03);
  part(slide, box(0.006, 0.012, 0.012, 0.001), M.darkMetal, 0, 0.066, 0.03);                 // rear sight
  part(slide, box(0.006, 0.014, 0.012, 0.001), M.darkMetal, 0, 0.066, -0.21);                // front sight
  part(g, box(0.03, 0.028, 0.29, 0.004), M.darkMetal, 0, 0.0, -0.09);                        // frame
  part(g, cyl(0.011, 0.05, 14), M.darkMetal, 0, 0.026, -0.245);                              // barrel
  part(g, side([[0.0, -0.01], [0.06, -0.01], [0.08, -0.145], [0.025, -0.15], [0.0, -0.06]], 0.034, 0.003), M.polymer, 0, 0, 0.0);
  part(g, side([[0.058, -0.03], [0.075, -0.03], [0.09, -0.14], [0.075, -0.14]], 0.036, 0.001), M.rubber, 0, 0, 0.0);
  const tg = part(g, new THREE.TorusGeometry(0.026, 0.003, 6, 18, Math.PI), M.darkMetal, 0, -0.03, -0.03); tg.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.004, 0.02, 0.006, 0.001), M.silver, 0, -0.024, -0.03);
  const mag = new THREE.Group(); mag.position.set(0, -0.15, 0.03); g.add(mag); parts.mag = mag;
  part(mag, box(0.026, 0.01, 0.046, 0.002), M.darkMetal, 0, 0, 0);
  return { group: g, muzzle: marker(g, 0, 0.026, -0.275, 'muzzle'), eject: marker(g, 0.02, 0.04, -0.05, 'eject'), parts,
    hands: { right: { p: [0.014, -0.08, 0.065], r: [0.2, -0.12, 0.22] }, left: { p: [-0.02, -0.095, 0.055], r: [0.32, 0.25, -0.22], support: true } }, length: 0.4 };
}
function buildGlock(M) {
  const g = new THREE.Group(), parts = {};
  const slide = new THREE.Group(); g.add(slide); parts.slide = slide;
  part(slide, box(0.03, 0.034, 0.2, 0.004), M.darkMetal, 0, 0.032, -0.07);
  part(slide, box(0.03, 0.006, 0.2, 0.002), M.metal, 0, 0.05, -0.07);
  serrations(slide, M.rubber, 6, 0.0152, 0.02, -0.007, 0.001, 0.022, 0.034);
  serrations(slide, M.rubber, 6, -0.0152, 0.02, -0.007, 0.001, 0.022, 0.034);
  part(slide, box(0.006, 0.01, 0.01, 0.001), M.rubber, 0, 0.056, 0.02);
  part(slide, box(0.005, 0.012, 0.01, 0.001), M.rubber, 0, 0.056, -0.155);
  part(g, box(0.027, 0.024, 0.19, 0.003), M.polymer, 0, 0.008, -0.07);                       // frame
  part(g, cyl(0.007, 0.03, 12), M.metal, 0, 0.03, -0.172);
  part(g, side([[0.0, 0.0], [0.05, 0.0], [0.072, -0.12], [0.02, -0.125], [0.0, -0.06]], 0.032, 0.003), M.polymer, 0, 0, 0);
  const tg = part(g, new THREE.TorusGeometry(0.022, 0.003, 6, 18, Math.PI), M.polymer, 0, -0.008, -0.045); tg.rotation.set(0, Math.PI / 2, Math.PI);
  part(g, box(0.004, 0.018, 0.005, 0.001), M.metal, 0, -0.008, -0.045);
  const mag = new THREE.Group(); mag.position.set(0, -0.125, 0.03); g.add(mag); parts.mag = mag;
  part(mag, box(0.024, 0.01, 0.036, 0.002), M.polymer, 0, 0, 0);
  return { group: g, muzzle: marker(g, 0, 0.034, -0.19, 'muzzle'), eject: marker(g, 0.018, 0.042, -0.03, 'eject'), parts,
    hands: { right: { p: [0.012, -0.07, 0.055], r: [0.2, -0.12, 0.22] }, left: { p: [-0.018, -0.082, 0.045], r: [0.32, 0.25, -0.22], support: true } }, length: 0.3 };
}

// ---------------------------------------------------------------------------------------------- melee / utility
function buildKnife(M) {
  const g = new THREE.Group();
  const blade = side([[0.0, 0.0], [-0.03, 0.006], [-0.17, 0.0125], [-0.215, 0.006], [-0.222, -0.003], [-0.19, -0.02], [-0.03, -0.02], [-0.02, -0.006]], 0.004, 0.0008);
  part(g, blade, M.steel, 0, 0.0, 0.0);
  part(g, side([[-0.03, 0.004], [-0.17, 0.0085], [-0.18, 0.0065], [-0.03, 0.001]], 0.0052, 0.0004), M.darkMetal, 0, 0, 0);     // fuller / blood groove
  part(g, box(0.014, 0.058, 0.012, 0.002), M.darkMetal, 0, -0.005, 0.0);                                                            // guard
  part(g, cyl(0.0125, 0.1, 14), M.rubber, 0, -0.005, 0.06);                                                                        // handle
  for (let i = 0; i < 5; i++) part(g, cylY(0.0138, 0.005, 14), M.darkMetal, 0, -0.005, 0.02 + i * 0.019, Math.PI / 2, 0, 0).rotation.x = 0;
  part(g, cyl(0.0145, 0.014, 14), M.darkMetal, 0, -0.005, 0.116);                                                                  // pommel
  return { group: g, muzzle: marker(g, 0, 0, -0.22, 'tip'), eject: null, parts: {}, hands: { right: { p: [0, -0.02, 0.055], r: [0.3, 0, 0] }, left: null }, length: 0.35 };
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

// ---------------------------------------------------------------------------------------------- hand poses (weapon-local)
const R = Math.PI / 2;
// p: palm centre, r: euler (roll about the finger axis first), elbow: sleeve target, grip: finger curl preset
const HANDS = {
  ak47: { right: { p: [0.033, -0.088, 0.088], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.62], grip: 'grip' }, left: { p: [-0.012, -0.05, -0.29], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.5], grip: 'wrap' } },
  m4a4: { right: { p: [0.033, -0.09, 0.05], r: [0.15, 0.12, -R], elbow: [0.14, -0.4, 0.6], grip: 'grip' }, left: { p: [-0.012, -0.035, -0.29], r: [0.1, 0.15, 2.4], elbow: [-0.3, -0.36, 0.5], grip: 'wrap' } },
  pistol: { right: { p: [0.03, -0.075, 0.06], r: [0.2, 0.12, -R], elbow: [0.16, -0.36, 0.6], grip: 'grip' }, left: { p: [-0.035, -0.085, 0.045], r: [0.25, -0.2, R], elbow: [-0.2, -0.34, 0.55], grip: 'wrap' } },
  knife: { right: { p: [0.0, -0.005, 0.06], r: [0.1, 0, -R], elbow: [0.2, -0.32, 0.6], grip: 'grip' }, left: null },
  grenade: { right: { p: [0.03, -0.035, 0.0], r: [0.2, 0.1, -R], elbow: [0.22, -0.35, 0.55], grip: 'wrap' }, left: { p: [-0.045, -0.02, 0.02], r: [0.25, -0.2, R], elbow: [-0.25, -0.32, 0.5], grip: 'pinch' } },
  c4: { right: { p: [0.085, -0.035, 0.03], r: [0.15, 0.1, -R], elbow: [0.22, -0.34, 0.55], grip: 'wrap' }, left: { p: [-0.085, -0.035, 0.03], r: [0.15, -0.1, R], elbow: [-0.24, -0.34, 0.55], grip: 'wrap' } },
};
const HAND_CLASS = { ak47: 'ak47', galil: 'ak47', m4a4: 'm4a4', famas: 'm4a4', awp: 'm4a4', glock: 'pistol', usp: 'pistol', deagle: 'pistol', knife: 'knife', he: 'grenade', flash: 'grenade', smoke: 'grenade', c4: 'c4' };

const BUILDERS = { ak47: buildAK47, m4a4: buildM4A4, deagle: buildDeagle, glock: buildGlock, knife: buildKnife, he: buildHE, flash: buildFlash, smoke: buildSmoke, c4: buildC4, usp: buildGlock, awp: buildM4A4, famas: buildM4A4, galil: buildAK47 };

export function buildWeaponRig(id) {
  const M = weaponMaterials(), rig = BUILDERS[id](M);
  rig.id = id; rig.group.name = `weapon_${id}`;
  rig.hands = HANDS[HAND_CLASS[id] || 'ak47'];
  return rig;
}

/** Third-person weapon: the same rig baked into one static mesh per material (cached geometry, shared by every operator). */
const tpCache = new Map();
export function buildWeaponRigTP(id) {
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
const sleeves = { TERRORIST: 0x7a6a49, COUNTER_TERRORIST: 0x2c3746 };
const armMats = {};
/** First-person arms: sleeved forearms + gloved hands, posed by poseArms(arms, rig). */
export function buildArms(team = 'TERRORIST') {
  if (!armMats.glove) { armMats.glove = new THREE.MeshStandardMaterial({ color: 0x1e1f21, roughness: 0.72, metalness: 0 }); armMats.glove.userData.shared = true; applyPBR(armMats.glove, 'polymer', { size: 256, normalScale: 0.6 }); }
  if (!armMats['glove' + team]) { const gm = armMats.glove.clone(); gm.color.set(team === 'TERRORIST' ? 0x6a5a44 : 0x3a4148); gm.userData.shared = true; armMats['glove' + team] = gm; }
  if (!armMats[team]) { const m = new THREE.MeshStandardMaterial({ color: sleeves[team], roughness: 1 }); applyPBR(m, 'cloth', { size: 256, normalScale: 1 }); m.userData.shared = true; armMats[team] = m; }
  return makeArms(team, armMats['glove' + team], armMats[team]);
}
export const poseArms = placeArms;
