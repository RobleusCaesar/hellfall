#!/usr/bin/env node
// validate_blockout.mjs - schema + placement-rule validator for Data/blockout.json (Gate 2, REQ-G2-002..005).
//
// Usage: node Tools/validate_blockout.mjs <path/to/blockout.json> [--floorplan Data/floorplan.json]
//          [--metrics Data/metrics.json] [--movement Data/movement.json] [--style Data/greybox_style.json]
//          [--blender-audit Docs/audit/blender_audit_2026-09-07.json] [--audit Docs/audit/glb_audit.jsonl] [--models SourceAssets/models]
// asset_slots.normalized_size_m / tris are cross-checked against the BLENDER audit (rest pose, Z-up W x D x H - the values the
// Gate 4 scale script divides by); the node header parser (glb_audit.jsonl, glTF Y-up) is reported as INFO only, because it reads
// the two skinned demons 100x too small (audit headline finding 1).
// Exit 0 with a PASS summary; exit 1 with a numbered FAIL list.  WARN / INFO lines never change the exit code.
//
// The schema is Docs/FLOORPLAN-SCHEMA.md "Blockout data".  Every threshold comes from Data/greybox_style.json
// (blockout.rules, character defaults) or Data/movement.json (capsule radius -> lane widening 36 and corridor
// clear width 3 x 2r = 216; max_step_height_cm -> steppable items); nothing numeric is hard-coded here.
// BODY WAIVER (lead decision 2026-09-07, the corridor guard): a corridor station narrowed ONLY by characters against a
// wall (pose seated | prone | slumped, contact wall:<side>) needs rules.corridor_clear_min_past_body_cm (150) instead
// of 216 - a body you step past, not architecture; props keep 216. The PASS line names every waived station.
// Placements are checked as the GENERATOR builds them (Tools/ue/hf_geometry.py _blockout_actors): a wall-mounted
// prop is snapped flush to its wall (pos is ignored along the wall normal), a character is turned to face away
// from its contact wall and its back is snapped onto the wall / prop face - so what passes here is what gets built.
// REQ-G2-004 AC2 is tested here too (2026-09-07): per encounter, the widest spawn -> player_approach route on a 10 cm
// grid (bottleneck = the clearance at which the two cells connect; FAIL when the demon capsule does not fit, FAIL when
// a gap the demon passes THROUGH is under the corridor minimum - the standing discs of corridor_width / 2 around the
// spawn and the approach are exempt from the gap rule, a demon stepping out of a door stands 80 cm from that wall)
// and the dividing wall's free-end chokepoint; REQ-G2-005: a trigger / dwell volume standing in the sightline strip
// above eye height may only use a tint at or under rules.sightline_volume_max_opacity (WARN).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const SIDES = ['north', 'south', 'west', 'east'];
const OPPOSITE = { north: 'south', south: 'north', west: 'east', east: 'west' };
const NORMAL = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };   // outward unit normal of a room side
const SLOT_CLASSES = ['hero_weapon', 'enemy', 'human_prop', 'large_furniture', 'small_prop'];
const PIVOTS = ['floor', 'wall', 'muzzle'];
const POSES = ['seated', 'prone', 'slumped'];
const MOUNTS = ['floor', 'wall', 'ceiling'];
const OPTIONAL_SLOTS = ['SM_BrokenDoor', 'SM_ClosedDoor'];   // doors stay openings in Gate 2: unused -> WARN, not FAIL
const SLOT_NAME = /^(SM|SK)_[A-Za-z0-9]+$/;
const snake = /^[a-z][a-z0-9_]*$/;
const EPS = 1e-6;

const fails = [], warns = [], info = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);
const note = (m) => info.push(m);

function argValue(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
function readJson(p) {
  const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isStr = (v) => typeof v === 'string' && v.length > 0;
const isRect = (r) => r && isNum(r.x) && isNum(r.y) && isNum(r.w) && isNum(r.h) && r.w > 0 && r.h > 0;
const isPos = (p) => p && isNum(p.x) && isNum(p.y);
const isSize = (s) => s && isNum(s.w) && isNum(s.d) && isNum(s.h) && s.w > 0 && s.d > 0 && s.h > 0;
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const fmt = (v) => (Math.round(v * 10) / 10).toString();

// ---------------------------------------------------------------------------------------------
const boPath = process.argv[2];
if (!boPath || boPath.startsWith('--')) {
  console.error('usage: node Tools/validate_blockout.mjs <blockout.json> [--floorplan ...] [--metrics ...] [--movement ...] [--style ...] [--audit ...] [--models ...]');
  process.exit(2);
}
const fp = readJson(argValue('--floorplan', path.join(REPO, 'Data', 'floorplan.json')));
const metrics = readJson(argValue('--metrics', path.join(REPO, 'Data', 'metrics.json')));
const movement = readJson(argValue('--movement', path.join(REPO, 'Data', 'movement.json')));
const style = readJson(argValue('--style', path.join(REPO, 'Data', 'greybox_style.json')));
const auditPath = argValue('--audit', path.join(REPO, 'Docs', 'audit', 'glb_audit.jsonl'));
const blenderAuditPath = argValue('--blender-audit', path.join(REPO, 'Docs', 'audit', 'blender_audit_2026-09-07.json'));
const modelsDir = argValue('--models', path.join(REPO, 'SourceAssets', 'models'));
let bo;
try { bo = readJson(boPath); } catch (e) { console.error(`FAIL 1. cannot read/parse ${boPath}: ${e.message}`); process.exit(1); }

const bs = style.blockout;
if (!bs || !bs.rules || !bs.kind_tints || !bs.character_default_size_cm) { console.error('FAIL 1. Data/greybox_style.json has no complete "blockout" section (kind_tints, character_default_size_cm, rules)'); process.exit(1); }
const R = bs.rules;
const t = metrics.architecture.wall_thickness_cm;
const capsuleR = movement.player.capsule_radius_cm;
const laneWiden = capsuleR;                                  // lanes are capsule paths: widen by the capsule radius
const corridorClearMin = 3 * 2 * capsuleR;                   // metrics derived rule: 3 x capsule diameter = 216 (props / fixtures)
const bodyClearMin = isNum(R.corridor_clear_min_past_body_cm) ? R.corridor_clear_min_past_body_cm : corridorClearMin;   // 150: past a body against a corridor wall
if (!isNum(R.corridor_clear_min_past_body_cm)) note(`Data/greybox_style.json blockout.rules.corridor_clear_min_past_body_cm missing - no body waiver, every corridor item needs ${corridorClearMin}`);
const BODY_POSES = new Set(['seated', 'prone', 'slumped']);
const isBody = (it) => it.kind === 'character' && BODY_POSES.has(it.pose) && !!it.wall;   // a body against a wall: stepped past, not architecture
const stepH = movement.player.max_step_height_cm;            // items no taller than this are stepped over
const KIND_TINTS = bs.kind_tints;
const CHAR_DEFAULTS = bs.character_default_size_cm;
for (const k of ['trigger_tint', 'dwell_tint', 'halo_tint', 'demon_footprint_tint']) if (!isStr(bs[k]) || !style.tints[bs[k]]) fail(`Data/greybox_style.json blockout.${k} must name a tint in the tints table (got ${JSON.stringify(bs[k])})`);

// ---- 1. top-level schema ----------------------------------------------------------------------
if (bo.version !== 1) fail(`version must be 1 (got ${JSON.stringify(bo.version)})`);
if (bo.units !== 'cm') fail(`units must be "cm" (got ${JSON.stringify(bo.units)})`);
const partial = bo.coverage === 'partial';
if (bo.coverage !== undefined && !['full', 'partial'].includes(bo.coverage)) fail(`coverage must be "full" or "partial" (got ${JSON.stringify(bo.coverage)})`);
if (partial) note('coverage: partial - unused-slot / unslotted-GLB checks are INFO only (fixture or work in progress)');
for (const k of ['props', 'characters', 'pickups', 'demons']) if (bo[k] !== undefined && !Array.isArray(bo[k])) fail(`top-level "${k}" must be an array`);
if (!bo.asset_slots || typeof bo.asset_slots !== 'object' || Array.isArray(bo.asset_slots)) fail('top-level "asset_slots" must be an object keyed by SM_/SK_ name');
for (const k of ['triggers', 'backdrop', 'dwell']) if (!bo[k] || typeof bo[k] !== 'object') fail(`top-level "${k}" is required (REQ-G2-003/005)`);
const slots = bo.asset_slots && typeof bo.asset_slots === 'object' && !Array.isArray(bo.asset_slots) ? bo.asset_slots : {};
const props = Array.isArray(bo.props) ? bo.props : [];
const characters = Array.isArray(bo.characters) ? bo.characters : [];
const pickups = Array.isArray(bo.pickups) ? bo.pickups : [];
const demons = Array.isArray(bo.demons) ? bo.demons : [];

// ---- 2. floor plan lookups ----------------------------------------------------------------------
const roomById = new Map();
for (const r of fp.rooms || []) if (isStr(r.id) && isRect(r.rect)) roomById.set(r.id, r);
const openings = (fp.openings || []).filter((o) => Array.isArray(o.between) && roomById.get(o.between[0]) && SIDES.includes(o.wall) && isNum(o.center_along_wall_cm) && isNum(o.width_cm));
const encounters = (fp.encounters || []).filter((e) => isStr(e.id) && roomById.get(e.room) && isPos(e.spawn) && isRect(e.trigger_rect) && isPos(e.player_approach) && SIDES.includes(e.retreat_dir));
const ms = fp.money_shot && typeof fp.money_shot === 'object' ? fp.money_shot : {};
const face = (room, side) => (side === 'north' ? room.rect.y : side === 'south' ? room.rect.y + room.rect.h : side === 'west' ? room.rect.x : room.rect.x + room.rect.w);
function footprintRect(room, side, center, width) {   // opening hole in the wall strip (plan space)
  const r = room.rect, half = width / 2;
  if (side === 'north') return { x: center - half, y: r.y - t, w: width, h: t };
  if (side === 'south') return { x: center - half, y: r.y + r.h, w: width, h: t };
  if (side === 'west') return { x: r.x - t, y: center - half, w: t, h: width };
  return { x: r.x + r.w, y: center - half, w: t, h: width };
}
const rectCentre = (r) => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ---- 3. oriented footprints -----------------------------------------------------------------------
// An OBB is {cx, cy, ax, ay, ha, bx, by, hb}: centre, unit axis a with half extent ha, unit axis b with half extent hb.
function obb(cx, cy, w, d, yawDeg) {   // w along (cos yaw, sin yaw), d along (-sin yaw, cos yaw) - the generator's Box convention
  const c = Math.cos(yawDeg * Math.PI / 180), s = Math.sin(yawDeg * Math.PI / 180);
  return { cx, cy, ax: c, ay: s, ha: w / 2, bx: -s, by: c, hb: d / 2 };
}
const obbFromRect = (r) => obb(r.x + r.w / 2, r.y + r.h / 2, r.w, r.h, 0);
function corners(o) {
  const out = [];
  for (const [sa, sb] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) out.push([o.cx + sa * o.ax * o.ha + sb * o.bx * o.hb, o.cy + sa * o.ay * o.ha + sb * o.by * o.hb]);
  return out;
}
function aabb(o) {
  const cs = corners(o);
  return { x0: Math.min(...cs.map((c) => c[0])), x1: Math.max(...cs.map((c) => c[0])), y0: Math.min(...cs.map((c) => c[1])), y1: Math.max(...cs.map((c) => c[1])) };
}
function overlapOBB(a, b, tol) {   // separating-axis test; overlap only when both penetrate by > tol on every axis
  const ca = corners(a), cb = corners(b);
  for (const [nx, ny] of [[a.ax, a.ay], [a.bx, a.by], [b.ax, b.ay], [b.bx, b.by]]) {
    const pa = ca.map((c) => c[0] * nx + c[1] * ny), pb = cb.map((c) => c[0] * nx + c[1] * ny);
    if (Math.min(Math.max(...pa), Math.max(...pb)) - Math.max(Math.min(...pa), Math.min(...pb)) <= tol) return false;
  }
  return true;
}
function distPointOBB(o, px, py) {   // distance from a point to the footprint (0 inside)
  const dx = px - o.cx, dy = py - o.cy;
  const la = dx * o.ax + dy * o.ay, lb = dx * o.bx + dy * o.by;
  const ea = Math.max(0, Math.abs(la) - o.ha), eb = Math.max(0, Math.abs(lb) - o.hb);
  return Math.hypot(ea, eb);
}
function distSegmentOBB(o, x0, y0, x1, y1, step = 5) {   // sampled every 5 cm like validate_floorplan's lane test
  const len = Math.hypot(x1 - x0, y1 - y0), n = Math.max(1, Math.ceil(len / step));
  let best = Infinity;
  for (let i = 0; i <= n; i++) best = Math.min(best, distPointOBB(o, x0 + (x1 - x0) * i / n, y0 + (y1 - y0) * i / n));
  return best;
}
function insideRoom(o, room, margin) {   // every corner at least `margin` inside the room rect
  const r = room.rect;
  return corners(o).every(([x, y]) => x >= r.x + margin - EPS && x <= r.x + r.w - margin + EPS && y >= r.y + margin - EPS && y <= r.y + r.h - margin + EPS);
}
const roomOf = (x, y) => [...roomById.values()].find((r) => x >= r.rect.x - EPS && x <= r.rect.x + r.rect.w + EPS && y >= r.rect.y - EPS && y <= r.rect.y + r.rect.h + EPS);

// ---- 4. asset slots -------------------------------------------------------------------------------
const audit = new Map();   // path relative to the models dir -> Docs/audit/glb_audit.jsonl record
try {
  for (const line of fs.readFileSync(path.resolve(REPO, auditPath), 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    const rec = JSON.parse(line);
    audit.set(rec.file, rec);
  }
} catch (e) { note(`GLB audit ${auditPath} not readable (${e.message}); parser tris / bounds INFO skipped`); }
let blenderSlots = null;   // Docs/audit/blender_audit_*.json asset_slots: the authority for normalized_size_m / tris
try { blenderSlots = readJson(blenderAuditPath).asset_slots || null; if (!blenderSlots) note(`Blender audit ${blenderAuditPath} has no asset_slots; normalized_size_m / tris cross-check skipped`); }
catch (e) { note(`Blender audit ${blenderAuditPath} not readable (${e.message}); normalized_size_m / tris cross-check skipped`); }
const slotById = new Map();
const usedSlots = new Set();
for (const [name, s] of Object.entries(slots)) {
  if (!SLOT_NAME.test(name)) fail(`asset slot ${JSON.stringify(name)}: name must be SM_/SK_ followed by CamelCase`);
  if (!s || typeof s !== 'object') { fail(`asset slot "${name}" must be an object`); continue; }
  slotById.set(name, s);
  if (!isStr(s.source)) fail(`asset slot "${name}": source (SourceAssets/models/...glb) missing`);
  else {
    const abs = path.resolve(REPO, s.source);
    if (!fs.existsSync(abs)) fail(`asset slot "${name}": source ${s.source} does not exist`);
    else if (!/\.glb$/i.test(s.source)) warn(`asset slot "${name}": source ${s.source} is not a .glb`);
  }
  if (!SLOT_CLASSES.includes(s.class)) fail(`asset slot "${name}": class must be ${SLOT_CLASSES.join('|')} (got ${JSON.stringify(s.class)})`);
  if (!isSize(s.target_size_cm)) fail(`asset slot "${name}": target_size_cm must be {w,d,h} > 0`);
  if (!PIVOTS.includes(s.pivot)) fail(`asset slot "${name}": pivot must be ${PIVOTS.join('|')} (got ${JSON.stringify(s.pivot)})`);
  const sizeOk = Array.isArray(s.normalized_size_m) && s.normalized_size_m.length === 3 && s.normalized_size_m.every(isNum);
  if (!sizeOk) warn(`asset slot "${name}": normalized_size_m [w, d, h] missing (the Blender rest-pose size, Z-up, from Docs/audit/blender_audit_*.json)`);
  if (!isNum(s.tris)) warn(`asset slot "${name}": tris missing`);
  if (!isStr(s.note)) warn(`asset slot "${name}": note (why this size) missing - REQ-G2-001 records the decision`);
  if (s.class === 'enemy' && !name.startsWith('SK_')) warn(`asset slot "${name}": class enemy but not an SK_ (rigged) name`);
  if (blenderSlots) {   // the schema's primary fields must be the AUDITED values (Gate 4 scales by target / normalized)
    const b = blenderSlots[name];
    if (!b) warn(`asset slot "${name}" is not in the Blender audit ${path.basename(blenderAuditPath)}`);
    else {
      if (isNum(s.tris) && isNum(b.tris) && b.tris !== s.tris) warn(`asset slot "${name}": tris ${s.tris} differs from the Blender audit (${b.tris})`);
      if (sizeOk && Array.isArray(b.normalized_size_m) && s.normalized_size_m.some((v, i) => !near(v, b.normalized_size_m[i], 0.0011)))
        warn(`asset slot "${name}": normalized_size_m ${JSON.stringify(s.normalized_size_m)} differs from the Blender audit ${JSON.stringify(b.normalized_size_m)} (rest pose, Z-up W x D x H)`);
      if (isSize(s.target_size_cm) && isSize(b.target_size_cm) && ['w', 'd', 'h'].some((k) => !near(s.target_size_cm[k], b.target_size_cm[k], 0.05)) && !(name === 'SM_Shotgun' && near(s.target_size_cm.w, b.target_size_cm.w, 0.05) && near(s.target_size_cm.d, b.target_size_cm.h, 0.05) && near(s.target_size_cm.h, b.target_size_cm.d, 0.05)))
        warn(`asset slot "${name}": target_size_cm ${JSON.stringify(s.target_size_cm)} differs from the Blender audit ${JSON.stringify(b.target_size_cm)}`);
    }
  }
  if (isStr(s.source)) {   // node header parser: INFO only (glTF Y-up x, y, z -> Blender x, z, y); skinned meshes are the known 100x exception
    const rel = s.source.replace(/\\/g, '/').replace(/^SourceAssets\/models\//, '');
    const rec = audit.get(rel);
    if (rec) {
      if (name.startsWith('SK_') && !(rec.skins > 0)) warn(`asset slot "${name}": SK_ name but the GLB audit shows no rig`);
      if (name.startsWith('SM_') && rec.skins > 0) warn(`asset slot "${name}": SM_ name but the GLB audit shows a rig (${rec.joints} joints)`);
      if (isNum(s.tris_parser) && rec.tris !== s.tris_parser) warn(`asset slot "${name}": tris_parser ${s.tris_parser} is not the GLB audit's count (${rec.tris})`);
      if (Array.isArray(s.parser_size_m) && Array.isArray(rec.sizeXYZ_m) && s.parser_size_m.some((v, i) => !near(v, rec.sizeXYZ_m[i], 0.0011))) warn(`asset slot "${name}": parser_size_m ${JSON.stringify(s.parser_size_m)} is not the GLB audit's sizeXYZ_m ${JSON.stringify(rec.sizeXYZ_m)}`);
      if (sizeOk && Array.isArray(rec.sizeXYZ_m)) {
        const mapped = [rec.sizeXYZ_m[0], rec.sizeXYZ_m[2], rec.sizeXYZ_m[1]];
        const ratios = s.normalized_size_m.map((v, i) => (mapped[i] > 0 ? v / mapped[i] : NaN));
        if (ratios.every((r) => Math.abs(r - 1) <= 0.01)) { /* parser and Blender agree within 1 % */ }
        else if (rec.skins > 0 && s.normalized_size_m.every((v, i) => Math.abs(v / 100 - mapped[i]) <= 0.0006)) note(`asset slot "${name}": the node parser reads the skinned mesh 100x too small (${JSON.stringify(rec.sizeXYZ_m)} vs Blender ${JSON.stringify(s.normalized_size_m)}) - known header-parser limitation, Blender is authoritative`);
        else warn(`asset slot "${name}": normalized_size_m ${JSON.stringify(s.normalized_size_m)} vs the node parser (axis-mapped) ${JSON.stringify(mapped)} differ by more than 1 % and not by the skinned 100x`);
      }
      if (isNum(s.tris) && rec.tris !== s.tris && !(isNum(s.tris_parser) && s.tris_parser === rec.tris)) note(`asset slot "${name}": tris ${s.tris} (Blender) vs ${rec.tris} (parser) - Blender drops duplicate faces on import`);
    } else if (audit.size) warn(`asset slot "${name}": ${s.source} is not in the GLB audit`);
  }
}
const glbs = [];
(function walk(dir) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.glb$/i.test(e.name)) glbs.push(path.relative(REPO, p).replace(/\\/g, '/'));
  }
})(path.resolve(REPO, modelsDir));
const slotSources = new Set([...slotById.values()].map((s) => (isStr(s.source) ? s.source.replace(/\\/g, '/') : '')));
for (const g of glbs.sort()) if (!slotSources.has(g)) (partial ? note : warn)(`working-set GLB ${g} has no asset slot (REQ-G2-002 AC1: every asset gets a blockout)`);
if (!glbs.length) note(`no .glb found under ${modelsDir}; working-set coverage not checked`);

// ---- 5. items -> effective footprints (the generator's snapping rules) ------------------------------
const ids = new Set();
function checkId(item, what) {
  if (!isStr(item.id) || !snake.test(item.id)) { fail(`${what} id ${JSON.stringify(item.id)} must be snake_case`); return null; }
  if (ids.has(item.id)) { fail(`duplicate blockout id "${item.id}"`); return null; }
  ids.add(item.id);
  return item.id;
}
function checkSlot(item, what) {
  if (item.slot === null || item.slot === undefined) return null;
  if (!slotById.has(item.slot)) { fail(`${what}: slot ${JSON.stringify(item.slot)} is not in asset_slots`); return null; }
  usedSlots.add(item.slot);
  return item.slot;
}
function sizeVsSlot(what, size, slotName) {   // a blockout stands in for its asset: footprint (either orientation) and height within 10 %
  const s = slotById.get(slotName);
  if (!s || !isSize(s.target_size_cm)) return;
  const T = s.target_size_cm;
  const a = [size.w, size.d].sort((p, q) => p - q), b = [T.w, T.d].sort((p, q) => p - q);
  const off = (x, y) => Math.abs(x - y) / y;
  if (off(a[0], b[0]) > 0.1 || off(a[1], b[1]) > 0.1 || off(size.h, T.h) > 0.1)
    warn(`${what}: size ${size.w} x ${size.d} x ${size.h} differs by more than 10% from slot ${slotName} target ${T.w} x ${T.d} x ${T.h} (REQ-G4-002 swaps within 10%)`);
}
const items = [];          // {id, what, kind, room, obb, z0, z1, h, wall, size}
const propById = new Map();
for (const p of props) {
  const id = checkId(p, 'prop'); if (!id) continue;
  const what = `prop "${id}"`;
  const room = roomById.get(p.room);
  if (!room) { fail(`${what}: unknown room ${JSON.stringify(p.room)}`); continue; }
  const slot = checkSlot(p, what);
  if (!isStr(p.label)) warn(`${what}: label missing (the box label falls back to the id)`);
  if (!Object.keys(KIND_TINTS).includes(p.kind)) fail(`${what}: kind must be ${Object.keys(KIND_TINTS).join('|')} (got ${JSON.stringify(p.kind)})`);
  if (!isSize(p.size)) { fail(`${what}: size must be {w,d,h} > 0`); continue; }
  if (!isPos(p.pos)) { fail(`${what}: pos must be {x,y}`); continue; }
  if (p.yaw_deg !== undefined && !isNum(p.yaw_deg)) fail(`${what}: yaw_deg must be a number`);
  const yaw = isNum(p.yaw_deg) ? p.yaw_deg : 0;
  const mount = p.mount === undefined ? 'floor' : p.mount;
  if (!MOUNTS.includes(mount)) { fail(`${what}: mount must be ${MOUNTS.join('|')} (got ${JSON.stringify(p.mount)})`); continue; }
  if (p.z_cm !== undefined && !isNum(p.z_cm)) fail(`${what}: z_cm must be a number`);
  let z0 = isNum(p.z_cm) ? p.z_cm : 0;
  const o = obb(p.pos.x, p.pos.y, p.size.w, p.size.d, yaw);
  let wall = null;
  if (mount === 'floor' && !near(z0, 0)) fail(`${what}: mount floor with z_cm ${z0} - floor items sit at z 0, nothing floats`);
  if (mount === 'wall') {
    if (!SIDES.includes(p.wall)) { fail(`${what}: mount wall needs wall = ${SIDES.join('|')} (got ${JSON.stringify(p.wall)})`); continue; }
    wall = p.wall;
    const [nx, ny] = NORMAL[wall];
    const halfN = Math.abs(o.ax * nx + o.ay * ny) * o.ha + Math.abs(o.bx * nx + o.by * ny) * o.hb;
    if (wall === 'north' || wall === 'south') o.cy = face(room, wall) - ny * halfN; else o.cx = face(room, wall) - nx * halfN;
  }
  if (mount === 'ceiling') {
    const want = room.ceiling_cm - p.size.h;
    if (p.z_cm !== undefined && !near(p.z_cm, want, 0.5)) fail(`${what}: mount ceiling needs z_cm ${want} (ceiling ${room.ceiling_cm} - h ${p.size.h}), got ${p.z_cm}`);
    z0 = want;
  }
  if (z0 < -EPS) fail(`${what}: z_cm ${z0} is below the floor`);
  if (z0 + p.size.h > room.ceiling_cm + EPS) fail(`${what}: top ${z0 + p.size.h} is above the ${room.id} ceiling ${room.ceiling_cm}`);
  if (slot) sizeVsSlot(what, p.size, slot);
  const it = { id, what, kind: 'prop', propKind: p.kind, note: isStr(p.note) ? p.note : '', room, obb: o, z0, z1: z0 + p.size.h, h: p.size.h, wall, size: p.size };
  items.push(it);
  propById.set(id, it);
}
for (const c of characters) {
  const id = checkId(c, 'character'); if (!id) continue;
  const what = `character "${id}"`;
  const room = roomById.get(c.room);
  if (!room) { fail(`${what}: unknown room ${JSON.stringify(c.room)}`); continue; }
  const slot = checkSlot(c, what);
  if (!isStr(c.label)) warn(`${what}: label missing`);
  const pose = c.pose === undefined ? 'seated' : c.pose;
  if (!POSES.includes(pose)) { fail(`${what}: pose must be ${POSES.join('|')} (got ${JSON.stringify(c.pose)})`); continue; }
  const def = CHAR_DEFAULTS[pose];
  if (!Array.isArray(def) || def.length !== 3) { fail(`greybox_style.blockout.character_default_size_cm.${pose} must be [w, d, h]`); continue; }
  let size;
  if (c.size === undefined) size = { w: def[0], d: def[1], h: def[2] };
  else if (isSize(c.size)) size = c.size;
  else { fail(`${what}: size must be {w,d,h} > 0 (or omitted for the ${pose} default ${def.join(' x ')})`); continue; }
  if (!isPos(c.pos)) { fail(`${what}: pos must be {x,y}`); continue; }
  if (c.yaw_deg !== undefined && !isNum(c.yaw_deg)) fail(`${what}: yaw_deg must be a number`);
  let facing = ((isNum(c.yaw_deg) ? c.yaw_deg : 0) % 360 + 360) % 360;
  const contact = c.contact === undefined ? 'floor' : String(c.contact);
  let cx = c.pos.x, cy = c.pos.y, wall = null;
  if (contact.startsWith('wall:')) {
    const side = contact.slice(5);
    if (!SIDES.includes(side)) { fail(`${what}: contact ${JSON.stringify(contact)} - the wall side must be ${SIDES.join('|')}`); continue; }
    wall = side;
    const [nx, ny] = NORMAL[side];
    const want = ((Math.atan2(-ny, -nx) * 180 / Math.PI) % 360 + 360) % 360;
    if (Math.abs(((facing - want) % 360 + 540) % 360 - 180) > 1e-6) { fail(`${what}: yaw_deg ${facing} must face away from the ${side} wall (${want}) so its back is flush with it`); facing = want; }
    if (side === 'north' || side === 'south') cy = face(room, side) - ny * size.d / 2; else cx = face(room, side) - nx * size.d / 2;
  } else if (contact.startsWith('prop:')) {
    const pid = contact.slice(5);
    const pr = propById.get(pid);
    if (!pr) { fail(`${what}: contact prop ${JSON.stringify(pid)} is not a prop in this file`); continue; }
    if (pr.room !== room) fail(`${what}: contact prop "${pid}" is in room "${pr.room.id}", not "${room.id}"`);
    const fx = Math.cos(facing * Math.PI / 180), fy = Math.sin(facing * Math.PI / 180), px = -fy, py = fx;
    const cs = corners(pr.obb);
    const back = Math.max(...cs.map(([x, y]) => x * fx + y * fy));
    const s = cx * fx + cy * fy;
    if (s < back - 0.5) fail(`${what}: contact prop "${pid}" is not behind it - the authored centre sits ${fmt(back - s)} cm inside / in front of the prop along the facing`);
    const lat = cx * px + cy * py;
    const pp = cs.map(([x, y]) => x * px + y * py);
    if (Math.min(Math.max(...pp), lat + size.w / 2) - Math.max(Math.min(...pp), lat - size.w / 2) <= EPS) fail(`${what}: does not lean on prop "${pid}" (no overlap across the facing)`);
    const shift = (back + size.d / 2) - s;
    cx += fx * shift; cy += fy * shift;
  } else if (contact !== 'floor') { fail(`${what}: contact must be floor | wall:<side> | prop:<id> (got ${JSON.stringify(contact)})`); continue; }
  else if (pose !== 'prone') warn(`${what}: ${pose} pose with contact "floor" - seated / slumped bodies were authored against a surface (REQ-G2-003 AC2)`);
  const moved = Math.hypot(cx - c.pos.x, cy - c.pos.y);
  if (moved > R.snap_warn_cm) warn(`${what}: pos (${c.pos.x}, ${c.pos.y}) is ${fmt(moved)} cm off its contact surface; the generator snaps it to (${fmt(cx)}, ${fmt(cy)}) - author that`);
  if (size.h > room.ceiling_cm + EPS) fail(`${what}: height ${size.h} exceeds the ${room.id} ceiling ${room.ceiling_cm}`);
  if (slot) sizeVsSlot(what, size, slot);
  items.push({ id, what, kind: 'character', room, obb: obb(cx, cy, size.w, size.d, facing - 90), z0: 0, z1: size.h, h: size.h, wall, size, pose });
}
for (const k of pickups) {
  const id = checkId(k, 'pickup'); if (!id) continue;
  const what = `pickup "${id}"`;
  const room = roomById.get(k.room);
  if (!room) { fail(`${what}: unknown room ${JSON.stringify(k.room)}`); continue; }
  const slot = checkSlot(k, what);
  if (!isStr(k.label)) warn(`${what}: label missing`);
  if (!isSize(k.size)) { fail(`${what}: size must be {w,d,h} > 0`); continue; }
  if (!isPos(k.pos)) { fail(`${what}: pos must be {x,y}`); continue; }
  if (k.yaw_deg !== undefined && !isNum(k.yaw_deg)) fail(`${what}: yaw_deg must be a number`);
  if (k.halo !== true) warn(`${what}: halo is not true - pickups carry the green halo box (spec)`);
  if (slot) sizeVsSlot(what, k.size, slot);
  const kyaw = isNum(k.yaw_deg) ? k.yaw_deg : 0;
  if (k.halo === true && isNum(bs.pickup_halo_cm) && isNum(bs.pickup_halo_margin_cm)) {   // the generator's enclosing halo (no collision, but it must not poke through a wall)
    const hw = Math.max(k.size.w + 2 * bs.pickup_halo_margin_cm, bs.pickup_halo_cm), hd = Math.max(k.size.d + 2 * bs.pickup_halo_margin_cm, bs.pickup_halo_cm);
    if (!insideRoom(obb(k.pos.x, k.pos.y, hw, hd, kyaw), room, 0)) warn(`${what}: its ${hw} x ${hd} halo box (item + ${bs.pickup_halo_margin_cm} cm margin, min ${bs.pickup_halo_cm}) pokes through a wall of "${room.id}"`);
  }
  items.push({ id, what, kind: 'pickup', room, obb: obb(k.pos.x, k.pos.y, k.size.w, k.size.d, kyaw), z0: 0, z1: k.size.h, h: k.size.h, wall: null, size: k.size });
}
const encById = new Map(encounters.map((e) => [e.id, e]));
const demonsByEnc = new Map();
const demonDiscs = [];
for (const d of demons) {
  const id = checkId(d, 'demon'); if (!id) continue;
  const what = `demon "${id}"`;
  const e = encById.get(d.encounter);
  if (!e) { fail(`${what}: encounter ${JSON.stringify(d.encounter)} is not in the floor plan`); continue; }
  demonsByEnc.set(e.id, (demonsByEnc.get(e.id) || 0) + 1);
  const slot = checkSlot(d, what);
  if (slot && slotById.get(slot).class !== 'enemy') warn(`${what}: slot ${slot} is class ${slotById.get(slot).class}, expected enemy`);
  if (!isNum(d.radius_cm) || d.radius_cm <= 0 || !isNum(d.height_cm) || d.height_cm <= 0) { fail(`${what}: radius_cm and height_cm must be > 0`); continue; }
  if (!near(d.radius_cm, e.capsule_radius_cm)) warn(`${what}: radius_cm ${d.radius_cm} differs from encounter ${e.id} capsule_radius_cm ${e.capsule_radius_cm}`);
  if (!near(d.height_cm, e.capsule_height_cm)) warn(`${what}: height_cm ${d.height_cm} differs from encounter ${e.id} capsule_height_cm ${e.capsule_height_cm}`);
  if (slot && isSize(slotById.get(slot).target_size_cm) && !near(slotById.get(slot).target_size_cm.h, d.height_cm)) warn(`${what}: height_cm ${d.height_cm} differs from slot ${slot} target height ${slotById.get(slot).target_size_cm.h}`);
  if (!isStr(d.label)) warn(`${what}: label missing (e.g. "DEMON #1 (SK_EmberDemon) 220 cm - mesh 162 x 204 x 220, capsule r 45")`);
  if (d.footprint_cm !== undefined) {   // the audited mesh (wing) footprint drawn as a translucent no-collision box around the cylinder
    const f = d.footprint_cm, T = slot ? slotById.get(slot).target_size_cm : null;
    if (!f || !isNum(f.w) || !isNum(f.d) || f.w <= 0 || f.d <= 0) fail(`${what}: footprint_cm must be {w, d} > 0`);
    else if (T && isSize(T) && (Math.abs(f.w - T.w) / T.w > 0.1 || Math.abs(f.d - T.d) / T.d > 0.1)) warn(`${what}: footprint_cm ${f.w} x ${f.d} differs by more than 10% from slot ${slot} target ${T.w} x ${T.d} (REQ-G2-003 AC1: the audited dimensions)`);
  } else if (slot) note(`${what}: no footprint_cm - only the pathing capsule is drawn, the audited mesh footprint (${slotById.get(slot).target_size_cm.w} x ${slotById.get(slot).target_size_cm.d}) is not shown`);
  demonDiscs.push({ x: e.spawn.x, y: e.spawn.y, r: d.radius_cm, why: `${what} at the ${e.id} spawn` });
}
for (const e of encounters) { const n = demonsByEnc.get(e.id) || 0; if (n !== 1) fail(`encounter "${e.id}" needs exactly one demon blockout (has ${n})`); }

// ---- 6. keep-clear geometry from the floor plan ------------------------------------------------------------
const swings = [];   // {room, rect, why}: door_swing_cm deep, at least door_swing_cm wide (an "open" keeps its full width)
function swingZone(room, side, center, width) {
  const r = room.rect, half = Math.max(R.door_swing_cm, width) / 2, dep = R.door_swing_cm;
  const z = side === 'north' ? { x: center - half, y: r.y, w: 2 * half, h: dep } : side === 'south' ? { x: center - half, y: r.y + r.h - dep, w: 2 * half, h: dep }
    : side === 'west' ? { x: r.x, y: center - half, w: dep, h: 2 * half } : { x: r.x + r.w - dep, y: center - half, w: dep, h: 2 * half };
  const x0 = Math.max(z.x, r.x), y0 = Math.max(z.y, r.y), x1 = Math.min(z.x + z.w, r.x + r.w), y1 = Math.min(z.y + z.h, r.y + r.h);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
for (const o of openings) {
  if (o.type === 'window') continue;
  const a = roomById.get(o.between[0]), b = o.between.length > 1 ? roomById.get(o.between[1]) : null;
  swings.push({ room: a, side: o.wall, type: o.type, center: o.center_along_wall_cm, width: o.width_cm, rect: swingZone(a, o.wall, o.center_along_wall_cm, o.width_cm), why: `${o.type} "${o.id}"` });
  if (b) swings.push({ room: b, side: OPPOSITE[o.wall], type: o.type, center: o.center_along_wall_cm, width: o.width_cm, rect: swingZone(b, OPPOSITE[o.wall], o.center_along_wall_cm, o.width_cm), why: `${o.type} "${o.id}"` });
}
const ductRoutes = [];   // player start -> duct mouth in the start room: the first thing every player walks (REQ-G2-002 AC3)
const startMarker = (fp.markers || []).find((m) => m.kind === 'player_start' && isPos(m.pos));
for (const d of fp.ducts || []) {
  const a = roomById.get(d.from), b = roomById.get(d.to);
  if (!a || !b || !isPos(d.start) || !isNum(d.interior_width_cm)) continue;
  let aSide, bSide, lateral;
  if (d.axis === 'y') { lateral = d.start.x; if (b.rect.y >= a.rect.y + a.rect.h) { aSide = 'south'; bSide = 'north'; } else { aSide = 'north'; bSide = 'south'; } }
  else { lateral = d.start.y; if (b.rect.x >= a.rect.x + a.rect.w) { aSide = 'east'; bSide = 'west'; } else { aSide = 'west'; bSide = 'east'; } }
  swings.push({ room: a, side: aSide, type: 'duct_mouth', center: lateral, width: d.interior_width_cm, rect: swingZone(a, aSide, lateral, d.interior_width_cm), why: `duct mouth "${d.id}"` });
  swings.push({ room: b, side: bSide, type: 'duct_mouth', center: lateral, width: d.interior_width_cm, rect: swingZone(b, bSide, lateral, d.interior_width_cm), why: `duct mouth "${d.id}"` });
  if (startMarker && startMarker.room === d.from) ductRoutes.push({ room: a, x0: startMarker.pos.x, y0: startMarker.pos.y, x1: d.start.x, y1: d.start.y, why: `the player start -> duct mouth "${d.id}" route` });
}
// A 'door' prop flush on the wall INSIDE a locked_door opening's span is that opening's shut door (SM_ClosedDoor where it will be
// used): nothing swings there, so that one zone is waived for it. It still counts for the corridor clear width and every other rule.
function isClosedDoorIn(it, s) {
  if (s.type !== 'locked_door' || it.kind !== 'prop' || it.propKind !== 'door' || it.wall !== s.side) return false;
  const bb = aabb(it.obb), ns = s.side === 'north' || s.side === 'south', lo = ns ? bb.x0 : bb.y0, hi = ns ? bb.x1 : bb.y1;
  return lo >= s.center - s.width / 2 - 0.5 && hi <= s.center + s.width / 2 + 0.5;
}
const blockedRects = [];   // collapse wedges + the dividing wall: solid, never overlapped
function farSideOf(room) {
  for (const o of openings) { if (o.type === 'duct_mouth') continue; if (o.between[0] === room.id) return OPPOSITE[o.wall]; if (o.between[1] === room.id) return o.wall; }
  return 'north';
}
for (const b of fp.blockers || []) {
  if (b.kind !== 'collapse' || !isNum(b.depth_cm)) continue;
  const room = roomById.get(b.room); if (!room) continue;
  const far = farSideOf(room), r = room.rect, dpt = b.depth_cm;
  const rect = far === 'north' ? { x: r.x, y: r.y, w: r.w, h: dpt } : far === 'south' ? { x: r.x, y: r.y + r.h - dpt, w: r.w, h: dpt } : far === 'west' ? { x: r.x, y: r.y, w: dpt, h: r.h } : { x: r.x + r.w - dpt, y: r.y, w: dpt, h: r.h };
  blockedRects.push({ room, obb: obbFromRect(rect), why: `the collapse wedge "${b.id}"` });
}
if (ms.dividing_wall) {
  const dv = ms.dividing_wall, room = roomById.get(ms.room);
  if (room && dv.along === 'x' && [dv.at_y, dv.from_x, dv.to_x].every(isNum)) blockedRects.push({ room, obb: obbFromRect({ x: dv.from_x, y: dv.at_y - t / 2, w: dv.to_x - dv.from_x, h: t }), why: 'the money-shot dividing wall' });
  if (room && dv.along === 'y' && [dv.at_x, dv.from_y, dv.to_y].every(isNum)) blockedRects.push({ room, obb: obbFromRect({ x: dv.at_x - t / 2, y: dv.from_y, w: t, h: dv.to_y - dv.from_y }), why: 'the money-shot dividing wall' });
}
const lanes = [];   // retreat + strafe segments (validate_floorplan proves them clear of architecture; here of blockouts)
for (const e of encounters) {
  const [dx, dy] = NORMAL[e.retreat_dir], p = e.player_approach;
  if (isNum(e.retreat_clear_cm)) lanes.push({ enc: e.id, kind: `retreat (${e.retreat_dir} ${e.retreat_clear_cm})`, x0: p.x, y0: p.y, x1: p.x + dx * e.retreat_clear_cm, y1: p.y + dy * e.retreat_clear_cm });
  if (isNum(e.strafe_clear_each_side_cm)) for (const sgn of [1, -1]) lanes.push({ enc: e.id, kind: `strafe ${sgn > 0 ? '+' : '-'}${e.strafe_clear_each_side_cm}`, x0: p.x, y0: p.y, x1: p.x + sgn * dy * e.strafe_clear_each_side_cm, y1: p.y + sgn * dx * e.strafe_clear_each_side_cm });
}
const discs = [...demonDiscs];
for (const c of fp.checkpoints || []) if (isPos(c.pos)) discs.push({ x: c.pos.x, y: c.pos.y, r: R.checkpoint_clear_radius_cm, why: `checkpoint "${c.id}"` });
for (const m of fp.markers || []) if (m.kind === 'player_start' && isPos(m.pos)) discs.push({ x: m.pos.x, y: m.pos.y, r: R.player_start_clear_radius_cm, why: 'the player start' });
const figures = (fp.markers || []).filter((m) => m.kind === 'reference_figure' && isPos(m.pos)).map((m) => ({ id: m.id, room: m.room, obb: obb(m.pos.x, m.pos.y, metrics.architecture.reference_figure_width_cm, metrics.architecture.reference_figure_depth_cm, 0) }));
const scenes = (fp.scenes || []).filter((s) => isStr(s.id) && isRect(s.rect)).map((s) => ({ id: s.id, kind: s.kind, room: s.room, obb: obbFromRect(s.rect) }));
let sight = null;   // door centre -> window centre strip in the money-shot room
{
  const room = roomById.get(ms.room), entry = openings.find((o) => o.id === ms.entry_opening_id);
  if (room && entry && SIDES.includes(ms.window_wall)) {
    const ef = footprintRect(roomById.get(entry.between[0]), entry.wall, entry.center_along_wall_cm, entry.width_cm);
    const door = rectCentre(ef), r = room.rect;
    const wc = ms.window_wall === 'south' ? { x: r.x + r.w / 2, y: r.y + r.h } : ms.window_wall === 'north' ? { x: r.x + r.w / 2, y: r.y } : ms.window_wall === 'east' ? { x: r.x + r.w, y: r.y + r.h / 2 } : { x: r.x, y: r.y + r.h / 2 };
    const len = Math.hypot(wc.x - door.x, wc.y - door.y);
    sight = { room, door, wc, len, obb: obb((door.x + wc.x) / 2, (door.y + wc.y) / 2, len, 2 * R.sightline_half_width_cm, Math.atan2(wc.y - door.y, wc.x - door.x) * 180 / Math.PI) };
  } else if (Object.keys(ms).length) warn('money_shot room / entry opening / window_wall not resolvable: the sightline strip is not checked');
}

// ---- 7. placement rules -----------------------------------------------------------------------------------------
const margin = R.wall_margin_cm;
for (const it of items) {
  const r = it.room.rect, w = it.wall;
  const minX = r.x + (w === 'west' ? 0 : margin), maxX = r.x + r.w - (w === 'east' ? 0 : margin);
  const minY = r.y + (w === 'north' ? 0 : margin), maxY = r.y + r.h - (w === 'south' ? 0 : margin);
  if (!corners(it.obb).every(([x, y]) => x >= minX - EPS && x <= maxX + EPS && y >= minY - EPS && y <= maxY + EPS)) {
    const bb = aabb(it.obb);
    fail(`${it.what}: footprint x ${fmt(bb.x0)}..${fmt(bb.x1)} y ${fmt(bb.y0)}..${fmt(bb.y1)} is not inside room "${it.room.id}" (x ${r.x}..${r.x + r.w}, y ${r.y}..${r.y + r.h}) with ${margin} cm to the walls${w ? ` (flush on the ${w} wall)` : ''}`);
  }
  for (const s of swings) if (s.room === it.room && s.rect.w > 0 && s.rect.h > 0 && overlapOBB(it.obb, obbFromRect(s.rect), 0.5)) {
    if (isClosedDoorIn(it, s)) note(`${it.what} stands IN ${s.why} as its shut door (swing zone waived: a locked door does not swing)`);
    else fail(`${it.what} blocks the ${R.door_swing_cm} cm clear zone in front of ${s.why} in "${it.room.id}"`);
  }
  for (const rt of ductRoutes) if (rt.room === it.room) { const dd = distSegmentOBB(it.obb, rt.x0, rt.y0, rt.x1, rt.y1); if (dd < laneWiden - EPS) fail(`${it.what} is ${fmt(dd)} cm from ${rt.why} (player capsule radius ${laneWiden}: the first move must not catch - REQ-G2-002 AC3)`); }
  for (const b of blockedRects) if (b.room === it.room && overlapOBB(it.obb, b.obb, 0.5)) fail(`${it.what} intersects ${b.why}`);
  for (const ln of lanes) { const dd = distSegmentOBB(it.obb, ln.x0, ln.y0, ln.x1, ln.y1); if (dd < laneWiden - EPS) fail(`${it.what} intrudes ${fmt(laneWiden - dd)} cm into encounter "${ln.enc}" ${ln.kind} lane (player capsule radius ${laneWiden})`); }
  for (const dc of discs) { const dd = distPointOBB(it.obb, dc.x, dc.y); if (dd < dc.r - EPS) fail(`${it.what} is ${fmt(dd)} cm from ${dc.why} (keep ${dc.r} clear)`); }
  for (const sc of scenes) if (sc.room === it.room.id && overlapOBB(it.obb, sc.obb, 0.5)) {
    // a prop may lie in a scene rect only when the scene is a tableau (kind 'scene') and the prop's note names it: the prop IS the
    // tableau (a boardroom table, a desk island). monster / ambush / pickup / reveal floors stay open. Characters / pickups: WARN.
    if (it.kind === 'prop' && !(sc.kind === 'scene' && it.note.includes(sc.id))) fail(`${it.what} covers scene marker "${sc.id}" (${sc.kind}) - scene markers stay visible (a prop may lie in a kind-'scene' rect only when its note names the scene as its own tableau)`);
    else warn(`${it.what} lies in scene marker "${sc.id}" (${sc.kind}); fine when it is that scene's own content`);
  }
  if (sight && it.room === sight.room && overlapOBB(it.obb, sight.obb, 0.5)) fail(`${it.what} crosses the money-shot sightline strip (door centre -> window centre, +-${R.sightline_half_width_cm} cm) (REQ-G2-005 AC2)`);
  for (const f of figures) if (f.room === it.room.id && overlapOBB(it.obb, f.obb, 0.5)) warn(`${it.what} overlaps the reference figure marker "${f.id}" (the 180 cm figure will poke through it in screenshots)`);
}
let pairs = 0;
for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
  const a = items[i], b = items[j];
  if (Math.min(a.z1, b.z1) - Math.max(a.z0, b.z0) <= 0.5) continue;
  pairs++;
  if (overlapOBB(a.obb, b.obb, 0.5)) fail(`${a.what} and ${b.what} intersect (flush contact is fine, penetration is not)`);
}
// corridors: the widest free gap across the corridor past every (non-steppable) blockout must stay >= 3 x capsule diameter -
// except at a station narrowed ONLY by bodies against the wall (isBody), which needs bodyClearMin (the body waiver); a prop at
// the station, alone or beside a body, keeps the full minimum. Each waived station is reported on the PASS line.
const corridorReports = [], bodyWaivers = [];
for (const room of roomById.values()) {
  if (!room.id.startsWith('corridor_')) continue;
  const r = room.rect, alongX = r.w >= r.h;
  const its = items.filter((it) => it.room === room && it.h > stepH + EPS).map((it) => ({ it, bb: aabb(it.obb) }));
  if (!its.length) continue;
  const events = [...new Set(its.flatMap(({ bb }) => (alongX ? [bb.x0, bb.x1] : [bb.y0, bb.y1])))].sort((a, b) => a - b);
  let worst = Infinity, worstItems = '', worstMin = corridorClearMin;
  for (let k = 0; k + 1 < events.length; k++) {
    const mid = (events[k] + events[k + 1]) / 2;
    const here = its.filter(({ bb }) => (alongX ? bb.x0 < mid && bb.x1 > mid : bb.y0 < mid && bb.y1 > mid));
    if (!here.length) continue;
    const lo = alongX ? r.y : r.x, hi = alongX ? r.y + r.h : r.x + r.w;
    const blocked = here.map(({ bb }) => (alongX ? [bb.y0, bb.y1] : [bb.x0, bb.x1])).sort((a, b) => a[0] - b[0]);
    let cursor = lo, gap = 0;
    for (const [b0, b1] of blocked) { gap = Math.max(gap, b0 - cursor); cursor = Math.max(cursor, b1); }
    gap = Math.max(gap, hi - cursor);
    const what = here.map((h) => h.it.what).join(' + '), need = here.every(({ it }) => isBody(it)) ? bodyClearMin : corridorClearMin;
    if (need < corridorClearMin && gap < corridorClearMin - EPS && !bodyWaivers.some((w) => w.room === room.id && w.what === what)) bodyWaivers.push({ room: room.id, what, gap });
    if (gap < need - EPS) fail(`corridor "${room.id}" keeps only ${fmt(gap)} cm clear past ${what} (need >= ${need}${need < corridorClearMin ? ` = rules.corridor_clear_min_past_body_cm, the body waiver` : ' = 3 x capsule diameter'})`);
    if (gap < worst) { worst = gap; worstItems = what; worstMin = need; }
  }
  if (Number.isFinite(worst)) corridorReports.push(`${room.id} ${fmt(worst)} past ${worstItems}${worstMin < corridorClearMin ? ` (body waiver ${worstMin})` : ''}`);
}
for (const w of bodyWaivers) note(`corridor "${w.room}": ${fmt(w.gap)} cm clear past ${w.what} is under the ${corridorClearMin} prop minimum and passes on the ${bodyClearMin} body waiver (rules.corridor_clear_min_past_body_cm: a body against the wall you step past, not architecture)`);
// pickup scenes hold their pickup (or the character it lies beside) and every pickup lies in some pickup scene: a content-less
// "pickup" marker or a pickup made elsewhere means the frozen plan's narrative placement moved (WARN - Rob's call, not a data error)
const pickupScenes = scenes.filter((s) => s.kind === 'pickup');
for (const sc of pickupScenes) {
  if (!items.some((it) => (it.kind === 'pickup' || it.kind === 'character') && it.room.id === sc.room && overlapOBB(it.obb, sc.obb, 0.5)))
    warn(`scene "${sc.id}" (pickup) in "${sc.room}" has no pickup or character inside its rect - the marker is content-less (placement moved or not built yet)`);
}
for (const it of items.filter((it) => it.kind === 'pickup')) {
  if (!pickupScenes.some((sc) => sc.room === it.room.id && overlapOBB(it.obb, sc.obb, 0.5)))
    warn(`${it.what} in "${it.room.id}" lies outside every pickup scene rect (plan pickup scenes: ${pickupScenes.map((s) => `"${s.id}" in ${s.room}`).join(', ') || 'none'})`);
}

// ---- 7b. REQ-G2-004 AC2: a demon-sized capsule paths spawn -> player_approach with no gap under the corridor minimum -------
// Obstacles: the room walls, the blocked rects (dividing wall, collapse wedges) and every blockout taller than max_step_height in
// the encounter room.  Clearance is sampled at the centre of 10 cm cells; cells are joined in decreasing clearance order until the
// spawn cell and the approach cell connect - that clearance is the bottleneck of the widest route, and 2 x it the narrowest gap
// the demon must squeeze through.  Two passes: (1) raw clearance - the demon capsule must fit along some route at all; (2) the
// corridor-minimum rule on the gaps it passes THROUGH - cells within corridor_width / 2 of the spawn or the approach are where the
// demon / player stand, not a gap, so they count as open passage there (unless the demon does not fit in them at all).  Sampling
// can under-read a gap by up to one cell diagonal, so that slack is granted before a FAIL.
const corridorMin = metrics.architecture.corridor_width_cm;
const CELL = 10, CELL_SLACK = CELL * Math.SQRT2;
const pathReports = [];
const freeEnds = [];   // ends of the money-shot dividing wall that do not touch a room wall: the classic chokepoint
if (ms.dividing_wall && roomById.get(ms.room)) {
  const dv = ms.dividing_wall, r = roomById.get(ms.room).rect;
  if (dv.along === 'x' && [dv.at_y, dv.from_x, dv.to_x].every(isNum)) for (const x of [dv.from_x, dv.to_x]) if (x > r.x + EPS && x < r.x + r.w - EPS) freeEnds.push({ x, y: dv.at_y, side: x === dv.from_x ? 'west' : 'east' });
  if (dv.along === 'y' && [dv.at_x, dv.from_y, dv.to_y].every(isNum)) for (const y of [dv.from_y, dv.to_y]) if (y > r.y + EPS && y < r.y + r.h - EPS) freeEnds.push({ x: dv.at_x, y, side: y === dv.from_y ? 'north' : 'south' });
}
for (const e of encounters) {
  const room = roomById.get(e.room), r = room.rect;
  const dm = demons.find((d) => d.encounter === e.id && isNum(d.radius_cm));
  const demonR = dm ? dm.radius_cm : e.capsule_radius_cm;
  const inRoom = (p) => p.x >= r.x - EPS && p.x <= r.x + r.w + EPS && p.y >= r.y - EPS && p.y <= r.y + r.h + EPS;
  if (!inRoom(e.spawn) || !inRoom(e.player_approach)) { warn(`encounter "${e.id}": spawn or player_approach lies outside "${room.id}" - the spawn -> approach route is not checked`); continue; }
  const solids = [...blockedRects.filter((b) => b.room === room).map((b) => b.obb), ...items.filter((it) => it.room === room && it.h > stepH + EPS).map((it) => it.obb)];
  const nx = Math.max(1, Math.round(r.w / CELL)), ny = Math.max(1, Math.round(r.h / CELL));
  const clearance = new Float64Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const x = r.x + (i + 0.5) * CELL, y = r.y + (j + 0.5) * CELL;
    let c = Math.min(x - r.x, r.x + r.w - x, y - r.y, r.y + r.h - y);
    for (const o of solids) { c = Math.min(c, distPointOBB(o, x, y)); if (c <= 0) break; }
    clearance[j * nx + i] = c;
  }
  const cellOf = (p) => Math.min(ny - 1, Math.max(0, Math.floor((p.y - r.y) / CELL))) * nx + Math.min(nx - 1, Math.max(0, Math.floor((p.x - r.x) / CELL)));
  const a = cellOf(e.spawn), b = cellOf(e.player_approach);
  const widest = (clr) => {   // bottleneck clearance of the widest a -> b route (0 when unreachable)
    const order = Array.from(clr.keys()).sort((p, q) => clr[q] - clr[p]);
    const parent = new Int32Array(nx * ny).fill(-1);
    const find = (v) => { while (parent[v] !== v) { parent[v] = parent[parent[v]]; v = parent[v]; } return v; };
    for (const v of order) {
      parent[v] = v;
      const i = v % nx, j = (v - i) / nx;
      for (const w of [i > 0 ? v - 1 : -1, i + 1 < nx ? v + 1 : -1, j > 0 ? v - nx : -1, j + 1 < ny ? v + nx : -1]) {
        if (w < 0 || parent[w] < 0) continue;
        const ra = find(v), rb = find(w);
        if (ra !== rb) parent[ra] = rb;
      }
      if (parent[a] >= 0 && parent[b] >= 0 && find(a) === find(b)) return clr[v];
    }
    return 0;
  };
  const route = `spawn (${e.spawn.x}, ${e.spawn.y}) -> player_approach (${e.player_approach.x}, ${e.player_approach.y}) in "${room.id}"`;
  const fit = 2 * widest(clearance);
  if (fit + CELL_SLACK < 2 * demonR) { fail(`encounter "${e.id}": the demon capsule (r${demonR}) cannot path ${route} - the widest route pinches to ${fmt(fit)} cm (REQ-G2-004 AC2)`); continue; }
  const FREE = 1e9, standR = corridorMin / 2;
  const routeClr = Float64Array.from(clearance, (c, v) => {
    if (c < demonR) return c;
    const i = v % nx, j = (v - i) / nx, x = r.x + (i + 0.5) * CELL, y = r.y + (j + 0.5) * CELL;
    return Math.hypot(x - e.spawn.x, y - e.spawn.y) <= standR || Math.hypot(x - e.player_approach.x, y - e.player_approach.y) <= standR ? FREE : c;
  });
  const gapB = widest(routeClr), gap = gapB >= FREE ? Infinity : 2 * gapB;
  if (gap + CELL_SLACK < corridorMin) fail(`encounter "${e.id}": the widest route ${route} squeezes through a ${fmt(gap)} cm gap outside the ${standR} cm standing discs, narrower than the corridor minimum ${corridorMin} (REQ-G2-004 AC2)`);
  pathReports.push(`${e.id} ${Number.isFinite(gap) ? fmt(gap) : 'open (spawn and approach share a standing disc)'}`);
  if (room.id === ms.room) for (const fe of freeEnds) {   // exact: the free end vs the nearest non-steppable blockout beyond it (or the room wall)
    const bb = (it) => aabb(it.obb);
    const beyond = items.filter((it) => it.room === room && it.h > stepH + EPS && (fe.side === 'west' ? bb(it).x1 <= fe.x + EPS : fe.side === 'east' ? bb(it).x0 >= fe.x - EPS : fe.side === 'north' ? bb(it).y1 <= fe.y + EPS : bb(it).y0 >= fe.y - EPS));
    const toWall = fe.side === 'west' ? fe.x - r.x : fe.side === 'east' ? r.x + r.w - fe.x : fe.side === 'north' ? fe.y - r.y : r.y + r.h - fe.y;
    const choke = Math.min(toWall, ...beyond.map((it) => distPointOBB(it.obb, fe.x, fe.y)));
    if (choke < corridorMin - EPS) fail(`encounter "${e.id}": the dividing wall's ${fe.side} free end (${fe.x}, ${fe.y}) leaves a ${fmt(choke)} cm chokepoint to the nearest blockout / wall beyond it (need >= corridor minimum ${corridorMin})`);
    pathReports.push(`dividing-wall ${fe.side} free end ${fmt(choke)}`);
  }
}

// ---- 8. coverage, volumes, dwell, backdrop ---------------------------------------------------------------------------
for (const name of slotById.keys()) {
  if (usedSlots.has(name)) continue;
  if (OPTIONAL_SLOTS.includes(name)) warn(`asset slot "${name}" is unused - doors stay openings in Gate 2 (place it as a leaning / fallen leaf if wanted)`);
  else (partial ? note : fail)(`asset slot "${name}" is declared but no blockout uses it (REQ-G2-002 AC1: every asset gets a labelled blockout)`);
}
if (bo.triggers && typeof bo.triggers === 'object') {
  if (!isNum(bo.triggers.height_cm) || bo.triggers.height_cm <= 0) fail('triggers.height_cm must be > 0');
  else for (const e of encounters) { const c = rectCentre(e.trigger_rect), room = roomOf(c.x, c.y); if (room && bo.triggers.height_cm > room.ceiling_cm + EPS) warn(`triggers.height_cm ${bo.triggers.height_cm} is taller than the ${room.id} ceiling ${room.ceiling_cm} (encounter ${e.id})`); }
}
if (bo.dwell && typeof bo.dwell === 'object') {
  if (!isNum(bo.dwell.height_cm) || bo.dwell.height_cm <= 0) fail('dwell.height_cm must be > 0');
  if (!isRect(ms.dwell_rect)) fail('dwell needs money_shot.dwell_rect in the floor plan');
  const tint = bo.dwell.tint === undefined ? bs.dwell_tint : bo.dwell.tint;
  if (!style.tints[tint]) fail(`dwell.tint ${JSON.stringify(tint)} is not a greybox_style tint`);
}
// volumes in the money-shot sightline (REQ-G2-005 AC2 review): from the door at eye height the window must not be seen through a
// dense wash - a trigger / dwell volume that stands in the strip above eye height needs a tint at or under the rule's opacity
if (sight && isNum(R.sightline_volume_max_opacity)) {
  const eye = movement.player.eye_height_stand_cm, maxOp = R.sightline_volume_max_opacity;
  const volumes = [];
  if (bo.triggers && typeof bo.triggers === 'object' && isNum(bo.triggers.height_cm)) for (const e of encounters) {
    const c = rectCentre(e.trigger_rect), room = roomOf(c.x, c.y);
    if (room && room.id === ms.room) volumes.push({ name: `trigger volume "${e.id}"`, obb: obbFromRect(e.trigger_rect), h: bo.triggers.height_cm, tint: bs.trigger_tint, from: 'greybox_style blockout.trigger_tint' });
  }
  if (bo.dwell && typeof bo.dwell === 'object' && isNum(bo.dwell.height_cm) && isRect(ms.dwell_rect))
    volumes.push({ name: 'dwell volume', obb: obbFromRect(ms.dwell_rect), h: bo.dwell.height_cm, tint: bo.dwell.tint === undefined ? bs.dwell_tint : bo.dwell.tint, from: bo.dwell.tint === undefined ? 'greybox_style blockout.dwell_tint' : 'dwell.tint' });
  for (const v of volumes) {
    if (v.h <= eye + EPS || !overlapOBB(v.obb, sight.obb, 0.5)) continue;
    const op = style.tints[v.tint] && isNum(style.tints[v.tint].opacity) ? style.tints[v.tint].opacity : 1;
    if (op > maxOp + EPS) warn(`${v.name} (h ${v.h}) stands in the money-shot sightline strip above eye height ${eye} with tint "${v.tint}" (${v.from}, opacity ${op} > rules.sightline_volume_max_opacity ${maxOp}): from the door the window is seen through its wash - lower height_cm under ${eye} or name a tint at or under ${maxOp} (e.g. dwell_volume / trigger_volume)`);
  }
}
if (bo.backdrop && typeof bo.backdrop === 'object') {
  const b = bo.backdrop;
  for (const k of ['beyond_window_cm', 'width_cm', 'height_cm']) if (!isNum(b[k]) || b[k] <= 0) fail(`backdrop.${k} must be > 0`);
  if (b.z_cm !== undefined && !isNum(b.z_cm)) fail('backdrop.z_cm must be a number');
  const tint = b.tint === undefined ? 'backdrop_fire' : b.tint;
  if (!style.tints[tint]) fail(`backdrop.tint ${JSON.stringify(tint)} is not a greybox_style tint`);
  else if (!(style.tints[tint].emissive > 0)) warn(`backdrop tint "${tint}" has no emissive - the fire plane will read as a lit orange wall, not a glow`);
  const room = roomById.get(ms.room);
  if (room && SIDES.includes(ms.window_wall) && [b.beyond_window_cm, b.width_cm, b.height_cm].every(isNum)) {
    const r = room.rect, ns = ms.window_wall === 'north' || ms.window_wall === 'south';
    const span = ns ? r.w : r.h, z0 = isNum(b.z_cm) ? b.z_cm : 0;
    const sill = metrics.architecture.window_sill_height_cm, head = metrics.architecture.window_head_height_cm, eye = movement.player.eye_height_stand_cm;
    if (b.width_cm < span) warn(`backdrop width ${b.width_cm} is narrower than the ${span} cm window wall`);
    if (z0 > sill) warn(`backdrop bottom ${z0} is above the window sill ${sill}`);
    if (z0 + b.height_cm < head) warn(`backdrop top ${z0 + b.height_cm} is below the window head ${head}`);
    if (sight) {   // from the doorway at eye height the plane must fill the whole window (REQ-G2-005 AC1)
      const k = (sight.len + t + b.beyond_window_cm) / sight.len;   // similar triangles: door -> glass -> plane
      const lo = ns ? r.x : r.y, hi = ns ? r.x + r.w : r.y + r.h, dc = ns ? sight.door.x : sight.door.y, cc = ns ? sight.wc.x : sight.wc.y;
      const needLo = dc + (lo - dc) * k, needHi = dc + (hi - dc) * k;
      if (needLo < cc - b.width_cm / 2 - EPS || needHi > cc + b.width_cm / 2 + EPS) warn(`backdrop width ${b.width_cm} at ${b.beyond_window_cm} cm beyond the glass does not fill the window from the doorway (needs ${fmt(needLo)}..${fmt(needHi)} along the wall)`);
      const zTop = eye + (head - eye) * k, zBot = eye + (sill - eye) * k;
      if (zTop > z0 + b.height_cm + EPS || zBot < z0 - EPS) warn(`backdrop z ${z0}..${z0 + b.height_cm} does not fill the window vertically from the doorway at eye height ${eye} (needs ${fmt(zBot)}..${fmt(zTop)})`);
    }
    if (sight && isRect(ms.dwell_rect) && isNum(movement.player.fov_horizontal_deg) && ns) {
      // The 5 s dwell happens AT the glass, not in the doorway: from each dwell-rect corner at eye height, every ray inside the
      // horizontal FOV, with the camera pitched up to a full vertical FOV (16:9 of the horizontal) down or up, must land on the
      // plane - otherwise leaning in to look down at the fire shows the void under it. Rays through the glass EDGES are INFO
      // (grazing rays along the glass need a sky sphere, which REQ-G2-005 allows as the alternative).
      const dr = ms.dwell_rect, hfov = movement.player.fov_horizontal_deg, vhalf = Math.atan(Math.tan(hfov / 2 * Math.PI / 180) * 9 / 16);
      const wallY = ms.window_wall === 'south' ? r.y + r.h : r.y, dir = ms.window_wall === 'south' ? 1 : -1, planeY = wallY + dir * (t + b.beyond_window_cm);
      const px0 = sight.wc.x - b.width_cm / 2, px1 = sight.wc.x + b.width_cm / 2, pz0 = z0, pz1 = z0 + b.height_cm;
      const needX = [], needZ = [], edgeX = [];
      for (const [cx, cy] of [[dr.x, dr.y], [dr.x + dr.w, dr.y], [dr.x, dr.y + dr.h], [dr.x + dr.w, dr.y + dr.h]]) {
        const D = Math.abs(planeY - cy), half = Math.tan(hfov / 2 * Math.PI / 180) * D, slant = D / Math.cos(hfov / 2 * Math.PI / 180), rise = Math.tan(2 * vhalf) * slant;
        needX.push(cx - half, cx + half); needZ.push(eye - rise, eye + rise);
        if (Math.abs(wallY - cy) > 0.5) { const k = D / Math.abs(wallY - cy); edgeX.push(cx + (r.x - cx) * k, cx + (r.x + r.w - cx) * k); }   // a corner ON the glass sees every grazing ray
      }
      const nx0 = Math.min(...needX), nx1 = Math.max(...needX), nz0 = Math.min(...needZ), nz1 = Math.max(...needZ);
      if (nx0 < px0 - EPS || nx1 > px1 + EPS) warn(`backdrop x ${fmt(px0)}..${fmt(px1)} leaves the ${hfov} deg FOV from the dwell rect corners (needs ${fmt(nx0)}..${fmt(nx1)} along the wall) - the fire ends before the edge of the view while dwelling`);
      if (nz0 < pz0 - EPS || nz1 > pz1 + EPS) warn(`backdrop z ${fmt(pz0)}..${fmt(pz1)} leaves the FOV pitched ${fmt(2 * vhalf * 180 / Math.PI)} deg down / up from the dwell rect (needs z ${fmt(nz0)}..${fmt(nz1)}) - looking down at the fire from the glass shows the void under the plane`);
      const ex0 = Math.min(...edgeX), ex1 = Math.max(...edgeX);
      note(`backdrop from the dwell rect: FOV needs x ${fmt(nx0)}..${fmt(nx1)}, z ${fmt(nz0)}..${fmt(nz1)}; plane gives x ${fmt(px0)}..${fmt(px1)}, z ${fmt(pz0)}..${fmt(pz1)}; rays through the glass edges reach x ${fmt(ex0)}..${fmt(ex1)}${ex0 >= px0 - EPS && ex1 <= px1 + EPS ? ' (covered)' : ' (grazing rays past the plane edge: only a sky sphere covers those)'}`);
    }
  }
}

// ---- report ------------------------------------------------------------------------------------------------------------
const rel = path.relative(process.cwd(), path.resolve(boPath)) || boPath;
for (const m of info) console.log(`INFO ${m}`);
for (const m of warns) console.log(`WARN ${m}`);
if (fails.length) {
  console.log(`FAIL ${rel}: ${fails.length} problem(s)`);
  fails.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  process.exit(1);
}
const roomsUsed = new Set(items.map((it) => it.room.id));
console.log(`PASS ${rel}: ${slotById.size} asset slots (${usedSlots.size} used), ${props.length} props, ${characters.length} characters, ${pickups.length} pickups, ${demons.length} demons in ${roomsUsed.size} room(s); ` +
  `${pairs} blockout pairs, ${swings.length} clear zones, ${lanes.length} lanes, ${ductRoutes.length} start->duct route(s), ${discs.length} discs, ${scenes.length} scene rects${sight ? ', sightline strip' : ''} checked; ` +
  `corridor clear width ${corridorReports.length ? corridorReports.join(', ') : 'n/a'} (min ${corridorClearMin} past props, ${bodyClearMin} past a body against the wall - ${bodyWaivers.length ? `${bodyWaivers.length} body waiver(s): ${bodyWaivers.map((w) => `${w.room} ${fmt(w.gap)} past ${w.what}`).join(', ')}` : 'no body waiver used'}; items <= ${stepH} cm high are stepped over); ` +
  `demon route narrowest gap ${pathReports.length ? pathReports.join(', ') : 'n/a'} (min ${corridorMin}; standing discs r${corridorMin / 2} at spawn / approach exempt; ${CELL} cm grid); ${warns.length} warning(s)`);
process.exit(0);
