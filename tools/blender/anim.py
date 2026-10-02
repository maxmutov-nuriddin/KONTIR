"""CMU mocap (BVH, cgspeed MotionBuilder-friendly release; CMU places no restrictions on use) retargeted onto the
MPFB `cmu_mb` rig. Retarget is done in world space with a per-bone rest alignment (BVH T-pose vs MakeHuman A-pose):
    R_target(f) = R_source(f) * R_source_rest^-1 * A * R_target_rest,   A = rest-direction alignment.
Loops are cut to one period, made seamless and kept in place (the game moves the actor)."""
import bpy, math
from mathutils import Matrix, Quaternion, Vector

def import_bvh(path):
    before = set(bpy.data.objects)
    bpy.ops.import_anim.bvh(filepath=path, axis_forward='-Z', axis_up='Y', rotate_mode='NATIVE', global_scale=1.0, use_fps_scale=False, update_scene_fps=False, update_scene_duration=False)
    src = next(o for o in bpy.data.objects if o not in before and o.type == 'ARMATURE')
    return src

def facing(rig, use_rest=True):
    """Horizontal facing direction (world) of a CMU-named armature from its hip joints."""
    mw = rig.matrix_world
    L = mw @ rig.data.bones['LeftUpLeg'].head_local; R = mw @ rig.data.bones['RightUpLeg'].head_local
    f = (L - R).cross(Vector((0, 0, 1))); f.z = 0
    return f.normalized()

def heading(src, frames, step):
    """Average horizontal facing of the mocap actor over the clip (from the posed hip joints)."""
    sc = bpy.context.scene; acc = Vector((0, 0, 0))
    for f in range(frames[0], frames[1] + 1, step):
        sc.frame_set(f); mw = src.matrix_world
        L = mw @ src.pose.bones['LeftUpLeg'].head; R = mw @ src.pose.bones['RightUpLeg'].head
        d = (L - R).cross(Vector((0, 0, 1))); d.z = 0
        if d.length > 1e-6: acc += d.normalized()
    return acc.normalized()

def order(rig):
    out = []
    def walk(b):
        out.append(b.name)
        for c in b.children: walk(c)
    for b in rig.data.bones:
        if b.parent is None: walk(b)
    return out

def retarget(src, dst, name, frames, step=4, in_place=True, hold_bones=None, hold=None, level_bones=('LeftShoulder', 'RightShoulder'), level_ref='Hips'):
    """Bakes src's motion (source frame numbers `frames`, every `step`-th) onto dst as action `name`.
    hold_bones / hold: bones whose local basis is taken from `hold` (dict name -> Quaternion) instead of the mocap."""
    sc = bpy.context.scene
    # 1. turn the source so it faces the same way as the target; scale so the hips match
    src.rotation_mode = 'QUATERNION'
    rot = facing(src).rotation_difference(facing(dst)); src.rotation_quaternion = rot @ src.rotation_quaternion
    bpy.context.view_layer.update()
    # the actor's heading during the take differs from its T-pose heading: turn every posed rotation by that yaw so the
    # clip faces the target's forward (otherwise the difference shows up as a twist in the spine)
    Qh = heading(src, frames, step).rotation_difference(facing(dst))
    s_h = (src.matrix_world @ src.data.bones['Hips'].head_local).z - min((src.matrix_world @ b.head_local).z for b in src.data.bones)
    t_h = (dst.matrix_world @ dst.data.bones['Hips'].head_local).z - min((dst.matrix_world @ b.head_local).z for b in dst.data.bones)
    k = t_h / max(1e-6, s_h)
    sw, dw = src.matrix_world, dst.matrix_world
    swr, dwr = sw.to_quaternion(), dw.to_quaternion()
    names = order(dst)
    srest = {b.name: swr @ b.matrix_local.to_quaternion() for b in src.data.bones}
    drest = {b.name: dwr @ b.matrix_local.to_quaternion() for b in dst.data.bones}
    align = {}
    for n in names:
        if n in srest:
            sb, db = src.data.bones[n], dst.data.bones[n]
            sd = (sw.to_3x3() @ (sb.tail_local - sb.head_local)); dd = (dw.to_3x3() @ (db.tail_local - db.head_local))
            align[n] = dd.normalized().rotation_difference(sd.normalized()) if sd.length > 1e-5 and dd.length > 1e-5 else Quaternion()
    act = bpy.data.actions.new(name); act.use_fake_user = True
    dst.animation_data_create(); dst.animation_data.action = act
    for pb in dst.pose.bones: pb.rotation_mode = 'QUATERNION'
    s_ground = 0.0                                                      # mocap floor
    d_ground = min((dw @ b.head_local).z for b in dst.data.bones)
    hip_rest_w = dw @ dst.data.bones['Hips'].head_local
    samples = list(range(frames[0], frames[1] + 1, step))
    sc.frame_set(samples[0]); hip0 = sw @ src.pose.bones['Hips'].head
    for i, f in enumerate(samples):
        sc.frame_set(f)
        want = {}                                             # armature-space rotation of every target bone
        for n in names:
            db = dst.data.bones[n]; parent = db.parent
            if hold_bones and n in hold_bones and hold and n in hold:
                if n in level_bones and level_ref in want:
                    # clavicle: follow only the torso's heading so the carried weapon stays level when the actor
                    # leans (crouch walk, run); the game adds aim pitch on the spine at runtime
                    D = dwr @ want[level_ref] @ dst.data.bones[level_ref].matrix_local.to_quaternion().inverted() @ dwr.inverted()
                    twist = Quaternion((D.w, 0, 0, D.z)).normalized()
                    want[n] = dwr.inverted() @ twist @ dwr @ db.matrix_local.to_quaternion() @ hold[n]
                    continue
                prest = parent.matrix_local.to_quaternion() if parent else Quaternion()
                pw = want[parent.name] if parent else Quaternion()
                want[n] = pw @ prest.inverted() @ db.matrix_local.to_quaternion() @ hold[n]
                continue
            if n in srest:
                sworld = Qh @ swr @ src.pose.bones[n].matrix.to_quaternion()
                world = sworld @ srest[n].inverted() @ align[n] @ drest[n]
                want[n] = dwr.inverted() @ world
            else:                                             # no source bone: keep the rest pose relative to the parent
                prest = parent.matrix_local.to_quaternion() if parent else Quaternion()
                pw = want[parent.name] if parent else Quaternion()
                want[n] = pw @ prest.inverted() @ db.matrix_local.to_quaternion()
        for n in names:
            pb = dst.pose.bones[n]; db = pb.bone; parent = db.parent
            rest = db.matrix_local.to_quaternion()
            if parent: basis = (want[parent.name] @ parent.matrix_local.to_quaternion().inverted() @ rest).inverted() @ want[n]
            else: basis = rest.inverted() @ want[n]
            pb.rotation_quaternion = basis.normalized()
            pb.keyframe_insert('rotation_quaternion', frame=i + 1, group=n)
        # hips position: source hip motion scaled into the target, horizontal drift removed for in-place loops
        hp = sw @ src.pose.bones['Hips'].head
        hp = hip0 + Qh @ (hp - hip0)
        d = (hp - hip0) * k
        if in_place: d.x = d.y = 0
        d.z = (hp.z - s_ground) * k - (hip_rest_w.z - d_ground)          # absolute hip height (crouches stay on the floor)
        arm_d = dw.to_3x3().inverted() @ d
        hb = dst.pose.bones['Hips']; hb.location = db_rest_inv(dst.data.bones['Hips']) @ arm_d
        hb.keyframe_insert('location', frame=i + 1, group='Hips')
    return act, len(samples)

def db_rest_inv(bone):
    return bone.matrix_local.to_3x3().inverted()

def fcurves(act):
    """All F-curves of an action (Blender 4.4+ slotted actions keep them in layers / strips / channel bags)."""
    if hasattr(act, 'layers'):
        return [fc for layer in act.layers for strip in layer.strips for cb in strip.channelbags for fc in cb.fcurves]
    return list(act.fcurves)

def make_cyclic(act, n, blend=5):
    """Blends the last `blend` keys towards the first so the clip loops without a pop."""
    for fc in fcurves(act):
        kp = fc.keyframe_points
        if len(kp) < blend + 2: continue
        first = kp[0].co[1]
        for j in range(blend):
            idx = len(kp) - blend + j; t = (j + 1) / blend
            kp[idx].co[1] = kp[idx].co[1] * (1 - t) + first * t
        fc.update()

def period(src, bone, frames, step):
    """Gait period (in source frames) from the autocorrelation of a leg bone's rotation."""
    sc = bpy.context.scene; vals = []
    for f in range(frames[0], frames[1], step):
        sc.frame_set(f); q = src.pose.bones[bone].matrix.to_quaternion(); vals.append(q.to_euler().x)
    m = sum(vals) / len(vals); v = [x - m for x in vals]; best, lag = -1e9, 0
    for L in range(int(0.6 * 120 / step), min(len(v) // 2, int(1.6 * 120 / step))):
        c = sum(v[i] * v[i + L] for i in range(len(v) - L)) / (len(v) - L)
        if c > best: best, lag = c, L
    return lag * step
