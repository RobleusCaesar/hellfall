<#
.SYNOPSIS
  Engine-free regression test of the level tooling (runs on any machine with Python 3 and node).
.DESCRIPTION
  1. build_greybox.py --dry-run twice -> identical SHA256 (determinism, REQ-G1-005 AC3)
  2. check_manifest.mjs on the greybox manifest (overlaps, boundary, money shot)
  3. validate_floorplan.mjs on Data/floorplan.json
  4. build_feel_gym.py --dry-run + check_manifest.mjs
  5. copies both manifests to Saved\Manifests\ for inspection
  Non-zero exit on any failure.
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
$results = @()
$failed = 0

function Step {
    param([string]$Name, [scriptblock]$Body)
    Write-Host ""
    Write-Host "=== $Name ===" -ForegroundColor Cyan
    $ok = $false
    try { $ok = & $Body } catch { Write-Host "  exception: $($_.Exception.Message)" -ForegroundColor Red; $ok = $false }
    if ($ok) { Write-Host "--- PASS: $Name" -ForegroundColor Green } else { Write-Host "--- FAIL: $Name" -ForegroundColor Red; $script:failed++ }
    $script:results += [pscustomobject]@{ Step = $Name; Result = $(if ($ok) { "PASS" } else { "FAIL" }) }
}

Push-Location $repo
try {
    Step "1a. build_greybox.py --dry-run (run A)" {
        & $py "Tools\ue\build_greybox.py" --dry-run --out $gbA --floorplan $Floorplan
        return ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $gbA))
    }
    Step "1b. build_greybox.py --dry-run (run B)" {
        & $py "Tools\ue\build_greybox.py" --dry-run --out $gbB --floorplan $Floorplan | Out-Null
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
        & $node "Tools\check_manifest.mjs" $gbA
        return ($LASTEXITCODE -eq 0)
    }
    Step "3. validate_floorplan.mjs" {
        & $node "Tools\validate_floorplan.mjs" $Floorplan
        return ($LASTEXITCODE -eq 0)
    }
    Step "4a. build_feel_gym.py --dry-run" {
        & $py "Tools\ue\build_feel_gym.py" --dry-run --out $fg
        return ($LASTEXITCODE -eq 0 -and (Test-Path -LiteralPath $fg))
    }
    Step "4b. check_manifest.mjs (feel gym)" {
        if (-not (Test-Path -LiteralPath $fg)) { return $false }
        & $node "Tools\check_manifest.mjs" $fg
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
