<#
.SYNOPSIS
  Generates Visual Studio project files for Hellfall.uproject.
.DESCRIPTION
  Runs  Engine\Build\BatchFiles\Build.bat -projectfiles -project="<uproject>" -game <-rocket|-engine> -progress
  using the engine resolved from the .uproject's EngineAssociation (Tools/ue/_engine.ps1).
  -rocket for a Launcher (installed) engine, -engine for a source build - the same choice Epic's own
  DesktopPlatformBase::GenerateProjectFiles makes (an installed build has no engine source to put in the .sln).
  Requires Visual Studio 2022 17.14+ / Build Tools with the VCTools workload (Tools/setup_toolchain.ps1).
#>
param()
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\ue\_engine.ps1"

$uproject = Get-HfUProject
$buildBat = Get-HfBuildBat
$repo = Get-HfRepoRoot
$engineFlag = "-engine"
if (Test-HfInstalledBuild) { $engineFlag = "-rocket" }
Write-Host "HELLFALL: generating project files for $uproject with engine $(Get-HfEngineVersionString) ($engineFlag)"
$code = Invoke-HfProcess -FilePath $buildBat -ArgumentLine "-projectfiles -project=`"$uproject`" -game $engineFlag -progress" -WorkingDirectory $repo
if ($code -ne 0) {
    Write-Host "HELLFALL: project file generation FAILED (exit $code). If the error mentions a missing compiler or SDK, run Tools\setup_toolchain.ps1 (see Docs/TOOLCHAIN-SETUP.md)." -ForegroundColor Red
    exit 1
}
Write-Host "HELLFALL: project files generated (Hellfall.sln)" -ForegroundColor Green
exit 0
