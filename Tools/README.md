# Tools/ - HELLFALL build, level-generation and validation scripts

Everything under `Tools/` is text. The maps under `/Game/Maps` are **generated** from JSON under `Data/`;
nobody hand-edits a `.umap`. Rob's feedback becomes a JSON edit, a re-run, a rebuild.

```
Tools/
  ue/hf_geometry.py         pure Python: Data/*.json -> boxes/labels/lights/PlayerStart (no `unreal` import)
  ue/hf_common.py           emitters: ManifestEmitter (JSON, engine-free) and UnrealEmitter (editor)
  ue/build_greybox.py       /Game/Maps/L_ExecutiveFloor from Data/floorplan.json          (REQ-G1-005/006/007)
  ue/build_feel_gym.py      /Game/Maps/L_FeelGym from Data/metrics.json "feel_gym"        (REQ-G1-004)
  ue/run_editor_script.ps1  runs a .py inside UnrealEditor-Cmd (commandlet or full editor); code-free twin when the C++ is not built
  ue/_engine.ps1            dot-sourced helper: engine/Python/node resolution, live-tailing process runner, twin writer
  validate_floorplan.mjs    node: schema + geometry + adjacency + scenes + money-shot checks, exploration estimate
  check_manifest.mjs        node: overlap / boundary / enclosure / money-shot checks on a dry-run manifest
  test_dry_run.ps1          engine-free regression: py_compile, determinism, all checkers, scenes smoke (run before every commit)
  generate_project_files.ps1, build_editor.ps1, package.ps1, release.ps1, setup_toolchain.ps1
  glb_audit.mjs             asset audit (Gate 2 prep; leave as is)
  blender/                  Gate 4 asset pipeline (empty until then)
```

## Prerequisites

| Tool | Needed for | Where |
|---|---|---|
| Python 3.12 | dry runs, tests | `C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe` (not on PATH; `_engine.ps1` finds it, falls back to `python`/`py`) |
| node 24 | the `.mjs` checkers | on PATH |
| Unreal Engine 5.8 | building the real maps, packaging | Epic Games Launcher (interactive) - `Docs/TOOLCHAIN-SETUP.md`, Step 1 |
| VS 2022 Build Tools 17.14+, Win SDK 26100, .NET 8 | compiling the C++ module, packaging | `Tools\setup_toolchain.ps1` (prints the winget commands; `-Run` executes them elevated) |

Nothing in the dry-run path needs the engine. **Map generation never needs the C++ module either**: the editor
scripts only use the PythonScriptPlugin, so `run_editor_script.ps1` runs them against a temporary code-free twin of the
project whenever `Binaries\Win64\UnrealEditor-Hellfall.dll` is missing (see "Engine scripts" below). Only packaging and
the packaged game need the compiled module (Visual Studio Build Tools).

## The loop: Rob's feedback -> edit JSON -> rerun

1. Rob says "the corridor feels like a tunnel" / "door 120 is the one" / "closet ceiling lower".
2. Edit the data, never the map:
   * body & controls -> `Data/movement.json` (read by `UHellfallTuning` at runtime; a packaged build picks it up from `Hellfall\Data\`)
   * architecture numbers (door, corridor, ceilings, duct, wall, figure) -> `Data/metrics.json`
   * room rects, openings, duct, markers, encounters, money shot, **scenes** -> `Data/floorplan.json` (schema: `Docs/FLOORPLAN-SCHEMA.md`)
   * tints, surface texture, light intensities, label sizes, `notes_enabled`, marker sizes, feel-gym hall/spacing -> `Data/greybox_style.json`
3. `Tools\test_dry_run.ps1` - must print `all steps passed`. It compiles every editor script, runs the generator twice
   (identical SHA256 = deterministic), validates the plan (adjacency, scenes, exploration estimate), checks both manifests
   for overlaps, enclosure and the money-shot framing, and smoke-tests the scenes path with 8 generated slots. Fix until green.
   Every step's tool output goes to the host; a step passes only when its body returns a trailing `$true`, so a failing
   validator or generator really fails the run (`-Floorplan Saved\narrow.json` is the standing negative check: exit 1).
4. With the engine installed: `Tools\ue\run_editor_script.ps1 -Script build_greybox.py` and
   `Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py` (no C++ build required). The maps are recreated from
   scratch every time (deleted and regenerated, so the result is a pure function of the JSON - REQ-G1-005 AC3).
5. `Tools\package.ps1 -Tag gate-1.N`, then `Tools\release.ps1 -Tag gate-1.N` (needs `GATE-1-NOTES.md`).

## Dry-run workflow (no engine)

```powershell
# manifests (JSON with every actor in plan space AND Unreal space)
& "C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe" Tools\ue\build_greybox.py --dry-run
& "C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe" Tools\ue\build_feel_gym.py --dry-run
#   -> Saved\Manifests\L_ExecutiveFloor.manifest.json, Saved\Manifests\L_FeelGym.manifest.json  (Saved/ is git-ignored)
# options: --out <file>  --floorplan <file>  --metrics <file>  --style <file>  --movement <file>  --map /Game/Maps/X

node Tools\validate_floorplan.mjs Data\floorplan.json          # PASS / numbered FAIL list, exit 0/1
node Tools\check_manifest.mjs Saved\Manifests\L_ExecutiveFloor.manifest.json
Tools\test_dry_run.ps1 [-Floorplan Data\candidates\floorplan_B.json]   # all of the above, once
```

Every script prints `OK` or a line starting with `FAILED:` and exits non-zero on failure, so wrappers and CI can tell.
The build scripts end with `sys.exit(code)` in both worlds: under `-run=pythonscript` the plugin traps `SystemExit(0)`
and reports "Python script executed successfully" (verified 2026-09-06 on 5.8.2: exit 0, 0 errors; the trap is in
`PythonScriptPlugin/Private/PyUtil.cpp::FetchPythonError`), while a non-zero `SystemExit` is logged as
`LogPython: Error` and fails the commandlet - which is what the wrapper looks for.

### What the generator builds (hf_geometry.py)

* **Plan space** is the drawing: x right, y down toward the window, cm, origin top-left. Unreal: `X = plan.y`, `Y = -plan.x`,
  `Z` up, `UE yaw = plan yaw - 90`. Every manifest actor carries both (`center_plan/size_plan` and `ue.location/scale`).
  Boxes are scaled `/Engine/BasicShapes/Cube` actors (100 cm cube -> simple box collision only, REQ-G1-007).
* **Floors** (interior rect, 30 cm slab, top at Z=0), **ceilings** (20 cm slab at the room ceiling), **walls** from a 2-D cell grid:
  solid = (rooms grown by the wall thickness) minus (room interiors). Shared walls, offsets, T-junctions and corners come out as
  non-overlapping boxes; walls span from the slab bottom to the higher neighbouring ceiling.
* **Openings** cut holes of exactly `width x height`: jambs are the neighbouring wall cells (flush), a `Header_<id>` above,
  a `Threshold_<id>` below floor level; `locked_door` and elevator doors get an `Infill_<id>` slab flush in the hole;
  `window` gets a `Sill`, glass panes and a mullion every 150 cm (style), impassable.
  If the plan has no `window` opening on `money_shot.window_wall`, a full-width window is synthesized there (warning printed).
* **Duct**: floor/ceiling/two sides with the interior exactly 100 x 95 (walls 6 cm), running from wall face to wall face;
  the wall mouths are cut to the interior size; a 6 cm floor lip and head bar sit on the room side of each mouth
  (clear mouth 100 x 83: crawl 64 passes, crouch 116 does not); a small point light mid-duct (REQ-G1-006 "see the far opening").
* **Collapse**: three stacked boxes (depths 100 % / 66 % / 33 % of `depth_cm`) flush against the far wall of `corridor_blocked`,
  floor to ceiling - not jumpable, not crawlable. **Elevator doors**: infill slab in the lobby wall. Both labelled.
  A `locked_door` gets a `LOCKED` label on every side the player can stand on (the sealed women's restroom is labelled
  from `corridor_main`, not from inside the sealed room).
* **Reference figure** per room: 50 x 30 x 160 body + 20 cm head = 180 exactly. **Room label** (name, size, ceiling) at 250 cm,
  clamped one text height below the room light (light 60 cm under the ceiling: 310 cm rooms -> 210, 280 cm restrooms -> 180),
  single-sided, facing the room's entry point. **Note** labels (Gate 2 intent) smaller and dimmer, word-wrapped at
  `labels.note.wrap_chars` (TextRender cannot wrap), facing the same entry point. **Checkpoints** flat green discs; **encounters**
  translucent trigger / spawn / retreat / strafe lanes; **dwell zone** translucent blue - all visible, no collision.
* **One point light per room** (movable, no shadows, even fill: inverse-square off, unitless intensity + colour temperature
  by role), radius 1.25 x the room diagonal.

**Labels face the approach, lights are even fill (packaged-run findings, 2026-09-06).** A TextRender quad reads correctly only
from the side its local +X points to and is mirrored from behind, and the old 180-degree twin overlapped it into garbled glyphs,
so every label is now ONE single-sided actor turned toward where the player reads it: room, note and marker labels face the
room's entry point (the player start; else the opening from the previous critical-path room, duct mouth included; else a
door/open to a critical-path room, corridors first; else the duct mouth; else -plan.y), snapped to the nearest 90 deg only when
within 10 deg of one; wall labels (LOCKED, ELEVATOR, DUCT, WINDOW WALL, COLLAPSED) face into the room; every feel-gym label faces
the start (-y). The manifest records `yaw_plan_deg`, `viewer_plan` and `facing` per label. Inverse-square candela lights blew the
ceiling out around each fixture while auto-exposure swallowed a 12.5x candela change, so every point light is an even fill light:
`use_inverse_squared_falloff` off, `lights.*.intensity_unitless`, `falloff_exponent` 2, hung 60 cm below the ceiling; the manifest
carries `inverse_squared`, `falloff_exponent` and `intensity_units` for each light.
* **Scenes** (gate-1 brief: staging slots for monsters and set pieces; `floorplan.json : scenes`, schema in
  `Docs/FLOORPLAN-SCHEMA.md`): per scene a translucent floor marker tinted by kind (monster red, ambush orange, scene purple,
  pickup green, reveal blue), a `KIND: id` label at 60 cm facing the room's entry point, a grey note with the description
  (word-wrapped; off when `labels.notes_enabled` is false) and, for a `facing_deg` on a 90-degree multiple, a thin tick strip from
  the rect centre in that direction. Folder `Greybox/Scenes`, no collision; `meta.scenes` in the manifest. Unknown kind or a rect
  outside its room is a generator error (the validator catches both first).
* **Notes** are small and quiet (`labels.note`: 11 cm glyphs, dark grey) and `labels.notes_enabled: false` removes every
  note-style label (Gate 2 intent notes and scene descriptions) for a clean screenshot pass; `meta.notes_enabled` records it.
* **Boundary**: seven hidden collision-only boxes (4 walls + lid + bottom + safety slab 50 cm under the floor).
* `validate_geometry` refuses to emit when visible collision boxes overlap (> 0.5 cm), when a hole is not exactly its
  requested size (probes just outside every edge must be solid, inside must be empty), when a room lacks its figure/label/light,
  or when a room perimeter has a gap.

### Surface texture (gate-1 brief: "a tiny amount of texture to floor, ceiling and walls")

`Data/greybox_style.json : surface_texture` + a `surface_class` (floor | ceiling | wall | duct) on each architectural tint.
Every such material's base colour is `lerp(tint, grid, strength)` where `grid` is the engine's default-material grey grid
(`/Engine/EngineMaterials/T_Default_Material_Grid_M`) sampled through the engine function
`/Engine/Functions/Engine_MaterialFunctions01/Texturing/WorldAlignedTexture` (both verified on disk under
`C:\Program Files\Epic Games\UE_5.8\Engine\Content\` on 2026-09-06), so the grid is projected in world space and every
scaled cube keeps one texel size. Per class: floor 50 cm tile at strength 0.14 (carpet tile), ceiling 60 cm at 0.10 (ceiling
tile), wall 100 cm at 0.06 (faint plaster grid), duct 25 cm at 0.10 (sheet metal). Markers, glass, figures, the locked door,
elevator doors and the collapse stay flat. Tints were re-balanced at the same time so edges read: floors darkest (~0.5 grey-warm),
ceilings 0.72, walls lightest (~0.85). `surface_texture.enabled: false` keeps every material flat.

The dry-run manifest carries the recipe per tint under `materials` (asset path, rgb, roughness, blend, and the texture block with
function/texture paths, pin names, tile size and strength), so the lead can inspect it without the editor. In the editor
(`hf_common.UnrealEmitter._ensure_materials`) every `M_GB_<key>` is **rebuilt from the recipe on each run** (existing asset reused,
all expressions deleted, graph re-created; gate-0's flat materials would otherwise stay flat forever). Graph:
`Constant3Vector(tint) -> Lerp.A`, `TextureObject(grid) -> WorldAlignedTexture.TextureObject`, `Constant(tile_cm) -> .TextureSize`,
`WorldAlignedTexture."XYZ Texture" -> Lerp.B`, `Constant(strength) -> Lerp.Alpha`, `Lerp -> Base Color`; roughness / opacity as before.
The function-call node is set with `set_material_function()` (a `UFUNCTION(BlueprintCallable)` in 5.8's
`MaterialExpressionMaterialFunctionCall.h`, which populates the pins - the non-exposed `UpdateFromFunctionResource` is what it
calls internally) and wired with `MaterialEditingLibrary.connect_material_expressions(from, out_name, to, in_name)`, which matches
function-call inputs by name without the type postfix. **Fallback:** if either asset fails to load, `set_material_function`
returns False or any pin name does not connect, the emitter logs a warning, removes the orphan nodes and builds that material flat;
the run result prints `materials_textured` / `materials_flat_fallback`. The whole path carries one `TODO(VERIFY 5.8)`: the first
live editor run must show every architectural tint under `materials_textured`.

Actor names are deterministic (`Wall_break_room_west_01`, `Header_door_break_to_corridor`, `Duct_duct_supply_to_break_floor`,
`Collapse_collapse_02`, `Figure_ref_break_room_body`, `Light_ceo_office`, ...) and sorted by (folder, name).

### Feel gym (build_feel_gym.py)

Two rows of stations on a 60 x 44 m slab (`greybox_style.feel_gym.station_rows/row_y_cm`): doorways 90/110/120/140,
corridors 200/260/320 (10 m, ceiling 310), rooms 5 x 5 m at ceilings 270/300/350 with a 120 door, jump ledges 40..120
(each separated by `element_gap_cm` of floor so it is jumped onto from the ground, not walked up as a staircase),
a 9-step ramp with risers 20 -> 60 (each labelled), crawl tunnels 90/100/110 high. A 180 cm figure stands beside every element,
every element is labelled with its dimension, the player starts at the near edge facing the stations (+X).

**Enclosed hall (gate-1 brief: "add ceiling and walls, this is an internal map").** The slab is wrapped in 20 cm walls
(`metrics.architecture.wall_thickness_cm`) and roofed at `metrics.feel_gym.hall_ceiling_cm` (450) - the ceiling-height rooms,
corridors and tunnels keep their own lower ceilings inside it. No sun, no sky light (the old `feel_gym.sun` / `sky_light` style
keys are refused). Fill lighting = the station lights as before plus `feel_gym.hall_light` even-fill point lights on a grid no
coarser than `hall_light_spacing_cm` (800 -> 8 x 6 = 48 lights, hung 60 cm under the hall ceiling; raise the spacing if the iGPU
minds). The generator refuses a hall ceiling that does not clear the tallest station top (370) plus the light drop. Folder
`FeelGym/Hall`; `meta.hall` records the numbers. Labels unchanged.

## Validators

`validate_floorplan.mjs` (FAIL = exit 1, WARN never fails):
required room ids, field types, snake_case ids; no room overlap; facing rooms exactly one wall apart when they share an
opening; openings inside both rooms' wall extents; door width >= capsule diameter + 40; corridors (`corridor_*`) >= 3 x capsule
and 250-320; ceilings 300-330 (restrooms >= 270; the `start` closet may go to 270 with a WARN); rooms >= 400 x 400
(supply closet 300 in one dimension = WARN; non-enterable window-only "backdrop" rooms = WARN only); duct 100 x 95,
length 300-800, start on the from-room wall, ends on the to-room wall, tube crosses no other room; supply closet has
only the duct; fixed adjacency (break->corridor door, restrooms door/locked_door, offices door, blocked open, elevator
open/door, reception open/door, reception->CEO door; `elevator_lobby` counts as corridor space so the collapsed stub may
branch off it); critical path passable end to end; exactly one figure per room, one player_start, 4 checkpoints;
encounters: declared retreat/strafe distances >= metrics minimums AND the lanes are actually clear (sampled every 5 cm
through rooms and door/open footprints; locked doors, windows, walls, collapse and the dividing wall block);
no authored opening overlaps a duct mouth (the generator would otherwise fail later with a less helpful message);
money shot: window wall opposite the entry door, exterior, dwell rect inside and within 150 cm of the window, dividing
wall partial and off the door-centre -> window-centre sightline; **scenes** (optional array): snake_case unique id, existing
room, rect inside that room, known kind (monster | ambush | scene | pickup | reveal), numeric facing_deg; WARN when fewer
than 8 scenes, when a description is missing or a scene sits in a non-enterable room.

The PASS line also carries the gate-1 pacing numbers: **exploration estimate** =
(corridor centre lines [`corridor_*` rooms, longer axis] x 2 + per enterable non-corridor room (2 x shorter axis + 300)) /
`movement.player.walk_speed_cms` / 60 x 1.6, WARN outside 8-12 minutes; the **critical-path walk** (centre to centre through
the connecting door/open centre, or both duct mouths + tube); and the **junction count** (critical-path `corridor_*` rooms with
>= 3 passable connections). The gate-0 plan reads ~1.2 min / 49 m / 2 junctions.

`check_manifest.mjs`: pairwise AABB overlap of visible collision boxes (tolerance 0.5 cm, kinds `collapse`/`boundary`
whitelisted), unique names, UE transform consistency, hidden boundary present, **enclosure** and the **money shot**: from the
CEO door centre at eye height looking at the window, the horizontal angle the window subtends; PASS when the part inside the
90 deg FOV covers >= 60 %. Marker kinds (no collision) are ignored by every check.

**Enclosure** (gate-1 brief): for every visible `floor` slab - the 12 office rooms and the gym hall slab alike - the tallest
`ceiling` box over it sets the height H; a ceiling must cover the whole floor rect at H + 1 cm (25 cm sample grid); and each of
the four sides, probed 1 cm outside the floor edge every 5 cm along and every 10 cm up to H, must be solid (a visible collision
box other than the hidden boundary) or inside an authored hole from `meta.openings` (doors, opens, duct mouths, windows,
infilled locked / elevator doors, grown 1 cm). An uncovered run wider than 30 cm on any z row is a FAIL naming the floor,
side, width, span and height. Proven negative on 2026-09-06: removing one break-room wall -> `775 cm gap`; removing the gym's
hall ceiling -> `41840 sample(s) uncovered`; removing a hall wall -> `4395 cm gap`.

## Engine scripts (need UE 5.8)

| Script | What it runs |
|---|---|
| `Tools\ue\run_editor_script.ps1 -Script build_greybox.py [-Mode Commandlet\|Editor] [-ExtraArgs a,b] [-NoCode]` | `UnrealEditor-Cmd.exe <project>.uproject -run=pythonscript -script=<abs> -stdout -FullStdOutLogOutput -unattended -nosplash -nopause` (or `-ExecutePythonScript=` for Editor mode). Extra args travel in `HF_ARGS`. stdout is tailed live to the console. Exit 1 on engine missing, non-zero exit, `FAILED:` or `LogPython: Error`. Log: `Saved\Logs\HF_<script>.log`. **Code-free twin:** when `Binaries\Win64\UnrealEditor-Hellfall.dll` is missing, or `-NoCode` is passed, the wrapper writes `HellfallNoCode.uproject` next to `Hellfall.uproject` (same JSON minus `Modules`, `Description` marked TEMPORARY), runs against it and deletes it in a `finally` block - map generation needs only the Python plugin, never the game module. The twin is git-ignored and must never be committed; do not start two wrapper runs at once (they would share it). First proven 2026-09-06: 249 actors, `Success - 0 error(s)`, 32 s. |
| `Tools\generate_project_files.ps1` | `Build.bat -projectfiles -project=... -game -rocket -progress` on a Launcher engine (`Engine\Build\InstalledBuild.txt` present), `-engine` on a source build - the same rule as Epic's `DesktopPlatformBase::GenerateProjectFiles`. |
| `Tools\build_editor.ps1 [-Target HellfallEditor] [-Configuration Development]` | `Build.bat HellfallEditor Win64 Development -project=... -waitmutex` |
| `Tools\package.ps1 [-Configuration Development\|Shipping] [-Tag gate-0] [-SkipEditorCompile] [-IncludeDebugFiles] [-Clean]` | `RunUAT.bat BuildCookRun ... -build -cook -stage -pak -archive -archivedirectory=Builds\<tag> -nop4 -utf8output -unattended -nodebuginfo`; copies `Data\` to `Builds\<tag>\Windows\Hellfall\Data`; writes `Launch-FeelGym.cmd` (`Hellfall.exe /Game/Maps/L_FeelGym`) and `BUILD-INFO.txt`; zips to `Builds\Hellfall-<tag>-Win64-<cfg>.zip` with .NET `ZipFile` (no 2 GB-per-entry limit, unlike PS 5.1 `Compress-Archive`); prints size + SHA256; warns > 1.9 GB. |
| `Tools\release.ps1 -Tag gate-N[.M] [-Draft] [-Prerelease]` | `gh release create <tag> <zip> --title <tag> --notes-file GATE-N-NOTES.md`; refuses without the zip or the notes. |
| `Tools\setup_toolchain.ps1 [-Run]` | prints the exact winget commands (VS 2022 Build Tools + VCTools + Win11 SDK 26100 + .NET 4.8 SDK / 4.7.2 targeting pack, .NET 8 SDK, Blender) and the Epic Launcher steps; `-Run` executes section A, refusing when not elevated. |

Engine resolution (`_engine.ps1`), first hit wins and the winning source is printed once
(`HELLFALL: Unreal Engine 5.8 = <root> (resolved from ...)`):
`$env:UE_ROOT` -> `C:\Program Files\Epic Games\UE_<ver>` accepted only when its `Engine\Build\Build.version` says
`Major.Minor == <ver>` (the Launcher had not written its registry key or `LauncherInstalled.dat` on 2026-09-06)
-> `HKLM:\SOFTWARE\EpicGames\Unreal Engine\<ver>\InstalledDirectory` -> `HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds`
(matched via `Build.version`). A missing engine fails with the pointer to `Docs/TOOLCHAIN-SETUP.md`, Step 1.

### Decisions baked into the emitter (hf_common.py)

* Maps are **recreated** (asset deleted, `LevelEditorSubsystem.new_level`) instead of cleaned in place, for determinism;
  if the target is the currently loaded world the emitter falls back to destroying all actors in it.
* Lights are **MOVABLE**: no lighting build in the commandlet, cheap on the iGPU with shadows off. Gate 3 redoes lighting anyway.
* One material asset per tint key under `/Game/Greybox/Materials/M_GB_<key>`; translucent for markers and glass. The asset is
  reused if present but its graph is **rebuilt every run** from the style recipe (see "Surface texture" above), including the
  blend mode, so a tint edit or the new texture always reaches the map.
* Labels are single `TextRenderActor`s, yawed so the readable face (local +X) points at the label's viewer point. Colours are
  passed as `unreal.Color(r=, g=, b=, a=)` keywords: `FColor` is declared B, G, R, A, so positional arguments would swap red and blue.
* Symbols exercised by the 2026-09-06 commandlet runs (materials incl. translucent, static mesh component, text render,
  point light candela units) and the packaged-run frames (TextRender readable side) are marked `VERIFIED 5.8.2`; symbols checked
  against the installed 5.8 headers/sources but not yet run (`delete_all_material_expressions`, `delete_material_expression`,
  `set_material_function`, `connect_material_expressions` pin matching, `BlendMode.BLEND_OPAQUE`) are marked `VERIFIED 5.8 header`;
  what remains carries `TODO(VERIFY 5.8)` (sky-light recapture, the fill-light property names `use_inverse_squared_falloff` /
  `light_falloff_exponent` / `LightUnits.UNITLESS`, the first live run of the textured material graph) and uses the most
  conservative call with a flat fallback.

## Adding a new element type

1. Add the numbers to `Data/metrics.json` (dimensions) or `Data/greybox_style.json` (looks / spacing) - never to a script.
2. Emit `Box`/`Label`/`Light` dataclasses in `hf_geometry.py` (give the box a `kind`, a deterministic name, a folder).
3. Run `Tools\test_dry_run.ps1`; `validate_geometry` will tell you if it overlaps or blocks a hole.
4. No emitter change is needed unless it is a new actor class.
