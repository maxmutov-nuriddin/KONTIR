// Transient visuals: tracers, bullet-hole decals, dust / spark / blood puffs, volumetric-style smoke grenades,
// explosions with real point-light flashes and grenade projectiles. All objects are pooled: no per-shot allocation.
import * as THREE from 'three';
import { buildWeaponRig } from './viewmodels.js';

function radialTexture(stops, size = 128) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [t, col] of stops) g.addColorStop(t, col);
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function cloudTexture(size = 256, seed = 1) {
  const c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  ctx.clearRect(0, 0, size, size);
  let s = seed * 9301 + 49297; const rnd = () => (s = (s * 9301 + 49297) % 233280) / 233280;
  for (let i = 0; i < 46; i++) {
    const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.7) * size * 0.3, x = size / 2 + Math.cos(a) * r, y = size / 2 + Math.sin(a) * r, rad = size * (0.09 + rnd() * 0.13);
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, `rgba(255,255,255,${0.16 + rnd() * 0.14})`); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}
function holeTexture() {
  const size = 128, c = document.createElement('canvas'); c.width = c.height = size; const ctx = c.getContext('2d');
  const g = ctx.createRadialGradient(64, 64, 4, 64, 64, 60);
  g.addColorStop(0, 'rgba(8,7,6,0.98)'); g.addColorStop(0.16, 'rgba(14,12,10,0.95)'); g.addColorStop(0.32, 'rgba(60,52,44,0.6)'); g.addColorStop(0.6, 'rgba(90,80,68,0.22)'); g.addColorStop(1, 'rgba(90,80,68,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
  ctx.strokeStyle = 'rgba(20,18,15,0.55)'; ctx.lineWidth = 1.4;
  for (let i = 0; i < 9; i++) { const a = (i / 9) * Math.PI * 2 + Math.random() * 0.3, r = 22 + Math.random() * 30; ctx.beginPath(); ctx.moveTo(64 + Math.cos(a) * 10, 64 + Math.sin(a) * 10); ctx.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); ctx.stroke(); }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; return tex;
}

const UP = new THREE.Vector3(0, 1, 0), tmpV = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpM = new THREE.Matrix4(), tmpS = new THREE.Vector3(1, 1, 1);

export class Effects {
  constructor(scene, camera) {
    this.scene = scene; this.camera = camera; this.time = 0;
    this.soft = radialTexture([[0, 'rgba(255,255,255,1)'], [0.4, 'rgba(255,255,255,0.55)'], [1, 'rgba(255,255,255,0)']]);
    this.fire = radialTexture([[0, 'rgba(255,250,220,1)'], [0.25, 'rgba(255,190,90,0.9)'], [0.6, 'rgba(230,80,20,0.45)'], [1, 'rgba(120,30,10,0)']]);
    this.clouds = [cloudTexture(256, 1), cloudTexture(256, 2), cloudTexture(256, 3)];
    // tracers
    this.tracerGeo = new THREE.PlaneGeometry(1, 1);
    this.tracerMat = new THREE.MeshBasicMaterial({ map: radialTexture([[0, 'rgba(255,235,180,1)'], [0.5, 'rgba(255,200,110,0.75)'], [1, 'rgba(255,170,60,0)']]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false });
    this.tracers = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(this.tracerGeo, this.tracerMat); m.visible = false; m.frustumCulled = false; scene.add(m); return { mesh: m, live: false, from: new THREE.Vector3(), dir: new THREE.Vector3(), len: 0, t: 0, speed: 420 }; });
    // bullet-hole decals (instanced ring buffer)
    const holeMat = new THREE.MeshBasicMaterial({ map: holeTexture(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
    this.decals = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), holeMat, 256); this.decals.count = 0; this.decals.frustumCulled = false; this.decalHead = 0; this.decalCount = 0; scene.add(this.decals);
    // sprites for puffs / sparks / blood / fire
    this.puffs = Array.from({ length: 160 }, () => {
      const m = new THREE.SpriteMaterial({ map: this.soft, transparent: true, depthWrite: false, fog: true }); const s = new THREE.Sprite(m); s.visible = false; scene.add(s);
      return { s, live: false, life: 0, age: 0, vel: new THREE.Vector3(), grow: 1, size: 1, gravity: 0, opacity: 1, spin: 0 };
    });
    // pooled lights: constant light count => no shader recompiles when effects fire
    this.lights = Array.from({ length: 3 }, () => { const l = new THREE.PointLight(0xffb060, 0, 22, 2); l.castShadow = false; scene.add(l); return { light: l, life: 0, peak: 0 }; });
    // smoke volumes
    this.smokes = new Map();
    // shell casings
    this.casingGeo = new THREE.CylinderGeometry(0.0055, 0.0055, 0.028, 8); this.casingMat = new THREE.MeshStandardMaterial({ color: 0xc09a45, metalness: 1, roughness: 0.32 });
    this.casings = Array.from({ length: 24 }, () => { const m = new THREE.Mesh(this.casingGeo, this.casingMat); m.visible = false; m.castShadow = true; scene.add(m); return { m, live: false, vel: new THREE.Vector3(), spin: new THREE.Vector3(), life: 0, floor: 0 }; });
    // shockwave
    this.ringGeo = new THREE.RingGeometry(0.8, 1, 48); this.rings = Array.from({ length: 4 }, () => { const m = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: 0xffe0b0, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending })); m.rotation.x = -Math.PI / 2; m.visible = false; scene.add(m); return { m, live: false, age: 0, life: 0, size: 1 }; });
    // grenade projectiles
    this.projectiles = new Map();
  }

  // ---------------------------------------------------------------------------------------- helpers
  spawnPuff(pos, { color = 0xd8c39a, size = 0.4, grow = 2.2, life = 0.8, vel = null, gravity = 0, opacity = 0.5, map = this.soft, additive = false } = {}) {
    const p = this.puffs.find(q => !q.live); if (!p) return null;
    p.live = true; p.age = 0; p.life = life; p.size = size; p.grow = grow; p.gravity = gravity; p.opacity = opacity;
    p.s.visible = true; p.s.position.copy(pos); p.s.material.color.setHex(color); p.s.material.map = map; p.s.material.opacity = opacity; p.s.material.blending = additive ? THREE.AdditiveBlending : THREE.NormalBlending;
    p.s.material.rotation = Math.random() * 6.28; p.spin = (Math.random() - 0.5) * 1.2; p.s.scale.setScalar(size);
    if (vel) p.vel.copy(vel); else p.vel.set(0, 0, 0);
    return p;
  }
  flashLight(pos, color, intensity, life, distance = 22) {
    const l = this.lights.reduce((best, c) => (c.life < best.life ? c : best), this.lights[0]);
    l.light.position.copy(pos); l.light.color.setHex(color); l.light.distance = distance; l.peak = intensity; l.life = life; l.age = 0;
  }

  // ---------------------------------------------------------------------------------------- events
  tracer(from, to, local = false) {
    const t = this.tracers.find(x => !x.live); if (!t) return;
    t.from.set(from.x, from.y, from.z); tmpV.set(to.x - from.x, to.y - from.y, to.z - from.z); t.len = tmpV.length(); if (t.len < 2) return;
    t.dir.copy(tmpV).multiplyScalar(1 / t.len); t.t = local ? 1.2 : 0; t.live = true; t.mesh.visible = true; t.width = local ? 0.012 : 0.02;
  }
  impact(point, normal, kind = 'wall') {
    if (kind === 'wall') {
      const n = tmpV.set(normal.nx, normal.ny, normal.nz).normalize();
      tmpQ.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      const size = 0.09 + Math.random() * 0.05; tmpS.set(size, size, 1);
      tmpM.compose(new THREE.Vector3(point.x + n.x * 0.006, point.y + n.y * 0.006, point.z + n.z * 0.006), tmpQ.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.random() * 6.28)), tmpS);
      this.decals.setMatrixAt(this.decalHead, tmpM); this.decalHead = (this.decalHead + 1) % 256; this.decalCount = Math.min(256, this.decalCount + 1); this.decals.count = this.decalCount; this.decals.instanceMatrix.needsUpdate = true;
      const base = new THREE.Vector3(point.x, point.y, point.z);
      for (let i = 0; i < 5; i++) {
        const v = new THREE.Vector3((Math.random() - 0.5) * 0.9, Math.random() * 0.7, (Math.random() - 0.5) * 0.9).addScaledVector(n, 0.9 + Math.random() * 0.9);
        this.spawnPuff(base.clone().addScaledVector(n, 0.03), { color: 0xcdb98f, size: 0.16 + Math.random() * 0.12, grow: 3.6, life: 0.55 + Math.random() * 0.4, vel: v.multiplyScalar(0.85), gravity: -0.6, opacity: 0.42 });
      }
      for (let i = 0; i < 4; i++) this.spawnPuff(base, { color: 0xffd9a0, size: 0.028, grow: 0.5, life: 0.18, vel: new THREE.Vector3((Math.random() - 0.5) * 2.4, Math.random() * 2.2, (Math.random() - 0.5) * 2.4).addScaledVector(n, 2.6), gravity: 9, opacity: 1, additive: true });
    } else {
      const base = new THREE.Vector3(point.x, point.y, point.z);
      for (let i = 0; i < 6; i++) this.spawnPuff(base, { color: 0x8c1c16, size: 0.09 + Math.random() * 0.06, grow: 2.4, life: 0.5, vel: new THREE.Vector3((Math.random() - 0.5) * 1.6, Math.random() * 1.2, (Math.random() - 0.5) * 1.6), gravity: 4, opacity: 0.7 });
    }
  }
  remoteMuzzle(pos) {
    this.flashLight(pos, 0xffb46a, 3.2, 0.06, 14);
    this.spawnPuff(pos, { color: 0xffd9a0, size: 0.32, grow: 1.2, life: 0.05, opacity: 0.95, additive: true, map: this.fire });
  }
  casing(pos, dir, floorY) {
    const c = this.casings.find(x => !x.live) || this.casings[0];
    c.live = true; c.life = 1.8; c.floor = floorY; c.m.visible = true; c.m.position.copy(pos);
    c.vel.copy(dir).multiplyScalar(2 + Math.random()).add(new THREE.Vector3(0, 1.6 + Math.random() * 0.8, 0)); c.spin.set(Math.random() * 20, Math.random() * 20, Math.random() * 20);
  }
  smoke(id, x, y, z, radius, age = 0, left = 18) {
    if (this.smokes.has(id)) return;
    const puffs = [];
    for (let i = 0; i < 30; i++) {
      const m = new THREE.SpriteMaterial({ map: this.clouds[i % 3], transparent: true, depthWrite: false, color: new THREE.Color().setHSL(0.1, 0.03, 0.72 + Math.random() * 0.2), opacity: 0 });
      const s = new THREE.Sprite(m); this.scene.add(s);
      const u = new THREE.Vector3(Math.random() * 2 - 1, Math.random() * 1.3 - 0.35, Math.random() * 2 - 1); if (u.lengthSq() > 1) u.normalize().multiplyScalar(Math.random() ** 0.5);
      puffs.push({ s, home: u, size: radius * (1.1 + Math.random() * 0.9), spin: (Math.random() - 0.5) * 0.25, phase: Math.random() * 6 });
    }
    this.smokes.set(id, { pos: new THREE.Vector3(x, y, z), radius, age, life: age + left, puffs });
  }
  explosion(x, y, z, kind = 'he') {
    const p = new THREE.Vector3(x, y, z), big = kind === 'c4' ? 2.6 : 1;
    this.flashLight(p.clone().add(new THREE.Vector3(0, 0.8, 0)), 0xff9a4a, 80 * big, 0.5, 40 * big);
    for (let i = 0; i < 14; i++) this.spawnPuff(p, { color: 0xff9a3a, size: (0.9 + Math.random() * 0.8) * big, grow: 3.4, life: 0.5 + Math.random() * 0.25, vel: new THREE.Vector3((Math.random() - 0.5) * 6, Math.random() * 5, (Math.random() - 0.5) * 6).multiplyScalar(big), opacity: 0.95, additive: true, map: this.fire });
    for (let i = 0; i < 18; i++) this.spawnPuff(p, { color: 0x3a342e, size: (0.9 + Math.random() * 1.1) * big, grow: 3.2, life: 1.6 + Math.random() * 1.4, vel: new THREE.Vector3((Math.random() - 0.5) * 5, 1.5 + Math.random() * 4.5, (Math.random() - 0.5) * 5).multiplyScalar(big), opacity: 0.55, map: this.clouds[i % 3] });
    for (let i = 0; i < 26; i++) this.spawnPuff(p, { color: 0xffd28a, size: 0.05, grow: 0.4, life: 0.5 + Math.random() * 0.4, vel: new THREE.Vector3((Math.random() - 0.5) * 22, Math.random() * 16, (Math.random() - 0.5) * 22).multiplyScalar(big), gravity: 14, opacity: 1, additive: true });
    const ring = this.rings.find(r => !r.live); if (ring) { ring.live = true; ring.age = 0; ring.life = 0.45; ring.size = 16 * big; ring.m.visible = true; ring.m.position.set(x, y + 0.08, z); }
  }
  flashPop(pos) { this.flashLight(pos, 0xffffff, 60, 0.18, 30); this.spawnPuff(pos, { color: 0xffffff, size: 3, grow: 3, life: 0.16, opacity: 1, additive: true }); }

  /** Sync in-flight grenades from the snapshot (smoothed towards the authoritative position). */
  syncGrenades(list, dt) {
    const seen = new Set();
    for (const g of list) {
      seen.add(g.id);
      let pr = this.projectiles.get(g.id);
      if (!pr) {
        const rig = buildWeaponRig(g.type); rig.group.traverse(o => { if (o.isMesh) o.castShadow = true; });
        rig.group.scale.setScalar(1.15); this.scene.add(rig.group);
        if (rig.parts.lever) rig.parts.lever.rotation.y += 0.9; if (rig.parts.pin) rig.parts.pin.visible = false;
        pr = { rig, pos: new THREE.Vector3(g.x, g.y, g.z), spin: new THREE.Vector3(Math.random() * 8, Math.random() * 8, Math.random() * 8), last: new THREE.Vector3(g.x, g.y, g.z) };
        this.projectiles.set(g.id, pr);
      }
      pr.last.copy(pr.pos); pr.pos.lerp(tmpV.set(g.x, g.y, g.z), Math.min(1, dt * 24));
      const speed = pr.pos.distanceTo(pr.last) / Math.max(dt, 1e-3);
      pr.rig.group.position.copy(pr.pos);
      const k = Math.min(1, speed / 4); pr.rig.group.rotation.x += pr.spin.x * dt * k; pr.rig.group.rotation.y += pr.spin.y * dt * k; pr.rig.group.rotation.z += pr.spin.z * dt * k;
    }
    for (const [id, pr] of this.projectiles) if (!seen.has(id)) { this.scene.remove(pr.rig.group); this.projectiles.delete(id); }
  }

  // ---------------------------------------------------------------------------------------- frame
  update(dt) {
    this.time += dt;
    const cam = this.camera.position;
    for (const t of this.tracers) {
      if (!t.live) continue;
      t.t += t.speed * dt;
      const tail = Math.max(0, t.t - 5), head = Math.min(t.len, t.t);
      if (tail >= t.len) { t.live = false; t.mesh.visible = false; continue; }
      const len = Math.max(0.05, head - tail);
      tmpV.copy(t.from).addScaledVector(t.dir, (head + tail) / 2);
      const toCam = new THREE.Vector3().subVectors(cam, tmpV).normalize();
      const up = new THREE.Vector3().crossVectors(toCam, t.dir).normalize();
      const n = new THREE.Vector3().crossVectors(t.dir, up);
      tmpM.makeBasis(t.dir, up, n).setPosition(tmpV); t.mesh.matrix.copy(tmpM); t.mesh.matrixAutoUpdate = false;
      t.mesh.matrix.scale(tmpS.set(len, t.width, 1)); t.mesh.matrixWorld.copy(t.mesh.matrix); t.mesh.matrixWorldNeedsUpdate = false;
    }
    for (const p of this.puffs) {
      if (!p.live) continue;
      p.age += dt; const k = p.age / p.life;
      if (k >= 1) { p.live = false; p.s.visible = false; continue; }
      p.vel.y -= p.gravity * dt; p.vel.multiplyScalar(1 - Math.min(1, dt * 1.6)); p.s.position.addScaledVector(p.vel, dt);
      p.s.scale.setScalar(p.size * (1 + (p.grow - 1) * Math.sqrt(k)));
      p.s.material.opacity = p.opacity * (1 - k) * (k < 0.1 ? k / 0.1 : 1); p.s.material.rotation += p.spin * dt;
    }
    for (const l of this.lights) {
      if (l.life <= 0) { l.light.intensity = 0; continue; }
      l.age += dt; l.life -= dt; l.light.intensity = l.peak * Math.max(0, l.life) / (l.life + l.age);
      if (l.life <= 0) l.light.intensity = 0;
    }
    for (const c of this.casings) {
      if (!c.live) continue;
      c.life -= dt; if (c.life <= 0) { c.live = false; c.m.visible = false; continue; }
      c.vel.y -= 9.8 * dt; c.m.position.addScaledVector(c.vel, dt);
      c.m.rotation.x += c.spin.x * dt; c.m.rotation.y += c.spin.y * dt;
      if (c.m.position.y < c.floor + 0.01) { c.m.position.y = c.floor + 0.01; c.vel.y *= -0.35; c.vel.x *= 0.6; c.vel.z *= 0.6; c.spin.multiplyScalar(0.5); }
    }
    for (const r of this.rings) {
      if (!r.live) continue;
      r.age += dt; const k = r.age / r.life; if (k >= 1) { r.live = false; r.m.visible = false; continue; }
      r.m.scale.setScalar(1 + k * r.size); r.m.material.opacity = 0.7 * (1 - k) * (1 - k);
    }
    for (const [id, sm] of this.smokes) {
      sm.age += dt;
      if (sm.age >= sm.life) { for (const p of sm.puffs) { this.scene.remove(p.s); p.s.material.dispose(); } this.smokes.delete(id); continue; }
      const grow = Math.min(1, sm.age / 1.6), fade = Math.min(1, (sm.life - sm.age) / 3.5);
      for (const p of sm.puffs) {
        const drift = Math.sin(this.time * 0.35 + p.phase) * 0.15;
        p.s.position.set(sm.pos.x + p.home.x * sm.radius * 0.72 * grow + drift, sm.pos.y + p.home.y * sm.radius * 0.55 * grow, sm.pos.z + p.home.z * sm.radius * 0.72 * grow + drift);
        p.s.scale.setScalar(p.size * (0.35 + 0.65 * grow) * 1.6); p.s.material.opacity = 0.78 * fade * Math.min(1, sm.age / 0.5); p.s.material.rotation += p.spin * dt;
      }
    }
  }
  clear() {
    for (const t of this.tracers) { t.live = false; t.mesh.visible = false; }
    for (const p of this.puffs) { p.live = false; p.s.visible = false; }
    for (const c of this.casings) { c.live = false; c.m.visible = false; }
    for (const l of this.lights) { l.life = 0; l.light.intensity = 0; }
    for (const sm of this.smokes.values()) for (const p of sm.puffs) { this.scene.remove(p.s); p.s.material.dispose(); }
    this.smokes.clear(); this.decalCount = 0; this.decals.count = 0;
    for (const pr of this.projectiles.values()) this.scene.remove(pr.rig.group);
    this.projectiles.clear();
  }
}
