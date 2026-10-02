// Deterministic inventory / weapon state machine. The server runs it authoritatively; the client runs an
// identical copy (WeaponManager) for prediction and re-syncs it from every snapshot.
//
// Time base is `time`: one unit per 64 Hz simulation step, including neutral input during silence,
// so predicted and authoritative timers stay comparable without sharing a wall clock.
import { DT, TICK_RATE } from './constants.js';
import { GRENADES, MAX_GRENADES, SLOT, WEAPONS, samplePattern, secondsToTicks } from './weapons.js';

const ticks = seconds => secondsToTicks(seconds);

export class Inventory {
  constructor(team = 'TERRORIST') { this.team = team; this.reset(team); }

  /** New round / new half: standard loadout (pistol + knife). */
  reset(team = this.team) {
    this.team = team;
    // starting pistol: loadout preference (USP-S / P250 for CT, Glock / P250 for T), else the CS default
    const pref = this.preferred?.[team], allowed = team === 'COUNTER_TERRORIST' ? ['usp', 'p250'] : ['glock', 'p250'];
    const pistol = allowed.includes(pref) ? pref : allowed[0];
    this.slots = { 1: null, 2: pistol, 3: 'knife', 4: null, 5: null };
    this.ammo = { [pistol]: { mag: WEAPONS[pistol].mag, reserve: WEAPONS[pistol].reserve } };
    this.grenades = Object.fromEntries(GRENADES.map(g => [g, 0])); this.zoom = 0;
    this.util = null;
    this.current = 2; this.previous = 3;
    this.time = 0; this.drawUntil = 0; this.nextFire = 0; this.reloadUntil = 0; this.reloading = false;
    this.pin = 0; this.pinStrength = 1; this.lastFire = false; this.lastFire2 = false; this.lastReload = false; this.lastDrop = false;
    this.shots = 0; this.lastShot = -1e9; this.burst = 0; this.drawTicks = 1; this.reloadTicks = 1;
    this.silencerOff ||= {};                         // weapon id -> true when the player took the silencer off (kept between rounds)
    // weapon id -> { finish, wear } of a weapon picked up from someone else: it keeps its owner's skin.
    // No entry = the holder's own equipped skin (bought / spawned weapons).
    this.skins = {};
  }
  /** Silenced right now? (USP-S / M4A1-S unless the silencer was removed). */
  isSilenced(id) { const w = WEAPONS[id]; return !!w?.suppressed && !(w.detachable && this.silencerOff[id]); }

  // ---- queries -----------------------------------------------------------------------------------------
  has(slot) {
    if (slot === SLOT.UTILITY) return this.totalGrenades() > 0;
    return !!this.slots[slot];
  }
  totalGrenades() { let n = 0; for (const g of GRENADES) n += this.grenades[g] || 0; return n; }
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
  /** New round: every carried gun starts with a full magazine and full reserve. */
  refillAmmo() { for (const id of Object.keys(this.ammo)) { const w = WEAPONS[id]; if (w?.kind === 'gun' && Object.values(this.slots).includes(id)) this.ammo[id] = { mag: w.mag, reserve: w.reserve }; } }
  give(id, { select = false, ammo = null, skin } = {}) {
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
      if (skin) this.skins[id] = skin.model ? { finish: skin.finish, wear: skin.wear, model: skin.model } : { finish: skin.finish, wear: skin.wear }; else delete this.skins[id];
      if (displaced) delete this.skins[displaced];
      if (w.kind === 'gun') this.ammo[id] = ammo ? { mag: ammo.mag, reserve: ammo.reserve } : { mag: w.mag, reserve: w.reserve };
    }
    if (select) this.select(w.slot, { force: true });
    return displaced;
  }
  /** Removes the item from its slot (thrown grenade, planted C4, dropped weapon). */
  remove(id) {
    const w = WEAPONS[id];
    if (!w) return;
    if (w.kind === 'grenade') { this.grenades[id] = Math.max(0, this.grenades[id] - 1); if (this.grenades[id] === 0) this.util = GRENADES.find(g => this.grenades[g] > 0) || null; }
    else if (this.slots[w.slot] === id) { this.slots[w.slot] = w.slot === SLOT.MELEE ? id : null; if (w.slot !== SLOT.MELEE) delete this.skins[id]; }
    if (!this.has(this.current) || (this.weaponId() === null)) this.select(this.fallbackSlot(), { force: true });
  }
  /** 'G': throws the held gun (with its ammo) or the C4. Knife and grenades stay. Returns the event or null. */
  drop() {
    const id = this.weaponId(), w = id ? WEAPONS[id] : null;
    if (!w || (w.kind !== 'gun' && w.kind !== 'objective') || this.pin) return null;
    const ammo = w.kind === 'gun' ? { ...this.ammoOf(id) } : null, skin = this.skins[id] || null;
    this.slots[w.slot] = null; delete this.ammo[id]; delete this.skins[id]; this.reloading = false;
    this.select(this.fallbackSlot(), { force: true });
    return { type: 'drop', weapon: id, ammo, skin };
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
    this.reloading = false; this.pin = 0; this.shots = 0; this.burst = 0; this.zoom = 0;
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

    if (cmd.drop && !this.lastDrop) { const d = this.drop(); if (d) events.push(d); }
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
    if (!ctx.canFire) this.pin = 0;
    const ready = this.time >= this.drawUntil;
    const fireEdge = cmd.fire && !this.lastFire, fire2Edge = cmd.fire2 && !this.lastFire2;

    if (w.kind === 'gun') {
      const a = this.ammo[w.id];
      const wantsReload = (cmd.reload && !this.lastReload) || (cmd.fire && a.mag === 0 && a.reserve > 0 && fireEdge);
      if (wantsReload && ready && !this.reloading && a.mag < w.mag && a.reserve > 0) {
        this.reloading = true; this.reloadTicks = ticks(w.reload); this.reloadUntil = this.time + this.reloadTicks; this.shots = 0; this.burst = 0; this.zoom = 0;
        events.push({ type: 'reloadStart', weapon: w.id });
      } else if (w.detachable && fire2Edge && ready && !this.reloading) {
        // RMB on a USP-S / M4A1-S screws the silencer off / on (the weapon is busy meanwhile)
        this.silencerOff[w.id] = !this.silencerOff[w.id]; this.drawTicks = ticks(w.silencerTime); this.drawUntil = this.time + this.drawTicks;
        events.push({ type: 'silencer', weapon: w.id, on: !this.silencerOff[w.id] });
      } else if (w.scope && fire2Edge && ready && !this.reloading) {
        this.zoom = (this.zoom + 1) % (w.scope.length + 1);
        events.push({ type: 'zoom', weapon: w.id, level: this.zoom });
      } else if (cmd.fire && ctx.canFire && ready && !this.reloading && this.time >= this.nextFire && (w.auto || fireEdge)) {
        if (a.mag > 0) {
          if (this.time - this.lastShot > ticks(w.recoilDelay + 0.05)) this.burst = 0;
          const punch = samplePattern(w, this.shots);
          a.mag--;
          events.push({ type: 'shot', weapon: w.id, index: Math.floor(this.shots), punch, burst: this.burst, zoom: this.zoom, silenced: this.isSilenced(w.id) });
          this.shots = Math.min(w.recoilTable.length - 1, this.shots + 1); this.burst++;
          this.lastShot = this.time; this.nextFire = this.time + ticks(w.interval);
          if (w.unzoomOnShot) this.zoom = 0;
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
    this.lastDrop = !!cmd.drop;
    this.lastFire = cmd.fire; this.lastFire2 = cmd.fire2; this.lastReload = cmd.reload;
    return events;
  }

  /** Round start for survivors: keep the loadout, restart every timer. */
  resetTimers() {
    this.time = 0; this.drawUntil = 0; this.nextFire = 0; this.reloadUntil = 0; this.reloading = false; this.pin = 0;
    this.lastFire = false; this.lastFire2 = false; this.lastReload = false; this.shots = 0; this.lastShot = -1e9; this.burst = 0; this.zoom = 0;
    if (!this.has(this.current)) this.current = this.fallbackSlot();
  }

  // ---- serialisation -----------------------------------------------------------------------------------
  toJSON() {
    return {
      team: this.team, slots: { ...this.slots }, ammo: JSON.parse(JSON.stringify(this.ammo)), grenades: { ...this.grenades }, util: this.util,
      current: this.current, previous: this.previous, time: this.time, drawUntil: this.drawUntil, drawTicks: this.drawTicks || 1, nextFire: this.nextFire,
      reloadUntil: this.reloadUntil, reloadTicks: this.reloadTicks || 1, reloading: this.reloading, pin: this.pin, pinStrength: this.pinStrength,
      lastFire: this.lastFire, lastFire2: this.lastFire2, lastReload: this.lastReload, lastDrop: !!this.lastDrop, shots: this.shots, lastShot: this.lastShot, burst: this.burst, zoom: this.zoom, silencerOff: { ...(this.silencerOff || {}) }, skins: JSON.parse(JSON.stringify(this.skins || {})),
    };
  }
  load(json) { const preferred = this.preferred; Object.assign(this, JSON.parse(JSON.stringify(json))); if (preferred) this.preferred = preferred; return this; }
  static from(json) { return new Inventory(json.team).load(json); }
}

export { TICK_RATE };
