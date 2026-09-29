import test from 'node:test';
import assert from 'node:assert/strict';
import { MapLibrary } from '../server/server.js';
import { Room } from '../server/Room.js';
import { Inventory } from '../shared/inventory.js';
import { BUY_ITEMS, WEAPONS, GRENADES, inaccuracy } from '../shared/weapons.js';
import { neutralInput } from '../shared/constants.js';

const library = await new MapLibrary(await MapLibrary.locate()).init();
const map = await library.get('sahara');
const mk = () => new Room('NEW001', map, map.nav, { timing: { warmup: 0.05, freeze: 5, round: 30, post: 1 } });

test('every buy item exists, has a model id and correct team restriction', () => {
  for (const [id, def] of Object.entries(BUY_ITEMS)) {
    if (['kevlar', 'helmet', 'defuser'].includes(id)) continue;
    assert.ok(WEAPONS[id], id); assert.equal(WEAPONS[id].price, def.price, `${id} price`); assert.equal(WEAPONS[id].team ?? undefined, def.team, `${id} team`);
  }
  assert.ok(GRENADES.includes('molotov') && GRENADES.includes('incendiary') && GRENADES.includes('decoy'));
});

test('teams may only buy their own side items', () => {
  const room = mk(); const t = room.add('t', 'T', 'TERRORIST'), c = room.add('c', 'C', 'COUNTER_TERRORIST'); room.start(); t.money = c.money = 16000;
  for (const id of ['mac10', 'tec9', 'molotov', 'nova', 'ssg08', 'p250', 'decoy']) assert.ok(room.buy('t', id).ok, `T buys ${id}`);
  for (const id of ['mp9', 'fiveseven', 'incendiary']) assert.ok(room.buy('t', id).error, `T cannot buy ${id}`);
  for (const id of ['mp9', 'fiveseven', 'incendiary', 'nova', 'ssg08']) assert.ok(room.buy('c', id).ok, `CT buys ${id}`);
  for (const id of ['mac10', 'tec9', 'molotov']) assert.ok(room.buy('c', id).error, `CT cannot buy ${id}`);
  assert.equal(t.inv.weaponId(1), 'ssg08'); assert.equal(t.inv.weaponId(2), 'p250');
});

test('scoped rifle: fire2 cycles zoom, resets on shot/switch and unscoped shots are inaccurate', () => {
  const inv = new Inventory('TERRORIST'); inv.give('ssg08', { select: true }); inv.time = inv.drawUntil + 1;
  const step = (o = {}) => inv.step({ ...neutralInput(), ...o }, { canFire: true });
  step({ fire2: true }); assert.equal(inv.zoom, 1); step(); step({ fire2: true }); assert.equal(inv.zoom, 0);
  step(); step({ fire2: true }); assert.equal(inv.zoom, 1); step();
  const ev = step({ fire: true }); assert.equal(ev.find(e => e.type === 'shot').zoom, 1, 'shot records the scope state'); assert.equal(inv.zoom, 0, 'bolt action unscopes');
  assert.ok(inaccuracy(WEAPONS.ssg08, { zoom: 0 }) > 20 * inaccuracy(WEAPONS.ssg08, { zoom: 1 }));
});

test('shotgun fires nine pellets: close range kills, far range is weak', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'), b = room.add('b', 'B', 'COUNTER_TERRORIST'); a.money = 16000; room.start();
  room.buy('a', 'nova'); while (room.phase !== 'live') room.step();
  const shoot = (dist) => {
    b.health = 100; b.armor = 0; b.helmet = false; b.alive = true; a.inv.time += 200; a.inv.nextFire = 0;
    const e = a.char; b.char.x = e.x - Math.sin(e.yaw) * dist; b.char.z = e.z - Math.cos(e.yaw) * dist; b.char.y = e.y; b.char.pitch = 0;
    a.inv.select(1, { force: true }); a.inv.drawUntil = 0; a.inv.ammo.nova = { mag: 8, reserve: 32 };
    const ev = { weapon: 'nova', index: 0, punch: { yaw: 0, pitch: 0 }, burst: 0, zoom: 0 };
    a.char.pitch = Math.atan2(b.char.y + 1.2 - (e.y + 1.65), dist);
    room.fireShot(a, ev, { ...neutralInput(), viewTick: room.tick });
    return 100 - b.health;
  };
  const near = shoot(2), far = shoot(30);
  assert.ok(near > far * 2, `near ${near} far ${far}`); assert.ok(near >= 60, `near shot should be heavy (${near})`);
});

test('molotov burns enemies (not team-mates) and a smoke extinguishes it; decoy emits gunfire events', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'), b = room.add('b', 'B', 'COUNTER_TERRORIST'), m = room.add('m', 'M', 'TERRORIST'); a.money = 16000; room.start();
  while (room.phase !== 'live') room.step();
  const spot = { x: b.char.x, y: b.char.y, z: b.char.z };
  room.detonate({ type: 'molotov', id: 900, owner: 'a', team: 'TERRORIST', ...spot });
  m.char.x = spot.x; m.char.z = spot.z; m.char.y = spot.y;
  const hp = [b.health, m.health]; for (let i = 0; i < 64 * 2; i++) room.step();
  assert.ok(b.health < hp[0] - 10, 'enemy burns'); assert.equal(m.health, hp[1], 'team-mate is safe');
  assert.equal(room.snapshot('a').fires.length, 1);
  room.smokes.push({ id: 5, x: spot.x, y: spot.y + 1.2, z: spot.z, radius: 4, start: room.tick, end: room.tick + 640 }); room.step(); room.step();
  assert.equal(room.fires.length, 0, 'smoke douses the fire');
  room.detonate({ type: 'decoy', id: 901, owner: 'a', team: 'TERRORIST', x: spot.x, y: spot.y, z: spot.z });
  assert.equal(room.decoys.length, 1);
  const seen = []; const emit = room.emit.bind(room); room.emit = (type, data) => { if (type === 'decoy') seen.push(data); return emit(type, data); };
  for (let i = 0; i < 64 * 3; i++) room.step();
  assert.ok(seen.length >= 2 && seen.every(e => e.weapon === 'ssg08' || WEAPONS[e.weapon]), 'decoy replays gunfire');
});
