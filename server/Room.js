// One authoritative 5v5 match: lobby/team allocation, MR12 round state machine, economy, combat with
// lag-compensated hit registration, grenades, bomb objective and bots.
import { randomBytes } from 'node:crypto';
import { DT, TICK_RATE, RULES, MOVEMENT as M, TEAM_IDS, UNIT, neutralInput, otherTeam, clamp, validCommand } from '../shared/constants.js';
import { createPlayer, eyeHeight, horizontalSpeed, stepPlayer } from '../shared/movement.js';
import { Inventory } from '../shared/inventory.js';
import { BUY_ITEMS, GRENADES, SLOT, WEAPONS, computeDamage, inaccuracy, makeRandom, rayHitPlayer, shotDirection } from '../shared/weapons.js';
import { LagCompensator } from './LagCompensator.js';
import { BotBrain } from './Bots.js';

const BOT_NAMES = ['NOVA', 'GHOST', 'ATLAS', 'VIPER', 'RAVEN', 'ORION', 'COBRA', 'DELTA', 'SABLE', 'ONYX'];
const secondsToTick = s => Math.round(s * TICK_RATE);
const GRAVITY = M.gravity;

export class Room {
  /**
   * @param {string} code
   * @param {object} map  result of buildMapData()
   * @param {import('./Navigation.js').Navigation} nav
   * @param {{isPublic?:boolean, practice?:boolean, timing?:object}} options
   */
  constructor(code, map, nav, options = {}) {
    this.code = code; this.map = map; this.collider = map.collider; this.nav = nav;
    this.isPublic = !!options.isPublic; this.practice = !!options.practice;
    this.timing = { warmup: RULES.warmupSeconds, freeze: RULES.freezeSeconds, round: RULES.roundSeconds, post: RULES.postRoundSeconds, ...(options.timing || {}) };
    for (const value of Object.values(this.timing)) if (!Number.isFinite(value) || value < 0 || value > 3600) throw new Error('Invalid phase timing');
    this.players = new Map(); this.host = null;
    this.tick = 0; this.epoch = 0; this.round = 0; this.phase = 'warmup'; this.phaseEnd = this.tick + secondsToTick(this.timing.warmup);
    this.side = { A: 'TERRORIST', B: 'COUNTER_TERRORIST' };            // which squad currently plays which side
    this.wins = { A: 0, B: 0 }; this.lossStreak = { A: 0, B: 0 };
    this.bomb = { state: 'idle', carrier: null, x: 0, y: 0, z: 0, site: null, explodeTick: 0 };
    this.grenades = []; this.smokes = []; this.fires = []; this.decoys = []; this.drops = []; this.nextGrenade = 1;
    this.events = []; this.eventId = 0; this.result = null; this.accumulator = 0;
    this.lag = new LagCompensator({ maxPlayers: RULES.maxPlayers });
    this.stats = { stepMs: 0, steps: 0 };
    this.emptySince = null;
  }

  // ------------------------------------------------------------------------------------------------ events
  emit(type, data) {
    this.events.push({ ...data, id: ++this.eventId, type, tick: this.tick });
    const keep = this.tick - TICK_RATE;
    while (this.events.length && (this.events[0].tick < keep || this.events.length > 256)) this.events.shift();
  }

  // ------------------------------------------------------------------------------------------ team lobby
  squadOf(team) { return this.side.A === team ? 'A' : 'B'; }
  teamPlayers(team) { return [...this.players.values()].filter(p => p.team === team); }
  humans() { return [...this.players.values()].filter(p => !p.bot); }
  get scores() { return { TERRORIST: this.wins[this.squadOf('TERRORIST')], COUNTER_TERRORIST: this.wins[this.squadOf('COUNTER_TERRORIST')] }; }
  count(team) { return this.teamPlayers(team).length; }
  isFull() { return this.players.size >= RULES.maxPlayers && ![...this.players.values()].some(p => p.bot); }

  /** Picks a team for a joining human: honours the preference while capacity (5 each) and balance allow. */
  allocateTeam(preferred, bot = false) {
    const pref = TEAM_IDS.includes(preferred) ? preferred : 'TERRORIST', other = otherTeam(pref);
    const room = t => this.count(t) < RULES.perTeam || (!bot && this.teamPlayers(t).some(p => p.bot));
    const balanced = t => this.count(t) <= this.count(otherTeam(t)) || this.count(otherTeam(t)) >= RULES.perTeam;
    if (room(pref) && balanced(pref)) return pref;
    if (room(other)) return other;
    return null;
  }

  add(id, name, preferred = 'TERRORIST', bot = false) {
    if (this.players.has(id)) return null;
    const team = this.allocateTeam(preferred, bot);
    if (!team) return null;
    if (this.count(team) >= RULES.perTeam) { // make room by kicking a bot of that team
      const victim = this.teamPlayers(team).find(p => p.bot);
      if (!victim) return null;
      this.remove(victim.id);
    }
    const squad = this.squadOf(team);
    const p = {
      id, name, team, squad, bot, index: this.nextIndex(), char: null, inv: new Inventory(team), health: 100, armor: 0, helmet: false, kit: false, money: RULES.startMoney,
      kills: 0, deaths: 0, assists: 0, alive: false, life: 0, queue: [], ack: -1, lastReceived: -1, lastCommandTick: this.tick, rtt: 80,
      cmd: neutralInput(), consumed: false, action: null, respawnTick: 0, damageBy: new Map(), flashUntil: 0, brain: bot ? new BotBrain(this) : null,
      lastLook: { yaw: 0, pitch: 0 }, lastInteract: false, joinedTick: this.tick,
    };
    this.players.set(id, p);
    if (!this.host && !bot) this.host = id;
    const spawn = this.pickSpawn(p);
    p.char = createPlayer(spawn);
    p.inv.reset(team);
    if (this.phase === 'warmup') this.respawn(p);
    return p;
  }
  nextIndex() { const used = new Set([...this.players.values()].map(p => p.index)); let i = 0; while (used.has(i)) i++; return i; }
  addBot(team) { const id = `bot-${randomBytes(3).toString('hex')}`; const name = BOT_NAMES[this.players.size % BOT_NAMES.length]; return this.add(id, name, team, true); }
  fillBots() { for (const team of TEAM_IDS) while (this.count(team) < RULES.perTeam) if (!this.addBot(team)) break; }

  remove(id) {
    const p = this.players.get(id);
    if (!p) return;
    if (this.bomb.carrier === id) this.dropBomb(p);
    this.players.delete(id);
    if (this.host === id) this.host = this.humans()[0]?.id || null;
  }

  enqueue(id, commands) {
    const p = this.players.get(id);
    if (!p || !Array.isArray(commands)) return;
    for (const c of commands) {
      if (!validCommand(c) || (c.epoch !== undefined && c.epoch !== this.epoch) || (c.life !== undefined && c.life !== p.life)) continue;
      if (c.seq <= p.lastReceived || p.queue.length >= 128) continue;
      p.queue.push(c); p.lastReceived = c.seq; p.lastCommandTick = this.tick;
    }
  }

  // ------------------------------------------------------------------------------------------- spawning
  pickSpawn(p) {
    const list = this.map.spawns[p.team];
    const taken = new Set([...this.players.values()].filter(q => q !== p && q.team === p.team && q.alive).map(q => q.spawnIndex));
    // spawnShift is re-rolled every round, so with more markers than players the positions differ round to round
    const start = p.index + (this.spawnShift || 0);
    let i = start % list.length;
    for (let k = 0; k < list.length; k++) { const c = (start + k) % list.length; if (!taken.has(c)) { i = c; break; } }
    p.spawnIndex = i;
    return list[i];
  }
  respawn(p) {
    const spawn = this.pickSpawn(p);
    p.char = createPlayer(spawn);
    p.alive = true; p.life++; p.health = 100; p.action = null; p.damageBy.clear(); p.flashUntil = 0;
    if (p.queue.length) p.ack = p.queue.at(-1).seq;
    p.queue = []; p.cmd = neutralInput(); p.lastExecutedTick = -Infinity;
    p.brain?.newRound();
    if (this.phase === 'warmup') { p.money = RULES.maxMoney; this.newLoadout(p); }
  }
  newLoadout(p) { p.inv.reset(p.team); p.armor = 0; p.helmet = false; p.kit = false; }

  // ---------------------------------------------------------------------------------------- match flow
  start() { if (this.phase === 'warmup') this.beginMatch(); }
  beginMatch() {
    this.round = 0; this.wins = { A: 0, B: 0 }; this.lossStreak = { A: 0, B: 0 };
    // squads keep their original sides at the start of a match
    const swap = this.side.A !== 'TERRORIST';
    if (swap) this.swapSides(false);
    for (const p of this.players.values()) { p.kills = p.deaths = p.assists = 0; p.money = RULES.startMoney; p.alive = false; this.newLoadout(p); }
    this.result = null;
    this.beginRound(true);
  }
  swapSides(resetEconomy = true) {
    this.side = { A: otherTeam(this.side.A), B: otherTeam(this.side.B) };
    for (const p of this.players.values()) { p.team = otherTeam(p.team); p.inv.team = p.team; }
    if (resetEconomy) this.emit('halftime', {});
  }
  beginRound(fresh = false) {
    this.round++; this.epoch++;
    const halftime = this.round === RULES.halfRounds + 1;
    if (halftime) {
      this.swapSides();
      for (const p of this.players.values()) { p.money = RULES.startMoney; p.alive = false; this.newLoadout(p); }
      this.lossStreak = { A: 0, B: 0 };
    }
    this.phase = 'buy'; this.phaseEnd = this.tick + secondsToTick(this.timing.freeze); this.result = null;
    this.spawnShift = Math.floor(Math.random() * 10);
    this.lag.reset(); this.grenades = []; this.smokes = []; this.fires = []; this.decoys = []; this.drops = [];
    for (const p of this.players.values()) {
      const keep = !fresh && !halftime && p.carry && p.alive;
      if (keep) { p.inv.resetTimers(); } else this.newLoadout(p);
      p.carry = null; p.alive = false; this.respawn(p);
      p.inv.team = p.team;
    }
    // hand the bomb to a terrorist
    const ts = this.teamPlayers('TERRORIST').filter(p => p.alive);
    for (const p of ts) if (p.inv.weaponId(SLOT.OBJECTIVE)) p.inv.remove('c4');
    const carrier = ts.find(p => !p.bot) || ts[0];
    this.bomb = { state: carrier ? 'carried' : 'idle', carrier: carrier?.id || null, x: 0, y: 0, z: 0, site: null, explodeTick: 0 };
    if (carrier) carrier.inv.give('c4');
    for (const p of this.players.values()) if (p.brain) { p.brain.newRound(); p.brain.buy(p); }
    this.emit('round', { round: this.round, halftime });
  }
  beginLive() {
    this.phase = 'live'; this.phaseEnd = this.tick + secondsToTick(this.timing.round);
    this.emit('live', {});
  }
  endRound(winner, reason) {
    if (this.phase !== 'live') return;
    const winSquad = this.squadOf(winner), loseSquad = winSquad === 'A' ? 'B' : 'A';
    this.wins[winSquad]++;
    const bonus = RULES.lossBonuses[Math.min(this.lossStreak[loseSquad], RULES.lossBonuses.length - 1)];
    this.lossStreak[loseSquad] = Math.min(RULES.lossBonuses.length - 1, this.lossStreak[loseSquad] + 1);
    this.lossStreak[winSquad] = Math.max(0, this.lossStreak[winSquad] - 1);
    const planted = this.bomb.state === 'planted' || this.bomb.state === 'exploded' || this.bomb.state === 'defused';
    for (const p of this.players.values()) {
      if (p.team === winner) p.money += RULES.winBonus;
      else p.money += bonus + (p.team === 'TERRORIST' && planted ? 800 : 0);
      p.money = Math.min(RULES.maxMoney, p.money);
      p.carry = p.alive ? p.inv.toJSON() : null;
    }
    for (const p of this.players.values()) p.action = null;
    this.result = { winner, reason };
    const total = this.wins.A + this.wins.B;
    const decided = this.wins[winSquad] >= RULES.roundsToWin || total >= RULES.halfRounds * 2;
    if (decided) {
      const draw = this.wins.A === this.wins.B;
      this.result = { winner: draw ? null : (this.wins.A > this.wins.B ? this.side.A : this.side.B), reason: draw ? 'draw' : 'match', match: true };
      this.phase = 'matchEnd'; this.phaseEnd = this.tick + secondsToTick(15);
    } else { this.phase = 'post'; this.phaseEnd = this.tick + secondsToTick(this.round === RULES.halfRounds ? RULES.halftimeSeconds : this.timing.post); }
    this.emit('roundEnd', { winner, reason, scores: this.scores, match: !!this.result.match });
  }
  resetToWarmup() {
    this.phase = 'warmup'; this.phaseEnd = this.tick + secondsToTick(this.timing.warmup); this.round = 0; this.epoch++;
    this.wins = { A: 0, B: 0 }; this.result = null; this.grenades = []; this.smokes = []; this.fires = []; this.decoys = []; this.drops = [];
    if (this.side.A !== 'TERRORIST') this.swapSides(false);
    this.bomb = { state: 'idle', carrier: null, x: 0, y: 0, z: 0, site: null, explodeTick: 0 };
    for (const p of this.players.values()) { p.alive = false; this.newLoadout(p); p.money = RULES.maxMoney; this.respawn(p); p.kills = p.deaths = p.assists = 0; }
  }

  // ------------------------------------------------------------------------------------------- economy
  buy(id, item) {
    const p = this.players.get(id);
    if (!p || !p.alive || !(this.phase === 'buy' || this.phase === 'warmup')) return { error: 'Xarid faqat buy yoki warmup vaqtida mumkin.' };
    const def = Object.hasOwn(BUY_ITEMS, item) ? BUY_ITEMS[item] : null;
    if (!def) return { error: 'Noma’lum jihoz.' };
    if (def.team && def.team !== p.team) return { error: 'Bu jihoz sizning jamoangiz uchun emas.' };
    const free = this.phase === 'warmup';
    if (!free && p.money < def.price) return { error: 'Mablag‘ yetarli emas.' };
    if (item === 'kevlar') { if (p.armor >= 100) return { error: 'Zirh allaqachon to‘liq.' }; p.armor = 100; }
    else if (item === 'helmet') { if (p.armor >= 100 && p.helmet) return { error: 'Zirh va dubulg‘a bor.' }; p.armor = 100; p.helmet = true; }
    else if (item === 'defuser') { if (p.kit) return { error: 'Defuse kit bor.' }; p.kit = true; }
    else if (GRENADES.includes(item)) {
      const before = p.inv.grenades[item]; p.inv.give(item);
      if (p.inv.grenades[item] === before) return { error: 'Granata limiti.' };
    }
    else {
      if (p.inv.weaponId(WEAPONS[item].slot) === item && p.inv.ammoOf(item).reserve >= WEAPONS[item].reserve) return { error: 'Bu qurol allaqachon bor.' };
      p.inv.give(item, { select: true });
    }
    if (!free) p.money -= def.price;
    return { ok: true, money: p.money };
  }

  // ------------------------------------------------------------------------------------ combat helpers
  eye(p) { return { x: p.char.x, y: p.char.y + eyeHeight(p.char), z: p.char.z }; }
  viewTickFor(p, cmd) {
    if (p.bot) return this.tick;
    // A client may not rewind further than its measured round-trip + interpolation delay (+ slack).
    const behind = Math.ceil((p.rtt / 1000 + RULES.interpolationSeconds + 0.06) * TICK_RATE);
    return this.lag.clampTick(cmd.viewTick || this.tick, this.tick, behind);
  }
  poseAt(target, tick) {
    if (tick >= this.tick) return target.char;
    return this.lag.sample(target.id, tick);
  }
  damage(victim, attacker, amount, armorLoss, weaponId, head, part = null) {
    if (!victim.alive) return false;
    victim.health = Math.max(0, victim.health - amount);
    victim.armor = Math.max(0, victim.armor - armorLoss);
    if (attacker) victim.damageBy.set(attacker.id, (victim.damageBy.get(attacker.id) || 0) + amount);
    if (victim.health > 0) return false;
    this.kill(victim, attacker, weaponId, head);
    return true;
  }
  kill(victim, attacker, weaponId, head) {
    victim.alive = false; victim.carry = null; victim.deaths++; victim.action = null; victim.respawnTick = this.tick + secondsToTick(2);
    if (this.bomb.carrier === victim.id) this.dropBomb(victim);
    const gun = victim.inv.weaponId(SLOT.PRIMARY) || victim.inv.weaponId(SLOT.SECONDARY);
    if (gun && this.phase !== 'warmup') { const ammo = { ...victim.inv.ammoOf(gun) }; victim.inv.slots[WEAPONS[gun].slot] = null; delete victim.inv.ammo[gun]; this.spawnDrop(victim, gun, ammo, 1.2); }
    let killer = null;
    if (attacker && attacker !== victim && attacker.team !== victim.team) {
      attacker.kills++; killer = attacker;
      attacker.money = Math.min(RULES.maxMoney, attacker.money + (this.phase === 'warmup' ? 0 : (WEAPONS[weaponId]?.kill ?? 300)));
      for (const [id, dmg] of victim.damageBy) { const a = this.players.get(id); if (a && a !== attacker && a.team !== victim.team && dmg >= 41) a.assists++; }
    } else if (attacker === victim) attacker.kills = Math.max(0, attacker.kills - 1);
    this.emit('kill', { killer: killer?.id || null, killerName: killer?.name || null, victim: victim.id, victimName: victim.name, weapon: weaponId || 'world', head: !!head, killerTeam: killer?.team || null, victimTeam: victim.team });
  }
  dropBomb(p, speed = 0) {
    const c = p.char, f = this.throwVector(c, speed);
    this.bomb = { ...this.bomb, state: 'dropped', carrier: null, x: c.x, y: c.y + (speed ? 1.2 : 0), z: c.z, vx: f.x, vy: speed ? f.y : c.vy, vz: f.z, droppedBy: p.id, pickupAfter: this.tick + secondsToTick(speed ? 0.8 : 0) };
    p.inv.remove('c4');
  }
  /** Throw velocity from the view direction (slightly upward), plus the thrower's own motion. */
  throwVector(c, speed) {
    const pitch = Math.min(1.2, c.pitch + 0.25);
    return { x: -Math.sin(c.yaw) * Math.cos(pitch) * speed + c.vx * 0.6, y: Math.sin(pitch) * speed + 1, z: -Math.cos(c.yaw) * Math.cos(pitch) * speed + c.vz * 0.6 };
  }

  // ------------------------------------------------------------------------------------ dropped weapons
  spawnDrop(p, weapon, ammo, speed = 4.2) {
    const c = p.char, v = this.throwVector(c, speed), eye = this.eye(p);
    // start in front of the eye unless a wall is right there
    const len = Math.hypot(v.x, v.z) || 1, dx = v.x / len, dz = v.z / len;
    const clear = this.collider.wallDistance(eye.x, eye.y - 0.3, eye.z, dx, 0, dz, 0.6);
    const off = Math.max(0, Math.min(0.45, clear - 0.2));
    const d = { id: this.nextGrenade++, weapon, ammo, x: eye.x + dx * off, y: eye.y - 0.3, z: eye.z + dz * off, vx: v.x, vy: v.y, vz: v.z, yaw: c.yaw + Math.PI / 2, rest: 0,
      owner: p.id, pickupAfter: this.tick + secondsToTick(0.9),   // only the thrower waits before re-collecting it
 expires: this.tick + secondsToTick(90) };
    this.drops.push(d);
    if (this.drops.length > 40) this.drops.shift();
    this.emit('dropped', { who: p.id, weapon, x: d.x, y: d.y, z: d.z });
    return d;
  }
  /** Small rigid item: gravity, sub-stepped capsule contacts, damped bounce and ground friction. */
  stepItem(o, r = 0.08) {
    if (o.rest > 8) return;
    o.vy -= GRAVITY * DT;
    const speed = Math.hypot(o.vx, o.vy, o.vz), steps = Math.max(1, Math.ceil(speed * DT / 0.06)), sub = DT / steps, contacts = [];
    const pos = { x: o.x, y: o.y, z: o.z };                       // o.y is the item's bottom (rests on the floor)
    let ground = false;
    for (let s = 0; s < steps; s++) {
      pos.x += o.vx * sub; pos.y += o.vy * sub; pos.z += o.vz * sub;
      contacts.length = 0;
      if (this.collider.resolveCapsule(pos, r, r * 2, contacts, o.vx, o.vy, o.vz)) for (const n of contacts) {
        const vn = o.vx * n.x + o.vy * n.y + o.vz * n.z;
        if (vn >= 0) continue;
        o.vx -= 1.25 * vn * n.x; o.vy -= 1.25 * vn * n.y; o.vz -= 1.25 * vn * n.z;
        if (n.y > 0.7) ground = true;
      }
    }
    if (ground) { const k = Math.max(0, 1 - 9 * DT); o.vx *= k; o.vz *= k; }
    o.x = pos.x; o.y = pos.y; o.z = pos.z;
    if (ground && Math.hypot(o.vx, o.vy, o.vz) < 0.35) { o.rest++; if (o.rest > 8) o.vx = o.vy = o.vz = 0; } else o.rest = 0;
  }
  stepDrops() {
    if (!this.drops.length) return;
    const floor = this.collider.bounds.min.y - 20;
    this.drops = this.drops.filter(d => { this.stepItem(d); return d.y > floor && this.tick < d.expires; });
    // walking over a gun picks it up when that slot is empty (CS rule)
    for (const p of this.players.values()) {
      if (!p.alive || this.phase === 'matchEnd') continue;
      const d = this.drops.find(q => (q.owner !== p.id || this.tick >= q.pickupAfter) && !p.inv.slots[WEAPONS[q.weapon].slot] && this.near(p, q, 1.0));
      if (d) this.pickUp(p, d);
    }
  }
  near(p, o, radius) { const c = p.char; return Math.hypot(c.x - o.x, c.z - o.z) < radius && o.y - c.y > -0.6 && o.y - c.y < 1.4; }
  /** 'E': the drop closest to the crosshair within reach (swaps with the same-slot weapon). */
  aimedDrop(p) {
    const eye = this.eye(p), c = p.char, f = { x: -Math.sin(c.yaw) * Math.cos(c.pitch), y: Math.sin(c.pitch), z: -Math.cos(c.yaw) * Math.cos(c.pitch) };
    let best = null, bestScore = 0.86;
    for (const d of this.drops) {
      if (this.tick < d.pickupAfter && d.owner === p.id) continue;
      const dx = d.x - eye.x, dy = d.y + 0.05 - eye.y, dz = d.z - eye.z, dist = Math.hypot(dx, dy, dz);
      if (dist > 2.2) continue;
      const score = (dx * f.x + dy * f.y + dz * f.z) / (dist || 1) + (dist < 0.9 ? 0.2 : 0);
      if (score > bestScore && this.hasSight(eye, { x: d.x, y: d.y + 0.05, z: d.z }, true)) { best = d; bestScore = score; }
    }
    return best;
  }
  pickUp(p, d) {
    const w = WEAPONS[d.weapon], held = p.inv.slots[w.slot];
    if (held) { const ammo = { ...p.inv.ammoOf(held) }; p.inv.slots[w.slot] = null; delete p.inv.ammo[held]; this.spawnDrop(p, held, ammo, 2.2); }
    this.drops = this.drops.filter(q => q !== d);
    const select = !!held || p.inv.current === w.slot || (w.slot === SLOT.PRIMARY && !p.inv.weaponId(SLOT.PRIMARY));
    p.inv.give(d.weapon, { ammo: d.ammo, select: select && !p.inv.pin });
    this.emit('pickup', { who: p.id, weapon: d.weapon, x: p.char.x, y: p.char.y, z: p.char.z });
  }

  fireShot(p, ev, cmd) {
    const w = WEAPONS[ev.weapon], c = p.char, origin = this.eye(p);
    const spread = inaccuracy(w, { speed: horizontalSpeed(c), grounded: c.grounded, crouch: c.crouch, burst: ev.burst, zoom: ev.zoom || 0 });
    const random = makeRandom((this.tick * 2654435761) ^ (p.index * 40503) ^ ((p.inv.lastShot + ev.index) * 9973));
    const viewTick = this.viewTickFor(p, cmd), pellets = w.pellets || 1, hits = new Map();
    let first = null;
    for (let i = 0; i < pellets; i++) {
      const dir = shotDirection(c.yaw, c.pitch, ev.punch, spread + (w.pelletSpread || 0) * (pellets > 1 ? 1 : 0) * Math.sqrt(random()), random);
      const wall = this.collider.raycast(origin.x, origin.y, origin.z, dir.x, dir.y, dir.z, 250);
      let limit = wall ? wall.distance : 250, hit = null;
      for (const t of this.players.values()) {
        if (!t.alive || t.team === p.team || t.id === p.id) continue;
        const pose = this.poseAt(t, viewTick);
        if (!pose || (pose.life !== undefined && pose.life !== t.life)) continue;
        const h = rayHitPlayer(origin, dir, pose, limit);
        if (h && h.distance < limit) { limit = h.distance; hit = { target: t, part: h.part }; }
      }
      const to = { x: origin.x + dir.x * limit, y: origin.y + dir.y * limit, z: origin.z + dir.z * limit };
      if (hit) {
        const dmg = computeDamage(w, limit, hit.part, hit.target.armor, hit.target.helmet);
        const killed = this.damage(hit.target, p, dmg.health, dmg.armor, w.id, hit.part === 'head', hit.part);
        const acc = hits.get(hit.target.id) || { target: hit.target, part: hit.part, damage: 0, killed: false };
        acc.damage += dmg.health; acc.killed = acc.killed || killed; if (hit.part === 'head') acc.part = 'head'; hits.set(hit.target.id, acc);
      }
      first = first || { to, hit: !!hit, wall: !hit && wall ? { nx: wall.nx, ny: wall.ny, nz: wall.nz } : null };
      if (pellets > 1 && i > 0) this.emit('pellet', { shooter: p.id, from: origin, to, wall: !hit && wall ? { nx: wall.nx, ny: wall.ny, nz: wall.nz } : null });
    }
    let info = null;
    for (const h of hits.values()) {
      const rec = { target: h.target.id, part: h.part, damage: h.damage, killed: h.killed, hp: h.target.health };
      info = info || rec;
      this.emit('hit', { attacker: p.id, target: h.target.id, part: h.part, damage: h.damage, killed: h.killed, from: { x: origin.x, z: origin.z } });
    }
    this.emit('shot', { shooter: p.id, weapon: w.id, from: origin, to: first.to, hit: info, wall: first.wall });
  }
  melee(p, ev, cmd) {
    const w = WEAPONS[ev.weapon], origin = this.eye(p), c = p.char;
    const viewTick = this.viewTickFor(p, cmd);
    let best = null;
    for (const t of this.players.values()) {
      if (!t.alive || t.team === p.team || t.id === p.id) continue;
      const pose = this.poseAt(t, viewTick); if (!pose || (pose.life !== undefined && pose.life !== t.life)) continue;
      // widen the strike with a few offset rays so a slash is forgiving like a real swing
      for (const [dy, dp] of [[0, 0], [0.12, 0], [-0.12, 0], [0, -0.15]]) {
        const yaw = c.yaw + dy, pitch = c.pitch + dp;
        const d = { x: -Math.sin(yaw) * Math.cos(pitch), y: Math.sin(pitch), z: -Math.cos(yaw) * Math.cos(pitch) };
        const limit = this.collider.wallDistance(origin.x, origin.y, origin.z, d.x, d.y, d.z, w.range);
        const h = rayHitPlayer(origin, d, pose, limit);
        if (h && (!best || h.distance < best.distance)) best = { ...h, target: t, pose };
      }
    }
    this.emit('melee', { shooter: p.id, kind: ev.kind, hit: !!best, from: origin });
    if (!best) return;
    const behind = Math.cos(best.pose.yaw - c.yaw) > 0.4; // both facing the same way = backstab
    const base = ev.kind === 'stab' ? (behind ? w.backstab : w.stabDamage) : (behind ? 90 : w.damage);
    const dmg = computeDamage({ ...w, damage: base, armorRatio: 1, range: 1 }, best.distance, 'chest', best.target.armor, best.target.helmet);
    const killed = this.damage(best.target, p, dmg.health, dmg.armor, 'knife', false);
    this.emit('hit', { attacker: p.id, target: best.target.id, part: 'chest', damage: dmg.health, killed, from: { x: origin.x, z: origin.z } });
  }

  // -------------------------------------------------------------------------------------------- grenades
  throwGrenade(p, ev) {
    const w = WEAPONS[ev.weapon], c = p.char, o = this.eye(p);
    const dir = { x: -Math.sin(c.yaw) * Math.cos(c.pitch + 0.1), y: Math.sin(c.pitch + 0.1), z: -Math.cos(c.yaw) * Math.cos(c.pitch + 0.1) };
    const speed = 19 * ev.strength + 1;
    const start = { x: o.x + dir.x * 0.45, y: o.y + dir.y * 0.45 - 0.1, z: o.z + dir.z * 0.45 };
    const clear = this.collider.wallDistance(o.x, o.y, o.z, start.x - o.x, start.y - o.y, start.z - o.z, 0.6);
    if (clear < 0.44) { start.x = o.x; start.y = o.y; start.z = o.z; }
    this.grenades.push({ id: this.nextGrenade++, type: w.id, owner: p.id, team: p.team, x: start.x, y: start.y, z: start.z,
      vx: dir.x * speed + c.vx * 0.5, vy: dir.y * speed + c.vy * 0.5, vz: dir.z * speed + c.vz * 0.5, detonate: this.tick + secondsToTick(w.fuse), rest: 0, bounces: 0 });
    this.emit('throw', { who: p.id, grenadeType: w.id });
  }
  stepGrenade(g) {
    const r = 0.07;
    g.vy -= GRAVITY * DT;
    const speed = Math.hypot(g.vx, g.vy, g.vz), steps = Math.max(1, Math.ceil(speed * DT / 0.08)), sub = DT / steps;
    const pos = { x: g.x, y: g.y - r, z: g.z }, contacts = [];
    for (let s = 0; s < steps; s++) {
      pos.x += g.vx * sub; pos.y += g.vy * sub; pos.z += g.vz * sub;
      contacts.length = 0;
      if (this.collider.resolveCapsule(pos, r, r * 2, contacts, g.vx, g.vy, g.vz)) {
        for (const n of contacts) {
          const vn = g.vx * n.x + g.vy * n.y + g.vz * n.z;
          if (vn >= 0) continue;
          g.vx -= (1 + 0.45) * vn * n.x; g.vy -= (1 + 0.45) * vn * n.y; g.vz -= (1 + 0.45) * vn * n.z;
          if (n.y > 0.7) { g.vx *= 0.82; g.vz *= 0.82; }
          g.bounces++;
          if ((g.type === 'molotov' || g.type === 'incendiary') && n.y > 0.5) g.detonate = this.tick;
          if (Math.abs(vn) > 1.5) this.emit('bounce', { x: pos.x, y: pos.y, z: pos.z, grenadeType: g.type });
        }
      }
    }
    g.x = pos.x; g.y = pos.y + r; g.z = pos.z;
    if (Math.hypot(g.vx, g.vy, g.vz) < 0.5) { g.rest++; if (g.rest > 3) { g.vx = g.vy = g.vz = 0; } } else g.rest = 0;
    if (g.y < this.collider.bounds.min.y - 20) g.detonate = this.tick;
    const pop = this.tick >= g.detonate || ((g.type === 'smoke' || g.type === 'decoy') && g.rest > secondsToTick(0.5));
    if (pop) this.detonate(g);
    return pop;
  }
  /** Incendiary pools: burn every non-friendly player standing in them twice a second; a smoke on top puts them out. */
  stepFires() {
    if (!this.fires.length) return;
    this.fires = this.fires.filter(f => {
      if (this.tick >= f.end) return false;
      if (this.smokes.some(s => Math.hypot(s.x - f.x, s.z - f.z) < s.radius && Math.abs(s.y - 1.2 - f.y) < s.radius)) return false;
      if (this.tick < f.next) return true;
      f.next = this.tick + secondsToTick(0.5);
      const w = WEAPONS[f.type], owner = this.players.get(f.owner) || null;
      for (const t of this.players.values()) {
        if (!t.alive || (t.team === f.team && t.id !== f.owner)) continue;
        const c = t.char;
        if (Math.hypot(c.x - f.x, c.z - f.z) > f.radius || c.y - f.y > 1.5 || c.y - f.y < -1) continue;
        const killed = this.damage(t, owner, w.damage, 0, f.type, false);
        this.emit('hit', { attacker: f.owner, target: t.id, part: 'leg', damage: w.damage, killed, from: { x: f.x, z: f.z } });
      }
      return true;
    });
  }
  /** Decoys replay the owner's weapon as bursts of gunfire heard at their position. */
  stepDecoys() {
    if (!this.decoys.length) return;
    this.decoys = this.decoys.filter(d => {
      if (this.tick >= d.end) return false;
      if (this.tick < d.next) return true;
      const w = WEAPONS[d.weapon] || WEAPONS.ak47;
      this.emit('decoy', { x: d.x, y: d.y, z: d.z, weapon: w.id, owner: d.owner });
      d.burst++;
      const burstLen = w.auto ? 5 : 1;
      d.next = this.tick + secondsToTick(d.burst % burstLen === 0 ? 0.45 + Math.random() * 0.9 : w.interval);
      return true;
    });
  }
  hasSight(from, to, ignoreSmoke = false) {
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z, d = Math.hypot(dx, dy, dz);
    if (d < 1e-4) return true;
    if (this.collider.wallDistance(from.x, from.y, from.z, dx / d, dy / d, dz / d, d) < d - 0.05) return false;
    if (!ignoreSmoke) for (const s of this.smokes) {
      // segment-sphere test against smoke clouds
      const ox = from.x - s.x, oy = from.y - s.y, oz = from.z - s.z, b = ox * dx / d + oy * dy / d + oz * dz / d, cc = ox * ox + oy * oy + oz * oz - s.radius * s.radius;
      const disc = b * b - cc;
      if (disc > 0) { const t = -b - Math.sqrt(disc); if (t < d && -b + Math.sqrt(disc) > 0) return false; }
    }
    return true;
  }
  detonate(g) {
    const w = WEAPONS[g.type];
    this.emit('detonate', { grenadeType: g.type, x: g.x, y: g.y, z: g.z });
    const owner = this.players.get(g.owner) || null;
    if (g.type === 'he') {
      for (const t of this.players.values()) {
        if (!t.alive || (t.team === g.team && t.id !== g.owner)) continue;
        const chest = { x: t.char.x, y: t.char.y + 1.1, z: t.char.z }, d = Math.hypot(chest.x - g.x, chest.y - g.y, chest.z - g.z);
        if (d > w.radius) continue;
        const centre = { x: g.x, y: g.y + 0.25, z: g.z };
        if (!this.hasSight(centre, chest, true) && !this.hasSight(centre, { x: t.char.x, y: t.char.y + 0.3, z: t.char.z }, true)) continue;
        const raw = w.damage * Math.pow(1 - d / w.radius, 1.6);
        const armorAbsorb = t.armor > 0 ? Math.min(t.armor, raw * 0.25) : 0;
        const amount = Math.max(1, Math.round(raw - armorAbsorb));
        const killed = this.damage(t, owner, amount, Math.round(armorAbsorb), 'he', false);
        this.emit('hit', { attacker: g.owner, target: t.id, part: 'chest', damage: amount, killed, from: { x: g.x, z: g.z } });
      }
    } else if (g.type === 'flash') {
      const origin = { x: g.x, y: g.y + 0.1, z: g.z };
      for (const t of this.players.values()) {
        if (!t.alive) continue;
        const eye = this.eye(t), dx = origin.x - eye.x, dy = origin.y - eye.y, dz = origin.z - eye.z, d = Math.hypot(dx, dy, dz);
        if (d > w.radius || !this.hasSight(origin, eye, true)) continue;
        const c = t.char, fwd = { x: -Math.sin(c.yaw) * Math.cos(c.pitch), y: Math.sin(c.pitch), z: -Math.cos(c.yaw) * Math.cos(c.pitch) };
        const facing = (fwd.x * dx + fwd.y * dy + fwd.z * dz) / (d || 1);
        const duration = (facing > 0.3 ? 4.6 : facing > -0.4 ? 2.2 : 0.7) * (1 - Math.min(0.75, d / w.radius * 0.75));
        t.flashUntil = Math.max(t.flashUntil, this.tick + secondsToTick(duration));
        this.emit('flash', { target: t.id, duration, full: facing > 0.3 });
      }
    } else if (g.type === 'molotov' || g.type === 'incendiary') {
      this.fires.push({ id: g.id, type: g.type, owner: g.owner, team: g.team, x: g.x, y: g.y, z: g.z, radius: w.radius, start: this.tick, end: this.tick + secondsToTick(w.fire), next: this.tick });
    } else if (g.type === 'decoy') {
      const o = this.players.get(g.owner), weapon = o?.inv.weaponId(SLOT.PRIMARY) || o?.inv.weaponId(SLOT.SECONDARY) || 'ak47';
      this.decoys.push({ id: g.id, owner: g.owner, x: g.x, y: g.y + 0.1, z: g.z, weapon, end: this.tick + secondsToTick(w.decoy), next: this.tick + secondsToTick(0.3), burst: 0 });
    } else if (g.type === 'smoke') {
      this.smokes.push({ id: g.id, x: g.x, y: g.y + 1.2, z: g.z, radius: w.radius, start: this.tick, end: this.tick + secondsToTick(w.duration) });
    }
  }

  // ------------------------------------------------------------------------------------------ objectives
  objectives(p, cmd) {
    if (!p.alive || this.phase !== 'live') { p.action = null; return; }
    const c = p.char, b = this.bomb;
    if (b.state === 'dropped' && p.team === 'TERRORIST' && (b.droppedBy !== p.id || this.tick >= (b.pickupAfter || 0)) && Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) < 1.6 && !p.inv.weaponId(SLOT.OBJECTIVE) && this.hasSight(this.eye(p), { x: b.x, y: b.y + 0.15, z: b.z }, true)) {
      b.state = 'carried'; b.carrier = p.id; p.inv.give('c4'); this.emit('bombPickup', { who: p.id });
    }
    const still = c.grounded && horizontalSpeed(c) < 0.4;
    if (p.team === 'TERRORIST' && b.state === 'carried' && b.carrier === p.id) {
      const site = this.map.sites.find(s => Math.hypot(c.x - s.x, c.z - s.z) < s.radius && Math.abs(c.y - s.y) < 1.5);
      if (p.inv.current === SLOT.OBJECTIVE && cmd.fire && site && still && !p.inv.drawing) {
        p.action = p.action?.kind === 'plant' ? p.action : { kind: 'plant', progress: 0 };
        p.action.progress += DT;
        if (p.action.progress >= RULES.plantSeconds) {
          this.bomb = { state: 'planted', carrier: null, x: c.x, y: c.y, z: c.z, site: site.id, explodeTick: this.tick + secondsToTick(RULES.bombSeconds), plantedTick: this.tick };
          p.inv.remove('c4'); p.action = null; p.money = Math.min(RULES.maxMoney, p.money + RULES.plantBonus);
          this.emit('planted', { site: site.id, by: p.id, x: c.x, y: c.y, z: c.z });
        }
      } else if (p.action?.kind === 'plant') p.action = null;
      return;
    }
    if (p.team === 'COUNTER_TERRORIST' && b.state === 'planted' && Math.hypot(c.x - b.x, c.y - b.y, c.z - b.z) < 2.2 && cmd.interact && !cmd.fire && !cmd.fire2 && !p.inv.reloading && still && this.hasSight(this.eye(p), { x: b.x, y: b.y + 0.15, z: b.z }, true)) {
      const need = p.kit ? RULES.defuseKitSeconds : RULES.defuseSeconds;
      p.action = p.action?.kind === 'defuse' ? p.action : { kind: 'defuse', progress: 0, need };
      if (p.action.progress === 0) this.emit('defuseStart', { who: p.id, kit: p.kit });
      if ([...this.players.values()].some(q => q !== p && q.alive && q.action?.kind === 'defuse')) { p.action = null; return; }
      p.action.progress += DT;
      if (p.action.progress >= need) {
        b.state = 'defused'; p.action = null; p.money = Math.min(RULES.maxMoney, p.money + 300);
        this.emit('defused', { by: p.id });
        this.endRound('COUNTER_TERRORIST', 'defused');
      }
    } else if (p.action) p.action = null;
  }
  stepDroppedBomb() {
    const b = this.bomb;
    if (b.state !== 'dropped') return;
    b.vx ??= 0; b.vz ??= 0; b.vy ??= 0; b.rest ??= 0;
    this.stepItem(b, 0.1);
  }
  explodeBomb() {
    const b = this.bomb;
    this.emit('exploded', { x: b.x, y: b.y, z: b.z, site: b.site });
    for (const t of this.players.values()) {
      if (!t.alive) continue;
      const d = Math.hypot(t.char.x - b.x, t.char.y + 1 - b.y, t.char.z - b.z);
      if (d < 40) { const dmg = Math.round(500 * Math.pow(1 - d / 40, 1.5)); if (dmg > 0) this.damage(t, null, dmg, 0, 'c4', false); }
    }
    b.state = 'exploded';
    this.endRound('TERRORIST', 'exploded');
  }

  // ---------------------------------------------------------------------------------------- tick driver
  nextCommand(p) {
    if (p.bot) return p.brain.command(p);
    if (p.queue.length) {
      const cmd = p.queue.shift(); p.ack = cmd.seq; p.lastExecutedTick = this.tick;
      return cmd;
    }
    // Hold continuous input across brief packet jitter, never repeat button edges.
    if (this.tick - p.lastExecutedTick <= 8) return { ...p.cmd, slot: 0, quick: false, drop: false };
    // Gravity, friction and weapon timers keep running even if a client stops sending.
    return { ...neutralInput(), ...p.lastLook, crouch: p.char.crouch > 0.5 };
  }

  runCommand(p, cmd) {
    const live = this.phase === 'live' || this.phase === 'warmup';
    const canMove = p.alive && this.phase !== 'buy' && this.phase !== 'matchEnd';
    p.lastLook.yaw = cmd.yaw; p.lastLook.pitch = cmd.pitch;
    const movement = !canMove ? { ...neutralInput(), yaw: cmd.yaw, pitch: cmd.pitch } : cmd;
    if (!p.alive) { p.char.yaw = cmd.yaw; p.char.pitch = clamp(cmd.pitch, -1.55, 1.55); return; }
    const ev = stepPlayer(p.char, movement, this.collider);
    if (ev.footstep) this.emit('footstep', { who: p.id, x: p.char.x, y: p.char.y, z: p.char.z });
    if (ev.jumped) this.emit('jump', { who: p.id, x: p.char.x, y: p.char.y, z: p.char.z });
    if (ev.landed > 2) {
      this.emit('land', { who: p.id, x: p.char.x, y: p.char.y, z: p.char.z, speed: ev.landed });
      const fall = ev.landed / UNIT;
      if (fall > 580 && (this.phase === 'live' || this.phase === 'post')) this.damage(p, null, Math.round((fall - 580) * 0.2252), 0, 'fall', false);
    }
    if (!p.alive) return;
    const events = p.inv.step(cmd, { canFire: p.alive && live });
    for (const e of events) {
      if (e.type === 'shot') this.fireShot(p, e, cmd);
      else if (e.type === 'melee') this.melee(p, e, cmd);
      else if (e.type === 'throw') this.throwGrenade(p, e);
      else if (e.type === 'drop') { if (e.weapon === 'c4') { if (this.bomb.carrier === p.id) this.dropBomb(p, 3.5); } else this.spawnDrop(p, e.weapon, e.ammo); }
      else if (e.type === 'reloadStart' || e.type === 'select' || e.type === 'quick' || e.type === 'dryfire' || e.type === 'reloaded') this.emit('weaponSound', { who: p.id, kind: e.type, weapon: e.weapon, x: p.char.x, y: p.char.y, z: p.char.z });
    }
    if (cmd.interact && !p.lastInteract && !p.action) { const d = this.aimedDrop(p); if (d) this.pickUp(p, d); }
    p.lastInteract = !!cmd.interact;
    this.objectives(p, cmd);
    p.cmd = cmd;
    if (p.char.y < this.collider.bounds.min.y - 25 && p.alive) this.damage(p, null, 1000, 0, 'world', false);
  }

  step() {
    const started = performance.now();
    this.tick++;
    const humans = this.humans().length;
    if (humans === 0) this.emptySince ??= this.tick; else this.emptySince = null;

    // ---- phase transitions
    if (this.phase === 'warmup') {
      const ready = this.count('TERRORIST') > 0 && this.count('COUNTER_TERRORIST') > 0;
      if (!ready) this.phaseEnd = this.tick + secondsToTick(this.timing.warmup);
      else if (this.tick >= this.phaseEnd) this.beginMatch();
    } else if (this.phase === 'buy' && this.tick >= this.phaseEnd) this.beginLive();
    else if ((this.phase === 'post') && this.tick >= this.phaseEnd) this.beginRound();
    else if (this.phase === 'matchEnd' && this.tick >= this.phaseEnd) this.resetToWarmup();
    if (this.phase !== 'warmup' && (this.count('TERRORIST') === 0 || this.count('COUNTER_TERRORIST') === 0)) this.resetToWarmup();

    // Deadlines belong to world time, before any last-moment plant/defuse command.
    if (this.phase === 'live') {
      if (this.bomb.state === 'planted' && this.tick >= this.bomb.explodeTick) this.explodeBomb();
      else if (this.bomb.state !== 'planted' && this.tick >= this.phaseEnd) this.endRound('COUNTER_TERRORIST', 'time');
    }

    // ---- players
    for (const p of this.players.values()) {
      if (!p.alive && this.phase === 'warmup' && this.tick >= p.respawnTick && p.respawnTick) { this.respawn(p); p.respawnTick = 0; }
      let cmd = this.nextCommand(p);
      p.consumed = !!cmd;
      if (!cmd) continue;
      this.runCommand(p, cmd);

    }
    if (this.phase === 'warmup') for (const p of this.players.values()) p.money = RULES.maxMoney;

    // ---- world
    this.stepDroppedBomb(); this.stepDrops();
    for (let i = this.grenades.length - 1; i >= 0; i--) if (this.stepGrenade(this.grenades[i])) this.grenades.splice(i, 1);
    this.smokes = this.smokes.filter(s => this.tick < s.end);
    this.stepFires(); this.stepDecoys();
    this.lag.record(this.tick, [...this.players.values()].filter(p => p.alive));

    // ---- round end conditions
    if (this.phase === 'live') {
      const alive = { TERRORIST: 0, COUNTER_TERRORIST: 0 };
      for (const p of this.players.values()) if (p.alive) alive[p.team]++;
      if (this.bomb.state === 'planted' && this.tick >= this.bomb.explodeTick) this.explodeBomb();
      else if (alive.COUNTER_TERRORIST === 0) this.endRound('TERRORIST', 'elimination');
      else if (alive.TERRORIST === 0 && this.bomb.state !== 'planted') this.endRound('COUNTER_TERRORIST', 'elimination');
      else if (this.tick >= this.phaseEnd && this.bomb.state !== 'planted') this.endRound('COUNTER_TERRORIST', 'time');
    }
    const ms = performance.now() - started;
    this.stats.stepMs += (ms - this.stats.stepMs) * 0.02; this.stats.steps++;
  }

  // ---------------------------------------------------------------------------------------- snapshots
  compactChar(c) { return { x: +c.x.toFixed(3), y: +c.y.toFixed(3), z: +c.z.toFixed(3), vx: +c.vx.toFixed(3), vy: +c.vy.toFixed(3), vz: +c.vz.toFixed(3), yaw: +c.yaw.toFixed(4), pitch: +c.pitch.toFixed(4), crouch: +c.crouch.toFixed(3), grounded: c.grounded }; }
  snapshot(viewerId) {
    const viewer = this.players.get(viewerId);
    const remaining = Math.max(0, (this.phaseEnd - this.tick) / TICK_RATE);
    const events = this.events.filter(e => {
      if (e.tick < this.tick - TICK_RATE) return false;
      if (e.type === 'footstep' || e.type === 'land' || e.type === 'jump' || e.type === 'weaponSound') {
        if (!viewer || e.who === viewerId) return false;
        return Math.hypot(e.x - viewer.char.x, e.z - viewer.char.z) < 45;
      }
      return true;
    });
    return {
      code: this.code, mapId: this.map.id, tick: this.tick, epoch: this.epoch, round: this.round, phase: this.phase, remaining, host: this.host,
      scores: this.scores, side: this.side, half: this.round > RULES.halfRounds ? 2 : 1, result: this.result, practice: this.practice,
      bomb: { state: this.bomb.state, carrier: this.bomb.carrier, x: this.bomb.x, y: this.bomb.y, z: this.bomb.z, site: this.bomb.site, remaining: this.bomb.state === 'planted' ? Math.max(0, (this.bomb.explodeTick - this.tick) / TICK_RATE) : 0 },
      grenades: this.grenades.map(g => ({ id: g.id, type: g.type, x: +g.x.toFixed(2), y: +g.y.toFixed(2), z: +g.z.toFixed(2) })),
      drops: this.drops.map(d => ({ id: d.id, weapon: d.weapon, x: +d.x.toFixed(2), y: +d.y.toFixed(2), z: +d.z.toFixed(2), yaw: +d.yaw.toFixed(2) })),
      fires: this.fires.map(f => ({ id: f.id, type: f.type, x: f.x, y: f.y, z: f.z, radius: f.radius, age: (this.tick - f.start) / TICK_RATE, left: (f.end - this.tick) / TICK_RATE })),
      smokes: this.smokes.map(s => ({ id: s.id, x: s.x, y: s.y, z: s.z, radius: s.radius, age: (this.tick - s.start) / TICK_RATE, left: (s.end - this.tick) / TICK_RATE })),
      events,
      players: [...this.players.values()].map(p => {
        const mine = p.id === viewerId, mate = viewer && viewer.team === p.team;
        const base = { id: p.id, name: p.name, team: p.team, bot: p.bot, alive: p.alive, life: p.life, kills: p.kills, deaths: p.deaths, assists: p.assists, ack: p.ack,
          char: mine ? { ...p.char, x: +p.char.x.toFixed(4), y: +p.char.y.toFixed(4), z: +p.char.z.toFixed(4) } : this.compactChar(p.char), weapon: p.inv.weaponId(), money: mate || mine ? p.money : undefined,
          health: mate || mine || !p.alive ? p.health : undefined, armor: mine ? p.armor : undefined, flashed: p.flashUntil > this.tick, rtt: Math.round(p.rtt) };
        if (mine) Object.assign(base, { inv: p.inv.toJSON(), helmet: p.helmet, kit: p.kit, action: p.action, flashLeft: Math.max(0, (p.flashUntil - this.tick) / TICK_RATE) });
        return base;
      }),
    };
  }
}
