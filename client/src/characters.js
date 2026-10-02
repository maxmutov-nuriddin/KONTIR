// Third-person operators: procedural modern tactical operators (CS2-style read: clean silhouettes, warm desert T vs
// cold slate CT) with procedural locomotion, crouch bend, aim pitch, weapon holding and a death fall.
//
// Performance model (built for old / budget PCs):
//  * every body part is baked into ONE rigidly skinned mesh per LOD: the whole operator is a single draw call (plus the
//    held weapon and gloves) instead of ~25 separate meshes; shadows cost the same single call;
//  * a 2-tier LOD chain (detailed ~9k tris / silhouette ~1.5k tris) shares one skeleton; the engine switches by distance;
//  * geometry is cached per (team, skin tone, LOD) and shared by every operator; one PBR material per team.
// Look: PBR ripstop fabric (albedo + normal), camouflage evaluated in the shader from bind-pose position (no texture
// memory, no seams), per-vertex roughness / metalness / fabric-detail so cloth, polymer, rubber, metal, lenses and skin
// all read differently under the same material.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildArms, buildWeaponRigTP, poseArms } from './viewmodels.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { models } from './models.js';
import { textureSet } from './materials.js';

// ---------------------------------------------------------------------------------------------- skinned (real model) path
const CLIPS = { lowready: /low.?ready/i, idle: /idle|stand/i, walk: /walk/i, run: /run|jog|sprint/i, crouch: /crouch.*idle|crouch(?!.*walk)|squat/i, crouch_walk: /crouch.*walk|sneak/i, jump: /jump/i, death: /death|die|dying/i };
function buildSkinned(team, gltf) {
  const root = new THREE.Group(), body = cloneSkinned(gltf.scene);
  body.rotation.y = Math.PI;                                              // assets face +Z; operators face -Z
  root.add(body); body.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(body), h = box.max.y - box.min.y;
  if (h > 0.2) { const k = 1.8 / h; body.scale.multiplyScalar(k); body.position.y = -box.min.y * k; }
  body.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; } });
  const bone = re => { let hit = null; body.traverse(o => { if (!hit && (o.isBone || o.type === 'Bone') && re.test(o.name)) hit = o; }); return hit; };
  const mixer = new THREE.AnimationMixer(body), actions = {};
  for (const [state, re] of Object.entries(CLIPS)) { const clip = gltf.animations.find(c => re.test(c.name)); if (clip) actions[state] = mixer.clipAction(clip); }
  if (!Object.keys(actions).length && gltf.animations.length) actions.idle = actions.walk = mixer.clipAction(gltf.animations[0]);   // unnamed clips
  if (actions.death) { actions.death.setLoop(THREE.LoopOnce); actions.death.clampWhenFinished = true; }
  const first = actions.idle || Object.values(actions)[0]; first?.play();
  const hand = body.getObjectByName('weapon_socket') || bone(/righthand$|right_hand|hand_r$|r_hand|RightHand/i);
  const socket = new THREE.Object3D(); if (hand) { hand.add(socket); const ws = new THREE.Vector3(); hand.getWorldScale(ws); socket.scale.setScalar(1 / (ws.x || 1)); socket.rotation.set(-Math.PI / 2, 0, Math.PI / 2); }
  root.userData = { skinned: true, team, body, mixer, actions, current: first, spine: bone(/spine2|spine_02|spine1|spine_01|^spine$|Spine/i), head: bone(/head$/i), socket, weapon: null, weaponId: null, rigs: new Map(), fall: 0, phase: 0 };
  return root;
}
function animateSkinned(actor, { speed, yaw, pitch, crouch, alive, dt }) {
  const u = actor.userData, a = u.actions;
  const state = !alive ? 'death' : crouch > 0.5 ? (speed > 0.4 ? 'crouch_walk' : 'crouch') : speed > 3.6 ? 'run' : speed > 0.4 ? 'walk' : 'idle';
  // lobby showcase (setHoldPose 'low'): stand at low ready when the model has that clip
  const want = state === 'idle' && u.pose === 'low' && a.lowready ? 'lowready' : state;
  const next = a[want] || (state === 'crouch_walk' ? a.crouch || a.walk : state === 'run' ? a.walk : null) || a.idle;
  if (next && next !== u.current) { next.reset().fadeIn(0.18).play(); u.current?.fadeOut(0.18); u.current = next; }
  if (next && (state === 'walk' || state === 'run')) next.timeScale = Math.max(0.6, Math.min(1.6, speed / (state === 'run' ? 5.5 : 2.2)));
  u.mixer.update(dt);
  actor.rotation.y = yaw;
  if (u.spine && alive) u.spine.rotation.x += -pitch * 0.6;              // aim offset on top of the clip
  if (!a.death) { u.fall += ((alive ? 0 : 1) - u.fall) * Math.min(1, dt * 7); actor.rotation.x = -u.fall * (Math.PI / 2 - 0.05); }
  if (u.weapon) u.weapon.visible = alive;
}

// ---------------------------------------------------------------------------------------------- procedural operator
export const ARM = 0.27;                     // upper arm = forearm length (two-bone IK)
// bone name, parent, rest offset (bind pose = no rotations; parts hang along -Y from their pivot)
const BONES = [
  ['hip', null, [0, 0.94, 0]], ['spine', 'hip', [0, 0.06, 0]], ['head', 'spine', [0, 0.58, 0]],
  ['shoulderR', 'spine', [0.215, 0.46, 0]], ['elbowR', 'shoulderR', [0, -ARM, 0]],
  ['shoulderL', 'spine', [-0.215, 0.46, 0]], ['elbowL', 'shoulderL', [0, -ARM, 0]],
  ['thighL', 'hip', [-0.095, 0, 0]], ['kneeL', 'thighL', [0, -0.42, 0]],
  ['thighR', 'hip', [0.095, 0, 0]], ['kneeR', 'thighR', [0, -0.42, 0]],
];
const BONE_INDEX = Object.fromEntries(BONES.map(([n], i) => [n, i]));
const BIND = (() => {
  const out = {};
  for (const [name, parent, p] of BONES) out[name] = new THREE.Vector3(...p).add(parent ? out[parent] : new THREE.Vector3());
  return out;
})();

// surface classes -> [roughness, metalness, fabric detail (albedo weave + normal strength), camo]
const SURF = {
  camo: [0.93, 0, 1, 1], cloth: [0.92, 0, 1, 0], nylon: [0.82, 0, 0.85, 0], webbing: [0.86, 0, 1.15, 0], knit: [0.97, 0, 1.25, 0],
  skin: [0.56, 0, 0, 0], polymer: [0.48, 0, 0.12, 0], rubber: [0.82, 0, 0.18, 0], leather: [0.62, 0, 0.3, 0],
  metal: [0.34, 0.95, 0, 0], lens: [0.06, 0.4, 0, 0], patch: [0.75, 0, 0.6, 0],
};
const SKIN = [0xd7a982, 0xb07d58, 0x8a5a3c, 0xe2b896, 0x6e4a33];
// Team palettes. T: desert khaki uniform, dark chest rig, black balaclava. CT: multicam uniform and carrier, coyote
// gear, tan FAST helmet, open face. The heads (black balaclava vs tan helmet) keep the sides readable at any range.
const PALETTE = {
  TERRORIST: {
    uniform: 0x9c875e, pants: 0x8f7c56, camo: [0x76664a, 0xb8a47c, 0x51473a], gear: 0x3d3c32, gearDark: 0x2b2a24, webbing: 0x2f2e28,
    knit: 0x1f2022, scarf: 0x7a6546, boot: 0x5f4833, sole: 0x1c1a17, lace: 0x2e261d, pad: 0x34332c, metal: 0x6d6f70, lens: 0x4f3818, patch: 0xc98236,
  },
  COUNTER_TERRORIST: {
    uniform: 0x847d5f, pants: 0x7f785b, camo: [0x5b603f, 0xa69a7a, 0x4e3d2c], gear: 0x77694d, gearDark: 0x5c513d, webbing: 0x4f4634,
    carrier: 0x7a7357, knit: 0x2b2a26, helmet: 0x8c7c5d, earpro: 0x4d4b39, boot: 0x6e5c45, sole: 0x3a3128, lace: 0x4a3d2e, pad: 0x5e5444,
    metal: 0x55585a, poly: 0x2a2b2c, lens: 0x0c1116, patch: 0x7fb6ea, stubble: 0x4a3a2e, tq: 0x1d1d1d,
  },
};

// ---- primitive builders (all indexed, Y-up, centred)
const rbox = (w, h, d, r = 0.02, seg = 2) => new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-4, h / 2 - 1e-4, d / 2 - 1e-4));
const cap = (r, len, capSeg = 4, radial = 12) => new THREE.CapsuleGeometry(r, len, capSeg, radial);
const cyl = (rTop, rBottom, h, radial = 14, open = false) => new THREE.CylinderGeometry(rTop, rBottom, h, radial, 1, open);
const sph = (r, ws = 18, hs = 14, thetaLen = Math.PI) => new THREE.SphereGeometry(r, ws, hs, 0, Math.PI * 2, 0, thetaLen);

/** Smooth body segment: lathe through [y, radius] points (ascending y) with rounded caps; sx / sz give an oval section. */
function lathe(profile, { radial = 16, capTop = true, capBottom = true, sx = 1, sz = 1 } = {}) {
  const pts = [], [y0, r0] = profile[0], [y1, r1] = profile[profile.length - 1];
  if (capBottom) for (let i = 0; i < 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, r0 * Math.sin(a)), y0 - r0 * 0.55 * Math.cos(a))); }
  for (const [y, r] of profile) pts.push(new THREE.Vector2(r, y));
  if (capTop) for (let i = 1; i <= 4; i++) { const a = (i / 4) * Math.PI / 2; pts.push(new THREE.Vector2(Math.max(1e-4, r1 * Math.cos(a)), y1 + r1 * 0.55 * Math.sin(a))); }
  const g = new THREE.LatheGeometry(pts, radial);
  if (sx !== 1 || sz !== 1) g.scale(sx, 1, sz);
  return g;
}
/** A limb hanging down from its pivot: [t, radius] from the joint (t = 0) to the far end (t = 1) over `len` metres. */
const limb = (len, radii, opts) => lathe(radii.map(([t, r]) => [-t * len, r]).reverse(), opts);
const _rd = new THREE.Vector3(), _ry = new THREE.Vector3(0, 1, 0), _rq = new THREE.Quaternion(), _re = new THREE.Euler();
/** Thin cylinder between two points of one bone's space (cables, straps, antennas, mic booms). */
function rod(a, b, radius, radial = 6) {
  _rd.set(b[0] - a[0], b[1] - a[1], b[2] - a[2]); const len = _rd.length(); _rd.normalize();
  _re.setFromQuaternion(_rq.setFromUnitVectors(_ry, _rd));
  return { geo: cyl(radius, radius, len, radial), p: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], r: [_re.x, _re.y, _re.z] };
}
/** Arc of a vertical cylinder wall around the face (wrap-around glasses); theta 0 = straight ahead (-Z). */
const arc = (radius, h, width, radial = 20) => new THREE.CylinderGeometry(radius, radius, h, radial, 1, true, Math.PI - width / 2, width);
const mixHex = (a, b, t) => new THREE.Color(a).lerp(new THREE.Color(b), t).getHex();

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(), _p = new THREE.Vector3(), _s = new THREE.Vector3(), _c = new THREE.Color();
const UV_DENSITY = 5;                          // ripstop texture repeats every 20 cm

/** Bakes part list into one rigidly skinned geometry in bind space. */
function bake(parts) {
  const geos = parts.map(({ geo, bone, color, surf, p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] }) => {
    let g = geo;
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
    if (!g.index) g = g.setIndex(Array.from({ length: g.attributes.position.count }, (_, i) => i));
    _m.compose(_p.set(...p).add(BIND[bone]), _q.setFromEuler(_e.set(r[0], r[1], r[2])), _s.set(...s));
    g.applyMatrix4(_m);
    const pos = g.attributes.position, nrm = g.attributes.normal, n = pos.count;
    const uv = new Float32Array(n * 2), col = new Float32Array(n * 3), rm = new Float32Array(n * 4), si = new Uint16Array(n * 4), sw = new Float32Array(n * 4);
    const props = SURF[surf] || SURF.cloth, bi = BONE_INDEX[bone];
    _c.setHex(color);
    for (let i = 0; i < n; i++) {
      const ax = Math.abs(nrm.getX(i)), ay = Math.abs(nrm.getY(i)), az = Math.abs(nrm.getZ(i));
      let a, b;
      if (ax >= ay && ax >= az) { a = pos.getZ(i); b = pos.getY(i); } else if (ay >= az) { a = pos.getX(i); b = pos.getZ(i); } else { a = pos.getX(i); b = pos.getY(i); }
      uv[i * 2] = a * UV_DENSITY; uv[i * 2 + 1] = b * UV_DENSITY;
      // baked hemispheric occlusion: undersides and the lower body sit a little darker (cheap contact-shadow read)
      const ao = (0.84 + 0.16 * (nrm.getY(i) * 0.5 + 0.5)) * (0.9 + 0.1 * Math.min(1, pos.getY(i) / 1.2));
      col[i * 3] = _c.r * ao; col[i * 3 + 1] = _c.g * ao; col[i * 3 + 2] = _c.b * ao;
      rm.set(props, i * 4); si[i * 4] = bi; sw[i * 4] = 1;
    }
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('aRM', new THREE.BufferAttribute(rm, 4));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(si, 4));
    g.setAttribute('skinWeight', new THREE.BufferAttribute(sw, 4));
    return g;
  });
  const merged = mergeGeometries(geos, false);
  for (const g of geos) g.dispose();
  merged.userData.shared = true;
  return merged;
}

/** Detailed operator (LOD0): anatomical lathe-profiled body, team kit, gear. */
function detailedParts(team, skin) {
  const T = team === 'TERRORIST', C = PALETTE[team], P = [];
  const add = (bone, geo, color, surf, p, r, s) => P.push({ bone, geo, color, surf, p, r, s });
  const addRod = (bone, a, b, radius, color, surf) => { const o = rod(a, b, radius); add(bone, o.geo, color, surf, o.p, o.r); };
  // ---- pelvis + belt
  add('hip', lathe([[-0.16, 0.085], [-0.12, 0.14], [-0.05, 0.165], [0.03, 0.163], [0.085, 0.157]], { sz: 0.74, capTop: false }), C.pants, 'camo');
  add('hip', rbox(0.352, 0.058, 0.252, 0.026), C.gear, 'webbing', [0, 0.05, 0]);
  add('hip', rbox(0.052, 0.036, 0.012, 0.004, 1), C.metal, 'metal', [0, 0.05, -0.127]);
  if (T) {
    add('hip', rbox(0.055, 0.085, 0.065, 0.014), C.gear, 'nylon', [-0.17, 0.0, -0.035]);
    add('hip', rbox(0.1, 0.1, 0.05, 0.016), C.gearDark, 'nylon', [0.09, 0.0, 0.125]);
  } else {
    for (const z of [-0.07, -0.005]) add('hip', rbox(0.046, 0.092, 0.058, 0.014), C.gear, 'nylon', [-0.178, 0.005, z]);   // pistol mag pouches
    add('hip', rbox(0.115, 0.115, 0.06, 0.022), C.gearDark, 'nylon', [0.09, -0.02, 0.135]);                               // dump pouch
    add('hip', rbox(0.06, 0.07, 0.05, 0.016), C.gear, 'nylon', [0.175, 0.01, 0.06]);                                       // utility pouch
  }
  // ---- torso: oval lathe chest with a real waist and shoulder slope
  add('spine', lathe([[0.0, 0.158], [0.08, 0.152], [0.2, 0.172], [0.32, 0.198], [0.41, 0.2], [0.47, 0.18], [0.51, 0.12], [0.535, 0.075]], { sz: 0.6, capBottom: false, capTop: false, radial: 20 }), C.uniform, 'camo');
  add('spine', cyl(0.074, 0.082, 0.055, 16), T ? C.scarf : C.uniform, T ? 'cloth' : 'camo', [0, 0.52, 0]);
  if (!T) {
    // plate carrier (multicam) + coyote pouches: shingle with magazines, admin, radio + PTT cable, IFAK, tourniquet, pack
    add('spine', rbox(0.31, 0.32, 0.062, 0.026), C.carrier, 'camo', [0, 0.31, -0.132]);
    add('spine', rbox(0.31, 0.34, 0.062, 0.026), C.carrier, 'camo', [0, 0.31, 0.132]);
    add('spine', rbox(0.412, 0.13, 0.27, 0.05), C.carrier, 'camo', [0, 0.15, 0]);
    for (const x of [-0.11, 0.11]) add('spine', rbox(0.082, 0.042, 0.29, 0.016), C.carrier, 'camo', [x, 0.483, 0]);
    for (let i = 0; i < 3; i++) add('spine', rbox(0.29, 0.009, 0.008, 0.003, 1), C.webbing, 'webbing', [0, 0.27 + i * 0.042, -0.165]);
    for (const x of [-0.084, 0, 0.084]) {
      add('spine', rbox(0.074, 0.118, 0.066, 0.014), C.gear, 'nylon', [x, 0.2, -0.19]);
      add('spine', rbox(0.026, 0.05, 0.058, 0.005, 1), C.poly, 'polymer', [x, 0.28, -0.19]);                              // M4 magazine
      add('spine', rbox(0.076, 0.01, 0.068, 0.004, 1), C.gearDark, 'rubber', [x, 0.245, -0.19]);                         // bungee
    }
    add('spine', rbox(0.2, 0.072, 0.03, 0.01), C.gearDark, 'nylon', [0, 0.38, -0.176]);
    add('spine', rbox(0.064, 0.042, 0.006, 0.002, 1), C.patch, 'patch', [0.055, 0.385, -0.193]);
    add('spine', rbox(0.062, 0.145, 0.072, 0.016), C.gear, 'nylon', [-0.222, 0.24, 0.05]);
    add('spine', rbox(0.052, 0.034, 0.05, 0.008, 1), C.poly, 'polymer', [-0.222, 0.327, 0.05]);
    addRod('spine', [-0.222, 0.34, 0.062], [-0.218, 0.62, 0.075], 0.004, C.poly, 'rubber');                               // antenna
    add('spine', rbox(0.032, 0.044, 0.016, 0.006, 1), C.poly, 'polymer', [-0.095, 0.44, -0.168]);                          // PTT
    addRod('spine', [-0.095, 0.418, -0.165], [-0.21, 0.31, -0.01], 0.005, C.poly, 'rubber');                              // PTT cable
    add('spine', cyl(0.017, 0.017, 0.12, 10), C.tq, 'nylon', [0.11, 0.43, -0.152], [0.2, 0, 0]);                           // tourniquet
    add('spine', rbox(0.065, 0.105, 0.068, 0.02), C.gear, 'nylon', [0.222, 0.2, 0.06]);                                     // IFAK
    add('spine', rbox(0.25, 0.28, 0.075, 0.03), C.carrier, 'camo', [0, 0.3, 0.205]);                                       // assault pack
    add('spine', rbox(0.09, 0.022, 0.024, 0.008, 1), C.webbing, 'webbing', [0, 0.475, 0.168]);
  } else {
    add('spine', rbox(0.35, 0.155, 0.085, 0.026), C.gear, 'nylon', [0, 0.2, -0.15]);
    for (const x of [-0.12, -0.04, 0.04, 0.12]) add('spine', rbox(0.068, 0.048, 0.074, 0.014), C.gearDark, 'nylon', [x, 0.3, -0.152]);
    for (const x of [-0.2, 0.2]) add('spine', rbox(0.05, 0.1, 0.07, 0.016), C.gear, 'nylon', [x, 0.18, -0.085]);
    for (const x of [-0.1, 0.1]) add('spine', rbox(0.05, 0.03, 0.26, 0.01), C.webbing, 'webbing', [x, 0.49, -0.01]);
    for (const k of [-1, 1]) add('spine', rbox(0.05, 0.44, 0.014, 0.006, 1), C.webbing, 'webbing', [0, 0.28, 0.122], [0, 0, k * 0.62]);
    add('spine', rbox(0.13, 0.11, 0.035, 0.016), C.scarf, 'cloth', [0, 0.45, -0.115], [0.25, 0, 0]);
    add('spine', rbox(0.064, 0.04, 0.006, 0.002, 1), C.patch, 'patch', [-0.11, 0.24, -0.196]);
  }
  // ---- head
  if (!T) {
    const jaw = mixHex(skin, C.stubble, 0.35);
    add('head', cyl(0.055, 0.06, 0.1, 14), skin, 'skin');
    add('head', sph(0.104, 24, 18), skin, 'skin', [0, 0.09, 0], [0, 0, 0], [0.92, 1.08, 1]);
    add('head', rbox(0.118, 0.086, 0.078, 0.036), jaw, 'skin', [0, 0.032, -0.044]);                                      // stubbled jaw
    for (const x of [-1, 1]) add('head', sph(0.034, 12, 10), skin, 'skin', [x * 0.046, 0.07, -0.072], [0, 0, 0], [1, 0.8, 0.8]);
    add('head', rbox(0.11, 0.022, 0.032, 0.01, 1), skin, 'skin', [0, 0.116, -0.092]);                                    // brow
    add('head', rbox(0.022, 0.042, 0.03, 0.01, 1), skin, 'skin', [0, 0.078, -0.106], [-0.15, 0, 0]);                       // nose
    add('head', rbox(0.04, 0.006, 0.006, 0.002, 1), 0x6b3f33, 'skin', [0, 0.034, -0.084]);                                 // mouth
    for (const x of [-1, 1]) add('head', sph(0.024, 10, 8), skin, 'skin', [x * 0.098, 0.085, 0.006], [0, 0, 0], [0.5, 1, 0.8]);
    // wrap-around ballistic glasses
    add('head', arc(0.1, 0.034, 2.2), C.lens, 'lens', [0, 0.099, -0.004], [0, 0, 0], [0.98, 1, 1.06]);
    add('head', arc(0.102, 0.008, 2.2), C.poly, 'polymer', [0, 0.118, -0.004], [0, 0, 0], [0.98, 1, 1.06]);
    // FAST high-cut helmet: shell, rails, NVG shroud, velcro, counterweight
    add('head', sph(0.133, 28, 12, Math.PI * 0.45), C.helmet, 'polymer', [0, 0.1, 0.01], [0, 0, 0], [0.97, 1, 1.07]);
    for (const x of [-1, 1]) add('head', rbox(0.013, 0.03, 0.135, 0.004, 1), C.gearDark, 'polymer', [x * 0.128, 0.112, 0.006]);
    add('head', rbox(0.05, 0.034, 0.022, 0.006, 1), C.metal, 'metal', [0, 0.183, -0.13]);
    add('head', rbox(0.08, 0.008, 0.07, 0.003, 1), C.gearDark, 'nylon', [0, 0.233, 0.004]);
    add('head', rbox(0.09, 0.06, 0.035, 0.012), C.gear, 'nylon', [0, 0.14, 0.14]);
    // electronic ear protection with a boom mic
    for (const x of [-1, 1]) {
      add('head', cyl(0.044, 0.044, 0.042, 18), C.earpro, 'rubber', [x * 0.113, 0.07, 0.006], [0, 0, Math.PI / 2]);
      add('head', cyl(0.033, 0.033, 0.01, 14), C.gearDark, 'polymer', [x * 0.137, 0.07, 0.006], [0, 0, Math.PI / 2]);
    }
    addRod('head', [-0.118, 0.052, -0.03], [-0.052, 0.026, -0.096], 0.0042, C.poly, 'polymer');
    add('head', sph(0.01, 8, 6), C.poly, 'rubber', [-0.047, 0.025, -0.099]);
  } else {
    add('head', cyl(0.052, 0.058, 0.1, 14), C.knit, 'knit');
    add('head', sph(0.105, 22, 16), C.knit, 'knit', [0, 0.09, 0], [0, 0, 0], [0.92, 1.08, 1]);
    add('head', rbox(0.125, 0.09, 0.07, 0.034), C.knit, 'knit', [0, 0.035, -0.045]);
    add('head', rbox(0.022, 0.034, 0.026, 0.009, 1), C.knit, 'knit', [0, 0.075, -0.104]);
    add('head', rbox(0.122, 0.032, 0.02, 0.01, 1), skin, 'skin', [0, 0.098, -0.099]);
    for (const x of [-1, 1]) add('head', rbox(0.022, 0.012, 0.006, 0.003, 1), 0x15120f, 'lens', [x * 0.03, 0.099, -0.11]);
    add('head', rbox(0.124, 0.036, 0.026, 0.012), C.lens, 'lens', [0, 0.158, -0.092], [-0.4, 0, 0]);
    add('head', rbox(0.134, 0.044, 0.02, 0.01), C.gearDark, 'rubber', [0, 0.158, -0.085], [-0.4, 0, 0]);
    add('head', cyl(0.109, 0.109, 0.014, 20, true), C.webbing, 'webbing', [0, 0.152, 0.004], [0.12, 0, 0], [0.95, 1, 1.06]);
  }
  // ---- arms: deltoid + biceps profile on the shoulder pivot, forearm profile on the elbow pivot (gloves come with the weapon)
  for (const [sh, el, sx] of [['shoulderR', 'elbowR', 1], ['shoulderL', 'elbowL', -1]]) {
    add(sh, sph(0.068, 16, 12), C.uniform, 'camo', [0, -0.015, 0], [0, 0, 0], [1.05, 0.95, 1]);
    add(sh, limb(ARM, [[0, 0.058], [0.3, 0.058], [0.7, 0.049], [1, 0.046]]), C.uniform, 'camo');
    add(sh, rbox(0.024, 0.085, 0.074, 0.009), C.uniform, 'camo', [sx * 0.055, -0.1, 0]);
    add(sh, rbox(0.008, 0.042, 0.054, 0.003, 1), C.patch, 'patch', [sx * 0.068, -0.09, 0]);
    add(el, sph(0.05, 12, 10), C.uniform, 'camo');
    if (T) {
      add(el, limb(0.1, [[0, 0.05], [1, 0.05]]), C.uniform, 'camo');
      add(el, cyl(0.054, 0.054, 0.04, 14), C.uniform, 'camo', [0, -0.105, 0]);
      add(el, lathe([[-0.27, 0.035], [-0.2, 0.041], [-0.11, 0.046]], { capTop: false }), skin, 'skin');
    } else {
      add(el, limb(ARM, [[0, 0.048], [0.25, 0.051], [0.75, 0.041], [1, 0.038]]), C.uniform, 'camo');
      add(el, cyl(0.043, 0.043, 0.036, 14), C.gearDark, 'cloth', [0, -0.245, 0]);
      add(el, rbox(0.062, 0.07, 0.034, 0.015), C.pad, 'rubber', [0, -0.01, 0.046]);                                        // elbow pad
    }
  }
  // ---- legs
  for (const [th, kn, sx] of [['thighL', 'kneeL', -1], ['thighR', 'kneeR', 1]]) {
    add(th, limb(0.42, [[0, 0.092], [0.25, 0.089], [0.6, 0.076], [1, 0.064]], { sx: 0.97 }), C.pants, 'camo');
    add(th, rbox(0.032, 0.135, 0.115, 0.013), C.pants, 'camo', [sx * 0.078, -0.235, 0]);
    if (!T && sx > 0) {
      // drop-leg holster with the pistol grip showing, two leg straps
      add(th, rbox(0.052, 0.175, 0.088, 0.016), C.gear, 'nylon', [0.108, -0.17, 0]);
      add(th, rbox(0.034, 0.075, 0.042, 0.01, 1), C.poly, 'polymer', [0.108, -0.05, 0.008], [-0.15, 0, 0]);
      for (const y of [-0.15, -0.275]) add(th, cyl(0.093, 0.093, 0.02, 18, true), C.webbing, 'webbing', [0.006, y, 0]);
    }
    add(kn, sph(0.066, 14, 10), C.pants, 'camo');
    add(kn, rbox(T ? 0.105 : 0.112, T ? 0.11 : 0.125, 0.06, 0.028), C.pad, 'rubber', [0, -0.01, -0.07]);                  // knee pad
    if (!T) add(kn, cyl(0.069, 0.069, 0.018, 16, true), C.webbing, 'webbing', [0, -0.01, 0]);
    add(kn, limb(0.4, [[0, 0.064], [0.22, 0.068], [0.55, 0.058], [1, 0.052]]), C.pants, 'camo');
    add(kn, lathe([[-0.47, 0.068], [-0.4, 0.071], [-0.32, 0.067]], { capTop: false, capBottom: false }), C.boot, 'leather');
    add(kn, rbox(0.046, 0.12, 0.016, 0.006, 1), C.lace, 'webbing', [0, -0.395, -0.07], [0.08, 0, 0]);
    add(kn, rbox(0.108, 0.085, 0.24, 0.034), C.boot, 'leather', [0, -0.468, -0.04]);
    add(kn, sph(0.056, 14, 10), C.boot, 'leather', [0, -0.474, -0.148], [0, 0, 0], [1, 0.74, 1.15]);                     // toe box
    add(kn, rbox(0.112, 0.024, 0.272, 0.01), C.sole, 'rubber', [0, -0.506, -0.05]);
  }
  return P;
}

/** Silhouette LOD (LOD1): same proportions and colours, ~1.5k triangles. */
function lowParts(team, skin) {
  const T = team === 'TERRORIST', C = PALETTE[team], P = [];
  const add = (bone, geo, color, surf, p, r, s) => P.push({ bone, geo, color, surf, p, r, s });
  add('hip', rbox(0.34, 0.22, 0.23, 0.06, 1), C.pants, 'camo', [0, -0.02, 0]);
  add('spine', rbox(0.37, 0.5, 0.22, 0.08, 1), C.uniform, 'camo', [0, 0.25, 0]);
  add('spine', rbox(0.4, 0.3, 0.27, 0.05, 1), T ? C.gear : C.carrier, T ? 'nylon' : 'camo', T ? [0, 0.2, -0.03] : [0, 0.27, 0]);
  add('head', sph(0.11, 10, 8), T ? C.knit : skin, T ? 'knit' : 'skin', [0, 0.08, 0], [0, 0, 0], [0.92, 1.1, 1]);
  if (!T) { add('head', sph(0.134, 12, 5, Math.PI * 0.45), C.helmet, 'polymer', [0, 0.1, 0.01]); add('head', rbox(0.17, 0.034, 0.03, 0.01, 1), C.lens, 'lens', [0, 0.1, -0.1]); }
  else add('head', rbox(0.12, 0.032, 0.03, 0.01, 1), skin, 'skin', [0, 0.098, -0.092]);
  for (const [sh, el] of [['shoulderR', 'elbowR'], ['shoulderL', 'elbowL']]) {
    add(sh, cap(0.056, 0.2, 2, 6), C.uniform, 'camo', [0, -0.13, 0]);
    add(el, cap(0.048, 0.2, 2, 6), T ? skin : C.uniform, T ? 'skin' : 'camo', [0, -0.13, 0]);
  }
  for (const [th, kn] of [['thighL', 'kneeL'], ['thighR', 'kneeR']]) {
    add(th, cap(0.082, 0.26, 2, 6), C.pants, 'camo', [0, -0.2, 0]);
    add(kn, cap(0.064, 0.26, 2, 6), C.pants, 'camo', [0, -0.2, 0]);
    add(kn, rbox(0.115, 0.15, 0.28, 0.03, 1), C.boot, 'leather', [0, -0.44, -0.04]);
  }
  return P;
}

const geoCache = new Map();
function operatorGeometry(team, tone, lod) {
  const key = `${team}:${tone}:${lod}`;
  let g = geoCache.get(key);
  if (!g) {
    g = bake((lod ? lowParts : detailedParts)(team, SKIN[tone]));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0.95, 0), 1.25);
    geoCache.set(key, g);
  }
  return g;
}

// ---- material: one per team, shared by every operator of that team
const OP_NOISE = /* glsl */`
float opH(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float opN(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(opH(i), opH(i + vec3(1,0,0)), f.x), mix(opH(i + vec3(0,1,0)), opH(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(opH(i + vec3(0,0,1)), opH(i + vec3(1,0,1)), f.x), mix(opH(i + vec3(0,1,1)), opH(i + vec3(1,1,1)), f.x), f.y), f.z); }
`;
function patchOperator(shader, uniforms) {
  Object.assign(shader.uniforms, uniforms);
  shader.vertexShader = shader.vertexShader
    .replace('#include <common>', '#include <common>\nattribute vec4 aRM;\nvarying vec4 vRM;\nvarying vec3 vBindPos;')
    .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRM = aRM; vBindPos = position;');
  shader.fragmentShader = shader.fragmentShader
    .replace('#include <common>', `#include <common>\nuniform vec3 camoA; uniform vec3 camoB; uniform vec3 camoC;\nvarying vec4 vRM;\nvarying vec3 vBindPos;\n${OP_NOISE}`)
    .replace('#include <map_fragment>', `#ifdef USE_MAP
      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
      diffuseColor *= mix( vec4( 1.0 ), sampledDiffuseColor, clamp( vRM.z, 0.0, 1.0 ) );
    #endif`)
    .replace('#include <color_fragment>', `vec3 opCol = vColor;
    if ( vRM.w > 0.001 ) {
      // three-tone disruptive camo from bind-pose position: stable on moving limbs, no texture memory
      vec3 q = vBindPos * 12.5;
      float n1 = opN( q ) * 0.65 + opN( q * 2.3 + 11.0 ) * 0.35;
      float n2 = opN( q * 1.4 + 37.0 ) * 0.65 + opN( q * 3.1 + 5.0 ) * 0.35;
      float a = smoothstep( 0.53, 0.57, n1 ), b = smoothstep( 0.6, 0.64, n2 ) * ( 1.0 - a ), c = smoothstep( 0.7, 0.73, opN( q * 2.7 + 71.0 ) );
      vec3 camo = mix( mix( mix( vColor, camoA, a ), camoB, b ), camoC, c * 0.9 );
      opCol = mix( vColor, camo, vRM.w );
    }
    diffuseColor.rgb *= opCol;`)
    .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= vRM.x;')
    .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\nmetalnessFactor *= vRM.y;')
    .replace('#include <normal_fragment_maps>', `#ifdef USE_NORMALMAP_TANGENTSPACE
      vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
      mapN.xy *= normalScale * vRM.z;
      normal = normalize( tbn * mapN );
    #endif`);
}
const matCache = new Map();
export function operatorMaterial(team) {
  let m = matCache.get(team);
  if (m) return m;
  const tex = textureSet('ripstop', { size: 256, normalStrength: 3.2 }), pal = PALETTE[team];
  m = new THREE.MeshStandardMaterial({ name: `operator_${team}`, vertexColors: true, map: tex.map, normalMap: tex.normalMap, roughness: 1, metalness: 1, envMapIntensity: 0.85 });
  m.normalScale.set(0.9, 0.9);
  const uniforms = { camoA: { value: new THREE.Color(pal.camo[0]) }, camoB: { value: new THREE.Color(pal.camo[1]) }, camoC: { value: new THREE.Color(pal.camo[2]) } };
  const patch = shader => patchOperator(shader, uniforms);
  // WorldEngine.prepareMaterial re-chains userData.shaderPatch after CSM; standalone renderers (viewer) use these directly
  m.userData = { shared: true, shaderPatch: patch, shaderPatchKey: 'operator-v1' };
  m.onBeforeCompile = patch; m.customProgramCacheKey = () => 'kontir-plain-operator-v1-0';
  matCache.set(team, m);
  return m;
}

/** Builds every geometry variant up front (called while the match loads) so no operator is baked mid-round. */
export function prebuildOperators() {
  if (models.character('TERRORIST') && models.character('COUNTER_TERRORIST')) return;
  for (const team of ['TERRORIST', 'COUNTER_TERRORIST']) { operatorMaterial(team); for (let t = 0; t < SKIN.length; t++) { operatorGeometry(team, t, 0); operatorGeometry(team, t, 1); } }
}

export function buildOperator(team, seed = 0) {
  const model = models.character(team);
  if (model) return buildSkinned(team, model);
  if (!PALETTE[team]) team = 'TERRORIST';
  const root = new THREE.Group(), bones = {};
  for (const [name, parent, p] of BONES) { const b = new THREE.Bone(); b.name = name; b.position.set(...p); (parent ? bones[parent] : root).add(b); bones[name] = b; }
  root.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(BONES.map(([n]) => bones[n]));
  const tone = Math.abs(seed | 0) % SKIN.length, mat = operatorMaterial(team), lods = [];
  for (const lod of [0, 1]) {
    const mesh = new THREE.SkinnedMesh(operatorGeometry(team, tone, lod), mat);
    mesh.name = `operator_lod${lod}`; mesh.castShadow = true; mesh.receiveShadow = true; mesh.visible = lod === 0;
    mesh.boundingSphere = mesh.geometry.boundingSphere.clone();
    root.add(mesh); mesh.bind(skeleton, mesh.matrixWorld); lods.push(mesh);
  }
  const legs = [{ thigh: bones.thighL, knee: bones.kneeL, side: -1 }, { thigh: bones.thighR, knee: bones.kneeR, side: 1 }];
  root.userData = { hip: bones.hip, spine: bones.spine, head: bones.head, legs, shoulderR: bones.shoulderR, shoulderL: bones.shoulderL, elbowR: bones.elbowR, elbowL: bones.elbowL,
    skeleton, lods, lod: 0, weapon: null, weaponId: null, rigs: new Map(), phase: Math.random() * 6, fall: 0, team };
  // relaxed arms until a weapon is put in the hands
  bones.shoulderR.rotation.set(-0.15, 0, -0.08); bones.shoulderL.rotation.set(-0.15, 0, 0.08); bones.elbowR.rotation.x = bones.elbowL.rotation.x = -0.35;
  return root;
}

/**
 * LOD switch by camera distance. Far operators drop to the silhouette mesh; very far ones also hide the gloves.
 * Returns the active level (0 | 1).
 */
export function setOperatorDetail(actor, distance, lodDistance = 16) {
  const u = actor.userData;
  if (!u.lods) return 0;
  // hysteresis: no flicker when someone stands on the threshold
  const lod = u.lod === 0 ? (distance > lodDistance * 1.08 ? 1 : 0) : (distance < lodDistance * 0.92 ? 0 : 1);
  if (lod !== u.lod) { u.lod = lod; u.lods[0].visible = lod === 0; u.lods[1].visible = lod === 1; }
  if (u.arms) u.arms.visible = distance < lodDistance * 3;
  return lod;
}

// weapon placement in spine space per hold style, and whether the off-hand supports the weapon
const HOLD = {
  rifle: { p: [0.13, 0.34, -0.33], r: [0, 0, 0], s: 0.92 },   // grip in front of the chest, butt in the right shoulder pocket (not through the torso)
  pistol: { p: [0.06, 0.36, -0.3], r: [0, 0, 0], s: 1 },
  knife: { p: [0.14, 0.28, -0.26], r: [-0.2, 0.3, 0.2], s: 1 },
  grenade: { p: [0.13, 0.3, -0.22], r: [0.1, 0, 0], s: 1 },
  c4: { p: [0.02, 0.24, -0.26], r: [0.3, 0, 0], s: 1 },
};
const holdStyle = id => (['glock', 'usp', 'deagle', 'p250', 'fiveseven', 'tec9', 'cz75', 'r8'].includes(id) ? 'pistol' : ['knife'].includes(id) ? 'knife' : ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'].includes(id) ? 'grenade' : id === 'c4' ? 'c4' : 'rifle');

// alternative holds (lobby showcase): 'low' = low-ready, muzzle down and across the body
const POSES = {
  low: { rifle: { p: [0.1, 0.22, -0.34], r: [-0.42, 0.62, 0.32] }, pistol: { p: [0.03, 0.2, -0.3], r: [-0.95, 0.15, 0] } },
};
/** Switches the held weapon between the gameplay hold (null) and a named pose; arms follow through IK. */
export function setHoldPose(actor, pose = null) {
  const u = actor.userData;
  u.pose = pose;
  if (u.skinned || !u.weaponId) return;
  const rig = u.rigs.get(u.weaponId); if (!rig) return;
  const style = holdStyle(u.weaponId), o = (pose && POSES[pose]?.[style]) || HOLD[style];
  rig.group.position.set(...o.p); rig.group.rotation.set(...o.r);
}

/** Puts the requested weapon in the operator's hands (hands are placed on the weapon's grips; arms are solved by IK each frame). */
export function holdWeapon(actor, weaponId) {
  const u = actor.userData;
  if (u.weaponId === weaponId) return;
  if (u.weapon) u.weapon.visible = false;
  u.weaponId = weaponId; u.arms = null;
  if (!weaponId) { u.weapon = null; return; }
  if (u.skinned) {
    let rig = u.rigs.get(weaponId);
    if (!rig) { rig = buildWeaponRigTP(weaponId); u.socket.add(rig.group); u.rigs.set(weaponId, rig); }
    u.weapon = rig.group; rig.group.visible = true; return;
  }
  let rig = u.rigs.get(weaponId);
  if (!rig) {
    rig = buildWeaponRigTP(weaponId);
    const style = HOLD[holdStyle(weaponId)];
    rig.group.position.set(...style.p); rig.group.rotation.set(...style.r); rig.group.scale.setScalar(style.s);
    rig.arms = buildArms(u.team);
    for (const k of ['right', 'left']) rig.arms.userData[k].userData.sleeve.visible = false;
    poseArms(rig.arms, rig); rig.group.add(rig.arms);
    u.spine.add(rig.group); u.rigs.set(weaponId, rig);
  }
  u.weapon = rig.group; u.arms = rig.arms; rig.group.visible = true;
  if (u.pose) setHoldPose(actor, u.pose);
}

const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3(), _E = new THREE.Vector3(), _U = new THREE.Vector3(), _F = new THREE.Vector3();
const _qs = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0), _wrist = new THREE.Vector3(0, 0, 0.09);
/** Analytic two-bone IK: shoulder/elbow pivots hang along local -Y; `pole` (world) bends the elbow. */
function solveArm(shoulder, elbow, target, pole) {
  shoulder.getWorldPosition(_S);
  _D.subVectors(target, _S); const dist = Math.min(Math.max(_D.length(), 0.12), ARM * 2 - 0.006); _D.normalize();
  const x = dist / 2, h = Math.sqrt(Math.max(0, ARM * ARM - x * x));
  _P.copy(pole).addScaledVector(_D, -pole.dot(_D)).normalize();
  _E.copy(_S).addScaledVector(_D, x).addScaledVector(_P, h);
  _U.subVectors(_E, _S).normalize(); _F.subVectors(target, _E).normalize();
  _qs.setFromUnitVectors(_down, _U); _qe.setFromUnitVectors(_down, _F);
  shoulder.parent.getWorldQuaternion(_qp);
  shoulder.quaternion.copy(_qp.invert()).multiply(_qs);
  elbow.quaternion.copy(_qs).invert().multiply(_qe);
}
const _poleR = new THREE.Vector3(), _poleL = new THREE.Vector3(), _sq = new THREE.Quaternion();
function poseArmsIK(u) {
  const key = { right: [u.shoulderR, u.elbowR, _poleR.set(0.55, -1, 0.35)], left: [u.shoulderL, u.elbowL, _poleL.set(-0.5, -1, -0.1)] };
  u.spine.getWorldQuaternion(_sq);
  for (const [name, [shoulder, elbow, pole]] of Object.entries(key)) {
    const wrap = u.arms?.userData[name];
    if (!wrap?.visible) { shoulder.rotation.set(-0.15, 0, name === 'left' ? 0.08 : -0.08); elbow.rotation.set(-0.35, 0, 0); continue; }
    _T.copy(_wrist); wrap.localToWorld(_T);
    solveArm(shoulder, elbow, _T, pole.applyQuaternion(_sq));
  }
}

/** Animates locomotion, crouch, aim and death for one frame. `speed` in m/s, angles in radians. */
export function animateOperator(actor, { speed, yaw, pitch, crouch, alive, dt, moveYaw }) {
  const u = actor.userData;
  if (u.skinned) return animateSkinned(actor, { speed, yaw, pitch, crouch, alive, dt });
  u.fall += ((alive ? 0 : 1) - u.fall) * Math.min(1, dt * 7);
  actor.rotation.y = yaw;
  const stride = Math.min(1, speed / 6.4);
  u.phase += dt * (3 + speed * 1.55);
  const bend = crouch * 0.95, rel = moveYaw === undefined ? 0 : Math.atan2(Math.sin(moveYaw - yaw), Math.cos(moveYaw - yaw));
  const backwards = Math.cos(rel) < -0.2 ? -1 : 1;
  // idle breathing keeps a standing operator from looking frozen
  const breathe = speed < 0.2 && alive ? Math.sin(u.phase * 0.55) * 0.006 : 0;
  u.hip.position.y = 0.94 - crouch * 0.34 - Math.abs(Math.sin(u.phase)) * 0.018 * stride;
  u.hip.rotation.x = crouch * 0.25;
  u.hip.rotation.z = Math.sin(u.phase) * 0.03 * stride;
  u.legs.forEach((leg, i) => {
    const s = i ? 1 : -1, ph = Math.sin(u.phase + (i ? Math.PI : 0)), lf = Math.max(0, Math.cos(u.phase + (i ? Math.PI : 0)));
    leg.thigh.rotation.x = -bend * 0.9 + ph * 0.75 * stride * backwards;
    leg.knee.rotation.x = bend * 1.55 + lf * 0.9 * stride;
    leg.thigh.rotation.z = Math.sin(rel) * 0.06 * s * stride;
  });
  u.spine.rotation.x = -pitch * 0.55 - crouch * 0.2 + breathe;
  u.spine.rotation.y = Math.sin(rel) * 0.12 * stride;
  u.head.rotation.x = -pitch * 0.45;
  actor.rotation.x = -u.fall * (Math.PI / 2 - 0.05);
  actor.position.y += u.fall * 0.2;
  if (u.weapon) {
    u.weapon.visible = u.fall < 0.6;
    if (u.weapon.visible) { actor.updateMatrixWorld(true); poseArmsIK(u); }
  }
}
