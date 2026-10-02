// PlayerController: input -> command stream, PointerLock mouse-look, camera rig (eye height with lerped crouchFactor,
// step smoothing, landing dip, strafe roll) and the procedural viewmodel sway / bob dynamics.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { MOVEMENT as M, clamp, lerp, smoothstep, neutralInput } from '../shared/constants.js';

// Rebindable controls: action -> up to two inputs (KeyboardEvent.code, or Mouse0..Mouse4 for mouse buttons).
export const DEFAULT_BINDS = Object.freeze({
  forward: ['KeyW', 'ArrowUp'], back: ['KeyS', 'ArrowDown'], left: ['KeyA', 'ArrowLeft'], right: ['KeyD', 'ArrowRight'],
  jump: ['Space'], crouch: ['ControlLeft', 'KeyC'], walk: ['ShiftLeft'], attack: ['Mouse0'], attack2: ['Mouse2'],
  reload: ['KeyR'], use: ['KeyE'], quick: ['KeyQ'], drop: ['KeyG'], inspect: ['KeyF'], hand: ['KeyH'], buy: ['KeyB'], scoreboard: ['Tab'],
  chat: ['KeyY'], teamchat: ['KeyU'], radio: ['KeyZ'], ping: ['KeyX', 'Mouse1'], voice: ['KeyV'],
  slot1: ['Digit1', 'Numpad1'], slot2: ['Digit2', 'Numpad2'], slot3: ['Digit3', 'Numpad3'], slot4: ['Digit4', 'Numpad4'], slot5: ['Digit5', 'Numpad5'],
});
export const DEFAULT_MOUSE = Object.freeze({ sensitivity: 0.6, invertY: false, zoomSensitivity: 1, rawInput: true, wheelSwitch: true, toggleCrouch: false });
/** Human label for an input code. */
export function keyLabel(code) {
  if (!code) return '—';
  if (code.startsWith('Mouse')) return ['LMB', 'MMB', 'RMB', 'MOUSE4', 'MOUSE5'][Number(code.slice(5))] || code;
  return code.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'NUM ').replace('Left', ' L').replace('Right', ' R').replace(/^Arrow(.*)/, '↑$1').replace('Control', 'CTRL').replace('Shift', 'SHIFT').replace('Space', 'SPACE').toUpperCase();
}

/**
 * Procedural weapon motion.
 *  sway  : mouse-delta driven spring (the weapon lags behind yaw/pitch, then settles)
 *  bob   : speed-proportional sine oscillation; fades out while crouching or silent-walking
 *  land  : vertical dip on landing
 */
export class ViewmodelDynamics {
  constructor() {
    this.yaw = 0; this.pitch = 0; this.vyaw = 0; this.vpitch = 0;
    this.phase = 0; this.amp = 0; this.land = 0; this.vland = 0; this.jump = 0;
    this.mass = 3;                         // kg of the weapon in hand (set every frame by the game): heavier = more inertia
    this.position = new THREE.Vector3(); this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  impulseLand(speed) { this.vland -= Math.min(2.2, speed * 0.18); }
  update(dt, { dx = 0, dy = 0, speed = 0, grounded = true, crouch = 0, walking = false }) {
    // sway spring (impulses from mouse counts, underdamped return). A heavy weapon has more inertia: it lags the view
    // less sharply, swings back slower and settles later; a pistol snaps around.
    const inertia = 0.55 + 0.15 * clamp(this.mass, 0.2, 8);
    this.vyaw += clamp(dx, -120, 120) * 0.0085 / inertia; this.vpitch += clamp(dy, -120, 120) * 0.0065 / inertia;
    const k = 210 / inertia, c = 21 / Math.sqrt(inertia);
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) {
      this.vyaw += (-k * this.yaw - c * this.vyaw) * h; this.vpitch += (-k * this.pitch - c * this.vpitch) * h;
      this.yaw = clamp(this.yaw + this.vyaw * h, -0.11, 0.11); this.pitch = clamp(this.pitch + this.vpitch * h, -0.09, 0.09);
      this.vland += (-260 * this.land - 24 * this.vland) * h; this.land += this.vland * h;
    }
    // bob amplitude: 0 when crouched, walking (Shift) or airborne
    const moving = clamp(speed / (M.runSpeed), 0, 1.1);
    const target = grounded && !walking && crouch < 0.5 ? moving : 0;
    this.amp += (target - this.amp) * Math.min(1, dt * 9);
    this.phase += dt * (5.5 + speed * 1.15);
    // landing spring

    this.jump += ((grounded ? 0 : 1) - this.jump) * Math.min(1, dt * 8);
    // heavier weapons bob more (the arms carry the weight with every stride)
    const heft = 0.8 + 0.07 * clamp(this.mass, 0.2, 8);
    const bx = Math.sin(this.phase) * 0.0085 * this.amp * heft, by = -Math.abs(Math.sin(this.phase)) * 0.0125 * this.amp * heft;
    this.position.set(-this.yaw * 0.11 + bx, this.pitch * 0.09 + by + this.land * 0.03 + this.jump * 0.006, 0);
    this.rotation.set(this.pitch * 0.9 + Math.sin(this.phase * 2) * 0.004 * this.amp + this.land * 0.03, this.yaw * 0.9 + Math.sin(this.phase) * 0.006 * this.amp, -this.yaw * 0.5 + bx * 1.5);
  }
}

export class PlayerController {
  /**
   * @param {THREE.PerspectiveCamera} camera  the world camera (kept for API symmetry; the rig returns pose values)
   * @param {HTMLElement} domElement pointer-lock target
   */
  constructor(camera, domElement = document.body) {
    this.camera = camera; this.dom = domElement;
    this.aim = new THREE.Object3D(); this.aim.rotation.order = 'YXZ';
    this.controls = new PointerLockControls(this.aim, domElement);
    this.controls.pointerSpeed = 0.6; this.controls.minPolarAngle = 0.03; this.controls.maxPolarAngle = Math.PI - 0.03;
    // route look input through a wrapper so "invert Y" can flip the vertical axis
    { const doc = domElement.ownerDocument, inner = this.controls._onMouseMove;
      doc.removeEventListener('mousemove', inner);
      // Chrome / Windows sometimes report a bogus huge movement spike during fast flicks (the view "jumps" sideways):
      // drop single events far beyond the recent motion instead of turning the camera by them
      this.controls._onMouseMove = e => {
        let mx = e.movementX, my = e.movementY;
        const m = Math.hypot(mx, my);
        if (m > 1200) { const s = 1200 / m; mx *= s; my *= s; }
        inner(this.mouseOpts?.invertY ? { movementX: mx, movementY: -my } : { movementX: mx, movementY: my });
      };
      doc.addEventListener('mousemove', this.controls._onMouseMove); }
    this.keys = new Set(); this.edges = { slot: 0, quick: false, drop: false, jump: false, reload: false, wheel: 0 };
    this.fire = false; this.fire2 = false; this.firePressed = false; this.enabled = true;
    this.mouse = { dx: 0, dy: 0 }; this.viewmodel = new ViewmodelDynamics();
    this.crouchFactor = 0; this.stepOffset = new THREE.Vector3(); this.landDip = 0; this.vLandDip = 0; this.roll = 0;
    this.eye = new THREE.Vector3(); this.callbacks = {};
    this.toggleCrouch = false; this.crouchLatched = false;
    this.mouseOpts = { ...DEFAULT_MOUSE };
    this.setBinds(DEFAULT_BINDS);
    this.bind();
  }
  on(name, fn) { this.callbacks[name] = fn; return this; }
  setBinds(binds) {
    this.binds = {}; for (const [a, def] of Object.entries(DEFAULT_BINDS)) this.binds[a] = Array.isArray(binds?.[a]) ? binds[a].slice(0, 2) : def.slice();
    this.byCode = new Map(); for (const [a, codes] of Object.entries(this.binds)) for (const c of codes) if (c) { if (!this.byCode.has(c)) this.byCode.set(c, []); this.byCode.get(c).push(a); }
    this.gameCodes = new Set(this.byCode.keys());
  }
  setMouse(opts) { Object.assign(this.mouseOpts, opts); this.sens = null; this.setSensitivity(Number(this.mouseOpts.sensitivity)); this.toggleCrouch = !!this.mouseOpts.toggleCrouch; }
  /** Held state of an action (any of its bound inputs is down). */
  held(a) { return this.binds[a].some(c => c && this.keys.has(c)); }
  // touch devices have no pointer lock: TouchControls switches a virtual one on while a match is played
  get locked() { return this.controls.isLocked || !!this.touchActive; }
  /** Raw input (unadjustedMovement) exists only in Chromium on Windows / macOS / ChromeOS; elsewhere it errors, so skip it. */
  get rawSupported() { const ua = navigator.userAgentData; return !this.rawFailed && !!ua && !/linux|android/i.test(ua.platform || navigator.platform || ''); }
  lock() {
    if (this.touchMode) { this.touchActive = true; return; }
    if (this.mouseOpts.rawInput && this.rawSupported) {
      const r = this.dom.requestPointerLock?.({ unadjustedMovement: true });
      if (r?.catch) { r.catch(e => { if (e?.name === 'NotSupportedError') { this.rawFailed = true; this.controls.lock(); } }); return; }
    }
    this.controls.lock();
  }
  unlock() { this.controls.unlock(); }
  setSensitivity(v) { this.sens = Number.isFinite(v) ? clamp(v, 0.15, 2) : 0.6; this.controls.pointerSpeed = this.sens * (this.zoomScale || 1); }
  /** Scales mouse speed with the field of view so a scoped aim feels the same in screen space. */
  setZoomScale(k) { this.zoomScale = clamp(k, 0.2, 1) * (k < 1 ? this.mouseOpts.zoomSensitivity : 1); this.controls.pointerSpeed = (this.sens ?? 0.6) * this.zoomScale; }
  /** Drag-to-look from TouchControls (dx / dy in mouse counts). */
  touchLook(dx, dy) {
    const k = 0.002 * (this.controls.pointerSpeed || 0.6), r = this.aim.rotation;
    r.y -= dx * k; r.x = clamp(r.x - dy * k * (this.mouseOpts.invertY ? -1 : 1), -Math.PI / 2 + 0.03, Math.PI / 2 - 0.03);
    this.mouse.dx += dx; this.mouse.dy += dy;
  }
  get yaw() { return this.aim.rotation.y; }
  get pitch() { return this.aim.rotation.x; }
  setAim(yaw, pitch) { this.aim.rotation.set(pitch, yaw, 0, 'YXZ'); }
  clearInput() { this.keys.clear(); this.fire = this.fire2 = this.firePressed = false; this.edges = { slot: 0, quick: false, drop: false, jump: false, reload: false, wheel: 0 }; this.mouse.dx = this.mouse.dy = 0; }

  bind() {
    this.handlers = {
      keydown: e => {
        if (e.code === 'Escape' && this.locked) { this.unlock(); return; }
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;
        if (this.capture) { e.preventDefault(); this.capture(e.code); return; }
        const acts = this.byCode.get(e.code) || [];
        if (this.gameCodes.has(e.code) && (this.locked || acts.includes('scoreboard'))) e.preventDefault();
        if (!this.locked) { if (!e.repeat && acts.includes('buy')) this.callbacks.buy?.(); if (acts.includes('scoreboard')) this.callbacks.scoreboard?.(true); return; }
        if (e.repeat) return;
        if (this.radioOpen && /^Digit[1-9]$/.test(e.code)) { this.callbacks.radioPick?.(Number(e.code.slice(5))); return; }
        this.press(e.code, e);
      },
      keyup: e => this.release(e.code),
      mousedown: e => { if (this.capture) { e.preventDefault(); this.capture(`Mouse${e.button}`); return; } if (!this.locked) return; if (e.button === 1) e.preventDefault(); this.press(`Mouse${e.button}`, e); },
      mouseup: e => this.release(`Mouse${e.button}`),
      mousemove: e => {
        if (this.locked) {
          let mx = e.movementX, my = e.movementY;
          const m = Math.hypot(mx, my);
          if (m > 1200) { const s = 1200 / m; mx *= s; my *= s; }
          this.mouse.dx += mx;
          this.mouse.dy += my * (this.mouseOpts.invertY ? -1 : 1);
        }
      },
      wheel: e => { if (this.locked) { if (this.mouseOpts.wheelSwitch) this.edges.wheel = Math.sign(e.deltaY); e.preventDefault(); } },
      contextmenu: e => { if (this.locked) e.preventDefault(); },
      blur: () => this.clearInput(),
      lock: () => { this.clearInput(); this.callbacks.lock?.(); },
      unlock: () => { this.clearInput(); this.callbacks.unlock?.(); },
    };
    const h = this.handlers;
    addEventListener('keydown', h.keydown); addEventListener('keyup', h.keyup); addEventListener('mousedown', h.mousedown); addEventListener('mouseup', h.mouseup);
    addEventListener('mousemove', h.mousemove); addEventListener('wheel', h.wheel, { passive: false }); addEventListener('contextmenu', h.contextmenu); addEventListener('blur', h.blur);
    this.controls.addEventListener('lock', h.lock); this.controls.addEventListener('unlock', h.unlock);
  }
  /** Input went down: held state plus the one-shot actions bound to it. */
  press(code, e) {
    const acts = this.byCode.get(code) || [];
    // comms first: opening chat must not leave movement keys stuck
    if (acts.includes('chat') || acts.includes('teamchat')) { e?.preventDefault?.(); this.clearInput(); this.callbacks.chat?.(acts.includes('teamchat') && !acts.includes('chat')); return; }
    this.keys.add(code);
    for (const a of acts) {
      if (a === 'attack') { this.fire = true; this.firePressed = true; this.callbacks.cycle?.(1); }
      else if (a === 'attack2') { this.fire2 = true; this.callbacks.cycle?.(-1); }
      else if (a === 'jump') this.edges.jump = true;
      else if (a === 'quick') this.edges.quick = true;
      else if (a === 'drop') this.edges.drop = true;
      else if (a === 'reload') this.edges.reload = true;
      else if (a === 'inspect') this.callbacks.inspect?.();
      else if (a === 'hand') this.callbacks.hand?.();
      else if (a === 'buy') this.callbacks.buy?.();
      else if (a === 'scoreboard') this.callbacks.scoreboard?.(true);
      else if (a === 'radio') this.callbacks.radio?.();
      else if (a === 'ping') this.callbacks.ping?.();
      else if (a === 'voice') this.callbacks.voice?.(true);
      else if (a === 'crouch' && this.toggleCrouch) this.crouchLatched = !this.crouchLatched;
      else if (a.startsWith('slot')) this.edges.slot = Number(a.slice(4));
    }
  }
  release(code) {
    this.keys.delete(code);
    const acts = this.byCode.get(code) || [];
    if (acts.includes('scoreboard')) this.callbacks.scoreboard?.(false);
    if (acts.includes('voice') && !this.held('voice')) this.callbacks.voice?.(false);
    if (acts.includes('attack') && !this.held('attack')) this.fire = false;
    if (acts.includes('attack2') && !this.held('attack2')) this.fire2 = false;
  }
  dispose() {
    const h = this.handlers;
    removeEventListener('keydown', h.keydown); removeEventListener('keyup', h.keyup); removeEventListener('mousedown', h.mousedown); removeEventListener('mouseup', h.mouseup);
    removeEventListener('mousemove', h.mousemove); removeEventListener('wheel', h.wheel); removeEventListener('contextmenu', h.contextmenu); removeEventListener('blur', h.blur);
    this.controls.dispose();
  }

  /** One input command for the 64 Hz stream. Edge-triggered inputs (jump tap, slot, Q, reload) are consumed here. */
  sampleCommand() {
    const c = neutralInput();
    c.yaw = this.yaw; c.pitch = this.pitch;
    if (!this.locked || !this.enabled) { this.edges = { slot: 0, quick: false, drop: false, jump: false, reload: false, wheel: 0 }; this.firePressed = false; return c; }
    const k = this.keys, e = this.edges;
    const ax = this.axis || { x: 0, y: 0 };   // analog move stick (touch)
    c.forward = clamp(Number(this.held('forward')) - Number(this.held('back')) + ax.y, -1, 1);
    c.right = clamp(Number(this.held('right')) - Number(this.held('left')) + ax.x, -1, 1);
    c.jump = this.held('jump') || e.jump;
    c.crouch = this.toggleCrouch ? this.crouchLatched : this.held('crouch');
    c.walk = this.held('walk') || (!!this.walkTouch && (ax.x !== 0 || ax.y !== 0));
    c.fire = this.fire || this.firePressed; c.fire2 = this.fire2;
    c.reload = this.held('reload') || e.reload; c.interact = this.held('use');
    c.slot = e.slot; c.quick = e.quick; c.drop = !!e.drop;
    if (e.wheel && this.callbacks.wheel) { const s = this.callbacks.wheel(e.wheel); if (s) c.slot = s; }
    this.edges = { slot: 0, quick: false, drop: false, jump: false, reload: false, wheel: 0 }; this.firePressed = false;
    return c;
  }

  /** Movement events from the predictor (landing / stair pop) feed the camera rig. */
  notify(events) {
    if (events.landed > 3) { this.vLandDip -= Math.min(2.4, events.landed * 0.16); this.viewmodel.impulseLand(events.landed); }
    if (events.step) { this.stepOffset.x -= events.step.x; this.stepOffset.y -= events.step.y; this.stepOffset.z -= events.step.z; }
  }

  /**
   * Per-frame camera rig. Returns { eye, yaw, pitch, roll } to hand to WorldEngine.setCamera().
   * @param {number} dt seconds
   * @param {{char:object, prev:object, alpha:number, correction:{x,y,z}, punch:{yaw,pitch}, alive:boolean, walking:boolean}} s
   */
  update(dt, s) {
    const { char, prev, alpha, correction, punch } = s;
    // crouchFactor: render-side lerp toward the simulated factor so 64 Hz ticks never step the camera
    this.crouchFactor += (char.crouch - this.crouchFactor) * Math.min(1, dt * 28);
    const eyeY = lerp(M.eyeStand, M.eyeCrouch, smoothstep(clamp(this.crouchFactor, 0, 1)));
    // stair pops decay smoothly; landing dip is a damped spring
    this.stepOffset.multiplyScalar(Math.exp(-dt * 13));
    const steps = Math.max(1, Math.ceil(dt * 120)), h = dt / steps;
    for (let i = 0; i < steps; i++) { this.vLandDip += (-220 * this.landDip - 22 * this.vLandDip) * h; this.landDip += this.vLandDip * h; }
    const a = clamp(alpha, 0, 1);
    this.eye.set(
      lerp(prev.x, char.x, a) + (correction?.x || 0) + this.stepOffset.x,
      lerp(prev.y, char.y, a) + eyeY + (correction?.y || 0) + this.stepOffset.y + this.landDip * 0.05,
      lerp(prev.z, char.z, a) + (correction?.z || 0) + this.stepOffset.z,
    );
    // gentle roll into strafes
    const right = char.vx * Math.cos(this.yaw) - char.vz * Math.sin(this.yaw);
    this.roll += (clamp(-right * 0.0028, -0.02, 0.02) - this.roll) * Math.min(1, dt * 9);
    const mdx = this.mouse.dx, mdy = this.mouse.dy; this.mouse.dx = this.mouse.dy = 0;
    this.viewmodel.update(dt, { dx: mdx, dy: mdy, speed: Math.hypot(char.vx, char.vz), grounded: char.grounded, crouch: this.crouchFactor, walking: s.walking });
    // rendered view = raw aim + recoil punch (bullets are aimed by the server with the same punch)
    return { eye: this.eye, yaw: this.yaw - (punch?.yaw || 0), pitch: clamp(this.pitch + (punch?.pitch || 0), -1.55, 1.55), roll: this.roll };
  }
}
