# HELLFALL executive floor - final Gate 1 floor plan

**Data:** `Data/floorplan.json` (schema `Docs/FLOORPLAN-SCHEMA.md`, metrics `Data/metrics.json`, player body `Data/movement.json`).
**Drawing:** `SourceAssets/reference/game_layout.jpg`. **Generated map:** `/Game/Maps/L_ExecutiveFloor` via `Tools/ue/build_greybox.py`.

This plan is the synthesis of the three digitizer candidates (`Data/candidates/floorplan_{A,B,C}.json`, write-ups in `Docs/candidates/`). Judge outcome: B won (tally A 120 / B 150 / C 137). The final plan keeps B's structure (50 cm grid, one straight corridor spine, axis-centred money shot), grafts C's Demon #1 staging (a corridor fight at the passage junction, which lets the passage return to true corridor width) and A's drawing-proportion reads (near-square break room, women's band under the corridor, facing restroom doors, vanity arrow, sketch X positions kept as notes). Every judge must-fix item is applied; the list is in section 10.

Plan space: `x` right on the photo, `y` down toward the window; all values cm; rects are interior clear dimensions; shared walls are exactly 20 cm. Unreal: `UE.X = plan.y`, `UE.Y = -plan.x`; facing the window is +X and the break-room side is the player's left.

## 1. Rooms

Grid rule: every room origin is on the 50 cm grid and every interior dimension is `50k - 20` (280, 430, 480, 580, 780, 930, 980, 1080, 1480); every coordinate in the file is on a 10 cm grid. Footprint including outer walls: **x -20..3000, y -20..4600 = 30.2 m x 46.2 m**; interior floor area about 590 m2 (the twelve rects sum to 589.8; 565 m2 enterable once the sealed 24.9 m2 women's room is taken out).

| id | label | rect (x, y) | interior w x d x ceiling | floor | role |
|---|---|---|---|---|---|
| `supply_closet` | Supply Closet | (2550, 0) | 430 x 430 x 310 | concrete | start |
| `break_room` | Break Room / Kitchenette | (2000, 950) | 980 x 780 x 310 | tile | transit |
| `corridor_main` | Main Corridor | (500, 1450) | 1480 x 280 x 310 | carpet | transit |
| `corridor_blocked` | Collapsed Hallway | (0, 1450) | 480 x 280 x 310 | carpet | dead_end |
| `elevator_lobby` | Elevator Lobby | (1000, 950) | 480 x 480 x 310 | tile | dead_end |
| `mens_restroom` | Men's Restroom | (1500, 950) | 480 x 480 x 280 | tile | optional |
| `womens_restroom` | Women's Restroom (LOCKED) | (1400, 1750) | 580 x 430 x 280 | tile | sealed (not enterable) |
| `corridor_south` | Reception Passage | (1100, 1750) | 280 x 930 x 310 | carpet | transit |
| `office_2` | Office #2 | (600, 1750) | 480 x 930 x 310 | carpet | optional |
| `office_1` | Office #1 | (1400, 2200) | 480 x 480 x 310 | carpet | optional |
| `reception` | Reception | (500, 2700) | 1480 x 780 x 310 | carpet | transit |
| `ceo_office` | CEO Office | (500, 3500) | 1480 x 1080 x 310 | carpet | goal |

Wall lines are collinear by column and row: x = 500 (reception/CEO west, corridor west), 1000/1080-1100 (lobby west, passage west), 1380-1400/1480-1500 (passage east, lobby/men's partition), 1980-2000 (spine east end, women's east, break-room west), 2980 (break room / closet east); y = 950 (lobby, men's and break-room tops), 1430-1450 (corridor north), 1730-1750 (corridor south), 2180-2200 (women's / Office #1), 2680-2700 (reception north), 3480-3500 (CEO door wall), 4580 (glass).

## 2. Openings

| id | from -> to | type | wall of `from` | centre along wall | size |
|---|---|---|---|---|---|
| `door_break_to_corridor` | break_room -> corridor_main | door | west | y 1590 | 120 x 220 |
| `door_mens_to_corridor` | mens_restroom -> corridor_main | door | south | x 1740 | 120 x 220 |
| `locked_door_womens_to_corridor` | womens_restroom -> corridor_main | locked_door | north | x 1740 (faces the men's door) | 120 x 220 |
| `open_corridor_to_blocked` | corridor_main -> corridor_blocked | open | west | y 1590 | 280 x 310 |
| `open_elevator_to_corridor` | elevator_lobby -> corridor_main | open | south | x 1240 | 480 x 310 |
| `open_corridor_to_passage` | corridor_main -> corridor_south | open | south | x 1240 | 280 x 310 |
| `door_office2_to_corridor` | office_2 -> corridor_main | door | north | x 840 (4 m west of the junction) | 120 x 220 |
| `door_office1_to_passage` | office_1 -> corridor_south | door | west | y 2320 | 120 x 220 |
| `open_passage_to_reception` | corridor_south -> reception | open | south | x 1240 | 280 x 310 |
| `door_reception_to_ceo` | reception -> ceo_office | door | south | x 1240 | 120 x 220 |
| `window_ceo_city` | ceo_office -> exterior | window | south | x 1240 | 1480 x 260 (sill 40, head 300) |

Every door sits at least 60 cm from the nearest wall end (minimum jamb: Office #1 door 60, break-room door 80, all others >= 180), so the generator emits no jamb pier shorter than 40 cm. The window is authored with `between: ["ceo_office", "exterior"]`: the validator treats `exterior` as the outside, the generator builds sill + glass panes + mullions on the CEO office's south wall and nothing beyond it (the Gate 2 backdrop plane goes >= 300 cm behind the glass). No `exterior_city` helper room: a sealed room there would receive a floor, ceiling, light, label and reference figure visible through the glass.

## 3. Duct, blockers

- **Duct** `duct_supply_to_break`: axis y, centre line x = 2650, from the closet's south wall face (y 430) to the break room's north wall face (y 950). `length_cm` = 520 = face-to-face distance including both 20 cm walls (`start` is the centre-line point on the INTERIOR face of the closet's south wall). Interior 100 W x 95 H at floor level, 6 cm lips at both mouths (crawl only: 95 is above the 64 crawl height and below the 116 crouch height). Mouth in the closet at x 2600-2700 (the racks are on the east wall, the intern on the west wall north of the mouth); mouth in the break room at x 2600-2700, west of the kitchenette counter run.
- **Collapse** `collapse` in `corridor_blocked`: rubble wedge 200 deep floor-to-ceiling at the far (west) end, x 0-200, leaving 280 cm of walkable stub so it reads as a collapse and not a flush wall.
- **Elevator** `elevator` in `elevator_lobby`: shut doors 200 x 220 flush in the lobby's north wall, centred x 1240, labelled. 200 wide (Rob drew a ~350 cm symbol) so it reads as an office lift, not a residential one.

## 4. Markers, checkpoints, encounter reservations

**Player start** `(2650, 150)` yaw 90 (facing down the photo, straight at the duct mouth). One 180 cm reference figure per room (12). 29 `note` markers carry the Gate 2 intent with cm footprints; the ones that matter for REQ-G2-005 obstruction and REQ-G2-004 lanes:

| where | Gate 2 footprint (cm) |
|---|---|
| Supply racks | east wall x 2920-2980, y 0-430, ~200 tall; seated man against the rack face; intern against the west wall north of the mouth; mop + bucket x 2760-2840 on the south wall |
| Kitchenette counter | east wall x 2920-2980, y 950-1500; fridge SE corner x 2900-2980, y 1650-1730; round table D120 + 4 chairs at (2550, 1340), one chair pushed out |
| Dead guard + shotgun | slumped against the corridor's NORTH wall in its NE corner, knees drawn up, feet at the east wall just north of the break-room door: x 1880-1980, y 1450-1510 (100 x 60); shotgun beside his head x 1800-1880, y 1450-1480, east of the men's door (x 1680-1800). Nothing south of y 1510 at x 1800-1980, so 220 cm of floor (>= the 216 corridor minimum) stays clear along the whole Demon #1 retreat lane; the corridor's reference figure stands on the south wall at (1600, 1690), out of the corner |
| Toilet stalls / vanity | men's west wall x 1500-1640, y 960-1400; vanity men's SE corner x 1830-1980, y 1030-1430 (Rob to confirm, see Q3) |
| Office desks | Office #2 west wall x 620-780, y 2200-2360; Office #1 east wall x 1720-1880, y 2380-2540 |
| Secretary desk | x 1450-1880, y 2950-3100, chair south side, EAST of the axis |
| Screen wall | x 1550-1980 at y 3800, full height (money_shot.dividing_wall) |
| Dead CEO | slumped against the EAST wall in the lounge pocket, x 1900-1980, y 3980-4060 (80 x 80), 20 cm south of Demon #2's idle capsule; inside the hidden wedge from all three doorway rays (west-jamb boundary at y 4060 is x > 1883, 17 cm margin by the conservative NW-corner test in section 6). It cannot lie deeper in the pocket: at y 4150 the boundary is already x > 1994, outside the room |
| Couch set | lounge SE corner x 1600-1950, y 4250-4550; inside the doorway -> glass cone but below eye line (a 90 cm couch back 760 cm from the door centre hides only the bottom 17 cm of glass above the 40 cm sill across the east third; the 75 cm CEO desk projects 4 cm above the sill) |
| CEO desk | WEST of the axis x 520-900, y 4300-4500, chair on the window side x 630-790, y 4500-4570 |
| **Axis strip** | **x 1100-1380 is prop-free from the corridor junction (y 1450) to the glass (y 4580)**, except the Gate 1 reference figure against the passage's west wall at (1130, 2620): footprint x 1105-1155, 25 cm west of the lit door slot (x 1180-1300), so the teaser numbers in section 6 are untouched |

Sketch positions Rob drew that the spec moved are kept as notes so the greybox review shows him where and why: Demon #1 X inside Office #2's NW corner (660, 1810); Demon #2 X in the reception half (1000, 3080); dead guard X inside the break room's NW corner (2100, 1000); the Vanity arrow landing in the men's room's SE corner.

**Checkpoints (REQ-G5-005 positions reserved):**

| id | room | pos | yaw | note |
|---|---|---|---|---|
| `cp_start` | supply_closet | (2650, 150) | 90 | = player start |
| `cp_break_room` | break_room | (2300, 1590) | 180 | 3 m inside the corridor door, facing it |
| `cp_corridor_post_pickup` | corridor_main | (1600, 1500) | 180 | north side, east of the junction, clear of the men's door (x 1680-1800), the pickup (x 1800-1880) and the Demon #1 retreat lane (y 1554-1626) |
| `cp_ceo_entry` | ceo_office | (1100, 3600) | 90 | 1 m inside the CEO door, west of the axis so it does not sit under the Demon #2 lane marker |

**Encounters (REQ-G2-003/004 reserved space; the validator walks every lane):**

| | demon_1 | demon_2 |
|---|---|---|
| room | corridor_main | ceo_office |
| spawn | (840, 1640) - 90 cm in front of Office #2's door (corridor south face 1730), dead-end side | (1900, 3900) - NE lounge pocket, 90 cm behind the screen wall |
| trigger | the junction floor x 1100-1380, y 1450-1730 | full-width strip y 3650-3750 (150-250 cm inside the door wall; fires before the capsule clears the screen wall's free end from anywhere in the axis strip, see section 6) |
| player approach | (1240, 1590) junction centre | (1240, 3850) on the axis, 40 cm past the screen wall's south face (y 3810) |
| retreat | EAST toward the break room: 700 stated, 760 geometric (to the break-room wall face at x 2000) | WEST: 700 stated, 740 geometric (to x 500) |
| strafe each side | 400 stated: north into the elevator alcove (640 clear to its north wall face at y 950), south into the passage (930+) | 300 stated: north 350 to the door wall, south 730 to the glass |
| capsule | r 45, h 220 | r 60, h 280 |
| chokepoint spawn -> approach | none: 280 corridor floor all the way (403 cm) | none: open floor (662 cm) heading west along y 3900-3850, clear of the screen wall, the couch set and the dead CEO (who lies south of the spawn against the east wall) |

Demon #1 read: the player walks west from the break room, passes the facing restroom doors and the guard, reaches the junction (elevator alcove ahead-right, passage left, rubble at the far end) and the demon comes out of the only dark door on the dead-end side. Backing east is a straight 7.6 m run; the alcove and the passage are the dodge pockets. Demon #2 read: the player enters on axis with the window filling the view, walks about 2 m in (the trigger strip y 3650-3750 fires 1.5-2.5 m inside the door wall), and the demon comes from the left (plan +x = UE left) out of the pocket behind the screen wall; the retreat is west along the room with the window on the player's right; nothing in the fight space is between the door and the glass (REQ-G2-004 AC3). The ambush holds for the whole axis strip: the capsule's west edge (1840, 3900) clears the wall's free end only from y 3670 at x 1100, 3714 on the axis and 3757 at x 1380, i.e. 20-107 cm after the trigger's north edge (56+ cm counting the player's capsule radius). The exposure line runs from the wall's SW corner (1550, 3810) up to the door wall at x 551, so only a player who turns west on entry and passes x 1030 before crossing y 3650 sees the demon early; if Gate 5 places the demon idle at its spawn instead of spawning it on the trigger, that is the residual risk, and a second strip along the door wall (x 500-1100, y 3500-3650) closes it.

## 5. Critical path and pacing (walk 400 cm/s, crawl 130 cm/s)

`supply_closet -> duct -> break_room -> corridor_main -> corridor_south -> reception -> ceo_office`

| leg | distance | time |
|---|---|---|
| start (2650, 150) -> duct mouth (2650, 430) | 280 | 0.7 s |
| duct crawl, face to face | 520 | 4.0 s |
| duct exit (2650, 950) -> break-room door (2000, 1590), diagonal past the table | ~910 | 2.3 s |
| door -> junction (1240, 1590), west along the spine | 760 (740 from the corridor's east wall face at x 1980) | 1.9 s |
| junction -> reception (1240, 2700), down the passage | 1110 | 2.8 s |
| reception -> CEO door (1240, 3490) | 790 | 2.0 s |
| CEO door -> dwell rect (1240, 4430) | 940 | 2.4 s |
| **total** | **~5300 (49 m walked + 5 m crawled)** | **~16 s** straight through; the fights and the optional rooms (men's, two offices, alcove, collapse) add the rest of the 5 minutes |

Break-room crossing (Rob's checklist 10): 9.8 m x 7.8 m, duct mouth to door about 9 m = 2.3 s at walk speed. Corridor (checklist 2): 280 wide, 19.8 m spine including the 4.8 m collapse stub, articulated by a door every 2-5 m on its east half; the west 5 m is blank (dressing note recorded).

## 6. Doorway -> window framing (REQ-G2-005, checklist 14)

Numbers from `Tools/check_manifest.mjs` and the scratch check (FOV 90 deg horizontal, 16:9 => 58.7 deg vertical, eye 166, sill 40, head 300):

- Door centre (1240, 3490) -> window at y 4580, **1090 cm** dead ahead (UE +X, zero yaw offset).
- Window 1480 wide subtends **68.3 deg = 76 % of the horizontal FOV**, symmetric (edges at +/-34.2 deg), **10.8 deg of wall framing each side** - framed, not clipped.
- Vertical: head at +7.0 deg, sill at -6.6 deg = 13.6 deg = 23 % of the vertical FOV, a wide cinematic band.
- 3 m inside (y 3800): 87 deg horizontal = 97 %. At the dwell rect's far edge (150 cm from the glass): 157 deg horizontal, 82 deg vertical - the glass fills the whole view.
- Screen wall free end (1550, 3800) sits at exactly 45.0 deg from the door centre, i.e. on the FOV edge, and its shadow ray reaches the window plane at x 2330, far beyond the glass (1980): **it hides zero glass** from anywhere in the doorway.
- Teaser: the lit 120 cm CEO-door slot subtends 3.6 deg from the corridor junction (19 m out), 3.9 deg from the passage's north end and 8.5 deg from its south mouth; through it 281 cm of glass (x 1099-1381) is visible from the passage mouth.
- Dwell rect 600 x 150 at x 940-1540, y 4430-4580, flush against the glass and centred on the axis.

Alternatives for Rob (door and window centred in every case):

| CEO office depth | window width | subtended | share of FOV |
|---|---|---|---|
| **1080 (built)** | **1480** | **68.3 deg** | **76 %** |
| 930 (one module less) | 1480 | 76.4 deg | 85 % |
| 1230 (one module more) | 1480 | 61.7 deg | 69 % |
| 1080 | 1300 | 61.6 deg | 68 % |

### Demon #2 occlusion proof (3 rays)

Viewer points are the door's west jamb (1180, 3490), centre (1240, 3490) and east jamb (1300, 3490). The most permissive sightline past the screen wall grazes its free end's NW corner (1550, 3790). Distance of the capsule centre (1900, 3900) from that grazing ray, minus the radius 60:

| from | grazing ray | centre on hidden side | margin after r 60 |
|---|---|---|---|
| west jamb | (1180, 3490) -> (1550, 3790) | 135 cm | **75 cm** |
| centre | (1240, 3490) -> (1550, 3790) | 164 cm | 104 cm |
| east jamb | (1300, 3490) -> (1550, 3790) | 198 cm | 138 cm |

The hidden wedge behind a wall end narrows as you go deeper into the room, so the lair is deliberately right behind the wall (90 cm south of it, 20 cm off the east wall), not deep in the pocket; a demon up to about r 75 stays hidden. Real demon dimensions are unknown until the Gate 2 Blender pass. The dead CEO uses the same wedge: against the east wall at y 3980-4060 the west-jamb boundary is x > 1883, so the footprint x 1900-1980 keeps 17 cm; at y 4150 the boundary is already x > 1994 (outside the room), which is why the body sits beside the demon and not deeper in the lounge.

The table pivots on the free end's NW corner (1550, 3790). A ray through that corner from the doorway still enters the wall's body, so the ray that actually clears the wall passes the SW corner (1550, 3810) and every margin above is a lower bound. The same SW-corner ray says where the pocket opens up for a player walking in: the capsule's west edge (1840, 3900) stays hidden until y 3714 on the axis (3670 at the strip's west edge x 1100, 3757 at x 1380), which is what puts the Demon #2 trigger strip at y 3650-3750 and not further in.

## 7. ASCII plan (1 character = 1 m both ways; y downward like the photo)

```
x (m) 0    5    10   15   20   25   30
      |    |    |    |    |    |    |
  0                             +---+
  1                             |CLO|        S  player start / cp_start
  2                             |S  |        #  air duct 100 x 95, crawl only
  3                             |   |        EE shut elevator doors (blocker)
  4                             +#--+        X  rubble collapse (blocker)
  5                              #           :  open (cased opening)
  6                              #           D  door 120 x 220    L locked door
  7                              #           W  window wall (money shot)
  8                              #           == screen wall (money_shot.dividing_wall)
  9                              #           ~~ dwell rect (5 s)
 10             +-EE-+----+------#--+        1/2 demon spawns   p player approach
 11             |    |    |x        |        c  checkpoints     g dead guard + shotgun
 12             |LOBY|MENS|  BREAK  |        x  positions Rob DREW (kept as notes)
 13             |    |    |  ROOM   |        k  dead CEO   %% CEO desk   oo couch set
 14   +----+----+::::+-D--+         |        dd secretary desk
 15   |XX  :          c g |         |
 16   |XX  :  1   p       D  c      |
 17   +----+--D--+::+--L--+---------+
 18         +----+  +-----+
 19         |x   |  |WOMEN|
 20         |OFF.|P |S (L)|
 21         | #2 |S |     |
 22         |    |G +----++
 23         |    |  D    |
 24         |    |  |OFF.|
 25         |    |  | #1 |
 26         |    |  |    |
 27        +-----+::+-----+
 28        |              |
 29        |  RECEPTION   |
 30        |         dddd |
 31        |    x         |
 32        |              |
 33        |              |
 34        |              |
 35        +------D-------+
 36        |     c        |
 37        |              |
 38        |          ====|
 39        |      p      2|
 40        |             k|
 41        |  CEO OFFICE  |
 42        |              |
 43        |%%%%      oooo|
 44        |%%%%      oooo|
 45        |    ~~~~~~oooo|
 46        +WWWWWWWWWWWWWW+
```

## 8. What was interpreted from the drawing vs decided

**Interpreted (kept from the drawing):** the full topology of the agreed reading in `Docs/FLOORPLAN-SCHEMA.md`; racks on the closet's east wall with the man against them and the intern on the opposite wall; the duct dropping from the middle of the closet's bottom wall into the east half of the break room (the plan's mouth at x 2600-2700 lands 61-71 % across the break room, as drawn; its position on the closet wall, 50 cm off the closet's west wall, is ours); a near-square break room with the counter run down the east wall, the fridge at its lower end and the table centred slightly east (candidate A's 1.2 cm/px trace); the men's room above the corridor's east half with stalls on its west wall; the elevator on the corridor's north wall just west of the passage and the collapse zigzag at the far west end; the women's locked room as a long band directly under the corridor running east to the break-room wall line, with its dark door tick roughly opposite the men's door; Office #2 west of the passage, Office #1 east of it under the women's room; one big reception + CEO block with the window along the very bottom edge; reception extends further west than Office #2 and the women's band further east than Office #1 (both as drawn).

**Decided (the drawing has no scale; these are the Metrics Standard applied through the 50 cm grid):**

1. **50 cm module, one straight spine, one design axis.** Every room origin on 50, every interior 50k-20; x = 1240 is the centreline of the passage, the CEO door and the window, so the approach is head-on and the door faces the glass squarely.
2. **Passage at true corridor width (280)** and named `corridor_south` so the corridor rules apply to it; Demon #1 is therefore staged as a corridor fight at the junction, with Office #2's door moved to the corridor 4 m west of the junction (candidate C). The drawn passage-wall door is a one-field fallback (Q1).
3. **Elevator lobby as a 4.8 x 4.8 open alcove** north of the junction with the shut doors on its back wall, one module east of where the drawing puts the elevator door (the drawing has it between the passage and the collapse, i.e. over the plan's solid void x 500-980, y 950-1430); kept at the junction so it is Demon #1's north dodge pocket (Q10).
4. **Break room 980 x 780** (two modules wide) instead of B's 480 bar, so the drawn counter/fridge/table composition fits.
5. **Supply closet 430 x 430 at 310** - the drawing shows it almost as big as the men's room; a 4.3 m janitor's closet reads "tight before the duct". 280 ceiling offered as Q5.
6. **Reception | CEO office split by a full wall + 120 door** (schema rule 4); the drawing's single mid-room partial wall becomes (a) that party wall and (b) the 430 cm screen wall inside the CEO office on the east side, 300 cm inside the door wall, which hides the lounge and Demon #2.
7. **Both demons placed per the spec** (Demon #1 at the corridor near Office #2, Demon #2 inside the CEO office); Rob's X positions are notes (Q2).
8. **Secretary and CEO desks off the axis** (east and west respectively) so the axis strip is prop-free; the CEO's chair stays on the window side as drawn.
9. **Window authored against `exterior`**, no backdrop volume in Gate 1.
10. **Duct 520** (face to face) rather than the 500 default so both rooms stay on the module (Q11).
11. **Elevator doors 200 wide**, collapse 200 deep in a 480 stub, dwell rect 600 wide.

## 9. Open questions for Rob (Gate 1 review)

1. Office #2's door is on the corridor (x 780-900, 4 m west of the junction) rather than on the passage wall as drawn, so Demon #1 has a straight east retreat. Fallback: `door_office2_to_corridor` -> wall `east` onto `corridor_south` at y ~1950 with the spawn at the passage mouth (the fight then moves into the passage and the alcove stops being the dodge pocket).
2. Demon #1 is drawn INSIDE Office #2 and Demon #2 in the reception half. The plan puts them where the spec says (corridor near Office #2; inside the CEO office). Do you want the drawn positions (lurk inside and burst out; ambush at the reception entrance) instead?
3. The "Vanity" arrow lands in the men's room's SE corner; the schema reading put it in the (locked, never seen) women's room. Which?
4. The women's room is read as a 5.8 m band under the corridor out to the break-room wall line. If it is really only Office #1's width, it shrinks to 480 x 430 and its door moves west.
5. Supply closet 4.3 x 4.3 m at a 310 ceiling (drawn much larger, but only to fit the two figures?). Option: 280 ceiling for a tighter janitor's closet.
6. The break room exits through a 120 door; the sketch runs the corridor straight into the room. OK?
7. Secretary desk moved east of the axis (drawn on the centreline) to keep the head-on approach to the CEO door clear.
8. Dead CEO lies in the lounge pocket against the east wall just south of Demon #2's idle spot (found together with the demon, hidden from the doorway); the sketch has him west of the CEO desk, but the built desk stands against the west wall with a 20 cm gap, so the drawn position needs the desk moved east first.
9. Money shot: 76 % of the horizontal FOV from the door at 10.8 m depth. One module shallower gives 85 % (table in section 6). Too dominant, or the right amount?
10. Elevator as an open alcove north of the junction with 200-wide doors, versus doors flush on the corridor wall as drawn. Alternative: lobby rect (500, 950) 480 x 480 matches the sketch (elevator between the passage and the collapse) and fills the solid void north of the corridor's west leg, but Demon #1 then has no north strafe from (1240, 1590) (the corridor's north wall at y 1450 is 140 cm away, below the 200 minimum), so the fight would have to move.
11. Duct 520 instead of the 500 default (keeps both rooms on the module).
12. Every room can move one 50 cm module in either direction without breaking the grid; the feel gym decides.

## 10. Judge must-fix items applied

| item | resolution |
|---|---|
| Reception passage 480 outside 250-320 / id escaped the corridor check | passage is `corridor_south`, 280 x 930; `Tools/validate_floorplan.mjs` now also applies the corridor rules to any transit helper room on the critical path between `corridor_main` and `reception`, or any transit helper room with a dimension <= 320 (candidate B now FAILS on it, as intended) |
| demon_1 not in a corridor room / WARN | demon_1 lives in `corridor_main` at the junction; Office #2's door is on the corridor (C's staging) |
| cp_ceo_entry in reception / WARN | moved inside `ceo_office` to (1100, 3600) |
| Break room 480 x 780 bar vs drawn near-square | 980 x 780 with A's counter / fridge / table footprints |
| Supply closet generous | 430 x 430 (one module dropped); 280 ceiling recorded as Q5 |
| exterior_city backdrop volume visible through the glass, 13th figure | removed; window authored against `exterior`; nothing is built beyond the glass |
| door_office2 20 cm jamb pier | every door jamb margin >= 60; only the two 20 x 20 window-return corners plus two 20 x 20 passage-mouth corner cells remain (generator corner-ownership artefact, see below) |
| Solid voids under the corridor west of the passage | office_2 sits directly under the corridor (y 1750-2680) against the passage; the only solid mass inside the footprint is the strip north of the corridor west of the alcove (x 500-980, y 950-1430), deliberate, dressed by note |
| Elevator lobby top edge not collinear | lobby y 950-1430 = men's and break-room tops |
| Grafts | C: axis strip prop-free + door-slot teaser numbers, corridor fight with east retreat, prop footprints, collapse 200 in a 480 stub; A: drawn X positions as notes, six open questions carried, 600-wide dwell rect, 200-wide elevator doors, women's band, vanity reading, break-room proportions; B: 50 cm module everywhere, 3-ray occlusion proof kept as a documented check |

Validation state at hand-off: `node Tools/validate_floorplan.mjs Data/floorplan.json` -> PASS, 0 warnings. `build_greybox.py --dry-run` -> 249 actors, no warnings, deterministic (SHA256 identical across two runs; the value is whatever `Tools/test_dry_run.ps1` prints at commit time, since the plan-review fixes of 2026-09-06 moved two reference figures, one checkpoint and the Demon #2 trigger/approach without changing the actor count). `check_manifest.mjs` -> 0 overlaps among 154 collision boxes, money shot 68.3 deg = 76 % PASS. Known cosmetic artefact: `Wall_corridor_south_south_01/02` are 20 x 20 corner cells at the passage mouth (x 1080-1100 and 1380-1400, y 2680-2700) that the generator splits from the passage walls because N/S walls own corners; geometry is continuous, no gap, no overlap.

## 11. Feedback loop

Change this JSON, run `Tools/test_dry_run.ps1`, then `Tools/ue/run_editor_script.ps1 -Script build_greybox.py`.

`test_dry_run.ps1` runs the generator twice (determinism), `check_manifest.mjs` (overlaps, boundary, money shot), `validate_floorplan.mjs` (schema, adjacency, lanes) and the feel-gym build, all without the engine; the editor script then regenerates `/Game/Maps/L_ExecutiveFloor`. Typical one-number edits: a room one module bigger or smaller (`w`/`h` +/- 50, keep the origin on 50 and re-centre the openings on the shared extent), the CEO office depth for the framing table above, a door slid along its wall, an encounter lane length.
