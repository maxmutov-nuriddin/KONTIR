import test from 'node:test';
import assert from 'node:assert/strict';
import { spectatorTarget } from '../client/src/spectator.js';
import { Network } from '../client/src/network.js';

const player = (id, team = 'TERRORIST', char = { x: 0, y: 0, z: 0 }) => ({ id, team, char, alive: true });

test('last survivor death waits for a visible spectator pose instead of dereferencing a hidden enemy', () => {
  const me = { ...player('me'), alive: false };
  const enemy = player('enemy', 'COUNTER_TERRORIST', null);
  assert.equal(spectatorTarget([me, enemy], me.id, me.team), null);
  const revealed = { ...enemy, char: { x: 1, y: 0, z: 3 } };
  assert.equal(spectatorTarget([me, revealed], me.id, me.team), revealed);
});

test('spectating prefers living teammates and cycles in both directions', () => {
  const me = player('me'), a = player('a'), b = player('b'), enemy = player('enemy', 'COUNTER_TERRORIST');
  const players = [me, b, enemy, a, { ...player('dead'), alive: false }];
  assert.equal(spectatorTarget(players, me.id, me.team), a);
  assert.equal(spectatorTarget(players, me.id, me.team, 1), b);
  assert.equal(spectatorTarget(players, me.id, me.team, -1), b);
  assert.equal(spectatorTarget([me, enemy], me.id, me.team), enemy);
  assert.equal(spectatorTarget([me], me.id, me.team), null);
});

test('death snapshots can arrive before interpolation reveals enemies to the spectator', () => {
  const me = player('me'), enemy = player('enemy', 'COUNTER_TERRORIST', null);
  const latest = { tick: 104, players: [{ ...me, alive: false }, { ...enemy, char: { x: 2, y: 0, z: 4, vx: 0, vy: 0, vz: 0 } }] };
  const network = { received: 1000, latest, frames: [
    { tick: 98, players: [me, enemy] }, { tick: 100, players: [me, enemy] }, latest,
  ] };
  const before = Network.prototype.remote.call(network, 1000);
  assert.equal(latest.players[0].alive, false, 'local death is already authoritative');
  assert.equal(before[1].char, null, 'interpolated enemy still has no pose');
  assert.equal(spectatorTarget(before, me.id, me.team), null);
  const after = Network.prototype.remote.call(network, 1200);
  assert.equal(spectatorTarget(after, me.id, me.team).id, enemy.id);
});
