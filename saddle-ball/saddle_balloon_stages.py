# Saddle escape in stages — the climbing-ceiling version
#
# The canopy rises like a staircase: the balloon starts trapped in the
# lowest pocket, slips sideways, rises to a second pocket — where it is
# caught AGAIN behind a lopsided barrier (walled on the side it arrives on,
# open on the other) — weaves across, climbs around the far side, and
# finally settles under the highest dome. Three stages, one balloon, pure
# physics from frame 1.
#
# Use: open Blender -> Scripting tab -> open this file -> Run Script.
# Then press Spacebar to play. Before rendering (Ctrl+F12), play the
# animation through once so the physics cache is filled.

import bpy
import math

# ---------------------------------------------------------- the rising canopy

def base_height(x, y):
    tilt    = -0.34 * x                      # the whole world climbs to the right
    confine = 0.06 * y * y                   # gentle side walls
    b1      = 1.9 * math.exp(-(x + 1.4) ** 2 / 0.5 - y * y / 0.45)
    b2      = 2.1 * math.exp(-(x - 1.8) ** 2 / 0.5 - (y + 0.9) ** 2 / 2.0)
    # the middle section leans a little toward the open (+y) side, so the
    # weave from the walled side to the open channel never stalls
    lean    = -0.15 * y * math.exp(-(x - 0.6) ** 2 / 1.2)
    well    = -1.3 * math.exp(-((x - 4.8) ** 2 + y * y) / 0.6)
    wallx   = 0.30 * max(0.0, x - 5.4) ** 2 + 0.30 * max(0.0, -4.2 - x) ** 2
    return tilt + confine + b1 + b2 + lean + well + wallx

def height(x, y):          # canopy coordinates: up is up
    return -base_height(x, y)

X_MIN, X_MAX = -4.6, 6.4
Y_MIN, Y_MAX = -3.2, 3.2

# first pocket: where the tilt's pull balances barrier 1's skirt
def slope_x(x):
    e = 1e-4
    return (base_height(x + e, 0) - base_height(x - e, 0)) / (2 * e)

lo, hi = -4.0, -1.5
for _ in range(60):
    mid = 0.5 * (lo + hi)
    if slope_x(mid) < 0:
        lo = mid
    else:
        hi = mid
SADDLE_X = 0.5 * (lo + hi)

BALL_R     = 0.55
BALL_START = (SADDLE_X, -0.15)  # a hair off the crest so it slips out on its own
FRAME_END  = 540
FPS        = 30

# ---------------------------------------------------------------- fresh scene

for coll in (bpy.data.objects, bpy.data.meshes, bpy.data.curves,
             bpy.data.materials, bpy.data.cameras, bpy.data.worlds):
    for block in list(coll):
        coll.remove(block)

scene = bpy.context.scene
scene.frame_start, scene.frame_end = 1, FRAME_END
scene.render.fps = FPS
scene.gravity = (0.0, 0.0, 9.81)          # buoyancy: "gravity" points up

# a soft sky: pale at the horizon, bluer overhead
world = bpy.data.worlds.new("Sky")
world.use_nodes = True
wnt = world.node_tree
wnt.nodes.clear()
tc = wnt.nodes.new("ShaderNodeTexCoord")
sep = wnt.nodes.new("ShaderNodeSeparateXYZ")
ramp = wnt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].position = 0.0
ramp.color_ramp.elements[0].color = (0.82, 0.90, 0.96, 1)
ramp.color_ramp.elements[1].position = 1.0
ramp.color_ramp.elements[1].color = (0.35, 0.57, 0.84, 1)
bg = wnt.nodes.new("ShaderNodeBackground")
wout = wnt.nodes.new("ShaderNodeOutputWorld")
wnt.links.new(tc.outputs["Window"], sep.inputs["Vector"])
wnt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
wnt.links.new(ramp.outputs["Color"], bg.inputs["Color"])
wnt.links.new(bg.outputs["Background"], wout.inputs["Surface"])
scene.world = world

def flat_material(name, rgb):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*rgb, 1)
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(em.outputs["Emission"], out.inputs["Surface"])
    return mat

MAT_PAPER = flat_material("Paper", (1, 1, 1))
MAT_GRID  = flat_material("Grid",  (0.5, 0.5, 0.5))
MAT_LINE  = flat_material("Slice", (0.05, 0.05, 0.05))
MAT_BALL  = flat_material("Ball",  (0.75, 0.05, 0.02))

def link(obj):
    scene.collection.objects.link(obj)
    return obj

# -------------------------------------------------- smooth canopy (collision)

STEP = 0.05
nx = int(round((X_MAX - X_MIN) / STEP)) + 1
ny = int(round((Y_MAX - Y_MIN) / STEP)) + 1
verts = [(X_MIN + i * STEP, Y_MIN + j * STEP, height(X_MIN + i * STEP, Y_MIN + j * STEP))
         for j in range(ny) for i in range(nx)]
faces = [(j * nx + i, j * nx + i + 1, (j + 1) * nx + i + 1, (j + 1) * nx + i)
         for j in range(ny - 1) for i in range(nx - 1)]

mesh = bpy.data.meshes.new("Surface")
mesh.from_pydata(verts, [], faces)
for p in mesh.polygons:
    p.use_smooth = True
mesh.materials.append(MAT_PAPER)
surface = link(bpy.data.objects.new("Surface", mesh))

# ------------------------------------------------------ grid lines and slice
# lines hang slightly BELOW the canopy so they are visible from underneath

def add_polyline(name, pts, radius, mat, lift=-0.012):
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.materials.append(mat)
    sp = cu.splines.new("POLY")
    sp.points.add(len(pts) - 1)
    for p, (x, y) in zip(sp.points, pts):
        p.co = (x, y, height(x, y) + lift, 1)
    return link(bpy.data.objects.new(name, cu))

SAMPLE = 0.06
xs = [X_MIN + i * SAMPLE for i in range(int((X_MAX - X_MIN) / SAMPLE) + 1)]
ys = [Y_MIN + i * SAMPLE for i in range(int((Y_MAX - Y_MIN) / SAMPLE) + 1)]

GRID = 0.35
n_iso_y = int((Y_MAX - Y_MIN) / GRID)                 # iso-y lines, offset so none sits at y=0
for k in range(n_iso_y):
    y0 = Y_MIN + (k + 0.5) * GRID
    add_polyline(f"grid_y{k}", [(x, y0) for x in xs], 0.010, MAT_GRID)
n_iso_x = int((X_MAX - X_MIN) / GRID) + 1
for k in range(n_iso_x):
    x0 = X_MIN + k * GRID
    add_polyline(f"grid_x{k}", [(x0, y) for y in ys], 0.010, MAT_GRID)

add_polyline("slice", [(x, 0.0) for x in xs], 0.045, MAT_LINE, lift=-0.02)  # the rising zigzag

# ---------------------------------------------------------------- the balloon

# released a little below the canopy: the pocket curves tighter than the
# balloon, so a snug start would bury its flanks in the pocket walls
bpy.ops.mesh.primitive_uv_sphere_add(
    radius=BALL_R, segments=48, ring_count=24,
    location=(BALL_START[0], BALL_START[1],
              height(*BALL_START) - BALL_R - 0.15))
ball = bpy.context.active_object
ball.name = "Balloon"
for p in ball.data.polygons:
    p.use_smooth = True
ball.data.materials.append(MAT_BALL)

# ------------------------------------------- string, knot, and a few clouds

anchor = link(bpy.data.objects.new("Anchor", None))
con = anchor.constraints.new("COPY_LOCATION")
con.target = ball

MAT_STRING = flat_material("String", (0.033, 0.033, 0.033))
MAT_KNOT   = flat_material("Knot",   (0.45, 0.02, 0.01))

string_cu = bpy.data.curves.new("String", "CURVE")
string_cu.dimensions = "3D"
string_cu.bevel_depth = 0.012
string_cu.bevel_resolution = 3
string_cu.materials.append(MAT_STRING)
sp = string_cu.splines.new("POLY")
N = 12
sp.points.add(N - 1)
for i, p in enumerate(sp.points):
    t = i / (N - 1)
    p.co = (0.18 * t * t, 0.0, -(BALL_R + 0.02) - 1.35 * t, 1)
string = link(bpy.data.objects.new("String", string_cu))
string.parent = anchor

bpy.ops.mesh.primitive_uv_sphere_add(radius=0.09, segments=24, ring_count=12,
                                     location=(0, 0, -(BALL_R + 0.02)))
knot = bpy.context.active_object
knot.name = "Knot"
knot.scale = (1, 1, 0.7)
for p in knot.data.polygons:
    p.use_smooth = True
knot.data.materials.append(MAT_KNOT)
knot.parent = anchor
knot.location = (0, 0, -(BALL_R + 0.02))

MAT_CLOUD = flat_material("Cloud", (1, 1, 1))

def add_cloud(x, y, z, s=1.0):
    for dx, r in ((-0.55, 0.42), (0.0, 0.60), (0.60, 0.45)):
        bpy.ops.mesh.primitive_uv_sphere_add(radius=r * s, segments=24,
                                             ring_count=12,
                                             location=(x + dx * s, y, z))
        puff = bpy.context.active_object
        puff.scale = (1, 1, 0.65)
        for p in puff.data.polygons:
            p.use_smooth = True
        puff.data.materials.append(MAT_CLOUD)

add_cloud(-6.4, 0.5, 0.2, 1.0)
add_cloud(0.3, 1.8, -5.6, 1.2)
add_cloud(8.6, 0.5, -2.0, 0.8)

# -------------------------------------------------------------------- physics

def add_rigidbody(obj, kind):
    bpy.ops.object.select_all(action="DESELECT")
    bpy.context.view_layer.objects.active = obj
    obj.select_set(True)
    bpy.ops.rigidbody.object_add(type=kind)

add_rigidbody(surface, "PASSIVE")
surface.rigid_body.collision_shape = "MESH"
surface.rigid_body.friction = 0.8
surface.rigid_body.restitution = 0.0
surface.rigid_body.use_margin = True
surface.rigid_body.collision_margin = 0.002

add_rigidbody(ball, "ACTIVE")
rb = ball.rigid_body
rb.collision_shape = "SPHERE"
rb.mass = 1.2
rb.friction = 0.8
rb.restitution = 0.0
rb.linear_damping = 0.45
rb.angular_damping = 0.9
rb.use_margin = True
rb.collision_margin = 0.002

# sleeping stays off through both escapes, then is enabled near the end so
# the balloon comes truly to rest under the dome
rb.use_deactivation = False
rb.deactivate_linear_velocity = 0.6
rb.deactivate_angular_velocity = 0.8
rb.keyframe_insert("use_deactivation", frame=1)
rb.keyframe_insert("use_deactivation", frame=470)
rb.use_deactivation = True
rb.keyframe_insert("use_deactivation", frame=471)

rbw = scene.rigidbody_world
rbw.substeps_per_frame = 30
rbw.solver_iterations = 20
rbw.point_cache.frame_start = 1
rbw.point_cache.frame_end = FRAME_END

# --------------------------------------------------------------------- camera

target = link(bpy.data.objects.new("Target", None))
target.location = (0.9, 0.0, 0.4)
pivot = link(bpy.data.objects.new("Pivot", None))
pivot.location = (0.9, 0.0, 0.4)

cam = link(bpy.data.objects.new("Camera", bpy.data.cameras.new("Camera")))
cam.data.lens = 40
cam.parent = pivot
tt = cam.constraints.new("TRACK_TO")
tt.target = target
tt.track_axis = "TRACK_NEGATIVE_Z"
tt.up_axis = "UP_Y"
scene.camera = cam

def cam_key(frame, orbit_deg, cam_h):
    pivot.rotation_euler = (0, 0, math.radians(orbit_deg))
    pivot.keyframe_insert("rotation_euler", frame=frame)
    cam.location = (0, -12.3, cam_h)
    cam.keyframe_insert("location", frame=frame)

cam_key(1, 0, -3.4)
cam_key(80, 0, -3.4)
cam_key(210, 50, -5.6)
cam_key(FRAME_END, 58, -6.0)

# --------------------------------------------------------------------- render

scene.render.engine = "CYCLES"
scene.cycles.samples = 16
scene.cycles.max_bounces = 0
scene.cycles.use_denoising = False
scene.view_settings.view_transform = "Standard"
scene.render.resolution_x = 720
scene.render.resolution_y = 720
scene.render.film_transparent = False

print(f"Scene built. First pocket at x = {SADDLE_X:.3f}. "
      "Press Spacebar to play; the balloon climbs in stages.")
