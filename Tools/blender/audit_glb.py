#!/usr/bin/env python3
# audit_glb.py - REQ-G2-001 Blender audit of every GLB under SourceAssets/models (HELLFALL, Gate 2).
#
# Runs headless inside Blender 5.x from the repo root:
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup ^
#       --python Tools/blender/audit_glb.py -- Docs/audit/blender_audit_2026-09-07.json [options]
#
# Options after the "--":
#   <out.json>                 required, output path (parent directory is created)
#   --models-dir <dir>         default SourceAssets/models (relative to the repo root = cwd)
#   --node-audit <jsonl>       default Docs/audit/glb_audit.jsonl; cross-checked when present
#   --previews <dir>           also render orthographic Workbench views (front / side / top) per model
#   --only <substring>         audit only files whose relative path contains the substring (debugging)
#
# Per file (records sorted by relative path): evaluated world-space bounds of the SUBJECT meshes with every armature
# in REST pose (rigged demons are measured as skinned meshes, not as their raw bind buffers), triangle / vertex counts
# of the evaluated meshes, materials, images (pixel size), armature + bone count, animation actions with frame
# ranges, origin-at-floor test, Y-up -> Z-up conversion test against the raw glTF header, duplicate-face count from
# the raw index buffer (explains importer-vs-parser triangle differences exactly), the dominant up-facing surface
# (table / counter top height), a low-slice footprint, and the REQ-G2-001 ruling for the slot: Unreal name, class,
# class budget, pivot rule and the real-world target size in cm derived from ONE driving dimension so the target
# keeps the model's own proportions (uniform scale only - Meshy textures smear under non-uniform scale).
#
# "Subject" = the asset itself. The Blender importer (bone_heuristic BLENDER) adds an "Icosphere" mesh as the bone
# custom-shape widget of every armature; it is not in the GLB and is excluded from the measurements (listed under
# importer_artifacts). Never aborts the batch: every file is wrapped in try/except and errors are recorded.
# The SLOTS table below IS the recorded REQ-G2-001 ruling; change it, re-run, and the JSON follows.

import array
import datetime
import json
import os
import struct
import sys
import traceback

try:
    import bpy  # noqa: F401
    from mathutils import Vector
except ImportError:  # pragma: no cover
    print("run inside Blender: blender --background --factory-startup --python audit_glb.py -- out.json")
    sys.exit(2)

BUDGETS = {"hero_weapon": 25000, "enemy": 15000, "human_prop": 10000, "large_furniture": 8000, "small_prop": 4000}
BUDGET_TOLERANCE = 0.20  # spec: 20 % over budget tolerated

# drive = (mode, cm): "z"/"x"/"y" scale that measured extent to cm; "surface" puts the dominant up-facing surface
# (largest horizontal face area above the bottom 5 % of the height) at that many cm above the mesh bottom.
SLOTS = {
    "reception_desk": dict(unreal="SM_ReceptionDesk", cls="large_furniture", pivot="floor", drive=("surface", 75),
        note="One mesh: desk block + chair behind + monitor + cup + a fallen item. The chair back rises above the "
             "work surface, so the surface is DESK height (75), not a standing counter; the monitor top sets the "
             "overall height. Reused as the CEO desk (spec)."),
    "kitchen_lunch_table": dict(unreal="SM_KitchenLunchTable", cls="large_furniture", pivot="floor", drive=("surface", 75),
        note="Round pedestal table with TWO chairs (not four) and cups / a tray on top, one mesh. Table top at 75; "
             "the chair backs (tallest element) follow. 'One chair pushed out' is a blockout note, not a second mesh."),
    "refrigerator_open": dict(unreal="SM_RefrigeratorOpen", cls="large_furniture", pivot="floor", drive=("z", 180),
        note="Domestic fridge 180 tall; the door is modelled swung open ~90 deg, which is what the depth includes."),
    "bathroom_vanity": dict(unreal="SM_BathroomVanity", cls="large_furniture", pivot="floor", drive=("surface", 85),
        note="Three-basin vanity with three taps, one mesh. Counter surface at 85; the taps set the overall height. "
             "Floor-standing, back face flush to the wall."),
    "toilet_bowl": dict(unreal="SM_ToiletBowl", cls="small_prop", pivot="wall", drive=("x", 40),
        note="NOT a floor toilet: a wall-hung bowl with exposed plumbing (drain pipe down and back into the wall, "
             "flush valve on top), no tank, no pedestal - hence the near-cubic raw bounds. Bowl width 40 is the "
             "anchor; rim lands ~40 above the box bottom, so hang the box with its bottom at z ~2."),
    "mop_and_bucket": dict(unreal="SM_MopAndBucket", cls="small_prop", pivot="floor", drive=("z", 150),
        note="Wringer bucket + leaning mop + a 'wet floor' A-frame sign, one mesh. Mop handle top at 150 gives a "
             "~86 bucket/wringer and a ~67 sign, both real-world."),
    "ceo_couch_coffee_table": dict(unreal="SM_CeoCouchCoffeeTable", cls="large_furniture", pivot="floor", drive=("z", 80),
        note="L-set in one mesh: 3-seat sofa, perpendicular 2-seat loveseat, rectangular coffee table in front of the "
             "sofa (the table sits in front of the sofa, not between the two couches). Sofa back 80 tall -> "
             "~215 sofa, ~160 loveseat, ~120 x 70 table."),
    "closed_door": dict(unreal="SM_ClosedDoor", cls="small_prop", pivot="wall", drive=("z", 220),
        note="Panel with casing. 220 tall fills the frozen 120 x 220 opening height; at the model's 0.46 aspect it is "
             "~102 wide, so the greybox jamb fills ~9 cm each side. Stretching to 120 wide rejected (texture smear)."),
    "broken_door": dict(unreal="SM_BrokenDoor", cls="small_prop", pivot="floor", drive=("x", 205),
        note="Leaf lying flat with knob and hinge stubs at one end. Long axis = 205 leaf height; width (~106, the "
             "model is wider than a real 90 leaf) and thickness follow."),
    "closed_elevator": dict(unreal="SM_ClosedElevator", cls="small_prop", pivot="wall", drive=("z", 220),
        note="Two sliding panels in a surround, aspect 0.61: a narrow single car. 220 tall matches the frozen "
             "elevator_doors blocker (200 x 220) and gives ~134 wide, centred in the 200 blocker with the greybox "
             "filling the flanks. Scaling to 200 wide would be 327 tall (> 310 ceiling) - rejected."),
    "shotgun": dict(unreal="SM_Shotgun", cls="hero_weapon", pivot="muzzle", drive=("x", 120),
        note="Pump shotgun 120 long (28in-barrel class); height (stock drop + pump) and width follow. Same mesh for "
             "viewmodel and world pickup; pivot muzzle-back-along-barrel per REQ-G4-001."),
    "man_sitting": dict(unreal="SM_ManSitting", cls="human_prop", pivot="floor", drive=("z", 85),
        note="Seated on the floor, leaning back on his hands / the racks, legs out, head tilted back: crown at 85. "
             "Legs reach ~143 from the back plane - fits the 430 closet in front of the 60-deep racks."),
    "intern_sitting": dict(unreal="SM_InternSitting", cls="human_prop", pivot="floor", drive=("z", 90),
        note="Seated on the floor, knees drawn up, arms around the knees, head down on the knees (hair volume adds "
             "to the top): crown at 90; ~50 wide, ~85 back-to-toes. Back to a wall."),
    "fallen_security_guard": dict(unreal="SM_FallenSecurityGuard", cls="human_prop", pivot="floor", drive=("z", 82),
        note="NOT prone: a seated slump - back against a wall, legs straight out, chin on chest (the 1 : 2 height : "
             "length ratio). Crown at 82 -> legs project ~160 from the wall. Placed along a 280 corridor wall he "
             "would leave ~120 clear (< 216 minimum), so the blockout must seat him in a recess / bay or across a "
             "corridor end; flagged for the blockout designer."),
    "ceo_dead": dict(unreal="SM_CeoDead", cls="human_prop", pivot="floor", drive=("y", 170),
        note="On his back, arms spread, knees bent and folded to one side, so the long axis is shorter than stature: "
             "170 along the body for a ~180 man; ~105 across the arms, ~48 thick at the knees."),
    "ember_demon": dict(unreal="SK_EmberDemon", cls="enemy", pivot="floor", drive=("z", 220),
        note="Demon #1, 220 tall (spec capsule 220 / radius 45 in Data/floorplan.json encounters.demon_1). Rest pose "
             "is a wings-spread A-pose, so width is wingtip to wingtip. Feet already at z = 0 in the file."),
    "crimson_hellfiend": dict(unreal="SK_CrimsonHellfiend", cls="enemy", pivot="floor", drive=("z", 300),
        note="Demon #2, visibly larger: 300 tall (spec capsule 300 / radius 60 in encounters.demon_2). Rest pose is "
             "a T/A-pose with wings; feet at z = 0 in the file."),
}

REJECTED = [
    {"file": "characters/crimson_hellfiend_texture_0_1.png", "disposition": "rejected - duplicate",
     "reason": "byte-identical to crimson_hellfiend_texture_0.png (same size, same MD5); the embedded copy inside "
               "the GLB is the one that travels with the mesh (the GLB carries texture_0 and texture_0.001, both "
               "1024 x 1024)"},
]

AXES = "xyz"
COMP_FMT = {5120: "b", 5121: "B", 5122: "h", 5123: "H", 5125: "I", 5126: "f"}
COMP_SIZE = {5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4}
NUM = {"SCALAR": 1, "VEC2": 2, "VEC3": 3, "VEC4": 4, "MAT4": 16}


def log(msg):
    print("[audit_glb] " + str(msg), flush=True)


def parse_args(argv):
    args = {"out": None, "models_dir": "SourceAssets/models", "node_audit": "Docs/audit/glb_audit.jsonl",
            "previews": None, "only": None}
    argv = argv[argv.index("--") + 1:] if "--" in argv else []
    i = 0
    while i < len(argv):
        a = argv[i]
        if a in ("--models-dir", "--node-audit", "--previews", "--only"):
            args[a[2:].replace("-", "_")] = argv[i + 1]; i += 2
        elif args["out"] is None:
            args["out"] = a; i += 1
        else:
            raise SystemExit("unexpected argument %r" % a)
    if not args["out"]:
        raise SystemExit("usage: blender --background --factory-startup --python audit_glb.py -- <out.json> "
                         "[--models-dir d] [--node-audit f] [--previews d] [--only s]")
    return args


def find_glbs(root):
    out = []
    for dirpath, _dirs, files in os.walk(root):
        for f in files:
            if f.lower().endswith(".glb"):
                out.append(os.path.relpath(os.path.join(dirpath, f), root).replace(os.sep, "/"))
    return sorted(out)


# ---------------------------------------------------------------------------------------------------- raw GLB header
def read_glb(path):
    with open(path, "rb") as fh:
        buf = fh.read()
    magic, _version, _length = struct.unpack_from("<4sII", buf, 0)
    if magic != b"glTF":
        raise ValueError("not a GLB (magic %r)" % magic)
    jlen, _jtype = struct.unpack_from("<II", buf, 12)
    doc = json.loads(buf[20:20 + jlen].decode("utf-8"))
    bin_off = 20 + jlen
    blen, btype = struct.unpack_from("<II", buf, bin_off)
    binchunk = buf[bin_off + 8: bin_off + 8 + blen] if btype == 0x004E4942 else b""
    return doc, binchunk


def read_accessor(doc, binchunk, idx):
    a = doc["accessors"][idx]
    bv = doc["bufferViews"][a["bufferView"]]
    n = NUM[a["type"]]; fmt = COMP_FMT[a["componentType"]]; csz = COMP_SIZE[a["componentType"]]
    base = bv.get("byteOffset", 0) + a.get("byteOffset", 0)
    stride = bv.get("byteStride", 0) or n * csz
    if stride == n * csz:
        arr = array.array(fmt)
        arr.frombytes(binchunk[base: base + a["count"] * n * csz])
        return arr, n
    out = array.array(fmt)
    for i in range(a["count"]):
        out.extend(struct.unpack_from("<%d%s" % (n, fmt), binchunk, base + i * stride))
    return out, n


def degenerate_triangles(doc, binchunk):
    """Faces Blender's mesh validation drops on import: triangles with a repeated index, and DUPLICATE faces (a
    second triangle over the same three vertices, either winding - glTF-Transform's decimation leaves these as
    two-sided sheets, e.g. hair cards). Zero-area triangles with distinct indices are counted but kept by Blender."""
    dup_index = 0; dup_face = 0; dup_face_same_winding = 0; zero = 0; total = 0
    for m in doc.get("meshes", []):
        for p in m.get("primitives", []):
            if p.get("mode", 4) != 4:
                continue
            pos, _n = read_accessor(doc, binchunk, p["attributes"]["POSITION"])
            idx = read_accessor(doc, binchunk, p["indices"])[0] if "indices" in p else array.array("I", range(len(pos) // 3))
            seen_any = set(); seen_wind = set()
            for t in range(0, len(idx) - 2, 3):
                a, b, c = idx[t], idx[t + 1], idx[t + 2]
                total += 1
                if a == b or b == c or a == c:
                    dup_index += 1; continue
                key = tuple(sorted((a, b, c)))
                if key in seen_any:
                    dup_face += 1
                else:
                    seen_any.add(key)
                rots = ((a, b, c), (b, c, a), (c, a, b))
                if any(r in seen_wind for r in rots):
                    dup_face_same_winding += 1
                else:
                    seen_wind.add(rots[0])
                ax, ay, az = pos[3 * a: 3 * a + 3]; bx, by, bz = pos[3 * b: 3 * b + 3]; cx, cy, cz = pos[3 * c: 3 * c + 3]
                ux, uy, uz = bx - ax, by - ay, bz - az; vx, vy, vz = cx - ax, cy - ay, cz - az
                nx, ny, nz = uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx
                if nx * nx + ny * ny + nz * nz < 1e-24:
                    zero += 1
    return {"triangles": total, "duplicate_index": dup_index, "duplicate_face_any_winding": dup_face,
            "duplicate_face_same_winding": dup_face_same_winding, "zero_area_distinct_index": zero,
            "dropped_by_blender_import": dup_index + dup_face}


def gltf_header_facts(doc, binchunk):
    """Scene-graph bounds from accessor min/max through node TRS (the Tools/glb_audit.mjs method), glTF Y-up axes."""
    def trs(n):
        if "matrix" in n:
            return list(n["matrix"])
        t = n.get("translation", [0, 0, 0]); q = n.get("rotation", [0, 0, 0, 1]); s = n.get("scale", [1, 1, 1])
        x, y, z, w = q
        m = [1 - 2 * (y * y + z * z), 2 * (x * y + z * w), 2 * (x * z - y * w), 0,
             2 * (x * y - z * w), 1 - 2 * (x * x + z * z), 2 * (y * z + x * w), 0,
             2 * (x * z + y * w), 2 * (y * z - x * w), 1 - 2 * (x * x + y * y), 0, t[0], t[1], t[2], 1]
        for c in range(3):
            m[c] *= s[0]; m[4 + c] *= s[1]; m[8 + c] *= s[2]
        return m

    def mul(a, b):
        return [sum(a[k * 4 + i] * b[j * 4 + k] for k in range(4)) for j in range(4) for i in range(4)]

    def xf(m, v):
        return [m[0] * v[0] + m[4] * v[1] + m[8] * v[2] + m[12], m[1] * v[0] + m[5] * v[1] + m[9] * v[2] + m[13],
                m[2] * v[0] + m[6] * v[1] + m[10] * v[2] + m[14]]

    mn = [1e9] * 3; mx = [-1e9] * 3
    nodes = doc.get("nodes", []); acc = doc.get("accessors", []); meshes = doc.get("meshes", [])
    skinned = []

    def visit(ni, parent):
        n = nodes[ni]; m = mul(parent, trs(n))
        if "mesh" in n:
            if "skin" in n:
                skinned.append(n.get("name", "node%d" % ni))
            for p in meshes[n["mesh"]].get("primitives", []):
                a = acc[p["attributes"]["POSITION"]]
                if "min" in a and "max" in a:
                    for cx in (a["min"][0], a["max"][0]):
                        for cy in (a["min"][1], a["max"][1]):
                            for cz in (a["min"][2], a["max"][2]):
                                w = xf(m, [cx, cy, cz])
                                for i in range(3):
                                    mn[i] = min(mn[i], w[i]); mx[i] = max(mx[i], w[i])
        for c in n.get("children", []):
            visit(c, m)

    ident = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]
    for ni in doc.get("scenes", [{}])[doc.get("scene", 0)].get("nodes", []):
        visit(ni, ident)
    tris = 0
    for m in meshes:
        for p in m.get("primitives", []):
            n = acc[p["indices"]]["count"] if "indices" in p else acc[p["attributes"]["POSITION"]]["count"]
            mode = p.get("mode", 4)
            tris += n // 3 if mode == 4 else (n - 2 if mode in (5, 6) else 0)
    raw_pos = []
    for m in meshes:
        for p in m.get("primitives", []):
            a = acc[p["attributes"]["POSITION"]]
            if "min" in a and "max" in a:
                raw_pos.append({"min": a["min"], "max": a["max"], "size": [a["max"][i] - a["min"][i] for i in range(3)]})
    facts = {
        "generator": doc.get("asset", {}).get("generator", ""), "gltf_version": doc.get("asset", {}).get("version", ""),
        "extensions_used": doc.get("extensionsUsed", []), "nodes": len(nodes), "meshes": len(meshes),
        "mesh_node_names": [n.get("name") for n in nodes if "mesh" in n],
        "skins": len(doc.get("skins", [])), "joints": sum(len(s.get("joints", [])) for s in doc.get("skins", [])),
        "skinned_mesh_nodes": skinned, "animations": [a.get("name", "(unnamed)") for a in doc.get("animations", [])],
        "images": len(doc.get("images", [])), "materials": len(doc.get("materials", [])),
        "tris_from_indices": tris,
        "size_yup_m": [round(mx[i] - mn[i], 4) for i in range(3)] if mx[0] > -1e8 else None,
        "min_yup_m": [round(v, 4) for v in mn] if mx[0] > -1e8 else None,
        "raw_position_accessor_bounds_m": raw_pos,
        "bounds_method": "accessor min/max through node TRS - wrong for skinned meshes, whose node transform glTF "
                         "says to ignore (bind buffers already in metres, armature node scale 0.01)",
        "degenerate": degenerate_triangles(doc, binchunk),
    }
    return facts


# ------------------------------------------------------------------------------------------------------- Blender side
def ensure_importer():
    if hasattr(bpy.ops.import_scene, "gltf"):
        how = "bpy.ops.import_scene.gltf present at startup (bundled io_scene_gltf2 core add-on, --factory-startup)"
    else:
        import addon_utils
        addon_utils.enable("io_scene_gltf2", default_set=False)
        how = "enabled io_scene_gltf2 through addon_utils.enable()"
    try:
        import io_scene_gltf2
        ver = getattr(io_scene_gltf2, "bl_info", {}).get("version")
        if ver is None:
            import addon_utils
            ver = addon_utils.module_bl_info(io_scene_gltf2).get("version")
        how += "; io_scene_gltf2 %s" % (".".join(str(v) for v in ver) if ver else "version unknown")
    except Exception as exc:  # pragma: no cover
        how += "; version lookup failed: %s" % exc
    return how


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.armatures):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def force_rest_pose():
    cleared = []
    for ob in bpy.data.objects:
        ad = ob.animation_data
        if ad is not None:
            if ad.action is not None:
                cleared.append([ob.name, ad.action.name]); ad.action = None
            for tr in ad.nla_tracks:
                tr.mute = True
        if ob.type == "ARMATURE":
            for pb in ob.pose.bones:
                pb.location = (0.0, 0.0, 0.0); pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
                pb.rotation_euler = (0.0, 0.0, 0.0); pb.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()
    return cleared


def importer_artifacts():
    """Mesh objects the importer created for itself (bone custom shapes) - never part of the asset."""
    shapes = set()
    for ob in bpy.data.objects:
        if ob.type == "ARMATURE":
            for pb in ob.pose.bones:
                if pb.custom_shape is not None:
                    shapes.add(pb.custom_shape.name)
    return shapes


def bbox(points):
    mn = Vector((1e9, 1e9, 1e9)); mx = Vector((-1e9, -1e9, -1e9))
    for p in points:
        for i in range(3):
            if p[i] < mn[i]: mn[i] = p[i]
            if p[i] > mx[i]: mx[i] = p[i]
    return mn, mx


def bounds_dict(mn, mx):
    return {"min": [round(v, 4) for v in mn], "max": [round(v, 4) for v in mx], "size": [round(v, 4) for v in (mx - mn)]}


def measure(rel, abs_path, header):
    rec = {"file": rel, "bytes": os.path.getsize(abs_path), "header": header, "errors": []}
    reset_scene()
    rec["import_result"] = list(bpy.ops.import_scene.gltf(filepath=abs_path))
    rec["rest_pose_cleared_actions"] = force_rest_pose()
    dg = bpy.context.evaluated_depsgraph_get(); dg.update()
    artifacts = importer_artifacts()
    objects = list(bpy.data.objects)
    rec["objects"] = [{"name": o.name, "type": o.type, "parent": o.parent.name if o.parent else None,
                       "location_m": [round(v, 5) for v in o.matrix_world.translation],
                       "scale": [round(v, 5) for v in o.matrix_world.to_scale()],
                       "modifiers": [m.type for m in getattr(o, "modifiers", [])],
                       "importer_artifact": o.name in artifacts} for o in objects]
    rec["importer_artifacts"] = sorted(artifacts)
    per_obj = []; subject_pts = []; subject_tris = 0; subject_verts = 0; subject_polys = 0
    raw_pts = []; surface_bins = {}
    for o in objects:
        if o.type != "MESH":
            continue
        eo = o.evaluated_get(dg); me = eo.to_mesh()
        try:
            mw = eo.matrix_world
            pts = [mw @ v.co for v in me.vertices]
            tris = sum(len(p.vertices) - 2 for p in me.polygons)
            mn, mx = bbox(pts) if pts else (Vector((0, 0, 0)), Vector((0, 0, 0)))
            per_obj.append({"name": o.name, "tris": tris, "verts": len(me.vertices), "polygons": len(me.polygons),
                            "armature_deformed": any(m.type == "ARMATURE" for m in o.modifiers),
                            "importer_artifact": o.name in artifacts, "bounds_rest_m": bounds_dict(mn, mx)})
            if o.name in artifacts:
                continue
            subject_pts.extend(pts); subject_tris += tris; subject_verts += len(me.vertices); subject_polys += len(me.polygons)
            s = mw.to_scale(); area_scale = (s.x * s.y * s.z) ** (2.0 / 3.0)
            rot = mw.to_3x3().normalized()
            for p in me.polygons:
                nz = (rot @ p.normal).z
                if nz > 0.9:
                    zc = (mw @ p.center).z
                    surface_bins.setdefault(round(zc, 2), 0.0)
                    surface_bins[round(zc, 2)] += p.area * area_scale
        finally:
            eo.to_mesh_clear()
        if o.name not in artifacts:
            raw_pts.extend(o.matrix_world @ v.co for v in o.data.vertices)
    if not subject_pts:
        rec["errors"].append("no subject mesh vertices after import"); return rec
    mn, mx = bbox(subject_pts); size = mx - mn
    rmn, rmx = bbox(raw_pts)
    rec["mesh_objects"] = per_obj
    rec["subject_mesh_objects"] = [p["name"] for p in per_obj if not p["importer_artifact"]]
    rec["tris"] = subject_tris; rec["polygons"] = subject_polys; rec["verts"] = subject_verts
    rec["tris_including_importer_artifacts"] = sum(p["tris"] for p in per_obj)
    rec["bounds_rest_m"] = bounds_dict(mn, mx)
    rec["bounds_undeformed_m"] = bounds_dict(rmn, rmx)
    longest = max(size)
    rec["normalized_longest_axis_m"] = round(longest, 4)
    rec["normalized_longest_axis"] = AXES[list(size).index(longest)]
    tol = max(0.01, 0.01 * size.z)
    rec["origin_at_floor"] = abs(mn.z) <= tol
    rec["min_z_m"] = round(mn.z, 4)
    rec["bbox_centre_m"] = [round(v, 4) for v in (mn + mx) * 0.5]
    rec["object_origin_at_bbox_centre_xy"] = all(abs(((mn + mx) * 0.5)[i]) <= 0.01 for i in range(2))
    zcut = mn.z + 0.10 * size.z
    lo = [p for p in subject_pts if p.z <= zcut]
    if lo:
        lx = [p.x for p in lo]; ly = [p.y for p in lo]
        rec["low_slice_footprint_m"] = {"size": [round(max(lx) - min(lx), 4), round(max(ly) - min(ly), 4)],
                                        "min": [round(min(lx), 4), round(min(ly), 4)],
                                        "max": [round(max(lx), 4), round(max(ly), 4)], "verts": len(lo)}
    # dominant up-facing surfaces (2 cm bins, above the bottom 5 % of the height)
    floor_cut = mn.z + 0.05 * size.z
    bands = sorted(((z, a) for z, a in surface_bins.items() if z > floor_cut), key=lambda t: -t[1])[:3]
    rec["up_facing_surfaces_m"] = [{"z_world": z, "z_above_bottom": round(z - mn.z, 4), "area_m2": round(a, 5),
                                    "fraction_of_height": round((z - mn.z) / size.z, 3)} for z, a in bands]
    # Y-up -> Z-up: Blender (x, y, z) extent must equal glTF (x, z, y) extent; skinned meshes only up to the uniform
    # armature scale the header method mis-applies, so for them the axis ORDER is checked (equal ratios).
    hs = header.get("size_yup_m")
    if hs:
        expect = [hs[0], hs[2], hs[1]]
        ref = rec["bounds_undeformed_m"]["size"]
        if header.get("skinned_mesh_nodes"):
            ratios = [ref[i] / expect[i] if expect[i] else 0 for i in range(3)]
            spread = max(ratios) / min(ratios) - 1 if min(ratios) > 0 else 9e9
            rec["yup_to_zup"] = {"expected_size_from_header": [round(v, 4) for v in expect], "mode": "skinned: axis order "
                                 "checked up to a uniform scale", "blender_over_header_ratios": [round(r, 2) for r in ratios],
                                 "ratio_spread": round(spread, 4), "ok": spread <= 0.01}
        else:
            dev = [abs(ref[i] - expect[i]) / max(expect[i], 1e-6) for i in range(3)]
            rec["yup_to_zup"] = {"expected_size_from_header": [round(v, 4) for v in expect], "mode": "static: extents",
                                 "max_rel_dev": round(max(dev), 4), "ok": max(dev) <= 0.01}
    rec["materials"] = [m.name for m in bpy.data.materials]; rec["material_count"] = len(rec["materials"])
    imgs = [{"name": im.name, "size_px": list(im.size), "packed": im.packed_file is not None, "channels": im.channels}
            for im in bpy.data.images if im.name not in ("Render Result", "Viewer Node")]
    rec["images"] = imgs; rec["image_count"] = len(imgs)
    arms = [o for o in objects if o.type == "ARMATURE"]
    rec["armature"] = None
    if arms:
        a = arms[0]
        rec["armature"] = {"name": a.name, "bones": len(a.data.bones), "root_bones": [b.name for b in a.data.bones if b.parent is None],
                           "world_scale": [round(v, 5) for v in a.matrix_world.to_scale()], "armature_count": len(arms),
                           "deformed_mesh_objects": [o.name for o in objects if o.type == "MESH" and
                                                     any(m.type == "ARMATURE" for m in o.modifiers)],
                           "vertex_groups": sum(len(o.vertex_groups) for o in objects if o.type == "MESH" and o.name not in artifacts)}
    fps = max(bpy.context.scene.render.fps, 1)
    rec["actions"] = [{"name": ac.name, "frame_range": [round(ac.frame_range[0], 1), round(ac.frame_range[1], 1)],
                       "seconds_at_%d_fps" % fps: round((ac.frame_range[1] - ac.frame_range[0]) / fps, 2)}
                      for ac in bpy.data.actions]
    return rec


def decide(rec):
    stem = os.path.splitext(os.path.basename(rec["file"]))[0]
    slot = SLOTS.get(stem)
    if slot is None or "bounds_rest_m" not in rec:
        rec["decision"] = {"unreal_name": None, "disposition": "unassigned - no slot ruling for %s" % stem}; return
    size = rec["bounds_rest_m"]["size"]
    mode, cm = slot["drive"]
    if mode == "surface":
        surf = rec.get("up_facing_surfaces_m") or []
        if not surf:
            rec["decision"] = {"unreal_name": slot["unreal"], "disposition": "undecided - no up-facing surface found"}; return
        measured = surf[0]["z_above_bottom"]; anchor = "dominant up-facing surface %.3f m above the bottom" % measured
    else:
        measured = size[AXES.index(mode)]; anchor = "%s extent %.4f m" % (mode, measured)
    scale = (cm / 100.0) / measured if measured > 0 else 0.0
    target = [round(v * scale * 100.0, 1) for v in size]
    budget = BUDGETS[slot["cls"]]; tris = rec.get("tris", 0)
    rec["decision"] = {
        "unreal_name": slot["unreal"], "class": slot["cls"], "class_budget_tris": budget, "tris": tris,
        "budget_fits": tris <= budget, "budget_within_tolerance": tris <= budget * (1 + BUDGET_TOLERANCE),
        "budget_delta_pct": round((tris - budget) / budget * 100.0, 1), "pivot": slot["pivot"],
        "drive": {"mode": mode, "cm": cm, "measured_m": round(measured, 4), "anchor": anchor},
        "uniform_scale_factor": round(scale, 4),
        "target_size_cm": {"w": target[0], "d": target[1], "h": target[2]},
        "disposition": "kept", "note": slot["note"],
    }
    if mode == "surface":
        rec["decision"]["surface_height_cm"] = cm


def cross_check(records, node_path):
    """Against Tools/glb_audit.mjs (Docs/audit/glb_audit.jsonl): triangles and bounds within 1 %, axis-mapped."""
    if not node_path or not os.path.exists(node_path):
        return {"available": False, "path": node_path}
    node = {}
    with open(node_path, "r", encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                d = json.loads(line); node[d["file"]] = d
    rows = []
    for r in records:
        n = node.get(r["file"])
        if n is None or "bounds_rest_m" not in r:
            rows.append({"file": r["file"], "compared": False}); continue
        ns = n["sizeXYZ_m"]; expect = [ns[0], ns[2], ns[1]]
        rest = r["bounds_rest_m"]["size"]
        dev = max(abs(rest[i] - expect[i]) / max(expect[i], 1e-9) for i in range(3))
        tri_dev = abs(r["tris"] - n["tris"]) / max(n["tris"], 1)
        deg = r["header"].get("degenerate", {}).get("dropped_by_blender_import")
        rows.append({"file": r["file"], "compared": True, "node_tris": n["tris"], "blender_tris": r["tris"],
                     "tris_rel_dev": round(tri_dev, 5), "tris_agree_1pct": tri_dev <= 0.01,
                     "tris_difference": n["tris"] - r["tris"], "faces_blender_drops_on_import": deg,
                     "difference_explained_by_degenerates": deg is not None and (n["tris"] - r["tris"]) == deg,
                     "node_size_as_blender_xyz": [round(v, 4) for v in expect], "blender_rest_size": rest,
                     "bounds_rel_dev": round(dev, 4), "bounds_agree_1pct": dev <= 0.01,
                     "skinned": bool(r["header"].get("skinned_mesh_nodes")),
                     "node_verts": n.get("verts"), "blender_verts": r.get("verts")})
    cmp_rows = [x for x in rows if x.get("compared")]
    return {"available": True, "path": node_path, "rows": rows,
            "tris_disagreements": [x["file"] for x in cmp_rows if not x["tris_agree_1pct"]],
            "bounds_disagreements": [x["file"] for x in cmp_rows if not x["bounds_agree_1pct"]],
            "all_tris_differences_explained_by_degenerates": all(x["difference_explained_by_degenerates"] for x in cmp_rows)}


def render_previews(rec, out_dir):
    if "bounds_rest_m" not in rec:
        return None
    os.makedirs(out_dir, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_WORKBENCH"
    scene.display.shading.light = "STUDIO"; scene.display.shading.color_type = "MATERIAL"; scene.display.shading.show_cavity = True
    scene.render.resolution_x = 512; scene.render.resolution_y = 512; scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"; scene.render.film_transparent = False
    if scene.world is None:
        scene.world = bpy.data.worlds.new("AuditWorld")
    scene.world.color = (0.18, 0.18, 0.2)
    for name in rec.get("importer_artifacts", []):
        bpy.data.objects[name].hide_render = True
    mn = Vector(rec["bounds_rest_m"]["min"]); mx = Vector(rec["bounds_rest_m"]["max"])
    c = (mn + mx) * 0.5; ext = max(mx - mn) * 1.15; dist = max(mx - mn) * 4 + 1.0
    cam_data = bpy.data.cameras.new("AuditCam"); cam_data.type = "ORTHO"; cam_data.ortho_scale = ext
    cam_data.clip_start = 0.001; cam_data.clip_end = dist * 4
    cam = bpy.data.objects.new("AuditCam", cam_data); scene.collection.objects.link(cam); scene.camera = cam
    stem = os.path.splitext(os.path.basename(rec["file"]))[0]
    views = {"front": (Vector((c.x, c.y - dist, c.z)), (1.5707963, 0.0, 0.0)),
             "side": (Vector((c.x + dist, c.y, c.z)), (1.5707963, 0.0, 1.5707963)),
             "top": (Vector((c.x, c.y, c.z + dist)), (0.0, 0.0, 0.0))}
    written = []
    for name, (loc, rot) in views.items():
        cam.location = loc; cam.rotation_euler = rot
        path = os.path.join(out_dir, "%s_%s.png" % (stem, name))
        scene.render.filepath = path; bpy.ops.render.render(write_still=True)
        written.append(path.replace(os.sep, "/"))
    return written


def main():
    args = parse_args(sys.argv)
    repo = os.getcwd(); models_dir = os.path.join(repo, args["models_dir"])
    started = datetime.datetime.now()
    importer = ensure_importer()
    log("Blender %s; %s" % (bpy.app.version_string, importer))
    files = [f for f in find_glbs(models_dir) if not args["only"] or args["only"] in f]
    log("%d GLB files under %s" % (len(files), models_dir))
    records = []
    for rel in files:
        abs_path = os.path.join(models_dir, rel)
        rec = {"file": rel, "errors": []}
        try:
            doc, binchunk = read_glb(abs_path); hf = gltf_header_facts(doc, binchunk)
        except Exception as exc:
            hf = {"error": "header parse failed: %s" % exc}
        try:
            rec = measure(rel, abs_path, hf)
        except Exception as exc:
            rec["errors"].append("measure failed: %s\n%s" % (exc, traceback.format_exc())); rec["header"] = hf
        try:
            decide(rec)
        except Exception as exc:
            rec["errors"].append("decision failed: %s" % exc)
        if args["previews"]:
            try:
                rec["previews"] = render_previews(rec, os.path.join(repo, args["previews"]))
            except Exception as exc:
                rec["errors"].append("preview render failed: %s" % exc)
        if "bounds_rest_m" in rec:
            log("%-40s tris %6d  rest %s  surf %s  -> %s" % (
                rel, rec["tris"], rec["bounds_rest_m"]["size"],
                [s["fraction_of_height"] for s in rec.get("up_facing_surfaces_m", [])],
                rec["decision"].get("target_size_cm")))
        else:
            log("%-40s FAILED: %s" % (rel, "; ".join(rec["errors"])[:300]))
        records.append(rec)
    records.sort(key=lambda r: r["file"])
    xc = cross_check(records, os.path.join(repo, args["node_audit"]) if args["node_audit"] else None)
    slots = {}
    for r in records:
        d = r.get("decision", {})
        if d.get("unreal_name") and d.get("target_size_cm"):
            slots[d["unreal_name"]] = {
                "source": "SourceAssets/models/" + r["file"], "class": d["class"], "target_size_cm": d["target_size_cm"],
                "pivot": d["pivot"], "normalized_size_m": r["bounds_rest_m"]["size"], "tris": r["tris"],
                "budget_tris": d["class_budget_tris"], "budget_fits": d["budget_fits"],
                "uniform_scale_factor": d["uniform_scale_factor"], "drive": d["drive"],
                "rig": ({"bones": r["armature"]["bones"], "actions": [a["name"] for a in r["actions"]]} if r.get("armature") else None),
                "note": d["note"]}
    out = {
        "tool": "Tools/blender/audit_glb.py", "requirement": "REQ-G2-001",
        "generated": started.isoformat(timespec="seconds"), "blender_version": bpy.app.version_string,
        "importer": importer, "command_line": sys.argv, "models_dir": args["models_dir"],
        "units": "m for measurements (Blender scene units), cm for targets",
        "axes": "Blender Z-up after the glTF importer's Y-up conversion: x = width, y = depth, z = height",
        "budgets_tris": BUDGETS, "budget_tolerance": BUDGET_TOLERANCE,
        "file_count": len(records), "errors": sum(1 for r in records if r.get("errors")),
        "cross_check_vs_node_parser": xc, "asset_slots": slots, "rejected": REJECTED, "files": records,
    }
    out_path = os.path.join(repo, args["out"])
    os.makedirs(os.path.dirname(out_path) or ".", exist_ok=True)
    with open(out_path, "w", encoding="utf-8") as fh:
        json.dump(out, fh, indent=1); fh.write("\n")
    log("wrote %s (%d files, %d with errors) in %.1f s" % (out_path, len(records), out["errors"],
                                                          (datetime.datetime.now() - started).total_seconds()))


if __name__ == "__main__":
    main()
