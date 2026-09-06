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

  Map generation never needs the C++ module - only the PythonScriptPlugin.  When Binaries\Win64\UnrealEditor-Hellfall.dll
  is missing (fresh clone, toolchain not installed) or -NoCode is passed, the script writes a TEMPORARY code-free twin
  HellfallNoCode.uproject next to Hellfall.uproject (same JSON minus "Modules"), runs the commandlet against the twin and
  deletes it afterwards (finally block).  The twin is git-ignored; never commit it.  Do not start two wrapper runs at
  once: they would share the twin file.

.EXAMPLE
  Tools\ue\run_editor_script.ps1 -Script build_greybox.py
  Tools\ue\run_editor_script.ps1 -Script build_greybox.py -NoCode
  Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py -Mode Editor
  Tools\ue\run_editor_script.ps1 -Script build_greybox.py -ExtraArgs "--floorplan","Data\floorplan.json"
#>
param(
    [Parameter(Mandatory = $true)][string]$Script,
    [ValidateSet("Commandlet", "Editor")][string]$Mode = "Commandlet",
    [string[]]$ExtraArgs = @(),
    [switch]$NoCode
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

# ---- code or no code? ----------------------------------------------------------------------------------------
$editorDll = Join-Path $repo "Binaries\Win64\UnrealEditor-Hellfall.dll"     # Development editor build of the Hellfall module
$useTwin = [bool]$NoCode
if (-not $useTwin -and -not (Test-Path -LiteralPath $editorDll)) {
    Write-Host "HELLFALL: $editorDll not found (C++ module not compiled yet) -> using the code-free twin project" -ForegroundColor Yellow
    $useTwin = $true
}

# HF_ARGS: quote tokens that contain whitespace so shlex on the Python side re-splits them correctly.
$quoted = @()
foreach ($a in $ExtraArgs) {
    if ($a -match '\s') { $quoted += ('"' + $a + '"') } else { $quoted += $a }
}
$env:HF_ARGS = ($quoted -join ' ')

$scriptName = [IO.Path]::GetFileNameWithoutExtension($scriptPath)
$logName = "HF_$scriptName.log"
$common = "-stdout -FullStdOutLogOutput -unattended -nosplash -nopause -NoLogTimes -log=$logName"
$stdoutFile = Join-Path $env:TEMP ("hf_editor_" + $scriptName + "_" + [guid]::NewGuid().ToString("N") + ".txt")

$twin = ""
$exitCode = 1
try {
    $runProject = $uproject
    if ($useTwin) {
        $twin = New-HfNoCodeTwin -UProject $uproject
        Write-Host "HELLFALL: wrote temporary $twin (Hellfall.uproject minus Modules)"
        $runProject = $twin
    }
    if ($Mode -eq "Commandlet") {
        $argLine = "`"$runProject`" -run=pythonscript -script=`"$scriptPath`" $common"
    } else {
        $argLine = "`"$runProject`" -ExecutePythonScript=`"$scriptPath`" $common"
    }

    Write-Host "HELLFALL: running $scriptName in $Mode mode (HF_ARGS='$($env:HF_ARGS)')"
    # stdout is redirected to $stdoutFile and tailed live by Invoke-HfProcess; afterwards we grep the file.
    $code = Invoke-HfProcess -FilePath $editorCmd -ArgumentLine $argLine -WorkingDirectory $repo -StdOutFile $stdoutFile

    $output = @()
    if (Test-Path -LiteralPath $stdoutFile) {
        $output = @(Get-Content -LiteralPath $stdoutFile)
        Remove-Item -LiteralPath $stdoutFile -Force -ErrorAction SilentlyContinue
    }
    $failedLine = $output | Where-Object { $_ -match 'FAILED:' } | Select-Object -First 1
    $pyError = $output | Where-Object { $_ -match 'LogPython: Error' } | Select-Object -First 1

    if ($code -ne 0) {
        Write-Host "HELLFALL: $scriptName FAILED (UnrealEditor-Cmd exit code $code). Full log: Saved\Logs\$logName" -ForegroundColor Red
        $exitCode = 1
    } elseif ($failedLine) {
        Write-Host "HELLFALL: $scriptName FAILED: $failedLine" -ForegroundColor Red
        $exitCode = 1
    } elseif ($pyError) {
        Write-Host "HELLFALL: $scriptName raised a Python error: $pyError (see Saved\Logs\$logName)" -ForegroundColor Red
        $exitCode = 1
    } else {
        Write-Host "HELLFALL: $scriptName OK" -ForegroundColor Green
        $exitCode = 0
    }
} finally {
    if ($twin -and (Test-Path -LiteralPath $twin)) {
        Remove-Item -LiteralPath $twin -Force -ErrorAction SilentlyContinue
        Write-Host "HELLFALL: removed temporary $twin"
    }
}
exit $exitCode
