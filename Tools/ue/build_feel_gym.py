"""build_feel_gym.py - generate /Game/Maps/L_FeelGym from Data/metrics.json "feel_gym" (REQ-G1-004).

Usage (plain Python, no engine):
    python Tools/ue/build_feel_gym.py --dry-run [--out Saved/Manifests/L_FeelGym.manifest.json]

Usage (inside Unreal, via the wrapper):
    Tools/ue/run_editor_script.ps1 -Script build_feel_gym.py

Layout spacing comes from Data/greybox_style.json "feel_gym"; element dimensions from
Data/metrics.json "feel_gym".  Exit code 0 on success, 1 on failure ("FAILED:" line printed).
"""
from __future__ import annotations

import argparse
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hf_common  # noqa: E402
import hf_geometry as hg  # noqa: E402

DEFAULT_MAP = "/Game/Maps/L_FeelGym"


def parse_args(argv):
    p = argparse.ArgumentParser(description="Generate the HELLFALL feel gym.")
    p.add_argument("--dry-run", action="store_true", help="write a JSON manifest instead of touching Unreal")
    p.add_argument("--out", default=None, help="manifest path for --dry-run (default Saved/Manifests/<Map>.manifest.json)")
    p.add_argument("--metrics", default=hg.DEFAULT_METRICS)
    p.add_argument("--style", default=hg.DEFAULT_STYLE)
    p.add_argument("--movement", default=hg.DEFAULT_MOVEMENT)
    p.add_argument("--map", default=DEFAULT_MAP, help="target map asset path")
    args, unknown = p.parse_known_args(argv)
    if unknown:
        print("note: ignoring unknown arguments %r" % (unknown,))
    return args


def resolve(path: str) -> str:
    return path if os.path.isabs(path) else os.path.join(hg.REPO_ROOT, path)


def main(argv=None) -> int:
    args = parse_args(hf_common.merged_argv(argv))
    try:
        # The feel gym does not need a floor plan; load_inputs still wants a path, so reuse the default
        # only if it exists (a missing floorplan must not break the gym build).
        fp_path = hg.DEFAULT_FLOORPLAN if os.path.isfile(hg.DEFAULT_FLOORPLAN) else None
        inputs = {
            "metrics": hg.load_json(resolve(args.metrics)),
            "style": hg.load_json(resolve(args.style)),
            "movement": hg.load_json(resolve(args.movement)),
            "floorplan": hg.load_json(fp_path) if fp_path else {},
            "paths": {"metrics": hg._rel(resolve(args.metrics)), "style": hg._rel(resolve(args.style)),
                      "movement": hg._rel(resolve(args.movement))},
        }
        result = hf_common.run_build("feel_gym", args.map, inputs, args.dry_run, resolve(args.out) if args.out else None)
        hf_common.print_result(result)
        print("OK")
        return 0
    except hg.GeometryError as exc:
        print("FAILED: geometry: %s" % exc)
        return 1
    except Exception as exc:  # noqa: BLE001
        print("FAILED: %s: %s" % (type(exc).__name__, exc))
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    sys.exit(code)
