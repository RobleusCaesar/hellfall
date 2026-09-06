# GATE-0-NOTES.md - project foundation and packaging pipeline (REQ-G1-001)

**Status (2026-09-06): GATE-0 PACKAGE BUILT AND SMOKE-TESTED.** The C++ module compiles (Visual Studio 2022 Build Tools 17.14.37614 and the .NET Framework 4.8.1 Developer Pack were installed on 2026-09-06; the first real compile needed exactly one source fix, commit `49e9696`), `Tools\package.ps1 -Tag gate-0` produced `Builds\Hellfall-gate-0-Win64-Development.zip` (327.1 MB = 342,939,354 bytes, SHA256 `76E2EC623A5B58D7CDB04D96AAA3813E081D38522D46D0FF7FA054E9156149A2`) in one command, and the packaged `Hellfall.exe` ran on this laptop on both maps with `HellfallGameMode`, the `Data\` tuning loaded, the HUD drawn and the greybox labels readable (section 1.3). The zip is published as the `gate-0` Release with these notes as the release body: https://github.com/RobleusCaesar/hellfall/releases/tag/gate-0. `main` = `49e9696` (`2c27652` baseline -> `12faf06` fixes + maps -> `7b3e60f` ignore `*.slnx` -> `49e9696` compile fix), pushed. **Nothing blocks gate-0 any more.** What remains is Rob's: download the zip, run it, walk it, answer the three decisions (section 3). What the agent has **not** verified - everything that needs a human at the keyboard - is listed in section 6.

**Scope note.** The spec's gate-0 build "contains only the template level". This project was created from scratch (`BUILD.md` 3.1), so the gate-0 zip contains the generated greybox (`L_ExecutiveFloor`), the feel gym (`L_FeelGym`) and the three-stance traversal controller instead of a template level: it is the pipeline proof **and** the first walkable Gate 1 candidate, produced by the same pipeline every later gate will use. Gate 1 review proper starts when Rob walks it. No Gate 1 acceptance criterion is claimed as met here; they are listed in section 6 as "to be verified by Rob / next revision".

Dates: written 2026-09-05, updated 2026-09-06 (Mountain time; timestamps quoted from logs are UTC). Machine: the Ryzen 7 7730U laptop audited in `Docs/audit/environment-2026-09-05.md` (Rob must confirm this is the review machine - see section 4).

---

## 1. What exists

### 1.1 Present in the repository at `49e9696`

| Area | Files | State |
|---|---|---|
| Specification | `Docs/BUILD-PLAN.md` (Rob's spec, verbatim), `Docs/FLOORPLAN-SCHEMA.md` (JSON schema for the level, plan-space convention, fixed adjacency, agreed reading of the drawing, the `exterior` window sentinel) | Done |
| Data | `Data/movement.json` (player body, feel, binds), `Data/metrics.json` (architecture and feel-gym dimensions), `Data/floorplan.json` (the digitised level), `Data/greybox_style.json` (tints, light intensities, label styling), `Data/levels.json` (level registry), `Data/candidates/floorplan_{A,B,C}.json` with write-ups in `Docs/candidates/floorplan_{A,B,C}.md` (the three alternative digitisations of the drawing kept for comparison; not read by any script) | Done; validated by the digitiser and the validator (`validate_floorplan.mjs`: PASS, 0 warnings). Loaded by the packaged build: `Tuning: loaded ...\Hellfall\Data\movement.json (walk 400 cm/s, stand 184 cm, 11 binds)` and `levels.json (2 levels)`. |
| Generated content | `Content/Maps/L_ExecutiveFloor.umap` (249 actors, 450,385 bytes), `Content/Maps/L_FeelGym.umap` (171 actors, 313,898 bytes), `Content/Greybox/Materials/M_GB_*.uasset` (24 tints) | Regenerated 2026-09-06 with the final generators (even fill lighting, single-sided labels facing the approach, non-colliding reference figures, the level-recreate fix below) and **committed in `12faf06`** (LFS 26 objects / 894 KB). These are the maps cooked into the gate-0 zip. Git LFS; re-committed at gate tags only. |
| Audits | `Docs/audit/environment-2026-09-05.md` (machine and toolchain, with dated 2026-09-06 corrections), `Docs/audit/glb_audit.jsonl` (per-GLB triangles, bounds, rigs, clips), `Tools/glb_audit.mjs` (the script that produced it) | Done |
| Documentation | `README.md`, `BUILD.md` (decision log), `LEVELS.md` (Gate 6 stub), this file, `Docs/METRICS.md` (REQ-G1-002 draft), `Docs/TOOLCHAIN-SETUP.md`, `Docs/ASSET-MANIFEST.md` (all 126 supplied files) | Done |
| Git configuration | `.gitignore` (standard Unreal, `Content/` tracked, the twin `HellfallNoCode.uproject` ignored; since `7b3e60f` also `*.slnx` and `.vsconfig`, which UnrealBuildTool writes when generating project files), `.gitattributes` (`* text=auto`; LFS for `.uasset .umap .glb .fbx .blend .png .jpg .jpeg .wav .mp3 .ogv .mp4 .ttf .otf`) | Done; `main` at `49e9696` pushed to `origin` = https://github.com/RobleusCaesar/hellfall (public). Baseline push 2026-09-06: LFS 123 objects / 113 MB; the maps commit added 26 objects / 894 KB. |

### 1.2 Present - code, generators and pipeline scripts (every path checked against the tree on 2026-09-06)

| Area | Files | State |
|---|---|---|
| C++ project | `Hellfall.uproject` (EngineAssociation "5.8"; plugins PythonScriptPlugin, EditorScriptingUtilities, EnhancedInput, ModelingToolsEditorMode - editor-only, part of the default 5.x plugin set, unused by the pipeline and harmless - and `AndroidFileServer` explicitly **disabled**, `BUILD.md` 3.21), `Source/Hellfall.Target.cs`, `Source/HellfallEditor.Target.cs` (both `BuildSettingsVersion.V7`, which is `Latest` in 5.8), `Source/Hellfall/Hellfall.Build.cs`, module with `AHellfallCharacter`, `UHellfallMovementComponent` (stand/crouch/crawl), `AHellfallPlayerController`, `AHellfallGameMode`, `AHellfallHUD` (on-screen controls; header `HELLFALL  greybox build`), `UHellfallTuning` (loads `Data/movement.json` and `Data/levels.json`) | **Compiled 2026-09-06** (`Tools\build_editor.ps1` = `Build.bat HellfallEditor Win64 Development`): `Result: Succeeded`, `Binaries\Win64\UnrealEditor-Hellfall.dll` linked (488,448 bytes), no other errors and no warnings from our module; UnrealBuildTool accepted MSVC 14.44 without a toolset complaint. The first real compile produced exactly one error pair, `HellfallTuning.cpp(324)` C2228 / C2665: `const FKey Key(FName(*KeyName));` is parsed as a function declaration (the most vexing parse); fixed to `const FKey Key = FKey(FName(*KeyName));` in `49e9696`. The game target was then built by UAT inside `package.ps1` and the packaged binary runs (1.3). One `// TODO(VERIFY 5.8)` remains in `Source/` (the mouse pitch sign; section 6). Earlier source-level review fixes (`Source/Hellfall/README-SOURCE.md`) are in: input mapping built from the tuning subsystem in `SetupPlayerInputComponent`, tuning applied at `InitializeComponent`, V7, paused input mode re-applied on focus regain. |
| Config | `Config/DefaultEngine.ini` (DX12 targeting SM6, no Lumen / Nanite / VSM, TAA, motion blur off, default maps), `Config/DefaultGame.ini` (description "Greybox and traversal (gate-0 pipeline build; Gate 1 after approval)", `MapsToCook` = both maps), `Config/DefaultInput.ini`, `Config/DefaultEditor.ini` | Text only. The packaged gate-0 build honours the RHI choice on the iGPU: `LogRHI: Using Default RHI: D3D12`, `Using Highest Feature Level of D3D12: SM6` (1.3). |
| Level generators | `Tools/ue/hf_geometry.py` (pure Python: plan -> boxes), `Tools/ue/hf_common.py` (UnrealEmitter + ManifestEmitter), `Tools/ue/build_greybox.py`, `Tools/ue/build_feel_gym.py`, `Tools/ue/run_editor_script.ps1` (`-NoCode` for the code-free twin; automatic when `Binaries\Win64\UnrealEditor-Hellfall.dll` is absent), `Tools/ue/_engine.ps1` | Dry run passes (`Tools/test_dry_run.ps1`, 7 steps; the manifest is deterministic - identical SHA256 twice). Ran on the real engine 2026-09-06 with the final generators: 249 + 171 actors, 0 errors, 0 warnings. **Level-recreate fix:** `EditorAssetLibrary.delete_asset` returns True in the commandlet without deleting the `.umap`, and `new_level` then refuses the path, so `_recreate_level` now loads the existing map and clears its actors; both paths verified (create on the first run, `reusing /Game/Maps/L_ExecutiveFloor: cleared 249 actors before regenerating` on the second). Byte-level `.umap` determinism across regenerations is **not** checked (section 6). |
| Validators | `Tools/validate_floorplan.mjs`, `Tools/check_manifest.mjs` (node 24) | Both pass on the committed `Data/` (0 warnings). Each takes the file to check as its first argument. |
| Pipeline scripts | `Tools/setup_toolchain.ps1`, `Tools/generate_project_files.ps1`, `Tools/build_editor.ps1`, `Tools/package.ps1` (UAT BuildCookRun, Development, `IncludeDebugFiles=False`, stages `Data/`, writes `Launch-FeelGym.cmd` and `BUILD-INFO.txt`, zips, prints size + SHA256), `Tools/release.ps1` (`gh release create <tag> <zip> --title <tag> --notes-file GATE-N-NOTES.md`), `Tools/test_dry_run.ps1` | **All ran on 2026-09-06** except `release.ps1`, which the lead runs right after this edit (section 5 has the timings). Engine-dependent ones resolve the engine (`UE_ROOT`, then the default Launcher folder - accepted only when `Engine\Build\Build.version` matches - then HKLM, then HKCU source builds) and fail loudly with the install instructions when it is absent. |
| Level registry and floor-plan doc | `Data/levels.json`, `Docs/FLOORPLAN.md` | Registry: `executive_floor` (order 10), `feel_gym` (order 900, hidden); each entry has `id`, `display_name`, `map`, `order`, optional `hidden`. Loaded by the packaged build (`levels.json (2 levels)`). |

### 1.3 The gate-0 package (2026-09-06)

| Item | Value |
|---|---|
| Command | `.\Tools\package.ps1 -Tag gate-0 -Configuration Development` (one command: game target build + cook + stage + pak/IoStore + archive, then `Data\` copy, `Launch-FeelGym.cmd`, `BUILD-INFO.txt`, zip) |
| Result | UAT `BUILD SUCCESSFUL` (`AutomationTool executed for 0h 3m 3s`); 211 s wall time for the whole script as measured by the lead. Log: `Saved/Logs/package_gate0.log` (git-ignored). |
| Staged tree | `Builds\gate-0\Windows\` - `Hellfall.exe`, `Launch-FeelGym.cmd`, `BUILD-INFO.txt` (tag, configuration, engine `5.8.2-56702186+++UE5+Release-5.8`, git revision `49e9696`, packaged 2026-09-06 16:53:11 UTC), `Hellfall\Data\` (copied from `Data\`), `Engine\`, `Hellfall\` |
| Zip | `Builds\Hellfall-gate-0-Win64-Development.zip` - **327.1 MB (342,939,354 bytes)**, SHA256 **`76E2EC623A5B58D7CDB04D96AAA3813E081D38522D46D0FF7FA054E9156149A2`**. Well under the 2 GB Release file limit and under the 400-900 MB estimate. `Builds\` is git-ignored; the zip ships only on the Release. |
| Containers | IoStore container `Hellfall-Windows`: 1837 items, 171.54 MB -> 168.87 MB compressed (Oodle); `.pak` 1739 files / 11.1 MB. Project shader library `Hellfall`: 1563 unique shaders (SM6), 1350 (SM5). |
| Where it is published | https://github.com/RobleusCaesar/hellfall/releases/tag/gate-0 (`Tools\release.ps1 -Tag gate-0`, run by the lead with this file as the release body). |
| Smoke run | The packaged `Hellfall.exe` was run by the lead on this laptop (Ryzen 7 7730U / Radeon Vega iGPU), windowed 1280x720, `-DumpMovie` frames, once per map (`/Game/Maps/L_ExecutiveFloor`, `/Game/Maps/L_FeelGym`; `-benchmark -fps=5 -NoSound -unattended`, so it is a rendering and boot check, not a frame-rate measurement). Logs: `Builds\gate-0\Windows\Hellfall\Saved\Logs\Hellfall.log` and `Hellfall_2.log`; frames: `Builds\gate-0\Windows\Hellfall\Saved\Screenshots\Windows\MovieFrame*.png`. |

What the smoke-run logs show (verbatim, both maps): `LogRHI: Using Default RHI: D3D12` and `Using Highest Feature Level of D3D12: SM6` on `AMD Radeon (TM) Graphics`; `LogLoad: Game class is 'HellfallGameMode'`; `LogHellfall: Tuning: loaded ...\Hellfall\Data\movement.json (walk 400 cm/s, stand 184 cm, 11 binds)` and `... levels.json (2 levels)`; `LogHellfall: Movement: tuning applied (walk 400 sprint 600 crouch 200 crawl 130 cm/s, jumpZ 432 cm/s, step 40 cm, transition 0.20 s)`; `LogHellfall: Character: built 12 key mappings in C++ from Data/movement.json binds`; and exactly one warning, expected and documented in `Docs/METRICS.md` row 5: `LogHellfall: Warning: Movement: crawl_height_cm 64 is below 2 * capsule_radius_cm (72); the capsule clamps to a 72 cm sphere. Data change needed if 64 cm must be exact.`

What the frames show: the HUD renders - title `HELLFALL greybox build`; a CONTROLS block (Move W A S D, Look Mouse, Jump Space Bar, Crouch (toggle) Left Ctrl, Crawl (toggle) C, Sprint (hold) Left Shift, Interact E, Pause Escape, Feel gym F1); a STATUS block (Stance STANDING, Speed 0 cm/s cap 400, Ground on floor, Body capsule 184 cm eye 166 cm r 36, Map name); a centre dot. `L_ExecutiveFloor` from the player start: the Supply Closet with its room label, the amber `AIR DUCT 100 x 95 / crawl only` element label and the NOTE labels all readable (single-sided labels facing the approach, now verified in the packaged build rather than the twin), even fill lighting with no blown-out ceiling hot spot, the duct mouth ahead. `L_FeelGym`: the row of stations with readable `CEILING 270 / 500 x 500 room, door 120` labels and the reference figures.

**How to test (REQ-G1-001 acceptance).**

1. *The `.zip` runs on Rob's machine to a playable first-person view:* download `Hellfall-gate-0-Win64-Development.zip` from the Release above, unzip anywhere, run `Hellfall.exe`. Expected: a windowed first-person view in the Supply Closet with the control list on screen; mouse look, W/A/S/D, Space, Left Ctrl, C, Left Shift work. Verified by the agent only as far as a scripted run without input can go (boot, game mode, tuning, HUD, rendering); the "playable" half is Rob's (section 3).
2. *`BUILD.md` records the exact engine version and the review machine:* `BUILD.md` section 1 (5.8.2, CL 56702186) and section 2 (the audited laptop; Rob confirms it is the review machine, decision A).
3. *The packaging script produces the build with a single command:* `.\Tools\package.ps1 -Tag gate-0` is what produced this zip (1.3).

---

## 2. What is blocked, and why

**Nothing blocks gate-0.** Every item that was blocked on 2026-09-05/06 is closed: Unreal Engine 5.8.2 (installed), Build Tools (installed 2026-09-06, `Docs/TOOLCHAIN-SETUP.md` step 2), the .NET Framework SDK that UE's `SwarmInterface` module demands at rules time (installed 2026-09-06, same step), the C++ compile (done), the cook / stage / pak / archive of the real project (done), the zip (built), the GitHub remote (pushed). The code-free twin (`BUILD.md` 1.2) is history: gate-0 is the compiled project.

What is still **open** is not a blocker but a decision or a human test:

| Open item | Who | Effect until answered |
|---|---|---|
| Decision A - review machine spec (section 4) | Rob | The G-7 lighting fallback (no Lumen / Nanite / VSM) stands on the assumption that this laptop is the review machine. |
| Decision B - time expectation per gate (section 4) | Rob | The agent assumes days, not weeks, for Gate 1. |
| Decision C - crouch / crawl binds (section 4) | Rob | The packaged build uses Left Ctrl = crouch, C = crawl; a change is a one-line JSON edit and a rebuild. |
| LFS quota plan (section 3, item 7) | Rob | Free tier assumed; nothing fails until the bandwidth is used up. |
| Everything a scripted run cannot test: feel, the duct crawl gate, collision, stand-blocked behaviour, focus loss/regain, the F1 toggle, the data-only rebind proof, frame rate (section 6) | Rob (the Gate 1 checklist) | Gate 1 review, not gate-0. |

---

## 3. Rob's next actions (in order)

1. **Download the build:** https://github.com/RobleusCaesar/hellfall/releases/tag/gate-0 -> `Hellfall-gate-0-Win64-Development.zip` (327.1 MB; SHA256 `76E2EC623A5B58D7CDB04D96AAA3813E081D38522D46D0FF7FA054E9156149A2` if you want to check it). Unzip anywhere. Nothing installs.
2. **Run `Hellfall.exe`.** You start first-person in the Supply Closet. Controls (also on screen): W/A/S/D move, mouse look, Space jump, Left Ctrl crouch (toggle), C crawl (toggle), Left Shift sprint (hold), E interact (Gate 5 - does nothing yet), Esc pause (releases the mouse). The duct out of the closet is crawl-only: press C, then go.
3. **Open the feel gym:** press **F1** in game (toggles between the executive floor and the gym), or run **`Launch-FeelGym.cmd`** next to `Hellfall.exe` to start straight in the gym.
4. **Walk the Gate 1 review checklist, items 1-16** (`Docs/BUILD-PLAN.md`, "Gate 1 - Rob's Review Checklist": feel gym first, items 1-6, then the main level, items 7-16). Take notes on anything that feels off, even if you cannot say why. Reply **APPROVED** (for gate-0 that means: the zip ran to a first-person view on your machine) **or a feedback list**; the checklist notes become the first Gate 1 revision either way.
5. **Confirm the review machine** (section 4, decision A): "yes, this laptop" or the CPU / GPU / RAM / resolution of the real one.
6. **State the time expectation per gate** (decision B): a day, a few days, or a week for Gate 1.
7. **Accept or change the binds** (decision C): Space jump, Left Ctrl crouch, C crawl, Left Shift sprint, F1 feel gym.
8. **LFS quota:** say whether you accept the free LFS tier for now (pushes so far: 113 MB baseline + 894 KB maps; every fresh clone pulls about 110 MB of LFS objects; see `BUILD.md` 3.16 for the arithmetic and the fallbacks). If a second, competing agent will also clone the repository, say so - that doubles the bandwidth.
9. **Read the doorway-jump note** in `Docs/METRICS.md` section 2 (a 95 cm jump under a 220 cm door header will touch the header; the feel gym will show whether that reads as a bonk). No answer needed now; it is flagged so it is not a surprise at Gate 1.

---

## 4. The three spec decisions Rob still owns (agent defaults in force until he answers)

| | Decision (spec "Gaps & Risks") | Agent default now in force | Where it is recorded |
|---|---|---|---|
| A | **Review machine spec.** Every performance target is measured on it, and it decides Lumen vs baked. | The audited laptop (Ryzen 7 7730U, integrated Vega-class Radeon, 15.4 GB, 1920x1080@60) is assumed to be the review machine. Because that GPU does not meet Epic's Lumen or Nanite hardware requirements for UE 5.8, the G-7 fallback is taken now: **static/baked lighting, no Lumen, no Nanite, no Virtual Shadow Maps, DX12 SM6, TAA, motion blur off.** The packaged gate-0 build runs on this GPU under DX12 SM6 (1.3); its frame rate at 1920x1080 has **not** been measured. If the real review machine has a discrete RTX 2000+/RX 6000+ GPU, say so and this is revisited before Gate 3. | `BUILD.md` section 2, `Config/DefaultEngine.ini` |
| B | **Time expectation per gate.** | Assumed: Gate 1 in days, not weeks; the agent optimises for a first feel-gym build as early as possible (this zip is it), then iterates on Rob's notes. | This file |
| C | **Crouch vs crawl binds.** | Space = jump, **Left Ctrl = crouch toggle, C = crawl toggle**, Left Shift = sprint (hold), E = interact, Esc = pause, F1 = feel gym. C for crawl matches both earlier prototypes. Rob's earlier prototype used Space for crouch; the spec's controller requirement fixes Space as jump, so crouch moved to Ctrl. Changing any of this is a one-line edit in `Data/movement.json : binds`, read by the input mapping and the HUD alike (the packaged build built its 12 key mappings from that file). | `Data/movement.json`, `BUILD.md` 3.2, `Docs/METRICS.md` |

Agent decisions recorded here so nothing in Rob's tests reads as a defect by surprise: **reference figures are non-colliding scale references, not obstacles** (`Data/greybox_style.json : reference_figure.collision`; `BUILD.md` 3.22) - several stand 25-60 cm from walls and the REQ-G1-007 wall-slide passes through them instead of catching; **greybox lighting is even fill** (non-inverse-square point lights, unitless intensity) and **labels are single-sided, facing the player's approach** (`BUILD.md` 3.12, `Tools/README.md`) - both now seen in the packaged frames; **duct mouths carry 6 cm lips**, so the clear mouth is 100 x 83 and the crawl entry has about 9 cm of margin, while the feel-gym tunnels have no lips (`Docs/METRICS.md` row 15); **the crawl capsule is effectively a 72 cm sphere**, not 64 cm, because the engine clamps the capsule half-height to the radius - the packaged build logs this as its one warning (`Docs/METRICS.md` row 5).

---

## 5. What ran on 2026-09-06 (the gate-0 pipeline, end to end, on this machine)

Run by the agent from the repository root, in this order, after Rob had installed Build Tools. Each script checks its prerequisites (engine path from `$env:UE_ROOT`, then the default install folder - accepted only when `Engine\Build\Build.version` matches - then the Launcher's registry entry, then HKCU source builds; `vswhere`, `dotnet`) and stops with the fix printed if one is missing. All timings are wall time on this laptop.

```powershell
.\Tools\generate_project_files.ps1                          # OK, 18.5 s: UnrealBuildTool -projectfiles -> Hellfall.slnx (5.8 writes .slnx, not .sln; git-ignored since 7b3e60f)
.\Tools\build_editor.ps1                                    # Build.bat HellfallEditor Win64 Development - three attempts, see below; final: Result: Succeeded
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py   # final generators: L_ExecutiveFloor 249 actors, 0 errors, 0 warnings (committed 12faf06)
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py  # L_FeelGym 171 actors, 0 errors, 0 warnings (committed 12faf06)
.\Tools\package.ps1 -Tag gate-0                             # BUILD SUCCESSFUL, 211 s: build + cook + stage + pak/IoStore + archive, Data\ staged, Launch-FeelGym.cmd + BUILD-INFO.txt written, zip 327.1 MB
.\Tools\release.ps1 -Tag gate-0                             # run by the lead right after this edit: gh release create gate-0 --notes-file GATE-0-NOTES.md <zip>
```

**The compile, attempt by attempt** (logs `Saved/Logs/build_editor_first.log`, `_second.log`, `_third.log`, git-ignored):

1. **Rules error, 43.62 s** (`Result: Failed (RulesError)`): UE's `Engine/Source/Editor/SwarmInterface/SwarmInterface.Build.cs` throws on Win64 when no .NET Framework SDK is installed: `Unable to instantiate module 'SwarmInterface': Could not find NetFxSDK install dir; this will prevent SwarmInterface from installing.  Install a version of .NET Framework SDK at 4.6.0 or higher.` Build Tools had shipped the 4.6.2 *targeting pack*, not the SDK. `setup.exe modify` to add `Microsoft.Net.Component.4.8.SDK` returned exit 5007 (the installer was blocked pending a reboot), so the lead installed the standalone **Microsoft .NET Framework 4.8.1 Developer Pack** via winget (`Microsoft.DotNet.Framework.DeveloperPack_4`, one UAC click by Rob); it created `C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1` and UnrealBuildTool accepted it. Recorded as a required step in `Docs/TOOLCHAIN-SETUP.md`.
2. **First real compile, 99.73 s** (`Result: Failed (OtherCompilationError)`; 87.34 s in the Unreal Build Accelerator): UBT reported `Using Visual Studio 14.44.35228 toolchain (...\MSVC\14.44.35207) and Windows 10.0.26100.0 SDK` with no toolset complaint, compiled the whole module and produced exactly one error pair: `HellfallTuning.cpp(324,12): error C2228: left of '.IsValid' must have class/struct/union` and `HellfallTuning.cpp(330,11): error C2665` - `const FKey Key(FName(*KeyName));` parsed as a function declaration. Fix: `const FKey Key = FKey(FName(*KeyName));` (commit `49e9696`).
3. **Rebuild, 8.17 s** (`Result: Succeeded`): only `HellfallTuning.cpp` recompiled, `[3/4] Link [x64] UnrealEditor-Hellfall.dll` (488,448 bytes). No other errors, no warnings from our module.

**The package** (`Saved/Logs/package_gate0.log`): UAT `BuildCookRun -platform=Win64 -clientconfig=Development -build -cook -stage -pak -archive -nodebuginfo` on the real project - `BUILD SUCCESSFUL`, `AutomationTool executed for 0h 3m 3s`; the whole `package.ps1` run took 211 s. Cook of both maps and the 24 materials; IoStore container 1837 items, 171.54 MB -> 168.87 MB; project shader library 1563 unique shaders (SM6) / 1350 (SM5); `Data\` copied to `Builds\gate-0\Windows\Hellfall\Data`; `Launch-FeelGym.cmd` (`start "" "%~dp0Hellfall.exe" /Game/Maps/L_FeelGym`) and `BUILD-INFO.txt` written next to `Hellfall.exe`; zip 342,939,354 bytes, SHA256 `76E2EC623A5B58D7CDB04D96AAA3813E081D38522D46D0FF7FA054E9156149A2`.

**The smoke run** (section 1.3): the packaged `Hellfall.exe`, both maps, windowed 1280x720 with `-DumpMovie`, on the iGPU under DX12 SM6. Boot, game mode, tuning load, key mappings, HUD and label readability confirmed from the log and the frames. No input was given, so nothing that needs a player is confirmed (section 6).

**Pipeline proof vs gate-0 candidate.** The earlier code-free-twin package (`BUILD.md` 1.2, `Builds/pipeline-test/`, git-ignored) proved cook / stage / pak / archive before the compiler existed; it had no `Hellfall` module. It is superseded by the real package above and is not shipped.

**For the lead when committing:** `Content/` (2 maps + 24 materials) is committed at `12faf06`; from here on commit `.umap`/`.uasset` output only at gate tags, since every regenerated map is a new LFS object. `*.slnx` and `.vsconfig` are git-ignored (`7b3e60f`); the root twin `HellfallNoCode.uproject` and `Saved/NoCodeTwin/` stay git-ignored and must never be committed. The C++ reviewer's line-ending note stands: git reports `LF will be replaced by CRLF` for every `Source/` file on this machine (`core.autocrlf`); the working copies are LF and `.gitattributes` says `* text=auto`, so the committed blobs are LF - decide whether to pin `eol=lf` so the tree stays byte-stable.

---

## 6. Known gaps and `TODO(VERIFY 5.8)` markers

The C++ has now been compiled by MSVC 14.44 under UnrealBuildTool 5.8.2, cooked, packaged and booted in the packaged build (sections 1.2, 1.3, 5), so the API-level markers that only a compile could settle are settled. What a compile cannot settle - runtime behaviour under a player's hands - is listed under "Not verified by the agent" below. The convention across the repository is a `// TODO(VERIFY 5.8): ...` comment (or `# TODO(VERIFY 5.8)` in Python) at every symbol or behaviour that could not be confirmed. The list below is regenerated from this grep immediately before these notes are published:

```powershell
Get-ChildItem -Recurse -File Source, Tools, Config, Data, Docs, Hellfall.uproject, README.md, BUILD.md, LEVELS.md | Where-Object { $_.Name -ne 'BUILD-PLAN.md' } | Select-String -Pattern "TODO\(VERIFY" | ForEach-Object { "$($_.Path -replace [regex]::Escape($PWD.Path + '\'), ''):$($_.LineNumber): $($_.Line.Trim())" }
```

**Snapshot 2026-09-06 17:08:59 UTC** (the grep's output, pasted as the last edit before publication - after the compile fix `49e9696`, the map regeneration and these documentation updates; two `Tools\ue\__pycache__\hf_common.cpython-31x.pyc` hits are omitted, being the git-ignored byte-code caches of `hf_common.py:15`):

```
Source\Hellfall\HellfallCharacter.cpp:372: // TODO(VERIFY 5.8): first run - push the mouse forward; the view must pitch UP. If it does not, the
Source\Hellfall\README-SOURCE.md:90: `TODO(VERIFY 5.8)` marker left under `Source/` is the look sign (step 2); spots discussed in comments
Tools\README.md:177: carries `TODO(VERIFY 5.8)` (sky-light recapture, the fill-light property names `use_inverse_squared_falloff` /
Tools\ue\hf_common.py:15: editor carries a ``TODO(VERIFY 5.8)`` comment and uses the most conservative call.
Tools\ue\hf_common.py:357: comp.set_editor_property("use_inverse_squared_falloff", True)   # TODO(VERIFY 5.8): property name
Tools\ue\hf_common.py:363: # TODO(VERIFY 5.8): bUseInverseSquaredFalloff and LightFalloffExponent are UPROPERTYs of
Tools\ue\hf_common.py:389: # TODO(VERIFY 5.8): recapture after mobility change may be needed: comp.recapture_sky()
Docs\ASSET-MANIFEST.md:17: 5. **Audio:** WAV imports natively. MP3 import is expected to work in UE 5.8 but is not verified on this machine; if it fails the six MP3s are transcoded to WAV at Gate 3/6 a [...]
BUILD.md:22: **C++ state: compiled 2026-09-06** (`Tools/build_editor.ps1` = `Build.bat HellfallEditor Win64 Development`, MSVC 14.44 under UnrealBuildTool 5.8.2): `Result: Succeeded`, `Binaries\Win64\Unreal [...]
BUILD.md:34: What this proves: the `unreal` API calls in `Tools/ue/hf_common.py` work on 5.8.2 as written (level create/save, `StaticMeshActor` with `/Engine/BasicShapes/Cube`, one Material per tint, ` [...]
BUILD.md:174: WAV imports natively. MP3 import in UE 5.8 is expected but unverified on this machine; fallback is a WAV transcode at Gate 3/6. `// TODO(VERIFY 5.8): MP3 import.`
BUILD.md:217: | 2026-09-06 | 0 | **UE 5.8.2 (CL 56702186) installed** via the Epic Games Launcher; exact version recorded in section 1 (registry key not yet written by the Launcher - default-folder / ` [...]
BUILD.md:218: | 2026-09-06 | 0 | **GitHub remote created and pushed** (https://github.com/RobleusCaesar/hellfall, public; `main` at `2c27652`; LFS 123 objects / 113 MB). **Pipeline proof** (1.2): UAT B [...]
BUILD.md:219: | 2026-09-06 | 0 | **Build Tools + .NET Framework SDK installed.** Rob ran the Visual Studio 2022 Build Tools installer (17.14.37614: `VCTools` workload, MSVC 14.44.35207, Windows SDK 10.0.2 [...]
```

**Count: 4 code markers** (`Source/Hellfall/HellfallCharacter.cpp:372`, `Tools/ue/hf_common.py:357`, `Tools/ue/hf_common.py:363`, `Tools/ue/hf_common.py:389`) **and 2 documentation markers** (`Docs/ASSET-MANIFEST.md:17`, `BUILD.md:174`) - down from 4 + 3 in the previous snapshot: `Docs/TOOLCHAIN-SETUP.md:65` is resolved (below). The other 8 matching lines (`Source/Hellfall/README-SOURCE.md:90`, `Tools/README.md:177` - which the grep printed twice, listed once - `Tools/ue/hf_common.py:15`, `BUILD.md:22`, `BUILD.md:34`, `BUILD.md:217`, `BUILD.md:218`, `BUILD.md:219`) only describe the convention or refer to this list and are not markers. Grep over `Source/ Config/ Tools/ Data/ Docs/ Hellfall.uproject README.md BUILD.md LEVELS.md` (`Saved/`, `SourceAssets/`, `Builds/`, `Binaries/`, `Intermediate/`, `__pycache__/`, `Docs/BUILD-PLAN.md` and this file excluded); output lines longer than 200 characters are cut with `[...]`, the `path:line` prefixes are exact (as printed by PowerShell, with backslashes).

| Marker | What must be verified | State |
|---|---|---|
| `Source/Hellfall/HellfallCharacter.cpp:372` | Mouse pitch sign: with legacy input scales off, pushing the mouse forward must pitch the view UP; if not, `invert_y` in `Data/movement.json` (data fix - honoured, because the mapping is built from the tuning subsystem) or one sign in `Input_Look` (code fix). | **Open - Rob's first minute in the build.** Compiles and the mapping is built (12 key mappings logged); the smoke run had no mouse input, so the sign is unobserved. |
| `Tools/ue/hf_common.py:357` | `use_inverse_squared_falloff` as the reflected Python name of `bUseInverseSquaredFalloff` on the legacy inverse-square light path (no generator path produces such a light today - every light is even fill). | Open, dead path today; a wrong name raises and prints `FAILED:` the first time a style entry asks for `inverse_squared`. |
| `Tools/ue/hf_common.py:363` | The even-fill light property names `use_inverse_squared_falloff`, `light_falloff_exponent` and `LightUnits.UNITLESS` on `PointLightComponent`. | Exercised without error by the 2026-09-06 regeneration (a wrong name would have raised `FAILED:`, and the run reported 0 errors), and the packaged frames show even fill with no hot spot. The marker is the tools owner's to retire. |
| `Tools/ue/hf_common.py:389` | Whether `SkyLightComponent.recapture_sky()` is needed after the mobility change (feel gym only). | Exercised in the feel-gym run without error; the packaged gym frames are lit and the labels readable, but whether the sky light itself contributes is not isolated. |
| `Docs/ASSET-MANIFEST.md:17`, `BUILD.md:174` | MP3 import through the 5.8 sound factory (fallback: WAV transcode of the six MP3s at Gate 3/6). | Open - no import before Gate 3. |

Resolved since the previous snapshot: **`Docs/TOOLCHAIN-SETUP.md:65`** - UnrealBuildTool 5.8.2 accepts the MSVC 14.44 toolset shipped with Build Tools 17.14 (`Using Visual Studio 14.44.35228 toolchain`, no toolset complaint in any of the three build logs); the marker is replaced by the verified statement. Resolved earlier: `Source/Hellfall.Target.cs` `BuildSettingsVersion.V5` (both targets use V7, confirmed equal to `Latest` and now compiled); the `Tools/ue/hf_geometry.py` TextRender facing convention (now verified on the packaged build's frames, not only the twin's); the five `hf_common.py` API-name markers replaced by `VERIFIED 5.8.2` notes after the first editor run.

**Verification points without a code marker** (kept here so they are not forgotten):

| Where | What | State |
|---|---|---|
| `Tools/ue/run_editor_script.ps1` | The headless invocation `UnrealEditor-Cmd.exe "<proj>.uproject" -run=pythonscript -script="<abs>.py" -stdout -FullStdOutLogOutput -unattended -nosplash -nopause`; PythonScriptPlugin and EditorScriptingUtilities loading in the commandlet. | **Verified 2026-09-06.** `sys.exit(0)` gives process exit code 0; **non-zero propagation (`sys.exit(1)`) and the `-Mode Editor` / `-ExecutePythonScript` alternative remain unverified** - the wrapper's `FAILED:` / `LogPython: Error` scan stays as the fallback. |
| `Tools/ue/hf_common.py` | The 5.8 editor Python API used to create, reuse and save a level, spawn actors, set static meshes and materials, and add TextRender labels. | **Verified 2026-09-06**: both maps created (first run) and reused (second run: existing map loaded, actors cleared, regenerated), then cooked into the gate-0 zip and loaded by the packaged build; 0 errors, 0 warnings. **Byte-level `.umap` determinism across regenerations is not checked** (run twice, compare hashes); the dry-run manifest is deterministic (identical SHA256 twice). |
| `Source/Hellfall/` | Enhanced Input created in C++ at startup, the `UCharacterMovementComponent` overrides for the three-stance capsule and clearance probe, `UGameInstanceSubsystem` initialisation order for `UHellfallTuning`, `FPaths::ProjectDir()`-relative access to the staged `Data/` folder in a packaged build, the on-screen HUD drawing API, `FJsonObject::TryGet*Field` overloads, `FSlateApplication::OnApplicationActivationStateChanged` signature. | **Compiled and booted 2026-09-06**: everything above compiles against 5.8.2; the packaged build reads `Hellfall\Data\movement.json` and `levels.json` from the staged folder, applies the tuning once per spawn (one `tuning applied` line - the subsystem was visible at `InitializeComponent`), builds 12 key mappings from the JSON binds and draws the HUD. **Not exercised:** anything that needs input - see the list below. |
| `Tools/package.ps1` | UAT `BuildCookRun` argument set for 5.8 with `-build` on the real code project, the staging of `Data/` next to the staged project, `Launch-FeelGym.cmd`, `BUILD-INFO.txt`, the zip and its SHA256. | **Verified 2026-09-06** (section 1.3). |
| `Config/DefaultEngine.ini` | The 5.8 names of the rendering switches for no dynamic GI, no Lumen reflections, Nanite off, virtual shadow maps off, TAA, motion blur off, DX12 default RHI with SM6 targeted. | DX12 / SM6 **verified** in the packaged log (`Using Default RHI: D3D12`, `Highest Feature Level of D3D12: SM6`); the frames render as intended. Whether each GI / reflection / Nanite / VSM switch takes effect individually is still a visual and `stat` check in the running build. |

**Not verified by the agent - Rob's tests (Gate 1 checklist) and the next revision.** The agent's runs were scripted and input-free, so none of the following has been observed; none is claimed as met:

- Walking, looking, jumping, crouching and crawling *feel* (REQ-G1-003 acceptance 1; checklist items 1-6, 10, 11); the mouse pitch sign (marker above).
- The duct crawl gate: standing and crouching blocked at the mouth, crawl passes, reversing mid-duct returns cleanly, stand input suppressed inside (REQ-G1-006; checklist item 13).
- Collision integrity: no escape from the playable volume, no catching on doorframes or walls, no fall-through (REQ-G1-007; items 7, 8, 16).
- Stand-blocked behaviour under low geometry with no camera clipping (REQ-G1-003 acceptance 2).
- Focus loss releasing the mouse and focus regain without a camera snap (REQ-G1-003), including the paused case.
- The F1 toggle between the two maps and `Launch-FeelGym.cmd` starting in the gym (REQ-G1-004 acceptance 2) - present in the build and in the mappings, not pressed.
- The data-only rebind proof: change a bind or the walk speed in `Data\movement.json`, rebuild (or edit the JSON next to the `.exe`), see the change (REQ-G1-003 acceptance 3).
- Frame rate at 1920x1080 on the review machine (G-7: 60 fps floor) - **unmeasured**; the smoke run was 1280x720 at a fixed benchmark timestep.
- Byte-level `.umap` determinism across regenerations (REQ-G1-005 acceptance 3) - the dry-run manifest is deterministic; the engine output has not been hashed twice.
- The remaining Gate 1 acceptance criteria as a whole (REQ-G1-002 through G1-007): they are reviewed when Rob walks the build, and the metrics document stays DRAFT until then.

Other known gaps for Gate 0 (none block Gate 0 approval, all are recorded so they are not forgotten):

- The G-7 lighting decision assumes this laptop is the review machine (decision A).
- The LFS quota plan is undecided (section 3, item 8); the remote itself exists and is pushed.
- `Docs/METRICS.md` is DRAFT until the feel gym has been walked; the doorway-jump arithmetic, the effective 72 cm crawl capsule (now confirmed by the packaged run's warning) and the 83 cm clear duct mouth are flagged there.
- The `AndroidFileServer` plugin is disabled in `Hellfall.uproject` and its editor-written block was removed from `Config/DefaultEngine.ini` (`BUILD.md` 3.21). Any twin `.uproject` written **before** that change (`Saved/NoCodeTwin/HellfallNoCode.uproject`) still enables the plugin and re-appends the block on each run; regenerate such twins from the current `Hellfall.uproject`, and if the block reappears delete it - never commit it. With the module compiled, the twin is no longer needed for generation.
- `Builds/` (the gate-0 staged tree and zip, `pipeline-test/`, `expo-test/`), `Saved/`, `Binaries/`, `Intermediate/` and `Hellfall.slnx` are git-ignored working files; the zip ships only on the Release.
- The audio brief said 16 files; the supplied tree holds 14. `BUILD.md` and `Docs/ASSET-MANIFEST.md` record 14.
- `crimson_hellfiend_texture_0_1.png` is a byte-identical duplicate; dropped at Gate 2, kept untouched now (no scope work before Gate 1 approval).
- The two `.ogv` videos must be re-encoded to MP4/H.264 at Gate 6; ffmpeg is not installed.
- `Docs/FLOORPLAN.md` is owned by the floor-plan author; the number inconsistencies found in the 2026-09-05 review (floor area, door-to-junction leg, Demon #1 spawn offset, the 590 alcove clearance) were partly corrected on 2026-09-06 and the file is the authority for what remains.
