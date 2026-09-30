// Fully procedural spatial audio (no asset files): layered noise/oscillator voices through HRTF panners,
// distance low-pass and a shared convolution reverb tail.
import { SHOT_PROFILES, synthShot } from './gunsynth.js';
import { cuesFor } from './reload.js';
import { WEAPONS } from '../../shared/weapons.js';

export class AudioEngine {
  constructor() { this.ctx = null; this.volume = 0.8; this.noiseBuffer = null; this.lastFoot = 0; this.ringNode = null; this.shots = new Map(); this.clips = new Map(); this.muted = false; this.paused = false; }

  /** Must run inside a user gesture (the lock button). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5;
      this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      const irLen = Math.floor(this.ctx.sampleRate * 1.7), ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
      this.reverb = this.ctx.createConvolver(); this.reverb.buffer = ir;
      this.reverbGain = this.ctx.createGain(); this.reverbGain.gain.value = 0.32; this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);
      this.loadClip('./audio/terwin.wav');
      this.loadClip('./audio/ctwin.wav');
    }
    if (this.ctx.state === 'suspended' && !this.paused) this.ctx.resume().catch(() => {});
  }
  setVolume(v) { this.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; if (this.master && !this.muted) this.master.gain.value = this.volume; }

  pause() {
    this.paused = true;
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend().catch(() => {});
  }
  resume() {
    this.paused = false;
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
  }
  mute() {
    this.muted = true;
    if (this.master) this.master.gain.value = 0;
  }
  unmute() {
    this.muted = false;
    if (this.master) this.master.gain.value = this.volume;
  }

  setListener(camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener, p = camera.position, e = camera.matrixWorld.elements;
    const fx = -e[8], fy = -e[9], fz = -e[10], ux = e[4], uy = e[5], uz = e[6];
    if (l.positionX) { l.positionX.value = p.x; l.positionY.value = p.y; l.positionZ.value = p.z; l.forwardX.value = fx; l.forwardY.value = fy; l.forwardZ.value = fz; l.upX.value = ux; l.upY.value = uy; l.upZ.value = uz; }
    else { l.setPosition(p.x, p.y, p.z); l.setOrientation(fx, fy, fz, ux, uy, uz); }
    this.listenerPos = p;
  }

  // ------------------------------------------------------------------------------------------- plumbing
  out(pos, { reverb = 0.25, cutoff = null } = {}) {
    const ctx = this.ctx, dry = ctx.createGain();
    dry.voiceNodes = [dry]; dry.voices = 0;
    if (pos && this.listenerPos) {
      const dist = Math.hypot(pos.x - this.listenerPos.x, pos.y - this.listenerPos.y, pos.z - this.listenerPos.z);
      this.spatial = (this.spatial || 0) + 1; dry.spatial = true;
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff ?? Math.max(700, 16000 - dist * 260);
      const pan = ctx.createPanner(); pan.panningModel = dist < 22 && (this.hrtfVoices || 0) < 8 ? 'HRTF' : 'equalpower'; if (pan.panningModel === 'HRTF') { this.hrtfVoices = (this.hrtfVoices || 0) + 1; dry.hrtf = true; } pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.rolloffFactor = 1.15; pan.maxDistance = 220;
      if (pan.positionX) { pan.positionX.value = pos.x; pan.positionY.value = pos.y; pan.positionZ.value = pos.z; } else pan.setPosition(pos.x, pos.y, pos.z);
      dry.connect(lp); lp.connect(pan); pan.connect(this.master); dry.voiceNodes.push(lp, pan);
      if (reverb) { const send = ctx.createGain(); send.gain.value = reverb * Math.min(1, 0.4 + dist / 60); lp.connect(send); send.connect(this.reverb); dry.voiceNodes.push(send); }
    } else {
      dry.connect(this.master);
      if (reverb) { const send = ctx.createGain(); send.gain.value = reverb; dry.connect(send); send.connect(this.reverb); dry.voiceNodes.push(send); }
    }
    return dry;
  }
  releaseVoice(source, dest, nodes) {
    dest.voices++;
    source.onended = () => {
      for (const node of [source, ...nodes]) node.disconnect();
      if (--dest.voices === 0) { for (const node of dest.voiceNodes) node.disconnect(); if (dest.spatial) this.spatial--; if (dest.hrtf) this.hrtfVoices--; }
    };
  }
  noise(dest, { start = 0, dur = 0.1, type = 'lowpass', freq = 1000, q = 0.7, gain = 0.5, attack = 0.002, decay = null, sweepTo = null }) {
    const ctx = this.ctx, t = ctx.currentTime + start, src = ctx.createBufferSource(); src.buffer = this.noiseBuffer; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + (decay ?? dur));
    src.connect(f); f.connect(g); g.connect(dest); this.releaseVoice(src, dest, [f, g]); src.start(t, Math.random()); src.stop(t + dur + 0.05);
  }
  tone(dest, { start = 0, dur = 0.1, type = 'sine', from = 200, to = null, gain = 0.5, attack = 0.002 }) {
    const ctx = this.ctx, t = ctx.currentTime + start, o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(from, t);
    if (to) o.frequency.exponentialRampToValueAtTime(to, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(dest); this.releaseVoice(o, dest, [g]); o.start(t); o.stop(t + dur + 0.05);
  }

  // ------------------------------------------------------------------------------------------- voices
  /**
   * Baked shot variants (3 per weapon, stereo). They are rendered in a Web Worker as soon as audio unlocks, loadout first;
   * a shot whose bank is not ready yet uses a cheap procedural fallback instead of blocking the frame.
   */
  startBaking(priority = []) {
    if (!this.ctx || this.baker !== undefined) return;
    const order = [...new Set([...priority, 'ak47', 'm4a4', 'glock', 'usp', ...Object.keys(SHOT_PROFILES)])].filter(n => SHOT_PROFILES[n]);
    const receive = (name, variants) => {
      const sr = this.ctx.sampleRate;
      this.shots.set(name, variants.map(([l, r]) => { const buf = this.ctx.createBuffer(2, l.length, sr); buf.copyToChannel(l, 0); buf.copyToChannel(r, 1); return buf; }));
    };
    try {
      this.baker = new Worker(new URL('./gunsynth.worker.js', import.meta.url), { type: 'module' });
      this.baker.onmessage = e => receive(e.data.name, e.data.variants);
      this.baker.onerror = () => { this.baker = null; this.bakeIdle(order, receive); };
      for (const name of order) this.baker.postMessage({ name, sampleRate: this.ctx.sampleRate, seeds: [11, 28, 45] });
    } catch { this.baker = null; this.bakeIdle(order, receive); }
  }
  /** Fallback when workers are unavailable: one variant per idle slice so no single frame pays for a whole bank. */
  bakeIdle(order, receive) {
    const queue = order.filter(n => !this.shots.has(n)), step = () => {
      const name = queue.shift(); if (!name || !this.ctx) return;
      const v = [11, 28, 45].map(seed => { const s = synthShot(name, this.ctx.sampleRate, seed); return [s.left, s.right]; });
      receive(name, v); (window.requestIdleCallback || setTimeout)(step, 60);
    };
    setTimeout(step, 300);
  }
  warmShots(ids) { this.startBaking(ids); }
  gunshot(weapon, pos, own = false) {
    if (!this.ctx) return;
    this.startBaking();
    if (!own && (this.spatial || 0) > 36) return;   // voice cap: a firefight must not flood the audio graph
    const key = SHOT_PROFILES[weapon] ? weapon : 'ak47', list = this.shots.get(key) || this.shots.get('ak47');
    const long = SHOT_PROFILES[weapon]?.length > 1.1;
    const d = this.out(own ? null : pos, { reverb: own ? 0.1 : (long ? 0.32 : 0.22) });
    if (!list) { // bank not baked yet: short procedural crack + body (no DSP on the main thread)
      this.noise(d, { dur: 0.03, type: 'highpass', freq: 3000, gain: 0.8, decay: 0.028 });
      this.noise(d, { dur: 0.16, type: 'lowpass', freq: 1400, sweepTo: 200, gain: 0.9, decay: 0.16 });
      return;
    }
    const buf = list[(Math.random() * list.length) | 0];
    const src = this.ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = 0.975 + Math.random() * 0.05;
    const g = this.ctx.createGain(); g.gain.value = own ? 1 : 0.9; src.connect(g); g.connect(d);
    this.releaseVoice(src, d, [g]); src.start();
  }
  footstep(pos, own = false, scale = 1) {
    if (!this.ctx) return;
    const d = this.out(own ? null : pos, { reverb: 0.05 }), f = 0.85 + Math.random() * 0.3;
    // clean boot step: a soft heel contact (mid band, very short) over a dull sole body; no hiss (highpass) and no tonal
    // drum sweep. A slight random tilt keeps consecutive steps from sounding identical.
    const g = scale * (0.9 + Math.random() * 0.2);
    this.noise(d, { dur: 0.06, type: 'lowpass', freq: 520 * f, gain: 0.55 * g, decay: 0.05 });
    this.noise(d, { dur: 0.025, type: 'bandpass', freq: 950 * f, q: 1.4, gain: 0.3 * g, decay: 0.02, start: 0.004 });
  }
  land(pos, own = false, speed = 4) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.1 }); this.noise(d, { dur: 0.16, type: 'lowpass', freq: 700, gain: Math.min(1, 0.3 + speed * 0.04), decay: 0.15 }); this.tone(d, { dur: 0.14, from: 90, to: 45, gain: 0.5 }); }
  jump(pos, own = false) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 }); this.noise(d, { dur: 0.1, type: 'bandpass', freq: 500, q: 0.6, gain: 0.25, decay: 0.09 }); }
  draw(pos, own = false) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 }); this.noise(d, { dur: 0.08, type: 'bandpass', freq: 2400, q: 2.5, gain: 0.45, decay: 0.07 }); this.noise(d, { start: 0.11, dur: 0.06, type: 'bandpass', freq: 1500, q: 3, gain: 0.35, decay: 0.05 }); this.tone(d, { start: 0.02, dur: 0.05, type: 'square', from: 900, to: 500, gain: 0.05 }); }
  /**
   * Reload foley. Own reloads are triggered cue-by-cue by the animation (WeaponManager 'foley' events); remote reloads
   * schedule the same cue table over that weapon's reload time. Assumes a full (empty-mag) reload for remote players.
   */
  reload(pos, own = false, weapon = 'ak47') {
    if (!this.ctx || own) return;
    const w = WEAPONS[weapon], seconds = w?.reload || 2.5;
    for (const [at, kind] of cuesFor(weapon, { full: true, shells: Math.min(8, w?.mag || 4) })) setTimeout(() => this.foley(kind, pos, false, weapon), at * seconds * 1000);
  }
  /** One mechanical sound. Heavier weapons sound lower; pistols brighter. */
  foley(kind, pos = null, own = true, weapon = 'ak47') {
    if (!this.ctx) return;
    const w = WEAPONS[weapon], heavy = w?.slot === 1 ? 1 : 0, f = heavy ? 0.85 + Math.random() * 0.08 : 1.1 + Math.random() * 0.1;
    const d = this.out(own ? null : pos, { reverb: 0.06 }), g = own ? 1 : 0.8;
    const click = (at, freq, q, gain, dur = 0.018) => this.noise(d, { start: at, dur, type: 'bandpass', freq: freq * f, q, gain: gain * g, attack: 0.0008, decay: dur * 0.9 });
    const thud = (at, freq, gain, dur = 0.05) => this.noise(d, { start: at, dur, type: 'lowpass', freq: freq * f, gain: gain * g, attack: 0.001, decay: dur });
    const scrape = (at, f0, f1, gain, dur = 0.08) => this.noise(d, { start: at, dur, type: 'bandpass', freq: f0 * f, sweepTo: f1 * f, q: 2.2, gain: gain * g, attack: 0.01, decay: dur });
    const ring = (at, freq, gain, dur = 0.07) => this.tone(d, { start: at, dur, type: 'triangle', from: freq * f, to: freq * f * 0.97, gain: gain * g * 0.25 });
    switch (kind) {
      case 'magOut': click(0, 2100, 5, 0.55); scrape(0.012, 900, 1500, 0.35, 0.09); thud(0.07, 600, 0.2); break;
      case 'magTouch': scrape(0, 1200, 1700, 0.18, 0.05); break;
      case 'magIn': scrape(0, 1400, 900, 0.3, 0.05); thud(0.045, 700, 0.75, 0.06); click(0.05, 3300, 6, 0.6); ring(0.05, 2400, 0.4); break;
      case 'boltBack': scrape(0, 1100, 2300, 0.5, 0.07); click(0.07, 2800, 5, 0.55); break;
      case 'boltFwd': thud(0, 900, 0.8, 0.05); click(0.003, 3600, 4, 0.8, 0.022); ring(0.005, 3100, 0.5, 0.09); break;
      case 'boltUp': click(0, 2500, 6, 0.45); break;
      case 'slide': thud(0, 1100, 0.7, 0.04); click(0.002, 4200, 4, 0.85, 0.02); ring(0.004, 3600, 0.45, 0.08); break;
      case 'shell': click(0, 2600, 5, 0.4, 0.015); thud(0.02, 800, 0.45, 0.04); scrape(0.01, 1500, 1100, 0.2, 0.04); break;
      case 'pumpBack': scrape(0, 700, 1500, 0.55, 0.08); click(0.075, 2300, 4, 0.6); break;
      case 'pumpFwd': scrape(0, 1500, 800, 0.5, 0.07); thud(0.06, 800, 0.8, 0.05); click(0.065, 3100, 4, 0.7); break;
      case 'cylinderOut': click(0, 3000, 6, 0.5); scrape(0.01, 2000, 2600, 0.25, 0.05); break;
      case 'shellsOut': for (let i = 0; i < 6; i++) this.tone(d, { start: 0.02 + i * 0.025 + Math.random() * 0.01, dur: 0.05, type: 'triangle', from: 4200 + Math.random() * 900, gain: 0.05 * g }); break;
      case 'shellsIn': scrape(0, 1600, 1200, 0.25, 0.06); click(0.06, 2600, 5, 0.4); break;
      case 'cylinderIn': thud(0, 1000, 0.6, 0.04); click(0.004, 3400, 5, 0.75); break;
      default: click(0, 2000, 4, 0.4);
    }
  }
  dry(own = true) { if (!this.ctx) return; const d = this.out(null, { reverb: 0 }); this.tone(d, { dur: 0.04, type: 'square', from: 1800, to: 900, gain: 0.08 }); this.noise(d, { dur: 0.03, type: 'highpass', freq: 3000, gain: 0.25, decay: 0.025 }); void own; }
  swish(pos, own = false) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 }); this.noise(d, { dur: 0.22, type: 'bandpass', freq: 500, sweepTo: 3200, q: 1.2, gain: 0.5, attack: 0.05, decay: 0.2 }); }
  throwSound(pos, own = false) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 }); this.noise(d, { dur: 0.16, type: 'bandpass', freq: 700, sweepTo: 1800, q: 1, gain: 0.3, decay: 0.15 }); this.noise(d, { start: 0.0, dur: 0.05, type: 'bandpass', freq: 2600, q: 5, gain: 0.35, decay: 0.04 }); }
  bounce(pos) { if (!this.ctx) return; const d = this.out(pos, { reverb: 0.15 }); this.noise(d, { dur: 0.09, type: 'bandpass', freq: 3000, q: 3, gain: 0.35, decay: 0.08 }); this.tone(d, { dur: 0.08, from: 700, to: 300, gain: 0.15 }); }
  hitmarker(head = false) { if (!this.ctx) return; const d = this.out(null, { reverb: 0 }); this.tone(d, { dur: 0.06, from: head ? 2800 : 1700, gain: 0.22 }); if (head) this.tone(d, { start: 0.05, dur: 0.12, from: 3600, gain: 0.2 }); }
  hurt() { if (!this.ctx) return; const d = this.out(null, { reverb: 0.1 }); this.noise(d, { dur: 0.16, type: 'lowpass', freq: 500, gain: 0.5, decay: 0.15 }); this.tone(d, { dur: 0.14, from: 140, to: 70, gain: 0.4 }); }
  explosion(pos, big = false) {
    if (!this.ctx) return; const d = this.out(pos, { reverb: 0.9 });
    this.noise(d, { dur: big ? 2.4 : 1.4, type: 'lowpass', freq: 1400, sweepTo: 90, gain: 1, decay: big ? 2.4 : 1.4 });
    this.tone(d, { dur: big ? 1.6 : 0.9, from: 90, to: 28, gain: 1 });
    this.noise(d, { dur: 0.15, type: 'highpass', freq: 2000, gain: 0.8, decay: 0.12 });
  }
  flashbang(pos) { if (!this.ctx) return; const d = this.out(pos, { reverb: 0.4 }); this.noise(d, { dur: 0.35, type: 'highpass', freq: 1800, gain: 1, decay: 0.3 }); this.tone(d, { dur: 0.2, from: 200, to: 60, gain: 0.6 }); }
  /** Ear-ringing tinnitus for a flashed listener; fades over `seconds`. */
  ring(seconds) {
    if (!this.ctx) return; const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = 'sine'; o.frequency.value = 3900; g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.16, t + 0.05); g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + seconds + 0.1);
  }
  glassBreak(pos) { if (!this.ctx) return; const d = this.out(pos, { reverb: 0.4 }); this.noise(d, { dur: 0.25, type: 'highpass', freq: 3500, gain: 0.55, decay: 0.22 }); this.noise(d, { start: 0.03, dur: 0.5, type: 'bandpass', freq: 5200, q: 2, gain: 0.25, decay: 0.45 }); this.noise(d, { start: 0.04, dur: 0.9, type: 'lowpass', freq: 900, sweepTo: 200, gain: 0.7, attack: 0.03, decay: 0.9 }); }
  smokePop(pos) { if (!this.ctx) return; const d = this.out(pos, { reverb: 0.5 }); this.noise(d, { dur: 0.5, type: 'lowpass', freq: 1800, sweepTo: 300, gain: 0.6, decay: 0.5 }); this.tone(d, { dur: 0.2, from: 220, to: 80, gain: 0.5 }); }
  beep(high = false) { if (!this.ctx) return; const d = this.out(null, { reverb: 0.1 }); this.tone(d, { dur: 0.09, type: 'square', from: high ? 1900 : 1300, gain: 0.08 }); }
  plant() { if (!this.ctx) return; const d = this.out(null, { reverb: 0.1 }); for (let i = 0; i < 3; i++) this.tone(d, { start: i * 0.13, dur: 0.1, type: 'square', from: 1200 + i * 200, gain: 0.08 }); }
  click() { if (!this.ctx) return; const d = this.out(null, { reverb: 0 }); this.tone(d, { dur: 0.03, type: 'square', from: 1400, to: 800, gain: 0.05 }); }
  async loadClip(url) {
    if (!this.ctx || this.clips.has(url)) return this.clips.get(url);
    try {
      const res = await fetch(url);
      if (!res.ok) return null;
      const arrayBuffer = await res.arrayBuffer();
      const audioBuffer = await this.ctx.decodeAudioData(arrayBuffer);
      this.clips.set(url, audioBuffer);
      return audioBuffer;
    } catch {
      return null;
    }
  }
  async playClip(url, volume = 0.9) {
    if (!this.ctx) return;
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    let buf = this.clips.get(url) || await this.loadClip(url);
    if (!buf) return;
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const g = this.ctx.createGain();
    g.gain.value = volume;
    src.connect(g);
    g.connect(this.master);
    src.onended = () => { src.disconnect(); g.disconnect(); };
    src.start();
  }
  roundWin(team) {
    if (!team) return;
    const url = team === 'TERRORIST' ? './audio/terwin.wav' : (team === 'COUNTER_TERRORIST' || team === 'CT') ? './audio/ctwin.wav' : null;
    if (url) this.playClip(url, 0.95);
  }
}
