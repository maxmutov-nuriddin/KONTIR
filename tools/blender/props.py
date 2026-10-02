"""Map props (client/public/models/props/<key>.glb) with baked PBR textures. Sizes match the collision boxes in
tools/maps/builder.mjs (PROPS): origin on the floor at the centre, length along +X. Usage: tools/blender/build.sh props [key ...]
Materials whose name contains `tint` are painted white-ish and coloured per instance by the game (container palette)."""
import sys, os; sys.path.insert(0, os.path.dirname(__file__))
from lib import *
from pbr import pbr, bake_group

def save(key, parts, mname, res=2048):
    o = bake_group(parts, key, mname, res, samples=16)
    export(f'props/{key}.glb', [o])

def crate():
    """1.5 m wooden crate: corner posts, rails, plank faces with gaps, X braces, nails."""
    reset(); S = 1.5; h = S / 2; parts = []
    plank = pbr('plank', srgb(0x8f6a3e), 0.8, 0, 'wood', wear=0.25, dirt=0.8, scale=1.0, bump=0.5, tone=(0.82, 1.12))
    frame = pbr('frame', srgb(0x6a4a2a), 0.85, 0, 'wood', wear=0.35, dirt=0.9, scale=1.2, bump=0.5, tone=(0.85, 1.1))
    nail = pbr('nail', srgb(0x6e6a64), 0.55, 1, 'metal', wear=0.2)
    parts.append(box('core', (S - 0.1, S - 0.1, S - 0.1), (0, 0, h), frame))
    for sx in (-1, 1):
        for sy in (-1, 1): parts.append(box('post', (0.12, 0.12, S), (sx * (h - 0.06), sy * (h - 0.06), h), frame, 0.012))
    for z in (0.06, S - 0.06):
        for sx in (-1, 1):
            parts.append(box('rail', (0.1, S - 0.2, 0.12), (sx * (h - 0.05), 0, z), frame, 0.01))
            parts.append(box('rail', (S - 0.2, 0.1, 0.12), (0, sx * (h - 0.05), z), frame, 0.01))
    n = 7; pw = (S - 0.3) / n
    for i in range(n):
        t = -h + 0.15 + pw * (i + 0.5)
        for s in (-1, 1):
            parts.append(box('plank', (0.03, pw - 0.012, S - 0.3), (s * (h - 0.03), t, h), plank, 0.005))
            parts.append(box('plank', (pw - 0.012, 0.03, S - 0.3), (t, s * (h - 0.03), h), plank, 0.005))
        parts.append(box('lid', (pw - 0.012, S - 0.3, 0.03), (t, 0, S - 0.03), plank, 0.005))
    L = (S - 0.3) * 1.414
    for s in (-1, 1):
        parts.append(box('brace', (0.025, 0.09, L), (s * (h - 0.0), 0, h), frame, 0.006, rot=(math.pi / 4, 0, 0)))
        parts.append(box('brace', (0.09, 0.025, L), (0, s * (h - 0.0), h), frame, 0.006, rot=(0, math.pi / 4, 0)))
    for z in (0.06, S - 0.06):
        for sx in (-1, 1):
            for sy in (-0.2, 0.2): parts.append(cyl('nail', 0.012, 0.01, (sx * (h + 0.001), sy, z), nail, 8, rot=(0, math.pi / 2, 0)))
    save('crate', parts, 'crate_wood')

def barrels():
    """Three 0.95 m steel drums with rolling hoops, chime rims, bungs; two blue, one rusted."""
    reset(); parts = []
    blue = pbr('drum_blue', srgb(0x2c5b86), 0.45, 0.5, 'paint', wear=0.75, dirt=0.8, wear_col=(0.36, 0.2, 0.12))
    rust = pbr('drum_rust', srgb(0x7a3c20), 0.75, 0.6, 'paint', wear=0.9, dirt=0.9, scale=2, wear_col=(0.25, 0.12, 0.06), bump=0.6)
    for x, y, m in [(-0.55, -0.4, blue), (0.55, -0.3, rust), (0, 0.6, blue)]:
        R, H = 0.36, 0.95
        parts.append(cyl('body', R, H - 0.03, (x, y, H / 2), m, 40, bevel=0.01))
        for z in (0.3, 0.63): parts.append(torus_b('hoop', R + 0.004, 0.011, (x, y, z), m))
        for z in (0.012, H - 0.012): parts.append(torus_b('chime', R - 0.004, 0.013, (x, y, z), m))
        parts.append(cyl('lid', R - 0.01, 0.01, (x, y, H - 0.022), m, 40))
        parts.append(cyl('bung', 0.04, 0.022, (x + 0.17, y + 0.08, H - 0.012), m, 16, bevel=0.004))
        parts.append(cyl('vent', 0.025, 0.02, (x - 0.15, y - 0.1, H - 0.012), m, 12, bevel=0.003))
    save('barrels', parts, 'barrels_steel')

def torus_b(name, R, r, loc, m):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=40, minor_segments=8, location=loc)
    o = bpy.context.active_object; o.name = name; o.data.materials.append(m)
    for p in o.data.polygons: p.use_smooth = True
    return o

def container():
    """6 x 2.5 x 2.6 m ISO container: trapezoid corrugated sides/roof, door end with lock rods, corner castings."""
    reset(); L, W, H = 6.0, 2.5, 2.6; hw, hl = W / 2, L / 2; parts = []
    paint = pbr('container_tint', srgb(0xd4d0c8), 0.55, 0.35, 'paint', wear=0.7, dirt=0.9, scale=0.6, wear_col=(0.32, 0.17, 0.09), bump=0.3)
    frame = pbr('container_frame', srgb(0x2e3134), 0.6, 0.6, 'paint', wear=0.7, dirt=0.9, wear_col=(0.3, 0.16, 0.08))
    steel = pbr('container_steel', srgb(0x8c9094), 0.45, 1, 'metal', wear=0.4, dirt=0.7)
    # corrugated side walls: trapezoid profile swept along X
    pitch, depth = 0.28, 0.035
    prof = []
    x = -hl + 0.1
    while x < hl - 0.1:
        prof += [(x, 0), (x + 0.06, 0), (x + 0.09, depth), (x + 0.19, depth), (x + 0.22, 0)]; x += pitch
    prof.append((hl - 0.1, 0))
    for side in (-1, 1):
        me = bpy.data.meshes.new('wall'); bm = bmesh.new(); top, bot = [], []
        for px, d in prof:
            bot.append(bm.verts.new((px, side * (hw - 0.04 + d), 0.2))); top.append(bm.verts.new((px, side * (hw - 0.04 + d), H - 0.2)))
        for i in range(len(prof) - 1): bm.faces.new((bot[i], bot[i + 1], top[i + 1], top[i]) if side > 0 else (bot[i], top[i], top[i + 1], bot[i + 1]))
        bm.to_mesh(me); bm.free(); o = bpy.data.objects.new('wall', me); bpy.context.collection.objects.link(o); o.data.materials.append(paint)
        sol = o.modifiers.new('t', 'SOLIDIFY'); sol.thickness = 0.004; parts.append(o)
    for i in range(int((L - 0.2) / 0.2)):                    # roof: shallow ribs
        parts.append(box('roofrib', (0.12, W - 0.16, 0.02), (-hl + 0.2 + i * 0.2, 0, H - 0.07), paint, 0.006))
    parts.append(box('roof', (L - 0.1, W - 0.12, 0.03), (0, 0, H - 0.095), paint))
    parts.append(box('floor', (L, W, 0.16), (0, 0, 0.08), frame, 0.01))
    parts.append(box('endwall', (0.04, W - 0.1, H - 0.3), (-hl + 0.04, 0, H / 2), paint, 0.005))
    for k in range(6): parts.append(box('endrib', (0.03, 0.1, H - 0.45), (-hl + 0.025, -hw + 0.3 + k * 0.38, H / 2), paint, 0.006))
    # door end (+X)
    parts.append(box('door', (0.05, W - 0.12, H - 0.3), (hl - 0.04, 0, H / 2), paint, 0.005))
    parts.append(box('doorgap', (0.055, 0.012, H - 0.32), (hl - 0.035, 0, H / 2), frame))
    for k in range(4):
        for s in (-1, 1): parts.append(box('doorrib', (0.03, 0.12, H - 0.5), (hl - 0.005, s * (0.18 + k * 0.27), H / 2), paint, 0.006))
    for k in (-0.95, -0.42, 0.42, 0.95):
        parts.append(cyl('rod', 0.017, H - 0.28, (hl + 0.03, k, H / 2), steel, 12))
        for z in (0.32, H - 0.32): parts.append(box('keeper', (0.04, 0.07, 0.08), (hl + 0.03, k, z), steel, 0.006))
        parts.append(box('handle', (0.03, 0.2, 0.04), (hl + 0.06, k + 0.1 * (1 if k < 0 else -1), 1.15), steel, 0.008))
    for k in (-1.17, 1.17):
        for z in (0.45, H / 2, H - 0.45): parts.append(cyl('hinge', 0.03, 0.14, (hl - 0.02, k, z), steel, 12))
    for x in (-hl, hl):                                       # frame posts + corner castings
        for y in (-hw, hw):
            parts.append(box('post', (0.16, 0.16, H), (x - math.copysign(0.08, x), y - math.copysign(0.08, y), H / 2), frame, 0.01))
            for z in (0.07, H - 0.07): parts.append(box('casting', (0.18, 0.17, 0.14), (x - math.copysign(0.09, x), y - math.copysign(0.085, y), z), frame, 0.012))
    for y in (-hw, hw):
        for z in (0.1, H - 0.08): parts.append(box('rail', (L - 0.3, 0.12, 0.14), (0, y - math.copysign(0.06, y), z), frame, 0.01))
    for x in (-hl, hl): parts.append(box('header', (0.14, W - 0.3, 0.2), (x - math.copysign(0.07, x), 0, H - 0.1), frame, 0.01))
    plate = pbr('container_plate', srgb(0xb8b4aa), 0.5, 0.7, 'metal', wear=0.3)
    parts.append(box('csc_plate', (0.01, 0.2, 0.12), (hl + 0.005, 0.7, 1.7), plate, 0.002))
    save('container', parts, 'container_tint')

def pillar():
    """0.9 x 4.2 m plastered stone pillar: plinth, fluted shaft, capital."""
    reset(); parts = []
    plaster = pbr('pillar_plaster', srgb(0xcbbfa6), 0.9, 0, 'plaster', wear=0.6, dirt=0.9, scale=1.5, bump=0.6)
    stone = pbr('pillar_stone', srgb(0x8f8574), 0.92, 0, 'plaster', wear=0.6, dirt=1.0, scale=2.5, bump=0.8)
    parts.append(box('plinth', (0.9, 0.9, 0.35), (0, 0, 0.175), stone, 0.02)); parts.append(box('plinth2', (0.78, 0.78, 0.12), (0, 0, 0.41), plaster, 0.02))
    parts.append(cyl('shaft', 0.32, 3.3, (0, 0, 2.12), plaster, 48))
    for k in range(16):
        a = k / 16 * math.tau; parts.append(cyl('fillet', 0.03, 3.1, (math.cos(a) * 0.315, math.sin(a) * 0.315, 2.12), plaster, 8))
    for z in (0.52, 3.73): parts.append(torus_b('torus', 0.335, 0.04, (0, 0, z), stone))
    parts.append(box('echinus', (0.76, 0.76, 0.16), (0, 0, 3.86), plaster, 0.03)); parts.append(box('abacus', (0.9, 0.9, 0.14), (0, 0, 4.13), stone, 0.02))
    save('pillar', parts, 'pillar_plaster')

def well():
    """Stone well Ø2 m: irregular block courses, dark water, cap stones."""
    reset(); rnd = random.Random(3); parts = []
    stone = pbr('well_stone', srgb(0x9c9486), 0.92, 0, 'plaster', wear=0.7, dirt=1.0, scale=3, bump=0.9, tone=(0.75, 1.2))
    water = mat('well_water', (0.01, 0.02, 0.025), 0.05)
    for row in range(5):
        n = 14; off = (row % 2) * 0.5
        for i in range(n):
            a = (i + off) / n * math.tau; R = 0.82 + rnd.random() * 0.03
            parts.append(box('block', (0.36 + rnd.random() * 0.03, 0.26, 0.165 + rnd.random() * 0.012), (math.cos(a) * R, math.sin(a) * R, 0.09 + row * 0.18), stone, 0.022, rot=(0, 0, a + math.pi / 2)))
    parts.append(cyl('water', 0.72, 0.04, (0, 0, 0.55), water, 32))
    for i in range(16):
        a = i / 16 * math.tau; parts.append(box('cap', (0.38, 0.32, 0.08), (math.cos(a) * 0.86, math.sin(a) * 0.86, 0.95), stone, 0.02, rot=(0, 0, a + math.pi / 2)))
    save('well', parts, 'well_stone')

if __name__ == '__main__':
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    for fn in (crate, barrels, container, pillar, well):
        if not only or fn.__name__ in only: fn()
