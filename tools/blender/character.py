"""Realistic operator (characters/t.glb, characters/ct.glb) built with MPFB / MakeHuman (CC0 output).
Requires the MPFB extension and the MakeHuman system asset pack (CC0) in MPFB's user data dir — see docs/MODELS.md.
Usage: tools/blender/build.sh character [t|ct] [--preview out.png]"""
import sys, os, math; sys.path.insert(0, os.path.dirname(__file__))
import bpy
from bl_ext.user_default.mpfb.services import HumanService, TargetService, LocationService, ObjectService
from lib import reset

DATA = LocationService.get_user_data()
def A(*p): return os.path.join(DATA, *p)

ASSETS = os.path.join(os.path.dirname(__file__), 'assets')          # tools/blender/fetch-assets.sh

def make_human(hair=True):
    reset()
    macro = TargetService.get_default_macro_info_dict()
    macro.update(gender=1.0, age=0.5, muscle=0.8, weight=0.6, height=0.62, proportions=0.85)
    macro['race'] = {'caucasian': 0.75, 'asian': 0.1, 'african': 0.15}
    body = HumanService.create_human(macro_detail_dict=macro, scale=0.1)
    HumanService.add_builtin_rig(body, 'cmu_mb')
    rig = body.parent
    HumanService.set_character_skin(A('skins', 'young_caucasian_male', 'young_caucasian_male.mhmat'), body, skin_type='GAMEENGINE')
    boots = os.path.join(ASSETS, 'combat_boots', 'combatboots.mhclo')
    vest = os.path.join(ASSETS, 'tactical_vest_male', 'tactical_vest_male.mhclo')
    items = [('Eyes', A('eyes', 'high-poly', 'high-poly.mhclo')), *([('Hair', A('hair', 'short02', 'short02.mhclo'))] if hair else []),
             ('Clothes', A('clothes', 'male_casualsuit01', 'male_casualsuit01.mhclo')),
             ('Clothes', boots if os.path.exists(boots) else A('clothes', 'shoes03', 'shoes03.mhclo')),
             ('Clothes', vest)]
    for kind, path in items:
        if os.path.exists(path): HumanService.add_mhclo_asset(path, body, asset_type=kind, subdiv_levels=0, material_type='GAMEENGINE')
        else: print('missing asset', path, '(run tools/blender/fetch-assets.sh)')
    return body, rig

# ---------------------------------------------------------------------------------------------------------- camo + gear
import bmesh, numpy as np
from mathutils import Vector

import camo

# colours are linear (Blender material space); camo palettes are sRGB (camo.py)
TEAMS = {
    't':  dict(uniform=camo.ARID, vest=('tint', (0.045, 0.05, 0.032)), helmet=None, glove=(0.012, 0.012, 0.012), mask=True,
               boots=(0.14, 0.105, 0.07), belt=(0.05, 0.05, 0.04)),
    'ct': dict(uniform=camo.MULTICAM, vest=('camo', camo.MULTICAM), helmet=(0.30, 0.245, 0.16), glove=(0.035, 0.035, 0.032), mask=False,
               boots=(0.2, 0.15, 0.09), belt=(0.09, 0.07, 0.045)),
}

def _shade(px, h, w, k=8):
    """Low-frequency luminance of a texture (folds, seams, AO) without its print / weave, normalised around 1."""
    lum = px[..., :3] @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    hh, ww = h - h % k, w - w % k
    small = lum[:hh, :ww].reshape(hh // k, k, ww // k, k).mean(axis=(1, 3))
    big = np.repeat(np.repeat(small, k, 0), k, 1); out = np.ones((h, w), np.float32) * float(np.median(small)); out[:hh, :ww] = big
    detail = np.clip(lum / np.maximum(out, 1e-3), 0.75, 1.2)              # keep a little of the original stitching
    sh = out / max(1e-3, float(np.median(small)))
    return np.clip(sh, 0.45, 1.3) * (detail * 0.35 + 0.65)

def _write(name, rgb):
    h, w = rgb.shape[:2]
    img = bpy.data.images.new(name, w, h); img.pixels.foreach_set(np.concatenate([rgb, np.ones((h, w, 1), np.float32)], axis=2).astype(np.float32).ravel()); img.pack()
    return img

def recolor(obj, mode, value, scale=1.6, seed=3):
    """Re-paints the diffuse textures of a fitted MakeHuman asset: 'camo' -> camo.multicam pattern, 'tint' -> flat colour,
    both multiplied by the asset's own fold / seam shading so the garment keeps its shape."""
    for slot in obj.material_slots:
        for n in slot.material.node_tree.nodes:
            if n.type != 'TEX_IMAGE' or not n.image or 'nrm' in n.image.name.lower() or 'normal' in n.image.name.lower() or 'spec' in n.image.name.lower(): continue
            if n.image.colorspace_settings.name != 'sRGB': continue
            w, h = n.image.size; px = np.array(n.image.pixels[:], dtype=np.float32).reshape(h, w, 4)
            sh = _shade(px, h, w)[..., None]
            if mode == 'camo':
                pat = camo.multicam(max(w, h), value, seed=seed, scale=scale)[:h, :w]
            else:
                pat = np.broadcast_to(np.array(value, np.float32) ** (1 / 2.2), (h, w, 3))
            n.image = _write(n.image.name + '_' + mode, np.clip(pat * sh, 0, 1))

def flat_mat(name, color, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name); m.use_nodes = True; b = m.node_tree.nodes['Principled BSDF']
    b.inputs['Base Color'].default_value = (*color, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def weight_sum(obj, names):
    idx = {g.index for g in obj.vertex_groups if g.name in names}
    return [sum(g.weight for g in v.groups if g.group in idx) for v in obj.data.vertices]

def baked_mesh(src):
    """A copy of `src`'s mesh with shape keys (MPFB body targets / fitted clothes) applied, modifiers ignored, vertex groups kept."""
    saved = [(m, m.show_viewport) for m in src.modifiers]
    for m, _ in saved: m.show_viewport = False
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    me = bpy.data.meshes.new_from_object(src.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    for m, v in saved: m.show_viewport = v
    return me

def coords(src):
    me = baked_mesh(src); co = [src.matrix_world @ v.co for v in me.vertices]; bpy.data.meshes.remove(me); return co

def shell(src, name, mask, offset, thickness, material, rig, smooth=0):
    """Duplicates the faces of `src` whose vertices all pass `mask`, pushes them `offset` m out along the normals and
    gives them `thickness` — a garment layer that follows the body exactly (vest, gloves, knee pads, balaclava)."""
    me = baked_mesh(src); me.shape_keys and None
    o = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(o); o.matrix_world = src.matrix_world.copy()
    for g in src.vertex_groups: o.vertex_groups.new(name=g.name)
    bm = bmesh.new(); bm.from_mesh(me); bm.verts.ensure_lookup_table()
    keep_set = {i for i, ok in enumerate(mask) if ok}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in keep_set for v in f.verts)], context='FACES')
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * offset
    bm.to_mesh(me); bm.free()
    me.materials.clear(); me.materials.append(material)
    if smooth:
        sm = o.modifiers.new('smooth', 'SMOOTH'); sm.factor = 0.8; sm.iterations = smooth
    if thickness:
        so = o.modifiers.new('thick', 'SOLIDIFY'); so.thickness = thickness; so.offset = 1
    sub = o.modifiers.new('sub', 'SUBSURF'); sub.levels = sub.render_levels = 1
    for p in me.polygons: p.use_smooth = True
    arm = o.modifiers.new('rig', 'ARMATURE'); arm.object = rig
    mw = o.matrix_world.copy(); o.parent = rig; o.matrix_world = mw
    return o

def rigid(obj, rig, bone):
    """Skins a rigid gear piece 100 % to one bone (rotation / scale are applied to the mesh first)."""
    bpy.ops.object.select_all(action='DESELECT'); obj.select_set(True); bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
    for g in list(obj.vertex_groups): obj.vertex_groups.remove(g)
    g = obj.vertex_groups.new(name=bone); g.add(list(range(len(obj.data.vertices))), 1.0, 'REPLACE')
    arm = obj.modifiers.new('rig', 'ARMATURE'); arm.object = rig
    mw = obj.matrix_world.copy(); obj.parent = rig; obj.matrix_world = mw
    return obj

def find(prefix): return next(o for o in bpy.data.objects if o.name.startswith(prefix))

def add_box(name, size, loc, mat, bevel=0.006):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc); o = bpy.context.active_object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True); o.data.materials.append(mat)
    if bevel: b = o.modifiers.new('b', 'BEVEL'); b.width = bevel; b.segments = 2
    return o

def noise_mat(name, color, rough=0.7, metal=0.0, amount=0.12, cells=48, size=512, seed=1):
    """Material with a mottled albedo texture (painted helmet, cordura, rubber) instead of a flat plastic colour."""
    srgb = np.array(color, np.float32) ** (1 / 2.2)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    nz = camo._fbm(x, y, cells, seed, 4)[..., None]
    img = _write(name + '_tex', np.clip(srgb * (1 - amount + 2 * amount * nz), 0, 1))
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = img; nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    return m

def gear(team, body, rig):
    T = TEAMS[team]
    shirt = find('Human.male_casualsuit01'); recolor(shirt, 'camo', T['uniform'], scale=1.7, seed=5 if team == 't' else 3)
    vest = next((o for o in bpy.data.objects if 'vest' in o.name.lower() and o.type == 'MESH'), None)
    if vest: recolor(vest, T['vest'][0], T['vest'][1], scale=1.1, seed=9)
    for o in bpy.data.objects:
        if o.type == 'MESH' and ('boot' in o.name.lower() or 'shoes' in o.name.lower()): recolor(o, 'tint', T['boots'])
    bco = coords(body); H = max(c.z for c in bco)
    sco = coords(shirt)
    in_body = {v.index for v in body.data.vertices for g in v.groups if body.vertex_groups[g.group].name == 'body'}
    bone = lambda n: rig.matrix_world @ rig.data.bones[n].head_local
    # skin under the uniform is pulled 1.5 cm inwards instead of being deleted: no poke-through, and no hole at the collar
    keepw = weight_sum(body, {'Head', 'Neck1', 'LeftHand', 'RightHand', 'LThumb', 'RThumb', 'LeftFingerBase', 'RightFingerBase', 'LeftHandFinger1', 'RightHandFinger1'})
    cov = body.vertex_groups.new(name='kontir_covered'); cov.add([i for i, w in enumerate(keepw) if w < 0.3], 1.0, 'REPLACE')
    d = body.modifiers.new('kontir_under_clothes', 'DISPLACE'); d.vertex_group = 'kontir_covered'; d.mid_level = 0.0; d.strength = -0.015; d.direction = 'NORMAL'
    parts = []
    belt_m = noise_mat(f'{team}_belt', T['belt'], 0.85, amount=0.15, cells=96)
    # gloves: a shell of the hands
    hand = weight_sum(body, {'LeftHand', 'RightHand', 'LThumb', 'RThumb', 'LeftFingerBase', 'RightFingerBase', 'LeftHandFinger1', 'RightHandFinger1'})
    parts.append(shell(body, f'{team}_gloves', [i in in_body and hand[i] > 0.5 for i in range(len(bco))], 0.003, 0.0, noise_mat(f'{team}_glove', T['glove'], 0.75, amount=0.2, cells=128), rig))
    # knee pads (hard cap on the front of the knee) with a strap ring
    me = baked_mesh(shirt); normals = [shirt.matrix_world.to_3x3() @ v.normal for v in me.vertices]; bpy.data.meshes.remove(me)
    pad = noise_mat(f'{team}_kneepad', (0.02, 0.02, 0.02), 0.55, amount=0.1, cells=64)
    for side in ('Left', 'Right'):
        k = bone(f'{side}Leg'); legw = weight_sum(shirt, {f'{side}UpLeg', f'{side}Leg'})
        parts.append(shell(shirt, f'{team}_knee{side}', [legw[i] > 0.5 and abs(sco[i].z - k.z - 0.01) < 0.055 and normals[i].y < -0.3 for i in range(len(sco))], 0.006, 0.016, pad, rig, smooth=4))
        parts.append(shell(shirt, f'{team}_kneestrap{side}', [legw[i] > 0.5 and abs(sco[i].z - k.z - 0.065) < 0.011 for i in range(len(sco))], 0.004, 0.004, belt_m, rig, smooth=2))
    # drop-leg holster on the right thigh: two leg straps, holster body, pistol grip
    rl = bone('RightUpLeg'); rk = bone('RightLeg'); tz = rl.z + (rk.z - rl.z) * 0.38
    legw = weight_sum(shirt, {'RightUpLeg'})
    for dz in (0.03, -0.08):
        parts.append(shell(shirt, f'{team}_legstrap', [legw[i] > 0.6 and abs(sco[i].z - (tz + dz)) < 0.012 for i in range(len(sco))], 0.005, 0.004, belt_m, rig, smooth=2))
    side_x = min(c.x for c in sco if abs(c.z - tz) < 0.02 and c.x < rl.x)
    hol = add_box(f'{team}_holster', (0.035, 0.06, 0.17), (side_x - 0.02, rl.y - 0.01, tz - 0.03), noise_mat(f'{team}_holster_m', (0.03, 0.03, 0.03), 0.6, amount=0.08), 0.012)
    parts.append(rigid(hol, rig, 'RightUpLeg'))
    grip = add_box(f'{team}_pistol_grip', (0.028, 0.035, 0.07), (side_x - 0.02, rl.y + 0.025, tz + 0.075), noise_mat(f'{team}_grip_m', (0.015, 0.015, 0.015), 0.5), 0.008)
    grip.rotation_euler = (math.radians(-15), 0, 0); parts.append(rigid(grip, rig, 'RightUpLeg'))
    # head
    head = weight_sum(body, {'Head'})
    hco = [bco[i] for i in range(len(bco)) if i in in_body and head[i] > 0.6]
    top = max(c.z for c in hco); hx = sum(c.x for c in hco) / len(hco); hy = sum(c.y for c in hco) / len(hco)
    face = min(c.y for c in hco)
    eyes = next((o for o in bpy.data.objects if o.name.startswith('Human.high-poly')), None)
    eco = coords(eyes) if eyes else None
    eye_c = (sum((c for c in eco), Vector()) / len(eco)) if eco else Vector((hx, face + 0.02, top - 0.115))
    eye_front = min(c.y for c in eco) if eco else face + 0.01
    if T['mask']:
        neck = weight_sum(body, {'Head', 'Neck', 'Neck1'})
        m = [i in in_body and neck[i] > 0.4 and not (abs(bco[i].z - eye_c.z) < 0.016 and abs(bco[i].x - hx) < 0.058 and bco[i].y < hy - 0.05) for i in range(len(bco))]
        parts.append(shell(body, f'{team}_balaclava', m, 0.008, 0.004, noise_mat(f'{team}_knit', (0.012, 0.012, 0.013), 0.97, amount=0.25, cells=256), rig, smooth=2))
    else:
        parts += fast_helmet(team, rig, hco, face, T['helmet'])
        parts += headset_and_glasses(team, rig, hx, hy, top, eye_c, eye_front)
    return parts

def fast_helmet(team, rig, hco, face, color):
    """High-cut ballistic helmet sized from the head's bounding box: shell with ear cut-outs, ARC side rails, NVG shroud, velcro."""
    tan = noise_mat(f'{team}_helmet', color, 0.62, amount=0.08, cells=40); dark = noise_mat(f'{team}_rail', (0.03, 0.03, 0.028), 0.5, 0.2)
    velcro = noise_mat(f'{team}_velcro', tuple(c * 0.8 for c in color), 0.95, amount=0.3, cells=200)
    xs, ys, zs = [c.x for c in hco], [c.y for c in hco], [c.z for c in hco]
    top = max(zs); hx = (min(xs) + max(xs)) / 2; hy = (min(ys) + max(ys)) / 2 + 0.008
    RX, RY, RZ = (max(xs) - min(xs)) / 2 + 0.016, (max(ys) - min(ys)) / 2 + 0.02, 0.1
    cz = top + 0.026 - RZ                                   # dome 2.6 cm over the scalp
    bpy.ops.mesh.primitive_uv_sphere_add(radius=1, segments=64, ring_count=32, location=(hx, hy, cz))
    h = bpy.context.active_object; h.name = f'{team}_helmet'; h.scale = (RX, RY, RZ); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    bm = bmesh.new(); bm.from_mesh(h.data)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, -0.022), plane_no=(0, 0.45, 1), clear_inner=True)   # brim: high at the brow, low at the nape
    # high cut over the ears; the brim rises towards the front
    cut = [f for f in bm.faces if abs(f.calc_center_median().x) > RX * 0.7 and f.calc_center_median().z < 0.035 and abs(f.calc_center_median().y) < RY * 0.42]
    bmesh.ops.delete(bm, geom=cut, context='FACES')
    bm.to_mesh(h.data); bm.free(); h.data.materials.append(tan)
    so = h.modifiers.new('t', 'SOLIDIFY'); so.thickness = 0.011; bv = h.modifiers.new('b', 'BEVEL'); bv.width = 0.003; bv.segments = 2
    sub = h.modifiers.new('s', 'SUBSURF'); sub.levels = 1
    for p in h.data.polygons: p.use_smooth = True
    parts = [rigid(h, rig, 'Head')]
    for s_ in (-1, 1):   # side rails follow the shell: three short segments
        for k, (dy, dz, rx) in enumerate(((-0.045, 0.045, 0.25), (0.0, 0.05, 0.0), (0.045, 0.045, -0.25))):
            rad = RX * math.sqrt(max(0.0, 1 - (dz / RZ) ** 2 - (dy / RY) ** 2)) + 0.004
            r = add_box(f'{team}_rail', (0.01, 0.05, 0.015), (hx + s_ * rad, hy + dy, cz + dz), dark, 0.003)
            r.rotation_euler = (rx, s_ * -0.18, 0); parts.append(rigid(r, rig, 'Head'))
    shroud = add_box(f'{team}_shroud', (0.055, 0.012, 0.038), (hx, hy - RY * 0.82, cz + RZ * 0.52), dark, 0.004); shroud.rotation_euler = (math.radians(-28), 0, 0)
    parts.append(rigid(shroud, rig, 'Head'))
    for (sx, sy, sz, y, z, rx) in ((0.06, 0.003, 0.03, hy + RY * 0.88, cz + RZ * 0.35, 0.5),):
        v = add_box(f'{team}_velcro', (sx, sy, sz), (hx, y, z), velcro, 0.002); v.rotation_euler = (rx, 0, 0); parts.append(rigid(v, rig, 'Head'))
    return parts

def headset_and_glasses(team, rig, hx, hy, top, eye_c, eye_front):
    cup_m = noise_mat(f'{team}_headset', (0.03, 0.033, 0.026), 0.7, amount=0.1); lens_m = bpy.data.materials.new(f'{team}_lens'); lens_m.use_nodes = True
    lb = lens_m.node_tree.nodes['Principled BSDF']; lb.inputs['Base Color'].default_value = (0.02, 0.025, 0.03, 1); lb.inputs['Roughness'].default_value = 0.05
    lb.inputs['Alpha'].default_value = 0.45; lens_m.surface_render_method = 'BLENDED' if hasattr(lens_m, 'surface_render_method') else None
    frame_m = noise_mat(f'{team}_frame', (0.015, 0.015, 0.015), 0.4)
    parts = []
    ear_z = eye_c.z - 0.03
    for s_ in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.038, depth=0.036, vertices=40, location=(hx + s_ * 0.095, hy + 0.01, ear_z), rotation=(0, math.pi / 2, 0))
        e = bpy.context.active_object; e.name = f'{team}_earcup'; e.scale = (1, 1.0, 1.25); e.data.materials.append(cup_m)
        b = e.modifiers.new('b', 'BEVEL'); b.width = 0.012; b.segments = 4; parts.append(rigid(e, rig, 'Head'))
    # boom mic on the left cup
    bpy.ops.mesh.primitive_cylinder_add(radius=0.004, depth=0.11, location=(hx + 0.085, eye_front + 0.03, ear_z - 0.035), rotation=(math.radians(100), 0, math.radians(-35)))
    mic = bpy.context.active_object; mic.name = f'{team}_mic'; mic.data.materials.append(frame_m); parts.append(rigid(mic, rig, 'Head'))
    # glasses: two lenses in front of the eyes, bridge and temples
    for s_ in (-1, 1):
        bpy.ops.mesh.primitive_cylinder_add(radius=0.025, depth=0.003, vertices=32, location=(eye_c.x + s_ * 0.032, eye_front - 0.011, eye_c.z + 0.002), rotation=(math.radians(90), 0, s_ * math.radians(14)))
        l = bpy.context.active_object; l.name = f'{team}_lens'; l.scale = (1.45, 0.7, 1); l.data.materials.append(lens_m); parts.append(rigid(l, rig, 'Head'))
        t = add_box(f'{team}_temple', (0.004, 0.1, 0.005), (eye_c.x + s_ * 0.071, eye_front + 0.045, eye_c.z + 0.012), frame_m, 0.0015); parts.append(rigid(t, rig, 'Head'))
    parts.append(rigid(add_box(f'{team}_bridge', (0.03, 0.004, 0.006), (eye_c.x, eye_front - 0.016, eye_c.z + 0.012), frame_m, 0.0015), rig, 'Head'))
    return parts

# ---------------------------------------------------------------------------------------------------- rifle hold + clips
from mathutils import Matrix, Quaternion, Euler
import anim
from lib import OUT as LIB_OUT

BVH = os.environ.get('KONTIR_BVH', os.path.join(os.path.dirname(__file__), 'bvh'))
# clip name (matched by CLIPS in client/src/characters.js) -> (CMU take, source frame range at 120 fps, loop?)
CLIP_SOURCES = {
    'idle':  ('140_06', (40, 260), True),
    'walk':  ('07_01', (61, None), True),
    'run':   ('09_02', (31, None), True),
    'squat': ('136_09', (205, 265), True),
    'sneak': ('136_09', (600, None), True),
    'jump':  ('02_04', (80, 230), False),
    'death': ('90_16', (280, 520), False),
}
ARM_BONES = [f'{s}{b}' for s in ('Left', 'Right') for b in ('Shoulder', 'Arm', 'ForeArm', 'Hand', 'FingerBase', 'HandFinger1')] + ['LThumb', 'RThumb']
# palm positions on the weapon (game weapon frame: +x right, +y up, muzzle -z), from HANDS.ak47 in client/src/viewmodels.js
PALM_R, PALM_L = Vector((0.033, -0.088, 0.088)), Vector((-0.012, -0.05, -0.2))   # left palm on the rear of the handguard (within arm's reach)
CANT = math.radians(9)                              # muzzle turned slightly across the body, like a real carry
W2B = lambda v: Matrix.Rotation(CANT, 3, 'Z') @ Vector((-v.x, v.z, v.y))   # weapon frame -> Blender world (character faces -Y)

def _empty(name, loc):
    e = bpy.data.objects.new(name, None); bpy.context.collection.objects.link(e); e.location = loc; return e

M0 = Matrix(((-1, 0, 0), (0, 0, 1), (0, 1, 0)))     # weapon frame -> Blender world for a character facing -Y

def _local_rotations(rig):
    hold = {}
    for n in ARM_BONES:
        pb = rig.pose.bones[n]; b = pb.bone
        parent_m = rig.pose.bones[b.parent.name].matrix if b.parent else Matrix()
        rel = (b.parent.matrix_local.inverted() @ b.matrix_local) if b.parent else b.matrix_local
        hold[n] = ((parent_m @ rel).inverted() @ pb.matrix).to_quaternion().normalized()
    return hold

def _solve(rig, targets, tag):
    """targets: side -> (wrist world pos, pole world pos, ('aim', point) | ('rot', world 3x3)). Returns local rotations + hand world matrices."""
    mw = rig.matrix_world; tmp = []
    bpy.context.view_layer.objects.active = rig; bpy.ops.object.mode_set(mode='POSE')
    for pb in rig.pose.bones: pb.rotation_mode = 'QUATERNION'; pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0)
    for side, (wrist, pole, (kind, val)) in targets.items():
        t, p = _empty(f'ik_{side}', wrist), _empty(f'pole_{side}', pole); tmp += [t, p]
        c = rig.pose.bones[f'{side}ForeArm'].constraints.new('IK'); c.target = t; c.pole_target = p; c.chain_count = 2; c.pole_angle = math.radians(-90)
        if kind == 'aim':
            a = _empty(f'aim_{side}', val); tmp.append(a)
            d = rig.pose.bones[f'{side}Hand'].constraints.new('DAMPED_TRACK'); d.target = a; d.track_axis = 'TRACK_Y'
        else:
            r = _empty(f'rot_{side}', wrist); r.rotation_mode = 'QUATERNION'; r.rotation_quaternion = val.to_quaternion(); tmp.append(r)
            d = rig.pose.bones[f'{side}Hand'].constraints.new('COPY_ROTATION'); d.target = r
        for f in (f'{side}FingerBase', f'{side}HandFinger1'): rig.pose.bones[f].rotation_quaternion = Euler((math.radians(55), 0, 0)).to_quaternion()
        rig.pose.bones[side[0] + 'Thumb'].rotation_quaternion = Euler((math.radians(25), 0, 0)).to_quaternion()
    bpy.context.view_layer.update()
    hands = {}
    for side, (wrist, _, _) in targets.items():
        got = mw @ rig.pose.bones[f'{side}Hand'].head
        print(f'IK {tag} {side}: err {(got - wrist).length:.3f}', flush=True)
        hands[side] = mw @ rig.pose.bones[f'{side}Hand'].matrix
    hold = _local_rotations(rig)
    for side in ('Left', 'Right'):
        for bn in (f'{side}ForeArm', f'{side}Hand'):
            for c in list(rig.pose.bones[bn].constraints): rig.pose.bones[bn].constraints.remove(c)
    for pb in rig.pose.bones: pb.rotation_quaternion = Quaternion(); pb.location = (0, 0, 0)
    bpy.ops.object.mode_set(mode='OBJECT')
    for o in tmp: bpy.data.objects.remove(o)
    return hold, hands

def rifle_hold(rig):
    """Arms on a carried rifle (gameplay hold, level) and on the same rifle at low ready (lobby): hands keep their grip
    on the weapon, the weapon frame moves. Returns (hold, hold_low, weapon origin in the gameplay hold)."""
    bpy.context.view_layer.update()
    mw = rig.matrix_world; bone = lambda n: mw @ rig.data.bones[n].head_local
    sh = bone('RightArm'); chest = bone('Spine1')
    origin = Vector((sh.x * 0.45, chest.y - 0.39, sh.z - 0.21))
    palm_r, palm_l = origin + W2B(PALM_R), origin + W2B(PALM_L)
    poles = {'Right': sh + Vector((-0.35, 0.15, -0.45)), 'Left': bone('LeftArm') + Vector((0.3, -0.1, -0.5))}
    hold, hands = _solve(rig, {
        'Right': (palm_r + Vector((0.0, 0.03, 0.05)), poles['Right'], ('aim', origin + W2B(Vector((0.03, -0.2, 0.02))))),
        'Left':  (palm_l + Vector((0.015, 0.06, -0.035)), poles['Left'], ('aim', palm_l + W2B(Vector((0.0, 0.03, -0.12))))),
    }, 'hold')
    # low ready: muzzle 38 deg down and 30 deg across the body, weapon a little lower and closer
    R_h = Matrix.Rotation(CANT, 3, 'Z') @ M0
    W_h = Matrix.Translation(origin) @ R_h.to_4x4()
    R_low = Matrix.Rotation(math.radians(30), 3, 'Z') @ Matrix.Rotation(math.radians(38), 3, 'X') @ R_h
    W_low = Matrix.Translation(origin + Vector((0.06, 0.08, -0.06))) @ R_low.to_4x4()
    tg = {}
    for side in ('Right', 'Left'):
        Hl = W_low @ W_h.inverted() @ hands[side]
        tg[side] = (Hl.to_translation(), poles[side] + Vector((0, 0, -0.1)), ('rot', Hl.to_3x3().normalized()))
    hold_low, _ = _solve(rig, tg, 'low')
    return hold, hold_low, origin

def weapon_socket(rig, origin, hold):
    """Empty on the right hand whose transform, after the game's fixed socket rotation (-pi/2, 0, pi/2), lays the weapon
    along the character's forward axis with its origin at `origin` (in the hold pose)."""
    C = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))                       # glTF -> Blender
    G_w = Matrix(((-1, 0, 0), (0, 1, 0), (0, 0, -1)))                     # weapon frame in the asset (glTF) frame
    R_fix = Euler((-math.pi / 2, 0, math.pi / 2), 'XYZ').to_matrix()
    # -90 deg about Z: measured in the game (three.js applies the socket Euler in the bone's own frame)
    B = Matrix.Rotation(CANT - math.pi / 2, 3, 'Z') @ C @ (G_w @ R_fix.inverted()) @ C.inverted()
    # and +90 deg about the muzzle axis: measured with tools/blender/socketcheck.js (the weapon lay on its side)
    B = Matrix.Rotation(math.pi / 2, 3, Vector((math.sin(CANT), -math.cos(CANT), 0))) @ B
    # pose the arm in the hold, then parent the socket to the hand bone keeping this world transform
    for n, q in hold.items(): rig.pose.bones[n].rotation_quaternion = q
    bpy.context.view_layer.update()
    e = bpy.data.objects.new('weapon_socket', None); bpy.context.collection.objects.link(e)
    e.parent = rig; e.parent_type = 'BONE'; e.parent_bone = 'RightHand'
    bpy.context.view_layer.update()
    e.matrix_world = Matrix.Translation(origin) @ B.to_4x4()
    bpy.context.view_layer.update()
    for pb in rig.pose.bones: pb.rotation_quaternion = Quaternion()
    return e

def build_clips(rig, hold, hold_low=None):
    sc = bpy.context.scene; sc.render.fps = 30; acts = []
    sources = dict(CLIP_SOURCES)
    if hold_low: sources['lowready'] = CLIP_SOURCES['idle']
    for name, (take, (a, b), loop) in sources.items():
        src = anim.import_bvh(os.path.join(BVH, take + '.bvh'))
        if b is None: b = a + anim.period(src, 'LeftUpLeg', (a, a + 480), 4)
        h = hold_low if name == 'lowready' else hold
        act, n = anim.retarget(src, rig, name, (a, b), step=4, hold_bones=None if name == 'death' else set(h), hold=h)
        if loop: anim.make_cyclic(act, n, blend=4)
        act.frame_range = (1, n); acts.append(act)
        bpy.data.objects.remove(src); print('clip', name, take, a, b, n, flush=True)
    rig.animation_data.action = None
    # one NLA track per clip so the glTF exporter writes each as a named animation
    for act in acts:
        tr = rig.animation_data.nla_tracks.new(); tr.name = act.name; st = tr.strips.new(act.name, 1, act); tr.mute = True
    return acts

def make_opaque():
    """MPFB wires texture alpha into every material, which the glTF exporter turns into alphaMode BLEND: three.js then
    sorts skin / eyes / clothes as transparent and the face renders washed out with the mouth showing through.
    Everything except hair cards becomes opaque."""
    for m in bpy.data.materials:
        if not m.use_nodes or 'short' in m.name or 'hair' in m.name.lower(): continue
        for n in m.node_tree.nodes:
            if n.type == 'BSDF_PRINCIPLED':
                for l in list(n.inputs['Alpha'].links): m.node_tree.links.remove(l)
                n.inputs['Alpha'].default_value = 1.0
        if hasattr(m, 'surface_render_method'): m.surface_render_method = 'DITHERED'
        m.use_backface_culling = True

def export_character(team, rig):
    make_opaque()
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.data.shape_keys:
            bpy.context.view_layer.objects.active = o; o.select_set(True)
            bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    out = os.path.join(LIB_OUT, 'characters', f'{team}.glb'); os.makedirs(os.path.dirname(out), exist_ok=True)
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_apply=True, export_yup=True,
        export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True, export_frame_step=1,
        export_morph=False, export_skins=True, export_def_bones=False, export_image_format='WEBP', export_image_quality=85,
        export_image_webp_fallback=False, export_cameras=False, export_lights=False)
    print('exported', out, os.path.getsize(out) // 1024, 'KB')


if __name__ == '__main__':
    args = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    team = next((a for a in args if a in TEAMS), 'ct')
    body, rig = make_human(hair=not TEAMS[team]['mask'])
    gear(team, body, rig)
    hold, hold_low, origin = rifle_hold(rig)
    sock = weapon_socket(rig, origin, hold)
    if '--no-anim' not in args: build_clips(rig, hold, hold_low)
    if '--export' in args: export_character(team, rig)
    print('RIG', rig and rig.name, 'BONES', rig and [b.name for b in rig.data.bones][:60])
    print('OBJECTS', [(o.name, o.type) for o in bpy.data.objects])
    if '--preview' in args:
        bpy.ops.wm.save_as_mainfile(filepath=args[args.index('--preview') + 1].replace('.png', '.blend'))
