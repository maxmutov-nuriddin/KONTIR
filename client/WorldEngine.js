// WorldEngine: the whole visual side of a match.
//  * GLB map loading (GLTFLoader + meshopt/Draco) with a parallel three-mesh-bvh collider from the same bytes
//  * ACES filmic tone mapping @ exposure 1.0, physically-based sky, PMREM image-based lighting
//  * Cascaded soft shadow maps (CSM) with per-cascade bias tuning, optional GTAO + bloom (ULTRA)
//  * procedural PBR material processing for walls/props, static batching into frustum-cullable chunks
//  * separate viewmodel pass (own FOV + lights) so weapons never clip into geometry
import * as THREE from 'three';
import { disposeTree } from './src/dispose.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { CSM } from 'three/addons/csm/CSM.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { GTAOPass } from 'three/addons/postprocessing/GTAOPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { computeBoundsTree, disposeBoundsTree, acceleratedRaycast } from 'three-mesh-bvh';
import { buildMapData } from '../shared/maps.js';
import { applyPBR, recipeFor } from './src/materials.js';
import { Effects } from './src/effects.js';
import { animateOperator, buildOperator, holdWeapon } from './src/characters.js';
import { buildWeaponRigTP, buildWeaponRig } from './src/viewmodels.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

const QUALITY = {
  ultra: { pixelRatio: 1.5, shadows: true, mapSize: 2048, post: true, msaa: 0, cascades: 3, maxFar: 170 },
  high: { pixelRatio: 1, shadows: true, mapSize: 1024, post: false, msaa: 0, cascades: 2, maxFar: 150 },
  low: { pixelRatio: 0.7, shadows: false, mapSize: 512, post: false, msaa: 0, cascades: 3, maxFar: 60 },
};

// World-space macro variation: breaks texture tiling with large-scale tone patches and adds wall-base grime + vertical sun-bleach streaks.
const MACRO_GLSL = /* glsl */`
float mHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mHash(i + vec3(0,0,0)), mHash(i + vec3(1,0,0)), f.x), mix(mHash(i + vec3(0,1,0)), mHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mHash(i + vec3(0,0,1)), mHash(i + vec3(1,0,1)), f.x), mix(mHash(i + vec3(0,1,1)), mHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float mFbm(vec3 p){ return 0.5 * mNoise(p) + 0.25 * mNoise(p * 2.03) + 0.125 * mNoise(p * 4.1) + 0.0625 * mNoise(p * 8.3); }
`;
function patchMacro(material) {
  const chained = material.onBeforeCompile;
  material.onBeforeCompile = (shader, renderer) => {
    chained?.call(material, shader, renderer);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroPos; varying vec3 vMacroN;')
      .replace('#include <beginnormal_vertex>', '#include <beginnormal_vertex>\nvMacroN = normalize(mat3(modelMatrix) * objectNormal);')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvMacroPos = (modelMatrix * vec4(transformed, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vMacroPos; varying vec3 vMacroN;\n' + MACRO_GLSL)
      .replace('#include <color_fragment>', `#include <color_fragment>
        float mTone = mix(0.8, 1.16, mFbm(vec3(vMacroPos.xz * 0.05, 1.0))) * mix(0.93, 1.07, mFbm(vec3(vMacroPos.xz * 0.21, 4.0)));
        float mWall = 1.0 - smoothstep(0.35, 0.8, abs(vMacroN.y));
        float mGrime = mWall * (1.0 - smoothstep(0.0, 1.7, vMacroPos.y)) * (0.16 + 0.34 * mFbm(vMacroPos * vec3(1.3, 2.4, 1.3)));
        float mStreak = mWall * smoothstep(0.55, 0.9, mFbm(vec3((vMacroPos.x + vMacroPos.z) * 1.7, vMacroPos.y * 0.18, 3.0))) * 0.14;
        diffuseColor.rgb *= mTone * (1.0 - mGrime - mStreak);`);
  };
  material.customProgramCacheKey = () => `kontir-macro-v2-${material.defines?.CSM_CASCADES || 0}`;
}
const CHUNK = 28;
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();

export class WorldEngine {
  constructor(canvas, { quality = 'low' } = {}) {
    if (!Object.hasOwn(QUALITY, quality)) quality = 'low';
    this.canvas = canvas; this.qualityName = quality; this.quality = QUALITY[quality];
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: this.quality.msaa > 0, powerPreference: 'default', stencil: false });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = this.quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
    this.maxAniso = Math.min(8, renderer.capabilities.getMaxAnisotropy());

    this.scene = new THREE.Scene(); this.viewScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 700); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.viewCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 8);
    this.hemi = new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.3); this.scene.add(this.hemi);
    this.viewHemi = new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.3); this.viewScene.add(this.viewHemi);
    this.viewSun = new THREE.DirectionalLight(0xffffff, 3); this.viewSun.position.set(2, 3, 2); this.viewScene.add(this.viewSun, this.viewSun.target);
    this.effects = new Effects(this.scene, this.camera);
    this.actors = new Map(); this.labels = new Map(); this.materials = new Set();
    this.shake = 0; this.time = 0; this.menuMode = true; this.mapGroup = null; this.map = null; this.sunDir = new THREE.Vector3(-0.45, 0.7, 0.4).normalize();
    this.gltf = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    this.gltf.setDRACOLoader(new DRACOLoader().setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.7/'));
    this.makeMotes();
    this.buildBomb();
    this.applyQualityTargets();
    this.onResize = () => this.resize();
    addEventListener('resize', this.onResize);
  }

  // ------------------------------------------------------------------------------------------ environment
  setEnvironment(env) {
    this.env = env;
    const dir = new THREE.Vector3(...env.sun).normalize(); this.sunDir.copy(dir);
    if (this.sky) { this.scene.remove(this.sky); this.sky.material.dispose(); this.sky.geometry.dispose(); }
    const overcast = env.sky === 'overcast';
    const make = scale => {
      const sky = new Sky(); sky.scale.setScalar(scale);
      const u = sky.material.uniforms;
      u.turbidity.value = overcast ? 14 : 5.5; u.rayleigh.value = overcast ? 0.55 : 1.6; u.mieCoefficient.value = overcast ? 0.02 : 0.006; u.mieDirectionalG.value = overcast ? 0.6 : 0.86;
      u.sunPosition.value.copy(dir);
      return sky;
    };
    this.sky = make(480); this.sky.material.fog = false; this.scene.add(this.sky);
    const envScene = new THREE.Scene(); envScene.add(make(100));
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envRT?.dispose(); this.envRT = pmrem.fromScene(envScene, 0.02); pmrem.dispose(); disposeTree(envScene);
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = overcast ? 0.8 : 0.72;
    this.viewScene.environment = this.envRT.texture; this.viewScene.environmentIntensity = 0.55;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(env.fog), env.fogDensity);
    this.hemi.color.set(env.ambient); this.viewHemi.color.set(env.ambient);
    this.renderer.toneMappingExposure = env.exposure ?? 1.0;
    this.viewSun.color.set(env.sunColor); this.viewSun.intensity = env.sunIntensity * 1.1;
    this.buildSun();
    this.moteMat.opacity = overcast ? 0.18 : 0.42;
  }
  clearSun() {
    if (this.csm) {
      for (const light of this.csm.lights) light.shadow.dispose();
      this.csm.remove(); this.csm.dispose(); this.csm = null;
    }
    if (this.sun) { this.sun.removeFromParent(); this.sun.target.removeFromParent(); this.sun.dispose(); this.sun = null; }
  }
  prepareMaterial(m) {
    // Rebuild hooks once; repeated quality changes must not stack GLSL patches.
    m.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
    m.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
    this.csm?.setupMaterial(m);
    if (m.userData.macro && this.qualityName !== 'low') patchMacro(m);
    m.needsUpdate = true;
  }
  buildSun() {
    this.clearSun();
    const q = this.quality, env = this.env;
    if (!q.shadows) {
      this.sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity);
      this.sun.position.copy(this.sunDir).multiplyScalar(100); this.scene.add(this.sun, this.sun.target);
      for (const m of this.materials) this.prepareMaterial(m);
      return;
    }
    this.csm = new CSM({
      maxFar: q.maxFar, cascades: q.cascades, mode: 'practical', parent: this.scene, shadowMapSize: q.mapSize,
      lightDirection: this.sunDir.clone().negate(), camera: this.camera, lightIntensity: env.sunIntensity, lightNear: 1, lightFar: 400, shadowBias: -0.0002,
    });
    this.csm.fade = true;
    this.csm.lights.forEach((light, i) => {
      light.color.set(env.sunColor);
      light.castShadow = q.shadows;
      light.shadow.bias = -0.00015 - i * 0.00025;          // larger cascades cover more world per texel => more bias
      light.shadow.normalBias = 0.015 + i * 0.03;          // normal offset kills acne on grazing sunlit walls
      light.shadow.radius = 2.2 - i * 0.4;
    });
    for (const m of this.materials) this.prepareMaterial(m);
  }
  applyQualityTargets() {
    const r = this.renderer, q = this.quality;
    r.setPixelRatio(Math.min(devicePixelRatio || 1, q.pixelRatio) * (this.resScale ?? 1));
    r.shadowMap.enabled = q.shadows;
    this.disposeComposer();
    if (q.post) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
      const composer = this.composer = new EffectComposer(r, target);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const gtao = this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.4, scale: 1.1, samples: 10, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.blendIntensity = 0.85;
      composer.addPass(gtao);
      const view = this.viewPass = new RenderPass(this.viewScene, this.viewCamera); view.clear = false; view.clearDepth = true; composer.addPass(view);
      composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.18, 0.7, 0.92));
      composer.addPass(new OutputPass());
    }
  }
  disposeComposer() {
    if (this.composer) { for (const pass of this.composer.passes) pass.dispose?.(); this.composer.dispose(); }
    this.composer = null; this.gtao = null;
  }
  setQuality(name) {
    if (!Object.hasOwn(QUALITY, name) || name === this.qualityName) return;
    this.qualityName = name; this.quality = QUALITY[name];
    this.applyQualityTargets();
    if (this.env) this.buildSun();
    this.resize();
    for (const m of this.materials) m.needsUpdate = true;
  }
  /** Dynamic resolution: 0.6..1 of the tier's pixel ratio, applied only on meaningful changes (a resize reallocates targets). */
  setResolutionScale(k) {
    k = Math.round(Math.max(0.6, Math.min(1, k)) * 20) / 20;
    if (k === (this.resScale ?? 1)) return false;
    this.resScale = k; this.resize(); return true;
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio) * (this.resScale ?? 1)); this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix(); this.viewCamera.aspect = w / h; this.viewCamera.updateProjectionMatrix();
    this.composer?.setPixelRatio(this.renderer.getPixelRatio()); this.composer?.setSize(w, h); this.csm?.updateFrustums();
  }

  // ------------------------------------------------------------------------------------------ map loading
  /**
   * @param {{id:string,file:string,collision?:string,env:object}} meta manifest entry
   * @param {(fraction:number,label:string)=>void} [progress]
   */
  async loadMap(meta, progress = () => {}) {
    this.disposeMap();
    progress(0.05, 'Xarita yuklanmoqda');
    const fetchBytes = async url => { const r = await fetch(`/maps/${url}`); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
    const visualBytes = await fetchBytes(meta.file);
    const collisionBytes = meta.collision ? await fetchBytes(meta.collision) : visualBytes;
    progress(0.3, 'To‘qnashuv BVH qurilmoqda');
    const data = this.map = buildMapData(meta, collisionBytes);
    this.setEnvironment(meta.env);
    progress(0.5, 'Geometriya tayyorlanmoqda');
    const gltf = await this.gltf.parseAsync(visualBytes.buffer.slice(visualBytes.byteOffset, visualBytes.byteOffset + visualBytes.byteLength), '');
    const group = this.mapGroup = new THREE.Group(); group.name = `map_${meta.id}`;
    this.processScene(gltf.scene, group);
    this.scene.add(group);
    progress(0.9, 'Materiallar');
    this.buildSiteMarkers(data);
    data.radar = this.buildRadar(data);
    this.resize();
    progress(1, 'Tayyor');
    return data;
  }
  releaseTree(root) {
    disposeTree(root, m => { this.materials.delete(m); this.csm?.shaders.delete(m); });
  }
  disposeMap() {
    this.clearActors(); this.releaseTree(this.mapGroup); this.mapGroup = null;
    this.map?.collider.geometry.dispose(); this.map = null;
    this.effects.clear();
  }

  /** Converts loaded GLB materials to PBR, then merges every material into spatial chunks (few draw calls, culled per chunk). */
  processScene(root, out) {
    root.updateMatrixWorld(true);
    const buckets = new Map();
    root.traverse(o => {
      if (!o.isMesh || !o.geometry.attributes.position) return;
      if (/^(clip|nocollide_hidden|trigger)/i.test(o.name)) return;
      const source = o.geometry;
      const groups = Array.isArray(o.material) ? source.groups : [{ start: 0, count: source.index?.count ?? source.attributes.position.count, materialIndex: 0 }];
      for (const group of groups) {
        const mat = Array.isArray(o.material) ? o.material[group.materialIndex] : o.material;
        if (!mat || group.count === 0) continue;
        const key = mat.uuid;
        if (!buckets.has(key)) buckets.set(key, { material: mat, geos: [], decor: /^decor/i.test(o.name) });
        const geo = source.clone(); geo.applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(name)) geo.deleteAttribute(name);
        if (!geo.index) geo.setIndex(Array.from({ length: geo.attributes.position.count }, (_, i) => i));
        geo.setIndex(new THREE.BufferAttribute(geo.index.array.slice(group.start, group.start + group.count), 1));
        if (!geo.attributes.normal) geo.computeVertexNormals();
        if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
        buckets.get(key).geos.push(geo);
      }
    });
    for (const { material, geos, decor } of buckets.values()) {
      material.side = THREE.FrontSide; material.envMapIntensity = 1;
      if (!material.map && !material.normalMap) applyPBR(material, recipeFor(material.name || ''), { anisotropy: this.maxAniso });
      else for (const k of ['map', 'normalMap', 'roughnessMap', 'metalnessMap']) if (material[k]) material[k].anisotropy = this.maxAniso;
      if (/glass|window/i.test(material.name)) { material.envMapIntensity = 1.6; material.metalness = 0.25; }
      this.materials.add(material);
      if (!/glass|window|sandbag/i.test(material.name)) { material.userData.macro = true; }
      this.prepareMaterial(material);
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) throw new Error('Xarita geometriyasi birlashtirilmadi.');
      for (const chunk of this.splitGrid(merged)) {
        const mesh = new THREE.Mesh(chunk, material); mesh.castShadow = true; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; mesh.userData.decor = decor;
        out.add(mesh);
      }
    }
  }
  /** Splits an indexed geometry into CHUNK-metre cells that share the vertex buffers. */
  splitGrid(geo) {
    const pos = geo.attributes.position, idx = geo.index.array, cells = new Map();
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      const cx = Math.floor((pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3 / CHUNK), cz = Math.floor((pos.getZ(a) + pos.getZ(b) + pos.getZ(c)) / 3 / CHUNK);
      const key = `${cx},${cz}`; let list = cells.get(key); if (!list) cells.set(key, list = []);
      list.push(a, b, c);
    }
    const chunks = [];
    for (const list of cells.values()) {
      const g = new THREE.BufferGeometry();
      for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
      g.setIndex(new THREE.BufferAttribute(list.length > 65535 * 3 || pos.count > 65535 ? Uint32Array.from(list) : Uint16Array.from(list), 1));
      const box = new THREE.Box3(); for (const i of list) box.expandByPoint(tmpV.fromBufferAttribute(pos, i));
      g.boundingBox = box; g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      chunks.push(g);
    }
    return chunks;
  }
  buildSiteMarkers(data) {
    this.siteGroup = new THREE.Group(); this.mapGroup.add(this.siteGroup);
    for (const s of data.sites) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(s.radius - 0.16, s.radius, 96), new THREE.MeshBasicMaterial({ color: 0xe9b64f, transparent: true, opacity: 0.16, side: THREE.DoubleSide, depthWrite: false, fog: true }));
      ring.rotation.x = -Math.PI / 2; ring.position.set(s.x, s.y + 0.04, s.z); this.siteGroup.add(ring);
      const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
      g.fillStyle = 'rgba(0,0,0,0)'; g.clearRect(0, 0, 128, 128); g.font = '900 96px Barlow Condensed, Arial Narrow, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 8; g.strokeStyle = 'rgba(20,18,10,.7)'; g.strokeText(s.id, 64, 70); g.fillStyle = '#f0c15c'; g.fillText(s.id, 64, 70);
      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, opacity: 0.85, fog: false }));
      label.position.set(s.x, s.y + 5.5, s.z); label.scale.setScalar(3.4); this.siteGroup.add(label);
    }
  }
  /** Top-down radar image straight from the collision BVH (works for any GLB). */
  buildRadar(data, size = 256) {
    const pts = [...data.spawns.TERRORIST, ...data.spawns.COUNTER_TERRORIST, ...data.sites];
    const minX = Math.min(...pts.map(p => p.x)), maxX = Math.max(...pts.map(p => p.x)), minZ = Math.min(...pts.map(p => p.z)), maxZ = Math.max(...pts.map(p => p.z));
    const cx = data.bounds ? 0 : (minX + maxX) / 2, cz = data.bounds ? 0 : (minZ + maxZ) / 2;
    const half = data.bounds ? Math.max(data.bounds.x, data.bounds.z) / 2 + 2 : Math.max(maxX - minX, maxZ - minZ) / 2 + 24;
    const c = document.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'), img = g.createImageData(size, size);
    for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
      const x = cx + (px / size - 0.5) * half * 2, z = cz + (py / size - 0.5) * half * 2, hit = data.collider.raycast(x, 30, z, 0, -1, 0, 60), o = (py * size + px) * 4;
      let v = 0, a = 0;
      if (hit) { const h = 30 - hit.distance; a = 255; v = h > 2.6 ? 150 : h > 0.5 ? 108 : 46 + h * 20; if (data.bounds && (Math.abs(x) > data.bounds.x / 2 + 0.5 || Math.abs(z) > data.bounds.z / 2 + 0.5)) { v = 14; a = 0; } }
      img.data[o] = v * 0.86; img.data[o + 1] = v * 0.94; img.data[o + 2] = v; img.data[o + 3] = a;
    }
    g.putImageData(img, 0, 0);
    return { canvas: c, cx, cz, half };
  }

  // ------------------------------------------------------------------------------------------ dressing
  makeMotes() {
    const n = 420, pos = new Float32Array(n * 3), seed = new Float32Array(n);
    for (let i = 0; i < n; i++) { pos[i * 3] = (Math.random() - 0.5) * 60; pos[i * 3 + 1] = Math.random() * 12; pos[i * 3 + 2] = (Math.random() - 0.5) * 60; seed[i] = Math.random() * 100; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const c = document.createElement('canvas'); c.width = c.height = 32; const ctx = c.getContext('2d'); const grd = ctx.createRadialGradient(16, 16, 0, 16, 16, 16); grd.addColorStop(0, 'rgba(255,240,210,1)'); grd.addColorStop(1, 'rgba(255,240,210,0)'); ctx.fillStyle = grd; ctx.fillRect(0, 0, 32, 32);
    this.moteMat = new THREE.PointsMaterial({ map: new THREE.CanvasTexture(c), size: 0.09, transparent: true, opacity: 0.4, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false });
    this.motes = new THREE.Points(g, this.moteMat); this.motes.frustumCulled = false; this.motes.userData.seed = seed; this.scene.add(this.motes);
  }
  buildBomb() {
    const rig = buildWeaponRig('c4'); rig.group.scale.setScalar(1.35); rig.group.visible = false; this.scene.add(rig.group);
    this.bombRig = rig; this.bombLight = new THREE.PointLight(0xff3020, 0, 7, 2); this.scene.add(this.bombLight);
  }
  updateBomb(bomb, dt) {
    const rig = this.bombRig, planted = bomb && (bomb.state === 'planted' || bomb.state === 'dropped');
    rig.group.visible = !!planted;
    if (!planted) { this.bombLight.intensity = 0; return; }
    rig.group.position.set(bomb.x, bomb.y + 0.045, bomb.z);
    if (bomb.state === 'planted') {
      const rate = bomb.remaining < 10 ? 0.15 : bomb.remaining < 20 ? 0.35 : 0.8, on = (this.time % rate) < 0.06;
      this.bombLight.position.set(bomb.x, bomb.y + 0.3, bomb.z); this.bombLight.intensity = on ? 2.2 : 0; rig.parts.led.visible = on;
      const ctx = rig.parts.lcd.getContext('2d'), s = Math.max(0, Math.ceil(bomb.remaining));
      if (this._lcd !== s) { this._lcd = s; ctx.fillStyle = '#0d1a10'; ctx.fillRect(0, 0, 256, 96); ctx.fillStyle = '#5cff7a'; ctx.font = 'bold 64px monospace'; ctx.textAlign = 'center'; ctx.fillText(`${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`, 128, 70); rig.parts.lcdTex.needsUpdate = true; }
    } else this.bombLight.intensity = 0;
  }

  /** Weapons lying on the ground: merged third-person rigs, lying on their side, smoothed toward the snapshot. */
  updateDrops(list, dt) {
    this.drops ??= new Map();
    const seen = new Set();
    for (const d of list || []) {
      seen.add(d.id);
      let e = this.drops.get(d.id);
      if (!e) {
        const rig = buildWeaponRigTP(d.weapon); rig.group.rotation.set(0, d.yaw, Math.PI / 2, 'YXZ');
        rig.group.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; if (!this.materials.has(o.material)) { this.materials.add(o.material); this.prepareMaterial(o.material); } } });
        rig.group.position.set(d.x, d.y + 0.03, d.z); this.scene.add(rig.group);
        e = { rig, spin: 0 }; this.drops.set(d.id, e);
      }
      const g = e.rig.group, k = Math.min(1, dt * 18);
      g.position.x += (d.x - g.position.x) * k; g.position.y += (d.y + 0.03 - g.position.y) * k; g.position.z += (d.z - g.position.z) * k;
    }
    for (const [id, e] of this.drops) if (!seen.has(id)) { e.rig.group.removeFromParent(); this.drops.delete(id); }
  }
  /** Nearest dropped weapon in front of the camera within reach (client-side hint for the 'E' prompt). */
  aimedDrop(list) {
    const cam = this.camera, f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    let best = null, bestScore = 0.86;
    for (const d of list || []) {
      const dx = d.x - cam.position.x, dy = d.y + 0.05 - cam.position.y, dz = d.z - cam.position.z, dist = Math.hypot(dx, dy, dz);
      if (dist > 2.2) continue;
      const score = (dx * f.x + dy * f.y + dz * f.z) / (dist || 1) + (dist < 0.9 ? 0.2 : 0);
      if (score > bestScore) { best = d; bestScore = score; }
    }
    return best;
  }

  // ------------------------------------------------------------------------------------------ actors
  label(name) {
    const c = document.createElement('canvas'); c.width = 256; c.height = 48; const g = c.getContext('2d');
    g.font = '700 26px DM Sans, Arial, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 5; g.strokeStyle = 'rgba(0,0,0,.75)'; g.strokeText(name, 128, 26); g.fillStyle = '#e6f2ff'; g.fillText(name, 128, 26);
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthTest: false, depthWrite: false, fog: false, opacity: 0.85 }));
    s.scale.set(1.5, 0.28, 1); s.renderOrder = 10; return s;
  }
  clearActors() { for (const a of this.actors.values()) this.releaseTree(a); this.actors.clear(); this.labels.clear(); }
  /** remote: interpolated player list from Network.remote(); returns nothing. */
  updateActors(remote, localId, localTeam, dt) {
    const seen = new Set();
    for (const p of remote) {
      if (p.id === localId) continue;
      seen.add(p.id);
      let a = this.actors.get(p.id);
      if (!a || a.userData.team !== p.team) {
        if (a) this.releaseTree(a);
        a = buildOperator(p.team, [...p.id].reduce((n, c) => n + c.charCodeAt(0), 0)); this.actors.set(p.id, a); this.scene.add(a);
        a.traverse(o => { if (o.isMesh) { for (const m of [].concat(o.material)) { this.materials.add(m); this.prepareMaterial(m); } } });
        if (p.team === localTeam) { const l = this.label(p.name); a.add(l); l.position.y = 2.1; this.labels.set(p.id, l); }
      }
      const c = p.char, speed = Math.hypot(c.vx, c.vz);
      a.position.set(c.x, c.y, c.z);
      holdWeapon(a, p.weapon);
      a.visible = true;
      animateOperator(a, { speed: c.grounded ? speed : speed * 0.4, yaw: c.yaw, pitch: c.pitch, crouch: c.crouch || 0, alive: p.alive, dt, moveYaw: speed > 0.2 ? Math.atan2(-c.vx, -c.vz) : undefined });
      const l = this.labels.get(p.id); if (l) l.visible = p.alive;
    }
    for (const [id, a] of this.actors) if (!seen.has(id)) { this.releaseTree(a); this.actors.delete(id); this.labels.delete(id); }
  }
  actorMuzzleWorld(id, out) {
    const a = this.actors.get(id); if (!a) return null;
    const rig = a.userData.rigs.get(a.userData.weaponId); if (!rig?.muzzle) return null;
    return rig.muzzle.getWorldPosition(out);
  }

  // ------------------------------------------------------------------------------------------ frame
  /** Sets camera from gameplay state. eye: world position; yaw/pitch/roll radians (already includes recoil punch). */
  setCamera(eye, yaw, pitch, roll = 0) {
    this.camera.position.copy(eye);
    this.camera.rotation.set(pitch, yaw, roll, 'YXZ');
    if (this.shake > 0.001) {
      this.camera.position.x += (Math.random() - 0.5) * this.shake * 0.08; this.camera.position.y += (Math.random() - 0.5) * this.shake * 0.08;
      this.camera.rotation.z += (Math.random() - 0.5) * this.shake * 0.02;
    }
    this.camera.updateMatrixWorld(true);
  }
  setMenuCamera(time) {
    const t = time * 0.045, r = 46;
    this.camera.position.set(Math.cos(t) * r, 15 + Math.sin(t * 1.7) * 3, Math.sin(t) * r);
    this.camera.lookAt(0, 2.5, 0); this.camera.updateMatrixWorld(true);
  }
  render(dt, viewmodel = null) {
    this.time += dt; this.shake *= Math.exp(-dt * 7);
    this.effects.update(dt);
    // dust motes drift around the camera
    const arr = this.motes.geometry.attributes.position, cam = this.camera.position, seeds = this.motes.userData.seed;
    for (let i = 0; i < seeds.length; i++) {
      const s = seeds[i]; let x = arr.getX(i) + Math.sin(this.time * 0.3 + s) * dt * 0.25, y = arr.getY(i) + Math.cos(this.time * 0.21 + s * 1.7) * dt * 0.12, z = arr.getZ(i) + Math.sin(this.time * 0.17 + s * 0.6) * dt * 0.2;
      x = ((x - cam.x + 30) % 60 + 60) % 60 - 30 + cam.x; z = ((z - cam.z + 30) % 60 + 60) % 60 - 30 + cam.z; y = ((y - (cam.y - 5) + 12) % 12 + 12) % 12 + cam.y - 5;
      arr.setXYZ(i, x, y, z);
    }
    arr.needsUpdate = true;
    this.csm?.update();
    // viewmodel lights follow the camera orientation
    tmpQ.copy(this.camera.quaternion).invert(); tmpV.copy(this.sunDir).applyQuaternion(tmpQ);
    this.viewSun.position.copy(tmpV).multiplyScalar(4); this.viewSun.target.position.set(0, 0, 0);
    tmpE.setFromQuaternion(tmpQ, 'YXZ'); this.viewScene.environmentRotation?.copy(tmpE);
    this.viewScene.visible = viewmodel !== false;
    if (this.composer) { this.viewPass.enabled = viewmodel !== false; this.composer.render(dt); return; }
    const r = this.renderer; r.clear(); r.render(this.scene, this.camera);
    if (viewmodel !== false) { r.clearDepth(); r.render(this.viewScene, this.viewCamera); }
  }
  dispose() {
    this.renderer.setAnimationLoop(null); removeEventListener('resize', this.onResize);
    this.disposeMap(); this.clearSun(); this.disposeComposer(); this.envRT?.dispose();
    disposeTree(this.scene); disposeTree(this.viewScene); this.renderer.dispose();
  }
}
void tmpV2;
