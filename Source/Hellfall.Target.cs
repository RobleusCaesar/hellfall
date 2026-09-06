// HELLFALL - game target (REQ-G1-001). Packaged by Tools/package.ps1 via UAT BuildCookRun.
using UnrealBuildTool;
using System.Collections.Generic;

public class HellfallTarget : TargetRules
{
	public HellfallTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Game;

		// BuildSettingsVersion.V5 and EngineIncludeOrderVersion.Latest both exist since UE 5.4.
		// TODO(VERIFY 5.8): if UBT warns that a newer BuildSettingsVersion exists, bump V5 to it
		// (pure warning, not an error; behaviour of this project does not depend on it).
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.AddRange(new string[] { "Hellfall" });
	}
}
