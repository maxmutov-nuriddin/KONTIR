"""Render a GLB to PNG for a visual check: blender -b -P preview.py -- <glb> <png> [yaw_deg] [dist] [look_z]"""
import bpy, sys, math, os
from mathutils import Vector
a = sys.argv[sys.argv.index('--') + 1:]; glb, png = a[0], a[1]; yaw = float(a[2]) if len(a) > 2 else 35; dist = float(a[3]) if len(a) > 3 else 8; lz = float(a[4]) if len(a) > 4 else 1.0; fz = float(a[5]) if len(a) > 5 else 0.0
bpy.ops.wm.read_factory_settings(use_empty=True); bpy.ops.import_scene.gltf(filepath=glb)
sc = bpy.context.scene; sc.render.engine = 'BLENDER_EEVEE'; sc.render.resolution_x = 1100; sc.render.resolution_y = 700
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']; bg.inputs[0].default_value = (0.55, 0.65, 0.8, 1); bg.inputs[1].default_value = 1.0
bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, fz)); g = bpy.context.active_object
gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs[0].default_value = (0.35, 0.3, 0.25, 1); g.data.materials.append(gm)
sun = bpy.data.lights.new('s', 'SUN'); sun.energy = 4; so = bpy.data.objects.new('s', sun); bpy.context.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(30))
cam = bpy.data.cameras.new('c'); cam.lens = 45; co = bpy.data.objects.new('c', cam); bpy.context.collection.objects.link(co); sc.camera = co
r = math.radians(yaw); co.location = (math.cos(r) * dist, math.sin(r) * dist * -1, lz + dist * 0.28)
d = Vector((0, 0, lz)) - co.location; co.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
sc.render.filepath = png; bpy.ops.render.render(write_still=True)
