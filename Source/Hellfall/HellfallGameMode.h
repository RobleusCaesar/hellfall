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

	/**
	 * Review aid: the map URL option "?spawn=X,Y,Z,Yaw" (Unreal cm and degrees; Z is the floor level, the capsule is
	 * lifted automatically) overrides the PlayerStart for the local player, e.g.
	 *     Hellfall.exe /Game/Maps/L_ExecutiveFloor?spawn=1590,-1240,0,90
	 * Used by Tools/screenshot_sweep.ps1 (Data/review_shots.json) and for jumping straight to a room during a gate
	 * review. Without the option the normal PlayerStart flow applies. Not a gameplay feature.
	 */
	virtual APawn* SpawnDefaultPawnFor_Implementation(AController* NewPlayer, AActor* StartSpot) override;
	virtual void SetPlayerDefaults(APawn* PlayerPawn) override;

private:
	/** Parses the "spawn" URL option. Returns false when absent or malformed (then the PlayerStart is used). */
	bool ParseSpawnOption(FVector& OutFloorLocation, float& OutYawDeg) const;
};
