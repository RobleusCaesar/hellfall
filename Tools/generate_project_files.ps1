<#
.SYNOPSIS
  Generates Visual Studio project files for Hellfall.uproject.
.DESCRIPTION
  Runs  Engine\Build\BatchFiles\Build.bat -projectfiles -project="<uproject>" -game -engine -progress
  using the engine resolved from the .uproject's EngineAssociation (Tools/ue/_engine.ps1).
  Requires Visual Studio 2022 17.14+ / Build Tools with the VCTools workload (Tools/setup_toolchain.ps1).
#>
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ue\_engine.ps1"

$uproject = Get-HfUProject
$buildBat = Get-HfBuildBat
$repo = Get-HfRepoRoot
Write-Host "HELLFALL: generating project files for $uproject with engine $(Get-HfEngineVersionString)"
$code = Invoke-HfProcess -FilePath $buildBat -ArgumentLine "-projectfiles -project=`"$uproject`" -game -engine -progress" -WorkingDirectory $repo
if ($code -ne 0) {
    Write-Host "HELLFALL: project file generation FAILED (exit $code). If the error mentions a missing compiler or SDK, run Tools\setup_toolchain.ps1 (see Docs/TOOLCHAIN-SETUP.md)." -ForegroundColor Red
    exit 1
}
Write-Host "HELLFALL: project files generated (Hellfall.sln)" -ForegroundColor Green
exit 0
