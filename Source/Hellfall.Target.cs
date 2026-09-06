// HELLFALL - game target (REQ-G1-001). Packaged by Tools/package.ps1 via UAT BuildCookRun.
using UnrealBuildTool;
using System.Collections.Generic;

public class HellfallTarget : TargetRules
{
	public HellfallTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;

		// V7 == BuildSettingsVersion.Latest in UE 5.8 (Engine/Source/Programs/UnrealBuildTool/Configuration/
		// Rules/TargetRules.cs). Anything older makes UBT print "[Upgrade] Using backward-compatible build
		// settings" on every build. V6/V7 promote the undefined-identifier, return-type, dangling,
		// unreachable-code and shadow-variable warnings to errors: if one shows up, fix the code, do not downgrade.
		DefaultBuildSettings = BuildSettingsVersion.V7;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.AddRange(new string[] { "Hellfall" });
	}
}
