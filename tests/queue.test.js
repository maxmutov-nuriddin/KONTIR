import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { MatchQueue } from '../server/Queue.js';
import { createGameServer } from '../server/server.js';

const clock = () => { let t = 0; const now = () => t; now.add = ms => { t += ms; }; return now; };

test('queue: ten players on a shared map form a match immediately; ACCEPT from all -> ready', () => {
  const now = clock(), q = new MatchQueue({ mapIds: ['sarob', 'changtepa'], now });
  for (let i = 0; i < 10; i++) q.join(`p${i}`, { maps: ['sarob'] });
  const found = q.tick().filter(a => a.type === 'found');
  assert.equal(found.length, 1); assert.equal(found[0].match.players.length, 10); assert.equal(found[0].match.mapId, 'sarob');
  for (let i = 0; i < 9; i++) q.accept(`p${i}`, found[0].match.id);
  assert.equal(q.tick().length, 0, 'still waiting for the last accept');
  q.accept('p9', found[0].match.id);
  const ready = q.tick(); assert.equal(ready[0].type, 'ready'); assert.equal(q.entries.size, 0);
});

test('queue: small groups wait for the fill timer, only share a common map, the remaining lone searcher gets a bot match', () => {
  const now = clock(), q = new MatchQueue({ mapIds: ['a', 'b', 'c'], now, modes: { competitive: { fillAfterMs: 10000, soloAfterMs: 30000 } } });
  q.join('x', { maps: ['a', 'b'] }); q.join('y', { maps: ['b', 'c'] }); q.join('z', { maps: ['c'], mode: 'competitive' });
  assert.equal(q.tick().length, 0, 'not enough players yet');
  now.add(10001);
  const found = q.tick().filter(a => a.type === 'found');
  assert.equal(found.length, 2); assert.deepEqual(found[0].match.players.sort(), ['x', 'y']); assert.equal(found[0].match.mapId, 'b', 'the only map both selected');
  // once x and y are matched, z is the only one left searching: it gets a bot-filled match right away, not after 30 s
  assert.deepEqual(found[1].match.players, ['z'], 'solo searcher gets a bot-filled match');
});

test('queue: a lone searcher gets a bot match within seconds and needs no ACCEPT', () => {
  const now = clock(), q = new MatchQueue({ mapIds: ['a', 'b'], now });
  q.join('solo', { mode: 'competitive' });
  assert.equal(q.tick().length, 0, 'a short grace period lets a friend join the same search');
  now.add(6001);
  const found = q.tick().find(a => a.type === 'found');
  assert.deepEqual(found.match.players, ['solo']); assert.equal(found.match.solo, true);
  assert.ok(found.match.accepted.has('solo'), 'pressing SEARCH counts as accepting a solo match');
  assert.equal(q.tick().find(a => a.type === 'ready')?.match.id, found.match.id, 'starts on the next tick without a pop-up');
  // with somebody else searching (other maps) the lone rule does not apply
  const q2 = new MatchQueue({ mapIds: ['a', 'b'], now });
  q2.join('x', { maps: ['a'] }); q2.join('y', { maps: ['b'] }); now.add(6001);
  assert.equal(q2.tick().length, 0);
});

test('queue: a missed ACCEPT drops that player and requeues the others with their original priority', () => {
  const now = clock(), q = new MatchQueue({ mapIds: ['a'], now, acceptMs: 5000 });
  for (let i = 0; i < 10; i++) q.join(`p${i}`);
  const m = q.tick()[0].match; const since = q.entries.get('p0').since;
  for (let i = 1; i < 10; i++) q.accept(`p${i}`, m.id);
  now.add(5001);
  const exp = q.tick().find(a => a.type === 'expired');
  assert.deepEqual(exp.dropped, ['p0']); assert.equal(exp.requeued.length, 9);
  assert.equal(q.entries.has('p0'), false); assert.equal(q.entries.get('p1').matchId, null); assert.equal(q.entries.get('p1').since, since);
});

test('socket.io matchmaking: two searchers -> match found -> accept -> same room, opposite sides, bots fill 5v5', async () => {
  const server = await createGameServer({ port: 0, quiet: true, timing: { warmup: 0.1, freeze: 5, round: 30, post: 1 }, queue: { pumpMs: 50, modes: { casual: { fillAfterMs: 100, soloAfterMs: 5000 } } } });
  const url = `http://127.0.0.1:${server.port}`;
  const mk = () => { const s = io(url, { transports: ['websocket'], reconnection: false }); s.on('probe', ack => ack?.()); return s; };
  const a = mk(), b = mk();
  const ask = (s, ev, payload) => new Promise((res, rej) => s.timeout(3000).emit(ev, payload, (e, r) => (e ? rej(e) : res(r))));
  const once = (s, ev) => new Promise(res => s.once(ev, res));
  try {
    const foundA = once(a, 'queue:found'), foundB = once(b, 'queue:found');
    assert.ok((await ask(a, 'queue:join', { name: 'Alpha', mode: 'casual', maps: ['sarob', 'changtepa'] })).ok);
    assert.ok((await ask(b, 'queue:join', { name: 'Bravo', mode: 'casual', maps: ['changtepa'] })).ok);
    const [fa] = await Promise.all([foundA, foundB]);
    assert.equal(fa.mapId, 'changtepa'); assert.equal(fa.players, 2);
    const readyA = once(a, 'queue:ready'), readyB = once(b, 'queue:ready');
    a.emit('queue:accept', fa.matchId); b.emit('queue:accept', fa.matchId);
    const [ra, rb] = await Promise.all([readyA, readyB]);
    assert.equal(ra.code, rb.code); assert.notEqual(ra.team, rb.team, 'random but balanced sides');
    assert.equal(ra.snapshot.players.length, 10, 'bots fill the empty seats'); assert.equal(ra.snapshot.mapId, 'changtepa');
    assert.equal(server.queue.entries.size, 0);
  } finally { a.close(); b.close(); await server.close(); }
});
