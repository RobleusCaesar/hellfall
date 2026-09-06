#!/usr/bin/env node
// validate_floorplan.mjs - schema + geometry + adjacency validator for Data/floorplan.json.
//
// Usage: node Tools/validate_floorplan.mjs <path/to/floorplan.json> [--metrics Data/metrics.json] [--movement Data/movement.json]
// Exit 0 with a PASS summary; exit 1 with a numbered FAIL list.  WARN lines never change the exit code.
//
// Rules come from Docs/FLOORPLAN-SCHEMA.md and Docs/BUILD-PLAN.md (Metrics Standard).  Every numeric
// threshold is read from Data/metrics.json / Data/movement.json; the only literals here are the
// spec ranges quoted in the Metrics Standard table (corridor 250-320, ceiling 300-330, duct 300-800).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');

const REQUIRED_ROOMS = ['supply_closet', 'break_room', 'corridor_main', 'mens_restroom', 'womens_restroom',
  'office_1', 'office_2', 'corridor_blocked', 'elevator_lobby', 'reception', 'ceo_office'];
const REQUIRED_CHECKPOINTS = ['cp_start', 'cp_break_room', 'cp_corridor_post_pickup', 'cp_ceo_entry'];
const REQUIRED_ENCOUNTERS = ['demon_1', 'demon_2'];
const SIDES = ['north', 'south', 'west', 'east'];
const OPPOSITE = { north: 'south', south: 'north', west: 'east', east: 'west' };
const OPENING_TYPES = ['door', 'locked_door', 'open', 'window', 'duct_mouth'];
const FLOOR_FINISHES = ['carpet', 'tile', 'concrete', 'metal'];
const ROLES = ['start', 'transit', 'optional', 'dead_end', 'goal', 'sealed'];
const MARKER_KINDS = ['player_start', 'reference_figure', 'note'];
const BLOCKER_KINDS = ['collapse', 'elevator_doors'];
const PASSABLE_TYPES = ['door', 'open'];

// Metrics Standard spec ranges (Docs/BUILD-PLAN.md table).
const SPEC = { corridorMin: 250, corridorMax: 320, ceilingMin: 300, ceilingMax: 330, wetCeilingMin: 270,
  ductLenMin: 300, ductLenMax: 800, smallRoomMin: 300, dwellMaxDistance: 150 };

const fails = [];
const warns = [];
const info = [];
const fail = (m) => fails.push(m);
const warn = (m) => warns.push(m);

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
const near = (a, b, tol = 1e-6) => Math.abs(a - b) <= tol;
const snake = /^[a-z][a-z0-9_]*$/;

// ---------------------------------------------------------------------------------------------
const planPath = process.argv[2];
if (!planPath || planPath.startsWith('--')) {
  console.error('usage: node Tools/validate_floorplan.mjs <floorplan.json> [--metrics ...] [--movement ...]');
  process.exit(2);
}
const metrics = readJson(argValue('--metrics', path.join(REPO, 'Data', 'metrics.json')));
const movement = readJson(argValue('--movement', path.join(REPO, 'Data', 'movement.json')));
let fp;
try { fp = readJson(planPath); } catch (e) { console.error(`FAIL 1. cannot read/parse ${planPath}: ${e.message}`); process.exit(1); }

const A = metrics.architecture;
const t = A.wall_thickness_cm;
const capsuleDiameter = 2 * movement.player.capsule_radius_cm;
const doorMin = capsuleDiameter + 40;
const corridorMinFromCapsule = 3 * capsuleDiameter;

// ---- 1. top-level schema ----------------------------------------------------------------------
if (fp._temporary) info.push('plan is marked _temporary (placeholder; digitizer replaces it)');
if (fp.version !== 1) fail(`version must be 1 (got ${JSON.stringify(fp.version)})`);
if (fp.units !== 'cm') fail(`units must be "cm" (got ${JSON.stringify(fp.units)})`);
for (const k of ['rooms', 'openings', 'ducts', 'blockers', 'markers', 'checkpoints', 'encounters', 'critical_path']) {
  if (!Array.isArray(fp[k])) fail(`top-level "${k}" must be an array`);
}
if (!fp.money_shot || typeof fp.money_shot !== 'object') fail('top-level "money_shot" must be an object');
const rooms = Array.isArray(fp.rooms) ? fp.rooms : [];
const openings = Array.isArray(fp.openings) ? fp.openings : [];
const ducts = Array.isArray(fp.ducts) ? fp.ducts : [];
const blockers = Array.isArray(fp.blockers) ? fp.blockers : [];
const markers = Array.isArray(fp.markers) ? fp.markers : [];
const checkpoints = Array.isArray(fp.checkpoints) ? fp.checkpoints : [];
const encounters = Array.isArray(fp.encounters) ? fp.encounters : [];
const criticalPath = Array.isArray(fp.critical_path) ? fp.critical_path : [];
const ms = fp.money_shot && typeof fp.money_shot === 'object' ? fp.money_shot : {};

// ---- 2. rooms ----------------------------------------------------------------------------------
const roomById = new Map();
for (const r of rooms) {
  if (!isStr(r.id) || !snake.test(r.id)) { fail(`room id ${JSON.stringify(r.id)} must be snake_case`); continue; }
  if (roomById.has(r.id)) fail(`duplicate room id "${r.id}"`);
  roomById.set(r.id, r);
  if (!isStr(r.label)) fail(`room "${r.id}": label missing`);
  if (!isRect(r.rect)) fail(`room "${r.id}": rect must be {x,y,w,h} with w,h > 0`);
  else if (r.rect.x < 0 || r.rect.y < 0) fail(`room "${r.id}": rect must have x,y >= 0 (origin is the plan's top-left)`);
  if (!isNum(r.ceiling_cm)) fail(`room "${r.id}": ceiling_cm must be a number`);
  if (!FLOOR_FINISHES.includes(r.floor_finish)) fail(`room "${r.id}": floor_finish must be one of ${FLOOR_FINISHES.join('|')}`);
  if (typeof r.enterable !== 'boolean') fail(`room "${r.id}": enterable must be boolean`);
  if (!ROLES.includes(r.role)) fail(`room "${r.id}": role must be one of ${ROLES.join('|')}`);
}
for (const id of REQUIRED_ROOMS) if (!roomById.has(id)) fail(`required room "${id}" is missing`);

// A room is checked as a corridor when its id says so, OR when it is a transit helper room that either sits on the
// critical path between corridor_main and reception (the reception passage) or is corridor-narrow (a dimension
// <= the corridor maximum). This closes the gap where a 480-wide "reception_passage" escaped the 250-320 check
// only because its id did not start with "corridor". Required non-corridor rooms (break_room, reception, ...) are exempt.
const REQUIRED_NON_CORRIDOR = REQUIRED_ROOMS.filter((id) => !id.startsWith('corridor'));
const onCorridorToReceptionLeg = (id) => {
  const i = criticalPath.indexOf(id), a = criticalPath.indexOf('corridor_main'), b = criticalPath.indexOf('reception');
  return a >= 0 && b >= 0 && i > a && i < b;
};
const isCorridor = (r) => r.id.startsWith('corridor') ||
  (!REQUIRED_NON_CORRIDOR.includes(r.id) && r.role === 'transit' && isRect(r.rect) &&
    (onCorridorToReceptionLeg(r.id) || Math.min(r.rect.w, r.rect.h) <= SPEC.corridorMax));
const isWet = (r) => /restroom|bathroom/.test(r.id);
const validRooms = rooms.filter((r) => roomById.get(r.id) === r && isRect(r.rect) && isNum(r.ceiling_cm));
// Backdrop room: non-enterable and reached only through windows (e.g. an "exterior_city" volume behind the
// money-shot glass). It is scenery, so ceiling/footprint rules become WARNs for it.
const isBackdrop = (r) => r.enterable === false && !REQUIRED_ROOMS.includes(r.id) &&
  openings.every((o) => !Array.isArray(o.between) || !o.between.includes(r.id) || o.type === 'window') &&
  ducts.every((d) => d.from !== r.id && d.to !== r.id);

// dimensions
for (const r of validRooms) {
  const { w, h } = r.rect;
  const minDim = Math.min(w, h);
  if (isBackdrop(r)) {
    if (minDim < A.min_room_footprint_cm) warn(`backdrop room "${r.id}" footprint ${w}x${h} is below ${A.min_room_footprint_cm} (scenery, allowed)`);
    if (r.ceiling_cm < SPEC.ceilingMin || r.ceiling_cm > SPEC.ceilingMax) warn(`backdrop room "${r.id}" ceiling ${r.ceiling_cm} outside ${SPEC.ceilingMin}-${SPEC.ceilingMax} (scenery, allowed)`);
    continue;
  }
  if (isCorridor(r)) {
    if (minDim < corridorMinFromCapsule) fail(`corridor "${r.id}" width ${minDim} < 3 x capsule diameter (${corridorMinFromCapsule})`);
    if (minDim < SPEC.corridorMin || minDim > SPEC.corridorMax) fail(`corridor "${r.id}" width ${minDim} outside ${SPEC.corridorMin}-${SPEC.corridorMax}`);
    if (!near(minDim, A.corridor_width_cm)) warn(`corridor "${r.id}" width ${minDim} differs from metrics corridor_width_cm ${A.corridor_width_cm}`);
  } else {
    if (minDim < SPEC.smallRoomMin) fail(`room "${r.id}" footprint ${w}x${h}: a dimension is below ${SPEC.smallRoomMin}`);
    else if (minDim < A.min_room_footprint_cm) {
      if (r.id === 'supply_closet') warn(`supply_closet footprint ${w}x${h} is below ${A.min_room_footprint_cm} in one dimension (allowed, WARN)`);
      else fail(`room "${r.id}" footprint ${w}x${h} below minimum ${A.min_room_footprint_cm}x${A.min_room_footprint_cm}`);
    }
  }
  if (isWet(r)) {
    if (r.ceiling_cm < SPEC.wetCeilingMin || r.ceiling_cm > SPEC.ceilingMax) fail(`wet room "${r.id}" ceiling ${r.ceiling_cm} outside ${SPEC.wetCeilingMin}-${SPEC.ceilingMax}`);
    else if (!near(r.ceiling_cm, A.wet_room_ceiling_height_cm)) warn(`wet room "${r.id}" ceiling ${r.ceiling_cm} differs from metrics wet_room_ceiling_height_cm ${A.wet_room_ceiling_height_cm}`);
  } else if (r.ceiling_cm < SPEC.ceilingMin || r.ceiling_cm > SPEC.ceilingMax) {
    if (r.role === 'start' && r.ceiling_cm >= SPEC.wetCeilingMin && r.ceiling_cm <= SPEC.ceilingMax)
      warn(`start room "${r.id}" ceiling ${r.ceiling_cm} is below the office range ${SPEC.ceilingMin}-${SPEC.ceilingMax} (allowed for the closet, WARN)`);
    else fail(`room "${r.id}" ceiling ${r.ceiling_cm} outside ${SPEC.ceilingMin}-${SPEC.ceilingMax}`);
  }
}

// no overlap, and touching/near-touching rects must be exactly one wall apart
const rectsOverlap = (a, b, tol = 1e-6) =>
  Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > tol && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > tol;
for (let i = 0; i < validRooms.length; i++) {
  for (let j = i + 1; j < validRooms.length; j++) {
    const a = validRooms[i], b = validRooms[j];
    if (rectsOverlap(a.rect, b.rect)) { fail(`rooms "${a.id}" and "${b.id}" overlap`); continue; }
    // gap along x or y when they face each other
    const gx = Math.max(a.rect.x, b.rect.x) - Math.min(a.rect.x + a.rect.w, b.rect.x + b.rect.w);
    const gy = Math.max(a.rect.y, b.rect.y) - Math.min(a.rect.y + a.rect.h, b.rect.y + b.rect.h);
    const faceX = gy < 0 && gx >= 0; // side by side (overlapping y ranges)
    const faceY = gx < 0 && gy >= 0; // stacked (overlapping x ranges)
    const gap = faceX ? gx : faceY ? gy : null;
    if (gap !== null && gap < t - 1e-6) fail(`rooms "${a.id}" and "${b.id}" are ${gap} cm apart; facing rooms must be >= one wall (${t}) apart`);
    if (gap !== null && gap > t + 1e-6 && gap < 2 * t) warn(`rooms "${a.id}" and "${b.id}" are ${gap} cm apart (between 1 and 2 wall thicknesses; walls will merge into a thick slab)`);
  }
}

// ---- 3. openings --------------------------------------------------------------------------------
const openingById = new Map();
function sideOf(room, other) { // side of `room` on which `other` is adjacent, or null
  const a = room.rect, b = other.rect;
  const xOverlap = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1e-6;
  const yOverlap = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1e-6;
  if (xOverlap && near(b.y, a.y + a.h + t)) return 'south';
  if (xOverlap && near(b.y + b.h + t, a.y)) return 'north';
  if (yOverlap && near(b.x, a.x + a.w + t)) return 'east';
  if (yOverlap && near(b.x + b.w + t, a.x)) return 'west';
  return null;
}
function wallSpan(room, side) { // [from, to] along the wall in plan coords
  const r = room.rect;
  return side === 'north' || side === 'south' ? [r.x, r.x + r.w] : [r.y, r.y + r.h];
}
function farSideOf(room) { // side opposite the room's first connecting opening; north by default (generator rule)
  for (const o of openings) {
    if (!Array.isArray(o.between) || !SIDES.includes(o.wall) || o.type === 'duct_mouth') continue;
    if (o.between[0] === room.id) return OPPOSITE[o.wall];
    if (o.between[1] === room.id) return o.wall;
  }
  return 'north';
}
function footprintRect(room, side, center, width) {
  const r = room.rect, half = width / 2;
  if (side === 'north') return { x: center - half, y: r.y - t, w: width, h: t };
  if (side === 'south') return { x: center - half, y: r.y + r.h, w: width, h: t };
  if (side === 'west') return { x: r.x - t, y: center - half, w: t, h: width };
  return { x: r.x + r.w, y: center - half, w: t, h: width };
}
function roomBehindWall(room, side, from, to) { // room adjacent on `side` whose extent overlaps [from, to] along the wall
  for (const other of validRooms) {
    if (other === room || sideOf(room, other) !== side) continue;
    const span = wallSpan(other, OPPOSITE[side]);
    if (Math.min(span[1], to) - Math.max(span[0], from) > 1e-6) return other;
  }
  return null;
}
const windowFootprints = [];
for (const o of openings) {
  if (!isStr(o.id)) { fail(`opening without id: ${JSON.stringify(o)}`); continue; }
  if (openingById.has(o.id)) fail(`duplicate opening id "${o.id}"`);
  openingById.set(o.id, o);
  if (!OPENING_TYPES.includes(o.type)) { fail(`opening "${o.id}": type must be one of ${OPENING_TYPES.join('|')}`); continue; }
  if (o.type === 'duct_mouth') { fail(`opening "${o.id}": duct_mouth openings are generated from ducts; do not author them`); continue; }
  if (!Array.isArray(o.between) || o.between.length < 1 || o.between.length > 2) { fail(`opening "${o.id}": between must be [roomA, roomB]`); continue; }
  if (!SIDES.includes(o.wall)) { fail(`opening "${o.id}": wall must be north|south|west|east`); continue; }
  for (const k of ['center_along_wall_cm', 'width_cm', 'height_cm']) if (!isNum(o[k])) fail(`opening "${o.id}": ${k} must be a number`);
  const a = roomById.get(o.between[0]);
  if (!a) { fail(`opening "${o.id}": unknown room "${o.between[0]}"`); continue; }
  const bId = o.between.length > 1 ? o.between[1] : 'exterior';
  const b = roomById.get(bId);
  if (o.type === 'window') {
    if (b && !isBackdrop(b)) fail(`opening "${o.id}": a window must face the exterior (between[1] = "exterior"/omitted) or a non-enterable backdrop room, not "${bId}"`);
  } else if (!b) { fail(`opening "${o.id}": unknown room "${bId}"`); continue; }
  if (!isRect(a.rect) || (b && !isRect(b.rect)) || !isNum(o.center_along_wall_cm) || !isNum(o.width_cm)) continue;

  const span = wallSpan(a, o.wall);
  const c = o.center_along_wall_cm, half = o.width_cm / 2;
  if (c - half < span[0] - 1e-6 || c + half > span[1] + 1e-6) fail(`opening "${o.id}": [${c - half}, ${c + half}] exceeds ${a.id}'s ${o.wall} wall extent [${span[0]}, ${span[1]}]`);
  if (o.type !== 'window') {
    const side = sideOf(a, b);
    if (side === null) fail(`opening "${o.id}": rooms "${a.id}" and "${b.id}" are not exactly one wall (${t} cm) apart`);
    else if (side !== o.wall) fail(`opening "${o.id}": "${b.id}" is on the ${side} side of "${a.id}", not ${o.wall}`);
    const spanB = wallSpan(b, OPPOSITE[o.wall]);
    if (c - half < spanB[0] - 1e-6 || c + half > spanB[1] + 1e-6) fail(`opening "${o.id}": [${c - half}, ${c + half}] exceeds ${b.id}'s ${OPPOSITE[o.wall]} wall extent [${spanB[0]}, ${spanB[1]}]`);
    const minCeil = Math.min(a.ceiling_cm, b.ceiling_cm);
    if (isNum(o.height_cm) && o.height_cm > minCeil + 1e-6) fail(`opening "${o.id}": height ${o.height_cm} exceeds the lower ceiling ${minCeil}`);
  } else {
    // window: the wall must be exterior (or face a backdrop room) along the whole opening
    const fr = footprintRect(a, o.wall, c, o.width_cm);
    const behind = roomBehindWall(a, o.wall, c - half, c + half);
    if (behind && !isBackdrop(behind)) fail(`window "${o.id}" sits on a wall shared with "${behind.id}" (window walls must be exterior)`);
    if (b && behind !== b) fail(`window "${o.id}": backdrop room "${b.id}" is not directly behind ${a.id}'s ${o.wall} wall`);
    windowFootprints.push({ id: o.id, room: a.id, side: o.wall, rect: fr });
    const expected = A.window_head_height_cm - A.window_sill_height_cm;
    if (isNum(o.height_cm) && !near(o.height_cm, expected)) warn(`window "${o.id}" height_cm ${o.height_cm} != metrics head-sill ${expected}; the generator uses metrics`);
  }
  if (o.type === 'door' || o.type === 'locked_door') {
    if (o.width_cm < doorMin) fail(`${o.type} "${o.id}" width ${o.width_cm} < capsule diameter + 40 (${doorMin})`);
    if (!near(o.width_cm, A.door_width_cm)) warn(`${o.type} "${o.id}" width ${o.width_cm} != metrics door_width_cm ${A.door_width_cm}`);
    if (isNum(o.height_cm) && !near(o.height_cm, A.door_height_cm)) warn(`${o.type} "${o.id}" height ${o.height_cm} != metrics door_height_cm ${A.door_height_cm}`);
  }
  if (o.type === 'open' && b) {
    const spanA = wallSpan(a, o.wall), spanB = wallSpan(b, OPPOSITE[o.wall]);
    const shared = Math.min(spanA[1], spanB[1]) - Math.max(spanA[0], spanB[0]);
    if (o.width_cm < corridorMinFromCapsule) fail(`open "${o.id}" width ${o.width_cm} < 3 x capsule diameter (${corridorMinFromCapsule})`);
    if (o.width_cm > shared + 1e-6) fail(`open "${o.id}" width ${o.width_cm} exceeds the shared wall length ${shared}`);
  }
}
// overlapping openings on the same wall strip
const validOpenings = openings.filter((o) => openingById.get(o.id) === o && roomById.get(o.between?.[0]) && SIDES.includes(o.wall) && isNum(o.center_along_wall_cm) && isNum(o.width_cm));
for (let i = 0; i < validOpenings.length; i++) for (let j = i + 1; j < validOpenings.length; j++) {
  const p = validOpenings[i], q = validOpenings[j];
  const fa = footprintRect(roomById.get(p.between[0]), p.wall, p.center_along_wall_cm, p.width_cm);
  const fb = footprintRect(roomById.get(q.between[0]), q.wall, q.center_along_wall_cm, q.width_cm);
  if (rectsOverlap(fa, fb)) fail(`openings "${p.id}" and "${q.id}" overlap in the wall`);
}

// ---- 4. ducts --------------------------------------------------------------------------------
const ductMouthFootprints = [];
for (const d of ducts) {
  if (!isStr(d.id)) { fail(`duct without id: ${JSON.stringify(d)}`); continue; }
  const a = roomById.get(d.from), b = roomById.get(d.to);
  if (!a || !b) { fail(`duct "${d.id}": unknown room (from "${d.from}", to "${d.to}")`); continue; }
  if (!['x', 'y'].includes(d.axis)) { fail(`duct "${d.id}": axis must be "x" or "y"`); continue; }
  if (!isPos(d.start)) { fail(`duct "${d.id}": start must be {x,y}`); continue; }
  for (const k of ['length_cm', 'interior_width_cm', 'interior_height_cm']) if (!isNum(d[k])) fail(`duct "${d.id}": ${k} must be a number`);
  if (!isNum(d.floor_offset_cm)) warn(`duct "${d.id}": floor_offset_cm missing (0 assumed)`);
  if (!near(d.interior_width_cm, A.duct_interior_width_cm) || !near(d.interior_height_cm, A.duct_interior_height_cm))
    fail(`duct "${d.id}": interior ${d.interior_width_cm}x${d.interior_height_cm} must be ${A.duct_interior_width_cm}x${A.duct_interior_height_cm} (metrics)`);
  if (d.length_cm < SPEC.ductLenMin || d.length_cm > SPEC.ductLenMax) fail(`duct "${d.id}": length ${d.length_cm} outside ${SPEC.ductLenMin}-${SPEC.ductLenMax}`);
  if (d.interior_height_cm <= movement.player.crawl_height_cm) fail(`duct "${d.id}": interior height ${d.interior_height_cm} must exceed crawl height ${movement.player.crawl_height_cm}`);
  if (d.interior_height_cm >= movement.player.crouch_height_cm) fail(`duct "${d.id}": interior height ${d.interior_height_cm} must be below crouch height ${movement.player.crouch_height_cm} (crawl-only gate)`);
  if (!(isRect(a.rect) && isRect(b.rect))) continue;
  // geometry: which faces
  let aIn, bIn, aSide, bSide, lateral, lateralSpanA, lateralSpanB;
  if (d.axis === 'y') {
    lateral = d.start.x;
    if (b.rect.y >= a.rect.y + a.rect.h) { aSide = 'south'; bSide = 'north'; aIn = a.rect.y + a.rect.h; bIn = b.rect.y; }
    else { aSide = 'north'; bSide = 'south'; aIn = a.rect.y; bIn = b.rect.y + b.rect.h; }
    lateralSpanA = [a.rect.x, a.rect.x + a.rect.w]; lateralSpanB = [b.rect.x, b.rect.x + b.rect.w];
    const startOnWall = Math.abs(d.start.y - aIn) <= t + 1e-6;
    if (!startOnWall) fail(`duct "${d.id}": start.y ${d.start.y} is not on ${a.id}'s ${aSide} wall (face at ${aIn})`);
  } else {
    lateral = d.start.y;
    if (b.rect.x >= a.rect.x + a.rect.w) { aSide = 'east'; bSide = 'west'; aIn = a.rect.x + a.rect.w; bIn = b.rect.x; }
    else { aSide = 'west'; bSide = 'east'; aIn = a.rect.x; bIn = b.rect.x + b.rect.w; }
    lateralSpanA = [a.rect.y, a.rect.y + a.rect.h]; lateralSpanB = [b.rect.y, b.rect.y + b.rect.h];
    const startOnWall = Math.abs(d.start.x - aIn) <= t + 1e-6;
    if (!startOnWall) fail(`duct "${d.id}": start.x ${d.start.x} is not on ${a.id}'s ${aSide} wall (face at ${aIn})`);
  }
  const faceToFace = Math.abs(bIn - aIn);
  if (Math.abs(faceToFace - d.length_cm) > t + 1e-6) fail(`duct "${d.id}": length_cm ${d.length_cm} != face-to-face distance ${faceToFace} between ${a.id} and ${b.id}`);
  if (faceToFace < 2 * t + 1e-6) fail(`duct "${d.id}": rooms are too close for a duct tube`);
  const half = d.interior_width_cm / 2;
  if (lateral - half < lateralSpanA[0] || lateral + half > lateralSpanA[1]) fail(`duct "${d.id}": mouth [${lateral - half}, ${lateral + half}] exceeds ${a.id}'s wall extent`);
  if (lateral - half < lateralSpanB[0] || lateral + half > lateralSpanB[1]) fail(`duct "${d.id}": mouth [${lateral - half}, ${lateral + half}] exceeds ${b.id}'s wall extent`);
  // the tube must not cross any other room (expanded by a wall)
  const lo = Math.min(aIn, bIn), hi = Math.max(aIn, bIn);
  const ext = half + A.duct_wall_thickness_cm;
  const tube = d.axis === 'y' ? { x: lateral - ext, y: lo, w: 2 * ext, h: hi - lo } : { x: lo, y: lateral - ext, w: hi - lo, h: 2 * ext };
  for (const other of validRooms) {
    if (other === a || other === b) continue;
    const grown = { x: other.rect.x - t, y: other.rect.y - t, w: other.rect.w + 2 * t, h: other.rect.h + 2 * t };
    if (rectsOverlap(tube, grown)) fail(`duct "${d.id}": tube passes through room "${other.id}" or its walls`);
  }
  ductMouthFootprints.push({ id: d.id, room: a.id, side: aSide, lateral, half }, { id: d.id, room: b.id, side: bSide, lateral, half });
}
// authored openings must not overlap a duct mouth (the generator cuts the mouth into the same wall strip and
// would otherwise fail later with the less helpful "openings overlap in the wall grid")
for (const m of ductMouthFootprints) {
  const mouthRect = footprintRect(roomById.get(m.room), m.side, m.lateral, 2 * m.half);
  for (const o of validOpenings) {
    const rect = footprintRect(roomById.get(o.between[0]), o.wall, o.center_along_wall_cm, o.width_cm);
    if (rectsOverlap(mouthRect, rect)) fail(`opening "${o.id}" overlaps the mouth of duct "${m.id}" on ${m.room}'s ${m.side} wall`);
  }
}
const ductPairs = ducts.filter((d) => isStr(d.id)).map((d) => `${d.from}->${d.to}`);
if (!ductPairs.includes('supply_closet->break_room')) fail('no duct connects supply_closet -> break_room');
if (ducts.length !== 1) warn(`${ducts.length} ducts declared (spec has exactly one)`);

// ---- 5. adjacency -------------------------------------------------------------------------------------
const connections = []; // {a, b, type, id}
for (const o of validOpenings) if (o.between.length > 1 && roomById.get(o.between[1])) connections.push({ a: o.between[0], b: o.between[1], type: o.type, id: o.id });
for (const d of ducts) if (roomById.get(d.from) && roomById.get(d.to)) connections.push({ a: d.from, b: d.to, type: 'duct', id: d.id });
const touches = (c, x, y) => (c.a === x && c.b === y) || (c.a === y && c.b === x);

// 5.1 supply closet: only the duct
const supplyOpenings = validOpenings.filter((o) => o.between.includes('supply_closet'));
if (supplyOpenings.length) fail(`supply_closet must have no openings other than the duct mouth (found ${supplyOpenings.map((o) => o.id).join(', ')})`);
const supplyDucts = connections.filter((c) => c.type === 'duct' && touches(c, 'supply_closet', 'break_room'));
if (supplyDucts.length !== 1) fail(`supply_closet must have exactly one duct to break_room (found ${supplyDucts.length})`);

// 5.2 break_room -> corridor_main by a door
if (!connections.some((c) => c.type === 'door' && touches(c, 'break_room', 'corridor_main'))) fail('break_room and corridor_main must be connected by a "door"');

// 5.3 corridor cluster = corridor_main + rooms reachable via "open" (leaves excluded)
// elevator_lobby is deliberately NOT a leaf: the drawing reads "far-left dead end: elevator + collapsed hallway
// branching off", so corridor_blocked may hang off the lobby when the lobby joins the corridor by an "open".
const LEAVES = ['mens_restroom', 'womens_restroom', 'office_1', 'office_2', 'corridor_blocked', 'reception', 'break_room', 'supply_closet', 'ceo_office'];
const cluster = new Set(['corridor_main']);
let grew = true;
while (grew) {
  grew = false;
  for (const c of connections) {
    if (c.type !== 'open') continue;
    for (const [x, y] of [[c.a, c.b], [c.b, c.a]]) {
      if (cluster.has(x) && !cluster.has(y) && !LEAVES.includes(y)) { cluster.add(y); grew = true; }
    }
  }
}
const REQUIRED_LINKS = [
  ['mens_restroom', ['door']], ['womens_restroom', ['locked_door']], ['office_1', ['door']], ['office_2', ['door']],
  ['corridor_blocked', ['open']], ['elevator_lobby', ['open', 'door']], ['reception', ['open', 'door']],
];
for (const [room, types] of REQUIRED_LINKS) {
  const hits = connections.filter((c) => (c.a === room && cluster.has(c.b)) || (c.b === room && cluster.has(c.a)));
  if (!hits.length) fail(`"${room}" is not connected to the corridor (corridor_main or an "open" corridor segment)`);
  else if (!hits.some((c) => types.includes(c.type))) fail(`"${room}" must connect to the corridor by ${types.join(' or ')} (found ${hits.map((c) => c.type).join(', ')})`);
}
// 5.4 reception -> ceo_office by a door, window opposite
const ceoDoors = connections.filter((c) => c.type === 'door' && touches(c, 'reception', 'ceo_office'));
if (!ceoDoors.length) fail('reception and ceo_office must be connected by a "door"');
// 5.5 blockers
const blockerById = new Map();
for (const b of blockers) {
  if (!isStr(b.id)) { fail(`blocker without id: ${JSON.stringify(b)}`); continue; }
  if (blockerById.has(b.id)) fail(`duplicate blocker id "${b.id}"`);
  blockerById.set(b.id, b);
  if (!BLOCKER_KINDS.includes(b.kind)) { fail(`blocker "${b.id}": kind must be ${BLOCKER_KINDS.join('|')}`); continue; }
  const room = roomById.get(b.room);
  if (!room) { fail(`blocker "${b.id}": unknown room "${b.room}"`); continue; }
  if (b.kind === 'collapse') {
    if (!isNum(b.depth_cm) || b.depth_cm <= 0) fail(`blocker "${b.id}": depth_cm must be > 0`);
    else if (isRect(room.rect)) {
      const far = farSideOf(room);
      const extent = far === 'north' || far === 'south' ? room.rect.h : room.rect.w;
      if (b.depth_cm > extent + 1e-6) fail(`blocker "${b.id}": depth ${b.depth_cm} exceeds room "${room.id}" extent ${extent} along the collapse axis`);
      else if (near(b.depth_cm, extent)) warn(`blocker "${b.id}": rubble fills the whole stub "${room.id}" (reads as a collapsed wall flush with the opening)`);
    }
    if (b.room !== 'corridor_blocked') warn(`collapse blocker "${b.id}" is in "${b.room}", expected corridor_blocked`);
  } else {
    if (!SIDES.includes(b.wall)) fail(`blocker "${b.id}": wall must be north|south|west|east`);
    if (!isNum(b.width_cm) || !isNum(b.height_cm)) fail(`blocker "${b.id}": width_cm/height_cm must be numbers`);
    if (b.room !== 'elevator_lobby') warn(`elevator_doors blocker "${b.id}" is in "${b.room}", expected elevator_lobby`);
    if (SIDES.includes(b.wall) && isRect(room.rect) && isNum(b.width_cm)) {
      const center = isNum(b.center_along_wall_cm) ? b.center_along_wall_cm : (b.wall === 'north' || b.wall === 'south' ? room.rect.x + room.rect.w / 2 : room.rect.y + room.rect.h / 2);
      const behind = roomBehindWall(room, b.wall, center - b.width_cm / 2, center + b.width_cm / 2);
      if (behind) fail(`elevator doors "${b.id}" sit on a wall shared with "${behind.id}"; they must be on an exterior wall`);
      const span = wallSpan(room, b.wall);
      if (center - b.width_cm / 2 < span[0] || center + b.width_cm / 2 > span[1]) fail(`elevator doors "${b.id}" exceed the ${b.wall} wall of "${room.id}"`);
      if (isNum(b.height_cm) && b.height_cm > room.ceiling_cm) fail(`elevator doors "${b.id}" taller than the ceiling`);
    }
  }
}
if (!blockers.some((b) => b.kind === 'collapse' && b.room === 'corridor_blocked')) fail('corridor_blocked needs a "collapse" blocker');
if (!blockers.some((b) => b.kind === 'elevator_doors' && b.room === 'elevator_lobby')) fail('elevator_lobby needs an "elevator_doors" blocker');

// ---- 6. critical path -----------------------------------------------------------------------------------
if (criticalPath.length < 2) fail('critical_path needs at least two rooms');
else {
  if (criticalPath[0] !== 'supply_closet') fail(`critical_path must start at supply_closet (starts at "${criticalPath[0]}")`);
  if (criticalPath[criticalPath.length - 1] !== 'ceo_office') fail(`critical_path must end at ceo_office (ends at "${criticalPath[criticalPath.length - 1]}")`);
  for (const id of criticalPath) if (!roomById.has(id)) fail(`critical_path references unknown room "${id}"`);
  for (let i = 0; i + 1 < criticalPath.length; i++) {
    const x = criticalPath[i], y = criticalPath[i + 1];
    const ok = connections.some((c) => touches(c, x, y) && (PASSABLE_TYPES.includes(c.type) || c.type === 'duct'));
    if (!ok) fail(`critical_path: "${x}" -> "${y}" has no passable connection (door/open/duct)`);
  }
  for (const id of ['break_room', 'corridor_main', 'reception']) if (!criticalPath.includes(id)) fail(`critical_path must pass through "${id}"`);
  const seen = new Set();
  for (const id of criticalPath) { if (seen.has(id)) fail(`critical_path visits "${id}" twice`); seen.add(id); }
}

// ---- 7. markers, checkpoints ---------------------------------------------------------------------------------
const inRoom = (room, p) => isRect(room.rect) && p.x >= room.rect.x && p.x <= room.rect.x + room.rect.w && p.y >= room.rect.y && p.y <= room.rect.y + room.rect.h;
const markerIds = new Set();
const figuresPerRoom = new Map();
let playerStarts = 0;
for (const m of markers) {
  if (!isStr(m.id)) { fail(`marker without id: ${JSON.stringify(m)}`); continue; }
  if (markerIds.has(m.id)) fail(`duplicate marker id "${m.id}"`);
  markerIds.add(m.id);
  if (!MARKER_KINDS.includes(m.kind)) { fail(`marker "${m.id}": kind must be ${MARKER_KINDS.join('|')}`); continue; }
  const room = roomById.get(m.room);
  if (!room) { fail(`marker "${m.id}": unknown room "${m.room}"`); continue; }
  if (!isPos(m.pos)) { fail(`marker "${m.id}": pos must be {x,y}`); continue; }
  if (!inRoom(room, m.pos)) fail(`marker "${m.id}" at (${m.pos.x}, ${m.pos.y}) is outside room "${room.id}"`);
  if (m.kind === 'player_start') {
    playerStarts++;
    if (!isNum(m.yaw_deg)) fail(`marker "${m.id}": player_start needs yaw_deg`);
    if (m.room !== 'supply_closet') fail(`player_start must be in supply_closet (is in "${m.room}")`);
  } else if (m.kind === 'reference_figure') {
    figuresPerRoom.set(m.room, (figuresPerRoom.get(m.room) || 0) + 1);
  } else if (m.kind === 'note' && !isStr(m.text)) fail(`note marker "${m.id}" needs text`);
}
if (playerStarts !== 1) fail(`exactly one player_start marker required (found ${playerStarts})`);
for (const r of validRooms) {
  const n = figuresPerRoom.get(r.id) || 0;
  if (n !== 1) fail(`room "${r.id}" must have exactly one reference_figure marker (has ${n})`);
}
const cpIds = new Set();
for (const c of checkpoints) {
  if (!isStr(c.id)) { fail(`checkpoint without id: ${JSON.stringify(c)}`); continue; }
  if (cpIds.has(c.id)) fail(`duplicate checkpoint id "${c.id}"`);
  cpIds.add(c.id);
  const room = roomById.get(c.room);
  if (!room) { fail(`checkpoint "${c.id}": unknown room "${c.room}"`); continue; }
  if (!isPos(c.pos)) { fail(`checkpoint "${c.id}": pos must be {x,y}`); continue; }
  if (!isNum(c.yaw_deg)) fail(`checkpoint "${c.id}": yaw_deg missing`);
  if (!inRoom(room, c.pos)) fail(`checkpoint "${c.id}" is outside room "${room.id}"`);
}
for (const id of REQUIRED_CHECKPOINTS) if (!cpIds.has(id)) fail(`required checkpoint "${id}" missing`);
if (checkpoints.length !== 4) fail(`exactly 4 checkpoints required (found ${checkpoints.length})`);
const cpRoom = (id) => checkpoints.find((c) => c.id === id)?.room;
if (cpRoom('cp_start') && cpRoom('cp_start') !== 'supply_closet') warn('cp_start is not in supply_closet');
if (cpRoom('cp_break_room') && cpRoom('cp_break_room') !== 'break_room') warn('cp_break_room is not in break_room');
if (cpRoom('cp_ceo_entry') && cpRoom('cp_ceo_entry') !== 'ceo_office') warn('cp_ceo_entry is not in ceo_office');

// ---- 8. passable-space model (for encounters) -----------------------------------------------------------------
// A point is passable if it is inside any room rect (minus collapse wedges and the dividing wall) or inside a
// door/open footprint.  Locked doors, windows, walls and ducts are not passable for the fight-space lanes.
const blockedRects = [];
for (const b of blockers) {
  if (b.kind !== 'collapse' || !isNum(b.depth_cm)) continue;
  const room = roomById.get(b.room);
  if (!room || !isRect(room.rect)) continue;
  const far = farSideOf(room);
  const r = room.rect, dpt = b.depth_cm;
  blockedRects.push(far === 'north' ? { x: r.x, y: r.y, w: r.w, h: dpt } : far === 'south' ? { x: r.x, y: r.y + r.h - dpt, w: r.w, h: dpt }
    : far === 'west' ? { x: r.x, y: r.y, w: dpt, h: r.h } : { x: r.x + r.w - dpt, y: r.y, w: dpt, h: r.h });
}
if (ms.dividing_wall) {
  const dv = ms.dividing_wall;
  if (dv.along === 'x' && [dv.at_y, dv.from_x, dv.to_x].every(isNum)) blockedRects.push({ x: dv.from_x, y: dv.at_y - t / 2, w: dv.to_x - dv.from_x, h: t });
  if (dv.along === 'y' && [dv.at_x, dv.from_y, dv.to_y].every(isNum)) blockedRects.push({ x: dv.at_x - t / 2, y: dv.from_y, w: t, h: dv.to_y - dv.from_y });
}
const passableFootprints = validOpenings.filter((o) => PASSABLE_TYPES.includes(o.type)).map((o) => footprintRect(roomById.get(o.between[0]), o.wall, o.center_along_wall_cm, o.width_cm));
const ptIn = (r, x, y) => x >= r.x - 1e-6 && x <= r.x + r.w + 1e-6 && y >= r.y - 1e-6 && y <= r.y + r.h + 1e-6;
function passable(x, y) {
  if (blockedRects.some((r) => ptIn(r, x, y))) return false;
  if (validRooms.some((r) => ptIn(r.rect, x, y))) return true;
  return passableFootprints.some((r) => ptIn(r, x, y));
}
function segmentPassable(x0, y0, x1, y1, step = 5) {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / step));
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    if (!passable(x, y)) return { ok: false, x, y };
  }
  return { ok: true };
}
const DIR = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };

// ---- 9. encounters -----------------------------------------------------------------------------------------------
const encIds = new Set();
for (const e of encounters) {
  if (!isStr(e.id)) { fail(`encounter without id: ${JSON.stringify(e)}`); continue; }
  if (encIds.has(e.id)) fail(`duplicate encounter id "${e.id}"`);
  encIds.add(e.id);
  const room = roomById.get(e.room);
  if (!room) { fail(`encounter "${e.id}": unknown room "${e.room}"`); continue; }
  const bad = [];
  if (!isPos(e.spawn)) bad.push('spawn');
  if (!isRect(e.trigger_rect)) bad.push('trigger_rect');
  if (!isPos(e.player_approach)) bad.push('player_approach');
  if (!SIDES.includes(e.retreat_dir)) bad.push('retreat_dir');
  for (const k of ['retreat_clear_cm', 'strafe_clear_each_side_cm', 'capsule_radius_cm', 'capsule_height_cm']) if (!isNum(e[k])) bad.push(k);
  if (bad.length) { fail(`encounter "${e.id}": invalid/missing ${bad.join(', ')}`); continue; }
  if (!inRoom(room, e.spawn)) fail(`encounter "${e.id}": spawn is outside room "${room.id}"`);
  if (!rectsOverlap(e.trigger_rect, room.rect) && !validRooms.some((r) => rectsOverlap(e.trigger_rect, r.rect))) fail(`encounter "${e.id}": trigger_rect lies outside every room`);
  if (!validRooms.some((r) => inRoom(r, e.player_approach))) fail(`encounter "${e.id}": player_approach is outside every room`);
  if (e.retreat_clear_cm < metrics.encounter_space.retreat_path_min_cm) fail(`encounter "${e.id}": retreat_clear_cm ${e.retreat_clear_cm} < ${metrics.encounter_space.retreat_path_min_cm}`);
  if (e.strafe_clear_each_side_cm < metrics.encounter_space.strafe_each_side_min_cm) fail(`encounter "${e.id}": strafe_clear_each_side_cm ${e.strafe_clear_each_side_cm} < ${metrics.encounter_space.strafe_each_side_min_cm}`);
  const [dx, dy] = DIR[e.retreat_dir];
  const p = e.player_approach;
  const ret = segmentPassable(p.x, p.y, p.x + dx * e.retreat_clear_cm, p.y + dy * e.retreat_clear_cm);
  if (!ret.ok) fail(`encounter "${e.id}": retreat lane ${e.retreat_dir} ${e.retreat_clear_cm} cm from (${p.x}, ${p.y}) is blocked at (${ret.x.toFixed(0)}, ${ret.y.toFixed(0)})`);
  const [sx, sy] = [dy, dx]; // perpendicular
  for (const sgn of [1, -1]) {
    const s = segmentPassable(p.x, p.y, p.x + sgn * sx * e.strafe_clear_each_side_cm, p.y + sgn * sy * e.strafe_clear_each_side_cm);
    if (!s.ok) fail(`encounter "${e.id}": strafe lane (${sgn > 0 ? '+' : '-'}) ${e.strafe_clear_each_side_cm} cm is blocked at (${s.x.toFixed(0)}, ${s.y.toFixed(0)})`);
  }
  const los = segmentPassable(e.spawn.x, e.spawn.y, p.x, p.y);
  if (!los.ok) warn(`encounter "${e.id}": straight line spawn -> player_approach is blocked at (${los.x.toFixed(0)}, ${los.y.toFixed(0)}) (Gate 2 checks pathing properly)`);
  if (e.id === 'demon_1') {
    if (!isCorridor(room)) warn(`demon_1 should be in a corridor room near office_2 (is in "${room.id}")`);
    else if (!connections.some((c) => touches(c, room.id, 'office_2'))) warn(`demon_1's room "${room.id}" is not adjacent to office_2`);
  }
  if (e.id === 'demon_2' && room.id !== 'ceo_office') fail(`demon_2 must be inside ceo_office (is in "${room.id}")`);
}
for (const id of REQUIRED_ENCOUNTERS) if (!encIds.has(id)) fail(`required encounter "${id}" missing`);
const d1 = encounters.find((e) => e.id === 'demon_1'), d2 = encounters.find((e) => e.id === 'demon_2');
if (d1 && d2 && isNum(d1.capsule_radius_cm) && isNum(d2.capsule_radius_cm) && !(d2.capsule_radius_cm > d1.capsule_radius_cm && d2.capsule_height_cm > d1.capsule_height_cm))
  fail('demon_2 capsule must be larger than demon_1 in both radius and height');

// ---- 10. money shot --------------------------------------------------------------------------------------------------
(function checkMoneyShot() {
  if (!ms || !Object.keys(ms).length) return;
  if (ms.room !== 'ceo_office') fail(`money_shot.room must be ceo_office (got ${JSON.stringify(ms.room)})`);
  const room = roomById.get('ceo_office');
  if (!room || !isRect(room.rect)) return;
  if (!SIDES.includes(ms.window_wall)) { fail('money_shot.window_wall must be north|south|west|east'); return; }
  const entry = openingById.get(ms.entry_opening_id);
  if (!entry) { fail(`money_shot.entry_opening_id "${ms.entry_opening_id}" is not an opening`); return; }
  if (entry.type !== 'door' || !entry.between.includes('ceo_office') || !entry.between.includes('reception')) fail(`money_shot entry "${entry.id}" must be the reception -> ceo_office door`);
  const entrySide = entry.between[0] === 'ceo_office' ? entry.wall : OPPOSITE[entry.wall];
  if (OPPOSITE[entrySide] !== ms.window_wall) fail(`money_shot.window_wall "${ms.window_wall}" must be opposite the entry door (door is on the ${entrySide} wall of ceo_office)`);
  const win = windowFootprints.filter((w) => w.room === 'ceo_office' && w.side === ms.window_wall);
  if (!win.length) {
    const span = wallSpan(room, ms.window_wall);
    const behind = roomBehindWall(room, ms.window_wall, span[0], span[1]);
    if (behind && !isBackdrop(behind)) fail(`money_shot.window_wall "${ms.window_wall}" of ceo_office is shared with "${behind.id}"; the window wall must be exterior`);
    else warn(`no "window" opening on ceo_office's ${ms.window_wall} wall; the generator synthesizes a full-width window (sill ${A.window_sill_height_cm}, head ${A.window_head_height_cm}) from money_shot.window_wall`);
  } else {
    const span = wallSpan(room, ms.window_wall);
    const o = openingById.get(win[0].id);
    const c = o.center_along_wall_cm, half = o.width_cm / 2;
    if (!near(c - half, span[0], 1) || !near(c + half, span[1], 1)) warn(`window "${o.id}" [${c - half}, ${c + half}] does not span the full ${ms.window_wall} wall [${span[0]}, ${span[1]}] (spec: full-width window wall)`);
  }
  // dwell rect
  const dr = ms.dwell_rect;
  if (!isRect(dr)) fail('money_shot.dwell_rect must be {x,y,w,h}');
  else {
    const r = room.rect;
    if (dr.x < r.x || dr.y < r.y || dr.x + dr.w > r.x + r.w || dr.y + dr.h > r.y + r.h) fail('money_shot.dwell_rect is not inside ceo_office');
    const dist = ms.window_wall === 'south' ? (r.y + r.h) - dr.y : ms.window_wall === 'north' ? (dr.y + dr.h) - r.y
      : ms.window_wall === 'east' ? (r.x + r.w) - dr.x : (dr.x + dr.w) - r.x;
    if (dist > SPEC.dwellMaxDistance + 1e-6) fail(`money_shot.dwell_rect reaches ${dist} cm from the window wall (max ${SPEC.dwellMaxDistance})`);
  }
  // dividing wall vs sightline
  const dv = ms.dividing_wall;
  if (!dv) { warn('money_shot.dividing_wall missing (spec calls for a partial dividing wall)'); return; }
  let wallRect = null;
  if (dv.along === 'x' && [dv.at_y, dv.from_x, dv.to_x].every(isNum)) wallRect = { x: dv.from_x, y: dv.at_y - t / 2, w: dv.to_x - dv.from_x, h: t };
  else if (dv.along === 'y' && [dv.at_x, dv.from_y, dv.to_y].every(isNum)) wallRect = { x: dv.at_x - t / 2, y: dv.from_y, w: t, h: dv.to_y - dv.from_y };
  else { fail('money_shot.dividing_wall needs along:"x" with at_y/from_x/to_x or along:"y" with at_x/from_y/to_y'); return; }
  if (wallRect.w <= 0 || wallRect.h <= 0) fail('money_shot.dividing_wall has non-positive length');
  const r = room.rect;
  if (wallRect.x < r.x - 1e-6 || wallRect.y < r.y - 1e-6 || wallRect.x + wallRect.w > r.x + r.w + 1e-6 || wallRect.y + wallRect.h > r.y + r.h + 1e-6) fail('money_shot.dividing_wall is not inside ceo_office');
  if (isNum(dv.height_cm) && dv.height_cm > room.ceiling_cm) fail('money_shot.dividing_wall is taller than the ceiling');
  const along = dv.along === 'x' ? wallRect.w : wallRect.h;
  const roomAlong = dv.along === 'x' ? r.w : r.h;
  if (along >= roomAlong - 1e-6) fail('money_shot.dividing_wall spans the full room width (it must be partial)');
  // door centre -> window centre segment
  const entryRoom = roomById.get(entry.between[0]);
  const ef = footprintRect(entryRoom, entry.wall, entry.center_along_wall_cm, entry.width_cm);
  const door = { x: ef.x + ef.w / 2, y: ef.y + ef.h / 2 };
  const wc = ms.window_wall === 'south' ? { x: r.x + r.w / 2, y: r.y + r.h } : ms.window_wall === 'north' ? { x: r.x + r.w / 2, y: r.y }
    : ms.window_wall === 'east' ? { x: r.x + r.w, y: r.y + r.h / 2 } : { x: r.x, y: r.y + r.h / 2 };
  if (segmentHitsRect(door, wc, wallRect)) fail(`money_shot.dividing_wall crosses the sightline from the door centre (${door.x}, ${door.y}) to the window centre (${wc.x}, ${wc.y})`);
})();

function segmentHitsRect(p, q, r) { // Liang-Barsky slab test
  let t0 = 0, t1 = 1;
  const dx = q.x - p.x, dy = q.y - p.y;
  for (const [pp, dd, lo, hi] of [[p.x, dx, r.x, r.x + r.w], [p.y, dy, r.y, r.y + r.h]]) {
    if (Math.abs(dd) < 1e-12) { if (pp < lo || pp > hi) return false; continue; }
    let a = (lo - pp) / dd, b = (hi - pp) / dd;
    if (a > b) [a, b] = [b, a];
    t0 = Math.max(t0, a); t1 = Math.min(t1, b);
    if (t0 > t1) return false;
  }
  return true;
}

// ---- report ------------------------------------------------------------------------------------------------------------
const rel = path.relative(process.cwd(), path.resolve(planPath)) || planPath;
for (const m of info) console.log(`INFO ${m}`);
for (const m of warns) console.log(`WARN ${m}`);
if (fails.length) {
  console.log(`FAIL ${rel}: ${fails.length} problem(s)`);
  fails.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  process.exit(1);
}
const bounds = validRooms.reduce((acc, r) => ({
  x0: Math.min(acc.x0, r.rect.x - t), y0: Math.min(acc.y0, r.rect.y - t),
  x1: Math.max(acc.x1, r.rect.x + r.rect.w + t), y1: Math.max(acc.y1, r.rect.y + r.rect.h + t),
}), { x0: Infinity, y0: Infinity, x1: -Infinity, y1: -Infinity });
console.log(`PASS ${rel}: ${rooms.length} rooms, ${openings.length} openings, ${ducts.length} duct(s), ${blockers.length} blockers, ${markers.length} markers, ${checkpoints.length} checkpoints, ${encounters.length} encounters; ` +
  `plan bounds incl. walls ${bounds.x0}..${bounds.x1} x ${bounds.y0}..${bounds.y1} cm; critical path ${criticalPath.join(' -> ')}; ${warns.length} warning(s)`);
process.exit(0);
