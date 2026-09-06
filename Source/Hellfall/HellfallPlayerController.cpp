// HELLFALL player controller (REQ-G1-003).
#include "HellfallPlayerController.h"

#include "Hellfall.h"
#include "HellfallTuning.h"
#include "Camera/PlayerCameraManager.h"
#include "Engine/World.h"
#include "Framework/Application/SlateApplication.h"

AHellfallPlayerController::AHellfallPlayerController()
{
	bShowMouseCursor = false;
}

void AHellfallPlayerController::BeginPlay()
{
	Super::BeginPlay();

	ApplyCameraLimitsFromTuning();
	EnterGameInputMode();

	// Focus handling (REQ-G1-003 "focus loss releases the mouse; regaining focus does not snap the
	// camera"). Slate raises this for the OS window activation of the game window. Guarded because a
	// commandlet (Python level generation) has no Slate application.
	if (FSlateApplication::IsInitialized())
	{
		ActivationChangedHandle = FSlateApplication::Get().OnApplicationActivationStateChanged().AddUObject(
			this, &AHellfallPlayerController::HandleApplicationActivationChanged);
	}
}

void AHellfallPlayerController::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	if (ActivationChangedHandle.IsValid() && FSlateApplication::IsInitialized())
	{
		FSlateApplication::Get().OnApplicationActivationStateChanged().Remove(ActivationChangedHandle);
	}
	ActivationChangedHandle.Reset();

	Super::EndPlay(EndPlayReason);
}

void AHellfallPlayerController::PlayerTick(float DeltaTime)
{
	Super::PlayerTick(DeltaTime);

	// Input for this frame has been processed inside Super (TickPlayerInput), so the one-frame
	// look-delta suppression raised on focus regain has done its job.
	bIgnoreNextLookDelta = false;
}

void AHellfallPlayerController::ApplyCameraLimitsFromTuning()
{
	// Pitch clamp +-89 deg (REQ-G1-003), values from Data/movement.json via the tuning subsystem.
	FHellfallMovementTuning Tuning;
	if (const UHellfallTuning* TuningSubsystem = UHellfallTuning::Get(this))
	{
		Tuning = TuningSubsystem->GetMovementTuning();
	}
	if (PlayerCameraManager)
	{
		PlayerCameraManager->ViewPitchMin = Tuning.PitchMinDeg;
		PlayerCameraManager->ViewPitchMax = Tuning.PitchMaxDeg;
	}
	else
	{
		UE_LOG(LogHellfall, Warning, TEXT("PlayerController: no PlayerCameraManager at BeginPlay; pitch clamp not applied"));
	}
}

void AHellfallPlayerController::EnterGameInputMode()
{
	SetInputMode(FInputModeGameOnly());
	bShowMouseCursor = false;
}

void AHellfallPlayerController::EnterPausedInputMode()
{
	// GameAndUI keeps UGameViewportClient::IgnoreInput false (UIOnly sets it true and the viewport then
	// drops every key before the controller sees it), so the Pause action's bTriggerWhenPaused mapping
	// still fires; the cursor is released and shown for the reviewer.
	FInputModeGameAndUI GameAndUI;
	GameAndUI.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
	GameAndUI.SetHideCursorDuringCapture(false);
	SetInputMode(GameAndUI);
	bShowMouseCursor = true;
}

void AHellfallPlayerController::HandleApplicationActivationChanged(const bool bIsActive)
{
	bApplicationInactive = !bIsActive;

	if (!bIsActive)
	{
		// Focus lost: hand the mouse back to the OS and drop every held key (a held Shift must not keep sprinting).
		FInputModeUIOnly UIOnly;
		UIOnly.SetLockMouseToViewportBehavior(EMouseLockMode::DoNotLock);
		SetInputMode(UIOnly);
		bShowMouseCursor = true;
		FlushPressedKeys();
		return;
	}

	// Focus regained. Whatever mouse travel accumulated while unfocused arrives as one large delta on
	// this frame; the character skips exactly that one Look sample so the view does not snap.
	bIgnoreNextLookDelta = true;
	// Always leave the UI-only mode set on focus loss. Left in place while paused, its IgnoreInput flag
	// would swallow the pause key and the game could never resume (pause -> alt-tab -> alt-tab back ->
	// Escape did nothing; only the console or killing the process got out).
	if (IsPaused())
	{
		EnterPausedInputMode();
	}
	else
	{
		EnterGameInputMode();
	}
}

void AHellfallPlayerController::TogglePauseMenuless()
{
	// Gate 1 has no menu (REQ-G6-001 adds it). The pause key freezes the world and frees the cursor;
	// the same key resumes because the Pause input action has bTriggerWhenPaused = true and the
	// controller keeps ticking input while paused (PrimaryActorTick.bTickEvenWhenPaused).
	if (IsPaused())
	{
		SetPause(false);
		EnterGameInputMode();
	}
	else
	{
		if (SetPause(true))
		{
			EnterPausedInputMode();
		}
	}
}
