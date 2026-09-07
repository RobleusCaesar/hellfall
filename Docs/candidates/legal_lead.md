# Candidate `legal_lead` - the law-firm floor, lead design (2026-09-06)

**Files:** `Docs/candidates/legal_lead.build.mjs` (generator, the design in ~180 lines) -> `Data/candidates/legal_lead.json` = `Data/floorplan.json` (byte-identical). Full write-up: `Docs/FLOORPLAN.md`. Previous plan kept at `Data/candidates/floorplan_gate0.json`.

## The lens

Rob's gate-0 review asked for one full floor of a mid-size law firm: compact, a light maze with loops, spurs and dead ends, staging slots for monsters and scenes, about ten minutes to explore, fully enclosed, subtle surface texture. Three designer agents were tried first and all three failed on output size (a 37-room plan with 38 openings, 56 markers and 11 scenes is too much JSON to emit reliably by hand in one pass). The lead therefore designed the floor as a **generator script**: a room table of `[id, label, x, y, w, h, ceiling, finish, enterable, role]`, one-line `door()` / `open()` / `locked()` calls, notes, checkpoints, encounters, scenes, money shot and critical path, with self-checks (50 cm module, no overlaps, exactly one wall between neighbours, openings inside their shared extent) that refuse to write a broken plan. The design is reviewable as a table and every Rob edit is a one-line change followed by a regenerate.

## The design moves

1. **Ring around a service core.** North corridor pair (`corridor_north_w` 1480 + `corridor_main` 1980) along the top, `corridor_east` 980 down the right, `corridor_south` 4480 along the bottom, `west_lobby` 980 x 580 + `gallery_west` 480 x 980 closing the left. Offices outside the ring, wet rooms / stair / IT / janitor / copy / files inside it.
2. **One chord, two spurs, two stubs.** The paralegal `bullpen` cuts through the core with 280 openings north and south (second loop); `corridor_sw` and `corridor_se` (1430 each) drop off the south corridor to the boardroom, conference room and the window-wall partner offices; the spec's collapsed hallway hangs off the gallery, the elevator alcove off the east corridor. 2 independent cycles, 4 dead ends, 19 optional leaf rooms.
3. **The spec spine goes the long way round.** `supply_closet -> break_room -> corridor_main -> corridor_north_w -> west_lobby -> gallery_west -> corridor_south -> reception -> ceo_office`: 103 m over 8 legs, so it carries Demon #1 (in the lobby, out of Office #2's door) and the collapse read. The shortest route is 63 m through the bullpen; `sc_junction_ambush` guards it (Rob decides whether to enforce the west route).
4. **Ten minutes by model, not by hope.** `Data/metrics.json` `exploration_model`: 7 corridors 123 m walked twice + 28 rooms (2 x shorter axis + 3 m each) at 400 cm/s + 12 s look-around per room, x 1.3 pacing = 10.8 min (target 8-12).
5. **Eleven staging slots** (3 monster, 2 ambush, 2 scene, 2 pickup, 2 reveal) placed so the critical path reads reveal -> pickup -> (tableau glimpse) -> fight -> collapse -> bait -> glow -> fight -> money shot, with the other slots behind optional doors.
6. **Money shot on one axis.** x = 3140 carries the reception opening, the CEO door, the 1480 window, the dwell rect, Demon #2's approach and `cp_ceo_entry`; the dividing wall x 3300-3880 at y 4400 hides the demon from all three doorway rays with >= 132 cm to spare (and clips 30 % of the glass from the door - flagged as Q6).
7. **50 cm module kept.** Every origin on 50, every interior `50k - 20`, walls 20; door 120 x 220, corridor 280, ceilings 310 / 280 wet / 330 library, duct 100 x 95 x 520 - nothing in `Data/metrics.json` moved.

## Validator and dry run

```
node Tools/validate_floorplan.mjs Data/floorplan.json
INFO transit room "west_lobby" (980x580) on the corridor->reception leg is a lobby, not a corridor: room rules apply
INFO transit room "gallery_west" (480x980) on the corridor->reception leg is a lobby, not a corridor: room rules apply
WARN encounter "demon_2": straight line spawn -> player_approach is blocked at (3357, 4407) (Gate 2 checks pathing properly)
PASS Data\floorplan.json: 37 rooms, 38 openings, 1 duct(s), 2 blockers, 56 markers, 4 checkpoints, 2 encounters, 11 scenes; plan bounds incl. walls -20..5500 x -20..4800 cm; critical path supply_closet -> break_room -> corridor_main -> corridor_north_w -> west_lobby -> gallery_west -> corridor_south -> reception -> ceo_office; exploration ~10.8 min (7 corridors 123 m x2 + 28 rooms 409 m at 400 cm/s + 12 s look-around per room, x1.3 pacing); critical path walk ~103 m over 8 leg(s), 3 junction(s) (corridor_main, corridor_north_w, corridor_south); 1 warning(s)

node Tools/check_manifest.mjs Saved/Manifests/L_ExecutiveFloor.manifest.json
manifest L_ExecutiveFloor.manifest.json -> map /Game/Maps/L_ExecutiveFloor, 590 actors (569 + 21 grid lights)
  overlap check: 316 collision boxes, 5407 candidate pairs, tolerance 0.5 cm, whitelist collapse/boundary -> ok
  enclosure check: 37 floor slab(s), 37 with a ceiling, 148 sides probed (a gap > 30 cm outside an authored opening fails) -> ok
  money shot: window subtends 86.3 deg; inside the 90 deg FOV: 86.3 deg = 96% (need >= 60%) -> PASS
PASS L_ExecutiveFloor.manifest.json
```

The INFO lines are by design (the lobbies are wider than a corridor so they can be fight pockets); the WARN is the dividing wall doing its job.
