"""hf_common.py - emitters that turn hf_geometry actors into a JSON manifest or Unreal actors.

Two emitters share one tiny interface::

    em = ManifestEmitter(out_path)   # or UnrealEmitter()
    em.begin(map_path, meta, sources)
    for actor in actors: em.emit(actor)
    result = em.finish()             # dict summary

* ``ManifestEmitter`` needs nothing but the standard library (the ``--dry-run`` path).
* ``UnrealEmitter`` imports ``unreal`` lazily in ``__init__`` so this module can be
  imported (and unit-tested) outside the editor.

Unreal 5.8 API notes are inline.  Anything not verified against a running 5.8
editor carries a ``TODO(VERIFY 5.8)`` comment and uses the most conservative call.
Calls marked ``VERIFIED 5.8.2`` were exercised by the first real commandlet runs on
2026-09-06 (build_greybox 249 actors / build_feel_gym 171 actors, both "Python script
executed successfully", exit 0; Saved/Logs/hf_*_warmup.log.stdout.txt) and/or checked
against the installed engine headers.  The packaged-run frames of the same day settled
two more facts: a TextRender reads correctly only from its local +X side (so labels are
single actors turned toward the viewer, see hf_geometry.Label) and inverse-square point
lights blow the ceiling out (so point lights are unitless fill lights, see _emit_light).
"""
from __future__ import annotations

import json
import os
import shlex
import sys
from typing import Any, Dict, List, Optional

import hf_geometry as hg

MANIFEST_FORMAT = "hellfall-greybox-manifest"
MANIFEST_VERSION = 1
MATERIAL_ROOT = "/Game/Greybox/Materials"
CUBE_ASSET = "/Engine/BasicShapes/Cube"   # 100 cm engine cube with simple box collision


# --------------------------------------------------------------------------------------
# Argument helpers shared by the build scripts
# --------------------------------------------------------------------------------------

def merged_argv(argv: Optional[List[str]] = None) -> List[str]:
    """CLI args + the HF_ARGS environment variable (set by Tools/ue/run_editor_script.ps1).

    UnrealEditor-Cmd does not forward arbitrary arguments to a -run=pythonscript script, so the
    PowerShell wrapper passes them through HF_ARGS.  Tokens keep Windows paths intact (posix=False)
    and surrounding quotes are stripped.
    """
    args = list(sys.argv[1:] if argv is None else argv)
    env = os.environ.get("HF_ARGS", "").strip()
    if env:
        for tok in shlex.split(env, posix=False):
            if len(tok) >= 2 and tok[0] == tok[-1] and tok[0] in ("'", '"'):
                tok = tok[1:-1]
            args.append(tok)
    return args


def default_manifest_path(map_path: str) -> str:
    """Saved/Manifests/<MapName>.manifest.json (Saved/ is git-ignored)."""
    name = map_path.rstrip("/").split("/")[-1]
    return os.path.join(hg.REPO_ROOT, "Saved", "Manifests", "%s.manifest.json" % name)


# --------------------------------------------------------------------------------------
# Manifest emitter (no unreal)
# --------------------------------------------------------------------------------------

class ManifestEmitter:
    def __init__(self, out_path: str):
        self.out_path = out_path
        self.map_path = ""
        self.meta: Dict[str, Any] = {}
        self.sources: Dict[str, str] = {}
        self.actors: List[Dict[str, Any]] = []

    def begin(self, map_path: str, meta: Dict[str, Any], sources: Dict[str, str]) -> None:
        self.map_path = map_path
        self.meta = hg.strip_private_meta(meta)
        self.sources = dict(sources)
        self.actors = []

    def emit(self, actor: hg.Actor) -> None:
        self.actors.append(hg.actor_to_manifest(actor))

    def document(self) -> Dict[str, Any]:
        return {
            "format": MANIFEST_FORMAT,
            "version": MANIFEST_VERSION,
            "map": self.map_path,
            "sources": self.sources,
            "meta": self.meta,
            "summary": _summary_from_dicts(self.actors),
            "actors": self.actors,
        }

    def finish(self) -> Dict[str, Any]:
        doc = self.document()
        out_dir = os.path.dirname(os.path.abspath(self.out_path))
        if out_dir and not os.path.isdir(out_dir):
            os.makedirs(out_dir)
        text = json.dumps(doc, indent=2, sort_keys=True, ensure_ascii=True)
        with open(self.out_path, "w", encoding="utf-8", newline="\n") as fh:
            fh.write(text)
            fh.write("\n")
        return {"mode": "dry-run", "manifest": self.out_path, "actors": len(self.actors)}


def _summary_from_dicts(actors: List[Dict[str, Any]]) -> Dict[str, Any]:
    counts: Dict[str, int] = {}
    for a in actors:
        if a["type"] == "box":
            key = "box:%s" % a["kind"]
        elif a["type"] == "label":
            key = "label:%s" % a["style"]
        elif a["type"] == "light":
            key = "light:%s" % a["light_type"]
        else:
            key = a["type"]
        counts[key] = counts.get(key, 0) + 1
    return {"total": len(actors), "by_kind": dict(sorted(counts.items()))}


# --------------------------------------------------------------------------------------
# Unreal emitter
# --------------------------------------------------------------------------------------

class UnrealEmitter:
    """Builds the level inside the Unreal editor (commandlet or full editor).

    Decisions (see Tools/README.md):
    * The map is RECREATED (delete asset + new_level) rather than cleaned in place, so the result
      is byte-for-byte a function of the JSON inputs (REQ-G1-005 AC3).  If the asset cannot be
      deleted because it is the currently loaded world, we fall back to load + destroy-all-actors.
    * Point lights are MOVABLE: static lights need a lighting build, which the commandlet cannot do
      reliably and which this iGPU machine should not wait for; a dozen movable, shadowless lights
      is cheap.  They are EVEN FILL lights (inverse-square off, unitless intensity, falloff exponent
      from style, radius covering the room) so Rob judges space, not mood.  Gate 3 replaces all of
      this anyway.
    * Labels are ONE TextRenderActor each, yawed so the readable face (local +X) points at the point
      the player reads it from; the 180-degree twin garbled the glyphs (packaged run, 2026-09-06).
    * Every box is a scaled /Engine/BasicShapes/Cube StaticMeshActor -> simple box collision only
      (REQ-G1-007: no complex/per-triangle collision on architecture).
    """

    def __init__(self, tint_table: Dict[str, Dict[str, Any]]):
        import unreal  # lazy: only available inside the editor
        self.unreal = unreal
        self.tints = tint_table
        self.map_path = ""
        self.meta: Dict[str, Any] = {}
        self.materials: Dict[str, Any] = {}
        self.cube = None
        self.count = 0
        self.actor_sub = unreal.get_editor_subsystem(unreal.EditorActorSubsystem)
        self.level_sub = unreal.get_editor_subsystem(unreal.LevelEditorSubsystem)
        self.editor_sub = unreal.get_editor_subsystem(unreal.UnrealEditorSubsystem)

    # ---- lifecycle -------------------------------------------------------------------------
    def begin(self, map_path: str, meta: Dict[str, Any], sources: Dict[str, str]) -> None:
        u = self.unreal
        self.map_path = map_path
        self.meta = hg.strip_private_meta(meta)
        self._recreate_level(map_path)
        self.cube = u.load_asset(CUBE_ASSET)
        if self.cube is None:
            raise RuntimeError("cannot load %s" % CUBE_ASSET)
        self._ensure_materials()

    def _map_file_on_disk(self, map_path: str) -> str:
        """Absolute .umap path for a /Game/... asset path (empty string if not under /Game)."""
        u = self.unreal
        if not map_path.startswith("/Game/"):
            return ""
        content_dir = u.SystemLibrary.get_project_content_directory()
        rel = map_path[len("/Game/"):].split(".")[0]
        return os.path.normpath(os.path.join(content_dir, rel + ".umap"))

    def _recreate_level(self, map_path: str) -> None:
        u = self.unreal
        eal = u.EditorAssetLibrary
        # VERIFIED 5.8.2 (2026-09-06): under -run=pythonscript the asset registry has not scanned /Game
        # yet, so does_asset_exist() returned False for an existing map, the delete was skipped and
        # new_level() failed with "An asset already exists at this location". Scan the map's folder
        # synchronously first and also trust the file on disk; remove the stale file if the library
        # cannot delete it (nothing is loaded in the commandlet, so this is safe).
        try:
            registry = u.AssetRegistryHelpers.get_asset_registry()
            registry.scan_paths_synchronous([map_path.rsplit("/", 1)[0]], True)
        except Exception as exc:  # pragma: no cover - scanning is an optimisation, not a requirement
            u.log_warning("[hellfall] asset registry scan skipped: %s" % exc)
        on_disk = self._map_file_on_disk(map_path)
        exists = bool(eal.does_asset_exist(map_path)) or bool(on_disk and os.path.isfile(on_disk))
        if exists:
            # VERIFIED 5.8.2 (2026-09-06): deleting an existing map in the commandlet does not work -
            # EditorAssetLibrary.delete_asset() returns True but leaves the .umap on disk, and even after
            # removing the file ourselves the in-memory package makes new_level() refuse the path
            # ("An asset already exists at this location"). Loading the existing map and destroying every
            # generated actor gives the same end state (the generator re-emits everything, deterministically)
            # and finish() saves over the same package. World-owned defaults are kept.
            if not self.level_sub.load_level(map_path):
                raise RuntimeError("cannot load existing level %s" % map_path)
            keep = ("WorldSettings", "Brush", "DefaultPhysicsVolume", "WorldDataLayers", "WorldPartition")
            removed = 0
            for a in list(self.actor_sub.get_all_level_actors()):
                cls = a.get_class().get_name()
                if cls in keep or cls.endswith("WorldSettings"):
                    continue
                if self.actor_sub.destroy_actor(a):
                    removed += 1
            u.log("[hellfall] reusing %s: cleared %d actors before regenerating" % (map_path, removed))
            return
        # new_level(asset_path) closes the current level (unsaved), creates a blank level, saves and loads it.
        if not self.level_sub.new_level(map_path):
            raise RuntimeError("LevelEditorSubsystem.new_level(%s) returned False" % map_path)
        u.log("[hellfall] created %s" % map_path)

    def finish(self) -> Dict[str, Any]:
        u = self.unreal
        world = self.editor_sub.get_editor_world()
        if not u.EditorLoadingAndSavingUtils.save_map(world, self.map_path):
            raise RuntimeError("save_map(%s) failed" % self.map_path)
        u.EditorAssetLibrary.save_directory(MATERIAL_ROOT, only_if_is_dirty=True, recursive=True)
        return {"mode": "unreal", "map": self.map_path, "actors": self.count, "materials": len(self.materials)}

    # ---- materials --------------------------------------------------------------------------
    def _ensure_materials(self) -> None:
        u = self.unreal
        mel = u.MaterialEditingLibrary
        eal = u.EditorAssetLibrary
        tools = u.AssetToolsHelpers.get_asset_tools()
        for key in sorted(self.tints):
            if key.startswith("_"):
                continue
            spec = self.tints[key]
            name = "M_GB_%s" % key
            path = "%s/%s" % (MATERIAL_ROOT, name)
            mat = u.load_asset(path) if eal.does_asset_exist(path) else None
            if mat is None:
                mat = tools.create_asset(name, MATERIAL_ROOT, u.Material, u.MaterialFactoryNew())
                if mat is None:
                    raise RuntimeError("create_asset failed for %s" % path)
                r, g, b = [float(c) for c in spec["rgb"]]
                color = mel.create_material_expression(mat, u.MaterialExpressionConstant3Vector, -400, 0)
                color.set_editor_property("constant", u.LinearColor(r, g, b, 1.0))
                mel.connect_material_property(color, "", u.MaterialProperty.MP_BASE_COLOR)
                rough = mel.create_material_expression(mat, u.MaterialExpressionConstant, -400, 200)
                rough.set_editor_property("r", float(spec.get("roughness", 0.9)))
                mel.connect_material_property(rough, "", u.MaterialProperty.MP_ROUGHNESS)
                opacity = float(spec.get("opacity", 1.0))
                if opacity < 1.0:
                    # VERIFIED 5.8.2: Material.blend_mode + BlendMode.BLEND_TRANSLUCENT (glass/marker materials
                    # were created by the 2026-09-06 run; a wrong name would have raised and printed FAILED).
                    mat.set_editor_property("blend_mode", u.BlendMode.BLEND_TRANSLUCENT)
                    mat.set_editor_property("two_sided", True)
                    op = mel.create_material_expression(mat, u.MaterialExpressionConstant, -400, 400)
                    op.set_editor_property("r", opacity)
                    mel.connect_material_property(op, "", u.MaterialProperty.MP_OPACITY)
                mel.recompile_material(mat)
                eal.save_asset(path, only_if_is_dirty=False)
            self.materials[key] = mat

    # ---- emit -----------------------------------------------------------------------------------
    def emit(self, actor: hg.Actor) -> None:
        if isinstance(actor, hg.Box):
            self._emit_box(actor)
        elif isinstance(actor, hg.Label):
            self._emit_label(actor)
        elif isinstance(actor, hg.Light):
            self._emit_light(actor)
        elif isinstance(actor, hg.PlayerStart):
            self._emit_player_start(actor)
        else:
            raise RuntimeError("unknown actor %r" % (actor,))

    def _vec(self, xyz) -> Any:
        return self.unreal.Vector(float(xyz[0]), float(xyz[1]), float(xyz[2]))

    def _rot(self, yaw: float, pitch: float = 0.0) -> Any:
        # unreal.Rotator(roll, pitch, yaw) - keyword form avoids the argument-order trap.
        return self.unreal.Rotator(roll=0.0, pitch=float(pitch), yaw=float(yaw))

    def _emit_box(self, box: hg.Box) -> None:
        u = self.unreal
        tr = hg.box_ue_transform(box)
        actor = self.actor_sub.spawn_actor_from_class(u.StaticMeshActor, self._vec(tr["location"]), self._rot(0.0))
        if actor is None:
            raise RuntimeError("spawn failed for %s" % box.name)
        actor.set_actor_label(box.name)
        smc = actor.static_mesh_component   # VERIFIED 5.8.2: BlueprintReadOnly UPROPERTY StaticMeshComponent (StaticMeshActor.h)
        if smc is None:
            smc = actor.get_component_by_class(u.StaticMeshComponent)
        # StaticMeshActor spawns with STATIC mobility; set_static_mesh is allowed on static components in
        # the editor (the runtime restriction does not apply here).  We set it explicitly anyway.
        smc.set_mobility(u.ComponentMobility.STATIC)
        if not smc.set_static_mesh(self.cube):
            raise RuntimeError("set_static_mesh failed for %s" % box.name)
        actor.set_actor_scale3d(self._vec(tr["scale"]))
        mat = self.materials.get(box.tint_key)
        if mat is not None:
            smc.set_material(0, mat)
        if box.collision:
            smc.set_collision_profile_name("BlockAll")
            smc.set_collision_enabled(u.CollisionEnabled.QUERY_AND_PHYSICS)
        else:
            smc.set_collision_profile_name("NoCollision")
            smc.set_collision_enabled(u.CollisionEnabled.NO_COLLISION)
        if not box.visible:
            actor.set_actor_hidden_in_game(True)
            smc.set_cast_shadow(False)
        actor.set_folder_path(u.Name(box.folder))
        self.count += 1

    def _emit_label(self, label: hg.Label) -> None:
        u = self.unreal
        m = hg.actor_to_manifest(label)
        if label.double_sided:
            # Retired 2026-09-06: the 180-degree twin overlapped the front quad and garbled the glyphs.
            u.log_warning("[hellfall] %s: double_sided is ignored - labels are single-sided, faced by yaw" % label.name)
        r, g, b = label.color_rgb
        # FColor is declared B, G, R, A (NoExportTypes.h) so the generated unreal.Color.__init__ takes its
        # POSITIONAL arguments as (b, g, r, a); keywords keep the amber 'element' labels amber.
        color = u.Color(r=int(round(r * 255)), g=int(round(g * 255)), b=int(round(b * 255)), a=255)
        # Exactly ONE TextRenderActor per label.  Its yaw (plan yaw -> UE yaw in the manifest) points the readable
        # face (local +X; VERIFIED 5.8.2 by packaged-run frames 2026-09-06, mirrored from behind) at the viewer point.
        actor = self.actor_sub.spawn_actor_from_class(u.TextRenderActor, self._vec(m["ue"]["location"]), self._rot(m["ue"]["rotation"][2]))
        if actor is None:
            raise RuntimeError("spawn failed for %s" % label.name)
        actor.set_actor_label(label.name)
        trc = getattr(actor, "text_render", None)  # VERIFIED 5.8.2: BlueprintReadOnly UPROPERTY TextRender (TextRenderActor.h)
        if trc is None:
            trc = actor.get_component_by_class(u.TextRenderComponent)
        trc.set_text(u.Text(label.text))
        trc.set_world_size(float(label.size_cm))
        trc.set_horizontal_alignment(u.HorizTextAligment.EHTA_CENTER)      # Epic's misspelling is the real enum name
        trc.set_vertical_alignment(u.VerticalTextAligment.EVRTA_TEXT_CENTER)
        trc.set_text_render_color(color)
        actor.set_folder_path(u.Name(label.folder))
        self.count += 1

    def _emit_light(self, light: hg.Light) -> None:
        u = self.unreal
        m = hg.actor_to_manifest(light)
        loc = self._vec(m["ue"]["location"])
        mobility = getattr(u.ComponentMobility, light.mobility, u.ComponentMobility.MOVABLE)
        if light.light_type == "point":
            actor = self.actor_sub.spawn_actor_from_class(u.PointLight, loc, self._rot(0.0))
            comp = getattr(actor, "point_light_component", None)  # VERIFIED 5.8.2: BlueprintReadOnly UPROPERTY PointLightComponent (PointLight.h)
            if comp is None:
                comp = actor.get_component_by_class(u.PointLightComponent)
            comp.set_mobility(mobility)
            if light.inverse_squared:
                # Legacy physical light (no generator path produces one today).
                # VERIFIED 5.8.2: LightUnits.CANDELAS + intensity_units (13 point lights emitted by the 2026-09-06 run).
                comp.set_editor_property("use_inverse_squared_falloff", True)   # TODO(VERIFY 5.8): property name
                comp.set_editor_property("intensity_units", u.LightUnits.CANDELAS)
            else:
                # Even fill light (packaged-run finding 2026-09-06: inverse-square candela lights blew the ceiling
                # around each fixture out to white).  Order matters: inverse-square OFF first, units second,
                # intensity LAST so no PostEditChange unit conversion rescales the value we set.
                # TODO(VERIFY 5.8): bUseInverseSquaredFalloff and LightFalloffExponent are UPROPERTYs of
                # UPointLightComponent (PointLightComponent.h); the reflected Python names should be
                # use_inverse_squared_falloff / light_falloff_exponent.  LightUnits.UNITLESS = ELightUnits::Unitless
                # (LightComponentBase.h).  With inverse-square off the engine ignores the units anyway
                # (UPointLightComponent::ComputeLightBrightness), so UNITLESS here mirrors what the editor UI forces.
                comp.set_editor_property("use_inverse_squared_falloff", False)
                comp.set_editor_property("intensity_units", u.LightUnits.UNITLESS)
                comp.set_editor_property("light_falloff_exponent", float(light.falloff_exponent))
            comp.set_intensity(float(light.intensity))
            comp.set_editor_property("use_temperature", True)
            comp.set_temperature(float(light.temperature_k))
            comp.set_attenuation_radius(float(light.attenuation_radius_cm))
            comp.set_cast_shadows(bool(light.cast_shadows))
        elif light.light_type == "directional":
            actor = self.actor_sub.spawn_actor_from_class(u.DirectionalLight, loc, self._rot(light.yaw_deg, light.pitch_deg))
            comp = actor.get_component_by_class(u.DirectionalLightComponent)
            comp.set_mobility(mobility)
            comp.set_intensity(float(light.intensity))   # lux
            comp.set_editor_property("use_temperature", True)
            comp.set_temperature(float(light.temperature_k))
            comp.set_cast_shadows(bool(light.cast_shadows))
        elif light.light_type == "sky":
            actor = self.actor_sub.spawn_actor_from_class(u.SkyLight, loc, self._rot(0.0))
            comp = actor.get_component_by_class(u.SkyLightComponent)
            comp.set_mobility(mobility)
            comp.set_intensity(float(light.intensity))
            # TODO(VERIFY 5.8): recapture after mobility change may be needed: comp.recapture_sky()
        else:
            raise RuntimeError("unknown light type %r" % light.light_type)
        actor.set_actor_label(light.name)
        actor.set_folder_path(u.Name(light.folder))
        self.count += 1

    def _emit_player_start(self, ps: hg.PlayerStart) -> None:
        u = self.unreal
        m = hg.actor_to_manifest(ps)
        actor = self.actor_sub.spawn_actor_from_class(u.PlayerStart, self._vec(m["ue"]["location"]), self._rot(m["ue"]["rotation"][2]))
        actor.set_actor_label(ps.name)
        actor.set_folder_path(u.Name(ps.folder))
        self.count += 1


# --------------------------------------------------------------------------------------
# Shared driver used by build_greybox.py / build_feel_gym.py
# --------------------------------------------------------------------------------------

def run_build(kind: str, map_path: str, inputs: Dict[str, Any], dry_run: bool, out_path: Optional[str]) -> Dict[str, Any]:
    """Build + validate + emit.  Raises on failure; callers print FAILED and exit non-zero."""
    if dry_run:
        hg._selftest()   # pure-helper invariants (label_yaw_facing, plan_yaw_to_ue_yaw); raises GeometryError
    if kind == "greybox":
        actors, meta = hg.build_greybox(inputs)
    elif kind == "feel_gym":
        actors, meta = hg.build_feel_gym(inputs)
    else:
        raise ValueError("unknown build kind %r" % kind)
    warnings = hg.validate_geometry(actors, meta)
    meta["warnings"] = warnings
    sources = dict(inputs["paths"])
    if kind == "feel_gym":
        sources.pop("floorplan", None)
    if dry_run:
        emitter: Any = ManifestEmitter(out_path or default_manifest_path(map_path))
    else:
        emitter = UnrealEmitter(inputs["style"]["tints"])
    emitter.begin(map_path, meta, sources)
    for a in actors:
        emitter.emit(a)
    result = emitter.finish()
    result["summary"] = hg.summarize(actors)
    result["plan_bounds"] = meta.get("plan_bounds", {})
    result["warnings"] = warnings
    result["kind"] = kind
    result["selftest"] = "ok" if dry_run else "skipped (editor build)"
    return result


def print_result(result: Dict[str, Any]) -> None:
    print("HELLFALL %s build: %s" % (result["kind"], result["mode"]))
    if "manifest" in result:
        print("  manifest : %s" % result["manifest"])
    if "map" in result:
        print("  map      : %s" % result["map"])
    if "selftest" in result:
        print("  selftest : %s" % result["selftest"])
    print("  actors   : %d" % result["summary"]["total"])
    for k, v in result["summary"]["by_kind"].items():
        print("    %-22s %d" % (k, v))
    pb = result.get("plan_bounds") or {}
    if pb:
        print("  plan bounds (cm): min %s max %s" % (pb["min_plan"], pb["max_plan"]))
    if result["warnings"]:
        print("  warnings:")
        for w in result["warnings"]:
            print("    WARN %s" % w)
    else:
        print("  warnings : none")
