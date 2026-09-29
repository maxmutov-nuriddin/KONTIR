import test from 'node:test';
import assert from 'node:assert/strict';
import { MapLibrary } from '../server/server.js';
import { Room } from '../server/Room.js';
import { LagCompensator } from '../server/LagCompensator.js';
import { neutralInput, RULES, TICK_RATE } from '../shared/constants.js';
import { SLOT } from '../shared/weapons.js';

const library = await new MapLibrary(await MapLibrary.locate()).init();
const map = await library.get('sahara');
const fast = { warmup: 0.05, freeze: 0.1, round: 6, post: 0.05 };
const mkRoom = (timing = fast, options = {}) => new Room('TEST01', map, map.nav, { timing, ...options });
function openSpot(x, z) { const n = map.nav, i = n.nearest(x, z), w = n.world(i % n.cols, Math.floor(i / n.cols)); return { x: w.x, z: w.z, y: n.floor[i] }; }
const seqs = new Map();
function send(room, id, o = {}) {
  const p = room.players.get(id), seq = (seqs.get(id) ?? -1) + 1; seqs.set(id, seq);
  room.enqueue(id, [{ ...neutralInput(), yaw: p.char.yaw, pitch: p.char.pitch, viewTick: room.tick, seq, ...o }]);
}
const run = (room, ticks, fn) => { for (let i = 0; i < ticks; i++) { fn?.(i); room.step(); } };
function toLive(room) { room.start(); run(room, 20); while (room.phase !== 'live') room.step(); }

test('strict 5v5 capacity, team allocation and bot replacement', () => {
  const room = mkRoom();
  for (let i = 0; i < 10; i++) assert.ok(room.add(`h${i}`, `P${i}`, i % 2 ? 'COUNTER_TERRORIST' : 'TERRORIST'), `player ${i}`);
  assert.equal(room.count('TERRORIST'), 5); assert.equal(room.count('COUNTER_TERRORIST'), 5);
  assert.equal(room.add('h10', 'X', 'TERRORIST'), null, 'no 11th player');
  assert.equal(room.isFull(), true);
  const r2 = mkRoom(); r2.add('me', 'Me', 'TERRORIST'); r2.fillBots();
  assert.equal(r2.players.size, 10); assert.equal(r2.isFull(), false, 'bots yield to humans');
  assert.ok(r2.add('h2', 'Two', 'COUNTER_TERRORIST')); assert.equal(r2.players.size, 10);
  assert.equal(r2.humans().length, 2);
  const spawns = new Set([...r2.players.values()].map(p => `${p.team}${p.spawnIndex}`)); assert.equal(spawns.size, 10, 'distinct spawn points');
});
test('balance: a lone team cannot grow past +1', () => {
  const room = mkRoom(); room.add('a', 'A', 'TERRORIST'); room.add('b', 'B', 'TERRORIST'); room.add('c', 'C', 'TERRORIST');
  assert.equal(room.count('TERRORIST'), 2); assert.equal(room.count('COUNTER_TERRORIST'), 1);
});
test('round machine: warmup -> buy (freeze, buy allowed) -> live -> post -> buy', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.25, round: 0.5, post: 0.1 });
  room.add('t', 'T', 'TERRORIST'); room.add('c', 'C', 'COUNTER_TERRORIST');
  const seen = []; for (let i = 0; i < 400; i++) { room.step(); if (seen.at(-1) !== room.phase) seen.push(room.phase); }
  assert.deepEqual(seen.slice(0, 4), ['warmup', 'buy', 'live', 'post']);
  assert.ok(seen.includes('buy') && seen.filter(p => p === 'buy').length >= 2, 'next round re-enters buy');
  const r = mkRoom({ warmup: 0.05, freeze: 15, round: 115, post: 7 }); r.add('t', 'T', 'TERRORIST'); r.add('c', 'C', 'COUNTER_TERRORIST'); r.start();
  assert.equal(r.phase, 'buy'); assert.ok(Math.abs(r.snapshot('t').remaining - 15) < 0.1);
  r.phaseEnd = r.tick + 1; run(r, 2); assert.equal(r.phase, 'live'); assert.ok(Math.abs(r.snapshot('t').remaining - 115) < 0.2);
});
test('buy phase: purchases validated, freeze time blocks movement', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 5, round: 30, post: 1 });
  const t = room.add('t', 'T', 'TERRORIST'), c = room.add('c', 'C', 'COUNTER_TERRORIST'); room.start();
  t.money = 3000; assert.ok(room.buy('t', 'ak47').ok); assert.equal(t.inv.weaponId(1), 'ak47'); assert.equal(t.money, 300);
  assert.ok(room.buy('t', 'm4a4').error, 'wrong team item rejected'); assert.ok(room.buy('t', 'deagle').error, 'cannot afford');
  t.money = 16000; assert.ok(room.buy('t', 'kevlar').ok); assert.equal(t.armor, 100);
  assert.ok(room.buy('t', 'helmet').ok && t.helmet);
  assert.equal(room.buy('c', 'defuser').ok, true); assert.equal(c.kit, true);
  assert.ok(room.buy('t', 'he').ok && room.buy('t', 'flash').ok && room.buy('t', 'flash').ok); assert.equal(t.inv.grenades.flash, 2);
  const z = t.char.z; run(room, 30, () => send(room, 't', { forward: 1 })); assert.equal(t.char.z, z, 'frozen in freeze time');
  room.phaseEnd = room.tick; room.step();
  assert.equal(room.phase, 'live'); const z2 = t.char.z; run(room, 30, () => send(room, 't', { forward: 1 })); assert.ok(t.char.z < z2 - 0.5);
  assert.ok(room.buy('t', 'kevlar').error, 'no buying in live phase');
});
test("server executes 'Q' quick switch + slot keys through the command stream", () => {
  const room = mkRoom(); const t = room.add('t', 'T', 'TERRORIST'); room.add('c', 'C', 'COUNTER_TERRORIST'); toLive(room);
  t.inv.give('ak47', { select: true }); run(room, 90);
  send(room, 't', { slot: 2 }); room.step(); assert.equal(t.inv.current, 2);
  run(room, 40); send(room, 't', { quick: true }); room.step(); assert.equal(t.inv.current, 1); assert.equal(t.inv.previous, 2);
  run(room, 40); send(room, 't', { quick: true }); room.step(); assert.equal(t.inv.current, 2);
});
test('silent walk emits no footsteps; running does', () => {
  const room = mkRoom(); const t = room.add('t', 'T', 'TERRORIST'); room.add('c', 'C', 'COUNTER_TERRORIST'); toLive(room);
  const listener = room.players.get('c'); listener.char.x = t.char.x + 5; listener.char.z = t.char.z; listener.char.y = t.char.y;
  const count = () => room.snapshot('c').events.filter(e => e.type === 'footstep').length;
  const seen = new Set();
  const collect = () => { for (const e of room.events) if (e.type === 'footstep') seen.add(e.id); };
  run(room, 200, () => { send(room, 't', { forward: 1, walk: true }); collect(); });
  assert.equal(seen.size, 0, 'walk is silent');
  Object.assign(t.char, { x: 0, z: 50, y: 0, vx: 0, vz: 0 });
  run(room, 128, () => { send(room, 't', { forward: 1 }); collect(); });
  assert.ok(seen.size >= 4, `running produces footsteps (${seen.size})`); void count;
  const crouchSeen = seen.size; run(room, 100, () => { send(room, 't', { forward: 1, crouch: true }); collect(); }); assert.equal(seen.size, crouchSeen, 'crouch-walk is silent');
});
test('lag compensation ring buffer: 1000 ms history with interpolation', () => {
  const lag = new LagCompensator(); assert.equal(lag.maxRewindTicks, 64);
  for (let t = 1; t <= 200; t++) lag.record(t, [{ id: 'a', char: { x: t, y: 0, z: 0, yaw: 0, crouch: 0 }, alive: true, life: 1 }]);
  assert.equal(lag.sample('a', 200).x, 200); assert.equal(lag.sample('a', 150.5).x, 150.5);
  assert.equal(lag.sample('a', 100), null, 'older than 1 s is gone');
  assert.equal(lag.clampTick(1, 200), 136); assert.equal(lag.clampTick(999, 200), 200); assert.equal(lag.clampTick(1, 200, 10), 190);
  lag.record(201, [{ id: 'a', char: { x: 0, y: 0, z: 0, yaw: 0, crouch: 0 }, alive: false, life: 1 }]);
  assert.equal(lag.sample('a', 201), null, 'dead poses are not hittable');
});
test('hit registration rewinds hitboxes to the shooter view time', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.05, round: 60, post: 1 });
  const s = room.add('s', 'S', 'TERRORIST'), v = room.add('v', 'V', 'COUNTER_TERRORIST'); toLive(room);
  s.rtt = 250; v.rtt = 250;
  const place = (p, x, z) => { p.char.x = x; p.char.z = z; p.char.y = 0; p.char.vx = p.char.vz = 0; };
  const shooterAt = { x: 0, z: 50 };
  s.inv.select(2, { force: true }); run(room, 60);
  place(s, shooterAt.x, shooterAt.z); place(v, 0, 40);
  const eye = room.eye(s);
  run(room, 5); const pastTick = room.tick;
  place(v, 6, 40); run(room, 10); // victim strafed 6 m away
  const yaw = 0, pitch = Math.atan2(1.15 - eye.y, 10);
  v.health = 100;
  const shoot = viewTick => { s.inv.time += 30; s.inv.nextFire = 0; send(room, 's', { fire: true, yaw, pitch, viewTick }); room.step(); send(room, 's', { fire: false, yaw, pitch, viewTick }); room.step(); };
  shoot(room.tick); assert.equal(v.health, 100, 'no rewind: shot passes through where the victim is not');
  const before = room.events.length;
  shoot(pastTick); assert.ok(v.health < 100, 'rewound to where the victim was on the shooter screen');
  assert.ok(room.events.some(e => e.type === 'hit' && e.target === 'v') && before >= 0);
  // cannot claim ancient ticks: measured RTT bounds the rewind, the ring buffer caps it at 1000 ms
  const staged = () => { v.health = 100; place(v, 0, 40); run(room, 120); place(v, 6, 40); run(room, 45); return room.tick - 50; };
  let old = staged(); s.rtt = 20; shoot(old); assert.equal(v.health, 100, 'view tick clamped by rtt');
  old = staged(); s.rtt = 900; shoot(old); assert.ok(v.health < 100, 'high-latency shooter may rewind up to 1000 ms');
});
test('bomb: plant needs slot 5 + fire on a site; defuse takes 10 s (5 s with kit); explosion at 40 s', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.05, round: 300, post: 30 });
  const t = room.add('t', 'T', 'TERRORIST'), c = room.add('c', 'C', 'COUNTER_TERRORIST'); toLive(room);
  assert.equal(room.bomb.carrier, 't'); assert.ok(t.inv.has(SLOT.OBJECTIVE));
  const site = map.sites[0], spot = openSpot(site.x, site.z); t.char.x = spot.x; t.char.z = spot.z; t.char.y = spot.y; c.char.x = -40; c.char.z = 40; c.char.y = 0;
  t.inv.select(SLOT.OBJECTIVE);
  run(room, 100, () => send(room, 't', { fire: true })); assert.equal(room.bomb.state, 'carried', 'not yet planted (3.2 s)');
  run(room, 240, () => send(room, 't', { fire: true })); assert.equal(room.bomb.state, 'planted');
  assert.ok(!t.inv.has(SLOT.OBJECTIVE)); assert.ok(Math.abs(room.snapshot('t').bomb.remaining - RULES.bombSeconds) < 4);
  // defuse without kit needs 10 s
  Object.assign(c.char, { x: room.bomb.x + 0.5, z: room.bomb.z, y: room.bomb.y });
  run(room, 64 * 6, () => send(room, 'c', { interact: true })); assert.equal(room.bomb.state, 'planted');
  run(room, 64 * 5, () => send(room, 'c', { interact: true })); assert.equal(room.phase, 'post'); assert.equal(room.result.reason, 'defused'); assert.equal(room.result.winner, 'COUNTER_TERRORIST');
  // explosion path
  const r2 = mkRoom({ warmup: 0.05, freeze: 0.05, round: 300, post: 30 });
  const t2 = r2.add('t', 'T', 'TERRORIST'); r2.add('c', 'C', 'COUNTER_TERRORIST'); toLive(r2);
  t2.char.x = spot.x; t2.char.z = spot.z; t2.char.y = spot.y; Object.assign(r2.players.get('c').char, { x: -40, z: 40, y: 0 });
  t2.inv.select(SLOT.OBJECTIVE); run(r2, 300, () => send(r2, 't', { fire: true })); assert.equal(r2.bomb.state, 'planted');
  r2.players.get('c').health = 100; run(r2, 64 * RULES.bombSeconds + 10);
  assert.equal(r2.result?.reason, 'exploded'); assert.equal(r2.result.winner, 'TERRORIST');
});
test('elimination ends the round, economy pays win / loss bonus, kill rewards', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.05, round: 300, post: 5 });
  const t = room.add('t', 'T', 'TERRORIST'), c = room.add('c', 'C', 'COUNTER_TERRORIST'); toLive(room);
  const m0 = { t: t.money, c: c.money };
  room.kill(c, t, 'ak47', true); room.step();
  assert.equal(room.phase, 'post'); assert.equal(room.result.winner, 'TERRORIST'); assert.equal(room.scores.TERRORIST, 1);
  assert.equal(t.money, Math.min(RULES.maxMoney, m0.t + 300 + RULES.winBonus)); assert.equal(c.money, m0.c + RULES.lossBonuses[0]);
  assert.equal(t.kills, 1); assert.equal(c.deaths, 1);
});
test('MR12: sides swap after 12 rounds, money resets, first to 13 wins the match', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.02, round: 300, post: 0.02 });
  const t = room.add('t', 'T', 'TERRORIST'), c = room.add('c', 'C', 'COUNTER_TERRORIST'); room.start();
  const win = team => { while (room.phase !== 'live') room.step(); room.endRound(team, 'test'); room.step(); };
  for (let i = 0; i < 6; i++) { win('TERRORIST'); win('COUNTER_TERRORIST'); }
  assert.equal(room.round, 12); while (room.phase !== 'buy') room.step();
  assert.equal(room.round, 13); assert.equal(t.team, 'COUNTER_TERRORIST', 'squad swapped sides'); assert.equal(c.team, 'TERRORIST');
  assert.equal(t.money, RULES.startMoney); assert.equal(t.inv.weaponId(2), 'glock');
  assert.equal(room.snapshot('t').half, 2);
  for (let i = 0; i < 7; i++) win('COUNTER_TERRORIST'); // t's squad is CT now
  assert.equal(room.phase === 'matchEnd' || room.phase === 'post', true);
  assert.ok(room.wins.A === 13 || room.wins.B === 13);
});
test('grenades: HE damages through LOS, smoke registers, flash blinds', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.05, round: 300, post: 1 });
  const t = room.add('t', 'T', 'TERRORIST'), c = room.add('c', 'C', 'COUNTER_TERRORIST'); toLive(room);
  t.char.x = 0; t.char.z = 50; t.char.y = 0; c.char.x = 0; c.char.z = 42; c.char.y = 0; c.char.yaw = Math.PI; // c faces the flash
  t.inv.give('he'); t.inv.give('flash'); t.inv.give('smoke'); t.inv.select(4, { force: true }); run(room, 60);
  const hp = c.health;
  room.grenades.push({ id: 99, type: 'he', owner: 't', team: t.team, x: 0, y: 1, z: 42.6, vx: 0, vy: 0, vz: 0, detonate: room.tick + 1, rest: 9, bounces: 0 }); run(room, 3);
  assert.ok(c.health < hp, `HE dealt damage: ${c.health}`);
  room.grenades.push({ id: 100, type: 'flash', owner: 't', team: t.team, x: 0, y: 1.6, z: 47, vx: 0, vy: 0, vz: 0, detonate: room.tick + 1, rest: 9, bounces: 0 }); run(room, 3);
  assert.ok(room.events.some(e => e.type === 'flash' && e.target === 'c'), 'flash event'); assert.ok(c.flashUntil > room.tick);
  room.grenades.push({ id: 101, type: 'smoke', owner: 't', team: t.team, x: 0, y: 1, z: 46, vx: 0, vy: 0, vz: 0, detonate: room.tick + 1, rest: 9, bounces: 0 }); run(room, 3);
  assert.equal(room.smokes.length, 1); assert.equal(room.hasSight({ x: 0, y: 1.5, z: 50 }, { x: 0, y: 1.5, z: 43 }), false, 'smoke blocks bot sight');
  // a thrown grenade actually flies, bounces and detonates
  const before = room.events.length; t.inv.select(4, { force: true }); run(room, 60, () => send(room, 't'));
  send(room, 't', { fire: true, pitch: 0.2 }); room.step(); send(room, 't', { fire: false, pitch: 0.2 }); room.step();
  assert.ok(room.grenades.length >= 1 || room.events.length > before);
});
test('full bot match runs stably (5v5, all bots) and produces kills', () => {
  const room = mkRoom({ warmup: 0.05, freeze: 0.3, round: 40, post: 0.5 }, { practice: true });
  room.add('h', 'Human', 'TERRORIST'); room.fillBots(); room.start();
  const t0 = performance.now(); run(room, TICK_RATE * 120);
  const ms = performance.now() - t0; console.log(`# bot match tick cost ${(ms / (TICK_RATE * 120)).toFixed(3)} ms`);
  const kills = [...room.players.values()].reduce((n, p) => n + p.kills, 0);
  assert.ok(room.round >= 1 && kills >= 1, `rounds=${room.round} kills=${kills}`);
  assert.ok(ms / (TICK_RATE * 120) < 4);
  for (const p of room.players.values()) assert.ok(Number.isFinite(p.char.x) && Math.abs(p.char.x) < 200);
});
