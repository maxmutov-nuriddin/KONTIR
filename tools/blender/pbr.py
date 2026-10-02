"""Procedural PBR materials + texture baking for the KONTIR generators.
`pbr(...)` builds a Cycles node material (edge wear, scratches, grain, dirt in crevices). `bake_group(...)` UV-unwraps a set of
objects, bakes albedo / roughness+metallic / tangent normal into images and returns ONE mesh with a plain glTF-friendly material."""
import bpy, sys, os, math
import numpy as np
sys.path.insert(0, os.path.dirname(__file__))
from lib import srgb

def _n(nt, kind, loc, **kw):
    n = nt.nodes.new(kind); n.location = loc
    for k, v in kw.items(): setattr(n, k, v)
    return n

def pbr(name, base, rough=0.5, metal=0.0, kind='paint', wear=0.5, dirt=0.5, scale=1.0, wear_col=(0.62, 0.62, 0.64), bump=0.25, tone=(0.9, 1.1)):
    """kind: paint | metal | wood | rubber | plaster | cloth. wear: edge-chip strength 0..1. dirt: crevice darkening 0..1. scale: texture frequency multiplier."""
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear()
    out = _n(nt, 'ShaderNodeOutputMaterial', (1700, 0)); bsdf = _n(nt, 'ShaderNodeBsdfPrincipled', (1400, 0))
    nt.links.new(bsdf.outputs['BSDF'], out.inputs['Surface'])
    tc = _n(nt, 'ShaderNodeTexCoord', (-1400, 0))
    def noise(sc, det=6.0, rough_=0.55, loc=(-1100, 0), stretch=None):
        n = _n(nt, 'ShaderNodeTexNoise', loc); n.inputs['Scale'].default_value = sc * scale; n.inputs['Detail'].default_value = det; n.inputs['Roughness'].default_value = rough_
        src = tc.outputs['Object']
        if stretch:
            mp = _n(nt, 'ShaderNodeMapping', (loc[0] - 200, loc[1])); mp.inputs['Scale'].default_value = stretch; nt.links.new(src, mp.inputs['Vector']); src = mp.outputs['Vector']
        nt.links.new(src, n.inputs['Vector']); return n.outputs['Fac']
    def ramp(inp, a, b, loc):
        r = _n(nt, 'ShaderNodeValToRGB', loc); r.color_ramp.elements[0].position = a; r.color_ramp.elements[1].position = b; nt.links.new(inp, r.inputs['Fac']); return r.outputs['Color']
    def mix(a, b, fac, loc, blend='MIX'):
        x = _n(nt, 'ShaderNodeMix', loc); x.data_type = 'RGBA'; x.blend_type = blend
        nt.links.new(fac, x.inputs[0]) if not isinstance(fac, (int, float)) else x.inputs[0].__setattr__('default_value', fac)
        for i, v in ((6, a), (7, b)):
            if isinstance(v, tuple): x.inputs[i].default_value = (*v[:3], 1)
            else: nt.links.new(v, x.inputs[i])
        return x.outputs[2]
    # -- base colour: tone variation + wood grain
    var = ramp(noise(3.0, 4, 0.5, (-1100, 300)), 0.3, 0.7, (-900, 300))
    lo = tuple(c * tone[0] for c in base); hi = tuple(c * tone[1] for c in base)
    col = mix(lo, hi, var, (-650, 300))
    height = noise(60.0, 8, 0.6, (-1100, -200))                       # fine surface bump
    if kind == 'wood':
        # long grain: wave bands across the height, stretched along the gun (Blender Y), plus fine pores
        mp = _n(nt, 'ShaderNodeMapping', (-1300, -450)); mp.inputs['Scale'].default_value = (1.0, 0.08, 1.0); nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        w = _n(nt, 'ShaderNodeTexWave', (-1100, -450)); w.wave_type = 'BANDS'; w.bands_direction = 'Z'; w.inputs['Scale'].default_value = 55 * scale
        w.inputs['Distortion'].default_value = 4.5; w.inputs['Detail'].default_value = 4; w.inputs['Detail Scale'].default_value = 1.5
        nt.links.new(mp.outputs['Vector'], w.inputs['Vector'])
        grain = ramp(w.outputs['Color'], 0.45, 0.85, (-900, -450))
        pores = ramp(noise(400.0, 2, 0.5, (-1100, -650), stretch=(1, 0.05, 1)), 0.55, 0.7, (-900, -650))
        dk = tuple(c * 0.6 for c in base); col = mix(col, dk, grain, (-450, 300)); col = mix(col, tuple(c * 0.5 for c in base), pores, (-350, 300))
        height = grain
    # -- crevice dirt
    ao = _n(nt, 'ShaderNodeAmbientOcclusion', (-1100, 650)); ao.inputs['Distance'].default_value = 0.12; ao.samples = 6; ao.inputs['Normal'] if False else None
    cav = ramp(ao.outputs['AO'], 0.2, 0.85, (-850, 650))
    dirt_col = (0.03, 0.025, 0.02)
    col = mix(dirt_col, col, cav, (-250, 300)) if dirt > 0 else col
    # -- edge wear (bevel normal vs. geometry normal), broken up by noise
    bev = _n(nt, 'ShaderNodeBevel', (-1100, 950)); bev.inputs['Radius'].default_value = 0.006; bev.samples = 6
    geo = _n(nt, 'ShaderNodeNewGeometry', (-1100, 1150))
    dot = _n(nt, 'ShaderNodeVectorMath', (-850, 1000)); dot.operation = 'DOT_PRODUCT'
    nt.links.new(bev.outputs['Normal'], dot.inputs[0]); nt.links.new(geo.outputs['Normal'], dot.inputs[1])
    inv = _n(nt, 'ShaderNodeMath', (-650, 1000)); inv.operation = 'SUBTRACT'; inv.inputs[0].default_value = 1.0; nt.links.new(dot.outputs['Value'], inv.inputs[1])
    edge = _n(nt, 'ShaderNodeMapRange', (-450, 1000)); edge.inputs['From Min'].default_value = 0.002; edge.inputs['From Max'].default_value = 0.05; nt.links.new(inv.outputs['Value'], edge.inputs['Value'])
    chip = noise(14.0, 6, 0.7, (-850, 1300))
    chipm = _n(nt, 'ShaderNodeMath', (-250, 1100)); chipm.operation = 'MULTIPLY'; nt.links.new(edge.outputs['Result'], chipm.inputs[0]); nt.links.new(ramp(chip, 0.35, 0.6, (-650, 1300)), chipm.inputs[1])
    wmask = _n(nt, 'ShaderNodeMath', (-50, 1100)); wmask.operation = 'MULTIPLY'; wmask.inputs[1].default_value = wear * 2.2; nt.links.new(chipm.outputs['Value'], wmask.inputs[0])
    wclamp = _n(nt, 'ShaderNodeMath', (150, 1100)); wclamp.operation = 'MINIMUM'; wclamp.inputs[1].default_value = 1.0; nt.links.new(wmask.outputs['Value'], wclamp.inputs[0])
    worn_metal = 1.0 if kind in ('paint', 'metal') else 0.0
    if kind in ('paint', 'metal', 'wood', 'plaster'):
        wc = wear_col if kind in ('paint', 'metal') else tuple(min(1, c * 1.6) for c in base)
        col = mix(col, wc, wclamp.outputs['Value'], (200, 300))
    # -- scratches: thin stretched noise thresholded
    scr = ramp(noise(40.0, 3, 0.5, (-1100, -800), stretch=(1, 14, 1)), 0.62, 0.66, (-850, -800))
    if kind in ('paint', 'metal'): col = mix(col, tuple(min(1, c * 1.8 + 0.05) for c in base), scr, (450, 300))
    nt.links.new(col, bsdf.inputs['Base Color'])
    # -- roughness / metallic
    rr = ramp(noise(8.0, 5, 0.6, (-1100, -1100)), 0.25, 0.75, (-850, -1100))
    rmix = _n(nt, 'ShaderNodeMapRange', (-600, -1100)); rmix.inputs['To Min'].default_value = max(0, rough - 0.12); rmix.inputs['To Max'].default_value = min(1, rough + 0.12); nt.links.new(rr, rmix.inputs['Value'])
    rfin = _n(nt, 'ShaderNodeMix', (200, -1000)); rfin.data_type = 'FLOAT'; nt.links.new(wclamp.outputs['Value'], rfin.inputs[0]); nt.links.new(rmix.outputs['Result'], rfin.inputs[2]); rfin.inputs[3].default_value = 0.38
    rdirt = _n(nt, 'ShaderNodeMix', (420, -1000)); rdirt.data_type = 'FLOAT'; nt.links.new(cav, rdirt.inputs[0]); rdirt.inputs[2].default_value = 0.95; nt.links.new(rfin.outputs[0], rdirt.inputs[3])
    nt.links.new(rdirt.outputs[0], bsdf.inputs['Roughness'])
    mfin = _n(nt, 'ShaderNodeMix', (200, -1300)); mfin.data_type = 'FLOAT'; nt.links.new(wclamp.outputs['Value'], mfin.inputs[0]); mfin.inputs[2].default_value = metal; mfin.inputs[3].default_value = worn_metal
    nt.links.new(mfin.outputs[0], bsdf.inputs['Metallic'])
    # -- bump
    bp = _n(nt, 'ShaderNodeBump', (900, -300)); bp.inputs['Strength'].default_value = bump; bp.inputs['Distance'].default_value = 0.01
    hmix = _n(nt, 'ShaderNodeMath', (700, -300)); hmix.operation = 'ADD'; nt.links.new(height, hmix.inputs[0]); nt.links.new(scr, hmix.inputs[1]) if False else None
    nt.links.new(height, bp.inputs['Height']); nt.links.new(bp.outputs['Normal'], bsdf.inputs['Normal'])
    m['kontir_kind'] = kind
    return m

# ----------------------------------------------------------------------------------------------------------------------
def _img(name, res, color):
    i = bpy.data.images.new(name, res, res, alpha=False); i.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; return i

def _target(mats, img):
    """Give every material an active image-texture node (Cycles bakes into the active image node of each slot)."""
    nodes = []
    for m in mats:
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = img; t.select = True; m.node_tree.nodes.active = t; nodes.append((m, t))
    return nodes

def _clean(nodes):
    for m, t in nodes: m.node_tree.nodes.remove(t)

def _bake(kind, **kw): bpy.ops.object.bake(type=kind, margin=12, margin_type='EXTEND', use_clear=False, **kw)

_gpu_ok = None
def _gpu():
    """Use the Metal / CUDA / OptiX GPU for baking when one is available (10x faster than CPU on Apple Silicon)."""
    global _gpu_ok
    if _gpu_ok is None:
        _gpu_ok = False
        try:
            prefs = bpy.context.preferences.addons['cycles'].preferences
            for kind in ('METAL', 'OPTIX', 'CUDA', 'HIP'):
                try: prefs.compute_device_type = kind
                except TypeError: continue
                prefs.get_devices()
                devs = [d for d in prefs.devices if d.type != 'CPU']
                if devs:
                    for d in prefs.devices: d.use = True
                    _gpu_ok = True; print('bake device:', kind, [d.name for d in devs], flush=True); break
        except Exception as e: print('gpu unavailable:', e)
    return _gpu_ok

def bake_group(objs, name, mat_name, res=1024, samples=16, uv_margin=0.004):
    if os.environ.get('KONTIR_FAST'): res, samples = max(128, res // 4), 4
    """Join `objs` into one object called `name`, unwrap it, bake the procedural materials, return it with a baked material `mat_name`."""
    sc = bpy.context.scene; sc.render.engine = 'CYCLES'; sc.cycles.samples = samples; sc.cycles.use_denoising = False
    sc.cycles.device = 'GPU' if _gpu() else 'CPU'
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    for o in objs:                                                   # modifiers must be real geometry before unwrapping
        bpy.context.view_layer.objects.active = o
        for md in list(o.modifiers):
            try: bpy.ops.object.modifier_apply(modifier=md.name)
            except RuntimeError: o.modifiers.remove(md)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    if len(objs) > 1: bpy.ops.object.join()
    ob = bpy.context.active_object; ob.name = name
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=uv_margin, correct_aspect=True, scale_to_bounds=False)
    bpy.ops.uv.pack_islands(margin=uv_margin) if hasattr(bpy.ops.uv, 'pack_islands') else None
    bpy.ops.object.mode_set(mode='OBJECT')
    mats = [s.material for s in ob.material_slots]
    albedo, orm, nrm = _img(name + '_albedo', res, True), _img(name + '_orm', res, False), _img(name + '_normal', res, False)
    rough_i, metal_i = _img(name + '_r', res, False), _img(name + '_m', res, False)
    for img, kind, extra in ((albedo, 'DIFFUSE', dict(pass_filter={'COLOR'})), (rough_i, 'ROUGHNESS', {}), (nrm, 'NORMAL', dict(normal_space='TANGENT'))):
        nodes = _target(mats, img); _bake(kind, **extra); _clean(nodes)
    # metallic: route the Metallic input of every Principled node into Emission, bake EMIT, restore
    saved = []
    for m in mats:
        nt = m.node_tree; b = nt.nodes['Principled BSDF'] if 'Principled BSDF' in nt.nodes else [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
        link = b.inputs['Metallic'].links[0] if b.inputs['Metallic'].links else None
        src = link.from_socket if link else None
        if src is None:
            v = nt.nodes.new('ShaderNodeValue'); v.outputs[0].default_value = b.inputs['Metallic'].default_value; src = v.outputs[0]
        nt.links.new(src, b.inputs['Emission Color']); b.inputs['Emission Strength'].default_value = 1.0; saved.append((nt, b))
    nodes = _target(mats, metal_i); _bake('EMIT'); _clean(nodes)
    for nt, b in saved: b.inputs['Emission Strength'].default_value = 0.0
    # pack roughness(G) + metallic(B)
    n = res * res * 4; r = np.empty(n, dtype=np.float32); mt = np.empty(n, dtype=np.float32); rough_i.pixels.foreach_get(r); metal_i.pixels.foreach_get(mt)
    px = np.ones(n, dtype=np.float32); px[0::4] = 1.0; px[1::4] = r[0::4]; px[2::4] = mt[0::4]; orm.pixels.foreach_set(px); orm.update()
    bpy.data.images.remove(rough_i); bpy.data.images.remove(metal_i)
    # the single baked material
    bm = bpy.data.materials.new(mat_name); bm.use_nodes = True; nt = bm.node_tree; b = nt.nodes['Principled BSDF']
    ia = nt.nodes.new('ShaderNodeTexImage'); ia.image = albedo; nt.links.new(ia.outputs['Color'], b.inputs['Base Color'])
    io = nt.nodes.new('ShaderNodeTexImage'); io.image = orm; sp = nt.nodes.new('ShaderNodeSeparateColor'); nt.links.new(io.outputs['Color'], sp.inputs['Color'])
    nt.links.new(sp.outputs['Green'], b.inputs['Roughness']); nt.links.new(sp.outputs['Blue'], b.inputs['Metallic'])
    inn = nt.nodes.new('ShaderNodeTexImage'); inn.image = nrm; nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(inn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    ob.data.materials.clear(); ob.data.materials.append(bm)
    for p in ob.data.polygons: p.use_smooth = True
    return ob
