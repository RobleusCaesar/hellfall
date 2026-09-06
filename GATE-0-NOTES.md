# GATE-0-NOTES.md - project foundation and packaging pipeline (REQ-G1-001)

**Status: SCAFFOLD ONLY. There is no `gate-0` Release, no packaged `.zip`, and nothing has been compiled.** The reason is not the code: Unreal Engine 5.8 and the C++ toolchain are not installed on the build machine, and both need Rob personally (an Epic sign-in and one Administrator prompt). Everything that can be done without the engine has been done and dry-run tested. Section 3 is the list of what Rob does next; it totals about five minutes of attention.

Date: 2026-09-05. Machine: the Ryzen 7 7730U laptop audited in `Docs/audit/environment-2026-09-05.md` (Rob must confirm this is the review machine - see section 4).

---

## 1. What exists

### 1.1 Present in the repository at the time these notes were written

| Area | Files | State |
|---|---|---|
| Specification | `Docs/BUILD-PLAN.md` (Rob's spec, verbatim), `Docs/FLOORPLAN-SCHEMA.md` (JSON schema for the level, plan-space convention, fixed adjacency, agreed reading of the drawing) | Done |
| Data | `Data/movement.json` (player body, feel, binds), `Data/metrics.json` (architecture and feel-gym dimensions), `Data/floorplan.json` (the digitised level), `Data/greybox_style.json` (tints, light intensities, label styling), `Data/candidates/floorplan_B.json` and `floorplan_C.json` (alternative digitisations of the drawing kept for comparison; not read by any script) | Done; validated by the digitiser and the validator |
| Audits | `Docs/audit/environment-2026-09-05.md` (machine and toolchain), `Docs/audit/glb_audit.jsonl` (per-GLB triangles, bounds, rigs, clips), `Tools/glb_audit.mjs` (the script that produced it) | Done |
| Documentation | `README.md`, `BUILD.md` (decision log), `LEVELS.md` (Gate 6 stub), this file, `Docs/METRICS.md` (REQ-G1-002 draft), `Docs/TOOLCHAIN-SETUP.md`, `Docs/ASSET-MANIFEST.md` (all 126 supplied files) | Done |
| Git configuration | `.gitignore` (standard Unreal, `Content/` tracked), `.gitattributes` (`* text=auto`; LFS for `.uasset .umap .glb .fbx .blend .png .jpg .jpeg .wav .mp3 .ogv .mp4 .ttf .otf`) | Done; no commit yet - the lead commits |

### 1.2 Expected from the parallel agents in this same session (lead: verify against the tree before committing)

| Area | Files | Acceptance before commit |
|---|---|---|
| C++ project skeleton | `Hellfall.uproject` (EngineAssociation "5.8"; plugins PythonScriptPlugin, EditorScriptingUtilities, EnhancedInput), `Source/Hellfall.Target.cs`, `Source/HellfallEditor.Target.cs`, `Source/Hellfall/Hellfall.Build.cs`, module with `AHellfallCharacter`, `UHellfallMovementComponent` (stand/crouch/crawl), `AHellfallPlayerController`, `AHellfallGameMode`, `AHellfallHUD` (on-screen controls), `UHellfallTuning` (loads `Data/movement.json`) | Written against the UE 5.8 API by inspection; every unconfirmed symbol carries `// TODO(VERIFY 5.8)`. Cannot compile until the toolchain exists. |
| Config | `Config/DefaultEngine.ini` (DX12, SM6, no Lumen / Nanite / VSM, TAA, motion blur off, default maps), `Config/DefaultGame.ini`, `Config/DefaultInput.ini` | Text only; reviewed by reading. |
| Level generators | `Tools/ue/hf_geometry.py` (pure Python: plan -> boxes), `Tools/ue/hf_common.py` (UnrealEmitter + ManifestEmitter), `Tools/ue/build_greybox.py`, `Tools/ue/build_feel_gym.py`, `Tools/ue/run_editor_script.ps1` | Dry run with Python 3.12 in manifest mode passes: `Tools/test_dry_run.ps1`. The Unreal path runs only inside the editor. |
| Validators | `Tools/validate_floorplan.mjs`, `Tools/check_manifest.mjs` (node 24) | Both pass on the committed `Data/`. |
| Pipeline scripts | `Tools/setup_toolchain.ps1`, `Tools/generate_project_files.ps1`, `Tools/build_editor.ps1`, `Tools/package.ps1` (UAT BuildCookRun, Development, `IncludeDebugFiles=False`, stages `Data/` and `Launch-FeelGym.cmd`), `Tools/release.ps1` (gh release with the zip and these notes), `Tools/test_dry_run.ps1` | Engine-dependent ones locate the engine and fail loudly with the install instructions when it is absent. |
| Level registry and floor-plan doc | `Data/levels.json`, `Docs/FLOORPLAN.md` | Registry: `executive_floor`, `feel_gym`. |

If any file above is missing when the lead assembles the commit, this table is corrected rather than the file being invented.

---

## 2. What is blocked, and why

| Blocked item | Cause | Who can unblock | Effect |
|---|---|---|---|
| Installing Unreal Engine 5.8 | The Epic Games Launcher (installed, 1.3.193) requires an interactive Epic account sign-in; there is no unattended install path the agent may use. | **Rob** - `Docs/TOOLCHAIN-SETUP.md` step 1 (about one minute of clicks, then a ~45 GB download) | No editor, so no map generation, no cook, no package. |
| Installing Visual Studio 2022 Build Tools + Windows SDK + .NET SDK 8 | winget can do it, but the Build Tools installer needs an Administrator UAC prompt that only Rob can accept. | **Rob** - step 2 (paste three lines into an elevated PowerShell) | No compiler, so the `Hellfall` module cannot build; UnrealBuildTool cannot run without .NET. |
| `gate-0` Release with a runnable `.zip` (REQ-G1-001 acceptance 1 and 3) | Both of the above. | Follows automatically once both are done (section 5). | The spec's proof of the pipeline end to end is pending, not failed. |
| Exact engine hotfix in `BUILD.md` (acceptance 2) | Read from `Engine\Build\Build.version` after install. | Automatic. | `BUILD.md` section 1 says "5.8.x" until then. |
| GitHub remote `RobleusCaesar/hellfall` | The local repository exists with no remote. The spec asks Rob to create the repo with LFS enabled and a quota plan decided; alternatively the lead can create it with `gh` (authenticated as RobleusCaesar). | **Rob** decides (section 3, item 7). | Nothing can be pushed or released until it exists. |
| Blender 5.2.1 | Not installed. In the same winget step. | Rob (step 2). | Not needed until Gate 2; no effect on Gate 0/1. |

Not blocked: everything in section 1.1, the dry-run tests, the validators.

---

## 3. Rob's next actions (in order; each under a minute of attention unless noted)

1. **Sign in to the Epic Games Launcher** and start the UE 5.8 install exactly as in `Docs/TOOLCHAIN-SETUP.md` step 1 (uncheck Starter Content, Templates, Engine Source, Editor symbols and all extra platforms; install to `C:\Program Files\Epic Games\UE_5.8`). The download then runs on its own - typically 20-60 minutes depending on connection.
2. **Open PowerShell as Administrator** and paste the three `winget` lines from step 2. Accept the UAC prompt. Leave the window until the first line finishes (10-20 minutes, no progress bar).
3. **Confirm the review machine** (section 4, decision A): "yes, this laptop" or the CPU / GPU / RAM / resolution of the real one.
4. **State the time expectation per gate** (decision B): a day, a few days, or a week for Gate 1.
5. **Accept or change the binds** (decision C): Space jump, Left Ctrl crouch, C crawl, Left Shift sprint, F1 feel gym.
6. **Read the doorway-jump note** in `Docs/METRICS.md` section 2 (a 95 cm jump under a 220 cm door header will touch the header; the feel gym will show whether that reads as a bonk). No answer needed now; it is flagged so it is not a surprise at Gate 1.
7. **Repository and LFS quota:** either create `RobleusCaesar/hellfall` (public, LFS enabled) yourself and hand over push access, or say "agent may create it". Also say whether you accept the free LFS tier for now (about 115 MB per clone; see `BUILD.md` 3.16 for the arithmetic and the fallbacks). If a second, competing agent will also clone the repository, say so - that doubles the bandwidth.
8. **Tell the agent "UE installed".** Everything in section 5 then runs without you.

---

## 4. The three spec decisions Rob still owns (agent defaults in force until he answers)

| | Decision (spec "Gaps & Risks") | Agent default now in force | Where it is recorded |
|---|---|---|---|
| A | **Review machine spec.** Every performance target is measured on it, and it decides Lumen vs baked. | The audited laptop (Ryzen 7 7730U, integrated Vega-class Radeon, 15.4 GB, 1920x1080@60) is assumed to be the review machine. Because that GPU does not meet Epic's Lumen or Nanite hardware requirements for UE 5.8, the G-7 fallback is taken now: **static/baked lighting, no Lumen, no Nanite, no Virtual Shadow Maps, DX12 SM6, TAA, motion blur off.** If the real review machine has a discrete RTX 2000+/RX 6000+ GPU, say so and this is revisited before Gate 3. | `BUILD.md` section 2, `Config/DefaultEngine.ini` |
| B | **Time expectation per gate.** | Assumed: Gate 1 in days, not weeks; the agent optimises for a first feel-gym build as early as the toolchain allows, then iterates on Rob's notes. | This file |
| C | **Crouch vs crawl binds.** | Space = jump, **Left Ctrl = crouch toggle, C = crawl toggle**, Left Shift = sprint (hold), E = interact, Esc = pause, F1 = feel gym. C for crawl matches both earlier prototypes. Rob's earlier prototype used Space for crouch; the spec's controller requirement fixes Space as jump, so crouch moved to Ctrl. Changing any of this is a one-line edit in `Data/movement.json : binds`. | `Data/movement.json`, `BUILD.md` 3.2, `Docs/METRICS.md` |

---

## 5. What happens automatically after "UE installed"

Run by the agent from the repository root, in this order. Each script checks its prerequisites (engine path from the default install folder or the Launcher's registry entry, `vswhere`, `dotnet`) and stops with the fix printed if one is missing.

```powershell
.\Tools\generate_project_files.ps1                          # UnrealBuildTool -projectfiles; records Engine\Build\Build.version into BUILD.md
.\Tools\build_editor.ps1                                    # HellfallEditor Win64 Development (first C++ build: ~5-15 min on this laptop)
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py   # UnrealEditor-Cmd -run=pythonscript: writes /Game/Maps/L_ExecutiveFloor
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py  # writes /Game/Maps/L_FeelGym
.\Tools\package.ps1 -Tag gate-0                             # UAT BuildCookRun Win64 Development, no debug files, Data/ + Launch-FeelGym.cmd staged, zipped
.\Tools\release.ps1 -Tag gate-0                             # gh release create gate-0 --notes-file GATE-0-NOTES.md <zip>
```

Expected wall time on this machine: one to two and a half hours, dominated by the first shader compile (the editor's first launch compiles the engine's default materials on the CPU; 20-60 minutes with an iGPU) and the cook. None of it needs Rob. Expected `.zip` size for a greybox project: 400-900 MB, under the 2 GB Release file limit.

**Note on scope.** The spec's gate-0 build "contains only the template level". This project is created from scratch (BUILD.md 3.1), so the gate-0 zip contains the generated greybox and feel gym instead of a template level - strictly more than asked, produced by the same pipeline the gates will use. Gate 1 is not started by this: the greybox is the pipeline's test payload, and Gate 1 begins only when Rob has approved Gate 0 and answered the three decisions above.

**What Rob tests in the gate-0 build (REQ-G1-001 acceptance 1):** unzip, run `Hellfall.exe`, confirm a first-person view with mouse look and WASD, press F1 and confirm the feel gym loads, run `Launch-FeelGym.cmd` and confirm it starts in the gym. That is the whole test; feel and dimensions are Gate 1.

**For the lead when committing:** run `git lfs install` once, commit `.gitattributes` and `.gitignore` **before** adding `SourceAssets/` or anything under `Content/`, then confirm `git lfs ls-files | Measure-Object -Line` reports 126 (every file under `SourceAssets/` matches an LFS pattern). Commit `.umap`/`.uasset` output only at gate tags.

---

## 6. Known gaps and `TODO(VERIFY 5.8)` markers

Because nothing could be compiled or run in the engine, correctness against the UE 5.8 API rests on inspection. The convention across the repository is a `// TODO(VERIFY 5.8): ...` comment (or `# TODO(VERIFY 5.8)` in Python) at every symbol or behaviour that could not be confirmed. The lead regenerates the list below immediately before publishing these notes:

```powershell
Get-ChildItem -Recurse -File Source, Tools, Config, Data, Hellfall.uproject | Select-String -Pattern "TODO\(VERIFY" | ForEach-Object { "$($_.Path -replace [regex]::Escape($PWD.Path + '\'), ''):$($_.LineNumber): $($_.Line.Trim())" }
```

**Snapshot at the time of writing:** `Source/`, `Config/`, `Hellfall.uproject` and `Tools/ue/` had not yet been written by the parallel agents, so the code grep returned nothing. Markers already present in the documentation, plus the verification points the code is expected to carry:

| Where | What must be verified once the engine exists |
|---|---|
| `Docs/TOOLCHAIN-SETUP.md` | Whether UnrealBuildTool for 5.8 accepts the MSVC v14.4x toolset shipped with Build Tools 17.14 or insists on v14.50 (then one more `winget --override --add Microsoft.VisualStudio.Component.VC.<ver>.x86.x64` line, id taken from UBT's message). |
| `Docs/ASSET-MANIFEST.md`, `BUILD.md` 5.2 | MP3 import through the 5.8 sound factory (fallback: WAV transcode of the six MP3s at Gate 3/6). |
| `Tools/ue/run_editor_script.ps1` (expected) | The headless invocation `UnrealEditor-Cmd.exe "<proj>.uproject" -run=pythonscript -script="<abs>.py"` and the alternative `-ExecutePythonScript="<abs>.py"`; that PythonScriptPlugin and EditorScriptingUtilities are enabled in the `.uproject` and load in the commandlet. |
| `Tools/ue/hf_common.py` (expected) | The 5.8 editor Python API used to create and save a level, spawn actors, set static meshes and materials, and add TextRender labels: `unreal.LevelEditorSubsystem` / `unreal.EditorActorSubsystem` / `unreal.EditorAssetLibrary` names and signatures, and `/Engine/BasicShapes` paths. |
| `Source/Hellfall/` (expected) | Enhanced Input created in C++ at startup (`UInputAction`, `UInputMappingContext` via `NewObject`, `UEnhancedInputLocalPlayerSubsystem::AddMappingContext`), the `UCharacterMovementComponent` overrides used for the three-stance capsule and clearance probe, `UGameInstanceSubsystem` initialisation order for `UHellfallTuning`, `FPaths::ProjectDir()`-relative access to the staged `Data/` folder in a packaged build, and the on-screen HUD drawing API. |
| `Tools/package.ps1` (expected) | UAT `BuildCookRun` argument set for 5.8 (`-platform=Win64 -clientconfig=Development -cook -stage -pak -archive`, `-nodebuginfo` / `IncludeDebugFiles=False`) and how additional non-asset directories (`Data/`) are staged (`DirectoriesToAlwaysStageAsNonUFS` in `DefaultGame.ini`). |
| `Config/DefaultEngine.ini` (expected) | The 5.8 names of the rendering switches for no dynamic GI, no Lumen reflections, Nanite off, virtual shadow maps off, TAA, motion blur off, DX12 default RHI with SM6 targeted. |

Other known gaps for Gate 0 (none block Gate 0 approval, all are recorded so they are not forgotten):

- `BUILD.md` section 1 says "5.8.x" until the hotfix is read from `Build.version`.
- The G-7 lighting decision assumes this laptop is the review machine (decision A).
- The GitHub remote and LFS quota plan are undecided (section 3, item 7).
- `Docs/METRICS.md` is DRAFT until the feel gym has been walked; the doorway-jump arithmetic is flagged there.
- The audio brief said 16 files; the supplied tree holds 14. `BUILD.md` and `Docs/ASSET-MANIFEST.md` record 14.
- `crimson_hellfiend_texture_0_1.png` is a byte-identical duplicate; dropped at Gate 2, kept untouched now (no scope work before Gate 1 approval).
- The two `.ogv` videos must be re-encoded to MP4/H.264 at Gate 6; ffmpeg is not installed.
