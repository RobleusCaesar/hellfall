# Environment audit — 2026-09-05 (machine this project is being built on)

Captured by script on 2026-09-05 before any project work. This is the machine the agent runs on; Rob must confirm it is also the review machine (G-6).

## Hardware
| Item | Value |
|---|---|
| CPU | AMD Ryzen 7 7730U with Radeon Graphics, 8 cores / 16 threads (Zen 3, laptop U-class) |
| RAM | 15.4 GB usable |
| GPU | AMD Radeon (TM) Graphics — integrated Vega 8 class iGPU, 512 MB dedicated VRAM reported, shared system memory; driver 31.0.21924.1004 |
| Display | Samsung S27D390 external, 1920x1080 @ 60 Hz |
| Disk | C: 194 GB free of 456 GB; G: (Google Drive) 60 GB free of 100 GB |
| OS | Windows 11 Home 10.0.26200 (build 26200) |

## Software found
| Tool | State |
|---|---|
| Unreal Engine | NOT INSTALLED. Epic Games Launcher 1.3.193 present; `LauncherInstalled.dat` InstallationList is empty. No `UE_5*` folder on any drive. |
| Visual Studio / MSVC / Windows SDK | NOT INSTALLED (no vswhere products, no `Windows Kits\10\Include`). |
| .NET SDK | NOT INSTALLED at audit time (installed by agent via winget, see BUILD.md). |
| Blender | NOT INSTALLED at audit time (installed by agent via winget, see BUILD.md). |
| Python | NOT INSTALLED at audit time (Store alias only; installed by agent via winget). |
| git | 2.53.0.windows.1 |
| git-lfs | 3.7.1 |
| gh CLI | 2.87.3, authenticated as RobleusCaesar (scopes: gist, read:org, repo, workflow) |
| node | v24.14.0 |
| winget | v1.29.290 |

**Correction 2026-09-06:** .NET SDK 8.0.424 was already present at audit time (the row above is wrong; nothing was installed by the agent); Blender 5.2.1 was installed 2026-09-06; Unreal Engine 5.8.2 was installed 2026-09-06 by Rob through the Launcher; Visual Studio 2022 Build Tools are still not installed (two winget attempts on 2026-09-06 were cancelled at the UAC prompt, installer exit 1602). The live state is `BUILD.md` section 1; this file stays a dated snapshot.

## Consequences
- UE 5.8 Lumen requires NVIDIA RTX 2000+, AMD RX 6000+, or Intel Arc (Epic 5.8 hardware page). A Vega 8 iGPU does not qualify. Nanite requires SM6.6 atomics and is not viable at 60 fps on this GPU. **Default lighting path for this project is therefore static/baked lighting with no Lumen, no Nanite, no Virtual Shadow Maps**, recorded as a G-7 fallback decision in BUILD.md. If Rob's real review machine is a different, discrete-GPU machine, this decision is revisited before Gate 3.
- Unreal Engine cannot be installed unattended by the agent: the Epic Games Launcher requires an interactive Epic account sign-in. See `Docs/TOOLCHAIN-SETUP.md` for the exact steps Rob performs once.
