# HELLFALL Metrics Standard (REQ-G1-002)

**STATUS: DRAFT - to be validated in the feel gym; FROZEN header added at Gate 1 approval.**

Units are centimetres, cm/s, seconds and degrees (G-2: 1 Unreal Unit = 1 cm). Every value below is read from a JSON file under `Data/` at build or run time; nothing is hard-coded in C++ or in the generators. Change the JSON, rebuild, no code edit (REQ-G1-003 acceptance 3). Source keys are given as `file : path`.

The values are game-standard for first-person interiors and deliberately larger than real-world dimensions, because real dimensions feel cramped through a 90-degree game camera. Where a value sits inside the spec's starting range no justification beyond the one-line rationale is needed; the two additions that are not rows of the spec table (wet-room ceiling, crouch and crawl speeds) are marked as such.

## 1. The spec's Metrics Standard, with chosen values

| # | Metric | Spec starting range | Chosen | Rationale (one line) | Source |
|---|---|---|---|---|---|
| 1 | Player collision height, standing | 180-190 | **184** | Mid-range; leaves 36 cm under a 220 door header and 126 cm under a 310 ceiling; 4 cm above the 180 reference figure so the player reads as an adult. | `Data/movement.json : player.stand_height_cm` |
| 2 | Player collision radius | 34-42 | **36** | Narrow end catches less on corners; diameter 72 gives the door rule 112 <= 120 and the corridor rule 216 <= 280 with margin. | `Data/movement.json : player.capsule_radius_cm` |
| 3 | Camera / eye height | 160-170 | **166** | Eye height of a ~178-180 cm adult; 18 cm below the capsule top so the camera never touches a ceiling before the capsule does. | `Data/movement.json : player.eye_height_stand_cm` |
| 4 | Crouch collision height | 110-120 | **116** | Mid-range; comfortably taller than the 95 duct so crouching is physically blocked at the duct mouth (REQ-G1-006). Crouch eye height 100. | `Data/movement.json : player.crouch_height_cm`, `player.eye_height_crouch_cm` |
| 5 | Crawl collision height | 60-70 | **64** | Low end plus margin: fits the 95 duct with 31 cm to spare and still fits the 90 feel-gym tunnel; crawl eye height 50 keeps the camera off the floor. Engine caveat: `UCapsuleComponent` clamps the half-height to at least the radius, so with radius 36 the crawl body is effectively a 72 cm sphere (still 23 cm under the 95 duct ceiling and about 9 cm under the 83 cm clear mouth, row 15); if 64 must be exact, change the radius or the height in the JSON, not the code. Confirmed by the packaged gate-0 build (2026-09-06), whose only warning is `LogHellfall: Warning: Movement: crawl_height_cm 64 is below 2 * capsule_radius_cm (72); the capsule clamps to a 72 cm sphere. Data change needed if 64 cm must be exact.` - expected, not a defect. | `Data/movement.json : player.crawl_height_cm`, `player.eye_height_crawl_cm` |
| 6 | Walk speed | 350-450 cm/s | **400** | Office pacing; crosses a 10 m corridor in 2.5 s. UE's 600 default is a jog and is what made the earlier prototypes feel wrong. | `Data/movement.json : player.walk_speed_cms` |
| 7 | Sprint speed (if implemented) | 550-650 cm/s | **600** (implemented, hold Left Shift) | Implemented so the Gate 5 retreat lanes (6 m) can be tested honestly; 1.5x walk is the conventional ratio. | `Data/movement.json : player.sprint_speed_cms` |
| 8 | Jump height | 80-110 | **95** | Mid-range; clears the 80 feel-gym ledge, not the 100. See the doorway note in section 2. | `Data/movement.json : player.jump_height_cm` |
| 9 | Max step height | 35-45 | **40** | Mid-range; steps over the 40 ramp segment and blocks at 45+, which the step ramp will show directly. | `Data/movement.json : player.max_step_height_cm` |
| 10 | Horizontal FOV | 90 | **90** (horizontal) | Applied directly as `UCameraComponent::FieldOfView`, which Unreal treats as the horizontal FOV under its default aspect-ratio constraint (`MaintainXFOV`); no conversion is performed, so 90 is literal at every aspect ratio. "Exposed as a setting" means editable in `Data/movement.json` now and in the Gate 6 options menu later. | `Data/movement.json : player.fov_horizontal_deg` |
| 11 | Door opening | 120 W x 220 H | **120 x 220** | As specified; 8 cm over the 112 rule minimum. Real 90 x 205 leaves are placed inside this opening at Gate 4. | `Data/metrics.json : architecture.door_width_cm`, `architecture.door_height_cm` |
| 12 | Corridor width | 250-320 | **280** | Mid-range; 64 cm over the 216 rule minimum, wide enough for the 2 m strafe lanes of REQ-G2-004 without reading as a warehouse. | `Data/metrics.json : architecture.corridor_width_cm` |
| 13 | Office ceiling height | 300-330 | **310** | Lower third of the range keeps the office oppressive; 31 cm above the jump apex (184 + 95 = 279) so no head contact in rooms. | `Data/metrics.json : architecture.office_ceiling_height_cm` |
| 14 | Minimum room footprint | 400 x 400 | **400 x 400** | As specified; the Supply Closet is the only room near the minimum and still holds the two seated survivors and the duct mouth. | `Data/metrics.json : architecture.min_room_footprint_cm` |
| 15 | Air duct interior | 100 W x 95 H | **100 x 95** | As specified; 95 sits between crawl 64 and crouch 116, so exactly one stance passes. Each duct mouth carries a 6 cm floor lip and a 6 cm head bar (`architecture.duct_wall_thickness_cm`), so the **clear mouth is 100 x 83**; the 72 cm effective crawl body (row 5) has about 9 cm at the mouth and 23 cm inside the tube. | `Data/metrics.json : architecture.duct_interior_width_cm`, `architecture.duct_interior_height_cm`, `architecture.duct_wall_thickness_cm` |
| 16 | Air duct length | 300-800 | **500** | Long enough that reversing mid-duct is a real test (REQ-G1-006 acceptance 3), short enough to cross in about 4 s at crawl speed. The executive floor's duct is built 520 face to face (`Data/floorplan.json : ducts[0].length_cm`; the extra 20 keeps both rooms on the 50 cm grid across two 20 cm walls) - 4 % over, within the 5 % rule. | `Data/metrics.json : architecture.duct_length_cm` |

### Additions not in the spec table

| Metric | Chosen | Rationale | Source |
|---|---|---|---|
| Wet-room ceiling height (restrooms) | 280 | Real restrooms carry a dropped ceiling for services; 280 differentiates them from the 310 offices. Note: only 1 cm above the 279 jump apex, so a jump in a restroom grazes the ceiling - acceptable (nobody jumps in a restroom) but flagged for the feel gym; 290 is the fallback. | `Data/metrics.json : architecture.wet_room_ceiling_height_cm` |
| Crouch speed | 200 | Half walk; standard. | `Data/movement.json : player.crouch_speed_cms` |
| Crawl speed | 130 | About a third of walk; crosses the 500 duct in ~4 s. | `Data/movement.json : player.crawl_speed_cms` |
| Acceleration / braking | 1500 / 1800 cm/s^2 | Reaches walk speed in ~0.27 s and stops in ~0.22 s: the character has weight, not instant velocity (REQ-G1-003). | `Data/movement.json : player.max_acceleration_cms2`, `player.braking_deceleration_cms2` |
| Stance transition | 0.20 s | Capsule and camera interpolate over ~0.2 s between stances, as the spec asks. | `Data/movement.json : player.stance_transition_s` |
| Coyote time | 0.10 s | Jump still accepted 0.1 s after leaving a ledge, as the spec asks. | `Data/movement.json : player.coyote_time_s` |
| Stand-up clearance probe margin | 4 | Standing up is blocked unless the taller capsule plus 4 cm fits; prevents clipping into low geometry. | `Data/movement.json : player.stand_clearance_probe_margin_cm` |
| Pitch clamp | -89 / +89 | As the spec asks. | `Data/movement.json : player.pitch_min_deg`, `player.pitch_max_deg` |
| Wall thickness | 20 | Interior partition; rooms that share a wall are separated by exactly this in `Data/floorplan.json`. | `Data/metrics.json : architecture.wall_thickness_cm` |
| Reference figure | 180 H x 50 W x 30 D | The spec's 180 cm figure, one per room and beside every gym element. A scale reference, not an obstacle: no collision (`Data/greybox_style.json : reference_figure.collision`), so the REQ-G1-007 wall-slide passes the figures that stand against corridor walls. | `Data/metrics.json : architecture.reference_figure_*` |

## 2. Derived rules (checked by `Tools/validate_floorplan.mjs`)

With capsule radius 36 the capsule diameter is **72**.

| Rule (from the spec) | Computation | Result |
|---|---|---|
| Door clear width >= capsule diameter + 40 | 72 + 40 = 112; chosen door 120 | **OK**, 8 cm margin |
| Corridor width >= 3 x capsule diameter | 3 x 72 = 216; chosen corridor 280 | **OK**, 64 cm margin |
| Duct passable crawling only | crawl 64 (effective capsule 72, see row 5) < clear mouth 83 (95 minus a 6 cm floor lip and a 6 cm head bar) < duct 95 < crouch 116 < stand 184 | **OK**: crawl enters with about 9 cm at the mouth and has 23 cm inside; crouch and stand are blocked. The +4 cm stand-up probe is irrelevant to entry; it matters only for standing up inside (72 + 4 = 76 < 95, so standing is refused by the 95 ceiling, not the probe) |
| Duct width admits the capsule | 72 < 100 | **OK**, 14 cm each side |
| Door header above standing capsule | 184 < 220 | **OK**, 36 cm |
| Office ceiling above jump apex | 184 + 95 = 279 < 310 | **OK**, 31 cm |
| Wet-room ceiling above jump apex | 279 < 280 | OK by 1 cm - see note above |

If Rob picks a different capsule radius in the feel gym, the door and corridor minimums move with it: door >= 2r + 40, corridor >= 6r. The validator recomputes them from `Data/movement.json`; nothing has to be edited by hand.

**Doorway jump note (checklist item 12, "jump in a doorway - you shouldn't bonk your head").** A 220 header and a 184 capsule leave 36 cm; a 95 cm jump started under the header will contact it about 0.09 s into the jump. That is arithmetic, not a defect of the build. The feel gym's 220-high doorways will show whether this reads as a bonk. If it does, the options are: raise door headers (game "tall door", e.g. 240-250) and note the deviation here, or accept it. The agent's default is to keep 220 as specified and let Rob decide from the gym.

## 3. Feel gym -> metrics mapping (REQ-G1-004)

Every element of `/Game/Maps/L_FeelGym` exists to settle one or more rows above. Element dimensions come from `Data/metrics.json : feel_gym`.

| Gym element (labelled) | Settles | How to read the result |
|---|---|---|
| Doorways 90 / 110 / 120 / 140 wide, all 220 high | Row 11 door width; indirectly row 2 capsule radius | The narrowest width you pass without slowing or adjusting is the door. If it is narrower than 120, the capsule can shrink (door - 40) / 2. The 220 header also answers the doorway-jump note. |
| Corridors 200 / 260 / 320 wide, 10 m long | Row 12 corridor width; rows 6-7 walk and sprint speed | Pick the one that feels like a building, not a tunnel or a warehouse. Walking the 10 m also calibrates speed: 2.5 s at 400, 1.7 s at 600. |
| Three rooms at ceiling 270 / 300 / 350 | Row 13 office ceiling; wet-room ceiling | Stand in each and look up: oppressive, right, or cavernous. 270 is the proxy for the restrooms. |
| Jump staircase, ledges 40 / 60 / 80 / 100 / 120 | Row 8 jump height; acceleration and gravity feel | The highest ledge you clear is about jump height minus 5-10 cm of landing margin (95 clears 80, not 100). Weighty vs floaty is the gravity/air-control feel. |
| Step ramp 20 -> 60 in nine steps | Row 9 max step height | Where the character stops stepping up and starts blocking is the step height (expected: 40 passes, 45 blocks). |
| Crawl tunnels 90 / 100 / 110 high, 100 wide, 5 m long | Row 15 duct interior height; row 5 crawl height | The lowest tunnel that does not feel crushing is the duct height. The crawl capsule (64) stays; only the duct changes. The gym tunnels have **no mouth lips**, so the level's duct entry (clear 100 x 83) is 12 cm tighter than the 95 gym tunnel; if the level entry feels tight and the gym does not, the lips are the difference. |
| 180 cm reference figure beside every element | Rows 1 and 3 stand height and eye height | Do you feel human-sized next to it? If the figure looks tall, raise eye height toward 170; if short, lower toward 160. |
| The whole gym floor | Look sensitivity (not a metrics row) | Turn 180 degrees with the mouse: laggy, floaty, or right. `Data/movement.json : player.look_sensitivity_deg_per_unit` (0.07 now). |

After Rob reports, the agent updates the JSON, regenerates both maps, updates this table, and re-issues the Gate 1 revision. On approval this file gets a `FROZEN <date>` header and every later gate builds to it (REQ-G1-002 acceptance 2: every greybox dimension within 5% of this document).
