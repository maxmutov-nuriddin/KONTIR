import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { disposeTree } from '../client/src/dispose.js';
import { FramePacer } from '../client/src/frame-pacer.js';
import { ViewmodelDynamics } from '../client/PlayerController.js';
import { Network } from '../client/src/network.js';

test('GPU frame budget is capped across 60/144/240 Hz displays, menu and hidden states', () => {
  for (const hz of [60, 144, 240]) {
    const pacer = new FramePacer(60); let count = 0;
    for (let t = 0; t < 1000 - 0.001; t += 1000 / hz) if (pacer.ready(t)) count++;
    assert.ok(count >= 59 && count <= 61, `${hz} Hz: ${count} frames`);
  }
  const pacer = new FramePacer(120); let menu = 0;
  for (let t = 0; t < 1000; t++) if (pacer.ready(t, { active: false })) menu++;
  assert.equal(menu, 30);
  // an uncapped game still caps the menu at 30 FPS (cool fanless laptops)
  const free = new FramePacer(0); let freeMenu = 0, freeGame = 0;
  for (let t = 0; t < 1000; t++) { if (free.ready(t, { active: false })) freeMenu++; }
  for (let t = 1000; t < 2000; t++) { if (free.ready(t)) freeGame++; }
  assert.equal(freeMenu, 30); assert.equal(freeGame, 1000);
  assert.equal(pacer.ready(2000, { hidden: true }), false);
  assert.equal(pacer.ready(9000), true);
  pacer.setLimit(NaN); assert.equal(pacer.limit, 0);
});

test('viewmodel springs remain bounded and settle at 4 FPS', () => {
  const dynamics = new ViewmodelDynamics(); dynamics.impulseLand(15);
  for (let i = 0; i < 100; i++) dynamics.update(0.25, { dx: i === 0 ? 100 : 0, dy: 0 });
  assert.ok(Number.isFinite(dynamics.land)); assert.ok(Math.abs(dynamics.land) < 0.001);
  assert.ok(Math.abs(dynamics.yaw) < 0.001);
});

test('network retransmits oldest unacknowledged edges after a volatile packet is dropped', () => {
  const sent = [], socket = { connected: true, volatile: { emit: (_, batch) => sent.push(batch) } };
  const pending = Array.from({ length: 80 }, (_, seq) => ({ seq, quick: seq === 0 }));
  const network = { socket };
  Network.prototype.send.call(network, pending); Network.prototype.send.call(network, pending);
  assert.deepEqual(sent[0], sent[1]); assert.equal(sent[0][0].seq, 0); assert.equal(sent[0].length, 32);
  Network.prototype.send.call(network, pending.slice(32)); assert.equal(sent[2][0].seq, 32);
});


test('scene disposal releases owned geometry and textures but preserves shared assets', () => {
  const root = new THREE.Group(), shared = new THREE.MeshBasicMaterial(), own = new THREE.MeshBasicMaterial();
  shared.userData.shared = true; own.map = new THREE.Texture();
  const geo = new THREE.BoxGeometry(); root.add(new THREE.Mesh(geo, shared), new THREE.Mesh(geo, own));
  let geometry = 0, material = 0, texture = 0, sharedDisposed = 0;
  geo.addEventListener('dispose', () => geometry++); own.addEventListener('dispose', () => material++);
  own.map.addEventListener('dispose', () => texture++); shared.addEventListener('dispose', () => sharedDisposed++);
  disposeTree(root); assert.deepEqual([geometry, material, texture, sharedDisposed], [1, 1, 1, 0]);
});
