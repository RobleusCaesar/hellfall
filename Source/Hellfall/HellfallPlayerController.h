// HELLFALL player controller (REQ-G1-003: pitch clamp; focus loss releases the mouse; regaining
// focus does not snap the camera).
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/PlayerController.h"
#include "HellfallPlayerController.generated.h"

UCLASS()
class AHellfallPlayerController : public APlayerController
{
	GENERATED_BODY()

public:
	AHellfallPlayerController();

	// AActor
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;

	// APlayerController
	virtual void PlayerTick(float DeltaTime) override;

	/** True for the single input frame after the window regains focus. The character drops that
	 *  frame's look delta so the mouse travel accumulated while unfocused cannot snap the view. */
	bool ShouldIgnoreLookDelta() const { return bIgnoreNextLookDelta; }

	/** Gate-1 pause: no menu yet (REQ-G6-001). Pauses the world, shows the cursor, and lets the same key resume. */
	void TogglePauseMenuless();

	/** Mouse captured, cursor hidden, all input to the game. */
	void EnterGameInputMode();

	/** Paused: cursor free and visible, keys still reach the pawn's input component (so the pause key can resume). */
	void EnterPausedInputMode();

private:
	void HandleApplicationActivationChanged(const bool bIsActive);
	void ApplyCameraLimitsFromTuning();

	FDelegateHandle ActivationChangedHandle;
	bool bIgnoreNextLookDelta = false;
	/** Set while the OS window is inactive so PlayerTick does not fight the UI-only input mode. */
	bool bApplicationInactive = false;
};
