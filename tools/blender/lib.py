"""Shared Blender helpers for the KONTIR model generators. Run through tools/blender/build.sh (headless Blender).
Units: metres. Blender is Z-up; the glTF exporter converts to Y-up, so Blender +Y (forward) becomes glTF -Z."""
import bpy, bmesh, math, os, random
from mathutils import Vector, Euler

OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../client/public/models'))

def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for c in list(bpy.data.collections): bpy.data.collections.remove(c)

_mats = {}
def mat(name, color=(0.5, 0.5, 0.5), rough=0.5, metal=0.0, emit=None, coat=0.0):
    key = (name, color, rough, metal)
    if name in _mats and _mats[name].name in bpy.data.materials: return _mats[name]
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color[:3], 1)
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if coat and 'Coat Weight' in b.inputs: b.inputs['Coat Weight'].default_value = coat
    if emit:
        b.inputs['Emission Color'].default_value = (*emit, 1); b.inputs['Emission Strength'].default_value = 2.0
    _mats[name] = m
    return m

def srgb(h):
    """0xRRGGBB -> linear rgb tuple."""
    f = lambda c: (c / 255) ** 2.2
    return (f((h >> 16) & 255), f((h >> 8) & 255), f(h & 255))

def _finish(o, m, bevel, smooth=True, parent=None):
    if m: o.data.materials.append(m)
    if smooth:
        for p in o.data.polygons: p.use_smooth = True
    if bevel:
        b = o.modifiers.new('bevel', 'BEVEL'); b.width = bevel; b.segments = 2; b.limit_method = 'ANGLE'; b.angle_limit = math.radians(35)
        n = o.modifiers.new('wn', 'WEIGHTED_NORMAL'); n.keep_sharp = True
    if parent: o.parent = parent
    return o

def box(name, size, loc=(0, 0, 0), m=None, bevel=0.0, rot=(0, 0, 0), parent=None):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, bevel, parent=parent)

def cyl(name, r, h, loc=(0, 0, 0), m=None, verts=24, rot=(0, 0, 0), bevel=0.0, r2=None, parent=None):
    if r2 is None:
        bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=h, vertices=verts, location=loc, rotation=rot)
    else:
        bpy.ops.mesh.primitive_cone_add(radius1=r, radius2=r2, depth=h, vertices=verts, location=loc, rotation=rot)
    o = bpy.context.active_object; o.name = name
    return _finish(o, m, bevel, parent=parent)

def sphere(name, r, loc=(0, 0, 0), m=None, scale=(1, 1, 1), seg=24, parent=None):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    o = bpy.context.active_object; o.name = name; o.scale = scale
    bpy.ops.object.transform_apply(scale=True)
    return _finish(o, m, 0, parent=parent)

def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    o = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(o)
    o.location = loc; o.rotation_euler = rot
    if parent: o.parent = parent
    return o

def extrude_profile(name, pts, width, m=None, bevel=0.0, loc=(0, 0, 0), parent=None):
    """Extrude a 2D side-profile (list of (y, z) points in the YZ plane, forward = +Y) sideways by `width` along X."""
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((-width / 2, y, z)) for y, z in pts]
    bm.faces.new(vs)
    ret = bmesh.ops.extrude_face_region(bm, geom=list(bm.faces))
    bmesh.ops.translate(bm, vec=(width, 0, 0), verts=[e for e in ret['geom'] if isinstance(e, bmesh.types.BMVert)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.location = loc
    bpy.context.view_layer.objects.active = o
    return _finish(o, m, bevel, parent=parent)

def join(objs, name):
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join(); o = bpy.context.active_object; o.name = name
    return o

def export(path, objs=None):
    """Export `objs` (default: everything) as GLB to client/public/models/<path>, modifiers applied."""
    full = os.path.join(OUT, path); os.makedirs(os.path.dirname(full), exist_ok=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in (objs or bpy.data.objects): o.select_set(True)
    bpy.ops.export_scene.gltf(filepath=full, export_format='GLB', use_selection=True, export_apply=True,
        export_yup=True, export_materials='EXPORT', export_image_format='WEBP', export_image_quality=88, export_image_webp_fallback=False, export_cameras=False, export_lights=False, export_extras=False)
    print('exported', full, os.path.getsize(full) // 1024, 'KB')

# ---- helpers in the GAME's weapon frame (three.js: +X right, +Y up, muzzle toward -Z) -------------------------------
# three (x, y, z) -> Blender (x, -z, y); the glTF exporter maps it back exactly.
def t2b(x, y, z): return (x, -z, y)

def slab(name, pts, width, m=None, bevel=0.002, off=(0, 0, 0), parent=None):
    """Side profile `pts` = [(z, y), ...] in game coordinates, extruded `width` across X and centred on off.x."""
    o = extrude_profile(name, [(-a, b) for a, b in pts], width, m, bevel, loc=t2b(*off), parent=parent)
    return o

def rb(name, w, h, d, m=None, at=(0, 0, 0), bevel=0.002, rot=(0, 0, 0), parent=None):
    """Rounded box of size (w, h, d) along game (x, y, z)."""
    return box(name, (w, d, h), t2b(*at), m, bevel, rot=(rot[0], -rot[2], rot[1]), parent=parent)

def lathe(name, pts, m=None, at=(0, 0, 0), seg=24, parent=None):
    """Surface of revolution around the game Z axis: pts = [(z, radius), ...] from back to front, at (x, y) = at[:2]."""
    me = bpy.data.meshes.new(name); bm = bmesh.new(); rings = []
    for a, r in pts:
        ring = [bm.verts.new((at[0] + math.cos(k / seg * math.tau) * r, -a - at[2], at[1] + math.sin(k / seg * math.tau) * r)) for k in range(seg)]
        rings.append(ring)
    for r0, r1 in zip(rings, rings[1:]):
        for k in range(seg): bm.faces.new((r0[k], r0[(k + 1) % seg], r1[(k + 1) % seg], r1[k]))
    if pts[0][1] > 0: bm.faces.new(list(reversed(rings[0])))
    if pts[-1][1] > 0: bm.faces.new(rings[-1])
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6); bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o)
    return _finish(o, m, 0, parent=parent)

def pin_x(name, r, length, m=None, at=(0, 0, 0), seg=12):
    """Cylinder across the gun (game X axis)."""
    return cyl(name, r, length, t2b(*at), m, seg, rot=(0, math.pi / 2, 0))

def torus(name, R, r, m=None, at=(0, 0, 0), rot=(0, 0, 0), seg=(20, 8)):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=seg[0], minor_segments=seg[1], location=t2b(*at), rotation=rot)
    o = bpy.context.active_object; o.name = name
    return _finish(o, m, 0)
