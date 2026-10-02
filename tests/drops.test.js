import test from 'node:test';
import assert from 'node:assert/strict';
import { MapLibrary } from '../server/server.js';
import { Room } from '../server/Room.js';
import { Inventory } from '../shared/inventory.js';
import { neutralInput } from '../shared/constants.js';
import { SLOT } from '../shared/weapons.js';

const library = await new MapLibrary(await MapLibrary.locate()).init();
const map = await library.get('sahara');
const mk = () => new Room('DROP01', map, map.nav, { timing: { warmup: 0.05, freeze: 0.1, round: 60, post: 1 } });
const seqs = new Map();
function send(room, id, o = {}) {
  const p = room.players.get(id), seq = (seqs.get(id) ?? -1) + 1; seqs.set(id, seq);
  room.enqueue(id, [{ ...neutralInput(), yaw: p.char.yaw, pitch: p.char.pitch, viewTick: room.tick, seq, ...o }]);
}
function live(room) { room.start(); while (room.phase !== 'live') room.step(); }

test('inventory: G drops the held gun with its ammo, never the knife', () => {
  const inv = new Inventory('TERRORIST'); inv.give('ak47', { select: true }); inv.time = inv.drawUntil + 1; inv.ammo.ak47.mag = 17;
  const ev = inv.step({ ...neutralInput(), drop: true }, { canFire: true }).find(e => e.type === 'drop');
  assert.deepEqual(ev, { type: 'drop', weapon: 'ak47', ammo: { mag: 17, reserve: 90 }, skin: null });
  assert.equal(inv.slots[1], null); assert.equal(inv.current, 2, 'falls back to the pistol');
  inv.step({ ...neutralInput(), drop: true }); inv.step({ ...neutralInput() });
  inv.step({ ...neutralInput(), slot: 3 }); const k = inv.step({ ...neutralInput(), drop: true });
  assert.equal(k.find(e => e.type === 'drop'), undefined); assert.equal(inv.slots[3], 'knife');
});

test('server: dropped gun flies, lands, keeps ammo and is picked up with E by another player (swap)', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'), b = room.add('b', 'B', 'TERRORIST'); room.add('c', 'C', 'COUNTER_TERRORIST'); live(room);
  a.inv.give('awp', { select: true }); a.inv.ammo.awp.mag = 3; a.inv.drawUntil = 0;
  send(room, 'a', { drop: true }); room.step();
  assert.equal(a.inv.slots[SLOT.PRIMARY], null); assert.equal(room.drops.length, 1);
  const start = { ...room.drops[0] };
  for (let i = 0; i < 128; i++) room.step();
  const d = room.drops[0]; assert.ok(Math.hypot(d.x - start.x, d.z - start.z) > 1, 'thrown forward'); assert.equal(d.rest > 8, true, 'came to rest');
  assert.equal(room.snapshot('b').drops[0].weapon, 'awp');
  // b holds an AK: walking over does not auto-swap, E looking at it does
  b.inv.give('ak47', { select: true });
  Object.assign(b.char, { x: d.x + 0.8, z: d.z, y: d.y, vx: 0, vy: 0, vz: 0 }); b.char.yaw = Math.PI / 2; b.char.pitch = -1.0;
  room.step(); assert.equal(b.inv.slots[SLOT.PRIMARY], 'ak47', 'no auto swap');
  send(room, 'b', { interact: true, yaw: Math.PI / 2, pitch: -1.0 }); room.step();
  assert.equal(b.inv.slots[SLOT.PRIMARY], 'awp'); assert.equal(b.inv.ammoOf('awp').mag, 3, 'ammo travels with the weapon');
  assert.ok(room.drops.some(q => q.weapon === 'ak47'), 'the AK was dropped in exchange');
});

test('server: empty slot picks up by walking over it; dead players drop their primary', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'); const c = room.add('c', 'C', 'COUNTER_TERRORIST'); live(room);
  c.inv.give('m4a4', { select: true });
  room.kill(c, a, 'ak47', false);
  assert.equal(room.drops.length, 1); assert.equal(room.drops[0].weapon, 'm4a4');
  for (let i = 0; i < 40; i++) room.step();                 // lands before the post-round cleanup
  const d = room.drops[0]; Object.assign(a.char, { x: d.x, z: d.z, y: d.y });
  room.step();
  assert.equal(a.inv.slots[SLOT.PRIMARY], 'm4a4', 'walked over and picked it up'); assert.equal(room.drops.length, 0);
});

test('server: C4 can be thrown with G and picked back up by a T', () => {
  const room = mk(); const t = room.add('t', 'T', 'TERRORIST'); room.add('c', 'C', 'COUNTER_TERRORIST'); live(room);
  const carrier = [...room.players.values()].find(p => p.inv.slots[SLOT.OBJECTIVE] === 'c4');
  assert.ok(carrier);
  carrier.inv.select(SLOT.OBJECTIVE, { force: true }); carrier.inv.drawUntil = 0;
  send(room, carrier.id, { drop: true }); room.step();
  assert.equal(room.bomb.state, 'dropped');
  const from = { x: carrier.char.x, z: carrier.char.z };
  for (let i = 0; i < 100; i++) room.step();
  const b = room.bomb; assert.equal(b.state, 'dropped'); assert.ok(Math.hypot(b.x - from.x, b.z - from.z) > 0.8, 'thrown away from the carrier');
  Object.assign(carrier.char, { x: b.x, y: b.y, z: b.z, vx: 0, vy: 0, vz: 0 }); room.step(); room.step();
  assert.equal(room.bomb.state, 'carried', 'a T standing on it picks it back up');
  void t;
});

test('loadout preference: starting pistol per side survives resets and snapshot loads', () => {
  const inv = new Inventory('COUNTER_TERRORIST'); inv.preferred = { COUNTER_TERRORIST: 'p250', TERRORIST: 'glock' }; inv.reset('COUNTER_TERRORIST');
  assert.equal(inv.slots[2], 'p250');
  inv.load(new Inventory('COUNTER_TERRORIST').toJSON()); inv.reset('COUNTER_TERRORIST'); assert.equal(inv.slots[2], 'p250');
  inv.preferred = { COUNTER_TERRORIST: 'deagle' }; inv.reset('COUNTER_TERRORIST'); assert.equal(inv.slots[2], 'usp', 'only legal starting pistols');
});

test('a picked-up gun keeps its owner\'s skin; a skinless one stays standard for the picker', () => {
  const room = mk(); const a = room.add('a', 'A'), b = room.add('b', 'B', 'TERRORIST'); room.add('c', 'C', 'COUNTER_TERRORIST'); live(room);
  a.skins = { TERRORIST: { awp: { finish: 'tiger', wear: 0.2 } }, COUNTER_TERRORIST: { awp: { finish: 'tiger', wear: 0.2 } } };
  b.skins = { TERRORIST: { awp: { finish: 'gold', wear: 0.05 } }, COUNTER_TERRORIST: { awp: { finish: 'gold', wear: 0.05 } } };
  a.inv.give('awp', { select: true });
  const d = room.spawnDrop(a, 'awp', { mag: 30, reserve: 90 }, 0, room.skinOf(a, 'awp'));
  assert.deepEqual(d.skin, { finish: 'tiger', wear: 0.2 });
  room.pickUp(b, d);
  assert.deepEqual(b.inv.skins.awp, { finish: 'tiger', wear: 0.2 }, 'B shows A\'s skin, not their own gold');
  assert.deepEqual(room.skinOf(b, 'awp'), { finish: 'tiger', wear: 0.2 });
  // dropping it again passes the same skin on
  const again = room.spawnDrop(b, 'awp', { mag: 30, reserve: 90 }, 0, room.skinOf(b, 'awp'));
  assert.equal(again.skin.finish, 'tiger');
  // a skinless gun (bot / guest) stays standard instead of taking the picker's skin
  const plain = room.spawnDrop(room.players.get('c'), 'awp', { mag: 30, reserve: 90 }, 0, null);
  delete b.inv.skins.awp; b.inv.slots[SLOT.PRIMARY] = null; room.pickUp(b, plain);
  assert.equal(b.inv.skins.awp.finish, 'standard');
  // a weapon B buys is their own again
  b.inv.slots[SLOT.PRIMARY] = null; b.money = 10000; room.buyUntil = room.tick + 100; assert.equal(room.buy('b', 'awp').error, undefined);
  assert.equal(b.inv.skins.awp, undefined); assert.equal(room.skinOf(b, 'awp').finish, 'gold');
});
