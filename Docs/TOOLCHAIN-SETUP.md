# Toolchain setup - Rob's one-time manual steps

Two things on this machine cannot be installed by the agent: **Unreal Engine** (the Epic Games Launcher needs your interactive Epic sign-in) and **Visual Studio Build Tools** (needs an Administrator UAC prompt). Everything else is scripted. Total attention needed from you: about five minutes spread over the steps below; the downloads run unattended.

Disk: UE 5.8 needs about 45 GB; Build Tools about 4 GB. C: has 194 GB free (audit 2026-09-05).

## Step 1 - Install Unreal Engine 5.8 (Epic Games Launcher)

1. Open the **Epic Games Launcher** (already installed, version 1.3.193) and sign in with your Epic account.
2. Left sidebar: **Unreal Engine**. Top tabs: **Library**.
3. Under **ENGINE VERSIONS** click the **+** tile. A new version slot appears.
4. Click the version number on the slot and choose the **latest 5.8.x** (5.8.0, 5.8.1, ... whichever is highest). Do not pick a 5.7 or a preview.
5. Click **Install**. In the dialog:
   - **Install location:** keep the default `C:\Program Files\Epic Games\UE_5.8`. The scripts look there first and then in the launcher's install registry, so a different drive also works - just tell the agent.
   - Click **Options** and set:
     - Core Components - required, stays on.
     - **Starter Content - uncheck** (not used; ~1 GB).
     - Templates and Feature Packs - uncheck (the project is created from files, not a template).
     - Engine Source - uncheck (not needed for a Launcher build).
     - **Editor symbols for debugging - UNCHECK** (saves ~30 GB and hours of download).
     - Target Platforms - uncheck all (Android, iOS, Linux, TVOS...). Windows is always included.
   - **Apply**, then **Install**.
6. Wait until the slot's button says **Launch**. You do not need to launch it; the agent drives it from the command line.

## Step 2 - Install the C++ toolchain, .NET SDK and Blender (PowerShell as Administrator)

1. Press Start, type `PowerShell`, right-click **Windows PowerShell**, choose **Run as administrator**, accept the UAC prompt.
2. Paste the three lines below (all at once is fine) and press Enter. The first one takes 10-20 minutes and shows no progress bar; that is normal.

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.Net.Component.4.6.2.TargetingPack --includeRecommended"
winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements
winget install --id BlenderFoundation.Blender --exact --accept-source-agreements --accept-package-agreements
```

What this installs and why:

| Package | Purpose |
|---|---|
| Visual Studio 2022 Build Tools, workload "Desktop development with C++" (`VCTools`) with the latest MSVC v14.4x x64 toolset and Windows 11 SDK 10.0.26100 | Compiles the `Hellfall` C++ module. UE 5.8 requires VS 2022 17.14 or later (or VS 2026) and Windows SDK 10.0.26100 or newer. No IDE is installed; the agent builds from the command line. |
| .NET SDK 8 | UnrealBuildTool and UnrealAutomationTool are .NET programs. |
| Blender (5.2.1 LTS is current) | Gate 2/4 asset preparation. Harmless to install now. |

If UnrealBuildTool later reports that it wants a specific MSVC toolset (UE 5.8 recommends v14.50), the agent will give you one more `winget ... --override "--add Microsoft.VisualStudio.Component.VC.<version>.x86.x64"` line with the exact component id taken from the error message. Do not guess it in advance. `// TODO(VERIFY 5.8): confirm whether UBT accepts the 14.4x toolset shipped with Build Tools 17.14 or insists on 14.50.`

3. No reboot is required. Close the Administrator window.

## Step 3 - Tell the agent "UE installed"

That is the whole hand-off. The agent then runs, in order and unattended:

```powershell
.\Tools\generate_project_files.ps1
.\Tools\build_editor.ps1
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py
.\Tools\package.ps1 -Tag gate-0
.\Tools\release.ps1 -Tag gate-0
```

and records the exact engine version (`Engine\Build\Build.version`) in `BUILD.md`. Expect roughly one to two and a half hours of wall time on this laptop, most of it the first shader compile and the cook; none of it needs you.

## Verification (the agent runs these; you can too)

Every line should print `True`, a version, or a path. Any `False` means the corresponding step did not finish.

```powershell
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\RunUAT.bat"
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat"
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\ThirdParty\Python3\Win64\python.exe"
Get-Content "C:\Program Files\Epic Games\UE_5.8\Engine\Build\Build.version"          # MajorVersion 5, MinorVersion 8, PatchVersion = hotfix
Get-ItemProperty "HKLM:\SOFTWARE\EpicGames\Unreal Engine\5.8" | Select-Object InstalledDirectory
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
Test-Path "C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um\windows.h"
dotnet --list-sdks                                                                     # an 8.x line
Test-Path "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
```

Already present and verified on 2026-09-05 (nothing to do): git 2.53.0, git-lfs 3.7.1, gh 2.87.3 (signed in as RobleusCaesar), node 24.14.0, winget 1.29.290, Python 3.12.10 at `C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe` (not on PATH; the scripts call it by full path).

## If something goes wrong

- **Launcher shows "Install" greyed out or asks for disk space:** free space on C: or choose another drive in the install dialog and tell the agent the path.
- **winget says "No package found":** run `winget source update` and paste the line again.
- **UAC did not appear / "Access is denied":** the PowerShell window was not elevated; repeat step 2.1.
- **Build Tools installed but `vswhere` prints nothing:** the `--override` string was mangled by a line wrap. Re-run the first line exactly as one line.
