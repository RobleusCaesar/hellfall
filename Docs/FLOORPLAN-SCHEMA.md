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
  "critical_path": [ "room_id", ... ]   // ordered, must start at supply_closet and end at ceo_office
}
```

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
