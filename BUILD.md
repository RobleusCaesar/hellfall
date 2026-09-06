# BUILD.md - decision log

Required by spec ground rule G-5 and REQ-G1-001 / REQ-G6-007. This file records the exact build identity, the review machine, every decision the specification left to the agent, every Blueprint (none), the asset working set, third-party licences, and a dated change log. It is updated at every gate and never rewritten from scratch.

---

## 1. Build identity

| Component | Version | State on the build machine, 2026-09-06 |
|---|---|---|
| **Unreal Engine** | **5.8.2** - `C:\Program Files\Epic Games\UE_5.8\Engine\Build\Build.version`: MajorVersion 5, MinorVersion 8, PatchVersion 2, Changelist **56702186**, CompatibleChangelist 55116800, branch `++UE5+Release-5.8`. Recorded at install on 2026-09-06 and **never changed mid-project (G-1)**. 5.8 was released 2026-06-17 and is Epic's last planned UE5 major. | **Installed 2026-09-06** through the Epic Games Launcher at `C:\Program Files\Epic Games\UE_5.8`; `UnrealEditor-Cmd.exe`, `RunUAT.bat`, `Build.bat`, `Engine\Plugins\Experimental\PythonScriptPlugin` and the embedded Python 3.11.8 are all present. **Registry caveat:** the Launcher has not (yet) written `HKLM\SOFTWARE\EpicGames\Unreal Engine\5.8` and `LauncherInstalled.dat` still lists no installation, so engine resolution must also try the default folder `C:\Program Files\Epic Games\UE_<EngineAssociation>` and `$env:UE_ROOT` (`Tools/ue/_engine.ps1` tries `UE_ROOT`, then the default Launcher folder - accepted only when its `Engine\Build\Build.version` matches - then HKLM, then HKCU source builds). |
| Blender | 5.2.1 LTS (blender.org) | Installed at `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe`. Needed from Gate 2. |
| Visual Studio 2022 Build Tools | 17.14; MSVC v14.4x/14.50 x64; Windows SDK 10.0.26100 (`VCTools` workload) | **Not installed.** Two winget attempts on 2026-09-06 were cancelled at the UAC prompt (installer exit 1602; the agent cannot elevate, and the Microsoft Store does not carry the package). Rob installs it by either route in `Docs/TOOLCHAIN-SETUP.md` step 2: the elevated winget one-liner, or the Build Tools installer from visualstudio.microsoft.com with "Desktop development with C++" + Windows 11 SDK 10.0.26100. Until then nothing C++ can compile: no `HellfallEditor` build, no cook or package of the real project. |
| .NET SDK | 8.0.424 (UnrealBuildTool / UAT host) | Installed at `C:\Program Files\dotnet\sdk`. |
| Python (tooling) | 3.12.10 at `C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe` (not on PATH) | Installed. Runs `Tools/ue/*.py` in manifest (dry-run) mode. |
| Python (UE-embedded) | 3.11.8, ships inside UE 5.8 (`Engine\Binaries\ThirdParty\Python3\Win64`) | Present with the engine. Ran `Tools/ue/build_greybox.py` and `build_feel_gym.py` inside the editor on 2026-09-06 (section 1.1). |
| node | v24.14.0 | Installed. Runs `Tools/validate_floorplan.mjs`, `Tools/check_manifest.mjs`, `Tools/glb_audit.mjs`. |
| git / git-lfs / gh | 2.53.0.windows.1 / 3.7.1 / 2.87.3 (authenticated as RobleusCaesar; scopes gist, read:org, repo, workflow) | Installed. |
| winget | 1.29.290 | Installed. |

**C++ state:** nothing has been compiled (Build Tools not installed). The module had one source-level review against the installed 5.8 engine sources on 2026-09-06 and four fixes from it (`Source/Hellfall/README-SOURCE.md`): the Enhanced Input mapping is built from the tuning subsystem in `SetupPlayerInputComponent`, so `Data/movement.json` binds and `invert_y` reach the mapping on first load and after every F1 toggle (before, possession ran before `BeginPlay` and baked the compiled defaults in); `UHellfallMovementComponent` applies the tuning at `InitializeComponent` (spawn, before possession); both targets use `BuildSettingsVersion.V7` (= `Latest` in 5.8); focus regain while paused re-applies the paused input mode so alt-tab cannot lock the game. Every C++ file was written against the UE 5.8 API by inspection; the remaining `// TODO(VERIFY 5.8): ...` markers (one in `Source/`: the mouse pitch sign) are listed in `GATE-0-NOTES.md` section 6. **Editor-script state:** verified on 5.8.2, see 1.1. **Pipeline state:** cook, stage, pak and archive proven once on the code-free twin, see 1.2; the real project has not been packaged and `Tools/package.ps1` has not run.

### 1.1 First editor run (2026-09-06)

The level generators ran headlessly on the real engine without the C++ module, using a temporary code-free twin project `HellfallNoCode.uproject` (identical to `Hellfall.uproject` with the `Modules` array removed; git-ignored, deleted after use). Command, from the repository root:

```
"C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe" C:\Users\tc_ca\projects\hellfall\HellfallNoCode.uproject -run=pythonscript -script=C:\Users\tc_ca\projects\hellfall\Tools\ue\build_greybox.py -stdout -FullStdOutLogOutput -unattended -nosplash -nopause -NoLiveCoding
```

Result (`Saved/Logs/hf_greybox_warmup.log.stdout.txt`, `grep LogPython`): `LogInit: Engine Version: 5.8.2-56702186+++UE5+Release-5.8`; `LogPython: Using Python 3.11.8`; `LogPython: HELLFALL greybox build: unreal / actors : 249 / warnings : none / OK`; `LogPythonScriptCommandlet: Display: Python script executed successfully`; `LogInit: Display: Success - 0 error(s), 0 warning(s)`; process exit code 0; about 32 s wall time. Output: `Content/Maps/L_ExecutiveFloor.umap` (486,684 bytes) and 24 `Content/Greybox/Materials/M_GB_*.uasset`. The same command with `build_feel_gym.py` (`Saved/Logs/hf_feelgym_warmup.log.stdout.txt`) wrote `Content/Maps/L_FeelGym.umap` (355,920 bytes): 171 actors, the same success lines, exit code 0.

What this proves: the `unreal` API calls in `Tools/ue/hf_common.py` work on 5.8.2 as written (level create/save, `StaticMeshActor` with `/Engine/BasicShapes/Cube`, one Material per tint, `TextRenderActor`, `PointLight` / `DirectionalLight` / `SkyLight`, `PlayerStart`); `sys.exit(0)` at the end of a `-run=pythonscript` commandlet exits the process with code 0; PythonScriptPlugin and EditorScriptingUtilities load in the commandlet. Not proven: non-zero exit propagation (`sys.exit(1)`); visual correctness (sky-light recapture, label facing) until the maps are opened. On the strength of this run the tools owner replaced five `TODO(VERIFY 5.8)` markers in `hf_common.py` with `VERIFIED 5.8.2` notes; the remaining markers are listed in `GATE-0-NOTES.md` section 6. Consequence: map generation is decoupled from the C++ build; `Tools/ue/run_editor_script.ps1 -NoCode` makes the twin-project run a supported mode (decision 3.20).

### 1.2 Pipeline proof (2026-09-06) - cook, stage, pak and archive on the code-free twin

To prove the packaging pipeline before the compiler exists, the lead ran UAT `BuildCookRun` (`-platform=Win64 -clientconfig=Development -cook -stage -pak -archive -nodebuginfo`) against a **code-free twin** of the project: `Saved/NoCodeTwin/HellfallNoCode.uproject`, the same JSON as `Hellfall.uproject` minus `Modules`, with directory junctions to the repository's `Content/` and `Config/`. The twin has to live in its own folder because UAT treats any folder containing `Source/` as a code project and would try to compile it. Result (`Saved/Logs/uat_pipeline_test2.log.stdout.txt`): **BUILD SUCCESSFUL, 0 errors, 176 s** (about 3 minutes); 596 MB staged - `UnrealGame.exe` 316 MB, `HellfallNoCode-Windows.ucas` 169 MB, `.pak` 10.6 MB, 1737 files - archived under `Builds/pipeline-test/` (git-ignored). The packaged `HellfallNoCode.exe` ran on this laptop's Vega iGPU under DX12 SM6 and loaded `L_ExecutiveFloor`. It uses the engine's default pawn because the `Hellfall` module is not compiled; the log line `Failed to find object 'Class /Script/Hellfall.HellfallGameMode'` is expected in that twin.

What this proves: the cook of both maps and the 24 greybox materials, the pak/iostore step, the staging layout and the archive step all work on 5.8.2 with this `Config/`, and the `DefaultEngine.ini` RHI choice (DX12, SM6) runs on the review machine. What it does not prove: anything about the C++ module, `Tools/package.ps1` itself (which adds `-build`, stages `Data/`, writes `Launch-FeelGym.cmd` and zips), or the gate-0 test in `GATE-0-NOTES.md` section 5 (first-person controller, F1, `Launch-FeelGym.cmd`) - none of that exists in a twin. **This is a pipeline proof only, not a gate-0 candidate: gate-0 stays on the compiled project.**

---

## 2. Review machine and the lighting-path decision (G-6, G-7)

Copied from `Docs/audit/environment-2026-09-05.md`. **This is the machine the agent runs on. Rob must confirm it is also the review machine**; if the review machine is a different, discrete-GPU PC, this section is rewritten and the lighting decision below is revisited before Gate 3.

| Item | Value |
|---|---|
| CPU | AMD Ryzen 7 7730U with Radeon Graphics, 8 cores / 16 threads (Zen 3, laptop U-class) |
| RAM | 15.4 GB usable |
| GPU | AMD Radeon (TM) Graphics - integrated Vega 8 class iGPU, 512 MB dedicated VRAM reported, shared system memory; driver 31.0.21924.1004 |
| Display | Samsung S27D390 external, 1920x1080 @ 60 Hz |
| Disk | C: 194 GB free of 456 GB; G: (Google Drive) 60 GB free of 100 GB |
| OS | Windows 11 Home 10.0.26200 |

**Decision (G-7 fallback, taken at Gate 0): no Lumen, no Nanite, no Virtual Shadow Maps. Static/baked lighting path, DX12 with Shader Model 6, TAA (not TSR), motion blur off.**

Rationale and citation: Epic's UE 5.8 hardware and software specifications state that Lumen Global Illumination and Reflections require an NVIDIA RTX 2000 series or newer, an AMD RX 6000 series or newer, or an Intel Arc GPU, and that Nanite requires Shader Model 6.6 with 64-bit atomics. A Vega-class integrated GPU meets neither, so the spec's default (Lumen, fall back if it misses 60 fps) is decided in advance rather than measured: Lumen would not run acceptably at 1920x1080 on this machine. Consequences:

- Gate 1 greybox lighting is even fill lighting (**Movable** non-inverse-square point lights, unitless intensity, one per room, no bake) with single-sided labels facing the player's approach (`Tools/README.md`), so regeneration needs no Lightmass pass and the map stays deterministic.
- From Gate 3, lighting is baked with CPU Lightmass (GPU Lightmass needs hardware ray tracing) plus stationary practicals for the flicker; reflections via reflection captures / screen-space; shadows via conventional shadow maps.
- `Config/DefaultEngine.ini` carries the project-wide switches for these choices (dynamic GI and reflection method set to none, Nanite disabled, virtual shadow maps disabled, anti-aliasing method TAA, motion blur off, DX12 default RHI with SM6 targeted). The ini is the authority; this paragraph describes intent.
- The 60 fps floor is measured on this machine with `stat fps` / `stat unit` along the critical path at every gate from Gate 1 on.

---

## 3. Decisions the specification left open

Each entry: what was decided, why, and where it lives. All values are in `Data/` and can be changed without a code edit unless stated.

| # | Decision | Rationale | Where |
|---|---|---|---|
| 3.1 | **Project created from scratch** (text files: `Hellfall.uproject`, `Source/`, `Config/`), not from the First Person template. | The agent cannot drive the editor's template wizard, and the template ships Blueprints and `.uasset` input assets that G-3 forbids. Everything the template would have given us is rebuilt in C++. | `Hellfall.uproject`, `Source/Hellfall.Target.cs`, `Source/HellfallEditor.Target.cs`, `Source/Hellfall/` |
| 3.2 | **Binds:** Space = jump, Left Ctrl = crouch toggle, **C = crawl toggle**, Left Shift = sprint (hold), E = interact, Esc = pause, F1 = feel gym. Shown on screen by `AHellfallHUD`. | The spec lets the agent choose but notes Rob's earlier prototype used C for crawl; both earlier prototypes did, so C stays. Space is jump (not crouch) because the spec's controller section fixes Space as jump. Ctrl for crouch is the FPS convention. Rob still owns final acceptance (see `GATE-0-NOTES.md`). | `Data/movement.json : binds` |
| 3.3 | **Sprint is implemented** at 600 cm/s (hold). | Gate 5's 6 m retreat lanes and Gate 2's encounter validation are meaningless if the player cannot move faster than a walk; implementing it now lets the feel gym judge it. | `Data/movement.json : player.sprint_speed_cms` |
| 3.4 | **Capsule radius 36, standing height 184; eye height 166; crouch 116; crawl 64.** | Mid-range values that satisfy every derived rule with margin (door 112 <= 120, corridor 216 <= 280, duct 64 < 95 < 116). Full rationale per row in `Docs/METRICS.md`. | `Data/movement.json : player.*` |
| 3.5 | **Door 120 x 220; corridor 280; office ceiling 310; wet rooms 280; duct 100 x 95 x 500 long; wall 20.** | As specified, mid-range, or (ceiling 310) the lower third of the range; the executive floor's duct is built 520 face to face (4 % over 500, within the 5 % rule) so both rooms stay on the 50 cm grid; the wet-room ceiling is an addition so restrooms read differently from offices. See `Docs/METRICS.md`. | `Data/metrics.json : architecture.*` |
| 3.6 | **Walk 400, jump 95, coyote 0.10 s, step 40, acceleration 1500 / braking 1800, stance blend 0.20 s.** | Mid-range; the spec's "weight, not instant velocity" is the acceleration/braking pair. | `Data/movement.json : player.*` |
| 3.7 | **Three-stance movement is a custom `UHellfallMovementComponent`; the engine's built-in crouch is not used.** | Unreal has crouch but no prone. One component owning stand/crouch/crawl with a single clearance probe and a single interpolation path is simpler than mixing engine crouch with a custom crawl, and gives one place to suppress stand-up inside the duct (REQ-G1-006). | `Source/Hellfall/` |
| 3.8 | **Enhanced Input is set up entirely in C++** (Input Actions and the Mapping Context are created at startup from `Data/movement.json`); no input `.uasset` files. | G-3: binary input assets cannot be diffed. Building them in code makes a bind change a JSON edit. | `Source/Hellfall/`, `Data/movement.json : binds` |
| 3.9 | **`Data/` is staged into the packaged build by `Tools/package.ps1`** and read at runtime by `UHellfallTuning` (a `UGameInstanceSubsystem`). | REQ-G1-003 acceptance 3 ("change walk speed in /Data/ and rebuild changes in-game speed with no code edit") is met literally: the JSON is data, not compiled in. Rob can even edit the JSON next to the `.exe`. | `Tools/package.ps1`, `Source/Hellfall/` |
| 3.10 | **Plan-space coordinate convention** for `Data/floorplan.json`: x to the right of the photo, y down the photo toward the window; `UE.X = plan.y`, `UE.Y = -plan.x`, `UE.Z` up. | Lets the digitiser work in the drawing's own frame; a player at the CEO door facing +X looks straight at the window wall (checklist item 14) and keeps the drawing's handedness. | `Docs/FLOORPLAN-SCHEMA.md`, `Tools/ue/hf_geometry.py` |
| 3.11 | **Maps are generated, never hand-edited.** `/Game/Maps/L_ExecutiveFloor` from `build_greybox.py`, `/Game/Maps/L_FeelGym` from `build_feel_gym.py`; greybox materials under `/Game/Greybox/Materials`. Output is deterministic (sorted, no timestamps, no randomness). | G-3 and REQ-G1-005 acceptance 3 (regeneration reproduces the level identically). A `.umap` regenerated from unchanged inputs should produce an identical actor list; the manifest emitter proves that without the engine. | `Tools/ue/build_greybox.py`, `Tools/ue/build_feel_gym.py`, `Tools/ue/hf_common.py` |
| 3.12 | **Greybox lighting is even fill; labels are single-sided.** One Movable point light per room with inverse-square falloff off and a unitless intensity (no light bake in Gate 1); every label is one single-sided TextRender facing the player's approach. Details and the packaged-run evidence: `Tools/README.md`. | Baked lighting would make every regeneration a Lightmass run and would put a non-deterministic lightmap `.uasset` in LFS; Movable lights cost nothing at this scale. Even fill rather than inverse-square candela because the 2026-09-06 packaged-run frames showed inverse-square fixtures blowing the ceiling out while auto-exposure swallowed the change; single-sided because a TextRender reads only from its local +X side and the earlier back-to-back twin garbled the glyphs. | `Data/greybox_style.json`, `Tools/ue/hf_common.py`, `Tools/ue/hf_geometry.py` |
| 3.13 | **Feel gym access: F1 in game toggles between the two maps; `Launch-FeelGym.cmd` next to the executable starts the gym directly.** | REQ-G1-004 acceptance 2 (reachable without editing files) two ways: in-game and from a launch option. | `Data/movement.json : binds.toggle_feel_gym`, `Data/levels.json`, `Tools/package.ps1` |
| 3.14 | **Level registry** `Data/levels.json`: `executive_floor -> /Game/Maps/L_ExecutiveFloor` (order 10), `feel_gym -> /Game/Maps/L_FeelGym` (order 900, hidden). Each entry carries `id`, `display_name`, `map`, `order` and optional `hidden`. | Started now so the F1 toggle and Gate 6's level manager read the same file (REQ-G6-006); `UHellfallTuning` already loads it. | `Data/levels.json` |
| 3.15 | **Repository `RobleusCaesar/hellfall`, public, default branch `main`.** | The spec requires a public GitHub repository. Created 2026-09-06 by the lead with `gh` (authenticated as RobleusCaesar): origin = https://github.com/RobleusCaesar/hellfall, `main` pushed at the baseline commit `2c27652`, LFS push 123 objects / 113 MB. | `.git`, `GATE-0-NOTES.md` |
| 3.16 | **Git LFS plan.** LFS tracks only (a) generated engine binaries under `Content/` and (b) the supplied bundle under `SourceAssets/`; nothing else binary enters the repo. Current LFS payload: `SourceAssets/` 109.9 MiB = 115.3 MB (reference images 42.2 MiB, models 23.3, textures 22.9, audio 20.1, video 1.4) plus the generated `.umap`/`.uasset` (about 1 MB at Gate 0: two maps and 24 greybox materials) - **about 115-120 MB**. Maps are committed at gate tags only, not per iteration, because every regenerated `.umap` is a new LFS object. | GitHub Free has historically included **1 GB of LFS storage and 1 GB of bandwidth per month**; GitHub has announced larger free quotas (10 GiB each) - the live figure is on the billing page and must be checked before Gate 2. **Every fresh clone pulls ~110 MB of LFS objects**, so on the 1 GB figure about nine clones a month exhaust bandwidth. Mitigations, in order: (1) clone with `GIT_LFS_SKIP_SMUDGE=1 git clone ...` then `git lfs pull --include="Content/**"` when only the playable content is needed; (2) sparse checkout excluding `SourceAssets/reference/` (38% of the payload and only for humans); (3) if a competing agent also clones this repository, or Gate 4 FBX exports push the payload past ~300 MB, buy one GitHub LFS data pack (50 GB storage + 50 GB bandwidth) or move `SourceAssets/` to a Release asset. The first push (2026-09-06) uploaded 123 LFS objects / 113 MB (126 tracked files; byte-identical duplicates share one object). Rob decides the quota plan before Gate 1 pushes. | `.gitattributes`, `.gitignore` |
| 3.17 | **Gate builds are Development configuration with `IncludeDebugFiles=False`** (no PDBs staged); the final is Shipping. | G-6 asks for Development at gates and Shipping at the end. Without PDBs a Development Windows build stays well under GitHub's 2 GB per-file Release limit (a greybox project packages to roughly 400-900 MB). If a later gate exceeds 2 GB the `.zip` is split, never committed. | `Tools/package.ps1` |
| 3.18 | **No Blender work before Gate 2.** The 17 GLBs are left exactly as supplied (wrong scale, see section 5); real-world rescale, pivots and collision happen in the scripted Blender pass at Gate 2/4. | G-1 and the gate protocol: Gate 1 is greybox only, and rescaling now would be work on unapproved scope. | `Docs/ASSET-MANIFEST.md` |
| 3.19 | **Lighting path** - see section 2. | | `Config/DefaultEngine.ini` |
| 3.20 | **Map generation runs without the C++ module (code-free twin).** `Tools/ue/run_editor_script.ps1 -NoCode` writes `HellfallNoCode.uproject` (= `Hellfall.uproject` minus `Modules`), runs the pythonscript commandlet against it and deletes it afterwards; the twin is git-ignored and `Hellfall.uproject` itself is never touched. | A C++ project whose module binary is missing stops at the editor's missing-module check, which cannot be satisfied without a compiler. The generators use only engine classes, so a code-free twin produces the same map. This decouples level iteration from compiler availability and proved the whole Python path on 5.8.2 the day the engine landed (section 1.1). Once `Binaries\Win64\UnrealEditor-Hellfall.dll` exists the normal project is used and the output is expected to be identical. For UAT (cook/stage/pak) a twin cannot sit in the repository root, because UAT treats any folder containing `Source/` as a code project; the pipeline proof (1.2) therefore used a twin in its own folder, `Saved/NoCodeTwin/` (git-ignored), with junctions to `Content/` and `Config/`. | `Tools/ue/run_editor_script.ps1`, `.gitignore` |
| 3.21 | **`AndroidFileServer` plugin disabled in `Hellfall.uproject`.** | The project is Windows-only (G-6, `TargetPlatforms`), and with the plugin enabled the editor appended an `[/Script/AndroidFileServerEditor.AndroidFileServerRuntimeSettings]` block (with a generated `SecurityToken`) to the tracked `Config/DefaultEngine.ini` on every launch, contradicting the file's "every non-default explained" rule and churning the diff. Disabling it at the source stops the write; the block was removed from the ini and the header says why. | `Hellfall.uproject`, `Config/DefaultEngine.ini` |
| 3.22 | **Reference figures have no collision.** | They are scale references, not obstacles. Several stand 25-60 cm from walls (the corridor figure 25 cm off the south wall), and with collision on the REQ-G1-007 wall-slide would catch on them and Rob would report a defect that was by design. `reference_figure.collision` in `Data/greybox_style.json` records the choice; the lead applies it and regenerates. | `Data/greybox_style.json`, `Docs/METRICS.md` |

---

## 4. Blueprints

G-3 permits Blueprints only where the engine gives no text alternative, and requires every one to be listed here with its purpose and a prose description of its logic.

| Blueprint asset | Purpose | Logic (prose) |
|---|---|---|
| *(none)* | | |

**Statement:** as of Gate 0 the project contains **zero Blueprint assets**. Gameplay, input, HUD and the game mode are C++; levels are Python-generated. The first Blueprints expected are Animation Blueprints for the two demons at Gate 4/5 (or direct montage playback from C++ if that proves sufficient); they will be added to this table when they exist.

---

## 5. Asset working set (REQ-G2-001 preview - Gate 2 preparation, not Gate 2 delivery)

**Labelled clearly: this is preparatory.** REQ-G2-001 requires opening each model in Blender, measuring it, and recording the choice; that happens after Gate 1 approval. What follows is everything that could be learned from the files without Blender (`Tools/glb_audit.mjs` -> `Docs/audit/glb_audit.jsonl`) plus dimension **proposals** for Rob and the Gate 2 pass to confirm. The complete per-file list (all 126 files) is `Docs/ASSET-MANIFEST.md`.

**Provenance.** `SourceAssets/` is already the de-duplicated working set from Rob's Godot attempt (`RobleusCaesar/hellfallGPT`): one candidate per slot, no ` - Copy` files, `Meshy_AI_*` prefixes and the `deamon` misspelling already renamed, GLBs decimated with glTF-Transform 4.5.0. The raw 2.8 GB Meshy bundle (with `shotgun2`, `ceo_dead2`, the third demon) is not on this machine, so "rejected - reason" rows cannot be produced for it; the Godot-era selection is inherited.

**The normalisation problem.** Every GLB was scaled so that its longest axis is about 1.9 m, whichever axis that is (doors, fridge and elevator are 1.9 tall; the shotgun and vanity are 1.9 long; the corpses are 1.9 long along Z), and both rigged demons are **0.017 m tall - about 100x too small**. No dimension below can be read off the raw bounds; the "real-world target" column is what the Blender pass will scale each asset to.

### 5.1 Meshes (17)

| Source file | Proposed Unreal name | Tris | Raw bounds X x Y x Z (m) | Rig / animation clips | Real-world target (cm) - **proposed, confirm in Blender at Gate 2** | Gate 4 class budget |
|---|---|---:|---|---|---|---|
| `models/props/reception_desk.glb` | SM_ReceptionDesk | 7,798 | 1.896 x 1.330 x 1.888 | static | 180 W x 80 D x 110 H counter; reused as the CEO desk (REQ-G2-002) | Large furniture <= 8,000: OK |
| `models/props/kitchen_lunch_table.glb` | SM_KitchenLunchTable | 7,806 | 1.899 x 1.063 x 1.349 | static | round table 120 dia x 75 H; with chairs the set is ~190 x 135 footprint | Large furniture: OK |
| `models/props/refrigerator_open.glb` | SM_RefrigeratorOpen | 7,792 | 0.919 x 1.902 x 1.303 | static | 70 W x 70 D x 180 H; the open door adds ~60 D (raw depth 1.303 confirms the door is modelled open) | Large furniture: OK |
| `models/props/bathroom_vanity.glb` | SM_BathroomVanity | 7,794 | 1.903 x 0.854 x 0.418 | static | 190 W x 55 D x 85 H | Large furniture: OK |
| `models/props/toilet_bowl.glb` | SM_ToiletBowl | 3,798 | 1.634 x 1.896 x 1.685 | static | 40 W x 70 D x 78 H. Raw bounds are near-cubic, which a toilet is not - the file may include a stall partition; inspect | Small prop <= 4,000: OK |
| `models/props/mop_and_bucket.glb` | SM_MopAndBucket | 3,791 | 1.644 x 1.893 x 1.267 | static | mop handle 140 H, bucket 40 dia x 35 H; set ~90 x 70 footprint | Small prop: OK |
| `models/props/ceo_couch_coffee_table.glb` | SM_CeoCouchCoffeeTable | 8,126 | 1.901 x 0.543 x 1.721 | static | set footprint 190 x 170; couch seat 45 H, back 85 H; table 45 H. Raw height/width ratio (0.29) implies only ~55 H at that footprint - proportions conflict, resolve in Blender (possibly two pieces) | Large furniture <= 8,000: 1.6% over (tolerance 20%) |
| `models/props/closed_door.glb` | SM_ClosedDoor | 3,806 | 0.882 x 1.903 x 0.145 | static | leaf 90 W x 205 H x ~5 thick, set inside the 120 x 220 opening (frame fills the rest). Raw ratio 0.46 matches 90/205 = 0.44 | Door <= 4,000: OK |
| `models/props/broken_door.glb` | SM_BrokenDoor | 4,012 | 1.902 x 0.107 x 0.986 | static | lying flat: 205 L x 90 W x ~10 thick (splintered) | Door <= 4,000: 0.3% over (tolerance 20%) |
| `models/props/closed_elevator.glb` | SM_ClosedElevator | 3,790 | 1.163 x 1.903 x 0.178 | static | 140 W x 220 H doors plus frame, ~25 D; matches the floor plan's `elevator_doors` blocker (140 x 220). Raw ratio 0.61 vs 0.64 | Fixture <= 4,000: OK |
| `models/weapons/shotgun.glb` | SM_Shotgun | 23,818 | 1.902 x 0.355 x 0.099 | static | 120 L pump shotgun; pivot muzzle-back-along-barrel. Same mesh for viewmodel and world pickup; the world copy wants an LOD | Hero weapon <= 25,000: OK |
| `models/characters/man_sitting.glb` | SM_ManSitting | 9,506 | 1.284 x 1.128 x 1.905 | static (posed) | seated ~130 H, ~80 W, legs ~110 D; his back must contact the supply racks (REQ-G4-003) | Human prop <= 10,000: OK |
| `models/characters/intern_sitting.glb` | SM_InternSitting | 9,846 | 1.041 x 1.900 x 1.784 | static (posed) | seated / scrunched ~120 H; back against a wall | Human prop: OK |
| `models/characters/fallen_security_guard.glb` | SM_FallenSecurityGuard | 9,485 | 0.918 x 0.971 x 1.902 | static (posed) | ~180 L lying, ~90 W. Raw ~1:1:2 suggests slumped or half-sitting rather than flat; confirm the pose before placing the shotgun beside him | Human prop: OK |
| `models/characters/ceo_dead.glb` | SM_CeoDead (spec spells it `SM_CEODead`) | 9,479 | 1.167 x 0.538 x 1.897 | static (posed) | ~180 L lying, ~110 W with arms out, ~50 thick | Human prop: OK |
| `models/characters/ember_demon.glb` | **SK_EmberDemon** - Demon #1 | 10,418 | 0.013 x 0.017 x 0.016 | 1 skin, 24 joints; clips: Attack, Hit_Reaction, Idle_8, Shot_and_Fall_Backward, Walking | **220 H** (about 130x the raw height). Gate 5 mapping: Idle_8 -> Idle, Walking -> Chase, Attack -> Attack, Hit_Reaction -> flinch, Shot_and_Fall_Backward -> Death | Enemy <= 15,000: OK |
| `models/characters/crimson_hellfiend.glb` | **SK_CrimsonHellfiend** - Demon #2, bigger | 10,428 | 0.012 x 0.017 x 0.005 | 1 skin, 24 joints; clips: Hit_Reaction_1, Idle_5, Idle_8, Right_Hand_Sword_Slash, Running, Shield_Push_Left, Simple_Kick, Walking, dying_backwards, walking_2_inplace | **300 H** (about 176x the raw height). Raw depth 0.005 suggests a flattened rest pose or pose-dependent bounds - inspect. Gate 5 mapping: Idle_5/Idle_8 -> Idle, Walking/Running -> Chase, Right_Hand_Sword_Slash + Simple_Kick -> Attack (two variants), Hit_Reaction_1 -> flinch, dying_backwards -> Death; walking_2_inplace if root motion is stripped | Enemy: OK |

Rig integrity (REQ-G4-004 acceptance 2) cannot be judged from the file header: both demons carry one skin and 24 joints and named clips, which is the best case for Meshy output, but whether the skinning survives FBX round-trip is a Blender question at Gate 4.

### 5.2 Audio (14 files - the earlier brief said 16; the tree holds 14)

`deamon` -> `demon` is already normalised in every name. Sound Class assignments are the Gate 6 plan (REQ-G6-002).

| Source file | Proposed name | Format | Size | Use |
|---|---|---|---:|---|
| `audio/music/under_broken_steel.mp3` | MUS_UnderBrokenSteel | MP3 | 727 KB | Seamless loop under traversal (G3-004 / G6-002); class Music |
| `audio/sfx/city_fire_truck.wav` | SFX_CityFireTruck | WAV | 1.1 MB | Exterior ambience beyond the window; class Ambient |
| `audio/sfx/city_riot.wav` | SFX_CityRiot | WAV | 12.0 MB | Exterior ambience, burning city; class Ambient (largest audio file - candidate for a shorter loop) |
| `audio/sfx/demon_attack.mp3` | SFX_DemonAttack | MP3 | 54 KB | Melee attack (G5-004); class SFX, 3D |
| `audio/sfx/demon_attack_2.wav` | SFX_DemonAttack2 | WAV | 2.2 MB | Melee attack variant (the spec's `demon_attack2`); class SFX, 3D |
| `audio/sfx/demon_growl.wav` | SFX_DemonGrowl | WAV | 1.2 MB | Detection growl (G5-004); class SFX, 3D |
| `audio/sfx/demon_growl_distant.mp3` | SFX_DemonGrowlDistant | MP3 | 48 KB | Distant vocalisation, 20-60 s intervals (G3-004); class Ambient, 3D |
| `audio/sfx/monster_screech_distant.wav` | SFX_MonsterScreechDistant | WAV | 1.8 MB | Distant vocalisation, never overlapping the growl (G3-004); class Ambient, 3D |
| `audio/sfx/shotgun_blast.wav` | SFX_ShotgunBlast | WAV | 472 KB | Fire (G5-002); class SFX |
| `audio/sfx/shotgun_cocking.wav` | SFX_ShotgunCocking | WAV | 563 KB | Pump, exactly once per shot (G5-002); class SFX |
| `audio/sfx/shotgun_reloading.wav` | SFX_ShotgunReloading | WAV | 80 KB | Reload; the reload duration is this clip's length (G5-002); class SFX |
| `audio/voices/demon_i_am_death.mp3` | VO_DemonIAmDeath | MP3 | 88 KB | Optional voice line, at most once (G5-004); class SFX, 3D |
| `audio/voices/demon_i_am_the_darkness.mp3` | VO_DemonIAmTheDarkness | MP3 | 46 KB | Optional voice line, at most once; class SFX, 3D |
| `audio/voices/demon_i_will_kill_you.mp3` | VO_DemonIWillKillYou | MP3 | 35 KB | Optional voice line, at most once; class SFX, 3D |

WAV imports natively. MP3 import in UE 5.8 is expected but unverified on this machine; fallback is a WAV transcode at Gate 3/6. `// TODO(VERIFY 5.8): MP3 import.`

### 5.3 Textures, video, reference

| Group | Files | Proposed names | Notes |
|---|---|---|---|
| Per-model textures beside each GLB | 59 JPG/PNG (`*_base_color`, `*_metallic_roughness`, `*_normal`, `*_emissive`, `*_texture_0`) | `T_<Asset>_BC / _MR / _N / _E / _D0` | Loose copies of the images embedded in the GLBs. `crimson_hellfiend_texture_0_1.png` is byte-identical to `crimson_hellfiend_texture_0.png` (same MD5) - drop at Gate 2. |
| `textures/decals/` | `blood_pool.jpg`, `blood_splatter_01.jpg`, `blood_splatter_02.jpg` | T_Decal_BloodPool, T_Decal_BloodSplatter01/02 | REQ-G3-003: blood is Decal Actors, never geometry. The spec expected blood *meshes* to extract textures from; the working set already holds textures. |
| `textures/paintings/` | `wall_painting_01..05.png` | T_WallPainting01..05 | Wall dressing, Gate 3/4. |
| `textures/ui/` | `main_menu_background.png`, `hellfall_logo_reference.png` | T_UI_MainMenuBackground, T_UI_LogoReference | REQ-G6-001 main menu. |
| `video/` | `intro.ogv`, `outro.ogv` (713 / 734 KB) | MS_Intro, MS_Outro (FileMediaSource) | **Must be re-encoded to MP4/H.264 + AAC for the UE Media Framework at Gate 6** (`ffmpeg -i intro.ogv -c:v libx264 -pix_fmt yuv420p -c:a aac intro.mp4`). Placeholders per G-8. |
| `reference/` | 24 images: `game_layout.jpg` (the hand-drawn plan), `mood_before_1..4.png`, `mood_after_1..4.png` (the spec's `Before_4.png` / `After_4.png`), `base_image_*` and `base_model_*` Meshy inputs, `shotgun_reference.png`, `base_image_hands.png` | none | Never imported. |

---

## 6. Third-party and licence table (G-4)

### Shipped in or with the build

| Item | Source | Version | Licence | Used for |
|---|---|---|---|---|
| Unreal Engine, including `/Engine/BasicShapes` (Cube, Plane, Cylinder, Sphere, Cone), engine default materials and the engine's default TextRender font | Epic Games, via the Epic Games Launcher | 5.8.x (exact hotfix recorded in section 1 at install) | Unreal Engine EULA (ships with the engine; royalty terms per the EULA) | Engine; greybox primitives, reference figures and floating labels |
| Supplied asset bundle `SourceAssets/` (17 models with textures, 14 audio files, 3 decal textures, 5 paintings, 2 UI images, 2 videos, 24 reference images) | Owner-supplied by Rob. Models generated with Meshy.ai under Rob's account; audio/video/UI/mood-board provenance to be confirmed by Rob | n/a | Owner-supplied; Meshy output usable under the terms of Rob's Meshy subscription | All game content from Gate 2 on |
| *(no other third-party content yet)* | | | | Future CC0 sources for Gate 3 textures: ambientCG, Poly Haven (G-4). Fab assets only after per-asset licence check. |

### Tools (not shipped)

| Tool | Licence | Note |
|---|---|---|
| Blender 5.2.1 LTS | GPL-2.0-or-later | Tool only; its output carries no licence obligation. |
| Python 3.12 / 3.11 | PSF Licence | Tooling and editor scripting. |
| node 24 | MIT | Validators. |
| git, git-lfs, gh | GPL-2.0 / MIT / MIT | Repository operations. |
| Visual Studio 2022 Build Tools, Windows SDK, .NET SDK 8 | Microsoft licence terms (Build Tools are licensed for building open-source or with a VS licence; UE compiles under the Community/Build Tools terms) | Compiler. |
| winget | MIT | Installer. |

---

## 7. Change log

| Date | Gate | Entry |
|---|---|---|
| 2026-09-05 | 0 | Scaffold created: C++ project skeleton (`Hellfall.uproject`, targets, `Hellfall` module with character, movement component, controller, game mode, HUD, tuning subsystem), Python level generators with a no-engine manifest mode, node validators, `Data/*.json`, documentation, `.gitignore` / `.gitattributes`. Machine audited; UE 5.8 and the C++ toolchain found **not installed**; G-7 lighting fallback decided in advance (section 2). Nothing compiled or packaged; **no `gate-0` Release yet** - blocked on Rob's Epic sign-in and an Administrator prompt (`GATE-0-NOTES.md`). Asset bundle audited (`Docs/audit/glb_audit.jsonl`, `Docs/ASSET-MANIFEST.md`). Baseline commit `2c27652`. |
| 2026-09-06 | 0 | **UE 5.8.2 (CL 56702186) installed** via the Epic Games Launcher; exact version recorded in section 1 (registry key not yet written by the Launcher - default-folder / `UE_ROOT` resolution documented). Blender 5.2.1 and .NET SDK 8.0.424 confirmed present (the 2026-09-05 "not installed" entries for .NET were wrong: 8.0.424 was already there); VS 2022 Build Tools installing. **First editor run** (1.1): both maps generated headlessly through the code-free twin project - 249 + 171 actors, 0 errors, 0 warnings; decision 3.20 added. C++ still uncompiled; **no `gate-0` Release yet**. Documentation review applied: validator usage with arguments, LFS sizes in MiB, registry field list, candidates A/B/C, `ModelingToolsEditorMode` in the plugin list, `TODO(VERIFY 5.8)` list regenerated from grep. |
| 2026-09-06 | 0 | **GitHub remote created and pushed** (https://github.com/RobleusCaesar/hellfall, public; `main` at `2c27652`; LFS 123 objects / 113 MB). **Pipeline proof** (1.2): UAT BuildCookRun of the code-free twin in `Saved/NoCodeTwin/` - BUILD SUCCESSFUL, 0 errors, 3 min, 596 MB staged; the packaged twin ran on the iGPU under DX12 SM6 and loaded `L_ExecutiveFloor` (default pawn; not a gate-0 candidate). **Build Tools still not installed**: two winget attempts cancelled at the UAC prompt (exit 1602); Rob given the elevated one-liner and the manual installer route (`Docs/TOOLCHAIN-SETUP.md` step 2). **C++ review fixes** (uncompiled): input mapping built from the tuning subsystem (JSON binds / `invert_y` now reach the mapping), tuning applied at `InitializeComponent`, `BuildSettingsVersion.V7`, paused input mode re-applied on focus regain. **Greybox rework** (tools owner): even fill lights and single-sided labels facing the approach (3.12, `Tools/README.md`); reference figures non-colliding (3.22). `AndroidFileServer` disabled in the `.uproject` and its ini block removed (3.21). HUD header and `DefaultGame.ini` description no longer say "Gate 1". `Docs/METRICS.md`: duct mouth lips (clear 100 x 83), literal FOV. Completeness review applied; `TODO(VERIFY 5.8)` list regenerated. Still **no `gate-0` Release** and no compiled module. |
