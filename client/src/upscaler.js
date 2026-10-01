// Lightweight FSR 1-style output stage for low-end GPUs.
// The scene (and the viewmodel) are rendered into one linear HDR render target at `scale` of the canvas resolution,
// optionally multisampled; a single full-screen pass then upsamples it bilinearly, applies RCAS (robust contrast-
// adaptive sharpening, the sharpening half of AMD FSR 1), ACES tone mapping and the sRGB transfer; without MSAA a
// console-class FXAA pass removes the stair-steps of the lower internal resolution first.
// Cost: one extra 5-tap pass at output resolution. Benefit: a lower internal resolution stays crisp instead of being
// stretched by the browser, MSAA can change at runtime (canvas MSAA is fixed at context creation), and dynamic
// resolution scales only the expensive scene pass.
import * as THREE from 'three';

const VERT = /* glsl */`
varying vec2 vUv;
void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;
const FRAG = /* glsl */`
uniform sampler2D tColor;
uniform vec2 texel;
uniform float sharpness;
uniform float fxaa;
varying vec2 vUv;
vec3 display(vec3 c) {
  #ifdef TONE_MAPPING
    c = toneMapping(c);
  #endif
  return clamp(linearToOutputTexel(vec4(c, 1.0)).rgb, 0.0, 1.0);
}
vec3 tap(vec2 uv) { return display(texture2D(tColor, uv).rgb); }
float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
// FXAA (console variant): edge direction from 4 diagonal taps, 2-4 taps along the edge. Only without MSAA.
vec3 antialias(vec2 uv, vec3 rgbM) {
  vec3 nw = tap(uv + vec2(-0.5, -0.5) * texel), ne = tap(uv + vec2(0.5, -0.5) * texel);
  vec3 sw = tap(uv + vec2(-0.5, 0.5) * texel), se = tap(uv + vec2(0.5, 0.5) * texel);
  float lNW = luma(nw), lNE = luma(ne), lSW = luma(sw), lSE = luma(se), lM = luma(rgbM);
  float lMin = min(lM, min(min(lNW, lNE), min(lSW, lSE))), lMax = max(lM, max(max(lNW, lNE), max(lSW, lSE)));
  if (lMax - lMin < max(0.0312, lMax * 0.125)) return rgbM;
  vec2 dir = vec2(-((lNW + lNE) - (lSW + lSE)), (lNW + lSW) - (lNE + lSE));
  float reduce = max((lNW + lNE + lSW + lSE) * 0.03125, 0.0078125);
  dir = clamp(dir / (min(abs(dir.x), abs(dir.y)) + reduce), vec2(-8.0), vec2(8.0)) * texel;
  vec3 a = 0.5 * (tap(uv + dir * (1.0 / 3.0 - 0.5)) + tap(uv + dir * (2.0 / 3.0 - 0.5)));
  vec3 b = a * 0.5 + 0.25 * (tap(uv - dir * 0.5) + tap(uv + dir * 0.5));
  float lB = luma(b);
  return (lB < lMin || lB > lMax) ? a : b;
}
void main() {
  vec3 e = tap(vUv);
  if (fxaa > 0.5) e = antialias(vUv, e);
  if (sharpness <= 0.0) { gl_FragColor = vec4(e, 1.0); return; }
  vec3 b = display(texture2D(tColor, vUv + vec2(0.0, -texel.y)).rgb);
  vec3 d = display(texture2D(tColor, vUv + vec2(-texel.x, 0.0)).rgb);
  vec3 f = display(texture2D(tColor, vUv + vec2(texel.x, 0.0)).rgb);
  vec3 h = display(texture2D(tColor, vUv + vec2(0.0, texel.y)).rgb);
  // RCAS: the largest negative lobe that cannot push the centre outside the local min/max (no halos, no clipping)
  vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
  vec3 hitMin = min(mn4, e) / (4.0 * mx4 + 1e-4);
  vec3 hitMax = (1.0 - max(mx4, e)) / (4.0 * mn4 - 4.0 - 1e-4);
  vec3 lobeRGB = max(-hitMin, hitMax);
  float lobe = max(-0.1875, min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * sharpness;
  // noise guard: soften the lobe on isolated single-pixel speckle
  float lb = dot(b, vec3(0.5)) + dot(d, vec3(0.5)), lf = dot(f, vec3(0.5)) + dot(h, vec3(0.5)), le = dot(e, vec3(1.0));
  float nz = abs(0.25 * (lb + lf) - le) / max(max(max(lb, lf), le) - min(min(lb, lf), le), 1e-4);
  lobe *= 1.0 - 0.5 * clamp(nz, 0.0, 1.0);
  vec3 c = (lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0);
  gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}
`;

export class Upscaler {
  constructor() {
    this.rt = null; this.samples = 0;
    this.material = new THREE.ShaderMaterial({
      name: 'KontirUpscale', vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false,
      uniforms: { tColor: { value: null }, texel: { value: new THREE.Vector2(1, 1) }, sharpness: { value: 0 }, fxaa: { value: 0 } },
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.material); this.quad.frustumCulled = false;
    this.scene = new THREE.Scene(); this.scene.add(this.quad);
    this.camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  }
  /** Linear HDR targets need EXT_color_buffer_(half_)float; without it the engine renders straight to the canvas. */
  static supported(renderer) {
    try { return renderer.extensions.has('EXT_color_buffer_float') || renderer.extensions.has('EXT_color_buffer_half_float'); } catch { return false; }
  }
  setSize(width, height, samples, sharpness) {
    width = Math.max(1, Math.round(width)); height = Math.max(1, Math.round(height));
    if (this.rt && this.samples !== samples) { this.rt.dispose(); this.rt = null; }
    if (!this.rt) {
      this.rt = new THREE.WebGLRenderTarget(width, height, { type: THREE.HalfFloatType, samples, depthBuffer: true, stencilBuffer: false });
      this.rt.texture.generateMipmaps = false; this.rt.resolveDepthBuffer = false; this.samples = samples;
    } else if (this.rt.width !== width || this.rt.height !== height) this.rt.setSize(width, height);
    this.material.uniforms.tColor.value = this.rt.texture;
    this.material.uniforms.texel.value.set(1 / width, 1 / height);
    this.material.uniforms.sharpness.value = sharpness;
    this.material.uniforms.fxaa.value = samples > 0 ? 0 : 1;   // MSAA already resolved the edges
  }
  /** Draws the resolved target to the canvas (tone mapping + sRGB happen here). */
  present(renderer) {
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }
  dispose() { this.rt?.dispose(); this.rt = null; this.material.dispose(); this.quad.geometry.dispose(); }
}
