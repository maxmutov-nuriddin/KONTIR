// Scans client/public/models/{weapons,characters,props}/*.glb and writes models.json, the list the game (and the
// map builder, for props) uses to swap procedural geometry for real 3D models. Runs automatically before dev/start/build.
import { readdir, writeFile, mkdir, readFile } from 'node:fs/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../client/public/models');
const list = async dir => { try { return (await readdir(resolve(root, dir))).filter(f => /\.(glb|gltf)$/i.test(f)); } catch { return []; } };
await mkdir(root, { recursive: true });
const manifest = { version: 1, weapons: {}, characters: {}, props: {} };
for (const f of await list('weapons')) manifest.weapons[basename(f).replace(/\.(glb|gltf)$/i, '').toLowerCase()] = `weapons/${f}`;
for (const f of await list('props')) manifest.props[basename(f).replace(/\.(glb|gltf)$/i, '').toLowerCase()] = `props/${f}`;
for (const f of await list('characters')) {
  const id = basename(f).replace(/\.(glb|gltf)$/i, '').toLowerCase();
  const team = /^(ct|counter)/.test(id) ? 'COUNTER_TERRORIST' : /^(t|terror)/.test(id) ? 'TERRORIST' : null;
  if (team) manifest.characters[team] = `characters/${f}`;
}
// only touch the file when the list changed: map rebuilds key off its timestamp
const text = JSON.stringify(manifest, null, 2), file = resolve(root, 'models.json');
if ((await readFile(file, 'utf8').catch(() => '')) !== text) await writeFile(file, text);
const n = Object.keys(manifest.weapons).length + Object.keys(manifest.characters).length + Object.keys(manifest.props).length;
console.log(`models.json: ${n} model(s)${n ? ` — ${[...Object.keys(manifest.weapons), ...Object.keys(manifest.characters), ...Object.keys(manifest.props)].join(', ')}` : ' (procedural fallbacks in use)'}`);
