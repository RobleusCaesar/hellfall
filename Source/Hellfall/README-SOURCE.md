# Source/Hellfall — what is here and how it fits

Runtime module `Hellfall` (C++ only, G-3). Everything in this folder serves REQ-G1-001 (foundation) and
REQ-G1-003 (traversal controller). No Blueprints, no `.uasset` input assets: the mapping context and
the input actions are built in C++ at possession time from `Data/movement.json`.

## Class map

| Class | Base | Job |
|---|---|---|
| `UHellfallTuning` | `UGameInstanceSubsystem` | Loads `Data/movement.json` into `FHellfallMovementTuning` and `Data/levels.json` into `FHellfallLevelEntry[]` once per game instance. Fail-soft: compiled defaults equal the JSON; `GetLoadError()` is non-empty when the file was not honoured. |
| `UHellfallMovementComponent` | `UCharacterMovementComponent` | Three-stance body (Standing / Crouching / Crawling), stance transitions, clearance probe, per-stance speed caps, sprint, coyote-time jump rule. Engine crouch is disabled (`bCanCrouch = false`). |
| `AHellfallCharacter` | `ACharacter` | Capsule + first-person camera, Enhanced Input built in C++, input handlers, camera follows the stance interpolation, F1 level toggle via the registry. |
| `AHellfallPlayerController` | `APlayerController` | Pitch clamp from tuning, game-only input mode, focus loss -> cursor released / focus regain -> one look sample dropped and the game or paused input mode re-applied (alt-tab while paused cannot lock the game), menuless Gate-1 pause. |
| `AHellfallHUD` | `AHUD` | Canvas text: header `HELLFALL  greybox build` (no gate number - the first Release is gate-0), CONTROLS block (every bind by name), stance, STAND BLOCKED, speed, map, red tuning error line, centre dot. |
| `AHellfallGameMode` | `AGameModeBase` | Wires the three classes above; `GlobalDefaultGameMode` in `Config/DefaultEngine.ini`. |

`Hellfall.h/.cpp` define the module and the `LogHellfall` category.

## Tuning flow (JSON -> struct -> components)

```
Data/movement.json ──FJsonSerializer──> FHellfallMovementTuning   (UHellfallTuning::Reload, once per game instance)
                                              │
              ┌───────────────────────────────┼──────────────────────────────┐
              ▼                               ▼                              ▼
  UHellfallMovementComponent::ApplyTuning   AHellfallCharacter          AHellfallPlayerController
  (speeds, accel, friction, step, floor     (capsule size, camera FOV,  (ViewPitchMin/Max)
   angle, JumpZVelocity = sqrt(2 g h),       binds -> IMC/IA in C++,
   stance heights, eye heights, probe        look sensitivity)
   margin, transition time, coyote time)
```

Rules: the component copies the values at `InitializeComponent` (spawn time, before possession and
`BeginPlay`; `BeginPlay` re-applies only if no game instance existed then). The character reads the
subsystem directly in `SetupPlayerInputComponent`: on a map load possession - and with it the input
mapping build - happens inside `UEngine::LoadMap` before the world's `BeginPlay`, so reading the
component's copy there would bake the compiled-default binds and `invert_y` into the mapping. The
controller reads the subsystem at `BeginPlay`, the HUD every frame. Missing file or any missing/invalid
key => whole struct falls back to compiled defaults (never a half-authored body) and the HUD prints
`TUNING: ...` in red. Bind names are `FKey` names (`SpaceBar`, `LeftControl`, `F1`, ...); an unknown
name is a load error, not a silent drop.

## Stance state machine

```
 DesiredStance  (set by RequestStance / ToggleStance; the player's intent, kept while blocked)
 CommittedStance (the stance whose full capsule we are at, or leaving)
 TransitionTarget + alpha over stance_transition_s (0.20 s), lerping capsule half-height AND eye height

   every tick (after Super::TickComponent):
     if Desired != heading:          heading = transitioning ? TransitionTarget : Committed
        if not on ground:            wait (request survives, applied on landing)
        elif growing and !Fits():    bStandBlocked = true, stay            <- REQ-G1-003 acc. 2, REQ-G1-006
        else:                        begin/retarget transition from current values
     if transitioning:               advance; shrink = resize then lower centre; grow = probe, raise centre, then resize
                                     grow blocked mid-way -> back off to tallest stance that fits, keep Desired
```

Feet stay put in every case (centre moves by the half-height delta, same order as the engine's
Crouch/UnCrouch). The clearance probe is an `OverlapBlockingTestByChannel` with a capsule whose bottom
is 1 cm above the feet and whose top is `2*target_half + stand_clearance_probe_margin_cm`, on the pawn's
own collision channel, ignoring the owner.

Capsule clamp to know about: `UCapsuleComponent` forces half-height >= radius. With radius 36 and
`crawl_height_cm` 64 the crawl body is a 72 cm sphere (logged as a warning). It still passes the 95 cm
duct and every feel-gym tunnel; if 64 must be exact, change the data (radius or crawl height), not code.

Jump: `CanJumpNow()` = Standing, not transitioning, and (on ground OR falling within `coyote_time_s`
of the last grounded time with the coyote not yet spent). `NotifyJumped()` spends it. The character
routes `CanJumpInternal_Implementation` to this so the engine's jump-count logic (which treats
"already falling" as a used jump) cannot defeat coyote time.

Speed: `GetMaxSpeed()` returns the stance cap (walk / crouch / crawl) or `sprint_speed_cms` while the
sprint key is held, the body is Standing and the input is within 60 degrees of forward. Diagonal speed
equals forward speed because the character normalises the 2D input and
`ScaleInputAcceleration` clamps it again.

## Input (all C++)

`Move` (Axis2D): X = right (+D / -A via `UInputModifierNegate`), Y = forward (+W / -S via `Negate` +
`UInputModifierSwizzleAxis` YXZ). `Look` (Axis2D) maps `EKeys::Mouse2D`; `invert_y` adds a Y-only Negate.
Everything else is a Boolean action on one key. `Pause` has `bTriggerWhenPaused` so it can resume.

## Verify first, in this order, once UE 5.8 + VS are installed

1. **Compile** `HellfallEditor` (Tools/build_editor.ps1). Both targets use `BuildSettingsVersion.V7`
   (== `Latest` in 5.8): V6/V7 turn undefined-identifier, return-type, dangling, unreachable-code and
   shadow-variable warnings into errors - if one appears, fix the code, do not downgrade. The only
   `TODO(VERIFY 5.8)` marker left under `Source/` is the look sign (step 2); spots discussed in comments
   without a marker: the JSON `TryGet*Field` overloads (FString vs FStringView — both accept what is
   passed); `FSlateApplication::OnApplicationActivationStateChanged` signature (`const bool`).
2. **Look sign** (first thing on first launch): push the mouse forward — the view must pitch **up**. If
   it pitches down, set `"invert_y": true` in `Data/movement.json` (data fix) or flip the single sign in
   `AHellfallCharacter::Input_Look` (code fix). Reason: this project disables legacy input scales.
3. **REQ-G1-003 acceptance 1**: every control on the HUD works (WASD, mouse, Space, LeftCtrl, C, LeftShift,
   E logs, Escape pauses/resumes, F1 toggles L_FeelGym <-> L_ExecutiveFloor).
4. **REQ-G1-003 acceptance 2**: crawl into the duct, press crouch/stand — HUD shows `STAND BLOCKED`, camera
   does not clip, walking out of the duct auto-completes the pending stand.
5. **REQ-G1-003 acceptance 3**: change `walk_speed_cms` in `Data/movement.json`, rebuild/re-run — HUD speed
   cap changes. Break the JSON on purpose — red `TUNING:` line appears and the body still works with defaults.
   Bind proof: change `"jump"` to `"F"` and relaunch — the HUD must print F **and** F must jump (the mapping
   is built from the subsystem in `SetupPlayerInputComponent`, so both change together); then set
   `"invert_y": true` — the pitch direction flips with no code change.
6. Coyote time: walk off a ledge and press Space within 0.1 s — you jump; press again in the air — nothing.
7. Focus: alt-tab away (cursor appears), alt-tab back and move the mouse — no view snap. Then pause
   (Escape), alt-tab away and back — the cursor stays visible and Escape still resumes (focus regain
   re-applies `EnterPausedInputMode` while paused, `EnterGameInputMode` otherwise, so the UI-only
   ignore-input state set on focus loss is always cleared).
8. Log check: `LogHellfall: Movement: tuning applied (...)` must appear **once** per pawn spawn (from
   `InitializeComponent`). A second copy at `BeginPlay` means `UHellfallTuning::Get` returned null at
   `InitializeComponent` time on 5.8 — behaviour is still correct, but record it.
