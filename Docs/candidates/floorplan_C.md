# Floor plan candidate C — encounter + money-shot first

File: `Data/candidates/floorplan_C.json` (schema: `Docs/FLOORPLAN-SCHEMA.md`, units cm, plan space: x right on the photo, y down toward the window).

## Design lens

Everything is laid out backwards from three moments:

1. **Demon #1** at the mouth of Office #2 — needs a straight 6 m retreat lane back toward the Break Room and 2 m of strafe either side.
2. **Demon #2** in the CEO office — must never sit on the doorway→window sightline.
3. **The window reveal** — the reception passage approaches the CEO door head-on, the door faces the window wall squarely, the dividing wall is off to one side.

One number ties the plan together: **plan x = 1200** is the centreline of the reception passage (`corridor_south`), the reception→CEO door and the CEO window wall. In Unreal that is one straight +X axis from the corridor junction (y=1420) to the glass (y=4020): 26 m of head-on approach with the burning city visible as a sliver through the CEO door the whole way.

## What I read from the drawing (`SourceAssets/reference/game_layout.jpg`)

Measured on the 4284×5712 photo; the main corridor is ~225 px tall, which at 280 cm gives ~1.24 cm/px. Proportions are loose and were not copied.

- **Supply closet** top right, an outer box with the racks drawn as a strip along its right wall; the seated man leans on that strip, the intern sits against the opposite (left) wall. The duct leaves from the closet's bottom-left and runs straight down into the top wall of the Break Room.
- **Break Room / Kitchenette** is a tall room on the right: kitchenette counter drawn as a long strip along its right wall, fridge as a square at bottom right, round table + chairs left of centre. Its left wall is shared with the Men's Bathroom above the corridor and the corridor's east end runs into it; the dead-guard "X" sits at that junction.
- **Main corridor** runs left–right. On its north wall, from west to east: the shut elevator door (two ticks just west of the passage), then the Men's Bathroom door (two ticks under the men's room). On its south wall: the passage opening, then the Women's locked bathroom door (two ticks). The corridor dead-ends west in a zigzag = collapsed hallway.
- **Passage** drops down from the corridor. Office #2 left of it (door ticks on its east/passage wall), Women's bathroom + Office #1 stacked on the right (Office #1 door ticks on its west/passage wall). Demon #1 "X" at Office #2's top-left.
- **Reception + CEO** is one big box. Secretary desk on the centreline, a horizontal dividing wall across the middle with gaps at BOTH ends (bigger gap on the right), CEO desk on the centreline with the chair between desk and window, dead CEO "X" at left, Demon #2 "X" actually drawn ABOVE the secretary desk (reception side). Window = double line along the bottom.

Topology kept exactly; proportions, door positions and prop positions were changed where the three moments needed it (list below).

## Dimensions (all inside the Metrics Standard)

| Room | Interior (x × y) | Ceiling | Notes |
|---|---|---|---|
| supply_closet | 400 × 440 | 280 | min footprint; racks 60 deep along the east wall; duct mouth x 2210–2310 |
| break_room | 620 × 760 | 310 | long axis along y as drawn; counter east, fridge SE, table (2350,1350) |
| mens_restroom | 580 × 440 | 280 | wet room; stalls along the west wall |
| womens_restroom | 580 × 400 | 280 | sealed; locked door on the corridor |
| elevator_lobby | 540 × 320 | 310 | recess north of the corridor, fully open (540) to it; doors 140×220 in its north wall |
| corridor_main | 1520 × 280 | 310 | spine; east end is the break-room door, west end opens to the collapse |
| corridor_blocked | 400 × 280 | 310 | 200 cm walkable + 200 cm rubble wedge |
| corridor_south | 280 × 900 | 310 | the reception passage, on the x=1200 axis |
| office_2 | 560 × 480 | 310 | Demon #1 lair; door on its NORTH wall (corridor) at x=660 |
| office_1 | 580 × 480 | 310 | door on its west wall onto the passage at y=2240 |
| reception | 1300 × 600 | 310 | passage enters centred; CEO door centred on its south wall |
| ceo_office | 1300 × 900 | 310 | window = full 1300 south wall; dividing stub 420 long |

Doors 120×220, corridor 280, wall 20, duct 100W×95H×500L (length measured between the interior faces of the two walls: supply south face y=440 → break north face y=940; the tube passes through both walls). Footprint: interior bounding box **2580 × 4020**; with exterior walls **2620 × 4060** (26.2 m × 40.6 m). Photo bounding box ratio is 0.59 wide/tall; this plan is 0.65 — same silhouette.

Supply-closet ceiling is 280 (the wet-room value, not the 310 office value) on purpose: a janitor's closet with a dropped ceiling makes the room read tight before the duct. Flagged as an open question.

## Encounter geometry

### Demon #1 (`corridor_main`)

- Office #2's door is on the **corridor** (north wall of office_2, centre x=660), 4 m west of the passage junction, on the dead-end side (elevator + collapse). Spawn (660,1480) is 80 cm in front of that door.
- Trigger strip x 1120–1280 across the corridor = the junction. Player approach (1200,1420) = junction centre. Spawn→approach = 543 cm, entirely inside the 280 corridor (no chokepoint narrower than the corridor).
- **Retreat east** ("back toward the Break Room"): from x=1200 to the break-room wall face at x=1940 = 740 cm, 704 after the capsule radius → stated 700 (≥ 600).
- **Strafe**: north into the elevator-lobby recess (540 wide, covers x 800–1340; clear to y=940 → 444 cm) and south into the passage (clear to y=2480 → 1024 cm) → stated 400 each side (≥ 200). This is why the lobby is a full-width recess exactly at the junction rather than a door: it is the dodge pocket, and it sits where the drawing puts the elevator door (north wall, just west of the passage).
- Dramatic read: the player enters the junction, sees the shut elevator ahead-left and the rubble at the far end, and the demon comes out of the only dark door on that side. The way out is behind them (east) or the passage (south, progression).

### Demon #2 (`ceo_office`)

- Dividing stub along x at y=3420 (300 cm inside the door wall), from the west wall (x=550) to x=970, i.e. it ends 230 cm west of the axis. Lair = the pocket south of the stub along the west wall.
- Spawn (660,3720). Hidden-wedge check from the door centre (1200,3120) past the stub end (970,3420): the shadow boundary at y=3720 is x=740; the demon capsule (r=60) east edge is at 720 → hidden from the doorway by 20 cm. The dead CEO (620,3540) is in the same pocket.
- Trigger: full-width strip y 3620–3720 (the player crosses it walking to the window). Approach (1200,3820), 200 cm short of the dwell rect.
- **Retreat north** along the axis: 700 cm to the door wall, 664 after capsule → stated 650 (≥ 600), and the door is at the end of the lane so the retreat can continue into reception. East is also 614 clear (alternative if Gate 5 prefers fighting along the glass).
- **Strafe**: 614 each side geometrically; stated 300 so that the CEO desk (x ≥ 1540) and couch set (x 1500–1800, y 3300–3600) can live in the east half without touching the lane. The axis strip x 1060–1340 is prop-free from the corridor junction to the glass.
- The demon approaches from the player's left; the window stays in the forward view (and, if the player backs north, the demon is silhouetted against it).

## Money-shot framing (REQ-G2-005)

- Door centre (mid-wall): **(1200, 3110)**. Window centre (interior face of the south wall): **(1200, 4020)**. Distance **910 cm**, dead ahead (0° yaw offset — UE +X).
- Window is the full 1300 south wall (x 550–1850). Horizontal span from the threshold: 2·atan(650/910) = **71.1°**, i.e. **79% of the 90° horizontal FOV** (71.7° / 80% from the interior face of the door wall). Each side edge of the glass sits at 35.5°, inside the 45° half-FOV, so the whole width is visible with the head-on entry.
- Vertical (16:9 → vertical FOV 58.7°, eye 166, sill 40, head 300): the glass spans −7.9° to +8.4° = 16.3° at the threshold; at the dwell rect (≤150 cm from the glass) it spans 81.8° vertically and 154° horizontally — it fills the entire view.
- Dividing stub: its free end is at 36.6° left; the ray from the door centre past that end reaches the window plane at x=525, which is beyond the west edge of the glass (550). **The stub hides zero glass from the doorway.** It occupies only the 36.6°–45° sliver at the left edge of the frame, lit from behind by the window — a silhouette frame, not an obstruction. It does not cross the sightline (`from_x 550 → to_x 970 < 1200`).
- Teaser: from the south mouth of the passage (1200,2480) the 120 door subtends 10.9°; from the corridor junction (1200,1420), 17 m out, 4.1°. The orange glow is visible as a slot the whole way down.
- Dwell rect x 1000–1400, y 3870–4020 (400 wide, 150 deep, centred on the axis, touching the glass).

## Deviations from the drawing, and why

1. **Office #2's door moved from its passage (east) wall to its corridor (north) wall.** Gives Demon #1 a straight east retreat lane toward the Break Room and puts the demon on the dead-end side. Adjacency is unchanged (office_2 ↔ corridor_main by a door).
2. **Elevator lobby is a 540×320 recess north of the corridor spanning the junction**, fully open to it, doors in its north wall. The drawing shows the elevator door on the corridor's north wall just west of the passage; the recess is the same spot made deep enough to strafe into.
3. **Reception and CEO office are separated by a full wall + 120 door** (schema rule 4); the drawing has one big room with a mid-room partial wall. The drawing's centred dividing wall (gaps both ends) becomes a 420 cm stub from the west wall, 300 cm inside the CEO door wall, so it cannot cross the sightline.
4. **Secretary desk and CEO desk moved off the centreline** (both are drawn on it) to keep the head-on axis prop-free. Secretary desk east of the axis facing the passage mouth; CEO desk east near the glass with its chair on the window side as drawn.
5. **Demon #2 moved into the CEO office** (the drawing's X is on the reception side above the secretary desk); the schema's agreed reading and required id put it in `ceo_office`.
6. **Room proportions compressed.** The drawing implies an ~8×9 m supply closet and ~10×7 m men's room; both are at 400–580 here. The break room keeps its tall-along-y shape but at 620×760.
7. **Break-room door**: the drawing's small door-leaf shape where the corridor meets the break room is read as the doorway on the break room's west wall (y=1420); the guard lies in the corridor just outside it, between it and the men's door.
8. **Mop + bucket** placed in the supply closet (janitorial); the drawing does not show it.

## Validation performed

- `JSON.parse` OK. Independent structural check (scratch script): no two room rects overlap; every touching pair is separated by exactly 20; every opening's `between[]` ids exist, the two rooms are exactly one wall apart on the named wall, and the full opening width lies inside the shared wall extent; every marker/checkpoint/encounter point is inside its room; one reference figure per room (12); all four checkpoint ids; both encounter ids; player_start in supply_closet facing +y (yaw 90) along the duct; supply_closet has no openings; duct faces align with both walls; dividing wall does not cross x=1200; dwell rect within 150 of the glass and centred.
- `Tools/validate_floorplan.mjs` did not exist when this candidate was finished; run `node Tools/validate_floorplan.mjs Data/candidates/floorplan_C.json` once it lands.

## Open questions for Rob

1. Office #2's door on the corridor (west of the junction) rather than on the passage as drawn — acceptable for the Demon #1 setup?
2. The window wall is authored only through `money_shot.window_wall` (no `Opening` of type `window`, because `between[]` needs two rooms and the glass is exterior). Confirm the generator builds the glazing from `window_wall` with sill 40 / head 300 from metrics.
3. Collapse wedge assumed at the far (west) end of `corridor_blocked`, leaving 200 cm walkable in front of it. If the generator places it at the opening, `ref_corridor_blocked` and `note_collapse` need to move.
4. Elevator doors in the lobby's north wall (per drawing); the schema example uses "west". Either is a one-field change.
5. Supply-closet ceiling at 280 instead of 310 — keep the tighter closet?
6. Demon #2 capsule reserved at r 60 / h 280; both demon GLBs are 100× too small so real dimensions are unknown until the Gate 2 Blender pass. Room and ceiling (310) fit up to ~r 70 / h 300.
7. Do you want the secretary desk back on the centreline as drawn? It would break the head-on approach to the CEO door, so it is east of the axis here.
8. CEO office is 13 × 9 m and reception 13 × 6 m — bigger than the offices on purpose for the reveal. Too grand, or right for an executive floor?
