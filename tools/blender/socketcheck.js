// Browser-side check (through the Vite dev server): where does a held weapon point for a character GLB?
// Mirrors client/src/characters.js buildSkinned(): socket child of `weapon_socket` with rotation (-pi/2, 0, pi/2).
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
export async function measure(path, clip = 'idle') {
  const gltf = await new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).loadAsync(path);
  const root = gltf.scene, mixer = new THREE.AnimationMixer(root);
  const a = gltf.animations.find(c => c.name === clip); if (a) mixer.clipAction(a).play(); mixer.update(0.0001);
  root.updateMatrixWorld(true);
  const ws = root.getObjectByName('weapon_socket'), sock = new THREE.Object3D(); ws.add(sock); sock.rotation.set(-Math.PI / 2, 0, Math.PI / 2);
  root.updateMatrixWorld(true);
  const v = (x, y, z) => new THREE.Vector3(x, y, z).transformDirection(sock.matrixWorld).toArray().map(n => +n.toFixed(3));
  const q = new THREE.Quaternion(); sock.getWorldQuaternion(q);
  return { muzzle: v(0, 0, -1), up: v(0, 1, 0), right: v(1, 0, 0), pos: new THREE.Vector3().setFromMatrixPosition(sock.matrixWorld).toArray().map(n => +n.toFixed(3)), quat: q.toArray().map(n => +n.toFixed(4)) };
}
