import test from 'node:test';
import assert from 'node:assert/strict';
import { SHOT_PROFILES, synthShot } from '../client/src/gunsynth.js';

const rms = (a, s, e) => { let x = 0; for (let i = s; i < e; i++) x += a[i] * a[i]; return Math.sqrt(x / Math.max(1, e - s)); };
/** crude spectral centroid via zero-crossing-free DFT on a short window */
const centroid = (a, s, len, sr) => {
  let num = 0, den = 0;
  for (let k = 2; k < len / 2; k += 2) { let re = 0, im = 0; for (let i = 0; i < len; i += 2) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / len), x = a[s + i] * w; re += x * Math.cos(2 * Math.PI * k * i / len); im -= x * Math.sin(2 * Math.PI * k * i / len); } const m = Math.hypot(re, im); num += m * k * sr / len; den += m; }
  return num / den;
};

test('every profile renders finite, normalised, decaying audio', () => {
  const sr = 24000;
  for (const name of Object.keys(SHOT_PROFILES)) {
    const s = synthShot(name, sr, 3);
    for (const ch of [s.left, s.right]) {
      let peak = 0; for (const v of ch) { assert.ok(Number.isFinite(v)); peak = Math.max(peak, Math.abs(v)); }
      assert.ok(peak > 0.3 && peak <= 0.95, `${name} peak ${peak}`);
      const early = rms(ch, 0, Math.floor(sr * 0.04)), late = rms(ch, Math.floor(sr * 0.4), Math.floor(sr * 0.5));
      assert.ok(early > late * 2, `${name} should decay (early ${early}, late ${late})`);
    }
  }
});

test('the transient is immediate and the spectrum falls with time (blast, not a tone)', () => {
  const sr = 24000, s = synthShot('ak47', sr, 1);
  let peakAt = 0, peak = 0; for (let i = 0; i < s.left.length; i++) if (Math.abs(s.left[i]) > peak) { peak = Math.abs(s.left[i]); peakAt = i; }
  assert.ok(peakAt / sr < 0.01, `peak at ${peakAt / sr}s`);
  assert.ok(centroid(s.left, 0, 512, sr) > centroid(s.left, Math.floor(sr * 0.25), 512, sr), 'high-frequency energy must decay faster than low');
});

test('the two channels are decorrelated (stereo width) and seeds differ', () => {
  const a = synthShot('m4a4', 24000, 1), b = synthShot('m4a4', 24000, 2);
  let same = 0; for (let i = 0; i < a.left.length; i++) if (a.left[i] === a.right[i]) same++;
  assert.ok(same < a.left.length * 0.05);
  assert.notDeepEqual(a.left.slice(0, 200), b.left.slice(0, 200));
  assert.deepEqual(synthShot('m4a4', 24000, 1).left.slice(0, 500), a.left.slice(0, 500), 'deterministic per seed');
});

test('heavier weapons are louder in the low band, suppressed pistol is quieter and duller', () => {
  const sr = 24000, low = n => { const s = synthShot(n, sr, 1); return rms(s.left, 0, Math.floor(sr * 0.1)); };
  assert.ok(low('awp') > 0 && synthShot('usp', sr, 1).left.length < synthShot('awp', sr, 1).left.length);
  const bright = n => { const a = synthShot(n, sr, 1).left, e = Math.floor(sr * 0.03); let d = 0, t = 0; for (let i = 1; i < e; i++) { d += (a[i] - a[i - 1]) ** 2; t += a[i] ** 2; } return d / t; };
  assert.ok(bright('usp') < bright('m4a4'), 'suppressed shot is duller');
  assert.ok(Math.max(...synthShot('usp', sr, 1).left.map(Math.abs)) < Math.max(...synthShot('m4a4', sr, 1).left.map(Math.abs)) + 1e-9);
});
