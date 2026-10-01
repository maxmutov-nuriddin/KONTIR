import test from 'node:test';
import assert from 'node:assert/strict';
import { MeshCollider } from '../shared/collision.js';
import { boxMesh, rampMesh } from '../shared/geometry.js';
import { createPlayer, stepPlayer, eyeHeight, playerHeight } from '../shared/movement.js';
import { DT, MOVEMENT as M, UNIT, neutralInput } from '../shared/constants.js';
import { loadSpeedMul, speedMul } from '../shared/weapons.js';
import { writeGLB, parseGLB } from '../shared/glb.js';

function world() {
  const meshes = [
    boxMesh('floor', 'concrete', 0, -0.5, 0, 200, 1, 200),
    boxMesh('wall', 'wall', 10, 2.5, 0, 1, 5, 40),
    boxMesh('low', 'crate', -10, 0.2, 0, 2, 0.4, 2),
    boxMesh('block', 'crate', -20, 0.3, 0, 2, 0.6, 2),
    boxMesh('ceiling', 'wall', 0, 1.5, 30, 10, 0.5, 10), // underside at y=1.25: crouch-only tunnel
    rampMesh('ramp', 'concrete', 0, 0, -20, 4, 8, 2, 'z-'),
  ];
  for (let i = 0; i < 8; i++) meshes.push(boxMesh(`stair${i}`, 'concrete', 30, (i + 1) * 0.2 / 2, -i * 0.5 + 10, 4, (i + 1) * 0.2, 0.5));
  return new MeshCollider(meshes);
}
const collider = world();
const cmd = (o = {}) => ({ ...neutralInput(), ...o });
const spawn = (x = 0, y = 0, z = 0, yaw = 0) => createPlayer({ x, y, z, yaw });
function run(p, o, seconds) { const events = []; for (let i = 0; i < Math.round(seconds * 64); i++) events.push(stepPlayer(p, cmd({ yaw: p.yaw, ...o }), collider, DT)); return events; }

test('rests on the floor and does not sink or jitter', () => {
  const p = spawn(0, 0, 0); run(p, {}, 1);
  assert.ok(Math.abs(p.y) < 1e-3 && p.grounded);
});
test('falls from height, lands, and never tunnels', () => {
  const p = spawn(0, 60, 0); p.grounded = false; run(p, {}, 6);
  assert.ok(p.grounded && Math.abs(p.y) < 1e-2, `y=${p.y}`);
});
test('unloaded run 250 u/s, shift walk 130 u/s, crouch-walk 85 u/s; back-pedal and side-step are slower', () => {
  const sp = p => Math.hypot(p.vx, p.vz);
  const a = spawn(0, 0, 0); run(a, { forward: 1 }, 2);
  assert.ok(Math.abs(sp(a) - 250 * UNIT) < 0.02);
  const b = spawn(0, 0, 0); run(b, { forward: 1, walk: true }, 2);
  assert.ok(Math.abs(sp(b) - 130 * UNIT) < 0.02);
  const c = spawn(0, 0, 0); run(c, { forward: 1, crouch: true }, 2);
  assert.ok(Math.abs(sp(c) - 85 * UNIT) < 0.02, `${sp(c) / UNIT}`);
  const back = spawn(0, 0, 0); run(back, { forward: -1 }, 2);
  assert.ok(Math.abs(sp(back) - 250 * UNIT * M.backSpeed) < 0.02, `back ${sp(back) / UNIT}`);
  const side = spawn(0, 0, 60); run(side, { right: 1 }, 2);   // open floor: no wall within reach
  assert.ok(Math.abs(sp(side) - 250 * UNIT * M.strafeSpeed) < 0.02, `side ${sp(side) / UNIT}`);
});
test('carried weight lowers top speed and acceleration (AK 4.3 kg vs knife)', () => {
  const sp = p => Math.hypot(p.vx, p.vz);
  const knife = spawn(); knife.speedMul = speedMul('knife'); const ak = spawn(); ak.speedMul = speedMul('ak47'); const awp = spawn(); awp.speedMul = speedMul('awp');
  run(knife, { forward: 1 }, 0.25); run(ak, { forward: 1 }, 0.25); run(awp, { forward: 1 }, 0.25);
  assert.ok(sp(knife) > sp(ak) && sp(ak) > sp(awp), 'heavier gets going slower');
  run(knife, { forward: 1 }, 2); run(ak, { forward: 1 }, 2); run(awp, { forward: 1 }, 2);
  assert.ok(Math.abs(sp(ak) / UNIT - 250 * speedMul('ak47')) < 1 && sp(ak) / UNIT < 216 && sp(ak) / UNIT > 208, `ak ${sp(ak) / UNIT}`);
  assert.ok(sp(awp) / UNIT < 195, `awp ${sp(awp) / UNIT}`);
  // whole load: the bomb carrier with a rifle out is slower than the same rifleman without the C4, scoping slows more
  const inv = { current: 1, zoom: 0, grenades: {}, weaponId: s => ({ 1: 'awp', 2: 'glock', 3: 'knife', 5: 'c4' })[s] || null };
  const plain = { ...inv, weaponId: s => ({ 1: 'awp', 2: 'glock', 3: 'knife' })[s] || null };
  assert.ok(loadSpeedMul(inv) < loadSpeedMul(plain));
  assert.ok(loadSpeedMul({ ...inv, zoom: 1 }) < loadSpeedMul(inv) * 0.7);
});
test('friction stops the player and never reverses velocity', () => {
  const p = spawn(); run(p, { forward: 1 }, 1); run(p, {}, 1);
  assert.ok(Math.hypot(p.vx, p.vz) < 1e-3);
});
test('crouch factor lerps 0->1 over crouchSeconds and eye height glides 1.65 -> 1.05', () => {
  const p = spawn(); assert.equal(eyeHeight(p), M.eyeStand);
  run(p, { crouch: true }, M.crouchSeconds / 2);
  assert.ok(p.crouch > 0.4 && p.crouch < 0.6 && eyeHeight(p) < M.eyeStand && eyeHeight(p) > M.eyeCrouch);
  run(p, { crouch: true }, 0.5);
  assert.equal(p.crouch, 1); assert.ok(Math.abs(eyeHeight(p) - M.eyeCrouch) < 1e-9);
  run(p, {}, 0.5); assert.equal(p.crouch, 0);
});
test('cannot stand up under a low ceiling', () => {
  const p = spawn(0, 0, 30); p.crouch = 1; run(p, { crouch: true }, 0.5);
  run(p, {}, 1);
  assert.ok(p.crouch > 0.5, `crouch=${p.crouch}`);
  assert.ok(playerHeight(p) <= 1.25 + 1e-6);
  p.z = 0; run(p, {}, 0.5); assert.equal(p.crouch, 0);
});
test('walls stop the player and slide along them', () => {
  const p = spawn(5, 0, 0, -Math.PI / 4); // heading +x/-z diagonally? yaw -45deg => forward = (+sin45, -cos45)
  run(p, { forward: 1 }, 3);
  assert.ok(p.x < 9.7, `x=${p.x}`);
  assert.ok(p.z < -5, `slid along wall, z=${p.z}`);
});
const jumpPeak = p => { let peak = p.y; for (let i = 0; i < 128; i++) { stepPlayer(p, cmd({ jump: i === 0 }), collider); peak = Math.max(peak, p.y); } return peak; };
test('realistic jump: ~0.56 m under Earth gravity, needs a fresh press, lower with a heavy weapon', () => {
  const peak = jumpPeak(spawn());
  assert.ok(peak > 0.52 && peak < 0.6, `peak=${peak} m`);
  const q = spawn(); const e = run(q, { jump: true }, 3);
  assert.equal(e.filter(x => x.jumped).length, 1, 'holding space must not auto-bhop');
  const heavy = spawn(); heavy.speedMul = speedMul('negev');
  assert.ok(jumpPeak(heavy) < peak - 0.03, 'a 7.6 kg machine gun jumps lower');
});
// jumps again on the very tick it lands (no rest on the ground)
const chainPeak = p => { let peak = p.y, i = 0, up = false; stepPlayer(p, cmd({ jump: true }), collider);
  for (; i < 200; i++) { const e = stepPlayer(p, cmd({ jump: false }), collider); peak = Math.max(peak, p.y); if (!p.grounded) up = true; if (up && e.landed) break; } return peak; };
test('repeated jumps tire the legs; resting recovers them', () => {
  const p = spawn(), first = chainPeak(p), second = chainPeak(p), third = chainPeak(p);
  assert.ok(second < first - 0.02 && third < second, `${first} ${second} ${third}`);
  run(p, {}, 2.5); assert.ok(Math.abs(jumpPeak(p) - first) < 0.01, 'fully recovered after rest');
});
test('no air-strafe speed gain: mid-air steering cannot exceed the take-off speed', () => {
  const p = spawn(); run(p, { forward: 1 }, 1);
  const take = Math.hypot(p.vx, p.vz);
  stepPlayer(p, cmd({ forward: 1, jump: true, yaw: p.yaw }), collider);
  let yaw = 0, top = 0;
  for (let i = 0; i < 40; i++) { yaw += 0.028; stepPlayer(p, cmd({ right: 1, yaw }), collider); top = Math.max(top, Math.hypot(p.vx, p.vz)); }
  assert.ok(top <= take + 0.05, `air top=${top} take-off=${take}`);
});
test('jumping never adds speed and every landing costs momentum', () => {
  const p = spawn(); p.vx = 20; p.vz = 0;
  stepPlayer(p, cmd({ jump: true }), collider);
  assert.ok(Math.hypot(p.vx, p.vz) <= 250 * UNIT + 1e-6);
  const r = spawn(); run(r, { forward: 1 }, 1.5); const before = Math.hypot(r.vx, r.vz);
  stepPlayer(r, cmd({ forward: 1, jump: true, yaw: r.yaw }), collider);
  let landed = 0; for (let i = 0; i < 80 && !landed; i++) landed = stepPlayer(r, cmd({ forward: 1, yaw: r.yaw }), collider).landed;
  assert.ok(landed > 3 && Math.hypot(r.vx, r.vz) < before * 0.85, `landed ${landed} speed ${Math.hypot(r.vx, r.vz)} / ${before}`);
});
test('steps up stairs (0.2 m risers) and low crates, walks up a ramp', () => {
  const s = spawn(30, 0, 12, 0); let peak = 0;
  for (let i = 0; i < 110; i++) { stepPlayer(s, cmd({ forward: 1, yaw: 0 }), collider); peak = Math.max(peak, s.y); }
  assert.ok(peak > 1.55, `stairs peak y=${peak}`);
  const c = spawn(-10, 0, 6, 0); let cratePeak = 0;
  for (let i = 0; i < 100; i++) { stepPlayer(c, cmd({ forward: 1, yaw: 0 }), collider); cratePeak = Math.max(cratePeak, c.y); }
  assert.ok(cratePeak > 0.38, `crate peak=${cratePeak}`);
  const blocked = spawn(-20, 0, 6, 0); run(blocked, { forward: 1 }, 1.6);
  assert.ok(blocked.y < 0.05 && blocked.z > 0.5, `0.6 m block must stop the player, y=${blocked.y} z=${blocked.z}`);
  const r = spawn(0, 0, -14, 0); run(r, { forward: 1 }, 1.9);
  assert.ok(r.y > 1.2 && r.grounded, `ramp y=${r.y} z=${r.z}`);
});
test('silent walk emits zero footstep events; running and crouch behave per spec', () => {
  const walk = run(spawn(), { forward: 1, walk: true }, 3).filter(e => e.footstep).length;
  const crouch = run(spawn(), { forward: 1, crouch: true }, 3).filter(e => e.footstep).length;
  const running = run(spawn(), { forward: 1 }, 3).filter(e => e.footstep).length;
  assert.equal(walk, 0); assert.equal(crouch, 0); assert.ok(running >= 6, `running steps=${running}`);
});
test('raycasts report the surface material of the hit triangle', () => {
  assert.equal(collider.raycast(-10, 3, 0, 0, -1, 0, 10).surface, 'wood', 'crate box');
  assert.equal(collider.raycast(0, 3, 0, 0, -1, 0, 10).surface, 'concrete', 'concrete floor');
});
test('BVH raycast and floor lookup', () => {
  const hit = collider.raycast(0, 5, 0, 0, -1, 0, 50);
  assert.ok(hit && Math.abs(hit.distance - 5) < 1e-4 && hit.ny > 0.99);
  assert.ok(Math.abs(collider.floorHeight(0, 5, 0)) < 1e-4);
  assert.ok(Math.abs(collider.floorHeight(-10, 5, 0) - 0.4) < 1e-4);
  assert.equal(collider.wallDistance(0, 1, 0, 1, 0, 0, 100) > 8.9, true);
});
test('GLB writer/parser round-trips triangles and markers', () => {
  const m = boxMesh('crate', 'wood', 1, 2, 3, 2, 2, 2);
  const bytes = writeGLB({ materials: [{ name: 'wood', color: [1, 1, 1, 1], roughness: 0.8, metalness: 0 }], meshes: [m], markers: [{ name: 'spawn_T_1', x: 4, y: 0, z: 5 }] });
  const parsed = parseGLB(bytes);
  assert.equal(parsed.meshes.length, 1); assert.equal(parsed.meshes[0].material, 'wood');
  assert.deepEqual(Array.from(parsed.meshes[0].positions), Array.from(m.positions));
  assert.equal(parsed.markers[0].name, 'spawn_T_1'); assert.equal(parsed.markers[0].z, 5);
});

test('non-unit ray directions still respect world-distance limits', () => {
  assert.equal(collider.raycast(0, 2, 0, 0.1, 0, 0, 5), null);
  assert.ok(Math.abs(collider.raycast(0, 2, 0, 0.1, 0, 0, 12).distance - 9.5) < 0.01);
});

test('GLB rejects truncated chunks, cyclic nodes and out-of-bounds accessors', () => {
  const mesh = boxMesh('floor', 'stone', 0, 0, 0, 2, 1, 2);
  const bytes = writeGLB({ materials: [{ name: 'stone', color: [1, 1, 1, 1], roughness: 1, metalness: 0 }], meshes: [mesh] });
  assert.throws(() => parseGLB(bytes.slice(0, -4)), /length/);
  const jsonLength = new DataView(bytes.buffer).getUint32(12, true);
  const doc = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + jsonLength)));
  const rewrite = modify => {
    const changed = structuredClone(doc); modify(changed);
    const encoded = new TextEncoder().encode(JSON.stringify(changed)); const n = Math.ceil(encoded.length / 4) * 4;
    const tail = bytes.subarray(20 + jsonLength), output = new Uint8Array(20 + n + tail.length);
    output.set(bytes.subarray(0, 20)); output.fill(32, 20, 20 + n); output.set(encoded, 20); output.set(tail, 20 + n);
    const view = new DataView(output.buffer); view.setUint32(8, output.length, true); view.setUint32(12, n, true);
    return output;
  };
  assert.throws(() => parseGLB(rewrite(d => { d.nodes[0].children = [0]; })), /cyclic/);
  assert.throws(() => parseGLB(rewrite(d => { d.accessors[0].byteOffset = 999999; })), /outside buffer/);
});
