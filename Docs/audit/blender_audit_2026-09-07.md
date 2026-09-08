# Blender asset audit - REQ-G2-001 (2026-09-07)

Every GLB in the working set opened headlessly in **Blender 5.2.1 LTS** (bundled glTF importer `io_scene_gltf2` 5.2.40), measured, cross-checked against the earlier node header parser, and given its REQ-G2-001 ruling: Unreal name, class, class budget, pivot rule, real-world target size in cm. Machine-readable twin: `Docs/audit/blender_audit_2026-09-07.json` (`asset_slots` is keyed by Unreal name in the shape `Data/blockout.json` expects). Script: `Tools/blender/audit_glb.py` (`Tools/blender/README.md`).

```
"C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" --background --factory-startup --python Tools/blender/audit_glb.py -- Docs/audit/blender_audit_2026-09-07.json
```

Exit code 0, 17 files, 0 errors, 6.3 s. The importer was present at startup under `--factory-startup` (no `addon_enable` needed). Axes below are Blender Z-up after the importer's Y-up conversion: **W** along x, **D** along y, **H** up.

## Headline findings

1. **The demons were never "0.017 m tall".** Both rigged demons are **1.70 m** in the rest pose. The node parser applied the mesh node's inherited 0.01 armature scale to POSITION bounds that glTF says a skinned mesh ignores (the bind buffers are already in metres; the joints carry the scale). Blender measures the skinned, armature-deformed mesh in rest pose: ember 1.253 x 1.575 x 1.700 m, crimson 1.177 x 0.468 x 1.700 m, feet exactly at z = 0. Scale factors to target are 1.29x (220) and 1.76x (300), not 130x / 176x.
2. **Every other file is normalised to ~1.9 m on its longest axis with its bounding-box centre at the origin** (`object_origin_at_bbox_centre_xy` true for all 17, `origin_at_floor` true only for the two demons). The Gate 4 pipeline moves every pivot.
3. **Triangle counts agree with the node parser to within 1 % for 16 of 17 files, and the differences are fully accounted for**: Blender's mesh validation drops *duplicate faces* (a second triangle over the same three vertices, either winding) that glTF-Transform's decimation left behind. The audit counts those in the raw index buffer and the count equals the difference for all 17 files. `intern_sitting` loses 661 (6.7 %) - 629 of them are flipped duplicates that fake two-sided hair cards; Unreal should get a two-sided material for the hair rather than the duplicate faces. Blender counts are the ones recorded; the pre-import counts stay in `glb_audit.jsonl`.
4. **Bounds agree to within 1 % for all 15 static meshes** (worst 0.28 %, `closed_door`). The two skinned meshes differ from the parser by the uniform factor ~100 described in (1); the axis order (glTF x, z, y -> Blender x, y, z) is verified up to that factor (ratio spread 0.4-0.5 %).
5. **Four models are not what their names suggest** (orthographic previews rendered with `--previews`):
   - `toilet_bowl` is a **wall-hung bowl with exposed plumbing** - drain pipe down and back into the wall, flush valve on top, no tank, no pedestal. That is why its raw bounds are near-cubic. Pivot **wall**, bowl width 40 is the anchor -> 40 x 41 x 46 cm; hang the box with its bottom ~2 cm above the floor so the rim lands at ~42.
   - `fallen_security_guard` is a **seated slump, not a prone body**: back to a wall, legs straight out, chin on chest. At an 82 cm crown his legs project **161 cm** from the wall. Along a 280 corridor wall that leaves ~120 clear (202 with his back on an end wall), under the 216 minimum - the blockout must seat him in a recess / doorway bay or across a corridor end, or the pose is re-authored at Gate 4. The floor plan's "lying along the north wall x 4300-4480" note (`note_guard`) assumed a prone body. **Blockout outcome (Gate 2):** seated inside the break room against its west wall, 2 m north of the corridor door, labelled "MOVED from the corridor"; the corridor alternatives are `Docs/blockout/BLOCKOUT.md` Q1.
   - `reception_desk` is a **diorama in one mesh**: desk block, office chair behind it, monitor, cup and a fallen item. The chair back rises above the work surface, so the surface is desk height (75), not a standing counter -> 157 x 157 x 110 (monitor top). It is much deeper than the plan note's 240 x 90 because the chair and fallen item are inside the footprint.
   - `kitchen_lunch_table` has **two chairs, not four**, on opposite sides of a round pedestal table with cups and a tray on top; `mop_and_bucket` also carries a **"wet floor" A-frame sign**; `ceo_couch_coffee_table` is an **L-set** (3-seat sofa, perpendicular loveseat, coffee table in front of the sofa - not between the two couches).
6. **Budgets:** every audited count fits its spec class budget except `ceo_couch_coffee_table` at 8,104 / 8,000 (1.3 % over, inside the 20 % tolerance); `broken_door` lands exactly on 4,000 after import. No decimation is needed at Gate 4 beyond what the Godot-era pass did.
7. **Rigs:** both demons carry one armature, 24 bones (root `Hips`, Mixamo-style names), armature object scale 0.01, one deformed mesh (`char1`) with 24 vertex groups, and named actions with real frame ranges (ember: Attack 2.8 s, Hit_Reaction 1.6 s, Idle_8 8.0 s, Shot_and_Fall_Backward 3.5 s, Walking 1.0 s; crimson: dying_backwards 2.2 s, Hit_Reaction_1 1.2 s, Idle_5 1.9 s, Idle_8 8.0 s, Right_Hand_Sword_Slash 1.5 s, Running 0.6 s, Shield_Push_Left 2.4 s, Simple_Kick 2.3 s, Walking 1.0 s, walking_2_inplace 1.2 s, all at 24 fps). The importer had set `Hit_Reaction_1` / `Attack` active; the audit clears actions and resets pose bones before measuring. Whether the skinning survives the FBX round-trip is still the Gate 4 question (REQ-G4-004).
8. **Importer artifact, not asset:** the Blender importer (bone heuristic `BLENDER`) adds an 80-triangle `Icosphere` as the bone custom-shape widget of every armature. It is not in the GLB (26 nodes = 24 joints + `char1` + `Armature`). The audit excludes it (`importer_artifacts`) - a first pass that counted it reported the demons as 2.0 x 2.7 m with 10,498 / 10,508 tris. The Gate 4 export script must not export it.
9. **Textures:** every GLB embeds its images at 1024 x 1024 (3-4 per static mesh: base colour, metallic-roughness, normal, emissive where present; `ember_demon` one WebP-compressed `texture_0`, `crimson_hellfiend` two, `texture_0` and `texture_0.001`, both 1024 x 1024). The loose `crimson_hellfiend_texture_0_1.png` beside the GLB is byte-identical to `crimson_hellfiend_texture_0.png` -> **rejected - duplicate**. One material per mesh.

## Method

- Per file: `wm.read_factory_settings(use_empty=True)` -> `import_scene.gltf` -> clear actions, mute NLA, reset every pose bone (rest pose) -> evaluated depsgraph -> world-space bounds of all subject mesh vertices, triangles as sum of `(len(polygon) - 2)` over evaluated polygons (equal to `loop_triangles`), vertices, materials, images with pixel size, armature / bones / vertex groups, actions with frame ranges.
- Extras recorded per file: undeformed bounds (bind buffers through the object matrix), low-slice footprint (bottom 10 % of the height - what touches the floor), the three largest up-facing surface bands (2 cm bins; the table / counter top), origin-at-floor test, Y-up -> Z-up test against the raw glTF header, and the raw-buffer duplicate-face count.
- Target sizes come from **one driving dimension per slot** (`SLOTS` in the script, mode `z` / `x` / `y` extent or `surface` = dominant up-facing surface height above the bottom), applied as a **uniform** scale so the model keeps its own proportions - Meshy textures smear under non-uniform scale. Where a target conflicts with the frozen architecture (elevator doors 200 x 220 vs the model's 0.61 aspect; door opening 120 x 220 vs 0.46) the height wins and the greybox fills the flanks; the notes say so.
- Previews: `--previews <dir>` renders 512 px Workbench orthographic front / side / top views per model (used for the pose rulings above; not committed - regenerate on demand).

## Real-world sizes and rulings

Class budgets are the spec's Gate 4 table (hero weapon 25,000, enemy 15,000, human prop 10,000, large furniture 8,000, small prop / door / fixture 4,000; tolerance 20 %). "Driving dimension" is the one real-world constant the target was derived from; the other two axes follow the measured proportions.

| Source file | Unreal name | Class | Measured rest size W x D x H (m) | Target size (cm) | Driving dimension | Tris (Blender) | Budget | Rig / animations | Pivot | Disposition |
|---|---|---|---|---|---|---:|---|---|---|---|
| `props/reception_desk.glb` | **SM_ReceptionDesk** | Large furniture | 1.896 x 1.888 x 1.330 | 157 W x 157 D x 110 H (x0.830) | work surface at 75 | 7,796 | 8,000 - fits | static (no rig) | floor | kept |
| `props/kitchen_lunch_table.glb` | **SM_KitchenLunchTable** | Large furniture | 1.899 x 1.349 x 1.063 | 160 W x 114 D x 89 H (x0.841) | work surface at 75 | 7,803 | 8,000 - fits | static (no rig) | floor | kept |
| `props/refrigerator_open.glb` | **SM_RefrigeratorOpen** | Large furniture | 0.919 x 1.303 x 1.902 | 87 W x 123 D x 180 H (x0.946) | height 180 | 7,789 | 8,000 - fits | static (no rig) | floor | kept |
| `props/bathroom_vanity.glb` | **SM_BathroomVanity** | Large furniture | 1.903 x 0.418 x 0.854 | 246 W x 54 D x 110 H (x1.293) | work surface at 85 | 7,792 | 8,000 - fits | static (no rig) | floor | kept |
| `props/toilet_bowl.glb` | **SM_ToiletBowl** | Small prop / door / fixture | 1.634 x 1.685 x 1.896 | 40 W x 41 D x 46 H (x0.245) | length (x) 40 | 3,798 | 4,000 - fits | static (no rig) | wall | kept |
| `props/mop_and_bucket.glb` | **SM_MopAndBucket** | Small prop / door / fixture | 1.644 x 1.267 x 1.893 | 130 W x 100 D x 150 H (x0.792) | height 150 | 3,791 | 4,000 - fits | static (no rig) | floor | kept |
| `props/ceo_couch_coffee_table.glb` | **SM_CeoCouchCoffeeTable** | Large furniture | 1.901 x 1.721 x 0.543 | 280 W x 254 D x 80 H (x1.474) | height 80 | 8,104 | 8,000 - 1.3% over, within the 20% tolerance | static (no rig) | floor | kept |
| `props/closed_door.glb` | **SM_ClosedDoor** | Small prop / door / fixture | 0.882 x 0.145 x 1.903 | 102 W x 17 D x 220 H (x1.156) | height 220 | 3,805 | 4,000 - fits | static (no rig) | wall | kept |
| `props/broken_door.glb` | **SM_BrokenDoor** | Small prop / door / fixture | 1.902 x 0.986 x 0.107 | 205 W x 106 D x 12 H (x1.078) | length (x) 205 | 4,000 | 4,000 - fits | static (no rig) | floor | kept |
| `props/closed_elevator.glb` | **SM_ClosedElevator** | Small prop / door / fixture | 1.163 x 0.178 x 1.903 | 134 W x 21 D x 220 H (x1.156) | height 220 | 3,790 | 4,000 - fits | static (no rig) | wall | kept |
| `weapons/shotgun.glb` | **SM_Shotgun** | Hero weapon | 1.902 x 0.099 x 0.355 | 120 W x 6 D x 22 H (x0.631) | length (x) 120 | 23,816 | 25,000 - fits | static (no rig) | muzzle | kept |
| `characters/man_sitting.glb` | **SM_ManSitting** | Human prop | 1.284 x 1.905 x 1.128 | 97 W x 144 D x 85 H (x0.753) | height 85 | 9,502 | 10,000 - fits | static (no rig) | floor | kept |
| `characters/intern_sitting.glb` | **SM_InternSitting** | Human prop | 1.041 x 1.784 x 1.900 | 49 W x 85 D x 90 H (x0.474) | height 90 | 9,185 | 10,000 - fits | static (no rig) | floor | kept |
| `characters/fallen_security_guard.glb` | **SM_FallenSecurityGuard** | Human prop | 0.918 x 1.902 x 0.971 | 78 W x 161 D x 82 H (x0.845) | height 82 | 9,479 | 10,000 - fits | static (no rig) | floor | kept |
| `characters/ceo_dead.glb` | **SM_CeoDead** | Human prop | 1.167 x 1.897 x 0.538 | 105 W x 170 D x 48 H (x0.896) | length (y) 170 | 9,477 | 10,000 - fits | static (no rig) | floor | kept |
| `characters/ember_demon.glb` | **SK_EmberDemon** | Enemy | 1.253 x 1.575 x 1.700 | 162 W x 204 D x 220 H (x1.294) | height 220 | 10,418 | 15,000 - fits | 1 armature, 24 bones (root Hips), 5 actions: Attack, Hit_Reaction, Idle_8, Shot_and_Fall_Backward, Walking | floor | kept |
| `characters/crimson_hellfiend.glb` | **SK_CrimsonHellfiend** | Enemy | 1.177 x 0.468 x 1.700 | 208 W x 83 D x 300 H (x1.765) | height 300 | 10,428 | 15,000 - fits | 1 armature, 24 bones (root Hips), 10 actions: dying_backwards, Hit_Reaction_1, Idle_5, Idle_8, Right_Hand_Sword_Slash, Running, Shield_Push_Left, Simple_Kick, Walking, walking_2_inplace | floor | kept; loose duplicate PNG rejected |

Per-slot reasoning (verbatim from the JSON `decision.note`):

| Slot | Why this size / pivot |
|---|---|
| SM_ReceptionDesk | Work surface at desk height 75 because the chair back rises above it; the monitor top sets 110 overall; 157 x 157 footprint includes the chair behind and a fallen item. Reused as the CEO desk (spec). |
| SM_KitchenLunchTable | Table top at 75; chair backs (tallest element) land at 89. Two chairs in the mesh; "one chair pushed out" is a blockout note, not a second mesh. |
| SM_RefrigeratorOpen | Domestic fridge 180 tall; the 123 depth is the door swung open ~90 deg. |
| SM_BathroomVanity | Counter surface at 85 (three basins, three taps to 110). Floor-standing, back flush to the wall. |
| SM_ToiletBowl | Wall-hung bowl with exposed pipes; bowl width 40 is the anchor. Pivot wall; box bottom ~2 above the floor puts the rim at ~42. |
| SM_MopAndBucket | Mop handle top at 150 -> wringer bucket ~86, wet-floor sign ~67, both real-world. |
| SM_CeoCouchCoffeeTable | Sofa back 80 -> ~215 sofa, ~160 loveseat, ~120 x 70 table; overall L 280 x 254. 1.3 % over the 8,000 budget, inside tolerance. |
| SM_ClosedDoor | 220 tall fills the frozen opening height; 102 wide at the model's 0.46 aspect, so the greybox jamb fills ~9 each side. Stretching to 120 rejected (texture smear). Pivot wall. |
| SM_BrokenDoor | Lying flat; long axis = 205 leaf; width 106 (model wider than a real 90 leaf), 12 thick with the splinters. |
| SM_ClosedElevator | 220 tall matches the frozen `elevator_doors` blocker height; 134 wide (aspect 0.61) centred in the 200 blocker, greybox fills the flanks. 200 wide would be 327 tall (> 310 ceiling) - rejected. Pivot wall. |
| SM_Shotgun | 120 long pump shotgun -> 22 tall (stock drop + pump), 6 wide. Pivot muzzle-back-along-barrel (REQ-G4-001). |
| SM_ManSitting | Seated on the floor leaning back, legs out, head back: crown 85 -> legs 144 from the back plane (fits the 430 closet in front of the 60-deep racks). |
| SM_InternSitting | Knees drawn up, arms around them, head down (hair adds to the top): crown 90 -> 49 wide, 85 back-to-toes. Back to a wall. |
| SM_FallenSecurityGuard | Seated slump against a wall, legs straight out: crown 82 -> legs 161 out. Corridor-clearance conflict flagged above. |
| SM_CeoDead | On his back, arms spread, knees bent and folded to one side: 170 along the body (~180 stature), 105 across the arms, 48 thick. |
| SK_EmberDemon | 220 tall (spec capsule 220 / r 45). Rest pose is a wings-spread A-pose, so 162 wide and 204 deep (wings sweep back). Feet at z = 0 in the file. |
| SK_CrimsonHellfiend | 300 tall (spec capsule 300 / r 60). T/A-pose with wings: 208 wide, 83 deep. Feet at z = 0 in the file. |

## Rejected / duplicate

| File | Disposition | Reason |
|---|---|---|
| `models/characters/crimson_hellfiend_texture_0_1.png` | rejected - duplicate | byte-identical to `crimson_hellfiend_texture_0.png` (same size, same MD5). The GLB embeds both `texture_0` and `texture_0.001` (1024 x 1024); the embedded copies travel with the mesh. Still on disk as of 2026-09-07: the lead removes it with `git rm` (LFS-tracked) in the Gate 2 commit. |
| ` - Copy` duplicates, `deamon`, `Meshy_AI_*`, `shotgun2`, `ceo_dead2`, the third demon | not on this machine | Resolved by the Godot-era pass (`RobleusCaesar/hellfallGPT`) that produced this working set; the raw 2.8 GB Meshy bundle is not present, so those rows cannot be re-inspected. `SourceAssets/` contains no file matching ` - Copy`, `Meshy_AI_` or `deamon` (REQ-G2-001 acceptance 2, re-verified 2026-09-07). |

## Cross-check against the node parser (`Docs/audit/glb_audit.jsonl`)

Parser bounds are glTF Y-up (x, y, z); they are compared as Blender (x, z, y). "Duplicate faces" is the count of triangles in the raw index buffer that repeat an earlier triangle's vertex set (either winding) - the faces Blender's mesh validation removes on import.

| File | Parser tris | Blender tris | Difference | Duplicate faces in the index buffer | Bounds deviation (axis-mapped) |
|---|---:|---:|---:|---:|---|
| `characters/ceo_dead.glb` | 9,479 | 9,477 | 2 | 2 (= difference) | 0.03% |
| `characters/crimson_hellfiend.glb` | 10,428 | 10,428 | 0 | 0 (= difference) | skinned: parser 100x too small (ratios 99.73 / 99.62 / 100), axis order verified |
| `characters/ember_demon.glb` | 10,418 | 10,418 | 0 | 0 (= difference) | skinned: parser 100x too small (ratios 100.23 / 99.72 / 100), axis order verified |
| `characters/fallen_security_guard.glb` | 9,485 | 9,479 | 6 | 6 (= difference) | 0.03% |
| `characters/intern_sitting.glb` | 9,846 | 9,185 | 661 | 661 (= difference) | 0.01% |
| `characters/man_sitting.glb` | 9,506 | 9,502 | 4 | 4 (= difference) | 0.04% |
| `props/bathroom_vanity.glb` | 7,794 | 7,792 | 2 | 2 (= difference) | 0.04% |
| `props/broken_door.glb` | 4,012 | 4,000 | 12 | 12 (= difference) | 0.09% |
| `props/ceo_couch_coffee_table.glb` | 8,126 | 8,104 | 22 | 22 (= difference) | 0.02% |
| `props/closed_door.glb` | 3,806 | 3,805 | 1 | 1 (= difference) | 0.28% |
| `props/closed_elevator.glb` | 3,790 | 3,790 | 0 | 0 (= difference) | 0.11% |
| `props/kitchen_lunch_table.glb` | 7,806 | 7,803 | 3 | 3 (= difference) | 0.02% |
| `props/mop_and_bucket.glb` | 3,791 | 3,791 | 0 | 0 (= difference) | 0.02% |
| `props/reception_desk.glb` | 7,798 | 7,796 | 2 | 2 (= difference) | 0.02% |
| `props/refrigerator_open.glb` | 7,792 | 7,789 | 3 | 3 (= difference) | 0.02% |
| `props/toilet_bowl.glb` | 3,798 | 3,798 | 0 | 0 (= difference) | 0.02% |
| `weapons/shotgun.glb` | 23,818 | 23,816 | 2 | 2 (= difference) | 0.10% |

Result: triangles agree within 1 % for 16 / 17 files (the intern's 6.7 % is entirely duplicate faces, listed above); bounds agree within 1 % for all 15 static meshes; the two skinned meshes disagree by the parser's mis-applied 0.01 armature scale (a known limitation of header-only parsing of skinned meshes) and agree in axis order. Vertex counts are identical for all 17 files (the importer does not merge vertices).

## What the blockout designer takes from this

- `asset_slots` in the JSON, keyed by the exact Unreal names, with `target_size_cm {w, d, h}`, `pivot`, `class`, `tris`, `normalized_size_m` and the note. Sizes are the model's own proportions; they are the blockout box sizes. `Data/blockout.json` copies these fields verbatim as the schema's primary `normalized_size_m` / `tris` (Blender rest pose, Z-up W x D x H - the numbers Gate 4 divides `target_size_cm` by); the node parser's view is kept beside them as `parser_size_m` / `tris_parser` for the record only, because it reads the two skinned demons 100x too small (finding 1).
- Wall-pivot slots: `SM_ClosedDoor`, `SM_ClosedElevator`, `SM_ToiletBowl` (the toilet hangs with its bottom ~2 above the floor). Everything else sits on the floor at z 0; `SM_BathroomVanity` and the seated characters are floor items whose back face is flush to their contact surface.
- The guard is a seated slump 161 deep - do not place him along the 280 corridor's run (the blockout seats him inside the break room, `BLOCKOUT.md` Q1); the reception desk is 157 x 157, not 240 x 90; the elevator model is 134 wide inside the 200 blocker; the door model is 102 wide inside the 120 opening.
- Both demons are 1.7 m in the file and scale by 1.29x / 1.76x; the encounter capsules in `Data/floorplan.json` (220 / r 45 and 300 / r 60) stay the placement authority.

## Gate 4 notes recorded here so they are not lost

- Export scripts must skip the importer's `Icosphere` custom-shape object and clear the active action before exporting the rest pose.
- The intern's hair relies on duplicated back-faces; after import those are gone - use a two-sided material for the hair material slot, or re-duplicate on export.
- Uniform scale only; the pivots to set are floor contact (13 slots), wall contact (3 slots) and muzzle (shotgun).
