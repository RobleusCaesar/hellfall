// HELLFALL traversal movement (REQ-G1-003). See the header for the stance model.
#include "HellfallMovementComponent.h"

#include "Hellfall.h"
#include "CollisionQueryParams.h"
#include "CollisionShape.h"
#include "Components/CapsuleComponent.h"
#include "Engine/World.h"
#include "GameFramework/Character.h"

const TCHAR* HellfallStanceToString(EHellfallStance Stance)
{
	switch (Stance)
	{
	case EHellfallStance::Standing:  return TEXT("STANDING");
	case EHellfallStance::Crouching: return TEXT("CROUCHING");
	case EHellfallStance::Crawling:  return TEXT("CRAWLING");
	default:                         return TEXT("?");
	}
}

UHellfallMovementComponent::UHellfallMovementComponent(const FObjectInitializer& ObjectInitializer)
	: Super(ObjectInitializer)
{
	// The engine crouch state machine is never used (REQ-G1-003: three custom stances, Unreal has no prone).
	GetNavAgentPropertiesRef().bCanCrouch = false;
	GetNavAgentPropertiesRef().bCanJump = true;
	bUseSeparateBrakingFriction = false;

	// Compiled defaults (equal to Data/movement.json) so the CDO is a sane body before BeginPlay
	// copies the JSON values in. No world here, so gravity is the engine default for the jump math.
	const FHellfallMovementTuning Defaults;
	Tuning = Defaults;
	MaxWalkSpeed = Defaults.WalkSpeedCms;
	MaxWalkSpeedCrouched = Defaults.CrouchSpeedCms;
	MaxAcceleration = Defaults.MaxAccelerationCms2;
	BrakingDecelerationWalking = Defaults.BrakingDecelerationCms2;
	GroundFriction = Defaults.GroundFriction;
	BrakingFrictionFactor = Defaults.BrakingFrictionFactor;
	AirControl = Defaults.AirControl;
	MaxStepHeight = Defaults.MaxStepHeightCm;
	SetWalkableFloorAngle(Defaults.WalkableFloorAngleDeg);
	JumpZVelocity = FMath::Sqrt(2.f * 980.f * Defaults.JumpHeightCm);
	CurrentEyeHeightAboveFeet = Defaults.EyeHeightStandCm;
}

void UHellfallMovementComponent::InitializeComponent()
{
	Super::InitializeComponent(); // UMovementComponent: registers the UpdatedComponent if it was not set (ACharacter sets it in its constructor)

	// Runs from AActor::InitializeComponents at spawn, i.e. before possession and before BeginPlay.
	// On a map load the local player possesses the pawn inside UEngine::LoadMap, ahead of the world's
	// BeginPlay, and APawn::PawnClientRestart -> SetupPlayerInputComponent builds the input mapping
	// right then. Applying the JSON here makes Tuning (and AHellfallCharacter::GetMovementTuning())
	// correct before any of that. UMovementComponent sets bWantsInitializeComponent = true, so this
	// override is reached without further setup; CharacterOwner is already set (OnRegister ->
	// SetUpdatedComponent), so the capsule resize inside ApplyTuning can run here as well.
	bTuningFromSubsystem = ApplyTuningFromSubsystem();
}

void UHellfallMovementComponent::BeginPlay()
{
	Super::BeginPlay();

	// Normally nothing to do: InitializeComponent already applied the subsystem values. Re-applies
	// only if there was no game instance back then (keeps the body honest in any odd spawn order).
	if (!bTuningFromSubsystem)
	{
		bTuningFromSubsystem = ApplyTuningFromSubsystem();
	}
}

bool UHellfallMovementComponent::ApplyTuningFromSubsystem()
{
	const UHellfallTuning* TuningSubsystem = UHellfallTuning::Get(this);
	ApplyTuning(TuningSubsystem ? TuningSubsystem->GetMovementTuning() : FHellfallMovementTuning());
	return TuningSubsystem != nullptr;
}

void UHellfallMovementComponent::ApplyTuning(const FHellfallMovementTuning& InTuning)
{
	Tuning = InTuning;

	// Acceleration/deceleration ramps: "the character has weight, not instant velocity" (REQ-G1-003).
	MaxAcceleration = Tuning.MaxAccelerationCms2;
	BrakingDecelerationWalking = Tuning.BrakingDecelerationCms2;
	GroundFriction = Tuning.GroundFriction;
	BrakingFrictionFactor = Tuning.BrakingFrictionFactor;
	AirControl = Tuning.AirControl;
	MaxStepHeight = Tuning.MaxStepHeightCm;
	SetWalkableFloorAngle(Tuning.WalkableFloorAngleDeg);
	MaxWalkSpeedCrouched = Tuning.CrouchSpeedCms; // not used by GetMaxSpeed(); kept equal for anyone reading the property
	MaxWalkSpeed = WalkSpeedForStance(GetStance());

	// Jump height -> launch velocity: v = sqrt(2 * g * h). GetGravityZ() already includes GravityScale.
	// Guarded because GetGravityZ() dereferences the physics volume, which needs a world.
	const float GravityAbs = (GetWorld() != nullptr) ? FMath::Abs(GetGravityZ()) : 980.f;
	JumpZVelocity = FMath::Sqrt(2.f * FMath::Max(GravityAbs, 1.f) * Tuning.JumpHeightCm);

	// Capsule for the stance we are in (Standing at spawn). Forced, not probed: PlayerStart placement
	// is the level generator's job and the CDO already has the same size unless the JSON changed.
	if (CharacterOwner && UpdatedComponent)
	{
		if (UCapsuleComponent* Capsule = CharacterOwner->GetCapsuleComponent())
		{
			const float OldHalf = Capsule->GetUnscaledCapsuleHalfHeight();
			const float NewHalf = HalfHeightForStance(GetStance());
			const float Scale = Capsule->GetShapeScale();
			if (!FMath::IsNearlyEqual(Capsule->GetUnscaledCapsuleRadius(), Tuning.CapsuleRadiusCm, 0.01f) ||
				!FMath::IsNearlyEqual(OldHalf, NewHalf, 0.01f))
			{
				// Move first so the feet stay where the level put them, then resize.
				UpdatedComponent->MoveComponent(FVector(0.f, 0.f, (NewHalf - OldHalf) * Scale), UpdatedComponent->GetComponentQuat(),
					false, nullptr, MOVECOMP_NoFlags, ETeleportType::TeleportPhysics);
				Capsule->SetCapsuleSize(Tuning.CapsuleRadiusCm, NewHalf, true);
				bForceNextFloorCheck = true;
			}
		}
	}
	if (!bTransitioning)
	{
		CurrentEyeHeightAboveFeet = EyeHeightForStance(CommittedStance);
	}

	if (Tuning.CrawlHalfHeightCm() > 0.5f * Tuning.CrawlHeightCm + 0.01f)
	{
		UE_LOG(LogHellfall, Warning,
			TEXT("Movement: crawl_height_cm %.0f is below 2 * capsule_radius_cm (%.0f); the capsule clamps to a %.0f cm sphere. Data change needed if 64 cm must be exact."),
			Tuning.CrawlHeightCm, 2.f * Tuning.CapsuleRadiusCm, 2.f * Tuning.CrawlHalfHeightCm());
	}

	UE_LOG(LogHellfall, Log, TEXT("Movement: tuning applied (walk %.0f sprint %.0f crouch %.0f crawl %.0f cm/s, jumpZ %.0f cm/s, step %.0f cm, transition %.2f s)"),
		Tuning.WalkSpeedCms, Tuning.SprintSpeedCms, Tuning.CrouchSpeedCms, Tuning.CrawlSpeedCms, JumpZVelocity, MaxStepHeight, Tuning.StanceTransitionS);
}

void UHellfallMovementComponent::TickComponent(float DeltaTime, enum ELevelTick TickType, FActorComponentTickFunction* ThisTickFunction)
{
	Super::TickComponent(DeltaTime, TickType, ThisTickFunction);

	if (CharacterOwner == nullptr || UpdatedComponent == nullptr)
	{
		return;
	}

	// Coyote time (REQ-G1-003 "~0.1 s coyote time"): remember when the feet were last on the floor.
	if (IsMovingOnGround())
	{
		if (const UWorld* World = GetWorld())
		{
			LastGroundedTimeS = World->GetTimeSeconds();
		}
		bCoyoteConsumed = false;
	}

	UpdateStance(DeltaTime);
}

// ---------------------------------------------------------------------------------------------
// Speed
// ---------------------------------------------------------------------------------------------

float UHellfallMovementComponent::WalkSpeedForStance(EHellfallStance Stance) const
{
	switch (Stance)
	{
	case EHellfallStance::Crouching: return Tuning.CrouchSpeedCms;
	case EHellfallStance::Crawling:  return Tuning.CrawlSpeedCms;
	case EHellfallStance::Standing:
	default:                         return Tuning.WalkSpeedCms;
	}
}

bool UHellfallMovementComponent::IsMovingForward() const
{
	// Acceleration is the input-derived acceleration of this frame (set in ControlledCharacterMove
	// before CalcVelocity asks GetMaxSpeed). Within 60 degrees of facing counts as forward, so
	// strafing and backpedalling never sprint.
	const FVector Accel2D = Acceleration.GetSafeNormal2D();
	if (Accel2D.IsNearlyZero())
	{
		return false;
	}
	const FVector Forward2D = UpdatedComponent->GetForwardVector().GetSafeNormal2D();
	return FVector::DotProduct(Accel2D, Forward2D) > 0.5f;
}

bool UHellfallMovementComponent::IsSprinting() const
{
	// Sprint is a hold and applies only to the standing body (REQ-G1-003 / Docs/METRICS.md).
	return bWantsToSprint && !bTransitioning && CommittedStance == EHellfallStance::Standing && UpdatedComponent && IsMovingForward();
}

float UHellfallMovementComponent::GetMaxSpeed() const
{
	// UCharacterMovementComponent::ScaleInputAcceleration clamps the input vector to length 1, and the
	// character normalises the 2D input as well, so diagonal speed already equals forward speed
	// (REQ-G1-003). This override only picks WHICH cap applies.
	switch (MovementMode)
	{
	case MOVE_Walking:
	case MOVE_NavWalking:
	case MOVE_Falling:
		return IsSprinting() ? Tuning.SprintSpeedCms : WalkSpeedForStance(GetStance());
	default:
		return Super::GetMaxSpeed();
	}
}

// ---------------------------------------------------------------------------------------------
// Jump
// ---------------------------------------------------------------------------------------------

bool UHellfallMovementComponent::CanJumpNow() const
{
	if (CharacterOwner == nullptr || UpdatedComponent == nullptr || !IsJumpAllowed())
	{
		return false;
	}
	// Jump is suppressed while crouched or crawling, and while the body is changing size (REQ-G1-003).
	if (bTransitioning || CommittedStance != EHellfallStance::Standing)
	{
		return false;
	}
	if (IsMovingOnGround())
	{
		return true;
	}
	if (IsFalling() && !bCoyoteConsumed && LastGroundedTimeS >= 0.f)
	{
		const UWorld* World = GetWorld();
		return World != nullptr && (World->GetTimeSeconds() - LastGroundedTimeS) <= Tuning.CoyoteTimeS;
	}
	return false;
}

bool UHellfallMovementComponent::CanAttemptJump() const
{
	// ACharacter::CanJumpInternal_Implementation consults this; the character also overrides that
	// to call CanJumpNow() directly, so both paths agree.
	return CanJumpNow();
}

void UHellfallMovementComponent::NotifyJumped()
{
	// The jump left the ground within the coyote window; spend it so a second press in the air does nothing.
	bCoyoteConsumed = true;
}

// ---------------------------------------------------------------------------------------------
// Stance
// ---------------------------------------------------------------------------------------------

float UHellfallMovementComponent::HalfHeightForStance(EHellfallStance Stance) const
{
	switch (Stance)
	{
	case EHellfallStance::Crouching: return Tuning.CrouchHalfHeightCm();
	case EHellfallStance::Crawling:  return Tuning.CrawlHalfHeightCm();
	case EHellfallStance::Standing:
	default:                         return Tuning.StandHalfHeightCm();
	}
}

float UHellfallMovementComponent::EyeHeightForStance(EHellfallStance Stance) const
{
	switch (Stance)
	{
	case EHellfallStance::Crouching: return Tuning.EyeHeightCrouchCm;
	case EHellfallStance::Crawling:  return Tuning.EyeHeightCrawlCm;
	case EHellfallStance::Standing:
	default:                         return Tuning.EyeHeightStandCm;
	}
}

float UHellfallMovementComponent::GetCurrentCapsuleHalfHeight() const
{
	if (CharacterOwner)
	{
		if (const UCapsuleComponent* Capsule = CharacterOwner->GetCapsuleComponent())
		{
			return Capsule->GetUnscaledCapsuleHalfHeight();
		}
	}
	return HalfHeightForStance(CommittedStance);
}

EHellfallStance UHellfallMovementComponent::LowestStanceNotAbove(float HalfHeight) const
{
	const float Tolerance = 0.01f;
	if (HalfHeight + Tolerance >= HalfHeightForStance(EHellfallStance::Standing))
	{
		return EHellfallStance::Standing;
	}
	if (HalfHeight + Tolerance >= HalfHeightForStance(EHellfallStance::Crouching))
	{
		return EHellfallStance::Crouching;
	}
	return EHellfallStance::Crawling;
}

void UHellfallMovementComponent::RequestStance(EHellfallStance NewStance)
{
	DesiredStance = NewStance;
	// Nothing else happens here: UpdateStance() starts or retargets the transition on the next tick,
	// once the feet are on a floor and (for growing) the probe says there is room.
}

void UHellfallMovementComponent::ToggleStance(EHellfallStance Stance)
{
	// Crouch key while crouching (or waiting to crouch) -> stand; otherwise -> crouch. Same for crawl.
	// Pressing the key of the stance we are blocked from leaving cancels the pending stand.
	RequestStance(DesiredStance == Stance ? EHellfallStance::Standing : Stance);
}

bool UHellfallMovementComponent::CanChangeTo(EHellfallStance Stance) const
{
	const float TargetHalf = HalfHeightForStance(Stance);
	if (TargetHalf <= GetCurrentCapsuleHalfHeight() + 0.01f)
	{
		return true; // shrinking always fits
	}
	return FitsAtHalfHeight(TargetHalf);
}

void UHellfallMovementComponent::UpdateStance(float DeltaTime)
{
	const EHellfallStance Heading = GetStance();
	if (DesiredStance != Heading)
	{
		// Start, or retarget mid-transition. Failure means "not grounded" or "blocked"; both retry next tick.
		TryBeginTransition(DesiredStance);
	}
	else
	{
		bStandBlocked = false;
	}

	if (bTransitioning)
	{
		AdvanceTransition(DeltaTime);
	}
}

bool UHellfallMovementComponent::TryBeginTransition(EHellfallStance Target)
{
	// Stance changes start only with the feet on a floor so "feet stay put" is meaningful. A request
	// made in the air is kept and applied on landing.
	if (!IsMovingOnGround())
	{
		return false;
	}

	const float CurrentHalf = GetCurrentCapsuleHalfHeight();
	const float TargetHalf = HalfHeightForStance(Target);
	const bool bGrowing = TargetHalf > CurrentHalf + 0.01f;
	if (bGrowing && !FitsAtHalfHeight(TargetHalf))
	{
		// REQ-G1-003 acceptance 2: standing under a low ceiling leaves the player in the reduced stance.
		bStandBlocked = true;
		return false;
	}

	bStandBlocked = false;
	TransitionTarget = Target;
	TransitionStartHalfHeight = CurrentHalf;
	TransitionStartEyeHeight = CurrentEyeHeightAboveFeet;
	TransitionElapsedS = 0.f;
	bTransitioning = true;
	MaxWalkSpeed = WalkSpeedForStance(Target);
	return true;
}

void UHellfallMovementComponent::AdvanceTransition(float DeltaTime)
{
	TransitionElapsedS += DeltaTime;
	// Every transition takes stance_transition_s regardless of distance (REQ-G1-003 "~0.2 s").
	const float Duration = Tuning.StanceTransitionS;
	const float Alpha = (Duration > UE_KINDA_SMALL_NUMBER) ? FMath::Clamp(TransitionElapsedS / Duration, 0.f, 1.f) : 1.f;

	const float NewHalf = FMath::Lerp(TransitionStartHalfHeight, HalfHeightForStance(TransitionTarget), Alpha);
	const float NewEye = FMath::Lerp(TransitionStartEyeHeight, EyeHeightForStance(TransitionTarget), Alpha);

	if (!ApplyCapsuleHalfHeight(NewHalf))
	{
		// Blocked while growing (we walked under something during the 0.2 s). Back off to the tallest
		// stance that fits under the current height. DesiredStance is untouched, so the grow is retried
		// automatically once there is room again.
		bStandBlocked = true;
		const float CurrentHalf = GetCurrentCapsuleHalfHeight();
		TransitionTarget = LowestStanceNotAbove(CurrentHalf);
		TransitionStartHalfHeight = CurrentHalf;
		TransitionStartEyeHeight = CurrentEyeHeightAboveFeet;
		TransitionElapsedS = 0.f;
		MaxWalkSpeed = WalkSpeedForStance(TransitionTarget);
		return;
	}

	CurrentEyeHeightAboveFeet = NewEye;
	if (Alpha >= 1.f)
	{
		FinishTransition();
	}
}

void UHellfallMovementComponent::FinishTransition()
{
	CommittedStance = TransitionTarget;
	bTransitioning = false;
	TransitionElapsedS = 0.f;
	ApplyCapsuleHalfHeight(HalfHeightForStance(CommittedStance)); // snap away any lerp rounding
	CurrentEyeHeightAboveFeet = EyeHeightForStance(CommittedStance);
	MaxWalkSpeed = WalkSpeedForStance(CommittedStance);
	bForceNextFloorCheck = true;
}

bool UHellfallMovementComponent::ApplyCapsuleHalfHeight(float NewHalfHeight)
{
	UCapsuleComponent* Capsule = CharacterOwner ? CharacterOwner->GetCapsuleComponent() : nullptr;
	if (Capsule == nullptr || UpdatedComponent == nullptr)
	{
		return false;
	}

	const float Radius = Capsule->GetUnscaledCapsuleRadius();
	const float OldHalf = Capsule->GetUnscaledCapsuleHalfHeight();
	const float ClampedNewHalf = FMath::Max(NewHalfHeight, Radius); // UCapsuleComponent applies this clamp itself; mirror it
	const float Delta = ClampedNewHalf - OldHalf;
	if (FMath::IsNearlyZero(Delta, 0.01f))
	{
		return true;
	}
	const float Scale = Capsule->GetShapeScale();

	if (Delta > 0.f)
	{
		if (!FitsAtHalfHeight(ClampedNewHalf))
		{
			return false;
		}
		// Grow: lift the still-small capsule so the bottom stays on the floor, then enlarge
		// (same order as UCharacterMovementComponent::UnCrouch, avoids a frame of floor penetration).
		UpdatedComponent->MoveComponent(FVector(0.f, 0.f, Delta * Scale), UpdatedComponent->GetComponentQuat(),
			false, nullptr, MOVECOMP_NoFlags, ETeleportType::TeleportPhysics);
		Capsule->SetCapsuleSize(Radius, ClampedNewHalf, true);
	}
	else
	{
		// Shrink: enlarge nothing, shrink first, then lower the centre so the feet stay put
		// (same order as UCharacterMovementComponent::Crouch with bCrouchMaintainsBaseLocation).
		Capsule->SetCapsuleSize(Radius, ClampedNewHalf, true);
		UpdatedComponent->MoveComponent(FVector(0.f, 0.f, Delta * Scale), UpdatedComponent->GetComponentQuat(),
			true, nullptr, MOVECOMP_NoFlags, ETeleportType::TeleportPhysics);
	}
	bForceNextFloorCheck = true;
	return true;
}

bool UHellfallMovementComponent::FitsAtHalfHeight(float CandidateHalfHeight) const
{
	const UCapsuleComponent* Capsule = CharacterOwner ? CharacterOwner->GetCapsuleComponent() : nullptr;
	const UWorld* World = GetWorld();
	if (Capsule == nullptr || UpdatedComponent == nullptr || World == nullptr)
	{
		return false;
	}

	const float Scale = Capsule->GetShapeScale();
	const float RadiusScaled = Capsule->GetScaledCapsuleRadius();
	const float CurrentHalfScaled = Capsule->GetScaledCapsuleHalfHeight();
	const FVector PawnLocation = UpdatedComponent->GetComponentLocation();
	const float FeetZ = PawnLocation.Z - CurrentHalfScaled;

	// The walking capsule hovers 1.9-2.4 cm above the floor (CMC MIN_FLOOR_DIST/MAX_FLOOR_DIST).
	// Lifting the probe bottom 1 cm keeps a floor the feet are touching from counting as a blocker.
	const float BottomLiftCm = 1.f;
	const float Bottom = FeetZ + BottomLiftCm;
	// Head clearance required above the target capsule top = stand_clearance_probe_margin_cm (tuning).
	const float Top = FeetZ + 2.f * CandidateHalfHeight * Scale + Tuning.StandClearanceProbeMarginCm;
	const float ProbeHalf = FMath::Max(0.5f * (Top - Bottom), RadiusScaled); // FCollisionShape capsules need half-height >= radius
	FVector ProbeCenter = PawnLocation;
	ProbeCenter.Z = Top - ProbeHalf;

	FCollisionQueryParams Params(SCENE_QUERY_STAT(HellfallStanceProbe), false, CharacterOwner);
	FCollisionResponseParams ResponseParam;
	InitCollisionParams(Params, ResponseParam); // ignores the owner and MoveIgnoreActors, uses the pawn's channel responses
	const ECollisionChannel Channel = UpdatedComponent->GetCollisionObjectType();
	const FCollisionShape Probe = FCollisionShape::MakeCapsule(RadiusScaled, ProbeHalf);

	const bool bBlocked = World->OverlapBlockingTestByChannel(ProbeCenter, FQuat::Identity, Channel, Probe, Params, ResponseParam);
	return !bBlocked;
}
