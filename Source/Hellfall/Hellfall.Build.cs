// HELLFALL runtime module rules (REQ-G1-001).
using UnrealBuildTool;

public class Hellfall : ModuleRules
{
	public Hellfall(ReadOnlyTargetRules Target) : base(Target)
	{
		PCHUsage = PCHUsageMode.UseExplicitOrSharedPCHs;

		PublicDependencyModuleNames.AddRange(new string[]
		{
			"Core",
			"CoreUObject",
			"Engine",
			"InputCore",       // FKey / EKeys (Data/movement.json "binds" are FKey names)
			"EnhancedInput",   // REQ-G1-003: mapping context + actions built in C++, no .uasset
			"Json",            // FJsonSerializer for Data/*.json
			"JsonUtilities",
			"Slate",           // FSlateApplication::OnApplicationActivationStateChanged (focus loss releases the mouse)
			"SlateCore"
		});

		PrivateDependencyModuleNames.AddRange(new string[] { });
	}
}
