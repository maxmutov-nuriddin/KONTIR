// Bakes gunshot variants off the main thread (the DSP takes 40-170 ms per weapon, which froze the game on first shots).
import { synthShot } from './gunsynth.js';

self.onmessage = event => {
  const { name, sampleRate, seeds } = event.data;
  const variants = seeds.map(seed => { const s = synthShot(name, sampleRate, seed); return [s.left, s.right]; });
  self.postMessage({ name, variants }, variants.flat().map(a => a.buffer));
};
