# Tools/ - HELLFALL build, level-generation and validation scripts

Everything under `Tools/` is text. The maps under `/Game/Maps` are **generated** from JSON under `Data/`;
nobody hand-edits a `.umap`. Rob's feedback becomes a JSON edit, a re-run, a rebuild.

```
Tools/
  ue/hf_geometry.py         pure Python: Data/*.json -> boxes/labels/lights/PlayerStart (no `unreal` import)
  ue/hf_common.py           emitters: ManifestEmitter (JSON, engine-free) and UnrealEmitter (editor)
  ue/build_greybox.py       /Game/Maps/L_ExecutiveFloor from Data/floorplan.json          (REQ-G1-005/006/007)
  ue/build_feel_gym.py      /Game/Maps/L_FeelGym from Data/metrics.json "feel_gym"        (REQ-G1-004)
  ue/run_editor_script.ps1  runs a .py inside UnrealEditor-Cmd (commandlet or full editor)
  ue/_engine.ps1            dot-sourced helper: engine/Python/node resolution, process runner
  validate_floorplan.mjs    node: schema + geometry + adjacency + money-shot checks on a floor plan
  check_manifest.mjs        node: overlap / boundary / money-shot checks on a dry-run manifest
  test_dry_run.ps1          engine-free regression: determinism + all checkers (run this before every commit)
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

Nothing in the dry-run path needs the engine.

## The loop: Rob's feedback -> edit JSON -> rerun

1. Rob says "the corridor feels like a tunnel" / "door 120 is the one" / "closet ceiling lower".
2. Edit the data, never the map:
   * body & controls -> `Data/movement.json` (read by `UHellfallTuning` at runtime; a packaged build picks it up from `Hellfall\Data\`)
   * architecture numbers (door, corridor, ceilings, duct, wall, figure) -> `Data/metrics.json`
   * room rects, openings, duct, markers, encounters, money shot -> `Data/floorplan.json` (schema: `Docs/FLOORPLAN-SCHEMA.md`)
   * tints, light intensities, label sizes, marker sizes, feel-gym spacing -> `Data/greybox_style.json`
3. `Tools\test_dry_run.ps1` - must print `all steps passed`. It runs the generator twice (identical SHA256 = deterministic),
   validates the plan, checks the manifests for overlaps and the money-shot framing. Fix until green.
4. With the engine installed: `Tools\ue\run_editor_script.ps1 -Script build_greybox.py` and
   `Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py`. The maps are recreated from scratch every time
   (deleted and regenerated, so the result is a pure function of the JSON - REQ-G1-005 AC3).
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
* **Reference figure** per room: 50 x 30 x 160 body + 20 cm head = 180 exactly. **Room label** (name, size, ceiling) at 250 cm,
  double-sided. **Note** labels (Gate 2 intent) smaller and dimmer. **Checkpoints** flat green discs; **encounters** translucent
  trigger / spawn / retreat / strafe lanes; **dwell zone** translucent blue - all visible, no collision.
* **One point light per room** (movable, no shadows, candela + colour temperature by role), radius from the room diagonal.
* **Boundary**: seven hidden collision-only boxes (4 walls + lid + bottom + safety slab 50 cm under the floor).
* `validate_geometry` refuses to emit when visible collision boxes overlap (> 0.5 cm), when a hole is not exactly its
  requested size (probes just outside every edge must be solid, inside must be empty), when a room lacks its figure/label/light,
  or when a room perimeter has a gap.

Actor names are deterministic (`Wall_break_room_west_01`, `Header_door_break_to_corridor`, `Duct_duct_supply_to_break_floor`,
`Collapse_collapse_02`, `Figure_ref_break_room_body`, `Light_ceo_office`, ...) and sorted by (folder, name).

### Feel gym (build_feel_gym.py)

Two rows of stations on a 60 x 40 m slab (`greybox_style.feel_gym.station_rows/row_y_cm`): doorways 90/110/120/140,
corridors 200/260/320 (10 m, ceiling 310), rooms 5 x 5 m at ceilings 270/300/350 with a 120 door, jump ledges 40..120,
a 9-step ramp with risers 20 -> 60 (each labelled), crawl tunnels 90/100/110 high. A 180 cm figure stands beside every element,
every element is labelled with its dimension, the player starts at the near edge facing the stations (+X).
Sun + sky light plus point lights inside enclosed pieces.

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
money shot: window wall opposite the entry door, exterior, dwell rect inside and within 150 cm of the window, dividing
wall partial and off the door-centre -> window-centre sightline.

`check_manifest.mjs`: pairwise AABB overlap of visible collision boxes (tolerance 0.5 cm, kinds `collapse`/`boundary`
whitelisted), unique names, UE transform consistency, hidden boundary present, and the **money shot**: from the CEO door
centre at eye height looking at the window, the horizontal angle the window subtends; PASS when the part inside the
90 deg FOV covers >= 60 %.

## Engine scripts (need UE 5.8)

| Script | What it runs |
|---|---|
| `Tools\ue\run_editor_script.ps1 -Script build_greybox.py [-Mode Commandlet\|Editor] [-ExtraArgs a,b]` | `UnrealEditor-Cmd.exe Hellfall.uproject -run=pythonscript -script=<abs> -stdout -FullStdOutLogOutput -unattended -nosplash -nopause` (or `-ExecutePythonScript=` for Editor mode). Extra args travel in `HF_ARGS`. Exit 1 on engine missing, non-zero exit, `FAILED:` or `LogPython: Error`. Log: `Saved\Logs\HF_<script>.log`. |
| `Tools\generate_project_files.ps1` | `Build.bat -projectfiles -project=... -game -engine -progress` |
| `Tools\build_editor.ps1 [-Target HellfallEditor] [-Configuration Development]` | `Build.bat HellfallEditor Win64 Development -project=... -waitmutex` |
| `Tools\package.ps1 [-Configuration Development\|Shipping] [-Tag gate-0] [-SkipEditorCompile] [-IncludeDebugFiles] [-Clean]` | `RunUAT.bat BuildCookRun ... -build -cook -stage -pak -archive -archivedirectory=Builds\<tag> -nop4 -utf8output -unattended -nodebuginfo`; copies `Data\` to `Builds\<tag>\Windows\Hellfall\Data`; writes `Launch-FeelGym.cmd` (`Hellfall.exe /Game/Maps/L_FeelGym`) and `BUILD-INFO.txt`; zips to `Builds\Hellfall-<tag>-Win64-<cfg>.zip`; prints size + SHA256; warns > 1.9 GB. |
| `Tools\release.ps1 -Tag gate-N[.M] [-Draft] [-Prerelease]` | `gh release create <tag> <zip> --title <tag> --notes-file GATE-N-NOTES.md`; refuses without the zip or the notes. |
| `Tools\setup_toolchain.ps1 [-Run]` | prints the exact winget commands (VS 2022 Build Tools + VCTools + Win11 SDK 26100 + .NET 4.8 SDK / 4.7.2 targeting pack, .NET 8 SDK, Blender) and the Epic Launcher steps; `-Run` executes section A, refusing when not elevated. |

Engine resolution (`_engine.ps1`): `$env:UE_ROOT` -> `HKLM:\SOFTWARE\EpicGames\Unreal Engine\<EngineAssociation>\InstalledDirectory`
-> `HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds` (matched via `Build.version`) -> `C:\Program Files\Epic Games\UE_<ver>`.
A missing engine fails with the pointer to `Docs/TOOLCHAIN-SETUP.md`, Step 1.

### Decisions baked into the emitter (hf_common.py)

* Maps are **recreated** (asset deleted, `LevelEditorSubsystem.new_level`) instead of cleaned in place, for determinism;
  if the target is the currently loaded world the emitter falls back to destroying all actors in it.
* Lights are **MOVABLE**: no lighting build in the commandlet, cheap on the iGPU with shadows off. Gate 3 redoes lighting anyway.
* One material asset per tint key under `/Game/Greybox/Materials/M_GB_<key>`; translucent for markers and glass; reused if present.
* Labels are `TextRenderActor`s, spawned twice (yaw 0/180) when `double_sided`.
* Symbols not yet verified against a running 5.8 editor carry `TODO(VERIFY 5.8)` comments; each uses the most conservative call.

## Adding a new element type

1. Add the numbers to `Data/metrics.json` (dimensions) or `Data/greybox_style.json` (looks / spacing) - never to a script.
2. Emit `Box`/`Label`/`Light` dataclasses in `hf_geometry.py` (give the box a `kind`, a deterministic name, a folder).
3. Run `Tools\test_dry_run.ps1`; `validate_geometry` will tell you if it overlaps or blocks a hole.
4. No emitter change is needed unless it is a new actor class.
