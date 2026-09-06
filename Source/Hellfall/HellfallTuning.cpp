// HELLFALL tuning subsystem (REQ-G1-003 acceptance 3: change Data/movement.json, rebuild, speed changes, no code edit).
#include "HellfallTuning.h"

#include "Hellfall.h"
#include "Dom/JsonObject.h"
#include "Dom/JsonValue.h"
#include "Engine/GameInstance.h"
#include "Kismet/GameplayStatics.h"
#include "Misc/FileHelper.h"
#include "Misc/PackageName.h"
#include "Misc/Paths.h"
#include "Serialization/JsonReader.h"
#include "Serialization/JsonSerializer.h"

// ---------------------------------------------------------------------------------------------
// FHellfallMovementTuning
// ---------------------------------------------------------------------------------------------

FHellfallMovementTuning::FHellfallMovementTuning()
{
	Binds = MakeDefaultBinds();
}

TMap<FName, FKey> FHellfallMovementTuning::MakeDefaultBinds()
{
	// Must equal Data/movement.json "binds". C = crawl matches both of Rob's earlier prototypes.
	TMap<FName, FKey> Out;
	Out.Add(HellfallBinds::MoveForward, EKeys::W);
	Out.Add(HellfallBinds::MoveBack, EKeys::S);
	Out.Add(HellfallBinds::MoveLeft, EKeys::A);
	Out.Add(HellfallBinds::MoveRight, EKeys::D);
	Out.Add(HellfallBinds::Jump, EKeys::SpaceBar);
	Out.Add(HellfallBinds::CrouchToggle, EKeys::LeftControl);
	Out.Add(HellfallBinds::CrawlToggle, EKeys::C);
	Out.Add(HellfallBinds::SprintHold, EKeys::LeftShift);
	Out.Add(HellfallBinds::Interact, EKeys::E);
	Out.Add(HellfallBinds::Pause, EKeys::Escape);
	Out.Add(HellfallBinds::ToggleFeelGym, EKeys::F1);
	return Out;
}

FKey FHellfallMovementTuning::GetBind(FName BindName) const
{
	const FKey* Found = Binds.Find(BindName);
	return Found ? *Found : EKeys::Invalid;
}

float FHellfallMovementTuning::StandHalfHeightCm() const
{
	return FMath::Max(0.5f * StandHeightCm, CapsuleRadiusCm);
}

float FHellfallMovementTuning::CrouchHalfHeightCm() const
{
	return FMath::Max(0.5f * CrouchHeightCm, CapsuleRadiusCm);
}

float FHellfallMovementTuning::CrawlHalfHeightCm() const
{
	// NOTE: with the current values (crawl 64, radius 36) this clamps to 36 -> the crawl capsule is a
	// 72 cm sphere, 8 cm taller than the requested 64. Still passes the 95 cm duct. Flagged in
	// README-SOURCE.md; fix is a data change (crawl_height_cm >= 72 or a smaller radius), not code.
	return FMath::Max(0.5f * CrawlHeightCm, CapsuleRadiusCm);
}

bool FHellfallMovementTuning::Validate(FString& OutProblem) const
{
	auto Fail = [&OutProblem](const FString& Msg) { OutProblem = Msg; return false; };

	if (CapsuleRadiusCm <= 0.f) return Fail(TEXT("capsule_radius_cm must be > 0"));
	if (!(CrawlHeightCm < CrouchHeightCm && CrouchHeightCm < StandHeightCm))
	{
		return Fail(TEXT("heights must satisfy crawl < crouch < stand"));
	}
	if (StandHeightCm < 2.f * CapsuleRadiusCm) return Fail(TEXT("stand_height_cm must be >= 2 * capsule_radius_cm"));
	if (EyeHeightStandCm <= 0.f || EyeHeightStandCm > StandHeightCm) return Fail(TEXT("eye_height_stand_cm must be within (0, stand_height_cm]"));
	if (EyeHeightCrouchCm <= 0.f || EyeHeightCrouchCm > CrouchHeightCm) return Fail(TEXT("eye_height_crouch_cm must be within (0, crouch_height_cm]"));
	if (EyeHeightCrawlCm <= 0.f || EyeHeightCrawlCm > 2.f * CrawlHalfHeightCm()) return Fail(TEXT("eye_height_crawl_cm must be within (0, effective crawl height]"));
	if (WalkSpeedCms <= 0.f || SprintSpeedCms <= 0.f || CrouchSpeedCms <= 0.f || CrawlSpeedCms <= 0.f) return Fail(TEXT("all *_speed_cms must be > 0"));
	if (MaxAccelerationCms2 <= 0.f || BrakingDecelerationCms2 < 0.f) return Fail(TEXT("max_acceleration_cms2 must be > 0 and braking_deceleration_cms2 >= 0"));
	if (GroundFriction < 0.f || BrakingFrictionFactor < 0.f) return Fail(TEXT("friction values must be >= 0"));
	if (AirControl < 0.f || AirControl > 1.f) return Fail(TEXT("air_control must be within [0, 1]"));
	if (JumpHeightCm <= 0.f) return Fail(TEXT("jump_height_cm must be > 0"));
	if (CoyoteTimeS < 0.f || CoyoteTimeS > 1.f) return Fail(TEXT("coyote_time_s must be within [0, 1]"));
	if (MaxStepHeightCm < 0.f || MaxStepHeightCm >= StandHalfHeightCm()) return Fail(TEXT("max_step_height_cm must be >= 0 and below the standing capsule half-height"));
	if (WalkableFloorAngleDeg <= 0.f || WalkableFloorAngleDeg >= 90.f) return Fail(TEXT("walkable_floor_angle_deg must be within (0, 90)"));
	if (StanceTransitionS < 0.f || StanceTransitionS > 2.f) return Fail(TEXT("stance_transition_s must be within [0, 2]"));
	if (StandClearanceProbeMarginCm < 0.f) return Fail(TEXT("stand_clearance_probe_margin_cm must be >= 0"));
	if (FovHorizontalDeg < 40.f || FovHorizontalDeg > 150.f) return Fail(TEXT("fov_horizontal_deg must be within [40, 150]"));
	if (LookSensitivityDegPerUnit <= 0.f) return Fail(TEXT("look_sensitivity_deg_per_unit must be > 0"));
	if (!(PitchMinDeg < PitchMaxDeg) || PitchMinDeg < -90.f || PitchMaxDeg > 90.f) return Fail(TEXT("pitch limits must satisfy -90 <= min < max <= 90"));

	for (const TPair<FName, FKey>& Pair : Binds)
	{
		if (!Pair.Value.IsValid())
		{
			return Fail(FString::Printf(TEXT("bind '%s' has no valid key"), *Pair.Key.ToString()));
		}
	}
	return true;
}

// ---------------------------------------------------------------------------------------------
// FHellfallLevelEntry
// ---------------------------------------------------------------------------------------------

FString FHellfallLevelEntry::ShortMapName() const
{
	return FPackageName::GetShortName(Map);
}

// ---------------------------------------------------------------------------------------------
// UHellfallTuning
// ---------------------------------------------------------------------------------------------

void UHellfallTuning::Initialize(FSubsystemCollectionBase& Collection)
{
	Super::Initialize(Collection);
	Reload();
}

void UHellfallTuning::Deinitialize()
{
	Super::Deinitialize();
}

UHellfallTuning* UHellfallTuning::Get(const UObject* WorldContext)
{
	if (WorldContext == nullptr)
	{
		return nullptr;
	}
	UGameInstance* GameInstance = UGameplayStatics::GetGameInstance(WorldContext);
	return GameInstance ? GameInstance->GetSubsystem<UHellfallTuning>() : nullptr;
}

bool UHellfallTuning::FindLevel(FName LevelId, FHellfallLevelEntry& OutEntry) const
{
	for (const FHellfallLevelEntry& Entry : Levels)
	{
		if (Entry.Id == LevelId)
		{
			OutEntry = Entry;
			return true;
		}
	}
	return false;
}

void UHellfallTuning::Reload()
{
	// FPaths::ProjectDir() is the folder holding Hellfall.uproject in the editor, and the
	// <Staged>/Hellfall/ folder in a packaged build. Tools/package.ps1 copies Data/ there so this
	// same path resolves in both (comment in Config/DefaultGame.ini).
	const FString DataDir = FPaths::Combine(FPaths::ProjectDir(), TEXT("Data"));
	MovementJsonPath = FPaths::ConvertRelativePathToFull(FPaths::Combine(DataDir, TEXT("movement.json")));
	const FString LevelsJsonPath = FPaths::ConvertRelativePathToFull(FPaths::Combine(DataDir, TEXT("levels.json")));

	LoadError.Reset();
	bLoadedFromFile = false;

	// --- movement.json (fail-soft: defaults equal the JSON) ---
	FHellfallMovementTuning Loaded;
	FString MovementError;
	if (LoadMovementJson(MovementJsonPath, Loaded, MovementError))
	{
		Movement = Loaded;
		bLoadedFromFile = true;
		UE_LOG(LogHellfall, Log, TEXT("Tuning: loaded %s (walk %.0f cm/s, stand %.0f cm, %d binds)"),
			*MovementJsonPath, Movement.WalkSpeedCms, Movement.StandHeightCm, Movement.Binds.Num());
	}
	else
	{
		Movement = FHellfallMovementTuning();
		LoadError = FString::Printf(TEXT("movement.json NOT USED (%s) - compiled defaults active"), *MovementError);
		UE_LOG(LogHellfall, Error, TEXT("Tuning: %s [%s]"), *LoadError, *MovementJsonPath);
	}

	// --- levels.json (fail-soft: defaults equal the JSON) ---
	TArray<FHellfallLevelEntry> LoadedLevels;
	FString LevelsError;
	if (LoadLevelsJson(LevelsJsonPath, LoadedLevels, LevelsError))
	{
		Levels = LoadedLevels;
		UE_LOG(LogHellfall, Log, TEXT("Tuning: loaded %s (%d levels)"), *LevelsJsonPath, Levels.Num());
	}
	else
	{
		Levels = MakeDefaultLevels();
		const FString Msg = FString::Printf(TEXT("levels.json NOT USED (%s) - compiled registry active"), *LevelsError);
		LoadError = LoadError.IsEmpty() ? Msg : (LoadError + TEXT(" | ") + Msg);
		UE_LOG(LogHellfall, Error, TEXT("Tuning: %s [%s]"), *Msg, *LevelsJsonPath);
	}
}

namespace
{
	// Reads a numeric field into a float. Missing/non-numeric keys are collected so one error line
	// can name them all (fail-soft: the caller then falls back to the compiled defaults).
	void ReadNumber(const TSharedPtr<FJsonObject>& Obj, const TCHAR* Key, float& Out, TArray<FString>& Missing)
	{
		double Value = 0.0;
		if (Obj.IsValid() && Obj->TryGetNumberField(FString(Key), Value))
		{
			Out = static_cast<float>(Value);
		}
		else
		{
			Missing.Add(Key);
		}
	}

	void ReadBool(const TSharedPtr<FJsonObject>& Obj, const TCHAR* Key, bool& Out, TArray<FString>& Missing)
	{
		bool Value = false;
		if (Obj.IsValid() && Obj->TryGetBoolField(FString(Key), Value))
		{
			Out = Value;
		}
		else
		{
			Missing.Add(Key);
		}
	}

	bool ParseJsonFile(const FString& Path, TSharedPtr<FJsonObject>& OutRoot, FString& OutError)
	{
		if (!FPaths::FileExists(Path))
		{
			OutError = TEXT("file not found");
			return false;
		}
		FString Text;
		if (!FFileHelper::LoadFileToString(Text, *Path))
		{
			OutError = TEXT("file could not be read");
			return false;
		}
		const TSharedRef<TJsonReader<>> Reader = TJsonReaderFactory<>::Create(Text);
		if (!FJsonSerializer::Deserialize(Reader, OutRoot) || !OutRoot.IsValid())
		{
			OutError = FString::Printf(TEXT("invalid JSON: %s"), *Reader->GetErrorMessage());
			return false;
		}
		return true;
	}
}

bool UHellfallTuning::LoadMovementJson(const FString& Path, FHellfallMovementTuning& OutTuning, FString& OutError) const
{
	TSharedPtr<FJsonObject> Root;
	if (!ParseJsonFile(Path, Root, OutError))
	{
		return false;
	}

	const TSharedPtr<FJsonObject>* PlayerObj = nullptr;
	if (!Root->TryGetObjectField(TEXT("player"), PlayerObj) || PlayerObj == nullptr || !PlayerObj->IsValid())
	{
		OutError = TEXT("missing \"player\" object");
		return false;
	}
	const TSharedPtr<FJsonObject>& Player = *PlayerObj;

	FHellfallMovementTuning T; // starts at compiled defaults
	TArray<FString> Missing;
	ReadNumber(Player, TEXT("capsule_radius_cm"), T.CapsuleRadiusCm, Missing);
	ReadNumber(Player, TEXT("stand_height_cm"), T.StandHeightCm, Missing);
	ReadNumber(Player, TEXT("crouch_height_cm"), T.CrouchHeightCm, Missing);
	ReadNumber(Player, TEXT("crawl_height_cm"), T.CrawlHeightCm, Missing);
	ReadNumber(Player, TEXT("eye_height_stand_cm"), T.EyeHeightStandCm, Missing);
	ReadNumber(Player, TEXT("eye_height_crouch_cm"), T.EyeHeightCrouchCm, Missing);
	ReadNumber(Player, TEXT("eye_height_crawl_cm"), T.EyeHeightCrawlCm, Missing);
	ReadNumber(Player, TEXT("walk_speed_cms"), T.WalkSpeedCms, Missing);
	ReadNumber(Player, TEXT("sprint_speed_cms"), T.SprintSpeedCms, Missing);
	ReadNumber(Player, TEXT("crouch_speed_cms"), T.CrouchSpeedCms, Missing);
	ReadNumber(Player, TEXT("crawl_speed_cms"), T.CrawlSpeedCms, Missing);
	ReadNumber(Player, TEXT("max_acceleration_cms2"), T.MaxAccelerationCms2, Missing);
	ReadNumber(Player, TEXT("braking_deceleration_cms2"), T.BrakingDecelerationCms2, Missing);
	ReadNumber(Player, TEXT("ground_friction"), T.GroundFriction, Missing);
	ReadNumber(Player, TEXT("braking_friction_factor"), T.BrakingFrictionFactor, Missing);
	ReadNumber(Player, TEXT("air_control"), T.AirControl, Missing);
	ReadNumber(Player, TEXT("jump_height_cm"), T.JumpHeightCm, Missing);
	ReadNumber(Player, TEXT("coyote_time_s"), T.CoyoteTimeS, Missing);
	ReadNumber(Player, TEXT("max_step_height_cm"), T.MaxStepHeightCm, Missing);
	ReadNumber(Player, TEXT("walkable_floor_angle_deg"), T.WalkableFloorAngleDeg, Missing);
	ReadNumber(Player, TEXT("stance_transition_s"), T.StanceTransitionS, Missing);
	ReadNumber(Player, TEXT("stand_clearance_probe_margin_cm"), T.StandClearanceProbeMarginCm, Missing);
	ReadNumber(Player, TEXT("fov_horizontal_deg"), T.FovHorizontalDeg, Missing);
	ReadNumber(Player, TEXT("look_sensitivity_deg_per_unit"), T.LookSensitivityDegPerUnit, Missing);
	ReadBool(Player, TEXT("invert_y"), T.bInvertY, Missing);
	ReadNumber(Player, TEXT("pitch_min_deg"), T.PitchMinDeg, Missing);
	ReadNumber(Player, TEXT("pitch_max_deg"), T.PitchMaxDeg, Missing);

	if (Missing.Num() > 0)
	{
		// A partially-specified file is treated as corrupt: mixing file values with defaults could
		// produce a body no one authored (e.g. new eye height with old stand height).
		OutError = FString::Printf(TEXT("player keys missing or not numbers: %s"), *FString::Join(Missing, TEXT(", ")));
		return false;
	}

	// Binds: every string entry becomes an FKey; "_comment"-style keys are skipped.
	const TSharedPtr<FJsonObject>* BindsObj = nullptr;
	if (!Root->TryGetObjectField(TEXT("binds"), BindsObj) || BindsObj == nullptr || !BindsObj->IsValid())
	{
		OutError = TEXT("missing \"binds\" object");
		return false;
	}
	TArray<FString> BadBinds;
	for (const TPair<FString, TSharedPtr<FJsonValue>>& Pair : (*BindsObj)->Values)
	{
		if (Pair.Key.StartsWith(TEXT("_")))
		{
			continue;
		}
		FString KeyName;
		if (!Pair.Value.IsValid() || !Pair.Value->TryGetString(KeyName))
		{
			BadBinds.Add(Pair.Key + TEXT("=<not a string>"));
			continue;
		}
		const FKey Key(FName(*KeyName));
		if (!Key.IsValid())
		{
			// FKey::IsValid() is false for names EKeys does not know (typo, e.g. "Space" instead of "SpaceBar").
			BadBinds.Add(Pair.Key + TEXT("=") + KeyName);
			continue;
		}
		T.Binds.Add(FName(*Pair.Key), Key);
	}
	if (BadBinds.Num() > 0)
	{
		OutError = FString::Printf(TEXT("binds with unknown FKey names: %s"), *FString::Join(BadBinds, TEXT(", ")));
		return false;
	}
	// Every bind the code relies on must be present (the file may add extra ones freely).
	const TMap<FName, FKey> Required = FHellfallMovementTuning::MakeDefaultBinds();
	TArray<FString> MissingBinds;
	for (const TPair<FName, FKey>& Pair : Required)
	{
		if (!T.Binds.Contains(Pair.Key))
		{
			MissingBinds.Add(Pair.Key.ToString());
		}
	}
	if (MissingBinds.Num() > 0)
	{
		OutError = FString::Printf(TEXT("binds missing: %s"), *FString::Join(MissingBinds, TEXT(", ")));
		return false;
	}

	FString Problem;
	if (!T.Validate(Problem))
	{
		OutError = FString::Printf(TEXT("validation failed: %s"), *Problem);
		return false;
	}

	OutTuning = T;
	return true;
}

TArray<FHellfallLevelEntry> UHellfallTuning::MakeDefaultLevels()
{
	// Must equal Data/levels.json.
	TArray<FHellfallLevelEntry> Out;
	{
		FHellfallLevelEntry E;
		E.Id = FName(TEXT("executive_floor"));
		E.DisplayName = TEXT("Executive Floor");
		E.Map = TEXT("/Game/Maps/L_ExecutiveFloor");
		E.Order = 10;
		E.bHidden = false;
		Out.Add(E);
	}
	{
		FHellfallLevelEntry E;
		E.Id = FName(TEXT("feel_gym"));
		E.DisplayName = TEXT("Feel Gym");
		E.Map = TEXT("/Game/Maps/L_FeelGym");
		E.Order = 900;
		E.bHidden = true;
		Out.Add(E);
	}
	return Out;
}

bool UHellfallTuning::LoadLevelsJson(const FString& Path, TArray<FHellfallLevelEntry>& OutLevels, FString& OutError) const
{
	TSharedPtr<FJsonObject> Root;
	if (!ParseJsonFile(Path, Root, OutError))
	{
		return false;
	}
	const TArray<TSharedPtr<FJsonValue>>* LevelsArray = nullptr;
	if (!Root->TryGetArrayField(TEXT("levels"), LevelsArray) || LevelsArray == nullptr)
	{
		OutError = TEXT("missing \"levels\" array");
		return false;
	}

	TArray<FHellfallLevelEntry> Parsed;
	for (int32 Index = 0; Index < LevelsArray->Num(); ++Index)
	{
		const TSharedPtr<FJsonObject>* EntryObj = nullptr;
		const TSharedPtr<FJsonValue>& Value = (*LevelsArray)[Index];
		if (!Value.IsValid() || !Value->TryGetObject(EntryObj) || EntryObj == nullptr || !EntryObj->IsValid())
		{
			OutError = FString::Printf(TEXT("levels[%d] is not an object"), Index);
			return false;
		}
		FHellfallLevelEntry E;
		FString Id, DisplayName, Map;
		if (!(*EntryObj)->TryGetStringField(TEXT("id"), Id) || Id.IsEmpty() ||
			!(*EntryObj)->TryGetStringField(TEXT("display_name"), DisplayName) ||
			!(*EntryObj)->TryGetStringField(TEXT("map"), Map) || !Map.StartsWith(TEXT("/Game/")))
		{
			OutError = FString::Printf(TEXT("levels[%d] needs string id, display_name and a /Game/ map path"), Index);
			return false;
		}
		E.Id = FName(*Id);
		E.DisplayName = DisplayName;
		E.Map = Map;
		double Order = 0.0;
		if ((*EntryObj)->TryGetNumberField(TEXT("order"), Order))
		{
			E.Order = static_cast<int32>(Order);
		}
		bool bHidden = false;
		if ((*EntryObj)->TryGetBoolField(TEXT("hidden"), bHidden))
		{
			E.bHidden = bHidden;
		}
		Parsed.Add(E);
	}
	if (Parsed.Num() == 0)
	{
		OutError = TEXT("\"levels\" is empty");
		return false;
	}
	Parsed.Sort([](const FHellfallLevelEntry& A, const FHellfallLevelEntry& B) { return A.Order < B.Order; });
	OutLevels = Parsed;
	return true;
}
