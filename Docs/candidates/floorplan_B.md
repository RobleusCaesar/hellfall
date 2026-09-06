# Floor plan candidate B — game-feel / grid lens

File: `Data/candidates/floorplan_B.json` (schema: `Docs/FLOORPLAN-SCHEMA.md`, metrics: `Data/metrics.json`).

Lens for this candidate: generous game-standard interiors, everything on a grid, one straight corridor spine with rooms hung off it, walls collinear along whole columns and rows so the greybox reads at a glance and regenerates cleanly.

## 1. What I read from the drawing

Reading `SourceAssets/reference/game_layout.jpg` top to bottom (plan y increasing), consistent with the agreed reading in the schema doc:

- Top right: a small Supply Closet with racks on its right wall, two survivors on the floor, and a narrow neck dropping out of its lower-left corner toward the Break Room — that neck is the floor duct.
- Right column: a long Break Room / Kitchenette running down the right edge, table with chairs in the middle, fridge at the bottom, exit on its left wall where the corridor meets it. The dead guard is drawn at that junction, beside the Men's Bathroom.
- Middle band: the main corridor runs horizontally. The Men's Bathroom (stalls along its left wall) sits above the corridor's eastern half. The shut elevator door is on the corridor's upper wall at the far west, and the unpassable hallway continues west past it.
- A passage drops from roughly one third along the corridor down to Reception. Office #2 is on its west side (Demon #1 at its mouth), the Women's locked bathroom is directly under the corridor east of the passage, Office #1 sits under the Women's bathroom.
- Bottom: one big block, secretary's desk in the upper part, a horizontal partial dividing wall, CEO desk / dead CEO / Demon #2 below it, window along the very bottom edge.

Drawing proportions are rough (corridor about 80 px, doors 85–95 px, so the corridor would be barely a door wide) and were not used; the spec says to build to the Metrics Standard.

## 2. Grid rule

- 50 cm module grid. The 20 cm wall is consumed from the far side of every module, so every room origin `(x, y)` lies on the 50 cm grid and every interior dimension is `50k − 20`: 280, 430, 480, 580, 730, 780, 1080, 1330, 1480.
- Every coordinate in the file (openings, markers, encounters, dwell rect) is on a 10 cm grid.
- Adjacent rooms are exactly 20 cm apart. Wall lines are collinear along whole columns (`x = 500 | 980/1000 | 1480/1500 | 1980/2000 | 2480`) and rows (`y = 950 | 1430/1450 | 1730/1750 | 2330/2350 | 3080/3100 | 3880/3900 | 4980/5000`).
- Four columns of width 480 (module 500) carry the whole plan: Office #2 / elevator lobby column, the passage column, the restroom / Office #1 column, and the Break Room / Supply Closet column. Reception and the CEO office span the first three (1480).

## 3. Rooms and dimensions (interior, cm)

| Room | x | y | w | h | Ceiling | Notes |
|---|---|---|---|---|---|---|
| supply_closet | 2000 | 0 | 480 | 430 | 310 | start; racks east wall; duct out of the south wall at x = 2100 |
| break_room | 2000 | 950 | 480 | 780 | 310 | long room; duct in at north end, door on west wall at y = 1590 |
| corridor_main | 500 | 1450 | 1480 | 280 | 310 | the spine; 14.8 m straight |
| corridor_blocked | 0 | 1450 | 480 | 280 | 310 | continues the spine west; 200 cm collapse |
| elevator_lobby | 500 | 1000 | 480 | 430 | 310 | open alcove off the spine's north wall at the west end; doors on its north wall |
| mens_restroom | 1500 | 950 | 480 | 480 | 280 | door on south wall at x = 1740 |
| womens_restroom | 1500 | 1750 | 480 | 580 | 280 | locked door on north wall at x = 1740 (faces the men's door) |
| reception_passage | 1000 | 1750 | 480 | 1330 | 310 | the one leg off the spine; Demon #1 arena |
| office_2 | 500 | 2350 | 480 | 730 | 310 | door on east wall at y = 3000 (Demon #1 mouth) |
| office_1 | 1500 | 2350 | 480 | 730 | 310 | door on west wall at y = 2500 |
| reception | 500 | 3100 | 1480 | 780 | 310 | open from the passage (480 wide) at x = 1240 |
| ceo_office | 500 | 3900 | 1480 | 1080 | 310 | door from reception at x = 1240; window wall south, full width |
| exterior_city | 500 | 5000 | 1480 | 980 | 600 | sealed helper volume beyond the glass (Gate-1 stand-in for the REQ-G2-005 backdrop plane) |

Corridor 280 (spec 250–320), doors 120 × 220, wet rooms 280, all rooms ≥ 400 × 400, duct 100 W × 95 H × 520 L at floor level.

Building footprint (interior bounding box) 2480 × 4980; with outer walls **2520 × 5020** (25.2 m × 50.2 m). The backdrop volume adds 1000 to the south (2520 × 6020 including it).

## 4. Critical path and pacing

`supply_closet → duct → break_room → corridor_main → reception_passage → reception → ceo_office`

| Leg | Distance | Time at spec speeds |
|---|---|---|
| Duct crawl (130 cm/s) | 520 | 4.0 s |
| Duct mouth → break room door | ~650 | 1.6 s |
| Break room door → passage junction (west along the spine) | 740 | 1.9 s |
| Junction → reception (down the passage, through Demon #1) | 1510 | 3.8 s |
| Reception → CEO door | 800 | 2.0 s |
| CEO door → window | 1080 | 2.7 s |

About 17 s straight-line at walk speed with no stops; the fights and the optional rooms (men's restroom, two offices, elevator alcove, collapse) add the rest.

## 5. Deviations from the drawing and why

1. **Passage widened to 480 and lengthened to 1330.** The drawing's passage is corridor-width. REQ-G2-004 wants a 6 m retreat, 2 m strafe each side and no chokepoint between spawn and approach, and the schema puts Demon #1 at Office #2's mouth. A 280 corridor cannot give 2 m of strafe; 480 gives 204 each side around a 36 cm capsule. To keep the whole lane inside one room (no reliance on the validator following `open` connections), the leg needs 600 (approach → spawn) + 600 (retreat) + capsule margins = 1330. It reads as a reception gallery rather than a hallway.
2. **Offices pushed to the south end of the passage**, Office #2's door at y = 3000 so its mouth is the spawn point; the strip west of the passage above Office #2 (x 500–980, y 1750–2330) is left solid. Office #1's door is staggered north (y = 2500) so it is a side pocket during the retreat rather than a mirror of the demon's door.
3. **Elevator as an open 480 × 430 alcove** at the corridor's west end with the shut doors on its north wall, instead of doors flush on the corridor wall. From the passage junction the player sees the alcove ahead-right and the collapse at the dead end.
4. **Break Room simplified to one 480 × 780 rect** (drawing is an L). Duct enters at the north end, table mid-room, fridge at the south end, door at the south end of the west wall.
5. **Restroom doors face each other** across the spine at x = 1740 (drawing has them nearly opposite). The guard lies at x = 1880, between the Break Room door and the restroom doors.
6. **Reception / CEO width aligned to the three western columns (1480)** rather than overhanging them as in the drawing.
7. **Dividing wall.** The drawing's horizontal dividing wall is realised as the reception/CEO party wall with the 120 × 220 door (schema rule 4). `money_shot.dividing_wall` is a full-height screen wall inside the CEO office (`y = 4200`, `x 1550–1980`, 300 cm in from the entry wall) that hides the lounge and Demon #2 from the doorway.
8. **Demon #2** is placed in the CEO office lounge (the schema's agreed reading), not at the drawing's X in the reception half.
9. **Duct 520, not 500**, so both the closet and the Break Room stay on the 50 cm module (430 closet + 20 wall + 480 void + 20 wall). Within the 300–800 range.
10. **`exterior_city` backdrop volume** added so the window is an authored `window` opening between two real room ids.

## 6. Encounter geometry

**Demon #1** (`reception_passage`): spawn (1070, 3000) in the passage at Office #2's door mouth; trigger strip across the passage at y 2350–2450; player approach (1240, 2400). Spawn → approach 624 cm. Retreat north: 614 cm clear to the passage's north wall after the capsule radius, then straight on into the spine. Strafe 204 each side. No chokepoint between spawn and approach (open 480 floor).

**Demon #2** (`ceo_office`): spawn (1900, 4400) in the lounge behind the screen wall; trigger strip across the office at y 4250–4350 (the player is 350+ cm inside, past the wall line); approach (1240, 4300). Spawn → approach 668 cm. Retreat west 704 cm; strafe 364 each side. The demon is south-east of the player, so the window stays in the forward view during the fight. Occlusion check: lines from the west jamb, centre and east jamb of the door to both edges of the demon capsule all cross the wall plane inside x 1550–1980, so nothing of the demon is visible from anywhere in the doorway.

## 7. Doorway → window framing

- Door centre (plan): (1240, 3900). Window centre: (1240, 4980). Distance **1080 cm**.
- Window: full CEO width 1480, sill 40, head 300 (metrics).
- Horizontal: `2·atan(740 / 1080) = 68.8°` = **76.5 % of the 90° horizontal FOV**; about 10.6° of wall remains visible at each edge, so the window reads as framed rather than clipped.
- Vertical (16:9, vFOV 58.7°): eye 166 sees the head at +7.1° and the sill at −6.7° → 13.7° = 23 % of the vertical FOV; a wide cinematic band.
- From `cp_ceo_entry` (150 cm before the door): the doorway slot is 43.6° wide (48 % of FOV) and is entirely glazed (the slot at the window plane spans ±492 of the ±740 window) — a bright keyhole that opens to the full 68.8° on stepping into the doorway.
- The screen wall's nearest end is 45.9° off the door axis from the door centre (just outside the 90° cone) and never overlaps the window's angular span (the window's far corner is at 34.4°), so nothing occludes the glass from the doorway. The dwell rect (1040–1440 × 4830–4980) sits centred within 150 cm of the glass.
- UE mapping: facing the window is +X; the Break Room side (larger plan x) is the player's left, so the lounge, screen wall and Demon #2 are all on the player's left.

## 8. Validation performed

- `JSON.parse` OK.
- Private node checker (scratchpad, not committed): required room / checkpoint / encounter ids present; every room origin on 50, every size on 10, `w+20` and `h+20` multiples of 50; no two rects overlap and every adjacent pair is exactly 20 apart; every opening's `between[]` ids exist, the second room's edge lies on the far face of the first room's named wall, and the full opening width lies inside the shared extent; doors are 120 × 220; adjacency rules 1–5 hold; supply closet has no openings and the duct runs from its south face to the Break Room's north face inside both rooms' x-ranges; exactly one reference figure per room; every marker, checkpoint and encounter point inside its room; encounter lanes as in §6; window opposite the entry, full width; dividing wall partial and clear of the doorway strip; dwell rect flush and centred. Result: 0 errors, 0 warnings.
- `Tools/validate_floorplan.mjs` did not exist at the time of writing; run it against this file when it lands.

## 9. Open questions for Rob

1. The reception passage is a 4.8 m × 13.3 m gallery so that Demon #1's approach, retreat and strafe lanes all sit inside one room. If the corridor may count toward the retreat, it can shrink to about 4.8 × 10.8 m. Which?
2. Keep the `exterior_city` sealed box beyond the window as the Gate-1 backdrop stand-in, or have the generator treat the window wall as exterior glazing with nothing behind it until Gate 2's backdrop plane?
3. Office #1's door is staggered north of the arena (a side pocket while retreating). Prefer it directly opposite Office #2's door instead?
4. The CEO office is 14.8 × 10.8 m and the window fills about 77 % of the horizontal FOV from the door. Too dominant, or the right amount of "money shot"?
5. Elevator as an open alcove at the corridor's west end (doors on the alcove's back wall) versus doors flush on the corridor wall as drawn.
6. Duct length 520 instead of the 500 default, to keep both rooms on the module.
7. Rooms are deliberately large through a game camera (offices 4.8 × 7.3 m, restrooms 4.8 × 4.8 / 5.8 m, supply closet 4.8 × 4.3 m). If the feel gym says smaller, every room can drop one 50 cm module without breaking the grid.
