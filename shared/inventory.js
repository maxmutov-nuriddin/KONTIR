// Deterministic inventory / weapon state machine. The server runs it authoritatively; the client runs an
// identical copy (WeaponManager) for prediction and re-syncs it from every snapshot.
//
// Time base is `time`: one unit per processed command (== one 64 Hz tick while the command queue is fed),
// so predicted and authoritative timers stay comparable without sharing a wall clock.
import { DT, TICK_RATE } from './constants.js';
import { GRENADES, MAX_GRENADES, SLOT, WEAPONS, samplePattern, secondsToTicks } from './weapons.js';

const ticks = seconds => secondsToTicks(seconds);

export class Inventory {
  constructor(team = 'TERRORIST') { this.team = team; this.reset(team); }

  /** New round / new half: standard loadout (pistol + knife). */
  reset(team = this.team) {
    this.team = team;
    this.slots = { 1: null, 2: 'glock', 3: 'knife', 4: null, 5: null };
    this.ammo = { glock: { mag: WEAPONS.glock.mag, reserve: WEAPONS.glock.reserve } };
    this.grenades = { he: 0, flash: 0, smoke: 0 };
    this.util = null;
    this.current = 2; this.previous = 3;
    this.time = 0; this.drawUntil = 0; this.nextFire = 0; this.reloadUntil = 0; this.reloading = false;
    this.pin = 0; this.pinStrength = 1; this.lastFire = false; this.lastFire2 = false; this.lastReload = false;
    this.shots = 0; this.lastShot = -1e9; this.burst = 0; this.drawTicks = 1; this.reloadTicks = 1;
  }

  // ---- queries -----------------------------------------------------------------------------------------
  has(slot) {
    if (slot === SLOT.UTILITY) return this.totalGrenades() > 0;
    return !!this.slots[slot];
  }
  totalGrenades() { return this.grenades.he + this.grenades.flash + this.grenades.smoke; }
  weaponId(slot = this.current) {
    if (slot === SLOT.UTILITY) return this.util && this.grenades[this.util] > 0 ? this.util : null;
    return this.slots[slot] || null;
  }
  weapon(slot = this.current) { const id = this.weaponId(slot); return id ? WEAPONS[id] : null; }
  ammoOf(id) { return this.ammo[id] || { mag: 0, reserve: 0 }; }
  get drawing() { return this.time < this.drawUntil; }
  get canAct() { return this.time >= this.drawUntil; }
  drawProgress() { return this.drawing ? 1 - (this.drawUntil - this.time) / this.drawTicks : 1; }
  reloadProgress() { return this.reloading ? 1 - (this.reloadUntil - this.time) / this.reloadTicks : 0; }
  /** Current recoil displacement (radians) as it would be applied to the next bullet / view. */
  punch() { const w = this.weapon(); return w && w.kind === 'gun' ? samplePattern(w, this.shots) : { yaw: 0, pitch: 0 }; }
  view() {
    return [1, 2, 3, 4, 5].map(slot => {
      const id = this.weaponId(slot), w = id ? WEAPONS[id] : null;
      return { slot, id, name: w?.name || '', active: slot === this.current, ammo: id ? this.ammoOf(id) : null,
        count: slot === 4 ? { ...this.grenades } : null };
    });
  }

  // ---- mutations ---------------------------------------------------------------------------------------
  /** Adds a weapon. Returns the id it displaced (primary / secondary), or null. */
  give(id, { select = false } = {}) {
    const w = WEAPONS[id];
    if (!w) return null;
    let displaced = null;
    if (w.kind === 'grenade') {
      if (this.grenades[id] >= w.max || this.totalGrenades() >= MAX_GRENADES) return null;
      this.grenades[id]++;
      if (!this.util || this.grenades[this.util] === 0) this.util = id;
    } else {
      displaced = this.slots[w.slot] && this.slots[w.slot] !== id ? this.slots[w.slot] : null;
      this.slots[w.slot] = id;
      if (w.kind === 'gun') this.ammo[id] = { mag: w.mag, reserve: w.reserve };
    }
    if (select) this.select(w.slot, { force: true });
    return displaced;
  }
  /** Removes the item from its slot (thrown grenade, planted C4, dropped weapon). */
  remove(id) {
    const w = WEAPONS[id];
    if (!w) return;
    if (w.kind === 'grenade') { this.grenades[id] = Math.max(0, this.grenades[id] - 1); if (this.grenades[id] === 0) this.util = GRENADES.find(g => this.grenades[g] > 0) || null; }
    else if (this.slots[w.slot] === id) this.slots[w.slot] = w.slot === SLOT.MELEE ? id : null;
    if (!this.has(this.current) || (this.weaponId() === null)) this.select(this.fallbackSlot(), { force: true });
  }
  fallbackSlot() {
    if (this.previous !== this.current && this.has(this.previous)) return this.previous;
    for (const slot of [1, 2, 3]) if (this.has(slot)) return slot;
    return SLOT.MELEE;
  }

  /** Holsters the current item and draws `slot`. Slot 4 pressed again cycles HE -> Flash -> Smoke. */
  select(slot, { force = false } = {}) {
    if (!Number.isInteger(slot) || slot < 1 || slot > 5 || !this.has(slot)) return false;
    if (slot === SLOT.UTILITY) {
      const owned = GRENADES.filter(g => this.grenades[g] > 0);
      if (this.current === SLOT.UTILITY && !force) {
        if (owned.length < 2) return false;
        this.util = owned[(owned.indexOf(this.util) + 1) % owned.length];
      } else if (!this.util || this.grenades[this.util] === 0) this.util = owned[0];
    } else if (slot === this.current && !force) return false;
    if (slot !== this.current) { this.previous = this.current; this.current = slot; }
    this.beginDraw();
    return true;
  }
  /** 'Q': alternate between the current and previous slots (falls back when the previous item is gone). */
  quickSwitch() {
    let target = this.previous;
    if (target === this.current || !this.has(target)) target = this.fallbackSlot();
    if (target === this.current || !this.has(target)) return false;
    const old = this.current;
    this.current = target; this.previous = old;
    if (target === SLOT.UTILITY && (!this.util || this.grenades[this.util] === 0)) this.util = GRENADES.find(g => this.grenades[g] > 0);
    this.beginDraw();
    return true;
  }
  beginDraw() {
    const w = this.weapon();
    this.drawTicks = ticks((w?.drawTime ?? 500) / 1000);
    this.drawUntil = this.time + this.drawTicks;
    this.nextFire = Math.max(this.nextFire, this.drawUntil);
    this.reloading = false; this.pin = 0; this.shots = 0; this.burst = 0;
  }

  // ---- per-command step --------------------------------------------------------------------------------
  /**
   * @param {object} cmd  input command (fire, fire2, reload, slot, quick)
   * @param {{canFire:boolean}} ctx server/client shared gating (phase live, alive)
   * @returns {Array<object>} events: select | quick | reloadStart | reloaded | shot | dryfire | melee | throw
   */
  step(cmd, ctx = { canFire: true }) {
    const events = [];
    this.time++;
    if (cmd.slot && this.select(cmd.slot)) events.push({ type: 'select', slot: this.current, weapon: this.weaponId() });
    else if (cmd.quick && this.quickSwitch()) events.push({ type: 'quick', slot: this.current, weapon: this.weaponId() });

    const w = this.weapon();
    // recoil recovery: after `recoilDelay` without firing the pattern index bleeds back to zero
    if (this.shots > 0 && w && this.time - this.lastShot > ticks(w.recoilDelay || 0.2)) {
      this.shots = Math.max(0, this.shots - (w.recoilRate || 6) * DT);
      if (this.shots === 0) this.burst = 0;
    }
    if (!w) return this.finish(cmd, events);

    if (this.reloading && this.time >= this.reloadUntil) {
      const a = this.ammo[w.id], take = Math.min(w.mag - a.mag, a.reserve);
      a.mag += take; a.reserve -= take; this.reloading = false;
      events.push({ type: 'reloaded', weapon: w.id });
    }
    const ready = this.time >= this.drawUntil;
    const fireEdge = cmd.fire && !this.lastFire, fire2Edge = cmd.fire2 && !this.lastFire2;

    if (w.kind === 'gun') {
      const a = this.ammo[w.id];
      const wantsReload = (cmd.reload && !this.lastReload) || (cmd.fire && a.mag === 0 && a.reserve > 0 && fireEdge);
      if (wantsReload && ready && !this.reloading && a.mag < w.mag && a.reserve > 0) {
        this.reloading = true; this.reloadTicks = ticks(w.reload); this.reloadUntil = this.time + this.reloadTicks; this.shots = 0; this.burst = 0;
        events.push({ type: 'reloadStart', weapon: w.id });
      } else if (cmd.fire && ctx.canFire && ready && !this.reloading && this.time >= this.nextFire && (w.auto || fireEdge)) {
        if (a.mag > 0) {
          if (this.time - this.lastShot > ticks(w.recoilDelay + 0.05)) this.burst = 0;
          const punch = samplePattern(w, this.shots);
          a.mag--;
          events.push({ type: 'shot', weapon: w.id, index: Math.floor(this.shots), punch, burst: this.burst });
          this.shots = Math.min(w.recoilTable.length - 1, this.shots + 1); this.burst++;
          this.lastShot = this.time; this.nextFire = this.time + ticks(w.interval);
        } else if (fireEdge) { events.push({ type: 'dryfire', weapon: w.id }); this.nextFire = this.time + ticks(0.25); }
      }
    } else if (w.kind === 'melee') {
      if (ctx.canFire && ready && this.time >= this.nextFire && (cmd.fire || cmd.fire2)) {
        const stab = !cmd.fire && cmd.fire2;
        events.push({ type: 'melee', weapon: w.id, kind: stab ? 'stab' : 'slash' });
        this.nextFire = this.time + ticks(stab ? w.stabInterval : w.interval);
      }
    } else if (w.kind === 'grenade') {
      if (!this.pin && ctx.canFire && ready && this.time >= this.nextFire && (fireEdge || fire2Edge)) {
        this.pin = this.time; this.pinStrength = fireEdge ? 1 : 0.4;
        events.push({ type: 'pin', weapon: w.id });
      } else if (this.pin && (!cmd.fire && !cmd.fire2)) {
        events.push({ type: 'throw', weapon: w.id, strength: this.pinStrength });
        this.pin = 0; this.nextFire = this.time + ticks(0.6);
        this.remove(w.id);
        if (this.weaponId() === w.id && this.current === SLOT.UTILITY) this.beginDraw();
      }
    }
    return this.finish(cmd, events);
  }
  finish(cmd, events) {
    this.lastFire = cmd.fire; this.lastFire2 = cmd.fire2; this.lastReload = cmd.reload;
    return events;
  }

  /** Round start for survivors: keep the loadout, restart every timer. */
  resetTimers() {
    this.time = 0; this.drawUntil = 0; this.nextFire = 0; this.reloadUntil = 0; this.reloading = false; this.pin = 0;
    this.lastFire = false; this.lastFire2 = false; this.lastReload = false; this.shots = 0; this.lastShot = -1e9; this.burst = 0;
    if (!this.has(this.current)) this.current = this.fallbackSlot();
  }

  // ---- serialisation -----------------------------------------------------------------------------------
  toJSON() {
    return {
      team: this.team, slots: { ...this.slots }, ammo: JSON.parse(JSON.stringify(this.ammo)), grenades: { ...this.grenades }, util: this.util,
      current: this.current, previous: this.previous, time: this.time, drawUntil: this.drawUntil, drawTicks: this.drawTicks || 1, nextFire: this.nextFire,
      reloadUntil: this.reloadUntil, reloadTicks: this.reloadTicks || 1, reloading: this.reloading, pin: this.pin, pinStrength: this.pinStrength,
      lastFire: this.lastFire, lastFire2: this.lastFire2, lastReload: this.lastReload, shots: this.shots, lastShot: this.lastShot, burst: this.burst,
    };
  }
  load(json) { Object.assign(this, JSON.parse(JSON.stringify(json))); return this; }
  static from(json) { return new Inventory(json.team).load(json); }
}

export { TICK_RATE };
