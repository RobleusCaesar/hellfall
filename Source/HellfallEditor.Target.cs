// HELLFALL - editor target (REQ-G1-001). Used by Tools/build_editor.ps1 and by the Python level
// generators (Tools/ue/*.py run through UnrealEditor-Cmd.exe -run=pythonscript).
using UnrealBuildTool;
using System.Collections.Generic;

public class HellfallEditorTarget : TargetRules
{
	public HellfallEditorTarget(TargetInfo Target) : base(Target)
	{
		Type = TargetType.Editor;

		// See Hellfall.Target.cs for the version notes.
		DefaultBuildSettings = BuildSettingsVersion.V5;
		IncludeOrderVersion = EngineIncludeOrderVersion.Latest;

		ExtraModuleNames.AddRange(new string[] { "Hellfall" });
	}
}
