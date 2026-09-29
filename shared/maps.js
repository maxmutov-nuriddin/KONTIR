// Map registry helpers shared by server (Node) and client (browser): turn a GLB into physics + gameplay data.
import { parseGLB } from './glb.js';
import { MeshCollider } from './collision.js';

/**
 * @param {object} meta  manifest entry { id, name, subtitle, env, ... }
 * @param {Uint8Array} bytes  collision GLB bytes (uncompressed)
 */
export function buildMapData(meta, bytes) {
  const parsed = parseGLB(bytes);
  const solid = parsed.meshes.filter(m => !/^(nocollide|decor|skybox|nc_)/i.test(m.name) && !/^(nocollide|glass_decor)/i.test(m.material));
  if (!solid.length) throw new Error(`${meta.id}: GLB has no collidable meshes`);
  const collider = new MeshCollider(solid);
  const byName = (prefix) => parsed.markers.filter(m => m.name.toLowerCase().startsWith(prefix)).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  const spawns = {
    TERRORIST: byName('spawn_t_').map(m => ({ x: m.x, y: m.y, z: m.z, yaw: m.yaw || 0 })),
    COUNTER_TERRORIST: byName('spawn_ct_').map(m => ({ x: m.x, y: m.y, z: m.z, yaw: m.yaw || Math.PI })),
  };
  for (const team of Object.keys(spawns)) {
    if (!spawns[team].length) throw new Error(`${meta.id}: no spawn markers for ${team}`);
    // snap spawns onto the floor so a slightly floating marker cannot drop players through geometry
    for (const s of spawns[team]) { const y = collider.floorHeight(s.x, s.y + 2.5, s.z, 10); if (y !== null) s.y = y; }
  }
  const sites = ['A', 'B'].map(id => {
    const m = parsed.markers.find(k => k.name.toLowerCase() === `site_${id.toLowerCase()}`);
    if (!m) throw new Error(`${meta.id}: missing site_${id}`);
    return { id, x: m.x, y: m.y, z: m.z, radius: Math.max(3, m.sx || 5) };
  });
  const b = collider.bounds;
  return { ...meta, collider, spawns, sites, bounds3: { min: [b.min.x, b.min.y, b.min.z], max: [b.max.x, b.max.y, b.max.z] } };
}

export const MAP_MANIFEST_URL = '/maps/manifest.json';
