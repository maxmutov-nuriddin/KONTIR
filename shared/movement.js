// Source / GoldSrc-derived player movement on an arbitrary triangle world (MeshCollider).
// Deterministic and allocation-light so the client can re-simulate pending commands on every snapshot.
import { MOVEMENT as M, DT, clamp, lerp, smoothstep } from './constants.js';

export function createPlayer(spawn) {
  return {
    x: spawn.x, y: spawn.y, z: spawn.z, vx: 0, vy: 0, vz: 0,
    yaw: spawn.yaw || 0, pitch: 0, grounded: true, crouch: 0, prevJump: false,
    gnx: 0, gny: 1, gnz: 0, stride: 0, fatigue: 0,
  };
}
export const playerHeight = p => lerp(M.standHeight, M.crouchHeight, p.crouch);
/** Camera height above the feet. `crouch` (0..1) is eased so the eye glides between 1.65 m and 1.05 m. */
export const eyeHeight = p => lerp(M.eyeStand, M.eyeCrouch, smoothstep(clamp(p.crouch, 0, 1)));
export const horizontalSpeed = p => Math.hypot(p.vx, p.vz);

export function targetSpeed(cmd, crouch) {
  const base = cmd.walk ? M.walkSpeed : M.runSpeed;
  return lerp(base, Math.min(base, M.crouchSpeed), crouch);
}

/** Source `PM_Friction`: speed-proportional drag with a stop-speed floor. */
export function applyFriction(p, dt) {
  const speed = Math.hypot(p.vx, p.vz);
  if (speed < 1e-4) { p.vx = 0; p.vz = 0; return; }
  const drop = Math.max(speed, M.stopSpeed) * M.friction * dt;
  const scale = Math.max(0, speed - drop) / speed;
  p.vx *= scale; p.vz *= scale;
}
/** Source `PM_Accelerate` (ground). */
export function accelerate(p, dx, dz, wishSpeed, accel, dt) {
  const add = wishSpeed - (p.vx * dx + p.vz * dz);
  if (add <= 0) return;
  const gain = Math.min(add, accel * wishSpeed * dt);
  p.vx += dx * gain; p.vz += dz * gain;
}
/** Source `PM_AirAccelerate`: projection is measured against a 30 u/s cap, gain uses the full wish speed. */
export function airAccelerate(p, dx, dz, wishSpeed, accel, dt) {
  const capped = Math.min(wishSpeed, M.maxAirSpeed);
  const add = capped - (p.vx * dx + p.vz * dz);
  if (add <= 0) return;
  const gain = Math.min(add, accel * wishSpeed * dt);
  p.vx += dx * gain; p.vz += dz * gain;
}

function contactPush(p, collider, dx, dy, dz, radius, height, contacts) {
  p.x += dx; p.y += dy; p.z += dz;
  return collider.resolveCapsule(p, radius, height, contacts, dx, dy, dz);
}
function clipVelocity(p, n) {
  const into = p.vx * n.x + p.vy * n.y + p.vz * n.z;
  if (into < 0) { p.vx -= n.x * into; p.vy -= n.y * into; p.vz -= n.z * into; }
}
function bestGround(contacts) {
  let best = null;
  for (const c of contacts) if (c.y >= M.walkableNormalY && (!best || c.y > best.y)) best = c;
  return best;
}
function setGround(p, n) { p.gnx = n.x; p.gny = n.y; p.gnz = n.z; }

/** Lowers the capsule in small increments until it rests on walkable ground (stairs / ramps / curbs). */
function snapDown(p, collider, radius, height, maxDrop) {
  const startY = p.y, contacts = [];
  for (let dropped = 0; dropped < maxDrop;) {
    const d = Math.min(0.08, maxDrop - dropped);
    p.y -= d; dropped += d; contacts.length = 0;
    const bx = p.x, by = p.y, bz = p.z;
    if (collider.resolveCapsule(p, radius, height, contacts, 0, -1, 0)) {
      const ground = bestGround(contacts);
      if (ground) {
        // the push-out runs along the slope normal; keep the feet where they are and lift vertically instead,
        // otherwise every idle tick on a ramp / staircase slides the player a little further down it
        const push = Math.hypot(p.x - bx, p.y - by, p.z - bz);
        p.x = bx; p.z = bz; p.y = by + Math.min(push / Math.max(0.2, ground.y), d + 0.005);   // never lift above where this probe started
        setGround(p, ground); return true;
      }
    }
  }
  p.y = startY;
  return false;
}

/**
 * Curb / stair climbing. A capsule's round base cannot roll over a riser edge, so (like Source's hull step
 * logic) we find the tread height ahead with BVH rays, lift the capsule onto it and advance until its
 * centre is over the tread. The positional pop is reported in `events.step` so the camera can smooth it.
 */
function tryStepUp(p, collider, radius, height, from, dx, dz) {
  const intended = Math.hypot(dx, dz);
  if (intended < 1e-6) return null;
  const blocked = { x: p.x, y: p.y, z: p.z };
  const dirX = dx / intended, dirZ = dz / intended;
  let top = -Infinity;
  for (const lateral of [0, 0.2, -0.2]) {
    const ox = from.x + dirX * (radius + 0.04) - dirZ * lateral, oz = from.z + dirZ * (radius + 0.04) + dirX * lateral;
    const hit = collider.raycast(ox, from.y + M.stepHeight + 0.02, oz, 0, -1, 0, M.stepHeight + 0.02);
    if (hit && hit.ny >= M.walkableNormalY) top = Math.max(top, hit.y);
  }
  const rise = top - from.y;
  if (!(rise > 0.02 && rise <= M.stepHeight + 0.005)) return null;
  const face = collider.raycast(from.x, from.y + rise * 0.5, from.z, dirX, 0, dirZ, radius + 0.15);
  const advance = Math.max(intended, (face ? face.distance : radius + 0.04) + 0.03);
  p.x = from.x + dirX * advance; p.y = top + 0.002; p.z = from.z + dirZ * advance;
  const contacts = [];
  collider.resolveCapsule(p, radius, height, contacts, 0, 1, 0);
  if (contacts.some(c => c.depth > 0.05 || c.y < -0.3) || !snapDown(p, collider, radius, height, 0.06)) {
    p.x = blocked.x; p.y = blocked.y; p.z = blocked.z;
    return null;
  }
  return { x: p.x - blocked.x, y: p.y - blocked.y, z: p.z - blocked.z };
}

/** Direction factor of the wish vector in view space: forward 1, side-step `strafeSpeed`, back-pedal `backSpeed`. */
export function directionMul(forward, right) {
  const f2 = forward * forward, r2 = right * right, sum = f2 + r2;
  if (sum < 1e-9) return 1;
  const side = r2 / sum;
  return forward >= 0 ? 1 + (M.strafeSpeed - 1) * side : M.backSpeed + (M.strafeSpeed - M.backSpeed) * side;
}

/**
 * Advances one command. Returns { footstep, landed, jumped } where `landed` is the downward impact speed (m/s).
 * `p.speedMul` is the carried-load factor (weapons.js loadSpeedMul): it scales top speed, acceleration and jump.
 * @param {object} p player state from createPlayer
 * @param {object} cmd input command (forward,right,jump,crouch,walk,yaw,pitch)
 * @param {import('./collision.js').MeshCollider} collider
 */
export function stepPlayer(p, cmd, collider, dt = DT) {
  const events = { footstep: false, landed: 0, jumped: false, step: null };
  p.yaw = cmd.yaw; p.pitch = clamp(cmd.pitch, -1.55, 1.55);

  // --- crouch factor: linear ramp, standing up requires head clearance ---
  const rate = dt / M.crouchSeconds;
  let crouch = p.crouch + clamp((cmd.crouch ? 1 : 0) - p.crouch, -rate, rate);
  if (crouch < p.crouch && collider.capsuleBlocked(p.x, p.y, p.z, M.radius, lerp(M.standHeight, M.crouchHeight, crouch))) crouch = p.crouch;
  p.crouch = crouch;
  const radius = M.radius, height = playerHeight(p);

  // --- jump (fresh press only, no auto-bhop): weaker with a heavy load and when repeated (fatigue) ---
  const startGrounded = p.grounded, load = clamp(p.speedMul ?? 1, 0.4, 1);
  if (startGrounded) p.fatigue = Math.max(0, (p.fatigue || 0) - M.fatigueRecovery * dt);
  let jumped = false;
  if (cmd.jump && !p.prevJump && startGrounded) {
    const heavy = clamp((1 - load) / 0.4, 0, 1);
    p.vy = M.jumpSpeed * (1 - M.jumpLoad * heavy) * (1 - 0.3 * (p.fatigue || 0)); jumped = true; events.jumped = true;
    p.fatigue = Math.min(1, (p.fatigue || 0) + M.jumpFatigue);
    const cap = M.runSpeed * load * M.bunnyCap, hs = Math.hypot(p.vx, p.vz);
    if (hs > cap) { p.vx *= cap / hs; p.vz *= cap / hs; }
  }
  p.prevJump = cmd.jump;
  const onGround = startGrounded && !jumped;

  // --- wish velocity ---
  const len = Math.hypot(cmd.forward, cmd.right), norm = Math.max(1, len);
  const f = cmd.forward / norm, r = cmd.right / norm;
  const wx = -Math.sin(cmd.yaw) * f + Math.cos(cmd.yaw) * r, wz = -Math.cos(cmd.yaw) * f - Math.sin(cmd.yaw) * r;
  const wishLen = Math.hypot(wx, wz);
  // heavier load = slower; back-pedalling and side-stepping are slower than running forward
  const wishSpeed = wishLen * targetSpeed(cmd, p.crouch) * load * directionMul(f, r);

  if (onGround) {
    applyFriction(p, dt);
    if (wishLen > 1e-4) accelerate(p, wx / wishLen, wz / wishLen, wishSpeed, M.accelerate * (0.6 + 0.4 * load), dt);
  } else if (wishLen > 1e-4) airAccelerate(p, wx / wishLen, wz / wishLen, wishSpeed, M.airAccelerate, dt);

  if (!onGround) p.vy -= M.gravity * 0.5 * dt;
  else p.vy = 0;
  const total = Math.hypot(p.vx, p.vy, p.vz);
  if (total > M.maxVelocity) { const k = M.maxVelocity / total; p.vx *= k; p.vy *= k; p.vz *= k; }

  // --- integrate with sub-steps so nothing tunnels ---
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(p.vx), Math.abs(p.vy), Math.abs(p.vz)) * dt / 0.1));
  const sub = dt / steps, contacts = [];
  let groundHit = null, fall = 0;
  for (let s = 0; s < steps; s++) {
    let dx = p.vx * sub, dz = p.vz * sub;
    const from = { x: p.x, y: p.y, z: p.z };
    let dy = 0;
    if (onGround) dy = -(p.gnx * dx + p.gnz * dz) / Math.max(0.2, p.gny);
    if (dx !== 0 || dz !== 0 || dy !== 0) {
      contacts.length = 0;
      contactPush(p, collider, dx, dy, dz, radius, height, contacts);
      const intended = Math.hypot(dx, dz), moved = Math.hypot(p.x - from.x, p.z - from.z);
      let stepped = null;
      if (onGround && intended > 1e-5 && moved < intended * 0.85) stepped = tryStepUp(p, collider, radius, height, from, dx, dz);
      if (stepped) {
        events.step = events.step ? { x: events.step.x + stepped.x, y: events.step.y + stepped.y, z: events.step.z + stepped.z } : stepped;
        groundHit = { x: p.gnx, y: p.gny, z: p.gnz };
      } else {
        for (const c of contacts) {
          clipVelocity(p, c);
          if (c.y >= M.walkableNormalY && !onGround) groundHit = c;
        }
        if (onGround) { const g = bestGround(contacts); if (g) groundHit = g; }
      }
    }
    if (!onGround) {
      fall = Math.min(fall, p.vy);
      contacts.length = 0;
      contactPush(p, collider, 0, p.vy * sub, 0, radius, height, contacts);
      for (const c of contacts) {
        if (c.y >= M.walkableNormalY && p.vy <= 0) groundHit = c;
        clipVelocity(p, c);
      }
    }
  }

  let grounded = !!groundHit;
  if (grounded) setGround(p, groundHit);
  else if (onGround && snapDown(p, collider, radius, height, M.stepHeight)) grounded = true;
  if (grounded) {
    if (!startGrounded || jumped) {
      events.landed = Math.max(0, -fall);
      // the legs absorb the impact: a landing costs horizontal momentum (no chained jump-running)
      if (events.landed > 1.5) { const k = Math.max(1 - M.landSlowMax, 1 - M.landSlow * events.landed); p.vx *= k; p.vz *= k; }
    }
    p.vy = 0;
  } else {
    if (!onGround) p.vy -= M.gravity * 0.5 * dt;
    p.gnx = 0; p.gny = 1; p.gnz = 0;
  }
  p.grounded = grounded;

  // --- acoustic footsteps: walking (Shift) and crouching are silent by definition ---
  const hs = Math.hypot(p.vx, p.vz);
  if (grounded && !cmd.walk && p.crouch < 0.4 && hs >= M.footstepSpeed) {
    p.stride += hs * dt;
    if (p.stride >= M.footstepStride) { p.stride -= M.footstepStride; events.footstep = true; }
  } else p.stride = grounded ? Math.min(p.stride, M.footstepStride * 0.5) : 0;
  return events;
}
