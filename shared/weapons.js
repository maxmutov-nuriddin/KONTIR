// Weapon table, CS-style recoil patterns, hitboxes and damage model shared by server and client.
import { UNIT, TICK_RATE } from './constants.js';

export const SLOT = Object.freeze({ PRIMARY: 1, SECONDARY: 2, MELEE: 3, UTILITY: 4, OBJECTIVE: 5 });
export const SLOT_NAMES = Object.freeze({ 1: 'PRIMARY', 2: 'SECONDARY', 3: 'MELEE', 4: 'UTILITY', 5: 'OBJECTIVE' });
const DEG = Math.PI / 180;

// Per-shot view/bullet displacement in degrees: [yaw (+ = right), pitch (+ = up)]. Index 0 is the first (accurate) bullet.
const AK47_PATTERN = [[0, 0], [0.02, 0.95], [-0.04, 1.3], [0.05, 1.55], [-0.08, 1.62], [-0.1, 1.4], [-0.15, 1.1], [-0.28, 0.55], [-0.34, 0.2], [-0.32, 0.18],
  [-0.25, 0.12], [-0.05, 0.08], [0.2, 0.05], [0.32, 0.02], [0.36, 0], [0.3, 0.02], [0.24, 0], [0.14, 0], [-0.05, 0.05], [-0.22, 0.06],
  [-0.3, 0.04], [-0.34, 0.03], [-0.28, 0], [-0.06, 0], [0.12, 0.02], [0.26, 0.02], [0.3, 0], [0.2, 0], [-0.1, 0], [-0.24, 0]];
const M4A4_PATTERN = [[0, 0], [0.01, 0.7], [-0.03, 0.95], [0.04, 1.1], [0.06, 1.15], [0.04, 1], [-0.05, 0.8], [-0.12, 0.5], [-0.2, 0.3], [-0.2, 0.2],
  [-0.14, 0.15], [0.05, 0.1], [0.14, 0.08], [0.2, 0.06], [0.2, 0.05], [0.12, 0.04], [-0.02, 0.03], [-0.12, 0.03], [-0.18, 0.02], [-0.16, 0.02],
  [-0.06, 0.02], [0.08, 0.02], [0.16, 0.02], [0.18, 0], [0.12, 0], [0.02, 0], [-0.1, 0], [-0.14, 0], [-0.1, 0], [-0.02, 0]];
const DEAGLE_PATTERN = [[0, 0], [0.05, 2.1], [-0.1, 2.4], [0.15, 2.6], [-0.2, 2.8], [0.2, 3], [-0.2, 3.2]];
const GLOCK_PATTERN = [[0, 0], [0.02, 0.55], [-0.04, 0.7], [0.05, 0.75], [-0.06, 0.7], [0.08, 0.6], [-0.08, 0.5], [0.06, 0.45], [-0.05, 0.4], [0.04, 0.35],
  [-0.04, 0.3], [0.05, 0.3], [-0.05, 0.25], [0.04, 0.25], [-0.03, 0.2], [0.03, 0.2], [-0.03, 0.2], [0.03, 0.15], [-0.02, 0.15], [0.02, 0.15]];

/** Cumulative offset table (radians) built from per-shot increments. */
function cumulative(increments) {
  const out = []; let yaw = 0, pitch = 0;
  for (const [dy, dp] of increments) { yaw += dy * DEG; pitch += dp * DEG; out.push({ yaw, pitch }); }
  return out;
}

const gun = (o) => Object.freeze({ kind: 'gun', melee: false, ...o, recoilTable: cumulative(o.recoil) });

export const WEAPONS = Object.freeze({
  ak47: gun({ id: 'ak47', name: 'AK-47', slot: 1, team: 'TERRORIST', price: 2700, kill: 300, damage: 36, armorRatio: 1.55, range: 0.98, interval: 0.1, auto: true,
    mag: 30, reserve: 90, reload: 2.43, drawTime: 900, recoil: AK47_PATTERN, recoilDelay: 0.22, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0016, crouch: 0.0009, move: 0.011, air: 0.05, burst: 0.0004, burstMax: 0.004 }, model: 'ak47' }),
  m4a4: gun({ id: 'm4a4', name: 'M4A4', slot: 1, team: 'COUNTER_TERRORIST', price: 3100, kill: 300, damage: 33, armorRatio: 1.4, range: 0.97, interval: 0.09, auto: true,
    mag: 30, reserve: 90, reload: 3.07, drawTime: 900, recoil: M4A4_PATTERN, recoilDelay: 0.2, recoilRate: 7.5, viewKick: 1,
    spread: { stand: 0.0014, crouch: 0.0008, move: 0.01, air: 0.045, burst: 0.0003, burstMax: 0.0035 }, model: 'm4a4' }),
  deagle: gun({ id: 'deagle', name: 'DESERT EAGLE', slot: 2, team: null, price: 700, kill: 300, damage: 63, armorRatio: 1.864, range: 0.81, interval: 0.225, auto: false,
    mag: 7, reserve: 35, reload: 2.2, drawTime: 700, recoil: DEAGLE_PATTERN, recoilDelay: 0.3, recoilRate: 4.5, viewKick: 1,
    spread: { stand: 0.0022, crouch: 0.0014, move: 0.02, air: 0.07, burst: 0.004, burstMax: 0.02 }, model: 'deagle' }),
  glock: gun({ id: 'glock', name: 'GLOCK-18', slot: 2, team: 'TERRORIST', price: 200, kill: 300, damage: 30, armorRatio: 0.9, range: 0.85, interval: 0.15, auto: false,
    mag: 20, reserve: 120, reload: 2.27, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.18, recoilRate: 8, viewKick: 1,
    spread: { stand: 0.0018, crouch: 0.001, move: 0.013, air: 0.05, burst: 0.0015, burstMax: 0.008 }, model: 'glock' }),
  usp: gun({ id: 'usp', name: 'USP-S', slot: 2, team: 'COUNTER_TERRORIST', price: 200, kill: 300, damage: 35, armorRatio: 1.0, range: 0.81, interval: 0.17, auto: false,
    mag: 12, reserve: 24, reload: 2.2, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.2, recoilRate: 6, viewKick: 1,
    spread: { stand: 0.0014, crouch: 0.0008, move: 0.01, air: 0.04, burst: 0.001, burstMax: 0.006 }, model: 'usp' }),
  awp: gun({ id: 'awp', name: 'AWP', slot: 1, team: null, price: 4750, kill: 100, damage: 115, armorRatio: 1.95, range: 0.99, interval: 1.46, auto: false,
    mag: 10, reserve: 30, reload: 3.67, drawTime: 1200, recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1, viewKick: 2,
    spread: { stand: 0.0002, crouch: 0.0001, move: 0.2, air: 0.5, burst: 0.0001, burstMax: 0.0001 }, model: 'awp' }),
  famas: gun({ id: 'famas', name: 'FAMAS', slot: 1, team: 'COUNTER_TERRORIST', price: 2050, kill: 300, damage: 30, armorRatio: 1.4, range: 0.96, interval: 0.09, auto: true,
    mag: 25, reserve: 90, reload: 3.3, drawTime: 900, recoil: M4A4_PATTERN, recoilDelay: 0.2, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0015, crouch: 0.0009, move: 0.011, air: 0.045, burst: 0.0004, burstMax: 0.004 }, model: 'famas' }),
  galil: gun({ id: 'galil', name: 'GALIL AR', slot: 1, team: 'TERRORIST', price: 2000, kill: 300, damage: 30, armorRatio: 1.55, range: 0.98, interval: 0.09, auto: true,
    mag: 35, reserve: 90, reload: 3.0, drawTime: 900, recoil: AK47_PATTERN, recoilDelay: 0.22, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0018, crouch: 0.0011, move: 0.013, air: 0.05, burst: 0.0005, burstMax: 0.005 }, model: 'galil' }),
  knife: Object.freeze({ id: 'knife', kind: 'melee', melee: true, name: 'KNIFE', slot: 3, team: null, price: 0, kill: 1500, damage: 40, stabDamage: 65, backstab: 180,
    range: 1.7, interval: 0.5, stabInterval: 1.1, drawTime: 400, model: 'knife', recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1, mag: 0, reserve: 0 }),
  he: Object.freeze({ id: 'he', kind: 'grenade', melee: false, name: 'HE GRENADE', slot: 4, team: null, price: 300, kill: 300, damage: 98, radius: 8.5, fuse: 1.6, max: 1, drawTime: 600, model: 'he', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  flash: Object.freeze({ id: 'flash', kind: 'grenade', melee: false, name: 'FLASHBANG', slot: 4, team: null, price: 200, kill: 0, damage: 0, radius: 24, fuse: 1.5, max: 2, drawTime: 600, model: 'flash', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  smoke: Object.freeze({ id: 'smoke', kind: 'grenade', melee: false, name: 'SMOKE GRENADE', slot: 4, team: null, price: 300, kill: 0, damage: 0, radius: 4.6, fuse: 2.2, max: 1, duration: 18, drawTime: 600, model: 'smoke', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  c4: Object.freeze({ id: 'c4', kind: 'objective', melee: false, name: 'C4 EXPLOSIVE', slot: 5, team: 'TERRORIST', price: 0, kill: 0, damage: 0, drawTime: 800, model: 'c4', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
});
export const GRENADES = Object.freeze(['he', 'flash', 'smoke']);
export const MAX_GRENADES = 4;

export const BUY_ITEMS = Object.freeze({
  ak47: { price: 2700, team: 'TERRORIST', group: 'RIFLES' }, galil: { price: 2000, team: 'TERRORIST', group: 'RIFLES' },
  m4a4: { price: 3100, team: 'COUNTER_TERRORIST', group: 'RIFLES' }, famas: { price: 2050, team: 'COUNTER_TERRORIST', group: 'RIFLES' },
  awp: { price: 4750, group: 'RIFLES' },
  deagle: { price: 700, group: 'PISTOLS' }, glock: { price: 200, team: 'TERRORIST', group: 'PISTOLS' }, usp: { price: 200, team: 'COUNTER_TERRORIST', group: 'PISTOLS' },
  he: { price: 300, group: 'GRENADES' }, flash: { price: 200, group: 'GRENADES' }, smoke: { price: 300, group: 'GRENADES' },
  kevlar: { price: 650, group: 'GEAR', name: 'KEVLAR' }, helmet: { price: 1000, group: 'GEAR', name: 'KEVLAR + HELMET' },
  defuser: { price: 400, team: 'COUNTER_TERRORIST', group: 'GEAR', name: 'DEFUSE KIT' },
});

/** Pattern offset (radians) after `shots` bullets; fractional values interpolate, which gives smooth recovery. */
export function samplePattern(weapon, shots) {
  const t = weapon.recoilTable, last = t.length - 1;
  const i = Math.min(last, Math.floor(shots)), j = Math.min(last, i + 1), f = Math.min(1, shots - Math.floor(shots));
  return { yaw: t[i].yaw + (t[j].yaw - t[i].yaw) * f, pitch: t[i].pitch + (t[j].pitch - t[i].pitch) * f };
}

/** Random cone half-angle (radians) for the current stance / motion / burst length. */
export function inaccuracy(weapon, { speed = 0, grounded = true, crouch = 0, burst = 0 }) {
  const s = weapon.spread;
  if (!s) return 0;
  const base = s.stand + (s.crouch - s.stand) * crouch;
  const move = grounded ? s.move * Math.min(1, speed / (250 * UNIT)) : s.air;
  return base + move + Math.min(s.burstMax, burst * s.burst);
}

/** Aim direction after applying recoil offset and a random deviation. yaw: positive = left (three.js). */
export function shotDirection(yaw, pitch, punch, spread, random) {
  const angle = random() * Math.PI * 2, radius = Math.sqrt(random()) * spread;
  const y = yaw - punch.yaw + Math.cos(angle) * radius, p = pitch + punch.pitch + Math.sin(angle) * radius;
  return { x: -Math.sin(y) * Math.cos(p), y: Math.sin(p), z: -Math.cos(y) * Math.cos(p) };
}

/** Deterministic PRNG (mulberry32). */
export function makeRandom(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

export const HITGROUPS = Object.freeze({ head: 4, chest: 1, stomach: 1.25, arm: 1, leg: 0.75 });
// Player-local boxes for a standing 1.8 m hull; y is scaled by the current hull height.
const BOXES = Object.freeze([
  { part: 'head', min: [-0.13, 1.5, -0.15], max: [0.13, 1.78, 0.15] },
  { part: 'chest', min: [-0.27, 1.1, -0.2], max: [0.27, 1.5, 0.2] },
  { part: 'stomach', min: [-0.24, 0.85, -0.19], max: [0.24, 1.1, 0.19] },
  { part: 'arm', min: [-0.42, 0.95, -0.13], max: [-0.27, 1.5, 0.13] },
  { part: 'arm', min: [0.27, 0.95, -0.13], max: [0.42, 1.5, 0.13] },
  { part: 'leg', min: [-0.22, 0, -0.2], max: [0.22, 0.85, 0.2] },
]);

/** Ray vs. player hitboxes. `p` needs x,y,z,yaw,crouch (a rewound or live character). Returns { distance, part } or null. */
export function rayHitPlayer(origin, dir, p, maxDistance, hullHeight = null) {
  const height = hullHeight ?? (1.8 + (1.2 - 1.8) * (p.crouch || 0));
  const sy = height / 1.8, c = Math.cos(p.yaw), s = Math.sin(p.yaw);
  const ox = origin.x - p.x, oy = origin.y - p.y, oz = origin.z - p.z;
  // Player-local frame: un-yaw, and stretch y so the crouched hull maps onto the standing boxes. t is unchanged by the transform.
  const lo = [ox * c - oz * s, oy / sy, ox * s + oz * c];
  const ld = [dir.x * c - dir.z * s, dir.y / sy, dir.x * s + dir.z * c];
  let best = null;
  for (const box of BOXES) {
    let near = 0, far = maxDistance, ok = true;
    for (let k = 0; k < 3; k++) {
      if (Math.abs(ld[k]) < 1e-9) { if (lo[k] < box.min[k] || lo[k] > box.max[k]) { ok = false; break; } continue; }
      let a = (box.min[k] - lo[k]) / ld[k], b = (box.max[k] - lo[k]) / ld[k];
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) { ok = false; break; }
    }
    if (ok && (!best || near < best.distance)) best = { distance: near, part: box.part };
  }
  return best;
}

/** Source-style damage with distance falloff and armour absorption. */
export function computeDamage(weapon, distance, part, armor = 0, helmet = false) {
  let damage = weapon.damage * HITGROUPS[part] * Math.pow(weapon.range, distance / (500 * UNIT));
  let armorLoss = 0;
  const protectedPart = armor > 0 && (part === 'head' ? helmet : part !== 'leg');
  if (protectedPart) {
    let toHealth = damage * weapon.armorRatio * 0.5;
    let toArmor = (damage - toHealth) * 0.5;
    if (toArmor > armor) { toArmor = armor; toHealth = damage - toArmor * 2; }
    armorLoss = Math.round(toArmor); damage = toHealth;
  }
  return { health: Math.max(1, Math.round(damage)), armor: armorLoss };
}

export const secondsToTicks = s => Math.max(1, Math.ceil(s * TICK_RATE - 1e-6));
