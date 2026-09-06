# _engine.ps1 - dot-sourced helper: engine/tool resolution shared by every HELLFALL PowerShell script.
#   . "$PSScriptRoot\_engine.ps1"          (from Tools/ue/*.ps1)
#   . "$PSScriptRoot\ue\_engine.ps1"       (from Tools/*.ps1)
# Windows PowerShell 5.1 compatible: no &&, no ternary, no null-coalescing.

$script:HfPythonCandidates = @(
    "C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe",
    (Join-Path $env:LOCALAPPDATA "Programs\Python\Python312\python.exe")
)
$script:HfEngineRootCache = @{}     # version -> resolved root (so the "resolved from" line prints once)

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

function Get-HfBuildVersionMajorMinor {
    # "5.8" from <root>\Engine\Build\Build.version, or "" when the file is missing/unreadable.
    param([string]$Dir)
    if (-not $Dir) { return "" }
    $bv = Join-Path $Dir "Engine\Build\Build.version"
    if (-not (Test-Path -LiteralPath $bv)) { return "" }
    try {
        $v = Get-Content -Raw -LiteralPath $bv | ConvertFrom-Json
        return "$($v.MajorVersion).$($v.MinorVersion)"
    } catch { return "" }
}

function Get-HfEngineRoot {
    <#
      Resolution order (first hit wins; the winning source is printed once per session):
        1. $env:UE_ROOT                                                      explicit override (warns if its Build.version disagrees)
        2. C:\Program Files\Epic Games\UE_<ver>                              default Launcher path, accepted only when
                                                                             Engine\Build\Build.version says Major.Minor == <ver>
                                                                             (the Launcher may not have written its registry
                                                                             keys / LauncherInstalled.dat yet - seen 2026-09-06)
        3. HKLM:\SOFTWARE\EpicGames\Unreal Engine\<ver>\InstalledDirectory  Launcher installs (registered)
        4. HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds                    registered source/custom builds, matched via Build.version
      Throws with a pointer to Docs/TOOLCHAIN-SETUP.md when nothing matches.
    #>
    param([string]$Version)
    if (-not $Version) { $Version = Get-HfEngineAssociation }
    if ($script:HfEngineRootCache.ContainsKey($Version)) { return $script:HfEngineRootCache[$Version] }
    $tried = @()
    $found = ""
    $source = ""

    # 1. explicit override
    if ($env:UE_ROOT) {
        if (Test-HfEngineRoot $env:UE_ROOT) {
            $found = $env:UE_ROOT
            $source = "`$env:UE_ROOT"
            $actual = Get-HfBuildVersionMajorMinor $env:UE_ROOT
            if ($actual -and $actual -ne $Version) {
                Write-Warning "UE_ROOT points at Unreal Engine $actual but Hellfall.uproject asks for $Version; using it anyway."
            }
        } else {
            $tried += "UE_ROOT=$($env:UE_ROOT) (no Engine\Binaries\Win64\UnrealEditor-Cmd.exe)"
        }
    }

    # 2. default Launcher path, validated by Build.version
    if (-not $found) {
        $pf = $env:ProgramFiles
        if (-not $pf) { $pf = "C:\Program Files" }
        $default = Join-Path $pf "Epic Games\UE_$Version"
        if (Test-HfEngineRoot $default) {
            $actual = Get-HfBuildVersionMajorMinor $default
            if ($actual -eq $Version) {
                $found = $default
                $source = "default Launcher path (Build.version $actual)"
            } else {
                $tried += "$default (Build.version says '$actual', expected $Version)"
            }
        } else {
            $tried += $default
        }
    }

    # 3. Launcher registry key
    if (-not $found) {
        $key = "HKLM:\SOFTWARE\EpicGames\Unreal Engine\$Version"
        if (Test-Path $key) {
            $dir = (Get-ItemProperty -Path $key).InstalledDirectory
            if (Test-HfEngineRoot $dir) {
                $found = $dir
                $source = $key
            }
        }
        if (-not $found) { $tried += $key }
    }

    # 4. registered source/custom builds
    if (-not $found) {
        $bkey = "HKCU:\SOFTWARE\Epic Games\Unreal Engine\Builds"
        if (Test-Path $bkey) {
            $props = Get-ItemProperty -Path $bkey
            foreach ($p in $props.PSObject.Properties) {
                if ($p.Name -like "PS*") { continue }
                $dir = [string]$p.Value
                if ((Get-HfBuildVersionMajorMinor $dir) -eq $Version -and (Test-HfEngineRoot $dir)) {
                    $found = $dir
                    $source = "$bkey\$($p.Name)"
                    break
                }
            }
        }
        if (-not $found) { $tried += $bkey }
    }

    if ($found) {
        Write-Host "HELLFALL: Unreal Engine $Version = $found  (resolved from $source)" -ForegroundColor DarkGray
        $script:HfEngineRootCache[$Version] = $found
        return $found
    }
    throw ("Unreal Engine $Version is not installed on this machine (tried: " + ($tried -join "; ") + "). " +
           "Install it through the Epic Games Launcher (interactive Epic sign-in required) as described in " +
           "Docs/TOOLCHAIN-SETUP.md, 'Step 1 - Install Unreal Engine 5.8', or set `$env:UE_ROOT to an existing engine folder.")
}

function Get-HfEditorCmd { return (Join-Path (Get-HfEngineRoot) "Engine\Binaries\Win64\UnrealEditor-Cmd.exe") }
function Get-HfBuildBat  { return (Join-Path (Get-HfEngineRoot) "Engine\Build\BatchFiles\Build.bat") }
function Get-HfRunUAT    { return (Join-Path (Get-HfEngineRoot) "Engine\Build\BatchFiles\RunUAT.bat") }

function Test-HfInstalledBuild {
    # True for a Launcher ("Rocket") engine: Engine\Build\InstalledBuild.txt exists, no engine source to compile.
    return (Test-Path -LiteralPath (Join-Path (Get-HfEngineRoot) "Engine\Build\InstalledBuild.txt"))
}

function Get-HfEngineVersionString {
    # e.g. "5.8.2-56702186+++UE5+Release-5.8"
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

function New-HfNoCodeTwin {
    <#
      Writes HellfallNoCode.uproject next to Hellfall.uproject: the same JSON minus "Modules" (so the editor
      never asks for UnrealEditor-Hellfall.dll), Description marked TEMPORARY.  Map generation only needs the
      Python plugin, not the game module, so this lets Tools/ue/run_editor_script.ps1 work before the C++
      compiles.  The caller deletes the file when done; it is git-ignored and must never be committed.
      Returns the twin's path.
    #>
    param([string]$UProject)
    if (-not $UProject) { $UProject = Get-HfUProject }
    $json = Get-Content -Raw -LiteralPath $UProject | ConvertFrom-Json
    if ($json.PSObject.Properties["Modules"]) { $json.PSObject.Properties.Remove("Modules") }
    $desc = "TEMPORARY code-free twin of Hellfall.uproject, generated by Tools/ue/run_editor_script.ps1 so editor Python (map generation) can run before the C++ module is compiled. Deleted after the run. Never commit this file."
    if ($json.PSObject.Properties["Description"]) {
        $json.Description = $desc
    } else {
        $json | Add-Member -NotePropertyName "Description" -NotePropertyValue $desc
    }
    $twin = Join-Path (Split-Path -Parent $UProject) "HellfallNoCode.uproject"
    $text = $json | ConvertTo-Json -Depth 20
    [IO.File]::WriteAllText($twin, $text, (New-Object Text.UTF8Encoding $false))
    return $twin
}

function New-HfTail {
    # State for Write-HfTail: prints the lines appended to a file since the last call (live output of a
    # redirected process).  The file is opened with FileShare.ReadWrite so the writer is never disturbed.
    param([string]$Path)
    return @{ Path = $Path; Offset = [long]0; Pending = "" }
}

function Write-HfTail {
    param([hashtable]$State, [switch]$Final)
    if (-not (Test-Path -LiteralPath $State.Path)) { return }
    $text = ""
    $fs = $null
    try {
        $fs = [IO.File]::Open($State.Path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $avail = $fs.Length - $State.Offset
        if ($avail -gt 0) {
            $null = $fs.Seek($State.Offset, [IO.SeekOrigin]::Begin)
            $buf = New-Object byte[] $avail
            $n = $fs.Read($buf, 0, $buf.Length)
            $State.Offset += $n
            $text = [Text.Encoding]::UTF8.GetString($buf, 0, $n)
        }
    } catch {
        return   # sharing violation or truncated file: try again on the next poll
    } finally {
        if ($fs) { $fs.Dispose() }
    }
    if (-not $text -and -not $Final) { return }
    $lines = ($State.Pending + $text) -split "`n"
    $last = $lines.Count - 1
    for ($i = 0; $i -lt $last; $i++) { Write-Host ($lines[$i].TrimEnd("`r")) }
    $State.Pending = $lines[$last]
    if ($Final -and $State.Pending) {
        Write-Host ($State.Pending.TrimEnd("`r"))
        $State.Pending = ""
    }
}

function Invoke-HfProcess {
    <#
      Runs a native executable with a raw argument line (so embedded quotes reach the child intact -
      PowerShell 5.1's own native-argument quoting mangles things like -project="C:\a b\x.uproject").
      Without -StdOutFile the child writes straight to the console.  With -StdOutFile its stdout is
      redirected to that file AND tailed to the console every 500 ms while it runs, so a multi-minute
      commandlet (first-run shader compiles) shows progress instead of silence.  Returns the exit code
      (throws when -ThrowOnError and code != 0).
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
    $params = @{ FilePath = $FilePath; NoNewWindow = $true; PassThru = $true }
    if ($ArgumentLine) { $params.ArgumentList = $ArgumentLine }
    if ($WorkingDirectory) { $params.WorkingDirectory = $WorkingDirectory }
    if (-not $StdOutFile) {
        $params.Wait = $true
        $proc = Start-Process @params
        $code = $proc.ExitCode
    } else {
        if (Test-Path -LiteralPath $StdOutFile) { Remove-Item -LiteralPath $StdOutFile -Force }
        $params.RedirectStandardOutput = $StdOutFile
        $proc = Start-Process @params
        $null = $proc.Handle      # PS 5.1: touch the handle now or ExitCode is empty after WaitForExit
        $tail = New-HfTail $StdOutFile
        while (-not $proc.HasExited) {
            Start-Sleep -Milliseconds 500
            Write-HfTail $tail
        }
        $proc.WaitForExit()
        Write-HfTail $tail -Final
        $code = $proc.ExitCode
    }
    if ($null -eq $code) { throw "'$([IO.Path]::GetFileName($FilePath))' exit code could not be read" }
    if ($ThrowOnError -and $code -ne 0) { throw "'$([IO.Path]::GetFileName($FilePath))' exited with code $code" }
    return $code
}

function Format-HfBytes {
    param([long]$Bytes)
    if ($Bytes -ge 1GB) { return ("{0:N2} GB" -f ($Bytes / 1GB)) }
    if ($Bytes -ge 1MB) { return ("{0:N1} MB" -f ($Bytes / 1MB)) }
    return ("{0:N0} KB" -f ($Bytes / 1KB))
}
