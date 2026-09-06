// HELLFALL first-person character (REQ-G1-003). Owns the camera and the Enhanced Input setup.
//
// All input assets (mapping context, actions, modifiers) are constructed in C++ from the binds in
// Data/movement.json - no .uasset, no Blueprint (G-3). Axis layout of the Move action:
//   X = right  (+ move_right / - move_left)
//   Y = forward (+ move_forward / - move_back)
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/Character.h"
#include "InputActionValue.h"
#include "HellfallMovementComponent.h"
#include "HellfallCharacter.generated.h"

class AHellfallPlayerController;
class UCameraComponent;
class UInputAction;
class UInputMappingContext;

UCLASS()
class AHellfallCharacter : public ACharacter
{
	GENERATED_BODY()

public:
	AHellfallCharacter(const FObjectInitializer& ObjectInitializer);

	// AActor
	virtual void BeginPlay() override;
	virtual void EndPlay(const EEndPlayReason::Type EndPlayReason) override;
	virtual void Tick(float DeltaSeconds) override;

	// APawn
	virtual void SetupPlayerInputComponent(UInputComponent* PlayerInputComponent) override;
	virtual void UnPossessed() override;

	// ACharacter
	virtual bool CanJumpInternal_Implementation() const override;
	virtual void OnJumped_Implementation() override;

	// ---- read access for the HUD -----------------------------------------------------------------
	UHellfallMovementComponent* GetHellfallMovement() const;
	UCameraComponent* GetFirstPersonCamera() const { return FirstPersonCamera; }
	EHellfallStance GetStance() const;
	bool IsStandBlocked() const;
	const FHellfallMovementTuning& GetMovementTuning() const;

private:
	void BuildInputAssets(const FHellfallMovementTuning& Tuning);
	void MapMoveKey(const FKey& Key, bool bNegate, bool bForwardAxis);
	void MapSimpleKey(UInputAction* Action, const FKey& Key, FName BindNameForLog);
	void AddMappingContextToLocalPlayer();
	void RemoveMappingContextFromLocalPlayer();
	void UpdateCameraFromStance();
	AHellfallPlayerController* GetHellfallPlayerController() const;

	// Enhanced Input handlers
	void Input_Move(const FInputActionValue& Value);
	void Input_Look(const FInputActionValue& Value);
	void Input_JumpStarted();
	void Input_JumpCompleted();
	void Input_CrouchToggle();
	void Input_CrawlToggle();
	void Input_SprintStarted();
	void Input_SprintCompleted();
	void Input_Interact();
	void Input_Pause();
	void Input_ToggleFeelGym();

	UPROPERTY(VisibleAnywhere, Category = "Hellfall")
	TObjectPtr<UCameraComponent> FirstPersonCamera;

	// Runtime-built input assets. UPROPERTY so the GC keeps them alive for the life of the character.
	UPROPERTY(Transient) TObjectPtr<UInputMappingContext> MappingContext;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_Move;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_Look;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_Jump;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_CrouchToggle;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_CrawlToggle;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_Sprint;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_Interact;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_Pause;
	UPROPERTY(Transient) TObjectPtr<UInputAction> IA_FeelGym;

	bool bInputAssetsBuilt = false;
};
