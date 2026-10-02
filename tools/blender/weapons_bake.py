"""Turns the game's procedural weapon rigs (tools/blender/rigs/<id>.glb, from export-rigs.mjs) into textured models:
every source material becomes a procedural PBR material (edge wear, cavity dirt, scratches, grain), each moving part
keeps its own node so reload/fire animations still work, and everything is baked to albedo / ORM / normal maps.
Output: client/public/models/weapons/<id>.glb. Usage: tools/blender/build.sh weapons_bake [id ...]  (KONTIR_FAST=1 = preview quality)"""
import sys, os, glob; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from pbr import pbr, bake_group

RIGS = os.path.join(os.path.dirname(__file__), 'rigs')
PARTS = {'mag', 'bolt', 'slide', 'pump', 'cylinder', 'suppressor'}
# source material -> (skin class, pbr settings). Classes named receiver / furniture take inventory skins (client/src/finishes.js).
SRC = {
    'darkMetal':  ('receiver',  dict(base=0x2a2d30, rough=0.48, metal=0.85, kind='paint', wear=0.55)),
    'blackSteel': ('receiver',  dict(base=0x1c1e21, rough=0.42, metal=0.9, kind='paint', wear=0.45)),
    'silver':     ('receiver',  dict(base=0xa9adb1, rough=0.32, metal=1.0, kind='metal', wear=0.25)),
    'blade':      ('receiver',  dict(base=0xd2d7dc, rough=0.36, metal=0.88, kind='metal', wear=0.12)),   # knife blades (take skins)
    'oliveMetal': ('receiver',  dict(base=0x4f573a, rough=0.55, metal=0.4, kind='paint', wear=0.6)),
    'polymer':    ('furniture', dict(base=0x222325, rough=0.72, metal=0.0, kind='plaster', wear=0.12, scale=4, bump=0.4)),
    'olivePoly':  ('furniture', dict(base=0x3c4534, rough=0.72, metal=0.0, kind='plaster', wear=0.12, scale=4, bump=0.4)),
    'tanPoly':    ('furniture', dict(base=0x7a6b50, rough=0.72, metal=0.0, kind='plaster', wear=0.12, scale=4, bump=0.4)),
    'wood':       ('furniture', dict(base=0x4a2412, rough=0.6, metal=0.0, kind='wood', wear=0.0, scale=1.4, bump=0.35, tone=(0.92, 1.06))),
    'metal':      ('metal',     dict(base=0x4c5054, rough=0.6, metal=1.0, kind='metal', wear=0.3)),
    'steel':      ('metal',     dict(base=0x9a9ea2, rough=0.38, metal=1.0, kind='metal', wear=0.15)),
    'rubber':     ('metal',     dict(base=0x131415, rough=0.9, metal=0.0, kind='plaster', wear=0.0, scale=6, bump=0.3)),
    'grenadeGreen': ('body',    dict(base=0x46553a, rough=0.55, metal=0.3, kind='paint', wear=0.6)),
    'grenadeGrey':  ('body',    dict(base=0x868c90, rough=0.4, metal=0.75, kind='paint', wear=0.4)),
    'smokeBody':    ('body',    dict(base=0x5f6b63, rough=0.48, metal=0.5, kind='paint', wear=0.5)),
    'c4':         ('body',      dict(base=0x565b40, rough=0.75, metal=0.1, kind='cloth', wear=0.1, scale=6)),
    'tape':       ('metal',     dict(base=0xbfb89c, rough=0.9, metal=0.0, kind='cloth', wear=0.0, scale=8)),
}
_cache = {}
def material_for(src_mat):
    name = src_mat.name.split('.')[0]
    if name == 'lens': return None, None
    if name not in _cache:
        if name in SRC: cls, p = SRC[name]; p = dict(p); base = srgb(p.pop('base'))
        else:                                               # accent / red / wire / unknown: keep the game colour
            b = src_mat.node_tree.nodes.get('Principled BSDF') if src_mat.use_nodes else None
            base = tuple(b.inputs['Base Color'].default_value[:3]) if b else (0.3, 0.3, 0.3)
            m = b.inputs['Metallic'].default_value if b else 0.0
            cls, p = 'metal', dict(rough=b.inputs['Roughness'].default_value if b else 0.5, metal=m, kind='metal' if m > 0.5 else 'paint', wear=0.3)
        _cache[name] = (cls, pbr(f'src_{name}', base, **p))
    return _cache[name]

def owner_of(o):
    p = o.parent
    while p is not None:
        if p.name.split('.')[0] in PARTS: return p.name.split('.')[0]
        p = p.parent
    return 'body'

def res_for(objs):
    pts = [o.matrix_world @ Vector(c) for o in objs for c in o.bound_box]
    L = max(max(p[i] for p in pts) - min(p[i] for p in pts) for i in range(3))
    return 2048 if L > 0.35 else 1024 if L > 0.1 else 512

def weld(o):
    """The game's geometry is non-indexed (every triangle separate): weld it so edge-wear / cavity shaders see real edges,
    then rebuild shading from face angles (hard above 40 deg) instead of the split custom normals."""
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=2e-5)
    bmesh.ops.dissolve_degenerate(bm, dist=1e-6, edges=bm.edges)
    bm.to_mesh(o.data); bm.free()
    if o.data.has_custom_normals: bpy.ops.mesh.customdata_custom_splitnormals_clear()
    bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))

def reparent(child, parent):
    mw = child.matrix_world.copy(); child.parent = parent; child.matrix_world = mw

def build(id):
    reset(); _cache.clear()
    bpy.ops.import_scene.gltf(filepath=os.path.join(RIGS, f'{id}.glb'))
    objs = list(bpy.data.objects); bpy.context.view_layer.update()
    old_empties = [o.name for o in objs if o.type == 'EMPTY']
    part_nodes = {o.name.split('.')[0]: o for o in objs if o.type == 'EMPTY' and o.name.split('.')[0] in PARTS}
    markers = [o for o in objs if o.type == 'EMPTY' and o.name.split('.')[0] in ('muzzle', 'eject')]
    root = empty(id)
    # final part nodes: empties at the original part transforms, nested like the source
    out_parts = {}
    for name, src in part_nodes.items():
        e = empty(name + '__new'); e.matrix_world = src.matrix_world.copy(); out_parts[name] = e
    for name, src in part_nodes.items():
        up = owner_of(src); reparent(out_parts[name], out_parts[up] if up != 'body' else root)
    groups, keep = {}, []
    for o in objs:
        if o.type != 'MESH': continue
        if not o.material_slots or not o.material_slots[0].material: continue
        cls, m = material_for(o.material_slots[0].material)
        own = owner_of(o)
        mw = o.matrix_world.copy(); o.parent = None; o.matrix_world = mw
        if m is None: keep.append((own, o)); continue
        o.data = o.data.copy()                                  # shared glTF meshes: make single-user before applying
        for s in o.material_slots: s.material = _cache[s.material.name.split('.')[0]][1] if s.material and s.material.name.split('.')[0] in _cache else m
        bpy.context.view_layer.objects.active = o; bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        weld(o)
        groups.setdefault((own, cls), []).append(o)
    for (own, cls), group in groups.items():
        node = f'{own}_{cls}'; mname = f'{id}_{cls}' if own == 'body' else f'{id}_{own}_{cls}'
        baked = bake_group(group, node, mname, res_for(group), samples=4)
        reparent(baked, out_parts[own] if own != 'body' else root)
    glass = mat(f'{id}_glass', (0.03, 0.06, 0.1), 0.05, 0.1)
    for own, o in keep:
        o.data.materials.clear(); o.data.materials.append(glass); reparent(o, out_parts[own] if own != 'body' else root)
    for mk in markers:
        e = empty(mk.name.split('.')[0] + '__new'); e.matrix_world = mk.matrix_world.copy(); reparent(e, root)
    # drop the imported hierarchy, then give the new nodes their final names
    for n in old_empties:
        if n in bpy.data.objects: bpy.data.objects.remove(bpy.data.objects[n])
    for o in list(bpy.data.objects):
        if o.name.endswith('__new'): o.name = o.name[:-5]
    export(f'weapons/{id}.glb', list(bpy.data.objects))

if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    ids = only or sorted(os.path.basename(f)[:-4] for f in glob.glob(os.path.join(RIGS, '*.glb')))
    for id in ids:
        print('== building', id, flush=True); build(id)
