import test from 'node:test';
import assert from 'node:assert/strict';
import { io } from 'socket.io-client';
import { createGameServer } from '../server/server.js';
import { neutralInput } from '../shared/constants.js';

const emit = (socket, event, payload) => new Promise((resolve, reject) => socket.timeout(4000).emit(event, payload, (error, res) => (error ? reject(error) : resolve(res))));
const until = async (fn, ms = 4000) => { const t = Date.now(); while (Date.now() - t < ms) { const v = fn(); if (v) return v; await new Promise(r => setTimeout(r, 15)); } throw new Error('timeout'); };

test('socket.io server: 5v5 lobby, snapshots at 32 Hz, command stream, buy, capacity', async () => {
  const server = await createGameServer({ port: 0, quiet: true, timing: { warmup: 0.2, freeze: 5, round: 30, post: 2 } });
  const url = `http://127.0.0.1:${server.port}`, sockets = [];
  const connect = () => { const s = io(url, { transports: ['websocket'], reconnection: false }); s.on('probe', ack => ack?.()); s.snapshots = []; s.on('snapshot', snap => s.snapshots.push(snap)); sockets.push(s); return s; };
  try {
    const maps = await emit(connect(), 'maps');
    assert.ok(maps.maps.find(m => m.id === 'sahara') && maps.maps.find(m => m.id === 'harbor'));

    const a = connect(), b = connect();
    const ja = await emit(a, 'join', { name: 'Alpha', code: 'ROOM01', mapId: 'sahara', team: 'TERRORIST' });
    const jb = await emit(b, 'join', { name: 'Bravo', code: 'ROOM01', mapId: 'sahara', team: 'TERRORIST' });
    assert.ok(ja.ok && jb.ok); assert.equal(ja.team, 'TERRORIST'); assert.equal(jb.team, 'COUNTER_TERRORIST', 'team balance pushes the 2nd player to CT');
    assert.equal(jb.snapshot.players.length, 2); assert.equal(ja.snapshot.mapId, 'sahara');

    // snapshots arrive at ~32 Hz
    await until(() => a.snapshots.length >= 20, 3000);
    const span = (a.snapshots.at(-1).tick - a.snapshots[0].tick) / (a.snapshots.length - 1);
    assert.ok(span >= 1.9 && span <= 3.1, `snapshot every ~2 ticks (got ${span})`);

    // wait for the warmup to hand over to the buy phase, then drive the command stream
    await until(() => a.snapshots.at(-1).phase === 'buy', 4000);
    const me0 = a.snapshots.at(-1).players.find(p => p.id === ja.id);
    const money = me0.money;
    assert.ok((await emit(a, 'buy', 'kevlar')).ok);
    await until(() => a.snapshots.at(-1).players.find(p => p.id === ja.id).armor === 100);
    assert.ok((await emit(a, 'buy', 'm4a4')).error, 'T cannot buy the CT rifle');
    assert.equal((await emit(a, 'start', {})).error !== undefined, true, 'match already running');
    void money;

    // invalid commands are dropped, valid ones are acknowledged
    let seq = 0;
    a.emit('commands', [{ ...neutralInput(), seq: 0, forward: 7 }]);
    const send = (extra = {}) => a.emit('commands', [{ ...neutralInput(), seq: seq++, viewTick: 0, ...extra }]);
    for (let i = 0; i < 20; i++) { send({ slot: i === 5 ? 3 : 0 }); await new Promise(r => setTimeout(r, 16)); }
    await until(() => a.snapshots.at(-1).players.find(p => p.id === ja.id).ack >= 10);
    const inv = a.snapshots.at(-1).players.find(p => p.id === ja.id).inv;
    assert.equal(inv.current, 3, 'slot 3 (knife) selected through the network');
    assert.equal(a.snapshots.at(-1).players.find(p => p.id === jb.id).inv, undefined, 'other players inventories are private');

    // 10-player capacity, 11th refused
    const extras = [];
    for (let i = 0; i < 8; i++) { const s = connect(); extras.push(s); const r = await emit(s, 'join', { name: `P${i}`, code: 'ROOM01', mapId: 'sahara', team: i % 2 ? 'COUNTER_TERRORIST' : 'TERRORIST' }); assert.ok(r.ok, r.error); }
    const room = server.rooms.get('ROOM01');
    assert.equal(room.count('TERRORIST'), 5); assert.equal(room.count('COUNTER_TERRORIST'), 5);
    const late = await emit(connect(), 'join', { name: 'Late', code: 'ROOM01', mapId: 'sahara' });
    assert.ok(late.error, 'room is full');

    // quick match creates / fills a public room; practice fills bots
    const q = connect(); const jq = await emit(q, 'join', { name: 'Q', quick: true, mapId: 'harbor' }); assert.ok(jq.ok); assert.equal(jq.snapshot.mapId, 'harbor');
    const p = connect(); const jp = await emit(p, 'join', { name: 'Solo', practice: true, mapId: 'sahara' }); assert.ok(jp.ok); assert.equal(jp.snapshot.players.length, 10); assert.equal(jp.snapshot.phase, 'buy');
    const health = await (await fetch(`${url}/health`)).json(); assert.equal(health.tickRate, 64);
  } finally { for (const s of sockets) s.disconnect(); await server.close(); }
});
