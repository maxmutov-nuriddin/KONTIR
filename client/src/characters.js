// Third-person operators: articulated PBR body (pelvis / spine / limbs) with procedural locomotion,
// crouch bend, aim pitch, weapon holding and a death fall. Team-coloured T (desert) / CT (navy).
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildArms, buildWeaponRigTP, poseArms } from './viewmodels.js';

const skinTones = [0xd7a982, 0xb07d58, 0x8a5a3c, 0xe2b896, 0x6e4a33];

function materialsFor(team, seed) {
  const t = team === 'TERRORIST';
  const cloth = (color) => new THREE.MeshStandardMaterial({ color, roughness: 0.94, metalness: 0 });
  return {
    uniform: cloth(t ? 0x8a7650 : 0x3a4658), pants: cloth(t ? 0x6f6248 : 0x2c3542), vest: cloth(t ? 0x2b2d29 : 0x4d5540),
    skin: new THREE.MeshStandardMaterial({ color: skinTones[seed % skinTones.length], roughness: 0.62 }),
    helmet: new THREE.MeshStandardMaterial({ color: t ? 0x22231f : 0x3d4a39, roughness: 0.55, metalness: 0.05 }),
    scarf: cloth(t ? 0x1f2022 : 0x1b1e22), boot: new THREE.MeshStandardMaterial({ color: 0x181614, roughness: 0.75 }),
    glove: new THREE.MeshStandardMaterial({ color: 0x1c1d1f, roughness: 0.8 }), goggle: new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.1, metalness: 0.6 }),
    strap: new THREE.MeshStandardMaterial({ color: 0x141513, roughness: 0.9 }),
  };
}
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 3, r);
function mesh(parent, geo, mat, x = 0, y = 0, z = 0) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m; }
const pivot = (parent, x, y, z) => { const g = new THREE.Group(); g.position.set(x, y, z); parent.add(g); return g; };

export function buildOperator(team, seed = 0) {
  const M = materialsFor(team, seed), root = new THREE.Group();
  const hip = pivot(root, 0, 0.94, 0), spine = pivot(hip, 0, 0.06, 0), head = pivot(spine, 0, 0.58, 0);
  // torso + plate carrier
  mesh(spine, rbox(0.36, 0.5, 0.21, 0.06), M.uniform, 0, 0.25, 0);
  mesh(spine, rbox(0.385, 0.42, 0.25, 0.05), M.vest, 0, 0.28, -0.005);
  for (const x of [-0.11, 0, 0.11]) mesh(spine, rbox(0.085, 0.11, 0.06, 0.015), M.vest, x, 0.09, -0.15);
  mesh(spine, rbox(0.3, 0.08, 0.16, 0.03), M.pants, 0, -0.04, 0);
  // head, neck, helmet
  mesh(head, new THREE.CylinderGeometry(0.05, 0.058, 0.09, 12), M.skin, 0, -0.035, 0);
  const skull = mesh(head, new THREE.SphereGeometry(0.108, 20, 16), M.skin, 0, 0.08, 0); skull.scale.set(0.92, 1.08, 1);
if (team === 'COUNTER_TERRORIST') {
    const helmet = mesh(head, new THREE.SphereGeometry(0.128, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), M.helmet, 0, 0.095, 0.004); helmet.scale.set(0.98, 1, 1.08);
    mesh(head, rbox(0.21, 0.05, 0.04, 0.012), M.goggle, 0, 0.098, -0.106);
    mesh(head, rbox(0.23, 0.02, 0.03, 0.008), M.strap, 0, 0.112, -0.105);
    mesh(head, rbox(0.17, 0.07, 0.05, 0.02), M.scarf, 0, 0.03, -0.08);
  } else {
    const hood = mesh(head, new THREE.SphereGeometry(0.118, 26, 18), M.scarf, 0, 0.08, 0.004); hood.scale.set(0.93, 1.1, 1.04);   // balaclava
    mesh(head, rbox(0.15, 0.036, 0.03, 0.012), M.skin, 0, 0.098, -0.108);                                                          // eye slit
    mesh(head, rbox(0.155, 0.014, 0.03, 0.006), M.strap, 0, 0.128, -0.104);                                                        // headband
  }
  // arms hold the rifle: right hand at the grip, left at the handguard (static aim pose; spine pitches with the player)
  const shoulderR = pivot(spine, 0.235, 0.46, 0), shoulderL = pivot(spine, -0.235, 0.46, 0);
  const arm = (shoulder, upperRot, foreRot) => {
    shoulder.rotation.set(...upperRot);
    mesh(shoulder, new THREE.CapsuleGeometry(0.052, 0.22, 4, 10), M.uniform, 0, -0.13, 0);
    const elbow = pivot(shoulder, 0, -0.27, 0); elbow.rotation.set(...foreRot);
    mesh(elbow, new THREE.CapsuleGeometry(0.045, 0.19, 4, 10), M.uniform, 0, -0.135, 0);
    return elbow;
  };
  const elbowR = arm(shoulderR, [-0.75, 0.05, -0.1], [-1.05, 0, 0]);
  const elbowL = arm(shoulderL, [-1.15, -0.05, 0.25], [-0.65, 0, 0]);
  // legs: thigh pivot -> knee pivot
  const legs = [];
  for (const s of [-1, 1]) {
    const thigh = pivot(hip, s * 0.095, 0, 0), knee = pivot(thigh, 0, -0.42, 0);
    mesh(thigh, new THREE.CapsuleGeometry(0.075, 0.28, 4, 10), M.pants, 0, -0.2, 0);
    mesh(knee, new THREE.CapsuleGeometry(0.062, 0.3, 4, 10), M.pants, 0, -0.2, 0);
    mesh(knee, rbox(0.11, 0.09, 0.27, 0.03), M.boot, 0, -0.43, -0.05);
    mesh(knee, new THREE.CylinderGeometry(0.068, 0.07, 0.1, 12), M.boot, 0, -0.36, 0);
    legs.push({ thigh, knee, side: s });
  }
  root.userData = { M, hip, spine, head, legs, shoulderR, shoulderL, elbowR, elbowL, weapon: null, weaponId: null, rigs: new Map(), phase: Math.random() * 6, fall: 0, team };
  return root;
}

// weapon placement in spine space per hold style, and whether the off-hand supports the weapon
const HOLD = {
  rifle: { p: [0.1, 0.32, -0.12], r: [0, 0, 0], s: 0.92 },
  pistol: { p: [0.06, 0.36, -0.3], r: [0, 0, 0], s: 1 },
  knife: { p: [0.14, 0.28, -0.26], r: [-0.2, 0.3, 0.2], s: 1 },
  grenade: { p: [0.13, 0.3, -0.22], r: [0.1, 0, 0], s: 1 },
  c4: { p: [0.02, 0.24, -0.26], r: [0.3, 0, 0], s: 1 },
};
const holdStyle = id => (['glock', 'usp', 'deagle', 'p250', 'fiveseven', 'tec9', 'cz75', 'r8'].includes(id) ? 'pistol' : ['knife'].includes(id) ? 'knife' : ['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy'].includes(id) ? 'grenade' : id === 'c4' ? 'c4' : 'rifle');

/** Puts the requested weapon in the operator's hands (hands are placed on the weapon's grips; arms are solved by IK each frame). */
export function holdWeapon(actor, weaponId) {
  const u = actor.userData;
  if (u.weaponId === weaponId) return;
  if (u.weapon) u.weapon.visible = false;
  u.weaponId = weaponId; u.arms = null;
  if (!weaponId) { u.weapon = null; return; }
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
}

const _S = new THREE.Vector3(), _T = new THREE.Vector3(), _D = new THREE.Vector3(), _P = new THREE.Vector3(), _E = new THREE.Vector3(), _U = new THREE.Vector3(), _F = new THREE.Vector3();
const _qs = new THREE.Quaternion(), _qe = new THREE.Quaternion(), _qp = new THREE.Quaternion(), _down = new THREE.Vector3(0, -1, 0), _wrist = new THREE.Vector3(0, 0, 0.09);
const ARM = 0.27;
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
  u.fall += ((alive ? 0 : 1) - u.fall) * Math.min(1, dt * 7);
  actor.rotation.y = yaw;
  const stride = Math.min(1, speed / 6.4);
  u.phase += dt * (3 + speed * 1.55);
  const swing = Math.sin(u.phase) * 0.75 * stride, lift = Math.max(0, Math.sin(u.phase + Math.PI / 2));
  const bend = crouch * 0.95, rel = moveYaw === undefined ? 0 : Math.atan2(Math.sin(moveYaw - yaw), Math.cos(moveYaw - yaw));
  const backwards = Math.cos(rel) < -0.2 ? -1 : 1;
  u.hip.position.y = 0.94 - crouch * 0.34 - Math.abs(Math.sin(u.phase)) * 0.018 * stride;
  u.hip.rotation.x = crouch * 0.25;
  u.hip.rotation.z = Math.sin(u.phase) * 0.03 * stride;
  u.legs.forEach((leg, i) => {
    const s = i ? 1 : -1, ph = Math.sin(u.phase + (i ? Math.PI : 0)), lf = Math.max(0, Math.cos(u.phase + (i ? Math.PI : 0)));
    leg.thigh.rotation.x = -bend * 0.9 + ph * 0.75 * stride * backwards;
    leg.knee.rotation.x = bend * 1.55 + lf * 0.9 * stride;
    leg.thigh.rotation.z = Math.sin(rel) * 0.06 * s * stride;
  });
  void swing; void lift;
  u.spine.rotation.x = -pitch * 0.55 - crouch * 0.2;
  u.spine.rotation.y = Math.sin(rel) * 0.12 * stride;
  u.head.rotation.x = -pitch * 0.45;
  actor.rotation.x = -u.fall * (Math.PI / 2 - 0.05);
  actor.position.y += u.fall * 0.2;
  if (u.weapon) {
    u.weapon.visible = u.fall < 0.6;
    if (u.weapon.visible) { actor.updateMatrixWorld(true); poseArmsIK(u); }
  }
}
