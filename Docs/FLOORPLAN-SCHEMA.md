# Floor plan data schema (`Data/floorplan.json`)

The greybox is **generated**, not hand-built. `Tools/ue/build_greybox.py` reads `Data/floorplan.json` plus `Data/metrics.json` and emits the level. Rob's feedback becomes a change to this JSON (or to `metrics.json`), followed by a regeneration. This file defines the JSON so the digitizers, the generator, the validator and the docs all agree.

## Coordinate convention — "plan space"

Plan space is the hand drawing exactly as photographed (`SourceAssets/reference/game_layout.jpg`, portrait, 4284×5712 px):

- `x` increases to the **right of the photo** (the Kitchenette / Break Room side).
- `y` increases **down the photo**, i.e. toward the CEO window wall / "money shot".
- Units are **centimetres**. The origin is the top-left corner of the whole plan's bounding box, so every coordinate is ≥ 0. The drawing has no scale; the digitizer chooses real dimensions inside the Metrics Standard.
- Every rect is axis-aligned: `{ "x", "y", "w", "h" }` = top-left corner + width (along x) + depth (along y). Rects are **interior clear dimensions** of a room; walls are added outside them by the generator using `metrics.architecture.wall_thickness_cm`. Two rooms that share a wall have rects separated by exactly one wall thickness (20 cm), never overlapping, never touching.

Mapping to Unreal (the generator does this; nobody else needs to):

```
UE.X (forward) =  plan.y          # walking "down the drawing" toward the window is +X
UE.Y (right)   = -plan.x          # keeps the drawing's handedness: facing the window, the Break Room is on the player's LEFT
UE.Z (up)      =  0 at finished floor level
```

So a player standing at the CEO office door and facing +X looks straight at the window wall (REQ checklist item 14).

## Top-level shape

```jsonc
{
  "version": 1,
  "units": "cm",
  "source_drawing": "SourceAssets/reference/game_layout.jpg",
  "notes": "free text: what was interpreted from the drawing and why",
  "rooms":      [ Room ],
  "openings":   [ Opening ],
  "ducts":      [ Duct ],
  "blockers":   [ Blocker ],
  "markers":    [ Marker ],
  "checkpoints":[ Checkpoint ],
  "encounters": [ Encounter ],
  "money_shot": MoneyShot,
  "critical_path": [ "room_id", ... ],  // ordered, must start at supply_closet and end at ceo_office
  "scenes":     [ Scene ]               // OPTIONAL (gate 1): reserved staging slots, see "Scene" below
}
```

Gate 2 adds nothing to this file (it is frozen): the blockouts live in a second file, `Data/blockout.json`, described under
"Blockout data" below.

### Room

```jsonc
{
  "id": "break_room",                 // snake_case, unique; REQUIRED ids listed below
  "label": "Break Room / Kitchenette",// floating text label in the greybox
  "rect": { "x": 0, "y": 0, "w": 800, "h": 600 },
  "ceiling_cm": 310,                  // usually metrics.architecture.office_ceiling_height_cm
  "floor_finish": "carpet" | "tile" | "concrete" | "metal",   // Gate 3 hint; greybox tints only
  "enterable": true,                  // false = locked/sealed room whose interior still exists for depth
  "role": "start" | "transit" | "optional" | "dead_end" | "goal" | "sealed"
}
```

**Required room ids** (exact): `supply_closet`, `break_room`, `corridor_main`, `mens_restroom`, `womens_restroom`, `office_1`, `office_2`, `corridor_blocked`, `elevator_lobby`, `reception`, `ceo_office`. Extra helper rooms (e.g. `reception_passage`, `corridor_south`) are allowed if the drawing needs them; the corridor may be split into several rects as long as they are connected by `opening` type `"open"`.

### Opening

Connects two rooms through the wall between them. The generator cuts the wall and, for doors, adds a jamb/header so the opening is exactly `width × height`.

```jsonc
{
  "id": "door_break_to_corridor",
  "type": "door" | "locked_door" | "open" | "window" | "duct_mouth",
  //  door        = clear opening 120×220 (from metrics), passable, no door leaf in Gate 1
  //  locked_door = 120×220 solid slab flush in the opening; NOT passable; labeled "LOCKED"
  //  open        = full-height cased opening of the given width (rooms flowing together, e.g. corridor→reception)
  //  window      = impassable glazed wall segment (only the CEO window wall uses this in Gate 1)
  //  duct_mouth  = low hole of duct interior size at floor level (generated automatically from ducts; do not author)
  "between": ["break_room", "corridor_main"],
  "wall": "south",                    // which wall of between[0] the opening is on: north (y-), south (y+), west (x-), east (x+)
  "center_along_wall_cm": 400,        // distance from the wall's start (x for N/S walls, y for E/W walls) to the opening centre, in plan space absolute coords
  "width_cm": 120,
  "height_cm": 220
}
```

For `type: "window"`, `between[1]` may be the literal `"exterior"` (or omitted): nothing is built beyond the glass, and the validator treats the wall as exterior. The live plan does exactly this (`Data/floorplan.json : window_ceo_city` has `between: ["ceo_office", "exterior"]`). Alternatively `between[1]` may be the id of a non-enterable backdrop room reached only through windows (`Tools/validate_floorplan.mjs` `isBackdrop`), which is accepted but not used in Gate 1. Do **not** author an `exterior_city` room to hold the window: a sealed room there would receive a floor, ceiling, light, label and reference figure, all visible through the glass.

### Duct

```jsonc
{
  "id": "duct_supply_to_break",
  "from": "supply_closet", "to": "break_room",
  "axis": "y",                         // duct runs along plan y (or "x")
  "start": { "x": 350, "y": 400 },     // centre-line start point on the FROM room's wall, plan space
  "length_cm": 500,                    // metrics.architecture.duct_length_cm range 300–800
  "interior_width_cm": 100, "interior_height_cm": 95,   // from metrics
  "floor_offset_cm": 0                 // duct floor height above finished floor; 0 = floor-level
}
```
The generator builds the duct as a box tube with its own floor/ceiling/sides, cuts a `duct_mouth` in both rooms' walls, and adds a 6 cm lip so a standing or crouching capsule is physically blocked.

### Blocker

```jsonc
{ "id": "collapse", "kind": "collapse", "room": "corridor_blocked", "depth_cm": 200 }   // rubble wedge filling the corridor, floor to ceiling, un-jumpable, un-crawlable
{ "id": "elevator", "kind": "elevator_doors", "room": "elevator_lobby", "wall": "west", "width_cm": 140, "height_cm": 220 }  // shut doors as a slab flush in the wall, labeled
```
The blocker and duct examples above are illustrative; the live values are in `Data/floorplan.json` (the plan's elevator doors are 200 wide on the lobby's north wall, its duct 520 face to face).

### Marker

```jsonc
{ "id": "player_start", "kind": "player_start", "room": "supply_closet", "pos": { "x": 300, "y": 200 }, "yaw_deg": 90 }
{ "id": "ref_supply", "kind": "reference_figure", "room": "supply_closet", "pos": { "x": 120, "y": 120 } }  // one per room, REQUIRED
{ "id": "note_guard", "kind": "note", "room": "corridor_main", "pos": {...}, "text": "dead security guard + shotgun (Gate 2)" }  // Gate-2 intent only; not built in Gate 1
```
`yaw_deg` is in **plan space**: 0 = facing +x (right of the photo), 90 = facing +y (down the photo, toward the window). The generator converts.

### Checkpoint (REQ-G5-005 positions are reserved now so the rooms fit them)

```jsonc
{ "id": "cp_start", "room": "supply_closet", "pos": {...}, "yaw_deg": 90 }
```
Required ids: `cp_start`, `cp_break_room`, `cp_corridor_post_pickup`, `cp_ceo_entry`.

### Encounter (REQ-G2-003/004 — reserved space only)

```jsonc
{
  "id": "demon_1", "room": "corridor_main",
  "spawn": { "x": ..., "y": ... },
  "trigger_rect": { "x":..., "y":..., "w":..., "h":... },
  "player_approach": { "x": ..., "y": ... },
  "retreat_dir": "north",               // direction the player backs away toward
  "retreat_clear_cm": 600, "strafe_clear_each_side_cm": 200,
  "capsule_radius_cm": 45, "capsule_height_cm": 220   // demon_2 uses larger values
}
```
Required ids: `demon_1` (corridor near `office_2`), `demon_2` (inside `ceo_office`).

### MoneyShot

```jsonc
{
  "room": "ceo_office",
  "window_wall": "south",               // the wall farthest along +y; full width of ceo_office
  "entry_opening_id": "door_reception_to_ceo",
  "dividing_wall": { "along": "x", "at_y": 1234, "from_x": 100, "to_x": 700, "height_cm": 310 },  // partial-width wall inside the office; must NOT cross the doorway→window sightline
  "dwell_rect": { "x":..., "y":..., "w":..., "h":... }   // 5-second dwell zone in front of the window
}
```

### Scene (gate-1 brief: "a bit of a maze ... where we can ultimately stage different monsters and scenes")

A reserved staging slot. Scenes are **review markers only** — no collision, no gameplay — so Rob can see where a beat is planned while he walks the greybox; later gates replace them with real spawns, triggers and props.

```jsonc
{
  "id": "sc_copy_room_lurker",          // snake_case, unique across scenes
  "room": "copy_room",                  // the room whose rect contains the slot
  "kind": "monster",                    // monster | ambush | scene | pickup | reveal
  "rect": { "x": 1200, "y": 2350, "w": 150, "h": 150 },   // plan space, must lie inside the room's rect
  "facing_deg": 180,                    // plan yaw (0 = +x right of the photo, 90 = +y toward the window): the direction the staged thing faces / the player is expected to arrive from
  "description": "Lurker behind the copier; charges when the player reaches the paper shelves."   // free text, word-wrapped in the greybox
}
```

Kinds and what the generator draws (`Data/greybox_style.json : scene_marker`, tints `scene_<kind>`):

| kind | colour | meaning |
|---|---|---|
| `monster` | red | a demon or other hostile stands / spawns here |
| `ambush` | orange | a hostile bursts out of hiding here (door, ceiling tile, cabinet) |
| `scene` | purple | a scripted set piece or corpse tableau |
| `pickup` | green | an item the player collects (shotgun, shells, key) |
| `reveal` | blue | a sightline / vista the player is meant to notice (window, corridor end) |

Per scene the greybox gets: a translucent floor marker over `rect` in the kind's colour; a label `KIND: id` at `scene_marker.label_height_cm` (60 cm) facing the room's entry point like every other label in the room; a smaller grey note with the description (skipped when `labels.notes_enabled` is false); and, when `facing_deg` is a multiple of 90, a thin tick strip from the rect centre toward the facing direction. Everything lands in the `Greybox/Scenes` outliner folder. The manifest records every scene under `meta.scenes` (`rect_plan`, `facing_deg`, `tint`, `facing_tick`).

Validator (`Tools/validate_floorplan.mjs`): the array is optional; when present every scene needs a snake_case unique `id`, an existing `room`, a `rect` inside that room, a known `kind` and a numeric `facing_deg`; a missing description or a scene in a non-enterable room is a WARN. **Fewer than 8 scenes is a WARN** (the gate-1 brief reserves at least eight slots). Scene rects may overlap each other, encounter lanes and checkpoints — they are markers. `Tools/check_manifest.mjs` ignores marker kinds entirely.

## Blockout data (`Data/blockout.json`, Gate 2)

Gate 1 froze the floor (rooms, openings, duct, blockers, metrics). Gate 2 adds **blockouts inside the approved rooms** from a
second, optional file, `Data/blockout.json`, generated by `Docs/blockout/blockout.build.mjs` and read by the same generator
(`Tools/ue/build_greybox.py` picks it up automatically when it exists; `--blockout <file>` / `--no-blockout` override).
`Tools/validate_blockout.mjs` checks it against this floor plan before anything is built; without the file the build is the
approved Gate-1 greybox, byte for byte. Everyone codes against this shape:

```jsonc
{
  "version": 1, "units": "cm",
  "coverage": "full",                 // OPTIONAL: "partial" (fixtures / work in progress) turns the coverage checks into INFO
  "asset_slots": {                    // one entry per Unreal asset name (REQ-G2-001): the real-world size every blockout stands in for
    "SM_ReceptionDesk": {
      "source": "SourceAssets/models/props/reception_desk.glb",
      "class": "hero_weapon" | "enemy" | "human_prop" | "large_furniture" | "small_prop",   // Gate-4 triangle-budget class
      "target_size_cm": { "w": 180, "d": 80, "h": 110 },   // the decision (BUILD.md section 5 unless Blender disproves it)
      "pivot": "floor" | "wall" | "muzzle",
      "normalized_size_m": [1.896, 1.888, 1.33],           // the Blender rest-pose size, Z-up W x D x H (Docs/audit/blender_audit_*.json) - what Gate 4 divides target_size_cm by
      "tris": 7796,                                        // Blender's count after import (duplicate faces dropped)
      "parser_size_m": [1.896, 1.33, 1.888], "tris_parser": 7798,   // OPTIONAL, record only: the node header parser's view (Docs/audit/glb_audit.jsonl, glTF Y-up x, y, z) - 100x too small for skinned meshes, never scale from it
      "note": "why this size"
    }
  },
  "props": [ {
    "id": "reception_desk", "room": "reception", "slot": "SM_ReceptionDesk" | null, "label": "Reception desk",
    "kind": "furniture" | "fixture" | "door" | "rack" | "generic",     // tint blockout_<kind>; supply racks have no asset -> "rack" with slot null
    "pos": { "x": 3140, "y": 3550 },   // plan-space CENTRE of the footprint
    "yaw_deg": 0,                      // footprint yaw, plan space: 0 = w along +x, 90 = w along +y (down the photo)
    "size": { "w": 240, "d": 90, "h": 75 },   // w along the yaw axis, d across it, h up
    "mount": "floor" | "wall" | "ceiling",
    "wall": "north" | "south" | "east" | "west",   // mount wall only: the box is snapped flush against that wall's interior face; pos is ignored along the wall normal
    "z_cm": 0,                         // bottom height (floor items MUST be 0; a wall cabinet may be higher; ceiling mounts are flush under the ceiling)
    "note": "narrative intent (Gate 2)"
  } ],
  "characters": [ {
    "id": "man_racks", "room": "supply_closet", "slot": "SM_ManSitting", "label": "Seated man",
    "pose": "seated" | "prone" | "slumped",
    "pos": { "x": 5320, "y": 240 }, "yaw_deg": 180,       // yaw_deg = the FACING (0 = faces +x, 90 = faces +y)
    "size": { "w": 80, "d": 100, "h": 130 },              // OPTIONAL: w across the body, d front-to-back; defaults per pose from greybox_style.blockout (seated 60 x 60 x 130, prone 180 x 60 x 30, slumped 80 x 60 x 110)
    "contact": "wall:<side>" | "prop:<prop id>" | "floor", // back face flush on the wall (the character is turned to face away from it) or on the prop's face behind it; floor = as authored (prone bodies)
    "note": "..."
  } ],
  "pickups":    [ { "id": "shotgun", "room": "corridor_main", "slot": "SM_Shotgun", "label": "Shotgun pickup", "pos": {...}, "yaw_deg": 0, "size": { "w": 120, "d": 22, "h": 8 }, "halo": true, "note": "..." } ],
  "demons":     [ { "id": "demon_1_blockout", "encounter": "demon_1", "slot": "SK_EmberDemon", "label": "DEMON #1 (SK_EmberDemon) 220 cm - mesh 162 x 204 x 220, capsule r 45", "radius_cm": 45, "height_cm": 220,
                    "footprint_cm": { "w": 162, "d": 204 },   // OPTIONAL: the audited mesh (wing) footprint, drawn as a translucent no-collision box around the pathing cylinder (REQ-G2-003 AC1)
                    "note": "..." } ],   // placed at encounters[].spawn
  "triggers":   { "height_cm": 220, "from": "encounters.trigger_rect" },
  "backdrop":   { "beyond_window_cm": 800, "width_cm": 12000, "height_cm": 5000, "z_cm": -2500, "tint": "backdrop_fire", "note": "placeholder orange fire plane (REQ-G2-005), sized for the dwell rect" },
  "dwell":      { "from": "money_shot.dwell_rect", "height_cm": 200, "tint": "dwell_volume" }   // a volume standing in the sightline strip above eye height uses a tint at or under rules.sightline_volume_max_opacity
}
```

**Conventions.** Plan space as above (cm, x right, y down toward the window). A prop footprint is an oriented rectangle: `w` runs
along `(cos yaw, sin yaw)`, `d` along the perpendicular; the generator's `Box.yaw_plan_deg` carries it and the engine cube is
yawed by the same angle (a footprint rotation turns the same way in plan and UE; only *facings* carry the -90 offset). A
character's `yaw_deg` is its facing; its box is `w` across the body and `d` along the facing, so a prone default (180 x 60) lies
ACROSS its facing - the guard "lying along the north wall" (x axis) faces 90 or 270. Wall thickness is 20 cm and lies outside the
room rect, so "flush against the wall" means the footprint face sits exactly on the rect edge (0 cm overlap with the wall box).

**What the generator emits** (`Tools/ue/hf_geometry.py`, `_blockout_actors`; folders `Blockout/Props`, `Blockout/Characters`,
`Blockout/Pickups`, `Blockout/Demons`, `Blockout/Volumes`, `Blockout/Backdrop`): props, characters and pickup bodies as tinted
boxes WITH collision; the pickup halo (60 cm translucent green cube on the floor around the pickup), the demons
(`/Engine/BasicShapes/Cylinder` scaled to radius / height at the encounter spawn, plus - when `footprint_cm` is given - the marker
box `Demon_<id>_footprint`, w x d x 10 cm on the floor under the cylinder, yawed so the mesh faces `player_approach` with w across
that facing, tint `blockout_demon_footprint`, and ", footprint w x d" appended to the label; no rule counts it), the trigger volumes (full `triggers.height_cm`
over each `trigger_rect`), the dwell volume (over `money_shot.dwell_rect`) and the backdrop (a slab `beyond_window_cm` behind the
window's outer face, centred on the window, outside the boundary shell) WITHOUT collision; and one small label per item,
`"<label> <w> x <d> x <h>"`, above it, facing the room's entry point. All tints, default sizes, the halo size, the backdrop
thickness, the label lift and the placement-rule numbers live in `Data/greybox_style.json : blockout` / `tints` / `labels.blockout`.

**Rules** (`Tools/validate_blockout.mjs`, FAIL unless noted; `Tools/check_manifest.mjs` re-checks the built boxes): every footprint
lies inside its room with >= 5 cm to the walls unless wall-mounted (then exactly flush); floor items at z 0, nothing floats, nothing
above the ceiling; no blockout penetrates another (flush contact is fine); nothing in the 120 x (opening width, min 120) cm clear
zone in front of every door / open / locked door / duct mouth; nothing on the collapse wedge or the dividing wall; nothing within
the player capsule radius (36) of an encounter retreat / strafe lane, within 60 cm of a checkpoint, 36 cm of the player start or
inside a demon's spawn disc; nothing within the capsule radius of the player start -> duct mouth route (the first move must not
catch, REQ-G2-002 AC3); a prop may lie in a scene rect ONLY when the scene is kind `scene` and the prop's `note` names the scene
id - the prop IS the tableau (boardroom table, bullpen island); monster / ambush / pickup / reveal floors stay open; a character /
pickup inside a scene rect is a WARN (usually the scene's content); a `door` prop flush on the wall INSIDE a `locked_door`
opening's span is that opening's shut door and is exempt from that one swing zone (nothing swings); nothing crosses the
door-centre -> window-centre sightline strip (+-90 cm) in `ceo_office`; every `corridor_*` room keeps >= 216 cm (3 x capsule
diameter) clear across it at every station, past every blockout taller than the 40 cm step height (items on opposite walls at the
same station narrow it together) - except that a station narrowed only by characters against a wall (pose `seated` / `prone` /
`slumped`, `contact: wall:<side>`) needs `rules.corridor_clear_min_past_body_cm` (150 = capsule diameter 72 + the 78 cm body: a body
you step past, not architecture; props keep 216) and the PASS line names every such waiver; the backdrop fills the window from the doorway AND, from every dwell-rect corner at eye height,
covers the horizontal FOV pitched a full 16:9 vertical FOV down or up (WARN; rays through the glass edges are INFO); seated / slumped characters
contact a wall or prop and face away from it; every slot exists and is used (`SM_ClosedDoor` / `SM_BrokenDoor` unused = WARN,
doors stay openings in Gate 2), every working-set GLB has a slot (WARN); each encounter has exactly one demon; `triggers`,
`backdrop` and `dwell` are present. Sizes that differ by more than 10 % from the slot's `target_size_cm` are WARNs (REQ-G4-002
swaps assets for blockouts within 10 %).

## Exploration estimate (validator, gate-1 brief: "about 10 minutes to explore and play")

`Tools/validate_floorplan.mjs` prints, in its PASS line, an exploration estimate and WARNs outside 8–12 minutes:

```
minutes = ( Σ corridor centre-line lengths (rooms whose id starts with corridor_, longer axis) × 2
          + Σ over enterable non-corridor rooms of (2 × shorter axis + 300) )
          / walk speed (movement.player.walk_speed_cms) / 60 × 1.6
```

It also prints the critical-path walking length (centre to centre between consecutive `critical_path` rooms, routed through the connecting door/open centre, or through both duct mouths and the tube) and the number of **junctions** on the critical path (a `corridor_*` room with ≥ 3 passable connections: door, open or duct). The gate-0 plan scores about 1.2 minutes and 2 junctions; the legal-office floor is expected to land in the 8–12 band.

## Fixed adjacency (from the spec — the validator enforces this)

1. `supply_closet` has **exactly one** connection: a duct to `break_room`. No door.
2. `break_room` → `corridor_main` by a `door`.
3. `corridor_main` connects (directly or via `open` corridor segments) to: `mens_restroom` (door), `womens_restroom` (locked_door), `office_1` (door), `office_2` (door), `corridor_blocked` (open, then a collapse blocker), `elevator_lobby` (open or door; elevator doors are a blocker), `reception` (open or door).
4. `reception` → `ceo_office` by a `door`, and the CEO office `window_wall` is the wall opposite that door.
5. `critical_path` = `["supply_closet","break_room","corridor_main", ..., "reception","ceo_office"]`.

## What the drawing says (agreed reading, so digitizers start from one interpretation)

Reading the photo top→bottom (= plan y increasing):

- **Top right:** Supply Closet, small, with **supply racks along its right wall**; the seated man leans on the racks, the young woman (intern) sits against another wall. Its only exit is a floor duct that runs **down** into the Break Room area.
- **Right column, upper-middle:** Break Room / Kitchenette — a long room along the right side with the **fridge at its lower end**, a **round table with chairs** in the middle, and the exit to the corridor on its **left wall**. The **dead security guard** lies just outside that exit where the Break Room meets the corridor, beside the Men's Bathroom.
- **Middle band:** the main corridor runs **horizontally** (along plan x). From the Break Room exit it goes **left** toward the far-left dead end: the **shut elevator door** and, branching off, the **unpassable (collapsed) hallway**. The **Men's Bathroom** (toilets drawn as stalls) is **above** the corridor (smaller y), left of the Break Room.
- **Below the corridor:** a passage drops **down** (plan y increasing) toward Reception. **Office #2** sits **left** of that passage with **Demon #1** marked at its mouth; **Office #1** sits **right** of the passage, below the **Women's locked bathroom** (vanity inside), which is directly under the corridor.
- **Bottom:** one large room — Reception with the **secretary's desk** in its upper part, a **dividing wall** running horizontally across (partial width), and the CEO's office below it with the **CEO's desk**, the **dead CEO**, **Demon #2 (bigger)**, and the **window wall along the very bottom edge** = the money shot.

Digitizers may disagree with proportions but not with this topology.
