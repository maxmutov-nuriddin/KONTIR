// Armory viewer: /viewer.html?w=ak47&team=T&mode=fp|tp|orbit&yaw=0.6&crouch=0
// Renders a weapon exactly as the game does (first-person WeaponManager path or a third-person operator) for design review.
import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { WeaponManager } from '../WeaponManager.js';
import { ViewmodelDynamics } from '../PlayerController.js';
import { animateOperator, buildOperator, holdWeapon, setHoldPose } from './characters.js';
import { buildWeaponRig, weaponMaterials } from './viewmodels.js';
import { applyFinish } from './finishes.js';
import { WEAPONS } from '../../shared/weapons.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { models } from './models.js';

models.init(new GLTFLoader().setMeshoptDecoder(MeshoptDecoder)).then(() => models.preload()).then(main);
function main() {

const q = new URLSearchParams(location.search);
const id = q.get('w') || 'ak47', team = q.get('team') === 'CT' ? 'COUNTER_TERRORIST' : 'TERRORIST', mode = q.get('mode') || 'fp';
const canvas = document.querySelector('#c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.autoClear = false;
renderer.setPixelRatio(1); renderer.setSize(innerWidth, innerHeight, false);
document.querySelector('#hud').textContent = `${id.toUpperCase()} · ${team} · ${mode}`;

function environment(scene, sunDir) {
  const skyScene = new THREE.Scene(), sky = new Sky(); sky.scale.setScalar(100); skyScene.add(sky);
  const u = sky.material.uniforms; u.turbidity.value = 5.5; u.rayleigh.value = 1.6; u.mieCoefficient.value = 0.006; u.mieDirectionalG.value = 0.86; u.sunPosition.value.copy(sunDir);
  const pmrem = new THREE.PMREMGenerator(renderer), rt = pmrem.fromScene(skyScene, 0.02); pmrem.dispose();
  scene.environment = rt.texture; scene.environmentIntensity = 0.75;
}
const sunDir = new THREE.Vector3(-0.45, 0.72, 0.38).normalize();
const scene = new THREE.Scene(); scene.background = new THREE.Color(0xb7c4c9);
environment(scene, sunDir);
scene.add(new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.3));
const sun = new THREE.DirectionalLight(0xffe1b0, 3.2); sun.position.copy(sunDir).multiplyScalar(20); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 50 }); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02; scene.add(sun);
const ground = new THREE.Mesh(new THREE.CircleGeometry(30, 48), new THREE.MeshStandardMaterial({ color: 0xb59c6f, roughness: 1 })); ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground);

let camera, tick;
/** ?reload=0.45 freezes the reload animation at that progress (empty magazine => full reload with bolt / slide). */
function forceReload(wm) {
  const at = q.get('reload'); if (at === null) return;
  const inv = wm.inventory, a = inv.ammoOf(id); if (a) { a.mag = 0; a.reserve = 90; }
  wm.react({ type: 'reloadStart', weapon: id });
  inv.reloading = true; inv.reloadProgress = () => Number(at);
}
if (mode === 'gun') {
  // bare weapon model, studio-lit from the side (design review of the procedural arsenal)
  const vs = new THREE.Scene(); vs.background = new THREE.Color(0x9aa6ab); environment(vs, sunDir); vs.environmentIntensity = 1.0;
  vs.add(new THREE.HemisphereLight(0xdfe8f2, 0x6b5c48, 0.6)); const key = new THREE.DirectionalLight(0xfff1dc, 3.2); key.position.set(1.5, 2.5, 1); vs.add(key);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.6); rim.position.set(-1.5, 1, -2); vs.add(rim);
  const rig = buildWeaponRig(id); vs.add(rig.group);
  if (q.get('finish')) applyFinish(rig.group, q.get('finish'), weaponMaterials());
  const box = new THREE.Box3().setFromObject(rig.group), c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3());
  camera = new THREE.PerspectiveCamera(24, innerWidth / innerHeight, 0.01, 20);
  const [ax, ay, az] = (q.get('dir') || '1,0.12,0.18').split(',').map(Number), d = Math.max(size.z, size.y * 1.6) * 2.5;
  camera.position.set(c.x + ax * d, c.y + ay * d, c.z + az * d); camera.lookAt(c);
  tick = () => { renderer.clear(); renderer.render(vs, camera); };
} else if (mode === 'rig') {
  // rig inspection: the first-person rig (weapon + sleeves + hands) seen from outside
  const vs = new THREE.Scene(); vs.background = new THREE.Color(0x8c9aa1); environment(vs, sunDir); vs.environmentIntensity = 0.7;
  vs.add(new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.4)); vs.environmentIntensity = 0.9; { const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4); rim.position.set(1.2, 1.4, -3); vs.add(rim); } const l = new THREE.DirectionalLight(0xffe1b0, 3.5); l.position.set(-1.5, 3, 2); vs.add(l);
  const km = id.startsWith('knife_') ? id.slice(6) : null, wid = km ? 'knife' : id;
  const wm = new WeaponManager(vs, team); if (km) wm.modelFor = () => km; wm.inventory.give(wid, { select: true }); if (km) wm.inventory.select(3, { force: true }); wm.inventory.drawUntil = 0; wm.setActive(wid);
  if (q.get('hr')) { const n = k => q.get(k).split(',').map(Number), R = wm.activeRig; R.hands = { ...R.hands, right: { ...R.hands.right, p: n('hp'), r: n('hr'), elbow: q.get('he') ? n('he') : R.hands.right.elbow, grip: q.get('hg') || R.hands.right.grip } }; wm.setActive(wid, true); }
  forceReload(wm);
  const dyn = new ViewmodelDynamics(); camera = new THREE.PerspectiveCamera(35, innerWidth / innerHeight, 0.01, 20);
  const cam = new THREE.Vector3(...(q.get('cam') || '0.9,0.35,0.5').split(',').map(Number)), at = new THREE.Vector3(...(q.get('at') || '0.1,-0.15,-0.4').split(',').map(Number));
  tick = dt => { wm.update(dt, dyn); camera.position.copy(cam); camera.lookAt(at); renderer.clear(); renderer.render(vs, camera); };
} else if (mode === 'fp') {
  // identical set-up to the game's viewmodel pass
  const viewScene = new THREE.Scene(); viewScene.background = new THREE.Color(0x8c9aa1);
  environment(viewScene, sunDir); viewScene.environmentIntensity = 0.55;
  viewScene.add(new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.3));
  const light = new THREE.DirectionalLight(0xffe1b0, 3.5); light.position.set(-1.5, 3, 2); viewScene.add(light);
  const rim = new THREE.DirectionalLight(0xcfe0ff, 1.4); rim.position.set(1.2, 1.4, -3); viewScene.add(rim); viewScene.environmentIntensity = 0.9;
  camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 8);
  // knife models (knife_karambit…) are shown the way the game does: the 'knife' weapon with that model equipped
  const km = id.startsWith('knife_') ? id.slice(6) : null, wid = km ? 'knife' : id;
  const wm = new WeaponManager(viewScene, team); if (km) wm.modelFor = () => km; wm.inventory.give(wid, { select: true }); if (km) wm.inventory.select(3, { force: true }); wm.inventory.drawUntil = 0; wm.setActive(wid);
  // pose tuning: &hp=x,y,z&hr=rx,ry,rz&he=ex,ey,ez&hg=grip overrides the right hand on the active rig
  if (q.get('hr')) { const n = k => q.get(k).split(',').map(Number), R = wm.activeRig; R.hands = { ...R.hands, right: { ...R.hands.right, p: n('hp'), r: n('hr'), elbow: q.get('he') ? n('he') : R.hands.right.elbow, grip: q.get('hg') || R.hands.right.grip } }; wm.setActive(wid, true); }
  const dyn = new ViewmodelDynamics(); const grid = new THREE.GridHelper(4, 16, 0x556, 0x445); grid.position.set(0, -0.6, -1); if (q.get('grid')) viewScene.add(grid);
  window.__wm = wm;
  forceReload(wm);
  tick = dt => { wm.update(dt, dyn); renderer.clear(); renderer.render(viewScene, camera); };
} else {
  camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.05, 100);
  const actor = buildOperator(team, Number(q.get('seed') || 1), q.get('agent') || undefined); scene.add(actor);
  actor.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
  const crouch = Number(q.get('crouch') || 0), pitch = Number(q.get('pitch') || 0), yaw = Number(q.get('yaw') || 0.6), speed = Number(q.get('speed') || 0);
  holdWeapon(actor, id); if (q.get('pose')) setHoldPose(actor, q.get('pose'));
  const focus = Number(q.get('focus')) || (mode === 'orbit' ? 1.0 : 0.95), dist = Number(q.get('dist') || (mode === 'orbit' ? 2.2 : 3.6));
  tick = (dt, t) => {
    animateOperator(actor, { speed, yaw: 0, pitch, crouch, alive: true, dt, moveYaw: speed ? Math.PI : undefined });
    const a = yaw + (mode === 'orbit' ? t * 0.4 : 0);
    camera.position.set(Math.sin(a) * dist, focus + 0.35, Math.cos(a) * dist); camera.lookAt(0, focus, 0);
    renderer.clear(); renderer.render(scene, camera);
  };
}
let last = performance.now(), time = 0, frames = 0;
renderer.setAnimationLoop(now => { const dt = Math.max(0, Math.min(0.05, (now - last) / 1000)); last = now; time += dt; tick(dt, time); if (++frames === 3) window.__viewerReady = true; });
addEventListener('resize', () => { renderer.setSize(innerWidth, innerHeight, false); camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); });
window.__viewer = { WEAPONS, buildWeaponRig };
}
