// HELLFALL traversal movement (REQ-G1-003). Three-stance body: Standing / Crouching / Crawling.
//
// The engine's own crouch state machine is NOT used (bCanCrouch stays false) because Unreal has no
// native prone and a single custom system for all three stances is simpler to reason about than
// crouch-plus-a-bolt-on. Design (see README-SOURCE.md for the diagram):
//
//   DesiredStance   what the player last asked for (toggle keys)
//   CommittedStance the stance whose full capsule we are at (or leaving)
//   Transition      capsule half-height and eye height lerp over stance_transition_s; feet stay put
//
// Growing (crouch->stand etc.) is only started, and only continued each tick, if a capsule probe
// with the target size fits at the current feet position. If it does not, the body stays in (or
// returns to) the lower stance and bStandBlocked is raised for the HUD (REQ-G1-003 acceptance 2,
// REQ-G1-006 "stand input inside the duct is suppressed"). Like the engine's crouch, a blocked
// request stays pending and completes on its own once clearance appears.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/CharacterMovementComponent.h"
#include "HellfallTuning.h"
#include "HellfallMovementComponent.generated.h"

UENUM()
enum class EHellfallStance : uint8
{
	Standing,
	Crouching,
	Crawling
};

const TCHAR* HellfallStanceToString(EHellfallStance Stance);

UCLASS()
class UHellfallMovementComponent : public UCharacterMovementComponent
{
	GENERATED_BODY()

public:
	UHellfallMovementComponent(const FObjectInitializer& ObjectInitializer);

	// UActorComponent
	virtual void InitializeComponent() override;
	virtual void BeginPlay() override;
	virtual void TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction) override;

	// UCharacterMovementComponent
	virtual float GetMaxSpeed() const override;
	virtual bool CanAttemptJump() const override;

	// ---- stance API ----------------------------------------------------------------------------

	/** Ask for a stance. Never fails: a blocked grow stays pending until there is room. */
	void RequestStance(EHellfallStance NewStance);
	/** Toggle helper for the crouch/crawl keys: if already heading for Stance, go Standing; else go to Stance. */
	void ToggleStance(EHellfallStance Stance);

	/** The stance the body is in, or currently moving into. */
	EHellfallStance GetStance() const { return bTransitioning ? TransitionTarget : CommittedStance; }
	EHellfallStance GetDesiredStance() const { return DesiredStance; }
	bool IsTransitioning() const { return bTransitioning; }
	/** True while a requested larger stance is refused by geometry (HUD shows "STAND BLOCKED"). */
	bool IsStandBlocked() const { return bStandBlocked; }

	/** Would the full capsule of Stance fit right now with the feet where they are? */
	bool CanChangeTo(EHellfallStance Stance) const;
	bool CanStandUp() const { return CanChangeTo(EHellfallStance::Standing); }

	/** Current (possibly mid-transition) capsule half-height and eye height above the feet, in cm. */
	float GetCurrentCapsuleHalfHeight() const;
	float GetCurrentEyeHeightAboveFeet() const { return CurrentEyeHeightAboveFeet; }

	float HalfHeightForStance(EHellfallStance Stance) const;
	float EyeHeightForStance(EHellfallStance Stance) const;
	float WalkSpeedForStance(EHellfallStance Stance) const;

	// ---- sprint / jump -------------------------------------------------------------------------

	void SetWantsToSprint(bool bInWantsToSprint) { bWantsToSprint = bInWantsToSprint; }
	bool IsSprinting() const;

	/** Grounded, or within coyote_time_s of leaving the ground; Standing; not transitioning; coyote not already spent. */
	bool CanJumpNow() const;
	/** Called by the character from OnJumped so the coyote window cannot grant a second jump. */
	void NotifyJumped();

	// ---- tuning --------------------------------------------------------------------------------

	/** Copies the values from UHellfallTuning into the engine properties. Safe to call again after a reload. */
	void ApplyTuning(const FHellfallMovementTuning& InTuning);
	const FHellfallMovementTuning& GetMovementTuning() const { return Tuning; }

private:
	/** ApplyTuning() with the subsystem's values (compiled defaults when there is no game instance). Returns true when the subsystem was found. */
	bool ApplyTuningFromSubsystem();
	void UpdateStance(float DeltaTime);
	bool TryBeginTransition(EHellfallStance Target);
	void AdvanceTransition(float DeltaTime);
	void FinishTransition();
	/** Resize the capsule to NewHalfHeight keeping the feet on the floor. Returns false (no change) if growing is blocked. */
	bool ApplyCapsuleHalfHeight(float NewHalfHeight);
	/** Capsule overlap probe: does a capsule of CandidateHalfHeight (+ margin) fit with its bottom at the current feet? */
	bool FitsAtHalfHeight(float CandidateHalfHeight) const;
	/** Largest stance whose capsule is not taller than HalfHeight (used to back off a blocked grow). */
	EHellfallStance LowestStanceNotAbove(float HalfHeight) const;
	bool IsMovingForward() const;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Tuning")
	FHellfallMovementTuning Tuning;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Stance")
	EHellfallStance DesiredStance = EHellfallStance::Standing;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Stance")
	EHellfallStance CommittedStance = EHellfallStance::Standing;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Stance")
	EHellfallStance TransitionTarget = EHellfallStance::Standing;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Stance")
	bool bTransitioning = false;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Stance")
	bool bStandBlocked = false;

	float TransitionElapsedS = 0.f;
	float TransitionStartHalfHeight = 0.f;
	float TransitionStartEyeHeight = 0.f;
	float CurrentEyeHeightAboveFeet = 0.f;

	UPROPERTY(VisibleAnywhere, Category = "Hellfall|Sprint")
	bool bWantsToSprint = false;

	/** World time (s) at which the body was last on walkable ground. -1 = never. */
	float LastGroundedTimeS = -1.f;
	bool bCoyoteConsumed = false;
	/** True once ApplyTuning() ran with the UHellfallTuning values (not merely the compiled defaults). */
	bool bTuningFromSubsystem = false;
};
