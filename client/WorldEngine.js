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
import { animateOperator, buildOperator, holdWeapon, prebuildOperators, setHoldPose, setOperatorDetail } from './src/characters.js';
import { RIG_IDS, buildWeaponRigTP, buildWeaponRig } from './src/viewmodels.js';
import { models } from './src/models.js';
import { Upscaler } from './src/upscaler.js';

THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
THREE.Mesh.prototype.raycast = acceleratedRaycast;

// pixelRatio: canvas (output) DPR cap. render: scene DPR cap for the upscaler path (FSR-style: scene rendered at
// render/pixelRatio of the canvas, then sharpened by RCAS). msaa on the upscaler path is runtime-switchable.
// operatorLod: distance (m) at which operators switch to their low-poly LOD.
export const QUALITY = {
  ultra: { pixelRatio: 2, shadows: true, mapSize: 2048, post: true, msaa: 4, cascades: 3, maxFar: 170, macro: true, motes: true, operatorLod: 30 },
  high: { pixelRatio: 2, render: 1.75, sharpen: 0.25, shadows: true, mapSize: 1024, post: false, msaa: 4, cascades: 2, maxFar: 120, macro: true, motes: true, operatorLod: 22 },
  // TINIQ: eski/oddiy PC uchun eng toza tasvir — to‘liq ruxsat, 4x MSAA, RCAS keskinlashtirish, bitta yengil soya
  // kaskadi (har 2-kadrda). FPS tushsa ichki ruxsat 60 % gacha pasayadi, lekin RCAS tufayli tasvir xiralashmaydi.
  crisp: { pixelRatio: 2, render: 1.5, sharpen: 0.45, shadows: true, mapSize: 1024, post: false, msaa: 4, cascades: 1, maxFar: 42, shadowEvery: 2, macro: true, motes: false, operatorLod: 16 },
  // O'RTA (MacBook / Iris): UI va canvas Retina 2x, sahna 1x da 2x MSAA + RCAS keskinlashtirish — tiniq va fansiz MacBook Air'da ham sovuq
  medium: { pixelRatio: 2, render: 1.0, sharpen: 0.45, shadows: false, mapSize: 512, post: false, msaa: 2, cascades: 0, maxFar: 70, macro: false, motes: false, operatorLod: 14 },
  // TEZKOR: sahna 75 % ruxsatda, RCAS bilan tiniq qilib kattalashtiriladi — eng zaif noutbuklar uchun
  low: { pixelRatio: 1.0, render: 0.75, sharpen: 0.5, shadows: false, mapSize: 512, post: false, msaa: 0, cascades: 0, maxFar: 50, macro: false, motes: false, operatorLod: 10 },
};
export const QUALITY_ORDER = ['low', 'medium', 'crisp', 'high', 'ultra'];

/** First-run quality from the GPU / CPU: old Celeron / Pentium / Intel HD laptops get TEZKOR, Apple Silicon and Intel
 *  Iris get O'RTA, discrete NVIDIA / AMD cards get TINIQ. The player can still change it in Settings. */
export function detectQuality(renderer, details = false) {
  let gpu = '';
  try { const gl = renderer.getContext(), ext = gl.getExtension('WEBGL_debug_renderer_info'); gpu = String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)); } catch { /* hidden */ }
  const cores = navigator.hardwareConcurrency || 4, mem = navigator.deviceMemory || 8;
  const phone = matchMedia('(pointer: coarse)').matches || /android|iphone|ipad|mobile/i.test(navigator.userAgent);
  const weak = /swiftshader|llvmpipe|software|celeron|pentium|atom|gma|intel\(r\)? (hd|uhd) graphics|mali|adreno \(?tm\)? ?[1-5]\d\d|powervr/i.test(gpu) || cores <= 2 || mem <= 2;
  const discrete = /nvidia|geforce|quadro|radeon (rx|pro|r[5-9]) /i.test(gpu) && cores >= 6;
  const quality = weak || (phone && cores <= 4) ? 'low' : discrete && mem >= 8 ? (cores >= 8 ? 'high' : 'crisp') : 'medium';
  const fps = phone || weak ? 30 : 60;                         // phones / weak laptops: cooler and steadier at 30
  if (!details) return quality;
  const name = gpu.replace(/^ANGLE \(|\)$/g, '').replace(/,? (Direct3D|vs_|ps_|Unspecified Version).*/i, '').slice(0, 60) || 'noma’lum GPU';
  return { quality, fps, note: `${name} · ${cores} yadro${navigator.deviceMemory ? ` · ${mem} GB` : ''}${phone ? ' · telefon/planshet' : ''} → ${{ low: 'TEZKOR', medium: 'O‘RTA', crisp: 'TINIQ', high: 'YUQORI', ultra: 'ULTRA' }[quality]}, ${fps} FPS` };
}

// World-space macro variation: breaks texture tiling with large-scale tone patches and adds wall-base grime + vertical sun-bleach streaks.
const MACRO_GLSL = /* glsl */`
float mHash(vec3 p){ p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float mNoise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(mHash(i + vec3(0,0,0)), mHash(i + vec3(1,0,0)), f.x), mix(mHash(i + vec3(0,1,0)), mHash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(mHash(i + vec3(0,0,1)), mHash(i + vec3(1,0,1)), f.x), mix(mHash(i + vec3(0,1,1)), mHash(i + vec3(1,1,1)), f.x), f.y), f.z); }
float mFbm(vec3 p){ return 0.7 * mNoise(p) + 0.3 * mNoise(p * 2.03); }
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
const MIN_INTERNAL_SCALE = 0.55;
const tmpColor = new THREE.Color();
const SHOWCASE_DIST = 5.2, SHOWCASE_SPAN = 2.78;   // lobby camera distance (m) and framed height (m)
const tmpSize = new THREE.Vector2(), LOD_TAN = Math.tan(THREE.MathUtils.degToRad(37));
const tmpE = new THREE.Euler(0, 0, 0, 'YXZ'), tmpQ = new THREE.Quaternion(), tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3(), tmpM = new THREE.Matrix4();
// container paint colours (same family as tools/maps/builder.mjs), applied per instance to `tint` prop materials
const PROP_TINTS = [0xb04634, 0x356b96, 0x497858, 0xd6a630, 0x8c969a].map(c => new THREE.Color(c));

export class WorldEngine {
  constructor(canvas, { quality = 'medium' } = {}) {
    if (!Object.hasOwn(QUALITY, quality)) quality = 'medium';
    this.canvas = canvas; this.qualityName = quality; this.quality = QUALITY[quality];
    // Canvas MSAA is fixed at context creation, so anti-aliasing lives in render targets instead (upscaler / composer):
    // switching quality in Settings then takes effect immediately instead of after a reload.
    const renderer = this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance', stencil: false });
    renderer.info.autoReset = false;            // one frame = scene + viewmodel + present: count them together
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.shadowMap.enabled = this.quality.shadows;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.autoClear = false;
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, this.quality.pixelRatio));
    renderer.setSize(innerWidth, innerHeight, false);
    // sharper ground / walls at grazing angles: 16x anisotropic filtering on the crisp tiers, 8x on the light ones
    this.maxAniso = Math.min(quality === 'low' || quality === 'medium' ? 8 : 16, renderer.capabilities.getMaxAnisotropy());
    this.texSize = quality === 'low' ? 256 : 512;           // procedural map texture resolution
    this.canUpscale = Upscaler.supported(renderer); this.upscaler = null;

    this.scene = new THREE.Scene(); this.viewScene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(74, innerWidth / innerHeight, 0.05, 700); this.camera.rotation.order = 'YXZ'; this.scene.add(this.camera);
    this.viewCamera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.01, 8);
    this.hemi = new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.3); this.scene.add(this.hemi);
    this.viewHemi = new THREE.HemisphereLight(0xbcd3f2, 0xa48b68, 0.3); this.viewScene.add(this.viewHemi);
    this.viewSun = new THREE.DirectionalLight(0xffffff, 3); this.viewSun.position.set(2, 3, 2); this.viewScene.add(this.viewSun, this.viewSun.target);
    // cool rim light from beyond the weapon: separates metal edges and hands from the background
    this.viewRim = new THREE.DirectionalLight(0xcfe0ff, 1.4); this.viewRim.position.set(1.2, 1.4, -3); this.viewScene.add(this.viewRim, this.viewRim.target);
    this.effects = new Effects(this.scene, this.camera, { lightCount: quality === 'ultra' || quality === 'high' ? 3 : 1 });
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
    // sun : sky balance of a real day — direct sun clearly dominates on clear days (crisp light/shade separation),
    // an overcast sky is softer and more even
    this.scene.environment = this.envRT.texture; this.scene.environmentIntensity = overcast ? 0.7 : 0.5;
    this.viewScene.environment = this.envRT.texture; this.viewScene.environmentIntensity = 0.9;
    this.scene.fog = new THREE.FogExp2(new THREE.Color(env.fog), env.fogDensity);
    this.hemi.color.set(env.ambient); this.viewHemi.color.set(env.ambient); this.hemi.intensity = overcast ? 0.26 : 0.17;
    this.sunScale = overcast ? 1.0 : 1.15;
    this.renderer.toneMappingExposure = env.exposure ?? 1.0;
    this.viewSun.color.set(env.sunColor); this.viewSun.intensity = env.sunIntensity * 1.1;
    this.buildSun();
    this.moteMat.opacity = overcast ? 0.18 : 0.42;
  }
  /**
   * Horizon dressing (2 draw calls, unlit, pre-hazed vertex colours): a ground apron out to the horizon so nothing
   * floats over empty sky, low near hills, and a taller far range fading into the sky colour (aerial perspective).
   */
  buildBackdrop(env) {
    if (this.backdrop) { this.scene.remove(this.backdrop); this.backdrop.traverse(o => { o.geometry?.dispose(); o.material?.dispose(); }); }
    const overcast = env.sky === 'overcast', haze = new THREE.Color(env.fog), group = new THREE.Group(); group.name = 'backdrop';
    const h1 = (x, k) => { const v = Math.sin(x * 127.1 + k * 311.7) * 43758.5453; return v - Math.floor(v); };
    const noise = (t, f, k) => { const x = t * f, i = Math.floor(x), u = x - i, a = h1(i % f, k), b = h1((i + 1) % f, k); return a + (b - a) * u * u * (3 - 2 * u); };
    const half = Math.max(this.map?.bounds?.x || 120, this.map?.bounds?.z || 120) / 2;
    // ground apron: starts under the map's own apron, runs to the hills, fogged like the rest of the world
    const ground = new THREE.Mesh(new THREE.RingGeometry(half + 28, 460, 64, 1), new THREE.MeshStandardMaterial({ color: overcast ? 0x8c887d : 0xbba57a, roughness: 1, metalness: 0 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.15; ground.receiveShadow = false; group.add(ground);
    const ring = (R, base, amp, freq, rows, near, far, k) => {
      const N = 256, pos = [], col = [], idx = [], c = new THREE.Color();
      for (let i = 0; i <= N; i++) {
        const t = i / N, ang = t * Math.PI * 2;
        const ridge = base + amp * (0.5 * noise(t, freq, k) + 0.28 * noise(t, freq * 3, k + 1) + 0.14 * noise(t, freq * 9, k + 2) + 0.08 * noise(t, freq * 27, k + 3)) * (0.45 + 0.55 * noise(t, 3, k + 4));
        for (let r = 0; r < rows; r++) {
          const q = r / (rows - 1), y = -4 + (ridge + 4) * Math.pow(q, 0.8), rad = R - q * R * 0.04;
          pos.push(Math.cos(ang) * rad, y, Math.sin(ang) * rad);
          // lower slopes melt into the haze, ridges keep a little rock colour and shading per facet direction
          const facing = 0.9 + 0.1 * Math.cos(ang * 7 + noise(t, 11, k) * 6);
          c.copy(far).lerp(near, q * 0.5).multiplyScalar(facing).lerp(haze, 0.7 - 0.35 * q);
          col.push(c.r, c.g, c.b);
        }
      }
      for (let i = 0; i < N; i++) for (let r = 0; r < rows - 1; r++) { const a = i * rows + r, b = a + rows; idx.push(a, b, a + 1, b, b + 1, a + 1); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3)); g.setIndex(idx);
      const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ vertexColors: true, fog: false, side: THREE.DoubleSide })); m.frustumCulled = false;
      return m;
    };
    const rock = new THREE.Color(overcast ? 0x5f6468 : 0x9a8466), dust = new THREE.Color(overcast ? 0x7c8388 : 0xb39d7a), blue = new THREE.Color(overcast ? 0x8d959b : 0x9fa9b5);
    group.add(ring(420, 16, 44, 6, 5, rock, blue, 1));      // far range: ~2-8 degrees above the horizon, hazy blue
    group.add(ring(270, 3, 15, 9, 4, dust, rock, 7));       // near hills: low, warm, less haze
    group.renderOrder = -1;
    this.backdrop = group; this.scene.add(group);
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
    // dispose() drops the renderer's per-material program map: otherwise a program cached under the same key (e.g. CSM on
    // -> off -> on) is reused with the uniform set of the last compile, which lacks CSM_cascades and crashes the upload.
    m.dispose();
    m.onBeforeCompile = THREE.Material.prototype.onBeforeCompile;
    m.customProgramCacheKey = THREE.Material.prototype.customProgramCacheKey;
    this.csm?.setupMaterial(m);
    const macro = !!(m.userData.macro && this.quality.macro), patch = m.userData.shaderPatch;
    if (macro) patchMacro(m);
    if (patch) {
      // material-owned GLSL edits (e.g. operator camo / per-vertex roughness) chained after CSM + macro
      const chained = m.onBeforeCompile;
      m.onBeforeCompile = (shader, renderer) => { chained?.call(m, shader, renderer); patch(shader); };
    }
    if (macro || patch) m.customProgramCacheKey = () => `kontir-${macro ? 'macro-v2' : 'plain'}-${m.userData.shaderPatchKey || ''}-${m.defines?.CSM_CASCADES || 0}`;
    m.needsUpdate = true;
  }
  /** Registers a material with the engine once (CSM / macro hooks); shared materials are prepared a single time. */
  adoptMaterial(m) { if (!this.materials.has(m)) { this.materials.add(m); this.prepareMaterial(m); } }
  buildSun() {
    this.clearSun();
    const q = this.quality, env = this.env;
    if (!q.shadows) {
      this.sun = new THREE.DirectionalLight(env.sunColor, env.sunIntensity * (this.sunScale ?? 1));
      this.sun.position.copy(this.sunDir).multiplyScalar(100); this.scene.add(this.sun, this.sun.target);
      for (const m of this.materials) this.prepareMaterial(m);
      return;
    }
    this.csm = new CSM({
      maxFar: q.maxFar, cascades: q.cascades, mode: 'practical', parent: this.scene, shadowMapSize: q.mapSize,
      lightDirection: this.sunDir.clone().negate(), camera: this.camera, lightIntensity: env.sunIntensity * (this.sunScale ?? 1), lightNear: 1, lightFar: 400, shadowBias: -0.0002,
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
    r.setPixelRatio(this.outputPixelRatio());
    r.shadowMap.enabled = q.shadows;
    this.disposeComposer();
    const wantUpscale = !q.post && q.render !== undefined;
    if (wantUpscale && this.canUpscale) { this.upscaler ??= new Upscaler(); this.sizeUpscaler(); }
    else { this.upscaler?.dispose(); this.upscaler = null; }
    if (q.post) {
      const size = r.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: q.msaa });
      const composer = this.composer = new EffectComposer(r, target);
      composer.addPass(new RenderPass(this.scene, this.camera));
      const gtao = this.gtao = new GTAOPass(this.scene, this.camera, size.x, size.y);
      gtao.updateGtaoMaterial({ radius: 0.55, distanceExponent: 1.4, thickness: 1.4, scale: 1.1, samples: 10, distanceFallOff: 1.0, screenSpaceRadius: false });
      gtao.blendIntensity = 0.85;
      // GTAO only hides points/lines from its depth+normal pass: sprites (name labels, smoke, puffs) and depth-less
      // transparent effects were treated as solid quads and stamped dark AO boxes behind them
      gtao._overrideVisibility = function () {
        const cache = this._visibilityCache;
        this.scene.traverse(o => { if (o.visible && (o.isPoints || o.isLine || o.isLine2 || o.isSprite || (o.material && !Array.isArray(o.material) && o.material.transparent && !o.material.depthWrite))) { o.visible = false; cache.push(o); } });
      };
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
  /** Canvas DPR. The upscaler path keeps the canvas at full resolution and scales only the scene target. */
  outputPixelRatio() {
    const q = this.quality, dpr = devicePixelRatio || 1;
    if (this.upscaler || (!q.post && q.render !== undefined && this.canUpscale)) return Math.min(dpr, q.pixelRatio);
    // no float targets: fall back to rendering the scene straight to a (smaller) canvas
    return Math.min(dpr, q.render ?? q.pixelRatio) * (this.resScale ?? 1);
  }
  /** Scene resolution relative to the canvas on the upscaler path. */
  baseRenderScale() {
    const q = this.quality, dpr = devicePixelRatio || 1, out = Math.min(dpr, q.pixelRatio);
    return Math.min(1, Math.min(dpr, q.render ?? out) / out);
  }
  renderScale() { return Math.max(MIN_INTERNAL_SCALE, this.baseRenderScale() * (this.resScale ?? 1)); }
  sizeUpscaler() {
    if (!this.upscaler) return;
    const size = this.renderer.getDrawingBufferSize(tmpSize), k = this.renderScale();
    // sharpen harder when the scene is upsampled (dynamic resolution), lightly at native resolution
    // (too much RCAS on a heavily upsampled image turns aliasing into hard stair-steps: capped)
    const sharpen = Math.min(0.7, (this.quality.sharpen ?? 0.3) + (1 - k) * 0.4);
    this.upscaler.setSize(size.x * k, size.y * k, this.quality.msaa || 0, sharpen);
  }
  setQuality(name) {
    if (!Object.hasOwn(QUALITY, name) || name === this.qualityName) return;
    this.qualityName = name; this.quality = QUALITY[name];
    this.applyQualityTargets();
    if (this.env) this.buildSun();
    this.resize();
    for (const m of this.materials) m.needsUpdate = true;
  }
  /** Dynamic resolution, applied only on meaningful changes (a resize reallocates targets). */
  // RCAS keeps an upsampled scene sharp down to 60 % — but never below MIN_INTERNAL_SCALE of the canvas in total
  get minResolutionScale() { return this.upscaler ? Math.ceil(Math.min(1, Math.max(0.6, MIN_INTERNAL_SCALE / this.baseRenderScale())) * 20) / 20 : 0.75; }
  setResolutionScale(k) {
    k = Math.round(Math.max(this.minResolutionScale, Math.min(1, k)) * 20) / 20;
    if (k === (this.resScale ?? 1)) return false;
    this.resScale = k; this.resize(); return true;
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setPixelRatio(this.outputPixelRatio()); this.renderer.setSize(w, h, false); this.sizeUpscaler();
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
    const fetchBytes = async url => { const r = await fetch(`./maps/${url}`); if (!r.ok) throw new Error(`${url}: ${r.status}`); return new Uint8Array(await r.arrayBuffer()); };
    const visualBytes = await fetchBytes(meta.file);
    const collisionBytes = meta.collision ? await fetchBytes(meta.collision) : visualBytes;
    progress(0.3, 'To‘qnashuv BVH qurilmoqda');
    const data = this.map = buildMapData(meta, collisionBytes);
    this.setEnvironment(meta.env);
    this.buildBackdrop(meta.env);
    progress(0.5, 'Geometriya tayyorlanmoqda');
    const gltf = await this.gltf.parseAsync(visualBytes.buffer.slice(visualBytes.byteOffset, visualBytes.byteOffset + visualBytes.byteLength), '');
    const group = this.mapGroup = new THREE.Group(); group.name = `map_${meta.id}`;
    this.processScene(gltf.scene, group);
    this.scene.add(group);
    progress(0.8, 'Obyektlar');
    await this.placeProps(gltf.scene, group);
    progress(0.9, 'Materiallar');
    this.buildSiteMarkers(data);
    data.radar = this.buildRadar(data);
    this.resize();
    progress(1, 'Tayyor');
    return data;
  }
  /**
   * Instantiates real prop models (client/public/models/props) at the map's prop_<key>_<n> markers. One InstancedMesh
   * per model part, so a street full of crates costs a handful of draw calls. Collision comes from the map's clip boxes.
   */
  async placeProps(scene, group) {
    const byKey = new Map();
    scene.updateMatrixWorld(true);
    scene.traverse(o => { const m = /^prop_(.+)_\d+$/.exec(o.name); if (m) { if (!byKey.has(m[1])) byKey.set(m[1], []); byKey.get(m[1]).push(o.matrixWorld.clone()); } });
    for (const [key, matrices] of byKey) {
      const path = models.propPath(key); if (!path) continue;
      const gltf = await models.load(path); if (!gltf) continue;
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse(o => {
        if (!o.isMesh) return;
        const inst = new THREE.InstancedMesh(o.geometry, o.material, matrices.length), local = o.matrixWorld;
        matrices.forEach((m, i) => inst.setMatrixAt(i, tmpM.multiplyMatrices(m, local)));
        // `tint` materials are baked near-white; each copy takes a colour from the palette (shipping containers)
        if ([].concat(o.material).some(mat => /tint/i.test(mat.name || ''))) {
          matrices.forEach((m, i) => { const h = Math.abs(Math.round(m.elements[12] * 7 + m.elements[13] * 3 + m.elements[14] * 13)); inst.setColorAt(i, PROP_TINTS[h % PROP_TINTS.length]); });
          inst.instanceColor.needsUpdate = true;
        }
        inst.instanceMatrix.needsUpdate = true; inst.castShadow = true; inst.receiveShadow = true; inst.computeBoundingSphere();
        for (const mat of [].concat(o.material)) if (!this.materials.has(mat)) { this.materials.add(mat); this.prepareMaterial(mat); }
        group.add(inst);
      });
    }
  }
  releaseTree(root) {
    disposeTree(root, m => { this.materials.delete(m); this.csm?.shaders.delete(m); });
  }
  disposeMap() {
    this.setShowcase(null); this.clearActors(); this.releaseTree(this.mapGroup); this.mapGroup = null;
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
      if (!material.map && !material.normalMap) applyPBR(material, recipeFor(material.name || ''), { anisotropy: this.maxAniso, size: this.texSize });
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

  /**
   * Compiles every weapon / operator shader variant for the loaded map's lighting before the match starts, so the
   * first time a weapon is drawn, dropped or seen in someone's hands does not stall the frame on a shader compile.
   */
  async prewarm(weapons = null) {
    const r = this.renderer, group = new THREE.Group(), f = new THREE.Vector3(0, 0, -1).applyQuaternion(this.camera.quaternion);
    group.position.copy(this.camera.position).addScaledVector(f, 4);
    const add = obj => { obj.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; for (const m of [].concat(o.material)) if (!this.materials.has(m)) { this.materials.add(m); this.prepareMaterial(m); } } }); group.add(obj); };
    for (const id of RIG_IDS) add(buildWeaponRigTP(id).group);
    prebuildOperators();
    for (const team of ['TERRORIST', 'COUNTER_TERRORIST']) for (const lod of [0, 1]) {
      // compile both LOD meshes (same program; the skinned variant must be compiled once per material)
      const op = buildOperator(team, 1); op.userData.lods?.forEach((m, i) => { m.visible = i === lod; }); add(op); op.userData.dispose = true;
    }
    this.scene.add(group);
    // three.js only compiles visible objects: reveal pooled effects (tracers, decals, puffs, flashes) for the compile pass
    const hidden = [], reveal = root => root.traverse(o => { if (!o.visible) { hidden.push(o); o.visible = true; } });
    reveal(this.scene);
    try { await r.compileAsync(this.scene, this.camera); } catch { r.compile(this.scene, this.camera); }
    for (const o of hidden) o.visible = false; hidden.length = 0;
    group.removeFromParent();
    group.traverse(o => { if (o.userData.dispose) this.releaseTree?.(o); });
    if (weapons) {
      const shown = [];
      for (const id of RIG_IDS) { const rig = weapons.rig(id); shown.push([rig.group, rig.group.visible]); rig.group.visible = true; }
      const rootVisible = weapons.root.visible; weapons.root.visible = true;
      reveal(this.viewScene);
      try { await r.compileAsync(this.viewScene, this.viewCamera); } catch { r.compile(this.viewScene, this.viewCamera); }
      for (const o of hidden) o.visible = false;
      for (const [g, v] of shown) g.visible = v;
      weapons.root.visible = rootVisible;
    }
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
        a.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) this.adoptMaterial(m); });
        if (p.team === localTeam) { const l = this.label(p.name); a.add(l); l.position.y = 2.1; this.labels.set(p.id, l); }
      }
      if (!p.char) { a.visible = false; continue; }                           // enemy not in line of sight (anti-wallhack)
      // gait follows real displacement, not reported velocity: blocked / frozen / dead players never "walk in place"
      const c = p.char, u = a.userData, moved = u.lastX === undefined ? 0 : Math.hypot(c.x - u.lastX, c.z - u.lastZ) / Math.max(dt, 1e-3);
      u.lastX = c.x; u.lastZ = c.z; u.moveSpeed = (u.moveSpeed ?? 0) + (Math.min(moved, 8) - (u.moveSpeed ?? 0)) * Math.min(1, dt * 12);
      const speed = p.alive ? Math.min(Math.hypot(c.vx, c.vz), u.moveSpeed) : 0;
      a.position.set(c.x, c.y, c.z);
      holdWeapon(a, p.weapon);
      if (a.userData.weapon) a.userData.weapon.traverse(o => { if (o.isMesh) for (const m of [].concat(o.material)) this.adoptMaterial(m); });
      a.visible = true;
      // scoped (narrow FOV) views keep the detailed mesh proportionally further away
      setOperatorDetail(a, this.camera.position.distanceTo(a.position), (this.quality.operatorLod || 16) * LOD_TAN / Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)));
      animateOperator(a, { speed: c.grounded ? speed : speed * 0.4, yaw: c.yaw, pitch: c.pitch, crouch: c.crouch || 0, alive: p.alive, dt, moveYaw: speed > 0.2 ? Math.atan2(-c.vx, -c.vz) : undefined });
      const l = this.labels.get(p.id); if (l) l.visible = p.alive;
    }
    for (const [id, a] of this.actors) if (!seen.has(id)) { this.releaseTree(a); this.actors.delete(id); this.labels.delete(id); }
  }
  actorMuzzleWorld(id, out) {
    const a = this.actors.get(id); if (!a || !a.visible) return null;
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
  /**
   * Lobby showcase (CS2-style): an operator in a low-ready hold, standing full-length in a sunlit open spot of the
   * loaded map, framed by a still telephoto camera. opts = { team, weapon, applyFinish } or null to remove.
   */
  setShowcase(opts) {
    const prev = this.showcase;
    if (prev) {
      this.releaseTree(prev.actor);
      for (const o of [prev.shadow, prev.blob]) if (o) { o.removeFromParent(); o.geometry.dispose(); o.material.dispose(); }
      prev.shadowRT?.dispose(); this.showcase = null;
    }
    if (!opts || !this.map) return;
    const actor = buildOperator(opts.team, 7);
    setHoldPose(actor, 'low');
    holdWeapon(actor, opts.weapon);
    const rig = actor.userData.rigs.get(opts.weapon);
    if (rig && opts.applyFinish) opts.applyFinish(rig.group);
    // the showcase casts its own crisp sun shadow (buildShowcaseShadow) in every tier, not a blurry cascade texel smear
    actor.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = true; for (const m of [].concat(o.material)) this.adoptMaterial(m); } });
    const spot = this.findShowcaseSpot(opts.team);
    const { s, a } = spot, ground = s.y;
    actor.position.set(s.x, ground, s.z);
    this.scene.add(actor);
    // telephoto framing: the whole operator (~1.85 m) fills ~2/3 of the height with the feet above the player card
    const dist = Math.max(2.6, Math.min(SHOWCASE_DIST, spot.free - 0.4));
    const fov = THREE.MathUtils.radToDeg(2 * Math.atan(SHOWCASE_SPAN / 2 / dist));
    this.showcase = { actor, base: new THREE.Vector3(s.x, ground, s.z), camYaw: a, dist, fov, spin: 0 };
    this.buildShowcaseShadow(this.showcase, ground);
  }
  /** Most photogenic standing spot: clear line to the camera, a deep street behind, sunlit, sun from the camera side. */
  findShowcaseSpot(team) {
    const col = this.map.collider, sp = this.map.spawns || {};
    const own = sp[team] || [], other = sp[team === 'TERRORIST' ? 'COUNTER_TERRORIST' : 'TERRORIST'] || [];
    const cands = [...own.slice(0, 10), ...(this.map.sites || []).map(x => ({ x: x.x, y: x.y, z: x.z })), ...other.slice(0, 4)];
    if (!cands.length) cands.push({ x: 0, y: 0, z: 0 });
    const sunH = tmpV2.set(this.sunDir.x, 0, this.sunDir.z).normalize();
    const clear = (s, dx, dz, far) => {
      let d = far;
      for (const h of [0.25, 1.0, 1.75]) for (const off of [-0.45, 0, 0.45]) {
        const ox = s.x + dz * off, oz = s.z - dx * off;
        d = Math.min(d, col.wallDistance(ox, s.y + h, oz, dx, 0, dz, far));
      }
      return d;
    };
    const lit = s => !col.raycast(s.x, s.y + 1.3, s.z, this.sunDir.x, this.sunDir.y, this.sunDir.z, 90);
    let best = null;
    cands.forEach((s, ci) => {
      const sunny = lit(s), bias = ci < own.length ? 25 : 0;
      for (let i = 0; i < 24; i++) {
        const a = i / 24 * Math.PI * 2, dx = -Math.sin(a), dz = -Math.cos(a);
        const free = clear(s, dx, dz, SHOWCASE_DIST + 1.2), behind = col.wallDistance(s.x, s.y + 1.6, s.z, -dx, 0, -dz, 60);
        const facing = dx * sunH.x + dz * sunH.z;                // camera on the sunny side = lit face, shadow falls behind
        const score = (free >= SHOWCASE_DIST + 0.4 ? 120 : free * 14) + Math.min(behind, 35) + (sunny ? 60 : 0) + 30 * (1 - Math.abs(facing - 0.55)) + bias;
        if (!best || score > best.score) best = { s, a, free, score };
      }
    });
    return best;
  }
  /**
   * Sun shadow for the showcase, identical in every quality tier (no shadow maps): the operator's meshes are re-drawn
   * flattened along the sun direction into a small top-down mask texture (opaque, so overlapping parts never darken
   * twice), which one ground quad then lays down as a soft shadow. A contact blob grounds the feet.
   */
  buildShowcaseShadow(sc, ground) {
    const mat = this.planarShadowMat ??= new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false, fog: false, toneMapped: false });
    mat.userData.shared = true;
    const L = this.sunDir, sy = Math.max(0.3, L.y), gy = ground + 0.01;
    sc.shadowMatrix = new THREE.Matrix4().set(sy, -L.x, 0, L.x * gy, 0, 0, 0, sy * gy, 0, -L.z, sy, L.z * gy, 0, 0, 0, sy);
    const scene = sc.shadowScene = new THREE.Scene(); sc.pairs = [];
    const shown = o => { for (let p = o; p && p !== sc.actor; p = p.parent) if (!p.visible) return false; return true; };
    sc.actor.updateMatrixWorld(true);
    sc.actor.traverse(o => {
      if (!o.isMesh || !shown(o)) return;
      if (o.isSkinnedMesh) {
        if (o.name !== 'operator_lod0') return;
        const m = new THREE.SkinnedMesh(o.geometry, mat); m.bindMode = THREE.DetachedBindMode; m.bind(o.skeleton, new THREE.Matrix4());
        m.matrixAutoUpdate = false; m.frustumCulled = false; m.matrix.copy(sc.shadowMatrix); scene.add(m);
      } else { const m = new THREE.Mesh(o.geometry, mat); m.matrixAutoUpdate = false; m.frustumCulled = false; scene.add(m); sc.pairs.push([o, m]); }
    });
    // mask camera: top-down over the area the shadow can reach (it rotates with the player's drag)
    const reach = 1.9 * Math.hypot(L.x, L.z) / sy, size = Math.max(4, 2 * reach + 1.6), half = size / 2;
    const cam = sc.shadowCam = new THREE.OrthographicCamera(-half, half, half, -half, 0.5, 20);
    cam.position.set(sc.base.x, gy + 10, sc.base.z); cam.up.set(0, 0, -1); cam.lookAt(sc.base.x, gy, sc.base.z); cam.updateMatrixWorld(true);
    sc.shadowRT = new THREE.WebGLRenderTarget(512, 512, { depthBuffer: false, stencilBuffer: false });
    const quad = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ color: 0x0b0806, alphaMap: sc.shadowRT.texture, transparent: true, opacity: 0.55, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -4, fog: false, toneMapped: false }));
    quad.rotation.x = -Math.PI / 2; quad.position.set(sc.base.x, gy, sc.base.z); quad.renderOrder = 1; this.scene.add(quad); sc.shadow = quad;
    const blob = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshBasicMaterial({ map: this.blobTexture(), transparent: true, depthWrite: false, opacity: 0.5, fog: false, toneMapped: false, color: 0x000000 }));
    blob.rotation.x = -Math.PI / 2; blob.position.set(sc.base.x, gy + 0.002, sc.base.z); blob.renderOrder = 2; this.scene.add(blob); sc.blob = blob;
  }
  /** Re-renders the showcase shadow mask (lobby only, 512² and a handful of draw calls). */
  updateShowcaseShadow(sc) {
    const r = this.renderer;
    sc.actor.updateMatrixWorld(true);
    for (const [src, dst] of sc.pairs) { dst.visible = src.visible && src.parent?.visible !== false; dst.matrix.multiplyMatrices(sc.shadowMatrix, src.matrixWorld); }
    const prevTarget = r.getRenderTarget(), prevColor = r.getClearColor(tmpColor), prevAlpha = r.getClearAlpha();
    r.setRenderTarget(sc.shadowRT); r.setClearColor(0x000000, 1); r.clear(true, false, false);
    r.render(sc.shadowScene, sc.shadowCam);
    r.setRenderTarget(prevTarget); r.setClearColor(prevColor, prevAlpha);
  }
  blobTexture() {
    if (this._blob) return this._blob;
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d'), grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,0.9)'); grd.addColorStop(0.45, 'rgba(255,255,255,0.35)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
    this._blob = new THREE.CanvasTexture(c); this._blob.userData.shared = true; return this._blob;
  }
  showcaseSpin(delta) { if (this.showcase) this.showcase.spin += delta; }
  setMenuCamera(time) {
    const sc = this.showcase;
    if (sc) {
      const dx = -Math.sin(sc.camYaw), dz = -Math.cos(sc.camYaw), b = sc.base;
      const sway = Math.sin(time * 0.3) * 0.03;
      if (this.camera.fov !== sc.fov) { this.camera.fov = sc.fov; this.camera.updateProjectionMatrix(); }
      this.camera.position.set(b.x + dx * sc.dist + dz * sway, b.y + 1.02 + Math.sin(time * 0.45) * 0.012, b.z + dz * sc.dist - dx * sway);
      this.camera.lookAt(b.x, b.y + 0.76, b.z); this.camera.updateMatrixWorld(true);
      // the operator faces the camera, a quarter turn off-axis like a catalogue shot (plus the player's drag), breathing idle
      animateOperator(sc.actor, { speed: 0, yaw: sc.camYaw + sc.spin + 0.42, pitch: -0.04 + Math.sin(time * 1.3) * 0.012, crouch: 0, alive: true, dt: 1 / 60 });
      sc.actor.position.set(b.x, b.y, b.z);
      if (sc.shadow) this.updateShowcaseShadow(sc);
      return;
    }
    if (this.camera.fov !== 74) { this.camera.fov = 74; this.camera.updateProjectionMatrix(); }
    const t = time * 0.045, r = 46;
    this.camera.position.set(Math.cos(t) * r, 15 + Math.sin(t * 1.7) * 3, Math.sin(t) * r);
    this.camera.lookAt(0, 2.5, 0); this.camera.updateMatrixWorld(true);
  }
  render(dt, viewmodel = null) {
    this.time += dt; this.shake *= Math.exp(-dt * 7);
    this.effects.update(dt);
    // dust motes drift around the camera (high/ultra only)
    if (this.quality.motes && this.motes) {
      this.motes.visible = true;
      const arr = this.motes.geometry.attributes.position, cam = this.camera.position, seeds = this.motes.userData.seed;
      for (let i = 0; i < seeds.length; i++) {
        const s = seeds[i]; let x = arr.getX(i) + Math.sin(this.time * 0.3 + s) * dt * 0.25, y = arr.getY(i) + Math.cos(this.time * 0.21 + s * 1.7) * dt * 0.12, z = arr.getZ(i) + Math.sin(this.time * 0.17 + s * 0.6) * dt * 0.2;
        x = ((x - cam.x + 30) % 60 + 60) % 60 - 30 + cam.x; z = ((z - cam.z + 30) % 60 + 60) % 60 - 30 + cam.z; y = ((y - (cam.y - 5) + 12) % 12 + 12) % 12 + cam.y - 5;
        arr.setXYZ(i, x, y, z);
      }
      arr.needsUpdate = true;
    } else if (this.motes) {
      this.motes.visible = false;
    }
    // shadow throttling (O'RTA): re-render the cascade every Nth frame; the light rig only moves on those frames so maps stay consistent
    const every = this.quality.shadowEvery || 1, r0 = this.renderer;
    this.frameNo = (this.frameNo || 0) + 1;
    if (every > 1) { r0.shadowMap.autoUpdate = false; if (this.frameNo % every === 0 || this.frameNo < 3) { this.csm?.update(); r0.shadowMap.needsUpdate = true; } }
    else { r0.shadowMap.autoUpdate = true; this.csm?.update(); }
    // viewmodel lights follow the camera orientation
    tmpQ.copy(this.camera.quaternion).invert(); tmpV.copy(this.sunDir).applyQuaternion(tmpQ);
    this.viewSun.position.copy(tmpV).multiplyScalar(4); this.viewSun.target.position.set(0, 0, 0);
    tmpE.setFromQuaternion(tmpQ, 'YXZ'); this.viewScene.environmentRotation?.copy(tmpE);
    this.viewScene.visible = viewmodel !== false;
    const r = this.renderer; r.info.reset();
    if (this.composer) { this.viewPass.enabled = viewmodel !== false; this.composer.render(dt); return; }
    if (this.upscaler) {
      r.setRenderTarget(this.upscaler.rt); r.clear(); r.render(this.scene, this.camera);
      if (viewmodel !== false) { r.clearDepth(); r.render(this.viewScene, this.viewCamera); }
      this.upscaler.present(r);
      return;
    }
    r.clear(); r.render(this.scene, this.camera);
    if (viewmodel !== false) { r.clearDepth(); r.render(this.viewScene, this.viewCamera); }
  }
  dispose() {
    this.renderer.setAnimationLoop(null); removeEventListener('resize', this.onResize);
    this.disposeMap(); this.clearSun(); this.disposeComposer(); this.upscaler?.dispose(); this.envRT?.dispose();
    disposeTree(this.scene); disposeTree(this.viewScene); this.renderer.dispose();
  }
}
void tmpV2;
