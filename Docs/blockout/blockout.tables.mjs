#!/usr/bin/env node
// blockout.tables.mjs - regenerates the GENERATED parts of the Gate 2 blockout docs from Data/blockout.json:
//   node Docs/blockout/blockout.tables.mjs             -> rewrites section 6 ("## 6. Tables ...") of Docs/blockout/BLOCKOUT.md in place
//   node Docs/blockout/blockout.tables.mjs --manifest  -> (re)writes the "Blockout (Gate 2)" column of the REQ-G2-001 table in Docs/ASSET-MANIFEST.md
//   node Docs/blockout/blockout.tables.mjs --stdout    -> prints section 6 instead of splicing it
// Run after every `node Docs/blockout/blockout.build.mjs` so the prose never drifts from the data (BLOCKOUT.md section 9).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const rd = (p) => JSON.parse(fs.readFileSync(path.join(ROOT, p), 'utf8'));
const bo = rd('Data/blockout.json'), fp = rd('Data/floorplan.json');
const n1 = (v) => (Math.round(v * 10) / 10).toString();
const sz = (s) => `${n1(s.w)} x ${n1(s.d)} x ${n1(s.h)}`;
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|');
const usedBy = {};   // slot -> ["`id` in `room`"]
const add = (slot, id, room) => { if (slot) (usedBy[slot] ||= []).push(`\`${id}\` in \`${room}\``); };
for (const p of bo.props) add(p.slot, p.id, p.room);
for (const c of bo.characters) add(c.slot, c.id, c.room);
for (const k of bo.pickups) add(k.slot, k.id, k.room);
for (const d of bo.demons) add(d.slot, d.id, `${d.encounter} spawn`);

function section6() {
  const out = [], P = (s = '') => out.push(s);
  P('## 6. Tables (generated from `Data/blockout.json` by `Docs/blockout/blockout.tables.mjs`)');
  P();
  P('### Asset slots (REQ-G2-001 targets from the Blender audit)');
  P();
  P("`normalized_size_m` / `tris` are the AUDITED values (Blender rest pose, Z-up W x D x H) - the schema's primary fields, what Gate 4 divides `target_size_cm` by. The node header parser's view (`parser_size_m`, glTF Y-up x, y, z; `tris_parser`) is kept for the record only: it reads the two skinned demons 100x too small (audit headline finding 1).");
  P();
  P('| slot | class | target w x d x h (cm) | pivot | normalized_size_m (Blender W x D x H) | tris (Blender / parser) | parser_size_m (Y-up) | used by | why this size |');
  P('|---|---|---|---|---|---|---|---|---|');
  for (const [name, s] of Object.entries(bo.asset_slots).sort(([a], [b]) => a.localeCompare(b)))
    P(`| \`${name}\` | ${s.class} | ${sz(s.target_size_cm)} | ${s.pivot} | ${s.normalized_size_m.join(' x ')} | ${s.tris} / ${s.tris_parser ?? '-'} | ${s.parser_size_m ? s.parser_size_m.join(' x ') : '-'} | ${(usedBy[name] || ['-']).join(', ')} | ${esc(s.note)} |`);
  P();
  P(`### Props (${bo.props.length})`);
  P();
  P('| id | room | slot | kind | size w x d x h | centre (x, y) | yaw | mount | z | note |');
  P('|---|---|---|---|---|---|---|---|---|---|');
  for (const p of bo.props) P(`| \`${p.id}\` | ${p.room} | ${p.slot ? `\`${p.slot}\`` : '-'} | ${p.kind} | ${sz(p.size)} | (${n1(p.pos.x)}, ${n1(p.pos.y)}) | ${p.yaw_deg} | ${p.mount}${p.wall ? ` ${p.wall}` : ''} | ${p.z_cm} | ${esc(p.note)} |`);
  P();
  P(`### Characters (${bo.characters.length})`);
  P();
  P('| id | room | slot | pose | size w(across) x d(along facing) x h | centre (x, y) | facing | contact | note |');
  P('|---|---|---|---|---|---|---|---|---|');
  for (const c of bo.characters) P(`| \`${c.id}\` | ${c.room} | \`${c.slot}\` | ${c.pose} | ${sz(c.size)} | (${n1(c.pos.x)}, ${n1(c.pos.y)}) | ${c.yaw_deg} | ${c.contact} | ${esc(c.note)} |`);
  P();
  P(`### Pickups (${bo.pickups.length})`);
  P();
  P('| id | room | slot | size | centre (x, y) | yaw | halo | note |');
  P('|---|---|---|---|---|---|---|---|');
  for (const k of bo.pickups) P(`| \`${k.id}\` | ${k.room} | \`${k.slot}\` | ${sz(k.size)} | (${n1(k.pos.x)}, ${n1(k.pos.y)}) | ${k.yaw_deg} | ${k.halo} (60 cm cube) | ${esc(k.note)} |`);
  P();
  P(`### Demons (${bo.demons.length}) - cylinders at the encounter spawns, no collision, plus the audited wing footprint`);
  P();
  P('| id | encounter | slot | capsule r / h | footprint_cm (mesh w x d) | label | note |');
  P('|---|---|---|---|---|---|---|');
  for (const d of bo.demons) { const e = fp.encounters.find((x) => x.id === d.encounter); P(`| \`${d.id}\` | ${d.encounter} at (${e.spawn.x}, ${e.spawn.y}) | \`${d.slot}\` | ${d.radius_cm} / ${d.height_cm} | ${d.footprint_cm ? `${d.footprint_cm.w} x ${d.footprint_cm.d}` : '-'} | ${esc(d.label)} | ${esc(d.note)} |`); }
  P();
  P('### Volumes');
  P();
  const b = bo.backdrop, dr = fp.money_shot.dwell_rect, ck = bo.meta.checks;
  P('| volume | source | size / height | tint |');
  P('|---|---|---|---|');
  P(`| triggers | encounters.trigger_rect (${fp.encounters.map((e) => `${e.id}: x ${e.trigger_rect.x}-${e.trigger_rect.x + e.trigger_rect.w}, y ${e.trigger_rect.y}-${e.trigger_rect.y + e.trigger_rect.h}`).join('; ')}) | full-footprint boxes ${bo.triggers.height_cm} tall, translucent, no collision | greybox_style blockout.trigger_tint |`);
  P(`| dwell | money_shot.dwell_rect (x ${dr.x}-${dr.x + dr.w}, y ${dr.y}-${dr.y + dr.h}) | ${bo.dwell.height_cm} tall, translucent | ${bo.dwell.tint} (opacity 0.1: it stands in the sightline strip above the eye line) |`);
  P(`| backdrop | ${b.beyond_window_cm} cm beyond the glass (plane at y ${ck.backdrop.plane_y}) | ${b.width_cm} wide x ${b.height_cm} tall, bottom z ${b.z_cm} (x ${ck.backdrop.plane_x.join('..')}, z ${ck.backdrop.plane_z.join('..')}), no collision | ${b.tint} (emissive 3) |`);
  P();
  P('### Self-check numbers recorded in `meta.checks`');
  P();
  P('| check | value |');
  P('|---|---|');
  for (const r of ck.first_route) P(`| first move: ${r.route} | nearest blockout \`${r.nearest_blockout}\` at ${r.clearance_cm} cm (capsule ${r.capsule_radius_cm}) |`);
  for (const v of Object.entries(ck.corridor_clear).filter(([k]) => k.endsWith(':narrowest')).map(([, v]) => v)) P(`| corridor clear width, ${v.room} | ${v.clear_cm} cm past \`${v.past}\` (min ${v.min_cm ?? 216}${v.waiver ? ': ' + v.waiver : ''}) |`);
  for (const [k, v] of Object.entries(ck.lane_clearance)) P(`| lane clearance, ${k} | nearest blockout ${v} cm (need >= 36) |`);
  P(`| money shot | strip ${ck.money_shot.strip}: min clearance ${ck.money_shot.strip_min_clearance_cm}; tallest item south of the door wall ${ck.money_shot.tallest_item_south_of_door_wall_cm} < eye ${ck.money_shot.eye_height_cm}; demon_2 chokepoint ${ck.money_shot.demon_2_chokepoint_cm} >= ${ck.money_shot.chokepoint_min_cm} at the dividing wall's free end (${ck.money_shot.dividing_wall_free_end.x}, ${ck.money_shot.dividing_wall_free_end.y}) |`);
  P(`| backdrop from the dwell rect | FOV needs x ${ck.backdrop.dwell_fov_needs_x.join('..')}, z ${ck.backdrop.dwell_fov_needs_z.join('..')} (vertical half-FOV ${ck.backdrop.vertical_half_fov_deg} deg at 16:9); plane x ${ck.backdrop.plane_x.join('..')}, z ${ck.backdrop.plane_z.join('..')}; glass-edge rays from the dwell rect's inner corners reach x ${ck.backdrop.dwell_glass_edge_rays_x.join('..')} (${ck.backdrop.dwell_glass_edge_rays_covered ? 'covered' : 'grazing rays past the plane edge - a sky sphere would be needed for those'}) |`);
  P();
  return out.join('\n');
}

if (process.argv.includes('--manifest')) {
  const file = path.join(ROOT, 'Docs/ASSET-MANIFEST.md'), lines = fs.readFileSync(file, 'utf8').split(/\r?\n/);
  const start = lines.findIndex((l) => l.startsWith('| Source file | Unreal name | Class | Measured rest size'));
  if (start < 0) throw new Error('ASSET-MANIFEST.md: REQ-G2-001 table header not found');
  const has = lines[start].includes('Blockout (Gate 2)');
  if (!has) { lines[start] = lines[start].replace(/\|\s*$/, '| Blockout (Gate 2) |'); lines[start + 1] = lines[start + 1].replace(/\|\s*$/, '|---|'); }
  let n = 0;
  for (let i = start + 2; i < lines.length && lines[i].startsWith('|'); i++) {
    const m = lines[i].match(/\*\*(S[MK]_[A-Za-z0-9]+)\*\*/); if (!m) continue;
    const cell = (usedBy[m[1]] || ['(no blockout)']).join(', ');
    lines[i] = has ? lines[i].replace(/\|[^|]*\|\s*$/, `| ${cell} |`) : lines[i].replace(/\|\s*$/, `| ${cell} |`);
    n++;
  }
  fs.writeFileSync(file, lines.join('\n'));
  console.log(`ASSET-MANIFEST.md: Blockout (Gate 2) column written for ${n} rows`);
} else if (process.argv.includes('--stdout')) {
  process.stdout.write(section6());
} else {
  const file = path.join(ROOT, 'Docs/blockout/BLOCKOUT.md'), text = fs.readFileSync(file, 'utf8');
  const a = text.indexOf('## 6. '), b = text.indexOf('## 7. ');
  if (a < 0 || b < 0 || b < a) throw new Error('BLOCKOUT.md: could not find "## 6. " ... "## 7. "');
  fs.writeFileSync(file, text.slice(0, a) + section6() + '\n' + text.slice(b));
  console.log(`BLOCKOUT.md: section 6 regenerated (${bo.props.length} props, ${bo.characters.length} characters, ${bo.pickups.length} pickups, ${bo.demons.length} demons, ${Object.keys(bo.asset_slots).length} slots)`);
}
