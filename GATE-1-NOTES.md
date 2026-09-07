# GATE-1-NOTES.md - greybox and traversal: the law-firm floor (REQ-G1-002..007 + Rob's gate-0 feedback)

**Status (2026-09-06): GATE-1 PACKAGE BUILT; REVIEW IS ROB'S.** `Tools\package.ps1 -Tag gate-1` produced `Builds\Hellfall-gate-1-Win64-Development.zip` (327.6 MB (343,510,411 bytes), SHA256 `9B24B3B323B72F52C09C52A4C4C77A7AB608890E47F19F47744078A3D32D92B2`) in one command in 122 s, on the same compiled project and pipeline that produced gate-0 (`GATE-0-NOTES.md` 1.3). It is published with these notes as the `gate-1` Release: https://github.com/RobleusCaesar/hellfall/releases/tag/gate-1. What is new against gate-0 is everything Rob asked for after looking at the gate-0 screenshots on his phone: `L_ExecutiveFloor` is now a **37-room law-firm floor** laid out as a light maze (ring corridor around a service core, two dead-end spurs, a collapsed spur, a bullpen shortcut, eleven staging slots for monsters and scenes, about ten minutes to explore by the model in section 5), every floor / ceiling / wall / duct surface carries a faint world-aligned grid texture, and the feel gym is an **enclosed hall** with walls and a ceiling instead of an open slab under a black sky. The spec's fixed adjacency - supply closet -> duct -> break room -> corridor -> reception -> CEO office with the dividing wall and the window wall - is unchanged and is still the critical path. **Nothing in Gate 1 is claimed as met**: every acceptance criterion of REQ-G1-002..007 needs a player at the keyboard, and the agent's runs were scripted and input-free (section 6). What Rob is asked to do is section 3; the decisions he owns are section 5.

**Scope note - why the floor changed before Gate 1 was approved.** The spec freezes scope *after* a gate is approved. Gate 1 was not approved: the gate-0 zip was the pipeline proof and the first walkable Gate 1 candidate, Rob reviewed it and returned feedback ("add ceiling and walls, this is an internal map"; "create an entire floor (not too big) of a legal office"; "a tiny amount of texture on floor, ceiling and walls so it is easier to see the difference"; "design it as a bit of a maze ... where we can ultimately stage different monsters and scenes"; "about 10 minutes to explore and play"). That is exactly the feedback loop the gate protocol describes, so no approved scope was reopened and no change-control stop was needed; the five requests are treated as Gate 1 requirements alongside REQ-G1-001..007, and the spec's required rooms and adjacency remain the spine of the new floor (`BUILD.md` 3.23, `Docs/FLOORPLAN.md` section 9). The 12-room gate-0 plan is preserved at `Data/candidates/floorplan_gate0.json`, so the decision is reversible by a file swap and a regenerate.

Dates: written 2026-09-06 (Mountain time; timestamps quoted from logs and `BUILD-INFO.txt` are UTC). Machine: the Ryzen 7 7730U laptop audited in `Docs/audit/environment-2026-09-05.md` (Rob has still not confirmed it is the review machine - section 5, decision A).

---

## 1. What is in the build

### 1.1 The law-firm floor - `/Game/Maps/L_ExecutiveFloor` (REQ-G1-005/006/007 + the gate-0 feedback)

| Item | Value (from `Data/floorplan.json`, checked with `node Tools/validate_floorplan.mjs Data/floorplan.json` and the dry-run manifest on 2026-09-06) |
|---|---|
| Program | **37 rooms**: 7 `corridor_*` rooms (`corridor_north_w` 1480 x 280, `corridor_main` 1980 x 280, `corridor_east` 280 x 980, `corridor_south` 4480 x 280, `corridor_sw` and `corridor_se` 280 x 1430 spurs, `corridor_blocked` 480 x 280 stub), 2 lobbies (`west_lobby` 980 x 580, `gallery_west` 480 x 980) and 28 rooms - the spec's supply closet, break room, men's / women's restrooms, Office #1 / #2, elevator lobby, reception and CEO office ("Managing Partner's Office"), plus the law-firm program: 5 partner offices, 4 associate offices, law library (the one 330 ceiling), paralegal bullpen, boardroom, conference room, records / file room, copy / mail, IT closet, janitor, storage, a locked stairwell. Roles: 1 start, 9 transit, 20 optional, 4 dead-end, 1 goal, 2 sealed. |
| Openings | **38**: 22 doors 120 x 220, 13 cased openings (280 or 480 wide, full height), 2 locked doors (women's restroom, stairwell - infilled, `LOCKED` labels on the corridor side), 1 window (the 1480 x 260 money-shot glass, impassable). Plus the duct. |
| Duct | `duct_supply_to_break`, 100 x 95 interior, 520 face to face, 6 cm lips (clear mouth 100 x 83): the closet's only exit, crawl only, lit mid-tube. |
| Blockers | `collapse` in `corridor_blocked` (200 cm of rubble floor to ceiling behind a 280 cm walkable stub, seen end-on from the west gallery); `elevator` doors 200 x 220 flush in the elevator lobby's exterior east wall. Both impassable by every stance. |
| Footprint | 5500 x 4800 cm including outer walls (55 x 48 m), 1772 m2 of interior; every room origin on the 50 cm grid, every interior `50k - 20`, walls 20. |
| Topology | Ring `corridor_main -> corridor_east -> corridor_south -> gallery_west -> west_lobby -> corridor_north_w -> corridor_main` (~108 m of centreline) plus the bullpen chord between the two long corridors = **2 independent loops**; **4 dead ends** (collapsed stub, elevator lobby, SW spur, SE spur); 19 leaf rooms on one door. `Docs/FLOORPLAN.md` section 2 has the graph and every decision point in walking order. |
| Critical path | `supply_closet -> break_room -> corridor_main -> corridor_north_w -> west_lobby -> gallery_west -> corridor_south -> reception -> ceo_office`: **~103 m over 8 legs**, 3 corridor junctions (`corridor_main`, `corridor_north_w`, `corridor_south`) + 2 lobby junctions = 6 decision points. Deliberately the long way round (it carries Demon #1 and the collapse); the shortest route is ~63 m through the bullpen (78.6 m round the east corridor) and bypasses Demon #1 - Rob's call, section 5. |
| Exploration estimate | **~10.8 min** by `Data/metrics.json : exploration_model` (7 corridors 123 m walked twice + 28 rooms 409 m at 400 cm/s + 12 s look-around per room, x 1.3 pacing; target 8-12). A design check, not a measurement - Rob's watch is the referee (section 3). |
| Markers | 37 reference figures (180 cm, one per room, no collision), 18 `NOTE` labels with the Gate 2 dressing intent, 4 checkpoints (`cp_start`, `cp_break_room`, `cp_corridor_post_pickup`, `cp_ceo_entry` at (3140, 4040)), 2 encounters drawn as translucent trigger / spawn / retreat / strafe lanes (Demon #1 in the west lobby out of Office #2's door, retreat 900 east, strafe 200; Demon #2 behind the dividing wall in the CEO office, trigger strip y 4100-4200, retreat 700 west, strafe 250), the dwell rect on the glass. |
| Scenes (new) | **11 staging slots** as kind-tinted translucent floor markers with a `KIND: id` label and a wrapped description: 3 monster (`sc_library_lurker`, `sc_spur_sw`, `sc_partner_5`), 2 ambush (`sc_files_ambush`, `sc_junction_ambush`), 2 scene (`sc_bullpen_massacre`, `sc_boardroom`), 2 pickup (`sc_guard_shotgun`, `sc_server_pickup`), 2 reveal (`sc_break_trail`, `sc_reception_glow`). Review markers only - no collision, no gameplay; Gate 2 replaces them (`Docs/FLOORPLAN.md` section 6 has the intended rhythm). |
| Money shot | From the CEO doorway the 1480 window subtends **86.3 deg of the 90 deg FOV = 96 %** (`check_manifest.mjs`); the dividing wall (x 3300-3880 at y 4400) hides the east 30 % of the glass from the door centre, **net ~71 %**, still >= the 60 % gate. Demon #2's spawn is hidden from all three doorway rays with >= 132 cm to spare (`Docs/FLOORPLAN.md` sections 5 and 7). |
| Surfaces (new) | Every architectural material is `lerp(tint, engine grid, strength)` with the grid projected in world space: floor 50 cm tile at 0.14, ceiling 60 cm at 0.10, wall 100 cm at 0.06, duct 25 cm at 0.10; tints re-balanced so edges read (floors ~0.5 grey, ceilings 0.72, walls ~0.85). Engine content only, nothing third-party. The editor run reported all **11 architectural materials textured, none fell back to flat**. |
| Lighting | Even fill (Movable point lights, inverse-square off, unitless intensity, no bake), now a **grid per room** at most 800 cm apart with the radius clamped to 1000 cm - **59 lights**. Section 6 records why (the first gate-1 sweep was blown out to white). |
| Dry run | **590 actors** (37 floors, 37 ceilings, 129 walls, 41 headers, 40 thresholds, 3 infills, 10 glass panes + 9 mullions + 1 sill, 3 collapse boxes, 8 duct boxes, 1 divider, 37 + 37 figure bodies / heads, 4 checkpoints, 31 markers, 7 hidden boundary boxes, 95 labels, 59 lights, 1 player start); **316 collision boxes, 0 overlaps**; **enclosure 37/37** (every slab has a ceiling and four walls, only authored openings are gaps); money shot PASS. `Content/Maps/L_ExecutiveFloor.umap` on disk 1,032,980 bytes (regenerated 2026-09-06). |

### 1.2 The feel gym - `/Game/Maps/L_FeelGym` (REQ-G1-004)

Same stations as gate-0 (doorways 90 / 110 / 120 / 140 at 220 high; corridors 200 / 260 / 320 x 10 m; rooms 5 x 5 m at ceilings 270 / 300 / 350; jump ledges 40 / 60 / 80 / 100 / 120; a nine-step ramp 20 -> 60; crawl tunnels 90 / 100 / 110 high, 5 m long; a 180 cm figure and a dimension label beside every element), now inside an **enclosed hall**: 20 cm walls around the 60 x 44 m slab and a ceiling at `metrics.feel_gym.hall_ceiling_cm` = **450** over the whole slab (the station rooms, corridors and tunnels keep their own lower ceilings inside it); no sun, no sky light; 48 even-fill hall lights on an 8 x 6 grid plus the 12 station lights. **222 actors**, 71 collision boxes, 0 overlaps, enclosure PASS (1 slab, 4 sides). `Content/Maps/L_FeelGym.umap` on disk 394,074 bytes (regenerated 2026-09-06). Docs: `Docs/METRICS.md` section 3 maps every station to the metrics row it settles.

### 1.3 Controller, data, tooling (unchanged unless stated)

| Area | State |
|---|---|
| C++ (`Source/Hellfall/`) | The gate-0 module: `AHellfallCharacter`, `UHellfallMovementComponent` (stand / crouch / crawl, clearance probe, stand-up suppression in low geometry), `AHellfallPlayerController`, `AHellfallHUD` (on-screen controls + status), `UHellfallTuning` (loads `Data/movement.json` and `Data/levels.json` from the staged `Hellfall\Data\`). **New:** `AHellfallGameMode` reads the map URL option `?spawn=X,Y,Z,Yaw` (Unreal cm / degrees; the capsule is lifted onto the floor automatically; absent or malformed = the normal PlayerStart) - a review aid for jumping straight to a room, used by the screenshot sweep. Binds unchanged: W/A/S/D, mouse, Space jump, Left Ctrl crouch, C crawl, Left Shift sprint, E interact (Gate 5), Esc pause, F1 feel gym. |
| Data | `Data/floorplan.json` = the law-firm floor, **generated** by `Docs/candidates/legal_lead.build.mjs` (room table + one-line opening calls + notes / checkpoints / encounters / scenes / money shot / critical path, with self-checks that refuse to write a broken plan) -> `Data/candidates/legal_lead.json`, byte-identical. `Data/greybox_style.json`: `surface_texture`, the light grid (`lights.light_spacing_cm` 800, `max_attenuation_radius_cm` 1000), `scene_marker`, note labels 11 cm, `labels.notes_enabled` switch. `Data/metrics.json`: `feel_gym.hall_ceiling_cm` 450, `exploration_model`; every architecture metric unchanged (`Docs/METRICS.md`). `Data/review_shots.json`: 31 review viewpoints (24 floor, 7 gym). `Data/movement.json`, `Data/levels.json`: unchanged. |
| Generators | `Tools/ue/hf_geometry.py` (textured tint recipe per surface class; light grid; scene markers; label facing rule (c') - rooms off non-critical spurs face any neighbouring door), `Tools/ue/hf_common.py` (materials rebuilt from the recipe on every run through the engine `WorldAlignedTexture` function, flat fallback with a warning), `Tools/ue/build_feel_gym.py` (hall walls, ceiling, light grid; refuses a hall ceiling that does not clear the tallest station + light drop). |
| Validators | `Tools/validate_floorplan.mjs`: scenes schema; transit rooms <= 320 wide on the corridor -> reception leg are corridors, wider are lobbies (INFO line, room rules); Demon #1 must be in the room Office #2's door opens into; the PASS line prints the exploration estimate, critical-path length and junction count with the model constants read from `Data/metrics.json`. `Tools/check_manifest.mjs`: **enclosure check** (every floor slab roofed and walled; a gap > 30 cm outside an authored opening fails - proven negative: one break-room wall removed -> `775 cm gap`). Both PASS on the committed `Data/` (2 INFO lines, 1 expected WARN: Demon #2's straight line to the player is blocked by the dividing wall, which is the point of the wall). `Tools/test_dry_run.ps1`: 10 steps incl. determinism (two dry runs, identical SHA256) and a scenes smoke test. |
| Review tooling (new) | `Tools/screenshot_sweep.ps1 -Tag gate-1` launches the packaged game once per viewpoint in `Data/review_shots.json` with `?spawn=` (plan -> Unreal: `X = plan.y`, `Y = -plan.x`, `yaw = plan yaw - 90`), `-DumpMovie`, and keeps the last frame under `Saved\ReviewShots\gate-1\<id>.png`; `Tools/contact_sheet.ps1 -Tag gate-1` tiles them per map with captions (`sheet_<map>.jpg`) so a whole sweep reads on a phone. The sweep targets `Builds\gate-1\Windows\Hellfall\Binaries\Win64\Hellfall.exe`: the root `Hellfall.exe` is a **bootstrapper** that starts the inner binary and exits at once. |
| Pipeline | Unchanged: `Tools/package.ps1` (UAT `BuildCookRun`, Development, no PDBs, stages `Data\`, writes `Launch-FeelGym.cmd` + `BUILD-INFO.txt`, zips, prints size + SHA256), `Tools/release.ps1`. |

### 1.4 The gate-1 package (2026-09-06)

| Item | Value |
|---|---|
| Command | `.\Tools\package.ps1 -Tag gate-1 -Configuration Development` (one command: game target build + cook + stage + pak/IoStore + archive, then `Data\` copy, `Launch-FeelGym.cmd`, `BUILD-INFO.txt`, zip) |
| Result | UAT `BUILD SUCCESSFUL`; 122 s wall time for the whole script as measured by the lead. |
| Staged tree | `Builds\gate-1\Windows\` - `Hellfall.exe` (bootstrapper), `Launch-FeelGym.cmd`, `BUILD-INFO.txt` (tag gate-1, Development, engine `5.8.2-56702186+++UE5+Release-5.8`, git revision `e92bea2`), `Hellfall\Data\` (copied from `Data\`), `Hellfall\Binaries\Win64\Hellfall.exe` (the game), `Engine\`, `Hellfall\` |
| Zip | `Builds\Hellfall-gate-1-Win64-Development.zip` - **327.6 MB (343,510,411 bytes)**, SHA256 **`9B24B3B323B72F52C09C52A4C4C77A7AB608890E47F19F47744078A3D32D92B2`**. `Builds\` is git-ignored; the zip ships only on the Release. |
| Cooked content | `L_ExecutiveFloor` (590 actors), `L_FeelGym` (222 actors), 29 `M_GB_*` materials (24 from gate-0 + 5 `scene_*` tints; 11 textured). |
| Published | https://github.com/RobleusCaesar/hellfall/releases/tag/gate-1 (`Tools\release.ps1 -Tag gate-1`, run by the lead with this file as the release body). |
| Agent verification | Editor regeneration of both maps: 0 errors, all 11 architectural materials under `materials_textured`, none under `materials_flat_fallback`. Dry run and both validators PASS on the packaged `Data\` (590 / 222 actors, 0 overlaps, enclosure 37/37 and 1/1, money shot 96 %). The screenshot sweep (`Tools/screenshot_sweep.ps1`, 31 viewpoints) is what exposed the light-radius defect in the first gate-1 build; the fix (the light grid, section 6) is in the regenerated maps that were packaged - the lead's re-sweep is the visual evidence for it, these notes only record the finding and the change. **No input was given in any run**, so nothing that needs a player is confirmed (section 6). |

---

## 2. What is blocked, and why

**Nothing blocks gate-1.** The engine, the compiler, the C++ module, the generators, the package and the Release all exist and ran on 2026-09-06 (section 7). The gate-1 zip is the gate-0 pipeline applied to the new floor, the textured materials and the enclosed gym; no new install, plugin, licence or third-party asset was needed (the texture is engine content).

What is **open** is a decision or a human test, not a blocker:

| Open item | Who | Effect until answered |
|---|---|---|
| APPROVED or a feedback list for Gate 1 (section 3) | Rob | Gate 2 (prop blockout) does not start; auditing the asset bundle continues as permitted preparatory work (`BUILD.md` section 5). |
| The law-firm-floor questions (section 5, B1-B5; `Docs/FLOORPLAN.md` section 11 has all 13) | Rob | The floor stays as built: 55 x 48 m, bypasses open, dividing wall at x 3300, no second window in `partner_5`. |
| Decision A - review machine (carried from gate-0) | Rob | The G-7 fallback (no Lumen / Nanite / VSM, baked lighting from Gate 3) stands on the assumption that this laptop is the review machine; frame rate at 1920x1080 with 59 movable lights is **unmeasured**. |
| Decision B - time per gate; Decision C - binds (carried from gate-0) | Rob | Days-not-weeks assumed; Left Ctrl crouch / C crawl in the build. |
| LFS quota plan (carried from gate-0) | Rob | Free tier assumed; the regenerated maps are new LFS objects at the gate-1 tag (about 1.4 MB for the two `.umap` files). |
| Everything a scripted run cannot test (section 6) | Rob (section 3) | Gate 1 review. |

---

## 3. What to test (Rob)

Install first (section 4). Play the feel gym first, then the main level. Take notes on anything that feels off, even if you cannot say why - "this hallway feels wrong" is useful feedback; the agent's job is to diagnose it. The spec's Gate 1 checklist is reproduced verbatim from `Docs/BUILD-PLAN.md` ("Gate 1 - Rob's Review Checklist"); the law-firm-floor items after it are the agent's additions for the gate-0 feedback.

**Feel gym** (`Launch-FeelGym.cmd`, or F1 in game)

1. Walk through each doorway width without stopping. Which is the narrowest that never makes you slow down or adjust? That's your door.
2. Walk down each corridor. Does it feel like an office corridor or a tunnel? Does it feel like a warehouse? Pick the one that feels like a building.
3. Stand in each ceiling-height room and look up. Oppressive, right, or cavernous?
4. Jump the ledge staircase. Which is the highest ledge you can clear? Does jumping feel weighty or floaty?
5. Walk up the step ramp. Where does the character stop stepping up and start blocking?
6. Crawl each tunnel. Which is the lowest that doesn't feel like you're being crushed?

**Main level**

7. Walk the critical path start to finish without stopping. Did you ever catch on a corner or doorway?
8. Do you slide through doorways or squeeze through them?
9. In every room, look at the reference figure. Do you feel human-sized next to it?
10. Cross the Break Room. Does it take the right amount of time, or does it feel like a sprint or a crawl?
11. Turn 180° with the mouse. Laggy, floaty, or right?
12. Jump in a doorway. Do you bonk your head? (You shouldn't.)
13. Crawl into the duct. Is the stance transition smooth? Try reversing halfway.
14. Walk into the CEO Office through the door. Is the window wall in front of you without turning?
15. At every point, can you tell where to go next?
16. Run against every wall you can find. Any clipping, stutter, or being pushed?

**Approve when:** you can walk the whole level without ever thinking about the controls or the geometry.

**Law-firm floor specifics** (the gate-0 feedback, tested in the same walk)

17. **The gym is a room now.** Stand at the gym start and look up and around: walls on four sides, a ceiling at 4.5 m, no sky. Does the hall read as an indoor space, or as a box? Are the station labels still readable under the hall lights?
18. **Walk the ring both ways.** From the break-room door turn *left* (west) along the north corridor into the west lobby, down the gallery, east along the whole south corridor, up the east corridor and back to the break-room door; then the reverse. Where did you lose track of where you were? Did any straight feel too long (the north pair is 35 m, the south corridor 45 m)?
19. **Take the bullpen shortcut.** From the north corridor go through the wide opening into the paralegal bullpen and out its south opening onto the south corridor. Did the shortcut read as a shortcut, and did you realise you had skipped the west lobby (where Demon #1 will be)? This is the bypass question in section 5.
20. **Find the three dead ends** (four, counting the collapse): the collapsed stub off the west gallery, the elevator lobby off the east corridor, the SW spur (boardroom + partner door) and the SE spur (conference + partner door). Did each one announce itself before you had walked all the way in, or did you feel tricked?
21. **Does ten minutes feel right?** Time an unhurried first exploration - open every door you can, read the labels, back out of the dead ends - from the closet to the CEO window. The model says ~10.8 min; report your time and whether it felt short, right or long. This calibrates `exploration_model` for later floors.
22. **Can you always tell where to go?** Item 15, asked again for a maze: at each junction (break-room door, the north-corridor join, the west lobby, the gallery, the south corridor at the spurs and the reception opening) was the way to the goal legible, or did the openings all look alike?
23. **Do the textures help?** In any room, look at where the floor meets the wall and the wall meets the ceiling. Can you tell the three apart at a glance now? Is the grid too faint, too strong, or right? (It is engine content at strengths 0.14 / 0.10 / 0.06 and goes away at Gate 3.)
24. **The staging slots.** You will see coloured translucent floor patches with `MONSTER:` / `AMBUSH:` / `SCENE:` / `PICKUP:` / `REVEAL:` labels and small grey description notes. Are they where you would stage those beats? Which would you move or add? They have no collision and no gameplay.
25. **Locked doors and the collapse.** The women's restroom and the stairwell are `LOCKED`; the collapse and the elevator doors are solid. Try to get past each of them standing, crouched, crawling and jumping.

**Also useful, not required:** a 60-120 s phone or screen capture of your first walk of the critical path, per the gate protocol's optional item - it lets the agent see what you saw.

---

## 4. How to install and run

1. **Download** `Hellfall-gate-1-Win64-Development.zip` from https://github.com/RobleusCaesar/hellfall/releases/tag/gate-1 (327.6 MB (343,510,411 bytes); SHA256 `9B24B3B323B72F52C09C52A4C4C77A7AB608890E47F19F47744078A3D32D92B2` if you want to check it). **Unzip anywhere.** Nothing installs.
2. **Run `Hellfall.exe`** (the file next to `Launch-FeelGym.cmd` and `BUILD-INFO.txt`; it is a small bootstrapper that starts `Hellfall\Binaries\Win64\Hellfall.exe`). You start first-person in the Supply Closet of the law-firm floor, facing the duct mouth. Controls are on screen: W/A/S/D move, mouse look, Space jump, **Left Ctrl** crouch (toggle), **C** crawl (toggle), Left Shift sprint (hold), E interact (does nothing until Gate 5), Esc pause (releases the mouse). The duct is crawl-only: press C, then go.
3. **Feel gym:** press **F1** in game (toggles between the floor and the gym; you respawn at that map's start), or run **`Launch-FeelGym.cmd`** to start straight in the gym.
4. **Jump straight to a room (optional):** start the game from a command prompt in the unzipped folder with the map and a spawn point. The option is `?spawn=X,Y,Z,Yaw` in Unreal units (cm, degrees; Z is the floor, 0 everywhere on this floor). Examples, converted from `Data/review_shots.json` (plan -> Unreal: `X = plan.y`, `Y = -plan.x`, `yaw = plan yaw - 90`):

   ```
   Hellfall\Binaries\Win64\Hellfall.exe /Game/Maps/L_ExecutiveFloor?spawn=150,-5210,0,0        # 01: the Supply Closet player start, duct mouth ahead
   Hellfall\Binaries\Win64\Hellfall.exe /Game/Maps/L_ExecutiveFloor?spawn=1800,-1240,0,90      # 10: the west lobby at the Demon #1 approach point, Office #2's door ahead-left
   Hellfall\Binaries\Win64\Hellfall.exe /Game/Maps/L_ExecutiveFloor?spawn=4060,-3140,0,0       # 18: the CEO doorway - the money-shot framing (window wall ahead)
   Hellfall\Binaries\Win64\Hellfall.exe /Game/Maps/L_FeelGym?spawn=300,-3000,0,0               # 30: the gym start, looking down the hall
   ```

   The inner binary is given because the sweep script uses it; the root `Hellfall.exe` should pass the same command line through, but that has not been checked by the agent - if it does not, use the inner one. Without the option the normal PlayerStart applies. `?spawn` is a review aid, not a gameplay feature.
5. **Reply** with **APPROVED** or a feedback list (section 3), plus the answers you want to give in section 5. The checklist notes become the first Gate 1 revision (`gate-1.1`) either way.

`BUILD-INFO.txt` next to the executable records the engine version (`5.8.2-56702186+++UE5+Release-5.8`), configuration (Development), git revision and package time. The tuning JSON is in `Hellfall\Data\` and can be edited in place (e.g. `movement.json : player.walk_speed_cms`) - relaunch to see the change; that is REQ-G1-003 acceptance 3 without a rebuild.

---

## 5. Decisions

### 5.1 Decisions the agent made that the spec left open (recorded so nothing reads as a defect by surprise)

| # | Decision | Where it is recorded |
|---|---|---|
| A1 | **The whole law-firm program.** Which rooms a mid-size firm's floor has, how many, how big, where: 5 partner offices, 4 associate offices, a library, a bullpen, boardroom, conference room, records, copy / mail, IT, janitor, storage, a locked fire stair, plus the spec's required rooms; a ring around a service core with two spurs, a collapsed spur and a shortcut; 55 x 48 m. The spec fixes adjacency and metrics only, and Rob's brief said "an entire floor (not too big)". Designed as a generator script so every one of these is a one-line edit. | `BUILD.md` 3.23-3.24, `Docs/FLOORPLAN.md` sections 1-2 and 10, `Docs/candidates/legal_lead.md` |
| A2 | **Lobby widths.** Two of the transit rooms on the critical path are wider than a corridor on purpose - `west_lobby` 980 x 580 (the Demon #1 arena, fed by Office #1 / #2, the men's door, the corridor and the gallery) and `gallery_west` 480 x 980. The validator treats a transit room as a corridor only up to 320 wide; wider is a lobby under room rules (INFO line). Demon #1 is placed in the room Office #2's door opens into, as the spec's "corridor near Office #2" read for a lobby. | `BUILD.md` 3.25, `Docs/FLOORPLAN.md` section 2 |
| A3 | **Light grid.** Fill lights are a grid per room at most 800 cm apart with the radius clamped to 1000 cm (59 on the floor, 48 + 12 in the gym), replacing one light per room at 1.25 x the room diagonal after the first gate-1 sweep was blown out to white (section 6). Still even fill, still Movable, still no bake; Gate 3 replaces all of it. | `BUILD.md` 3.28 and section 2, `Data/greybox_style.json : lights` After the second sweep the radius clamp became 500-800 cm, intensities dropped to ~65 % and auto exposure was re-enabled (findings, section 6). |
| A4 | **Textures.** The engine's default grey grid, world-aligned, lerped faintly into each architectural tint (floor 0.14 / ceiling 0.10 / wall 0.06 / duct 0.10 at 50 / 60 / 100 / 25 cm tiles); tints darkened so floor, wall and ceiling differ in value as well as in grid. Engine content only, no licence; `surface_texture.enabled: false` returns the greybox to flat. | `BUILD.md` 3.26, `Tools/README.md` "Surface texture" |
| A5 | **Exploration model.** "About 10 minutes" is made a number the validator prints: corridors walked twice + each room crossed and left (2 x shorter axis + 3 m) at 400 cm/s + 12 s of looking per room, x 1.3 pacing -> ~10.8 min for this floor (the gate-0 floor scores 3.1). The earlier walking-only x 1.6 model gave ~4 min for the same floor and was replaced because it ignores stopping to read a room. The constants live in `Data/metrics.json` so Rob's real time (item 21) recalibrates them without touching the plan. | `BUILD.md` 3.30, `Docs/FLOORPLAN.md` section 3 |
| A6 | **Scene kinds.** Five kinds of staging slot - monster (red), ambush (orange), scene (purple), pickup (green), reveal (blue) - eleven placed so the critical path reads reveal -> pickup -> (tableau glimpse) -> fight -> collapse -> bait -> glow -> fight -> money shot, the rest behind optional doors; the validator wants at least eight. Markers only. | `BUILD.md` 3.29, `Docs/FLOORPLAN-SCHEMA.md` "Scene", `Docs/FLOORPLAN.md` section 6 |
| A7 | **The gym hall.** Walls and a 450 cm ceiling over the whole slab, no sun or sky; the number is the smallest 50 cm multiple that clears the tallest station (370) plus the 60 cm light drop with air to spare. | `BUILD.md` 3.27, `Data/metrics.json : feel_gym.hall_ceiling_cm` |
| A8 | **The critical path goes the long way round and is not enforced.** ~103 m through the west lobby (Demon #1) and the collapse; the bullpen chord (~63 m) and the east leg (78.6 m) reach reception without meeting Demon #1. Left open as player freedom in a maze, with `sc_junction_ambush` guarding both bypasses; forcing the west route is Rob's (B2). | `BUILD.md` 3.31 |
| A9 | **Review tooling** - the `?spawn=` option, the 31-viewpoint screenshot sweep and the contact sheet - ships in the build but is not a gameplay feature and does nothing unless invoked. | `BUILD.md` 3.32 |
| A10 | **Validator and manifest rules** (lobby classification, Demon #1 placement, scenes, exploration line, enclosure check) and the **placement fixes** from the floor-plan audit (figures out of opening mouths, scene rects and the trigger strip; `cp_ceo_entry` (3140, 4040) and Demon #2's trigger strip y 4100-4200 so a respawn does not refire the fight; 400 cm file stacks; `sc_break_trail` off the table). | `BUILD.md` 3.33-3.34, `Docs/FLOORPLAN.md` section 11 |

Carried over from gate-0 and still in force: reference figures have no collision (`BUILD.md` 3.22); duct mouths carry 6 cm lips (clear 100 x 83) while the gym tunnels have none (`Docs/METRICS.md` row 15); the crawl capsule is effectively a 72 cm sphere, logged as the build's one expected warning (row 5); even fill lighting and single-sided labels facing the approach (3.12); Space = jump, Left Ctrl = crouch, C = crawl (3.2).

### 5.2 Decisions Rob owns (agent defaults in force until he answers)

| | Decision | Agent default now in force | Where |
|---|---|---|---|
| **B0** | **APPROVED or a feedback list for Gate 1** (section 3). | The build is as described in section 1; every checklist item is unverified until Rob walks it. | This file |
| **B1** | **Footprint.** 55.2 x 48.2 m, 1772 m2 of interior - "not too big"? | Built as is. Every room can move one module (50 cm) either way without breaking the grid; the north row could drop to 630 deep and the spurs to 1180 for a tighter floor. | `Docs/FLOORPLAN.md` Q1 |
| **B2** | **The shortest-path question.** The declared critical path is not the shortest: the bullpen chord and the east corridor reach reception without meeting Demon #1. Accept as player freedom, or force the west route (a blocker on the bullpen's south opening; a collapse or locked fire door at the east corridor's south end)? | Bypasses open; `sc_junction_ambush` at the bullpen's south opening is the placeholder punishment. Item 19 in section 3 is the test. | `Docs/FLOORPLAN.md` Q2, `BUILD.md` 3.31 |
| **B3** | **The dividing wall vs the glass.** The wall (x 3300-3880 at y 4400) hides Demon #2 from every doorway ray with >= 132 cm to spare, and hides the east 30 % of the glass from the door centre (net view 71 % of the FOV, still over the 60 % gate). Keep, or shorten the wall to x 3400 (17 % hidden, 83 % visible; the spawn moves to x >= 3744)? x 3500 is impossible without moving the wall or giving up the pocket. | Built at x 3300. Item 14 in section 3 is the test: is the window wall in front of you without turning, and does the screened east third read as a hidden pocket or as a blocked view? | `Docs/FLOORPLAN.md` section 7 (the trade-off table) and Q6 |
| **B4** | **Partner 5's second window.** Rob's brief mentioned a second exterior view; it is a Gate 3 note in `partner_5`, not an opening. Author it as a `window` now (dark city, no fire) so the greybox shows it, or leave it out? | Note only; the floor has one window. | `Docs/FLOORPLAN.md` Q4 |
| **B5** | **The other floor questions**, none blocking: the two long straights (Q3: jog the south corridor or make the north join a door?), money-shot dominance 96 % vs a deeper office (Q5), lobby depth 580 vs 780 for the Demon #1 fight (Q7), the locked stairwell as dressing or a Gate 3 tease (Q8), Office #1 / #2 as associate or partner rooms (Q10), scene rhythm on the south corridor (Q11), Partner 4 reachable only through the boardroom (Q12), the reception desk on the axis (Q13). Q9 (checkpoint inside the trigger strip) was resolved lead-side. | As built. | `Docs/FLOORPLAN.md` section 11 |
| **A** | **Review machine spec** (spec "Gaps & Risks"; open since gate-0). | The audited laptop (Ryzen 7 7730U, Vega-class iGPU, 15.4 GB, 1920x1080@60) is assumed; hence no Lumen / Nanite / VSM and baked lighting from Gate 3. Frame rate at 1920x1080 is **unmeasured** - the law-firm floor has 59 movable point lights (shadows off) where gate-0 had 13, and the iGPU has not been asked about it. If the real review machine has a discrete RTX 2000+ / RX 6000+ GPU, say so before Gate 3. | `BUILD.md` section 2 |
| **B** | **Time expectation per gate** (open since gate-0). | Days, not weeks; the agent optimises for a fast revision loop on Rob's notes. | This file |
| **C** | **Crouch / crawl binds** (open since gate-0). | Space jump, Left Ctrl crouch, C crawl, Left Shift sprint, E interact, Esc pause, F1 gym. One-line JSON change (`Data/movement.json : binds`), editable next to the `.exe`. | `BUILD.md` 3.2 |
| | **LFS quota** (open since gate-0). | Free tier assumed; pushes so far 113 MB + the maps. | `BUILD.md` 3.16 |

---

## 6. Known gaps and `TODO(VERIFY 5.8)` markers

The gate-0 markers that a compile could settle are settled (`GATE-0-NOTES.md` section 6). The convention is unchanged: a `// TODO(VERIFY 5.8): ...` comment (or `# TODO(VERIFY 5.8)` in Python) at every symbol or behaviour that could not be confirmed. The list below is regenerated from this grep immediately before publication (run from the repository root in Git Bash; the PowerShell form in `GATE-0-NOTES.md` section 6 is equivalent):

```
grep -rn "TODO(VERIFY" Source Config Tools Data Docs Hellfall.uproject README.md BUILD.md LEVELS.md --exclude-dir=__pycache__ --exclude=BUILD-PLAN.md
```

**Snapshot 2026-09-07 01:46:03 UTC** (= 2026-09-06 19:46 Mountain; after the `BUILD.md` / `README.md` / `LEVELS.md` / `Docs/` edits for gate-1; output lines longer than 200 characters cut with `[...]`, `path:line` prefixes exact):

```
Source/Hellfall/HellfallCharacter.cpp:372:	// TODO(VERIFY 5.8): first run - push the mouse forward; the view must pitch UP. If it does not, the
Source/Hellfall/README-SOURCE.md:90:   `TODO(VERIFY 5.8)` marker left under `Source/` is the look sign (step 2); spots discussed in comments
Tools/README.md:147:the run result prints `materials_textured` / `materials_flat_fallback`. The whole path carries one `TODO(VERIFY 5.8)`: the first
Tools/README.md:239:  what remains carries `TODO(VERIFY 5.8)` (sky-light recapture, the fill-light property names `use_inverse_squared_falloff` /
Tools/ue/hf_common.py:15:editor carries a ``TODO(VERIFY 5.8)`` comment and uses the most conservative call.
Tools/ue/hf_common.py:410:            # TODO(VERIFY 5.8): first live run - set_material_function must return True and populate the pins.
Tools/ue/hf_common.py:528:                comp.set_editor_property("use_inverse_squared_falloff", True)   # TODO(VERIFY 5.8): property name
Tools/ue/hf_common.py:534:                # TODO(VERIFY 5.8): bUseInverseSquaredFalloff and LightFalloffExponent are UPROPERTYs of
Tools/ue/hf_common.py:560:            # TODO(VERIFY 5.8): recapture after mobility change may be needed: comp.recapture_sky()
Docs/ASSET-MANIFEST.md:17:5. **Audio:** WAV imports natively. MP3 import is expected to work in UE 5.8 but is not verified on this machine; if it fails the six MP3s are transcoded to WAV at Gate 3/6 a [...]
BUILD.md:22:**C++ state: compiled 2026-09-06** (`Tools/build_editor.ps1` = `Build.bat HellfallEditor Win64 Development`, MSVC 14.44 under UnrealBuildTool 5.8.2): `Result: Succeeded`, `Binaries\Win64\U [...]
BUILD.md:34:What this proves: the `unreal` API calls in `Tools/ue/hf_common.py` work on 5.8.2 as written (level create/save, `StaticMeshActor` with `/Engine/BasicShapes/Cube`, one Material per tint, ` [...]
BUILD.md:192:WAV imports natively. MP3 import in UE 5.8 is expected but unverified on this machine; fallback is a WAV transcode at Gate 3/6. `// TODO(VERIFY 5.8): MP3 import.`
BUILD.md:235:| 2026-09-06 | 0 | **UE 5.8.2 (CL 56702186) installed** via the Epic Games Launcher; exact version recorded in section 1 (registry key not yet written by the Launcher - default-folder / ` [...]
BUILD.md:236:| 2026-09-06 | 0 | **GitHub remote created and pushed** (https://github.com/RobleusCaesar/hellfall, public; `main` at `2c27652`; LFS 123 objects / 113 MB). **Pipeline proof** (1.2): UAT B [...]
BUILD.md:237:| 2026-09-06 | 0 | **Build Tools + .NET Framework SDK installed.** Rob ran the Visual Studio 2022 Build Tools installer (17.14.37614: `VCTools` workload, MSVC 14.44.35207, Windows SDK 10. [...]
```

**Count: 5 code markers** (`Source/Hellfall/HellfallCharacter.cpp:372`, `Tools/ue/hf_common.py:410`, `:528`, `:534`, `:560`) **and 2 documentation markers** (`Docs/ASSET-MANIFEST.md:17`, `BUILD.md:192`) - one code marker more than gate-0 (`hf_common.py:410`, the textured-material graph, added with the texture work) and otherwise the same set; `BUILD.md:174` moved to `:192` with the new decision rows. The other 9 matching lines (`Source/Hellfall/README-SOURCE.md:90`, `Tools/README.md:147`, `Tools/README.md:239`, `Tools/ue/hf_common.py:15`, `BUILD.md:22`, `:34`, `:235`, `:236`, `:237`) describe the convention or refer to this list and are not markers.

| Marker | What must be verified | State |
|---|---|---|
| `Source/Hellfall/HellfallCharacter.cpp:372` | Mouse pitch sign: pushing the mouse forward must pitch the view UP; if not, `invert_y` in `Data/movement.json` (data fix) or one sign in `Input_Look` (code fix). | **Open - Rob's first minute in the build** (unchanged since gate-0; no run has had mouse input). |
| `Tools/ue/hf_common.py:410` | `MaterialExpressionMaterialFunctionCall.set_material_function()` returns True and populates the pins for the engine `WorldAlignedTexture` function, and `connect_material_expressions` matches the pin names `TextureObject` / `TextureSize` / `XYZ Texture`. | **Exercised on 2026-09-06**: the editor run built all 11 architectural tints under `materials_textured`, none fell back to flat. Whether the grid reads at the chosen strengths is Rob's item 23. The marker is the tools owner's to retire. |
| `Tools/ue/hf_common.py:528` | `use_inverse_squared_falloff` as the reflected name on the legacy inverse-square path. | Open, dead path (no style entry asks for `inverse_squared`; a wrong name would raise `FAILED:`). |
| `Tools/ue/hf_common.py:534` | The even-fill light property names `use_inverse_squared_falloff`, `light_falloff_exponent`, `LightUnits.UNITLESS`. | Exercised without error by every 2026-09-06 regeneration (59 + 60 lights emitted; a wrong name would have raised). Tools owner's to retire. |
| `Tools/ue/hf_common.py:560` | Whether `SkyLightComponent.recapture_sky()` is needed after the mobility change. | Now a **dead path**: the enclosed gym has no sky light (the old `feel_gym.sun` / `sky_light` style keys are refused). Retire or keep as documentation. |
| `Docs/ASSET-MANIFEST.md:17`, `BUILD.md:192` | MP3 import through the 5.8 sound factory (fallback: WAV transcode of the six MP3s at Gate 3/6). | Open - no import before Gate 3. |

**Findings and fixes recorded at gate-1** (so they are not rediscovered):

- **Exposure was fixed, not adaptive (second finding).** The second sweep, with the light grid in place, was still white in every room lit by 2-3 overlapping grid lights while single-light rooms (closet, collapse) rendered fine: the packaged exposure was manual (`r.DefaultFeature.AutoExposure=False`), so brightness scaled with light overlap. The earlier belief that the packaged game adapted exposure was wrong (those test frames differed by camera direction, not exposure). Fix in this build: `Config/DefaultEngine.ini` sets `r.DefaultFeature.AutoExposure=True`, `r.DefaultFeature.AutoExposure.Method=0` (histogram) and `r.DefaultFeature.AutoExposure.Bias=0`, and `Data/greybox_style.json` lights were toned down (default `intensity_unitless` 4, role intensities x0.65, radius clamped to 500-800 cm = the 800 cm spacing). Not verified in play: auto exposure may visibly "breathe" when walking from a bright room into a dark one; say so if it bothers you.
- **Lights blown out (first finding).** The first gate-1 screenshot sweep of the law-firm floor was white: one even-fill light per room with radius 1.25 x the room diagonal gave the 44.8 m `corridor_south` a 56 m light (and the lobby, bullpen and library 15-20 m lights) that reached across half the floor. Fix: lights are a grid per room at most `light_spacing_cm` (800) apart with the radius clamped to `max_attenuation_radius_cm` (1000), all in `Data/greybox_style.json : lights` (`BUILD.md` 3.28); both maps regenerated. The gate-0 floor never showed it because its largest room was 19.8 m long.
- **Hand-written floor plans do not scale to 37 rooms.** Three designer agents failed to emit the plan (two hit the 64k-token single-response cap, then the account's usage limit). The floor is a generator script instead (`Docs/candidates/legal_lead.build.mjs`); edit the script, regenerate, never the JSON (`Docs/FLOORPLAN.md` section 12).
- **Placement audit.** The `Docs/FLOORPLAN.md` author's audit found six figure / marker / note nits the validator does not check (figures in opening mouths, in a scene rect and in Demon #2's trigger strip; a checkpoint inside that strip; 600 cm stacks in a 480 cm room; a scene rect on the table). All fixed in the build script and recorded in `BUILD.md` 3.34 and `Docs/FLOORPLAN.md` section 11.

**Not verified by the agent - Rob's tests (section 3) and the next revision.** All agent runs were scripted and input-free; none of the following has been observed and none is claimed as met:

- Walking, looking, jumping, crouching and crawling *feel* (REQ-G1-003 acceptance 1; checklist items 1-6, 10, 11); the mouse pitch sign.
- The duct crawl gate: standing and crouching blocked at the mouth, crawl passes, reversing mid-duct returns cleanly, stand input suppressed inside (REQ-G1-006; item 13).
- Collision integrity on the new floor: no escape from the playable volume, no catching on the 38 openings' jambs, headers and thresholds or on the 129 walls, no fall-through (REQ-G1-007; items 7, 8, 16, 25). The dry run proves box geometry (0 overlaps, holes exactly their requested size, enclosure 37/37), not the walk.
- Stand-blocked behaviour under low geometry with no camera clipping (REQ-G1-003 acceptance 2).
- Focus loss releasing the mouse and focus regain without a camera snap, including while paused.
- The F1 toggle and `Launch-FeelGym.cmd` (REQ-G1-004 acceptance 2) - present in the build and the mappings, not pressed.
- The data-only rebind / walk-speed proof (REQ-G1-003 acceptance 3).
- **Frame rate at 1920x1080 on the review machine (G-7: 60 fps floor) - unmeasured**, and now with 59 movable point lights on the floor and 60 in the gym (shadows off) on an iGPU. The sweep ran at 1920x1080 with a fixed benchmark timestep, which says nothing about fps. If it stutters, `light_spacing_cm` up and `max_attenuation_radius_cm` down are the first knobs.
- **The 10-minute estimate in practice** (item 21) - a model, not a measurement.
- **Whether the maze reads** (items 18-20, 22): loops, dead ends and the shortcut are geometry the validator can count, not legibility it can judge; and the declared critical path is not the shortest (B2).
- Whether the textures at strengths 0.14 / 0.10 / 0.06 help or distract in motion (item 23) - judged only on still frames so far.
- Whether the root `Hellfall.exe` bootstrapper passes the `?spawn=` command line through to the inner binary (section 4 step 4); the sweep uses the inner binary.
- Byte-level `.umap` determinism across regenerations (REQ-G1-005 acceptance 3) - the dry-run manifest is deterministic (identical SHA256 twice, `test_dry_run.ps1` step 1c); the engine output has not been hashed twice.
- The remaining Gate 1 acceptance criteria as a whole (REQ-G1-002 through G1-007); `Docs/METRICS.md` stays DRAFT until Rob has walked the gym.

Other known gaps (none blocks the review):

- `Config/DefaultGame.ini` `Description` and the HUD header still say "gate-0 pipeline build" / "greybox build"; cosmetic, fixed at the next revision.
- `Docs/METRICS.md` is DRAFT; the doorway-jump arithmetic (a 95 cm jump under a 220 header touches it), the 72 cm crawl sphere and the 83 cm clear duct mouth are flagged there.
- Decision A (review machine), the LFS quota plan and the gate-0 asset notes (14 audio files not 16; the duplicate `crimson_hellfiend_texture_0_1.png`; the two `.ogv` videos to re-encode at Gate 6; MP3 import) are unchanged from `GATE-0-NOTES.md` section 6.
- `Builds/` (gate-0, gate-1 and the test trees), `Saved/` (logs, manifests, `ReviewShots/`), `Binaries/`, `Intermediate/`, the generated solution files and `Tools/ue/__pycache__/` are git-ignored working files; the zip ships only on the Release.

---

## 7. What ran on 2026-09-06 (the gate-1 pipeline, end to end, on this machine)

In order, from the repository root, after the tools owner's commit `e92bea2` (surface texture, gym hall, scenes, note labels, validator estimate, enclosure check; `BUILD.md` change log):

```powershell
node Docs\candidates\legal_lead.build.mjs Data\floorplan.json           # the floor from the room table: self-checks pass, 37 rooms / 38 openings / 11 scenes written (also Data\candidates\legal_lead.json)
node Tools\validate_floorplan.mjs Data\floorplan.json                    # PASS: 2 INFO (lobbies), 1 WARN (Demon #2 line blocked by the divider = intended); exploration ~10.8 min, path ~103 m, 3 junctions
.\Tools\test_dry_run.ps1                                                 # all steps passed: determinism, check_manifest (590 actors, 316 boxes, 0 overlaps, enclosure 37/37, money shot 96 %), feel gym (222 actors, enclosure 1/1), scenes smoke
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py                # L_ExecutiveFloor regenerated on 5.8.2: 0 errors; 11 materials textured, 0 flat fallback
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py               # L_FeelGym regenerated: the enclosed hall, 0 errors
.\Tools\package.ps1 -Tag gate-1 ; .\Tools\screenshot_sweep.ps1 -Tag gate-1   # first two packaged sweeps of the new floor -> blown out to white (light radius; section 6) -> light grid in greybox_style.json -> both maps regenerated
.\Tools\package.ps1 -Tag gate-1                                          # BUILD SUCCESSFUL, 122 s: Builds\Hellfall-gate-1-Win64-Development.zip, 327.6 MB (343,510,411 bytes), SHA256 9B24B3B323B72F52C09C52A4C4C77A7AB608890E47F19F47744078A3D32D92B2
.\Tools\screenshot_sweep.ps1 -Tag gate-1 ; .\Tools\contact_sheet.ps1 -Tag gate-1   # 31 viewpoints -> Saved\ReviewShots\gate-1\*.png + sheet_L_ExecutiveFloor.jpg / sheet_L_FeelGym.jpg (lead's review material)
.\Tools\release.ps1 -Tag gate-1                                          # run by the lead right after this edit: gh release create gate-1 --notes-file GATE-1-NOTES.md <zip>
```

Sizes and hashes in this file, in  1.4 and its change log, and in  were filled in by the lead from the final package (327.6 MB = 343,510,411 bytes, SHA256 9B24B3B323B72F52C09C52A4C4C77A7AB608890E47F19F47744078A3D32D92B2,  wall time 122 s) before this release was published.

**For the lead when committing:** commit `Content/` (the two regenerated maps and the 29 `M_GB_*` materials) at the gate-1 tag only, as at gate-0 - every regenerated `.umap` is a new LFS object; `Data/floorplan.json` and `Data/candidates/legal_lead.json` must stay byte-identical (regenerate, do not hand-edit); `Builds/`, `Saved/ReviewShots/`, the twin project and the generated solution files stay git-ignored. `Docs/candidates/legal_lead.md` still quotes the pre-light-grid dry run (569 actors); the number is 590 since the fix.
