"""build_greybox.py - generate /Game/Maps/L_ExecutiveFloor from Data/floorplan.json (REQ-G1-005).

Usage (plain Python, no engine):
    python Tools/ue/build_greybox.py --dry-run [--out Saved/Manifests/L_ExecutiveFloor.manifest.json]
                                     [--floorplan Data/floorplan.json]
                                     [--blockout Data/blockout.json | --no-blockout]

Gate 2: Data/blockout.json is picked up automatically when it exists AND the floor plan is the default
Data/floorplan.json (props, characters, pickups, demons, trigger / dwell volumes, backdrop -
Docs/FLOORPLAN-SCHEMA.md "Blockout data"); any other --floorplan builds greybox-only unless --blockout <file>
names a blockout authored for it; --no-blockout forces the greybox-only build.

Usage (inside Unreal, via the wrapper):
    Tools/ue/run_editor_script.ps1 -Script build_greybox.py
    Tools/ue/run_editor_script.ps1 -Script build_greybox.py -ExtraArgs "--floorplan","Data/floorplan_alt.json"

Extra arguments reach the script through the HF_ARGS environment variable when run under the
commandlet (see hf_common.merged_argv).  Exit code 0 on success, 1 on any failure (a line starting
with "FAILED:" is printed so wrappers can detect it).
"""
from __future__ import annotations

import argparse
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import hf_common  # noqa: E402
import hf_geometry as hg  # noqa: E402

DEFAULT_MAP = "/Game/Maps/L_ExecutiveFloor"


def parse_args(argv):
    p = argparse.ArgumentParser(description="Generate the HELLFALL executive-floor greybox.")
    p.add_argument("--dry-run", action="store_true", help="write a JSON manifest instead of touching Unreal")
    p.add_argument("--out", default=None, help="manifest path for --dry-run (default Saved/Manifests/<Map>.manifest.json)")
    p.add_argument("--floorplan", default=hg.DEFAULT_FLOORPLAN, help="floor plan JSON (default Data/floorplan.json)")
    p.add_argument("--metrics", default=hg.DEFAULT_METRICS)
    p.add_argument("--style", default=hg.DEFAULT_STYLE)
    p.add_argument("--movement", default=hg.DEFAULT_MOVEMENT)
    p.add_argument("--blockout", default=None, help="blockout JSON (default: Data/blockout.json when it exists and the floor plan is Data/floorplan.json)")
    p.add_argument("--no-blockout", action="store_true", help="greybox-only build even when Data/blockout.json exists")
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
        if args.no_blockout:
            blockout = None
        elif args.blockout:
            blockout = resolve(args.blockout)
        else:
            blockout = "auto"
        inputs = hg.load_inputs(resolve(args.floorplan), resolve(args.metrics), resolve(args.style), resolve(args.movement),
                                blockout_path=blockout)
        if inputs["floorplan"].get("_temporary"):
            print("note: Data/floorplan.json is marked _temporary (placeholder plan; the digitizer replaces it)")
        result = hf_common.run_build("greybox", args.map, inputs, args.dry_run, resolve(args.out) if args.out else None)
        hf_common.print_result(result)
        print("OK")
        return 0
    except hg.GeometryError as exc:
        print("FAILED: geometry: %s" % exc)
        return 1
    except Exception as exc:  # noqa: BLE001 - we want every failure to be visible and non-zero
        print("FAILED: %s: %s" % (type(exc).__name__, exc))
        traceback.print_exc()
        return 1


if __name__ == "__main__":
    code = main()
    sys.stdout.flush()
    # sys.exit is correct under the pythonscript commandlet too (verified 2026-09-06, UE 5.8.2 run + source):
    # PyUtil.cpp::FetchPythonError traps SystemExit with code 0/None and discards it ("Python script executed
    # successfully", process exit 0); any non-zero SystemExit is logged as "LogPython: Error" and makes the
    # commandlet return -1, which is exactly the failure signal Tools/ue/run_editor_script.ps1 checks for.
    sys.exit(code)
