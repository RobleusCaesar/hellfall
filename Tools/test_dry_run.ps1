<#
.SYNOPSIS
  Engine-free regression test of the level tooling (runs on any machine with Python 3 and node).
.DESCRIPTION
  0. py_compile every Tools\ue\*.py (syntax gate for the editor scripts, incl. the unreal-only emitter)
  1. build_greybox.py --dry-run twice -> identical SHA256 (determinism, REQ-G1-005 AC3)
  2. check_manifest.mjs on the greybox manifest (overlaps, boundary, enclosure, money shot)
  3. validate_floorplan.mjs on Data/floorplan.json (adjacency, scenes, exploration estimate)
  4. build_feel_gym.py --dry-run + check_manifest.mjs (enclosed hall)
  5. scenes smoke: the plan plus 8 generated staging slots -> validate + build + check_manifest
  6. copies both manifests to Saved\Manifests\ for inspection
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
$results = @()
$failed = 0

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
    Step "1a. build_greybox.py --dry-run (run A)" {
        & $py "Tools\ue\build_greybox.py" --dry-run --out $gbA --floorplan $Floorplan | Out-Host
        return ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $gbA))
    }
    Step "1b. build_greybox.py --dry-run (run B)" {
        & $py "Tools\ue\build_greybox.py" --dry-run --out $gbB --floorplan $Floorplan | Out-Host
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
    Step "2. check_manifest.mjs (greybox)" {
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
    $manifests = Join-Path $repo "Saved\Manifests"
    New-Item -ItemType Directory -Force -Path $manifests | Out-Null
    if (Test-Path -LiteralPath $gbA) { Copy-Item -LiteralPath $gbA -Destination (Join-Path $manifests "L_ExecutiveFloor.manifest.json") -Force }
    if (Test-Path -LiteralPath $fg) { Copy-Item -LiteralPath $fg -Destination (Join-Path $manifests "L_FeelGym.manifest.json") -Force }
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
