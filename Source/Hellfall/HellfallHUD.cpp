// HELLFALL debug/feel HUD (REQ-G1-003).
#include "HellfallHUD.h"

#include "Hellfall.h"
#include "HellfallCharacter.h"
#include "HellfallMovementComponent.h"
#include "HellfallTuning.h"
#include "Engine/Canvas.h"
#include "Engine/Engine.h"
#include "Engine/Font.h"
#include "Engine/World.h"
#include "Kismet/GameplayStatics.h"

namespace
{
	const FLinearColor ColorText(0.92f, 0.92f, 0.92f, 1.f);
	const FLinearColor ColorLabel(0.65f, 0.65f, 0.65f, 1.f);
	const FLinearColor ColorHeader(1.f, 0.80f, 0.35f, 1.f);
	const FLinearColor ColorWarn(1.f, 0.85f, 0.10f, 1.f);
	const FLinearColor ColorError(1.f, 0.15f, 0.15f, 1.f);
	const FLinearColor ColorShadow(0.f, 0.f, 0.f, 0.85f);
}

AHellfallHUD::AHellfallHUD()
{
}

FString AHellfallHUD::KeyLabel(const FHellfallMovementTuning& Tuning, FName BindName)
{
	const FKey Key = Tuning.GetBind(BindName);
	return Key.IsValid() ? Key.GetDisplayName().ToString() : FString(TEXT("<unbound>"));
}

float AHellfallHUD::DrawLine(const FString& Text, float X, float Y, const FLinearColor& Color, UFont* Font, float Scale)
{
	float Width = 0.f;
	float Height = 0.f;
	GetTextSize(Text, Width, Height, Font, Scale);
	DrawText(Text, ColorShadow, X + 1.f, Y + 1.f, Font, Scale);
	DrawText(Text, Color, X, Y, Font, Scale);
	return Height + 2.f;
}

float AHellfallHUD::DrawRow(const FString& Label, const FString& Value, float X, float Y, const FLinearColor& Color, UFont* Font, float Scale)
{
	const float H1 = DrawLine(Label, X, Y, ColorLabel, Font, Scale);
	const float H2 = DrawLine(Value, X + LabelColumnWidth * Scale, Y, Color, Font, Scale);
	return FMath::Max(H1, H2);
}

void AHellfallHUD::DrawHUD()
{
	Super::DrawHUD();
	if (Canvas == nullptr || GEngine == nullptr)
	{
		return;
	}

	UFont* Small = GEngine->GetSmallFont();
	UFont* Medium = GEngine->GetMediumFont();
	if (Small == nullptr || Medium == nullptr)
	{
		return;
	}

	const AHellfallCharacter* Character = Cast<AHellfallCharacter>(GetOwningPawn());
	const UHellfallMovementComponent* Move = Character ? Character->GetHellfallMovement() : nullptr;
	const UHellfallTuning* TuningSubsystem = UHellfallTuning::Get(this);

	static const FHellfallMovementTuning CompiledDefaults;
	const FHellfallMovementTuning& Tuning =
		Character ? Character->GetMovementTuning() : (TuningSubsystem ? TuningSubsystem->GetMovementTuning() : CompiledDefaults);

	// Scale with vertical resolution so the block reads the same at 1080p and 4K.
	const float Scale = FMath::Clamp(static_cast<float>(Canvas->SizeY) / 1080.f, 0.75f, 2.5f) * 1.25f;
	float X = 24.f * Scale;
	float Y = 24.f * Scale;

	// ---- Header ----
	Y += DrawLine(TEXT("HELLFALL  greybox build"), X, Y, ColorHeader, Medium, Scale);
	Y += 6.f * Scale;

	// ---- Controls (REQ-G1-003 acceptance 1: every control listed on screen, names from Data/movement.json) ----
	Y += DrawLine(TEXT("CONTROLS"), X, Y, ColorHeader, Small, Scale);
	const FString MoveKeys = FString::Printf(TEXT("%s %s %s %s"),
		*KeyLabel(Tuning, HellfallBinds::MoveForward), *KeyLabel(Tuning, HellfallBinds::MoveLeft),
		*KeyLabel(Tuning, HellfallBinds::MoveBack), *KeyLabel(Tuning, HellfallBinds::MoveRight));
	Y += DrawRow(TEXT("Move"), MoveKeys, X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Look"), TEXT("Mouse"), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Jump"), KeyLabel(Tuning, HellfallBinds::Jump), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Crouch (toggle)"), KeyLabel(Tuning, HellfallBinds::CrouchToggle), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Crawl (toggle)"), KeyLabel(Tuning, HellfallBinds::CrawlToggle), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Sprint (hold)"), KeyLabel(Tuning, HellfallBinds::SprintHold), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Interact"), KeyLabel(Tuning, HellfallBinds::Interact), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Pause"), KeyLabel(Tuning, HellfallBinds::Pause), X, Y, ColorText, Small, Scale);
	Y += DrawRow(TEXT("Feel gym"), KeyLabel(Tuning, HellfallBinds::ToggleFeelGym), X, Y, ColorText, Small, Scale);
	Y += 6.f * Scale;

	// ---- Status ----
	Y += DrawLine(TEXT("STATUS"), X, Y, ColorHeader, Small, Scale);
	if (Move != nullptr)
	{
		FString StanceText = HellfallStanceToString(Move->GetStance());
		if (Move->IsTransitioning())
		{
			StanceText += TEXT(" (changing)");
		}
		else if (Move->GetDesiredStance() != Move->GetStance())
		{
			StanceText += FString::Printf(TEXT(" (wants %s)"), HellfallStanceToString(Move->GetDesiredStance()));
		}
		Y += DrawRow(TEXT("Stance"), StanceText, X, Y, ColorText, Small, Scale);

		if (Move->IsStandBlocked())
		{
			// REQ-G1-003 acceptance 2 / REQ-G1-006: geometry refused the larger stance.
			Y += DrawLine(TEXT("STAND BLOCKED - no headroom"), X, Y, ColorWarn, Medium, Scale);
		}

		const FVector Velocity = Move->Velocity;
		const FString SpeedText = FString::Printf(TEXT("%4.0f cm/s   (vertical %+.0f)   cap %.0f%s"),
			Velocity.Size2D(), Velocity.Z, Move->GetMaxSpeed(), Move->IsSprinting() ? TEXT("  SPRINT") : TEXT(""));
		Y += DrawRow(TEXT("Speed"), SpeedText, X, Y, ColorText, Small, Scale);
		Y += DrawRow(TEXT("Ground"), Move->IsMovingOnGround() ? TEXT("on floor") : (Move->IsFalling() ? TEXT("airborne") : TEXT("other")), X, Y, ColorText, Small, Scale);

		const float HalfHeight = Move->GetCurrentCapsuleHalfHeight();
		Y += DrawRow(TEXT("Body"), FString::Printf(TEXT("capsule %.0f cm  eye %.0f cm  r %.0f"), 2.f * HalfHeight, Move->GetCurrentEyeHeightAboveFeet(), Tuning.CapsuleRadiusCm),
			X, Y, ColorText, Small, Scale);
	}
	else
	{
		Y += DrawLine(TEXT("no HellfallCharacter possessed"), X, Y, ColorWarn, Small, Scale);
	}

	Y += DrawRow(TEXT("Map"), UGameplayStatics::GetCurrentLevelName(this, true), X, Y, ColorText, Small, Scale);
	if (GetWorld() && GetWorld()->IsPaused())
	{
		Y += DrawLine(FString::Printf(TEXT("PAUSED - %s to resume"), *KeyLabel(Tuning, HellfallBinds::Pause)), X, Y, ColorWarn, Medium, Scale);
	}

	// ---- Tuning error (fail-soft indicator) ----
	if (TuningSubsystem == nullptr)
	{
		Y += DrawLine(TEXT("TUNING: subsystem missing - compiled defaults"), X, Y, ColorError, Small, Scale);
	}
	else if (!TuningSubsystem->GetLoadError().IsEmpty())
	{
		Y += DrawLine(FString::Printf(TEXT("TUNING: %s"), *TuningSubsystem->GetLoadError()), X, Y, ColorError, Small, Scale);
	}

	// ---- Centre dot ----
	const float DotSize = FMath::Max(2.f, 3.f * Scale / 1.25f);
	const float CenterX = 0.5f * static_cast<float>(Canvas->SizeX);
	const float CenterY = 0.5f * static_cast<float>(Canvas->SizeY);
	DrawRect(FLinearColor(0.f, 0.f, 0.f, 0.6f), CenterX - 0.5f * DotSize - 1.f, CenterY - 0.5f * DotSize - 1.f, DotSize + 2.f, DotSize + 2.f);
	DrawRect(FLinearColor(1.f, 1.f, 1.f, 0.9f), CenterX - 0.5f * DotSize, CenterY - 0.5f * DotSize, DotSize, DotSize);
}
