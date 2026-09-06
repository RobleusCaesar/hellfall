<#
.SYNOPSIS
  Single-command Windows x64 package of HELLFALL (REQ-G1-001 AC3).

.DESCRIPTION
  1. RunUAT.bat BuildCookRun -project=... -platform=Win64 -clientconfig=<cfg> -build -cook -stage -pak -archive
        -archivedirectory="<repo>\Builds\<tag>" -nop4 -utf8output -unattended
     -nocompileeditor is NOT passed by default: UAT needs an up-to-date editor binary to cook, and on a fresh
     clone nothing has been built yet.  Pass -SkipEditorCompile once Tools\build_editor.ps1 has been run and
     you want the faster path.
  2. Copies <repo>\Data into <archive>\Windows\Hellfall\Data so FPaths::ProjectDir()/Data resolves at runtime
     (UHellfallTuning reads Data/movement.json from there).
  3. Writes Launch-FeelGym.cmd next to Hellfall.exe (REQ-G1-004 AC2: the feel gym is reachable without editing files).
  4. Writes BUILD-INFO.txt (engine version, configuration, git revision, UTC time).
  5. Zips the staged folder to <repo>\Builds\Hellfall-<tag>-Win64-<cfg>.zip, prints size + SHA256 and warns above 1.9 GB
     (GitHub Release asset limit is 2 GB).
  PDBs are not staged (-nodebuginfo) unless -IncludeDebugFiles is passed (BUILD.md decision 3.17).

.EXAMPLE
  Tools\package.ps1                                   # Development, tag gate-0
  Tools\package.ps1 -Configuration Shipping -Tag final
#>
param(
    [ValidateSet("Development", "Shipping")][string]$Configuration = "Development",
    [string]$Tag = "gate-0",
    [switch]$SkipEditorCompile,
    [switch]$IncludeDebugFiles,
    [switch]$Clean
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ue\_engine.ps1"

$repo = Get-HfRepoRoot
$uproject = Get-HfUProject
$uat = Get-HfRunUAT
$engineVersion = Get-HfEngineVersionString
$buildsDir = Join-Path $repo "Builds"
$archive = Join-Path $buildsDir $Tag
$zip = Join-Path $buildsDir ("Hellfall-{0}-Win64-{1}.zip" -f $Tag, $Configuration)
$sizeWarnBytes = [long](1.9 * 1GB)

if ($Clean -and (Test-Path -LiteralPath $archive)) {
    Write-Host "HELLFALL: removing previous archive $archive"
    Remove-Item -LiteralPath $archive -Recurse -Force
}
New-Item -ItemType Directory -Force -Path $buildsDir | Out-Null

# ---- 1. BuildCookRun ---------------------------------------------------------------------------------
$uatArgs = "BuildCookRun -project=`"$uproject`" -platform=Win64 -clientconfig=$Configuration -build -cook -stage -pak -archive -archivedirectory=`"$archive`" -nop4 -utf8output -unattended"
if (-not $IncludeDebugFiles) { $uatArgs += " -nodebuginfo" }   # BUILD.md decision 3.17: gate builds stage no PDBs (keeps the zip far under 2 GB)
if ($SkipEditorCompile) { $uatArgs += " -nocompileeditor" }
Write-Host "HELLFALL: packaging $Configuration ($Tag) with engine $engineVersion"
$code = Invoke-HfProcess -FilePath $uat -ArgumentLine $uatArgs -WorkingDirectory $repo
if ($code -ne 0) {
    Write-Host "HELLFALL: BuildCookRun FAILED (exit $code). See the UAT log under <engine>\Engine\Programs\AutomationTool\Saved\Logs." -ForegroundColor Red
    exit 1
}

# ---- locate the staged folder (UE5 names it 'Windows'; keep the legacy fallback) -------------------------
$staged = Join-Path $archive "Windows"
if (-not (Test-Path -LiteralPath $staged)) {
    $legacy = Join-Path $archive "WindowsNoEditor"
    if (Test-Path -LiteralPath $legacy) { $staged = $legacy } else { throw "Staged build folder not found under $archive" }
}
$exe = Join-Path $staged "Hellfall.exe"
if (-not (Test-Path -LiteralPath $exe)) { throw "Hellfall.exe not found in $staged (did the cook/stage succeed?)" }

# ---- 2. Data/ next to the project folder -----------------------------------------------------------------
$dataDst = Join-Path $staged "Hellfall\Data"
New-Item -ItemType Directory -Force -Path $dataDst | Out-Null
Copy-Item -Path (Join-Path $repo "Data\*") -Destination $dataDst -Recurse -Force
Write-Host "HELLFALL: copied Data\ -> $dataDst"

# ---- 3. Launch-FeelGym.cmd --------------------------------------------------------------------------------
$launcher = @(
    "@echo off",
    "rem HELLFALL feel gym launcher (REQ-G1-004 AC2). Opens the calibration level directly.",
    "start `"`" `"%~dp0Hellfall.exe`" /Game/Maps/L_FeelGym"
)
Set-Content -LiteralPath (Join-Path $staged "Launch-FeelGym.cmd") -Value $launcher -Encoding ASCII

# ---- 4. BUILD-INFO.txt ------------------------------------------------------------------------------------
$gitRev = "unknown"
$gitShort = "unknown"
try {
    Push-Location $repo
    $gitRev = (git rev-parse HEAD 2>$null | Out-String).Trim()
    $gitShort = (git rev-parse --short HEAD 2>$null | Out-String).Trim()
    if (-not $gitRev) { $gitRev = "unknown"; $gitShort = "unknown" }
} catch { $gitRev = "unknown"; $gitShort = "unknown" } finally { Pop-Location }
$utc = (Get-Date).ToUniversalTime().ToString("yyyy-MM-dd HH:mm:ss 'UTC'")
$info = @(
    "HELLFALL build info",
    "tag            : $Tag",
    "configuration  : $Configuration",
    "platform       : Win64",
    "engine         : Unreal Engine $engineVersion",
    "git revision   : $gitRev ($gitShort)",
    "packaged (UTC) : $utc",
    "",
    "Run Hellfall.exe for the executive floor (default map), Launch-FeelGym.cmd for the feel gym.",
    "Tuning data lives in Hellfall\Data\*.json (movement.json = player feel)."
)
Set-Content -LiteralPath (Join-Path $staged "BUILD-INFO.txt") -Value $info -Encoding UTF8

# ---- 5. zip -------------------------------------------------------------------------------------------------
if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip -Force }
Write-Host "HELLFALL: compressing $staged -> $zip"
# .NET ZipFile instead of Compress-Archive: Windows PowerShell 5.1's Microsoft.PowerShell.Archive 1.0 fails on
# any single entry over 2 GB (a cooked .pak can be) and is several times slower on multi-GB folders.
Add-Type -AssemblyName System.IO.Compression.FileSystem
[IO.Compression.ZipFile]::CreateFromDirectory($staged, $zip, [IO.Compression.CompressionLevel]::Optimal, $false)
$item = Get-Item -LiteralPath $zip
$hash = (Get-FileHash -LiteralPath $zip -Algorithm SHA256).Hash
Write-Host ""
Write-Host "HELLFALL: package ready" -ForegroundColor Green
Write-Host "  zip    : $zip"
Write-Host "  size   : $(Format-HfBytes $item.Length) ($($item.Length) bytes)"
Write-Host "  sha256 : $hash"
Write-Host "  engine : $engineVersion   git: $gitShort   config: $Configuration"
if ($item.Length -gt $sizeWarnBytes) {
    Write-Host "  WARNING: zip exceeds 1.9 GB; GitHub Release assets are capped at 2 GB. Strip PDBs (-nodebuginfo) or split." -ForegroundColor Yellow
}
exit 0
