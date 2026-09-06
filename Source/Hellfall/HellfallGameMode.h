// HELLFALL game mode (REQ-G1-001). Wires the C++ classes together; set as GlobalDefaultGameMode in Config/DefaultEngine.ini.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/GameModeBase.h"
#include "HellfallGameMode.generated.h"

UCLASS()
class AHellfallGameMode : public AGameModeBase
{
	GENERATED_BODY()

public:
	AHellfallGameMode();
};
