// HELLFALL game mode (REQ-G1-001).
#include "HellfallGameMode.h"

#include "Components/CapsuleComponent.h"
#include "GameFramework/Character.h"
#include "GameFramework/Controller.h"
#include "Hellfall.h"
#include "HellfallCharacter.h"
#include "HellfallHUD.h"
#include "HellfallPlayerController.h"
#include "Kismet/GameplayStatics.h"

AHellfallGameMode::AHellfallGameMode()
{
	DefaultPawnClass = AHellfallCharacter::StaticClass();
	PlayerControllerClass = AHellfallPlayerController::StaticClass();
	HUDClass = AHellfallHUD::StaticClass();
	// Escape-to-pause (Gate 1, menuless) needs the game mode to allow pausing; AGameModeBase defaults bPauseable = true.
}

bool AHellfallGameMode::ParseSpawnOption(FVector& OutFloorLocation, float& OutYawDeg) const
{
	if (!UGameplayStatics::HasOption(OptionsString, TEXT("spawn")))
	{
		return false;
	}
	const FString Value = UGameplayStatics::ParseOption(OptionsString, TEXT("spawn"));
	TArray<FString> Parts;
	Value.ParseIntoArray(Parts, TEXT(","), true);
	if (Parts.Num() < 3)
	{
		UE_LOG(LogHellfall, Warning, TEXT("GameMode: ignoring malformed spawn option '%s' (expected X,Y,Z[,Yaw])"), *Value);
		return false;
	}
	OutFloorLocation = FVector(FCString::Atof(*Parts[0]), FCString::Atof(*Parts[1]), FCString::Atof(*Parts[2]));
	OutYawDeg = Parts.Num() >= 4 ? FCString::Atof(*Parts[3]) : 0.f;
	return true;
}

APawn* AHellfallGameMode::SpawnDefaultPawnFor_Implementation(AController* NewPlayer, AActor* StartSpot)
{
	FVector FloorLocation;
	float YawDeg = 0.f;
	if (ParseSpawnOption(FloorLocation, YawDeg))
	{
		// Lift the capsule so the feet sit on the requested floor height. The CDO carries the compiled default
		// half-height; the tuning subsystem re-applies the data value at InitializeComponent (92 cm for the shipped
		// data). A 2 cm margin avoids starting penetrated in the floor slab.
		float HalfHeight = 92.f;
		if (DefaultPawnClass)
		{
			if (const ACharacter* CharacterCDO = Cast<ACharacter>(DefaultPawnClass->GetDefaultObject()))
			{
				if (const UCapsuleComponent* Capsule = CharacterCDO->GetCapsuleComponent())
				{
					HalfHeight = Capsule->GetScaledCapsuleHalfHeight();
				}
			}
		}
		const FTransform SpawnTransform(FRotator(0.f, YawDeg, 0.f), FloorLocation + FVector(0.f, 0.f, HalfHeight + 2.f));
		UE_LOG(LogHellfall, Log, TEXT("GameMode: spawn override from URL option: floor %s yaw %.1f"), *FloorLocation.ToString(), YawDeg);
		return SpawnDefaultPawnAtTransform(NewPlayer, SpawnTransform);
	}
	return Super::SpawnDefaultPawnFor_Implementation(NewPlayer, StartSpot);
}

void AHellfallGameMode::SetPlayerDefaults(APawn* PlayerPawn)
{
	Super::SetPlayerDefaults(PlayerPawn);
	// FinishRestartPlayer() sets the control rotation from the PlayerStart's rotation AFTER the pawn is spawned, which
	// would undo the yaw from the spawn option; SetPlayerDefaults runs right after that, so re-apply it here.
	FVector FloorLocation;
	float YawDeg = 0.f;
	if (PlayerPawn && ParseSpawnOption(FloorLocation, YawDeg))
	{
		if (AController* Controller = PlayerPawn->GetController())
		{
			Controller->SetControlRotation(FRotator(0.f, YawDeg, 0.f));
		}
		PlayerPawn->SetActorRotation(FRotator(0.f, YawDeg, 0.f));
	}
}
