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

const scaled = (pattern, k) => pattern.map(([y, p]) => [y * k, p * k]);
const SHOTGUN_PATTERN = [[0, 0], [0.05, 1.6], [-0.05, 1.8]];
const SCOUT_PATTERN = [[0, 0], [0.02, 1.5]];

const gun = (o) => Object.freeze({ kind: 'gun', melee: false, ...o, recoilTable: cumulative(o.recoil) });

export const WEAPONS = Object.freeze({
  ak47: gun({ id: 'ak47', penetration: 0.32, name: 'AK-47', slot: 1, team: 'TERRORIST', price: 2700, kill: 300, damage: 36, armorRatio: 1.55, range: 0.98, interval: 0.1, auto: true,
    mag: 30, reserve: 90, reload: 2.43, drawTime: 900, recoil: AK47_PATTERN, recoilDelay: 0.22, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0016, crouch: 0.0009, move: 0.011, air: 0.05, burst: 0.0004, burstMax: 0.004 }, model: 'ak47' }),
  m4a4: gun({ id: 'm4a4', penetration: 0.3, name: 'M4A4', slot: 1, team: 'COUNTER_TERRORIST', price: 3100, kill: 300, damage: 33, armorRatio: 1.4, range: 0.97, interval: 0.09, auto: true,
    mag: 30, reserve: 90, reload: 3.07, drawTime: 900, recoil: M4A4_PATTERN, recoilDelay: 0.2, recoilRate: 7.5, viewKick: 1,
    spread: { stand: 0.0014, crouch: 0.0008, move: 0.01, air: 0.045, burst: 0.0003, burstMax: 0.0035 }, model: 'm4a4' }),
  deagle: gun({ id: 'deagle', penetration: 0.26, name: 'DESERT EAGLE', slot: 2, team: null, price: 700, kill: 300, damage: 63, armorRatio: 1.864, range: 0.81, interval: 0.225, auto: false,
    mag: 7, reserve: 35, reload: 2.2, drawTime: 700, recoil: DEAGLE_PATTERN, recoilDelay: 0.3, recoilRate: 4.5, viewKick: 1,
    spread: { stand: 0.0022, crouch: 0.0014, move: 0.02, air: 0.07, burst: 0.004, burstMax: 0.02 }, model: 'deagle' }),
  glock: gun({ id: 'glock', penetration: 0.1, name: 'GLOCK-18', slot: 2, team: 'TERRORIST', price: 200, kill: 300, damage: 30, armorRatio: 0.9, range: 0.85, interval: 0.15, auto: false,
    mag: 20, reserve: 120, reload: 2.27, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.18, recoilRate: 8, viewKick: 1,
    spread: { stand: 0.0018, crouch: 0.001, move: 0.013, air: 0.05, burst: 0.0015, burstMax: 0.008 }, model: 'glock' }),
  usp: gun({ id: 'usp', penetration: 0.12, name: 'USP-S', slot: 2, team: 'COUNTER_TERRORIST', price: 200, kill: 300, damage: 35, armorRatio: 1.0, range: 0.81, interval: 0.17, auto: false,
    mag: 12, reserve: 24, reload: 2.2, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.2, recoilRate: 6, viewKick: 1, suppressed: true, detachable: true, silencerTime: 1.3,
    spread: { stand: 0.0014, crouch: 0.0008, move: 0.01, air: 0.04, burst: 0.001, burstMax: 0.006 }, model: 'usp' }),
  awp: gun({ id: 'awp', penetration: 0.6, name: 'AWP', slot: 1, team: null, price: 4750, kill: 100, damage: 115, armorRatio: 1.95, range: 0.99, interval: 1.46, auto: false,
    mag: 10, reserve: 30, reload: 3.67, drawTime: 1200, recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1, viewKick: 2, scope: [40, 15], unscoped: 0.08, unzoomOnShot: true,
    spread: { stand: 0.0002, crouch: 0.0001, move: 0.2, air: 0.5, burst: 0.0001, burstMax: 0.0001 }, model: 'awp' }),
  famas: gun({ id: 'famas', penetration: 0.28, name: 'FAMAS', slot: 1, team: 'COUNTER_TERRORIST', price: 2050, kill: 300, damage: 30, armorRatio: 1.4, range: 0.96, interval: 0.09, auto: true,
    mag: 25, reserve: 90, reload: 3.3, drawTime: 900, recoil: M4A4_PATTERN, recoilDelay: 0.2, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0015, crouch: 0.0009, move: 0.011, air: 0.045, burst: 0.0004, burstMax: 0.004 }, model: 'famas' }),
  galil: gun({ id: 'galil', penetration: 0.28, name: 'GALIL AR', slot: 1, team: 'TERRORIST', price: 2000, kill: 300, damage: 30, armorRatio: 1.55, range: 0.98, interval: 0.09, auto: true,
    mag: 35, reserve: 90, reload: 3.0, drawTime: 900, recoil: AK47_PATTERN, recoilDelay: 0.22, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0018, crouch: 0.0011, move: 0.013, air: 0.05, burst: 0.0005, burstMax: 0.005 }, model: 'galil' }),
  mp9: gun({ id: 'mp9', penetration: 0.12, name: 'MP9', slot: 1, team: 'COUNTER_TERRORIST', price: 1250, kill: 600, damage: 26, armorRatio: 1.2, range: 0.87, interval: 0.07, auto: true,
    mag: 30, reserve: 120, reload: 2.1, drawTime: 700, recoil: scaled(M4A4_PATTERN, 0.8), recoilDelay: 0.16, recoilRate: 8.5, viewKick: 0.9,
    spread: { stand: 0.0018, crouch: 0.001, move: 0.008, air: 0.04, burst: 0.0004, burstMax: 0.004 }, model: 'mp9' }),
  mac10: gun({ id: 'mac10', penetration: 0.1, name: 'MAC-10', slot: 1, team: 'TERRORIST', price: 1050, kill: 600, damage: 29, armorRatio: 1.15, range: 0.82, interval: 0.075, auto: true,
    mag: 30, reserve: 100, reload: 2.4, drawTime: 700, recoil: scaled(AK47_PATTERN, 0.75), recoilDelay: 0.16, recoilRate: 8.5, viewKick: 1,
    spread: { stand: 0.002, crouch: 0.0012, move: 0.009, air: 0.04, burst: 0.0005, burstMax: 0.005 }, model: 'mac10' }),
  nova: gun({ id: 'nova', penetration: 0.05, name: 'NOVA', slot: 1, team: null, price: 1050, kill: 900, damage: 26, pellets: 9, pelletSpread: 0.028, armorRatio: 1.0, range: 0.7, interval: 0.88, auto: false,
    mag: 8, reserve: 32, reload: 3.4, drawTime: 900, recoil: SHOTGUN_PATTERN, recoilDelay: 0.4, recoilRate: 3, viewKick: 1.6,
    spread: { stand: 0.001, crouch: 0.0007, move: 0.012, air: 0.04, burst: 0.001, burstMax: 0.004 }, model: 'nova' }),
  ssg08: gun({ id: 'ssg08', penetration: 0.45, name: 'SSG 08', slot: 1, team: null, price: 1700, kill: 300, damage: 88, armorRatio: 1.7, range: 0.99, interval: 1.25, auto: false,
    mag: 10, reserve: 90, reload: 3.7, drawTime: 900, recoil: SCOUT_PATTERN, recoilDelay: 0.2, recoilRate: 3, viewKick: 1.5, scope: [40], unscoped: 0.06, unzoomOnShot: true,
    spread: { stand: 0.0004, crouch: 0.0002, move: 0.08, air: 0.4, burst: 0.0002, burstMax: 0.0002 }, model: 'ssg08' }),
  p250: gun({ id: 'p250', penetration: 0.14, name: 'P250', slot: 2, team: null, price: 300, kill: 300, damage: 38, armorRatio: 1.28, range: 0.83, interval: 0.15, auto: false,
    mag: 13, reserve: 26, reload: 2.2, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.2, recoilRate: 6, viewKick: 1,
    spread: { stand: 0.0016, crouch: 0.0009, move: 0.012, air: 0.045, burst: 0.0012, burstMax: 0.007 }, model: 'p250' }),
  fiveseven: gun({ id: 'fiveseven', penetration: 0.16, name: 'FIVE-SEVEN', slot: 2, team: 'COUNTER_TERRORIST', price: 500, kill: 300, damage: 32, armorRatio: 1.5, range: 0.85, interval: 0.15, auto: false,
    mag: 20, reserve: 100, reload: 2.2, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.2, recoilRate: 6, viewKick: 1,
    spread: { stand: 0.0016, crouch: 0.0009, move: 0.012, air: 0.045, burst: 0.0012, burstMax: 0.007 }, model: 'fiveseven' }),
  tec9: gun({ id: 'tec9', penetration: 0.14, name: 'TEC-9', slot: 2, team: 'TERRORIST', price: 500, kill: 300, damage: 33, armorRatio: 1.8, range: 0.79, interval: 0.1, auto: false,
    mag: 24, reserve: 120, reload: 2.4, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.18, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.0018, crouch: 0.001, move: 0.014, air: 0.05, burst: 0.0015, burstMax: 0.009 }, model: 'tec9' }),
  m4a1s: gun({ id: 'm4a1s', penetration: 0.28, name: 'M4A1-S', slot: 1, team: 'COUNTER_TERRORIST', price: 2900, kill: 300, damage: 38, armorRatio: 1.4, range: 0.94, interval: 0.1, auto: true,
    mag: 20, reserve: 80, reload: 3.1, drawTime: 1000, recoil: scaled(M4A4_PATTERN, 0.85), recoilDelay: 0.2, recoilRate: 7.5, viewKick: 0.9, suppressed: true, detachable: true, silencerTime: 1.8,
    spread: { stand: 0.0012, crouch: 0.0007, move: 0.0095, air: 0.045, burst: 0.0003, burstMax: 0.003 }, model: 'm4a1s' }),
  aug: gun({ id: 'aug', penetration: 0.3, name: 'AUG', slot: 1, team: 'COUNTER_TERRORIST', price: 3300, kill: 300, damage: 28, armorRatio: 1.8, range: 0.96, interval: 0.09, auto: true,
    mag: 30, reserve: 90, reload: 3.8, drawTime: 1000, recoil: scaled(M4A4_PATTERN, 0.9), recoilDelay: 0.2, recoilRate: 7.5, viewKick: 0.9, scope: [45],
    spread: { stand: 0.0012, crouch: 0.0007, move: 0.01, air: 0.045, burst: 0.0003, burstMax: 0.0035 }, model: 'aug' }),
  sg553: gun({ id: 'sg553', penetration: 0.32, name: 'SG 553', slot: 1, team: 'TERRORIST', price: 3000, kill: 300, damage: 30, armorRatio: 2.0, range: 0.98, interval: 0.09, auto: true,
    mag: 30, reserve: 90, reload: 2.8, drawTime: 1000, recoil: scaled(AK47_PATTERN, 0.9), recoilDelay: 0.22, recoilRate: 7, viewKick: 1, scope: [45],
    spread: { stand: 0.0013, crouch: 0.0008, move: 0.011, air: 0.05, burst: 0.0004, burstMax: 0.004 }, model: 'sg553' }),
  ump45: gun({ id: 'ump45', penetration: 0.14, name: 'UMP-45', slot: 1, team: null, price: 1200, kill: 600, damage: 35, armorRatio: 1.3, range: 0.85, interval: 0.09, auto: true,
    mag: 25, reserve: 100, reload: 3.1, drawTime: 900, recoil: scaled(AK47_PATTERN, 0.7), recoilDelay: 0.18, recoilRate: 8, viewKick: 1,
    spread: { stand: 0.002, crouch: 0.0012, move: 0.009, air: 0.04, burst: 0.0005, burstMax: 0.005 }, model: 'ump45' }),
  p90: gun({ id: 'p90', penetration: 0.15, name: 'P90', slot: 1, team: null, price: 2350, kill: 300, damage: 26, armorRatio: 1.38, range: 0.86, interval: 0.07, auto: true,
    mag: 50, reserve: 100, reload: 3.3, drawTime: 1000, recoil: scaled(M4A4_PATTERN, 0.7), recoilDelay: 0.16, recoilRate: 9, viewKick: 0.8,
    spread: { stand: 0.0022, crouch: 0.0014, move: 0.008, air: 0.04, burst: 0.0004, burstMax: 0.005 }, model: 'p90' }),
  mp7: gun({ id: 'mp7', penetration: 0.14, name: 'MP7', slot: 1, team: null, price: 1500, kill: 600, damage: 29, armorRatio: 1.25, range: 0.85, interval: 0.08, auto: true,
    mag: 30, reserve: 120, reload: 3.1, drawTime: 900, recoil: scaled(M4A4_PATTERN, 0.75), recoilDelay: 0.16, recoilRate: 8.5, viewKick: 0.85,
    spread: { stand: 0.0017, crouch: 0.001, move: 0.008, air: 0.04, burst: 0.0004, burstMax: 0.0045 }, model: 'mp7' }),
  xm1014: gun({ id: 'xm1014', penetration: 0.05, name: 'XM1014', slot: 1, team: null, price: 2000, kill: 900, damage: 20, pellets: 6, pelletSpread: 0.032, armorRatio: 1.6, range: 0.7, interval: 0.35, auto: true,
    mag: 7, reserve: 32, reload: 3.6, drawTime: 900, recoil: SHOTGUN_PATTERN, recoilDelay: 0.3, recoilRate: 4, viewKick: 1.4,
    spread: { stand: 0.001, crouch: 0.0007, move: 0.012, air: 0.04, burst: 0.001, burstMax: 0.004 }, model: 'xm1014' }),
  mag7: gun({ id: 'mag7', penetration: 0.05, name: 'MAG-7', slot: 1, team: 'COUNTER_TERRORIST', price: 1300, kill: 900, damage: 30, pellets: 8, pelletSpread: 0.03, armorRatio: 1.5, range: 0.45, interval: 0.85, auto: false,
    mag: 5, reserve: 32, reload: 2.5, drawTime: 900, recoil: SHOTGUN_PATTERN, recoilDelay: 0.4, recoilRate: 3, viewKick: 1.6,
    spread: { stand: 0.001, crouch: 0.0007, move: 0.012, air: 0.04, burst: 0.001, burstMax: 0.004 }, model: 'mag7' }),
  sawedoff: gun({ id: 'sawedoff', penetration: 0.04, name: 'SAWED-OFF', slot: 1, team: 'TERRORIST', price: 1100, kill: 900, damage: 32, pellets: 8, pelletSpread: 0.045, armorRatio: 1.5, range: 0.45, interval: 0.85, auto: false,
    mag: 7, reserve: 32, reload: 3.4, drawTime: 900, recoil: SHOTGUN_PATTERN, recoilDelay: 0.4, recoilRate: 3, viewKick: 1.6,
    spread: { stand: 0.0015, crouch: 0.001, move: 0.014, air: 0.04, burst: 0.001, burstMax: 0.004 }, model: 'sawedoff' }),
  negev: gun({ id: 'negev', penetration: 0.4, name: 'NEGEV', slot: 1, team: null, price: 1700, kill: 300, damage: 35, armorRatio: 1.42, range: 0.97, interval: 0.075, auto: true,
    mag: 150, reserve: 200, reload: 5.7, drawTime: 1300, recoil: scaled(AK47_PATTERN, 0.8), recoilDelay: 0.3, recoilRate: 5, viewKick: 1.1,
    spread: { stand: 0.004, crouch: 0.003, move: 0.02, air: 0.06, burst: 0.00015, burstMax: 0.006 }, model: 'negev' }),
  cz75: gun({ id: 'cz75', penetration: 0.12, name: 'CZ75-AUTO', slot: 2, team: null, price: 500, kill: 100, damage: 31, armorRatio: 1.55, range: 0.85, interval: 0.1, auto: true,
    mag: 12, reserve: 12, reload: 2.7, drawTime: 500, recoil: GLOCK_PATTERN, recoilDelay: 0.18, recoilRate: 7, viewKick: 1,
    spread: { stand: 0.002, crouch: 0.0012, move: 0.014, air: 0.05, burst: 0.0018, burstMax: 0.01 }, model: 'cz75' }),
  r8: gun({ id: 'r8', penetration: 0.26, name: 'R8 REVOLVER', slot: 2, team: null, price: 600, kill: 300, damage: 86, armorRatio: 1.864, range: 0.91, interval: 0.5, auto: false,
    mag: 8, reserve: 8, reload: 2.3, drawTime: 800, recoil: DEAGLE_PATTERN, recoilDelay: 0.35, recoilRate: 4, viewKick: 1.3,
    spread: { stand: 0.0018, crouch: 0.0011, move: 0.02, air: 0.07, burst: 0.004, burstMax: 0.02 }, model: 'r8' }),
  knife: Object.freeze({ id: 'knife', kind: 'melee', melee: true, name: 'KNIFE', slot: 3, team: null, price: 0, kill: 1500, damage: 40, stabDamage: 65, backstab: 180,
    range: 1.7, interval: 0.5, stabInterval: 1.1, drawTime: 400, model: 'knife', recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1, mag: 0, reserve: 0 }),
  he: Object.freeze({ id: 'he', kind: 'grenade', melee: false, name: 'HE GRENADE', slot: 4, team: null, price: 300, kill: 300, damage: 98, radius: 8.5, fuse: 1.6, max: 1, drawTime: 600, model: 'he', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  flash: Object.freeze({ id: 'flash', kind: 'grenade', melee: false, name: 'FLASHBANG', slot: 4, team: null, price: 200, kill: 0, damage: 0, radius: 24, fuse: 1.5, max: 2, drawTime: 600, model: 'flash', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  smoke: Object.freeze({ id: 'smoke', kind: 'grenade', melee: false, name: 'SMOKE GRENADE', slot: 4, team: null, price: 300, kill: 0, damage: 0, radius: 4.6, fuse: 2.2, max: 1, duration: 18, drawTime: 600, model: 'smoke', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  molotov: Object.freeze({ id: 'molotov', kind: 'grenade', melee: false, name: 'MOLOTOV', slot: 4, team: 'TERRORIST', price: 400, kill: 300, damage: 8, radius: 2.6, fuse: 2.2, max: 1, fire: 7, drawTime: 600, model: 'molotov', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  incendiary: Object.freeze({ id: 'incendiary', kind: 'grenade', melee: false, name: 'INCENDIARY', slot: 4, team: 'COUNTER_TERRORIST', price: 500, kill: 300, damage: 8, radius: 2.6, fuse: 2.2, max: 1, fire: 7, drawTime: 600, model: 'incendiary', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  decoy: Object.freeze({ id: 'decoy', kind: 'grenade', melee: false, name: 'DECOY', slot: 4, team: null, price: 50, kill: 0, damage: 0, radius: 0, fuse: 2.0, max: 1, decoy: 12, drawTime: 600, model: 'decoy', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
  c4: Object.freeze({ id: 'c4', kind: 'objective', melee: false, name: 'C4 EXPLOSIVE', slot: 5, team: 'TERRORIST', price: 0, kill: 0, damage: 0, drawTime: 800, model: 'c4', mag: 0, reserve: 0, recoilTable: [{ yaw: 0, pitch: 0 }], recoil: [[0, 0]], recoilDelay: 0, recoilRate: 1 }),
});
export const GRENADES = Object.freeze(['he', 'flash', 'smoke', 'molotov', 'incendiary', 'decoy']);
export const MAX_GRENADES = 4;

/**
 * Loaded weight (kg, magazine in) of every carried item — real-world figures. Movement speed, acceleration and jump
 * height scale with the load: the weapon in the hands counts fully, stowed weapons / grenades / the C4 partly.
 */
export const MASS = Object.freeze({
  knife: 0.25, ak47: 4.3, m4a4: 3.4, m4a1s: 3.6, galil: 4.0, famas: 3.8, sg553: 4.2, aug: 3.9, awp: 6.9, ssg08: 3.8,
  mp9: 1.4, mac10: 2.8, ump45: 2.5, mp7: 1.9, p90: 2.9, nova: 3.6, xm1014: 3.9, mag7: 3.4, sawedoff: 2.9, negev: 7.6,
  glock: 0.9, usp: 1.0, p250: 0.9, fiveseven: 0.8, tec9: 1.4, cz75: 1.1, deagle: 2.0, r8: 1.6,
  he: 0.4, flash: 0.45, smoke: 0.5, molotov: 0.7, incendiary: 0.6, decoy: 0.4, c4: 2.5,
});
export const weaponMass = id => (id && MASS[id]) || 0;
const HELD_K = 0.034, STOWED_K = 0.008, SCOPED_K = 0.62;
/** Speed factor of the held weapon alone (UI / bots): knife 0.99, pistols ~0.97, rifles ~0.85, AWP 0.77, Negev 0.74. */
export function speedMul(id) {
  const w = id && WEAPONS[id]; if (!w) return 1;
  return Math.max(0.6, 1 - HELD_K * weaponMass(id));
}
/**
 * Movement factor from the whole load of an Inventory (or anything with weaponId(slot), current, zoom, grenades):
 * held weapon * 0.034 / kg + stowed kit * 0.008 / kg, and aiming down a scope slows to a careful walk.
 * Server and client compute it from the same predicted inventory, so it is deterministic.
 */
export function loadSpeedMul(inv) {
  if (!inv) return 1;
  const held = inv.weaponId?.(inv.current) || null;
  let stowed = 0;
  for (const slot of [1, 2, 3, 5]) { const id = inv.weaponId?.(slot); if (id && id !== held) stowed += weaponMass(id); }
  for (const [g, n] of Object.entries(inv.grenades || {})) if (n > 0 && g !== held) stowed += weaponMass(g) * n;
  let k = 1 - HELD_K * weaponMass(held) - STOWED_K * stowed;
  if (held && inv.zoom > 0 && WEAPONS[held]?.scope) k *= SCOPED_K;
  return Math.max(0.4, Math.min(1, k));
}
export const BUY_ITEMS = Object.freeze({
  glock: { price: 200, team: 'TERRORIST', group: 'PISTOLS' }, usp: { price: 200, team: 'COUNTER_TERRORIST', group: 'PISTOLS' },
  p250: { price: 300, group: 'PISTOLS' }, tec9: { price: 500, team: 'TERRORIST', group: 'PISTOLS' }, fiveseven: { price: 500, team: 'COUNTER_TERRORIST', group: 'PISTOLS' },
  cz75: { price: 500, group: 'PISTOLS' }, deagle: { price: 700, group: 'PISTOLS' }, r8: { price: 600, group: 'PISTOLS' },
  mac10: { price: 1050, team: 'TERRORIST', group: 'SMGS' }, mp9: { price: 1250, team: 'COUNTER_TERRORIST', group: 'SMGS' },
  ump45: { price: 1200, group: 'SMGS' }, mp7: { price: 1500, group: 'SMGS' }, p90: { price: 2350, group: 'SMGS' },
  nova: { price: 1050, group: 'HEAVY' }, sawedoff: { price: 1100, team: 'TERRORIST', group: 'HEAVY' }, mag7: { price: 1300, team: 'COUNTER_TERRORIST', group: 'HEAVY' },
  xm1014: { price: 2000, group: 'HEAVY' }, negev: { price: 1700, group: 'HEAVY' },
  galil: { price: 2000, team: 'TERRORIST', group: 'RIFLES' }, famas: { price: 2050, team: 'COUNTER_TERRORIST', group: 'RIFLES' },
  ak47: { price: 2700, team: 'TERRORIST', group: 'RIFLES' }, m4a4: { price: 3100, team: 'COUNTER_TERRORIST', group: 'RIFLES' }, m4a1s: { price: 2900, team: 'COUNTER_TERRORIST', group: 'RIFLES' },
  sg553: { price: 3000, team: 'TERRORIST', group: 'RIFLES' }, aug: { price: 3300, team: 'COUNTER_TERRORIST', group: 'RIFLES' },
  ssg08: { price: 1700, group: 'RIFLES' }, awp: { price: 4750, group: 'RIFLES' },
  decoy: { price: 50, group: 'GRENADES' }, flash: { price: 200, group: 'GRENADES' }, he: { price: 300, group: 'GRENADES' }, smoke: { price: 300, group: 'GRENADES' },
  molotov: { price: 400, team: 'TERRORIST', group: 'GRENADES' }, incendiary: { price: 500, team: 'COUNTER_TERRORIST', group: 'GRENADES' },
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
export function inaccuracy(weapon, { speed = 0, grounded = true, crouch = 0, burst = 0, zoom = 0 }) {
  const s = weapon.spread;
  if (!s) return 0;
  if (weapon.scope && !zoom && weapon.unscoped !== undefined) return weapon.unscoped;   // snipers; AUG / SG 553 stay accurate unscoped
  const zoomK = weapon.scope && zoom && weapon.unscoped === undefined ? 0.7 : 1;
  const base = s.stand + (s.crouch - s.stand) * crouch;
  const move = grounded ? s.move * Math.min(1, speed / (250 * UNIT)) : s.air;
  return (base + move + Math.min(s.burstMax, burst * s.burst)) * zoomK;
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
