// Generates client/public/maps/*.glb (+ manifest.json) from the painted level definitions.
// Any *.glb dropped into client/public/maps is picked up too: run `npm run maps` to refresh the manifest.
import { mkdir, writeFile, readdir, readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeGLB, parseGLB } from '../shared/glb.js';
import { buildSahara } from './maps/sahara.mjs';
import { buildHarbor } from './maps/harbor.mjs';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../client/public/maps');
await mkdir(out, { recursive: true });

const BUILT_IN = {
  sahara: { build: buildSahara, name: 'SAHARA OUTPOST', subtitle: 'Cho‘l shahri. Uch yo‘lak, ko‘tarilgan A hududi.', env: { sky: 'day', sun: [-0.45, 0.72, 0.38], sunColor: '#ffe1b0', sunIntensity: 3.4, exposure: 1.0, fog: '#d9c9a6', fogDensity: 0.006, ambient: '#b7c8d6' } },
  harbor: { build: buildHarbor, name: 'IRON HARBOR', subtitle: 'Konteyner terminali. Omborxona va kran maydoni.', env: { sky: 'overcast', sun: [0.4, 0.58, -0.35], sunColor: '#e8efff', sunIntensity: 2.6, exposure: 1.0, fog: '#a8b6bc', fogDensity: 0.009, ambient: '#a6b6c4' } },
};

const manifest = { version: 1, maps: [] };
for (const [id, def] of Object.entries(BUILT_IN)) {
  const built = def.build();
  const bytes = writeGLB({ materials: built.materials, meshes: built.meshes, markers: built.markers });
  await writeFile(resolve(out, `${id}.glb`), bytes);
  const bounds = { x: built.map.cols * built.map.cell, z: built.map.rows * built.map.cell };
  manifest.maps.push({ id, name: def.name, subtitle: def.subtitle, file: `${id}.glb`, env: def.env, bounds, builtIn: true });
  await writeFile(resolve(out, `${id}.txt`), built.map.grid.map(r => r.join('')).join('\n') + '\n');
  console.log(`${id}.glb  ${(bytes.length / 1024).toFixed(0)} KiB  ${built.meshes.length} meshes`);
}
// user supplied maps (e.g. de_dust2.glb, de_mirage.glb with spawn_T_n / spawn_CT_n / site_A / site_B nodes)
for (const file of (await readdir(out)).filter(f => f.endsWith('.glb') && !f.endsWith('.collision.glb'))) {
  const id = basename(file, '.glb');
  if (BUILT_IN[id]) continue;
  try {
    const parsed = parseGLB(new Uint8Array(await readFile(resolve(out, file))));
    const has = n => parsed.markers.some(m => m.name === n);
    const ok = has('spawn_T_1') && has('spawn_CT_1') && has('site_A') && has('site_B');
    const pretty = id.replace(/^de_/, '').replace(/[_-]/g, ' ').toUpperCase();
    manifest.maps.push({ id, name: pretty, subtitle: 'Foydalanuvchi GLB xaritasi', file, collision: (await readdir(out)).includes(`${id}.collision.glb`) ? `${id}.collision.glb` : undefined,
      env: { sky: 'day', sun: [-0.4, 0.7, 0.4], sunColor: '#fff0d0', sunIntensity: 3.2, exposure: 1.0, fog: '#cdbfa2', fogDensity: 0.004, ambient: '#b7c8d6' }, bounds: null, valid: ok });
    if (!ok) console.warn(`${file}: missing spawn_T_1 / spawn_CT_1 / site_A / site_B marker nodes`);
  } catch (error) { console.warn(`${file}: skipped (${error.message})`); }
}
await writeFile(resolve(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`manifest.json: ${manifest.maps.map(m => m.id).join(', ')}`);
