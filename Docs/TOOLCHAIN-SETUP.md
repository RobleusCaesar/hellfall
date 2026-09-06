# Toolchain setup - Rob's one-time manual steps

> **Status 2026-09-06: steps 1 and 2 (including 2b) are DONE on this machine.** Step 1: Unreal Engine 5.8.2 (CL 56702186) at `C:\Program Files\Epic Games\UE_5.8`. Step 2: Visual Studio 2022 Build Tools **17.14.37614** (`VCTools` workload, MSVC 14.44.35207, Windows SDK 10.0.26100, .NET Framework 4.6.2 targeting pack), installed by Rob through the Build Tools installer (route B) after the agent's two winget attempts had been cancelled at the UAC prompt. Step 2b: the **.NET Framework 4.8.1 Developer Pack**, a requirement that only surfaced on the first build (symptom and fix below). .NET SDK 8.0.424 and Blender 5.2.1 were already present. With that, the C++ module compiled, both maps were regenerated and the gate-0 package was built and smoke-tested on 2026-09-06 (`BUILD.md` 1.3, `GATE-0-NOTES.md`). The instructions are kept complete so a clean machine can be set up from them.

Two kinds of thing on this machine could not be installed by the agent: **Unreal Engine** (the Epic Games Launcher needs your interactive Epic sign-in) and anything that needs an **Administrator UAC prompt** (Build Tools, the .NET Framework Developer Pack). Everything else is scripted. Total attention needed from you: about five minutes spread over the steps below; the downloads run unattended.

Disk: UE 5.8 needs about 45 GB; Build Tools about 4 GB. C: had 194 GB free (audit 2026-09-05).

## Step 1 - Install Unreal Engine 5.8 (Epic Games Launcher) - DONE 2026-09-06

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

## Step 2 - Install the C++ toolchain, .NET SDK and Blender (needs an Administrator prompt) - DONE 2026-09-06

**State 2026-09-06: done.** What happened on this machine: the agent started the winget line twice from a non-elevated shell; both times the UAC prompt was cancelled and the installer exited with code 1602 having installed nothing. Rob then ran the Build Tools installer (route B). `vswhere` now reports `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools`, `installationVersion` 17.14.37614.0 (display version 17.14.39), with MSVC `14.44.35207` and Windows SDK `10.0.26100.0`. The very first build then failed at rules time for want of a .NET Framework **SDK** (the workload only brings the 4.6.2 *targeting pack*) - that is step 2b, now also done. Lines 2 and 3 of route A were no-ops here: `dotnet --list-sdks` already printed `8.0.424` and `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` existed. On a clean machine paste all three; the route A lines below already include the .NET Framework 4.8 SDK component so step 2b does not recur.

**Route A - winget from an elevated PowerShell (preferred, unattended).**

1. Press Start, type `PowerShell`, right-click **Windows PowerShell**, choose **Run as administrator**, click **Yes** on the UAC prompt (the window title must start with "Administrator:").
2. Paste the three lines below (all at once is fine) and press Enter. The first one takes 10-20 minutes and shows no progress bar; that is normal. Do not close the window until the prompt returns.

```powershell
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.Net.Component.4.6.2.TargetingPack --add Microsoft.Net.Component.4.8.SDK --includeRecommended"
winget install --id Microsoft.DotNet.SDK.8 --exact --accept-source-agreements --accept-package-agreements
winget install --id BlenderFoundation.Blender --exact --accept-source-agreements --accept-package-agreements
```

Or, from an ordinary (non-elevated) window, this single line opens the elevated session itself - one UAC prompt, click **Yes**, then leave the new window alone until it prints the winget result:

```powershell
Start-Process powershell -Verb RunAs -ArgumentList '-NoExit','-Command','winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --accept-source-agreements --accept-package-agreements --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --add Microsoft.VisualStudio.Component.VC.Tools.x86.x64 --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --add Microsoft.Net.Component.4.6.2.TargetingPack --add Microsoft.Net.Component.4.8.SDK --includeRecommended"'
```

**Route B - the Build Tools installer from Microsoft (interactive, same result; what was used on this machine).**

1. Open https://visualstudio.microsoft.com/downloads/ and scroll to **Tools for Visual Studio** > **Build Tools for Visual Studio 2022** > **Download**. This is the `vs_BuildTools.exe` bootstrapper (about 4 MB).
2. Run it, click **Yes** on the UAC prompt, and wait for the Visual Studio Installer to open the **Workloads** page.
3. Tick **Desktop development with C++**. In the **Installation details** pane on the right make sure these are ticked: **MSVC v143 - VS 2022 C++ x64/x86 build tools (Latest)** and **Windows 11 SDK (10.0.26100.0)**; the other defaults of the workload are harmless. Then switch to the **Individual components** tab and tick **.NET Framework 4.8 SDK** (component id `Microsoft.Net.Component.4.8.SDK`) - UE's build rules need a .NET Framework *SDK*, not only the targeting pack the workload brings (step 2b explains the symptom if it is missed). Leave the install location at its default.
4. Click **Install** (bottom right). About 4 GB; 10-20 minutes. No reboot is needed. Close the installer when it reports success.

Either route installs the same components; route A is what `Tools/setup_toolchain.ps1 -Run` prints. What this installs and why:

| Package | Purpose |
|---|---|
| Visual Studio 2022 Build Tools, workload "Desktop development with C++" (`VCTools`) with the MSVC v14.44 x64 toolset and Windows 11 SDK 10.0.26100 | Compiles the `Hellfall` C++ module. UE 5.8 requires VS 2022 17.14 or later (or VS 2026) and Windows SDK 10.0.26100 or newer. No IDE is installed; the agent builds from the command line. |
| .NET Framework 4.8 SDK (`Microsoft.Net.Component.4.8.SDK`), or the standalone .NET Framework 4.8.1 Developer Pack | UnrealBuildTool's rules for the editor module `SwarmInterface` require a NetFxSDK install directory on Win64 and throw without one (step 2b). |
| .NET SDK 8 | UnrealBuildTool and UnrealAutomationTool are .NET programs. Already installed here (8.0.424). |
| Blender (5.2.1 LTS is current) | Gate 2/4 asset preparation. Harmless to install now. Already installed here (5.2.1). |

**Verified 2026-09-06 - MSVC toolset:** UnrealBuildTool 5.8.2 accepts the MSVC 14.44 toolset shipped with Build Tools 17.14. All three build logs say `Using Visual Studio 14.44.35228 toolchain (C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC\14.44.35207) and Windows 10.0.26100.0 SDK (C:\Program Files (x86)\Windows Kits\10).` and raise no toolset complaint; the module compiled and linked. No v14.50 component is needed, and no extra `--add Microsoft.VisualStudio.Component.VC.<version>.x86.x64` line is required.

No reboot is required after step 2. Close the Administrator window.

## Step 2b - .NET Framework SDK 4.8.x (required; discovered on the first build) - DONE 2026-09-06

**Symptom.** With Build Tools installed but no .NET Framework SDK, the first `Tools\build_editor.ps1` fails within a minute, before any C++ is compiled, with `Result: Failed (RulesError)` and this line (`Saved/Logs/build_editor_first.log`, 43.62 s):

```
Unable to instantiate module 'SwarmInterface': Could not find NetFxSDK install dir; this will prevent SwarmInterface from installing.  Install a version of .NET Framework SDK at 4.6.0 or higher.
```

It comes from `Engine/Source/Editor/SwarmInterface/SwarmInterface.Build.cs` (a hard throw on Win64). The Build Tools workload brings the .NET Framework 4.6.2 *targeting pack*; that is not the SDK.

**Fix - either of these (one Administrator prompt):**

- **The Build Tools component** `Microsoft.Net.Component.4.8.SDK` (".NET Framework 4.8 SDK" on the installer's Individual components tab; already in the route A lines above). On this machine `setup.exe modify` to add it returned **exit code 5007** - the Visual Studio Installer refuses to modify while a reboot is pending - so the second route was used instead.
- **The standalone Developer Pack** (what was used here; winget id `Microsoft.DotNet.Framework.DeveloperPack_4`), from an elevated PowerShell, or from an ordinary one with a single UAC click:

```powershell
winget install --id Microsoft.DotNet.Framework.DeveloperPack_4 --exact --accept-source-agreements --accept-package-agreements
```

It installs the Microsoft .NET Framework 4.8.1 Developer Pack and creates `C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1` (`Include\`, `Lib\`). UnrealBuildTool found it on the next run without any configuration; the build proceeded to the C++ compile.

## Step 3 - Hand-off - DONE 2026-09-06

On a clean machine: tell the agent "toolchain installed" once steps 1, 2 and 2b are done, and it runs the list below unattended. On this machine that has happened; the times are what it took on this laptop (`GATE-0-NOTES.md` section 5 has the attempt-by-attempt detail):

```powershell
.\Tools\generate_project_files.ps1                             # OK, 18.5 s -> Hellfall.slnx (git-ignored)
.\Tools\build_editor.ps1                                       # rules error (step 2b) -> first compile, one error pair fixed in 49e9696 -> Result: Succeeded
.\Tools\ue\run_editor_script.ps1 -Script build_greybox.py      # 249 actors, 0 errors, 0 warnings (committed 12faf06)
.\Tools\ue\run_editor_script.ps1 -Script build_feel_gym.py     # 171 actors, 0 errors, 0 warnings (committed 12faf06)
.\Tools\package.ps1 -Tag gate-0                                # BUILD SUCCESSFUL, 211 s -> Builds\Hellfall-gate-0-Win64-Development.zip, 327.1 MB
.\Tools\release.ps1 -Tag gate-0                                # gh release create gate-0 --notes-file GATE-0-NOTES.md <zip> (run by the lead)
```

The exact engine version (`Engine\Build\Build.version`: 5.8.2, CL 56702186) is recorded in `BUILD.md` section 1. The whole chain, including the two failed build attempts, took well under the one-to-two-and-a-half-hour estimate; none of it needed you beyond the two UAC clicks.

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
& "C:\Program Files (x86)\Microsoft Visual Studio\Installer\vswhere.exe" -products * -property installationVersion   # 17.14.37614.0
Get-ChildItem "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Tools\MSVC" -Name                  # 14.44.35207
Test-Path "C:\Program Files (x86)\Windows Kits\10\Include\10.0.26100.0\um\windows.h"
Test-Path "C:\Program Files (x86)\Windows Kits\NETFXSDK\4.8.1\Include"                                             # step 2b
dotnet --list-sdks                                                                     # 8.0.424 [C:\Program Files\dotnet\sdk]
Test-Path "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe"
Test-Path ".\Binaries\Win64\UnrealEditor-Hellfall.dll"                                # only after Tools\build_editor.ps1 has succeeded
```

Results on 2026-09-06 (after steps 2 and 2b): the four UE `Test-Path` lines print `True`, `Build.version` shows 5.8.2 / 56702186, the registry line errors (key not written yet), `vswhere` prints `C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools` and `17.14.37614.0`, the MSVC folder is `14.44.35207`, the Windows SDK and NETFXSDK lines are `True`, `dotnet` prints `8.0.424`, Blender prints `True`, and `UnrealEditor-Hellfall.dll` is `True` (488,448 bytes).

Already present and verified on 2026-09-05 (nothing to do): git 2.53.0, git-lfs 3.7.1, gh 2.87.3 (signed in as RobleusCaesar), node 24.14.0, winget 1.29.290, Python 3.12.10 at `C:\Users\tc_ca\AppData\Local\Programs\Python\Python312\python.exe` (not on PATH; the scripts call it by full path). Added 2026-09-06: Unreal Engine 5.8.2, Blender 5.2.1, Visual Studio 2022 Build Tools 17.14.37614, .NET Framework 4.8.1 Developer Pack (.NET SDK 8.0.424 was already there).

## If something goes wrong

- **Launcher shows "Install" greyed out or asks for disk space:** free space on C: or choose another drive in the install dialog and tell the agent the path.
- **winget says "No package found":** run `winget source update` and paste the line again.
- **UAC did not appear / "Access is denied":** the PowerShell window was not elevated; repeat step 2, route A, line 1.
- **winget returns exit code 1602, or finishes in seconds having installed nothing:** the UAC prompt was cancelled (or the shell was not elevated). This is what happened twice on 2026-09-06. Run route A from an elevated window or use route B; the Microsoft Store does not offer Build Tools.
- **Build Tools installed but `vswhere` prints nothing:** the `--override` string was mangled by a line wrap. Re-run the first line exactly as one line.
- **`build_editor.ps1` fails at once with `Could not find NetFxSDK install dir ... Install a version of .NET Framework SDK at 4.6.0 or higher`:** step 2b - install the .NET Framework 4.8 SDK component or the standalone 4.8.1 Developer Pack, then rerun. Nothing in the project is wrong.
- **The Visual Studio Installer (`setup.exe modify`) exits with code 5007:** a reboot is pending and the installer refuses to modify until it happens. Either reboot and retry, or use the standalone Developer Pack (step 2b), which does not need the reboot.
