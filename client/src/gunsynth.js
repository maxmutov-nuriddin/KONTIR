// Offline (baked) gunshot synthesis. Pure DSP, no Web Audio types, so it runs in the browser and in node tests.
//
// A real shot is not a tone: it is (1) a supersonic "N-wave" crack from the bullet, (2) the muzzle blast — a very loud
// broadband burst whose spectrum falls from ~8 kHz to a few hundred Hz within ~30 ms, (3) a low-frequency pressure
// thump made of *filtered noise* (never a sine, that is what makes a shot sound like a drum), (4) the action clacking,
// and (5) discrete reflections from nearby walls followed by a diffuse tail. Each layer is rendered per channel with
// decorrelated noise so the shot is wide and the reflections are stereo, then soft-clipped like a limiter/mic.

/** mulberry32 — deterministic so tests can assert on the output. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

// length (s) | blast: fc start/end (Hz), fall time tauF, amplitude decay tau1/tau2 (+ mix2) | sub: fc, tau, amp |
// crack: amp, width (ms) | mech: time, amp | cycle: second action sound time (bolt / pump) | echoes [delay s, gain] | tail tau, amp | drive
const P = (o) => ({ crack: 0, crackMs: 0.6, mech: 0.012, mechAmp: 0.14, cycle: 0, cycleAmp: 0.2, mix2: 0.25, drive: 1.6, level: 0.92, echoes: [[0.05, 0.3], [0.11, 0.2], [0.19, 0.13]], tail: 0.3, tailAmp: 0.16, ...o });

export const SHOT_PROFILES = {
  ak47: P({ length: 1.0, fcStart: 6000, fcEnd: 800, tauF: 0.022, tau1: 0.014, tau2: 0.075, subFc: 95, subTau: 0.05, sub: 1.4, crack: 0.95, crackMs: 0.65, mech: 0.011, mechAmp: 0.16, tail: 0.36, tailAmp: 0.18 }),
  galil: P({ length: 0.95, fcStart: 6200, fcEnd: 850, tauF: 0.02, tau1: 0.013, tau2: 0.07, subFc: 100, subTau: 0.046, sub: 1.25, crack: 0.9, crackMs: 0.6, tail: 0.34, tailAmp: 0.17 }),
  m4a4: P({ length: 0.9, fcStart: 7200, fcEnd: 1000, tauF: 0.017, tau1: 0.011, tau2: 0.06, subFc: 115, subTau: 0.04, sub: 1.0, crack: 1.0, crackMs: 0.5, mech: 0.009, tail: 0.32, tailAmp: 0.17 }),
  famas: P({ length: 0.85, fcStart: 7400, fcEnd: 1100, tauF: 0.016, tau1: 0.01, tau2: 0.055, subFc: 125, subTau: 0.036, sub: 0.85, crack: 0.9, crackMs: 0.45, tail: 0.3, tailAmp: 0.16 }),
  awp: P({ length: 1.9, fcStart: 5200, fcEnd: 520, tauF: 0.035, tau1: 0.026, tau2: 0.14, mix2: 0.35, subFc: 68, subTau: 0.09, sub: 2.1, crack: 1.25, crackMs: 0.85, mech: 0.02, mechAmp: 0.1, cycle: 0.62, cycleAmp: 0.28, echoes: [[0.07, 0.34], [0.16, 0.26], [0.3, 0.18], [0.5, 0.1]], tail: 0.75, tailAmp: 0.24, drive: 1.9 }),
  ssg08: P({ length: 1.5, fcStart: 5600, fcEnd: 600, tauF: 0.03, tau1: 0.02, tau2: 0.11, subFc: 80, subTau: 0.07, sub: 1.6, crack: 1.1, crackMs: 0.75, cycle: 0.5, cycleAmp: 0.22, tail: 0.55, tailAmp: 0.2, drive: 1.8 }),
  deagle: P({ length: 1.2, fcStart: 6400, fcEnd: 650, tauF: 0.026, tau1: 0.02, tau2: 0.1, subFc: 80, subTau: 0.07, sub: 1.7, crack: 0.55, crackMs: 0.7, mech: 0.02, mechAmp: 0.14, tail: 0.5, tailAmp: 0.2, drive: 1.8 }),
  glock: P({ length: 0.65, fcStart: 6800, fcEnd: 1200, tauF: 0.013, tau1: 0.008, tau2: 0.04, subFc: 140, subTau: 0.03, sub: 0.7, crack: 0.2, crackMs: 0.4, mech: 0.007, mechAmp: 0.2, tail: 0.2, tailAmp: 0.13 }),
  usp: P({ length: 0.5, fcStart: 2600, fcEnd: 650, tauF: 0.018, tau1: 0.009, tau2: 0.05, mix2: 0.3, subFc: 150, subTau: 0.026, sub: 0.35, crack: 0, mech: 0.007, mechAmp: 0.55, tail: 0.1, tailAmp: 0.06, echoes: [[0.05, 0.15], [0.12, 0.08]], drive: 1.2, level: 0.62 }),
  p250: P({ length: 0.65, fcStart: 6600, fcEnd: 1150, tauF: 0.014, tau1: 0.009, tau2: 0.045, subFc: 135, subTau: 0.032, sub: 0.75, crack: 0.25, crackMs: 0.45, tail: 0.22, tailAmp: 0.14 }),
  fiveseven: P({ length: 0.6, fcStart: 8200, fcEnd: 1500, tauF: 0.011, tau1: 0.007, tau2: 0.035, subFc: 160, subTau: 0.025, sub: 0.5, crack: 0.55, crackMs: 0.4, tail: 0.2, tailAmp: 0.13 }),
  tec9: P({ length: 0.6, fcStart: 6000, fcEnd: 1300, tauF: 0.012, tau1: 0.008, tau2: 0.038, subFc: 150, subTau: 0.028, sub: 0.6, crack: 0.2, crackMs: 0.4, mech: 0.006, mechAmp: 0.25, tail: 0.2, tailAmp: 0.12 }),
  mp9: P({ length: 0.6, fcStart: 5200, fcEnd: 1000, tauF: 0.012, tau1: 0.008, tau2: 0.04, subFc: 145, subTau: 0.028, sub: 0.6, crack: 0.1, crackMs: 0.4, mech: 0.005, mechAmp: 0.22, tail: 0.18, tailAmp: 0.11, level: 0.78 }),
  mac10: P({ length: 0.6, fcStart: 5600, fcEnd: 1100, tauF: 0.012, tau1: 0.008, tau2: 0.04, subFc: 130, subTau: 0.03, sub: 0.7, crack: 0.15, crackMs: 0.4, mech: 0.005, mechAmp: 0.24, tail: 0.2, tailAmp: 0.12, level: 0.82 }),
  m4a1s: P({ length: 0.6, fcStart: 2400, fcEnd: 600, tauF: 0.02, tau1: 0.01, tau2: 0.05, mix2: 0.3, subFc: 120, subTau: 0.03, sub: 0.5, crack: 0.35, crackMs: 0.45, mech: 0.008, mechAmp: 0.5, tail: 0.14, tailAmp: 0.08, echoes: [[0.05, 0.18], [0.12, 0.1]], drive: 1.2, level: 0.66 }),
  aug: P({ length: 0.9, fcStart: 7000, fcEnd: 950, tauF: 0.018, tau1: 0.011, tau2: 0.06, subFc: 110, subTau: 0.04, sub: 1.0, crack: 0.95, crackMs: 0.5, tail: 0.32, tailAmp: 0.17 }),
  sg553: P({ length: 0.95, fcStart: 6400, fcEnd: 850, tauF: 0.02, tau1: 0.013, tau2: 0.07, subFc: 100, subTau: 0.045, sub: 1.2, crack: 0.95, crackMs: 0.55, tail: 0.34, tailAmp: 0.17 }),
  ump45: P({ length: 0.65, fcStart: 5200, fcEnd: 900, tauF: 0.014, tau1: 0.01, tau2: 0.045, subFc: 115, subTau: 0.035, sub: 0.9, crack: 0.1, crackMs: 0.4, mech: 0.006, mechAmp: 0.22, tail: 0.2, tailAmp: 0.12, level: 0.82 }),
  p90: P({ length: 0.6, fcStart: 7200, fcEnd: 1300, tauF: 0.011, tau1: 0.007, tau2: 0.035, subFc: 150, subTau: 0.026, sub: 0.55, crack: 0.5, crackMs: 0.35, tail: 0.18, tailAmp: 0.11, level: 0.78 }),
  mp7: P({ length: 0.6, fcStart: 7600, fcEnd: 1400, tauF: 0.011, tau1: 0.007, tau2: 0.034, subFc: 155, subTau: 0.025, sub: 0.5, crack: 0.45, crackMs: 0.35, tail: 0.18, tailAmp: 0.11, level: 0.78 }),
  xm1014: P({ length: 1.2, fcStart: 5200, fcEnd: 480, tauF: 0.03, tau1: 0.022, tau2: 0.11, mix2: 0.4, subFc: 76, subTau: 0.08, sub: 1.8, crack: 0.3, crackMs: 0.9, mech: 0.03, mechAmp: 0.2, tail: 0.45, tailAmp: 0.2, drive: 1.9 }),
  mag7: P({ length: 1.3, fcStart: 5000, fcEnd: 460, tauF: 0.032, tau1: 0.024, tau2: 0.12, mix2: 0.4, subFc: 72, subTau: 0.09, sub: 2.0, crack: 0.3, crackMs: 0.9, cycle: 0.4, cycleAmp: 0.3, tail: 0.5, tailAmp: 0.22, drive: 2.0 }),
  sawedoff: P({ length: 1.3, fcStart: 4600, fcEnd: 420, tauF: 0.035, tau1: 0.026, tau2: 0.13, mix2: 0.45, subFc: 68, subTau: 0.1, sub: 2.2, crack: 0.2, crackMs: 1.0, cycle: 0.42, cycleAmp: 0.3, tail: 0.5, tailAmp: 0.22, drive: 2.1 }),
  negev: P({ length: 0.95, fcStart: 6200, fcEnd: 800, tauF: 0.02, tau1: 0.014, tau2: 0.075, subFc: 90, subTau: 0.05, sub: 1.4, crack: 0.95, crackMs: 0.6, mech: 0.01, mechAmp: 0.2, tail: 0.38, tailAmp: 0.18 }),
  cz75: P({ length: 0.62, fcStart: 6700, fcEnd: 1200, tauF: 0.013, tau1: 0.008, tau2: 0.042, subFc: 140, subTau: 0.03, sub: 0.72, crack: 0.2, crackMs: 0.4, tail: 0.2, tailAmp: 0.13 }),
  r8: P({ length: 1.2, fcStart: 6000, fcEnd: 600, tauF: 0.028, tau1: 0.021, tau2: 0.1, subFc: 78, subTau: 0.075, sub: 1.8, crack: 0.5, crackMs: 0.7, mech: 0.0, mechAmp: 0.05, tail: 0.5, tailAmp: 0.2, drive: 1.8 }),
  nova: P({ length: 1.4, fcStart: 5000, fcEnd: 450, tauF: 0.032, tau1: 0.024, tau2: 0.12, mix2: 0.4, subFc: 72, subTau: 0.09, sub: 2.0, crack: 0.3, crackMs: 0.9, cycle: 0.42, cycleAmp: 0.32, tail: 0.5, tailAmp: 0.22, drive: 2.0 }),
};

/** Time-varying two-pole low-pass over a noise stream, scaled by an envelope. */
function shapedNoise(out, n, sr, rand, fcAt, envAt, gain, start = 0) {
  let y1 = 0, y2 = 0;
  const from = Math.floor(start * sr);
  for (let i = from; i < n; i++) {
    const t = (i - from) / sr, env = envAt(t);
    if (env < 1e-5 && t > 0.01) break;
    const a = 1 - Math.exp(-2 * Math.PI * fcAt(t) / sr);
    y1 += a * ((rand() * 2 - 1) - y1); y2 += a * (y1 - y2);
    out[i] += y2 * env * gain;
  }
}

function renderChannel(name, sr, seed, side) {
  const p = SHOT_PROFILES[name] || SHOT_PROFILES.ak47, n = Math.floor(sr * p.length), rand = rng(seed * 7919 + side * 104729);
  const dry = new Float32Array(n), out = new Float32Array(n);
  const shared = rng(seed * 31 + 5);            // correlated between channels: crack + mechanical
  // (2) muzzle blast: bright, falling, with a fast and a slow decay component
  shapedNoise(dry, n, sr, rand, t => p.fcEnd + (p.fcStart - p.fcEnd) * Math.exp(-t / p.tauF),
    t => (t < 0.0003 ? t / 0.0003 : 1) * ((1 - p.mix2) * Math.exp(-t / p.tau1) + p.mix2 * Math.exp(-t / p.tau2)), 2.6);
  // (3) low-frequency pressure thump: filtered noise, never a sine
  shapedNoise(dry, n, sr, rand, () => p.subFc, t => (t < 0.0025 ? t / 0.0025 : 1) * Math.exp(-t / p.subTau), p.sub * 3.4);
  // (1) supersonic N-wave crack: a +/- sawtooth pulse a fraction of a millisecond wide plus a very short HF burst
  if (p.crack > 0) {
    const w = Math.max(3, Math.floor(sr * p.crackMs / 1000));
    for (let i = 0; i < w * 2 && i < n; i++) dry[i] += p.crack * (i < w ? 1 - (2 * i) / w : -1 + (i - w) / w) * 1.6 * Math.exp(-i / (w * 1.6));
    let hp = 0, prev = 0;
    for (let i = 0; i < Math.floor(sr * 0.006); i++) { const x = shared() * 2 - 1; hp = 0.82 * (hp + x - prev); prev = x; dry[i] += hp * p.crack * 0.9 * Math.exp(-i / (sr * 0.0012)); }
  }
  // (4) action: damped metallic resonances + a click of noise
  const clack = (t0, amp, freqs) => {
    const s0 = Math.floor(t0 * sr);
    for (let k = 0; k < freqs.length; k++) for (let i = 0; i < sr * 0.03 && s0 + i < n; i++) dry[s0 + i] += amp / (k + 1) * Math.sin(2 * Math.PI * freqs[k] * i / sr) * Math.exp(-i / (sr * (0.005 - k * 0.001)));
    for (let i = 0; i < sr * 0.004 && s0 + i < n; i++) dry[s0 + i] += amp * 0.6 * (shared() * 2 - 1) * Math.exp(-i / (sr * 0.0008));
  };
  clack(p.mech, p.mechAmp, [1900, 3300, 5200]);
  if (p.cycle) { clack(p.cycle, p.cycleAmp, [1400, 2500]); clack(p.cycle + 0.09, p.cycleAmp * 0.8, [1700, 3000, 4600]); }
  // reflections: delayed, darker copies of the dry shot (different delays per side for width)
  for (let i = 0; i < n; i++) out[i] = dry[i];
  for (const [delay, gain] of p.echoes) {
    const d = Math.floor(delay * sr * (side ? 1.13 : 1)), g = gain * (0.85 + rand() * 0.3); let lp = 0; const a = 1 - Math.exp(-2 * Math.PI * (3200 - delay * 4000) / sr);
    for (let i = 0; i + d < n; i++) { lp += a * (dry[i] - lp); out[i + d] += lp * g; }
  }
  // (5) diffuse tail that darkens as it decays
  shapedNoise(out, n, sr, rand, t => 400 + 2600 * Math.exp(-t / (p.tail * 0.5)), t => (t < 0.02 ? t / 0.02 : 1) * Math.exp(-(t - 0.02) / p.tail) * (t > 0.02 ? 1 : 1), p.tailAmp * 1.6, 0.025);
  return { out, p };
}

/** Renders one shot. Returns two channels normalised to the profile's level. */
export function synthShot(name, sampleRate = 48000, seed = 1) {
  const chans = [0, 1].map(s => renderChannel(name, sampleRate, seed, s)), p = chans[0].p;
  let peak = 1e-9;
  for (const { out } of chans) {
    // soft clip (mic/limiter) then remove DC / sub-audible drift
    let hp = 0, prev = 0;
    for (let i = 0; i < out.length; i++) { const x = Math.tanh(out[i] * p.drive * 0.35); hp = 0.9975 * (hp + x - prev); prev = x; out[i] = hp; peak = Math.max(peak, Math.abs(hp)); }
  }
  const k = p.level / peak, fade = Math.floor(sampleRate * 0.02);
  for (const { out } of chans) { for (let i = 0; i < out.length; i++) out[i] *= k; for (let i = 0; i < fade; i++) out[out.length - 1 - i] *= i / fade; }
  return { left: chans[0].out, right: chans[1].out, sampleRate };
}
