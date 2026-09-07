// Generator for the gate-1 law-firm floor (lead design). Emits Data/candidates/legal_lead.json.
// Plan space: photo x right, y down toward the CEO window (Docs/FLOORPLAN-SCHEMA.md). All cm.
// Run: node Docs/candidates/legal_lead.build.mjs [out.json]
import fs from 'node:fs'
import path from 'node:path'

const out = process.argv[2] || path.resolve('Data/candidates/legal_lead.json')

// ---- rooms: [id, label, x, y, w, h, ceiling, finish, enterable, role] ------------------------------
const ROOMS = [
  // north-east start
  ['supply_closet', 'Supply Closet', 5000, 0, 430, 430, 310, 'concrete', true, 'start'],
  // north row (y 950-1730)
  ['office_2', 'Office #2 (associate)', 500, 950, 480, 480, 310, 'carpet', true, 'optional'],
  ['office_1', 'Office #1 (associate)', 1000, 950, 480, 480, 310, 'carpet', true, 'optional'],
  ['west_lobby', 'West Lobby', 500, 1450, 980, 580, 310, 'carpet', true, 'transit'],
  ['partner_1', 'Partner Office 1', 1500, 950, 480, 780, 310, 'carpet', true, 'optional'],
  ['partner_2', 'Partner Office 2', 2000, 950, 480, 780, 310, 'carpet', true, 'optional'],
  ['library', 'Law Library', 2500, 950, 980, 780, 330, 'carpet', true, 'optional'],
  ['assoc_3', 'Associate Office 3', 3500, 950, 480, 780, 310, 'carpet', true, 'optional'],
  ['assoc_4', 'Associate Office 4', 4000, 950, 480, 780, 310, 'carpet', true, 'optional'],
  ['break_room', 'Break Room / Kitchenette', 4500, 950, 980, 780, 310, 'tile', true, 'transit'],
  // north corridor pair (y 1750-2030)
  ['corridor_north_w', 'North Corridor (west)', 1500, 1750, 1480, 280, 310, 'carpet', true, 'transit'],
  ['corridor_main', 'North Corridor (east) - main', 3000, 1750, 1980, 280, 310, 'carpet', true, 'transit'],
  // core band (y 2050-3030)
  ['gallery_west', 'West Gallery', 500, 2050, 480, 980, 310, 'carpet', true, 'transit'],
  ['mens_restroom', "Men's Restroom", 1000, 2050, 480, 480, 280, 'tile', true, 'optional'],
  ['womens_restroom', "Women's Restroom (locked)", 1000, 2550, 480, 480, 280, 'tile', false, 'sealed'],
  ['elevator_lobby', 'Elevator Lobby', 5000, 2050, 480, 480, 310, 'tile', true, 'dead_end'],
  ['stairwell', 'Stairwell (locked)', 1500, 2550, 480, 480, 310, 'concrete', false, 'sealed'],
  ['it_server', 'Server / IT Closet', 2000, 2050, 480, 480, 310, 'concrete', true, 'optional'],
  ['janitor', 'Janitor Closet', 2000, 2550, 480, 480, 310, 'concrete', true, 'optional'],
  ['copy_mail', 'Copy / Mail Room', 2500, 2050, 780, 480, 310, 'carpet', true, 'optional'],
  ['file_room', 'Records / File Room', 2500, 2550, 780, 480, 310, 'concrete', true, 'optional'],
  ['bullpen', 'Paralegal Bullpen', 3300, 2050, 1380, 980, 310, 'carpet', true, 'transit'],
  ['corridor_east', 'East Corridor', 4700, 2050, 280, 980, 310, 'carpet', true, 'transit'],
  ['assoc_1', 'Associate Office 1', 1500, 2050, 480, 480, 310, 'carpet', true, 'optional'],
  ['assoc_2', 'Associate Office 2', 5000, 2550, 480, 480, 310, 'carpet', true, 'optional'],
  ['corridor_blocked', 'Collapsed Corridor', 0, 2050, 480, 280, 310, 'carpet', true, 'dead_end'],
  ['storage_west', 'Storage', 0, 2550, 480, 480, 310, 'concrete', true, 'optional'],
  // south corridor (y 3050-3330)
  ['corridor_south', 'South Corridor', 500, 3050, 4480, 280, 310, 'carpet', true, 'transit'],
  // south row (y 3350-3980) and spurs
  ['boardroom', 'Boardroom', 500, 3350, 1580, 630, 310, 'carpet', true, 'optional'],
  ['corridor_sw', 'South-West Spur', 2100, 3350, 280, 1430, 310, 'carpet', true, 'dead_end'],
  ['reception', 'Reception', 2400, 3350, 1480, 630, 310, 'carpet', true, 'transit'],
  ['corridor_se', 'South-East Spur', 3900, 3350, 280, 1430, 310, 'carpet', true, 'dead_end'],
  ['conference_small', 'Conference Room', 4200, 3350, 780, 630, 310, 'carpet', true, 'optional'],
  // bottom row (y 4000-4780), window wall at y 4780
  ['partner_4', 'Partner Office 4', 500, 4000, 780, 780, 310, 'carpet', true, 'optional'],
  ['partner_3', 'Partner Office 3', 1300, 4000, 780, 780, 310, 'carpet', true, 'optional'],
  ['ceo_office', "Managing Partner's Office", 2400, 4000, 1480, 780, 310, 'carpet', true, 'goal'],
  ['partner_5', 'Partner Office 5', 4200, 4000, 780, 780, 310, 'carpet', true, 'optional'],
]
const rooms = ROOMS.map(([id, label, x, y, w, h, ceiling_cm, floor_finish, enterable, role]) =>
  ({ id, label, rect: { x, y, w, h }, ceiling_cm, floor_finish, enterable, role }))
const R = Object.fromEntries(rooms.map(r => [r.id, r.rect]))

// ---- openings ---------------------------------------------------------------------------------------
const openings = []
const op = (type, a, b, wall, center, width = 120, height = 220, id) =>
  openings.push({ id: id || `${type}_${a}_to_${b}`, type, between: [a, b], wall, center_along_wall_cm: center, width_cm: width, height_cm: height })
const door = (a, b, wall, center) => op('door', a, b, wall, center)
const open = (a, b, wall, center, width) => op('open', a, b, wall, center, width, 290)
const locked = (a, b, wall, center) => op('locked_door', a, b, wall, center)

// north row doors (south walls) onto the lobby / north corridors
door('office_2', 'west_lobby', 'south', 740)
door('office_1', 'west_lobby', 'south', 1240)
door('partner_1', 'corridor_north_w', 'south', 1740)
door('partner_2', 'corridor_north_w', 'south', 2240)
door('library', 'corridor_north_w', 'south', 2740)
door('assoc_3', 'corridor_main', 'south', 3740)
door('assoc_4', 'corridor_main', 'south', 4240)
door('break_room', 'corridor_main', 'south', 4740)
// corridor joins
open('west_lobby', 'corridor_north_w', 'east', 1890, 280)
open('corridor_north_w', 'corridor_main', 'east', 1890, 280)
open('corridor_main', 'corridor_east', 'south', 4840, 280)
open('corridor_east', 'corridor_south', 'south', 4840, 280)
open('west_lobby', 'gallery_west', 'south', 740, 480)
open('gallery_west', 'corridor_south', 'south', 740, 480)
open('gallery_west', 'corridor_blocked', 'west', 2190, 280)
// core rooms
door('mens_restroom', 'west_lobby', 'north', 1240)
locked('womens_restroom', 'corridor_south', 'south', 1240)
open('elevator_lobby', 'corridor_east', 'west', 2290, 480)
locked('stairwell', 'corridor_south', 'south', 1740)
door('it_server', 'corridor_north_w', 'north', 2240)
door('janitor', 'corridor_south', 'south', 2240)
door('copy_mail', 'corridor_north_w', 'north', 2890)
door('file_room', 'corridor_south', 'south', 2890)
open('bullpen', 'corridor_main', 'north', 3990, 280)
open('bullpen', 'corridor_south', 'south', 3990, 280)
door('assoc_1', 'corridor_north_w', 'north', 1740)
door('assoc_2', 'corridor_east', 'west', 2790)
door('storage_west', 'gallery_west', 'east', 2790)
// south row and spurs
open('corridor_sw', 'corridor_south', 'north', 2240, 280)
open('corridor_se', 'corridor_south', 'north', 4040, 280)
open('reception', 'corridor_south', 'north', 3140, 480)
door('boardroom', 'corridor_sw', 'east', 3660)
door('conference_small', 'corridor_se', 'west', 3660)
door('partner_4', 'boardroom', 'north', 890)
door('partner_3', 'corridor_sw', 'east', 4390)
door('partner_5', 'corridor_se', 'west', 4390)
door('reception', 'ceo_office', 'south', 3140)
op('window', 'ceo_office', 'exterior', 'south', 3140, 1480, 260, 'window_ceo_city')

// ---- duct, blockers -----------------------------------------------------------------------------------
const ducts = [{ id: 'duct_supply_to_break', from: 'supply_closet', to: 'break_room', axis: 'y', start: { x: 5210, y: 430 }, length_cm: 520, interior_width_cm: 100, interior_height_cm: 95, floor_offset_cm: 0 }]
const blockers = [
  { id: 'collapse', kind: 'collapse', room: 'corridor_blocked', depth_cm: 200 },
  { id: 'elevator', kind: 'elevator_doors', room: 'elevator_lobby', wall: 'east', width_cm: 200, height_cm: 220 },
]

// ---- markers ------------------------------------------------------------------------------------------
const markers = [{ id: 'player_start', kind: 'player_start', room: 'supply_closet', pos: { x: 5210, y: 150 }, yaw_deg: 90 }]
// one reference figure per room, tucked into a corner clear of doors (dx, dy from the room origin)
const REF_OFFSET = { corridor_north_w: [100, 140], corridor_main: [1880, 140], corridor_south: [100, 140], corridor_east: [140, 880], corridor_sw: [140, 100], corridor_se: [140, 1330], corridor_blocked: [100, 140], gallery_west: [380, 500], west_lobby: [880, 100], bullpen: [1280, 880], reception: [100, 100], ceo_office: [100, 300], boardroom: [1480, 100], library: [880, 100], break_room: [100, 680] }
for (const r of rooms) {
  const [dx, dy] = REF_OFFSET[r.id] || [80, 80]
  markers.push({ id: `ref_${r.id}`, kind: 'reference_figure', room: r.id, pos: { x: r.rect.x + dx, y: r.rect.y + dy } })
}
const note = (id, room, x, y, text) => markers.push({ id: `note_${id}`, kind: 'note', room, pos: { x, y }, text })
note('racks', 'supply_closet', 5380, 210, 'Supply racks along the EAST wall (x 5370-5430, full length, ~200 tall); seated man leans on them (Gate 2)')
note('intern', 'supply_closet', 5050, 330, 'Young woman (intern) seated against the WEST wall near the SW corner (Gate 2)')
note('kitchen', 'break_room', 5300, 1300, 'Kitchenette run along the EAST wall (counter, sink, fridge at the SE corner); round table D120 + 4 chairs centred at (4950,1340), one chair pushed out (Gate 2)')
note('guard', 'corridor_main', 4600, 1800, 'Dead security guard lying along the north wall x 4300-4480, shotgun beside him at (4540,1820) with the green halo (Gate 2/4)')
note('bullpen_desks', 'bullpen', 3990, 2540, 'Three desk islands (each 4 workstations, 360 x 240) at x 3500/3990/4480 centred y 2540; paper drifts, one overturned chair (Gate 2)')
note('files', 'file_room', 2890, 2790, 'Four rolling shelving stacks (each 400 x 60, 220 tall) running N-S at x 2600/2760/2920/3080 with 100 cm aisles - the ambush maze (Gate 2)')
note('servers', 'it_server', 2240, 2290, 'Two server racks against the EAST wall (60 x 100 x 200) with blinking LEDs still on; UPS hum (Gate 2/3)')
note('copiers', 'copy_mail', 2890, 2290, 'Two copiers along the NORTH wall, mail sorting counter along the south wall (Gate 2)')
note('library_shelves', 'library', 2990, 1340, 'Six double-sided book stacks (500 x 60, 220 tall) running N-S at 150 cm spacing; reading table at the east end (Gate 2)')
note('boardroom_table', 'boardroom', 1290, 3660, 'Boardroom table 600 x 160 centred, 14 chairs, wall screen on the WEST wall; a meeting interrupted (Gate 2)')
note('reception_desk', 'reception', 3140, 3550, 'Reception desk 240 x 90 centred at (3140,3550) facing the corridor opening; chair pushed back; monitor still lit (Gate 2/4)')
note('ceo_desk', 'ceo_office', 2900, 4400, "Managing partner's desk 180 x 80 at (2900,4400) angled toward the window; dead CEO slumped behind it (Gate 2/4)")
note('couch', 'ceo_office', 2650, 4650, 'Couch + coffee table set along the WEST half in front of the glass, perpendicular pair with the table between (Gate 2)')
note('elevator_doors', 'elevator_lobby', 5400, 2290, 'Shut elevator doors 200 wide on the EAST (exterior) wall; call button lit; scratch marks (Gate 2/3)')
note('collapse', 'corridor_blocked', 240, 2190, 'Ceiling collapse fills the west end: slab tilt, cables, dust; impassable by every stance (Gate 2/3)')
note('stair', 'stairwell', 1740, 2790, 'Fire stair, door locked from the corridor side (LOCKED label); emergency light behind the glass slit (Gate 3)')
note('conference', 'conference_small', 4590, 3660, 'Conference table 360 x 120, 8 chairs, whiteboard covered in case notes (Gate 2)')
note('partner_5_window', 'partner_5', 4590, 4650, 'Corner partner office: the second exterior window (dark city, no fire) along the SOUTH wall (Gate 3)')

// ---- checkpoints, encounters, scenes, money shot ------------------------------------------------------
const checkpoints = [
  { id: 'cp_start', room: 'supply_closet', pos: { x: 5210, y: 150 }, yaw_deg: 90 },
  { id: 'cp_break_room', room: 'break_room', pos: { x: 5210, y: 1100 }, yaw_deg: 180 },
  { id: 'cp_corridor_post_pickup', room: 'corridor_main', pos: { x: 4400, y: 1890 }, yaw_deg: 180 },
  { id: 'cp_ceo_entry', room: 'ceo_office', pos: { x: 3140, y: 4040 }, yaw_deg: 90 },
]
const encounters = [
  { id: 'demon_1', room: 'west_lobby', spawn: { x: 740, y: 1530 }, trigger_rect: { x: 1500, y: 1750, w: 280, h: 280 }, player_approach: { x: 1240, y: 1800 }, retreat_dir: 'east', retreat_clear_cm: 900, strafe_clear_each_side_cm: 200, capsule_radius_cm: 45, capsule_height_cm: 220 },
  { id: 'demon_2', room: 'ceo_office', spawn: { x: 3650, y: 4620 }, trigger_rect: { x: 2400, y: 4100, w: 1480, h: 100 }, player_approach: { x: 3140, y: 4250 }, retreat_dir: 'west', retreat_clear_cm: 700, strafe_clear_each_side_cm: 250, capsule_radius_cm: 60, capsule_height_cm: 300 },
]
const sc = (id, room, kind, x, y, w, h, facing_deg, description) => ({ id, room, kind, rect: { x, y, w, h }, facing_deg, description })
const scenes = [
  sc('sc_break_trail', 'break_room', 'reveal', 4600, 1150, 250, 150, 180, 'Early reveal: a blood drag trail from the duct exit across the tile to the corridor door; the fridge light flickers.'),
  sc('sc_guard_shotgun', 'corridor_main', 'pickup', 4460, 1780, 200, 150, 180, 'The dead guard and the shotgun pickup with its green halo, seen the moment the player steps out of the Break Room.'),
  sc('sc_bullpen_massacre', 'bullpen', 'scene', 3800, 2400, 400, 300, 90, 'Tableau: overturned desk islands, a body under a desk, monitors still on; first seen through the wide north opening.'),
  sc('sc_files_ambush', 'file_room', 'ambush', 2760, 2650, 160, 200, 90, 'Ambush between the rolling shelving aisles: a demon bursts through a stack as the player reaches the middle aisle.'),
  sc('sc_library_lurker', 'library', 'monster', 3250, 1100, 200, 200, 180, 'Monster slot at the library dead end behind the last book stack; stalks the reading table.'),
  sc('sc_server_pickup', 'it_server', 'pickup', 2320, 2400, 120, 120, 180, 'Pickup on the rack shelf (shells / keycard); the only lit room in the core.'),
  sc('sc_boardroom', 'boardroom', 'scene', 1290, 3560, 500, 200, 90, 'Scene: the interrupted meeting - chairs pushed back, a projector still running, one partner still in his seat.'),
  sc('sc_spur_sw', 'corridor_sw', 'monster', 2160, 4500, 160, 240, 270, 'Monster slot at the south-west spur dead end; the player is baited down by the lit partner door.'),
  sc('sc_junction_ambush', 'corridor_south', 'ambush', 3850, 3100, 280, 180, 0, 'Ambush at the bullpen south opening: a hostile pours out as the player passes toward reception.'),
  sc('sc_reception_glow', 'reception', 'reveal', 2900, 3700, 480, 150, 90, 'Reveal: the first orange firelight spilling through the CEO door onto the reception carpet.'),
  sc('sc_partner_5', 'partner_5', 'monster', 4500, 4200, 200, 200, 270, 'Monster slot in the corner partner office at the end of the south-east spur.'),
]
const money_shot = {
  room: 'ceo_office', window_wall: 'south', entry_opening_id: 'door_reception_to_ceo_office',
  dividing_wall: { along: 'x', at_y: 4400, from_x: 3300, to_x: 3880, height_cm: 310 },
  dwell_rect: { x: 2840, y: 4630, w: 600, h: 150 },
}
const critical_path = ['supply_closet', 'break_room', 'corridor_main', 'corridor_north_w', 'west_lobby', 'gallery_west', 'corridor_south', 'reception', 'ceo_office']

// ---- assemble, sanity-check, write --------------------------------------------------------------------
const plan = {
  version: 1, units: 'cm', source_drawing: 'SourceAssets/reference/game_layout.jpg',
  notes: "Gate-1 law-firm floor (Rob's 2026-09-06 brief): one compact floor of a mid-size firm laid out as a ring corridor around a service core with a west lobby, two dead-end spurs to the south, a collapsed spur to the west and a shortcut through the paralegal bullpen. The spec's fixed adjacency is the spine: supply closet (duct only) -> break room -> north corridor -> west lobby (Demon #1) -> west gallery -> south corridor -> reception -> managing partner's office (window wall opposite the door, dividing wall screening Demon #2). Eleven staging slots reserve monster, ambush, scene, pickup and reveal beats.",
  rooms, openings, ducts, blockers, markers, checkpoints, encounters, scenes, money_shot, critical_path,
}
// quick self-checks: grid, no overlaps, one wall between neighbours where they touch
const bad = []
for (const r of rooms) {
  const { x, y, w, h } = r.rect
  if (x % 50 || y % 50 || (w + 20) % 50 || (h + 20) % 50) bad.push(`${r.id}: off the 50 cm module ${JSON.stringify(r.rect)}`)
}
for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
  const a = rooms[i].rect, b = rooms[j].rect
  const ox = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x), oy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y)
  if (ox > 0 && oy > 0) bad.push(`overlap ${rooms[i].id} / ${rooms[j].id}`)
  if (ox > 0 && oy === 0) bad.push(`touching without wall ${rooms[i].id} / ${rooms[j].id}`)
  if (oy > 0 && ox === 0) bad.push(`touching without wall ${rooms[i].id} / ${rooms[j].id}`)
}
for (const o of openings) {
  const a = R[o.between[0]], b = o.between[1] === 'exterior' ? null : R[o.between[1]]
  if (!a || (o.between[1] !== 'exterior' && !b)) { bad.push(`opening ${o.id}: unknown room`); continue }
  if (!b) continue
  const half = o.width_cm / 2
  const ns = o.wall === 'north' || o.wall === 'south'
  const gapOk = ns ? (o.wall === 'south' ? b.y === a.y + a.h + 20 : a.y === b.y + b.h + 20) : (o.wall === 'east' ? b.x === a.x + a.w + 20 : a.x === b.x + b.w + 20)
  if (!gapOk) bad.push(`opening ${o.id}: rooms not one wall apart on the ${o.wall} side`)
  const lo = ns ? Math.max(a.x, b.x) : Math.max(a.y, b.y), hi = ns ? Math.min(a.x + a.w, b.x + b.w) : Math.min(a.y + a.h, b.y + b.h)
  if (o.center_along_wall_cm - half < lo || o.center_along_wall_cm + half > hi) bad.push(`opening ${o.id}: not inside shared extent ${lo}-${hi}`)
}
const ids = new Set(); for (const r of rooms) { if (ids.has(r.id)) bad.push(`dup room ${r.id}`); ids.add(r.id) }
if (bad.length) { console.error('SELF-CHECK FAILED:\n  ' + bad.join('\n  ')); process.exit(1) }

const sortKeys = (v) => Array.isArray(v) ? v.map(sortKeys) : (v && typeof v === 'object') ? Object.fromEntries(Object.keys(v).sort().map(k => [k, sortKeys(v[k])])) : v
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, JSON.stringify(sortKeys(plan), null, 2) + '\n')
const bx = Math.max(...rooms.map(r => r.rect.x + r.rect.w)), by = Math.max(...rooms.map(r => r.rect.y + r.rect.h))
console.log(`wrote ${out}: ${rooms.length} rooms, ${openings.length} openings, ${scenes.length} scenes, ${markers.length} markers; footprint ${bx} x ${by} cm`)
