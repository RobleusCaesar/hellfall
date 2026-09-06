<#
.SYNOPSIS
  Review screenshot sweep: launches the packaged game once per shot in Data/review_shots.json, spawning at the
  requested plan-space position via the "?spawn=X,Y,Z,Yaw" URL option (AHellfallGameMode), lets it render for a few
  seconds with -DumpMovie, and keeps the last dumped frame per shot under Saved\ReviewShots\<tag>\<id>.png.
.PARAMETER Tag      Package tag whose staged build to use (Builds\<tag>\Windows\Hellfall.exe). Default gate-0.
.PARAMETER Seconds  Seconds to let each shot run before the frame is taken (window + shader warm-up). Default 14.
.PARAMETER Only     Optional shot id prefix filter (e.g. "1" keeps the executive-floor shots numbered 1x).
.NOTES  Plan -> Unreal: X = plan.y, Y = -plan.x, Z = 0 (floor), yaw = plan yaw - 90 (Docs/FLOORPLAN-SCHEMA.md).
        The exe must be a Development build (DumpMovie is disabled in Shipping). Do not move the mouse while it runs.
#>
param(
    [string]$Tag = "gate-0",
    [int]$Seconds = 14,
    [string]$Only = ""
)
$ErrorActionPreference = "Stop"
$repo = Split-Path -Parent $PSScriptRoot
$exe = Join-Path $repo "Builds\$Tag\Windows\Hellfall.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "Packaged exe not found: $exe (run Tools\package.ps1 -Tag $Tag first)" }
$shotsFile = Join-Path $repo "Data\review_shots.json"
$shots = (Get-Content -LiteralPath $shotsFile -Raw | ConvertFrom-Json).shots
$outDir = Join-Path $repo "Saved\ReviewShots\$Tag"
New-Item -ItemType Directory -Force $outDir | Out-Null
$shotDir = Join-Path $repo "Builds\$Tag\Windows\Hellfall\Saved\Screenshots\Windows"
$done = @()
foreach ($s in $shots) {
    if ($Only -and -not $s.id.StartsWith($Only)) { continue }
    $ueX = [double]$s.y; $ueY = -[double]$s.x; $ueYaw = ([double]$s.yaw_plan - 90.0)
    $url = "/Game/Maps/$($s.map)?spawn=$ueX,$ueY,0,$ueYaw"
    $t0 = Get-Date
    $p = Start-Process -FilePath $exe -ArgumentList @($url, "-windowed", "-ResX=1920", "-ResY=1080", "-DumpMovie", "-benchmark", "-fps=4", "-NoSound", "-unattended") -PassThru
    Start-Sleep -Seconds $Seconds
    if (-not $p.HasExited) { Stop-Process -Id $p.Id -Force }
    Start-Sleep -Seconds 2
    $last = Get-ChildItem -LiteralPath $shotDir -Filter "*.png" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $t0 } | Sort-Object LastWriteTime | Select-Object -Last 1
    if ($last) {
        $dest = Join-Path $outDir ("{0}.png" -f $s.id)
        Copy-Item -LiteralPath $last.FullName -Destination $dest -Force
        Write-Host ("HELLFALL: shot {0,-26} {1,-44} -> {2}" -f $s.id, $url, $dest)
        $done += $dest
    } else {
        Write-Host ("HELLFALL: shot {0,-26} {1,-44} -> NO FRAME" -f $s.id, $url) -ForegroundColor Yellow
    }
    # Keep the dump folder from growing without bound (each run writes dozens of frames).
    Get-ChildItem -LiteralPath $shotDir -Filter "*.png" -ErrorAction SilentlyContinue | Where-Object { $_.LastWriteTime -gt $t0 } | ForEach-Object { [IO.File]::Delete($_.FullName) }
}
Write-Host ("HELLFALL: {0} shot(s) in {1}" -f $done.Count, $outDir)
