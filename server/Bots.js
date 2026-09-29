// Server-side bot brain. Bots emit the same input commands as human clients, so movement, weapons,
// recoil, economy and lag compensation rules apply to them without special cases.
import { TICK_RATE, neutralInput, clamp, angleDelta } from '../shared/constants.js';
import { SLOT, WEAPONS } from '../shared/weapons.js';

const rand = (a, b) => a + Math.random() * (b - a);

/** skill = aim precision / tracking speed, reaction = ticks before the first shot, utility = uses grenades, headshot = head aim share. */
export const DIFFICULTY = Object.freeze({
  easy: { skill: [0.2, 0.4], reaction: [30, 44], utility: 0, headshot: 0.15, burst: [6, 12], hearing: 0.4 },
  medium: { skill: [0.5, 0.72], reaction: [16, 26], utility: 0.35, headshot: 0.4, burst: [3, 9], hearing: 0.7 },
  hard: { skill: [0.74, 0.88], reaction: [9, 15], utility: 0.65, headshot: 0.55, burst: [3, 6], hearing: 0.9 },
  expert: { skill: [0.9, 0.98], reaction: [5, 9], utility: 0.9, headshot: 0.7, burst: [2, 5], hearing: 1 },
});

export class BotBrain {
  constructor(room) {
    this.room = room;
    const d = DIFFICULTY[room.botDifficulty] || DIFFICULTY.medium;
    this.level = d;
    this.skill = rand(...d.skill);
    this.reaction = Math.round(rand(...d.reaction));
    this.reset();
  }
  reset() {
    this.path = []; this.pathTick = -1000; this.goal = null; this.goalKey = '';
    this.target = null; this.seenAt = -1000; this.acquired = -1000; this.burst = 0; this.pause = 0; this.strafe = 1; this.strafeUntil = 0;
    this.stuck = 0; this.lastPos = null; this.lastCheck = 0; this.site = null; this.holdSpot = null; this.holdUntil = 0; this.lookOffset = 0;
    this.crouchUntil = 0; this.toggle = false; this.util = null; this.utilDone = Math.random() > this.level.utility; this.lookAt = null; this.lookUntil = 0;
  }
  newRound() { this.reset(); this.site = this.room.map.sites[Math.random() < 0.5 ? 0 : 1]; }

  /** Freeze-time shopping: rifle > armour > kit > grenades, within budget. */
  buy(p) {
    const room = this.room, team = p.team;
    const T = team === 'TERRORIST', rifle = T ? 'ak47' : 'm4a4', smg = T ? 'mac10' : 'mp9', pistol = T ? 'tec9' : 'fiveseven';
    const list = [], roll = Math.random();
    if (p.money >= WEAPONS[rifle].price + 650) list.push(roll < 0.12 && p.money >= 4750 + 650 ? 'awp' : rifle, 'kevlar');
    else if (p.money >= WEAPONS[smg].price + 650 && roll < 0.5) list.push(smg, 'kevlar');
    else if (p.money >= 1050 + 650 && roll < 0.7) list.push('nova', 'kevlar');
    else if (p.money >= 1200 + 650) list.push('deagle', 'kevlar');
    else if (p.money >= 650) list.push('kevlar');
    if (p.money >= 500 && roll > 0.85) list.push(pistol);
    if (team === 'COUNTER_TERRORIST') list.push('defuser');
    list.push('he', 'flash', 'smoke', T ? 'molotov' : 'incendiary');
    for (const item of list) room.buy(p.id, item);
    if (p.inv.weaponId(SLOT.PRIMARY)) p.inv.select(SLOT.PRIMARY, { force: true });
  }

  senseEnemy(p, weapon) {
    const room = this.room, eye = room.eye(p);
    const reach = weapon?.kind === 'gun' ? (weapon.auto ? 48 : 32) : weapon?.kind === 'melee' ? 5 : 20;
    let best = null;
    for (const t of room.players.values()) {
      if (!t.alive || t.team === p.team) continue;
      const chest = { x: t.char.x, y: t.char.y + 1.15, z: t.char.z };
      const d = Math.hypot(chest.x - eye.x, chest.y - eye.y, chest.z - eye.z);
      if (d > reach || (best && d >= best.d)) continue;
      if (!room.hasSight(eye, chest)) continue;
      best = { t, d, chest, head: { x: t.char.x, y: t.char.y + 1.62 * (1 - 0.35 * t.char.crouch), z: t.char.z } };
    }
    return best;
  }

  command(p) {
    const room = this.room, c = p.char, inv = p.inv;
    const cmd = { ...neutralInput(), yaw: c.yaw, pitch: c.pitch, viewTick: room.tick };
    if (!p.alive || (room.phase !== 'live' && room.phase !== 'warmup')) return cmd;
    if (!this.site) this.newRound();
    const tick = room.tick, eye = room.eye(p), weapon = inv.weapon();

    // ---- perception (every 3rd tick) ----
    if (tick % 3 === (p.index % 3)) {
      const seen = this.senseEnemy(p, weapon);
      if (seen) { if (!this.target || this.target.t !== seen.t) this.acquired = tick; this.target = seen; this.seenAt = tick; }
      else if (tick - this.seenAt > TICK_RATE * 1.5) this.target = null;
    }
    if (p.flashUntil > tick) { this.target = null; return cmd; }
    // hearing: turn toward recent enemy gunfire / footsteps nobody on the team can see yet
    if (!this.target && tick % 8 === (p.index % 8) && Math.random() < this.level.hearing) {
      const n = room.noises?.find(z => z.team !== p.team && tick - z.tick < TICK_RATE && Math.hypot(z.x - p.char.x, z.z - p.char.z) < z.range);
      if (n) { this.lookAt = n; this.lookUntil = tick + TICK_RATE * 2; }
    }
    const engaged = this.target && tick - this.seenAt < 12;

    // ---- weapon housekeeping ----
    const wanted = inv.has(SLOT.PRIMARY) ? SLOT.PRIMARY : SLOT.SECONDARY;
    const planting = p.team === 'TERRORIST' && this.bombCarrier(p) && this.inSite(p);
    if (!planting && inv.current !== wanted && inv.current !== SLOT.UTILITY && tick % 20 === 0) cmd.slot = wanted;
    if (weapon?.kind === 'gun') {
      const a = inv.ammoOf(weapon.id);
      if (a.mag === 0 || (!engaged && a.mag < weapon.mag * 0.35)) { this.toggle = !this.toggle; cmd.reload = this.toggle; }
    }

    if (engaged) { this.util = null; return this.fight(p, cmd, eye, weapon); }
    if (this.util || this.wantsUtility(p)) return this.throwUtility(p, cmd);
    const out = this.navigate(p, cmd);
    if (this.lookAt && tick < this.lookUntil) {
      const want = Math.atan2(-(this.lookAt.x - p.char.x), -(this.lookAt.z - p.char.z));
      out.yaw = p.char.yaw + clamp(angleDelta(want, p.char.yaw), -0.12, 0.12);
    }
    return out;
  }

  /** Attackers flash / smoke the site on entry; defenders molly the approach once. Chance scales with difficulty. */
  wantsUtility(p) {
    if (this.utilDone || this.room.phase !== 'live') return false;
    const inv = p.inv, site = this.site, d = Math.hypot(site.x - p.char.x, site.z - p.char.z);
    const pick = p.team === 'TERRORIST' ? ['flash', 'smoke', 'he'] : ['molotov', 'incendiary', 'smoke', 'he'];
    const g = pick.find(id => (inv.grenades[id] || 0) > 0);
    if (!g || d > 26 || d < 9) return false;
    if (!this.room.hasSight(this.room.eye(p), { x: site.x, y: p.char.y + 1.5, z: site.z }, true)) return false;
    this.util = { id: g, stage: 0, until: this.room.tick + TICK_RATE * 3 };
    return true;
  }
  throwUtility(p, cmd) {
    const u = this.util, inv = p.inv, tick = this.room.tick, c = p.char, site = this.site;
    if (tick > u.until) { this.util = null; this.utilDone = true; return cmd; }
    const want = Math.atan2(-(site.x - c.x), -(site.z - c.z)), d = Math.hypot(site.x - c.x, site.z - c.z);
    cmd.yaw = c.yaw + clamp(angleDelta(want, c.yaw), -0.2, 0.2);
    cmd.pitch = clamp(c.pitch + clamp(0.18 + d * 0.012 - c.pitch, -0.1, 0.1), -1.2, 1.2);
    if (u.stage === 0) { if (inv.current !== SLOT.UTILITY || inv.weaponId() !== u.id) { inv.util = u.id; cmd.slot = SLOT.UTILITY; } else u.stage = 1; return cmd; }
    if (inv.drawing) return cmd;
    const aimed = Math.abs(angleDelta(want, c.yaw)) < 0.08;
    if (u.stage === 1 && aimed) { cmd.fire = true; u.stage = 2; u.release = tick + 10; return cmd; }
    if (u.stage === 2) { cmd.fire = tick < u.release; if (tick >= u.release) { this.util = null; this.utilDone = true; } }
    return cmd;
  }

  bombCarrier(p) { return this.room.bomb.state === 'carried' && this.room.bomb.carrier === p.id; }
  inSite(p) { return this.room.map.sites.some(s => Math.hypot(p.char.x - s.x, p.char.z - s.z) < s.radius * 0.7); }

  fight(p, cmd, eye, weapon) {
    const room = this.room, tick = room.tick, t = this.target;
    const aimPoint = (tick + p.index * 3) % 20 < this.level.headshot * 20 ? t.head : t.chest;
    const dx = aimPoint.x - eye.x, dy = aimPoint.y - eye.y, dz = aimPoint.z - eye.z, flat = Math.hypot(dx, dz);
    const error = (1 - this.skill) * 0.045;
    const wantYaw = Math.atan2(-dx, -dz) + Math.sin(tick * 0.31 + p.index) * error, wantPitch = Math.atan2(dy, flat) + Math.cos(tick * 0.23 + p.index) * error * 0.6;
    const turn = (0.09 + this.skill * 0.16);
    cmd.yaw = p.char.yaw + clamp(angleDelta(wantYaw, p.char.yaw), -turn, turn);
    cmd.pitch = clamp(p.char.pitch + clamp(wantPitch - p.char.pitch, -turn, turn), -1.4, 1.4);
    const aligned = Math.abs(angleDelta(wantYaw, cmd.yaw)) < 0.05 + t.d * 0.0006;
    // strafe / crouch like a player peeking
    if (tick > this.strafeUntil) { this.strafe = Math.random() < 0.5 ? -1 : 1; this.strafeUntil = tick + Math.round(rand(14, 40)); if (Math.random() < 0.25) this.crouchUntil = tick + 30; }
    if (t.d > 22 && weapon?.kind === 'gun') { cmd.crouch = tick < this.crouchUntil; if (!cmd.crouch) cmd.right = 0; else cmd.right = 0; }
    else cmd.right = this.strafe * 0.6;
    if (p.team === 'TERRORIST' && t.d > 14) cmd.forward = 1; // attackers close the distance
    cmd.walk = t.d > 22 && cmd.forward === 0;
    if (tick - this.acquired < this.reaction || !aligned || !weapon) return cmd;
    if (weapon.kind === 'melee') { cmd.fire = t.d < 2; cmd.forward = 1; return cmd; }
    if (weapon.kind !== 'gun') return cmd;
    if (weapon.auto) {
      if (this.pause > 0) this.pause--; else if (this.burst-- > 0) cmd.fire = true; else { this.burst = Math.round(rand(...this.level.burst)); this.pause = Math.round(rand(6, 16) * (1.4 - this.skill)); }
    } else cmd.fire = tick % Math.round(weapon.interval * TICK_RATE + 5) === 0;
    return cmd;
  }

  goalFor(p) {
    const room = this.room, bomb = room.bomb, sites = room.map.sites;
    if (p.team === 'TERRORIST') {
      if (bomb.state === 'carried' && bomb.carrier === p.id) return { x: this.site.x, z: this.site.z, key: `plant${this.site.id}`, kind: 'plant' };
      if (bomb.state === 'dropped') return { x: bomb.x, z: bomb.z, key: 'pickup', kind: 'go' };
      if (bomb.state === 'planted') return this.holdAround(p, bomb, 'guard');
      return this.holdAround(p, this.site, `push${this.site.id}`, 0.6);
    }
    if (bomb.state === 'planted') return { x: bomb.x, z: bomb.z, key: 'defuse', kind: 'defuse' };
    return this.holdAround(p, this.site, `hold${this.site.id}`, 0.55);
  }
  holdAround(p, centre, key, spread = 0.5) {
    const room = this.room;
    if (!this.holdSpot || this.holdSpot.key !== key || room.tick > this.holdUntil) {
      const r = (centre.radius || 6) * spread * Math.sqrt(Math.random()), a = Math.random() * Math.PI * 2;
      this.holdSpot = { key, x: centre.x + Math.cos(a) * r, z: centre.z + Math.sin(a) * r };
      this.holdUntil = room.tick + TICK_RATE * 14;
    }
    return { ...this.holdSpot, kind: 'go' };
  }

  navigate(p, cmd) {
    const room = this.room, c = p.char, tick = room.tick;
    const goal = this.goalFor(p);
    const distGoal = Math.hypot(goal.x - c.x, goal.z - c.z);
    const arrived = distGoal < (goal.kind === 'defuse' ? 1.5 : goal.kind === 'plant' ? 2.5 : 2.2);
    if (arrived) {
      const sway = Math.sin(tick * 0.02 + p.index * 1.7) * 1.2;
      const bearing = Math.atan2(-(room.map.sites[0].x - c.x), -(room.map.sites[0].z - c.z));
      cmd.yaw = c.yaw + clamp(angleDelta(bearing + sway * 0.5, c.yaw), -0.03, 0.03);
      cmd.pitch = 0;
      if (goal.kind === 'plant' && p.inv.has(SLOT.OBJECTIVE)) { if (p.inv.current !== SLOT.OBJECTIVE) cmd.slot = SLOT.OBJECTIVE; else cmd.fire = true; }
      if (goal.kind === 'defuse') cmd.interact = true;
      return cmd;
    }
    if (goal.key !== this.goalKey || tick - this.pathTick > TICK_RATE * 2) {
      this.path = room.nav.path(c, goal); this.pathTick = tick; this.goalKey = goal.key;
    }
    while (this.path.length && Math.hypot(this.path[0].x - c.x, this.path[0].z - c.z) < 0.9) this.path.shift();
    const next = this.path[0] || goal;
    const want = Math.atan2(-(next.x - c.x), -(next.z - c.z));
    cmd.yaw = c.yaw + clamp(angleDelta(want, c.yaw), -0.16, 0.16);
    cmd.pitch = clamp(c.pitch * 0.9, -0.2, 0.2);
    cmd.forward = Math.abs(angleDelta(want, c.yaw)) < 0.9 ? 1 : 0.3;
    // stuck recovery
    if (tick - this.lastCheck > TICK_RATE) {
      if (this.lastPos && Math.hypot(c.x - this.lastPos.x, c.z - this.lastPos.z) < 0.6) { this.stuck++; this.path = []; }
      else this.stuck = 0;
      this.lastPos = { x: c.x, z: c.z }; this.lastCheck = tick;
    }
    if (this.stuck > 0) { cmd.jump = tick % 40 < 2; cmd.right = this.stuck % 2 ? 1 : -1; }
    return cmd;
  }
}
