<#
.SYNOPSIS
  Runs a HELLFALL Python editor script inside Unreal (headless commandlet by default).

.DESCRIPTION
  Resolves the engine from Hellfall.uproject's EngineAssociation (see _engine.ps1), then runs
    Commandlet:  UnrealEditor-Cmd.exe "<uproject>" -run=pythonscript -script="<abs .py>" -stdout -FullStdOutLogOutput -unattended -nosplash -nopause
    Editor:      UnrealEditor-Cmd.exe "<uproject>" -ExecutePythonScript="<abs .py>" ...   (full editor boots, runs, exits)
  Extra arguments are passed to the script through the HF_ARGS environment variable (the scripts merge it
  with their own argv; see Tools/ue/hf_common.py::merged_argv).  Fails loudly (exit 1) when the engine is
  missing, when the process exits non-zero, or when the script printed a "FAILED:" line.

.EXAMPLE
  Tools\ue\run_editor_script.ps1 -Script build_greybox.py
  Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py -Mode Editor
  Tools\ue\run_editor_script.ps1 -Script build_greybox.py -ExtraArgs "--floorplan","Data\floorplan.json"
#>
param(
    [Parameter(Mandatory = $true)][string]$Script,
    [ValidateSet("Commandlet", "Editor")][string]$Mode = "Commandlet",
    [string[]]$ExtraArgs = @()
)
$ErrorActionPreference = "Stop"
. "$PSScriptRoot\_engine.ps1"

$scriptPath = $Script
if (-not [IO.Path]::IsPathRooted($scriptPath)) { $scriptPath = Join-Path $PSScriptRoot $Script }
if (-not (Test-Path -LiteralPath $scriptPath)) { throw "Python script not found: $scriptPath" }
$scriptPath = (Resolve-Path -LiteralPath $scriptPath).Path

$uproject = Get-HfUProject
$editorCmd = Get-HfEditorCmd          # throws with the Docs/TOOLCHAIN-SETUP.md pointer if UE is missing
$repo = Get-HfRepoRoot

# HF_ARGS: quote tokens that contain whitespace so shlex on the Python side re-splits them correctly.
$quoted = @()
foreach ($a in $ExtraArgs) {
    if ($a -match '\s') { $quoted += ('"' + $a + '"') } else { $quoted += $a }
}
$env:HF_ARGS = ($quoted -join ' ')

$scriptName = [IO.Path]::GetFileNameWithoutExtension($scriptPath)
$logName = "HF_$scriptName.log"
$common = "-stdout -FullStdOutLogOutput -unattended -nosplash -nopause -NoLogTimes -log=$logName"
if ($Mode -eq "Commandlet") {
    $argLine = "`"$uproject`" -run=pythonscript -script=`"$scriptPath`" $common"
} else {
    $argLine = "`"$uproject`" -ExecutePythonScript=`"$scriptPath`" $common"
}

$stdoutFile = Join-Path $env:TEMP ("hf_editor_" + $scriptName + "_" + [guid]::NewGuid().ToString("N") + ".txt")
Write-Host "HELLFALL: running $scriptName in $Mode mode (HF_ARGS='$($env:HF_ARGS)')"
$code = Invoke-HfProcess -FilePath $editorCmd -ArgumentLine $argLine -WorkingDirectory $repo -StdOutFile $stdoutFile

$output = @()
if (Test-Path -LiteralPath $stdoutFile) {
    $output = Get-Content -LiteralPath $stdoutFile
    $output | ForEach-Object { Write-Host $_ }
    Remove-Item -LiteralPath $stdoutFile -Force -ErrorAction SilentlyContinue
}
$failedLine = $output | Where-Object { $_ -match 'FAILED:' } | Select-Object -First 1
$pyError = $output | Where-Object { $_ -match 'LogPython: Error' } | Select-Object -First 1

if ($code -ne 0) {
    Write-Host "HELLFALL: $scriptName FAILED (UnrealEditor-Cmd exit code $code). Full log: Saved\Logs\$logName" -ForegroundColor Red
    exit 1
}
if ($failedLine) {
    Write-Host "HELLFALL: $scriptName FAILED: $failedLine" -ForegroundColor Red
    exit 1
}
if ($pyError) {
    Write-Host "HELLFALL: $scriptName raised a Python error: $pyError (see Saved\Logs\$logName)" -ForegroundColor Red
    exit 1
}
Write-Host "HELLFALL: $scriptName OK" -ForegroundColor Green
exit 0
