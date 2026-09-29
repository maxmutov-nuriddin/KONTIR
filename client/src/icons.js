// Weapon icons (side view, transparent PNG) rendered once per weapon/finish with a small offscreen renderer.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildWeaponRigTP, weaponMaterials } from './viewmodels.js';
import { applyFinish } from './finishes.js';

let ctx = null;
const cache = new Map();
function setup() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(1); renderer.setSize(320, 160, false); renderer.outputColorSpace = THREE.SRGBColorSpace; renderer.toneMapping = THREE.ACESFilmicToneMapping;
  const scene = new THREE.Scene(), pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture; pmrem.dispose();
  const key = new THREE.DirectionalLight(0xffffff, 2.2); key.position.set(3, 4, 2); scene.add(key);
  const rim = new THREE.DirectionalLight(0xbfd4ff, 1.2); rim.position.set(-2, 1, -3); scene.add(rim);
  const camera = new THREE.OrthographicCamera(-1, 1, 0.5, -0.5, 0.01, 20);
  return { renderer, scene, camera };
}
/** Data-URL icon; the weapon's muzzle points right. */
export function weaponIcon(id, finish = 'standard') {
  const k = `${id}:${finish}`;
  if (cache.has(k)) return cache.get(k);
  try {
    ctx ||= setup();
    const { renderer, scene, camera } = ctx, rig = buildWeaponRigTP(id);
    applyFinish(rig.group, finish, weaponMaterials());
    scene.add(rig.group);
    const box = new THREE.Box3().setFromObject(rig.group), c = box.getCenter(new THREE.Vector3()), s = box.getSize(new THREE.Vector3());
    const half = Math.max(s.z / 2 / 0.92, s.y / 0.92) * 1.04;
    Object.assign(camera, { left: -half, right: half, top: half / 2, bottom: -half / 2 }); camera.updateProjectionMatrix();
    camera.position.set(c.x + 5, c.y + 0.25, c.z); camera.lookAt(c.x, c.y, c.z);
    renderer.clear(); renderer.render(scene, camera);
    const url = renderer.domElement.toDataURL('image/png');
    scene.remove(rig.group);
    cache.set(k, url);
    return url;
  } catch { return ''; }
}
