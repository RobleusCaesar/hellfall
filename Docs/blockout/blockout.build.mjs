#!/usr/bin/env node
// blockout.build.mjs - Gate 2 blockout placement generator (REQ-G2-002..005) -> Data/blockout.json.
// Usage: node Docs/blockout/blockout.build.mjs [out.json]      (default Data/blockout.json; never hand-edit the output)
// Plan space throughout: x right, y down toward the window, cm. The placement is a TABLE (one line per item); every
// footprint is self-checked (inside its room, no overlap, door-swing / lane / checkpoint / start / scene / sightline
// free, corridor clear width) and the script refuses to write on any failure. Rationale: Docs/blockout/BLOCKOUT.md.
// Sizes come from the Blender audit (Docs/audit/blender_audit_2026-09-07.json, REQ-G2-001); thresholds from
// Data/greybox_style.json blockout.rules, Data/metrics.json and Data/movement.json - nothing numeric is invented here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const fp = rd('Data/floorplan.json'), metrics = rd('Data/metrics.json'), movement = rd('Data/movement.json');
const style = rd('Data/greybox_style.json'), audit = rd('Docs/audit/blender_audit_2026-09-07.json');
const glbAudit = new Map(fs.readFileSync(path.join(ROOT, 'Docs/audit/glb_audit.jsonl'), 'utf8').trim().split(/\r?\n/).map((l) => { const o = JSON.parse(l); return [o.file, o]; }));
const OUT = process.argv[2] || 'Data/blockout.json';

const RULES = style.blockout.rules;
const CAP_R = movement.player.capsule_radius_cm;              // 36: lanes are widened by this
const STEP = movement.player.max_step_height_cm;               // 40: items this low are stepped over
const WALL_T = metrics.architecture.wall_thickness_cm;         // 20
const CLEAR_MIN = 3 * 2 * CAP_R;                               // 216 corridor clear width (metrics derived rule) - props / fixtures
const BODY_MIN = RULES.corridor_clear_min_past_body_cm;        // 150 clear width past a CHARACTER against a corridor wall (a body you step past, not architecture)
const BODY_POSES = new Set(['seated', 'prone', 'slumped']);    // the poses the waiver covers (every character pose: a body on the floor / against a wall)
const CHOKE_MIN = metrics.architecture.corridor_width_cm;      // 280 chokepoint minimum (REQ-G2-004)
const MARGIN = RULES.wall_margin_cm, SWING = RULES.door_swing_cm, CP_R = RULES.checkpoint_clear_radius_cm;
const START_R = RULES.player_start_clear_radius_cm, STRIP_HALF = RULES.sightline_half_width_cm;
const EPS = 0.5;

const rooms = new Map(fp.rooms.map((r) => [r.id, r]));
const R = (id) => { const r = rooms.get(id); if (!r) throw new Error(`unknown room ${id}`); return r.rect; };
const rnd = (v) => Math.round(v * 10) / 10;

// ---- asset slots: the REQ-G2-001 decisions, copied from the Blender audit; the shotgun is re-oriented to lie flat ---
const asset_slots = {};
for (const [name, a] of Object.entries(audit.asset_slots)) {
  const rel = a.source.replace(/^SourceAssets\/models\//, '');
  const node = glbAudit.get(rel);
  // normalized_size_m / tris are the AUDITED values (Blender rest pose, Z-up W x D x H, Docs/audit/blender_audit_2026-09-07.json)
  // - the schema's primary fields, what the Gate 4 scale script divides target_size_cm by. The node header parser's view
  // (Docs/audit/glb_audit.jsonl, glTF Y-up order) rides along as parser_size_m / tris_parser for the record only: it is 100x
  // too small for the two skinned demons (audit headline finding 1), so nothing downstream may scale from it.
  asset_slots[name] = { source: a.source, class: a.class, target_size_cm: { ...a.target_size_cm }, pivot: a.pivot,
    normalized_size_m: a.normalized_size_m, tris: a.tris,
    ...(node ? { parser_size_m: node.sizeXYZ_m, tris_parser: node.tris } : {}), note: a.note };
}
{ // world pickup lies on the floor: the audit's upright profile height (22.4) becomes the footprint width
  const s = asset_slots.SM_Shotgun, t = s.target_size_cm;
  s.target_size_cm = { w: t.w, d: t.h, h: t.d };
  s.note += ' Blockout orientation: lying flat beside the guard, so the audit d/h (6.2 / 22.4 upright) are swapped: 120 long x 22 wide x 6 high.';
}
const T = (slot) => asset_slots[slot].target_size_cm;
const dims = (slot) => ({ w: Math.round(T(slot).w), d: Math.round(T(slot).d), h: Math.round(T(slot).h) });

// ---- placement helpers ------------------------------------------------------------------------------------------
const props = [], characters = [], pickups = [];
// floor prop: w along local x before yaw, d along local y, h up; pos = footprint centre
function P(id, room, slot, label, kind, x, y, yaw, w, d, h, note = '') {
  props.push({ id, room, slot, label, kind, pos: { x, y }, yaw_deg: yaw, size: { w, d, h }, mount: 'floor', z_cm: 0, note });
}
// wall prop, flush on `wall`: `along` = centre coordinate along the wall (x for N/S, y for E/W); w runs along the wall,
// d out from it. pos is the true centre so the generator's snap (pos ignored along the normal) changes nothing.
function W(id, room, slot, label, kind, wall, along, w, d, h, note = '', z = 0) {
  const r = R(room), yaw = wall === 'north' || wall === 'south' ? 0 : 90;
  const pos = wall === 'north' ? { x: along, y: r.y + d / 2 } : wall === 'south' ? { x: along, y: r.y + r.h - d / 2 }
    : wall === 'west' ? { x: r.x + d / 2, y: along } : { x: r.x + r.w - d / 2, y: along };
  props.push({ id, room, slot, label, kind, pos, yaw_deg: yaw, size: { w, d, h }, mount: 'wall', wall, z_cm: z, note });
}
// character: yaw = facing; w ACROSS the body, d back-to-front along the facing (greybox_style character convention).
// contact wall:<side> -> back flush on that wall (facing away from it); prop:<id> -> back flush on that prop's face.
function C(id, room, slot, label, pose, x, y, yaw, w, d, h, contact, note) {
  characters.push({ id, room, slot, label, pose, pos: { x, y }, yaw_deg: yaw, size: { w, d, h }, contact, note });
}
const FACE_AWAY = { north: 90, south: 270, west: 0, east: 180 };
function CW(id, room, slot, label, pose, wall, along, w, d, h, note) {   // character with its back on a room wall
  const r = R(room), pos = wall === 'north' ? { x: along, y: r.y + d / 2 } : wall === 'south' ? { x: along, y: r.y + r.h - d / 2 }
    : wall === 'west' ? { x: r.x + d / 2, y: along } : { x: r.x + r.w - d / 2, y: along };
  C(id, room, slot, label, pose, pos.x, pos.y, FACE_AWAY[wall], w, d, h, `wall:${wall}`, note);
}
function K(id, room, slot, label, x, y, yaw, w, d, h, note) { pickups.push({ id, room, slot, label, pos: { x, y }, yaw_deg: yaw, size: { w, d, h }, halo: true, note }); }
// generic law-firm kit (no asset): sizes are ordinary office furniture, recorded once here
const KIT = { desk: [160, 80, 75], pdesk: [200, 90, 75], chair: [50, 50, 95], exec: [60, 60, 110], guest: [50, 50, 90],
  bookcase_d: 40, credenza: [200, 45, 80], filing: [60, 45, 130], couch: [180, 80, 85], stall_partition: [5, 150, 200],
  // corridor / lobby dressing (all <= 50 deep so a 280 corridor keeps >= 230 past them; wall-hung cabinets carry a z)
  console: [120, 35, 80], side_console: [90, 35, 80], planter: [40, 40, 120], cooler: [35, 35, 110], bench: [180, 50, 45],
  ext_cabinet: [30, 20, 70], hose_cabinet: [60, 20, 80], notice_board: [120, 5, 90], cart: [100, 50, 100] };
const EXT_Z = 90, HOSE_Z = 90, NOTICE_Z = 100;                                  // wall-hung bottoms (cm above the floor)
const chair = (id, room, x, y, yaw = 0, note = '') => P(id, room, null, 'Office chair', 'furniture', x, y, yaw, ...KIT.chair, note);
const guest = (id, room, x, y, yaw = 0) => P(id, room, null, 'Guest chair', 'furniture', x, y, yaw, ...KIT.guest);
const desk = (id, room, x, y, yaw, note = '') => P(id, room, null, 'Associate desk', 'furniture', x, y, yaw, ...KIT.desk, note);
const pdesk = (id, room, x, y, yaw, note = '') => P(id, room, null, 'Partner desk', 'furniture', x, y, yaw, ...KIT.pdesk, note);
const exec = (id, room, x, y, yaw = 0) => P(id, room, null, 'Executive chair', 'furniture', x, y, yaw, ...KIT.exec);
const bookcase = (id, room, wall, along, w, h = 220) => W(id, room, null, 'Bookcase', 'furniture', wall, along, w, KIT.bookcase_d, h);
const credenza = (id, room, wall, along, w = KIT.credenza[0]) => W(id, room, null, 'Credenza', 'furniture', wall, along, w, KIT.credenza[1], KIT.credenza[2]);
// corridor / lobby / gallery dressing: wall items outside every swing zone, >= 36 from every lane, never in a scene rect
const consoleT = (id, room, wall, along, note = '') => W(id, room, null, 'Console table', 'furniture', wall, along, ...KIT.console, note);
const planter = (id, room, wall, along) => W(id, room, null, 'Planter', 'generic', wall, along, ...KIT.planter);
const cooler = (id, room, wall, along) => W(id, room, null, 'Water cooler', 'fixture', wall, along, ...KIT.cooler);
const bench = (id, room, wall, along) => W(id, room, null, 'Waiting bench', 'furniture', wall, along, ...KIT.bench);
const extinguisher = (id, room, wall, along) => W(id, room, null, 'Fire extinguisher cabinet', 'fixture', wall, along, ...KIT.ext_cabinet, `wall-hung, bottom at ${EXT_Z}`, EXT_Z);

// ================================ PLACEMENT TABLE (plan cm) ==========================================================
// --- supply closet (5000-5430, 0-430): racks in an L (full-length east wall + a north-wall section), the man wedged into the
//     NE corner leaning on the north rack, the intern on the west wall near the SW corner, the mop set on the west wall between.
//     The first move - player start (5210, 150) -> duct mouth (5210, 430), x 5174-5246 with the capsule - stays clear of everything
//     (a man leaning on the EAST rack cannot: his legs reach x 5226, and north of the start the cp_start disc (r 60) has no room).
W('rack_closet', 'supply_closet', null, 'Supply rack', 'rack', 'east', 215, 410, 60, 200, 'note_racks: full-length 60-deep rack on the east wall (x 5370-5430)');
W('rack_closet_n', 'supply_closet', null, 'Supply rack (north section)', 'rack', 'north', 5320, 100, 60, 200,
  'second rack section on the north wall (x 5270-5370), flush against the east rack: the L the seated man leans on');
C('man_sitting', 'supply_closet', 'SM_ManSitting', 'Seated man (leaning on the racks)', 'seated', 5370 - dims('SM_ManSitting').w / 2, 60 + dims('SM_ManSitting').d / 2, 90,
  dims('SM_ManSitting').w, dims('SM_ManSitting').d, dims('SM_ManSitting').h, 'prop:rack_closet_n',
  'REQ-G2-003: back flush on the north rack face (y 60), right shoulder on the east rack (x 5370), legs (144) run south to y 204 at x 5273-5370: 63 cm east of the player start (cp_start clear radius 60) and 27 cm clear of the start -> duct route (x 5174-5246); 49 deg right of the spawn view (FOV 90), so he is a look-right beat, not a shin-bump');
CW('intern_sitting', 'supply_closet', 'SM_InternSitting', 'Seated intern (knees up, back to the wall)', 'seated', 'west', 364.5,
  Math.round(T('SM_InternSitting').w), Math.round(T('SM_InternSitting').d), Math.round(T('SM_InternSitting').h),
  'note_intern: west wall near the SW corner (y 340-389), toes reach x 5085; the duct-mouth zone starts at x 5150');
P('mop_bucket', 'supply_closet', 'SM_MopAndBucket', 'Mop, wringer bucket + wet-floor sign', 'fixture', 5070, 155, 0, dims('SM_MopAndBucket').w, dims('SM_MopAndBucket').d, dims('SM_MopAndBucket').h,
  'ASSET-MANIFEST room (Supply Closet): on the west wall between the reference figure and the intern (x 5005-5135, y 105-205); 75 cm west of the start disc, 39 cm clear of the duct route');

// --- break room (4500-5480, 950-1730): kitchenette run east, fridge SE, table set, chairs (the guard is in the corridor, below) --
W('kitchen_counter', 'break_room', null, 'Kitchenette counter + sink', 'fixture', 'east', 1315, 630, 60, 90, 'note_kitchen: counter run y 1000-1630 on the east wall; uppers are a Gate 4 dressing note');
W('fridge', 'break_room', 'SM_RefrigeratorOpen', 'Fridge (door open)', 'fixture', 'east', 1680, dims('SM_RefrigeratorOpen').w, dims('SM_RefrigeratorOpen').d, dims('SM_RefrigeratorOpen').h,
  'SE corner of the kitchenette run; the open door is the 123 depth; light flickers (sc_break_trail)');
P('break_table_set', 'break_room', 'SM_KitchenLunchTable', 'Round table + 2 chairs (one mesh)', 'furniture', 4950, 1340, 0, dims('SM_KitchenLunchTable').w, dims('SM_KitchenLunchTable').d, dims('SM_KitchenLunchTable').h,
  'note_kitchen: table centred (4950, 1340); the mesh carries two chairs on the long (E/W) sides');
chair('break_chair_n', 'break_room', 4950, 1255, 0, 'third chair, tucked on the north side');
chair('break_chair_pushed', 'break_room', 4880, 1465, 30, 'REQ-G2-002: the chair pushed out and turned toward the corridor door - someone left in a hurry');

// --- corridor_main (3000-4980, 1750-2030): the guard + shotgun beat (REQ-G2-003 "dead security guard in the corridor between Break Room
//     and restrooms, with a shotgun-sized box beside him"; note_guard; sc_guard_shotgun; cp_corridor_post_pickup). LEAD DECISION 2026-09-07:
//     the spec placement is honoured with a 150 cm BODY WAIVER (rules.corridor_clear_min_past_body_cm) - the audited mesh is a seated slump
//     78 x 161 x 82, so along the north wall he leaves 280 - 78 = 202 of the corridor, under the 216 rule for props but over the 150 a body
//     you step past needs (capsule 72 + body 78). Free north-wall span between the assoc_4 door zone (x <= 4300) and the break-room door zone
//     (x >= 4680): 380 cm for 161 + 120 + a 9 cm gap. Both keep the cp_corridor_post_pickup disc ((4400, 1890) r 60 -> y <= 1830 at x 4400),
//     the bullpen opening zone (x 3850-4130, y 1910-2030) and both door zones clear; both lie in sc_guard_shotgun (x 4460-4660, y 1780-1930)
//     as ITS content (character / pickup in a pickup rect = WARN by design). Rob may still move him to the elevator alcove (BLOCKOUT.md Q1).
const GUARD = dims('SM_FallenSecurityGuard');   // 78 x 161 x 82: w = across the shoulders, d = legs out, h = crown
CW('guard', 'corridor_main', 'SM_FallenSecurityGuard', 'Dead security guard (seated slump, along the north wall)', 'slumped', 'north', 4380.5,
  GUARD.d, GUARD.w, GUARD.h,
  'REQ-G2-003 / note_guard / sc_guard_shotgun: along corridor_main\'s north wall, x 4300-4461 (note_guard said x 4300-4480), flush at y 1750, 78 deep to y 1828 - 62 cm north of the cp_corridor_post_pickup disc edge (r 60), the assoc_4 door zone ends at x 4300, the break-room door zone starts at x 4680. Box w (along the wall) carries the mesh\'s 161 cm leg axis, d (out from the wall) its 78 cm width: the slump lies ALONG the corridor as the spec reads, shoulder to the wall - Gate 4 poses the mesh to match or re-authors it prone. Clear width past him 202: under the 216 prop rule, over the 150 body waiver (rules.corridor_clear_min_past_body_cm - a body you step past, not architecture; lead decision 2026-09-07). Rob may move him to the elevator alcove (Q1).');
K('shotgun', 'corridor_main', 'SM_Shotgun', 'Shotgun pickup', 4530, 1781, 0, dims('SM_Shotgun').w, dims('SM_Shotgun').d, dims('SM_Shotgun').h,
  'sc_guard_shotgun: lying flat along the north wall beside the guard\'s hand, x 4470-4590, y 1770-1792 (9 cm east of him, 90 cm west of the break-room door zone), 6 high = stepped over, so it never counts against the corridor width; its 160 x 62 halo (item + 20 margin) sits flush on the wall face at y 1750-1812, inside the room; 98 cm north of the cp_corridor_post_pickup centre (disc r 60): the checkpoint keeps its meaning (post pickup), the scene rect and the checkpoint now have their content');

// --- men's restroom (1000-1480, 2050-2530): vanity west, urinals east, two wall-hung toilets in stalls south ---------
W('vanity', 'mens_restroom', 'SM_BathroomVanity', 'Three-basin vanity', 'fixture', 'west', 2323, dims('SM_BathroomVanity').w, dims('SM_BathroomVanity').d, dims('SM_BathroomVanity').h, 'west wall, mirror above is Gate 3');
W('urinal_1', 'mens_restroom', null, 'Urinal', 'fixture', 'east', 2220, 40, 35, 65, 'wall-hung, bottom at 40', 40);
W('urinal_2', 'mens_restroom', null, 'Urinal', 'fixture', 'east', 2280, 40, 35, 65, 'wall-hung, bottom at 40', 40);
W('stall_partition_1', 'mens_restroom', null, 'Stall partition', 'generic', 'south', 1287.5, ...KIT.stall_partition);
W('stall_partition_2', 'mens_restroom', null, 'Stall partition', 'generic', 'south', 1382.5, ...KIT.stall_partition);
W('toilet_1', 'mens_restroom', 'SM_ToiletBowl', 'Wall-hung toilet', 'fixture', 'south', 1335, dims('SM_ToiletBowl').w, dims('SM_ToiletBowl').d, dims('SM_ToiletBowl').h, 'audit: wall-hung bowl, box bottom at z 2', 2);
W('toilet_2', 'mens_restroom', 'SM_ToiletBowl', 'Wall-hung toilet', 'fixture', 'south', 1430, dims('SM_ToiletBowl').w, dims('SM_ToiletBowl').d, dims('SM_ToiletBowl').h, 'audit: wall-hung bowl, box bottom at z 2', 2);

// --- janitor (2000-2480, 2550-3030) ---------------------------------------------------------------------------------
P('janitor_cart', 'janitor', null, 'Cleaning cart', 'generic', 2410, 2600, 0, ...KIT.cart, 'NE corner of the closet, clear of the door zone (the mop set is in the supply closet, its ASSET-MANIFEST room)');
W('janitor_shelving', 'janitor', null, 'Utility shelving', 'rack', 'west', 2760, 400, 45, 200);
W('janitor_sink', 'janitor', null, 'Utility sink', 'fixture', 'north', 2130, 60, 55, 90);

// --- reception (2400-3880, 3350-3980): desk on the axis facing the corridor opening, benches, the CEO door leaf -------
P('reception_desk', 'reception', 'SM_ReceptionDesk', 'Reception desk (desk + chair + monitor, one mesh; chair side S)', 'furniture', 3140, 3559, 0, dims('SM_ReceptionDesk').w, dims('SM_ReceptionDesk').d, dims('SM_ReceptionDesk').h,
  'note_reception_desk / Q13: on the axis facing the 480 opening; the chair is part of the mesh (behind, SOUTH side); monitor still lit (Gate 3 emissive); 660 cm of floor each side to walk round it. Q2: slide east of the glow axis?');
P('reception_desk_front', 'reception', null, 'FRONT - corridor side (chair behind, S)', 'generic', 3140, 3475, 0, 30, 10, 5,
  'checklist 2: a 5 cm floor plate on the desk\'s north face marks which side is the front, since a square box cannot show where the baked-in chair is');
W('bench_west', 'reception', null, 'Waiting bench', 'furniture', 'west', 3590, 180, 50, 45);
W('bench_east', 'reception', null, 'Waiting bench', 'furniture', 'east', 3590, 180, 50, 45);
W('side_table', 'reception', null, 'Side table', 'furniture', 'west', 3730, 60, 60, 45);
P('broken_door', 'reception', 'SM_BrokenDoor', 'Broken door (the CEO door leaf, torn off and lying flat)', 'door', 3400, 3905, 0, dims('SM_BrokenDoor').w, dims('SM_BrokenDoor').d, dims('SM_BrokenDoor').h,
  'the burst-open CEO door told with the asset that fits it: the leaf lies 100 cm east of the door (x 3297-3503, y 3852-3958), clear of the 120 swing zone (x 3080-3200) and of sc_reception_glow (y 3700-3850); 12 cm high = walked over, and it no longer narrows a corridor');

// --- CEO office (2400-3880, 4000-4780): desk west of the axis, dead CEO between desk and glass, L-set SW, credenza -----
P('ceo_desk', 'ceo_office', 'SM_ReceptionDesk', 'Managing partner desk (reception desk reused)', 'furniture', 2900, 4400, 15, dims('SM_ReceptionDesk').w, dims('SM_ReceptionDesk').d, dims('SM_ReceptionDesk').h,
  'note_ceo_desk: (2900, 4400) angled 15 deg toward the glass; west of the sightline strip (x 3050) and south of the retreat lane (y 4286); 110 tall = below the eye line from the door');
C('ceo_dead', 'ceo_office', 'SM_CeoDead', 'Dead CEO (on his back, arms out)', 'prone', 2900, 4558.5, 180,
  Math.round(T('SM_CeoDead').w), Math.round(T('SM_CeoDead').d), Math.round(T('SM_CeoDead').h), 'floor',
  'REQ-G2-003: lying along x between the desk (y 4501) and the glass, hidden from the door by the 110 desk; 19 cm north of the dwell rect');
P('couch_set', 'ceo_office', 'SM_CeoCouchCoffeeTable', 'Couch + loveseat + coffee table (L-set, one mesh)', 'furniture', 2545, 4648, 0, dims('SM_CeoCouchCoffeeTable').w, dims('SM_CeoCouchCoffeeTable').d, dims('SM_CeoCouchCoffeeTable').h,
  'note_couch: SW corner in front of the west glass panes; one mesh holds the perpendicular pair with the table in front of the sofa (audit); 80 tall = below the eye line; 155 cm west of the dwell rect');
bookcase('ceo_credenza', 'ceo_office', 'north', 2550, 200, 200);
W('bar_cabinet', 'ceo_office', null, 'Bar cabinet', 'furniture', 'east', 4525, 150, 45, 100, 'dressing in the demon pocket behind the dividing wall; 125 cm east of the spawn capsule');
P('ceo_guest_n', 'ceo_office', null, 'Guest chair', 'furniture', 2700, 4350, 0, ...KIT.guest, 'beside the desk on the west (guest chairs in FRONT of it would sit in the retreat lane y 4214-4286); 39 above the lane');
P('ceo_guest_s', 'ceo_office', null, 'Guest chair', 'furniture', 2700, 4450, 0, ...KIT.guest);
W('ceo_console', 'ceo_office', null, 'Side console', 'furniture', 'east', 4050, ...KIT.side_console, 'east wall north of the trigger strip (y 4005-4095): fills the NE quadrant without touching the strafe lane (x 3140) or the door zone (x 3080-3200)');

// --- associate offices: desk + chair + guest chair + bookcase / credenza -----------------------------------------------
desk('office_2_desk', 'office_2', 740, 1140, 0, "the spec's Office #2 - Demon #1 comes out of its door"); chair('office_2_chair', 'office_2', 740, 1050); guest('office_2_guest', 'office_2', 900, 1200); bookcase('office_2_shelf', 'office_2', 'west', 1060, 120);
desk('office_1_desk', 'office_1', 1380, 1240, 90); chair('office_1_chair', 'office_1', 1450, 1240); guest('office_1_guest', 'office_1', 1200, 1240); bookcase('office_1_shelf', 'office_1', 'north', 1150, 200);
desk('assoc_1_desk', 'assoc_1', 1740, 2380, 0); chair('assoc_1_chair', 'assoc_1', 1740, 2455); guest('assoc_1_guest', 'assoc_1', 1900, 2300); credenza('assoc_1_credenza', 'assoc_1', 'south', 1740, 160); bookcase('assoc_1_shelf', 'assoc_1', 'west', 2300, 200);
desk('assoc_2_desk', 'assoc_2', 5340, 2790, 90); chair('assoc_2_chair', 'assoc_2', 5410, 2790); guest('assoc_2_guest', 'assoc_2', 5220, 2790); bookcase('assoc_2_shelf', 'assoc_2', 'north', 5250, 200);
desk('assoc_3_desk', 'assoc_3', 3740, 1200, 0); chair('assoc_3_chair', 'assoc_3', 3740, 1110); guest('assoc_3_guest_w', 'assoc_3', 3660, 1330); guest('assoc_3_guest_e', 'assoc_3', 3820, 1330);
credenza('assoc_3_credenza', 'assoc_3', 'north', 3700); bookcase('assoc_3_shelf', 'assoc_3', 'west', 1400, 200); W('assoc_3_filing', 'assoc_3', null, 'Filing cabinet', 'furniture', 'east', 1430, ...KIT.filing);
desk('assoc_4_desk', 'assoc_4', 4380, 1230, 90); chair('assoc_4_chair', 'assoc_4', 4450, 1230); guest('assoc_4_guest', 'assoc_4', 4260, 1230); bookcase('assoc_4_shelf', 'assoc_4', 'north', 4150, 200);
W('assoc_4_filing', 'assoc_4', null, 'Filing cabinets (2)', 'furniture', 'east', 1460, 120, KIT.filing[1], KIT.filing[2]);

// --- partner offices: bigger desk, executive chair, two guest chairs, bookcase along a wall ----------------------------
pdesk('partner_1_desk', 'partner_1', 1740, 1250, 0); exec('partner_1_chair', 'partner_1', 1740, 1150); guest('partner_1_guest_w', 'partner_1', 1660, 1380); guest('partner_1_guest_e', 'partner_1', 1820, 1380);
bookcase('partner_1_bookcase', 'partner_1', 'north', 1740, 380); W('partner_1_credenza', 'partner_1', null, 'Credenza', 'furniture', 'east', 1525, 150, 45, 80);
pdesk('partner_2_desk', 'partner_2', 2115, 1250, 90); exec('partner_2_chair', 'partner_2', 2035, 1250); guest('partner_2_guest_n', 'partner_2', 2240, 1200); guest('partner_2_guest_s', 'partner_2', 2240, 1300);
bookcase('partner_2_bookcase', 'partner_2', 'east', 1200, 400); credenza('partner_2_credenza', 'partner_2', 'south', 2395, 150);
pdesk('partner_3_desk', 'partner_3', 1545, 4390, 90, 'faces the door on the east wall'); exec('partner_3_chair', 'partner_3', 1465, 4390); guest('partner_3_guest_n', 'partner_3', 1680, 4320); guest('partner_3_guest_s', 'partner_3', 1680, 4460);
bookcase('partner_3_bookcase', 'partner_3', 'north', 1650, 500); W('partner_3_credenza', 'partner_3', null, 'Credenza', 'furniture', 'west', 4650, 200, 45, 80);
P('partner_3_couch', 'partner_3', null, 'Couch', 'furniture', 1700, 4735, 0, ...KIT.couch, 'along the window-wall side');
pdesk('partner_4_desk', 'partner_4', 890, 4400, 0, 'faces the boardroom door'); exec('partner_4_chair', 'partner_4', 890, 4500); guest('partner_4_guest_w', 'partner_4', 810, 4260); guest('partner_4_guest_e', 'partner_4', 970, 4260);
bookcase('partner_4_bookcase', 'partner_4', 'west', 4450, 500); credenza('partner_4_credenza', 'partner_4', 'south', 850, 300);
pdesk('partner_5_desk', 'partner_5', 4635, 4560, 90, 'faces the door; sc_partner_5 (monster slot) stays clear in the NE'); exec('partner_5_chair', 'partner_5', 4715, 4560); guest('partner_5_guest_n', 'partner_5', 4480, 4500); guest('partner_5_guest_s', 'partner_5', 4480, 4620);
bookcase('partner_5_bookcase', 'partner_5', 'north', 4370, 240); W('partner_5_credenza', 'partner_5', null, 'Credenza', 'furniture', 'east', 4115, 130, 45, 80);

// --- library (2500-3480, 950-1730, ceiling 330): 5 free-standing + 1 wall stack, reading table at the east end ---------
for (let i = 0; i < 5; i++) P(`library_stack_${i + 1}`, 'library', null, 'Book stack (double-sided)', 'rack', 2590 + 150 * i, 1250, 90, 500, 60, 220, i === 0 ? 'note_library_shelves: 500 x 60 stacks N-S at 150 spacing (90 aisles); the 6th stack is on the south wall because sc_library_lurker owns x 3250-3450' : '');
W('library_stack_6', 'library', null, 'Book stack (wall)', 'rack', 'south', 3150, 500, 60, 220);
P('library_table', 'library', null, 'Reading table', 'furniture', 3330, 1500, 0, 180, 90, 75, 'east end, south of the lurker slot');
chair('library_chair_n', 'library', 3330, 1410); chair('library_chair_s', 'library', 3330, 1590);

// --- file room (2500-3280, 2550-3030): 4 rolling stacks, the ambush aisle (sc_files_ambush x 2760-2920) between 2 and 3 -
P('file_stack_1', 'file_room', null, 'Rolling shelving stack', 'rack', 2565, 2782.5, 90, 245, 60, 220, 'note_files: N-S stacks with 100 aisles; this one shortened to y 2660-2905 to clear the reference figure');
P('file_stack_2', 'file_room', null, 'Rolling shelving stack', 'rack', 2725, 2735, 90, 340, 60, 220);
P('file_stack_3', 'file_room', null, 'Rolling shelving stack', 'rack', 2955, 2735, 90, 340, 60, 220, 'the 170 ambush aisle (scene rect) is between stacks 2 and 3');
P('file_stack_4', 'file_room', null, 'Rolling shelving stack', 'rack', 3115, 2735, 90, 340, 60, 220);

// --- copy / mail (2500-3280, 2050-2530), IT (2000-2480, 2050-2530) ------------------------------------------------------
W('copier_1', 'copy_mail', null, 'Copier', 'fixture', 'north', 2665, 105, 70, 120, 'note_copiers: two copiers on the north wall west of the door');
W('copier_2', 'copy_mail', null, 'Copier', 'fixture', 'north', 2775, 105, 70, 120);
W('mail_counter', 'copy_mail', null, 'Mail sorting counter', 'fixture', 'south', 2850, 500, 60, 90);
W('mail_slots', 'copy_mail', null, 'Mail pigeonholes', 'furniture', 'east', 2210, 120, 40, 180);
W('paper_shelves', 'copy_mail', null, 'Paper shelves', 'rack', 'west', 2250, 200, 40, 200);
W('server_rack_1', 'it_server', null, 'Server rack (LEDs on)', 'rack', 'east', 2290, 60, 100, 200, 'note_servers: two 60 x 100 x 200 racks on the east wall (y 2260-2320 and 2340-2400)');
W('server_rack_2', 'it_server', null, 'Server rack (LEDs on)', 'rack', 'east', 2370, 60, 100, 200, 'abuts sc_server_pickup (y 2400-2520) so "the pickup on the rack shelf" has a shelf: the rect stays clear as the pickup\'s own floor');
W('it_bench', 'it_server', null, 'Workbench + UPS', 'fixture', 'west', 2310, 120, 60, 90);

// --- bullpen (3300-4680, 2050-3030): three islands, the middle one forcing the sidestep, one overturned chair ----------
P('bullpen_island_w', 'bullpen', null, 'Desk island (4 workstations)', 'furniture', 3500, 2540, 0, 320, 200, 75, 'note_bullpen_desks: islands at x 3500 / 3990 / 4480; 320 x 200 (2 x 160 desks back to back)');
P('bullpen_island_m', 'bullpen', null, 'Desk island (4 workstations) - the massacre tableau', 'furniture', 3990, 2540, 0, 320, 200, 75,
  'sc_bullpen_massacre: the middle island IS the tableau (overturned desks, a body under a desk - Gate 4), centred (3990, 2540) per FLOORPLAN.md 2 in the line of both 280 openings; the sidestep happens 2.7 m inside the room, with 225 cm either side');
P('bullpen_island_e', 'bullpen', null, 'Desk island (4 workstations)', 'furniture', 4480, 2540, 0, 320, 200, 75);
for (const [i, [x, y]] of [[3420, 2410], [3580, 2410], [3420, 2670], [3580, 2670], [4400, 2410], [4560, 2410], [4400, 2670], [4560, 2670]].entries()) chair(`bullpen_chair_${i + 1}`, 'bullpen', x, y);
for (const [i, [x, y]] of [[3910, 2410], [4070, 2410], [3910, 2670], [4070, 2670]].entries()) chair(`bullpen_chair_${i + 9}`, 'bullpen', x, y, 0, 'sc_bullpen_massacre: chair of the tableau island');
P('bullpen_chair_overturned', 'bullpen', null, 'Overturned chair', 'furniture', 3720, 2790, 0, 90, 60, 50, 'note_bullpen_desks: one overturned chair, lying on its side in the shortcut lane');
W('bullpen_printer', 'bullpen', null, 'Printer station', 'fixture', 'west', 2805, 90, 60, 110);
W('bullpen_filing', 'bullpen', null, 'Filing cabinets (4)', 'furniture', 'east', 2870, 240, 45, 130);

// --- boardroom (500-2080, 3350-3980): table centred per note_boardroom_table (its east half IS sc_boardroom), 14 chairs ----
P('board_table', 'boardroom', null, 'Boardroom table - the interrupted meeting', 'furniture', 1290, 3660, 0, 600, 160, 75,
  'note_boardroom_table + sc_boardroom: 600 x 160 centred (1290, 3660), x 990-1590 - the table IS the scene (chairs pushed back, one partner still in his seat at the east end); clear of the corridor_sw door zone (x 1960-2080) and the partner_4 door zone (x 830-950, y 3860-3980)');
const BOARD_NOTE = 'sc_boardroom: chair of the interrupted meeting';
for (let i = 0; i < 6; i++) { const x = 1040 + 100 * i;
  if (x === 1440) chair(`board_chair_n${i + 1}`, 'boardroom', 1445, 3500, -25, `${BOARD_NOTE} - pushed back and turned`); else chair(`board_chair_n${i + 1}`, 'boardroom', x, 3550, 0, BOARD_NOTE);
  if (x === 1340) chair(`board_chair_s${i + 1}`, 'boardroom', 1340, 3800, 20, `${BOARD_NOTE} - pushed back and turned`); else chair(`board_chair_s${i + 1}`, 'boardroom', x, 3770, 0, BOARD_NOTE); }
chair('board_chair_w', 'boardroom', 950, 3660, 0, BOARD_NOTE); chair('board_chair_e', 'boardroom', 1630, 3660, 0, `${BOARD_NOTE} - the partner still in his seat (Gate 4 figure)`);
W('board_screen', 'boardroom', null, 'Wall screen', 'fixture', 'west', 3660, 200, 10, 120, 'note_boardroom_table: wall screen on the west wall, bottom at 90', 90);
credenza('board_credenza', 'boardroom', 'north', 1500, 400);

// --- conference room (4200-4980, 3350-3980) -----------------------------------------------------------------------------
P('conf_table', 'conference_small', null, 'Conference table', 'furniture', 4590, 3665, 0, 360, 120, 75, 'note_conference: 360 x 120, 8 chairs');
for (const [i, [x, y]] of [[4470, 3575], [4590, 3575], [4710, 3575], [4470, 3755], [4590, 3755], [4710, 3755], [4380, 3665], [4800, 3665]].entries()) chair(`conf_chair_${i + 1}`, 'conference_small', x, y);
W('conf_whiteboard', 'conference_small', null, 'Whiteboard (case notes)', 'fixture', 'north', 4590, 240, 5, 120, 'bottom at 90', 90);
credenza('conf_credenza', 'conference_small', 'south', 4700);

// --- storage, elevator lobby, corridors ------------------------------------------------------------------------------------
W('storage_shelf_w', 'storage_west', null, 'Storage shelving', 'rack', 'west', 2790, 380, 45, 200);
W('storage_shelf_n', 'storage_west', null, 'Storage shelving', 'rack', 'north', 210, 300, 45, 200);
P('storage_crates', 'storage_west', null, 'Crates on a pallet', 'generic', 200, 2900, 0, 120, 80, 100);
W('elevator_doors', 'elevator_lobby', 'SM_ClosedElevator', 'Shut elevator doors', 'door', 'east', 2290, dims('SM_ClosedElevator').w, dims('SM_ClosedElevator').d, dims('SM_ClosedElevator').h,
  'flush on the east wall centred on the 200 x 220 elevator_doors blocker (frozen); the mesh is 134 wide at 220 tall, the greybox infill shows 33 cm each side as the surround');
W('elevator_bench', 'elevator_lobby', null, 'Bench', 'furniture', 'north', 5300, 180, 50, 45);

// --- SM_ClosedDoor IN the two frozen LOCKED openings (corridor side): the 102 x 17 x 220 panel-with-casing stands flush on
//     corridor_south's north wall inside each opening's 120 span, in front of the greybox LOCKED infill - the asset judged where
//     it will be used (REQ-G5 refusal doors). A 'door' inside a locked_door's span waives that opening's swing zone (nothing
//     swings); 263 of the 280 corridor stay clear. No leaf stands beside an open doorway any more (the mesh is a CLOSED door).
for (const [id, x, what] of [['closed_door_womens', 1240, "women's restroom"], ['closed_door_stair', 1740, 'stairwell']])
  W(id, 'corridor_south', 'SM_ClosedDoor', `Closed door (LOCKED - ${what})`, 'door', 'north', x, dims('SM_ClosedDoor').w, dims('SM_ClosedDoor').d, dims('SM_ClosedDoor').h,
    `IN the locked_door opening at x ${x} (span ${x - 60}-${x + 60}), flush on the corridor face of the wall; 9 cm of greybox jamb shows each side (audit)`);

// --- corridor / lobby / gallery dressing: a law firm's halls are never bare. Every item <= 50 deep (corridors keep >= 230 of 280),
//     outside all swing zones, >= 36 from every encounter lane, never in a scene rect; x 4300-4700 of corridor_main carries NO dressing -
//     that span is the guard + shotgun beat (above) around sc_guard_shotgun and cp_corridor_post_pickup; x 1500-1780 of corridor_north_w
//     stays empty around the demon_1 trigger.
//     Items on opposite walls never share an x (the clear width is the gap BETWEEN them, checked by the same sweep as the validator).
consoleT('cm_console', 'corridor_main', 'north', 3300); extinguisher('cm_extinguisher', 'corridor_main', 'north', 4000);
planter('cm_planter', 'corridor_main', 'south', 3500); cooler('cm_cooler', 'corridor_main', 'south', 3700);
cooler('cnw_cooler', 'corridor_north_w', 'south', 2000); consoleT('cnw_console', 'corridor_north_w', 'north', 2500, '300 cm east of the demon_1 retreat lane end (2140, 1800)');
planter('cnw_planter', 'corridor_north_w', 'south', 2400); extinguisher('cnw_extinguisher', 'corridor_north_w', 'north', 2830);
bench('cs_bench', 'corridor_south', 'south', 800);
W('cs_hose', 'corridor_south', null, 'Fire hose cabinet', 'fixture', 'north', 1490, ...KIT.hose_cabinet, `wall-hung between the two LOCKED doors, bottom at ${HOSE_Z}`, HOSE_Z);
planter('cs_planter_w', 'corridor_south', 'south', 1600); consoleT('cs_console_w', 'corridor_south', 'north', 2000);
cooler('cs_cooler_w', 'corridor_south', 'north', 2560); planter('cs_planter_m', 'corridor_south', 'south', 2640);
consoleT('cs_console_e', 'corridor_south', 'north', 3300);
W('cs_notice', 'corridor_south', null, 'Notice board', 'fixture', 'north', 3600, ...KIT.notice_board, `wall-hung, bottom at ${NOTICE_Z}`, NOTICE_Z);
cooler('cs_cooler_e', 'corridor_south', 'south', 4540); extinguisher('cs_extinguisher_e', 'corridor_south', 'north', 4400);
consoleT('ce_console', 'corridor_east', 'west', 2400); planter('ce_planter', 'corridor_east', 'west', 2700); extinguisher('ce_extinguisher', 'corridor_east', 'east', 2630);
consoleT('wl_console', 'west_lobby', 'west', 1740, 'Q5: the lobby gets wall dressing only - the fight floor (retreat lane y 1800, strafes x 1240) stays open');
planter('wl_planter', 'west_lobby', 'north', 990); cooler('wl_cooler', 'west_lobby', 'south', 1080);
consoleT('gw_console', 'gallery_west', 'east', 2450); bench('gw_bench', 'gallery_west', 'west', 2500); planter('gw_planter', 'gallery_west', 'west', 2650);   // west wall between the collapse opening zone (y <= 2330) and the storage door zone (y >= 2730)

// --- demons at the encounter spawns (cylinders, no collision) + the audited mesh footprint (wings): the generator draws footprint_cm as a
//     translucent 10 cm no-collision box under the cylinder, yawed to face the player approach, and appends ", footprint w x d" to the label
const demons = fp.encounters.map((e, i) => { const slot = i === 0 ? 'SK_EmberDemon' : 'SK_CrimsonHellfiend', t = dims(slot);
  return { id: e.id, encounter: e.id, slot, label: `DEMON #${i + 1} (${slot}) ${e.capsule_height_cm} cm`,
    radius_cm: e.capsule_radius_cm, height_cm: e.capsule_height_cm, footprint_cm: { w: t.w, d: t.d },
    note: (i === 0 ? 'steps out of Office #2 door into the west lobby; wings-spread rest pose is 162 x 204 in a 280 corridor - the capsule is the pathing body' : 'the pocket behind the dividing wall, hidden from every doorway ray by >= 132 cm (FLOORPLAN.md 5); 300 tall under a 310 ceiling; 208 wide wings pass the 309 chokepoint with 1 m to spare')
      + `. footprint_cm = the audited mesh ${t.w} x ${t.d} (w = wing span across the facing, d front-to-back), drawn by the generator as Demon_${e.id}_footprint: a translucent no-collision 10 cm box under the cylinder facing the player approach, a marker no rule counts (REQ-G2-003 AC1); capsule r ${e.capsule_radius_cm} h ${e.capsule_height_cm}` }; });

// ================================ SELF-CHECK (same maths as Tools/validate_blockout.mjs) ===============================
const fails = [], warns = [];
const fail = (m) => fails.push(m), warn = (m) => warns.push(m);
function obb(cx, cy, w, d, yaw) { const c = Math.cos(yaw * Math.PI / 180), s = Math.sin(yaw * Math.PI / 180); return { cx, cy, ax: c, ay: s, ha: w / 2, bx: -s, by: c, hb: d / 2 }; }
const corners = (o) => [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([a, b]) => [o.cx + a * o.ax * o.ha + b * o.bx * o.hb, o.cy + a * o.ay * o.ha + b * o.by * o.hb]);
const aabb = (o) => { const c = corners(o); return { x0: Math.min(...c.map((p) => p[0])), x1: Math.max(...c.map((p) => p[0])), y0: Math.min(...c.map((p) => p[1])), y1: Math.max(...c.map((p) => p[1])) }; };
const rectObb = (r) => obb(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0);
function overlaps(a, b) { const ca = corners(a), cb = corners(b);
  for (const [nx, ny] of [[a.ax, a.ay], [a.bx, a.by], [b.ax, b.ay], [b.bx, b.by]]) { const pa = ca.map((c) => c[0] * nx + c[1] * ny), pb = cb.map((c) => c[0] * nx + c[1] * ny);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= EPS) return false; } return true; }
function distPt(o, px, py) { const dx = px - o.cx, dy = py - o.cy, la = dx * o.ax + dy * o.ay, lb = dx * o.bx + dy * o.by; return Math.hypot(Math.max(0, Math.abs(la) - o.ha), Math.max(0, Math.abs(lb) - o.hb)); }
function distSeg(o, x0, y0, x1, y1) { const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5)); let best = Infinity; for (let i = 0; i <= n; i++) best = Math.min(best, distPt(o, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n)); return best; }
const distObb = (a, b) => Math.min(...corners(a).map(([x, y]) => distPt(b, x, y)), ...corners(b).map(([x, y]) => distPt(a, x, y)));

// effective footprints (characters: w across the facing, d along it -> yaw - 90 in the box convention)
const items = [];
for (const p of props) items.push({ what: `prop ${p.id}`, id: p.id, room: p.room, kind: p.kind, note: p.note, o: obb(p.pos.x, p.pos.y, p.size.w, p.size.d, p.yaw_deg), h: p.size.h, z0: p.z_cm, wall: p.mount === 'wall' ? p.wall : null, scene_ok: false });
for (const c of characters) items.push({ what: `character ${c.id}`, id: c.id, room: c.room, kind: 'character', pose: c.pose, note: c.note, o: obb(c.pos.x, c.pos.y, c.size.w, c.size.d, c.yaw_deg - 90), h: c.size.h, z0: 0, wall: c.contact.startsWith('wall:') ? c.contact.slice(5) : null, scene_ok: true });
for (const k of pickups) items.push({ what: `pickup ${k.id}`, id: k.id, room: k.room, kind: 'pickup', note: k.note, o: obb(k.pos.x, k.pos.y, k.size.w, k.size.d, k.yaw_deg), h: k.size.h, z0: 0, wall: null, scene_ok: true });
const ids = new Set(); for (const it of items) { if (ids.has(it.id)) fail(`duplicate id ${it.id}`); ids.add(it.id); }
const used = new Set(); for (const x of [...props, ...characters, ...pickups, ...demons]) { if (x.slot && !asset_slots[x.slot]) fail(`${x.id}: unknown slot ${x.slot}`); if (x.slot) used.add(x.slot); }
for (const s of Object.keys(asset_slots)) if (!used.has(s)) fail(`asset slot ${s} has no blockout (REQ-G2-002 AC1)`);

// keep-clear geometry from the floor plan
const OPP = { north: 'south', south: 'north', west: 'east', east: 'west' };
function swing(room, side, c, w, type) { const r = R(room), hw = Math.max(SWING, w) / 2;
  const z = side === 'north' ? { x: c - hw, y: r.y, w: 2 * hw, h: SWING } : side === 'south' ? { x: c - hw, y: r.y + r.h - SWING, w: 2 * hw, h: SWING } : side === 'west' ? { x: r.x, y: c - hw, w: SWING, h: 2 * hw } : { x: r.x + r.w - SWING, y: c - hw, w: SWING, h: 2 * hw };
  const x0 = Math.max(z.x, r.x), y0 = Math.max(z.y, r.y), x1 = Math.min(z.x + z.w, r.x + r.w), y1 = Math.min(z.y + z.h, r.y + r.h); return { room, side, c, w, type, o: rectObb({ x: x0, y: y0, w: x1 - x0, h: y1 - y0 }) }; }
const swings = [];
for (const o of fp.openings) { if (o.type === 'window') continue; swings.push({ ...swing(o.between[0], o.wall, o.center_along_wall_cm, o.width_cm, o.type), why: o.id }); if (rooms.has(o.between[1])) swings.push({ ...swing(o.between[1], OPP[o.wall], o.center_along_wall_cm, o.width_cm, o.type), why: o.id }); }
for (const d of fp.ducts) { const a = R(d.from), b = R(d.to); const [aS, bS, lat] = d.axis === 'y' ? (b.y >= a.y + a.h ? ['south', 'north', d.start.x] : ['north', 'south', d.start.x]) : (b.x >= a.x + a.w ? ['east', 'west', d.start.y] : ['west', 'east', d.start.y]);
  swings.push({ ...swing(d.from, aS, lat, d.interior_width_cm, 'duct_mouth'), why: d.id }); swings.push({ ...swing(d.to, bS, lat, d.interior_width_cm, 'duct_mouth'), why: d.id }); }
// a 'door' prop flush on the wall INSIDE a locked_door opening's span is that opening's shut door: nothing swings there, so the
// swing-zone rule is waived for that one opening (the door still counts for the corridor clear width and every other rule)
function closedDoorIn(it, s) { if (s.type !== 'locked_door' || it.kind !== 'door' || it.wall !== s.side) return false;
  const b = aabb(it.o), ns = s.side === 'north' || s.side === 'south', lo = ns ? b.x0 : b.y0, hi = ns ? b.x1 : b.y1; return lo >= s.c - s.w / 2 - EPS && hi <= s.c + s.w / 2 + EPS; }
// a PROP may lie in a scene rect only when the scene is a tableau (kind 'scene') and the prop's note names it - it IS the tableau
// (the boardroom table, the bullpen's middle island); monster / ambush / pickup / reveal floors stay open. Characters and pickups
// are usually the scene's own content (WARN, so the reviewer still sees the line).
function sceneOk(it, s) { return it.scene_ok === true || (s.kind === 'scene' && typeof it.note === 'string' && it.note.includes(s.id)); }
const ms = fp.money_shot, dv = ms.dividing_wall;
const divider = rectObb({ x: dv.from_x, y: dv.at_y - WALL_T / 2, w: dv.to_x - dv.from_x, h: WALL_T });
const DIRV = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const lanes = [];
for (const e of fp.encounters) { const [dx, dy] = DIRV[e.retreat_dir], p = e.player_approach;
  lanes.push({ enc: e.id, kind: `retreat ${e.retreat_dir} ${e.retreat_clear_cm}`, x0: p.x, y0: p.y, x1: p.x + dx * e.retreat_clear_cm, y1: p.y + dy * e.retreat_clear_cm });
  for (const s of [1, -1]) lanes.push({ enc: e.id, kind: `strafe ${s > 0 ? '+' : '-'}${e.strafe_clear_each_side_cm}`, x0: p.x, y0: p.y, x1: p.x + s * dy * e.strafe_clear_each_side_cm, y1: p.y + s * dx * e.strafe_clear_each_side_cm }); }
const discs = [...fp.checkpoints.map((c) => ({ ...c.pos, r: CP_R, why: c.id })), ...fp.markers.filter((m) => m.kind === 'player_start').map((m) => ({ ...m.pos, r: START_R, why: 'player_start' })),
  ...fp.encounters.map((e) => ({ ...e.spawn, r: e.capsule_radius_cm, why: `${e.id} spawn capsule` }))];
const figures = fp.markers.filter((m) => m.kind === 'reference_figure').map((m) => ({ id: m.id, room: m.room, o: obb(m.pos.x, m.pos.y, metrics.architecture.reference_figure_width_cm, metrics.architecture.reference_figure_depth_cm, 0) }));
const scenes = fp.scenes.map((s) => ({ id: s.id, kind: s.kind, room: s.room, o: rectObb(s.rect) }));
const entry = fp.openings.find((o) => o.id === ms.entry_opening_id), win = fp.openings.find((o) => o.type === 'window' && o.between[0] === ms.room);
const cr = R(ms.room), doorC = { x: entry.center_along_wall_cm, y: cr.y }, winC = { x: win.center_along_wall_cm, y: cr.y + cr.h };
const strip = obb((doorC.x + winC.x) / 2, (doorC.y + winC.y) / 2, Math.hypot(winC.x - doorC.x, winC.y - doorC.y), 2 * STRIP_HALF, Math.atan2(winC.y - doorC.y, winC.x - doorC.x) * 180 / Math.PI);

// rules
for (const it of items) { const r = R(it.room), w = it.wall;
  const lo = [r.x + (w === 'west' ? 0 : MARGIN), r.y + (w === 'north' ? 0 : MARGIN)], hi = [r.x + r.w - (w === 'east' ? 0 : MARGIN), r.y + r.h - (w === 'south' ? 0 : MARGIN)];
  if (!corners(it.o).every(([x, y]) => x >= lo[0] - 1e-6 && x <= hi[0] + 1e-6 && y >= lo[1] - 1e-6 && y <= hi[1] + 1e-6)) { const b = aabb(it.o); fail(`${it.what}: x ${rnd(b.x0)}..${rnd(b.x1)} y ${rnd(b.y0)}..${rnd(b.y1)} is not inside ${it.room} with ${MARGIN} cm to the walls`); }
  if (it.z0 + it.h > rooms.get(it.room).ceiling_cm) fail(`${it.what}: top is above the ceiling`);
  for (const s of swings) if (s.room === it.room && overlaps(it.o, s.o) && !closedDoorIn(it, s)) fail(`${it.what} blocks the ${SWING} cm swing zone of ${s.why}`);
  if (it.room === ms.room && overlaps(it.o, divider)) fail(`${it.what} intersects the dividing wall`);
  for (const l of lanes) { const d = distSeg(it.o, l.x0, l.y0, l.x1, l.y1); if (d < CAP_R) fail(`${it.what} is ${rnd(d)} cm from the ${l.enc} ${l.kind} lane (need ${CAP_R})`); }
  for (const d of discs) { const dd = distPt(it.o, d.x, d.y); if (dd < d.r) fail(`${it.what} is ${rnd(dd)} cm from ${d.why} (keep ${d.r})`); }
  for (const s of scenes) if (s.room === it.room && overlaps(it.o, s.o)) (sceneOk(it, s) ? warn : fail)(`${it.what} lies in scene rect ${s.id} (${s.kind})`);
  if (it.room === ms.room && overlaps(it.o, strip)) fail(`${it.what} crosses the money-shot sightline strip`);
  for (const f of figures) if (f.room === it.room && overlaps(it.o, f.o)) warn(`${it.what} overlaps reference figure ${f.id}`); }
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) { const a = items[i], b = items[j];
  if (Math.min(a.z0 + a.h, b.z0 + b.h) - Math.max(a.z0, b.z0) > EPS && overlaps(a.o, b.o)) fail(`${a.what} and ${b.what} intersect`); }
// seated / slumped bodies: the back face sits exactly on its surface (a wall face or a prop face)
for (const c of characters) { if (c.pose === 'prone' && c.contact === 'floor') continue;
  const f = [Math.cos(c.yaw_deg * Math.PI / 180), Math.sin(c.yaw_deg * Math.PI / 180)], back = c.pos.x * f[0] + c.pos.y * f[1] - c.size.d / 2, r = R(c.room);
  if (c.contact.startsWith('wall:')) { const s = c.contact.slice(5), face = s === 'north' ? r.y : s === 'south' ? -(r.y + r.h) : s === 'west' ? r.x : -(r.x + r.w); if (Math.abs(back - face) > 1e-6) fail(`${c.id}: back face ${rnd(back)} is not on the ${s} wall`); }
  else if (c.contact.startsWith('prop:')) { const p = props.find((q) => q.id === c.contact.slice(5)); if (!p) { fail(`${c.id}: contact prop missing`); continue; }
    const front = Math.max(...corners(obb(p.pos.x, p.pos.y, p.size.w, p.size.d, p.yaw_deg)).map(([x, y]) => x * f[0] + y * f[1])); if (Math.abs(back - front) > 1e-6) fail(`${c.id}: back face ${rnd(back)} does not touch ${p.id} (${rnd(front)})`); }
  else fail(`${c.id}: ${c.pose} pose needs a contact surface`); }
// corridors: the widest free gap ACROSS the corridor at every station along it, past every non-steppable item (steppable = h <=
// max_step_height) - items on opposite walls at the same station narrow it together (same sweep as Tools/validate_blockout.mjs).
// BODY WAIVER (lead decision 2026-09-07): a station narrowed ONLY by characters against a wall (kind character, pose seated | prone |
// slumped, contact wall:<side>) needs BODY_MIN (150 = capsule 72 + body 78) instead of CLEAR_MIN (216) - a body you step past, not
// architecture. Any prop at the station (alone or beside a body) keeps the 216.
const isBody = (it) => it.kind === 'character' && BODY_POSES.has(it.pose) && !!it.wall;
const corridor_clear = {}, waivers = [];
for (const room of fp.rooms) { if (!room.id.startsWith('corridor_')) continue; const r = room.rect, alongX = r.w >= r.h, lo = alongX ? r.y : r.x, hi = alongX ? r.y + r.h : r.x + r.w;
  const its = items.filter((it) => it.room === room.id).map((it) => ({ it, b: aabb(it.o), step: it.h <= STEP }));
  for (const { it, b, step } of its) corridor_clear[it.id] = { room: room.id, clear_alone_cm: rnd(Math.max((alongX ? b.y0 : b.x0) - lo, hi - (alongX ? b.y1 : b.x1))), steppable: step, height_cm: it.h, min_cm: isBody(it) ? BODY_MIN : CLEAR_MIN };
  const solid = its.filter((x) => !x.step), ev = [...new Set(solid.flatMap(({ b }) => (alongX ? [b.x0, b.x1] : [b.y0, b.y1])))].sort((a, b) => a - b);
  let worst = Infinity, worstIds = '', worstMin = CLEAR_MIN;
  for (let k = 0; k + 1 < ev.length; k++) { const mid = (ev[k] + ev[k + 1]) / 2, here = solid.filter(({ b }) => (alongX ? b.x0 < mid && b.x1 > mid : b.y0 < mid && b.y1 > mid)); if (!here.length) continue;
    const blocked = here.map(({ b }) => (alongX ? [b.y0, b.y1] : [b.x0, b.x1])).sort((a, b) => a[0] - b[0]); let cursor = lo, gap = 0;
    for (const [b0, b1] of blocked) { gap = Math.max(gap, b0 - cursor); cursor = Math.max(cursor, b1); } gap = Math.max(gap, hi - cursor);
    const ids = here.map((h) => h.it.id).join(' + '), need = here.every(({ it }) => isBody(it)) ? BODY_MIN : CLEAR_MIN;
    if (need === BODY_MIN && gap < CLEAR_MIN && !waivers.some((w) => w.room === room.id && w.past === ids)) waivers.push({ room: room.id, past: ids, clear_cm: rnd(gap), min_cm: need });
    if (gap < need) fail(`${room.id}: only ${rnd(gap)} cm clear past ${ids} (need ${need}${need === BODY_MIN ? ' - body waiver' : ''})`);
    if (gap < worst) { worst = gap; worstIds = ids; worstMin = need; } }
  if (solid.length) corridor_clear[`${room.id}:narrowest`] = { room: room.id, clear_cm: rnd(worst), past: worstIds, min_cm: worstMin, waiver: worstMin === BODY_MIN ? 'corridor_clear_min_past_body_cm: a body against the wall you step past, not architecture' : null }; }
// the first move (REQ-G2-002 AC3): player start -> duct mouth in the start room, swept by the capsule like a lane
const startM = fp.markers.find((m) => m.kind === 'player_start');
const first_route = fp.ducts.filter((d) => d.from === startM.room).map((d) => { const seg = { x0: startM.pos.x, y0: startM.pos.y, x1: d.start.x, y1: d.start.y };
  const inRoom = items.filter((it) => it.room === startM.room), near = inRoom.map((it) => ({ it, d: distSeg(it.o, seg.x0, seg.y0, seg.x1, seg.y1) })).sort((a, b) => a.d - b.d)[0];
  if (near && near.d < CAP_R) fail(`${near.it.what} is ${rnd(near.d)} cm from the player start -> ${d.id} route (need ${CAP_R}: the first thing the player does must not catch)`);
  return { route: `player_start (${seg.x0}, ${seg.y0}) -> ${d.id} mouth (${seg.x1}, ${seg.y1})`, capsule_radius_cm: CAP_R, nearest_blockout: near ? near.it.id : null, clearance_cm: near ? rnd(near.d) : null }; });
// REQ-G2-004 numbers: lane clearance per encounter, the demon_2 chokepoint at the dividing wall's free end, the money shot
const lane_clearance = Object.fromEntries(lanes.map((l) => [`${l.enc} ${l.kind}`, rnd(Math.min(...items.map((it) => distSeg(it.o, l.x0, l.y0, l.x1, l.y1))))]));
const freeEnd = { x: dv.from_x, y: dv.at_y };
const westOfEnd = items.filter((it) => it.room === ms.room && aabb(it.o).x1 <= freeEnd.x);
const choke = Math.min(...westOfEnd.map((it) => distPt(it.o, freeEnd.x, freeEnd.y)));
if (choke < CHOKE_MIN) fail(`demon_2 chokepoint at the dividing wall's free end is ${rnd(choke)} cm (< ${CHOKE_MIN})`);
const officeItems = items.filter((it) => it.room === ms.room);
const eye = movement.player.eye_height_stand_cm;
const money_shot = { strip: `x ${doorC.x - STRIP_HALF}..${doorC.x + STRIP_HALF}, y ${doorC.y}..${winC.y}`, strip_min_clearance_cm: rnd(Math.min(...officeItems.map((it) => distObb(it.o, strip)))),
  tallest_item_south_of_door_wall_cm: Math.max(...officeItems.filter((it) => aabb(it.o).y0 > cr.y + 1).map((it) => it.z0 + it.h)), eye_height_cm: eye,
  demon_2_chokepoint_cm: rnd(choke), chokepoint_min_cm: CHOKE_MIN, dividing_wall_free_end: freeEnd };
if (money_shot.tallest_item_south_of_door_wall_cm >= eye) fail(`a blockout south of the door wall is taller than the eye line (${eye})`);

// REQ-G2-005 backdrop: the placeholder plane must fill the glass from the doorway AND from the 5 s dwell zone at the glass.
// Sized for the dwell rect: from each dwell corner at eye height, every ray inside the horizontal FOV (movement.json), with the
// camera pitched up to a full vertical FOV (16:9 of the horizontal) down or up, must land on the plane - so leaning in to look
// down at the fire never shows the void under the plane. Plane sizes are placement decisions recorded here (not the doorway's).
const BACKDROP = { beyond_window_cm: 800, width_cm: 12000, height_cm: 5000, z_cm: -2500 };
const HFOV = movement.player.fov_horizontal_deg, VHALF = Math.atan(Math.tan(HFOV / 2 * Math.PI / 180) * 9 / 16) * 180 / Math.PI;   // 29.4 at 90 deg, 16:9
const planeY = winC.y + WALL_T + BACKDROP.beyond_window_cm, dr = ms.dwell_rect;
const needX = [], needZ = [], glassRays = [];
for (const [cx, cy] of [[dr.x, dr.y], [dr.x + dr.w, dr.y], [dr.x, dr.y + dr.h], [dr.x + dr.w, dr.y + dr.h]]) {
  const D = planeY - cy, half = Math.tan(HFOV / 2 * Math.PI / 180) * D, slant = D / Math.cos(HFOV / 2 * Math.PI / 180), rise = Math.tan(2 * VHALF * Math.PI / 180) * slant;
  needX.push(cx - half, cx + half); needZ.push(eye - rise, eye + rise);
  if (winC.y - cy > EPS) { const k = D / (winC.y - cy); glassRays.push(cx + (cr.x - cx) * k, cx + (cr.x + cr.w - cx) * k); } }   // rays through the glass edges (from the corners off the glass; at the glass every ray is grazing)
const backdrop_check = { plane_y: planeY, plane_x: [winC.x - BACKDROP.width_cm / 2, winC.x + BACKDROP.width_cm / 2], plane_z: [BACKDROP.z_cm, BACKDROP.z_cm + BACKDROP.height_cm],
  dwell_fov_needs_x: [rnd(Math.min(...needX)), rnd(Math.max(...needX))], dwell_fov_needs_z: [rnd(Math.min(...needZ)), rnd(Math.max(...needZ))], vertical_half_fov_deg: rnd(VHALF),
  dwell_glass_edge_rays_x: [rnd(Math.min(...glassRays)), rnd(Math.max(...glassRays))] };
if (Math.min(...needX) < backdrop_check.plane_x[0] || Math.max(...needX) > backdrop_check.plane_x[1]) fail(`backdrop ${BACKDROP.width_cm} wide leaves the dwell rect's FOV (needs x ${backdrop_check.dwell_fov_needs_x.join('..')})`);
if (Math.min(...needZ) < backdrop_check.plane_z[0] || Math.max(...needZ) > backdrop_check.plane_z[1]) fail(`backdrop z ${backdrop_check.plane_z.join('..')} leaves the dwell rect's pitched FOV (needs z ${backdrop_check.dwell_fov_needs_z.join('..')})`);
backdrop_check.dwell_glass_edge_rays_covered = Math.min(...glassRays) >= backdrop_check.plane_x[0] && Math.max(...glassRays) <= backdrop_check.plane_x[1];

// ================================ OUTPUT ===============================================================================
const out = { version: 1, units: 'cm', coverage: 'full',
  _comment: 'GENERATED by Docs/blockout/blockout.build.mjs from Data/floorplan.json + Docs/audit/blender_audit_2026-09-07.json - edit the script, never this file. Plan space cm (x right, y down toward the window). asset_slots.normalized_size_m / tris = the Blender audit (Z-up W x D x H rest size); parser_size_m / tris_parser = the node header parser (glTF Y-up), record only. Rationale and tables: Docs/blockout/BLOCKOUT.md.',
  asset_slots, props, characters, pickups, demons,
  triggers: { height_cm: metrics.architecture.door_height_cm, from: 'encounters.trigger_rect' },
  backdrop: { ...BACKDROP, tint: 'backdrop_fire', note: `placeholder orange fire plane (REQ-G2-005), sized for the dwell rect, not just the doorway: from every dwell corner at eye height the ${HFOV} deg FOV pitched a full vertical FOV (${rnd(2 * VHALF)} deg) down or up lands on the plane (needs x ${backdrop_check.dwell_fov_needs_x.join('..')}, z ${backdrop_check.dwell_fov_needs_z.join('..')}); rays through the glass edges from the dwell rect reach x ${backdrop_check.dwell_glass_edge_rays_x.join('..')}${backdrop_check.dwell_glass_edge_rays_covered ? ' (covered)' : ' (grazing rays past the plane edge - a sky sphere would be needed for those)'}. Gate 3 replaces it with a sky / city card.` },
  dwell: { from: 'money_shot.dwell_rect', height_cm: 200, tint: 'dwell_volume', note: 'the 200 tall volume stands in the sightline strip above the eye line, so it uses the 0.1-opacity volume tint (rules.sightline_volume_max_opacity): the window is not seen through a wash' },
  meta: { counts: { props: props.length, characters: characters.length, pickups: pickups.length, demons: demons.length, asset_slots: Object.keys(asset_slots).length },
    rules: { wall_margin_cm: MARGIN, door_swing_cm: SWING, lane_widen_cm: CAP_R, corridor_clear_min_cm: CLEAR_MIN, corridor_clear_min_past_body_cm: BODY_MIN, steppable_max_h_cm: STEP, checkpoint_clear_cm: CP_R, player_start_clear_cm: START_R, sightline_half_width_cm: STRIP_HALF, chokepoint_min_cm: CHOKE_MIN,
      scene_rect_props: "FAIL unless the scene is kind 'scene' and the prop's note names it (the prop is the tableau)", locked_door_swing_zone: "waived for a 'door' prop flush inside the locked opening's span (the shut door itself)",
      corridor_body_waiver: `a corridor station narrowed only by characters against a wall (pose ${[...BODY_POSES].join(' | ')}, contact wall:<side>) needs ${BODY_MIN} instead of ${CLEAR_MIN} - a body you step past, not architecture (lead decision 2026-09-07); props keep ${CLEAR_MIN}` },
    checks: { first_route, corridor_clear, corridor_body_waivers: waivers, lane_clearance, money_shot, backdrop: backdrop_check }, warnings: warns } };
if (fails.length) { console.log(`FAILED: ${fails.length} placement problem(s) - nothing written`); fails.forEach((m, i) => console.log(`  ${i + 1}. ${m}`)); process.exit(1); }
fs.writeFileSync(path.join(ROOT, OUT), JSON.stringify(out, null, 2) + '\n');
warns.forEach((m) => console.log(`WARN ${m}`));
console.log(`OK ${OUT}: ${props.length} props, ${characters.length} characters, ${pickups.length} pickup(s), ${demons.length} demons, ${Object.keys(asset_slots).length} asset slots; chokepoint ${rnd(choke)} >= ${CHOKE_MIN}; strip clearance ${money_shot.strip_min_clearance_cm}; start->duct route ${first_route.map((r) => `${r.clearance_cm} (${r.nearest_blockout})`).join(', ')} >= ${CAP_R}; corridor clear ${Object.values(corridor_clear).filter((c) => c.past !== undefined).map((c) => `${c.room} ${c.clear_cm} past ${c.past}${c.waiver ? ` (body waiver ${c.min_cm})` : ''}`).join(', ')} (props need ${CLEAR_MIN}, a body against the wall ${BODY_MIN}; ${waivers.length} waiver(s)${waivers.length ? ': ' + waivers.map((w) => `${w.room} ${w.clear_cm} past ${w.past}`).join(', ') : ''}); ${warns.length} warning(s)`);
