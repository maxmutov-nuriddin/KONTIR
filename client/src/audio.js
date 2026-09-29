// Fully procedural spatial audio (no asset files): layered noise/oscillator voices through HRTF panners,
// distance low-pass and a shared convolution reverb tail.
export class AudioEngine {
  constructor() { this.ctx = null; this.volume = 0.8; this.noiseBuffer = null; this.lastFoot = 0; this.ringNode = null; }

  /** Must run inside a user gesture (the lock button). Safe to call repeatedly. */
  unlock() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      this.ctx = new Ctx({ latencyHint: 'interactive' });
      this.master = this.ctx.createGain(); this.master.gain.value = this.volume;
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 5;
      this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 2, buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate), d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noiseBuffer = buf;
      const irLen = Math.floor(this.ctx.sampleRate * 1.7), ir = this.ctx.createBuffer(2, irLen, this.ctx.sampleRate);
      for (let c = 0; c < 2; c++) { const ch = ir.getChannelData(c); for (let i = 0; i < irLen; i++) ch[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 3.2); }
      this.reverb = this.ctx.createConvolver(); this.reverb.buffer = ir;
      this.reverbGain = this.ctx.createGain(); this.reverbGain.gain.value = 0.32; this.reverb.connect(this.reverbGain); this.reverbGain.connect(this.master);
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }
  setVolume(v) { this.volume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8; if (this.master) this.master.gain.value = this.volume; }

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
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cutoff ?? Math.max(700, 16000 - dist * 260);
      const pan = ctx.createPanner(); pan.panningModel = 'HRTF'; pan.distanceModel = 'inverse'; pan.refDistance = 3; pan.rolloffFactor = 1.15; pan.maxDistance = 220;
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
      if (--dest.voices === 0) for (const node of dest.voiceNodes) node.disconnect();
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
  gunshot(weapon, pos, own = false) {
    if (!this.ctx) return;
    const profiles = {
      ak47: { snapFreq: 3200, snapGain: 1.1, bodyFreq: 650, bodySweep: 180, bodyDur: 0.12, subPunch: 75, gain: 1.0, tail: 0.5 },
      galil: { snapFreq: 3400, snapGain: 1.0, bodyFreq: 700, bodySweep: 200, bodyDur: 0.11, subPunch: 80, gain: 0.95, tail: 0.45 },
      m4a4: { snapFreq: 4200, snapGain: 1.0, bodyFreq: 800, bodySweep: 220, bodyDur: 0.09, subPunch: 85, gain: 0.9, tail: 0.4 },
      famas: { snapFreq: 4500, snapGain: 0.95, bodyFreq: 850, bodySweep: 240, bodyDur: 0.08, subPunch: 90, gain: 0.85, tail: 0.38 },
      awp: { snapFreq: 2500, snapGain: 1.6, bodyFreq: 500, bodySweep: 120, bodyDur: 0.24, subPunch: 55, gain: 1.5, tail: 0.8 },
      deagle: { snapFreq: 2400, snapGain: 1.3, bodyFreq: 550, bodySweep: 160, bodyDur: 0.15, subPunch: 65, gain: 1.25, tail: 0.55 },
      glock: { snapFreq: 3800, snapGain: 0.85, bodyFreq: 950, bodySweep: 300, bodyDur: 0.07, subPunch: 105, gain: 0.75, tail: 0.25 },
      usp: { snapFreq: 2200, snapGain: 0.55, bodyFreq: 1200, bodySweep: 500, bodyDur: 0.05, subPunch: 0, gain: 0.5, tail: 0.15, suppressed: true },
    };
    const p = profiles[weapon] || profiles.ak47;
    const d = this.out(own ? null : pos, { reverb: p.tail });
    const jitter = 0.95 + Math.random() * 0.1;

    // 1. Initial supersonic crack / snap (high pressure shockwave)
    this.noise(d, { dur: 0.035, type: 'bandpass', freq: p.snapFreq * jitter, q: 1.2, gain: p.snapGain * p.gain, attack: 0.001, decay: 0.03 });
    this.noise(d, { dur: 0.02, type: 'highpass', freq: 4500, gain: 0.6 * p.gain, attack: 0.001, decay: 0.018 });

    // 2. Gunpowder explosion body (burst of expanding gas, not a drum tone)
    this.noise(d, { dur: p.bodyDur, type: 'lowpass', freq: p.bodyFreq, sweepTo: p.bodySweep, gain: 0.9 * p.gain, attack: 0.002, decay: p.bodyDur });

    // 3. Short non-tonal sub pressure impulse (micro transient punch, not a ringing tone)
    if (p.subPunch > 0) {
      this.tone(d, { dur: 0.035, from: p.subPunch, to: 30, gain: 0.65 * p.gain, attack: 0.001 });
    }

    // 4. Mechanical slide / bolt action click
    if (!p.suppressed) {
      this.noise(d, { start: 0.008, dur: 0.02, type: 'bandpass', freq: 3500, q: 3.5, gain: 0.3 * p.gain, decay: 0.015 });
    }

    // 5. Environmental acoustic reflection tail
    this.noise(d, { start: 0.02, dur: p.tail, type: 'highpass', freq: p.suppressed ? 5000 : 2600, gain: 0.16 * p.gain, decay: p.tail * 0.8 });
  }
  footstep(pos, own = false, scale = 1) {
    if (!this.ctx) return;
    const d = this.out(own ? null : pos, { reverb: 0.05 }), f = 0.85 + Math.random() * 0.3;
    this.noise(d, { dur: 0.09, type: 'lowpass', freq: 850 * f, gain: 0.5 * scale, decay: 0.08 });
    this.noise(d, { dur: 0.05, type: 'bandpass', freq: 2200 * f, q: 1.2, gain: 0.18 * scale, decay: 0.04, start: 0.01 });
    this.tone(d, { dur: 0.08, from: 110 * f, to: 60, gain: 0.35 * scale });
  }
  land(pos, own = false, speed = 4) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.1 }); this.noise(d, { dur: 0.16, type: 'lowpass', freq: 700, gain: Math.min(1, 0.3 + speed * 0.04), decay: 0.15 }); this.tone(d, { dur: 0.14, from: 90, to: 45, gain: 0.5 }); }
  jump(pos, own = false) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 }); this.noise(d, { dur: 0.1, type: 'bandpass', freq: 500, q: 0.6, gain: 0.25, decay: 0.09 }); }
  draw(pos, own = false) { if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 }); this.noise(d, { dur: 0.08, type: 'bandpass', freq: 2400, q: 2.5, gain: 0.45, decay: 0.07 }); this.noise(d, { start: 0.11, dur: 0.06, type: 'bandpass', freq: 1500, q: 3, gain: 0.35, decay: 0.05 }); this.tone(d, { start: 0.02, dur: 0.05, type: 'square', from: 900, to: 500, gain: 0.05 }); }
  reload(pos, own = false) {
    if (!this.ctx) return; const d = this.out(own ? null : pos, { reverb: 0.05 });
    this.noise(d, { dur: 0.06, type: 'bandpass', freq: 1400, q: 3, gain: 0.5, decay: 0.05 });                       // mag release
    this.noise(d, { start: 0.6, dur: 0.08, type: 'bandpass', freq: 900, q: 2, gain: 0.55, decay: 0.07 });           // mag in
    this.tone(d, { start: 0.6, dur: 0.05, type: 'square', from: 500, to: 300, gain: 0.06 });
    this.noise(d, { start: 1.35, dur: 0.06, type: 'bandpass', freq: 2200, q: 4, gain: 0.5, decay: 0.05 });          // bolt
    this.noise(d, { start: 1.42, dur: 0.06, type: 'bandpass', freq: 1200, q: 4, gain: 0.5, decay: 0.05 });
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
  smokePop(pos) { if (!this.ctx) return; const d = this.out(pos, { reverb: 0.5 }); this.noise(d, { dur: 0.5, type: 'lowpass', freq: 1800, sweepTo: 300, gain: 0.6, decay: 0.5 }); this.tone(d, { dur: 0.2, from: 220, to: 80, gain: 0.5 }); }
  beep(high = false) { if (!this.ctx) return; const d = this.out(null, { reverb: 0.1 }); this.tone(d, { dur: 0.09, type: 'square', from: high ? 1900 : 1300, gain: 0.08 }); }
  plant() { if (!this.ctx) return; const d = this.out(null, { reverb: 0.1 }); for (let i = 0; i < 3; i++) this.tone(d, { start: i * 0.13, dur: 0.1, type: 'square', from: 1200 + i * 200, gain: 0.08 }); }
  click() { if (!this.ctx) return; const d = this.out(null, { reverb: 0 }); this.tone(d, { dur: 0.03, type: 'square', from: 1400, to: 800, gain: 0.05 }); }
}
