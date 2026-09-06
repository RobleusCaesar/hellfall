# _engine.ps1 - dot-sourced helper: engine/tool resolution shared by every HELLFALL PowerShell script.
#   . "$PSScriptRoot\_engine.ps1"          (from Tools/ue/*.ps1)
#   . "$PSScriptRoot\ue\_engine.ps1"       (from Tools/*.ps1)
# Windows PowerShell 5.1 compatible: no &&, no ternary, no null-coalescing.

$script:HfPythonCandidates = @(
    "C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe")
)

function Get-HfRepoRoot {
    return (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

function Get-HfUProject {
    $u = Join-Path (Get-HfRepoRoot) "Hellfall.uproject"
    if (-not (Test-Path -LiteralPath $u)) {
        throw "Hellfall.uproject not found at '$u'. The project scaffold (REQ-G1-001) must exist before engine scripts can run."
    }
    return $u
}

function Get-HfEngineAssociation {
    param([string]$UProject)
    if (-not $UProject) { $UProject = Get-HfUProject }
    $json = Get-Content -Raw -LiteralPath $UProject | ConvertFrom-Json
    $prop = $json.PSObject.Properties["EngineAssociation"]
    if ($null -eq $prop -or -not $prop.Value) { throw "EngineAssociation missing in '$UProject'." }
    return [string]$prop.Value
}

function Test-HfEngineRoot {
    param([string]$Dir)
    if (-not $Dir) { return $false }
    return (Test-Path -LiteralPath (Join-Path $Dir "Engine\Binaries\Win64\UnrealEditor-Cmd.exe"))
}

function Get-HfEngineRoot {
    <#
      Resolution order:
        1. $env:UE_ROOT (explicit override)
        2. HKLM:\SOFTWARE\EpicGames\Unreal Engine\<ver>\InstalledDirectory   (Launcher installs)
        3. HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds  (registered source/custom builds, matched via Build.version)
        4. C:\Program Files\Epic Games\UE_<ver>
      Throws with a pointer to Docs/TOOLCHAIN-SETUP.md when nothing matches.
    #>
    param([string]$Version)
    if (-not $Version) { $Version = Get-HfEngineAssociation }
    $tried = @()

    if ($env:UE_ROOT) {
        if (Test-HfEngineRoot $env:UE_ROOT) { return $env:UE_ROOT }
        $tried += "UE_ROOT=$($env:UE_ROOT)"
    }

    $key = "HKLM:\SOFTWARE\EpicGames\Unreal Engine\$Version"
    if (Test-Path $key) {
        $dir = (Get-ItemProperty -Path $key).InstalledDirectory
        if (Test-HfEngineRoot $dir) { return $dir }
    }
    $tried += $key

    $bkey = "HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds"
    if (Test-Path $bkey) {
        $props = Get-ItemProperty -Path $bkey
        foreach ($p in $props.PSObject.Properties) {
            if ($p.Name -like "PS*") { continue }
            $dir = [string]$p.Value
            $bv = Join-Path $dir "Engine\Build\Build.version"
            if (Test-Path -LiteralPath $bv) {
                $v = Get-Content -Raw -LiteralPath $bv | ConvertFrom-Json
                if ("$($v.MajorVersion).$($v.MinorVersion)" -eq $Version -and (Test-HfEngineRoot $dir)) { return $dir }
            }
        }
    }
    $tried += $bkey

    $default = "C:\Program Files\Epic Games\UE_$Version"
    if (Test-HfEngineRoot $default) { return $default }
    $tried += $default

    throw ("Unreal Engine $Version is not installed on this machine (tried: " + ($tried -join "; ") + "). " +
           "Install it through the Epic Games Launcher (interactive Epic sign-in required) as described in " +
           "Docs/TOOLCHAIN-SETUP.md, 'Step 1 - Install Unreal Engine 5.8', or set `$env:UE_ROOT to an existing engine folder.")
}

function Get-HfEditorCmd { return (Join-Path (Get-HfEngineRoot) "Engine\Binaries\Win64\UnrealEditor-Cmd.exe") }
function Get-HfBuildBat  { return (Join-Path (Get-HfEngineRoot) "Engine\Build\BatchFiles\Build.bat") }
function Get-HfRunUAT    { return (Join-Path (Get-HfEngineRoot) "Engine\Build\BatchFiles\RunUAT.bat") }

function Get-HfEngineVersionString {
    # e.g. "5.8.1-45678901+++UE5+Release-5.8"
    $bv = Join-Path (Get-HfEngineRoot) "Engine\Build\Build.version"
    if (-not (Test-Path -LiteralPath $bv)) { return "unknown" }
    $v = Get-Content -Raw -LiteralPath $bv | ConvertFrom-Json
    $s = "$($v.MajorVersion).$($v.MinorVersion).$($v.PatchVersion)"
    if ($v.Changelist) { $s += "-$($v.Changelist)" }
    if ($v.BranchName) { $s += "+$($v.BranchName)" }
    return $s
}

function Get-HfPython {
    # Machine constant first (the audit found Python 3.12 there), then PATH, then the py launcher.
    foreach ($c in $script:HfPythonCandidates) {
        if ($c -and (Test-Path -LiteralPath $c)) { return $c }
    }
    $cmd = Get-Command python -ErrorAction SilentlyContinue
    if ($cmd -and $cmd.Source -and ($cmd.Source -notlike "*WindowsApps*")) { return $cmd.Source }
    $py = Get-Command py -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }
    throw "Python 3 not found. Install Python 3.12 (winget install Python.Python.3.12) or fix Tools/ue/_engine.ps1 HfPythonCandidates."
}

function Get-HfNode {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $cmd) { throw "node is not on PATH (node v24 expected; see Docs/TOOLCHAIN-SETUP.md)." }
    return $cmd.Source
}

function Invoke-HfProcess {
    <#
      Runs a native executable with a raw argument line (so embedded quotes reach the child intact -
      PowerShell 5.1's own native-argument quoting mangles things like -project="C:\a b\x.uproject").
      Streams output to the console; returns the exit code (throws when -ThrowOnError and code != 0).
    #>
    param(
        [Parameter(Mandatory = $true)][string]$FilePath,
        [string]$ArgumentLine = "",
        [string]$WorkingDirectory = "",
        [switch]$ThrowOnError,
        [string]$StdOutFile = ""
    )
    if (-not (Test-Path -LiteralPath $FilePath)) { throw "Executable not found: $FilePath" }
    Write-Host ">> `"$FilePath`" $ArgumentLine" -ForegroundColor DarkGray
    $params = @{ FilePath = $FilePath; NoNewWindow = $true; Wait = $true; PassThru = $true }
    if ($ArgumentLine) { $params.ArgumentList = $ArgumentLine }
    if ($WorkingDirectory) { $params.WorkingDirectory = $WorkingDirectory }
    if ($StdOutFile) { $params.RedirectStandardOutput = $StdOutFile }
    $proc = Start-Process @params
    $code = $proc.ExitCode
    if ($ThrowOnError -and $code -ne 0) { throw "'$([IO.Path]::GetFileName($FilePath))' exited with code $code" }
    return $code
}

function Format-HfBytes {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return ("{0:N2} GB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N1} MB" -f ($Bytes / 1MB)) }
    return ("{0:N0} KB" -f ($Bytes / 1KB))
}
