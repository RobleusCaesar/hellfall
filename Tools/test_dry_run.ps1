<#
.SYNOPSIS
  Engine-free regression test of the level tooling (runs on any machine with Python 3 and node).
.DESCRIPTION
  0. py_compile every Tools\ue\*.py (syntax gate for the editor scripts, incl. the unreal-only emitter)
  1. build_greybox.py --dry-run --no-blockout twice -> identical SHA256 (determinism, REQ-G1-005 AC3); this is the
     Gate-1 architecture on its own (the greybox-only reference), whatever Data\blockout.json says
  2. check_manifest.mjs on that greybox-only manifest (overlaps, boundary, enclosure, money shot)
  3. validate_floorplan.mjs on Data/floorplan.json (adjacency, scenes, exploration estimate)
  4. build_feel_gym.py --dry-run + check_manifest.mjs (enclosed hall)
  5. scenes smoke: the plan plus 8 generated staging slots -> validate + build + check_manifest
  6. Gate-2 blockouts: 6a writes the embedded blockout fixture (also to Saved\blockout_fixture.json) and runs
     validate_blockout.mjs on it; 6b builds the greybox WITH the fixture twice (identical SHA256) + check_manifest;
     6c builds greybox-only (--no-blockout) + check_manifest and proves no Blockout/ actor leaked in; 6d, when
     Data\blockout.json exists, validates + builds + checks the real blockout through the generator's AUTO path (no
     --blockout flag: proves the default `build_greybox.py --dry-run` picks the file up, and the manifest must record
     meta.blockout.source Data/blockout.json). Steps 6a-6d are authored against the approved Data\floorplan.json and
     are skipped (with a note) for an alternative -Floorplan, which therefore tests the PLAN alone (steps 1-5).
  7. copies the manifests to Saved\Manifests\: L_ExecutiveFloor.manifest.json = the default build (6d's blockout
     build when it ran, else the greybox-only one), L_ExecutiveFloor.greybox_only.manifest.json = steps 1-2,
     L_ExecutiveFloor.blockout_fixture.manifest.json = 6b, L_FeelGym.manifest.json = 4a
  Non-zero exit on any failure.  Inside every step the native tool's output goes to the host (Out-Host),
  so the ONLY thing a step body emits to the pipeline is its trailing boolean; Step() additionally accepts
  nothing but a trailing [bool] $true as a pass (a leaked string would otherwise make the result truthy).
  Negative check: `Tools\test_dry_run.ps1 -Floorplan Saved\narrow.json` (door 100 wide) must exit 1.
.PARAMETER Floorplan
  Alternative floor plan to test (default Data\floorplan.json).
#>
param([string]$Floorplan = "")
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ue\_engine.ps1"

$repo = Get-HfRepoRoot
$py = Get-HfPython
$node = Get-HfNode
if (-not $Floorplan) { $Floorplan = Join-Path $repo "Data\floorplan.json" }
if (-not (Test-Path -LiteralPath $Floorplan)) { throw "Floor plan not found: $Floorplan" }

$tmp = Join-Path $env:TEMP ("hf_dry_run_" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Force -Path $tmp | Out-Null
$gbA = Join-Path $tmp "greybox_a.json"
$gbB = Join-Path $tmp "greybox_b.json"
$fg = Join-Path $tmp "feel_gym.json"
$scenesPlan = Join-Path $tmp "scenes_fixture.json"
$scenesManifest = Join-Path $tmp "scenes_manifest.json"
$fixturePy = Join-Path $tmp "scenes_fixture.py"
$boFixture = Join-Path $tmp "blockout_fixture.json"
$boA = Join-Path $tmp "blockout_a.json"
$boB = Join-Path $tmp "blockout_b.json"
$gbPlain = Join-Path $tmp "greybox_plain.json"
$boData = Join-Path $repo "Data\blockout.json"
$boDataManifest = Join-Path $tmp "blockout_data.json"
$defaultPlan = Join-Path $repo "Data\floorplan.json"
$isDefaultPlan = ((Resolve-Path -LiteralPath $Floorplan).Path -eq (Resolve-Path -LiteralPath $defaultPlan).Path)
$results = @()
$failed = 0

# Step 6 fixture: a handful of Gate-2 blockouts on the APPROVED floor plan (props in three rooms incl. a wall-mounted
# rack and fridge, a seated man leaning on the rack, the prone guard on a wall, the shotgun + halo, both demons, the
# trigger / dwell volumes and the backdrop). coverage: partial keeps the unused-GLB checks at INFO. Also written to
# Saved\blockout_fixture.json so it can be run by hand; NOT the designer's Data\blockout.json.
$blockoutFixture = @'
{
  "_comment": "TEST FIXTURE for the Gate-2 blockout tooling (written by Tools/test_dry_run.ps1 step 6a). A handful of items on the approved Data/floorplan.json: props in three rooms incl. one wall-mounted, a seated character leaning on a prop, a prone character on a wall, the shotgun pickup with its halo, both demons, the trigger / dwell volumes and the backdrop. coverage: partial = the unused-GLB / unused-slot coverage checks report INFO instead of WARN. NOT the designer's Data/blockout.json.",
  "version": 1,
  "units": "cm",
  "coverage": "partial",
  "asset_slots": {
    "SM_ReceptionDesk": { "source": "SourceAssets/models/props/reception_desk.glb", "class": "large_furniture", "target_size_cm": { "w": 180, "d": 80, "h": 110 }, "pivot": "floor", "normalized_size_m": [1.896, 1.33, 1.888], "tris": 7798, "note": "BUILD.md 5.1 proposal; reused as the CEO desk (REQ-G2-002)" },
    "SM_KitchenLunchTable": { "source": "SourceAssets/models/props/kitchen_lunch_table.glb", "class": "large_furniture", "target_size_cm": { "w": 190, "d": 135, "h": 75 }, "pivot": "floor", "normalized_size_m": [1.899, 1.063, 1.349], "tris": 7806, "note": "round table D120 x 75 with 4 chairs: set footprint ~190 x 135" },
    "SM_RefrigeratorOpen": { "source": "SourceAssets/models/props/refrigerator_open.glb", "class": "large_furniture", "target_size_cm": { "w": 130, "d": 70, "h": 180 }, "pivot": "wall", "normalized_size_m": [0.919, 1.902, 1.303], "tris": 7792, "note": "70 deep body + ~60 open door = 130 along the wall normal; 70 wide; 180 tall" },
    "SM_MopAndBucket": { "source": "SourceAssets/models/props/mop_and_bucket.glb", "class": "small_prop", "target_size_cm": { "w": 90, "d": 70, "h": 140 }, "pivot": "floor", "normalized_size_m": [1.644, 1.893, 1.267], "tris": 3791, "note": "mop handle 140 tall, bucket 40 dia; set ~90 x 70" },
    "SM_CeoCouchCoffeeTable": { "source": "SourceAssets/models/props/ceo_couch_coffee_table.glb", "class": "large_furniture", "target_size_cm": { "w": 190, "d": 170, "h": 85 }, "pivot": "floor", "normalized_size_m": [1.901, 0.543, 1.721], "tris": 8126, "note": "couch + table set footprint 190 x 170, back 85" },
    "SM_ManSitting": { "source": "SourceAssets/models/characters/man_sitting.glb", "class": "human_prop", "target_size_cm": { "w": 80, "d": 100, "h": 130 }, "pivot": "floor", "normalized_size_m": [1.284, 1.128, 1.905], "tris": 9506, "note": "seated ~130 tall, ~80 across, legs ~100 out; back on the supply racks" },
    "SM_FallenSecurityGuard": { "source": "SourceAssets/models/characters/fallen_security_guard.glb", "class": "human_prop", "target_size_cm": { "w": 180, "d": 90, "h": 40 }, "pivot": "floor", "normalized_size_m": [0.918, 0.971, 1.902], "tris": 9485, "note": "~180 long lying, ~90 wide, ~40 thick (half-sitting pose per the audit)" },
    "SM_Shotgun": { "source": "SourceAssets/models/weapons/shotgun.glb", "class": "hero_weapon", "target_size_cm": { "w": 120, "d": 22, "h": 8 }, "pivot": "muzzle", "normalized_size_m": [1.902, 0.355, 0.099], "tris": 23818, "note": "120 long pump shotgun lying flat" },
    "SK_EmberDemon": { "source": "SourceAssets/models/characters/ember_demon.glb", "class": "enemy", "target_size_cm": { "w": 90, "d": 90, "h": 220 }, "pivot": "floor", "normalized_size_m": [0.013, 0.017, 0.016], "tris": 10418, "note": "Demon #1, 220 tall (about 130x the raw height); capsule r45" },
    "SK_CrimsonHellfiend": { "source": "SourceAssets/models/characters/crimson_hellfiend.glb", "class": "enemy", "target_size_cm": { "w": 120, "d": 120, "h": 300 }, "pivot": "floor", "normalized_size_m": [0.012, 0.017, 0.005], "tris": 10428, "note": "Demon #2, 300 tall, visibly bigger; capsule r60" }
  },
  "props": [
    { "id": "racks_supply", "room": "supply_closet", "slot": null, "label": "Supply racks", "kind": "rack", "pos": { "x": 5400, "y": 215 }, "yaw_deg": 0, "size": { "w": 60, "d": 400, "h": 200 }, "mount": "wall", "wall": "east", "z_cm": 0, "note": "note_racks: racks along the EAST wall, full length; the seated man leans on them" },
    { "id": "mop_bucket", "room": "supply_closet", "slot": "SM_MopAndBucket", "label": "Mop and bucket", "kind": "fixture", "pos": { "x": 5050, "y": 135 }, "yaw_deg": 0, "size": { "w": 90, "d": 70, "h": 140 }, "mount": "floor", "z_cm": 0, "note": "in the NW corner, clear of the duct mouth and the player start" },
    { "id": "fridge", "room": "break_room", "slot": "SM_RefrigeratorOpen", "label": "Fridge (door open)", "kind": "furniture", "pos": { "x": 5400, "y": 1680 }, "yaw_deg": 0, "size": { "w": 130, "d": 70, "h": 180 }, "mount": "wall", "wall": "east", "z_cm": 0, "note": "note_kitchen: fridge at the SE corner of the kitchenette run" },
    { "id": "lunch_table", "room": "break_room", "slot": "SM_KitchenLunchTable", "label": "Lunch table + 4 chairs", "kind": "furniture", "pos": { "x": 4950, "y": 1340 }, "yaw_deg": 0, "size": { "w": 190, "d": 135, "h": 75 }, "mount": "floor", "z_cm": 0, "note": "note_kitchen: round table centred at (4950, 1340)" },
    { "id": "ceo_desk", "room": "ceo_office", "slot": "SM_ReceptionDesk", "label": "CEO desk (SM_ReceptionDesk)", "kind": "furniture", "pos": { "x": 2900, "y": 4400 }, "yaw_deg": 15, "size": { "w": 180, "d": 80, "h": 110 }, "mount": "floor", "z_cm": 0, "note": "note_ceo_desk: angled toward the window; south of Demon #2's retreat lane, west of the sightline strip" },
    { "id": "couch_set", "room": "ceo_office", "slot": "SM_CeoCouchCoffeeTable", "label": "Couch + coffee table", "kind": "furniture", "pos": { "x": 2650, "y": 4650 }, "yaw_deg": 0, "size": { "w": 190, "d": 170, "h": 85 }, "mount": "floor", "z_cm": 0, "note": "note_couch: west half in front of the glass, west of the dwell rect" }
  ],
  "characters": [
    { "id": "man_racks", "room": "supply_closet", "slot": "SM_ManSitting", "label": "Seated man (leans on racks)", "pose": "seated", "pos": { "x": 5320, "y": 240 }, "yaw_deg": 180, "size": { "w": 80, "d": 100, "h": 130 }, "contact": "prop:racks_supply", "note": "REQ-G2-003: back flush on the supply racks, facing west" },
    { "id": "guard", "room": "corridor_main", "slot": "SM_FallenSecurityGuard", "label": "Dead security guard", "pose": "prone", "pos": { "x": 4530, "y": 1985 }, "yaw_deg": 270, "size": { "w": 180, "d": 90, "h": 40 }, "contact": "wall:south", "note": "along the south wall of corridor_main, east of cp_corridor_post_pickup; the shotgun lies in the pickup scene beside him" }
  ],
  "pickups": [
    { "id": "shotgun", "room": "corridor_main", "slot": "SM_Shotgun", "label": "Shotgun pickup", "pos": { "x": 4540, "y": 1820 }, "yaw_deg": 0, "size": { "w": 120, "d": 22, "h": 8 }, "halo": true, "note": "note_guard / sc_guard_shotgun: shotgun with the green halo" }
  ],
  "demons": [
    { "id": "demon_1_blockout", "encounter": "demon_1", "slot": "SK_EmberDemon", "label": "DEMON #1 (SK_EmberDemon) 220 cm", "radius_cm": 45, "height_cm": 220, "note": "at the demon_1 spawn in west_lobby" },
    { "id": "demon_2_blockout", "encounter": "demon_2", "slot": "SK_CrimsonHellfiend", "label": "DEMON #2 (SK_CrimsonHellfiend) 300 cm", "radius_cm": 60, "height_cm": 300, "note": "at the demon_2 spawn in ceo_office, visibly bigger" }
  ],
  "triggers": { "height_cm": 220, "from": "encounters.trigger_rect" },
  "backdrop": { "beyond_window_cm": 800, "width_cm": 4000, "height_cm": 1600, "z_cm": -300, "tint": "backdrop_fire", "note": "placeholder orange fire plane (REQ-G2-005)" },
  "dwell": { "from": "money_shot.dwell_rect", "height_cm": 200, "tint": "dwell_volume" }
}
'@

# Step 5 fixture: the plan under test plus 8 generated staging slots (one 100 x 100 rect near the origin corner of
# the first 8 enterable rooms >= 250 cm each way, every kind and an off-axis facing represented). Proves the
# scenes path (validator, generator markers/labels/ticks, manifest checks) even before a designer authors any.
# Written to a temp .py and run as a file: a multi-line `python -c` argument does not survive PS 5.1's native
# argument quoting.
$fixtureCode = @'
import json, sys
src, dst = sys.argv[1], sys.argv[2]
fp = json.load(open(src, encoding="utf-8"))
kinds = ["monster", "ambush", "scene", "pickup", "reveal"]
rooms = sorted([r for r in fp["rooms"] if r.get("enterable", True) and r["rect"]["w"] >= 250 and r["rect"]["h"] >= 250], key=lambda r: r["id"])
fp["scenes"] = [{"id": "smoke_%s" % r["id"], "room": r["id"], "kind": kinds[i % 5],
                 "rect": {"x": r["rect"]["x"] + 50, "y": r["rect"]["y"] + 50, "w": 100, "h": 100},
                 "facing_deg": [0, 90, 180, 270, 45][i % 5],
                 "description": "dry-run smoke scene %d (%s)" % (i + 1, kinds[i % 5])}
                for i, r in enumerate(rooms[:8])]
json.dump(fp, open(dst, "w", encoding="utf-8"), indent=1)
print("scenes fixture: %d scenes -> %s" % (len(fp["scenes"]), dst))
'@

function Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    $ok = $false
    try {
        # Collect everything the body emitted; only a trailing boolean $true counts as a pass.
        $r = @(& $Body)
        $ok = ($r.Count -gt 0 -and ($r[-1] -is [bool]) -and $r[-1])
        if ($r.Count -gt 1) { Write-Host "  note: step body leaked $($r.Count - 1) object(s) into the pipeline" -ForegroundColor Yellow }
    } catch { Write-Host "  exception: $($_.Exception.Message)" -ForegroundColor Red; $ok = $false }
    if ($ok) { Write-Host "--- PASS: $Name" -ForegroundColor Green } else { Write-Host "--- FAIL: $Name" -ForegroundColor Red; $script:failed++ }
    $script:results += [pscustomobject]@{ Step = $Name; Result = $(if ($ok) { "PASS" } else { "FAIL" }) }
}

Push-Location $repo
try {
    Step "0. py_compile Tools\ue\*.py" {
        $files = @(Get-ChildItem -LiteralPath (Join-Path $repo "Tools\ue") -Filter *.py | ForEach-Object { $_.FullName })
        & $py -m py_compile @files | Out-Host
        Write-Host "  compiled $($files.Count) file(s)"
        return ($LASTEXITCODE -eq 0 -and $files.Count -gt 0)
    }
    Step "1a. build_greybox.py --dry-run --no-blockout (greybox-only, run A)" {
        & $py "Tools\ue\build_greybox.py" --dry-run --no-blockout --out $gbA --floorplan $Floorplan | Out-Host
        return ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $gbA))
    }
    Step "1b. build_greybox.py --dry-run --no-blockout (greybox-only, run B)" {
        & $py "Tools\ue\build_greybox.py" --dry-run --no-blockout --out $gbB --floorplan $Floorplan | Out-Host
        return ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $gbB))
    }
    Step "1c. determinism: SHA256(A) == SHA256(B)" {
        if (-not ((Test-Path -LiteralPath $gbA) -and (Test-Path -LiteralPath $gbB))) { return $false }
        $ha = (Get-FileHash -LiteralPath $gbA -Algorithm SHA256).Hash
        $hb = (Get-FileHash -LiteralPath $gbB -Algorithm SHA256).Hash
        Write-Host "  A: $ha"
        Write-Host "  B: $hb"
        return ($ha -eq $hb)
    }
    Step "2. check_manifest.mjs (greybox-only)" {
        if (-not (Test-Path -LiteralPath $gbA)) { return $false }
        & $node "Tools\check_manifest.mjs" $gbA | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    Step "3. validate_floorplan.mjs" {
        & $node "Tools\validate_floorplan.mjs" $Floorplan | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    Step "4a. build_feel_gym.py --dry-run" {
        & $py "Tools\ue\build_feel_gym.py" --dry-run --out $fg | Out-Host
        return ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $fg))
    }
    Step "4b. check_manifest.mjs (feel gym)" {
        if (-not (Test-Path -LiteralPath $fg)) { return $false }
        & $node "Tools\check_manifest.mjs" $fg | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    Step "5a. scenes smoke: fixture + validate_floorplan.mjs" {
        Set-Content -LiteralPath $fixturePy -Value $fixtureCode -Encoding ASCII
        & $py $fixturePy $Floorplan $scenesPlan | Out-Host
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $scenesPlan)) { return $false }
        & $node "Tools\validate_floorplan.mjs" $scenesPlan | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    Step "5b. scenes smoke: build_greybox.py --dry-run + check_manifest.mjs" {
        if (-not (Test-Path -LiteralPath $scenesPlan)) { return $false }
        & $py "Tools\ue\build_greybox.py" --dry-run --out $scenesManifest --floorplan $scenesPlan | Out-Host
        if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $scenesManifest)) { return $false }
        & $node "Tools\check_manifest.mjs" $scenesManifest | Out-Host
        return ($LASTEXITCODE -eq 0)
    }
    if ($isDefaultPlan) {
        Step "6a. blockout: fixture + validate_blockout.mjs" {
            Set-Content -LiteralPath $boFixture -Value $blockoutFixture -Encoding ASCII
            $saved = Join-Path $repo "Saved"
            New-Item -ItemType Directory -Force -Path $saved | Out-Null
            Copy-Item -LiteralPath $boFixture -Destination (Join-Path $saved "blockout_fixture.json") -Force
            & $node "Tools\validate_blockout.mjs" $boFixture --floorplan $Floorplan | Out-Host
            return ($LASTEXITCODE -eq 0)
        }
        Step "6b. blockout: build_greybox.py --dry-run --blockout fixture x2 (SHA256) + check_manifest.mjs" {
            if (-not (Test-Path -LiteralPath $boFixture)) { return $false }
            & $py "Tools\ue\build_greybox.py" --dry-run --out $boA --floorplan $Floorplan --blockout $boFixture | Out-Host
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $boA)) { return $false }
            & $py "Tools\ue\build_greybox.py" --dry-run --out $boB --floorplan $Floorplan --blockout $boFixture | Out-Host
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $boB)) { return $false }
            $ha = (Get-FileHash -LiteralPath $boA -Algorithm SHA256).Hash
            $hb = (Get-FileHash -LiteralPath $boB -Algorithm SHA256).Hash
            Write-Host "  A: $ha"
            Write-Host "  B: $hb"
            if ($ha -ne $hb) { Write-Host "  blockout build is not deterministic" -ForegroundColor Red; return $false }
            & $node "Tools\check_manifest.mjs" $boA | Out-Host
            return ($LASTEXITCODE -eq 0)
        }
        Step "6c. blockout: greybox-only mode (--no-blockout) + check_manifest.mjs" {
            & $py "Tools\ue\build_greybox.py" --dry-run --out $gbPlain --floorplan $Floorplan --no-blockout | Out-Host
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $gbPlain)) { return $false }
            $leaked = @(Select-String -LiteralPath $gbPlain -Pattern '"folder": "Blockout/' -SimpleMatch)
            if ($leaked.Count -gt 0) { Write-Host "  $($leaked.Count) Blockout/ actor(s) leaked into the greybox-only manifest" -ForegroundColor Red; return $false }
            Write-Host "  no Blockout/ actors in the greybox-only manifest"
            & $node "Tools\check_manifest.mjs" $gbPlain | Out-Host
            return ($LASTEXITCODE -eq 0)
        }
    } else {
        Write-Host ""
        Write-Host "note: steps 6a-6c (blockout fixture) are authored for Data\floorplan.json and are skipped for $Floorplan" -ForegroundColor Yellow
    }
    if ($isDefaultPlan -and (Test-Path -LiteralPath $boData)) {
        Step "6d. blockout: Data\blockout.json -> validate_blockout.mjs + build_greybox.py --dry-run (auto-load) + check_manifest.mjs" {
            & $node "Tools\validate_blockout.mjs" $boData --floorplan $Floorplan | Out-Host
            if ($LASTEXITCODE -ne 0) { return $false }
            # No --blockout flag: this is the default build, so it also proves the auto-load of Data\blockout.json.
            & $py "Tools\ue\build_greybox.py" --dry-run --out $boDataManifest --floorplan $Floorplan | Out-Host
            if ($LASTEXITCODE -ne 0 -or -not (Test-Path -LiteralPath $boDataManifest)) { return $false }
            $auto = @(Select-String -LiteralPath $boDataManifest -Pattern '"source": "Data/blockout.json"' -SimpleMatch)
            if ($auto.Count -lt 1) { Write-Host "  the default build did not auto-load Data\blockout.json (meta.blockout.source missing)" -ForegroundColor Red; return $false }
            Write-Host "  auto-load proven: meta.blockout.source = Data/blockout.json"
            & $node "Tools\check_manifest.mjs" $boDataManifest | Out-Host
            return ($LASTEXITCODE -eq 0)
        }
    } elseif (-not $isDefaultPlan) {
        Write-Host ""
        Write-Host "note: step 6d (Data\blockout.json) is authored for Data\floorplan.json and is skipped for $Floorplan (the plan alone was tested)" -ForegroundColor Yellow
    } else {
        Write-Host ""
        Write-Host "note: step 6d skipped - no Data\blockout.json yet (greybox-only build is what steps 1-2 tested)" -ForegroundColor Yellow
    }
    $manifests = Join-Path $repo "Saved\Manifests"
    New-Item -ItemType Directory -Force -Path $manifests | Out-Null
    # L_ExecutiveFloor.manifest.json = what the DEFAULT build produces (the blockout build when 6d ran, else greybox-only).
    if (Test-Path -LiteralPath $gbA) { Copy-Item -LiteralPath $gbA -Destination (Join-Path $manifests "L_ExecutiveFloor.greybox_only.manifest.json") -Force }
    if (Test-Path -LiteralPath $boDataManifest) { Copy-Item -LiteralPath $boDataManifest -Destination (Join-Path $manifests "L_ExecutiveFloor.manifest.json") -Force }
    elseif (Test-Path -LiteralPath $gbA) { Copy-Item -LiteralPath $gbA -Destination (Join-Path $manifests "L_ExecutiveFloor.manifest.json") -Force }
    if (Test-Path -LiteralPath $fg) { Copy-Item -LiteralPath $fg -Destination (Join-Path $manifests "L_FeelGym.manifest.json") -Force }
    if (Test-Path -LiteralPath $boA) { Copy-Item -LiteralPath $boA -Destination (Join-Path $manifests "L_ExecutiveFloor.blockout_fixture.manifest.json") -Force }
} finally {
    Pop-Location
    Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "=== summary ===" -ForegroundColor Cyan
$results | ForEach-Object { Write-Host ("  {0,-4} {1}" -f $_.Result, $_.Step) }
if ($failed -gt 0) {
    Write-Host "HELLFALL dry run: $failed step(s) FAILED" -ForegroundColor Red
    exit 1
}
Write-Host "HELLFALL dry run: all steps passed (manifests in Saved\Manifests\)" -ForegroundColor Green
exit 0
