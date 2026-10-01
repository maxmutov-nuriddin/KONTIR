// Shared numeric contract between server and client. All lengths are metres, all times seconds.
// Source-engine values are authored in "units" (1 unit = 1 inch) and converted once here.

export const TICK_RATE = 64;
export const DT = 1 / TICK_RATE;
export const UNIT = 0.0254;

export const TEAMS = Object.freeze({ T: 'TERRORIST', CT: 'COUNTER_TERRORIST' });
export const TEAM_IDS = Object.freeze(['TERRORIST', 'COUNTER_TERRORIST']);
export const otherTeam = team => (team === 'TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST');

export const RULES = Object.freeze({
  perTeam: 5,
  maxPlayers: 10,
  warmupSeconds: 20,
  freezeSeconds: 15,
  roundSeconds: 115,          // 1:55
  postRoundSeconds: 7,
  halftimeSeconds: 12,
  bombSeconds: 40,
  plantSeconds: 3.2,
  defuseSeconds: 10,
  defuseKitSeconds: 5,
  halfRounds: 12,             // MR12: 12 rounds per half
  roundsToWin: 13,
  startMoney: 800,
  maxMoney: 16000,
  winBonus: 3250,
  lossBonuses: Object.freeze([1400, 1900, 2400, 2900, 3400]),
  plantBonus: 300,
  snapshotEvery: 2,           // 32 Hz snapshots from the 64 Hz simulation
  rewindMaxSeconds: 1.0,      // lag-compensation ring buffer depth
  interpolationSeconds: 0.1,
  fallDamageMinSpeed: 8.5,   // m/s landing impact (~3.7 m drop); every m/s above costs 18 HP
});

// Realistic infantry movement (SI units). Top speeds are for an unloaded runner; the carried load (weapons.js
// loadSpeedMul) scales speed, acceleration and jump. Gravity is Earth's; the jump is a kit-laden standing jump.
export const MOVEMENT = Object.freeze({
  runSpeed: 250 * UNIT,       // 6.35 m/s sprint with only a knife; an AK in the hands -> ~5.4 m/s
  walkSpeed: 130 * UNIT,      // 3.3 m/s brisk silent walk (Shift)
  crouchSpeed: 85 * UNIT,     // 2.2 m/s crouch-walk
  backSpeed: 0.72,            // back-pedalling is slower than running forward
  strafeSpeed: 0.9,           // side-stepping
  accelerate: 6.0,            // ground acceleration x (0.6 + 0.4 * load factor): heavy kit is slow to get going
                              // (must stay above `friction` even at the heaviest load, or top speed is never reached)
  airAccelerate: 1.2,         // a body in flight can barely steer (no air-strafe speed gain)
  maxAirSpeed: 20 * UNIT,
  friction: 4.4,
  stopSpeed: 80 * UNIT,
  gravity: 9.81,              // m/s^2
  jumpSpeed: 3.32,            // 0.56 m apex standing jump; heavier load jumps a little lower
  jumpLoad: 0.12,             // jump speed lost at the heaviest load (factor 0.6 -> -12 %)
  jumpFatigue: 0.38,          // each jump adds fatigue (0..1); a jump at full fatigue is 30 % weaker
  fatigueRecovery: 0.55,      // fatigue recovered per second on the ground
  landSlow: 0.07,             // horizontal speed lost per m/s of landing impact (knees absorb the fall)
  landSlowMax: 0.5,
  bunnyCap: 1.0,              // jumping never adds speed
  maxVelocity: 60,
  footstepSpeed: 135 * UNIT,  // below this speed a step is inaudible (Source rule)
  footstepStride: 2.1,
  radius: 0.35,
  standHeight: 1.8,
  crouchHeight: 1.2,
  eyeStand: 1.65,
  eyeCrouch: 1.05,
  crouchSeconds: 0.2,         // full stand -> crouch transition; rate of `crouch` (0..1)
  stepHeight: 18 * UNIT,
  walkableNormalY: 0.7,
});

export const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
export const lerp = (a, b, t) => a + (b - a) * t;
export const angleDelta = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
export const smoothstep = t => t * t * (3 - 2 * t);

export const neutralInput = () => ({
  forward: 0, right: 0, jump: false, crouch: false, walk: false,
  fire: false, fire2: false, reload: false, interact: false,
  yaw: 0, pitch: 0, slot: 0, quick: false, drop: false, viewTick: 0,
});

const BOOLS = ['jump', 'crouch', 'walk', 'fire', 'fire2', 'reload', 'interact', 'quick'];

/** Strict structural validation of untrusted client input. */
export function validCommand(c) {
  if (!c || typeof c !== 'object' || !Number.isSafeInteger(c.seq) || c.seq < 0) return false;
  if (!['forward', 'right', 'yaw', 'pitch'].every(k => Number.isFinite(c[k]))) return false;
  if (Math.abs(c.forward) > 1.0001 || Math.abs(c.right) > 1.0001 || Math.abs(c.yaw) > Math.PI * 64 || Math.abs(c.pitch) > Math.PI / 2 + 0.01) return false;
  if (!Number.isInteger(c.slot) || c.slot < 0 || c.slot > 5) return false;
  if (!Number.isSafeInteger(c.viewTick) || c.viewTick < 0) return false;
  if (['epoch', 'life'].some(k => c[k] !== undefined && (!Number.isSafeInteger(c[k]) || c[k] < 0))) return false;
  if (c.drop !== undefined && typeof c.drop !== 'boolean') return false;   // optional: older clients omit it
  return BOOLS.every(k => typeof c[k] === 'boolean');
}
