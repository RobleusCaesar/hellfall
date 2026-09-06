// HELLFALL tuning subsystem (REQ-G1-003: every feel value is read from Data/, not hard-coded).
//
// Data flow:  Data/movement.json  --FJsonSerializer-->  FHellfallMovementTuning (this file)
//             --copied at InitializeComponent (before possession / BeginPlay)-->  UHellfallMovementComponent
//             --read straight from this subsystem-->  AHellfallCharacter (SetupPlayerInputComponent: binds, invert_y),
//                                                    AHellfallPlayerController (BeginPlay), AHellfallHUD (every frame)
//
// Fail-soft rule: if the file is missing or corrupt the compiled defaults below are used. They are
// kept EQUAL to the values in Data/movement.json so a broken file never changes the feel silently;
// the HUD prints LoadError in red so the reviewer knows the JSON was not honoured.
#pragma once

#include "CoreMinimal.h"
#include "InputCoreTypes.h"
#include "Subsystems/GameInstanceSubsystem.h"
#include "HellfallTuning.generated.h"

// Names of the entries in Data/movement.json "binds". Used by the character (mapping) and the
// HUD (on-screen control list) so a typo cannot silently drop a bind.
namespace HellfallBinds
{
	static const FName MoveForward(TEXT("move_forward"));
	static const FName MoveBack(TEXT("move_back"));
	static const FName MoveLeft(TEXT("move_left"));
	static const FName MoveRight(TEXT("move_right"));
	static const FName Jump(TEXT("jump"));
	static const FName CrouchToggle(TEXT("crouch_toggle"));
	static const FName CrawlToggle(TEXT("crawl_toggle"));
	static const FName SprintHold(TEXT("sprint_hold"));
	static const FName Interact(TEXT("interact"));
	static const FName Pause(TEXT("pause"));
	static const FName ToggleFeelGym(TEXT("toggle_feel_gym"));
}

// Level ids in Data/levels.json the code needs by name (the F1 toggle, REQ-G1-004 acceptance 2).
namespace HellfallLevels
{
	static const FName ExecutiveFloor(TEXT("executive_floor"));
	static const FName FeelGym(TEXT("feel_gym"));
}

/** One UPROPERTY per key of Data/movement.json "player" (same order as the file). Units: cm, cm/s, cm/s^2, s, deg. */
USTRUCT()
struct FHellfallMovementTuning
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere) float CapsuleRadiusCm = 36.f;
	UPROPERTY(VisibleAnywhere) float StandHeightCm = 184.f;
	UPROPERTY(VisibleAnywhere) float CrouchHeightCm = 116.f;
	UPROPERTY(VisibleAnywhere) float CrawlHeightCm = 64.f;
	UPROPERTY(VisibleAnywhere) float EyeHeightStandCm = 166.f;
	UPROPERTY(VisibleAnywhere) float EyeHeightCrouchCm = 100.f;
	UPROPERTY(VisibleAnywhere) float EyeHeightCrawlCm = 50.f;
	UPROPERTY(VisibleAnywhere) float WalkSpeedCms = 400.f;
	UPROPERTY(VisibleAnywhere) float SprintSpeedCms = 600.f;
	UPROPERTY(VisibleAnywhere) float CrouchSpeedCms = 200.f;
	UPROPERTY(VisibleAnywhere) float CrawlSpeedCms = 130.f;
	UPROPERTY(VisibleAnywhere) float MaxAccelerationCms2 = 1500.f;
	UPROPERTY(VisibleAnywhere) float BrakingDecelerationCms2 = 1800.f;
	UPROPERTY(VisibleAnywhere) float GroundFriction = 6.f;
	UPROPERTY(VisibleAnywhere) float BrakingFrictionFactor = 1.f;
	UPROPERTY(VisibleAnywhere) float AirControl = 0.15f;
	UPROPERTY(VisibleAnywhere) float JumpHeightCm = 95.f;
	UPROPERTY(VisibleAnywhere) float CoyoteTimeS = 0.10f;
	UPROPERTY(VisibleAnywhere) float MaxStepHeightCm = 40.f;
	UPROPERTY(VisibleAnywhere) float WalkableFloorAngleDeg = 44.f;
	UPROPERTY(VisibleAnywhere) float StanceTransitionS = 0.20f;
	UPROPERTY(VisibleAnywhere) float StandClearanceProbeMarginCm = 4.f;
	UPROPERTY(VisibleAnywhere) float FovHorizontalDeg = 90.f;
	UPROPERTY(VisibleAnywhere) float LookSensitivityDegPerUnit = 0.07f;
	UPROPERTY(VisibleAnywhere) bool bInvertY = false;
	UPROPERTY(VisibleAnywhere) float PitchMinDeg = -89.f;
	UPROPERTY(VisibleAnywhere) float PitchMaxDeg = 89.f;

	/** Data/movement.json "binds": entry name -> Unreal FKey. Populated with the compiled defaults by the constructor. */
	UPROPERTY(VisibleAnywhere) TMap<FName, FKey> Binds;

	FHellfallMovementTuning();

	/** Compiled defaults for the binds (must equal Data/movement.json). */
	static TMap<FName, FKey> MakeDefaultBinds();

	/** Looks up a bind; returns EKeys::Invalid when the name is unknown. */
	FKey GetBind(FName BindName) const;

	/** Capsule half-heights per stance as the engine will actually use them.
	 *  UCapsuleComponent clamps half-height to >= radius, so a crawl height below 2*radius becomes a sphere;
	 *  these accessors apply the same clamp so the camera math and the clearance probe agree with the collision. */
	float StandHalfHeightCm() const;
	float CrouchHalfHeightCm() const;
	float CrawlHalfHeightCm() const;

	/** Range/consistency checks. Returns false and fills OutProblem when a value cannot be used safely. */
	bool Validate(FString& OutProblem) const;
};

/** One row of Data/levels.json "levels" (level registry; REQ-G1-004 acceptance 2 and REQ-G6-006). */
USTRUCT()
struct FHellfallLevelEntry
{
	GENERATED_BODY()

	UPROPERTY(VisibleAnywhere) FName Id;
	UPROPERTY(VisibleAnywhere) FString DisplayName;
	/** Long package name, e.g. /Game/Maps/L_ExecutiveFloor (what UGameplayStatics::OpenLevel accepts). */
	UPROPERTY(VisibleAnywhere) FString Map;
	UPROPERTY(VisibleAnywhere) int32 Order = 0;
	UPROPERTY(VisibleAnywhere) bool bHidden = false;

	/** Short map name ("L_FeelGym"), comparable with UGameplayStatics::GetCurrentLevelName. */
	FString ShortMapName() const;
};

/**
 * Game-instance subsystem that loads Data/movement.json and Data/levels.json once per game instance.
 * Lives for the whole session (survives level changes), so the feel gym toggle and every pawn read the
 * same numbers. Get() it from any world-context object.
 */
UCLASS()
class UHellfallTuning : public UGameInstanceSubsystem
{
	GENERATED_BODY()

public:
	// UGameInstanceSubsystem
	virtual void Initialize(FSubsystemCollectionBase& Collection) override;
	virtual void Deinitialize() override;

	/** Static accessor. Returns nullptr when there is no game instance yet (CDO/constructor time). */
	static UHellfallTuning* Get(const UObject* WorldContext);

	const FHellfallMovementTuning& GetMovementTuning() const { return Movement; }
	const TArray<FHellfallLevelEntry>& GetLevels() const { return Levels; }
	bool FindLevel(FName LevelId, FHellfallLevelEntry& OutEntry) const;

	/** True when Data/movement.json parsed and validated. False means compiled defaults are in use. */
	bool WasLoadedFromFile() const { return bLoadedFromFile; }
	/** Empty when everything loaded cleanly. Otherwise a one-line, human-readable reason (shown in red by the HUD). */
	const FString& GetLoadError() const { return LoadError; }

	/** Absolute path used for Data/movement.json (for logs and the HUD). */
	const FString& GetMovementJsonPath() const { return MovementJsonPath; }

	/** Re-reads both files. Used at Initialize; exposed so a console command can hot-reload later. */
	void Reload();

private:
	bool LoadMovementJson(const FString& Path, FHellfallMovementTuning& OutTuning, FString& OutError) const;
	bool LoadLevelsJson(const FString& Path, TArray<FHellfallLevelEntry>& OutLevels, FString& OutError) const;
	static TArray<FHellfallLevelEntry> MakeDefaultLevels();

	UPROPERTY(VisibleAnywhere) FHellfallMovementTuning Movement;
	UPROPERTY(VisibleAnywhere) TArray<FHellfallLevelEntry> Levels;
	UPROPERTY(VisibleAnywhere) bool bLoadedFromFile = false;
	UPROPERTY(VisibleAnywhere) FString LoadError;
	UPROPERTY(VisibleAnywhere) FString MovementJsonPath;
};
