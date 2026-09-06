<#
.SYNOPSIS
  Publishes a gate build as a GitHub Release (gate protocol, Docs/BUILD-PLAN.md).
.DESCRIPTION
  gh release create <tag> <zip> --title <tag> --notes-file GATE-N-NOTES.md
  N is derived from the tag (gate-N or gate-N.M; "final" uses GATE-6-NOTES.md).  Refuses to run when the
  zip (from Tools\package.ps1) or the notes file is missing.
.EXAMPLE
  Tools\release.ps1 -Tag gate-0
  Tools\release.ps1 -Tag gate-1.2 -Prerelease
#>
param(
    [Parameter(Mandatory = $true)][string]$Tag,
    [ValidateSet("Development", "Shipping")][string]$Configuration = "Development",
    [switch]$Draft,
    [switch]$Prerelease
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ue\_engine.ps1"

$repo = Get-HfRepoRoot
if ($Tag -eq "final") {
    $n = 6
} elseif ($Tag -match '^gate-(\d+)(\.\d+)?$') {
    $n = [int]$Matches[1]
} else {
    throw "Tag must look like gate-N, gate-N.M or final (got '$Tag')."
}
$notes = Join-Path $repo ("GATE-{0}-NOTES.md" -f $n)
$zip = Join-Path $repo ("Builds\Hellfall-{0}-Win64-{1}.zip" -f $Tag, $Configuration)

if (-not (Test-Path -LiteralPath $zip)) { throw "Package not found: $zip. Run Tools\package.ps1 -Tag $Tag -Configuration $Configuration first." }
if (-not (Test-Path -LiteralPath $notes)) { throw "Notes file not found: $notes (gate protocol requires GATE-$n-NOTES.md in the repo root)." }
$gh = Get-Command gh -ErrorAction SilentlyContinue
if (-not $gh) { throw "GitHub CLI (gh) not found on PATH." }

$ghArgs = @("release", "create", $Tag, $zip, "--title", $Tag, "--notes-file", $notes)
if ($Draft) { $ghArgs += "--draft" }
if ($Prerelease) { $ghArgs += "--prerelease" }

Push-Location $repo
try {
    Write-Host "HELLFALL: gh $($ghArgs -join ' ')"
    & $gh.Source @ghArgs
    if ($LASTEXITCODE -ne 0) { throw "gh release create failed with exit code $LASTEXITCODE" }
} finally { Pop-Location }
Write-Host "HELLFALL: release $Tag published with $([IO.Path]::GetFileName($zip))" -ForegroundColor Green
exit 0
