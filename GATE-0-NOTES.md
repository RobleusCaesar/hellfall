# GATE-0-NOTES.md - project foundation and packaging pipeline (REQ-G1-001)

**Status (2026-09-06): SCAFFOLD + ENGINE + PIPELINE PROOF. There is still no `gate-0` Release, no packaged `.zip` of the real project, and the C++ module has not been compiled.** What exists: Unreal Engine 5.8.2 is installed; both maps (`L_ExecutiveFloor`, 249 actors; `L_FeelGym`, 171 actors) and the 24 greybox materials have been generated headlessly on the real engine with 0 errors and 0 warnings (`BUILD.md` 1.1); the cook / stage / pak / archive pipeline has been proven once on a code-free twin of the project - UAT BuildCookRun, BUILD SUCCESSFUL in 3 minutes, and the packaged twin ran on this laptop and loaded `L_ExecutiveFloor` (a pipeline proof only, **not** a gate-0 candidate; `BUILD.md` 1.2); the repository is public at https://github.com/RobleusCaesar/hellfall with `main` pushed at the baseline commit `2c27652`. The one remaining blocker is the C++ compiler: Visual Studio 2022 Build Tools are **not installed** - two winget attempts were cancelled at the UAC prompt (installer exit 1602), which the agent cannot answer - so **Rob installs them** (section 3, item 2). Until then nothing compiles, and the real project cannot be cooked or packaged. Everything that can be done without the compiler has been done. Section 3 is the list of what Rob does next.

Dates: written 2026-09-05, updated 2026-09-06. Machine: the Ryzen 7 7730U laptop audited in `Docs/audit/environment-2026-09-05.md` (Rob must confirm this is the review machine - see section 4).

---

## 1. What exists

### 1.1 Present in the repository at the time these notes were written

| Area | Files | State |
|---|---|---|
| Specification | `Docs/BUILD-PLAN.md` (Rob's spec, verbatim), `Docs/FLOORPLAN-SCHEMA.md` (JSON schema for the level, plan-space convention, fixed adjacency, agreed reading of the drawing, the `exterior` window sentinel) | Done |
| Data | `Data/movement.json` (player body, feel, binds), `Data/metrics.json` (architecture and feel-gym dimensions), `Data/floorplan.json` (the digitised level), `Data/greybox_style.json` (tints, light intensities, label styling), `Data/candidates/floorplan_{A,B,C}.json` with write-ups in `Docs/candidates/floorplan_{A,B,C}.md` (the three alternative digitisations of the drawing kept for comparison; not read by any script) | Done; validated by the digitiser and the validator (`validate_floorplan.mjs`: PASS, 0 warnings) |
| Generated content | `Content/Maps/L_ExecutiveFloor.umap` (249 actors), `Content/Maps/L_FeelGym.umap` (171 actors), `Content/Greybox/Materials/M_GB_*.uasset` (24 tints) | Generated 2026-09-06 on UE 5.8.2 by the editor commandlet through the code-free twin project (`BUILD.md` 1.1). Git LFS; committed with the next commit, then re-committed at gate tags only. Lighting and labels are being reworked by the tools owner (even fill lighting: non-inverse-square point lights, unitless intensity; single-sided labels facing the approach; see `Tools/README.md`), so the committed maps are whatever the generators produce at commit time. |
| Audits | `Docs/audit/environment-2026-09-05.md` (machine and toolchain, with a dated 2026-09-06 correction), `Docs/audit/glb_audit.jsonl` (per-GLB triangles, bounds, rigs, clips), `Tools/glb_audit.mjs` (the script that produced it) | Done |
| Documentation | `README.md`, `BUILD.md` (decision log), `LEVELS.md` (Gate 6 stub), this file, `Docs/METRICS.md` (REQ-G1-002 draft), `Docs/TOOLCHAIN-SETUP.md`, `Docs/ASSET-MANIFEST.md` (all 126 supplied files) | Done |
| Git configuration | `.gitignore` (standard Unreal, `Content/` tracked, the twin `HellfallNoCode.uproject` ignored), `.gitattributes` (`* text=auto`; LFS for `.uasset .umap .glb .fbx .blend .png .jpg .jpeg .wav .mp3 .ogv .mp4 .ttf .otf`) | Done; baseline commit `2c27652` pushed to `origin` = https://github.com/RobleusCaesar/hellfall (public) on 2026-09-06, LFS 123 objects / 113 MB uploaded. |

### 1.2 Present - code, generators and pipeline scripts (every path checked against the tree on 2026-09-06)

| Area | Files | State |
|---|---|---|
| C++ project skeleton | `Hellfall.uproject` (EngineAssociation "5.8"; plugins PythonScriptPlugin, EditorScriptingUtilities, EnhancedInput, ModelingToolsEditorMode - editor-only, part of the default 5.x plugin set, unused by the pipeline and harmless - and `AndroidFileServer` explicitly **disabled** so the editor stops appending its settings block to `Config/DefaultEngine.ini`, `BUILD.md` 3.21), `Source/Hellfall.Target.cs`, `Source/HellfallEditor.Target.cs` (both `BuildSettingsVersion.V7`, which is `Latest` in 5.8), `Source/Hellfall/Hellfall.Build.cs`, module with `AHellfallCharacter`, `UHellfallMovementComponent` (stand/crouch/crawl), `AHellfallPlayerController`, `AHellfallGameMode`, `AHellfallHUD` (on-screen controls; header `HELLFALL  greybox build`), `UHellfallTuning` (loads `Data/movement.json` and `Data/levels.json`) | Written against the UE 5.8 API by inspection and reviewed once against the installed 5.8 engine sources on 2026-09-06; the review's four fixes are in (`Source/Hellfall/README-SOURCE.md`): the Enhanced Input mapping is built from the tuning subsystem in `SetupPlayerInputComponent`, so the JSON binds and `invert_y` reach the mapping on first load and after every F1 toggle; the tuning is applied at `InitializeComponent` (spawn, before possession); V7; the paused input mode is re-applied on focus regain so alt-tab while paused cannot lock the game. One `// TODO(VERIFY 5.8)` remains in `Source/` (section 6). **Not compiled**: Build Tools not installed. |
| Config | `Config/DefaultEngine.ini` (DX12 targeting SM6, no Lumen / Nanite / VSM, TAA, motion blur off, default maps; the editor-written `AndroidFileServer` block removed and the plugin disabled at the source), `Config/DefaultGame.ini` (description "Greybox and traversal (gate-0 pipeline build; Gate 1 after approval)", `MapsToCook` = both maps), `Config/DefaultInput.ini`, `Config/DefaultEditor.ini` | Text only; reviewed by reading; loaded by the editor on 2026-09-06 without warnings; the DX12 / SM6 choice ran in the packaged twin on the iGPU (`BUILD.md` 1.2). |
| Level generators | `Tools/ue/hf_geometry.py` (pure Python: plan -> boxes), `Tools/ue/hf_common.py` (UnrealEmitter + ManifestEmitter), `Tools/ue/build_greybox.py`, `Tools/ue/build_feel_gym.py`, `Tools/ue/run_editor_script.ps1` (`-NoCode` for the code-free twin; automatic when `Binaries\Win64\UnrealEditor-Hellfall.dll` is absent), `Tools/ue/_engine.ps1` | Dry run passes (`Tools/test_dry_run.ps1`, 7 steps, deterministic SHA256). **Ran on the real engine 2026-09-06** through the code-free twin: both maps saved, 0 errors, 0 warnings (`BUILD.md` 1.1). Light / label rework in progress by the tools owner (`Tools/README.md`). |
| Validators | `Tools/validate_floorplan.mjs`, `Tools/check_manifest.mjs` (node 24) | Both pass on the committed `Data/` (0 warnings). Each takes the file to check as its first argument. |
| Pipeline scripts | `Tools/setup_toolchain.ps1`, `Tools/generate_project_files.ps1`, `Tools/build_editor.ps1`, `Tools/package.ps1` (UAT BuildCookRun, Development, `IncludeDebugFiles=False`, stages `Data/` and `Launch-FeelGym.cmd`), `Tools/release.ps1` (gh release with the zip and these notes), `Tools/test_dry_run.ps1` | Engine-dependent ones resolve the engine (`UE_ROOT`, then the default Launcher folder - accepted only when `Engine\Build\Build.version` matches - then HKLM, then HKCU source builds) and fail loudly with the install instructions when it is absent. `generate_project_files.ps1`, `build_editor.ps1`, `package.ps1` and `release.ps1` have not run yet (compiler pending); the UAT verbs `package.ps1` issues (`-cook -stage -pak -archive`, Development, `-nodebuginfo`) were proven by hand on the code-free twin (`BUILD.md` 1.2). |
| Level registry and floor-plan doc | `Data/levels.json`, `Docs/FLOORPLAN.md` | Registry: `executive_floor` (order 10), `feel_gym` (order 900, hidden); each entry has `id`, `display_name`, `map`, `order`, optional `hidden`. |

---

## 2. What is blocked, and why

| Blocked item | Cause | Who can unblock | Effect |
|---|---|---|---|
| C++ compile (`HellfallEditor`), cook and package of the real project | Visual Studio 2022 Build Tools (VCTools workload, Windows 11 SDK 26100) are **not installed**. Two winget attempts on 2026-09-06 were cancelled at the UAC prompt (installer exit 1602); the agent cannot elevate, and the Microsoft Store does not carry the package. | **Rob**: `Docs/TOOLCHAIN-SETUP.md` step 2, either route - the elevated winget one-liner (route A) or the Build Tools installer from visualstudio.microsoft.com with "Desktop development with C++" + Windows 11 SDK 10.0.26100 (route B). About 20 minutes unattended, one UAC click. | No `HellfallEditor` binary, so no first-person controller in the editor, no cook of the real project, no `.zip`. |
| `gate-0` Release with a runnable `.zip` (REQ-G1-001 acceptance 1 and 3) | The above. | Follows automatically once Build Tools are installed (section 5). | The spec's proof of the pipeline end to end is pending, not failed. The pipeline itself has been proven on the code-free twin (`BUILD.md` 1.2), but a twin has no game mode and cannot stand in for the compiled project. |

Unblocked since 2026-09-05: **Unreal Engine 5.8.2** (installed; map generation works, `BUILD.md` 1.1), the **exact engine hotfix** in `BUILD.md` (5.8.2, CL 56702186, recorded), **.NET SDK 8** (8.0.424 - it was already present on 2026-09-05; the earlier "not installed" entry was wrong), **Blender 5.2.1** (installed), the **GitHub remote** (`RobleusCaesar/hellfall`, public, created 2026-09-06 by the lead with `gh`; `main` pushed at `2c27652`; 123 LFS objects / 113 MB uploaded), and the **cook / stage / pak / archive pipeline** (proven on the twin, `BUILD.md` 1.2).

Not blocked: everything in section 1, the dry-run tests, the validators, map generation, pushing.

---

## 3. Rob's next actions (in order; each under a minute of attention unless noted)

1. ~~Sign in to the Epic Games Launcher and install UE 5.8~~ **Done 2026-09-06** (5.8.2 at `C:\Program Files\Epic Games\UE_5.8`).
2. **Install Visual Studio 2022 Build Tools** (about 20 minutes unattended; one UAC click): `Docs/TOOLCHAIN-SETUP.md` step 2, route A (paste the elevated winget one-liner) or route B (download "Build Tools for Visual Studio 2022" from visualstudio.microsoft.com and tick "Desktop development with C++" with the Windows 11 SDK 10.0.26100). The agent's two winget attempts died at the UAC prompt, and the Microsoft Store does not offer it. .NET SDK 8 and Blender are already present. Say "Build Tools installed" when the installer reports success.
3. **Confirm the review machine** (section 4, decision A): "yes, this laptop" or the CPU / GPU / RAM / resolution of the real one.
4. **State the time expectation per gate** (decision B): a day, a few days, or a week for Gate 1.
5. **Accept or change the binds** (decision C): Space jump, Left Ctrl crouch, C crawl, Left Shift sprint, F1 feel gym.
6. **Read the doorway-jump note** in `Docs/METRICS.md` section 2 (a 95 cm jump under a 220 cm door header will touch the header; the feel gym will show whether that reads as a bonk). No answer needed now; it is flagged so it is not a surprise at Gate 1.
7. **LFS quota:** say whether you accept the free LFS tier for now (the first push uploaded 113 MB; every fresh clone pulls about 110 MB of LFS objects; see `BUILD.md` 3.16 for the arithmetic and the fallbacks). If a second, competing agent will also clone the repository, say so - that doubles the bandwidth. The repository itself needs nothing from you: https://github.com/RobleusCaesar/hellfall exists, public, pushed 2026-09-06.
8. Nothing else: once Build Tools are installed, everything in section 5 runs without you.

---

## 4. The three spec decisions Rob still owns (agent defaults in force until he answers)

| | Decision (spec "Gaps & Risks") | Agent default now in force | Where it is recorded |
|---|---|---|---|
| A | **Review machine spec.** Every performance target is measured on it, and it decides Lumen vs baked. | The audited laptop (Ryzen 7 7730U, integrated Vega-class Radeon, 15.4 GB, 1920x1080@60) is assumed to be the review machine. Because that GPU does not meet Epic's Lumen or Nanite hardware requirements for UE 5.8, the G-7 fallback is taken now: **static/baked lighting, no Lumen, no Nanite, no Virtual Shadow Maps, DX12 SM6, TAA, motion blur off.** The packaged twin already ran on this GPU under DX12 SM6 (`BUILD.md` 1.2). If the real review machine has a discrete RTX 2000+/RX 6000+ GPU, say so and this is revisited before Gate 3. | `BUILD.md` section 2, `Config/DefaultEngine.ini` |
| B | **Time expectation per gate.** | Assumed: Gate 1 in days, not weeks; the agent optimises for a first feel-gym build as early as the toolchain allows, then iterates on Rob's notes. | This file |
| C | **Crouch vs crawl binds.** | Space = jump, **Left Ctrl = crouch toggle, C = crawl toggle**, Left Shift = sprint (hold), E = interact, Esc = pause, F1 = feel gym. C for crawl matches both earlier prototypes. Rob's earlier prototype used Space for crouch; the spec's controller requirement fixes Space as jump, so crouch moved to Ctrl. Changing any of this is a one-line edit in `Data/movement.json : binds`, read by the input mapping and the HUD alike. | `Data/movement.json`, `BUILD.md` 3.2, `Docs/METRICS.md` |

Agent decisions recorded here so nothing in Rob's tests reads as a defect by surprise: **reference figures are non-colliding scale references, not obstacles** (`Data/greybox_style.json : reference_figure.collision`; the lead applies the flag and regenerates; `BUILD.md` 3.22) - several stand 25-60 cm from walls and the REQ-G1-007 wall-slide passes through them instead of catching; **greybox lighting is even fill** (non-inverse-square point lights, unitless intensity) and **labels are single-sided, facing the player's approach** (`BUILD.md` 3.12, `Tools/README.md`); **duct mouths carry 6 cm lips**, so the clear mouth is 100 x 83 and the crawl entry has about 9 cm of margin, while the feel-gym tunnels have no lips (`Docs/METRICS.md` row 15).

---

## 5. What happens automatically once Build Tools are installed

Already done on 2026-09-06 (no compiler needed): both maps generated through `run_editor_script.ps1 -NoCode` (`BUILD.md` 1.1), the exact engine version recorded in `BUILD.md` section 1, the cook / stage / pak / archive pipeline proven on the code-free twin (`BUILD.md` 1.2), the repository pushed.

Run by the agent from the repository root, in this order. Each script checks its prerequisites (engine path from `$env:UE_ROOT`, then the default install folder - accepted only when `Engine\Build\Build.version` matches - then the Launcher's registry entry, then HKCU source builds; the registry entry is currently absent and the default folder is what resolves; `vswhere`, `dotnet`) and stops with the fix printed if one is missing.

```powershell
.\Tools\generate_project_files.ps1                          # UnrealBuildTool -projectfiles -> Hellfall.sln (prints the engine version; BUILD.md is edited by hand, already done for 5.8.2)
.\Tools\build_editor.ps1                                    # HellfallEditor Win64 Development (first C++ build: ~5-15 min on this laptop; first build with BuildSettingsVersion.V7 - a promoted warning-as-error is fixed in code, never downgraded)
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py   # UnrealEditor-Cmd -run=pythonscript: rewrites /Game/Maps/L_ExecutiveFloor with the compiled module (identical output expected)
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py  # rewrites /Game/Maps/L_FeelGym
.\Tools\package.ps1 -Tag gate-0                             # UAT BuildCookRun Win64 Development, no debug files, Data/ + Launch-FeelGym.cmd staged, zipped
.\Tools\release.ps1 -Tag gate-0                             # gh release create gate-0 --notes-file GATE-0-NOTES.md <zip>
```

Expected wall time on this machine: one to two and a half hours, dominated by the first C++ build and the cook (the twin's cook / stage / pak took 3 minutes, so the greybox content itself is cheap; the real project adds the module build and its shaders). None of it needs Rob. Expected `.zip` size for a greybox project: 400-900 MB (the twin staged 596 MB before zipping), under the 2 GB Release file limit.

**Note on scope.** The spec's gate-0 build "contains only the template level". This project is created from scratch (BUILD.md 3.1), so the gate-0 zip contains the generated greybox and feel gym instead of a template level - strictly more than asked, produced by the same pipeline the gates will use. Gate 1 is not started by this: the greybox is the pipeline's test payload, and Gate 1 begins only when Rob has approved Gate 0 and answered the three decisions above.

**What Rob tests in the gate-0 build (REQ-G1-001 acceptance 1):** unzip, run `Hellfall.exe`, confirm a first-person view with mouse look and WASD, press F1 and confirm the feel gym loads, run `Launch-FeelGym.cmd` and confirm it starts in the gym. That is the whole test; feel and dimensions are Gate 1.

**Pipeline proof vs gate-0 candidate.** The 2026-09-06 twin package (`Builds/pipeline-test/`, git-ignored) proves cook / stage / pak / archive and that the DX12 SM6 build runs on the iGPU; it is **not** a gate-0 candidate and is not shipped. It has no `Hellfall` module, so the engine falls back to `AGameModeBase` and the flying default pawn (the log's `Failed to find object 'Class /Script/Hellfall.HellfallGameMode'` is expected there) with no HUD, no F1 and no `Data/` tuning - none of the test above would pass on it. Gate-0 stays on the compiled project.

**For the lead when committing:** `git lfs install` is done and the baseline commit `2c27652` (pushed to `origin`) carries `.gitattributes` / `.gitignore` with `SourceAssets/` (`git lfs ls-files` reports 126 files; 123 unique objects uploaded). `Content/` (2 maps + 24 materials, generated 2026-09-06) goes into the next commit; after that, commit `.umap`/`.uasset` output only at gate tags, since every regenerated map is a new LFS object. The root twin `HellfallNoCode.uproject` and `Saved/NoCodeTwin/` are git-ignored and must never be committed. The C++ reviewer's note stands: git reports `LF will be replaced by CRLF` for every `Source/` file on this machine (`core.autocrlf`); the working copies are LF and `.gitattributes` says `* text=auto`, so the committed blobs are LF - decide whether to pin `eol=lf` before the next commit so the tree stays byte-stable.

---

## 6. Known gaps and `TODO(VERIFY 5.8)` markers

The C++ has not been compiled, so its correctness against the UE 5.8 API still rests on inspection plus one source-level review against the installed engine (`BUILD.md` section 1); the editor Python has run on 5.8.2 (`BUILD.md` 1.1) and its output has been cooked and run in a packaged twin (`BUILD.md` 1.2). The convention across the repository is a `// TODO(VERIFY 5.8): ...` comment (or `# TODO(VERIFY 5.8)` in Python) at every symbol or behaviour that could not be confirmed. The list below is regenerated from this grep immediately before these notes are published:

```powershell
Get-ChildItem -Recurse -File Source, Tools, Config, Data, Docs, Hellfall.uproject, README.md, BUILD.md, LEVELS.md | Where-Object { $_.Name -ne 'BUILD-PLAN.md' } | Select-String -Pattern "TODO\(VERIFY" | ForEach-Object { "$($_.Path -replace [regex]::Escape($PWD.Path + '\'), ''):$($_.LineNumber): $($_.Line.Trim())" }
```

**Snapshot 2026-09-06 16:26:57 UTC** (the grep's output, pasted verbatim as the last edit before publication; re-run by the lead after the light/label rework and the level-recreate fix landed):

```
Source/Hellfall/HellfallCharacter.cpp:372:  // TODO(VERIFY 5.8): first run - push the mouse forward; the view must pitch UP. If it does not, the
Source/Hellfall/README-SOURCE.md:90:   `TODO(VERIFY 5.8)` marker left under `Source/` is the look sign (step 2); spots discussed in comments
Tools/README.md:177:  carries `TODO(VERIFY 5.8)` (sky-light recapture, the fill-light property names `use_inverse_squared_falloff` /
Tools/ue/hf_common.py:15:editor carries a ``TODO(VERIFY 5.8)`` comment and uses the most conservative call.
Tools/ue/hf_common.py:371:                comp.set_editor_property("use_inverse_squared_falloff", True)   # TODO(VERIFY 5.8): property name
Tools/ue/hf_common.py:377:                # TODO(VERIFY 5.8): bUseInverseSquaredFalloff and LightFalloffExponent are UPROPERTYs of
Tools/ue/hf_common.py:403:            # TODO(VERIFY 5.8): recapture after mobility change may be needed: comp.recapture_sky()
Docs/ASSET-MANIFEST.md:17:5. **Audio:** WAV imports natively. MP3 import is expected to work in UE 5.8 but is not verified on this machine; if it fails the six MP3s are transcoded to WAV at Gate 3/6 a [...]
Docs/TOOLCHAIN-SETUP.md:65:If UnrealBuildTool later reports that it wants a specific MSVC toolset (UE 5.8 recommends v14.50), the agent will give you one more `winget ... --override "--add Microsoft.V [...]
BUILD.md:21:**C++ state:** nothing has been compiled (Build Tools not installed). The module had one source-level review against the installed 5.8 engine sources on 2026-09-06 and four fixes from it ( [...]
BUILD.md:33:What this proves: the `unreal` API calls in `Tools/ue/hf_common.py` work on 5.8.2 as written (level create/save, `StaticMeshActor` with `/Engine/BasicShapes/Cube`, one Material per tint, ` [...]
BUILD.md:163:WAV imports natively. MP3 import in UE 5.8 is expected but unverified on this machine; fallback is a WAV transcode at Gate 3/6. `// TODO(VERIFY 5.8): MP3 import.`
BUILD.md:206:| 2026-09-06 | 0 | **UE 5.8.2 (CL 56702186) installed** via the Epic Games Launcher; exact version recorded in section 1 (registry key not yet written by the Launcher - default-folder / ` [...]
BUILD.md:207:| 2026-09-06 | 0 | **GitHub remote created and pushed** (https://github.com/RobleusCaesar/hellfall, public; `main` at `2c27652`; LFS 123 objects / 113 MB). **Pipeline proof** (1.2): UAT B [...]
```

**Count: 4 code markers** (`Source/Hellfall/HellfallCharacter.cpp:372`, `Tools/ue/hf_common.py:371`, `Tools/ue/hf_common.py:377`, `Tools/ue/hf_common.py:403`) **and 3 documentation markers** (`Docs/ASSET-MANIFEST.md:17`, `Docs/TOOLCHAIN-SETUP.md:65`, `BUILD.md:163`). The other 7 matching lines (`Source/Hellfall/README-SOURCE.md:90`, `Tools/README.md:177`, `Tools/ue/hf_common.py:15`, `BUILD.md:21`, `BUILD.md:33`, `BUILD.md:206`, `BUILD.md:207`) only describe the convention or refer to this list and are not markers. Grep over `Source/ Config/ Tools/ Data/ Docs/ Hellfall.uproject README.md BUILD.md LEVELS.md` (`Saved/`, `SourceAssets/`, `Builds/`, `__pycache__/`, `Docs/BUILD-PLAN.md` and this file excluded); output lines longer than 200 characters are cut with `[...]`, the `path:line` prefixes are exact.

| Marker | What must be verified | State |
|---|---|---|
| `Source/Hellfall/HellfallCharacter.cpp:372` | Mouse pitch sign: with legacy input scales off, pushing the mouse forward must pitch the view UP; if not, `invert_y` in `Data/movement.json` (data fix - now honoured, because the mapping is built from the tuning subsystem) or one sign in `Input_Look` (code fix). | Open - needs the compiled module and a first launch. Reasoned correct against the 5.8 sources (no negation with `bEnableLegacyInputScales=False`), not run. |
| `Tools/ue/hf_common.py:371` | `use_inverse_squared_falloff` as the reflected Python name of `bUseInverseSquaredFalloff` on the legacy inverse-square light path (no generator path produces such a light today - every light is even fill). | Open, dead path today; a wrong name raises and prints `FAILED:` the first time a style entry asks for `inverse_squared`. |
| `Tools/ue/hf_common.py:377` | The even-fill light property names `use_inverse_squared_falloff`, `light_falloff_exponent` and `LightUnits.UNITLESS` on `PointLightComponent` (the tools owner's light rework). | Open until the next commandlet run after the rework: a wrong name raises and prints `FAILED:`, so it cannot pass silently. |
| `Tools/ue/hf_common.py:403` | Whether `SkyLightComponent.recapture_sky()` is needed after the mobility change (feel gym only). | Exercised in the feel-gym run without error; whether the sky actually lights the gym is a visual check once the editor or a packaged build can be opened. |
| `Docs/ASSET-MANIFEST.md:17`, `BUILD.md:163` | MP3 import through the 5.8 sound factory (fallback: WAV transcode of the six MP3s at Gate 3/6). | Open - no import before Gate 3. |
| `Docs/TOOLCHAIN-SETUP.md:65` | Whether UnrealBuildTool for 5.8 accepts the MSVC v14.4x toolset shipped with Build Tools 17.14 or insists on v14.50 (then one more `winget --override --add Microsoft.VisualStudio.Component.VC.<ver>.x86.x64` line, id taken from UBT's message). | Open - Build Tools not installed. |

Resolved since the 2026-09-05 snapshot: `Source/Hellfall.Target.cs` `BuildSettingsVersion.V5` (both targets now use V7, confirmed equal to `Latest` in the installed `TargetRules.cs`); the `Tools/ue/hf_geometry.py` TextRender facing convention (a TextRender reads from its local +X side and is mirrored from behind - verified on the packaged twin's frames, which is why every label is now single-sided facing the approach); the five `hf_common.py` API-name markers replaced by `VERIFIED 5.8.2` notes after the first editor run.

**Verification points without a code marker** (kept here so they are not forgotten):

| Where | What | State |
|---|---|---|
| `Tools/ue/run_editor_script.ps1` | The headless invocation `UnrealEditor-Cmd.exe "<proj>.uproject" -run=pythonscript -script="<abs>.py" -stdout -FullStdOutLogOutput -unattended -nosplash -nopause`; PythonScriptPlugin and EditorScriptingUtilities loading in the commandlet. | **Verified 2026-09-06** on the code-free twin (`BUILD.md` 1.1). `sys.exit(0)` gives process exit code 0; **non-zero propagation (`sys.exit(1)`) and the `-Mode Editor` / `-ExecutePythonScript` alternative remain unverified** - the wrapper's `FAILED:` / `LogPython: Error` scan stays as the fallback. `-NoCode` is implemented (`run_editor_script.ps1 -NoCode`; automatic when `Binaries\Win64\UnrealEditor-Hellfall.dll` is absent; `BUILD.md` 3.20). |
| `Tools/ue/hf_common.py` | The 5.8 editor Python API used to create and save a level, spawn actors, set static meshes and materials, and add TextRender labels (`unreal.LevelEditorSubsystem`, `unreal.EditorActorSubsystem`, `unreal.EditorAssetLibrary`, `/Engine/BasicShapes/Cube`). | **Verified 2026-09-06**: both maps created, populated and saved, then cooked and loaded in the packaged twin; 0 errors, 0 warnings. Regeneration determinism at the `.umap` byte level is not yet checked (run twice, compare). |
| `Source/Hellfall/` | Enhanced Input created in C++ at startup (`UInputAction`, `UInputMappingContext` via `NewObject`, `UEnhancedInputLocalPlayerSubsystem::AddMappingContext`), the `UCharacterMovementComponent` overrides for the three-stance capsule and clearance probe (note: the engine clamps capsule half-height to the radius, so crawl 64 is effectively 72 - `Docs/METRICS.md` row 5), `UGameInstanceSubsystem` initialisation order for `UHellfallTuning` (now read at `InitializeComponent` and in `SetupPlayerInputComponent`; a second `tuning applied` log line per spawn would mean the subsystem was not yet visible at `InitializeComponent`), `FPaths::ProjectDir()`-relative access to the staged `Data/` folder in a packaged build, the on-screen HUD drawing API, `FJsonObject::TryGet*Field` overloads, `FSlateApplication::OnApplicationActivationStateChanged` signature. | Open - needs the compiler. Reviewed against the engine sources on 2026-09-06 (possession order, `InitializeComponent` timing, input-mode behaviour, `TargetRules` versions), not run. |
| `Tools/package.ps1` | UAT `BuildCookRun` argument set for 5.8 (`-platform=Win64 -clientconfig=Development -cook -stage -pak -archive`, `-nodebuginfo`) and the staging of `Data/` next to the staged project. | The UAT verbs `-cook -stage -pak -archive` with `-clientconfig=Development -nodebuginfo` are **verified 2026-09-06** by hand on the code-free twin (`BUILD.md` 1.2). `package.ps1` itself (adds `-build`, stages `Data/`, writes `Launch-FeelGym.cmd`, zips, prints size + SHA256) has not run - needs the compiler. |
| `Config/DefaultEngine.ini` | The 5.8 names of the rendering switches for no dynamic GI, no Lumen reflections, Nanite off, virtual shadow maps off, TAA, motion blur off, DX12 default RHI with SM6 targeted. | The editor loaded the file on 2026-09-06 without config warnings, and the packaged twin ran under DX12 SM6 on the iGPU (`BUILD.md` 1.2); whether the GI / reflection / Nanite / VSM switches take effect as intended is a visual check in the compiled build. |

Other known gaps for Gate 0 (none block Gate 0 approval, all are recorded so they are not forgotten):

- The G-7 lighting decision assumes this laptop is the review machine (decision A).
- The LFS quota plan is undecided (section 3, item 7); the remote itself exists and is pushed.
- `Docs/METRICS.md` is DRAFT until the feel gym has been walked; the doorway-jump arithmetic, the effective 72 cm crawl capsule and the 83 cm clear duct mouth are flagged there.
- The `AndroidFileServer` plugin is disabled in `Hellfall.uproject` and its editor-written block was removed from `Config/DefaultEngine.ini` (`BUILD.md` 3.21). Any twin `.uproject` written **before** that change (the root `HellfallNoCode.uproject` of an in-flight wrapper run, and `Saved/NoCodeTwin/HellfallNoCode.uproject` used by the UAT pipeline tests) still enables the plugin and re-appends the block on each run; regenerate those twins from the current `Hellfall.uproject`, and if the block reappears delete it - never commit it.
- Light / label rework is in progress by the tools owner (`Tools/README.md`); the maps in the next commit are whatever the generators produce at commit time, and the `TODO(VERIFY 5.8)` snapshot above must be re-run before the commit.
- The twin package under `Builds/pipeline-test/` and the `Saved/NoCodeTwin/` folder are git-ignored working files, not deliverables.
- The audio brief said 16 files; the supplied tree holds 14. `BUILD.md` and `Docs/ASSET-MANIFEST.md` record 14.
- `crimson_hellfiend_texture_0_1.png` is a byte-identical duplicate; dropped at Gate 2, kept untouched now (no scope work before Gate 1 approval).
- The two `.ogv` videos must be re-encoded to MP4/H.264 at Gate 6; ffmpeg is not installed.
- `Docs/FLOORPLAN.md` is owned by the floor-plan author; the number inconsistencies found in the 2026-09-05 review (floor area, door-to-junction leg, Demon #1 spawn offset, the 590 alcove clearance) were partly corrected on 2026-09-06 and the file is the authority for what remains.
