# Tools/blender/ - Blender (bpy) scripts for the asset pipeline

Blender 5.2.1 LTS at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. Everything here runs headless
(`--background`) from the repo root; nothing opens a window. G-1: nothing from Meshy enters the engine without passing
through here.

```
Tools/blender/
  audit_glb.py     REQ-G2-001 audit: measures every SourceAssets/models/**/*.glb in Blender, cross-checks the node header
                   parser, applies the recorded slot rulings (Unreal name, class, budget, pivot, real-world target size)
                   -> Docs/audit/blender_audit_<date>.json (+ Docs/audit/blender_audit_<date>.md, written by hand from it)
  (Gate 4)         prepare_<class>.py: import GLB -> real-world scale -> decimate to budget -> pivot -> apply transforms ->
                   UCX_ collision -> FBX (REQ-G4-001). Not written yet; the rulings they will apply are in audit_glb.py SLOTS.
```

## audit_glb.py

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python Tools/blender/audit_glb.py -- Docs/audit/blender_audit_2026-09-07.json
```

Options after the `--`: `<out.json>` (required), `--models-dir <dir>` (default `SourceAssets/models`), `--node-audit <jsonl>`
(default `Docs/audit/glb_audit.jsonl`, cross-checked when present), `--previews <dir>` (also render 512 px Workbench
orthographic front / side / top PNGs per model - keep them out of the repo, e.g. a scratch directory), `--only <substring>`.
Exit code 0 even when a file fails - failures are recorded per file under `errors` and counted in the header; check
`"errors": 0`. Run time about 7 s for the 17 files (about 12 s with previews).

What worked on 2026-09-07: the bundled glTF importer (`io_scene_gltf2` 5.2.40) is present under `--factory-startup`, so
`bpy.ops.import_scene.gltf(filepath=...)` runs without enabling anything; the script still falls back to
`addon_utils.enable("io_scene_gltf2")` if the operator is missing and records which path was taken in `importer`.

Per file it records: the header facts parsed from the raw GLB (generator, nodes, skins, joints, animation names,
accessor bounds, triangle count from the index buffer, duplicate-face count), then from Blender: every object with its
world transform, the subject mesh objects (the importer's bone custom-shape `Icosphere` is flagged `importer_artifact`
and excluded), triangles / polygons / vertices of the evaluated meshes, rest-pose world bounds (actions cleared, NLA
muted, pose bones reset first), undeformed bounds, longest axis, origin-at-floor test, bbox centre, low-slice footprint
(bottom 10 %), the three largest up-facing surface bands (table / counter tops), a Y-up -> Z-up test against the header,
materials, images with pixel sizes, armature (bones, root, scale, deformed meshes, vertex groups), actions with frame
ranges and seconds at scene fps, and the `decision` block.

`SLOTS` at the top of the script is the REQ-G2-001 ruling per GLB stem: Unreal name, class, pivot (`floor` / `wall` /
`muzzle`), one driving dimension (`("z", 220)` = height 220 cm; `("x", 120)` / `("y", 170)` = that extent;
`("surface", 75)` = the dominant up-facing surface 75 cm above the mesh bottom) and the reason. The target size is
that dimension applied as a uniform scale, so the other two axes keep the model's proportions. Change a ruling there,
re-run, and the JSON `asset_slots` (keyed by Unreal name, in the shape `Data/blockout.json` uses) follows. The
markdown twin is regenerated from the JSON by hand (its tables were produced from the JSON fields; see the file).

Cross-check: triangles and bounds against `Tools/glb_audit.mjs` output, axis-mapped (glTF x, y, z -> Blender x, z, y).
Differences in triangle count equal the duplicate faces Blender's mesh validation drops on import (proved per file in
`cross_check_vs_node_parser.rows[].difference_explained_by_degenerates`); the skinned demons differ by the parser's
mis-applied 0.01 armature scale and are compared by axis order instead.

## Conventions for the Gate 4 scripts (from the audit)

- Uniform scale only; scale factor = `decision.uniform_scale_factor` from the audit JSON.
- Pivots: floor contact at the bbox bottom centre for floor props / characters; wall contact (back face) for
  `SM_ClosedDoor`, `SM_ClosedElevator`, `SM_ToiletBowl`; muzzle-back-along-barrel for `SM_Shotgun`.
- Skip the importer's `Icosphere` custom-shape object; clear the active action before exporting a rest pose.
- The intern's hair is two-sided only through duplicated faces that the import drops - give the hair a two-sided material.
