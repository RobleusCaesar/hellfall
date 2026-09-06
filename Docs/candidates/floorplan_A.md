# Floor plan candidate A — drawing fidelity

**File:** `Data/candidates/floorplan_A.json` · **Schema:** `Docs/FLOORPLAN-SCHEMA.md` · **Lens:** reproduce the relative proportions and positions of Rob's hand drawing as closely as the Metrics Standard allows.

## 1. What I read from the drawing

Measured on the photo (`SourceAssets/reference/game_layout.jpg`, 4284×5712 px; coordinates below are photo pixels, x right, y down). I cropped and gridded the photo at 1:1 and 2:1 to read the pencil lines; the agreed reading in the schema doc holds, with four refinements.

| Element | Drawn extent (px) | Reading |
|---|---|---|
| Supply closet | x 3290–3905, y 785–1510 (615×725) | Racks are the strip along the **east** wall (x 3790–3905). The two long shapes inside are the seated man (against the racks) and the seated woman (against the west wall) — the arrows land on them. |
| Duct | x 3560–3690, y 1510–1860 | 130 px wide passage from the closet's south wall straight down into the break room's north wall, slightly right of the closet's centre. |
| Break room | x 3050–3870, y 1860–2680 (820×820) | Nearly square, not "long": the kitchenette counter is the strip along the east wall (x 3700–3870, y 1860–2450), fridge box in the SE corner (3650–3830 × 2480–2680), table+chairs (OOo) at ~(3420, 2260). The west side between y 2170–2400 is **open to the corridor** (no wall drawn). The "Dead security guard" X is at (3140, 1930) — inside the break room's NW corner. |
| Men's restroom | x 2270–3030, y 1620–2150 (760×530) | Three stalls along the west wall. The **"Vanity" arrow lands on the box in this room's SE corner** (2905–3030 × 1840–2170), not in the women's room. Door on the south (corridor) wall between ticks 2510–2735, drawn as a *faint* line (open door). |
| Corridor | y 2170–2400 (≈230 wide), x 1600 (collapse) → 3030 | Zigzag collapse closes the west end (x 1560–1640). Elevator arrow lands on the **north** wall between ticks 1730–2020 (≈290 px). |
| Women's restroom | x 2280–~3000, y 2410–2660 | Long room under the corridor. Its locked door is drawn as a *dark* line between ticks 2530–2745 (centre 2637) — east of x 2600, so the room must run east to the break room's west wall (x 3000, which is drawn exactly over this y-band). The x 2600 vertical below y 2670 is Office #1's east wall only; Rob's "Vanity / Women's locked bathroom" labels sit where the room's east part would be. |
| Passage | x 2030–2280, y 2400–3505 (250 wide, 1105 long) | Drops from the corridor to the reception's top wall. |
| Office #2 | x 1720–2010, y 2650–3320 (290×670) | West of the passage; door gap on its east wall y 2860–3100. **The "Demon #1" X is inside the office, NW corner (1740, 2730).** |
| Office #1 | x 2300–2580, y 2690–3320 (280×630) | East of the passage, under the women's room; door gap on its west wall y 2840–3130. |
| Reception + CEO | x 1390–2740, y 3505–5070 (1350×1565) | One big room. Partial dividing wall (double line) at y ≈4200 from x 1610 to 2365 leaving a 215 px gap on the left and a 370 px gap on the right. Secretary's desk 1845–2205 × 3970–4095 with chair on its south side; CEO desk 1845–2165 × 4620–4790 with chair on its south side; dead-CEO X at (1600, 4635); **"Demon #2 (bigger)" X at (2010, 3825) — in the reception half**, ~320 px below the passage mouth. Window wall = double line along the very bottom (y 5040–5070), full width. |

## 2. Scale and dimension choices

- **Scale: 1.2 cm per photo pixel**, anchored on the drawn corridor width (≈230 px → 276 ≈ 280 cm, the Metrics Standard default; allowed 250–320).
- Every rect is the drawn interior × 1.2, rounded to 10 cm, then snapped so shared walls are exactly 20 cm. Interiors start at (20, 20) so the outer walls sit on 0.
- Door/opening centres are the midpoints of Rob's tick pairs; door widths are the fixed 120 × 220 (Rob's tick pairs are ~220–290 px = symbolic, not to scale).

| Room | Drawn px → cm | Built (cm) | Note |
|---|---|---|---|
| supply_closet | 615×725 → 738×870 | **740 × 870** | Large for a closet; kept as drawn (0.65× the break room's area). |
| break_room | 820×820 → 984×984 | **980 × 980** | |
| mens_restroom | 760×530 → 912×636 | **910 × 640**, ceiling 280 | |
| womens_restroom | ~700×250 → 840×300 | **870 × 400**, ceiling 280 | Depth bumped 300→400 (min footprint). Spans passage wall → break-room wall. |
| corridor (all segments) | 230 wide, 1420 long → 276 × 1704 | **280 wide**, 340→2050 = 1710 long + 300 collapse stub | Split into corridor_blocked (300) · elevator_lobby (480) · corridor_main (1210). |
| elevator_lobby | — | **480 × 400** | Corridor widened 120 cm south at the elevator so the room meets the 400 minimum; the shut doors stay on the drawn north-wall line. |
| corridor_south (passage) | 250×1105 → 300×1326 | **300 × 1330** | Rob drew it a touch wider than the corridor; kept (allowed range). |
| office_2 | 290×670 → 348×804 | **400 × 800** | Width bumped to 400 (min footprint). |
| office_1 | 280×630 → 336×756 | **400 × 740** | Width bumped to 400; pushed 90 cm south by the women's room's 400 depth. |
| reception | 1350×685 → 1620×822 | **1620 × 820** | |
| ceo_office | 1350×860 → 1620×1032 | **1620 × 1030** | |
| duct | 130 wide × 350 long → 156 × 420 | **100 × 95 interior, 420 long** (metrics) | Tube spans the full gap closet south face (y 890) → break room north face (y 1310), through both walls. |

**Total footprint incl. outer walls: 3120 × 5220 cm (31.2 m × 52.2 m)**; drawn aspect 0.600, built 0.598. Interior floor area ≈ 716 m². Critical path ≈ 62 m of walking (≈ 19 s at walk speed incl. the crawl).

## 3. Where I deviated from the drawing and why

1. **Break room exit is a 120 cm door**, not the corridor-wide opening Rob drew (schema adjacency 2 requires a `door`). It sits on the break room's west wall, centred on the corridor (y 1820). The guard + shotgun note is placed in the corridor just west of that door against the men's-room wall (REQ-G2-003); the sketch's X (inside the break room NW corner) is recorded in the note.
2. **Reception | CEO office.** Rob drew one partial wall with gaps at both ends. The schema needs a full wall with a `door` between two rooms plus a partial `dividing_wall` inside the CEO office. So: the boundary wall is at the drawn wall's y (4150–4170); the door is in the sketch's **right-hand gap** (drawn gap ≈ x 1250–1690 cm; door 1290–1410, centre 1350 — nudged 120 cm west of the gap's midpoint to improve the window framing, see §4). The left gap is closed. The required interior dividing wall runs along x at y 4370 from the west wall to x 720, forming a west nook that holds the couch set and the dead CEO and hides demon_2's spawn; it never enters the door→window cone (its end is 72° off-axis).
3. **Demon positions.** demon_1 is reserved at the Office #2 door mouth in the passage with the trigger at the corridor T-junction (REQ-G2-003 says "corridor near Office #2"); Rob's X inside Office #2 is a note. demon_2 is reserved inside the CEO office (schema); Rob's X in reception is a note.
4. **Three rooms bumped to the 400 cm minimum** (offices' widths, women's depth) and the **elevator lobby deepened to 400** — see §2.
5. **Elevator doors built 200 wide** (drawn ≈350 cm — a symbol, not a freight lift); the generator centres them on the lobby's north wall (x 580); the drawn centre is x ≈660.
6. **No `window` opening authored.** There is no exterior room id to put in `between[]`; the money-shot wall is declared via `money_shot.window_wall = "south"` and the generator builds the glazing there (sill 40 / head 300 from metrics).

## 4. Doorway → window framing (FOV 90° horizontal)

- CEO office interior: x 80–1700 (1620 wide), y 4170–5200 (1030 deep). Window = the full south wall, centre (890, 5200).
- Door `door_reception_to_ceo`: centre x **1350**, wall y 4150–4170. Eye at the threshold (1350, 4170) facing +y (UE +X).
- Straight-line distance door centre → window centre: √(460² + 1030²) = **1128 cm**; perpendicular distance **1030 cm**.
- Window edges from the doorway: left edge (x 80) at atan(1270/1030) = **51.0°** left; right edge (x 1700) at atan(350/1030) = **18.8°** right. Window angular width 69.7°.
- With a 90° horizontal FOV (±45°) the left edge is off-screen, so the window fills **63.8° of 90° = 70.9%** of the screen width; the remaining 29% on the right is the east wall's return. Walking 3 m in (y 4470) it becomes 76%.
- Alternatives for Rob: door at the drawn gap's midpoint (x 1470) → 64.0%; door centred on the room (x 890) → 2·atan(810/1030) = 76.4° → **84.9%**, symmetric — the better shot, but it puts the door through the middle of the wall Rob drew.
- dwell_rect: x 590–1190 (600 wide, centred on the window), y 5050–5200 (within 150 cm of the glass).

## 5. Encounter space reserved

- **demon_1** (r 45, h 220): spawn (1010, 2660) at the Office #2 door mouth in the passage; trigger = the T-junction (860–1160 × 1680–1960); player_approach (1010, 1820) on the corridor centre-line, **840 cm** from the spawn. Retreat east toward the break room: 1000 cm clear (to the door at x 2050); west 650 cm to the collapse. Strafe: the corridor gives ≥ 200 each side; the 300-wide passage itself is the approach lane and is never narrower than 280.
- **demon_2** (r 60, h 300): spawn (200, 4480) tucked behind the nook wall (occluded from the door: the door→spawn line crosses y 4370 at x ≈ 608 < 720). player_approach (1000, 4600); trigger 850–1350 × 4400–4800; retreat east 700 cm; strafe N 430 / S 600. Demon lane spawn → approach runs between the nook wall's south face (4380) and the CEO desk's north edge (4680): **300 cm**, ≥ the 280 corridor minimum, provided Gate 2 places the desk at y ≥ 4680 as noted.

## 6. Open questions for Rob

1. The closet is drawn almost as big as the men's room (7.4 × 8.7 m built). Do you want it that big, or was it drawn large only to fit the two figures? (Candidate A keeps it; a 4 × 5 m closet would change the ratio you drew.)
2. The "Vanity" arrow points into the **men's** room's corner box; the schema reading put the vanity in the (locked, never-seen) women's room. Which?
3. Demon #1's X is inside Office #2 and Demon #2's X is in the reception half, just past the passage mouth. The spec puts them at the corridor mouth and in the CEO office. Do you want the drawn positions (lurk inside the office and burst out; ambush at the reception entrance) instead?
4. Reception→CEO door: keep it in your right-hand gap (70.9% window fill) or centre it (84.9%)?
5. The corridor runs straight into the break room in your sketch; the plan gives it a 120 cm door. OK?
6. Women's room: I read it as a long room under the corridor out to the break room's wall (its locked door is drawn east of Office #1's line). If it is really only Office #1's width, its door must move west and the room shrinks to 400 × 400.
