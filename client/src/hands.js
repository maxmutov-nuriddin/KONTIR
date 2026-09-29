// Gloved hands and sleeved forearms shared by the first-person viewmodel and the third-person operators.
//
// Canonical hand frame (right hand): origin = palm centre, fingers point -Z, the back of the hand faces +Y,
// the thumb side is -X, the wrist is at +Z. Left hands are mirrored in X. A grip pose is applied by rotating the
// whole hand (rig.hands[..].r) and curling the phalanges; the result is baked into ONE merged geometry per
// (side, pose) so a hand costs a single draw call.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** Phalanx curls (radians, positive = toward the palm). Rows: index, middle, ring, pinky -> [prox, mid, dist]; thumb -> [base, tip]. */
export const GRIPS = {
  grip: { fingers: [[0.95, 1.35, 0.85], [1.1, 1.45, 0.9], [1.2, 1.5, 0.95], [1.25, 1.5, 1.0]], thumb: [0.35, 0.3], thumbYaw: 0.35 },
  wrap: { fingers: [[0.7, 1.1, 0.7], [0.8, 1.2, 0.75], [0.85, 1.25, 0.8], [0.9, 1.25, 0.8]], thumb: [0.2, 0.2], thumbYaw: 0.5 },
  cup: { fingers: [[0.35, 0.55, 0.35], [0.4, 0.6, 0.4], [0.45, 0.65, 0.4], [0.5, 0.65, 0.4]], thumb: [0.2, 0.15], thumbYaw: 0.6 },
  trigger: { fingers: [[0.1, 0.15, 0.1], [1.1, 1.45, 0.9], [1.2, 1.5, 0.95], [1.25, 1.5, 1.0]], thumb: [0.3, 0.3], thumbYaw: 0.35 },
  pinch: { fingers: [[0.7, 0.8, 0.5], [0.8, 0.9, 0.5], [0.9, 1.0, 0.55], [1.0, 1.05, 0.55]], thumb: [0.5, 0.4], thumbYaw: 0.15 },
  open: { fingers: [[0.15, 0.2, 0.1], [0.12, 0.18, 0.1], [0.15, 0.22, 0.1], [0.2, 0.25, 0.12]], thumb: [0.1, 0.1], thumbYaw: 0.5 },
};

const cache = new Map();
const flat = g => { const q = g.index ? g.toNonIndexed() : g; q.deleteAttribute('uv'); return q; };
const rbox = (w, h, d, r) => new RoundedBoxGeometry(w, h, d, 2, r);

function place(geo, x, y, z, rx = 0, ry = 0, rz = 0) {
  const m = new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'XYZ')), new THREE.Vector3(1, 1, 1));
  return geo.applyMatrix4(m);
}
/** A finger: chain of capsules curling about the local X axis. Returns merged geometry in hand space. */
function finger(base, lens, curls, radius, taper = 0.92) {
  const parts = []; const m = new THREE.Matrix4().makeTranslation(base.x, base.y, base.z);
  let r = radius;
  for (let i = 0; i < lens.length; i++) {
    m.multiply(new THREE.Matrix4().makeRotationX(-curls[i]));           // negative X rotation bends toward the palm (-Y)
    const cap = new THREE.CapsuleGeometry(r, lens[i], 4, 8); cap.rotateX(Math.PI / 2); cap.translate(0, 0, -lens[i] / 2);
    parts.push(cap.applyMatrix4(m));
    m.multiply(new THREE.Matrix4().makeTranslation(0, 0, -lens[i])); r *= taper;
  }
  return mergeGeometries(parts.map(flat), false);
}

/** Baked hand geometry (palm origin). `side` 'right' | 'left', `grip` key of GRIPS. */
export function handGeometry(side, grip = 'grip') {
  const key = `${side}:${grip}`;
  if (cache.has(key)) return cache.get(key);
  const s = side === 'right' ? 1 : -1, g = GRIPS[grip] || GRIPS.grip, parts = [];
  parts.push(rbox(0.076, 0.03, 0.086, 0.011));                                                     // palm
  parts.push(place(rbox(0.068, 0.012, 0.07, 0.005), 0, 0.017, -0.004));                           // knuckle / back-of-hand pad
  parts.push(place(new THREE.CylinderGeometry(0.037, 0.042, 0.05, 14).rotateX(Math.PI / 2), 0, 0, 0.068)); // cuff
  const xs = [-0.027, -0.009, 0.009, 0.026].map(x => x * s), lens = [[0.04, 0.026, 0.02], [0.044, 0.029, 0.021], [0.04, 0.026, 0.02], [0.032, 0.021, 0.018]];
  for (let i = 0; i < 4; i++) parts.push(finger(new THREE.Vector3(xs[i], 0.004, -0.043), lens[i], g.fingers[i], 0.0088 - i * 0.0004));
  // thumb: two phalanges rooted at the thumb side, yawed forward
  const t = new THREE.Matrix4().makeTranslation(-0.04 * s, 0.002, -0.012).multiply(new THREE.Matrix4().makeRotationY(g.thumbYaw * s)).multiply(new THREE.Matrix4().makeRotationZ(0.35 * s));
  const base = new THREE.CapsuleGeometry(0.0105, 0.03, 4, 8).rotateX(Math.PI / 2).translate(0, 0, -0.015);
  parts.push(base.clone().applyMatrix4(t.clone().multiply(new THREE.Matrix4().makeRotationX(-g.thumb[0]))));
  const t2 = t.clone().multiply(new THREE.Matrix4().makeRotationX(-g.thumb[0])).multiply(new THREE.Matrix4().makeTranslation(0, 0, -0.03)).multiply(new THREE.Matrix4().makeRotationX(-g.thumb[1]));
  parts.push(new THREE.CapsuleGeometry(0.0095, 0.024, 4, 8).rotateX(Math.PI / 2).translate(0, 0, -0.012).applyMatrix4(t2));
  const geo = mergeGeometries(parts.map(flat), false);
  geo.computeVertexNormals(); geo.userData.shared = true; cache.set(key, geo);
  return geo;
}

/** Tapered sleeve along +Z from the wrist (z=0) to `length` (elbow side). */
export function forearmGeometry(length = 0.32, rWrist = 0.041, rElbow = 0.054) {
  const geo = new THREE.CylinderGeometry(rElbow, rWrist, length, 16, 1, false); geo.rotateX(Math.PI / 2); geo.translate(0, 0, length / 2);
  return geo;
}

/**
 * First-person arms for a team. Each side is a group holding a hand mesh (palm at the group origin) and a sleeve mesh
 * that is re-aimed at the weapon-local elbow point by poseArms().
 */
export function buildArms(team, gloveMat, sleeveMat) {
  const root = new THREE.Group();
  const side = name => {
    const wrap = new THREE.Group(), hand = new THREE.Mesh(handGeometry(name, 'grip'), gloveMat), sleeve = new THREE.Mesh(forearmGeometry(1, 0.036, 0.047), sleeveMat);
    hand.scale.setScalar(1.18); hand.castShadow = hand.receiveShadow = false; sleeve.castShadow = sleeve.receiveShadow = false;
    wrap.add(hand, sleeve); wrap.userData = { hand, sleeve, name };
    return wrap;
  };
  root.userData.right = side('right'); root.userData.left = side('left'); root.userData.team = team;
  root.add(root.userData.right, root.userData.left);
  return root;
}

const V = new THREE.Vector3(), Q = new THREE.Quaternion(), E = new THREE.Euler();
/**
 * Places both hands on a rig. pose = { p: palm (weapon-local), r: euler, elbow: weapon-local point, grip: key of GRIPS }.
 * The sleeve runs from the wrist (palm + 0.062 back along the hand's +Z) toward the elbow point.
 */
export function poseArms(arms, rig) {
  for (const key of ['right', 'left']) {
    const wrap = arms.userData[key], pose = rig.hands[key];
    wrap.visible = !!pose;
    if (!pose) continue;
    const { hand, sleeve, name } = wrap.userData;
    hand.geometry = handGeometry(name, pose.grip || (key === 'left' ? 'cup' : 'grip'));
    wrap.position.set(...pose.p); wrap.rotation.set(...pose.r);
    wrap.updateMatrix();
    // wrist point in the wrap's parent (weapon) space
    const wrist = V.set(0, 0, 0.09).applyMatrix4(wrap.matrix);
    const elbow = new THREE.Vector3(...(pose.elbow || [pose.p[0] + (key === 'right' ? 0.08 : -0.12), pose.p[1] - 0.3, pose.p[2] + 0.55]));
    const len = elbow.clone().sub(wrist).length();
    // sleeve lives in the wrap's local space: express the world direction inversely
    const inv = new THREE.Matrix4().copy(wrap.matrix).invert();
    const elbowLocal = elbow.applyMatrix4(inv), wristLocal = new THREE.Vector3(0, 0, 0.09);
    const dl = elbowLocal.clone().sub(wristLocal).normalize();
    sleeve.position.copy(wristLocal);
    Q.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dl); sleeve.quaternion.copy(Q);
    sleeve.scale.set(1, 1, len);
    void E;
  }
}
