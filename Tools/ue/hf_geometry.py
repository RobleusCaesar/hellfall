"""hf_geometry.py - pure-Python geometry for the HELLFALL greybox and feel gym.

NO ``unreal`` import anywhere in this module: everything here runs under plain
Python 3.12 (``--dry-run``) and under Unreal's embedded Python 3.11 unchanged.

Inputs (all JSON under Data/):
  floorplan.json     rooms / openings / ducts / blockers / markers / ... (Docs/FLOORPLAN-SCHEMA.md)
  metrics.json       architecture metrics standard (wall 20, door 120x220, duct 100x95, ...)
  greybox_style.json tints, light values, label styling, marker sizes, layout spacing
  movement.json      player body (capsule, eye height, FOV) - only for PlayerStart Z and the money-shot meta

Output: an ordered list of plain dataclasses (Box, Label, Light, PlayerStart) in
*plan space* plus a ``meta`` dict.  Emitters (Tools/ue/hf_common.py) turn them
into Unreal actors or a JSON manifest.

Coordinate convention (Docs/FLOORPLAN-SCHEMA.md):
  plan.x  -> right of the photo            UE.X (forward) =  plan.y
  plan.y  -> down the photo (to the window) UE.Y (right)   = -plan.x
  z       -> up, 0 = finished floor         UE.Z            =  plan.z
  plan yaw 0 = facing +plan.x, 90 = facing +plan.y  ->  UE yaw = plan yaw - 90

Walls are generated with a 2-D cell grid: the solid footprint is
(union of room rects grown by wall_thickness) minus (union of room rects).  Every
cell is classified once, so shared walls, offset neighbours, T-junctions and
corners come out as non-overlapping boxes automatically; openings change the
vertical spans of the cells they cover (threshold below, header above, infill
for locked doors / elevator doors, sill + glass + mullions for windows).

Determinism: no randomness, no timestamps, stable sort by (folder, name),
all floats rounded to 3 decimals in the manifest.
"""
from __future__ import annotations

import json
import math
import os
import textwrap
from dataclasses import dataclass, field
from typing import Any, Dict, Iterable, List, Optional, Sequence, Tuple

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
DATA_DIR = os.path.join(REPO_ROOT, "Data")

DEFAULT_FLOORPLAN = os.path.join(DATA_DIR, "floorplan.json")
DEFAULT_METRICS = os.path.join(DATA_DIR, "metrics.json")
DEFAULT_STYLE = os.path.join(DATA_DIR, "greybox_style.json")
DEFAULT_MOVEMENT = os.path.join(DATA_DIR, "movement.json")
DEFAULT_BLOCKOUT = os.path.join(DATA_DIR, "blockout.json")   # Gate 2; optional (absent = greybox-only build)

SIDES = ("north", "south", "west", "east")
OPPOSITE = {"north": "south", "south": "north", "west": "east", "east": "west"}

# Opening types whose hole is intentionally filled (validation allows these box kinds inside the hole).
HOLE_FILL_KINDS = {
    "door": set(),
    "open": set(),
    "duct_mouth": set(),
    "locked_door": {"infill"},
    "elevator_doors": {"infill"},
    "window": {"glass", "mullion"},
}

# Box kinds excluded from the pairwise overlap check (stacked on purpose / hidden shell).
OVERLAP_WHITELIST_KINDS = {"collapse", "boundary"}

# Visible box kinds that live OUTSIDE the boundary shell and the plan bounds (Gate-2 backdrop beyond the window).
BOUNDARY_EXEMPT_KINDS = {"backdrop"}

EPS = 1e-6


class GeometryError(Exception):
    """Raised with a clear message when the plan or the generated geometry is invalid."""


# --------------------------------------------------------------------------------------
# Dataclasses (plan space)
# --------------------------------------------------------------------------------------

@dataclass(frozen=True)
class Box:
    """An axis-aligned or yawed cuboid.  ``yaw_plan_deg`` (Gate 2 blockouts) turns the footprint about z in
    plan space: ``w`` runs along (cos yaw, sin yaw), ``d`` along (-sin yaw, cos yaw); 0 = the classic
    axis-aligned box.  ``min_plan`` / ``max_plan`` are the (conservative) AABB, ``corners_plan`` the exact
    footprint, and the overlap / containment tests below use the exact footprint (SAT) so an angled desk
    is never reported as touching a neighbour it does not touch.
    """
    name: str
    kind: str
    center_plan: Tuple[float, float, float]   # x, y, z (centre)
    size: Tuple[float, float, float]          # w (along local x), d (along local y), h (along z)
    tint_key: str
    collision: bool
    visible: bool
    folder: str
    room: str = ""
    yaw_plan_deg: float = 0.0                 # footprint rotation in plan space (0 = w along +plan.x)

    @property
    def axis_aligned(self) -> bool:
        return abs(self.yaw_plan_deg % 90.0) < 1e-9 or abs(self.yaw_plan_deg % 90.0 - 90.0) < 1e-9

    @property
    def half_extents_plan(self) -> Tuple[float, float]:
        """Half extents of the footprint's AABB along plan x / y (exact for yaw multiples of 90)."""
        w, d, _ = self.size
        c = abs(math.cos(math.radians(self.yaw_plan_deg)))
        s = abs(math.sin(math.radians(self.yaw_plan_deg)))
        return (w / 2.0 * c + d / 2.0 * s, w / 2.0 * s + d / 2.0 * c)

    @property
    def min_plan(self) -> Tuple[float, float, float]:
        cx, cy, cz = self.center_plan
        hx, hy = self.half_extents_plan
        return (cx - hx, cy - hy, cz - self.size[2] / 2.0)

    @property
    def max_plan(self) -> Tuple[float, float, float]:
        cx, cy, cz = self.center_plan
        hx, hy = self.half_extents_plan
        return (cx + hx, cy + hy, cz + self.size[2] / 2.0)

    def corners_plan(self) -> List[Tuple[float, float]]:
        """The four footprint corners (plan x, y), counter-clockwise in plan space."""
        cx, cy, _ = self.center_plan
        w, d, _ = self.size
        ux, uy = math.cos(math.radians(self.yaw_plan_deg)), math.sin(math.radians(self.yaw_plan_deg))
        vx, vy = -uy, ux
        out = []
        for sw, sd in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
            out.append((cx + sw * ux * w / 2.0 + sd * vx * d / 2.0, cy + sw * uy * w / 2.0 + sd * vy * d / 2.0))
        return out

    def contains_point(self, p: Tuple[float, float, float], tol: float = 0.0) -> bool:
        cz = self.center_plan[2]
        h = self.size[2]
        if not (cz - h / 2.0 - tol <= p[2] <= cz + h / 2.0 + tol):
            return False
        if self.axis_aligned:
            lo = self.min_plan
            hi = self.max_plan
            return lo[0] - tol <= p[0] <= hi[0] + tol and lo[1] - tol <= p[1] <= hi[1] + tol
        # local frame test for a yawed footprint
        cx, cy, _ = self.center_plan
        w, d, _ = self.size
        ux, uy = math.cos(math.radians(self.yaw_plan_deg)), math.sin(math.radians(self.yaw_plan_deg))
        dx, dy = p[0] - cx, p[1] - cy
        lu = dx * ux + dy * uy
        lv = -dx * uy + dy * ux
        return abs(lu) <= w / 2.0 + tol and abs(lv) <= d / 2.0 + tol


@dataclass(frozen=True)
class Cylinder:
    """A scaled /Engine/BasicShapes/Cylinder (100 cm diameter x 100 cm tall, centred on its origin).

    Gate 2 uses it for the two demon capsules (REQ-G2-003): radius / height from Data/blockout.json, standing on
    the floor at the encounter spawn, NO collision so the lane checks stay honest.  ``center_plan`` is the
    centre of the cylinder (z = height / 2).  The manifest type is "cylinder"; hf_common.UnrealEmitter scales
    the engine cylinder by (2r/100, 2r/100, h/100).
    """
    name: str
    kind: str
    center_plan: Tuple[float, float, float]
    radius_cm: float
    height_cm: float
    tint_key: str
    collision: bool
    visible: bool
    folder: str
    room: str = ""

    @property
    def size(self) -> Tuple[float, float, float]:
        return (2.0 * self.radius_cm, 2.0 * self.radius_cm, self.height_cm)

    @property
    def min_plan(self) -> Tuple[float, float, float]:
        cx, cy, cz = self.center_plan
        return (cx - self.radius_cm, cy - self.radius_cm, cz - self.height_cm / 2.0)

    @property
    def max_plan(self) -> Tuple[float, float, float]:
        cx, cy, cz = self.center_plan
        return (cx + self.radius_cm, cy + self.radius_cm, cz + self.height_cm / 2.0)


@dataclass(frozen=True)
class Label:
    """A floating TextRenderActor - exactly ONE single-sided actor per Label.

    Facing convention (VERIFIED 5.8.2 by packaged-run frames, 2026-09-06): a TextRenderComponent quad is
    visible from BOTH sides - readable from the side its local +X points to, MIRRORED from the other side.
    The room label spawned at plan yaw 90 (UE yaw 0, local +X = UE +X) was mirrored for a player standing
    on the -X side looking toward +X, so the readable face points along local +X and the viewer has to
    stand on the +X side of the quad.  In plan space: a label with yaw_plan_deg = Y is readable by a viewer
    located in direction Y from the label.  To face a viewer at V from a label at L:
        yaw_plan_deg = degrees(atan2(V.y - L.y, V.x - L.x))          -> label_yaw_facing()

    The old double_sided 180-degree twin is gone: two overlapping quads whose glyphs do not align render as
    doubled / garbled text (seen in the same frames).  The field stays for the manifest but defaults False,
    no style sets it, and the emitter spawns one actor regardless.  viewer_plan / facing record which point
    (and which rule) the label faces so the dry-run manifest can be checked by hand.
    """
    name: str
    pos_plan: Tuple[float, float, float]
    text: str
    size_cm: float
    color_rgb: Tuple[float, float, float]
    folder: str
    style_key: str = "element"
    yaw_plan_deg: float = 270.0      # readable-face direction in plan space (270 = read from the -plan.y side)
    double_sided: bool = False       # retired; always False (see docstring)
    room: str = ""
    viewer_plan: Optional[Tuple[float, float]] = None   # plan point the label faces (None = a direction rule)
    facing: str = ""                 # rule that chose the yaw: player_start | critical_path:<id> | opening:<id> | ...


@dataclass(frozen=True)
class Light:
    """A light actor.  Point lights are EVEN FILL lights (packaged-run finding 2026-09-06: ceiling-hung
    inverse-square candela lights blew the ceiling around each fixture out to white while the walls read
    flat tan, and the auto-exposure swallowed a 12.5x candela change; the greybox needs even light so Rob
    can judge space, not mood): inverse-square falloff OFF, unitless intensity, falloff exponent from style,
    attenuation radius covering the whole room, shadows off, MOVABLE.  Built only via _point_light().
    """
    name: str
    pos_plan: Tuple[float, float, float]
    intensity: float                 # point: unitless (see intensity_units); directional: lux; sky: scalar
    temperature_k: float
    attenuation_radius_cm: float
    folder: str
    light_type: str = "point"        # point | directional | sky
    cast_shadows: bool = False
    mobility: str = "MOVABLE"
    pitch_deg: float = 0.0           # directional only (UE pitch)
    yaw_deg: float = 0.0             # directional only (UE yaw)
    room: str = ""
    intensity_units: str = "unitless"   # point: "unitless" (ELightUnits::Unitless); directional "lux"; sky "scalar"
    inverse_squared: bool = False       # point only: bUseInverseSquaredFalloff
    falloff_exponent: float = 2.0       # point only: LightFalloffExponent (applies when inverse_squared is False)


@dataclass(frozen=True)
class PlayerStart:
    name: str
    pos_plan: Tuple[float, float, float]
    yaw_plan_deg: float
    folder: str
    room: str = ""


Actor = Any  # Box | Cylinder | Label | Light | PlayerStart


# --------------------------------------------------------------------------------------
# Transform helpers
# --------------------------------------------------------------------------------------

def r3(v: float) -> float:
    """Round for manifest determinism (kills -0.0 too)."""
    out = round(float(v) + 0.0, 3)
    return 0.0 if out == 0 else out


def plan_to_ue(x: float, y: float, z: float) -> Tuple[float, float, float]:
    """UE.X = plan.y, UE.Y = -plan.x, UE.Z = z."""
    return (r3(y), r3(-x), r3(z))


def plan_yaw_to_ue_yaw(yaw_plan_deg: float) -> float:
    """plan yaw 0 (+plan.x) -> UE -Y = yaw -90 ; plan yaw 90 (+plan.y) -> UE +X = yaw 0."""
    yaw = (yaw_plan_deg - 90.0) % 360.0
    if yaw > 180.0:
        yaw -= 360.0
    return r3(yaw)


def label_yaw_facing(label_xy: Sequence[float], viewer_xy: Sequence[float], snap_deg: float = 10.0) -> float:
    """Plan yaw whose readable face points from label_xy toward viewer_xy (Label docstring, fact 2).

    yaw = degrees(atan2(V.y - L.y, V.x - L.x)) in [0, 360), snapped to the nearest multiple of 90 only when
    within snap_deg of one (keeps the text axis-aligned when a door is roughly centred on the room; otherwise
    the exact angle stays).  Passing a unit direction as viewer_xy with label_xy = (0, 0) yields the yaw of that
    direction.  A coincident viewer (dx = dy = 0) falls back to 270 (readable from the -plan.y side).
    """
    dx = float(viewer_xy[0]) - float(label_xy[0])
    dy = float(viewer_xy[1]) - float(label_xy[1])
    if abs(dx) < EPS and abs(dy) < EPS:
        return 270.0
    yaw = math.degrees(math.atan2(dy, dx)) % 360.0
    nearest = (round(yaw / 90.0) * 90.0) % 360.0
    if abs(((yaw - nearest) + 180.0) % 360.0 - 180.0) <= snap_deg:
        yaw = nearest
    return r3(yaw)


def _selftest() -> None:
    """Cheap invariants of the pure helpers; hf_common.run_build runs this on every --dry-run."""
    checks = [
        (label_yaw_facing((0.0, 0.0), (0.0, -10.0)), 270.0, "facing -plan.y must be 270"),
        (label_yaw_facing((0.0, 0.0), (10.0, 0.0)), 0.0, "facing +plan.x must be 0"),
        (label_yaw_facing((0.0, 0.0), (0.0, 10.0)), 90.0, "facing +plan.y must be 90"),
        (label_yaw_facing((0.0, 0.0), (-10.0, 0.0)), 180.0, "facing -plan.x must be 180"),
        (label_yaw_facing((0.0, 0.0), (10.0, 1.0)), 0.0, "5.7 deg off axis snaps to 0"),
        (label_yaw_facing((0.0, 0.0), (10.0, -1.0)), 0.0, "-5.7 deg off axis snaps to 0, not 360"),
        (label_yaw_facing((0.0, 0.0), (10.0, 3.0)), 16.699, "16.7 deg off axis is kept"),
        (label_yaw_facing((5.0, 5.0), (5.0, 5.0)), 270.0, "coincident viewer falls back to 270"),
        (plan_yaw_to_ue_yaw(270.0), 180.0, "plan 270 -> UE 180"),
        (plan_yaw_to_ue_yaw(0.0), -90.0, "plan 0 -> UE -90"),
        (footprint_yaw_to_ue_yaw(0.0), 0.0, "footprint yaw 0 -> UE 0"),
        (footprint_yaw_to_ue_yaw(270.0), -90.0, "footprint yaw 270 -> UE -90"),
    ]
    for got, want, what in checks:
        if abs(float(got) - want) > 1e-3:
            raise GeometryError("selftest: %s (got %s, want %s)" % (what, got, want))
    # Footprint geometry: a 200 x 100 box yawed 90 spans 100 along x / 200 along y; SAT overlap vs a neighbour.
    b90 = Box("t", "t", (0.0, 0.0, 50.0), (200.0, 100.0, 100.0), "", False, False, "", yaw_plan_deg=90.0)
    if abs(b90.max_plan[0] - 50.0) > 1e-6 or abs(b90.max_plan[1] - 100.0) > 1e-6:
        raise GeometryError("selftest: yawed box AABB wrong: %s" % (b90.max_plan,))
    other = Box("o", "o", (100.0, 0.0, 50.0), (100.0, 100.0, 100.0), "", False, False, "")
    if _boxes_overlap(b90, other, 0.5):
        raise GeometryError("selftest: flush boxes must not overlap")
    b45 = Box("t45", "t", (0.0, 0.0, 50.0), (200.0, 20.0, 100.0), "", False, False, "", yaw_plan_deg=45.0)
    far = Box("far", "o", (60.0, -60.0, 50.0), (40.0, 40.0, 100.0), "", False, False, "")
    if _boxes_overlap(b45, far, 0.5):
        raise GeometryError("selftest: SAT must clear a box beside a 45-degree bar (AABBs overlap, footprints do not)")
    if not b45.contains_point((70.0, 70.0, 50.0)) or b45.contains_point((70.0, -70.0, 50.0)):
        raise GeometryError("selftest: yawed contains_point wrong")


def footprint_yaw_to_ue_yaw(yaw_plan_deg: float) -> float:
    """UE yaw of a FOOTPRINT rotation (not a facing): plan space and UE turn the same way (plan +x -> +y is
    UE -Y -> +X, both a +90 turn), so a box footprint yawed by t in plan is the engine cube yawed by t.  The
    -90 offset in plan_yaw_to_ue_yaw belongs to facings only (their reference direction differs).  Result in
    (-180, 180]."""
    yaw = float(yaw_plan_deg) % 360.0
    if yaw > 180.0:
        yaw -= 360.0
    return r3(yaw)


def box_ue_transform(box: Box) -> Dict[str, Any]:
    """Location/rotation/scale for a 100 cm engine cube. Scale.X spans local d (plan.y when unrotated), Scale.Y
    spans local w (plan.x when unrotated); the footprint yaw becomes the actor yaw (footprint_yaw_to_ue_yaw)."""
    cx, cy, cz = box.center_plan
    w, d, h = box.size
    return {
        "location": list(plan_to_ue(cx, cy, cz)),
        "rotation": [0.0, 0.0, footprint_yaw_to_ue_yaw(box.yaw_plan_deg)],
        "scale": [r3(d / 100.0), r3(w / 100.0), r3(h / 100.0)],
    }


def cylinder_ue_transform(cyl: Cylinder) -> Dict[str, Any]:
    """Location/scale for the 100 x 100 engine cylinder: uniform XY scale 2r/100, Z scale h/100, centre at h/2."""
    cx, cy, cz = cyl.center_plan
    s = r3(2.0 * cyl.radius_cm / 100.0)
    return {
        "location": list(plan_to_ue(cx, cy, cz)),
        "rotation": [0.0, 0.0, 0.0],
        "scale": [s, s, r3(cyl.height_cm / 100.0)],
    }


def actor_to_manifest(a: Actor) -> Dict[str, Any]:
    if isinstance(a, Box):
        return {
            "type": "box",
            "name": a.name,
            "kind": a.kind,
            "folder": a.folder,
            "room": a.room,
            "tint": a.tint_key,
            "collision": a.collision,
            "visible": a.visible,
            "center_plan": [r3(v) for v in a.center_plan],
            "size_plan": [r3(v) for v in a.size],
            "yaw_plan_deg": r3(a.yaw_plan_deg),
            "ue": box_ue_transform(a),
        }
    if isinstance(a, Cylinder):
        return {
            "type": "cylinder",
            "name": a.name,
            "kind": a.kind,
            "folder": a.folder,
            "room": a.room,
            "tint": a.tint_key,
            "collision": a.collision,
            "visible": a.visible,
            "center_plan": [r3(v) for v in a.center_plan],
            "radius_cm": r3(a.radius_cm),
            "height_cm": r3(a.height_cm),
            "size_plan": [r3(v) for v in a.size],
            "ue": cylinder_ue_transform(a),
        }
    if isinstance(a, Label):
        x, y, z = a.pos_plan
        return {
            "type": "label",
            "name": a.name,
            "folder": a.folder,
            "room": a.room,
            "text": a.text,
            "style": a.style_key,
            "size_cm": r3(a.size_cm),
            "color_rgb": [r3(c) for c in a.color_rgb],
            "double_sided": a.double_sided,
            "yaw_plan_deg": r3(a.yaw_plan_deg),
            "viewer_plan": None if a.viewer_plan is None else [r3(a.viewer_plan[0]), r3(a.viewer_plan[1])],
            "facing": a.facing,
            "pos_plan": [r3(x), r3(y), r3(z)],
            "ue": {"location": list(plan_to_ue(x, y, z)), "rotation": [0.0, 0.0, plan_yaw_to_ue_yaw(a.yaw_plan_deg)]},
        }
    if isinstance(a, Light):
        x, y, z = a.pos_plan
        return {
            "type": "light",
            "light_type": a.light_type,
            "name": a.name,
            "folder": a.folder,
            "room": a.room,
            "intensity": r3(a.intensity),
            "intensity_units": a.intensity_units,
            "inverse_squared": a.inverse_squared,
            "falloff_exponent": r3(a.falloff_exponent),
            "temperature_k": r3(a.temperature_k),
            "attenuation_radius_cm": r3(a.attenuation_radius_cm),
            "cast_shadows": a.cast_shadows,
            "mobility": a.mobility,
            "pos_plan": [r3(x), r3(y), r3(z)],
            "ue": {"location": list(plan_to_ue(x, y, z)), "rotation": [0.0, r3(a.pitch_deg), r3(a.yaw_deg)]},
        }
    if isinstance(a, PlayerStart):
        x, y, z = a.pos_plan
        return {
            "type": "player_start",
            "name": a.name,
            "folder": a.folder,
            "room": a.room,
            "pos_plan": [r3(x), r3(y), r3(z)],
            "yaw_plan_deg": r3(a.yaw_plan_deg),
            "ue": {"location": list(plan_to_ue(x, y, z)), "rotation": [0.0, 0.0, plan_yaw_to_ue_yaw(a.yaw_plan_deg)]},
        }
    raise GeometryError("unknown actor type %r" % (type(a),))


# --------------------------------------------------------------------------------------
# JSON loading
# --------------------------------------------------------------------------------------

def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def load_inputs(floorplan_path: str = DEFAULT_FLOORPLAN,
                metrics_path: str = DEFAULT_METRICS,
                style_path: str = DEFAULT_STYLE,
                movement_path: str = DEFAULT_MOVEMENT,
                blockout_path: Optional[str] = "auto") -> Dict[str, Any]:
    """Load every JSON input.  ``blockout_path`` (Gate 2): "auto" loads Data/blockout.json when it exists AND
    ``floorplan_path`` is the default Data/floorplan.json (the blockout is authored against that plan's rooms,
    encounters and dwell rect; a candidate / fixture plan builds greybox-only), and stays silent otherwise;
    None / "" never loads one; an explicit path must exist.  ``inputs["blockout"]`` is the parsed file or None;
    ``paths["blockout"]`` is present only when loaded."""
    inputs: Dict[str, Any] = {
        "floorplan": load_json(floorplan_path),
        "metrics": load_json(metrics_path),
        "style": load_json(style_path),
        "movement": load_json(movement_path),
        "blockout": None,
        "paths": {
            "floorplan": _rel(floorplan_path),
            "metrics": _rel(metrics_path),
            "style": _rel(style_path),
            "movement": _rel(movement_path),
        },
    }
    if blockout_path == "auto":
        # Review finding 2026-09-07: auto-loading for EVERY plan made `--floorplan Data/candidates/X.json` fail on
        # "blockout prop ...: unknown room" instead of testing the plan; the default plan is the only one it fits.
        blockout_path = DEFAULT_BLOCKOUT if (os.path.isfile(DEFAULT_BLOCKOUT) and _same_file(floorplan_path, DEFAULT_FLOORPLAN)) else None
    elif blockout_path and not os.path.isfile(blockout_path):
        raise GeometryError("blockout file not found: %s" % blockout_path)
    if blockout_path:
        inputs["blockout"] = load_json(blockout_path)
        inputs["paths"]["blockout"] = _rel(blockout_path)
    return inputs


def _rel(path: str) -> str:
    """Repo-relative forward-slash path for the manifest (no machine-specific absolute paths)."""
    try:
        rel = os.path.relpath(os.path.abspath(path), REPO_ROOT)
    except ValueError:
        rel = path
    return rel.replace("\\", "/")


def _same_file(a: str, b: str) -> bool:
    """True when both paths name the same existing file (os.path.samefile; a missing file falls back to a
    normalised absolute-path compare so the caller's own "not found" error wins)."""
    try:
        return os.path.samefile(a, b)
    except OSError:
        return os.path.normcase(os.path.abspath(a)) == os.path.normcase(os.path.abspath(b))


# --------------------------------------------------------------------------------------
# Small internal records
# --------------------------------------------------------------------------------------

@dataclass
class _Room:
    id: str
    label: str
    x: float
    y: float
    w: float
    h: float
    ceiling: float
    floor_finish: str
    enterable: bool
    role: str

    @property
    def cx(self) -> float:
        return self.x + self.w / 2.0

    @property
    def cy(self) -> float:
        return self.y + self.h / 2.0

    def contains(self, px: float, py: float, tol: float = 0.0) -> bool:
        return (self.x - tol <= px <= self.x + self.w + tol) and (self.y - tol <= py <= self.y + self.h + tol)


@dataclass
class _Footprint:
    """A hole in a wall: 2-D rect in the wall strip + vertical extent of the hole."""
    opening_id: str
    kind: str                 # door | open | locked_door | window | duct_mouth | elevator_doors
    x0: float
    x1: float
    y0: float
    y1: float
    z_bottom: float
    z_top: float
    infill_tint: str = ""     # locked_door / elevator_doors: box filling the hole
    room_a: str = ""          # room whose wall carries the opening
    room_b: str = ""          # other room ("exterior" for windows)
    side_a: str = ""          # which wall of room_a

    @property
    def cx(self) -> float:
        return (self.x0 + self.x1) / 2.0

    @property
    def cy(self) -> float:
        return (self.y0 + self.y1) / 2.0

    @property
    def along_axis(self) -> str:
        """'x' when the opening runs along plan x (N/S wall), 'y' for E/W walls."""
        return "x" if self.side_a in ("north", "south") else "y"


def _rooms_from_plan(fp: Dict[str, Any]) -> Dict[str, _Room]:
    rooms: Dict[str, _Room] = {}
    for r in fp.get("rooms", []):
        rect = r["rect"]
        if r["id"] in rooms:
            raise GeometryError("duplicate room id %r" % r["id"])
        rooms[r["id"]] = _Room(
            id=r["id"], label=r.get("label", r["id"]),
            x=float(rect["x"]), y=float(rect["y"]), w=float(rect["w"]), h=float(rect["h"]),
            ceiling=float(r["ceiling_cm"]), floor_finish=r.get("floor_finish", "concrete"),
            enterable=bool(r.get("enterable", True)), role=r.get("role", "transit"),
        )
    if not rooms:
        raise GeometryError("floorplan has no rooms")
    return rooms


def _wall_footprint(room: _Room, side: str, center: float, width: float, t: float) -> Tuple[float, float, float, float]:
    half = width / 2.0
    if side == "north":
        return (center - half, center + half, room.y - t, room.y)
    if side == "south":
        return (center - half, center + half, room.y + room.h, room.y + room.h + t)
    if side == "west":
        return (room.x - t, room.x, center - half, center + half)
    if side == "east":
        return (room.x + room.w, room.x + room.w + t, center - half, center + half)
    raise GeometryError("unknown wall side %r" % side)


def _side_normal(side: str) -> Tuple[float, float]:
    """Outward unit normal of a room side in plan space."""
    return {"north": (0.0, -1.0), "south": (0.0, 1.0), "west": (-1.0, 0.0), "east": (1.0, 0.0)}[side]


def _style_tint(style: Dict[str, Any], key: str) -> str:
    if key not in style["tints"]:
        raise GeometryError("greybox_style.json has no tint %r" % key)
    return key


def _wall_tint_for(style: Dict[str, Any], room: _Room) -> str:
    mapping = style.get("wall_tint_by_role", {})
    key = mapping.get(room.role, "wall")
    return _style_tint(style, key)


def _label_style(style: Dict[str, Any], key: str, metrics: Dict[str, Any]) -> Dict[str, Any]:
    ls = dict(style["labels"][key])
    if key == "room":
        ls.setdefault("size_cm", metrics["architecture"]["label_world_size_cm"])
        ls.setdefault("height_cm", metrics["architecture"]["label_height_above_floor_cm"])
    return ls


def _make_label(name: str, x: float, y: float, text: str, style_key: str, style: Dict[str, Any],
                metrics: Dict[str, Any], folder: str, room: str = "", *, yaw_plan_deg: float,
                z_override: Optional[float] = None, viewer_plan: Optional[Tuple[float, float]] = None,
                facing: str = "") -> Label:
    """One single-sided label.  yaw_plan_deg is keyword-REQUIRED so no call site can inherit a mirrored default."""
    ls = _label_style(style, style_key, metrics)
    z = float(ls["height_cm"]) if z_override is None else z_override
    return Label(
        name=name, pos_plan=(x, y, z), text=text, size_cm=float(ls["size_cm"]),
        color_rgb=tuple(float(c) for c in ls["color_rgb"]), folder=folder, style_key=style_key,
        yaw_plan_deg=float(yaw_plan_deg), double_sided=bool(ls.get("double_sided", False)), room=room,
        viewer_plan=None if viewer_plan is None else (float(viewer_plan[0]), float(viewer_plan[1])), facing=facing,
    )


# --------------------------------------------------------------------------------------
# Wall grid
# --------------------------------------------------------------------------------------

def _classify_side(room: _Room, cx: float, cy: float) -> str:
    """N/S walls own the corners; E/W walls span only the interior height."""
    if cy < room.y:
        return "north"
    if cy > room.y + room.h:
        return "south"
    if cx < room.x:
        return "west"
    return "east"


def _merge_cells(cells: Iterable[Tuple[int, int]], xs: Sequence[float], ys: Sequence[float]) -> List[Tuple[float, float, float, float]]:
    """Greedy maximal-rectangle merge of grid cells (row runs, then identical runs stacked)."""
    rows: Dict[int, List[int]] = {}
    for (i, j) in cells:
        rows.setdefault(j, []).append(i)
    runs: Dict[int, List[Tuple[int, int]]] = {}
    for j in sorted(rows):
        ilist = sorted(rows[j])
        start = prev = ilist[0]
        out: List[Tuple[int, int]] = []
        for i in ilist[1:]:
            if i == prev + 1:
                prev = i
            else:
                out.append((start, prev))
                start = prev = i
        out.append((start, prev))
        runs[j] = out
    rects: List[List[int]] = []  # [j0, j1, i0, i1]
    open_prev: Dict[Tuple[int, int], int] = {}
    for j in sorted(runs):
        open_now: Dict[Tuple[int, int], int] = {}
        for (i0, i1) in runs[j]:
            key = (i0, i1)
            idx = open_prev.get(key)
            if idx is not None and rects[idx][1] == j - 1:
                rects[idx][1] = j
                open_now[key] = idx
            else:
                rects.append([j, j, i0, i1])
                open_now[key] = len(rects) - 1
        open_prev = open_now
    out_rects = [(xs[i0], xs[i1 + 1], ys[j0], ys[j1 + 1]) for (j0, j1, i0, i1) in rects]
    out_rects.sort(key=lambda r: (r[2], r[0], r[3], r[1]))
    return out_rects


def _build_walls(rooms: Dict[str, _Room], footprints: List[_Footprint], metrics: Dict[str, Any],
                 style: Dict[str, Any], folder_walls: str, folder_openings: str) -> List[Box]:
    arch = metrics["architecture"]
    t = float(arch["wall_thickness_cm"])
    floor_slab = float(arch["floor_slab_thickness_cm"])
    ceil_slab = float(arch["ceiling_slab_thickness_cm"])
    room_list = sorted(rooms.values(), key=lambda r: r.id)

    xs_set = set()
    ys_set = set()
    for r in room_list:
        xs_set.update([r.x - t, r.x, r.x + r.w, r.x + r.w + t])
        ys_set.update([r.y - t, r.y, r.y + r.h, r.y + r.h + t])
    for f in footprints:
        xs_set.update([f.x0, f.x1])
        ys_set.update([f.y0, f.y1])
    xs = sorted(xs_set)
    ys = sorted(ys_set)

    # key -> set of cells. Wall key: (0, owner, side, z0, z1, tint). Opening key: (1, opening_id, kind, z0, z1, tint)
    groups: Dict[Tuple[Any, ...], set] = {}
    for j in range(len(ys) - 1):
        cy = (ys[j] + ys[j + 1]) / 2.0
        for i in range(len(xs) - 1):
            cx = (xs[i] + xs[i + 1]) / 2.0
            owners = [r for r in room_list if (r.x - t < cx < r.x + r.w + t) and (r.y - t < cy < r.y + r.h + t)]
            if not owners:
                continue
            if any((r.x < cx < r.x + r.w) and (r.y < cy < r.y + r.h) for r in room_list):
                continue  # inside a room interior -> not solid
            top = max(r.ceiling + ceil_slab for r in owners)
            fps = [f for f in footprints if (f.x0 < cx < f.x1) and (f.y0 < cy < f.y1)]
            if len(fps) > 1:
                raise GeometryError("openings overlap in the wall grid: %s" % ", ".join(sorted(f.opening_id for f in fps)))
            if fps:
                f = fps[0]
                owner = min(owners, key=lambda r: r.id)
                wall_tint = _wall_tint_for(style, owner)
                if f.z_bottom > -floor_slab + EPS:
                    kind = "threshold" if f.z_bottom <= EPS else "sill"
                    tint = _style_tint(style, "threshold") if kind == "threshold" else wall_tint
                    groups.setdefault((1, f.opening_id, kind, -floor_slab, f.z_bottom, tint), set()).add((i, j))
                if f.z_top < top - EPS:
                    groups.setdefault((1, f.opening_id, "header", f.z_top, top, wall_tint), set()).add((i, j))
                if f.infill_tint:
                    groups.setdefault((1, f.opening_id, "infill", f.z_bottom, f.z_top, f.infill_tint), set()).add((i, j))
            else:
                owner = min(owners, key=lambda r: r.id)
                side = _classify_side(owner, cx, cy)
                groups.setdefault((0, owner.id, side, -floor_slab, top, _wall_tint_for(style, owner)), set()).add((i, j))

    boxes: List[Box] = []
    counters: Dict[Tuple[str, str], int] = {}
    for key in sorted(groups, key=lambda k: tuple(str(p) for p in k)):
        rects = _merge_cells(groups[key], xs, ys)
        if key[0] == 0:
            _, owner_id, side, z0, z1, tint = key
            for (x0, x1, y0, y1) in rects:
                n = counters.get((owner_id, side), 0) + 1
                counters[(owner_id, side)] = n
                boxes.append(Box(
                    name="Wall_%s_%s_%02d" % (owner_id, side, n), kind="wall",
                    center_plan=((x0 + x1) / 2.0, (y0 + y1) / 2.0, (z0 + z1) / 2.0),
                    size=(x1 - x0, y1 - y0, z1 - z0), tint_key=tint, collision=True, visible=True,
                    folder=folder_walls, room=owner_id))
        else:
            _, opening_id, kind, z0, z1, tint = key
            prefix = {"threshold": "Threshold", "sill": "Sill", "header": "Header", "infill": "Infill"}[kind]
            for n, (x0, x1, y0, y1) in enumerate(rects, start=1):
                name = "%s_%s" % (prefix, opening_id) if len(rects) == 1 else "%s_%s_%02d" % (prefix, opening_id, n)
                boxes.append(Box(
                    name=name, kind=kind,
                    center_plan=((x0 + x1) / 2.0, (y0 + y1) / 2.0, (z0 + z1) / 2.0),
                    size=(x1 - x0, y1 - y0, z1 - z0), tint_key=tint, collision=True, visible=True,
                    folder=folder_openings, room=""))
    return boxes


# --------------------------------------------------------------------------------------
# Greybox builder
# --------------------------------------------------------------------------------------

F_FLOORS = "Greybox/Structure/Floors"
F_CEILINGS = "Greybox/Structure/Ceilings"
F_WALLS = "Greybox/Structure/Walls"
F_OPENINGS = "Greybox/Openings"
F_DUCT = "Greybox/Duct"
F_BLOCKERS = "Greybox/Blockers"
F_FIGURES = "Greybox/Figures"
F_LABELS = "Greybox/Labels"
F_LIGHTS = "Greybox/Lights"
F_MARKERS = "Greybox/Markers"
F_BOUNDARY = "Greybox/Boundary"
F_PLAYER = "Greybox/PlayerStart"
F_SCENES = "Greybox/Scenes"


def _notes_enabled(style: Dict[str, Any]) -> bool:
    """labels.notes_enabled (default True): False skips every note-style label (Gate 2 notes, scene descriptions)."""
    return bool(style["labels"].get("notes_enabled", True))


def _wrap_note(text: str, style: Dict[str, Any]) -> str:
    """Deterministic word wrap at labels.note.wrap_chars (TextRenderComponent cannot wrap)."""
    wrap_chars = int(style["labels"]["note"].get("wrap_chars", 0))
    if wrap_chars > 0 and text:
        return "\n".join(textwrap.wrap(text, width=wrap_chars))
    return text


def _figure_boxes(name_base: str, x: float, y: float, metrics: Dict[str, Any], style: Dict[str, Any],
                  folder: str, room: str) -> List[Box]:
    arch = metrics["architecture"]
    total_h = float(arch["reference_figure_height_cm"])
    w = float(arch["reference_figure_width_cm"])
    d = float(arch["reference_figure_depth_cm"])
    head = float(style["reference_figure"]["head_cm"])
    body_h = total_h - head
    if body_h <= 0:
        raise GeometryError("reference figure head (%s) taller than the figure (%s)" % (head, total_h))
    coll = bool(style["reference_figure"]["collision"])
    return [
        Box(name="Figure_%s_body" % name_base, kind="figure", center_plan=(x, y, body_h / 2.0), size=(w, d, body_h),
            tint_key=_style_tint(style, "figure"), collision=coll, visible=True, folder=folder, room=room),
        Box(name="Figure_%s_head" % name_base, kind="figure_head", center_plan=(x, y, body_h + head / 2.0),
            size=(head, head, head), tint_key=_style_tint(style, "figure_head"), collision=coll, visible=True,
            folder=folder, room=room),
    ]


def _light_intensity(spec: Dict[str, Any], where: str) -> float:
    """Unitless fill intensity from a style spec; the retired candela key is refused so there is one source of truth."""
    if "intensity_cd" in spec:
        raise GeometryError("greybox_style.json %s: intensity_cd (candela) was retired 2026-09-06 - use intensity_unitless" % where)
    if "intensity_unitless" not in spec:
        raise GeometryError("greybox_style.json %s needs intensity_unitless (point lights are unitless fill lights)" % where)
    return float(spec["intensity_unitless"])


def _point_light(name: str, pos: Tuple[float, float, float], spec: Dict[str, Any], where: str, style: Dict[str, Any],
                 attenuation_radius_cm: float, folder: str, room: str = "") -> Light:
    """The ONE code path for every point light (rooms, ducts, feel-gym rooms / corridors / tunnels): even fill
    light - inverse-square OFF, unitless intensity, falloff exponent from the spec or lights.falloff_exponent,
    shadows and mobility from lights.* (see the Light docstring for why)."""
    ls = style["lights"]
    return Light(
        name=name, pos_plan=pos, intensity=_light_intensity(spec, where), temperature_k=float(spec["temperature_k"]),
        attenuation_radius_cm=float(attenuation_radius_cm), folder=folder, light_type="point",
        cast_shadows=bool(ls["cast_shadows"]), mobility=str(ls["mobility"]), room=room,
        intensity_units="unitless", inverse_squared=False,
        falloff_exponent=float(spec.get("falloff_exponent", ls["falloff_exponent"])),
    )


def _room_lights(room: _Room, style: Dict[str, Any], folder: str) -> List[Light]:
    """Even fill lights for one room, hung drop_below_ceiling_cm under the ceiling (60: further from the slab shrinks
    the ceiling hot spot).

    Packaged-run finding 2026-09-06 (gate-1 sweep): ONE light per room with radius = 1.25 x room diagonal floods
    the whole floor once rooms get long - a 44.8 m corridor got a 56 m radius fill light and every frame blew out
    to white. So: the radius is clamped to lights.max_attenuation_radius_cm, and a room longer than
    lights.light_spacing_cm along either axis gets a grid of lights at most that far apart (n = ceil(axis / spacing)
    per axis, evenly spread), each covering its own cell with a little overlap. Names: Light_<room> for a single
    light, Light_<room>_NN otherwise (row-major), so the manifest stays stable and readable.
    """
    ls = style["lights"]
    spec = dict(ls["default"])
    spec.update(ls.get("by_role", {}).get(room.role, {}))
    spacing = float(ls["light_spacing_cm"])
    nx = max(1, int(math.ceil(room.w / spacing)))
    ny = max(1, int(math.ceil(room.h / spacing)))
    cell_w, cell_h = room.w / nx, room.h / ny
    # Radius: cover the cell diagonal with margin, but never below the minimum nor above the cap.
    radius = float(ls["attenuation_diagonal_factor"]) * math.hypot(cell_w, cell_h)
    radius = max(float(ls["min_attenuation_radius_cm"]), min(float(ls["max_attenuation_radius_cm"]), radius))
    z = room.ceiling - float(ls["drop_below_ceiling_cm"])
    out: List[Light] = []
    for j in range(ny):
        for i in range(nx):
            cx = room.x + cell_w * (i + 0.5)
            cy = room.y + cell_h * (j + 0.5)
            name = "Light_%s" % room.id if nx * ny == 1 else "Light_%s_%02d" % (room.id, j * nx + i + 1)
            out.append(_point_light(name, (r3(cx), r3(cy), z), spec, "lights.default/by_role.%s" % room.role, style,
                                    radius, folder, room.id))
    return out


def _room_light(room: _Room, style: Dict[str, Any], folder: str) -> Light:
    """Backward-compatible single light (the first of _room_lights); kept for callers that expect one Light."""
    return _room_lights(room, style, folder)[0]


def _room_viewer_points(fp: Dict[str, Any], rooms: Dict[str, _Room], footprints: List[_Footprint],
                        warnings: List[str]) -> Dict[str, Tuple[Optional[Tuple[float, float]], str]]:
    """Per room: the plan point its labels face (= where the player reads them from) and the rule that chose it.

    Rule order:  (a) the player_start position, for the room holding the player_start marker;
                 (b) the centre of the opening (door / open / duct mouth) to the PREVIOUS room on critical_path;
                 (c) the centre of any door / open to a critical-path room, corridor rooms (corridor_*) first;
                 (d) the duct mouth on this room's own wall;
                 (c') the centre of any door / open to any neighbouring room (corridor_*, then transit rooms first);
                 (e) none -> (None, fallback): the labels face -plan.y (yaw 270).
    Ties break on (mouth on this room's wall first, opening id) so the result is deterministic.
    """
    critical = [rid for rid in fp.get("critical_path", []) if rid in rooms]
    crit_set = set(critical)
    previous = {critical[i]: critical[i - 1] for i in range(1, len(critical))}
    start_room: Optional[str] = None
    start_pos: Optional[Tuple[float, float]] = None
    for m in fp.get("markers", []):
        if m.get("kind") == "player_start":
            start_room = m.get("room")
            start_pos = (float(m["pos"]["x"]), float(m["pos"]["y"]))

    def connections(rid: str, kinds: Tuple[str, ...], other: Optional[str] = None) -> List[Tuple[_Footprint, str]]:
        out: List[Tuple[_Footprint, str]] = []
        for f in footprints:
            if f.kind not in kinds:
                continue
            if f.room_a == rid:
                o = f.room_b
            elif f.room_b == rid:
                o = f.room_a
            else:
                continue
            if other is not None and o != other:
                continue
            out.append((f, o))
        out.sort(key=lambda c: (0 if c[0].room_a == rid else 1, c[0].opening_id))
        return out

    result: Dict[str, Tuple[Optional[Tuple[float, float]], str]] = {}
    for rid in sorted(rooms):
        if rid == start_room and start_pos is not None:
            result[rid] = (start_pos, "player_start")
            continue
        if rid in previous:
            cands = connections(rid, ("door", "open", "duct_mouth"), previous[rid])
            if cands:
                f = cands[0][0]
                result[rid] = ((f.cx, f.cy), "critical_path:%s" % f.opening_id)
                continue
        cands = [c for c in connections(rid, ("door", "open")) if c[1] in crit_set]
        if cands:
            cands.sort(key=lambda c: (0 if c[1].startswith("corridor_") else 1, 0 if c[0].room_a == rid else 1, c[0].opening_id))
            f = cands[0][0]
            result[rid] = ((f.cx, f.cy), "opening:%s" % f.opening_id)
            continue
        cands = [c for c in connections(rid, ("duct_mouth",)) if c[0].room_a == rid]
        if cands:
            f = cands[0][0]
            result[rid] = ((f.cx, f.cy), "duct_mouth:%s" % f.opening_id)
            continue
        # (c') gate-1 floors hang rooms off spurs that are not on the critical path: face the door / open to ANY
        # neighbouring room, corridor_* and transit rooms first, so the label still reads from the way in.
        cands = connections(rid, ("door", "open"))
        if cands:
            cands.sort(key=lambda c: (0 if c[1].startswith("corridor_") else (1 if c[1] in rooms and rooms[c[1]].role == "transit" else 2),
                                      0 if c[0].room_a == rid else 1, c[0].opening_id))
            f = cands[0][0]
            result[rid] = ((f.cx, f.cy), "neighbour:%s" % f.opening_id)
            continue
        result[rid] = (None, "fallback:-plan.y")
        if rooms[rid].enterable:
            warnings.append("room %r has no entry opening on record; its labels face -plan.y (yaw 270)" % rid)
    return result


def _far_side_of_room(room: _Room, fp: Dict[str, Any], warnings: List[str]) -> str:
    """Side of `room` opposite its (first) connecting opening; default north with a warning."""
    for o in fp.get("openings", []):
        if o.get("type") == "duct_mouth":
            continue
        between = list(o.get("between", []))
        if len(between) >= 1 and between[0] == room.id:
            return OPPOSITE[o["wall"]]
        if len(between) >= 2 and between[1] == room.id:
            # The opening sits on the OTHER room's wall `o["wall"]`; seen from this room it is on the
            # opposite side, so the far side is the same side name as stated.
            return o["wall"]
    warnings.append("blocker room %r has no connecting opening; collapse placed at the north end" % room.id)
    return "north"


def _rect_box(name: str, kind: str, x0: float, x1: float, y0: float, y1: float, z0: float, z1: float,
              tint: str, collision: bool, visible: bool, folder: str, room: str = "") -> Box:
    if x1 <= x0 or y1 <= y0 or z1 <= z0:
        raise GeometryError("degenerate box %r: x[%s,%s] y[%s,%s] z[%s,%s]" % (name, x0, x1, y0, y1, z0, z1))
    return Box(name=name, kind=kind, center_plan=((x0 + x1) / 2.0, (y0 + y1) / 2.0, (z0 + z1) / 2.0),
               size=(x1 - x0, y1 - y0, z1 - z0), tint_key=tint, collision=collision, visible=visible,
               folder=folder, room=room)


def build_greybox(inputs: Dict[str, Any]) -> Tuple[List[Actor], Dict[str, Any]]:
    """Return (actors sorted by (folder, name), meta)."""
    fp = inputs["floorplan"]
    metrics = inputs["metrics"]
    style = inputs["style"]
    movement = inputs["movement"]
    arch = metrics["architecture"]
    t = float(arch["wall_thickness_cm"])
    floor_slab = float(arch["floor_slab_thickness_cm"])
    ceil_slab = float(arch["ceiling_slab_thickness_cm"])
    warnings: List[str] = []
    rooms = _rooms_from_plan(fp)
    actors: List[Actor] = []

    # ---- floors, ceilings, labels, lights, figures -------------------------------------
    figures_by_room: Dict[str, int] = {}
    for rid in sorted(rooms):
        r = rooms[rid]
        floor_tint = _style_tint(style, "floor_%s" % r.floor_finish)
        actors.append(_rect_box("Floor_%s" % rid, "floor", r.x, r.x + r.w, r.y, r.y + r.h, -floor_slab, 0.0,
                                floor_tint, True, True, F_FLOORS, rid))
        actors.append(_rect_box("Ceiling_%s" % rid, "ceiling", r.x, r.x + r.w, r.y, r.y + r.h, r.ceiling,
                                r.ceiling + ceil_slab, _style_tint(style, "ceiling"), True, True, F_CEILINGS, rid))
        actors.extend(_room_lights(r, style, F_LIGHTS))
        # Room labels are emitted after the openings and ducts exist: each one faces the room's entry point.

    # ---- openings -> footprints ---------------------------------------------------------
    footprints: List[_Footprint] = []
    sill = float(arch["window_sill_height_cm"])
    head = float(arch["window_head_height_cm"])
    opening_by_id: Dict[str, Dict[str, Any]] = {}
    for o in fp.get("openings", []):
        oid = o["id"]
        if oid in opening_by_id:
            raise GeometryError("duplicate opening id %r" % oid)
        opening_by_id[oid] = o
        otype = o["type"]
        if otype == "duct_mouth":
            raise GeometryError("opening %r: duct_mouth openings are generated from ducts; do not author them" % oid)
        between = list(o["between"])
        room_a = rooms.get(between[0])
        if room_a is None:
            raise GeometryError("opening %r: unknown room %r" % (oid, between[0]))
        room_b_id = between[1] if len(between) > 1 and between[1] else "exterior"
        if otype != "window" and room_b_id not in rooms:
            raise GeometryError("opening %r: unknown room %r" % (oid, room_b_id))
        side = o["wall"]
        if side not in SIDES:
            raise GeometryError("opening %r: bad wall %r" % (oid, side))
        width = float(o["width_cm"])
        height = float(o["height_cm"])
        x0, x1, y0, y1 = _wall_footprint(room_a, side, float(o["center_along_wall_cm"]), width, t)
        if otype == "window":
            z_bottom, z_top = sill, head
            if abs((head - sill) - height) > EPS:
                warnings.append("window %r height_cm %s differs from metrics head-sill %s; metrics used" % (oid, height, head - sill))
            infill = ""
        elif otype in ("door", "open", "locked_door"):
            z_bottom = 0.0
            z_top = height
            if otype == "open":
                other = rooms[room_b_id]
                cap = min(room_a.ceiling, other.ceiling)
                if z_top > cap + EPS:
                    warnings.append("open %r height %s clamped to ceiling %s" % (oid, z_top, cap))
                    z_top = cap
            infill = _style_tint(style, "locked_door") if otype == "locked_door" else ""
        else:
            raise GeometryError("opening %r: unknown type %r" % (oid, otype))
        footprints.append(_Footprint(opening_id=oid, kind=otype, x0=x0, x1=x1, y0=y0, y1=y1,
                                     z_bottom=z_bottom, z_top=z_top, infill_tint=infill,
                                     room_a=room_a.id, room_b=room_b_id, side_a=side))
        # LOCKED label(s): one on every side the player can actually stand on.  A sealed room's interior
        # exists "for depth only" (Docs/FLOORPLAN-SCHEMA.md), so a label inside it would never be read -
        # the women's restroom lock must be read from corridor_main, not from behind the infill slab.
        if otype == "locked_door":
            nx, ny = _side_normal(side)          # outward normal of room_a's wall = toward room_b
            off = float(style["labels"]["wall_offset_cm"])
            fx, fy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
            room_b = rooms[room_b_id]
            sides: List[Tuple[float, str]] = []   # (sign along the normal, room the label stands in)
            if room_a.enterable:
                sides.append((-1.0, room_a.id))
            if room_b.enterable:
                sides.append((1.0, room_b.id))
            if not sides:
                sides.append((-1.0, room_a.id))   # neither side enterable: keep the legacy placement
            for k, (sgn, label_room) in enumerate(sides):
                name = "Label_locked_%s" % oid if k == 0 else "Label_locked_%s_%s" % (oid, label_room)
                # Readable face points away from the door into the room the label stands in (= the offset direction).
                actors.append(_make_label(name, fx + sgn * nx * (t / 2.0 + off), fy + sgn * ny * (t / 2.0 + off),
                                          "LOCKED", "element", style, metrics, F_LABELS, label_room,
                                          yaw_plan_deg=label_yaw_facing((0.0, 0.0), (sgn * nx, sgn * ny)),
                                          facing="wall_normal:into_%s" % label_room))

    # ---- elevator doors (blocker) -> infill footprint -----------------------------------
    for b in fp.get("blockers", []):
        if b["kind"] != "elevator_doors":
            continue
        room = rooms.get(b["room"])
        if room is None:
            raise GeometryError("blocker %r: unknown room %r" % (b["id"], b["room"]))
        side = b["wall"]
        if side not in SIDES:
            raise GeometryError("blocker %r: bad wall %r" % (b["id"], side))
        center = b.get("center_along_wall_cm")
        if center is None:
            center = room.cx if side in ("north", "south") else room.cy
        x0, x1, y0, y1 = _wall_footprint(room, side, float(center), float(b["width_cm"]), t)
        footprints.append(_Footprint(opening_id=b["id"], kind="elevator_doors", x0=x0, x1=x1, y0=y0, y1=y1,
                                     z_bottom=0.0, z_top=float(b["height_cm"]), infill_tint=_style_tint(style, "elevator"),
                                     room_a=room.id, room_b="exterior", side_a=side))
        nx, ny = _side_normal(side)
        off = float(style["labels"]["wall_offset_cm"])
        # Offset -n puts the label inside the room; the readable face points the same way (inward normal).
        actors.append(_make_label("Label_elevator_%s" % b["id"], (x0 + x1) / 2.0 - nx * (t / 2.0 + off),
                                  (y0 + y1) / 2.0 - ny * (t / 2.0 + off), "ELEVATOR - SHUT", "element", style,
                                  metrics, F_LABELS, room.id, yaw_plan_deg=label_yaw_facing((0.0, 0.0), (-nx, -ny)),
                                  facing="wall_normal:into_%s" % room.id))

    # ---- money-shot window: synthesize when the digitizer only declared money_shot.window_wall ---------
    # Docs/FLOORPLAN-SCHEMA.md models the window as an Opening of type "window", but a plan that only says
    # money_shot.window_wall is unambiguous (the spec demands a full-width window wall), so we build it:
    # full wall length, sill/head from metrics, exterior on the far side.
    ms_pre = fp.get("money_shot") or {}
    if ms_pre and ms_pre.get("room") in rooms and ms_pre.get("window_wall") in SIDES:
        wroom = rooms[ms_pre["room"]]
        wside = ms_pre["window_wall"]
        if not any(f.kind == "window" and f.room_a == wroom.id and f.side_a == wside for f in footprints):
            if wside in ("north", "south"):
                center, length = wroom.cx, wroom.w
            else:
                center, length = wroom.cy, wroom.h
            x0, x1, y0, y1 = _wall_footprint(wroom, wside, center, length, t)
            oid = "window_%s_%s_auto" % (wroom.id, wside)
            footprints.append(_Footprint(opening_id=oid, kind="window", x0=x0, x1=x1, y0=y0, y1=y1,
                                         z_bottom=sill, z_top=head, infill_tint="", room_a=wroom.id,
                                         room_b="exterior", side_a=wside))
            opening_by_id[oid] = {"id": oid, "type": "window", "between": [wroom.id, "exterior"], "wall": wside,
                                  "center_along_wall_cm": center, "width_cm": length, "height_cm": head - sill}
            warnings.append("no 'window' opening on %s's %s wall; synthesized a full-width window (%s) from money_shot.window_wall" % (wroom.id, wside, oid))

    # ---- ducts: tube, lips, mouths, light, labels ----------------------------------------
    duct_wall = float(arch["duct_wall_thickness_cm"])
    duct_meta: List[Dict[str, Any]] = []
    for d in fp.get("ducts", []):
        did = d["id"]
        a = rooms.get(d["from"])
        b = rooms.get(d["to"])
        if a is None or b is None:
            raise GeometryError("duct %r: unknown room" % did)
        axis = d["axis"]
        iw = float(d["interior_width_cm"])
        ih = float(d["interior_height_cm"])
        z0 = float(d.get("floor_offset_cm", 0.0))
        start = d["start"]
        if axis == "y":
            lateral = float(start["x"])
            if b.y >= a.y + a.h:
                a_side, b_side = "south", "north"
                a_in, b_in = a.y + a.h, b.y
                a_out, b_out = a_in + t, b_in - t
            else:
                a_side, b_side = "north", "south"
                a_in, b_in = a.y, b.y + b.h
                a_out, b_out = a_in - t, b_in + t
        elif axis == "x":
            lateral = float(start["y"])
            if b.x >= a.x + a.w:
                a_side, b_side = "east", "west"
                a_in, b_in = a.x + a.w, b.x
                a_out, b_out = a_in + t, b_in - t
            else:
                a_side, b_side = "west", "east"
                a_in, b_in = a.x, b.x + b.w
                a_out, b_out = a_in - t, b_in + t
        else:
            raise GeometryError("duct %r: axis must be 'x' or 'y'" % did)
        lo, hi = sorted([a_out, b_out])
        if hi - lo <= EPS:
            raise GeometryError("duct %r: rooms %r and %r are too close for a duct tube" % (did, a.id, b.id))
        interior_len = abs(b_in - a_in)
        if abs(interior_len - float(d["length_cm"])) > t + EPS:
            warnings.append("duct %r length_cm %s differs from face-to-face distance %s; geometry uses the rooms" % (did, d["length_cm"], interior_len))
        half = iw / 2.0
        tint = _style_tint(style, "duct_metal")

        def lat_box(name: str, kind: str, l0: float, l1: float, a0: float, a1: float, zz0: float, zz1: float) -> Box:
            # l = lateral extents, a = along-axis extents
            if axis == "y":
                return _rect_box(name, kind, l0, l1, a0, a1, zz0, zz1, tint, True, True, F_DUCT, "")
            return _rect_box(name, kind, a0, a1, l0, l1, zz0, zz1, tint, True, True, F_DUCT, "")

        actors.append(lat_box("Duct_%s_floor" % did, "duct_floor", lateral - half - duct_wall, lateral + half + duct_wall, lo, hi, z0 - duct_wall, z0))
        actors.append(lat_box("Duct_%s_ceiling" % did, "duct_ceiling", lateral - half - duct_wall, lateral + half + duct_wall, lo, hi, z0 + ih, z0 + ih + duct_wall))
        actors.append(lat_box("Duct_%s_side_neg" % did, "duct_side", lateral - half - duct_wall, lateral - half, lo, hi, z0, z0 + ih))
        actors.append(lat_box("Duct_%s_side_pos" % did, "duct_side", lateral + half, lateral + half + duct_wall, lo, hi, z0, z0 + ih))

        # Lips: 6 cm (duct_wall) floor bump + head bar on the ROOM side of each mouth, flush to the wall face.
        for room, face_in, side, tag in ((a, a_in, a_side, "from"), (b, b_in, b_side, "to")):
            n = _side_normal(side)
            n_along = n[1] if axis == "y" else n[0]     # +1 if the room interior is at smaller coordinate than the wall
            if n_along > 0:
                l_a0, l_a1 = face_in - duct_wall, face_in
            else:
                l_a0, l_a1 = face_in, face_in + duct_wall
            actors.append(lat_box("Duct_%s_lip_%s_floor" % (did, tag), "duct_lip", lateral - half, lateral + half, l_a0, l_a1, z0, z0 + duct_wall))
            actors.append(lat_box("Duct_%s_lip_%s_head" % (did, tag), "duct_lip", lateral - half, lateral + half, l_a0, l_a1, z0 + ih - duct_wall, z0 + ih))
            # mouth footprint in this room's wall (hole = duct interior exactly); `lateral` is the
            # along-wall centre for both N/S (x) and E/W (y) walls because it is the cross-axis coordinate.
            mx0, mx1, my0, my1 = _wall_footprint(room, side, lateral, iw, t)
            footprints.append(_Footprint(opening_id="%s_mouth_%s" % (did, tag), kind="duct_mouth", x0=mx0, x1=mx1, y0=my0, y1=my1,
                                         z_bottom=z0, z_top=z0 + ih, room_a=room.id, room_b=(b.id if room is a else a.id), side_a=side))
            # label above the mouth inside the room
            off = float(style["labels"]["wall_offset_cm"])
            # face_in is already the interior wall face, so offset by `off` only (no t/2 here).
            lx = lateral if axis == "y" else face_in - n[0] * off
            ly = face_in - n[1] * off if axis == "y" else lateral
            # Offset -n puts the label inside the room; the readable face points the same way (inward normal).
            actors.append(_make_label("Label_duct_%s_%s" % (did, tag), lx, ly,
                                      "AIR DUCT %d x %d\ncrawl only" % (int(iw), int(ih)), "element", style, metrics, F_LABELS, room.id,
                                      yaw_plan_deg=label_yaw_facing((0.0, 0.0), (-n[0], -n[1])), facing="wall_normal:into_%s" % room.id))

        dl = style["lights"]["duct"]
        mid = (lo + hi) / 2.0
        lpos = (lateral, mid, z0 + ih - float(dl["drop_below_ceiling_cm"])) if axis == "y" else (mid, lateral, z0 + ih - float(dl["drop_below_ceiling_cm"]))
        actors.append(_point_light("Light_duct_%s" % did, lpos, dl, "lights.duct", style, float(dl["attenuation_radius_cm"]), F_LIGHTS))
        duct_meta.append({"id": did, "from": a.id, "to": b.id, "axis": axis, "tube_from": r3(lo), "tube_to": r3(hi),
                          "interior": [r3(iw), r3(ih)], "interior_length_cm": r3(interior_len)})

    # ---- room labels: every label in a room faces the point the player enters it from ---------------
    viewer_points = _room_viewer_points(fp, rooms, footprints, warnings)

    def room_facing(rid: str, x: float, y: float) -> Dict[str, Any]:
        """_make_label kwargs (yaw + provenance) for a label standing at (x, y) inside room rid."""
        vp, why = viewer_points[rid]
        if vp is None:
            return {"yaw_plan_deg": 270.0, "viewer_plan": None, "facing": why}
        return {"yaw_plan_deg": label_yaw_facing((x, y), vp), "viewer_plan": vp, "facing": why}

    for rid in sorted(rooms):
        r = rooms[rid]
        text = "%s\n%d x %d cm, ceiling %d" % (r.label, int(round(r.w)), int(round(r.h)), int(round(r.ceiling)))
        # The room light hangs at ceiling - drop_below_ceiling_cm on the same (cx, cy); keep the label one
        # text height below it so the two never coincide (light drop 60: 310 rooms -> label 210, 280 restrooms -> 180).
        # Same clamp the feel gym uses for its inside ceiling labels.
        room_ls = _label_style(style, "room", metrics)
        label_z = min(float(room_ls["height_cm"]),
                      r.ceiling - float(style["lights"]["drop_below_ceiling_cm"]) - float(room_ls["size_cm"]))
        actors.append(_make_label("Label_room_%s" % rid, r.cx, r.cy, text, "room", style, metrics, F_LABELS, rid,
                                  z_override=label_z, **room_facing(rid, r.cx, r.cy)))

    # ---- windows: glass panes + mullions -----------------------------------------------
    win = style["window"]
    spacing = float(win["mullion_spacing_cm"])
    mw = float(win["mullion_width_cm"])
    for f in footprints:
        if f.kind != "window":
            continue
        if f.along_axis == "x":
            a0, a1 = f.x0, f.x1
        else:
            a0, a1 = f.y0, f.y1
        length = a1 - a0
        mullions = []
        k = 1
        while a0 + k * spacing + mw / 2.0 < a1 - EPS:
            mullions.append(a0 + k * spacing)
            k += 1
        edges = [a0]
        for m in mullions:
            edges.extend([m - mw / 2.0, m + mw / 2.0])
        edges.append(a1)
        panes = [(edges[i], edges[i + 1]) for i in range(0, len(edges) - 1, 2)]
        for n, (p0, p1) in enumerate(panes, start=1):
            if f.along_axis == "x":
                actors.append(_rect_box("Glass_%s_%02d" % (f.opening_id, n), "glass", p0, p1, f.y0, f.y1, f.z_bottom, f.z_top,
                                        _style_tint(style, "glass"), True, True, F_OPENINGS, f.room_a))
            else:
                actors.append(_rect_box("Glass_%s_%02d" % (f.opening_id, n), "glass", f.x0, f.x1, p0, p1, f.z_bottom, f.z_top,
                                        _style_tint(style, "glass"), True, True, F_OPENINGS, f.room_a))
        for n, m in enumerate(mullions, start=1):
            if f.along_axis == "x":
                actors.append(_rect_box("Mullion_%s_%02d" % (f.opening_id, n), "mullion", m - mw / 2.0, m + mw / 2.0, f.y0, f.y1,
                                        f.z_bottom, f.z_top, _style_tint(style, "mullion"), True, True, F_OPENINGS, f.room_a))
            else:
                actors.append(_rect_box("Mullion_%s_%02d" % (f.opening_id, n), "mullion", f.x0, f.x1, m - mw / 2.0, m + mw / 2.0,
                                        f.z_bottom, f.z_top, _style_tint(style, "mullion"), True, True, F_OPENINGS, f.room_a))
        nx, ny = _side_normal(f.side_a)
        off = float(style["labels"]["wall_offset_cm"])
        # Offset -n puts the label inside the room; the readable face points the same way (inward normal).
        actors.append(_make_label("Label_window_%s" % f.opening_id, f.cx - nx * (t / 2.0 + off), f.cy - ny * (t / 2.0 + off),
                                  "WINDOW WALL %d cm\n(money shot, impassable)" % int(round(length)), "element", style, metrics,
                                  F_LABELS, f.room_a, yaw_plan_deg=label_yaw_facing((0.0, 0.0), (-nx, -ny)),
                                  facing="wall_normal:into_%s" % f.room_a))

    # ---- walls from the grid -------------------------------------------------------------
    actors.extend(_build_walls(rooms, footprints, metrics, style, F_WALLS, F_OPENINGS))

    # ---- collapse blockers ----------------------------------------------------------------
    col = style["collapse"]
    tiers = int(col["tiers"])
    fractions = [float(v) for v in col["depth_fractions"]]
    if len(fractions) != tiers:
        raise GeometryError("greybox_style.collapse.depth_fractions must have %d entries" % tiers)
    for b in fp.get("blockers", []):
        if b["kind"] != "collapse":
            continue
        room = rooms.get(b["room"])
        if room is None:
            raise GeometryError("blocker %r: unknown room %r" % (b["id"], b["room"]))
        depth = float(b["depth_cm"])
        far = _far_side_of_room(room, fp, warnings)
        tier_h = room.ceiling / tiers
        for k in range(tiers):
            dk = depth * fractions[k]
            zz0, zz1 = k * tier_h, (k + 1) * tier_h
            if far == "north":
                x0, x1, y0, y1 = room.x, room.x + room.w, room.y, room.y + dk
            elif far == "south":
                x0, x1, y0, y1 = room.x, room.x + room.w, room.y + room.h - dk, room.y + room.h
            elif far == "west":
                x0, x1, y0, y1 = room.x, room.x + dk, room.y, room.y + room.h
            else:
                x0, x1, y0, y1 = room.x + room.w - dk, room.x + room.w, room.y, room.y + room.h
            actors.append(_rect_box("Collapse_%s_%02d" % (b["id"], k + 1), "collapse", x0, x1, y0, y1, zz0, zz1,
                                    _style_tint(style, "collapse"), True, True, F_BLOCKERS, room.id))
        nx, ny = _side_normal(far)
        loff = float(col["label_offset_cm"])
        if far in ("north", "south"):
            lx, ly = room.cx, (room.y + depth + loff) if far == "north" else (room.y + room.h - depth - loff)
        else:
            lx, ly = (room.x + depth + loff) if far == "west" else (room.x + room.w - depth - loff), room.cy
        # The player stands on the walkable side, i.e. away from the far wall: readable face points along -n(far).
        actors.append(_make_label("Label_collapse_%s" % b["id"], lx, ly, "COLLAPSED\nimpassable", "element", style, metrics,
                                  F_LABELS, room.id, yaw_plan_deg=label_yaw_facing((0.0, 0.0), (-nx, -ny)),
                                  facing="wall_normal:away_from_%s_wall" % far))

    # ---- money shot: dividing wall + dwell marker ------------------------------------------
    ms = fp.get("money_shot") or {}
    money_meta: Dict[str, Any] = {}
    if ms:
        room = rooms.get(ms.get("room", ""))
        if room is None:
            raise GeometryError("money_shot.room %r unknown" % ms.get("room"))
        dv = ms.get("dividing_wall")
        if dv:
            hgt = float(dv.get("height_cm", room.ceiling))
            if dv.get("along") == "x":
                actors.append(_rect_box("Divider_%s" % room.id, "divider", float(dv["from_x"]), float(dv["to_x"]),
                                        float(dv["at_y"]) - t / 2.0, float(dv["at_y"]) + t / 2.0, 0.0, hgt,
                                        _style_tint(style, "divider"), True, True, F_WALLS, room.id))
            elif dv.get("along") == "y":
                actors.append(_rect_box("Divider_%s" % room.id, "divider", float(dv["at_x"]) - t / 2.0, float(dv["at_x"]) + t / 2.0,
                                        float(dv["from_y"]), float(dv["to_y"]), 0.0, hgt,
                                        _style_tint(style, "divider"), True, True, F_WALLS, room.id))
            else:
                raise GeometryError("money_shot.dividing_wall.along must be 'x' or 'y'")
        dr = ms.get("dwell_rect")
        if dr:
            dm = style["dwell_marker"]
            lift = float(dm["lift_cm"])
            actors.append(_rect_box("Marker_dwell", "marker", float(dr["x"]), float(dr["x"]) + float(dr["w"]), float(dr["y"]),
                                    float(dr["y"]) + float(dr["h"]), lift, lift + float(dm["height_cm"]),
                                    _style_tint(style, "dwell"), False, True, F_MARKERS, room.id))
            dcx, dcy = float(dr["x"]) + float(dr["w"]) / 2.0, float(dr["y"]) + float(dr["h"]) / 2.0
            actors.append(_make_label("Label_marker_dwell", dcx, dcy, "DWELL ZONE (5 s)", "marker", style, metrics,
                                      F_LABELS, room.id, **room_facing(room.id, dcx, dcy)))
        entry = opening_by_id.get(ms.get("entry_opening_id", ""))
        win_fp = [f for f in footprints if f.kind == "window" and f.room_a == room.id and f.side_a == ms.get("window_wall")]
        if entry is not None and win_fp:
            efp = [f for f in footprints if f.opening_id == entry["id"]][0]
            wf = win_fp[0]
            eye_z = float(movement["player"]["eye_height_stand_cm"])
            if wf.along_axis == "x":
                wall_desc = {"axis": "x", "from": r3(wf.x0), "to": r3(wf.x1),
                             "at": r3(wf.y0 if wf.side_a == "south" else wf.y1)}
            else:
                wall_desc = {"axis": "y", "from": r3(wf.y0), "to": r3(wf.y1),
                             "at": r3(wf.x0 if wf.side_a == "east" else wf.x1)}
            look = {"north": (0.0, -1.0), "south": (0.0, 1.0), "west": (-1.0, 0.0), "east": (1.0, 0.0)}[ms["window_wall"]]
            money_meta = {
                "room": room.id,
                "entry_opening_id": entry["id"],
                "eye_plan": [r3(efp.cx), r3(efp.cy), r3(eye_z)],
                "look_dir_plan": [look[0], look[1]],
                "window_wall_plan": wall_desc,
                "fov_horizontal_deg": float(movement["player"]["fov_horizontal_deg"]),
            }

    # ---- markers: player start, figures, notes ------------------------------------------------
    stand_h = float(movement["player"]["stand_height_cm"])
    spawn_z = stand_h / 2.0 + float(style["player_start"]["spawn_clearance_cm"])
    player_starts = 0
    for m in fp.get("markers", []):
        kind = m["kind"]
        room = rooms.get(m.get("room", ""))
        if room is None:
            raise GeometryError("marker %r: unknown room %r" % (m["id"], m.get("room")))
        px, py = float(m["pos"]["x"]), float(m["pos"]["y"])
        if not room.contains(px, py):
            raise GeometryError("marker %r at (%s,%s) is outside room %r" % (m["id"], px, py, room.id))
        if kind == "player_start":
            player_starts += 1
            actors.append(PlayerStart(name="PlayerStart_%s" % m["id"], pos_plan=(px, py, spawn_z),
                                      yaw_plan_deg=float(m.get("yaw_deg", 90.0)), folder=F_PLAYER, room=room.id))
        elif kind == "reference_figure":
            figures_by_room[room.id] = figures_by_room.get(room.id, 0) + 1
            actors.extend(_figure_boxes(m["id"], px, py, metrics, style, F_FIGURES, room.id))
        elif kind == "note":
            # TextRenderComponent has no word wrap: a 300-character note at 11 cm glyphs would be a 17 m line
            # through the neighbouring rooms.  Wrap deterministically at labels.note.wrap_chars (style).
            # labels.notes_enabled false -> no note labels at all (Rob reviews from screenshots; notes are Gate 2 intent).
            if not _notes_enabled(style):
                continue
            note_text = _wrap_note(str(m.get("text", "")), style)
            actors.append(_make_label("Label_note_%s" % m["id"], px, py, "NOTE: %s" % note_text, "note", style, metrics,
                                      F_LABELS, room.id, **room_facing(room.id, px, py)))
        else:
            raise GeometryError("marker %r: unknown kind %r" % (m["id"], kind))
    if player_starts != 1:
        raise GeometryError("expected exactly one player_start marker, found %d" % player_starts)

    # ---- checkpoints -----------------------------------------------------------------------------
    cpm = style["checkpoint_marker"]
    for c in fp.get("checkpoints", []):
        room = rooms.get(c.get("room", ""))
        if room is None:
            raise GeometryError("checkpoint %r: unknown room %r" % (c["id"], c.get("room")))
        px, py = float(c["pos"]["x"]), float(c["pos"]["y"])
        s = float(cpm["size_cm"])
        actors.append(_rect_box("Marker_checkpoint_%s" % c["id"], "checkpoint", px - s / 2.0, px + s / 2.0, py - s / 2.0, py + s / 2.0,
                                0.0, float(cpm["height_cm"]), _style_tint(style, "checkpoint"), False, True, F_MARKERS, room.id))
        # The checkpoint's yaw_deg is the respawn facing (runtime), not the label's: the label faces the room's entry
        # point like every other label in the room.
        actors.append(_make_label("Label_checkpoint_%s" % c["id"], px, py, "CHECKPOINT\n%s" % c["id"], "marker", style, metrics,
                                  F_LABELS, room.id, **room_facing(room.id, px, py)))

    # ---- encounters (reserved space, translucent, no collision) --------------------------------
    em = style["encounter_marker"]
    lift = float(em["lift_cm"])
    mh = float(em["height_cm"])
    lane_w = float(em["lane_width_cm"])
    for e in fp.get("encounters", []):
        eid = e["id"]
        room = rooms.get(e.get("room", ""))
        if room is None:
            raise GeometryError("encounter %r: unknown room %r" % (eid, e.get("room")))
        tr = e["trigger_rect"]
        actors.append(_rect_box("Marker_encounter_%s_trigger" % eid, "marker", float(tr["x"]), float(tr["x"]) + float(tr["w"]),
                                float(tr["y"]), float(tr["y"]) + float(tr["h"]), lift, lift + mh,
                                _style_tint(style, "encounter_trigger"), False, True, F_MARKERS, room.id))
        tcx, tcy = float(tr["x"]) + float(tr["w"]) / 2.0, float(tr["y"]) + float(tr["h"]) / 2.0
        actors.append(_make_label("Label_encounter_%s_trigger" % eid, tcx, tcy, "TRIGGER %s" % eid, "marker", style, metrics,
                                  F_LABELS, room.id, **room_facing(room.id, tcx, tcy)))
        sp = e["spawn"]
        cr = float(e["capsule_radius_cm"])
        actors.append(_rect_box("Marker_encounter_%s_spawn" % eid, "marker", float(sp["x"]) - cr, float(sp["x"]) + cr,
                                float(sp["y"]) - cr, float(sp["y"]) + cr, lift, lift + mh,
                                _style_tint(style, "encounter_spawn"), False, True, F_MARKERS, room.id))
        actors.append(_make_label("Label_encounter_%s_spawn" % eid, float(sp["x"]), float(sp["y"]),
                                  "%s SPAWN\nr%d h%d" % (eid, int(cr), int(float(e["capsule_height_cm"]))), "marker", style, metrics,
                                  F_LABELS, room.id, **room_facing(room.id, float(sp["x"]), float(sp["y"]))))
        pa = e["player_approach"]
        ax, ay = float(pa["x"]), float(pa["y"])
        rd = e["retreat_dir"]
        if rd not in SIDES:
            raise GeometryError("encounter %r: retreat_dir must be north/south/west/east" % eid)
        nx, ny = _side_normal(rd)
        rl = float(e["retreat_clear_cm"])
        sl = float(e["strafe_clear_each_side_cm"])
        if ny != 0:  # retreat along y
            ry0, ry1 = sorted([ay, ay + ny * rl])
            actors.append(_rect_box("Marker_encounter_%s_retreat" % eid, "marker", ax - lane_w / 2.0, ax + lane_w / 2.0, ry0, ry1,
                                    lift, lift + mh, _style_tint(style, "encounter_lane"), False, True, F_MARKERS, room.id))
            actors.append(_rect_box("Marker_encounter_%s_strafe" % eid, "marker", ax - sl, ax + sl, ay - lane_w / 2.0, ay + lane_w / 2.0,
                                    lift, lift + mh, _style_tint(style, "encounter_lane"), False, True, F_MARKERS, room.id))
        else:
            rx0, rx1 = sorted([ax, ax + nx * rl])
            actors.append(_rect_box("Marker_encounter_%s_retreat" % eid, "marker", rx0, rx1, ay - lane_w / 2.0, ay + lane_w / 2.0,
                                    lift, lift + mh, _style_tint(style, "encounter_lane"), False, True, F_MARKERS, room.id))
            actors.append(_rect_box("Marker_encounter_%s_strafe" % eid, "marker", ax - lane_w / 2.0, ax + lane_w / 2.0, ay - sl, ay + sl,
                                    lift, lift + mh, _style_tint(style, "encounter_lane"), False, True, F_MARKERS, room.id))
        actors.append(_make_label("Label_encounter_%s_approach" % eid, ax, ay,
                                  "%s APPROACH\nretreat %s %d / strafe %d" % (eid, rd, int(rl), int(sl)), "marker", style, metrics,
                                  F_LABELS, room.id, **room_facing(room.id, ax, ay)))

    # ---- scenes: staging slots (review markers only: translucent, no collision) ------------------------
    # Docs/FLOORPLAN-SCHEMA.md "Scene": {id, room, kind, rect, facing_deg, description}.  Per scene a kind-tinted
    # floor marker, a "KIND: id" label at scene_marker.label_height_cm facing the room's entry point, a note-style
    # description (skipped when labels.notes_enabled is false) and, for axis-aligned facings, a tick strip.
    sm = style["scene_marker"]
    s_lift = float(sm["lift_cm"])
    s_h = float(sm["height_cm"])
    scene_meta: List[Dict[str, Any]] = []
    scene_ids: set = set()
    for s in fp.get("scenes", []) or []:
        sid = str(s.get("id", ""))
        if not sid:
            raise GeometryError("scene without id: %r" % (s,))
        if sid in scene_ids:
            raise GeometryError("duplicate scene id %r" % sid)
        scene_ids.add(sid)
        room = rooms.get(s.get("room", ""))
        if room is None:
            raise GeometryError("scene %r: unknown room %r" % (sid, s.get("room")))
        kind = str(s.get("kind", ""))
        tint_key = sm["kinds"].get(kind)
        if tint_key is None:
            raise GeometryError("scene %r: unknown kind %r (style scene_marker.kinds: %s)" % (sid, kind, ", ".join(sorted(sm["kinds"]))))
        rc = s["rect"]
        sx0, sy0 = float(rc["x"]), float(rc["y"])
        sx1, sy1 = sx0 + float(rc["w"]), sy0 + float(rc["h"])
        if not (room.contains(sx0, sy0, EPS) and room.contains(sx1, sy1, EPS)):
            raise GeometryError("scene %r: rect (%s,%s %sx%s) is not inside room %r" % (sid, rc["x"], rc["y"], rc["w"], rc["h"], room.id))
        actors.append(_rect_box("Marker_scene_%s" % sid, "marker", sx0, sx1, sy0, sy1, s_lift, s_lift + s_h,
                                _style_tint(style, tint_key), False, True, F_SCENES, room.id))
        scx, scy = (sx0 + sx1) / 2.0, (sy0 + sy1) / 2.0
        actors.append(_make_label("Label_scene_%s" % sid, scx, scy, "%s: %s" % (kind.upper(), sid), "marker", style, metrics,
                                  F_SCENES, room.id, z_override=float(sm["label_height_cm"]), **room_facing(room.id, scx, scy)))
        desc = str(s.get("description", "") or "")
        if desc and _notes_enabled(style):
            actors.append(_make_label("Label_scene_%s_note" % sid, scx, scy, "SCENE %s: %s" % (sid, _wrap_note(desc, style)),
                                      "note", style, metrics, F_SCENES, room.id, **room_facing(room.id, scx, scy)))
        facing = float(s.get("facing_deg", 90.0)) % 360.0
        tick = None
        if abs(facing - round(facing / 90.0) * 90.0) < EPS:
            # Axis-aligned facing -> a thin strip from the rect centre toward the facing direction, one marker
            # height above the marker so the two never z-fight.  Non-axis facings are recorded in meta only.
            tw = float(sm["tick_width_cm"])
            tl = float(sm["tick_length_fraction"]) * min(sx1 - sx0, sy1 - sy0)
            dx, dy = math.cos(math.radians(facing)), math.sin(math.radians(facing))
            ex, ey = scx + dx * tl, scy + dy * tl
            tx0, tx1 = sorted([scx, ex])
            ty0, ty1 = sorted([scy, ey])
            if abs(dx) < EPS:
                tx0, tx1 = scx - tw / 2.0, scx + tw / 2.0
            else:
                ty0, ty1 = scy - tw / 2.0, scy + tw / 2.0
            actors.append(_rect_box("Marker_scene_%s_facing" % sid, "marker", tx0, tx1, ty0, ty1, s_lift + s_h, s_lift + 2.0 * s_h,
                                    _style_tint(style, tint_key), False, True, F_SCENES, room.id))
            tick = [r3(tx0), r3(ty0), r3(tx1 - tx0), r3(ty1 - ty0)]
        scene_meta.append({"id": sid, "room": room.id, "kind": kind, "rect_plan": [r3(sx0), r3(sy0), r3(sx1 - sx0), r3(sy1 - sy0)],
                           "facing_deg": r3(facing), "tint": tint_key, "facing_tick": tick, "description": desc})

    # ---- Gate 2 blockouts (optional Data/blockout.json) ---------------------------------------------
    blockout_meta: Optional[Dict[str, Any]] = None
    if inputs.get("blockout") is not None:
        bo_actors, blockout_meta = _blockout_actors(fp, rooms, footprints, opening_by_id, style, metrics, movement,
                                                    inputs["blockout"], inputs["paths"].get("blockout", ""),
                                                    room_facing, warnings)
        actors.extend(bo_actors)

    # ---- boundary shell ------------------------------------------------------------------------
    actors.extend(_boundary_boxes(actors, metrics, style, F_BOUNDARY))

    # ---- finish: sort, uniqueness, meta ---------------------------------------------------------
    actors = _finalize(actors)
    bounds = plan_bounds(actors)
    meta = {
        "map_kind": "greybox",
        "plan_bounds": bounds,
        "rooms": [{"id": r.id, "label": r.label, "rect": [r3(r.x), r3(r.y), r3(r.w), r3(r.h)], "ceiling_cm": r3(r.ceiling),
                   "role": r.role, "floor_finish": r.floor_finish} for r in sorted(rooms.values(), key=lambda r: r.id)],
        "openings": [{"id": f.opening_id, "kind": f.kind, "room_a": f.room_a, "room_b": f.room_b, "side_a": f.side_a,
                      "rect_plan": [r3(f.x0), r3(f.y0), r3(f.x1 - f.x0), r3(f.y1 - f.y0)],
                      "z_bottom": r3(f.z_bottom), "z_top": r3(f.z_top)} for f in sorted(footprints, key=lambda f: f.opening_id)],
        "ducts": duct_meta,
        "money_shot": money_meta,
        "scenes": scene_meta,
        "blockout": blockout_meta,
        "notes_enabled": _notes_enabled(style),
        "metrics_version": metrics.get("version"),
        "floorplan_version": fp.get("version"),
        "floorplan_temporary": bool(fp.get("_temporary", False)),
        "warnings": list(warnings),
        "_footprints": footprints,   # stripped before manifest write; used by validate_geometry
        "_rooms": rooms,
    }
    return actors, meta


# --------------------------------------------------------------------------------------
# Gate 2 blockouts (Data/blockout.json; schema in Docs/FLOORPLAN-SCHEMA.md "Blockout data")
# --------------------------------------------------------------------------------------

F_BO_PROPS = "Blockout/Props"
F_BO_CHARS = "Blockout/Characters"
F_BO_PICKUPS = "Blockout/Pickups"
F_BO_DEMONS = "Blockout/Demons"
F_BO_VOLUMES = "Blockout/Volumes"
F_BO_BACKDROP = "Blockout/Backdrop"

BLOCKOUT_POSES = ("seated", "prone", "slumped")
BLOCKOUT_MOUNTS = ("floor", "wall", "ceiling")
DEMON_FOOTPRINT_H = 10.0    # cm: the Demon_<id>_footprint marker slab under each demon cylinder (z 0..10), REQ-G2-003 AC1


def _fp_axes(yaw_deg: float) -> Tuple[float, float, float, float]:
    """Unit axes of a footprint yawed by yaw_deg in plan space: (ux, uy) carries w, (vx, vy) carries d."""
    ux, uy = math.cos(math.radians(yaw_deg)), math.sin(math.radians(yaw_deg))
    return ux, uy, -uy, ux


def _half_along(w: float, d: float, yaw_deg: float, nx: float, ny: float) -> float:
    """Half extent of a w x d footprint yawed by yaw_deg, measured along the unit direction (nx, ny)."""
    ux, uy, vx, vy = _fp_axes(yaw_deg)
    return abs(ux * nx + uy * ny) * w / 2.0 + abs(vx * nx + vy * ny) * d / 2.0


def _wall_face(room: _Room, side: str) -> float:
    """Plan coordinate of a room wall's INTERIOR face (y for north/south, x for west/east); the 20 cm wall
    itself lies beyond it, so a footprint whose face sits here touches the wall box exactly (0 cm overlap)."""
    return {"north": room.y, "south": room.y + room.h, "west": room.x, "east": room.x + room.w}[side]


def _snap_to_wall(room: _Room, side: str, cx: float, cy: float, half_n: float) -> Tuple[float, float]:
    """Move a footprint centre along the wall normal so its near face is flush with the interior wall face."""
    nx, ny = _side_normal(side)
    face = _wall_face(room, side)
    if side in ("north", "south"):
        return cx, face - ny * half_n
    return face - nx * half_n, cy


def _bo_size(item: Dict[str, Any], what: str, default: Optional[Sequence[float]] = None) -> Tuple[float, float, float]:
    sz = item.get("size")
    if sz is None:
        if default is None:
            raise GeometryError("%s: size {w, d, h} is required" % what)
        w, d, h = (float(v) for v in default)
    else:
        try:
            w, d, h = float(sz["w"]), float(sz["d"]), float(sz["h"])
        except (KeyError, TypeError, ValueError):
            raise GeometryError("%s: size must be {w, d, h} in cm (got %r)" % (what, sz))
    if w <= 0 or d <= 0 or h <= 0:
        raise GeometryError("%s: size must be positive (got %s x %s x %s)" % (what, w, d, h))
    return w, d, h


def _bo_pos(item: Dict[str, Any], what: str) -> Tuple[float, float]:
    pos = item.get("pos")
    try:
        return float(pos["x"]), float(pos["y"])
    except (KeyError, TypeError, ValueError):
        raise GeometryError("%s: pos must be {x, y} in plan cm (got %r)" % (what, pos))


def _blockout_actors(fp: Dict[str, Any], rooms: Dict[str, _Room], footprints: List[_Footprint],
                     opening_by_id: Dict[str, Dict[str, Any]], style: Dict[str, Any], metrics: Dict[str, Any],
                     movement: Dict[str, Any], bo: Dict[str, Any], source_rel: str, room_facing: Any,
                     warnings: List[str]) -> Tuple[List[Actor], Dict[str, Any]]:
    """Gate 2 (REQ-G2-002..005): turn Data/blockout.json into labelled boxes, cylinders and volumes.

    * props -> tinted boxes by kind WITH collision; ``mount: wall`` snaps the footprint flush against the named
      wall's interior face (pos is ignored along the wall normal); ``mount: ceiling`` hangs it flush under the
      ceiling; floor items sit at z 0 (a non-zero z_cm is an error: nothing floats).
    * characters -> boxes WITH collision; ``yaw_deg`` is the FACING, w runs across the body, d front-to-back;
      ``contact: wall:<side>`` turns the character to face away from that wall and puts its back flush on it,
      ``contact: prop:<id>`` puts its back flush on the prop's footprint face behind it (computed from the prop's
      corners), ``floor`` leaves it where authored.  Default sizes per pose from greybox_style.blockout.
    * pickups -> box WITH collision + a translucent halo box (no collision) enclosing it with pickup_halo_margin_cm
      of clearance on every side, at least pickup_halo_cm per edge, yawed with it, when ``halo`` is true.
    * demons -> a Cylinder per encounter at the encounter spawn, NO collision (lane checks stay honest); when the
      demon carries ``footprint_cm`` (the audited mesh w x d, REQ-G2-003 AC1) a translucent NO-collision marker box
      ``Demon_<id>_footprint`` (w x d x 10 cm, z 0..10, tint blockout.demon_footprint_tint) lies under the cylinder,
      yawed so the mesh faces the encounter's player_approach (w = the wing span ACROSS the facing, like a
      character; yaw 0 when there is no approach), and the label gains ", footprint w x d".  Being collision-free
      and in Blockout/Demons it is a marker: no corridor / lane / overlap rule counts it (check_manifest ignores it).
    * triggers / dwell -> translucent boxes over encounters[].trigger_rect / money_shot.dwell_rect, no collision.
    * backdrop -> a large box beyond_window_cm behind the money-shot window, outside the boundary shell.
    * one small "<label> <w> x <d> x <h>" label per item, label_lift_cm above it, facing the room's entry point like
      every other label - or on the item face nearest that point at eye height when the top is too close to the ceiling.
    Hard data errors raise GeometryError (Tools/validate_blockout.mjs reports them first, with more context);
    placement snaps are recorded as warnings when they move an item further than blockout.rules.snap_warn_cm.
    """
    if "blockout" not in style:
        raise GeometryError("greybox_style.json has no 'blockout' section (needed to build Data/blockout.json)")
    bs = style["blockout"]
    if int(bo.get("version", 0)) != 1:
        raise GeometryError("blockout.json version must be 1 (got %r)" % (bo.get("version"),))
    if bo.get("units", "cm") != "cm":
        raise GeometryError("blockout.json units must be 'cm'")
    slots = bo.get("asset_slots") or {}
    if not isinstance(slots, dict):
        raise GeometryError("blockout.json asset_slots must be an object keyed by SM_/SK_ name")
    kind_tints = bs["kind_tints"]
    lift = float(bs["label_lift_cm"])
    snap_warn = float(bs["rules"]["snap_warn_cm"])
    actors: List[Actor] = []
    counts: Dict[str, int] = {"props": 0, "characters": 0, "pickups": 0, "halos": 0, "demons": 0, "demon_footprints": 0, "triggers": 0,
                              "dwell": 0, "backdrop": 0, "labels": 0, "labels_on_face": 0}
    used_slots: set = set()
    ids: set = set()

    def check_id(item: Dict[str, Any], what: str) -> str:
        iid = str(item.get("id", "") or "")
        if not iid:
            raise GeometryError("blockout %s without id: %r" % (what, item))
        if iid in ids:
            raise GeometryError("duplicate blockout id %r" % iid)
        ids.add(iid)
        return iid

    def check_room(item: Dict[str, Any], what: str) -> _Room:
        room = rooms.get(str(item.get("room", "")))
        if room is None:
            raise GeometryError("blockout %s: unknown room %r" % (what, item.get("room")))
        return room

    def check_slot(item: Dict[str, Any], what: str) -> Optional[str]:
        slot = item.get("slot")
        if slot is None:
            return None
        if slot not in slots:
            raise GeometryError("blockout %s: slot %r is not in asset_slots" % (what, slot))
        used_slots.add(str(slot))
        return str(slot)

    def dim_text(label: str, w: float, d: float, h: float) -> str:
        return "%s %d x %d x %d" % (label, int(round(w)), int(round(d)), int(round(h)))

    label_size = float(_label_style(style, "blockout", metrics)["size_cm"])
    eye_z = float(movement["player"]["eye_height_stand_cm"])

    def item_label(name: str, text: str, room: _Room, shape: Actor, folder: str) -> Label:
        """The item's dimension label, label_lift_cm above its top and centred on it.  When that text would enter
        the ceiling slab (a 300 cm demon under a 310 ceiling, a ceiling-mounted cabinet) the label moves onto the
        item face nearest the room's entry point, label_lift_cm off that face at standing eye height, clamped
        inside the room - review finding 2026-09-07: Label_demon_demon_2 sat at z 315 inside the 310..330 slab."""
        counts["labels"] += 1
        x, y = shape.center_plan[0], shape.center_plan[1]
        top = shape.center_plan[2] + shape.size[2] / 2.0
        z = top + lift
        if z + label_size / 2.0 <= room.ceiling - EPS:
            return _make_label(name, x, y, text, "blockout", style, metrics, folder, room.id, z_override=z,
                               **room_facing(room.id, x, y))
        vp = room_facing(room.id, x, y).get("viewer_plan")
        dx, dy = (0.0, -1.0) if vp is None else (float(vp[0]) - x, float(vp[1]) - y)
        norm = math.hypot(dx, dy)
        dx, dy = (0.0, -1.0) if norm < EPS else (dx / norm, dy / norm)
        reach = shape.radius_cm if isinstance(shape, Cylinder) else _half_along(shape.size[0], shape.size[1], shape.yaw_plan_deg, dx, dy)
        fx = min(max(x + dx * (reach + lift), room.x + lift), room.x + room.w - lift)
        fy = min(max(y + dy * (reach + lift), room.y + lift), room.y + room.h - lift)
        counts["labels_on_face"] += 1
        return _make_label(name, fx, fy, text, "blockout", style, metrics, folder, room.id,
                           z_override=min(eye_z, room.ceiling - lift - label_size / 2.0), **room_facing(room.id, fx, fy))

    # ---- props ----------------------------------------------------------------------------------
    prop_boxes: Dict[str, Box] = {}
    for p in bo.get("props") or []:
        pid = check_id(p, "prop")
        what = "prop %r" % pid
        room = check_room(p, what)
        slot = check_slot(p, what)
        kind = str(p.get("kind", "generic"))
        if kind not in kind_tints:
            raise GeometryError("%s: kind %r is not one of %s" % (what, kind, ", ".join(sorted(kind_tints))))
        tint = _style_tint(style, kind_tints[kind])
        w, d, h = _bo_size(p, what)
        yaw = float(p.get("yaw_deg", 0.0)) % 360.0
        x, y = _bo_pos(p, what)
        mount = str(p.get("mount", "floor"))
        if mount not in BLOCKOUT_MOUNTS:
            raise GeometryError("%s: mount must be floor | wall | ceiling (got %r)" % (what, mount))
        z0 = float(p.get("z_cm", 0.0))
        if mount == "floor" and abs(z0) > EPS:
            raise GeometryError("%s: mount floor with z_cm %s - floor items sit at z 0, nothing floats" % (what, z0))
        if mount == "wall":
            side = str(p.get("wall", ""))
            if side not in SIDES:
                raise GeometryError("%s: mount wall needs wall = north | south | west | east (got %r)" % (what, p.get("wall")))
            nx, ny = _side_normal(side)
            x, y = _snap_to_wall(room, side, x, y, _half_along(w, d, yaw, nx, ny))
        elif mount == "ceiling":
            want = room.ceiling - h
            if "z_cm" in p and abs(float(p["z_cm"]) - want) > EPS:
                warnings.append("%s: mount ceiling: z_cm %s replaced by %s (flush under the %s ceiling)" % (what, p["z_cm"], r3(want), room.id))
            z0 = want
        if z0 < -EPS:
            raise GeometryError("%s: z_cm %s is below the floor" % (what, z0))
        if z0 + h > room.ceiling + EPS:
            raise GeometryError("%s: top %s is above the %s ceiling %s" % (what, r3(z0 + h), room.id, room.ceiling))
        box = Box("Prop_%s" % pid, "prop", (x, y, z0 + h / 2.0), (w, d, h), tint, True, True, F_BO_PROPS, room.id, yaw_plan_deg=yaw)
        actors.append(box)
        prop_boxes[pid] = box
        actors.append(item_label("Label_prop_%s" % pid, dim_text(str(p.get("label", pid)), w, d, h), room, box, F_BO_PROPS))
        counts["props"] += 1

    # ---- characters -------------------------------------------------------------------------------
    defaults = bs["character_default_size_cm"]
    char_tint = _style_tint(style, bs["character_tint"])
    for c in bo.get("characters") or []:
        cid = check_id(c, "character")
        what = "character %r" % cid
        room = check_room(c, what)
        check_slot(c, what)
        pose = str(c.get("pose", "seated"))
        if pose not in BLOCKOUT_POSES:
            raise GeometryError("%s: pose must be seated | prone | slumped (got %r)" % (what, pose))
        if pose not in defaults:
            raise GeometryError("greybox_style.blockout.character_default_size_cm has no entry for pose %r" % pose)
        w, d, h = _bo_size(c, what, default=defaults[pose])
        facing = float(c.get("yaw_deg", 0.0)) % 360.0
        x0, y0 = _bo_pos(c, what)
        x, y = x0, y0
        contact = str(c.get("contact", "floor"))
        if contact.startswith("wall:"):
            side = contact[5:]
            if side not in SIDES:
                raise GeometryError("%s: contact %r - wall side must be north | south | west | east" % (what, contact))
            nx, ny = _side_normal(side)
            want = math.degrees(math.atan2(-ny, -nx)) % 360.0        # face away from the wall
            if abs(((facing - want) + 180.0) % 360.0 - 180.0) > 1e-6:
                warnings.append("%s: yaw_deg %s turned to %s so its back is flush with the %s wall" % (what, r3(facing), r3(want), side))
                facing = want
            x, y = _snap_to_wall(room, side, x, y, d / 2.0)
        elif contact.startswith("prop:"):
            pid = contact[5:]
            prop = prop_boxes.get(pid)
            if prop is None:
                raise GeometryError("%s: contact prop %r is not a prop in this blockout" % (what, pid))
            if prop.room != room.id:
                raise GeometryError("%s: contact prop %r is in room %r, not %r" % (what, pid, prop.room, room.id))
            fx, fy = math.cos(math.radians(facing)), math.sin(math.radians(facing))
            px, py = -fy, fx
            corners = prop.corners_plan()
            back = max(cx * fx + cy * fy for cx, cy in corners)           # prop face behind the character
            lat = x * px + y * py
            pp = [cx * px + cy * py for cx, cy in corners]
            if min(max(pp), lat + w / 2.0) - max(min(pp), lat - w / 2.0) <= EPS:
                raise GeometryError("%s: does not lean on prop %r (no overlap across the facing)" % (what, pid))
            shift = (back + d / 2.0) - (x * fx + y * fy)
            x, y = x + fx * shift, y + fy * shift
        elif contact != "floor":
            raise GeometryError("%s: contact must be floor | wall:<side> | prop:<id> (got %r)" % (what, contact))
        moved = math.hypot(x - x0, y - y0)
        if moved > snap_warn:
            warnings.append("%s: moved %.1f cm onto its contact surface (%s); author pos (%s, %s) instead of (%s, %s)"
                            % (what, moved, contact, r3(x), r3(y), r3(x0), r3(y0)))
        if h > room.ceiling + EPS:
            raise GeometryError("%s: height %s exceeds the %s ceiling %s" % (what, h, room.id, room.ceiling))
        # Box footprint: w across the body = the box's local x, so the footprint yaw is the facing - 90.
        box = Box("Char_%s" % cid, "character", (x, y, h / 2.0), (w, d, h), char_tint, True, True, F_BO_CHARS, room.id,
                  yaw_plan_deg=(facing - 90.0) % 360.0)
        actors.append(box)
        actors.append(item_label("Label_char_%s" % cid, dim_text(str(c.get("label", cid)), w, d, h), room, box, F_BO_CHARS))
        counts["characters"] += 1

    # ---- pickups ------------------------------------------------------------------------------------
    pickup_tint = _style_tint(style, bs["pickup_tint"])
    halo_tint = _style_tint(style, bs["halo_tint"])
    halo_cm = float(bs["pickup_halo_cm"])                 # minimum halo edge
    halo_margin = float(bs["pickup_halo_margin_cm"])      # clearance around the item on every side
    for k in bo.get("pickups") or []:
        kid = check_id(k, "pickup")
        what = "pickup %r" % kid
        room = check_room(k, what)
        check_slot(k, what)
        w, d, h = _bo_size(k, what)
        yaw = float(k.get("yaw_deg", 0.0)) % 360.0
        x, y = _bo_pos(k, what)
        pick = Box("Pickup_%s" % kid, "pickup", (x, y, h / 2.0), (w, d, h), pickup_tint, True, True, F_BO_PICKUPS, room.id, yaw_plan_deg=yaw)
        actors.append(pick)
        tallest: Actor = pick
        if bool(k.get("halo", False)):
            # The halo ENCLOSES the item: pickup_halo_margin_cm of clearance on every side, never smaller than the
            # pickup_halo_cm cube, yawed with the pickup (a bare 60 cube left 30 cm of the 120 cm shotgun sticking
            # out at each end - review finding 2026-09-07).
            hw = max(w + 2.0 * halo_margin, halo_cm)
            hd = max(d + 2.0 * halo_margin, halo_cm)
            hh = max(h + 2.0 * halo_margin, halo_cm)
            halo = Box("Halo_%s" % kid, "halo", (x, y, hh / 2.0), (hw, hd, hh), halo_tint, False, True, F_BO_PICKUPS, room.id, yaw_plan_deg=yaw)
            actors.append(halo)
            tallest = halo
            counts["halos"] += 1
        actors.append(item_label("Label_pickup_%s" % kid, dim_text(str(k.get("label", kid)), w, d, h), room, tallest, F_BO_PICKUPS))
        counts["pickups"] += 1

    # ---- demons (cylinders at the encounter spawn) ----------------------------------------------------------
    demon_tint = _style_tint(style, bs["demon_tint"])
    enc_by_id = {str(e.get("id", "")): e for e in fp.get("encounters", [])}
    for dm in bo.get("demons") or []:
        did = check_id(dm, "demon")
        what = "demon %r" % did
        eid = str(dm.get("encounter", ""))
        enc = enc_by_id.get(eid)
        if enc is None:
            raise GeometryError("%s: encounter %r is not in the floor plan" % (what, eid))
        slot = check_slot(dm, what)
        room = rooms.get(str(enc.get("room", "")))
        if room is None:
            raise GeometryError("%s: encounter %r has an unknown room" % (what, eid))
        try:
            radius = float(dm["radius_cm"])
            height = float(dm["height_cm"])
        except (KeyError, TypeError, ValueError):
            raise GeometryError("%s: radius_cm and height_cm are required" % what)
        if radius <= 0 or height <= 0:
            raise GeometryError("%s: radius_cm / height_cm must be positive" % what)
        sx, sy = float(enc["spawn"]["x"]), float(enc["spawn"]["y"])
        cyl = Cylinder("Demon_%s" % did, "demon", (sx, sy, height / 2.0), radius, height, demon_tint, False, True, F_BO_DEMONS, room.id)
        actors.append(cyl)
        text = str(dm.get("label") or "DEMON %s (%s) %d cm" % (eid, slot or "no slot", int(round(height))))
        fpc = dm.get("footprint_cm")
        if fpc is not None:
            # The audited mesh footprint (REQ-G2-003 AC1 "at the dimensions recorded in G2-001") as a 10 cm marker slab
            # under the pathing cylinder: NO collision (the lane / route checks stay about the capsule), yawed so the mesh
            # faces the player approach - w (the wing span) runs ACROSS that facing, d front-to-back, the character rule.
            try:
                fw, fd = float(fpc["w"]), float(fpc["d"])
            except (KeyError, TypeError, ValueError):
                raise GeometryError("%s: footprint_cm must be {w, d} in cm (got %r)" % (what, fpc))
            if fw <= 0 or fd <= 0:
                raise GeometryError("%s: footprint_cm must be positive (got %s x %s)" % (what, fw, fd))
            fp_tint = _style_tint(style, str(bs.get("demon_footprint_tint", "blockout_demon_footprint")))
            approach = enc.get("player_approach")
            facing = 0.0
            if isinstance(approach, dict) and "x" in approach and "y" in approach:
                ax, ay = float(approach["x"]) - sx, float(approach["y"]) - sy
                if math.hypot(ax, ay) > EPS:
                    facing = math.degrees(math.atan2(ay, ax)) % 360.0
            actors.append(Box("Demon_%s_footprint" % did, "demon_footprint", (sx, sy, DEMON_FOOTPRINT_H / 2.0), (fw, fd, DEMON_FOOTPRINT_H),
                              fp_tint, False, True, F_BO_DEMONS, room.id, yaw_plan_deg=(facing - 90.0) % 360.0))
            text = "%s, footprint %d x %d" % (text, int(round(fw)), int(round(fd)))
            counts["demon_footprints"] += 1
        actors.append(item_label("Label_demon_%s" % did, "%s\nr%d h%d" % (text, int(round(radius)), int(round(height))), room, cyl, F_BO_DEMONS))
        counts["demons"] += 1

    # ---- trigger volumes ------------------------------------------------------------------------------------
    tr = bo.get("triggers")
    if tr:
        th = float(tr["height_cm"])
        if th <= 0:
            raise GeometryError("blockout triggers.height_cm must be positive")
        trig_tint = _style_tint(style, bs["trigger_tint"])
        for e in fp.get("encounters", []):
            eid = str(e["id"])
            rc = e["trigger_rect"]
            x0, y0 = float(rc["x"]), float(rc["y"])
            x1, y1 = x0 + float(rc["w"]), y0 + float(rc["h"])
            cx, cy = (x0 + x1) / 2.0, (y0 + y1) / 2.0
            room = next((rooms[rid] for rid in sorted(rooms) if rooms[rid].contains(cx, cy)), rooms.get(str(e.get("room", ""))))
            if room is None:
                raise GeometryError("encounter %r: trigger_rect centre is in no room" % eid)
            vol = _rect_box("Volume_trigger_%s" % eid, "trigger_volume", x0, x1, y0, y1, 0.0, th, trig_tint, False, True, F_BO_VOLUMES, room.id)
            actors.append(vol)
            actors.append(item_label("Label_volume_trigger_%s" % eid, dim_text("TRIGGER VOLUME %s" % eid, x1 - x0, y1 - y0, th), room, vol, F_BO_VOLUMES))
            counts["triggers"] += 1

    # ---- dwell volume -----------------------------------------------------------------------------------------
    ms = fp.get("money_shot") or {}
    dw = bo.get("dwell")
    if dw:
        dr = ms.get("dwell_rect")
        room = rooms.get(str(ms.get("room", "")))
        if not dr or room is None:
            raise GeometryError("blockout dwell needs money_shot.dwell_rect and money_shot.room in the floor plan")
        dh = float(dw["height_cm"])
        if dh <= 0:
            raise GeometryError("blockout dwell.height_cm must be positive")
        # The data may name the volume's tint; greybox_style blockout.dwell_tint (a 0.1-opacity volume tint) is the default.
        dwell_tint = _style_tint(style, str(dw.get("tint") or bs["dwell_tint"]))
        x0, y0 = float(dr["x"]), float(dr["y"])
        x1, y1 = x0 + float(dr["w"]), y0 + float(dr["h"])
        vol = _rect_box("Volume_dwell", "dwell_volume", x0, x1, y0, y1, 0.0, dh, dwell_tint, False, True, F_BO_VOLUMES, room.id)
        actors.append(vol)
        actors.append(item_label("Label_volume_dwell", dim_text("DWELL VOLUME (5 s)", x1 - x0, y1 - y0, dh), room, vol, F_BO_VOLUMES))
        counts["dwell"] += 1

    # ---- backdrop beyond the money-shot window --------------------------------------------------------------
    backdrop_rect: Optional[List[float]] = None
    bd = bo.get("backdrop")
    if bd:
        wroom = rooms.get(str(ms.get("room", "")))
        wside = str(ms.get("window_wall", ""))
        win = [f for f in footprints if f.kind == "window" and wroom is not None and f.room_a == wroom.id and f.side_a == wside]
        if not win:
            raise GeometryError("blockout backdrop: no window on %s's %s wall to sit behind" % (ms.get("room"), wside))
        wf = win[0]
        try:
            beyond = float(bd["beyond_window_cm"])
            width = float(bd["width_cm"])
            height = float(bd["height_cm"])
            z0 = float(bd.get("z_cm", 0.0))
        except (KeyError, TypeError, ValueError):
            raise GeometryError("blockout backdrop needs beyond_window_cm, width_cm, height_cm (and optional z_cm)")
        if beyond <= 0 or width <= 0 or height <= 0:
            raise GeometryError("blockout backdrop: beyond_window_cm, width_cm and height_cm must be positive")
        thick = float(bs["backdrop_thickness_cm"])
        bd_tint = _style_tint(style, str(bd.get("tint", "backdrop_fire")))
        nx, ny = _side_normal(wside)
        if wside in ("north", "south"):
            outer = wf.y1 if wside == "south" else wf.y0
            near = outer + ny * beyond
            y0b, y1b = sorted([near, near + ny * thick])
            x0b, x1b = wf.cx - width / 2.0, wf.cx + width / 2.0
            lx, ly = wf.cx, near
        else:
            outer = wf.x1 if wside == "east" else wf.x0
            near = outer + nx * beyond
            x0b, x1b = sorted([near, near + nx * thick])
            y0b, y1b = wf.cy - width / 2.0, wf.cy + width / 2.0
            lx, ly = near, wf.cy
        actors.append(_rect_box("Backdrop_%s" % wf.room_a, "backdrop", x0b, x1b, y0b, y1b, z0, z0 + height, bd_tint, False, True, F_BO_BACKDROP, ""))
        # The label stands on the near face at window mid-height and reads from the window (viewer = window centre).
        lz = (wf.z_bottom + wf.z_top) / 2.0
        actors.append(_make_label("Label_backdrop_%s" % wf.room_a, lx - nx * 1.0, ly - ny * 1.0,
                                  "BACKDROP (placeholder fire plane, REQ-G2-005)\n%d wide x %d high, %d cm beyond the glass" % (int(round(width)), int(round(height)), int(round(beyond))),
                                  "blockout", style, metrics, F_BO_BACKDROP, "", z_override=lz,
                                  yaw_plan_deg=label_yaw_facing((lx, ly), (wf.cx, wf.cy)), viewer_plan=(wf.cx, wf.cy), facing="backdrop:window"))
        counts["labels"] += 1
        counts["backdrop"] += 1
        backdrop_rect = [r3(x0b), r3(y0b), r3(x1b - x0b), r3(y1b - y0b), r3(z0), r3(height)]

    meta = {
        "source": source_rel,
        "version": 1,
        "counts": counts,
        "slots_declared": sorted(slots),
        "slots_used": sorted(used_slots),
        "slots_unused": sorted(set(slots) - used_slots),
        "backdrop_rect_plan": backdrop_rect,
        "rules": dict(bs["rules"]),
        "folders": [F_BO_PROPS, F_BO_CHARS, F_BO_PICKUPS, F_BO_DEMONS, F_BO_VOLUMES, F_BO_BACKDROP],
    }
    return actors, meta


def _boundary_boxes(actors: List[Actor], metrics: Dict[str, Any], style: Dict[str, Any], folder: str) -> List[Box]:
    bd = style["boundary"]
    pad = float(bd["padding_cm"])
    th = float(bd["thickness_cm"])
    bottom_z = float(bd["bottom_z_cm"])
    safety_top = -float(bd["safety_slab_below_floor_cm"])
    height = float(metrics["architecture"]["boundary_wall_height_cm"])
    # The Gate-2 backdrop plane (kind "backdrop") is scenery beyond the window: it stays OUTSIDE the shell
    # (Tools/check_manifest.mjs treats it the same way), so it is excluded from the bounds here.
    boxes = [a for a in actors if isinstance(a, Box) and a.visible and a.kind not in BOUNDARY_EXEMPT_KINDS]
    if not boxes:
        raise GeometryError("no visible boxes to enclose")
    minx = min(b.min_plan[0] for b in boxes) - pad
    maxx = max(b.max_plan[0] for b in boxes) + pad
    miny = min(b.min_plan[1] for b in boxes) - pad
    maxy = max(b.max_plan[1] for b in boxes) + pad
    tint = _style_tint(style, "boundary")
    out = [
        _rect_box("Boundary_north", "boundary", minx - th, maxx + th, miny - th, miny, bottom_z, height, tint, True, False, folder),
        _rect_box("Boundary_south", "boundary", minx - th, maxx + th, maxy, maxy + th, bottom_z, height, tint, True, False, folder),
        _rect_box("Boundary_west", "boundary", minx - th, minx, miny, maxy, bottom_z, height, tint, True, False, folder),
        _rect_box("Boundary_east", "boundary", maxx, maxx + th, miny, maxy, bottom_z, height, tint, True, False, folder),
        _rect_box("Boundary_lid", "boundary", minx - th, maxx + th, miny - th, maxy + th, height, height + th, tint, True, False, folder),
        _rect_box("Boundary_bottom", "boundary", minx - th, maxx + th, miny - th, maxy + th, bottom_z - th, bottom_z, tint, True, False, folder),
        _rect_box("Boundary_safety_slab", "boundary", minx - th, maxx + th, miny - th, maxy + th, safety_top - th, safety_top, tint, True, False, folder),
    ]
    return out


def _finalize(actors: List[Actor]) -> List[Actor]:
    names = [a.name for a in actors]
    dupes = sorted({n for n in names if names.count(n) > 1})
    if dupes:
        raise GeometryError("duplicate actor names: %s" % ", ".join(dupes[:10]))
    return sorted(actors, key=lambda a: (a.folder, a.name))


def plan_bounds(actors: List[Actor]) -> Dict[str, Any]:
    """Bounds of the visible architecture (the backdrop plane beyond the window is excluded, like the boundary)."""
    boxes = [a for a in actors if isinstance(a, Box) and a.visible and a.kind not in BOUNDARY_EXEMPT_KINDS]
    if not boxes:
        return {}
    return {
        "min_plan": [r3(min(b.min_plan[i] for b in boxes)) for i in range(3)],
        "max_plan": [r3(max(b.max_plan[i] for b in boxes)) for i in range(3)],
    }


def summarize(actors: List[Actor]) -> Dict[str, Any]:
    counts: Dict[str, int] = {}
    for a in actors:
        if isinstance(a, Box):
            key = "box:%s" % a.kind
        elif isinstance(a, Cylinder):
            key = "cylinder:%s" % a.kind
        elif isinstance(a, Label):
            key = "label:%s" % a.style_key
        elif isinstance(a, Light):
            key = "light:%s" % a.light_type
        else:
            key = "player_start"
        counts[key] = counts.get(key, 0) + 1
    return {"total": len(actors), "by_kind": dict(sorted(counts.items()))}


# --------------------------------------------------------------------------------------
# Validation of generated geometry
# --------------------------------------------------------------------------------------

def _aabb_overlap(a: Box, b: Box, tol: float) -> bool:
    """AABB test on min_plan / max_plan (conservative for yawed footprints; see _boxes_overlap)."""
    amin, amax = a.min_plan, a.max_plan
    bmin, bmax = b.min_plan, b.max_plan
    for i in range(3):
        if min(amax[i], bmax[i]) - max(amin[i], bmin[i]) <= tol:
            return False
    return True


def _boxes_overlap(a: Box, b: Box, tol: float) -> bool:
    """Exact overlap test: z interval, then the footprints - AABB when both are axis-aligned (yaw multiple of 90),
    otherwise the separating-axis test on the four footprint axes.  Two boxes overlap only when they penetrate
    by more than ``tol`` along EVERY axis tested, so flush faces (props against walls, a character's back on a
    desk) never count."""
    if min(a.max_plan[2], b.max_plan[2]) - max(a.min_plan[2], b.min_plan[2]) <= tol:
        return False
    if a.axis_aligned and b.axis_aligned:
        for i in range(2):
            if min(a.max_plan[i], b.max_plan[i]) - max(a.min_plan[i], b.min_plan[i]) <= tol:
                return False
        return True
    ca, cb = a.corners_plan(), b.corners_plan()
    for yaw in (a.yaw_plan_deg, b.yaw_plan_deg):
        for ang in (yaw, yaw + 90.0):
            ax, ay = math.cos(math.radians(ang)), math.sin(math.radians(ang))
            pa = [x * ax + y * ay for x, y in ca]
            pb = [x * ax + y * ay for x, y in cb]
            if min(max(pa), max(pb)) - max(min(pa), min(pb)) <= tol:
                return False
    return True


def validate_geometry(actors: List[Actor], meta: Dict[str, Any], overlap_tol_cm: float = 0.5) -> List[str]:
    """Assert structural invariants; raise GeometryError on failure, return warnings otherwise."""
    warnings: List[str] = list(meta.get("warnings", []))
    boxes = [a for a in actors if isinstance(a, Box)]
    coll = [b for b in boxes if b.collision and b.visible and b.kind not in OVERLAP_WHITELIST_KINDS]
    # 1. pairwise overlap of visible collision boxes (sorted by min x for a cheap sweep)
    coll_sorted = sorted(coll, key=lambda b: b.min_plan[0])
    failures: List[str] = []
    for i in range(len(coll_sorted)):
        a = coll_sorted[i]
        amax_x = a.max_plan[0]
        for j in range(i + 1, len(coll_sorted)):
            b = coll_sorted[j]
            if b.min_plan[0] >= amax_x - overlap_tol_cm:
                break
            if _boxes_overlap(a, b, overlap_tol_cm):
                failures.append("%s <-> %s" % (a.name, b.name))
    if failures:
        raise GeometryError("visible collision boxes overlap by more than %s cm:\n  %s" % (overlap_tol_cm, "\n  ".join(failures[:25])))

    # 2. every opening cut is exactly its requested size
    footprints: List[_Footprint] = meta.get("_footprints", [])
    solids = [b for b in boxes if b.collision]
    probe = overlap_tol_cm
    for f in footprints:
        allowed = HOLE_FILL_KINDS.get(f.kind, set())
        inner_x0, inner_x1 = f.x0 + probe, f.x1 - probe
        inner_y0, inner_y1 = f.y0 + probe, f.y1 - probe
        inner_z0, inner_z1 = f.z_bottom + probe, f.z_top - probe
        hole = Box("hole", "hole", ((inner_x0 + inner_x1) / 2.0, (inner_y0 + inner_y1) / 2.0, (inner_z0 + inner_z1) / 2.0),
                   (inner_x1 - inner_x0, inner_y1 - inner_y0, inner_z1 - inner_z0), "", False, False, "")
        for b in solids:
            if b.kind in allowed or b.kind in OVERLAP_WHITELIST_KINDS:
                continue
            if _boxes_overlap(b, hole, 0.0):
                raise GeometryError("opening %r (%s) is obstructed by %s" % (f.opening_id, f.kind, b.name))
        # probes just outside the hole must be solid (jambs, header, threshold) -> exact size
        cz = (f.z_bottom + f.z_top) / 2.0
        if f.along_axis == "x":
            probes = {
                "left jamb": (f.x0 - probe, f.cy, cz), "right jamb": (f.x1 + probe, f.cy, cz),
                "header": (f.cx, f.cy, f.z_top + probe), "threshold": (f.cx, f.cy, f.z_bottom - probe),
            }
        else:
            probes = {
                "left jamb": (f.cx, f.y0 - probe, cz), "right jamb": (f.cx, f.y1 + probe, cz),
                "header": (f.cx, f.cy, f.z_top + probe), "threshold": (f.cx, f.cy, f.z_bottom - probe),
            }
        for label, p in probes.items():
            if not any(b.contains_point(p) for b in solids):
                raise GeometryError("opening %r (%s): no solid at its %s (hole is not exactly %s x %s)" % (
                    f.opening_id, f.kind, label, r3(f.x1 - f.x0 if f.along_axis == "x" else f.y1 - f.y0), r3(f.z_top - f.z_bottom)))

    # 3. every room has a reference figure, a label and a light
    rooms: Dict[str, _Room] = meta.get("_rooms", {})
    if rooms:
        fig_rooms = {a.room for a in boxes if a.kind == "figure"}
        label_rooms = {a.room for a in actors if isinstance(a, Label) and a.style_key == "room"}
        light_rooms = {a.room for a in actors if isinstance(a, Light) and a.name.startswith("Light_") and a.room}
        for rid in sorted(rooms):
            missing = [what for what, have in (("reference figure", fig_rooms), ("label", label_rooms), ("light", light_rooms)) if rid not in have]
            if missing:
                raise GeometryError("room %r is missing: %s" % (rid, ", ".join(missing)))
        fig_count: Dict[str, int] = {}
        for a in boxes:
            if a.kind == "figure":
                fig_count[a.room] = fig_count.get(a.room, 0) + 1
        for rid, n in sorted(fig_count.items()):
            if n > 1:
                warnings.append("room %r has %d reference figures (expected 1)" % (rid, n))

    # 4. exactly one PlayerStart
    starts = [a for a in actors if isinstance(a, PlayerStart)]
    if len(starts) != 1:
        raise GeometryError("expected exactly one PlayerStart, found %d" % len(starts))

    # 5. room enclosure (REQ-G1-007): every point just inside a room's wall strip, at several heights,
    #    is either solid or inside an intentional hole (door/open/duct mouth footprint).
    if rooms:
        step = 25.0
        depth_in = 1.0   # how far into the wall strip we probe
        heights = (5.0, 100.0, 180.0)
        holes = [(f.x0 - EPS, f.x1 + EPS, f.y0 - EPS, f.y1 + EPS, f.z_bottom - EPS, f.z_top + EPS) for f in footprints]

        def _in_hole(p: Tuple[float, float, float]) -> bool:
            return any(h[0] <= p[0] <= h[1] and h[2] <= p[1] <= h[3] and h[4] <= p[2] <= h[5] for h in holes)

        for rid in sorted(rooms):
            r = rooms[rid]
            samples: List[Tuple[float, float]] = []
            n_x = max(1, int(r.w // step))
            n_y = max(1, int(r.h // step))
            for k in range(n_x + 1):
                px = r.x + min(r.w, k * step)
                samples.append((px, r.y - depth_in))
                samples.append((px, r.y + r.h + depth_in))
            for k in range(n_y + 1):
                py = r.y + min(r.h, k * step)
                samples.append((r.x - depth_in, py))
                samples.append((r.x + r.w + depth_in, py))
            for (px, py) in samples:
                for z in heights:
                    if z >= r.ceiling:
                        continue
                    p = (px, py, z)
                    if _in_hole(p):
                        continue
                    if not any(b.contains_point(p) for b in solids):
                        raise GeometryError("room %r is not enclosed: gap at plan (%s, %s) z=%s" % (rid, r3(px), r3(py), z))
    return warnings


def strip_private_meta(meta: Dict[str, Any]) -> Dict[str, Any]:
    return {k: v for k, v in meta.items() if not k.startswith("_")}


# --------------------------------------------------------------------------------------
# Feel gym builder
# --------------------------------------------------------------------------------------

G_FLOOR = "FeelGym/Floor"
G_DOORS = "FeelGym/Doorways"
G_CORR = "FeelGym/Corridors"
G_ROOMS = "FeelGym/Ceilings"
G_LEDGES = "FeelGym/JumpLedges"
G_RAMP = "FeelGym/StepRamp"
G_TUNNELS = "FeelGym/CrawlTunnels"
G_FIGURES = "FeelGym/Figures"
G_LABELS = "FeelGym/Labels"
G_LIGHTS = "FeelGym/Lights"
G_BOUNDARY = "FeelGym/Boundary"
G_PLAYER = "FeelGym/PlayerStart"
G_HALL = "FeelGym/Hall"




def build_feel_gym(inputs: Dict[str, Any]) -> Tuple[List[Actor], Dict[str, Any]]:
    """Feel gym (REQ-G1-004): stations laid out in rows (greybox_style.feel_gym.station_rows / row_y_cm).

    Every element is labelled with its dimension and has a 180 cm reference figure beside it.
    The player starts at start_y_cm facing +plan.y (= Unreal +X) and walks forward into the rows, so every
    gym label is single-sided with yaw 270 (readable from the -y side the player approaches from); labels inside
    a station (the ceiling rooms' inside label) face the station's north entrance the same way.  Enclosed pieces
    get the same even fill point lights as the office (_point_light).  Since the gate-1 brief the gym is an
    ENCLOSED HALL: 20 cm walls around the slab, a ceiling at metrics.feel_gym.hall_ceiling_cm, a grid of hall
    fill lights and no sun / sky light (Rob: "this is an internal map").
    """
    metrics = inputs["metrics"]
    style = inputs["style"]
    movement = inputs["movement"]
    arch = metrics["architecture"]
    gym = metrics["feel_gym"]
    gs = style["feel_gym"]
    t = float(arch["wall_thickness_cm"])
    floor_slab = float(arch["floor_slab_thickness_cm"])
    ceil_slab = float(arch["ceiling_slab_thickness_cm"])
    fig_w = float(arch["reference_figure_width_cm"])
    fig_d = float(arch["reference_figure_depth_cm"])
    fig_gap = float(gs["figure_gap_cm"])
    fig_zone = fig_gap + fig_w + fig_gap
    station_gap = float(gs["station_gap_cm"])
    elem_gap = float(gs["element_gap_cm"])
    slab_w = float(gs["slab_w_cm"])
    slab_d = float(gs["slab_d_cm"])
    wall_tint = _style_tint(style, "wall")
    ceil_tint = _style_tint(style, "ceiling")
    marker_h = float(style["labels"]["marker"]["height_cm"])
    elem_label_h = float(style["labels"]["element"]["height_cm"])
    light_drop = float(style["lights"]["drop_below_ceiling_cm"])
    tunnel_light_drop = float(style["lights"]["duct"]["drop_below_ceiling_cm"])
    warnings: List[str] = []
    actors: List[Actor] = []
    stations: List[Dict[str, Any]] = []

    # The player walks +y from start_y: every label's readable face points -y (Label docstring, fact 2).
    gym_face = {"yaw_plan_deg": 270.0, "facing": "gym_approach:-plan.y"}

    def title(name: str, x: float, y: float, text: str) -> Label:
        ls = style["labels"]["element"]
        return Label(name=name, pos_plan=(x, y, float(gs["title_label_height_cm"])), text=text,
                     size_cm=float(gs["title_label_size_cm"]), color_rgb=tuple(float(c) for c in ls["color_rgb"]),
                     folder=G_LABELS, style_key="element", double_sided=False, **gym_face)

    def figure(name: str, x: float, y: float) -> List[Box]:
        """Reference figure standing in the figure zone that starts at x (its left edge)."""
        return _figure_boxes(name, x + fig_gap + fig_w / 2.0, y, metrics, style, G_FIGURES, "")

    def point_light(name: str, x: float, y: float, z: float, spec_key: str) -> Light:
        spec = gs[spec_key]
        return _point_light(name, (x, y, z), spec, "feel_gym.%s" % spec_key, style, float(spec["attenuation_radius_cm"]), G_LIGHTS)

    # ---- station builders: each takes (sx, y0) and returns the width it used along x -----------------

    def station_doorways(sx: float, y0: float) -> float:
        wall_w = float(gs["doorway_wall_width_cm"])
        wall_h = float(gs["doorway_wall_height_cm"])
        door_h = float(gym["door_height_cm"])
        spacing = float(gs["doorway_spacing_cm"])
        actors.append(title("Title_doorways", sx + wall_w / 2.0, y0 - elem_gap, "DOORWAYS\nwalk through each, +X"))
        for n, width in enumerate(gym["door_widths_cm"]):
            width = float(width)
            if width + 2 * t > wall_w:
                raise GeometryError("feel gym doorway %s does not fit in doorway_wall_width_cm %s" % (width, wall_w))
            wy0 = y0 + n * spacing
            jamb = (wall_w - width) / 2.0
            tag = "door%02d_%d" % (n + 1, int(width))
            actors.append(_rect_box("Gym_%s_jamb_left" % tag, "wall", sx, sx + jamb, wy0, wy0 + t, 0.0, wall_h, wall_tint, True, True, G_DOORS))
            actors.append(_rect_box("Gym_%s_jamb_right" % tag, "wall", sx + jamb + width, sx + wall_w, wy0, wy0 + t, 0.0, wall_h, wall_tint, True, True, G_DOORS))
            actors.append(_rect_box("Gym_%s_header" % tag, "header", sx + jamb, sx + jamb + width, wy0, wy0 + t, door_h, wall_h, wall_tint, True, True, G_DOORS))
            actors.append(_make_label("Gym_label_%s" % tag, sx + wall_w / 2.0, wy0 - fig_gap, "DOOR %d x %d" % (int(width), int(door_h)), "element", style, metrics, G_LABELS, **gym_face))
            actors.extend(figure(tag, sx + wall_w, wy0 + t / 2.0))
        return wall_w + fig_zone

    def station_corridors(sx: float, y0: float) -> float:
        length = float(gym["corridor_length_cm"])
        ceiling = float(arch["office_ceiling_height_cm"])
        x = sx
        for n, width in enumerate(gym["corridor_widths_cm"]):
            width = float(width)
            tag = "corridor%02d_%d" % (n + 1, int(width))
            actors.append(_rect_box("Gym_%s_wall_left" % tag, "wall", x, x + t, y0, y0 + length, 0.0, ceiling + ceil_slab, wall_tint, True, True, G_CORR))
            actors.append(_rect_box("Gym_%s_wall_right" % tag, "wall", x + t + width, x + 2 * t + width, y0, y0 + length, 0.0, ceiling + ceil_slab, wall_tint, True, True, G_CORR))
            actors.append(_rect_box("Gym_%s_ceiling" % tag, "ceiling", x + t, x + t + width, y0, y0 + length, ceiling, ceiling + ceil_slab, ceil_tint, True, True, G_CORR))
            cx = x + t + width / 2.0
            actors.append(_make_label("Gym_label_%s" % tag, cx, y0 - fig_gap, "CORRIDOR %d wide\n%d long, ceiling %d" % (int(width), int(length), int(ceiling)), "element", style, metrics, G_LABELS, **gym_face))
            actors.append(point_light("Gym_light_%s_a" % tag, cx, y0 + length * 0.25, ceiling - light_drop, "enclosed_light"))
            actors.append(point_light("Gym_light_%s_b" % tag, cx, y0 + length * 0.75, ceiling - light_drop, "enclosed_light"))
            actors.extend(figure(tag, x + 2 * t + width, y0 - fig_gap - fig_d / 2.0))
            x += 2 * t + width + fig_zone + elem_gap
        used = x - elem_gap - sx
        actors.append(title("Title_corridors", sx + used / 2.0, y0 - elem_gap, "CORRIDORS (10 m)"))
        return used

    def station_ceilings(sx: float, y0: float) -> float:
        foot = float(gym["ceiling_room_footprint_cm"])
        door_w = float(arch["door_width_cm"])
        door_h = float(arch["door_height_cm"])
        x = sx
        for n, ceiling in enumerate(gym["ceiling_heights_cm"]):
            ceiling = float(ceiling)
            tag = "ceiling%02d_%d" % (n + 1, int(ceiling))
            ix0, ix1 = x + t, x + t + foot
            iy0, iy1 = y0 + t, y0 + t + foot
            top = ceiling + ceil_slab
            jamb = (foot - door_w) / 2.0
            actors.append(_rect_box("Gym_%s_wall_north_left" % tag, "wall", x, ix0 + jamb, y0, iy0, 0.0, top, wall_tint, True, True, G_ROOMS))
            actors.append(_rect_box("Gym_%s_wall_north_right" % tag, "wall", ix0 + jamb + door_w, ix1 + t, y0, iy0, 0.0, top, wall_tint, True, True, G_ROOMS))
            actors.append(_rect_box("Gym_%s_header" % tag, "header", ix0 + jamb, ix0 + jamb + door_w, y0, iy0, door_h, top, wall_tint, True, True, G_ROOMS))
            actors.append(_rect_box("Gym_%s_wall_south" % tag, "wall", x, ix1 + t, iy1, iy1 + t, 0.0, top, wall_tint, True, True, G_ROOMS))
            actors.append(_rect_box("Gym_%s_wall_west" % tag, "wall", x, ix0, iy0, iy1, 0.0, top, wall_tint, True, True, G_ROOMS))
            actors.append(_rect_box("Gym_%s_wall_east" % tag, "wall", ix1, ix1 + t, iy0, iy1, 0.0, top, wall_tint, True, True, G_ROOMS))
            actors.append(_rect_box("Gym_%s_ceiling" % tag, "ceiling", ix0, ix1, iy0, iy1, ceiling, top, ceil_tint, True, True, G_ROOMS))
            cx = (ix0 + ix1) / 2.0
            cy = (iy0 + iy1) / 2.0
            actors.append(_make_label("Gym_label_%s" % tag, cx, y0 - fig_gap, "CEILING %d\n%d x %d room, door %d" % (int(ceiling), int(foot), int(foot), int(door_w)), "element", style, metrics, G_LABELS, **gym_face))
            # Inside label faces the room's north door (the player enters walking +y) - same yaw as everything else.
            actors.append(_make_label("Gym_label_%s_inside" % tag, cx, cy, "CEILING %d" % int(ceiling), "element", style, metrics, G_LABELS,
                                      z_override=min(elem_label_h, ceiling - light_drop - marker_h), **gym_face))
            actors.append(point_light("Gym_light_%s" % tag, cx, cy, ceiling - light_drop, "enclosed_light"))
            actors.extend(figure(tag, ix1 + t, y0 - fig_gap - fig_d / 2.0))
            actors.extend(_figure_boxes("%s_inside" % tag, ix1 - fig_gap - fig_w / 2.0, iy1 - fig_gap - fig_d / 2.0, metrics, style, G_FIGURES, ""))
            x += foot + 2 * t + fig_zone + elem_gap
        used = x - elem_gap - sx
        actors.append(title("Title_ceilings", sx + used / 2.0, y0 - elem_gap, "CEILING HEIGHTS"))
        return used

    def station_jump_ledges(sx: float, y0: float) -> float:
        lw = float(gs["ledge_w_cm"])
        ld = float(gs["ledge_d_cm"])
        actors.append(title("Title_ledges", sx + lw / 2.0, y0 - elem_gap, "JUMP LEDGES"))
        for n, h in enumerate(gym["jump_ledge_heights_cm"]):
            h = float(h)
            tag = "ledge%02d_%d" % (n + 1, int(h))
            # element_gap_cm of floor between ledges: each one is jumped onto from the ground.  Placed
            # back to back they formed a 20 cm-riser staircase the player simply walked up (max step 40).
            ly0 = y0 + n * (ld + elem_gap)
            actors.append(_rect_box("Gym_%s" % tag, "ledge", sx, sx + lw, ly0, ly0 + ld, 0.0, h, wall_tint, True, True, G_LEDGES))
            actors.append(_make_label("Gym_label_%s" % tag, sx + lw / 2.0, ly0 + ld / 2.0, "LEDGE %d" % int(h), "element", style, metrics, G_LABELS, z_override=h + marker_h, **gym_face))
            actors.extend(figure(tag, sx + lw, ly0 + ld / 2.0))
        return lw + fig_zone

    def station_step_ramp(sx: float, y0: float) -> float:
        sw = float(gs["step_w_cm"])
        sd = float(gs["step_d_cm"])
        n_steps = int(gym["step_ramp_steps"])
        r_min = float(gym["step_ramp_min_cm"])
        r_max = float(gym["step_ramp_max_cm"])
        if n_steps < 2:
            raise GeometryError("feel_gym.step_ramp_steps must be >= 2")
        actors.append(title("Title_ramp", sx + sw / 2.0, y0 - elem_gap, "STEP RAMP\nriser %d -> %d" % (int(r_min), int(r_max))))
        cum = 0.0
        for k in range(n_steps):
            riser = r_min + (r_max - r_min) * k / (n_steps - 1)
            cum += riser
            tag = "step%02d_riser%d" % (k + 1, int(round(riser)))
            sy0 = y0 + k * sd
            actors.append(_rect_box("Gym_%s" % tag, "step", sx, sx + sw, sy0, sy0 + sd, 0.0, cum, wall_tint, True, True, G_RAMP))
            actors.append(_make_label("Gym_label_%s" % tag, sx + sw / 2.0, sy0 + sd / 2.0, "RISER %d\n(top %d)" % (int(round(riser)), int(round(cum))), "element", style, metrics, G_LABELS, z_override=cum + marker_h, **gym_face))
        actors.extend(figure("ramp_bottom", sx + sw, y0 + sd / 2.0))
        actors.extend(figure("ramp_top", sx + sw, y0 + (n_steps - 0.5) * sd))
        return sw + fig_zone

    def station_crawl_tunnels(sx: float, y0: float) -> float:
        tw = float(gym["crawl_tunnel_width_cm"])
        tl = float(gym["crawl_tunnel_length_cm"])
        x = sx
        for n, h in enumerate(gym["crawl_tunnel_heights_cm"]):
            h = float(h)
            tag = "crawl%02d_%d" % (n + 1, int(h))
            actors.append(_rect_box("Gym_%s_wall_left" % tag, "wall", x, x + t, y0, y0 + tl, 0.0, h + t, wall_tint, True, True, G_TUNNELS))
            actors.append(_rect_box("Gym_%s_wall_right" % tag, "wall", x + t + tw, x + 2 * t + tw, y0, y0 + tl, 0.0, h + t, wall_tint, True, True, G_TUNNELS))
            actors.append(_rect_box("Gym_%s_ceiling" % tag, "ceiling", x + t, x + t + tw, y0, y0 + tl, h, h + t, ceil_tint, True, True, G_TUNNELS))
            cx = x + t + tw / 2.0
            actors.append(_make_label("Gym_label_%s" % tag, cx, y0 - fig_gap, "CRAWL %d high\n%d wide, %d long" % (int(h), int(tw), int(tl)), "element", style, metrics, G_LABELS, **gym_face))
            actors.append(point_light("Gym_light_%s" % tag, cx, y0 + tl / 2.0, h - tunnel_light_drop, "tunnel_light"))
            actors.extend(figure(tag, x + 2 * t + tw, y0 - fig_gap - fig_d / 2.0))
            x += 2 * t + tw + fig_zone + elem_gap
        used = x - elem_gap - sx
        actors.append(title("Title_tunnels", sx + used / 2.0, y0 - elem_gap, "CRAWL TUNNELS"))
        return used

    builders = {
        "doorways": station_doorways,
        "corridors": station_corridors,
        "ceilings": station_ceilings,
        "jump_ledges": station_jump_ledges,
        "step_ramp": station_step_ramp,
        "crawl_tunnels": station_crawl_tunnels,
    }
    rows = gs["station_rows"]
    row_ys = [float(v) for v in gs["row_y_cm"]]
    if len(rows) != len(row_ys):
        raise GeometryError("greybox_style.feel_gym.station_rows and row_y_cm must have the same length")
    seen = set()
    max_used_w = 0.0
    for row_idx, (names, y0) in enumerate(zip(rows, row_ys)):
        cursor_x = station_gap
        for name in names:
            if name not in builders:
                raise GeometryError("unknown feel gym station %r (known: %s)" % (name, ", ".join(sorted(builders))))
            if name in seen:
                raise GeometryError("feel gym station %r listed twice" % name)
            seen.add(name)
            used = builders[name](cursor_x, y0)
            stations.append({"name": name, "row": row_idx, "x0": r3(cursor_x), "x1": r3(cursor_x + used), "y0": r3(y0)})
            cursor_x += used + station_gap
        max_used_w = max(max_used_w, cursor_x)
    missing = sorted(set(builders) - seen)
    if missing:
        raise GeometryError("feel gym station_rows omit required stations: %s" % ", ".join(missing))
    if max_used_w > slab_w + EPS:
        raise GeometryError("feel gym stations need %.0f cm along x but greybox_style.feel_gym.slab_w_cm is %.0f; widen the slab, add a row or reduce gaps" % (max_used_w, slab_w))
    max_y = max(b.max_plan[1] for b in actors if isinstance(b, Box)) + station_gap
    if max_y > slab_d + EPS:
        raise GeometryError("feel gym stations need %.0f cm along y but slab_d_cm is %.0f" % (max_y, slab_d))

    # ---- slab, start, hall (walls + ceiling + fill lights), boundary -----------------------------------
    # Gate-1 brief (Rob: "add ceiling and walls, this is an internal map"): the gym is an enclosed hall, no sun,
    # no sky.  Stations keep their own lower ceilings inside it; the hall ceiling must clear the tallest station
    # top plus the light drop so every hall fill light hangs in free air.
    actors.append(_rect_box("Gym_floor_slab", "floor", 0.0, slab_w, 0.0, slab_d, -floor_slab, 0.0, _style_tint(style, gs["slab_floor_tint"]), True, True, G_FLOOR))
    stand_h = float(movement["player"]["stand_height_cm"])
    spawn_z = stand_h / 2.0 + float(style["player_start"]["spawn_clearance_cm"])
    start_y = float(gs["start_y_cm"])
    actors.append(PlayerStart(name="PlayerStart_feel_gym", pos_plan=(slab_w / 2.0, start_y, spawn_z), yaw_plan_deg=90.0, folder=G_PLAYER))
    toggle_key = str(movement.get("binds", {}).get("toggle_feel_gym", "?"))
    actors.append(title("Title_gym", slab_w / 2.0, start_y + elem_gap,
                        "FEEL GYM\nwalk forward (+X) to each station; %s returns to the office" % toggle_key))
    for legacy in ("sun", "sky_light"):
        if legacy in gs:
            raise GeometryError("greybox_style.feel_gym.%s was retired 2026-09-06 (the gym is an enclosed hall, no sun/sky); remove it" % legacy)
    if "hall_ceiling_cm" not in gym:
        raise GeometryError("metrics.feel_gym.hall_ceiling_cm is required (height of the enclosed gym hall)")
    hall_h = float(gym["hall_ceiling_cm"])
    tallest = max(b.max_plan[2] for b in actors if isinstance(b, Box))
    if hall_h - light_drop <= tallest + EPS:
        raise GeometryError("metrics.feel_gym.hall_ceiling_cm %.0f is too low: the tallest station reaches %.0f and the hall lights hang %.0f below the ceiling"
                            % (hall_h, tallest, light_drop))
    hall_wall = _style_tint(style, gs["hall_wall_tint"])
    hall_ceil = _style_tint(style, gs["hall_ceiling_tint"])
    hz0, hz1 = -floor_slab, hall_h + ceil_slab
    actors.append(_rect_box("Gym_hall_wall_north", "wall", -t, slab_w + t, -t, 0.0, hz0, hz1, hall_wall, True, True, G_HALL))
    actors.append(_rect_box("Gym_hall_wall_south", "wall", -t, slab_w + t, slab_d, slab_d + t, hz0, hz1, hall_wall, True, True, G_HALL))
    actors.append(_rect_box("Gym_hall_wall_west", "wall", -t, 0.0, 0.0, slab_d, hz0, hz1, hall_wall, True, True, G_HALL))
    actors.append(_rect_box("Gym_hall_wall_east", "wall", slab_w, slab_w + t, 0.0, slab_d, hz0, hz1, hall_wall, True, True, G_HALL))
    actors.append(_rect_box("Gym_hall_ceiling", "ceiling", 0.0, slab_w, 0.0, slab_d, hall_h, hall_h + ceil_slab, hall_ceil, True, True, G_HALL))
    spacing = float(gs["hall_light_spacing_cm"])
    if spacing <= 0:
        raise GeometryError("greybox_style.feel_gym.hall_light_spacing_cm must be > 0")
    n_x = max(1, int(math.ceil(slab_w / spacing - EPS)))
    n_y = max(1, int(math.ceil(slab_d / spacing - EPS)))
    hall_light_spec = gs["hall_light"]
    for j in range(n_y):
        for i in range(n_x):
            lx = (i + 0.5) * slab_w / n_x
            ly = (j + 0.5) * slab_d / n_y
            actors.append(_point_light("Gym_light_hall_%02d_%02d" % (j + 1, i + 1), (lx, ly, hall_h - light_drop), hall_light_spec,
                                       "feel_gym.hall_light", style, float(hall_light_spec["attenuation_radius_cm"]), G_LIGHTS))
    actors.extend(_boundary_boxes(actors, metrics, style, G_BOUNDARY))

    actors = _finalize(actors)
    meta = {
        "map_kind": "feel_gym",
        "plan_bounds": plan_bounds(actors),
        "stations": stations,
        "hall": {"interior": [r3(slab_w), r3(slab_d)], "ceiling_cm": r3(hall_h), "wall_thickness_cm": r3(t),
                 "fill_lights": [n_x, n_y], "fill_light_spacing_cm": [r3(slab_w / n_x), r3(slab_d / n_y)],
                 "tallest_station_top_cm": r3(tallest)},
        "metrics_version": metrics.get("version"),
        "warnings": warnings,
        "_footprints": [],
        "_rooms": {},
    }
    return actors, meta
