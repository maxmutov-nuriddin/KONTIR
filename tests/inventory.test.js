import test from 'node:test';
import assert from 'node:assert/strict';
import { Inventory } from '../shared/inventory.js';
import { WEAPONS, computeDamage, rayHitPlayer, samplePattern } from '../shared/weapons.js';
import { neutralInput, TICK_RATE } from '../shared/constants.js';

const cmd = (o = {}) => ({ ...neutralInput(), ...o });
const idle = (inv, n, o = {}) => { const ev = []; for (let i = 0; i < n; i++) ev.push(...inv.step(cmd(o))); return ev; };
const armed = () => { const inv = new Inventory('TERRORIST'); inv.give('ak47', { select: true }); inv.give('c4'); inv.give('he'); inv.give('flash'); inv.give('smoke'); idle(inv, 200); return inv; };

test('slot architecture: 1 primary, 2 secondary, 3 melee, 4 utilities, 5 objective', () => {
  const inv = armed();
  assert.equal(inv.weaponId(1), 'ak47'); assert.equal(inv.weaponId(2), 'glock'); assert.equal(inv.weaponId(3), 'knife');
  assert.ok(inv.has(4)); assert.equal(inv.weaponId(5), 'c4');
});
test("number keys select slots; 'Q' alternates current <-> previous", () => {
  const inv = armed();
  assert.equal(inv.current, 1);
  inv.step(cmd({ slot: 2 })); assert.deepEqual([inv.current, inv.previous], [2, 1]);
  idle(inv, 100);
  inv.step(cmd({ quick: true })); assert.deepEqual([inv.current, inv.previous], [1, 2]);
  idle(inv, 100);
  inv.step(cmd({ quick: true })); assert.deepEqual([inv.current, inv.previous], [2, 1]);
  inv.step(cmd({ slot: 3 })); idle(inv, 40);
  inv.step(cmd({ quick: true })); assert.equal(inv.current, 2, 'Q returns to the slot used before the knife');
});
test('switching locks firing for drawTime and cancels reload', () => {
  const inv = armed();
  const before = inv.ammoOf('ak47').mag;
  inv.step(cmd({ slot: 2 })); inv.step(cmd({ quick: true }));
  const drawn = inv.weapon().drawTime / 1000 * TICK_RATE;
  const early = idle(inv, Math.floor(drawn) - 4, { fire: true });
  assert.equal(early.filter(e => e.type === 'shot').length, 0, 'no shot while drawing');
  const late = idle(inv, 20, { fire: true });
  assert.ok(late.some(e => e.type === 'shot'));
  assert.equal(inv.ammoOf('ak47').mag, before - late.filter(e => e.type === 'shot').length);
  inv.step(cmd({ reload: true })); assert.ok(inv.reloading);
  inv.step(cmd({ slot: 3 })); assert.equal(inv.reloading, false);
});
test('quick-switch falls back when the previous slot is empty (planted C4)', () => {
  const inv = armed();
  inv.step(cmd({ slot: 5 })); idle(inv, 60);
  inv.remove('c4');
  assert.notEqual(inv.current, 5); assert.ok(inv.has(inv.current));
  const t = new Inventory('COUNTER_TERRORIST'); t.step(cmd({ quick: true })); assert.equal(t.current, 3);
});
test('rifle rate of fire matches interval and the recoil pattern climbs then recovers', () => {
  const inv = armed();
  const shots = idle(inv, 64, { fire: true }).filter(e => e.type === 'shot');
  assert.ok(shots.length >= 9 && shots.length <= 11, `AK fires ~10/s, got ${shots.length}`);
  assert.equal(shots[0].punch.pitch, 0, 'first bullet is accurate');
  assert.ok(shots[5].punch.pitch > shots[1].punch.pitch, 'pattern climbs');
  const peak = inv.punch().pitch; assert.ok(peak > 0.1);
  idle(inv, 30, {}); assert.ok(inv.punch().pitch < peak, 'recovery after releasing fire');
  idle(inv, 200, {}); assert.equal(inv.shots, 0);
});
test('semi-auto pistols need a fresh click; magazines and reload work', () => {
  const inv = new Inventory('COUNTER_TERRORIST'); idle(inv, 100);
  const held = idle(inv, 64, { fire: true }).filter(e => e.type === 'shot');
  assert.equal(held.length, 1); idle(inv, 2);
  for (let i = 0; i < 19; i++) { inv.step(cmd({ fire: true })); idle(inv, 12); }
  assert.equal(inv.ammoOf('glock').mag, 0);
  const ev = idle(inv, 200, { reload: true });
  assert.ok(ev.some(e => e.type === 'reloadStart') && ev.some(e => e.type === 'reloaded'));
  assert.equal(inv.ammoOf('glock').mag, 20);
});
test('grenades: slot 4 cycles HE/Flash/Smoke, throw on release consumes and auto-switches', () => {
  const inv = armed();
  inv.step(cmd({ slot: 4 })); idle(inv, 60); const first = inv.weaponId();
  inv.step(cmd({ slot: 4 })); idle(inv, 60); assert.notEqual(inv.weaponId(), first);
  inv.step(cmd({ fire: true })); const ev = inv.step(cmd({ fire: false }));
  assert.ok(ev.some(e => e.type === 'throw'));
  assert.ok(inv.totalGrenades() < 4);
});
test('damage model: AK headshot one-shots unarmoured, armour absorbs, range falloff', () => {
  const ak = WEAPONS.ak47;
  assert.ok(computeDamage(ak, 5, 'head', 0, false).health >= 140);
  assert.equal(computeDamage(ak, 5, 'chest', 0, false).health, 36);
  const armored = computeDamage(ak, 5, 'chest', 100, true);
  assert.ok(armored.health < 30 && armored.armor > 0);
  assert.ok(computeDamage(ak, 50, 'chest', 0, false).health < 36);
  assert.ok(computeDamage(ak, 5, 'leg', 0, false).health < 30);
});
test('hitboxes: head above chest, yaw rotation respected, crouch scales hull', () => {
  const p = { x: 0, y: 0, z: 0, yaw: 0, crouch: 0 };
  assert.equal(rayHitPlayer({ x: 0, y: 1.65, z: 5 }, { x: 0, y: 0, z: -1 }, p, 50).part, 'head');
  assert.equal(rayHitPlayer({ x: 0, y: 1.3, z: 5 }, { x: 0, y: 0, z: -1 }, p, 50).part, 'chest');
  assert.equal(rayHitPlayer({ x: 0, y: 0.4, z: 5 }, { x: 0, y: 0, z: -1 }, p, 50).part, 'leg');
  assert.equal(rayHitPlayer({ x: 0, y: 1.65, z: 5 }, { x: 0, y: 0, z: -1 }, { ...p, crouch: 1 }, 50), null, 'crouched head is lower');
  assert.equal(rayHitPlayer({ x: 2, y: 1.3, z: 5 }, { x: 0, y: 0, z: -1 }, p, 50), null);
  const side = rayHitPlayer({ x: 5, y: 1.3, z: 0 }, { x: -1, y: 0, z: 0 }, { ...p, yaw: Math.PI / 2 }, 50);
  assert.ok(side && side.distance > 4.5);
});
test('inventory serialisation round-trips for client reconciliation', () => {
  const a = armed(); a.step(cmd({ fire: true }));
  const b = Inventory.from(JSON.parse(JSON.stringify(a.toJSON())));
  const c1 = cmd({ fire: true }); assert.deepEqual(a.step(c1), b.step(c1)); assert.deepEqual(a.toJSON(), b.toJSON());
  assert.ok(samplePattern(WEAPONS.ak47, 3.5).pitch > samplePattern(WEAPONS.ak47, 3).pitch);
});
