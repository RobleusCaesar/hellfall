// HELLFALL game mode (REQ-G1-001).
#include "HellfallGameMode.h"

#include "HellfallCharacter.h"
#include "HellfallHUD.h"
#include "HellfallPlayerController.h"

AHellfallGameMode::AHellfallGameMode()
{
	DefaultPawnClass = AHellfallCharacter::StaticClass();
	PlayerControllerClass = AHellfallPlayerController::StaticClass();
	HUDClass = AHellfallHUD::StaticClass();
	// Escape-to-pause (Gate 1, menuless) needs the game mode to allow pausing; AGameModeBase defaults bPauseable = true.
}
