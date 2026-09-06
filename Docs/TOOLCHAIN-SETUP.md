# Toolchain setup - Rob's one-time manual steps

> **Status 2026-09-06:** Step 1 is **done** (Unreal Engine 5.8.2, CL 56702186, at `C:\Program Files\Epic Games\UE_5.8`; both maps already generate, see `BUILD.md` 1.1). Step 2 is **not done**: .NET SDK 8.0.424 and Blender 5.2.1 are already installed, but **Visual Studio 2022 Build Tools are not installed** - two winget attempts on 2026-09-06 were cancelled at the UAC prompt (installer exit code 1602), and the agent cannot elevate. **Rob does step 2 himself**, by either route below; nothing C++ compiles until then. The instructions below are kept complete so a clean machine can be set up from them.

Two things on this machine cannot be installed by the agent: **Unreal Engine** (the Epic Games Launcher needs your interactive Epic sign-in) and **Visual Studio Build Tools** (needs an Administrator UAC prompt). Everything else is scripted. Total attention needed from you: about five minutes spread over the steps below; the downloads run unattended.

Disk: UE 5.8 needs about 45 GB; Build Tools about 4 GB. C: has 194 GB free (audit 2026-09-05).

## Step 1 - Install Unreal Engine 5.8 (Epic Games Launcher)

1. Open the **Epic Games Launcher** (already installed, version 1.3.193) and sign in with your Epic account.
2. Left sidebar: **Unreal Engine**. Top tabs: **Library**.
3. Under **ENGINE VERSIONS** click the **+** tile. A new version slot appears.
4. Click the version number on the slot and choose the **latest 5.8.x** (5.8.0, 5.8.1, ... whichever is highest; 5.8.2 on 2026-09-06). Do not pick a 5.7 or a preview.
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

**Done 2026-09-06.** **Registry caveat:** right after the install the Launcher had written neither `HKLM\SOFTWARE\EpicGames\Unreal Engine\5.8` nor an entry in `C:\ProgramData\Epic\UnrealEngineLauncher\LauncherInstalled.dat` (its `InstallationList` was still empty). The scripts therefore resolve the engine in this order (`Tools/ue/_engine.ps1`): `$env:UE_ROOT`, then the default Launcher folder `C:\Program Files\Epic Games\UE_<EngineAssociation>` (accepted only when its `Engine\Build\Build.version` matches the EngineAssociation), then the HKLM key, then HKCU-registered source builds. The default folder is what works today. If you installed to another drive and the key is missing, set `$env:UE_ROOT = "D:\Epic\UE_5.8"` (the folder that contains `Engine\`) in the PowerShell session before running any script.

## Step 2 - Install the C++ toolchain, .NET SDK and Blender (needs an Administrator prompt)

**State 2026-09-06:** Build Tools are **not installed**. The agent started the winget line twice from a non-elevated shell; both times Windows raised the UAC prompt, it was cancelled, and the installer exited with code 1602 (user cancelled) having installed nothing. `vswhere` and `C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0` are still absent. The **Microsoft Store does not carry Build Tools**, so there is no Store route; use route A or route B. Lines 2 and 3 of route A are no-ops on this machine: `dotnet --list-sdks` already prints `8.0.424` and `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` exists; winget reports them as already installed. On a clean machine paste all three.

**Route A - winget from an elevated PowerShell (preferred, unattended).**

1. Press Start, type `PowerShell`, right-click **Windows PowerShell**, choose **Run as administrator**, click **Yes** on the UAC prompt (the window title must start with "Administrator:").
2. Paste the three lines below (all at once is fine) and press Enter. The first one takes 10-20 minutes and shows no progress bar; that is normal. Do not close the window until the prompt returns.

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.Net.Component.4.6.2.TargetingPack --includeRecommended"
winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements
winget install --id BlenderFoundation.Blender --exact --accept-source-agreements --accept-package-agreements
```

Or, from an ordinary (non-elevated) window, this single line opens the elevated session itself - one UAC prompt, click **Yes**, then leave the new window alone until it prints the winget result:

```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-Command','winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.Net.Component.4.6.2.TargetingPack --includeRecommended"'
```

**Route B - the Build Tools installer from Microsoft (interactive, same result).**

1. Open https://visualstudio.microsoft.com/downloads/ and scroll to **Tools for Visual Studio** > **Build Tools for Visual Studio 2022** > **Download**. This is the `vs_BuildTools.exe` bootstrapper (about 4 MB).
2. Run it, click **Yes** on the UAC prompt, and wait for the Visual Studio Installer to open the **Workloads** page.
3. Tick **Desktop development with C++**. In the **Installation details** pane on the right make sure these are ticked: **MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)** and **Windows 11 SDK (10.0.26100.0)**; the other defaults of the workload are harmless. Leave the install location at its default.
4. Click **Install** (bottom right). About 4 GB; 10-20 minutes. No reboot is needed. Close the installer when it reports success.

Either route installs the same components; route A is what `Tools/setup_toolchain.ps1 -Run` prints. What this installs and why:

| Package | Purpose |
|---|---|
| Visual Studio 2022 Build Tools, workload "Desktop development with C++" (`VCTools`) with the latest MSVC v14.4x x64 toolset and Windows 11 SDK 10.0.26100 | Compiles the `Hellfall` C++ module. UE 5.8 requires VS 2022 17.14 or later (or VS 2026) and Windows SDK 10.0.26100 or newer. No IDE is installed; the agent builds from the command line. |
| .NET SDK 8 | UnrealBuildTool and UnrealAutomationTool are .NET programs. Already installed here (8.0.424). |
| Blender (5.2.1 LTS is current) | Gate 2/4 asset preparation. Harmless to install now. Already installed here (5.2.1). |

If UnrealBuildTool later reports that it wants a specific MSVC toolset (UE 5.8 recommends v14.50), the agent will give you one more `winget ... --override "--add Microsoft.VisualStudio.Component.VC.<version>.x86.x64"` line with the exact component id taken from the error message. Do not guess it in advance. `// TODO(VERIFY 5.8): confirm whether UBT accepts the 14.4x toolset shipped with Build Tools 17.14 or insists on 14.50.`

3. No reboot is required. Close the Administrator window.

## Step 3 - Hand-off

On a clean machine: tell the agent "UE installed" once steps 1 and 2 are done. On this machine the engine is already in and the maps already generate (the agent ran both generators on 2026-09-06 with `run_editor_script.ps1 -NoCode`, which needs no compiler); the agent waits for the Build Tools install to finish and then runs, in order and unattended:

```powershell
.\Tools\generate_project_files.ps1
.\Tools\build_editor.ps1
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py      # re-run with the compiled module; identical output expected
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py
.\Tools\package.ps1 -Tag gate-0
.\Tools\release.ps1 -Tag gate-0
```

The exact engine version (`Engine\Build\Build.version`: 5.8.2, CL 56702186) is already recorded in `BUILD.md` section 1. Expect roughly one to two and a half hours of wall time on this laptop, most of it the first C++ build, shader compilation and the cook; none of it needs you.

## Verification (the agent runs these; you can too)

Every line should print `True`, a version, or a path. Any `False` means the corresponding step did not finish.

```powershell
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\Win64\UnrealEditor-Cmd.exe"
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\RunUAT.bat"
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Build\BatchFiles\Build.bat"
Test-Path "C:\Program Files\Epic Games\UE_5.8\Engine\Binaries\ThirdParty\Python3\Win64\python.exe"
Get-Content "C:\Program Files\Epic Games\UE_5.8\Engine\Build\Build.version"          # MajorVersion 5, MinorVersion 8, PatchVersion 2, Changelist 56702186
Get-ItemProperty "HKLM:\SOFTWARE\EpicGames\Unreal Engine\5.8" | Select-Object InstalledDirectory   # errors until the Launcher writes the key; harmless, see the Step 1 caveat
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
Test-Path "C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um\windows.h"
dotnet --list-sdks                                                                     # 8.0.424 [C:\Program Files\dotnet\sdk]
Test-Path "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
```

Results on 2026-09-06: the four UE `Test-Path` lines print `True`, `Build.version` shows 5.8.2 / 56702186, the registry line errors (key not written yet), `vswhere` prints nothing and the Windows SDK line is `False` (Build Tools not installed - step 2 is Rob's), `dotnet` prints `8.0.424`, Blender prints `True`.

Already present and verified on 2026-09-05 (nothing to do): git 2.53.0, git-lfs 3.7.1, gh 2.87.3 (signed in as RobleusCaesar), node 24.14.0, winget 1.29.290, Python 3.12.10 at `C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe` (not on PATH; the scripts call it by full path). Added 2026-09-06: Unreal Engine 5.8.2, .NET SDK 8.0.424, Blender 5.2.1.

## If something goes wrong

- **Launcher shows "Install" greyed out or asks for disk space:** free space on C: or choose another drive in the install dialog and tell the agent the path.
- **winget says "No package found":** run `winget source update` and paste the line again.
- **UAC did not appear / "Access is denied":** the PowerShell window was not elevated; repeat step 2, route A, line 1.
- **winget returns exit code 1602, or finishes in seconds having installed nothing:** the UAC prompt was cancelled (or the shell was not elevated). This is what happened twice on 2026-09-06. Run route A from an elevated window or use route B; the Microsoft Store does not offer Build Tools.
- **Build Tools installed but `vswhere` prints nothing:** the `--override` string was mangled by a line wrap. Re-run the first line exactly as one line.
