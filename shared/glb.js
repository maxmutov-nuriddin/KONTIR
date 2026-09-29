// Dependency-free glTF-binary reader/writer. Works identically in Node (server collision) and browsers
// (client collision + tooling), so both sides build the *same* triangle soup for their BVH.
//
// Reader:  parseGLB(bytes) -> { meshes, markers }
//   meshes  : world-space triangles { name, material, positions:Float32Array, indices:Uint32Array }
//   markers : empty nodes whose name starts with spawn_ / site_ (position + scale)
// Writer:  writeGLB({ materials, meshes, markers }) -> Uint8Array
//
// Compressed primitives (Draco / meshopt) are intentionally not decoded here: ship an uncompressed
// `<id>.collision.glb` next to a compressed visual GLB and the collision file is used for physics.

const MAGIC = 0x46546c67;
const CHUNK_JSON = 0x4e4f534a;
const CHUNK_BIN = 0x004e4942;
const COMPONENTS = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

const identity = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a, b) {
  const out = new Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) {
    let s = 0;
    for (let k = 0; k < 4; k++) s += a[k * 4 + r] * b[c * 4 + k];
    out[c * 4 + r] = s;
  }
  return out;
}
function fromTRS(t = [0, 0, 0], q = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = q;
  const xx = x * x, yy = y * y, zz = z * z, xy = x * y, xz = x * z, yz = y * z, wx = w * x, wy = w * y, wz = w * z;
  return [
    (1 - 2 * (yy + zz)) * s[0], 2 * (xy + wz) * s[0], 2 * (xz - wy) * s[0], 0,
    2 * (xy - wz) * s[1], (1 - 2 * (xx + zz)) * s[1], 2 * (yz + wx) * s[1], 0,
    2 * (xz + wy) * s[2], 2 * (yz - wx) * s[2], (1 - 2 * (xx + yy)) * s[2], 0,
    t[0], t[1], t[2], 1,
  ];
}
const nodeMatrix = node => (node.matrix ? node.matrix.slice() : fromTRS(node.translation, node.rotation, node.scale));

function readAccessor(json, bin, index) {
  const accessor = json.accessors[index];
  if (accessor.sparse) throw new Error('GLB: sparse accessors are not supported');
  const width = TYPES[accessor.type], size = COMPONENTS[accessor.componentType];
  if (!width || !size) throw new Error(`GLB: unsupported accessor ${accessor.type}/${accessor.componentType}`);
  const out = accessor.componentType === 5126 ? new Float32Array(accessor.count * width) : new Uint32Array(accessor.count * width);
  if (accessor.bufferView === undefined) return out;
  const view = json.bufferViews[accessor.bufferView];
  const stride = view.byteStride || size * width;
  const base = bin.byteOffset + (view.byteOffset || 0) + (accessor.byteOffset || 0);
  const dv = new DataView(bin.buffer);
  const type = accessor.componentType;
  for (let i = 0; i < accessor.count; i++) for (let j = 0; j < width; j++) {
    const at = base + i * stride + j * size;
    let v;
    if (type === 5126) v = dv.getFloat32(at, true);
    else if (type === 5125) v = dv.getUint32(at, true);
    else if (type === 5123) v = dv.getUint16(at, true);
    else if (type === 5121) v = dv.getUint8(at);
    else if (type === 5122) v = dv.getInt16(at, true);
    else v = dv.getInt8(at);
    out[i * width + j] = v;
  }
  return out;
}

export function parseGLB(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || dv.getUint32(0, true) !== MAGIC) throw new Error('GLB: bad magic');
  if (dv.getUint32(4, true) !== 2) throw new Error('GLB: only glTF 2.0 is supported');
  let json = null, bin = null;
  for (let at = 12; at + 8 <= bytes.byteLength;) {
    const length = dv.getUint32(at, true), type = dv.getUint32(at + 4, true);
    const body = bytes.subarray(at + 8, at + 8 + length);
    if (type === CHUNK_JSON) json = JSON.parse(new TextDecoder().decode(body));
    else if (type === CHUNK_BIN && !bin) bin = new Uint8Array(body.slice().buffer);
    at += 8 + length + ((4 - (length % 4)) % 4);
  }
  if (!json) throw new Error('GLB: missing JSON chunk');
  if ((json.extensionsRequired || []).some(e => /draco|meshopt/i.test(e))) {
    throw new Error('GLB: compressed geometry. Provide an uncompressed <id>.collision.glb for physics.');
  }
  bin ||= new Uint8Array(0);
  const meshes = [], markers = [];
  const scene = json.scenes?.[json.scene ?? 0];
  const roots = scene?.nodes || json.nodes.map((_, i) => i);
  const visit = (index, parent) => {
    const node = json.nodes[index], world = multiply(parent, nodeMatrix(node));
    const name = node.name || `node_${index}`;
    if (node.mesh !== undefined) {
      const mesh = json.meshes[node.mesh];
      mesh.primitives.forEach((primitive, n) => {
        if (primitive.mode !== undefined && primitive.mode !== 4) return;
        if (primitive.attributes.POSITION === undefined) return;
        const local = readAccessor(json, bin, primitive.attributes.POSITION);
        const positions = new Float32Array(local.length);
        for (let i = 0; i < local.length; i += 3) {
          const x = local[i], y = local[i + 1], z = local[i + 2];
          positions[i] = world[0] * x + world[4] * y + world[8] * z + world[12];
          positions[i + 1] = world[1] * x + world[5] * y + world[9] * z + world[13];
          positions[i + 2] = world[2] * x + world[6] * y + world[10] * z + world[14];
        }
        let indices;
        if (primitive.indices !== undefined) indices = readAccessor(json, bin, primitive.indices);
        else indices = Uint32Array.from({ length: local.length / 3 }, (_, i) => i);
        // A negative-determinant transform mirrors the mesh; restore outward winding.
        const det = world[0] * (world[5] * world[10] - world[6] * world[9]) - world[4] * (world[1] * world[10] - world[2] * world[9]) + world[8] * (world[1] * world[6] - world[2] * world[5]);
        if (det < 0) for (let i = 0; i + 2 < indices.length; i += 3) { const t = indices[i + 1]; indices[i + 1] = indices[i + 2]; indices[i + 2] = t; }
        const material = json.materials?.[primitive.material]?.name || 'default';
        meshes.push({ name: mesh.primitives.length > 1 ? `${name}#${n}` : name, material, positions, indices: Uint32Array.from(indices) });
      });
    } else if (/^(spawn|site)_/i.test(name)) {
      const sx = Math.hypot(world[0], world[1], world[2]), sy = Math.hypot(world[4], world[5], world[6]), sz = Math.hypot(world[8], world[9], world[10]);
      const yaw = Math.atan2(world[8] / (sz || 1), world[10] / (sz || 1)) || 0;
      markers.push({ name, x: world[12], y: world[13], z: world[14], sx, sy, sz, yaw });
    }
    for (const child of node.children || []) visit(child, world);
  };
  for (const root of roots) visit(root, identity());
  return { meshes, markers };
}

const pad = (n, m = 4) => (m - (n % m)) % m;

/**
 * materials: [{ name, color:[r,g,b,a], roughness, metalness }]
 * meshes:    [{ name, material (name), positions, normals?, uvs?, indices }]
 * markers:   [{ name, x, y, z, sx?, sy?, sz? }]
 */
export function writeGLB({ materials, meshes, markers = [] }) {
  const chunks = [], views = [], accessors = [], nodes = [], gltfMeshes = [];
  let offset = 0;
  const push = (typed, target) => {
    const bytes = new Uint8Array(typed.buffer, typed.byteOffset, typed.byteLength);
    const padding = pad(offset);
    if (padding) { chunks.push(new Uint8Array(padding)); offset += padding; }
    views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.byteLength, ...(target ? { target } : {}) });
    chunks.push(bytes); offset += bytes.byteLength;
    return views.length - 1;
  };
  const accessor = (typed, componentType, type, count, extra = {}) => {
    accessors.push({ bufferView: push(typed, extra.target), componentType, type, count, ...(extra.min ? { min: extra.min, max: extra.max } : {}) });
    return accessors.length - 1;
  };
  const materialIndex = new Map(materials.map((m, i) => [m.name, i]));
  for (const mesh of meshes) {
    const p = mesh.positions, min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], p[i + k]); max[k] = Math.max(max[k], p[i + k]); }
    const attributes = { POSITION: accessor(p, 5126, 'VEC3', p.length / 3, { target: 34962, min, max }) };
    if (mesh.normals) attributes.NORMAL = accessor(mesh.normals, 5126, 'VEC3', mesh.normals.length / 3, { target: 34962 });
    if (mesh.uvs) attributes.TEXCOORD_0 = accessor(mesh.uvs, 5126, 'VEC2', mesh.uvs.length / 2, { target: 34962 });
    const wide = p.length / 3 > 65535;
    const idx = wide ? Uint32Array.from(mesh.indices) : Uint16Array.from(mesh.indices);
    const indices = accessor(idx, wide ? 5125 : 5123, 'SCALAR', idx.length, { target: 34963 });
    gltfMeshes.push({ name: mesh.name, primitives: [{ attributes, indices, mode: 4, material: materialIndex.get(mesh.material) ?? 0 }] });
    nodes.push({ name: mesh.name, mesh: gltfMeshes.length - 1 });
  }
  for (const m of markers) {
    nodes.push({ name: m.name, translation: [m.x, m.y, m.z], ...(m.sx || m.sy || m.sz ? { scale: [m.sx || 1, m.sy || 1, m.sz || 1] } : {}), ...(m.yaw ? { rotation: [0, Math.sin(m.yaw / 2), 0, Math.cos(m.yaw / 2)] } : {}) });
  }
  const json = {
    asset: { version: '2.0', generator: 'KONTIR map pipeline' },
    scene: 0, scenes: [{ nodes: nodes.map((_, i) => i) }], nodes, meshes: gltfMeshes,
    materials: materials.map(m => ({ name: m.name, pbrMetallicRoughness: { baseColorFactor: m.color, roughnessFactor: m.roughness, metallicFactor: m.metalness }, doubleSided: false })),
    accessors, bufferViews: views, buffers: [{ byteLength: offset }],
  };
  const jsonBytes = new TextEncoder().encode(JSON.stringify(json));
  const jsonPadded = jsonBytes.byteLength + pad(jsonBytes.byteLength);
  const binPadded = offset + pad(offset);
  const total = 12 + 8 + jsonPadded + 8 + binPadded;
  const out = new Uint8Array(total), dv = new DataView(out.buffer);
  dv.setUint32(0, MAGIC, true); dv.setUint32(4, 2, true); dv.setUint32(8, total, true);
  dv.setUint32(12, jsonPadded, true); dv.setUint32(16, CHUNK_JSON, true);
  out.set(jsonBytes, 20); out.fill(0x20, 20 + jsonBytes.byteLength, 20 + jsonPadded);
  const binAt = 20 + jsonPadded;
  dv.setUint32(binAt, binPadded, true); dv.setUint32(binAt + 4, CHUNK_BIN, true);
  let cursor = binAt + 8;
  for (const chunk of chunks) { out.set(chunk, cursor); cursor += chunk.byteLength; }
  return out;
}
