<#
.SYNOPSIS
  Prints (and with -Run, executes) the toolchain installation for HELLFALL on Windows 11.

.DESCRIPTION
  UE 5.8 needs Visual Studio 2022 17.14+ (or VS 2026) with MSVC 14.50 and Windows SDK 10.0.26100+.
  The winget commands below install the Build Tools variant (enough for UnrealBuildTool), .NET 8 SDK and
  Blender.  Unreal Engine itself cannot be scripted: the Epic Games Launcher requires an interactive
  sign-in, so the steps are printed for Rob (see Docs/TOOLCHAIN-SETUP.md).

  Without -Run nothing is installed.  With -Run the script must be elevated; otherwise it aborts and
  prints how to elevate.
#>
param([switch]$Run)
$ErrorActionPreference = "Stop"

$vsOverride = "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.Net.Component.4.8.SDK --add Microsoft.Net.Component.4.7.2.TargetingPack --includeRecommended"
$commands = @(
    @{ Name = "Visual Studio 2022 Build Tools (VCTools workload, MSVC x64, Windows 11 SDK 26100, .NET 4.8 SDK / 4.7.2 targeting pack)";
       Exe = "winget"; Args = @("install", "--id", "Microsoft.VisualStudio.2022.BuildTools", "--exact", "--accept-source-agreements", "--accept-package-agreements", "--override", $vsOverride) },
    @{ Name = ".NET 8 SDK (UnrealBuildTool / AutomationTool)";
       Exe = "winget"; Args = @("install", "--id", "Microsoft.DotNet.SDK.8", "--exact", "--accept-source-agreements", "--accept-package-agreements") },
    @{ Name = "Blender (latest stable, Gate 2/4 asset pipeline)";
       Exe = "winget"; Args = @("install", "--id", "BlenderFoundation.Blender", "--exact", "--accept-source-agreements", "--accept-package-agreements") }
)

function Format-Cmd($c) {
    $parts = @($c.Exe)
    foreach ($a in $c.Args) { if ($a -match '\s') { $parts += ('"' + $a + '"') } else { $parts += $a } }
    return ($parts -join ' ')
}

Write-Host "HELLFALL toolchain for Unreal Engine 5.8 (Windows 11 x64)" -ForegroundColor Cyan
Write-Host ""
Write-Host "A. Scripted (winget, elevated PowerShell):" -ForegroundColor Cyan
$i = 1
foreach ($c in $commands) {
    Write-Host ("  {0}. {1}" -f $i, $c.Name)
    Write-Host ("     {0}" -f (Format-Cmd $c)) -ForegroundColor Gray
    $i++
}
Write-Host ""
Write-Host "B. Manual (cannot be scripted - requires Rob's Epic account):" -ForegroundColor Cyan
Write-Host "  1. Open the Epic Games Launcher and sign in."
Write-Host "  2. Unreal Engine tab -> Library -> '+' next to ENGINE VERSIONS -> pick 5.8.x -> Install."
Write-Host "     Keep the default folder C:\Program Files\Epic Games\UE_5.8 (Tools/ue/_engine.ps1 finds it via the registry)."
Write-Host "  3. In Options for the install, tick 'Editor symbols for debugging' OFF (saves ~40 GB) unless you need them."
Write-Host "  4. When done: Tools\generate_project_files.ps1, then Tools\build_editor.ps1, then Tools\package.ps1 -Tag gate-0."
Write-Host "  Details and troubleshooting: Docs/TOOLCHAIN-SETUP.md"
Write-Host ""

if (-not $Run) {
    Write-Host "Nothing installed (dry listing). Re-run with -Run from an elevated PowerShell to execute section A." -ForegroundColor Yellow
    exit 0
}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ABORT: -Run needs an elevated shell. Right-click PowerShell -> 'Run as administrator', then:" -ForegroundColor Red
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSCommandPath`" -Run"
    exit 1
}
if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Host "ABORT: winget not found. Install 'App Installer' from the Microsoft Store, then retry." -ForegroundColor Red
    exit 1
}
$failed = 0
foreach ($c in $commands) {
    Write-Host ""
    Write-Host ">> $($c.Name)" -ForegroundColor Cyan
    Write-Host ("   {0}" -f (Format-Cmd $c)) -ForegroundColor Gray
    & $c.Exe @($c.Args)
    $code = $LASTEXITCODE
    # winget: 0 = installed, -1978335189 (0x8A15002B) = already installed / no applicable upgrade
    if ($code -ne 0 -and $code -ne -1978335189) {
        Write-Host "   FAILED with exit code $code" -ForegroundColor Red
        $failed++
    } else {
        Write-Host "   ok" -ForegroundColor Green
    }
}
Write-Host ""
if ($failed -gt 0) {
    Write-Host "HELLFALL: $failed installer(s) failed. Fix and re-run; then complete section B manually." -ForegroundColor Red
    exit 1
}
Write-Host "HELLFALL: scripted toolchain installed. Complete section B (Unreal Engine 5.8 via the Epic Games Launcher) manually." -ForegroundColor Green
exit 0
