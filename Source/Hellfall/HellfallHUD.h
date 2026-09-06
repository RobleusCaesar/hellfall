// HELLFALL debug/feel HUD (REQ-G1-003 acceptance 1: every control is displayed on screen).
// Canvas text only - no UMG, no Blueprint (G-3). Replaced by the real HUD at REQ-G5-006.
#pragma once

#include "CoreMinimal.h"
#include "GameFramework/HUD.h"
#include "HellfallHUD.generated.h"

class UFont;
struct FHellfallMovementTuning;

UCLASS()
class AHellfallHUD : public AHUD
{
	GENERATED_BODY()

public:
	AHellfallHUD();

	// AHUD
	virtual void DrawHUD() override;

private:
	/** Draws one line with a 1px dark shadow; returns the line height actually used. */
	float DrawLine(const FString& Text, float X, float Y, const FLinearColor& Color, UFont* Font, float Scale);
	/** Two-column row: label in grey, value in Color. */
	float DrawRow(const FString& Label, const FString& Value, float X, float Y, const FLinearColor& Color, UFont* Font, float Scale);
	/** Human-readable key name for one bind ("Space Bar", "Left Ctrl", ...). */
	static FString KeyLabel(const FHellfallMovementTuning& Tuning, FName BindName);

	float LabelColumnWidth = 150.f;
};
