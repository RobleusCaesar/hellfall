# HELLFALL — Gated Build Plan & Technical Requirements

**Version:** 2.0 — 2026-09-05
**Engine:** Unreal Engine 5, latest stable release (see Ground Rules)
**Asset tools:** Blender (latest stable) for all 3D asset preparation; Meshy.ai for generation where needed
**Delivery:** Public GitHub repository; packaged Windows x64 build attached to a tagged Release at every gate
**Process:** Six approval gates. No gate begins until the previous gate is approved in writing.

> This file is the specification as supplied by Rob on 2026-09-05, stored verbatim so the agent and reviewers work from one text. The hand-drawn floor plan it references is `SourceAssets/reference/game_layout.jpg`.

---

## How This Document Works

The build is split into six gates. Each gate produces a **playable Windows build** that Rob installs, walks, and either approves or returns with feedback. The agent iterates until approval, then moves to the next gate. Scope approved at a gate is frozen; reopening it later requires Rob's sign-off.

| Gate | Focus | What Rob is evaluating |
|---|---|---|
| **1** | Greybox & Traversal | Does the space feel right to move through? |
| **2** | Blockout Props & Composition | Does every room read correctly with objects at final scale? |
| **3** | Materials & Lighting | Does it look like the "after" mood board? |
| **4** | Final 3D Assets | Do the real models sit correctly in the approved space? |
| **5** | Core Gameplay | Does the shotgun feel right? Are the demons threatening? |
| **6** | Shell, Systems & Ship | Menus, audio mixer, save/load, cutscenes, docs, final package |

The order is deliberate. Gates 1–2 lock spatial feel before any art investment. Gates 3–4 dress the approved space. Gate 5 adds combat into a space already validated for it. Gate 6 wraps it.

### Gate protocol

Every gate delivers the same package:

1. **A tagged GitHub Release** named `gate-N` (revisions: `gate-N.1`, `gate-N.2`, …) with a packaged Windows x64 build as a `.zip`.
2. **`GATE-N-NOTES.md`** in the repo root and pasted into the Release description: what's in the build, what to test, known gaps, decisions the agent made that this document left open.
3. **Optional:** a 60–120 second screen capture walking the critical path, for quick review without installing.

Rob responds with **APPROVED** or a feedback list. The agent applies feedback, re-issues a revision, and repeats. Preparatory work for the next gate that does not touch approved scope (e.g. auditing assets during Gate 1) is permitted; building the next gate is not.

**Change control:** after a gate is approved, its scope is frozen. If a later gate reveals a genuine need to change earlier scope (a couch doesn't fit, an encounter space is too tight), the agent stops, documents the conflict in `GATE-N-NOTES.md`, and waits for Rob's decision. The agent does not quietly reshape the greybox in Gate 4.

### If two agents are competing

Each agent runs the full gate sequence independently against its own repository. Rob reviews each gate build separately. The rubric at the end of this document is applied at Gate 6. Neither agent sees the other's work or feedback.

---

## Ground Rules

**G-1. Engine and tools.** Unreal Engine 5, latest stable release at project start, recorded in `BUILD.md` and never changed mid-project. Blender, latest stable, from blender.org. Meshy.ai for generation only — nothing from Meshy enters the engine without passing through Blender (see Gate 4).

**G-2. Units and scale.** 1 Unreal Unit = 1 cm. Every asset is imported at real-world scale. Every dimension in this document is in cm.

**G-3. Agent-authorable project.** This is the most important rule for an AI-built Unreal project. Unreal's native formats — `.umap`, `.uasset`, Blueprints — are binary. An agent cannot read, diff, or reliably author them as text. Therefore:

- Gameplay systems are written in **C++**.
- Level construction, asset import, and material assignment are driven by **Python editor scripts** committed under `/Tools/`. The greybox is regenerated from a script, so Rob's feedback becomes a code change, not an editor session.
- Tuning values live in **JSON or CSV under `/Data/`**, imported to Data Tables or Data Assets.
- **Blueprints are permitted only where the engine gives no text alternative** (Animation Blueprints, some UMG layouts). Every Blueprint is listed in `BUILD.md` with its purpose and a prose description of its logic.

**G-4. Free and open-source only.** Every third-party asset, plugin, texture, sound, or font is free for commercial use and logged in `BUILD.md` with source, version, and license. Safe CC0 texture sources: ambientCG, Poly Haven. Fab assets are acceptable only after checking the per-asset license.

**G-5. Repository.** Standard Unreal `.gitignore` (`Binaries/`, `Intermediate/`, `Saved/`, `DerivedDataCache/` excluded). `.uasset` and `.umap` tracked with Git LFS. Packaged builds go on Releases, never in the repo. Required root files: `README.md`, `BUILD.md` (decision log), `LEVELS.md` (see Gate 6), plus one `GATE-N-NOTES.md` per gate.

**G-6. Delivery is Windows only.** Unreal has no supported browser export. Packaged builds target Windows x64 via UAT `BuildCookRun`, Development configuration for gate builds, Shipping for the final. Rob's review machine spec is recorded in `BUILD.md` and all performance targets are measured against it.

**G-7. Performance floor.** 60 fps at 1920×1080 on Rob's review machine across the full critical path. Lumen is the default lighting path; if it misses the floor, the agent falls back to baked lighting and documents it.

**G-8. Placeholders are expected.** Cutscene footage, some textures, and the burning-city backdrop may be placeholder at their gate. The system, not the placeholder, is what is being approved.

---

## Metrics Standard

This table is authored by the agent in Gate 1 as `/Docs/METRICS.md`, validated by Rob in the feel gym, and then frozen. Every piece of architecture and every prop is built to it. Starting values below are game-standard for first-person interiors; they are deliberately larger than real-world dimensions because real dimensions feel cramped through a game camera.

| Metric | Starting value | Notes |
|---|---|---|
| Player collision height, standing | 180–190 | Capsule |
| Player collision radius | 34–42 | Narrower catches less on corners |
| Camera / eye height | 160–170 | |
| Crouch collision height | 110–120 | |
| Crawl collision height | 60–70 | Custom stance — Unreal has no native prone |
| Walk speed | 350–450 cm/s | Office pacing; UE default 600 is too fast for this |
| Sprint speed (if implemented) | 550–650 cm/s | |
| Jump height | 80–110 | |
| Max step height | 35–45 | |
| Horizontal FOV | 90 | Exposed as a setting |
| Door opening | 120 W × 220 H | Real doors are ~90×205; game doors are oversized so the capsule never catches |
| Corridor width | 250–320 | |
| Office ceiling height | 300–330 | |
| Minimum room footprint | 400 × 400 | |
| Air duct interior | 100 W × 95 H | Passable crawling only; blocked standing and crouching |
| Air duct length | 300–800 | |

**Rule:** door clear width ≥ capsule diameter + 40 cm. Corridor width ≥ 3× capsule diameter. If Rob picks a different capsule radius in the feel gym, the door and corridor minimums move with it.

---

## GATE 1 — Greybox & Traversal

**Purpose:** Lock the spatial feel of the entire level before anything else exists. This is where Rob's two previous attempts failed. Nothing in this gate is pretty; everything in this gate is walkable.

**What's in the build:** the full floor plan in grey primitives, a working first-person controller with move/look/jump/crouch/crawl, the air duct, collision on everything, a 180 cm reference figure in every room, and a separate **feel gym** level.

---

**REQ-G1-001: Project foundation and packaging pipeline**

**Description:** An empty project packages to a runnable Windows build before any level work begins.

**Behavior:** Engine installed, project created from the First Person template or from scratch (documented). C++ project, not Blueprint-only. Repo initialized per G-5. UAT packaging script committed under `/Tools/`. A `gate-0` Release with a packaged build containing only the template level proves the pipeline end to end.

**Assets needed:** None.

**Dependencies:** None.

**Acceptance criteria:**
1. `gate-0` Release exists and its `.zip` runs on Rob's machine to a playable first-person view.
2. `BUILD.md` records the exact engine version and Rob's review machine spec.
3. The packaging script in `/Tools/` produces the build with a single command.

---

**REQ-G1-002: Metrics standard document**

**Description:** The agent authors `/Docs/METRICS.md` with the values it is building to.

**Behavior:** Every row of the Metrics Standard table above, with the agent's chosen starting value and one line of rationale. Any deviation from the starting ranges is justified in writing. This document is updated after Rob's feel-gym feedback and then frozen at Gate 1 approval.

**Assets needed:** None.

**Dependencies:** None.

**Acceptance criteria:**
1. `/Docs/METRICS.md` exists with a value for every row.
2. Every greybox dimension in the level matches the document within 5%.
3. After Gate 1 approval, the document carries a `FROZEN` header with the approval date.

---

**REQ-G1-003: First-person traversal controller**

**Description:** The player can move, look, jump, crouch, and crawl with the feel parameters from the metrics standard.

**Behavior:** `W/A/S/D` move relative to camera yaw; mouse look with pitch clamped ±89°; `Space` jumps when grounded with ~0.1 s coyote time; `Ctrl` or `C` toggles crouch; `C` or a second bind toggles crawl (agent chooses binds, documents them, shows them on screen). Movement uses acceleration and deceleration ramps — the character has weight, not instant velocity. Capsule height and camera height interpolate over ~0.2 s between stances. Standing up under low geometry is blocked, not clipped. Jump is suppressed while crouched or crawling. Diagonal speed equals forward speed. Focus loss releases the mouse; regaining focus does not snap the camera.

All values from `/Docs/METRICS.md` are read from a data file under `/Data/`, not hard-coded, so feel-gym feedback is a value change.

**Assets needed:** None. The default engine mannequin arms or no arms — no weapon yet.

**Dependencies:** G1-002.

**Acceptance criteria:**
1. Every control listed above works and is displayed on screen.
2. Attempting to stand under a low ceiling leaves the player in the reduced stance with no camera clipping.
3. Changing walk speed in `/Data/` and rebuilding changes in-game speed with no code edit.

---

**REQ-G1-004: Feel gym**

**Description:** A separate calibration level where Rob walks size variants and picks by feel.

**Behavior:** A single flat level containing, side by side and labeled with floating text:
- Doorways at 90, 110, 120, 140 cm wide (all 220 tall)
- Corridors at 200, 260, 320 cm wide, each ~10 m long
- Three rooms at ceiling heights 270, 300, 350
- A jump staircase with ledges at 40, 60, 80, 100, 120 cm
- A step-height ramp from 20 to 60 cm
- Crawl tunnels at 90, 100, 110 cm interior height
- A 180 cm reference figure next to each element

Rob walks every element and reports which sizes feel right. The agent updates `/Docs/METRICS.md` and rebuilds the greybox to match.

**Assets needed:** Grey primitives, text labels.

**Dependencies:** G1-003.

**Acceptance criteria:**
1. Every element above exists and is labeled with its dimension.
2. The feel gym is reachable from the main level or a launch option without editing files.
3. The 180 cm reference figure is present beside every element.

---

**REQ-G1-005: Greybox floor plan**

**Description:** The full level is built in grey primitives to the metrics standard and the required adjacency.

**Behavior:** Dimensions are the agent's within the metrics standard; **adjacency is fixed:**

- **Supply Closet** — player start. Sole exit is a floor-level air duct.
- **Air duct** → **Break Room / Kitchenette.**
- **Break Room** → **Main corridor**, the spine.
- **Main corridor** connects: Men's Restroom (enterable), Women's Restroom (locked door, non-enterable), Office #1 and Office #2 (enterable, optional), a **blocked corridor** (impassable, reads as collapse), the **elevator** (shut, non-functional), and the **Reception area.**
- **Reception** → **CEO Office**, with a dividing wall inside and a full-width window wall opposite the entrance.

Every room contains a 180 cm reference figure. Rooms are labeled with floating text. The greybox is generated by a Python script under `/Tools/` so that feedback is applied as a script change and the level is rebuilt, not hand-edited. Blocked corridor and elevator are impassable by every means including jump and crawl.

**Assets needed:** Grey primitives.

**Dependencies:** G1-002, G1-003.

**Acceptance criteria:**
1. Every room is present, reachable, and labeled; the critical path runs Supply Closet → duct → Break Room → corridor → Reception → CEO Office.
2. Blocked corridor and elevator cannot be passed by walking, jumping, crouching, or crawling.
3. Regenerating the level from the script reproduces it identically.

---

**REQ-G1-006: Air duct crawl gate**

**Description:** The Supply Closet exits only through a duct passable while crawling.

**Behavior:** Duct interior per the metrics standard. Standing and crouching players are physically blocked at the entrance; crawling passes. Interior lit enough to see the far opening. Reversing mid-duct returns the player cleanly. Stand input inside the duct is suppressed.

**Assets needed:** Grey primitives.

**Dependencies:** G1-003, G1-005.

**Acceptance criteria:**
1. Standing and crouching players collide with the entrance and cannot enter.
2. Crawling player traverses to the Break Room without becoming stuck.
3. Reversing direction mid-duct returns to the Supply Closet without becoming stuck.

---

**REQ-G1-007: Collision integrity**

**Description:** The player cannot leave the playable volume or catch on geometry.

**Behavior:** Simple box collision on all architecture — no complex or per-triangle collision on walls and floors, which is a primary source of "catching." Doorframe collision is flush with the opening. Invisible boundary volumes at the level perimeter. The money-shot window is not passable.

**Assets needed:** None.

**Dependencies:** G1-005.

**Acceptance criteria:**
1. Five minutes of deliberate attempts to escape the level using every movement option fails.
2. Walking the critical path while sliding along every wall and doorframe produces no catch, stutter, or push.
3. The player never falls through the floor.

---

### Gate 1 — Rob's Review Checklist

Install the build. Play the feel gym first, then the main level. Take notes on anything that feels off, even if you can't say why — "this hallway feels wrong" is useful feedback; the agent's job is to diagnose it.

**Feel gym**
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

---

## GATE 2 — Blockout Props & Composition

**Purpose:** Place every object in the level as a correctly-sized grey primitive so room composition, sightlines, encounter spaces, and the money-shot framing can be evaluated before any art. This gate also catches asset problems early, because you cannot block out an object without knowing its real dimensions.

**What's in the build:** the approved greybox with every prop, corpse, survivor, weapon pickup, and demon represented by a labeled grey box or capsule at final dimensions.

---

**REQ-G2-001: Asset manifest and dimension audit**

**Description:** Every supplied asset is inspected, de-duplicated, renamed, and measured.

**Behavior:** The bundle contains ` - Copy` duplicates, the misspelling `deamon`, mixed naming (`Meshy_AI_*`), and multiple candidates per slot (`shotgun` vs `shotgun2`, `ceo_dead` vs `ceo_dead2`, three demon models). The agent opens each in Blender, selects one per slot, renames to Unreal convention (`SM_`, `SK_`, `T_`, `M_`), records real-world dimensions in cm, and records the choice and reason in `BUILD.md`. Rejected files are removed from the working set. Triangle counts are recorded — expect them to be 20–45× any requested budget.

**Assets needed:** Full supplied bundle.

**Dependencies:** Gate 1 approval.

**Acceptance criteria:**
1. `BUILD.md` contains a table: original filename → final name or "rejected — reason", with dimensions and triangle count for every kept asset.
2. No file in the working set contains ` - Copy`, `Meshy_AI_`, or `deamon`.
3. One asset is selected for every slot that had multiple candidates.

---

**REQ-G2-002: Prop blockout**

**Description:** Every prop is placed as a grey primitive at its measured dimensions.

**Behavior:** Reception desk, kitchen table and chairs, fridge, vanity, toilets, mop and bucket, couch and coffee table set, CEO's desk (reception desk reused), doors, elevator, supply racks. Each is a labeled box at the dimensions from G2-001, placed per narrative intent: reception desk abandoned mid-task with a clear chair-side; one break-room chair pushed out; fridge in the kitchenette run; couch set in the CEO office at perpendicular angles with the table between. Wall-mounted items sit flush to walls. Nothing floats, nothing intersects.

**Assets needed:** Grey primitives with text labels.

**Dependencies:** G2-001.

**Acceptance criteria:**
1. Every asset in the working set has a labeled blockout at its measured dimensions.
2. No blockout floats above or intersects the floor, a wall, or another blockout.
3. The player can walk every intended route around the blockouts without catching.

---

**REQ-G2-003: Character and pickup blockout**

**Description:** Corpses, survivors, the shotgun pickup, and both demons are represented at final scale.

**Behavior:** Seated man and seated intern in the Supply Closet — the man's blockout leans against the supply racks, the intern's against a wall, because those poses were authored for those surfaces. Dead security guard in the corridor between Break Room and restrooms, with a shotgun-sized box beside him. Dead CEO in the CEO office. Demon #1 as a capsule at the corridor near Office #2; Demon #2 as a visibly larger capsule in the CEO office. Trigger volumes for both encounters drawn as translucent boxes.

**Assets needed:** Grey primitives.

**Dependencies:** G2-001, G2-002.

**Acceptance criteria:**
1. Every human figure and demon has a blockout at the dimensions recorded in G2-001.
2. The seated survivors' blockouts contact their support surfaces with no gap.
3. Both encounter trigger volumes are visible in the build.

---

**REQ-G2-004: Encounter space validation**

**Description:** Each demon encounter has room to be fought.

**Behavior:** At each encounter location the player must have a clear retreat path of at least 6 m, room to strafe at least 2 m in either direction, and no chokepoint narrower than the corridor minimum between the player's approach and the demon's spawn. The agent draws these lanes as translucent floor markers in the blockout build. This is the mitigation for building art before gameplay: the fight space is approved now so it does not have to be reopened at Gate 5.

**Assets needed:** Translucent floor markers.

**Dependencies:** G2-003.

**Acceptance criteria:**
1. Retreat and strafe lanes are visible at both encounters and meet the minimums.
2. A demon-sized capsule can path from its spawn to the player's approach position without passing through a gap narrower than the corridor minimum.
3. The CEO office encounter does not block the player's view of the window wall.

---

**REQ-G2-005: Money-shot framing**

**Description:** The window wall composition is locked.

**Behavior:** A placeholder backdrop (a flat orange-lit plane or a simple skybox) sits beyond the window wall. Entering the CEO office through the intended door places the window in the player's forward view. The dividing wall, CEO desk, and couch set do not obstruct the view from the doorway. A translucent trigger volume marks the 5-second dwell zone.

**Assets needed:** Placeholder backdrop.

**Dependencies:** G2-002, G2-003.

**Acceptance criteria:**
1. From the CEO office doorway, the window wall fills the majority of the forward view without turning.
2. No blockout obstructs the doorway-to-window sightline.
3. The dwell trigger volume is visible and positioned at the window.

---

### Gate 2 — Rob's Review Checklist

1. Walk every room. Does the furniture make the room feel occupied, or crowded, or empty?
2. Stand at the reception desk. Is there room behind it for a chair? Can you walk around it?
3. In the Break Room, does the pushed-out chair read as "someone left in a hurry"?
4. In the corridor, is the security guard and shotgun where you'd naturally look?
5. At Demon #1's position, back away from it. Do you have room? Do you feel trapped?
6. Walk into the CEO office. Is the money shot framed? Does anything block it?
7. At Demon #2's position, can you fight it and still see the window?
8. Look at the two survivors in the closet. Are they where you imagined?

**Approve when:** every room reads at a glance and both fight spaces feel fair.

---

## GATE 3 — Materials & Lighting

**Purpose:** Turn the approved grey space into the "after" mood board. Textures are applied to architecture; lighting is authored; the atmosphere is established. Props remain blockouts (grey), so the review is about walls, floors, ceilings, and light.

**What's in the build:** the approved greybox and blockouts, with architectural surfaces textured, the full lighting pass, atmospherics, and optionally the ambient audio bed.

---

**REQ-G3-001: Architectural materials**

**Description:** Every architectural surface has a final-quality material at a consistent texel density.

**Behavior:** Materials sourced per G-4 or authored. Fit-out per `Before_4.png`: dark walnut trim and doors, warm neutral drywall, carpet in corridors and offices, tile in the kitchenette and restrooms, drop-ceiling tiles. Target texel density 512 px/m on all architecture, so real props arriving in Gate 4 do not look sharper or blurrier than their surroundings. No source texture above 2048×2048. Materials are assigned by Python script where possible so the assignment is reproducible.

**Assets needed:** Textures — agent-sourced, CC0 or license-checked.

**Dependencies:** Gate 2 approval.

**Acceptance criteria:**
1. No architectural surface remains untextured or default-grey.
2. Texel density is within ±25% of 512 px/m on every architectural surface.
3. Every texture source is logged in `BUILD.md` with license.

---

**REQ-G3-002: Lighting pass**

**Description:** The level is lit to the "after" mood board and remains navigable.

**Behavior:** Near-total darkness with isolated failing practicals. Ceiling panels dark; at least one flickers on a non-uniform cycle. Under-cabinet strip in the kitchenette survives. Cold blue-grey fill from windows against warm dying interior light. Orange firelight from the CEO office window wall visibly influences the interior. Every practical light has a visible fixture justifying it. Lumen by default per G-7; fallback documented if needed.

**Navigability rule:** from any point on the critical path, the next doorway is discernible without a flashlight. Atmosphere that leaves the player lost is a failure.

**Assets needed:** None new.

**Dependencies:** G3-001.

**Acceptance criteria:**
1. A screenshot of the Break Room from the doorway matches `After_4.png` in lighting key and palette.
2. At least one light visibly flickers on a non-uniform cycle.
3. A first-time player traverses the critical path without losing sight of the next doorway.

---

**REQ-G3-003: Surface damage and atmospherics**

**Description:** The destruction layer is applied to surfaces.

**Behavior:** Claw gouges in drywall, blood spatter and drip runs on walls at and above human height, drag trails on floors, wet floor patches with raised specular. Blood is implemented as **Decal Actors**, never geometry. Placement follows narrative: pooling where corpses will sit, trails in the corridor. Missing ceiling tiles with exposed cavity. Light volumetric fog or dust for depth. Blood is the only saturated red in the level.

**Assets needed:** Blood decal textures extracted from the supplied `blood_decal_*` and `blood_pool` meshes; gouge and grime decals agent-sourced.

**Dependencies:** G3-002.

**Acceptance criteria:**
1. No blood asset exists in the level as a static mesh.
2. No z-fighting or flicker on any decal when strafing past it.
3. At least three blood placements exist with visibly different rotation and scale.

---

**REQ-G3-004: Ambient audio bed (optional at this gate, required by Gate 6)**

**Description:** The backing track and distant demon vocalizations play during traversal.

**Behavior:** Supplied music track loops seamlessly at a low level. `monster_screech_distant` and `demon_growl_distant` play at randomized 20–60 s intervals from 3D positions away from the player, never overlapping. Including this at Gate 3 lets Rob evaluate atmosphere as a whole; it may be deferred to Gate 6 if the agent prefers.

**Assets needed:** Supplied music and ambient audio files.

**Dependencies:** G3-002.

**Acceptance criteria:**
1. The track loops without an audible gap.
2. At least two distant vocalizations play in five minutes and are audibly positioned.
3. No two vocalizations overlap.

---

### Gate 3 — Rob's Review Checklist

1. Stand in the Break Room doorway. Hold the "after" image next to your screen. Same room?
2. Walk the critical path. Were you ever unable to see where to go?
3. Find the flickering light. Does it flicker like a dying fixture or like a strobe?
4. In the CEO office, is there orange light on the walls and floor from the window?
5. Look at the blood on the walls. Does it shimmer or flicker as you move? (It shouldn't.)
6. Is anything red that isn't blood?
7. Does the carpet feel like carpet and the tile like tile at walking speed?
8. If audio is in: is the music quiet enough that you forget it's there? Did a distant screech make you turn your head?

**Approve when:** it looks like the after photo and you can always find the door.

---

## GATE 4 — Final 3D Assets

**Purpose:** Replace every blockout with its real model, prepared through Blender. Props, corpses, survivors, the shotgun world model, both demons as placed idle models, and the burning-city backdrop.

**What's in the build:** the approved lit level with every blockout swapped for its final asset. No weapon functionality, no AI — demons are placed models playing an idle animation if available.

---

**REQ-G4-001: Blender preparation pipeline**

**Description:** Every asset passes through a scripted Blender pipeline before import.

**Behavior:** A `bpy` script per asset class under `/Tools/blender/` performs: import GLB → set real-world scale in cm → decimate to class budget with silhouette preserved → set pivot (floor contact for floor props, wall contact for wall-mounted, muzzle-back-along-barrel for the weapon) → apply transforms → generate simple collision (`UCX_` prefixed convex hulls for static props) → export FBX. Unreal import via Interchange or FBX importer, also scripted. Scripts are committed so any asset can be re-run.

| Asset class | Triangle budget |
|---|---|
| Hero weapon viewmodel | ≤ 25,000 |
| Enemy character | ≤ 15,000 |
| Human prop | ≤ 10,000 |
| Large furniture | ≤ 8,000 |
| Small prop / door / fixture | ≤ 4,000 |

**Assets needed:** All `.glb` files from the working set.

**Dependencies:** Gate 3 approval, G2-001.

**Acceptance criteria:**
1. `/Tools/blender/` contains scripts that process every kept asset, and `BUILD.md` records before/after triangle counts for all of them.
2. No imported mesh exceeds its class budget by more than 20%.
3. Every static prop has simple collision; none uses per-triangle collision.

---

**REQ-G4-002: Prop replacement**

**Description:** Every prop blockout is replaced by its final asset at the approved position and scale.

**Behavior:** One-for-one swap. Final asset footprint must match the approved blockout within 10%; if it does not, the asset is corrected in Blender, not the level. Wall-mounted assets sit flush. Nothing floats, nothing intersects. Emissive materials on anything the fiction says still has power (fridge interior, reception monitor).

**Assets needed:** Processed props.

**Dependencies:** G4-001.

**Acceptance criteria:**
1. No blockout primitives remain in the level.
2. Every prop is within 10% of its approved blockout footprint.
3. No prop floats, intersects the floor, or intersects another prop.

---

**REQ-G4-003: Character placement**

**Description:** Corpses and survivors are placed as final models.

**Behavior:** Static posed props, non-hostile, non-damageable. Corpses flush with the floor. The seated man's back contacts the supply racks; the intern is scrunched against a wall. Both were authored for those surfaces and will read as broken in open space. If a model carries an idle or talking animation, it loops; if not, static is acceptable. Blood decals from Gate 3 are re-checked against final corpse positions.

**Assets needed:** `SM_ManSitting`, `SM_InternSitting`, `SM_FallenSecurityGuard`, `SM_CEODead` (or skeletal variants).

**Dependencies:** G4-001.

**Acceptance criteria:**
1. No human figure floats or intersects the floor.
2. Seated survivors contact their support surfaces with no visible gap or penetration.
3. Blood pooling aligns with final corpse positions.

---

**REQ-G4-004: Demons as placed models**

**Description:** Both demons are imported with rigs and placed at their encounter positions, idle.

**Behavior:** Selected demon model imported as a skeletal mesh. Rig integrity verified — if animations survived generation, an idle loops; if the rig is broken, the agent documents it and either repairs in Blender or sources a free rigged replacement, because Gate 5 cannot proceed on a broken rig. Demon #2 scaled visibly larger. No AI, no damage.

**Assets needed:** Selected demon skeletal mesh and animations.

**Dependencies:** G4-001.

**Acceptance criteria:**
1. Both demons are present at their approved positions with Demon #2 visibly larger.
2. `BUILD.md` states whether the rig and animations imported intact, and if not, what was done.
3. Idle animation loops without a visible pop, or static placement is documented as intentional.

---

**REQ-G4-005: Shotgun world model and burning-city backdrop**

**Description:** The pickup model and the money-shot exterior are in place.

**Behavior:** Shotgun world model on the floor beside the security guard with a **green halo** — emissive, point light, outline, or particle, agent's choice — visible from 8 m in the corridor's lighting. No pickup functionality yet. Beyond the CEO window: a city at night, extensively burning, orange firelight from below against smoke — skybox, backdrop planes, parallax cards, or video, agent's choice. The exterior's light influence on the interior from Gate 3 is preserved.

**Assets needed:** `SM_Shotgun`, backdrop textures or video (placeholder acceptable).

**Dependencies:** G4-002.

**Acceptance criteria:**
1. The green halo is visible from 8 m and is the only green light in the level.
2. The burning city is visible from the CEO office doorway without turning.
3. The window is not passable.

---

### Gate 4 — Rob's Review Checklist

1. Walk every room. Does any object look too big, too small, or floating?
2. Look closely at the seated man and the intern. Are they resting on something or hovering?
3. Look at the corpses. Do they lie on the floor or in it?
4. Look at the shotgun from the far end of the corridor. Can you see the halo?
5. Look at both demons. Do they look like they belong at this scale? Is #2 obviously bigger?
6. Walk into the CEO office. Is the city on fire?
7. Does anything look noticeably sharper or blurrier than the walls around it?
8. Frame rate: does anything stutter?

**Approve when:** nothing looks out of place and nothing looks placed.

---

## GATE 5 — Core Gameplay

**Purpose:** Add the weapon and the enemies into the approved, dressed space. Recommended as two review builds: **5A** weapon, **5B** demons and damage.

**What's in the build:** interaction system, shotgun pickup/fire/pump/reload/hit, weapon viewmodel with hands, weapon audio, HUD, demon AI, damage in both directions, player health, death, checkpoints.

---

**REQ-G5-001: Interaction system and shotgun pickup**

**Description:** The player picks up the shotgun through a proximity prompt.

**Behavior:** Camera-center raycast, 2.5 m, against an interactable channel. Valid target shows a prompt naming the action and key ("Press E to pick up shotgun"). `E` executes. On pickup: world model and halo despawn, viewmodel arms appear, HUD ammo appears, pickup audio plays. Before pickup, fire input does nothing. Pickup is idempotent. The locked women's restroom door is also interactable and returns a refusal message. Prompts are suppressed during cutscenes and pause.

**Assets needed:** Font. Optional pickup audio.

**Dependencies:** Gate 4 approval, G4-005.

**Acceptance criteria:**
1. The prompt appears only when the target is within range and centered, and clears within one frame of looking away.
2. Fire input before pickup produces no sound, animation, or ammo change.
3. The shotgun cannot be picked up twice.

---

**REQ-G5-002: Fire, pump cycle, and reload**

**Description:** The shotgun fires, requires a pump between shots, holds 8 shells, and reloads.

**Behavior:** `LMB` fires if chambered: `shotgun_blast` plays, muzzle flash spawns, camera recoils, ammo decrements, the weapon is uncocked. No further fire until the pump completes: `shotgun_cocking` plays with a viewmodel animation and a shell ejects. Agent chooses auto-pump-after-delay or a manual pump input — documented. Cycle time 0.6–1.0 s. Fire input during the cycle is discarded, not queued. Empty magazine: dry-fire click, no animation. `R` reloads: `shotgun_reloading` plays with animation, duration matches the audio, fire disabled during. Reload at 8/8 is rejected. Reserve ammo: agent chooses infinite or finite — documented; if finite, at least two pickups on the critical path. All values from `/Data/`.

**Assets needed:** `shotgun_blast`, `shotgun_cocking`, `shotgun_reloading`, muzzle flash, shell effect.

**Dependencies:** G5-001.

**Acceptance criteria:**
1. Two shots cannot be fired within the cycle time; `shotgun_cocking` plays exactly once per shot.
2. Ammo reaches 0 after exactly 8 shots from full; reload restores 8 and takes at least as long as the audio.
3. Changing magazine capacity in `/Data/` and rebuilding changes in-game capacity with no code edit.

---

**REQ-G5-003: Hit detection and viewmodel**

**Description:** Firing resolves a pellet spread; the viewmodel renders without clipping.

**Behavior:** 8–12 raycast pellets in a cone from camera center. Pellets hitting a demon apply damage with distance falloff; pellets hitting geometry spawn an impact effect; pellets do not pass through walls. Non-combatants take no damage. Viewmodel on its own FOV (55–65°) with its own near clip so the barrel never enters walls; idle sway and walk bob, subtle, off when stationary. Hands per the supplied hands reference, cut cleanly at mid-forearm.

**Assets needed:** `SM_Shotgun` viewmodel, hands mesh, impact effect.

**Dependencies:** G5-002.

**Acceptance criteria:**
1. A demon at 2 m dies in 3 or fewer shots; pellets do not register through solid geometry.
2. Standing flush against any wall, no part of the weapon or hands renders outside the wall surface.
3. Shooting a non-combatant produces impact effects and no state change.

---

**REQ-G5-004: Demon AI**

**Description:** Demons detect, chase, and attack.

**Behavior:** C++ state machine — Idle, Alert, Chase, Attack, Death — with NavMesh pathing. Detection on line of sight within a stated range and cone, or on gunshot within a larger radius. On detection: `demon_growl`, then Chase. Within melee range: Attack, with `demon_attack` / `demon_attack2`. Losing sight triggers a search timeout of several seconds, not instant de-aggro. Demons do not path through walls, do not jitter against geometry when blocked. Demons are dormant until their trigger volume from Gate 2 is entered; Demon #2 activates only once the player is fully inside the CEO office. Killed demons do not respawn on re-entering a trigger. Demon #2 has higher health and is larger. Values from `/Data/`.

**Assets needed:** Demon skeletal meshes and animations, `demon_growl`, `demon_attack`, `demon_attack2`, optional voice lines used at most once each.

**Dependencies:** G4-004, G2-004.

**Acceptance criteria:**
1. A demon transitions to Chase within 1 s of the player entering its line of sight at 10 m, and pursues around a corner without passing through a wall.
2. No demon is active before its trigger is entered; a killed demon does not respawn.
3. Demon #2 requires strictly more shots to kill than Demon #1.

---

**REQ-G5-005: Damage, death, and checkpoints**

**Description:** Demons take damage and die; the player takes damage, dies, and respawns.

**Behavior:** Demon hits show a reaction (flinch, flash, or particle). At zero health: death animation or ragdoll, damage stops, collision against the player disabled, corpse persists or despawns after a delay without blocking the critical path. A demon killed mid-attack deals no pending damage. Demon melee applies damage on an animation event or on contact with a cooldown — never an instant drain. Player starts at 100 HP; damage shows a screen-edge effect and HUD update. At 0 HP: input locks, death state shown, respawn at the last checkpoint with health restored and weapon retained. Checkpoints: level start, Break Room entry, corridor after pickup, CEO office entry. Damage suppressed during cutscenes.

**Assets needed:** Demon death and attack animations. Optional damage and death audio.

**Dependencies:** G5-003, G5-004.

**Acceptance criteria:**
1. A demon killed during its attack animation deals no damage; a dead demon cannot damage the player or block the critical path.
2. Player health decreases at a bounded rate during sustained contact and never drops to zero in a single instant.
3. Respawn restores a playable state with health full and weapon retained at the correct checkpoint.

---

**REQ-G5-006: Gameplay HUD**

**Description:** Health, ammo, and crosshair are displayed.

**Behavior:** Health value or bar; ammo as `current / capacity`; reserve if finite; crosshair centered. Ammo appears only after pickup. HUD hidden during cutscenes. Elements stay on screen at 16:9 and 21:9. Values never desync from internal state.

**Assets needed:** Crosshair, font.

**Dependencies:** G5-002, G5-005.

**Acceptance criteria:**
1. Ammo display matches internal count at every point during fire and reload.
2. No ammo counter is shown before pickup.
3. HUD elements remain fully on screen at 21:9.

---

### Gate 5 — Rob's Review Checklist

**5A — Weapon**
1. Walk up to the shotgun. Does the prompt appear when you'd expect? Does it vanish when you look away?
2. Fire once. Did it kick? Was it loud? Did the pump happen?
3. Fire as fast as you can. Does it refuse to fire until the pump finishes?
4. Empty it. Count — was it 8? Reload. Did the animation match the sound?
5. Stand nose-to-wall. Is the barrel poking through?
6. Walk, then stop. Does the gun sway settle?

**5B — Demons**
7. Approach Demon #1. Did it notice you when it should have? Did it growl?
8. Run from it around a corner. Does it follow the corridor or cut through the wall?
9. Let it hit you. Does health drop in steps or in a rush?
10. Die. Where did you respawn? Do you still have the gun?
11. Kill it. Does the corpse block the hallway?
12. Enter the CEO office. Does Demon #2 wait until you're inside? Is the fight fair with the window in view?
13. Shoot a survivor. Anything happen? (It shouldn't.)

**Approve when:** the shotgun feels like a shotgun and the demons feel dangerous but beatable.

---

## GATE 6 — Shell, Systems & Ship

**Purpose:** Wrap the approved game in menus, settings, save/load, cutscene plumbing, the demo-complete flow, the level-authoring foundation, and documentation. Final packaged build in Shipping configuration.

---

**REQ-G6-001: Main menu, pause menu, and options**

**Description:** The application launches to a menu; gameplay can be paused; audio is adjustable.

**Behavior:** Main menu over the supplied background image: **Start**, **Load**, **Options**, **Quit**. Load is disabled with a message if no save exists. `Esc` in gameplay pauses the world (AI, timers, 3D audio suspended), releases the mouse, shows **Resume / Options / Return to Main Menu**. Resume recaptures without a camera snap. Options: sliders for **Master / Music / SFX / Ambient**, each mapped to a Sound Class, applied immediately and audibly, persisted to disk, reloaded on launch, defaults restored cleanly if the settings file is missing or corrupt. Optional: mouse sensitivity, invert-Y, FOV, fullscreen.

**Assets needed:** `Main Menu Background` image, font.

**Dependencies:** Gate 5 approval.

**Acceptance criteria:**
1. The application launches to the main menu; every visible button works or is visibly disabled.
2. Demons do not move and timers do not advance while paused; resume produces no camera snap.
3. Each slider changes exactly its own Sound Class, and values persist across relaunch.

---

**REQ-G6-002: Audio architecture**

**Description:** All audio routes through named Sound Classes with 3D spatialization where diegetic.

**Behavior:** Sound Classes: Master → Music, SFX, Ambient. Nothing plays directly on Master. Weapon audio, demon vocalizations, impacts, and environmental sources are 3D with attenuation tuned so an adjacent-room growl is audible but distant. Music and UI are 2D. Music level does not change with player position. Rapid firing does not clip. The ambient bed from G3-004 is required here if it was deferred.

**Assets needed:** All supplied audio.

**Dependencies:** G6-001.

**Acceptance criteria:**
1. Every audio source is assigned to a child Sound Class; setting any class to zero silences exactly its sounds.
2. A demon approaching from the left is audibly on the left; turning 180° reverses it.
3. Firing at the maximum permitted rate produces no clipping.

---

**REQ-G6-003: Cutscene system with placeholders**

**Description:** Full-screen video plays at the start and end of the demo and can be skipped.

**Behavior:** A reusable cutscene actor using the Media Framework (`MediaPlayer` + `FileMediaSource`, MP4/H.264) that plays a video full-screen with audio, shows a skip prompt, and emits a completion event. **Start** plays the intro, then loads the level; **Load** bypasses the intro. Completing the money-shot dwell plays the outro, then the Demo Complete modal. A missing or unplayable file skips cleanly instead of crashing. Skip produces the same next state as completion; rapid skip does not advance two states. **Placeholder clips are expected** — a title card or a few seconds of anything.

**Assets needed:** Two placeholder MP4 files, agent-generated.

**Dependencies:** G6-001.

**Acceptance criteria:**
1. Intro plays on Start and not on Load; outro plays once, between dwell completion and the modal.
2. Deleting a video file produces a skipped cutscene, not a crash.
3. The skip prompt is visible during every cutscene and skipping yields the same next state as completion.

---

**REQ-G6-004: Money-shot dwell and Demo Complete modal**

**Description:** Five seconds at the window ends the demo with a choice.

**Behavior:** The dwell trigger from Gate 2 starts a 5 s timer while the player looks at the window; leaving or looking away pauses or resets it (documented). On completion: outro cutscene, then input locks and a modal reads **"Demo Complete"** with **Keep Playing** (dismisses, restores full control in the same level state) and **Return to Main Menu**. Fires once per playthrough; dying during the timer cancels it; re-entering after dismissal does not re-trigger.

**Assets needed:** Font, modal styling.

**Dependencies:** G6-003, G5-005.

**Acceptance criteria:**
1. The modal appears after 5 s of sustained observation and not before.
2. Keep Playing returns full movement and weapon control.
3. Re-entering the trigger after dismissal shows neither the outro nor the modal.

---

**REQ-G6-005: Save and load**

**Description:** State persists to disk and backs the Load button.

**Behavior:** `USaveGame` subclass storing: level ID, player transform, health, weapon acquired flag, current and reserve ammo, fired trigger flags, killed demon flags. Checkpoint autosave recommended over manual save, documented. Load restores state and placement. Missing file disables the button; corrupt file is rejected with a message.

**Assets needed:** None.

**Dependencies:** G6-001, G5-005.

**Acceptance criteria:**
1. Saving mid-level, quitting to menu, and loading restores position, health, and ammo.
2. A killed demon does not reappear after load.
3. Deleting the save and pressing Load yields a disabled button or a clean message, not a crash.

---

**REQ-G6-006: Level template, registry, and authoring docs**

**Description:** A second level can be added without touching existing code.

**Behavior:** A base level structure — spawn point, NavMesh bounds, lighting root, trigger root, level-complete event — captured as a template level or a Python generator script. A registry under `/Data/` lists level ID, display name, map path, and order; a level manager loads by ID. All tuning values (speeds, heights, damage, health, ranges, capacity) live under `/Data/` and no magic numbers remain in scripts. `LEVELS.md` walks a new developer from empty map to registered, playable level with real file paths and one worked example.

**Assets needed:** None.

**Dependencies:** G6-005.

**Acceptance criteria:**
1. A second level can be added by instantiating the template and adding one registry entry with no edits to existing scripts.
2. Changing demon health in `/Data/` and rebuilding changes shots-to-kill with no code edit.
3. Every file path in `LEVELS.md` exists in the repository.

---

**REQ-G6-007: Final package and documentation**

**Description:** The final build ships in Shipping configuration with complete docs.

**Behavior:** `final` Release with a Shipping-configuration Windows x64 `.zip`. `README.md` (what, how to run, controls), `BUILD.md` (engine version, machine spec, every open decision made, every Blueprint and why, asset manifest, third-party license table, before/after triangle counts, anything cut and why), `LEVELS.md`, and all six `GATE-N-NOTES.md`. No console errors during a full playthrough. Performance floor per G-7 met on Rob's machine.

**Assets needed:** None.

**Dependencies:** All prior.

**Acceptance criteria:**
1. The `final` Release `.zip` runs on a clean Windows machine to the main menu in under 15 s.
2. A full playthrough produces no errors in the log.
3. Every third-party item in the project appears in the license table with a commercial-use license.

---

### Gate 6 — Rob's Review Checklist

1. Launch. Does it open to a menu? Does Load say "no save" before you've played?
2. Start. Did a video play? Skip it. Are you in the closet?
3. Open Options mid-game. Drag Music to zero. Gone? Drag SFX to zero. Gun silent?
4. Pause mid-fight. Does the demon freeze? Resume. Did the camera jump?
5. Quit to menu after the shotgun. Load. Gun still there? Same spot?
6. Finish the demo. Did the outro play? Did the modal appear? Keep Playing — can you still move and shoot?
7. Read `LEVELS.md`. Could you, personally, follow it?

**Approve when:** it feels like a finished demo of a real game.

---

## Evaluation Rubric (Gate 6, per agent if competing)

| Category | Points | What earns them |
|---|---:|---|
| **Gate discipline** | 10 | Every gate delivered per protocol; feedback applied faithfully; approved scope never reopened without sign-off; notes honest about gaps. |
| **Spatial feel** | 20 | Rob walks the level without ever thinking about controls or geometry. Metrics standard honored. |
| **Completeness** | 20 | Critical path completes start → Demo Complete with no intervention or errors. Every required system present. |
| **Game feel** | 15 | Weapon has weight; pump cycle satisfying; demons threatening; recoil, audio, animation aligned. |
| **Art direction** | 15 | Reads as the "after" mood board. Lighting atmospheric and navigable. Assets seated, scaled, decimated. |
| **Technical quality** | 10 | Performance floor met. No clipping, z-fighting, fall-through. Clean log. |
| **Extensibility & docs** | 10 | Data-driven tuning. Level template and registry genuinely work. `LEVELS.md` usable by a stranger. |

**Automatic deductions:** build does not launch −25; critical path incomplete −20; approved scope changed without sign-off −10; supplied asset unused with no explanation −2 each; unlicensed third-party asset −10.

---

## Gaps & Risks

**Decisions Rob must make before Gate 1 starts**

- **Review machine spec.** Every performance target in this document is measured on Rob's machine. CPU, GPU, RAM, and resolution go in `BUILD.md` before the agent picks Lumen versus baked lighting.
- **Time expectation per gate.** Not a hard cap — gates end on approval — but the agent should know whether Gate 1 is a day or a week.
- **Crouch versus crawl binds.** Left to the agent, but if Rob has a strong preference (his prior prototype used Space for crouch and C for crawl), set it now so the feel gym tests the real controls.

**Unreal-specific risks**

- **Agent-authorability is the top risk.** Binary maps, assets, and Blueprints are invisible to an AI agent. Ground Rule G-3 mitigates this with C++ and Python, but Animation Blueprints and some UMG work will still require Blueprint authoring, which is the most likely place for an agent to stall or produce something it cannot debug. Expect Gate 5 to be the hardest gate.
- **No browser delivery.** If a click-to-play URL ever matters, Unreal cannot provide it. This is a permanent property of the engine choice.
- **Git LFS quotas.** Unreal projects exceed GitHub's free LFS allowance quickly. Either budget for LFS data packs or keep `.uasset` content minimal and regenerable from scripts. A stalled push at Gate 2 is avoidable if this is decided before Gate 0.
- **Packaged build size.** Development builds run 1–3 GB. GitHub Releases cap individual files at 2 GB; the agent may need to split or strip PDBs.
- **Crawl is not native.** Unreal ships crouch but not prone. The crawl stance is custom character-movement work and is the most likely Gate 1 defect.
- **Animation authoring.** Demon locomotion, attack, and death need an Animation Blueprint or direct montage playback from C++. The rig quality out of Meshy is unknown until Gate 4; a broken rig is a documented fallback to a free rigged replacement, not a reason to reopen Gate 4.

**Process risks**

- **Gameplay is gated last.** The weapon is the second most important feel element after movement, and it is validated after all art. Gate 2's encounter-space validation is the mitigation, and Gate 5's split into 5A/5B keeps weapon feel from being buried under AI work. If the shotgun feels wrong at 5A, the fix is in the weapon, not the level.
- **Texture-before-model scale mismatch.** Real models can arrive sharper or blurrier than their surroundings. The 512 px/m texel-density target in Gate 3 is the mitigation.
- **Meshy triangle counts.** Assets arrive at 20–45× any requested budget. The Blender pipeline in Gate 4 is mandatory, not optional, and it is scripted so it can be re-run when Rob asks for a change.
- **Scope creep through feedback.** Rob's feedback at a gate should be about that gate. "While you're in there, add a flashlight" at Gate 3 is a new requirement and goes in a backlog, not the current revision.

---

## Recommended Next Steps

1. **Fill in the three decisions above** — machine spec, time expectation, control binds — and give them to the agent with this document.
2. **Set up the GitHub repository yourself** with LFS enabled and a quota plan decided, then hand the agent push access. This removes the single most common Unreal-on-GitHub failure from the agent's path.
3. **Kick off Gate 1 and expect the feel gym in the first build.** Spend real time in it — the values you pick there are the values everything else is built to, and this is the exact step your previous attempts skipped.
