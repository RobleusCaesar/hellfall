<#
.SYNOPSIS
  Compiles the HellfallEditor target (needed before the editor can open the C++ project or cook).
.DESCRIPTION
  Runs  Engine\Build\BatchFiles\Build.bat HellfallEditor Win64 Development -project="<uproject>" -waitmutex
.PARAMETER Target
  Build target (default HellfallEditor; use Hellfall for the game target).
.PARAMETER Configuration
  Development (default), DebugGame or Shipping.
#>
param(
    [string]$Target = "HellfallEditor",
    [ValidateSet("Development", "DebugGame", "Shipping")][string]$Configuration = "Development"
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ue\_engine.ps1"

$uproject = Get-HfUProject
$buildBat = Get-HfBuildBat
$repo = Get-HfRepoRoot
Write-Host "HELLFALL: building $Target Win64 $Configuration with engine $(Get-HfEngineVersionString)"
$code = Invoke-HfProcess -FilePath $buildBat -ArgumentLine "$Target Win64 $Configuration -project=`"$uproject`" -waitmutex" -WorkingDirectory $repo
if ($code -ne 0) {
    Write-Host "HELLFALL: build FAILED (exit $code). Missing MSVC / Windows SDK -> Tools\setup_toolchain.ps1; missing engine -> Docs/TOOLCHAIN-SETUP.md." -ForegroundColor Red
    exit 1
}
Write-Host "HELLFALL: $Target built" -ForegroundColor Green
exit 0
