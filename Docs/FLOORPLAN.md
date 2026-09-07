# HELLFALL law-firm floor - Gate 1 floor plan (lead design, 2026-09-06)

**Data:** `Data/floorplan.json` (schema `Docs/FLOORPLAN-SCHEMA.md`, metrics `Data/metrics.json`, player body `Data/movement.json`). The JSON is **generated** by `Docs/candidates/legal_lead.build.mjs` (the most compact description of the design: room table, openings, duct, blockers, markers, checkpoints, encounters, scenes, money shot, critical path); `Data/candidates/legal_lead.json` is its byte-identical output.
**Drawing:** `SourceAssets/reference/game_layout.jpg` (the spec's fixed adjacency only; the drawing is no longer the footprint). **Generated map:** `/Game/Maps/L_ExecutiveFloor` via `Tools/ue/build_greybox.py`.
**Previous plan:** the 12-room gate-0 executive floor is preserved as `Data/candidates/floorplan_gate0.json` (section 10 says what changed and why).

Rob reviewed the gate-0 greybox and asked for one full floor of a mid-size law firm: compact, laid out as a light maze with loops, spurs and dead ends, with staging slots for monsters and scenes, about 10 minutes to explore, everything enclosed, subtle surface texture. This plan answers that with a **ring corridor around a service core**: the north corridor pair (`corridor_north_w` + `corridor_main`) along the top, the east corridor down the right, the 44.8 m south corridor along the bottom and the west lobby + west gallery closing the ring on the left. Offices, partner offices, the library and the break room hang off the outside of the ring; restrooms, stair, IT, janitor, copy and file rooms sit inside it as the core; the paralegal bullpen cuts through the core as a shortcut between the two long corridors. Two 14.3 m spurs drop south off the south corridor to the boardroom, conference room and the partner offices on the window wall; a collapsed spur hangs off the west gallery; the elevator alcove hangs off the east corridor. The spec's fixed adjacency is the spine through all of it: supply closet (duct only) -> break room -> north corridor -> west lobby (Demon #1) -> west gallery -> south corridor -> reception -> managing partner's office (window wall opposite the door, dividing wall screening Demon #2). Eleven staging slots reserve monster, ambush, scene, pickup and reveal beats.

Plan space: `x` right, `y` down toward the window wall; all values cm; rects are interior clear dimensions; shared walls are exactly 20 cm. Unreal: `UE.X = plan.y`, `UE.Y = -plan.x`; facing the window is +X.

Validation state at hand-off (2026-09-06): `node Tools/validate_floorplan.mjs Data/floorplan.json` ->

```
INFO transit room "west_lobby" (980x580) on the corridor->reception leg is a lobby, not a corridor: room rules apply
INFO transit room "gallery_west" (480x980) on the corridor->reception leg is a lobby, not a corridor: room rules apply
WARN encounter "demon_2": straight line spawn -> player_approach is blocked at (3357, 4407) (Gate 2 checks pathing properly)
PASS Data\floorplan.json: 37 rooms, 38 openings, 1 duct(s), 2 blockers, 56 markers, 4 checkpoints, 2 encounters, 11 scenes; plan bounds incl. walls -20..5500 x -20..4800 cm; critical path supply_closet -> break_room -> corridor_main -> corridor_north_w -> west_lobby -> gallery_west -> corridor_south -> reception -> ceo_office; exploration ~10.8 min (7 corridors 123 m x2 + 28 rooms 409 m at 400 cm/s + 12 s look-around per room, x1.3 pacing); critical path walk ~103 m over 8 leg(s), 3 junction(s) (corridor_main, corridor_north_w, corridor_south); 1 warning(s)
```

The two INFO lines are by design (the lobby and the gallery are wider than a corridor so they can be fight pockets and wayfinding moments; the validator holds them to room rules). The one WARN is the point of the dividing wall: Demon #2's straight line to the player is blocked because it is hidden (section 5). Dry run (`build_greybox.py --dry-run` + `check_manifest.mjs`): **590 actors (59 fill lights on the <= 800 cm grid, section 12), 316 collision boxes, 0 overlaps, enclosure PASS (37 floor slabs, 37 with a ceiling, 148 sides probed), money shot 86.3 deg of 90 = 96 % PASS** from the CEO doorway.

## 1. Rooms and program

Grid rule (unchanged from gate 0): every room origin is on the 50 cm grid and every interior dimension is `50k - 20` (280, 430, 480, 580, 630, 780, 980, 1380, 1430, 1480, 1580, 1980, 4480). Footprint including outer walls: **x -20..5500, y -20..4800 = 55.2 m x 48.2 m**; interior floor area 1771.7 m2 summed over the 37 rects, 1725.6 m2 enterable once the two sealed rooms (women's 23.0, stairwell 23.0) are taken out. 37 rooms = 7 `corridor_*` rects + 2 lobbies (`west_lobby`, `gallery_west`) + 28 rooms; by role 1 start, 9 transit, 20 optional, 4 dead-end, 1 goal, 2 sealed; by finish 27 carpet, 4 tile, 6 concrete.

| id | label | rect (x, y) | interior w x d x ceiling | floor | role | what it is for |
|---|---|---|---|---|---|---|
| `supply_closet` | Supply Closet | (5000, 0) | 430 x 430 x 310 | concrete | start | player start (5210, 150) facing the duct mouth 280 cm ahead; racks on the east wall, seated man + intern (Gate 2) |
| `office_2` | Office #2 (associate) | (500, 950) | 480 x 480 x 310 | carpet | optional | the spec's Office #2: its dark door on the lobby's north wall is where Demon #1 comes out |
| `office_1` | Office #1 (associate) | (1000, 950) | 480 x 480 x 310 | carpet | optional | the spec's Office #1, next door, also onto the lobby |
| `west_lobby` | West Lobby | (500, 1450) | 980 x 580 x 310 | carpet | transit | the north corridor arrives here; 5 openings (2 offices, men's, corridor, gallery); Demon #1 arena |
| `partner_1` | Partner Office 1 | (1500, 950) | 480 x 780 x 310 | carpet | optional | deep partner office on the north corridor |
| `partner_2` | Partner Office 2 | (2000, 950) | 480 x 780 x 310 | carpet | optional | deep partner office on the north corridor |
| `library` | Law Library | (2500, 950) | 980 x 780 x 330 | carpet | optional | six book stacks, reading table; monster slot `sc_library_lurker`; the one 330 ceiling |
| `assoc_3` | Associate Office 3 | (3500, 950) | 480 x 780 x 310 | carpet | optional | associate office on the main corridor |
| `assoc_4` | Associate Office 4 | (4000, 950) | 480 x 780 x 310 | carpet | optional | associate office on the main corridor, next to the break room |
| `break_room` | Break Room / Kitchenette | (4500, 950) | 980 x 780 x 310 | tile | transit | duct exit at x 5160-5260 on the north wall; kitchenette on the east wall; drag-trail reveal; `cp_break_room` |
| `corridor_north_w` | North Corridor (west) | (1500, 1750) | 1480 x 280 x 310 | carpet | transit | 14.8 m west half of the north corridor: 6 doors alternating sides, ends in the lobby; Demon #1 trigger at its west end |
| `corridor_main` | North Corridor (east) - main | (3000, 1750) | 1980 x 280 x 310 | carpet | transit | 19.8 m east half: break-room door, dead guard + shotgun, bullpen opening, turn into the east corridor; `cp_corridor_post_pickup` |
| `gallery_west` | West Gallery | (500, 2050) | 480 x 980 x 310 | carpet | transit | 4.8 m wide gallery closing the ring on the west; the collapsed spur opens off it, storage door |
| `mens_restroom` | Men's Restroom | (1000, 2050) | 480 x 480 x 280 | tile | optional | off the lobby's south wall (wet-room ceiling 280) |
| `womens_restroom` | Women's Restroom (locked) | (1000, 2550) | 480 x 480 x 280 | tile | sealed | locked door on the south corridor; interior exists for depth, never entered |
| `elevator_lobby` | Elevator Lobby | (5000, 2050) | 480 x 480 x 310 | tile | dead_end | alcove off the east corridor; shut elevator doors 200 wide on its exterior east wall |
| `stairwell` | Stairwell (locked) | (1500, 2550) | 480 x 480 x 310 | concrete | sealed | locked fire stair on the south corridor (emergency light behind the slit, Gate 3) |
| `it_server` | Server / IT Closet | (2000, 2050) | 480 x 480 x 310 | concrete | optional | racks with LEDs on, UPS hum; pickup slot `sc_server_pickup`; the only lit core room |
| `janitor` | Janitor Closet | (2000, 2550) | 480 x 480 x 310 | concrete | optional | closet off the south corridor |
| `copy_mail` | Copy / Mail Room | (2500, 2050) | 780 x 480 x 310 | carpet | optional | copiers on the north wall, sorting counter south |
| `file_room` | Records / File Room | (2500, 2550) | 780 x 480 x 310 | concrete | optional | four rolling shelving stacks; ambush slot `sc_files_ambush` |
| `bullpen` | Paralegal Bullpen | (3300, 2050) | 1380 x 980 x 310 | carpet | transit | open-plan bullpen with three desk islands; 280 openings north and south = the shortcut through the core; tableau `sc_bullpen_massacre` |
| `corridor_east` | East Corridor | (4700, 2050) | 280 x 980 x 310 | carpet | transit | 9.8 m east leg of the ring; elevator alcove and `assoc_2` off its east wall |
| `assoc_1` | Associate Office 1 | (1500, 2050) | 480 x 480 x 310 | carpet | optional | core-side office under the north corridor |
| `assoc_2` | Associate Office 2 | (5000, 2550) | 480 x 480 x 310 | carpet | optional | office off the east corridor, under the elevator alcove |
| `corridor_blocked` | Collapsed Corridor | (0, 2050) | 480 x 280 x 310 | carpet | dead_end | the spec's collapsed hallway: 280 cm walkable stub, then 200 cm of rubble to the ceiling |
| `storage_west` | Storage | (0, 2550) | 480 x 480 x 310 | concrete | optional | storage off the gallery's west wall, under the collapse |
| `corridor_south` | South Corridor | (500, 3050) | 4480 x 280 x 310 | carpet | transit | 44.8 m spine along the bottom: 2 locked + 2 doors north, both spurs, reception and bullpen openings, east corridor at the far end |
| `boardroom` | Boardroom | (500, 3350) | 1580 x 630 x 310 | carpet | optional | 14-seat table, interrupted-meeting scene `sc_boardroom`; the only way into `partner_4` |
| `corridor_sw` | South-West Spur | (2100, 3350) | 280 x 1430 x 310 | carpet | dead_end | 14.3 m spur: boardroom and `partner_3` doors, monster slot `sc_spur_sw` at the dead end |
| `reception` | Reception | (2400, 3350) | 1480 x 630 x 310 | carpet | transit | antechamber to the CEO office; desk on the axis facing the corridor opening; firelight reveal `sc_reception_glow` |
| `corridor_se` | South-East Spur | (3900, 3350) | 280 x 1430 x 310 | carpet | dead_end | 14.3 m spur: conference room and `partner_5` doors |
| `conference_small` | Conference Room | (4200, 3350) | 780 x 630 x 310 | carpet | optional | 8-seat table, whiteboard of case notes |
| `partner_4` | Partner Office 4 | (500, 4000) | 780 x 780 x 310 | carpet | optional | SW corner partner office, entered only through the boardroom (room-through-room dead end) |
| `partner_3` | Partner Office 3 | (1300, 4000) | 780 x 780 x 310 | carpet | optional | window-wall partner office off the SW spur; its lit door is the bait for `sc_spur_sw` |
| `ceo_office` | Managing Partner's Office | (2400, 4000) | 1480 x 780 x 310 | carpet | goal | the money shot: 1480 window on the south wall opposite the door; dividing wall x 3300-3880 at y 4400 screens Demon #2; dwell rect on the glass |
| `partner_5` | Partner Office 5 | (4200, 4000) | 780 x 780 x 310 | carpet | optional | SE corner office at the end of the SE spur; monster slot `sc_partner_5`; second exterior window is a Gate 3 note only (Q4) |

Wall lines are collinear by column and row. Columns (20 cm walls): x 480-500, 980-1000, 1280-1300, 1480-1500, 1980-2000, 2080-2100, 2380-2400, 2480-2500, 2980-3000, 3280-3300, 3480-3500, 3880-3900, 3980-4000, 4180-4200, 4480-4500, 4680-4700, 4980-5000, 5430-5450 (closet only), 5480-5500. Rows: y -20-0, 430-450 (closet), 930-950, 1430-1450, 1730-1750, 2030-2050, 2530-2550, 3030-3050, 3330-3350, 3980-4000, 4780-4800 (glass). Inside the ring the core is packed solid (no voids between men's / associate 1 / IT / copy on the top row and women's / stair / janitor / files on the bottom row, then the bullpen and the east corridor). The empty regions of the bounding box are all outside the building envelope, not hidden solids: the band north of y 930 apart from the closet and the duct, the notch x 0-480 west of Office #2 and the lobby (y 950-2030), a 180 cm slot x 0-480, y 2350-2530 between the collapsed stub and the storage room, the SW corner x 0-480 below storage (y 3050-4800) and the SE corner x 5000-5480 below the east corridor (y 3050-4800).

## 2. Corridor graph

**Nodes.** Ring: `corridor_main` (NE), `corridor_east` (E), `corridor_south` (S), `gallery_west` + `west_lobby` (W), `corridor_north_w` (NW). Chord: `bullpen` (280 openings north and south). Spurs / dead ends: `corridor_sw`, `corridor_se` (south, 14.3 m each), `corridor_blocked` (west, collapse), `elevator_lobby` (east, shut doors). Antechamber: `reception` (open onto the south corridor, door into the CEO office). Everything else is a leaf room on one door.

**Links.** 38 openings = 22 doors + 13 opens + 2 locked doors + 1 window, plus the duct. Passable graph (door + open + duct): V = 37, E = 36, 3 components (the plan plus the two sealed rooms, which only have locked doors) -> **2 independent cycles**: (a) the ring `corridor_main -> corridor_east -> corridor_south -> gallery_west -> west_lobby -> corridor_north_w -> corridor_main`, all six links `open`, about 108 m of centreline; (b) the bullpen chord `corridor_main -> bullpen -> corridor_south`, which splits the ring into an east loop (about 43 m: main east end, east corridor, south corridor east end, bullpen) and a west loop (about 91 m). Node degrees: `corridor_north_w` 8, `corridor_south` 8, `corridor_main` 6, `west_lobby` 5, `corridor_east` 4, `gallery_west` 4, `corridor_sw` 3, `corridor_se` 3, `boardroom` 2, `bullpen` 2, `reception` 2, `break_room` 2; the other 19 optional rooms are leaves on one door (`partner_4` among them, hanging off the boardroom rather than a corridor), as are `supply_closet` (duct), `elevator_lobby`, `corridor_blocked` and `ceo_office`.

**Dead ends** (role `dead_end`): `corridor_blocked` (280 walkable then rubble, seen end-on from the gallery), `elevator_lobby` (4.8 x 4.8 alcove, shut doors), `corridor_sw` (boardroom + partner_3 doors, monster slot at the end), `corridor_se` (conference + partner_5 doors). Locked: `womens_restroom` and `stairwell`, both on the south corridor's north wall at x 1240 and 1740 (LOCKED labels), so the corridor's west end reads as a run of shut doors.

**Junctions.** The validator counts a junction as a corridor rect on the critical path with >= 3 passable connections: `corridor_main`, `corridor_north_w`, `corridor_south`. The two lobbies are junctions too (5 and 4 openings) but are wider than a corridor by design, so the validator reports them as lobbies (INFO lines) and not as corridor junctions.

**Decision points along the critical path** (what the player sees, in order):

1. `corridor_main`, stepping out of the break-room door at x 4740: the dead guard and the shotgun to the left, the east corridor's opening 100 cm to the east (x 4700-4980), the long corridor west with two associate doors (4240, 3740) and, 7.5 m along, the bullpen's wide opening on the south side (x 3850-4130, the massacre tableau visible through it).
2. `corridor_north_w` (through the full-width cased opening at x 2980-3000): six doors, one every 5 m and alternating sides - library 2740 N, copy/mail 2890 S, partner 2 2240 N, IT 2240 S, partner 1 1740 N, associate 1 1740 S - then the corridor widens into the lobby.
3. `west_lobby`: Office #1 and Office #2 doors on the north wall (1240, 740), men's door on the south wall (1240), the gallery's full-width opening south (x 500-980). Demon #1 comes out of Office #2's door.
4. `gallery_west`: the collapsed stub straight ahead on the west wall (x 480-500, y 2050-2330, rubble visible), the storage door (y 2790), the south corridor's full-width opening.
5. `corridor_south`, entering at its west end: locked women's and stair doors (1240, 1740), janitor (2240), files (2890) on the north wall; the SW spur south (x 2100-2380); the reception opening (x 2900-3380) with the firelight; beyond it the bullpen opening north (x 3850-4130), the SE spur (x 3900-4180) and the east corridor at the far end.
6. `reception`: one door, on the axis, glowing.

**The bullpen shortcut.** `open_bullpen_to_corridor_main` and `open_bullpen_to_corridor_south` are both 280 wide at x 3990, so the bullpen is a 9.8 m straight cut between the two long corridors with the middle desk island (x 3810-4170, y 2420-2660, Gate 2) in the line, forcing a sidestep. Measured with the validator's centre-to-opening metric, the shortest route supply closet -> CEO office is **63.0 m through the bullpen** and 78.6 m around the east corridor, against **103.1 m on the declared critical path** through the lobby. The declared path is the long way round on purpose (it carries Demon #1 and the gallery/collapse read), but nothing in the geometry forces it: a player who turns east at the break-room door, or cuts through the bullpen, reaches reception without meeting Demon #1. The junction ambush `sc_junction_ambush` sits at the bullpen's south opening to punish exactly those two routes. Whether the west route must be enforced (blocker or locked door on the chord / east leg) is Q2 for Rob.

**Sightline breaks.** The ring turns 90 deg at the NE corner (main -> east) and the SE corner (east -> south); on the west it changes width instead of direction (280 corridor -> 980 lobby -> 480 gallery -> 280 corridor). The two long straights are the risk: the north pair is collinear and joined by a full-width opening, so it reads as one 34.8 m straight corridor (x 1500-4980), and the south corridor is a 44.8 m straight; the doors every 2.5-5 m, the openings and the lit door slots articulate them, but there is no jog anywhere on the ring (Q3). The spurs are 14.3 m straights ending in a wall (the monster slot at the SW end is what the player is looking at). The collapsed stub is a 4.8 m view from the gallery.

## 3. Critical path and pacing

`supply_closet -> (duct) -> break_room -> corridor_main -> corridor_north_w -> west_lobby -> gallery_west -> corridor_south -> reception -> ceo_office` - 9 rooms, 8 legs.

Per-leg lengths use the validator's metric (`Tools/validate_floorplan.mjs` section 12): room-rect centre -> centre of the connecting opening's wall footprint -> next room-rect centre; the duct leg goes centre -> mouth centre -> mouth centre -> centre. Walk speed 400 cm/s, crawl 130 cm/s (`Data/movement.json`).

| leg | via | from -> opening -> to | cm | s |
|---|---|---|---|---|
| 1 | duct mouths (5210, 440) and (5210, 940) | closet centre (5215, 215) -> break room centre (4990, 1340) | 225 + 500 + 457 = **1182** | 3.0 walked; 4.0 for the 520 cm crawl at 130 -> about 5.7 real |
| 2 | `door_break_room_to_corridor_main` (4740, 1740) | (4990, 1340) -> (3990, 1890) | 472 + 765 = **1237** | 3.1 |
| 3 | `open_corridor_north_w_to_corridor_main` (2990, 1890) | (3990, 1890) -> (2240, 1890) | 1000 + 750 = **1750** | 4.4 |
| 4 | `open_west_lobby_to_corridor_north_w` (1490, 1890) | (2240, 1890) -> (990, 1740) | 750 + 522 = **1272** | 3.2 |
| 5 | `open_west_lobby_to_gallery_west` (740, 2040) | (990, 1740) -> (740, 2540) | 391 + 500 = **891** | 2.2 |
| 6 | `open_gallery_west_to_corridor_south` (740, 3040) | (740, 2540) -> (2740, 3190) | 500 + 2006 = **2506** | 6.3 |
| 7 | `open_reception_to_corridor_south` (3140, 3340) | (2740, 3190) -> (3140, 3665) | 427 + 325 = **752** | 1.9 |
| 8 | `door_reception_to_ceo_office` (3140, 3990) | (3140, 3665) -> (3140, 4390) | 325 + 400 = **725** | 1.8 |
| | | **total** | **10313 = 103.1 m** | **25.8 s** straight through at walk speed (about 28.5 s with the duct crawled) |

Leg 6 is the long one because the validator routes through rect centres and the south corridor's centre is 20 m east of the gallery; the real walk from the gallery mouth to the reception opening along the corridor centreline is 24 m (x 740 -> 3140 at y 3190), i.e. about the same. The straight-through run is under half a minute; the ten minutes come from the loops, the spurs and the 28 rooms off the ring.

**The ten-minute argument** (`Data/metrics.json` `exploration_model`, evaluated by the validator; WARN outside 8-12 min, never a FAIL - Rob's walk is the referee):

```
minutes = ( sum(corridor longer axes) x corridor_passes / walk
          + sum over enterable non-corridor rooms of (room_span_factor x shorter axis + room_overhead_cm) / walk
          + look_seconds_per_room x rooms ) / 60 x pacing_factor
```

- Corridors (7 `corridor_*` rects): 1480 + 1980 + 980 + 480 + 4480 + 1430 + 1430 = **12 260 cm = 123 m**, walked twice (out and back along loops and spurs) = 24 520 cm.
- Rooms (28 enterable non-corridor rects, the two lobbies included, the two sealed rooms excluded): sum of (2 x shorter axis + 300) = **40 880 cm = 409 m** - a room is entered, crossed to its far side and left again, plus 3 m of door approach.
- Walking: 65 400 cm / 400 cm/s = 163.5 s. Looking: 12 s x 28 rooms = 336 s (stop at the door, read the room and its labels at a horror pace). Sum 499.5 s = 8.32 min; x 1.3 pacing (backtracking through the loops and dead ends) = **10.82 min**, inside the 8-12 window and on Rob's "about 10".
- Sensitivity: each extra 480 x 480 room adds (960 + 300) / 400 + 12 = 15.2 s x 1.3 = 0.33 min; each 10 m of corridor adds 2 x 1000 / 400 x 1.3 / 60 = 0.11 min; dropping the pacing factor gives 8.3 min. Two fights and eleven staged beats sit on top of the model.

## 4. Openings

`wall` is the wall of the first room; `centre` is the absolute plan coordinate along that wall (x for N/S walls, y for E/W walls); the wall-line range says which 20 cm slab is cut. Doors are 120 x 220, cased openings full height (290 under a 310 ceiling), the window 1480 x 260 (sill 40, head 300). Every door jamb margin is >= 60 cm (the tightest: `door_partner_4_to_boardroom` at x 830-950 against the corner at 500 leaves 330; `door_storage_west_to_gallery_west` at y 2730-2850 leaves 180 to storage's south wall), so the generator emits no jamb pier shorter than 40 cm.

| id | from -> to | type | wall | centre | size |
|---|---|---|---|---|---|
| `door_office_2_to_west_lobby` | office_2 -> west_lobby | door | south | x 740 (y 1430-1450) | 120 x 220 |
| `door_office_1_to_west_lobby` | office_1 -> west_lobby | door | south | x 1240 (y 1430-1450) | 120 x 220 |
| `door_partner_1_to_corridor_north_w` | partner_1 -> corridor_north_w | door | south | x 1740 (y 1730-1750) | 120 x 220 |
| `door_partner_2_to_corridor_north_w` | partner_2 -> corridor_north_w | door | south | x 2240 (y 1730-1750) | 120 x 220 |
| `door_library_to_corridor_north_w` | library -> corridor_north_w | door | south | x 2740 (y 1730-1750) | 120 x 220 |
| `door_assoc_3_to_corridor_main` | assoc_3 -> corridor_main | door | south | x 3740 (y 1730-1750) | 120 x 220 |
| `door_assoc_4_to_corridor_main` | assoc_4 -> corridor_main | door | south | x 4240 (y 1730-1750) | 120 x 220 |
| `door_break_room_to_corridor_main` | break_room -> corridor_main | door | south | x 4740 (y 1730-1750) | 120 x 220 |
| `open_west_lobby_to_corridor_north_w` | west_lobby -> corridor_north_w | open | east | y 1890 (x 1480-1500) | 280 x 290 |
| `open_corridor_north_w_to_corridor_main` | corridor_north_w -> corridor_main | open | east | y 1890 (x 2980-3000) | 280 x 290 |
| `open_corridor_main_to_corridor_east` | corridor_main -> corridor_east | open | south | x 4840 (y 2030-2050) | 280 x 290 |
| `open_corridor_east_to_corridor_south` | corridor_east -> corridor_south | open | south | x 4840 (y 3030-3050) | 280 x 290 |
| `open_west_lobby_to_gallery_west` | west_lobby -> gallery_west | open | south | x 740 (y 2030-2050) | 480 x 290 |
| `open_gallery_west_to_corridor_south` | gallery_west -> corridor_south | open | south | x 740 (y 3030-3050) | 480 x 290 |
| `open_gallery_west_to_corridor_blocked` | gallery_west -> corridor_blocked | open | west | y 2190 (x 480-500) | 280 x 290 |
| `door_mens_restroom_to_west_lobby` | mens_restroom -> west_lobby | door | north | x 1240 (y 2030-2050) | 120 x 220 |
| `locked_door_womens_restroom_to_corridor_south` | womens_restroom -> corridor_south | locked_door | south | x 1240 (y 3030-3050) | 120 x 220 |
| `open_elevator_lobby_to_corridor_east` | elevator_lobby -> corridor_east | open | west | y 2290 (x 4980-5000) | 480 x 290 |
| `locked_door_stairwell_to_corridor_south` | stairwell -> corridor_south | locked_door | south | x 1740 (y 3030-3050) | 120 x 220 |
| `door_it_server_to_corridor_north_w` | it_server -> corridor_north_w | door | north | x 2240 (y 2030-2050) | 120 x 220 |
| `door_janitor_to_corridor_south` | janitor -> corridor_south | door | south | x 2240 (y 3030-3050) | 120 x 220 |
| `door_copy_mail_to_corridor_north_w` | copy_mail -> corridor_north_w | door | north | x 2890 (y 2030-2050) | 120 x 220 |
| `door_file_room_to_corridor_south` | file_room -> corridor_south | door | south | x 2890 (y 3030-3050) | 120 x 220 |
| `open_bullpen_to_corridor_main` | bullpen -> corridor_main | open | north | x 3990 (y 2030-2050) | 280 x 290 |
| `open_bullpen_to_corridor_south` | bullpen -> corridor_south | open | south | x 3990 (y 3030-3050) | 280 x 290 |
| `door_assoc_1_to_corridor_north_w` | assoc_1 -> corridor_north_w | door | north | x 1740 (y 2030-2050) | 120 x 220 |
| `door_assoc_2_to_corridor_east` | assoc_2 -> corridor_east | door | west | y 2790 (x 4980-5000) | 120 x 220 |
| `door_storage_west_to_gallery_west` | storage_west -> gallery_west | door | east | y 2790 (x 480-500) | 120 x 220 |
| `open_corridor_sw_to_corridor_south` | corridor_sw -> corridor_south | open | north | x 2240 (y 3330-3350) | 280 x 290 |
| `open_corridor_se_to_corridor_south` | corridor_se -> corridor_south | open | north | x 4040 (y 3330-3350) | 280 x 290 |
| `open_reception_to_corridor_south` | reception -> corridor_south | open | north | x 3140 (y 3330-3350) | 480 x 290 |
| `door_boardroom_to_corridor_sw` | boardroom -> corridor_sw | door | east | y 3660 (x 2080-2100) | 120 x 220 |
| `door_conference_small_to_corridor_se` | conference_small -> corridor_se | door | west | y 3660 (x 4180-4200) | 120 x 220 |
| `door_partner_4_to_boardroom` | partner_4 -> boardroom | door | north | x 890 (y 3980-4000) | 120 x 220 |
| `door_partner_3_to_corridor_sw` | partner_3 -> corridor_sw | door | east | y 4390 (x 2080-2100) | 120 x 220 |
| `door_partner_5_to_corridor_se` | partner_5 -> corridor_se | door | west | y 4390 (x 4180-4200) | 120 x 220 |
| `door_reception_to_ceo_office` | reception -> ceo_office | door | south | x 3140 (y 3980-4000) | 120 x 220 |
| `window_ceo_city` | ceo_office -> exterior | window | south | x 3140 (y 4780-4800) | 1480 x 260 (sill 40, head 300) |

Patterns worth knowing when editing: the north-row doors are all at `x = room origin + 240` (centred on their 480 rooms; the library's at 2740 is centred on its west half); the core doors pair up across the core so the corridor rhythm repeats (IT 2240 N / janitor 2240 S, copy 2890 N / files 2890 S, assoc 1 1740 N / stair 1740 S, men's 1240 N / women's 1240 S); the spur doors mirror each other (boardroom / conference at y 3660, partner 3 / partner 5 at y 4390); the design axis is **x = 3140**: reception opening, CEO door, window centre, dwell rect, Demon #2 approach and `cp_ceo_entry` all sit on it. The window is authored against `exterior` (nothing is built beyond the glass; the Gate 2 backdrop plane goes >= 300 cm behind it). The second window Rob asked about (`partner_5`) is a note, not an opening (Q4).

## 5. Duct, blockers, checkpoints, encounters

**Duct** `duct_supply_to_break`: axis y, centre line x = 5210, from the closet's south wall face (y 430) to the break room's north wall face (y 950); `length_cm` 520 = face to face including both 20 cm walls (the manifest's tube runs y 450-930 between the wall slabs with a mouth through each). Interior 100 x 95 at floor level, 6 cm lips: crawl only (95 is above the 64 crawl height and below the 116 crouch height). Closet mouth at x 5160-5260 (160 cm from the closet's west wall, 170 from the racks on the east wall); break-room mouth at x 5160-5260, i.e. 660 cm across the 980 room, next to the kitchenette run on the east wall - the player crawls out beside the counter and the round table (4950, 1340) is ahead-left, the corridor door (x 4680-4800) diagonally across the room.

**Blockers.** `collapse` in `corridor_blocked`: rubble wedge 200 deep, floor to ceiling, at the far (west) end x 0-200, leaving a 280 cm walkable stub past the gallery opening so it reads as a collapse and not a flush wall (3 collapse boxes in the manifest, whitelisted for the overlap check). `elevator` in `elevator_lobby`: shut doors 200 x 220 flush in the alcove's **east** (exterior) wall, centred y 2290, labelled; the alcove is a 480-wide cased opening off the east corridor, so the doors are seen end-on from the corridor.

**Markers.** `player_start` (5210, 150) yaw 90 (facing down the plan, straight at the duct mouth 280 cm away). One 180 cm reference figure per room (37) at a corner offset from `REF_OFFSET` in the build script (default 80/80 from the room origin; explicit offsets keep the corridor and lobby figures out of opening mouths, scene rects and Demon #2's trigger strip - `west_lobby` + (880, 100) = (1380, 1550), `corridor_sw` + (140, 100) = (2240, 3450), `ceo_office` + (100, 300) = (2500, 4300), `corridor_main` + (1880, 140) = (4880, 1890); figures have no collision, so this is about what the screenshots show, not about the walk). 18 `note` markers carry the Gate 2 dressing intent with cm footprints (racks, intern, kitchenette + table, dead guard + shotgun, bullpen islands, file stacks, server racks, copiers, library stacks, boardroom table, reception desk, CEO desk + dead CEO, couch set, elevator doors, collapse, stair, conference table, partner 5 window). The ones that touch the lanes: the guard lies along `corridor_main`'s north wall at x 4300-4480 with the shotgun at (4540, 1820) - dressed 60 deep as in gate 0 he ends at y ~1810 and the 280 corridor keeps 220 clear past him (the note gives no depth; Gate 2 fixes it); the reception desk 240 x 90 at (3140, 3550) sits **on** the axis facing the corridor opening (the player walks round it; at 75 cm it is under the eye line to the CEO door); the CEO desk 180 x 80 at (2900, 4400) and the couch set in the west half in front of the glass are both south of Demon #2's retreat lane (y 4250) and west of the dwell rect.

**Checkpoints** (REQ-G5-005 positions reserved):

| id | room | pos | yaw | note |
|---|---|---|---|---|
| `cp_start` | supply_closet | (5210, 150) | 90 | = player start |
| `cp_break_room` | break_room | (5210, 1100) | 180 | 150 cm inside the duct exit, facing west across the room |
| `cp_corridor_post_pickup` | corridor_main | (4400, 1890) | 180 | corridor centreline, 140 cm west of the shotgun, facing west down the corridor |
| `cp_ceo_entry` | ceo_office | (3140, 4040) | 90 | 40 cm inside the CEO door on the axis, facing the glass; 60 cm north of Demon #2's trigger strip (y 4100-4200), so a respawn here does **not** re-fire the fight (Q9, resolved lead-side 2026-09-06) |

**Encounters** (REQ-G2-003/004 reserved space; the validator walks every lane on a 5 cm step):

| | demon_1 | demon_2 |
|---|---|---|
| room | `west_lobby` (transit lobby adjacent to `office_2`: accepted by the validator's spec check) | `ceo_office` |
| spawn | (740, 1530): 80 cm south of Office #2's door face (y 1450), on the door's axis - it comes out of the dark door | (3650, 4620): the SE pocket behind the dividing wall - 210 cm south of the wall's south face (4410), 160 cm from the glass, 230 cm from the east wall |
| trigger | x 1500-1780, y 1750-2030: the last 280 cm of `corridor_north_w` before the lobby | x 2400-3880, y 4100-4200: full-width strip 100-200 cm inside the door wall (moved from y 4050-4150 so `cp_ceo_entry` at y 4040 sits outside it) |
| player approach | (1240, 1800): inside the lobby, 240 cm west of the corridor opening | (3140, 4250): on the axis, 140 cm north of the wall's north face (4390) |
| retreat | **east 900**: back through the corridor opening (x 1480-1500) to (2140, 1800), 640 cm into the corridor | **west 700**: along y 4250 to (2440, 4250), 40 cm short of the west wall, clear of the desk (y 4360-4440) |
| strafe each side | **200**: north to y 1600 (350 available to the lobby's north wall), south to y 2000 (230 available) | **250**: north to the door wall face (y 4000), south to y 4500 passing 160 cm west of the wall's free end (x 3300) |
| capsule | r 45, h 220 | r 60, h 300 (must exceed demon_1 in both: checked) |
| spawn -> approach | 568 cm of open lobby floor, clear | crosses y 4400 at x 3347, inside the wall's span 3300-3880: **blocked, the expected WARN** - the demon has to come round the free end |

Demon #1 read: the player walks west down the north corridor, the trigger fires in its last 2.8 m, the lobby opens up ahead and the demon steps out of Office #2's door in the far corner (5.7 m away, ahead-right: plan north is the player's right when walking west). Backing east is a straight 9 m run into the corridor they know; the lobby's 580 depth gives the dodge room and the men's door / Office #1 door are the pockets. Demon #2 read: the player enters on axis with the glass filling the view, the strip fires 1-2 m in, and the demon comes from the left (plan +x) round the free end of the dividing wall; the retreat is west along the room with the window on the player's right and nothing between the door and the glass on the axis (REQ-G2-004 AC3).

### Demon #2 occlusion proof (3 rays)

Dividing wall `money_shot.dividing_wall`: along x from 3300 to 3880 (the east wall) at y 4400, full height 310, i.e. the slab y 4390-4410; its free end is at x 3300, 160 cm east of the axis and 400 cm inside the door wall. Viewer points are the door's west jamb (3080, 4000), centre (3140, 4000) and east jamb (3200, 4000) at the room-side face of the door wall. A ray through the free end's NW corner (3300, 4390) still enters the wall body, so the ray that actually clears the wall grazes the SW corner (3300, 4410); both are given, the NW one being the conservative lower bound. Perpendicular distance of the capsule centre (3650, 4620) from the grazing ray, minus the radius 60:

| from | via NW corner (3300, 4390): distance / margin | via SW corner (3300, 4410): distance / margin |
|---|---|---|
| west jamb (3080, 4000) | 192 / **132** | 209 / 149 |
| centre (3140, 4000) | 237 / **177** | 250 / 190 |
| east jamb (3200, 4000) | 282 / **222** | 290 / 230 |

The spawn is hidden from every doorway ray with at least 132 cm to spare (a demon up to about r 190 would still hide from the west jamb). The wedge opens for a player walking in: on the axis the capsule's west edge (3590, 4620) clears the SW corner from **y 4295**, 45 cm past the approach point and 95-195 cm after the trigger strip (y 4100-4200) fires; from the east half (x >= 3590) it stays hidden until the player is south of the wall. Residual risk, as in gate 0: a player who slides west along the door wall inside the 100 cm pre-trigger band (y 4000-4100) sees the idle capsule from x < ~2770, 3.1 m west of the west jamb; if Gate 5 places the demon idle instead of spawning it on the trigger, a second strip along the door wall (x 2400-3000, y 4000-4100) closes it.

## 6. Scenes (staging slots) and rhythm

Eleven `scenes` entries (schema "Scene"; the gate-1 brief reserves >= 8): 3 monster, 2 ambush, 2 scene, 2 pickup, 2 reveal. Each is a floor rect plus a facing (plan yaw: 0 = +x, 90 = +y toward the glass, 180 = -x, 270 = -y); the greybox builds a marker box and a label per slot, nothing else. Gate 2 fills them.

| id | room | kind | rect (x, y) w x h | facing | description |
|---|---|---|---|---|---|
| `sc_break_trail` | break_room | reveal | (4600, 1150) 250 x 150 | 180 | Early reveal: a blood drag trail from the duct exit across the tile to the corridor door; the fridge light flickers. (Rect x 4600-4850, y 1150-1300: 40 cm clear of the round table's footprint, x 4890-5010.) |
| `sc_guard_shotgun` | corridor_main | pickup | (4460, 1780) 200 x 150 | 180 | The dead guard and the shotgun pickup with its green halo, seen the moment the player steps out of the Break Room. |
| `sc_bullpen_massacre` | bullpen | scene | (3800, 2400) 400 x 300 | 90 | Tableau: overturned desk islands, a body under a desk, monitors still on; first seen through the wide north opening. |
| `sc_files_ambush` | file_room | ambush | (2760, 2650) 160 x 200 | 90 | Ambush between the rolling shelving aisles: a demon bursts through a stack as the player reaches the middle aisle. |
| `sc_library_lurker` | library | monster | (3250, 1100) 200 x 200 | 180 | Monster slot at the library dead end behind the last book stack; stalks the reading table. |
| `sc_server_pickup` | it_server | pickup | (2320, 2400) 120 x 120 | 180 | Pickup on the rack shelf (shells / keycard); the only lit room in the core. |
| `sc_boardroom` | boardroom | scene | (1290, 3560) 500 x 200 | 90 | Scene: the interrupted meeting - chairs pushed back, a projector still running, one partner still in his seat. |
| `sc_spur_sw` | corridor_sw | monster | (2160, 4500) 160 x 240 | 270 | Monster slot at the south-west spur dead end; the player is baited down by the lit partner door. |
| `sc_junction_ambush` | corridor_south | ambush | (3850, 3100) 280 x 180 | 0 | Ambush at the bullpen south opening: a hostile pours out as the player passes toward reception. |
| `sc_reception_glow` | reception | reveal | (2900, 3700) 480 x 150 | 90 | Reveal: the first orange firelight spilling through the CEO door onto the reception carpet. |
| `sc_partner_5` | partner_5 | monster | (4500, 4200) 200 x 200 | 270 | Monster slot in the corner partner office at the end of the south-east spur. |

**Intended rhythm along the critical path** (fights in bold, optional beats in brackets):

1. Closet: two seated figures, the duct. Crawl (4 s).
2. Break room: `sc_break_trail` - the trail leads from the mouth to the corridor door, so the room teaches "follow the blood" before anything moves. `cp_break_room`.
3. Corridor east: `sc_guard_shotgun` immediately outside the door (the shotgun 2 m west of the jamb) - pickup, then `cp_corridor_post_pickup`. [7.5 m on, the bullpen opening shows `sc_bullpen_massacre` through the wide gap without requiring entry.]
4. Corridor west: doors alternate for 15 m. [`sc_library_lurker` behind the library door on the right, `sc_server_pickup` behind the IT door on the left: one threat, one reward, both off the path.]
5. **Demon #1** in the lobby, out of Office #2. Retreat east into the known corridor.
6. Gallery: the collapse straight ahead closes the west; the only way on is south.
7. South corridor, west end: four shut doors in 17 m (two LOCKED), [`sc_files_ambush` behind the files door], the SW spur opening on the right with the lit partner door far down it [bait for `sc_spur_sw` at the dead end], then the reception opening with `sc_reception_glow` on its floor.
8. Reception: the desk faces you, the door glows behind it. Door.
9. **Demon #2** out of the pocket behind the dividing wall, retreat west; then the dwell on the glass - the money shot.

`sc_junction_ambush` (bullpen south opening, x 3850-4130) is 7 m **past** the reception opening on the declared route, so on that route it fires only if the player overshoots reception; its real job is to guard the two bypasses (bullpen chord, east leg), both of which arrive at reception from the east and cross it. `sc_partner_5` and `sc_spur_sw` reward / punish the two spurs symmetrically; `sc_boardroom` is the one pure tableau on the west.

## 7. Money-shot framing (REQ-G2-005)

Numbers from `Tools/check_manifest.mjs` (eye at the door centre (3140, 3990) z 166, looking +y, FOV 90 deg horizontal; 16:9 gives 58.7 deg vertical) and the scratch check:

- Door centre -> glass at y 4780: **790 cm** dead ahead, zero yaw offset (door, window and dwell rect all on x = 3140).
- Window 1480 wide subtends **86.3 deg = 96 % of the horizontal FOV**, symmetric (edges at +/-43.1 deg), **1.9 deg of wall framing each side**: the glass runs nearly edge to edge of the screen from the doorway. (Gate 0 was 68.3 deg = 76 % from a 1080-deep room; this room is 780 deep: Q5.)
- Vertical: head +9.6 deg, sill -9.1 deg = 18.7 deg = **32 %** of the vertical FOV.
- Walking in on the axis: 87.0 deg at the door face (y 4000), 108.8 deg at the Demon #2 approach (4250), 125.6 deg at the dividing wall line (4400), 157 deg at the dwell rect's front edge (4630) - the glass fills the whole view before the fight is over.
- Dwell rect 600 x 150 at x 2840-3440, y 4630-4780: flush against the glass, centred on the axis, 210 cm west of the demon's spawn.
- Teaser: the lit 120 cm CEO-door slot subtends 7.2 deg from the reception opening's mouth (3140, 3040), 9.5 m out, showing 220 cm of glass (x 3030-3250) through it; 8.6 deg / 239 cm from the south corridor's centreline (3140, 3190). From the bullpen's south opening (3990, 3040) the slot is oblique and shows the west 143 cm of glass.

**The dividing wall clips the glass from the doorway.** `check_manifest.mjs` measures the window's angular extent only; it does not model the divider. The ray from the door centre past the free end's SW corner (3300, 4410) meets the glass plane at x 3441, so **glass x 3441-3880 (439 cm = 30 %) is behind the wall** from the door centre; the unobstructed glass is 64.0 deg = **71 % of the FOV** (west jamb: 386 cm hidden, 76 %; east jamb: 492 cm hidden, 65 %). Every figure still clears the 60 % gate, and the screened east third is what makes the lounge pocket read as a hidden space, but it is a real difference from gate 0 (whose 430 cm wall hid zero glass). The trade-off if Rob wants more glass from the door (Q6):

| free end at x | glass hidden from the door centre | visible from the door | Demon #2 spawn x needed for a 60 cm hidden margin (west jamb, conservative ray) |
|---|---|---|---|
| **3300 (built)** | **439 cm (30 %)** | **64.0 deg = 71 %** | >= 3568 (built 3650: margin 132) |
| 3400 | 251 cm (17 %) | 74.9 deg = 83 % | >= 3744 (capsule edge 3804, 76 cm off the east wall) |
| 3500 | 63 cm (4 %) | 83.7 deg = 93 % | >= 3924: impossible, the room ends at 3880 - the wall would have to move or the demon give up the pocket |

## 8. ASCII plan (1 character = 1 m both ways; y downward like the photo)

Column k covers x (k-1)..k m and row k covers y (k-1)..k m; each 20 cm wall line takes the character of its own metre, so a 480 room shows 4 interior characters and a 280 corridor 2. Cased openings are gaps in the wall line; `D` door, `L` locked door, `W` window wall, `#` duct, `X` rubble, `E` shut elevator doors, `=` dividing wall, `~` dwell rect, `c` checkpoints (the one in the closet is `cp_start` = player start, drawn over the `S`), `1`/`2` demon spawns, `p` player approach points, and the scene slots by kind: `m` monster, `a` ambush, `s` scene, `k` pickup (the corridor `k` is the shotgun), `r` reveal. Generated from the JSON by a scratch script; regenerate rather than hand-edit.

```
x(m)  0    5    10   15   20   25   30   35   40   45   50   55
   0                                                    +----+
   1                                                    |SUP |
   2                                                    |  c |
   3                                                    |    |
   4                                                    |    |
   5                                                    +--#-+
   6                                                       #
   7                                                       #
   8                                                       #
   9                                                       #
  10       +----+----+----+----+---------+----+----+-------#-+
  11       |O2  |O1  |P1  |P2  |LIBRARY  |A3  |A4  |BREAK    |
  12       |    |    |    |    |         |    |    |       c |
  13       |    |    |    |    |        m|    |    |  r      |
  14       |    |    |    |    |         |    |    |         |
  15       +--D-+--D-+    |    |         |    |    |         |
  16       |  1      |    |    |         |    |    |         |
  17       | LOBBY   |    |    |         |    |    |         |
  18       |         +--D-+--D-+--D-+----+--D-+--D-+--D-+----+
  19       |       p  N.CORR W       N.CORR E      ck   |
  20       |                                            |
  21  +----+    +--D-+--D-+--D-+---D+--+------  -----+  +----+
  22  |XX   GAL |MEN |A1  |IT  |COPY   |BULLPEN      |EC ELV |
  23  |XX       |    |    |    |       |             |       E
  24  +----+    |    |    |    |       |             |       E
  25       |    |    |    |   k|       |             |       |
  26  +----+    +----+----+----+-------+       s     |  +----+
  27  |STO |    |WOM(|STR(|JAN |FILES  |             |  |A2  |
  28  |    D    |    |    |    |   a   |             |  D    |
  29  |    |    |    |    |    |       |             |  |    |
  30  |    |    |    |    |    |       |             |  |    |
  31  +----+    +--L-+--L-+--D-+---D---+------  -----+  +----+
  32       |S.CORRIDOR                        a         |
  33       |                                            |
  34       +---------------+  +-----     ----+  +-------+
  35       |BOARDROOM      |SW|RECEPTION     |SE|CONF   |
  36       |               |  |              |  |       |
  37       |          s    D  |              |  D       |
  38       |               |  |       r      |  |       |
  39       |               |  |              |  |       |
  40       +---D---+-------+  +-------D------+  +-------+
  41       |P4     |P3     |  |CEO    c      |  |P5     |
  42       |       |       |  |              |  |       |
  43       |       |       |  |       p      |  |       |
  44       |       |       D  |              |  D    m  |
  45       |       |       |  |         =====|  |       |
  46       |       |       |  |              |  |       |
  47       |       |       | m|    ~~~~~~  2 |  |       |
  48       +-------+-------+--+WWWWWWWWWWWWWW+--+-------+
```

Reading aids: the closet (`SUP`) stands alone at the top right with the duct dropping into the break room's east third; the north row of offices sits above the north corridor pair (`N.CORR W` / `N.CORR E`, one continuous 35 m line at rows 19-20); the west lobby is the wide box at rows 16-20 with Demon #1 (`1`) under Office #2's door; the core (men's / women's, A1 / stair, IT / janitor, copy / files) fills rows 22-30 between the gallery (`GAL`) and the bullpen; the east corridor (`EC`) runs down beside the elevator alcove (`ELV`, doors `E` on the outer wall) and A2; the south corridor (row 32-33) carries the two locked doors (`L`), the two spurs (`SW`, `SE`) and the reception opening; the window wall (`W`) is the bottom edge of the CEO office with the dividing wall (`=`) hanging off its east wall two rows above the dwell rect (`~`) and Demon #2 (`2`).

## 9. Spec adjacency mapping (required rooms -> this floor)

The validator's required ids and links (`Tools/validate_floorplan.mjs` sections 5-6) all resolve; this is what each one became:

| spec room | this plan | link the validator checks |
|---|---|---|
| Supply Closet | `supply_closet` (5000, 0) 430 x 430 | exactly one duct to `break_room` (520, crawl only), no door |
| Break Room / Kitchenette | `break_room` (4500, 950) 980 x 780 | `door` to `corridor_main` (x 4740) |
| Main corridor | `corridor_main` (3000, 1750) 1980 x 280 = the east half of the north corridor; the corridor cluster (rooms joined to it by `open`, leaves excluded) is `corridor_north_w`, `west_lobby`, `gallery_west`, `corridor_east`, `corridor_south`, `bullpen`, `corridor_sw`, `corridor_se`, `elevator_lobby` | 280 wide, 250-320 spec range |
| Men's restroom | `mens_restroom` (1000, 2050) off the lobby's south wall | `door` to the cluster (`west_lobby`) |
| Women's restroom (locked) | `womens_restroom` (1000, 2550) on the south corridor | `locked_door` to the cluster (`corridor_south`) |
| Office #1 / Office #2 | `office_1` (1000, 950), `office_2` (500, 950) on the lobby's north wall | `door` to the cluster (`west_lobby`); Demon #1 is adjacent to `office_2` |
| Collapsed hallway | `corridor_blocked` (0, 2050) 480 x 280 off the gallery | `open` to the cluster (`gallery_west`), `collapse` blocker 200 deep |
| Elevator lobby | `elevator_lobby` (5000, 2050) 480 x 480 off the east corridor | `open` to the cluster (`corridor_east`), `elevator_doors` blocker on its east wall |
| Reception | `reception` (2400, 3350) 1480 x 630 | `open` to the cluster (`corridor_south`), `door` to `ceo_office` |
| CEO office | `ceo_office` (2400, 4000) 1480 x 780, window wall south opposite the door | `money_shot` entry `door_reception_to_ceo_office`, window `exterior`, dividing wall off the door -> window sightline |
| Demon #1 "at the corridor near Office #2" | `west_lobby` (transit lobby in the cluster, adjacent to `office_2`) - accepted without WARN | lanes: retreat 900 >= 600, strafe 200 >= 200 |
| Demon #2 inside the CEO office | `ceo_office`, hidden behind the dividing wall | lanes: retreat 700, strafe 250; capsule larger than Demon #1 |
| Checkpoints | `cp_start`, `cp_break_room`, `cp_corridor_post_pickup`, `cp_ceo_entry` (same four ids as gate 0) | each inside its room |

Everything else (partner offices, library, associates 1-4, IT, janitor, copy, files, bullpen, storage, boardroom, conference, the two spurs, the gallery) is the law-firm program Rob asked for and is optional to the spec.

## 10. What changed vs gate 0 and why

Gate 0 (`Data/candidates/floorplan_gate0.json`, judged synthesis of candidates A/B/C) was the executive floor exactly as drawn: 12 rooms, 11 openings, 30.2 x 46.2 m, one straight 19.8 m corridor spine, a 9.3 m passage down to reception, no loops, straight-through 49 m over 5 legs. Rob's review of its greybox screenshots asked for a whole law-firm floor with a light maze, loops, spurs, dead ends, staging slots and ten minutes of exploration; under the exploration model added for this gate the old plan scores 3.1 min (the validator now WARNs on it) and it had no `scenes`.

| | gate 0 | this plan | why |
|---|---|---|---|
| rooms / openings / markers / scenes | 12 / 11 / 42 / 0 | 37 / 38 / 56 / 11 | a full floor; >= 8 staging slots required by the gate-1 brief |
| footprint incl. walls | 30.2 x 46.2 m | 55.2 x 48.2 m | one compact floor of a mid-size firm around a service core |
| topology | one spine + one passage, 0 loops | ring + bullpen chord = 2 independent cycles, 4 dead ends, 2 spurs | Rob: loops, spurs, dead ends |
| exploration estimate | 3.1 min (WARN) | 10.8 min | Rob: about 10 minutes |
| critical path | 5 legs, 49 m, 2 junctions | 8 legs, 103 m, 3 corridor junctions + 2 lobbies | the spine now goes round the west side of the ring so it carries the lobby fight and the collapse |
| Demon #1 | `corridor_main` junction, spawn in front of Office #2's corridor door, strafe 400 into the elevator alcove | `west_lobby`, out of Office #2's lobby door, retreat 900 east, strafe 200 | the offices moved onto a lobby so the fight has a room, not a T-junction |
| Demon #2 / dividing wall | spawn (1900, 3900), wall x 1550-1980 at y 3800 (430 long, hid zero glass) | spawn (3650, 4620), wall x 3300-3880 at y 4400 (580 long, hides 30 % of the glass from the door) | the CEO office is 780 deep instead of 1080, so the pocket sits closer to the glass (Q6) |
| money shot | 68.3 deg = 76 % (10.9 m to the glass) | 86.3 deg = 96 % raw, 71 % net of the divider (7.9 m) | room one module shallower for the bigger floor (Q5) |
| elevator | alcove north of the junction, doors on its north wall | alcove off the east corridor, doors on the exterior east wall | the elevator core belongs on the building's outer wall |
| supply closet | (2550, 0), duct into the break room's east half | (5000, 0), duct 520 into the break room's east third | same relation, moved with the break room to the NE corner |
| dry run | 249 actors, 154 collision boxes | 590 actors, 316 collision boxes, 0 overlaps, enclosure PASS | 37 slabs + ceilings, 129 walls, 41 headers, 59 fill lights (a grid per room since the light fix, section 12) |

Kept from gate 0 on purpose: the 50 cm module and the `50k - 20` interiors; every metric (door 120 x 220, corridor 280, ceilings 310 / 280 wet / 330 library, duct 100 x 95 x 520, walls 20); the single design axis (now x = 3140 instead of 1240) through the reception opening, the CEO door, the window and the dwell rect; the collapse as 200 of rubble in a 480 stub; elevator doors 200 wide; dwell rect 600 x 150 on the glass; the four checkpoint ids; the window authored against `exterior`; the three-ray occlusion proof as a documented check. Dropped: the drawing-derived reads (women's band under the corridor, facing restroom doors, sketch X positions as notes, vanity arrow) - the drawing's adjacency survives, its proportions do not.

## 11. Open questions for Rob (Gate 1 review)

1. **Footprint.** 55.2 x 48.2 m, 1772 m2 of interior - is that "compact" enough for one floor, or should the north row drop a module (partner / associate offices 780 -> 630 deep) and the spurs shorten (1430 -> 1180)? Every room can move one module either way without breaking the grid.
2. **The bypasses.** The declared critical path (103 m, through the lobby and Demon #1) is not the shortest: the bullpen chord gives 63 m and the east corridor 78.6 m, both skipping Demon #1. Accept it as player freedom (the junction ambush punishes both), or force the west route with a blocker on the bullpen's south opening and a collapse / locked fire door at the east corridor's south end?
3. **The two long straights.** The north corridor pair reads as one 34.8 m line and the south corridor is a 44.8 m line; doors and openings articulate them but nothing jogs. Options: offset `corridor_south` by one module at the reception opening (two rects, an L), or make the north join at x 2980-3000 a door instead of a full-width opening.
4. **Partner 5's second window.** Rob's brief mentions a second exterior view; it is a Gate 3 note in `partner_5`, not an opening. Author it as a `window` (dark city, no fire) now so the greybox shows it, or leave it out?
5. **Money-shot dominance.** 96 % of the horizontal FOV from the door (gate 0: 76 %). One module deeper (930) gives 76.4 deg = 85 %, two (1080) gives gate 0's 68.3 deg = 76 %; each module pushes the window wall and the two corner partner offices 50 cm south.
6. **Dividing wall vs glass.** From the door the wall hides the east 439 cm of glass (30 %); the net view is 71 %. Keep (the screened lounge is the demon's pocket), or shorten the wall to x 3400 (17 % hidden, spawn moves to x >= 3744)?
7. **Lobby sizes.** West lobby 980 x 580 and gallery 480 wide are held to room rules, not corridor rules (INFO lines). Is 580 deep enough for the Demon #1 fight (strafe 200 stated, 230 / 350 available), or should the lobby be 780 deep (pushes the gallery and the core 200 cm south)?
8. **Locked stairwell.** The fire stair is sealed (LOCKED label, emergency light behind the slit). Keep it as dressing, or make it the Gate 3 exit tease?
9. **`cp_ceo_entry` inside Demon #2's trigger strip - resolved lead-side (2026-09-06).** The strip moved to y 4100-4200 and the checkpoint to (3140, 4040), so a respawn no longer refires the fight; nothing for Rob to decide unless he wants the refire back.
10. **Office #1 / Office #2.** The spec's two offices are 480 x 480 associate rooms on the lobby. With the lobby being the firm's second entrance, should they be partner offices (480 x 780) instead, taking the row north?
11. **Scene rhythm.** Between Demon #1 and the reception glow the declared route walks 24 m of south corridor with only the SW spur bait and an ambush behind the files door; the junction ambush sits on the bypasses. Enough dread, or move `sc_junction_ambush` to the SW spur mouth (x 2240) so it hits the main route?
12. **Partner 4 through the boardroom.** No corridor door: the SW corner office is a room-through-room dead end behind the boardroom scene. Intended reward for exploring the boardroom, or give it a door onto `corridor_sw`?
13. **Reception desk on the axis.** The desk faces the corridor opening in the line of the door (gate 0 kept the axis prop-free). Keep the confrontation, or slide it east?

Lead-side nits found while writing this (JSON / build-script only, no plan change needed for Rob) - **all resolved in the build script on 2026-09-06** (`BUILD.md` 3.34): `REF_OFFSET` had the old key `corridor_north_e`, so `corridor_main`'s reference figure fell back to (3080, 1830), 80 cm inside the full-width opening between the two north corridors -> key fixed, figure at (4880, 1890); `ref_west_lobby` stood at (1380, 1950) in the mouth of the lobby -> corridor opening -> (1380, 1550), the lobby's NE corner; `ref_corridor_sw` (2240, 4680) was inside `sc_spur_sw`'s rect -> (2240, 3450), 100 cm inside the spur's mouth; `note_files` described 600 cm N-S shelving stacks in a 480 cm deep room -> 400 x 60 stacks; `sc_break_trail`'s rect overlapped the round table's footprint -> x 4600-4850, y 1150-1300; `ref_ceo_office` (2500, 4100) was inside Demon #2's trigger strip -> (2500, 4300), and the strip itself moved to y 4100-4200 with `cp_ceo_entry` at y 4040 (Q9). None of these is checked by the validator; the dry run after the fixes is the 590-actor / 0-overlap run quoted at the top.

## 12. Feedback loop

The JSON is the level. Rob's feedback becomes an edit, a dry run, a rebuild:

1. **Edit the design** in `Docs/candidates/legal_lead.build.mjs` (the room table, `door()` / `open()` / `locked()` calls, notes, checkpoints, encounters, scenes, money shot, critical path) and regenerate: `node Docs/candidates/legal_lead.build.mjs Data/floorplan.json` (default output `Data/candidates/legal_lead.json`; the script self-checks the 50 cm module, overlaps, one-wall gaps and opening extents and refuses to write on failure). Editing `Data/floorplan.json` directly is fine for a one-number try, but the script is the source: port the change back or it is lost on the next generate.
2. `Tools\test_dry_run.ps1` - must print `all steps passed`: compiles every editor script, runs `build_greybox.py --dry-run` twice (identical SHA256), `check_manifest.mjs` (overlaps, boundary, enclosure, money shot), `validate_floorplan.mjs` (schema, adjacency, lanes, scenes, exploration estimate, critical-path walk, junctions), the feel-gym build and the 8-slot scenes smoke test. Fix until green; re-read the PASS line's exploration minutes and the WARN list.
3. `Tools\ue\run_editor_script.ps1 -Script build_greybox.py` regenerates `/Game/Maps/L_ExecutiveFloor` from scratch (needs UE 5.8, not the C++ module).
4. `Tools\package.ps1 -Tag gate-1.N`, then `Tools\release.ps1 -Tag gate-1.N` for Rob's build.

Lighting is not part of the plan and needs no edit here: every room gets even-fill point lights on a grid no coarser than `Data/greybox_style.json : lights.light_spacing_cm` (800), radius clamped to `max_attenuation_radius_cm` (1000) - 59 lights on this floor - after the first gate-1 screenshot sweep, lit with one light per room at 1.25 x the room diagonal, gave the 44.8 m south corridor a 56 m light and blew the whole floor out to white (`BUILD.md` 3.28).

Typical one-number edits: a room one module bigger or smaller (`w` / `h` +/- 50 in the room table, keep the origin on 50 and re-centre its openings on the shared extent), the CEO office depth for the framing table in section 7, the dividing wall's free end (`money_shot.dividing_wall.from_x`, re-run the three-ray table), a door slid along its wall, an encounter lane length, a scene rect. The exploration model's constants live in `Data/metrics.json` `exploration_model`, not in the plan.
