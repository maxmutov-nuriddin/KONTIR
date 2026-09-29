// WeaponManager: client-side inventory (5 slots), 'Q' quick-switch history buffer, first-person weapon rigs,
// draw / fire / reload / melee / grenade animation, CS recoil view-punch and the muzzle flash.
// The rules run in shared/Inventory (identical to the server), this class adds prediction hooks and visuals.
import * as THREE from 'three';
import { disposeTree } from './src/dispose.js';
import { Inventory } from '../shared/inventory.js';
import { GRENADES, SLOT, WEAPONS } from '../shared/weapons.js';
import { DT } from '../shared/constants.js';
import { buildArms, buildWeaponRig, poseArms } from './src/viewmodels.js';

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// resting pose of each rig inside the view space (metres, radians)
const REST = {
  ak47: { p: [0.1, -0.1, -0.5], r: [0.04, 0.05, 0.0], s: 0.85 }, galil: { p: [0.1, -0.1, -0.5], r: [0.04, 0.05, 0.0], s: 0.85 },
  m4a4: { p: [0.1, -0.105, -0.48], r: [0.04, 0.05, 0.0], s: 0.85 }, famas: { p: [0.1, -0.1, -0.48], r: [0.04, 0.05, 0.0], s: 0.85 }, awp: { p: [0.1, -0.11, -0.5], r: [0.04, 0.05, 0.0], s: 0.85 },
  deagle: { p: [0.09, -0.085, -0.33], r: [0.03, 0.04, 0.0] }, glock: { p: [0.085, -0.082, -0.32], r: [0.03, 0.04, 0.0] }, usp: { p: [0.085, -0.082, -0.32], r: [0.03, 0.04, 0.0] },
  knife: { p: [0.14, -0.13, -0.4], r: [-0.25, 0.5, 0.45] }, he: { p: [0.11, -0.11, -0.36], r: [0.1, 0.0, 0.0] },
  flash: { p: [0.11, -0.11, -0.36], r: [0.1, 0.0, 0.0] }, smoke: { p: [0.11, -0.105, -0.36], r: [0.1, 0.0, 0.0] }, c4: { p: [0.04, -0.16, -0.4], r: [0.35, 0.0, 0.0] },
};

export class WeaponManager {
  /** @param {THREE.Scene} viewScene scene rendered by the dedicated viewmodel camera */
  constructor(viewScene, team = 'TERRORIST') {
    this.scene = viewScene; this.team = team;
    this.inventory = new Inventory(team);
    this.root = new THREE.Group(); this.root.name = 'viewmodel'; viewScene.add(this.root);
    this.rigs = new Map(); this.activeWeaponMesh = null; this.activeId = null;
    this.arms = buildArms(team); this.arms.traverse(o => { if (o.isMesh) o.castShadow = false; });
    this.kick = 0; this.melee = 0; this.throwT = 0; this.flashT = 0; this.punchVisual = { yaw: 0, pitch: 0 };
    this.drawSeen = -1; this.lastEvents = [];
    this.handlers = {};
    // muzzle flash: two crossed additive quads + a light that lives in the viewmodel scene
    const flashTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d'); const r = g.createRadialGradient(64, 64, 2, 64, 64, 62); r.addColorStop(0, 'rgba(255,255,235,1)'); r.addColorStop(0.25, 'rgba(255,214,120,.9)'); r.addColorStop(0.6, 'rgba(255,140,40,.35)'); r.addColorStop(1, 'rgba(255,90,10,0)'); g.fillStyle = r; g.fillRect(0, 0, 128, 128); g.strokeStyle = 'rgba(255,230,160,.85)'; g.lineWidth = 3; for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + Math.cos(a) * 62, 64 + Math.sin(a) * 62); g.stroke(); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    this.flash = new THREE.Group();
    const fm = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
    for (const rot of [0, Math.PI / 2]) { const q = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm); q.rotation.z = rot; this.flash.add(q); const s = new THREE.Mesh(new THREE.PlaneGeometry(0.2, 0.2), fm); s.rotation.set(0, Math.PI / 2, rot); this.flash.add(s); }
    this.flash.visible = false; this.flashLight = new THREE.PointLight(0xffb060, 0, 3, 2); this.flash.add(this.flashLight);
    this.setActive(this.inventory.weaponId());
  }

  // ----------------------------------------------------------------------------------------- slots / history
  get currentSlot() { return this.inventory.current; }
  get previousSlot() { return this.inventory.previous; }
  on(name, fn) { this.handlers[name] = fn; return this; }
  emit(name, data) { this.handlers[name]?.(data); }
  setTeam(team) {
    if (team === this.team) return;
    this.team = team; disposeTree(this.arms); this.arms = buildArms(team); this.inventory.team = team; this.setActive(this.activeId, true);
  }
  /** Mouse wheel: cycle to the next / previous owned slot. Returns the slot to request, or 0. */
  wheelSlot(dir) {
    const owned = [1, 2, 3, 4, 5].filter(s => this.inventory.has(s));
    if (owned.length < 2) return 0;
    const i = owned.indexOf(this.inventory.current);
    return owned[(i + (dir > 0 ? 1 : -1) + owned.length) % owned.length];
  }

  // ----------------------------------------------------------------------------------------- state sync
  /** Replace predicted state with the authoritative inventory (snapshot). */
  load(json) { this.inventory.load(json); this.setActive(this.inventory.weaponId()); }
  /** Runs one command through the shared state machine. `silent` suppresses animations during reconciliation replays. */
  predict(cmd, ctx, silent = false) {
    const before = this.inventory.weaponId();
    const events = this.inventory.step(cmd, ctx);
    if (this.inventory.weaponId() !== before || this.activeId !== this.inventory.weaponId()) this.setActive(this.inventory.weaponId());
    if (!silent) for (const e of events) this.react(e);
    return events;
  }
  react(e) {
    if (e.type === 'shot') { this.kick = Math.min(1.5, this.kick + 1); this.flashT = 0.055; this.emit('shot', e); }
    else if (e.type === 'melee') { this.melee = 1; this.emit('melee', e); }
    else if (e.type === 'throw') { this.throwT = 1; this.emit('throw', e); }
    else if (e.type === 'select' || e.type === 'quick') this.emit('draw', e);
    else if (e.type === 'reloadStart') this.emit('reload', e);
    else if (e.type === 'dryfire') this.emit('dry', e);
    else if (e.type === 'pin') this.emit('pin', e);
  }

  rig(id) {
    let r = this.rigs.get(id);
    if (!r) {
      r = buildWeaponRig(id); r.group.visible = false; r.group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
      this.root.add(r.group); this.rigs.set(id, r);
    }
    return r;
  }
  /** Toggle mesh visibility: activeWeaponMesh.visible = true, every other rig hidden. */
  setActive(id, force = false) {
    if (id === this.activeId && !force) return;
    for (const r of this.rigs.values()) r.group.visible = false;
    this.activeId = id; this.activeWeaponMesh = null;
    if (!id) return;
    const rig = this.rig(id); this.activeRig = rig;
    this.activeWeaponMesh = rig.group; rig.group.visible = true;
    poseArms(this.arms, rig); rig.group.add(this.arms);
    if (rig.muzzle) { this.flash.removeFromParent(); rig.muzzle.add(this.flash); }
    this.kick = 0; this.melee = 0; this.flashT = 0; this.flash.visible = false;
    const rest = REST[id] || REST.ak47; rig.group.position.set(...rest.p); rig.group.rotation.set(...rest.r); rig.group.scale.setScalar(rest.s || 1);
  }

  // ----------------------------------------------------------------------------------------- visuals
  /** Recoil displacement to add to the camera (radians); follows the shared pattern with a fast attack. */
  visualPunch(dt) {
    const target = this.inventory.punch(), w = this.inventory.weapon(), s = w?.viewKick ?? 1;
    const k = Math.min(1, dt * 46);
    this.punchVisual.yaw += (target.yaw * s - this.punchVisual.yaw) * k; this.punchVisual.pitch += (target.pitch * s - this.punchVisual.pitch) * k;
    return this.punchVisual;
  }
  /**
   * Applies rest pose + sway/bob (from PlayerController.viewmodel) + weapon animation.
   * @param {number} dt
   * @param {import('./PlayerController.js').ViewmodelDynamics} dyn
   */
  update(dt, dyn, { wallPush = 0 } = {}) {
    const rig = this.activeRig, group = this.activeWeaponMesh, inv = this.inventory;
    if (!rig || !group) { this.root.visible = false; return; }
    this.root.visible = true;
    const rest = REST[this.activeId] || REST.ak47, p = group.position, r = group.rotation;
    p.set(rest.p[0], rest.p[1], rest.p[2]); r.set(rest.r[0], rest.r[1], rest.r[2]);
    p.add(dyn.position); r.x += dyn.rotation.x; r.y += dyn.rotation.y; r.z += dyn.rotation.z;
    // draw / unholster
    const draw = inv.drawing ? ease(inv.drawProgress()) : 1, d = 1 - draw;
    p.y -= 0.3 * d; p.z += 0.06 * d; p.x += 0.07 * d; r.x -= 1.0 * d; r.z += 0.35 * d;
    // recoil kick (weapon slams back and pitches up), decays fast
    this.kick *= Math.exp(-dt * 19);
    const w = inv.weapon(), gun = w?.kind === 'gun';
    if (gun) { p.z += 0.03 * this.kick; p.y += 0.004 * this.kick; r.x += 0.055 * this.kick; r.z += Math.sin(this.kick * 9) * 0.006; }
    if (rig.parts.slide) rig.parts.slide.position.z = this.kick > 0.25 ? 0.035 * Math.min(1, this.kick) : 0;
    // reload choreography
    if (gun && inv.reloading) {
      const t = inv.reloadProgress(), tilt = ease(seg(t, 0.05, 0.2)) - ease(seg(t, 0.8, 0.97));
      r.z -= 0.5 * tilt; r.x += 0.22 * tilt; r.y += 0.25 * tilt; p.y -= 0.05 * tilt; p.x -= 0.03 * tilt;
      const out = ease(seg(t, 0.15, 0.32)) - ease(seg(t, 0.55, 0.72));
      if (rig.parts.mag) { rig.parts.mag.position.y = (rig.parts.mag.userData.y0 ??= rig.parts.mag.position.y) - 0.26 * out; rig.parts.mag.visible = out < 0.9; }
      const bolt = Math.sin(seg(t, 0.78, 0.92) * Math.PI);
      if (rig.parts.bolt) rig.parts.bolt.position.z = (rig.parts.bolt.userData.z0 ??= rig.parts.bolt.position.z) + 0.045 * bolt;
      if (rig.parts.slide) rig.parts.slide.position.z = 0.03 * bolt;
    } else if (rig.parts.mag) { rig.parts.mag.position.y = rig.parts.mag.userData.y0 ?? rig.parts.mag.position.y; rig.parts.mag.visible = true; if (rig.parts.bolt && rig.parts.bolt.userData.z0 !== undefined) rig.parts.bolt.position.z = rig.parts.bolt.userData.z0; }
    // knife swing
    this.melee = Math.max(0, this.melee - dt * 3.2);
    if (w?.kind === 'melee' && this.melee > 0) { const s = Math.sin((1 - this.melee) * Math.PI); r.z += -1.2 * s; r.y += 0.7 * s; r.x += 0.5 * s; p.x -= 0.12 * s; p.z -= 0.08 * s; }
    // grenade: pin pulled -> hold, release -> overhand throw
    if (w?.kind === 'grenade') {
      const pulled = inv.pin > 0;
      if (rig.parts.pin) rig.parts.pin.visible = !pulled && this.throwT <= 0;
      if (rig.parts.lever) rig.parts.lever.rotation.y = Math.PI + (pulled ? 0.5 : 0);
      this.throwT = Math.max(0, this.throwT - dt * 4.2);
      if (this.throwT > 0) { const s = Math.sin((1 - this.throwT) * Math.PI); r.x += -0.9 * s; p.z -= 0.16 * s; p.y += 0.06 * s; }
      if (pulled) { p.y += 0.012; p.x -= 0.006; }
    }
    // pushed back by nearby geometry so the barrel never pokes into walls
    if (wallPush > 0) { p.z += wallPush * 0.16; r.x += wallPush * 0.5; p.y -= wallPush * 0.03; }
    // muzzle flash
    this.flashT -= dt;
    const on = this.flashT > 0 && rig.muzzle;
    this.flash.visible = !!on;
    if (on) { const s = 0.7 + Math.random() * 0.7; this.flash.scale.setScalar(s); this.flash.rotation.z = Math.random() * 6.28; this.flashLight.intensity = 1.6 * (this.flashT / 0.055); } else this.flashLight.intensity = 0;
    // C4 display when planting
    void GRENADES;
    this.lastDt = dt;
  }

  /** HUD snapshot of the inventory (slots, ammo, state). */
  hud() {
    const inv = this.inventory, w = inv.weapon(), a = w?.kind === 'gun' ? inv.ammoOf(w.id) : null;
    return {
      weapon: w?.name || '', weaponId: w?.id || null, mag: a?.mag ?? null, reserve: a?.reserve ?? null, kind: w?.kind || null,
      slots: inv.view(), current: inv.current, previous: inv.previous, reloading: inv.reloading, reload: inv.reloadProgress(), drawing: inv.drawing, pin: inv.pin > 0,
      grenades: { ...inv.grenades },
    };
  }
}
export { SLOT, WEAPONS, DT };
