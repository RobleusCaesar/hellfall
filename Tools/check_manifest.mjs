#!/usr/bin/env node
// check_manifest.mjs - sanity checks on a dry-run manifest written by build_greybox.py / build_feel_gym.py.
//
// Usage: node Tools/check_manifest.mjs <manifest.json> [--tolerance 0.5] [--fov 90]
//   * pairwise AABB overlap of visible collision boxes (tolerance 0.5 cm; kinds "collapse" and "boundary" whitelisted)
//   * bounding box and counts
//   * enclosure: every floor slab has a ceiling over its whole rect and solid cover on all four sides up to that
//     ceiling, with no gap wider than 30 cm outside an authored opening / duct mouth (office rooms and the gym hall)
//   * money shot (greybox manifests only): from the CEO door centre at eye height, looking along the
//     plan's window direction (Unreal +X for the agreed plan), the horizontal angle subtended by the window
//     wall. PASS when the part inside the FOV covers >= 60% of the horizontal FOV.
//   Marker kinds (scene / encounter / checkpoint / dwell markers, no collision) are ignored by every check.
// Exit 0 on PASS, 1 on FAIL.
import fs from 'node:fs';
import path from 'node:path';

const WHITELIST = new Set(['collapse', 'boundary']);
const MONEY_SHOT_MIN_FRACTION = 0.6;

function argValue(flag, def) {
  const i = process.argv.indexOf(flag);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}
const manifestPath = process.argv[2];
if (!manifestPath || manifestPath.startsWith('--')) {
  console.error('usage: node Tools/check_manifest.mjs <manifest.json> [--tolerance 0.5] [--fov 90]');
  process.exit(2);
}
const tol = Number(argValue('--tolerance', '0.5'));
const fovOverride = argValue('--fov', null);
const doc = JSON.parse(fs.readFileSync(path.resolve(manifestPath), 'utf8'));
const fails = [];
const fail = (m) => fails.push(m);

if (doc.format !== 'hellfall-greybox-manifest') fail(`unexpected manifest format ${JSON.stringify(doc.format)}`);
const actors = Array.isArray(doc.actors) ? doc.actors : [];
const boxes = actors.filter((a) => a.type === 'box');

// ---- bounds & counts -------------------------------------------------------------------------------------
const aabb = (b) => {
  const [cx, cy, cz] = b.center_plan, [w, d, h] = b.size_plan;
  return { x0: cx - w / 2, x1: cx + w / 2, y0: cy - d / 2, y1: cy + d / 2, z0: cz - h / 2, z1: cz + h / 2 };
};
const visible = boxes.filter((b) => b.visible);
const bounds = visible.reduce((acc, b) => {
  const r = aabb(b);
  return { x0: Math.min(acc.x0, r.x0), x1: Math.max(acc.x1, r.x1), y0: Math.min(acc.y0, r.y0), y1: Math.max(acc.y1, r.y1), z0: Math.min(acc.z0, r.z0), z1: Math.max(acc.z1, r.z1) };
}, { x0: Infinity, x1: -Infinity, y0: Infinity, y1: -Infinity, z0: Infinity, z1: -Infinity });
const counts = {};
for (const a of actors) {
  const k = a.type === 'box' ? `box:${a.kind}` : a.type === 'label' ? `label:${a.style}` : a.type === 'light' ? `light:${a.light_type}` : a.type;
  counts[k] = (counts[k] || 0) + 1;
}
console.log(`manifest ${path.basename(manifestPath)} -> map ${doc.map}, ${actors.length} actors`);
for (const k of Object.keys(counts).sort()) console.log(`  ${k.padEnd(24)} ${counts[k]}`);
if (visible.length) console.log(`  visible bounds (plan cm): x ${bounds.x0}..${bounds.x1}  y ${bounds.y0}..${bounds.y1}  z ${bounds.z0}..${bounds.z1}`);
else fail('manifest has no visible boxes');

// ---- names unique, transforms sane -------------------------------------------------------------------------
const names = new Set();
for (const a of actors) {
  if (names.has(a.name)) fail(`duplicate actor name ${a.name}`);
  names.add(a.name);
  if (a.type === 'box') {
    if (a.size_plan.some((v) => !(v > 0))) fail(`box ${a.name} has a non-positive dimension ${JSON.stringify(a.size_plan)}`);
    const [cx, cy, cz] = a.center_plan;
    const loc = a.ue.location;
    if (Math.abs(loc[0] - cy) > 1e-3 || Math.abs(loc[1] + cx) > 1e-3 || Math.abs(loc[2] - cz) > 1e-3) fail(`box ${a.name}: UE location does not follow UE.X=plan.y, UE.Y=-plan.x`);
    const [w, d, h] = a.size_plan;
    const sc = a.ue.scale;
    if (Math.abs(sc[0] - d / 100) > 1e-3 || Math.abs(sc[1] - w / 100) > 1e-3 || Math.abs(sc[2] - h / 100) > 1e-3) fail(`box ${a.name}: UE scale does not match size/100 (with X<->Y swap)`);
  }
}
const starts = actors.filter((a) => a.type === 'player_start');
if (starts.length !== 1) fail(`expected exactly one player_start, found ${starts.length}`);

// ---- pairwise overlap of visible collision boxes ---------------------------------------------------------------
const coll = visible.filter((b) => b.collision && !WHITELIST.has(b.kind)).map((b) => ({ b, r: aabb(b) })).sort((p, q) => p.r.x0 - q.r.x0);
let pairs = 0;
const overlaps = [];
for (let i = 0; i < coll.length; i++) {
  const A = coll[i];
  for (let j = i + 1; j < coll.length; j++) {
    const B = coll[j];
    if (B.r.x0 >= A.r.x1 - tol) break;
    pairs++;
    const ox = Math.min(A.r.x1, B.r.x1) - Math.max(A.r.x0, B.r.x0);
    const oy = Math.min(A.r.y1, B.r.y1) - Math.max(A.r.y0, B.r.y0);
    const oz = Math.min(A.r.z1, B.r.z1) - Math.max(A.r.z0, B.r.z0);
    if (ox > tol && oy > tol && oz > tol) overlaps.push(`${A.b.name} <-> ${B.b.name} (overlap ${ox.toFixed(1)} x ${oy.toFixed(1)} x ${oz.toFixed(1)} cm)`);
  }
}
console.log(`  overlap check: ${coll.length} collision boxes, ${pairs} candidate pairs, tolerance ${tol} cm, whitelist ${[...WHITELIST].join('/')} -> ${overlaps.length ? 'FAIL' : 'ok'}`);
for (const o of overlaps.slice(0, 30)) fail(`overlap: ${o}`);

// ---- hidden boundary present --------------------------------------------------------------------------------------
const boundary = boxes.filter((b) => b.kind === 'boundary');
if (!boundary.length) fail('no boundary boxes (REQ-G1-007 invisible perimeter)');
else if (boundary.some((b) => b.visible || !b.collision)) fail('boundary boxes must be hidden in game and have collision');

// ---- enclosure (gate-1 brief: "add ceiling and walls, this is an internal map") ---------------------------------------
// For every visible floor slab (kind "floor"): the tallest visible "ceiling" box over it sets the enclosure height H;
// a ceiling must cover the whole floor rect at z = H + 1; and each of the four sides, probed 1 cm outside the floor
// edge on z rows every 10 cm from 5 up to H, must be solid (a visible collision box other than the hidden boundary)
// or inside an authored hole from meta.openings (doors, opens, duct mouths, windows, infilled locked / elevator
// doors, each grown 1 cm).  An uncovered run wider than GAP_MAX_CM on any z row FAILs.  Office rooms and the
// feel-gym hall slab alike; markers and other non-collision boxes never count as cover.
const GAP_MAX_CM = 30, SIDE_STEP_CM = 5, Z_STEP_CM = 10, CEIL_STEP_CM = 25, PROBE_CM = 1;
const solids = visible.filter((b) => b.collision && b.kind !== 'boundary').map((b) => ({ b, r: aabb(b) }));
const holes = (doc.meta && Array.isArray(doc.meta.openings) ? doc.meta.openings : []).map((o) => ({
  id: o.id, x0: o.rect_plan[0] - PROBE_CM, x1: o.rect_plan[0] + o.rect_plan[2] + PROBE_CM,
  y0: o.rect_plan[1] - PROBE_CM, y1: o.rect_plan[1] + o.rect_plan[3] + PROBE_CM, z0: o.z_bottom - PROBE_CM, z1: o.z_top + PROBE_CM }));
const inBox = (r, x, y, z) => x >= r.x0 - 1e-6 && x <= r.x1 + 1e-6 && y >= r.y0 - 1e-6 && y <= r.y1 + 1e-6 && z >= r.z0 - 1e-6 && z <= r.z1 + 1e-6;
const overlap2d = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 1e-6 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1e-6;
const floors = visible.filter((b) => b.kind === 'floor');
const ceilings = visible.filter((b) => b.kind === 'ceiling').map((b) => ({ b, r: aabb(b) }));
const enclosureFails = [];
let floorsChecked = 0, sidesChecked = 0;
for (const f of floors) {
  const fr = aabb(f);
  const over = ceilings.filter((c) => overlap2d(c.r, fr));
  if (!over.length) { enclosureFails.push(`${f.name}: no ceiling box above the floor`); continue; }
  const H = Math.max(...over.map((c) => c.r.z0));
  floorsChecked++;
  let uncovered = 0, firstUncovered = null;
  for (let y = fr.y0 + PROBE_CM; y <= fr.y1 - PROBE_CM + 1e-6; y += CEIL_STEP_CM) {
    for (let x = fr.x0 + PROBE_CM; x <= fr.x1 - PROBE_CM + 1e-6; x += CEIL_STEP_CM) {
      if (!over.some((c) => inBox(c.r, x, y, H + PROBE_CM))) { uncovered++; if (!firstUncovered) firstUncovered = [x, y]; }
    }
  }
  if (uncovered) enclosureFails.push(`${f.name}: ceiling at ${H} cm leaves ${uncovered} sample(s) uncovered, first at plan (${firstUncovered[0]}, ${firstUncovered[1]})`);
  const sides = [['north', 'x', fr.y0 - PROBE_CM], ['south', 'x', fr.y1 + PROBE_CM], ['west', 'y', fr.x0 - PROBE_CM], ['east', 'y', fr.x1 + PROBE_CM]];
  for (const [side, axis, fixed] of sides) {
    const a0 = axis === 'x' ? fr.x0 : fr.y0, a1 = axis === 'x' ? fr.x1 : fr.y1;
    const pt = (a, z) => (axis === 'x' ? [a, fixed, z] : [fixed, a, z]);
    const onLine = (r) => (axis === 'x'
      ? fixed >= r.y0 - 1e-6 && fixed <= r.y1 + 1e-6 && r.x1 >= a0 - 1e-6 && r.x0 <= a1 + 1e-6
      : fixed >= r.x0 - 1e-6 && fixed <= r.x1 + 1e-6 && r.y1 >= a0 - 1e-6 && r.y0 <= a1 + 1e-6);
    const cand = solids.filter(({ r }) => onLine(r));
    const candHoles = holes.filter(onLine);
    sidesChecked++;
    let worst = null;
    for (let z = Z_STEP_CM / 2; z < H; z += Z_STEP_CM) {
      let run = 0, runStart = null;
      const flush = (aEnd) => {
        if (run) { const width = run * SIDE_STEP_CM; if (!worst || width > worst.width) worst = { width, z, from: runStart, to: aEnd }; }
        run = 0; runStart = null;
      };
      for (let a = a0; a <= a1 + 1e-6; a += SIDE_STEP_CM) {
        const [x, y] = pt(a, z);
        const ok = cand.some(({ r }) => inBox(r, x, y, z)) || candHoles.some((h) => inBox(h, x, y, z));
        if (ok) flush(a); else { if (!run) runStart = a; run++; }
      }
      flush(a1);
    }
    if (worst && worst.width > GAP_MAX_CM) enclosureFails.push(`${f.name} ${side} side: ${worst.width} cm gap (${axis} ${worst.from}..${worst.to}) at z ${worst.z}`);
  }
}
console.log(`  enclosure check: ${floors.length} floor slab(s), ${floorsChecked} with a ceiling, ${sidesChecked} sides probed (a gap > ${GAP_MAX_CM} cm outside an authored opening fails) -> ${enclosureFails.length ? 'FAIL' : 'ok'}`);
for (const m of enclosureFails.slice(0, 20)) fail(`enclosure: ${m}`);
if (!floors.length) fail('enclosure: manifest has no floor slab');

// ---- money shot ------------------------------------------------------------------------------------------------------
const msm = doc.meta && doc.meta.money_shot;
if (msm && Object.keys(msm).length) {
  const fov = Number(fovOverride || msm.fov_horizontal_deg || 90);
  const [ex, ey] = msm.eye_plan;
  const [fx, fy] = msm.look_dir_plan;      // forward in plan space
  const [rx, ry] = [-fy, fx];              // right = forward rotated +90 deg in plan space (x right, y down)
  const w = msm.window_wall_plan;
  const ends = w.axis === 'x' ? [[w.from, w.at], [w.to, w.at]] : [[w.at, w.from], [w.at, w.to]];
  const angles = ends.map(([px, py]) => {
    const dx = px - ex, dy = py - ey;
    return Math.atan2(dx * rx + dy * ry, dx * fx + dy * fy) * 180 / Math.PI;
  });
  const lo = Math.min(...angles), hi = Math.max(...angles);
  const subtended = hi - lo;
  const half = fov / 2;
  const inView = Math.max(0, Math.min(hi, half) - Math.max(lo, -half));
  const frac = inView / fov;
  const dist = w.axis === 'x' ? Math.abs(w.at - ey) : Math.abs(w.at - ex);
  console.log(`  money shot: eye at plan (${ex}, ${ey}) z ${msm.eye_plan[2]}, window wall ${dist} cm ahead, edges at ${lo.toFixed(1)} deg / ${hi.toFixed(1)} deg`);
  console.log(`  money shot: window subtends ${subtended.toFixed(1)} deg; inside the ${fov} deg FOV: ${inView.toFixed(1)} deg = ${(frac * 100).toFixed(0)}% (need >= ${MONEY_SHOT_MIN_FRACTION * 100}%) -> ${frac >= MONEY_SHOT_MIN_FRACTION ? 'PASS' : 'FAIL'}`);
  if (frac < MONEY_SHOT_MIN_FRACTION) fail(`money shot: window covers only ${(frac * 100).toFixed(0)}% of the horizontal FOV from the door`);
} else if (doc.meta && doc.meta.map_kind === 'greybox') {
  fail('greybox manifest has no money_shot meta (entry door or window not resolved)');
}

if (doc.meta && Array.isArray(doc.meta.warnings)) for (const w of doc.meta.warnings) console.log(`  WARN ${w}`);

if (fails.length) {
  console.log(`FAIL ${path.basename(manifestPath)}: ${fails.length} problem(s)`);
  fails.forEach((m, i) => console.log(`  ${i + 1}. ${m}`));
  process.exit(1);
}
console.log(`PASS ${path.basename(manifestPath)}`);
process.exit(0);
