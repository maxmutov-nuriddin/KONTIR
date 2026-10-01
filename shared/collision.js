// Triangle-soup world collision backed by three-mesh-bvh. One implementation is shared by the
// authoritative server and the predicting client so both resolve identical capsule contacts.
import { Box3, BufferAttribute, BufferGeometry, DoubleSide, Line3, Ray, Vector3 } from 'three';
import { MeshBVH } from 'three-mesh-bvh';

const seg = new Line3(), box = new Box3(), triPoint = new Vector3(), capPoint = new Vector3();
const push = new Vector3(), faceNormal = new Vector3(), ray = new Ray(), rayOrigin = new Vector3(), rayDir = new Vector3();

/** Physical surface classes (bullet penetration, impact effects). Index = per-vertex code stored in the collider. */
export const SURFACES = Object.freeze(['concrete', 'metal', 'wood', 'sand', 'sandbag', 'glass', 'cloth', 'foliage']);
/** Material / mesh name -> surface class. Stone, brick, plaster and asphalt all behave as masonry ('concrete'). */
export function surfaceOf(name = '') {
  const n = String(name).toLowerCase();
  if (/sandbag/.test(n)) return 'sandbag';
  if (/wood|crate|plank|door/.test(n)) return 'wood';
  if (/container|metal|rust|cladding|steel|iron/.test(n)) return 'metal';
  if (/glass|window/.test(n)) return 'glass';
  if (/cloth|canvas|awning|fabric/.test(n)) return 'cloth';
  if (/foliage|leaf|palm|bush/.test(n)) return 'foliage';
  if (/sand|dirt|ground|mud/.test(n)) return 'sand';
  return 'concrete';
}
/**
 * How far a bullet's penetration power carries through each surface, relative to a weapon's nominal value: planks and
 * thin sheet metal are shot through easily, masonry poorly, a sandbag or packed earth almost not at all.
 */
export const PENETRATION = Object.freeze({ concrete: 0.55, metal: 0.85, wood: 2.2, sand: 0.3, sandbag: 0.25, glass: 3, cloth: 4, foliage: 4 });

export class MeshCollider {
  /** @param {{positions:Float32Array, indices:Uint32Array}[]} meshes world-space triangles */
  constructor(meshes) {
    let vertexCount = 0, indexCount = 0;
    for (const m of meshes) { vertexCount += m.positions.length / 3; indexCount += m.indices.length; }
    const positions = new Float32Array(vertexCount * 3), indices = new Uint32Array(indexCount), surface = new Uint8Array(vertexCount);
    let vo = 0, io = 0;
    for (const m of meshes) {
      positions.set(m.positions, vo * 3);
      // per-vertex surface code: the BVH reorders triangles, but never vertices
      surface.fill(Math.max(0, SURFACES.indexOf(surfaceOf(m.material || m.name))), vo, vo + m.positions.length / 3);
      for (let i = 0; i < m.indices.length; i++) indices[io + i] = m.indices[i] + vo;
      vo += m.positions.length / 3; io += m.indices.length;
    }
    this.geometry = new BufferGeometry();
    this.geometry.setAttribute('position', new BufferAttribute(positions, 3));
    this.geometry.setIndex(new BufferAttribute(indices, 1));
    this.bvh = new MeshBVH(this.geometry, { targetLeafSize: 6 });
    this.geometry.computeBoundingBox();
    this.bounds = this.geometry.boundingBox;
    this.triangleCount = indices.length / 3;
    this.surface = surface;
  }
  /** Surface class of the triangle `faceIndex` (as reported by a BVH hit). */
  surfaceAt(faceIndex) {
    const idx = this.geometry.index;
    return SURFACES[this.surface[idx.getX(faceIndex * 3)]] || 'concrete';
  }

  /** Closest hit along a ray, or null. Returned normal always faces the ray origin. */
  raycast(ox, oy, oz, dx, dy, dz, far = 500) {
    rayOrigin.set(ox, oy, oz); rayDir.set(dx, dy, dz);
    if (rayDir.lengthSq() < 1e-12) return null;
    rayDir.normalize();
    ray.origin.copy(rayOrigin); ray.direction.copy(rayDir);
    const hit = this.bvh.raycastFirst(ray, DoubleSide, 0, far);
    if (!hit) return null;
    const n = hit.face.normal;
    const flip = n.x * dx + n.y * dy + n.z * dz > 0 ? -1 : 1;
    return { distance: hit.distance, x: hit.point.x, y: hit.point.y, z: hit.point.z, nx: n.x * flip, ny: n.y * flip, nz: n.z * flip, surface: this.surfaceAt(hit.faceIndex) };
  }

  /**
   * True when the point is enclosed by closed solid geometry (parity test: an upward ray leaves a closed box through
   * an odd number of faces). Used to reject nav probes that start inside walls; roofs and arches above a street are
   * whole boxes and count twice.
   */
  insideSolid(x, y, z, far = 60) {
    ray.origin.set(x, y, z); ray.direction.set(0, 1, 0);
    const hits = this.bvh.raycast(ray, DoubleSide, 0, far);
    const ys = [...new Set(hits.map(h => Math.round(h.point.y * 1000)))];    // coplanar duplicates count once
    return ys.length % 2 === 1;
  }

  /** Distance from origin to the first surface, or `far` when the ray is unobstructed. */
  wallDistance(ox, oy, oz, dx, dy, dz, far = 500) {
    const hit = this.raycast(ox, oy, oz, dx, dy, dz, far);
    return hit ? hit.distance : far;
  }

  /** Height of the walkable surface under (x,z), searched downward from y. */
  floorHeight(x, y, z, maxDrop = 200) {
    const hit = this.raycast(x, y, z, 0, -1, 0, maxDrop);
    return hit ? hit.y : null;
  }

  /**
   * Pushes the capsule (feet at pos) out of geometry. Mutates pos and appends contact normals.
   * (hx,hy,hz) is a hint (movement direction) used only to orient a degenerate plane contact.
   */
  resolveCapsule(pos, radius, height, contacts = null, hx = 0, hy = 0, hz = 0) {
    let touched = false;
    for (let iteration = 0; iteration < 5; iteration++) {
      seg.start.set(pos.x, pos.y + radius, pos.z);
      seg.end.set(pos.x, pos.y + height - radius, pos.z);
      box.makeEmpty(); box.expandByPoint(seg.start); box.expandByPoint(seg.end);
      box.min.addScalar(-radius); box.max.addScalar(radius);
      let moved = false;
      this.bvh.shapecast({
        intersectsBounds: b => b.intersectsBox(box),
        intersectsTriangle: tri => {
          const distance = tri.closestPointToSegment(seg, triPoint, capPoint);
          if (distance >= radius) return false;
          if (distance > 1e-6) push.subVectors(capPoint, triPoint).divideScalar(distance);
          else {
            tri.getNormal(faceNormal); push.copy(faceNormal);
            if (push.x * hx + push.y * hy + push.z * hz > 0) push.negate();
          }
          const depth = radius - distance;
          seg.start.addScaledVector(push, depth); seg.end.addScaledVector(push, depth);
          if (contacts) contacts.push({ x: push.x, y: push.y, z: push.z, depth });
          moved = true;
          return false;
        },
      });
      if (!moved) break;
      touched = true;
      pos.x = seg.start.x; pos.y = seg.start.y - radius; pos.z = seg.start.z;
    }
    return touched;
  }

  /** True when the capsule overlaps geometry by more than `tolerance` metres. */
  capsuleBlocked(x, y, z, radius, height, tolerance = 0.012) {
    const probe = { x, y, z }, contacts = [];
    this.resolveCapsule(probe, radius - tolerance, height - tolerance, contacts);
    return contacts.length > 0;
  }
}

export function colliderFromGLB(parsed) {
  const meshes = parsed.meshes.filter(m => !/^(nocollide|decor|skybox|nc_)/i.test(m.name) && !/^(nocollide|glass_decor)/i.test(m.material));
  if (!meshes.length) throw new Error('GLB has no collidable meshes');
  return new MeshCollider(meshes);
}
