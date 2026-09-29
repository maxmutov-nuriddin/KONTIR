import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { io } from 'socket.io-client';
import { Matchmaker, MapLibrary, createGameServer } from '../server/server.js';

const request = (s, event, payload) => new Promise((resolve, reject) => s.timeout(5000).emit(event, payload, (err, res) => err ? reject(err) : resolve(res)));

test('concurrent room creation reserves capacity and returns one shared room', async () => {
  let resolveMap;
  const loading = new Promise(resolve => { resolveMap = resolve; });
  const library = { get: () => loading };
  const matchmaker = new Matchmaker(library, { maxRooms: 1 });
  const a = matchmaker.create('SAME', 'sahara'), b = matchmaker.create('SAME', 'sahara');
  await assert.rejects(matchmaker.create('FULL', 'sahara'), /Server band/);
  resolveMap({ collider: {}, nav: {} });
  assert.equal(await a, await b); assert.equal(matchmaker.rooms.size, 1);
});

test('failed map loads release room reservations and map loading is deduplicated', async () => {
  const matchmaker = new Matchmaker({ get: async () => { throw new Error('missing'); } }, { maxRooms: 1 });
  await assert.rejects(matchmaker.create('FAIL', 'missing'));
  assert.equal(matchmaker.pending.size, 0);
  const library = await new MapLibrary(await MapLibrary.locate()).init();
  const [a, b] = await Promise.all([library.get('sahara'), library.get('sahara')]);
  assert.equal(a, b); assert.equal(library.pending.size, 0);
});

test('HTTP blocks encoded traversal and malformed paths; simultaneous socket joins share roster', async () => {
  const server = await createGameServer({ port: 0, host: '127.0.0.1', quiet: true });
  const url = `http://127.0.0.1:${server.port}`, sockets = [];
  try {
    for (const path of ['/maps/..%2f..%2f..%2fpackage.json', '/maps/%2fetc%2fpasswd', '/maps/%E0%A4%A']) {
      const response = await fetch(url + path); assert.ok(response.status >= 400, `${path}: ${response.status}`);
    }
    assert.equal((await fetch(url + '/maps/manifest.json')).status, 200);
    const join = name => {
      const socket = io(url, { transports: ['websocket'], reconnection: false }); sockets.push(socket);
      return request(socket, 'join', { code: 'RACE01', mapId: 'sahara', name });
    };
    const result = await Promise.all([join('A'), join('B')]);
    assert.ok(result.every(r => r.ok)); assert.equal(server.rooms.get('RACE01').humans().length, 2);
    const solo = io(url, { transports: ['websocket'], reconnection: false }); sockets.push(solo);
    const practice = await request(solo, 'join', { practice: true, name: 'Solo', mapId: 'sahara' });
    const visitor = io(url, { transports: ['websocket'], reconnection: false }); sockets.push(visitor);
    assert.ok((await request(visitor, 'join', { code: practice.code, name: 'Visitor' })).error);
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});

test('occupied port rejects server startup promptly without leaking tick timers', async () => {
  const blocker = createServer(); blocker.listen(0, '127.0.0.1'); await once(blocker, 'listening');
  try { await assert.rejects(createGameServer({ port: blocker.address().port, host: '127.0.0.1', quiet: true }), { code: 'EADDRINUSE' }); }
  finally { await new Promise(resolve => blocker.close(resolve)); }
});


test('simultaneous quick joins fill public rooms instead of isolating every player', async () => {
  const server = await createGameServer({ port: 0, host: '127.0.0.1', quiet: true });
  const sockets = [];
  try {
    const results = await Promise.all(Array.from({ length: 12 }, (_, i) => {
      const socket = io(`http://127.0.0.1:${server.port}`, { transports: ['websocket'], reconnection: false });
      sockets.push(socket); return request(socket, 'join', { quick: true, name: `P${i}`, mapId: 'sahara' });
    }));
    assert.ok(results.every(r => r.ok)); assert.equal(server.rooms.size, 2);
    assert.deepEqual([...server.rooms.values()].map(r => r.humans().length).sort((a, b) => a - b), [2, 10]);
  } finally { sockets.forEach(s => s.disconnect()); await server.close(); }
});
