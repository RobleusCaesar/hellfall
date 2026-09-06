// HELLFALL first-person character (REQ-G1-003).
#include "HellfallCharacter.h"

#include "Hellfall.h"
#include "HellfallPlayerController.h"
#include "HellfallTuning.h"
#include "Camera/CameraComponent.h"
#include "Components/CapsuleComponent.h"
#include "Engine/LocalPlayer.h"
#include "Engine/World.h"
#include "EnhancedInputComponent.h"
#include "EnhancedInputSubsystems.h"
#include "GameFramework/Controller.h"
#include "GameFramework/PlayerController.h"
#include "InputAction.h"
#include "InputCoreTypes.h"
#include "InputMappingContext.h"
#include "InputModifiers.h"
#include "Kismet/GameplayStatics.h"

AHellfallCharacter::AHellfallCharacter(const FObjectInitializer& ObjectInitializer)
	// Swap the engine movement component for ours (REQ-G1-003 three-stance body).
	: Super(ObjectInitializer.SetDefaultSubobjectClass<UHellfallMovementComponent>(ACharacter::CharacterMovementComponentName))
{
	PrimaryActorTick.bCanEverTick = true;

	// Compiled defaults (equal to Data/movement.json). The movement component re-applies the loaded
	// values at BeginPlay, so in the normal case nothing moves here.
	const FHellfallMovementTuning Defaults;
	const float StandHalf = Defaults.StandHalfHeightCm();

	GetCapsuleComponent()->InitCapsuleSize(Defaults.CapsuleRadiusCm, StandHalf);

	// Yaw follows the controller so WASD is relative to where the player looks; pitch stays on the camera.
	bUseControllerRotationYaw = true;
	bUseControllerRotationPitch = false;
	bUseControllerRotationRoll = false;

	// Camera sits on the capsule at eye height (relative Z is measured from the capsule centre).
	BaseEyeHeight = Defaults.EyeHeightStandCm - StandHalf;
	FirstPersonCamera = CreateDefaultSubobject<UCameraComponent>(TEXT("FirstPersonCamera"));
	FirstPersonCamera->SetupAttachment(GetCapsuleComponent());
	FirstPersonCamera->SetRelativeLocation(FVector(0.f, 0.f, BaseEyeHeight));
	FirstPersonCamera->bUsePawnControlRotation = true;
	// UCameraComponent::FieldOfView is the HORIZONTAL FOV for landscape aspect ratios (Metrics Standard: 90).
	FirstPersonCamera->SetFieldOfView(Defaults.FovHorizontalDeg);

	// No arms / no weapon at Gate 1 (REQ-G1-003 "no arms"). The inherited mesh component stays empty.
}

// ---------------------------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------------------------

void AHellfallCharacter::BeginPlay()
{
	Super::BeginPlay(); // runs the components' BeginPlay -> UHellfallMovementComponent::ApplyTuning

	if (FirstPersonCamera)
	{
		FirstPersonCamera->SetFieldOfView(GetMovementTuning().FovHorizontalDeg);
	}
	UpdateCameraFromStance();
}

void AHellfallCharacter::EndPlay(const EEndPlayReason::Type EndPlayReason)
{
	RemoveMappingContextFromLocalPlayer();
	Super::EndPlay(EndPlayReason);
}

void AHellfallCharacter::Tick(float DeltaSeconds)
{
	Super::Tick(DeltaSeconds);
	// The movement component owns the capsule/eye interpolation; the camera follows it here. Tick
	// order between actor and component is not guaranteed, so this may trail by one frame - invisible
	// over a 0.2 s transition and simpler than a delegate.
	UpdateCameraFromStance();
}

void AHellfallCharacter::UnPossessed()
{
	RemoveMappingContextFromLocalPlayer(); // Controller is still valid here
	Super::UnPossessed();
}

void AHellfallCharacter::UpdateCameraFromStance()
{
	const UHellfallMovementComponent* Move = GetHellfallMovement();
	if (FirstPersonCamera == nullptr || Move == nullptr)
	{
		return;
	}
	// Eye height above the feet minus the capsule half-height = offset from the capsule centre.
	const float RelativeZ = Move->GetCurrentEyeHeightAboveFeet() - Move->GetCurrentCapsuleHalfHeight();
	FVector Relative = FirstPersonCamera->GetRelativeLocation();
	if (!FMath::IsNearlyEqual(Relative.Z, RelativeZ, 0.01f))
	{
		Relative.Z = RelativeZ;
		FirstPersonCamera->SetRelativeLocation(Relative);
		BaseEyeHeight = RelativeZ; // keeps GetPawnViewLocation() honest for anything that uses it later (AI perception at Gate 5)
	}
}

// ---------------------------------------------------------------------------------------------
// Accessors
// ---------------------------------------------------------------------------------------------

UHellfallMovementComponent* AHellfallCharacter::GetHellfallMovement() const
{
	return Cast<UHellfallMovementComponent>(GetCharacterMovement());
}

AHellfallPlayerController* AHellfallCharacter::GetHellfallPlayerController() const
{
	return Cast<AHellfallPlayerController>(GetController());
}

EHellfallStance AHellfallCharacter::GetStance() const
{
	const UHellfallMovementComponent* Move = GetHellfallMovement();
	return Move ? Move->GetStance() : EHellfallStance::Standing;
}

bool AHellfallCharacter::IsStandBlocked() const
{
	const UHellfallMovementComponent* Move = GetHellfallMovement();
	return Move ? Move->IsStandBlocked() : false;
}

const FHellfallMovementTuning& AHellfallCharacter::GetMovementTuning() const
{
	if (const UHellfallMovementComponent* Move = GetHellfallMovement())
	{
		return Move->GetMovementTuning();
	}
	static const FHellfallMovementTuning Defaults;
	return Defaults;
}

// ---------------------------------------------------------------------------------------------
// Jump plumbing (coyote time lives in the movement component)
// ---------------------------------------------------------------------------------------------

bool AHellfallCharacter::CanJumpInternal_Implementation() const
{
	// Replaces the engine's JumpCurrentCount logic (which counts "already falling" as a used jump and
	// would defeat coyote time) with the movement component's single rule.
	const UHellfallMovementComponent* Move = GetHellfallMovement();
	return Move != nullptr && Move->CanJumpNow();
}

void AHellfallCharacter::OnJumped_Implementation()
{
	Super::OnJumped_Implementation();
	if (UHellfallMovementComponent* Move = GetHellfallMovement())
	{
		Move->NotifyJumped();
	}
}

// ---------------------------------------------------------------------------------------------
// Enhanced Input - built in C++ from Data/movement.json (G-3: no .uasset)
// ---------------------------------------------------------------------------------------------

void AHellfallCharacter::SetupPlayerInputComponent(UInputComponent* PlayerInputComponent)
{
	Super::SetupPlayerInputComponent(PlayerInputComponent);

	// Called from APawn::PawnClientRestart once a local player controller possesses us, so the
	// controller and its ULocalPlayer are guaranteed to exist here (BeginPlay cannot promise that
	// for a pawn spawned and possessed later, e.g. after the F1 level toggle).
	UEnhancedInputComponent* EnhancedInput = Cast<UEnhancedInputComponent>(PlayerInputComponent);
	if (EnhancedInput == nullptr)
	{
		UE_LOG(LogHellfall, Error, TEXT("Character: InputComponent is not a UEnhancedInputComponent. Check DefaultInputComponentClass in Config/DefaultInput.ini."));
		return;
	}

	BuildInputAssets(GetMovementTuning());
	AddMappingContextToLocalPlayer();

	// Bindings. Triggered = every frame the value is non-zero (axes); Started/Completed = press/release edges.
	EnhancedInput->BindAction(IA_Move, ETriggerEvent::Triggered, this, &AHellfallCharacter::Input_Move);
	EnhancedInput->BindAction(IA_Look, ETriggerEvent::Triggered, this, &AHellfallCharacter::Input_Look);
	EnhancedInput->BindAction(IA_Jump, ETriggerEvent::Started, this, &AHellfallCharacter::Input_JumpStarted);
	EnhancedInput->BindAction(IA_Jump, ETriggerEvent::Completed, this, &AHellfallCharacter::Input_JumpCompleted);
	EnhancedInput->BindAction(IA_CrouchToggle, ETriggerEvent::Started, this, &AHellfallCharacter::Input_CrouchToggle);
	EnhancedInput->BindAction(IA_CrawlToggle, ETriggerEvent::Started, this, &AHellfallCharacter::Input_CrawlToggle);
	EnhancedInput->BindAction(IA_Sprint, ETriggerEvent::Started, this, &AHellfallCharacter::Input_SprintStarted);
	EnhancedInput->BindAction(IA_Sprint, ETriggerEvent::Completed, this, &AHellfallCharacter::Input_SprintCompleted);
	EnhancedInput->BindAction(IA_Interact, ETriggerEvent::Started, this, &AHellfallCharacter::Input_Interact);
	EnhancedInput->BindAction(IA_Pause, ETriggerEvent::Started, this, &AHellfallCharacter::Input_Pause);
	EnhancedInput->BindAction(IA_FeelGym, ETriggerEvent::Started, this, &AHellfallCharacter::Input_ToggleFeelGym);
}

void AHellfallCharacter::BuildInputAssets(const FHellfallMovementTuning& Tuning)
{
	if (bInputAssetsBuilt)
	{
		return;
	}
	bInputAssetsBuilt = true;

	MappingContext = NewObject<UInputMappingContext>(this, TEXT("IMC_Hellfall"));

	auto MakeAction = [this](const TCHAR* Name, EInputActionValueType ValueType) -> UInputAction*
	{
		UInputAction* Action = NewObject<UInputAction>(this, Name);
		Action->ValueType = ValueType;
		return Action;
	};
	IA_Move = MakeAction(TEXT("IA_Move"), EInputActionValueType::Axis2D);
	IA_Look = MakeAction(TEXT("IA_Look"), EInputActionValueType::Axis2D);
	IA_Jump = MakeAction(TEXT("IA_Jump"), EInputActionValueType::Boolean);
	IA_CrouchToggle = MakeAction(TEXT("IA_CrouchToggle"), EInputActionValueType::Boolean);
	IA_CrawlToggle = MakeAction(TEXT("IA_CrawlToggle"), EInputActionValueType::Boolean);
	IA_Sprint = MakeAction(TEXT("IA_Sprint"), EInputActionValueType::Boolean);
	IA_Interact = MakeAction(TEXT("IA_Interact"), EInputActionValueType::Boolean);
	IA_Pause = MakeAction(TEXT("IA_Pause"), EInputActionValueType::Boolean);
	IA_FeelGym = MakeAction(TEXT("IA_FeelGym"), EInputActionValueType::Boolean);

	// The pause key must still fire while the world is paused so it can resume (no menu at Gate 1).
	IA_Pause->bTriggerWhenPaused = true;

	// Move (Axis2D): X = right, Y = forward. A pressed key contributes 1.0 on X; SwizzleAxis(YXZ) moves
	// that onto Y; Negate flips the sign. Default accumulation takes the highest magnitude per axis, so
	// W+D gives (1, 1) which Input_Move normalises to length 1 (diagonal speed == forward speed).
	MapMoveKey(Tuning.GetBind(HellfallBinds::MoveRight), /*bNegate*/ false, /*bForwardAxis*/ false);
	MapMoveKey(Tuning.GetBind(HellfallBinds::MoveLeft), /*bNegate*/ true, /*bForwardAxis*/ false);
	MapMoveKey(Tuning.GetBind(HellfallBinds::MoveForward), /*bNegate*/ false, /*bForwardAxis*/ true);
	MapMoveKey(Tuning.GetBind(HellfallBinds::MoveBack), /*bNegate*/ true, /*bForwardAxis*/ true);

	// Look (Axis2D): raw mouse delta. X right is positive. Y positive = mouse pushed forward/up
	// (UE's MouseY convention; the paired Mouse2D axis inherits it). invert_y flips only Y here so the
	// handler has a single sign rule. See Input_Look for the pitch sign discussion.
	{
		FEnhancedActionKeyMapping& LookMapping = MappingContext->MapKey(IA_Look, EKeys::Mouse2D);
		if (Tuning.bInvertY)
		{
			UInputModifierNegate* NegateY = NewObject<UInputModifierNegate>(MappingContext);
			NegateY->bX = false;
			NegateY->bY = true;
			NegateY->bZ = false;
			LookMapping.Modifiers.Add(NegateY);
		}
	}

	MapSimpleKey(IA_Jump, Tuning.GetBind(HellfallBinds::Jump), HellfallBinds::Jump);
	MapSimpleKey(IA_CrouchToggle, Tuning.GetBind(HellfallBinds::CrouchToggle), HellfallBinds::CrouchToggle);
	MapSimpleKey(IA_CrawlToggle, Tuning.GetBind(HellfallBinds::CrawlToggle), HellfallBinds::CrawlToggle);
	MapSimpleKey(IA_Sprint, Tuning.GetBind(HellfallBinds::SprintHold), HellfallBinds::SprintHold);
	MapSimpleKey(IA_Interact, Tuning.GetBind(HellfallBinds::Interact), HellfallBinds::Interact);
	MapSimpleKey(IA_Pause, Tuning.GetBind(HellfallBinds::Pause), HellfallBinds::Pause);
	MapSimpleKey(IA_FeelGym, Tuning.GetBind(HellfallBinds::ToggleFeelGym), HellfallBinds::ToggleFeelGym);

	UE_LOG(LogHellfall, Log, TEXT("Character: built %d key mappings in C++ from Data/movement.json binds"), MappingContext->GetMappings().Num());
}

void AHellfallCharacter::MapMoveKey(const FKey& Key, bool bNegate, bool bForwardAxis)
{
	if (!Key.IsValid() || MappingContext == nullptr || IA_Move == nullptr)
	{
		UE_LOG(LogHellfall, Error, TEXT("Character: move bind has no valid key (negate=%d forward=%d)"), bNegate ? 1 : 0, bForwardAxis ? 1 : 0);
		return;
	}
	FEnhancedActionKeyMapping& Mapping = MappingContext->MapKey(IA_Move, Key);
	if (bNegate)
	{
		Mapping.Modifiers.Add(NewObject<UInputModifierNegate>(MappingContext)); // negates every axis; only X is non-zero before the swizzle
	}
	if (bForwardAxis)
	{
		UInputModifierSwizzleAxis* Swizzle = NewObject<UInputModifierSwizzleAxis>(MappingContext);
		Swizzle->Order = EInputAxisSwizzle::YXZ; // (X, Y, Z) -> (Y, X, Z): the key's X value lands on Y (forward)
		Mapping.Modifiers.Add(Swizzle);
	}
}

void AHellfallCharacter::MapSimpleKey(UInputAction* Action, const FKey& Key, FName BindNameForLog)
{
	if (Action == nullptr || MappingContext == nullptr)
	{
		return;
	}
	if (!Key.IsValid())
	{
		UE_LOG(LogHellfall, Error, TEXT("Character: bind '%s' has no valid key; action left unmapped"), *BindNameForLog.ToString());
		return;
	}
	MappingContext->MapKey(Action, Key);
}

void AHellfallCharacter::AddMappingContextToLocalPlayer()
{
	const APlayerController* PC = Cast<APlayerController>(GetController());
	const ULocalPlayer* LocalPlayer = PC ? PC->GetLocalPlayer() : nullptr;
	UEnhancedInputLocalPlayerSubsystem* Subsystem = LocalPlayer ? LocalPlayer->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>() : nullptr;
	if (Subsystem == nullptr || MappingContext == nullptr)
	{
		UE_LOG(LogHellfall, Error, TEXT("Character: no UEnhancedInputLocalPlayerSubsystem; input will not work"));
		return;
	}
	Subsystem->AddMappingContext(MappingContext, /*Priority*/ 0);
}

void AHellfallCharacter::RemoveMappingContextFromLocalPlayer()
{
	// The local player (and its subsystem) outlives the pawn across level loads; without this the old
	// context would stay applied next to the new pawn's context.
	const APlayerController* PC = Cast<APlayerController>(GetController());
	const ULocalPlayer* LocalPlayer = PC ? PC->GetLocalPlayer() : nullptr;
	UEnhancedInputLocalPlayerSubsystem* Subsystem = LocalPlayer ? LocalPlayer->GetSubsystem<UEnhancedInputLocalPlayerSubsystem>() : nullptr;
	if (Subsystem != nullptr && MappingContext != nullptr)
	{
		Subsystem->RemoveMappingContext(MappingContext);
	}
}

// ---------------------------------------------------------------------------------------------
// Input handlers
// ---------------------------------------------------------------------------------------------

void AHellfallCharacter::Input_Move(const FInputActionValue& Value)
{
	FVector2D Axis = Value.Get<FVector2D>();
	// REQ-G1-003 "diagonal speed equals forward speed": clamp the 2D input to unit length. The movement
	// component clamps again in ScaleInputAcceleration; both together make this robust to any key combo.
	if (Axis.SizeSquared() > 1.f)
	{
		Axis.Normalize();
	}
	if (Controller == nullptr)
	{
		return;
	}
	// "W/A/S/D move relative to camera yaw": build the basis from the control yaw only (no pitch, so
	// looking down never slows the walk).
	const FRotator YawOnly(0.f, Controller->GetControlRotation().Yaw, 0.f);
	const FVector Forward = FRotationMatrix(YawOnly).GetUnitAxis(EAxis::X);
	const FVector Right = FRotationMatrix(YawOnly).GetUnitAxis(EAxis::Y);
	AddMovementInput(Forward, Axis.Y);
	AddMovementInput(Right, Axis.X);
}

void AHellfallCharacter::Input_Look(const FInputActionValue& Value)
{
	// Drop exactly one sample after the window regains focus (REQ-G1-003 "regaining focus does not snap the camera").
	if (const AHellfallPlayerController* PC = GetHellfallPlayerController())
	{
		if (PC->ShouldIgnoreLookDelta())
		{
			return;
		}
	}

	const FVector2D Axis = Value.Get<FVector2D>();
	const float Sensitivity = GetMovementTuning().LookSensitivityDegPerUnit; // degrees per mouse count

	// Sign convention. With bEnableLegacyInputScales=False (Config/DefaultInput.ini) AddControllerPitchInput(v)
	// adds v degrees of pitch directly (positive = look up); the engine feeds MouseY (and so Mouse2D.Y) as
	// positive when the mouse moves forward/up (FSceneViewport negates the screen-space delta). Hence
	// no negation here: mouse up -> look up. The 5.x templates negate Y in their IMC only because they
	// keep the legacy -2.5 InputPitchScale, which this project disables.
	// TODO(VERIFY 5.8): first run - push the mouse forward; the view must pitch UP. If it does not, the
	// data-only fix is "invert_y": true in Data/movement.json; the code fix is a single sign below.
	AddControllerYawInput(Axis.X * Sensitivity);
	AddControllerPitchInput(Axis.Y * Sensitivity);
}

void AHellfallCharacter::Input_JumpStarted()
{
	// Grounded-or-coyote, Standing, not transitioning: decided by the movement component (REQ-G1-003).
	const UHellfallMovementComponent* Move = GetHellfallMovement();
	if (Move != nullptr && Move->CanJumpNow())
	{
		Jump();
	}
}

void AHellfallCharacter::Input_JumpCompleted()
{
	StopJumping();
}

void AHellfallCharacter::Input_CrouchToggle()
{
	if (UHellfallMovementComponent* Move = GetHellfallMovement())
	{
		Move->ToggleStance(EHellfallStance::Crouching);
	}
}

void AHellfallCharacter::Input_CrawlToggle()
{
	if (UHellfallMovementComponent* Move = GetHellfallMovement())
	{
		Move->ToggleStance(EHellfallStance::Crawling);
	}
}

void AHellfallCharacter::Input_SprintStarted()
{
	if (UHellfallMovementComponent* Move = GetHellfallMovement())
	{
		Move->SetWantsToSprint(true);
	}
}

void AHellfallCharacter::Input_SprintCompleted()
{
	if (UHellfallMovementComponent* Move = GetHellfallMovement())
	{
		Move->SetWantsToSprint(false);
	}
}

void AHellfallCharacter::Input_Interact()
{
	// Nothing to interact with until REQ-G5-001. Bound now so the key is displayed and testable.
	UE_LOG(LogHellfall, Verbose, TEXT("Character: interact pressed (no interactables before Gate 5)"));
}

void AHellfallCharacter::Input_Pause()
{
	if (AHellfallPlayerController* PC = GetHellfallPlayerController())
	{
		PC->TogglePauseMenuless();
	}
}

void AHellfallCharacter::Input_ToggleFeelGym()
{
	// REQ-G1-004 acceptance 2: the feel gym is reachable from the main level without editing files.
	// Both map paths come from Data/levels.json through the tuning subsystem.
	const UHellfallTuning* TuningSubsystem = UHellfallTuning::Get(this);
	FHellfallLevelEntry Gym;
	FHellfallLevelEntry Main;
	if (TuningSubsystem == nullptr ||
		!TuningSubsystem->FindLevel(HellfallLevels::FeelGym, Gym) ||
		!TuningSubsystem->FindLevel(HellfallLevels::ExecutiveFloor, Main))
	{
		UE_LOG(LogHellfall, Error, TEXT("Character: level registry lacks '%s' or '%s'; cannot toggle the feel gym"),
			*HellfallLevels::FeelGym.ToString(), *HellfallLevels::ExecutiveFloor.ToString());
		return;
	}

	const FString CurrentShortName = UGameplayStatics::GetCurrentLevelName(this, /*bRemovePrefixString*/ true);
	const bool bInGym = CurrentShortName.Equals(Gym.ShortMapName(), ESearchCase::IgnoreCase);
	const FHellfallLevelEntry& Target = bInGym ? Main : Gym;

	UE_LOG(LogHellfall, Log, TEXT("Character: F1 -> opening %s (%s)"), *Target.Map, *Target.DisplayName);
	UGameplayStatics::OpenLevel(this, FName(*Target.Map));
}
