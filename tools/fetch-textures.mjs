// Downloads scanned CC0 PBR texture sets from Poly Haven (https://polyhaven.com, CC0) for the map material recipes in
// client/src/materials.js and writes client/public/textures/<recipe>/{diff,nor,arm}.jpg + manifest.json.
// Missing sets fall back to the procedural canvas textures. Usage: node tools/fetch-textures.mjs [--res 1k|2k]
import { writeFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const out = resolve(dirname(fileURLToPath(import.meta.url)), '../client/public/textures');
const res = process.argv.includes('--res') ? process.argv[process.argv.indexOf('--res') + 1] : '1k';
// recipe -> [Poly Haven id, keep the GLB colour as a tint?]
const SETS = {
  sand: ['dense_sand', false], asphalt: ['asphalt_02', false], concrete: ['brushed_concrete', false],
  plaster: ['painted_plaster_wall', true], brick: ['brick_wall_001', false], stone: ['stone_wall', true],
  paving: ['patterned_paving', false], wood: ['brown_planks_03', true], crate: ['brown_planks_03', true],
  metal: ['metal_plate', false], rust: ['rusty_metal_02', false], container: ['corrugated_iron', true],
  cladding: ['worn_corrugated_iron', false],
};
const get = async url => { const r = await fetch(url, { headers: { 'User-Agent': 'kontir-texture-fetch' } }); if (!r.ok) throw new Error(`${r.status} ${url}`); return r; };
const manifest = {};
for (const [recipe, [id, tint]] of Object.entries(SETS)) {
  try {
    const [files, info] = await Promise.all([get(`https://api.polyhaven.com/files/${id}`).then(r => r.json()), get(`https://api.polyhaven.com/info/${id}`).then(r => r.json())]);
    const pick = key => files[key]?.[res]?.jpg?.url || files[key]?.['1k']?.jpg?.url;
    const urls = { diff: pick('Diffuse'), nor: pick('nor_gl'), arm: pick('arm') };
    if (!urls.diff || !urls.nor || !urls.arm) throw new Error('missing maps');
    await mkdir(resolve(out, recipe), { recursive: true });
    for (const [k, url] of Object.entries(urls)) await writeFile(resolve(out, recipe, `${k}.jpg`), Buffer.from(await (await get(url)).arrayBuffer()));
    const [w, h] = (info.dimensions || [2000, 2000]).map(mm => mm / 1000);       // physical size, metres
    manifest[recipe] = { id, size: [w, h], tint, author: Object.keys(info.authors || {}).join(', ') };
    console.log(`${recipe.padEnd(10)} <- ${id} (${w} x ${h} m)`);
  } catch (e) { console.warn(`${recipe}: ${e.message}`); }
}
await writeFile(resolve(out, 'manifest.json'), JSON.stringify({ source: 'Poly Haven (CC0)', res, sets: manifest }, null, 2));
