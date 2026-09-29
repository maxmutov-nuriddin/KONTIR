// PlayerController: input -> command stream, PointerLock mouse-look, camera rig (eye height with lerped crouchFactor,
// step smoothing, landing dip, strafe roll) and the procedural viewmodel sway / bob dynamics.
import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { MOVEMENT as M, clamp, lerp, smoothstep, neutralInput } from '../shared/constants.js';

const KEY_SLOTS = { Digit1: 1, Digit2: 2, Digit3: 3, Digit4: 4, Digit5: 5, Numpad1: 1, Numpad2: 2, Numpad3: 3, Numpad4: 4, Numpad5: 5 };
const GAME_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyR', 'KeyE', 'KeyQ', 'Tab', ...Object.keys(KEY_SLOTS)]);

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
    this.position = new THREE.Vector3(); this.rotation = new THREE.Euler(0, 0, 0, 'YXZ');
  }
  impulseLand(speed) { this.vland -= Math.min(2.2, speed * 0.18); }
  update(dt, { dx = 0, dy = 0, speed = 0, grounded = true, crouch = 0, walking = false }) {
    // sway spring (impulses from mouse counts, underdamped return)
    this.vyaw += clamp(dx, -120, 120) * 0.0085; this.vpitch += clamp(dy, -120, 120) * 0.0065;
    const k = 210, c = 21;
    this.vyaw += (-k * this.yaw - c * this.vyaw) * dt; this.vpitch += (-k * this.pitch - c * this.vpitch) * dt;
    this.yaw = clamp(this.yaw + this.vyaw * dt, -0.11, 0.11); this.pitch = clamp(this.pitch + this.vpitch * dt, -0.09, 0.09);
    // bob amplitude: 0 when crouched, walking (Shift) or airborne
    const moving = clamp(speed / (M.runSpeed), 0, 1.1);
    const target = grounded && !walking && crouch < 0.5 ? moving : 0;
    this.amp += (target - this.amp) * Math.min(1, dt * 9);
    this.phase += dt * (5.5 + speed * 1.15);
    // landing spring
    this.vland += (-260 * this.land - 24 * this.vland) * dt; this.land += this.vland * dt;
    this.jump += ((grounded ? 0 : 1) - this.jump) * Math.min(1, dt * 8);
    const bx = Math.sin(this.phase) * 0.0085 * this.amp, by = -Math.abs(Math.sin(this.phase)) * 0.0125 * this.amp;
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
    this.keys = new Set(); this.edges = { slot: 0, quick: false, jump: false, reload: false, wheel: 0 };
    this.fire = false; this.fire2 = false; this.firePressed = false; this.enabled = true;
    this.mouse = { dx: 0, dy: 0 }; this.viewmodel = new ViewmodelDynamics();
    this.crouchFactor = 0; this.stepOffset = new THREE.Vector3(); this.landDip = 0; this.vLandDip = 0; this.roll = 0;
    this.eye = new THREE.Vector3(); this.callbacks = {};
    this.toggleCrouch = false;
    this.bind();
  }
  on(name, fn) { this.callbacks[name] = fn; return this; }
  get locked() { return this.controls.isLocked; }
  lock() { this.controls.lock(); }
  unlock() { this.controls.unlock(); }
  setSensitivity(v) { this.controls.pointerSpeed = v; }
  get yaw() { return this.aim.rotation.y; }
  get pitch() { return this.aim.rotation.x; }
  setAim(yaw, pitch) { this.aim.rotation.set(pitch, yaw, 0, 'YXZ'); }
  clearInput() { this.keys.clear(); this.fire = this.fire2 = this.firePressed = false; this.edges = { slot: 0, quick: false, jump: false, reload: false, wheel: 0 }; this.mouse.dx = this.mouse.dy = 0; }

  bind() {
    this.handlers = {
      keydown: e => {
        if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
        if (GAME_KEYS.has(e.code) && (this.locked || e.code === 'Tab')) e.preventDefault();
        if (!this.locked) { if (e.code === 'KeyB' && !e.repeat) this.callbacks.buy?.(); if (e.code === 'Tab') this.callbacks.scoreboard?.(true); return; }
        if (e.repeat) return;
        this.keys.add(e.code);
        if (e.code === 'Space') this.edges.jump = true;
        if (e.code === 'KeyQ') this.edges.quick = true;
        if (e.code === 'KeyR') this.edges.reload = true;
        if (KEY_SLOTS[e.code]) this.edges.slot = KEY_SLOTS[e.code];
        if (e.code === 'KeyB') this.callbacks.buy?.();
        if (e.code === 'Tab') this.callbacks.scoreboard?.(true);
      },
      keyup: e => { this.keys.delete(e.code); if (e.code === 'Tab') this.callbacks.scoreboard?.(false); },
      mousedown: e => { if (!this.locked) return; if (e.button === 0) { this.fire = true; this.firePressed = true; } if (e.button === 2) this.fire2 = true; },
      mouseup: e => { if (e.button === 0) this.fire = false; if (e.button === 2) this.fire2 = false; },
      mousemove: e => { if (this.locked) { this.mouse.dx += e.movementX; this.mouse.dy += e.movementY; } },
      wheel: e => { if (this.locked) { this.edges.wheel = Math.sign(e.deltaY); e.preventDefault(); } },
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
    if (!this.locked || !this.enabled) { this.edges = { slot: 0, quick: false, jump: false, reload: false, wheel: 0 }; this.firePressed = false; return c; }
    const k = this.keys, e = this.edges;
    c.forward = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
    c.right = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
    c.jump = k.has('Space') || e.jump;
    c.crouch = k.has('ControlLeft') || k.has('ControlRight') || k.has('KeyC');
    c.walk = k.has('ShiftLeft') || k.has('ShiftRight');
    c.fire = this.fire || this.firePressed; c.fire2 = this.fire2;
    c.reload = k.has('KeyR') || e.reload; c.interact = k.has('KeyE');
    c.slot = e.slot; c.quick = e.quick;
    if (e.wheel && this.callbacks.wheel) { const s = this.callbacks.wheel(e.wheel); if (s) c.slot = s; }
    this.edges = { slot: 0, quick: false, jump: false, reload: false, wheel: 0 }; this.firePressed = false;
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
    this.vLandDip += (-220 * this.landDip - 22 * this.vLandDip) * dt; this.landDip += this.vLandDip * dt;
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
