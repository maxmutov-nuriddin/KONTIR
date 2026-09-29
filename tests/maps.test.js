import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshCollider } from '../shared/collision.js';
import { boxMesh } from '../shared/geometry.js';
import { Navigation } from '../server/Navigation.js';
import { MapLibrary } from '../server/server.js';
import { MOVEMENT as M } from '../shared/constants.js';
import { createPlayer, stepPlayer } from '../shared/movement.js';
import { neutralInput, DT } from '../shared/constants.js';

const library = await new MapLibrary(await MapLibrary.locate()).init();

for (const meta of library.list()) {
  test(`map ${meta.id}: markers, free spawns, navigable T -> A/B <- CT, no falling through`, async () => {
    const map = await library.get(meta.id);
    assert.equal(map.spawns.TERRORIST.length >= 5, true); assert.equal(map.spawns.COUNTER_TERRORIST.length >= 5, true);
    assert.equal(map.sites.length, 2);
    for (const team of Object.keys(map.spawns)) for (const s of map.spawns[team]) {
      assert.equal(map.collider.capsuleBlocked(s.x, s.y + 0.02, s.z, M.radius, M.standHeight), false, `${team} spawn inside geometry at ${s.x},${s.z}`);
    }
    const T = map.spawns.TERRORIST[0], CT = map.spawns.COUNTER_TERRORIST[0];
    for (const site of map.sites) {
      assert.ok(map.nav.path(T, site).length > 5, `T -> ${site.id}`);
      assert.ok(map.nav.path(CT, site).length > 5, `CT -> ${site.id}`);
      const start = map.nav.nearest(site.x, site.z); assert.ok(map.nav.walkable[start], `site ${site.id} has walkable floor`);
    }
    assert.ok(map.nav.path(T, CT).length > 20, 'teams can reach each other');
    // a player dropped from the sky lands on every spawn (BVH floor) and stays there
    for (const s of [...map.spawns.TERRORIST, ...map.spawns.COUNTER_TERRORIST]) {
      const p = createPlayer({ x: s.x, y: s.y + 6, z: s.z, yaw: 0 }); p.grounded = false;
      for (let i = 0; i < 200; i++) stepPlayer(p, neutralInput(), map.collider, DT);
      assert.ok(p.grounded && Math.abs(p.y - s.y) < 0.15, `lands on floor (y=${p.y.toFixed(2)} vs ${s.y.toFixed(2)})`);
    }
    // running into the outer wall never leaks out of the map
    const p = createPlayer({ x: T.x, y: T.y, z: T.z, yaw: Math.PI / 2 });
    for (let i = 0; i < 64 * 30; i++) stepPlayer(p, { ...neutralInput(), forward: 1, yaw: (Math.PI / 2) * (((i / 300) | 0) % 4) }, map.collider, DT);
    assert.ok(Math.abs(p.x) < 70 && Math.abs(p.z) < 80 && p.y > -1, `stayed inside (${p.x.toFixed(1)}, ${p.y.toFixed(1)}, ${p.z.toFixed(1)})`);
  });
}


test('navigation supports maps translated away from the world origin', () => {
  const collider = new MeshCollider([boxMesh('floor', 'stone', 100, -0.5, 200, 30, 1, 30)]);
  const nav = new Navigation(collider);
  assert.ok(nav.cols > 10 && nav.rows > 10);
  assert.ok(nav.path({ x: 90, z: 190 }, { x: 110, z: 210 }).length > 5);
});
