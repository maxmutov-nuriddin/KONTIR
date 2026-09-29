import test from 'node:test';
import assert from 'node:assert/strict';
import { MapLibrary } from '../server/server.js';
import { Room } from '../server/Room.js';
import { RULES } from '../shared/constants.js';

const library = await new MapLibrary(await MapLibrary.locate()).init();
const map = await library.get('sahara');
const mk = () => new Room('GP0001', map, map.nav, { timing: { warmup: 0.05, freeze: 0.1, round: 60, post: 0.05 } });
function live(room) { room.start(); while (room.phase !== 'live') room.step(); }

test('overtime: 12-12 goes to MR3 overtime with $12,500, first to 16 wins', () => {
  const room = mk(); room.add('a', 'A', 'TERRORIST'); room.add('b', 'B', 'COUNTER_TERRORIST'); live(room);
  const play = winnerSquad => { const team = room.side[winnerSquad]; room.endRound(team, 'elimination'); while (room.phase !== 'live' && room.phase !== 'matchEnd') room.step(); };
  for (let i = 0; i < 12; i++) { play('A'); play('B'); }
  assert.equal(room.phase, 'live', '12-12 is not a draw any more'); assert.equal(room.round, 25);
  assert.equal(room.players.get('a').money, 12500, 'overtime economy');
  assert.equal(room.snapshot('a').overtime, 1);
  play('A'); play('A'); play('A'); assert.equal(room.phase, 'live', '15-12');
  play('A'); assert.equal(room.phase, 'matchEnd'); assert.equal(room.wins.A, 16);
});

test('MVP, damage and headshot kills are tracked and sent in snapshots', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'), b = room.add('b', 'B', 'COUNTER_TERRORIST'); live(room);
  room.damage(b, a, 40, 0, 'ak47', false); room.damage(b, a, 100, 0, 'ak47', true);
  assert.equal(a.damage, 100, 'damage counts health actually removed'); assert.equal(a.hsKills, 1);
  const events = []; const emit = room.emit.bind(room); room.emit = (t, d) => { events.push({ t, d }); return emit(t, d); };
  room.endRound('TERRORIST', 'elimination');
  assert.equal(events.find(e => e.t === 'roundEnd').d.mvp.id, 'a'); assert.equal(a.mvps, 1);
  const me = room.snapshot('a').players.find(p => p.id === 'a'); assert.equal(me.damage, 100); assert.equal(me.hsKills, 1); assert.equal(me.mvps, 1);
});

test('wall penetration: thin cover is shot through with reduced damage, thick walls stop bullets', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'), b = room.add('b', 'B', 'COUNTER_TERRORIST'); live(room);
  // a 0.2 m thick board between shooter and target (collider-level stub)
  const real = room.collider;
  const board = { x: 5, t: 0.2 };
  room.collider = { ...real, bounds: real.bounds, raycast: (ox, oy, oz, dx, dy, dz, far) => {
    if (dx > 0 && ox < board.x) { const d = (board.x - ox) / dx; return d <= far ? { distance: d, x: board.x, y: oy, z: oz, nx: -1, ny: 0, nz: 0 } : null; }
    if (dx > 0 && ox >= board.x && ox < board.x + board.t) { const d = (board.x + board.t - ox) / dx; return d <= far ? { distance: d, x: board.x + board.t, y: oy, z: oz, nx: 1, ny: 0, nz: 0 } : null; }
    return null;
  }, wallDistance: () => 999, resolveCapsule: () => false };
  Object.assign(a.char, { x: 0, y: 0, z: 0, yaw: -Math.PI / 2, pitch: 0 }); Object.assign(b.char, { x: 10, y: 0, z: 0, yaw: 0 });
  a.inv.give('ak47', { select: true });
  const shoot = () => { b.health = 100; b.alive = true; room.fireShot(a, { weapon: 'ak47', index: 0, punch: { yaw: 0, pitch: 0 }, burst: 0, zoom: 0 }, { viewTick: room.tick }); return 100 - b.health; };
  const through = shoot();
  board.x = 100; const open = shoot(); board.x = 5;
  assert.ok(through > 0 && through < open, `penetrated with less damage (${through} < ${open})`);
  board.t = 1.5; b.health = 100;
  const hp = () => b.health;
  room.fireShot(a, { weapon: 'ak47', index: 0, punch: { yaw: 0, pitch: 0 }, burst: 0, zoom: 0 }, { viewTick: room.tick });
  assert.equal(hp(), 100, 'a 1.5 m wall stops rifle rounds');
  room.collider = real;
});

test('anti-wallhack: enemies behind walls are not sent; team chat / radio / pings only reach the team', () => {
  const room = mk(); const a = room.add('a', 'A', 'TERRORIST'), b = room.add('b', 'B', 'COUNTER_TERRORIST'), m = room.add('m', 'M', 'TERRORIST'); live(room);
  const snapB = () => room.snapshot('a').players.find(p => p.id === 'b');
  // move the enemy to a walkable spot that is behind solid geometry from the viewer's eye
  const n = map.nav, eye = room.eye(a);
  for (let i = 0; i < n.walkable.length; i++) {
    if (!n.walkable[i]) continue;
    const w = n.world(i % n.cols, Math.floor(i / n.cols)), y = n.floor[i];
    if ([0.35, 1.1, 1.62].every(h => !room.hasSight(eye, { x: w.x, y: y + h, z: w.z })) && Math.hypot(w.x - a.char.x, w.z - a.char.z) > 12) { Object.assign(b.char, { x: w.x, y, z: w.z, vx: 0, vz: 0 }); break; }
  }
  for (let i = 0; i < 40; i++) { Object.assign(b.char, { vx: 0, vz: 0 }); room.step(); }
  assert.equal(snapB().char, null, 'enemy position hidden'); assert.equal(snapB().hidden, true);
  assert.ok(room.snapshot('a').players.find(p => p.id === 'm').char, 'team-mates always visible');
  Object.assign(b.char, { x: a.char.x + 3, z: a.char.z, y: a.char.y });
  for (let i = 0; i < 2; i++) room.step();
  assert.ok(snapB().char, 'visible enemy is sent');
  assert.ok(room.radio('a', 2)); assert.ok(room.chat('a', 'rush B', true)); assert.ok(room.chat('m', 'gg', false)); assert.ok(room.ping('a', a.char.x, a.char.y, a.char.z));
  const forB = room.snapshot('b').events, forM = room.snapshot('m').events;
  assert.equal(forB.some(e => e.type === 'radio' || e.type === 'ping' || (e.type === 'chat' && e.teamOnly)), false);
  assert.ok(forB.some(e => e.type === 'chat' && e.text === 'gg'), 'all-chat reaches everybody');
  assert.ok(forM.some(e => e.type === 'radio') && forM.some(e => e.type === 'ping') && forM.some(e => e.type === 'chat' && e.text === 'rush B'));
  assert.equal(room.chat('a', 'spam', false), false, 'chat is rate limited');
});
