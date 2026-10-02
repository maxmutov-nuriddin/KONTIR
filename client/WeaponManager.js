// WeaponManager: client-side inventory (5 slots), 'Q' quick-switch history buffer, first-person weapon rigs,
// draw / fire / reload / melee / grenade animation, CS recoil view-punch and the muzzle flash.
// The rules run in shared/Inventory (identical to the server), this class adds prediction hooks and visuals.
import * as THREE from 'three';
import { disposeTree } from './src/dispose.js';
import { Inventory } from '../shared/inventory.js';
import { GRENADES, SLOT, WEAPONS } from '../shared/weapons.js';
import { DT } from '../shared/constants.js';
import { buildArms, buildWeaponRig, poseArms, weaponMaterials } from './src/viewmodels.js';
import { applyFinish, applyGloveFinish } from './src/finishes.js';
import { aimSleeve } from './src/hands.js';
import { cuesFor, reloadStyle } from './src/reload.js';

const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const seg = (t, a, b) => Math.min(1, Math.max(0, (t - a) / (b - a)));

// resting pose of each rig inside the view space (metres, radians)
const REST = {
  ak47: { p: [0.1, -0.1, -0.5], r: [0.04, 0.05, 0.0], s: 0.85 }, galil: { p: [0.1, -0.1, -0.5], r: [0.04, 0.05, 0.0], s: 0.85 },
  m4a4: { p: [0.1, -0.105, -0.48], r: [0.04, 0.05, 0.0], s: 0.85 }, famas: { p: [0.1, -0.1, -0.48], r: [0.04, 0.05, 0.0], s: 0.85 }, awp: { p: [0.105, -0.115, -0.56], r: [0.04, 0.05, 0.0], s: 0.82 },
  deagle: { p: [0.075, -0.1, -0.42], r: [0.02, 0.05, 0.0] }, glock: { p: [0.075, -0.105, -0.4], r: [0.02, 0.05, 0.0] }, usp: { p: [0.075, -0.105, -0.4], r: [0.02, 0.05, 0.0] },
  m4a1s: { p: [0.1, -0.105, -0.5], r: [0.04, 0.05, 0.0], s: 0.82 }, aug: { p: [0.1, -0.1, -0.44], r: [0.04, 0.05, 0.0], s: 0.85 }, sg553: { p: [0.1, -0.1, -0.5], r: [0.04, 0.05, 0.0], s: 0.85 },
  ump45: { p: [0.1, -0.1, -0.44], r: [0.04, 0.05, 0.0], s: 0.92 }, p90: { p: [0.1, -0.1, -0.4], r: [0.04, 0.05, 0.0], s: 0.9 }, mp7: { p: [0.1, -0.1, -0.42], r: [0.04, 0.05, 0.0], s: 0.95 },
  xm1014: { p: [0.1, -0.095, -0.5], r: [0.04, 0.05, 0.0], s: 0.82 }, mag7: { p: [0.1, -0.095, -0.46], r: [0.04, 0.05, 0.0], s: 0.85 }, sawedoff: { p: [0.1, -0.095, -0.44], r: [0.04, 0.05, 0.0], s: 0.9 },
  negev: { p: [0.105, -0.115, -0.52], r: [0.04, 0.05, 0.0], s: 0.8 }, cz75: { p: [0.075, -0.105, -0.4], r: [0.02, 0.05, 0.0] }, r8: { p: [0.075, -0.1, -0.42], r: [0.02, 0.05, 0.0] },
  mp9: { p: [0.1, -0.1, -0.44], r: [0.04, 0.05, 0.0], s: 0.95 }, mac10: { p: [0.1, -0.1, -0.44], r: [0.04, 0.05, 0.0], s: 0.95 },
  nova: { p: [0.1, -0.095, -0.5], r: [0.04, 0.05, 0.0], s: 0.82 }, ssg08: { p: [0.105, -0.115, -0.54], r: [0.04, 0.05, 0.0], s: 0.82 },
  p250: { p: [0.075, -0.105, -0.4], r: [0.02, 0.05, 0.0] }, fiveseven: { p: [0.075, -0.105, -0.4], r: [0.02, 0.05, 0.0] }, tec9: { p: [0.075, -0.105, -0.4], r: [0.02, 0.05, 0.0] },
  molotov: { p: [0.12, -0.135, -0.45], r: [0.12, 0.0, 0.0] }, incendiary: { p: [0.12, -0.135, -0.45], r: [0.12, 0.0, 0.0] }, decoy: { p: [0.12, -0.135, -0.45], r: [0.12, 0.0, 0.0] },
  knife: { p: [0.14, -0.13, -0.4], r: [0.15, 0.5, 0.45] }, he: { p: [0.12, -0.135, -0.45], r: [0.12, 0.0, 0.0] },
  flash: { p: [0.12, -0.135, -0.45], r: [0.12, 0.0, 0.0] }, smoke: { p: [0.12, -0.135, -0.45], r: [0.12, 0.0, 0.0] }, c4: { p: [0.04, -0.16, -0.4], r: [0.35, 0.0, 0.0] },
};

// left hand on a right-side charging handle: palm down over the receiver, fingers wrapping the knob from above
const BOLT_REACH = new THREE.Vector3(0.012, 0.03, 0.015);
const _q0 = new THREE.Quaternion(), _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
const FINGERS_DIR = new THREE.Vector3(0.75, -0.55, -0.35).normalize();
function overhandQ() {
  const roll = -Math.PI / 2;                     // fingers curl down onto the knob from above
  _qa.setFromUnitVectors(new THREE.Vector3(0, 0, -1), FINGERS_DIR);
  _qb.setFromAxisAngle(FINGERS_DIR, roll);
  return _qb.multiply(_qa);
}

export class WeaponManager {
  /** @param {THREE.Scene} viewScene scene rendered by the dedicated viewmodel camera */
  constructor(viewScene, team = 'TERRORIST') {
    this.scene = viewScene; this.team = team;
    this.inventory = new Inventory(team);
    this.root = new THREE.Group(); this.root.name = 'viewmodel'; viewScene.add(this.root);
    this.leftHanded = false; this.viewOffset = { x: 0, y: 0, z: 0 };
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
    // skins are equipped per side: repaint the gloves and every rig for the new team
    this.refreshFinish('gloves'); for (const [id, r] of this.rigs) this.paint(r, id);
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
  load(json) {
    this.inventory.load(json); this.setActive(this.inventory.weaponId());
    for (const [id, r] of this.rigs) if (r.skinKey !== this.skinKey(id)) this.paint(r, id);   // picked up / dropped: re-skin
  }
  /** Skin shown on weapon `id`: a picked-up gun keeps its owner's (inventory.skins), else the player's own for this side. */
  skinOf(id) {
    const carried = this.inventory.skins?.[id];
    return carried ? [carried.finish, carried.wear || 0] : [this.finishFor?.(id), this.wearFor?.(id) || 0];
  }
  skinKey(id) { const [f, w] = this.skinOf(id); return `${f || 'standard'}:${w}`; }
  paint(r, id) { const [f, w] = this.skinOf(id); applyFinish(r.group, f, weaponMaterials(), w); r.skinKey = this.skinKey(id); }
  /** Runs one command through the shared state machine. `silent` suppresses animations during reconciliation replays. */
  predict(cmd, ctx, silent = false) {
    const before = this.inventory.weaponId();
    const events = this.inventory.step(cmd, ctx);
    if (this.inventory.weaponId() !== before || this.activeId !== this.inventory.weaponId()) this.setActive(this.inventory.weaponId());
    if (!silent) for (const e of events) this.react(e);
    return events;
  }
  react(e) {
    if (e.type !== 'pin') this.inspectT = 0;   // any action cancels an inspect
    if (e.type === 'shot') { this.kick = Math.min(1.5, this.kick + 1); this.flashT = 0.055; this.emit('shot', e); }
    else if (e.type === 'melee') { this.melee = 1; this.emit('melee', e); }
    else if (e.type === 'throw') { this.throwT = 1; this.emit('throw', e); }
    else if (e.type === 'select' || e.type === 'quick') this.emit('draw', e);
    else if (e.type === 'reloadStart') {
      const w = WEAPONS[e.weapon], a = this.inventory.ammoOf(e.weapon);
      const full = a.mag === 0, shells = Math.max(1, Math.min(8, (w?.mag || 0) - a.mag));
      this.reloadAnim = { id: e.weapon, style: reloadStyle(e.weapon), full, shells, cues: cuesFor(e.weapon, { full, shells }), last: 0 };
      this.emit('reload', e);
    }
    else if (e.type === 'silencer') { this.silencerAnim = { id: e.weapon, on: e.on, t: 0, dur: WEAPONS[e.weapon]?.silencerTime || 1.5 }; this.emit('silencer', e); }
    else if (e.type === 'dryfire') this.emit('dry', e);
    else if (e.type === 'pin') this.emit('pin', e);
  }

  rig(id) {
    let r = this.rigs.get(id);
    if (!r) {
      r = buildWeaponRig(id); r.group.visible = false; r.group.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; o.frustumCulled = false; } });
      this.paint(r, id);
      this.root.add(r.group); this.rigs.set(id, r);
    }
    return r;
  }
  /** Re-applies the profile's finish after it changed in the inventory. */
  refreshFinish(id) {
    if (id === 'gloves') return applyGloveFinish(this.arms, this.finishFor?.('gloves'), this.wearFor?.('gloves') || 0);
    const r = this.rigs.get(id); if (r) this.paint(r, id);
  }
  /** Toggle mesh visibility: activeWeaponMesh.visible = true, every other rig hidden. */
  setActive(id, force = false) {
    if (id === this.activeId && !force) return;
    if (this.activeRig) this.animateReload(this.activeRig, -1);
    for (const r of this.rigs.values()) r.group.visible = false;
    this.activeId = id; this.activeWeaponMesh = null;
    if (!id) return;
    const rig = this.rig(id); this.activeRig = rig;
    this.activeWeaponMesh = rig.group; rig.group.visible = true;
    poseArms(this.arms, rig); rig.group.add(this.arms);
    if (rig.muzzle) { this.flash.removeFromParent(); rig.muzzle.add(this.flash); }
    this.kick = 0; this.melee = 0; this.flashT = 0; this.inspectT = 0; this.flash.visible = false;
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
    const S = this.silencerAnim?.id === this.activeId ? this.silencerAnim : null;
    const draw = inv.drawing && !S ? ease(inv.drawProgress()) : 1, d = 1 - draw;
    p.y -= 0.3 * d; p.z += 0.06 * d; p.x += 0.07 * d; r.x -= 1.0 * d; r.z += 0.35 * d;
    this.animateSilencer(rig, S, dt, p, r);
    // recoil kick (weapon slams back and pitches up), decays fast
    this.kick *= Math.exp(-dt * 19);
    const w = inv.weapon(), gun = w?.kind === 'gun';
    if (gun) { p.z += 0.03 * this.kick; p.y += 0.004 * this.kick; r.x += 0.055 * this.kick; r.z += Math.sin(this.kick * 9) * 0.006; }
    if (rig.parts.slide) rig.parts.slide.position.z = this.kick > 0.25 ? 0.035 * Math.min(1, this.kick) : 0;
    // reload choreography: the left hand really fetches the magazine (or shells), sounds fire on animation cues
    this.animateReload(rig, gun && inv.reloading ? inv.reloadProgress() : -1, p, r);
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
    // inspect: turn the weapon to show its left side, roll it over to show the right, return (3.4 s; knives spin)
    if (this.inspectT > 0) {
      if (inv.drawing || inv.reloading || inv.pin) this.inspectT = 0;
      else {
        this.inspectT += dt / 3.4;
        const t = Math.min(1, this.inspectT), a = ease(seg(t, 0.0, 0.2)) - ease(seg(t, 0.42, 0.58)), b = ease(seg(t, 0.46, 0.64)) - ease(seg(t, 0.84, 1.0));
        const lift = Math.sin(Math.PI * t);
        if (w?.kind === 'melee') {
          const spin = ease(seg(t, 0.25, 0.7)) * Math.PI * 2;
          r.y += 0.9 * lift; r.z += 0.6 * lift; r.x += 0.3 * lift; p.x -= 0.1 * lift; p.y += 0.05 * lift; p.z += 0.04 * lift;
          r.z += spin;
        } else {
          // side A: rotate so the ejection side faces the camera; side B: roll over to show the other flank
          r.y += 0.95 * a - 0.55 * b; r.z += 0.55 * a - 0.9 * b; r.x += 0.12 * a + 0.3 * b;
          p.x -= 0.09 * lift; p.y += 0.035 * lift; p.z += 0.07 * lift;
        }
        if (this.inspectT >= 1) this.inspectT = 0;
      }
    }
    // pushed back by nearby geometry so the barrel never pokes into walls
    if (wallPush > 0) { p.z += wallPush * 0.16; r.x += wallPush * 0.5; p.y -= wallPush * 0.03; }
    // muzzle flash
    this.flashT -= dt;
    const on = this.flashT > 0 && rig.muzzle;
    this.flash.visible = !!on;
    if (on && this.inventory.isSilenced(this.activeId)) { this.flash.visible = false; this.flashLight.intensity = 0.4 * (this.flashT / 0.055); }   // a can hides the flash
    else if (on) { const s = 0.7 + Math.random() * 0.7; this.flash.scale.setScalar(s); this.flash.rotation.z = Math.random() * 6.28; this.flashLight.intensity = 1.6 * (this.flashT / 0.055); } else this.flashLight.intensity = 0;
    // C4 display when planting
    void GRENADES;
    this.lastDt = dt;
  }

  /**
   * t in [0,1] while reloading, -1 otherwise (restores the rest pose). Moves the rig (tilt), the magazine / bolt / slide /
   * pump parts and the left hand in weapon space; the sleeve is re-aimed at the elbow every frame.
   */
  animateReload(rig, t, p, r) {
    const left = this.arms.userData.left, parts = rig.parts, R = this.reloadAnim;
    const mag = parts.mag, bolt = parts.bolt, slide = parts.slide, pump = parts.pump;
    if (mag) mag.userData.p0 ??= mag.position.clone();
    if (bolt) bolt.userData.p0 ??= bolt.position.clone();
    if (pump) pump.userData.p0 ??= pump.position.clone();
    if (t < 0 || !R || R.id !== this.activeId) {
      if (this.reloading) {
        this.reloading = false;
        if (mag) mag.position.copy(mag.userData.p0);
        if (bolt) bolt.position.copy(bolt.userData.p0);
        if (pump) pump.position.copy(pump.userData.p0);
        if (this.shell) this.shell.visible = false;
        if (left?.userData.rest) { left.position.copy(left.userData.rest.p); left.rotation.copy(left.userData.rest.r); aimSleeve(left); }
      }
      if (t < 0) this.reloadAnim = null;
      return;
    }
    this.reloading = true;
    // sound cues crossed since last frame
    for (const [at, kind] of R.cues) if (R.last < at && t >= at) this.emit('foley', { kind, weapon: R.id });
    R.last = t;
    const S = R.style, rest = left?.userData.rest; let handTurn = 0;
    const tilt = ease(seg(t, 0.0, 0.14)) - ease(seg(t, 0.86, 1.0));
    const hand = new THREE.Vector3().copy(rest?.p || new THREE.Vector3());
    const mix = (a, b, k) => hand.copy(a).lerp(b, k);
    if (S === 'shotgun') {
      // weapon rolls to expose the loading port; the hand shuttles shells from below into it
      r.z -= 0.55 * tilt; r.x += 0.12 * tilt; p.y -= 0.02 * tilt; p.x -= 0.02 * tilt;
      const port = new THREE.Vector3(0.0, -0.045, -0.02), below = new THREE.Vector3(-0.04, -0.2, 0.08);
      const n = R.shells, a = 0.12, b = 0.8, u = (t - a) / (b - a);
      if (!this.shell) { this.shell = new THREE.Mesh(new THREE.CylinderGeometry(0.0095, 0.0095, 0.062, 10).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x8e1d17, roughness: 0.5 })); this.shell.add(new THREE.Mesh(new THREE.CylinderGeometry(0.0098, 0.0098, 0.014, 10).rotateX(Math.PI / 2).translate(0, 0, 0.024), new THREE.MeshStandardMaterial({ color: 0xc9a24e, metalness: 1, roughness: 0.3 }))); }
      if (this.shell.parent !== left) left.add(this.shell);
      if (u >= 0 && u < 1) {
        const k = (u * n) % 1;                                     // 0..1 within one shell cycle
        const go = ease(seg(k, 0.0, 0.45)), push = ease(seg(k, 0.45, 0.8)), back = ease(seg(k, 0.8, 1));
        hand.copy(rest.p).lerp(below, 1 - go).lerp(port, go * (1 - back)); hand.z -= 0.03 * push;
        this.shell.visible = k < 0.8; this.shell.position.set(0.0, -0.02, -0.06);
      } else { this.shell.visible = false; hand.copy(rest.p).lerp(below, ease(seg(t, 0.02, 0.12)) - ease(seg(t, 0.8, 0.9))); }
      if (pump && R.full) pump.position.z = pump.userData.p0.z + 0.085 * (ease(seg(t, 0.84, 0.88)) - ease(seg(t, 0.9, 0.94)));
      if (R.full) { const pk = ease(seg(t, 0.84, 0.88)) - ease(seg(t, 0.9, 0.94)); hand.z += 0.085 * pk; }
    } else if (S === 'pistol' || S === 'revolver') {
      r.z -= 0.25 * tilt; r.x += 0.28 * tilt; p.y -= 0.01 * tilt;
      const magOut = mag ? new THREE.Vector3(0, -0.34, 0.08) : null;
      // old mag drops free, the support hand brings a fresh one up into the grip and slaps it home
      if (mag) {
        const drop = ease(seg(t, 0.12, 0.3)), rise = ease(seg(t, 0.42, 0.6)), seat = ease(seg(t, 0.6, 0.64));
        const d = new THREE.Vector3().copy(magOut).multiplyScalar(t < 0.36 ? drop : 1 - rise).addScaledVector(new THREE.Vector3(0, 0.02, 0), -(1 - seat) * (t > 0.6 ? 1 : 0));
        mag.position.copy(mag.userData.p0).add(d);
      }
      const grab = new THREE.Vector3().copy(mag?.userData.p0 || rest.p).add(new THREE.Vector3(-0.02, -0.05, 0.01));
      const k1 = ease(seg(t, 0.14, 0.34)), k2 = ease(seg(t, 0.4, 0.62)), k3 = ease(seg(t, 0.68, 0.9));
      if (t < 0.38) mix(rest.p, new THREE.Vector3().copy(grab).add(magOut), k1);
      else if (t < 0.66) mix(new THREE.Vector3().copy(grab).add(magOut), grab, k2);
      else mix(grab, rest.p, k3);
      if (slide) slide.position.z = R.full ? (t < 0.74 ? 0.035 : 0.035 * (1 - ease(seg(t, 0.74, 0.77)))) : 0;
    } else {
      // rifle / smg / bolt-action: tilt, grab the mag, pull it out of view, bring the new one, seat it, cycle the action
      r.z -= 0.42 * tilt; r.x += 0.2 * tilt; r.y += 0.2 * tilt; p.y -= 0.035 * tilt; p.x -= 0.025 * tilt;
      const out = new THREE.Vector3(-0.03, -0.36, 0.14), m0 = mag?.userData.p0 || new THREE.Vector3(0, -0.04, -0.05);
      const grip = new THREE.Vector3().copy(m0).add(new THREE.Vector3(-0.022, -0.1, 0.0));
      const pull = ease(seg(t, 0.22, 0.38)), back = ease(seg(t, 0.46, 0.6)), seat = ease(seg(t, 0.6, 0.66));
      const disp = new THREE.Vector3();
      if (t < 0.42) disp.copy(out).multiplyScalar(pull); else disp.copy(out).multiplyScalar(1 - back).add(new THREE.Vector3(0, -0.02 * (1 - seat), 0));
      if (t < 0.2) mix(rest.p, grip, ease(seg(t, 0.06, 0.2)));
      else if (t < 0.66) hand.copy(grip).add(disp);
      if (mag) mag.position.copy(m0).add(t >= 0.2 && t < 0.66 ? disp : new THREE.Vector3());
      if (t >= 0.62 && t < 0.68) { p.y += 0.006 * Math.sin(seg(t, 0.62, 0.68) * Math.PI); }           // seating jolt
      const cyc = R.full || S === 'bolt';
      // the support hand reaches OVER the receiver and pulls the right-side handle palm-down (not through the gun)
      const boltPt = new THREE.Vector3().copy(bolt?.userData.p0 || grip).add(BOLT_REACH);
      if (t >= 0.66) {
        if (cyc) {
          let k;
          if (t < 0.76) { k = ease(seg(t, 0.66, 0.76)); mix(grip, boltPt, k); hand.y += 0.05 * Math.sin(k * Math.PI); }   // arc over the top
          else if (t < 0.9) { k = 1; hand.copy(boltPt); const pb = ease(seg(t, 0.78, 0.82)) - ease(seg(t, 0.85, 0.87)); hand.z += 0.05 * pb; if (bolt) bolt.position.z = bolt.userData.p0.z + 0.05 * pb; }
          else { k = 1 - ease(seg(t, 0.9, 0.99)); mix(boltPt, rest.p, 1 - k); }
          handTurn = k;
        } else mix(grip, rest.p, ease(seg(t, 0.68, 0.86)));
      }
    }
    if (left?.visible && rest) {
      left.position.copy(hand);
      if (handTurn > 0) { _q0.setFromEuler(rest.r); left.quaternion.copy(_q0).slerp(overhandQ(), handTurn); } else left.rotation.copy(rest.r);
      aimSleeve(left);
    }
  }

  /** USP-S / M4A1-S: the weapon tilts toward the camera, the can is unscrewed (spins while sliding off the muzzle)
   *  and disappears from view, or comes back and screws on. Muzzle flash / sound follow the state. */
  animateSilencer(rig, S, dt, p, r) {
    const can = rig.parts.suppressor; if (!can) return;
    can.userData.p0 ??= can.position.clone();
    rig.muzzle.userData.z0 ??= rig.muzzle.position.z;
    const off = !!this.inventory.silencerOff?.[this.activeId];
    if (!S) { can.visible = !off; can.position.copy(can.userData.p0); can.rotation.z = 0; rig.muzzle.position.z = off && rig.bareMuzzleZ !== undefined ? rig.bareMuzzleZ : rig.muzzle.userData.z0; return; }
    S.t += dt; const k = Math.min(1, S.t / S.dur);
    if (k >= 1) { this.silencerAnim = null; return this.animateSilencer(rig, null, 0, p, r); }
    const tilt = ease(seg(k, 0, 0.18)) - ease(seg(k, 0.82, 1));
    r.y += 0.55 * tilt; r.z += 0.35 * tilt; p.x -= 0.05 * tilt; p.y += 0.02 * tilt;
    // removing: screw out (0.2..0.6), pull away (0.6..0.75); attaching: the reverse
    const u = S.on ? 1 - k : k, screw = seg(u, 0.2, 0.6), pull = ease(seg(u, 0.6, 0.75));
    can.visible = u < 0.75; can.rotation.z = screw * Math.PI * 6;
    can.position.copy(can.userData.p0); can.position.z -= 0.012 * screw + 0.12 * pull; can.position.x -= 0.05 * pull; can.position.y -= 0.04 * pull;
  }
  /** 'H': carry the weapon on the left or right side. The whole viewmodel (arms + weapon) is mirrored; three.js flips
   *  the face winding for a negative-scale node, so lighting and culling stay correct. */
  /** Viewmodel offset from Settings (cm-like steps): moves the whole arms + weapon rig. */
  setViewOffset({ x = 0, y = 0, z = 0 } = {}) { this.viewOffset = { x, y, z }; this.root.position.set(x * 0.01, y * 0.01, -z * 0.01); }
  setLeftHanded(on) { this.leftHanded = !!on; this.root.scale.x = this.leftHanded ? -1 : 1; return this.leftHanded; }
  /** 'F': weapon inspect (CS-style). Ignored while drawing, reloading, firing or holding a pulled grenade. */
  inspect() {
    const inv = this.inventory;
    if (!this.activeRig || inv.drawing || inv.reloading || inv.pin || this.kick > 0.2 || this.melee > 0) return false;
    this.inspectT = this.inspectT > 0 && this.inspectT < 0.85 ? this.inspectT : 0.0001; // restart only near the end
    return true;
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
