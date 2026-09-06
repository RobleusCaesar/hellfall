# Asset manifest - `SourceAssets/`

Every file Rob supplied, grouped by folder, with the Unreal name it will receive when (and if) it is imported. This is the complete list; the shorter working-set table in `BUILD.md` section 5 covers only the 17 meshes with their dimension proposals. Nothing in this document is a Gate 2 delivery - REQ-G2-001 (open each model in Blender, measure, rename, record) happens after Gate 1 approval. What is recorded here is what can be known from the files themselves without the engine or Blender.

## Provenance

- The models were generated with **Meshy.ai** under Rob's account from the concept images in `reference/`; audio, video, UI images and mood boards were supplied by Rob (source tools not recorded - Rob to confirm if any third-party licence applies).
- This tree is **already the de-duplicated working set** produced by Rob's earlier Godot attempt (`RobleusCaesar/hellfallGPT`): one candidate per slot was chosen there, ` - Copy` duplicates were dropped, `Meshy_AI_*` prefixes and the `deamon` misspelling were renamed, and the 17 GLBs were decimated to 3.8k-23.8k triangles with glTF-Transform 4.5.0. The raw 2.8 GB Meshy bundle is **not on this machine**, so the rejected alternatives (`shotgun2`, `ceo_dead2`, the third demon) cannot be re-inspected. If Rob wants them reconsidered at Gate 2 he must supply the raw bundle.
- Consequence for REQ-G2-001 acceptance 2: no file here contains ` - Copy`, `Meshy_AI_` or `deamon` (verified by listing on 2026-09-05).

## Rules

1. **G-1: nothing from Meshy enters the engine without passing through Blender.** No `.glb` in this tree is imported directly. At Gate 4 each mesh goes through `Tools/blender/` (import -> real-world scale in cm -> decimate to class budget -> pivot -> apply transforms -> `UCX_` collision -> FBX) and only the FBX is imported, by script.
2. **Scale is wrong in every GLB.** The Godot pipeline normalised each model so its longest axis is ~1.9 m regardless of which axis that is, and both rigged demons are 0.017 m tall (about 100x too small). Heights and lengths cannot be read off the bounds; true scale is set in Blender against a 180 cm reference at Gate 2/4.
3. **Textures beside a `.glb` are loose copies of the images embedded in it** (Meshy exports both). They are kept so Blender / Unreal can be pointed at editable files, but the embedded copy is the one that travels with the mesh. `crimson_hellfiend_texture_0_1.png` is byte-identical to `crimson_hellfiend_texture_0.png` (same size, same MD5) - a duplicate that survived; it will be dropped at Gate 2 (REQ-G2-001 "rejected - duplicate").
4. **Video:** `.ogv` (Theora/Vorbis) is not a format the Unreal Media Framework plays on Windows. Both clips are re-encoded to MP4/H.264 + AAC at Gate 6 (`ffmpeg -i intro.ogv -c:v libx264 -pix_fmt yuv420p -c:a aac intro.mp4`; ffmpeg is not yet installed). They are placeholders anyway (G-8).
5. **Audio:** WAV imports natively. MP3 import is expected to work in UE 5.8 but is not verified on this machine; if it fails the six MP3s are transcoded to WAV at Gate 3/6 and the originals stay here. `// TODO(VERIFY 5.8): MP3 import through the sound factory.`
6. **Reference images are never imported.** They exist for humans and for the floor-plan digitiser.
7. Naming on import follows Unreal convention: `SM_` static mesh, `SK_` skeletal mesh, `T_` texture (`_BC` base colour, `_MR` packed metallic/roughness, `_N` normal, `_E` emissive, `_D0` Meshy diffuse), `M_`/`MI_` materials (created at Gate 3), `SFX_`/`MUS_`/`VO_` sounds, `MS_` media sources.

## Triangle budgets (spec Gate 4 table) against the current counts

| Class | Budget | Files | Status |
|---|---:|---|---|
| Hero weapon viewmodel | 25,000 | shotgun 23,818 | within budget |
| Enemy character | 15,000 | ember_demon 10,418; crimson_hellfiend 10,428 | within budget |
| Human prop | 10,000 | man_sitting 9,506; intern_sitting 9,846; fallen_security_guard 9,485; ceo_dead 9,479 | within budget |
| Large furniture | 8,000 | reception_desk 7,798; kitchen_lunch_table 7,806; refrigerator_open 7,792; bathroom_vanity 7,794; ceo_couch_coffee_table 8,126 | couch set 1.6% over (spec tolerance 20%) |
| Small prop / door / fixture | 4,000 | closed_door 3,806; broken_door 4,012; closed_elevator 3,790; toilet_bowl 3,798; mop_and_bucket 3,791 | broken door 0.3% over (tolerance 20%) |

The Godot-era decimation already hit the class budgets, so the Gate 4 Blender pass is mainly scale, pivot, transforms and collision; before/after counts are still recorded in `BUILD.md` as the spec requires.

## Files (126 files, 109.9 MiB = 115.3 MB; sizes in KB)

### models/characters

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `models/characters/ceo_dead.glb` | 596 | **SM_CeoDead** | Dead CEO, CEO office (G2-003 / G4-003). 9,479 tris, raw bounds 1.167 x 0.538 x 1.897 m, static (no rig) |
| `models/characters/ceo_dead_base_color.jpg` | 109 | T_CeoDead_BC | Base colour for SM_CeoDead. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/ceo_dead_metallic_roughness.jpg` | 44 | T_CeoDead_MR | Metallic/roughness (glTF packed) for SM_CeoDead. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/ceo_dead_normal.jpg` | 14 | T_CeoDead_N | Normal map for SM_CeoDead. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/crimson_hellfiend.glb` | 5831 | **SK_CrimsonHellfiend** | Demon #2, CEO office, larger (G2-003 / G4-004 / G5-004). 10,428 tris, raw bounds 0.012 x 0.017 x 0.005 m, 1 skin / 24 joints, anims: Hit_Reaction_1, Idle_5, Idle_8, Right_Hand_Sword_Slash, Running, Shield_Push_Left, Simple_Kick, Walking, dying_backwards, walking_2_inplace |
| `models/characters/crimson_hellfiend_texture_0.png` | 2299 | T_CrimsonHellfiend_D0 | Diffuse (Meshy texture_0) for SK_CrimsonHellfiend. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/crimson_hellfiend_texture_0_1.png` | 2299 | (duplicate candidate of crimson_hellfiend_texture_0.png) | Diffuse (Meshy texture_0_1) for SK_CrimsonHellfiend. Loose copy; the same image is also embedded in the .glb. md5(12) 40e3269c095f vs 40e3269c095f for the _texture_0 file. |
| `models/characters/ember_demon.glb` | 1395 | **SK_EmberDemon** | Demon #1, corridor near Office #2 (G2-003 / G4-004 / G5-004). 10,418 tris, raw bounds 0.013 x 0.017 x 0.016 m, 1 skin / 24 joints, anims: Attack, Hit_Reaction, Idle_8, Shot_and_Fall_Backward, Walking |
| `models/characters/ember_demon_texture_0.jpg` | 145 | T_EmberDemon_D0 | Diffuse (Meshy texture_0) for SK_EmberDemon. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/fallen_security_guard.glb` | 603 | **SM_FallenSecurityGuard** | Dead security guard, corridor by Break Room exit (G2-003 / G4-003). 9,485 tris, raw bounds 0.918 x 0.971 x 1.902 m, static (no rig) |
| `models/characters/fallen_security_guard_base_color.jpg` | 98 | T_FallenSecurityGuard_BC | Base colour for SM_FallenSecurityGuard. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/fallen_security_guard_emissive.jpg` | 3 | T_FallenSecurityGuard_E | Emissive for SM_FallenSecurityGuard. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/fallen_security_guard_metallic_roughness.jpg` | 46 | T_FallenSecurityGuard_MR | Metallic/roughness (glTF packed) for SM_FallenSecurityGuard. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/fallen_security_guard_normal.jpg` | 20 | T_FallenSecurityGuard_N | Normal map for SM_FallenSecurityGuard. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/intern_sitting.glb` | 598 | **SM_InternSitting** | Seated intern against a wall, Supply Closet (G2-003 / G4-003). 9,846 tris, raw bounds 1.041 x 1.9 x 1.784 m, static (no rig) |
| `models/characters/intern_sitting_base_color.jpg` | 198 | T_InternSitting_BC | Base colour for SM_InternSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/intern_sitting_emissive.jpg` | 35 | T_InternSitting_E | Emissive for SM_InternSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/intern_sitting_metallic_roughness.jpg` | 100 | T_InternSitting_MR | Metallic/roughness (glTF packed) for SM_InternSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/intern_sitting_normal.jpg` | 70 | T_InternSitting_N | Normal map for SM_InternSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/man_sitting.glb` | 745 | **SM_ManSitting** | Seated man leaning on supply racks, Supply Closet (G2-003 / G4-003). 9,506 tris, raw bounds 1.284 x 1.128 x 1.905 m, static (no rig) |
| `models/characters/man_sitting_base_color.jpg` | 167 | T_ManSitting_BC | Base colour for SM_ManSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/man_sitting_emissive.jpg` | 8 | T_ManSitting_E | Emissive for SM_ManSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/man_sitting_metallic_roughness.jpg` | 58 | T_ManSitting_MR | Metallic/roughness (glTF packed) for SM_ManSitting. Loose copy; the same image is also embedded in the .glb. |
| `models/characters/man_sitting_normal.jpg` | 47 | T_ManSitting_N | Normal map for SM_ManSitting. Loose copy; the same image is also embedded in the .glb. |

### models/props

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `models/props/bathroom_vanity.glb` | 592 | **SM_BathroomVanity** | Women's restroom vanity (G2-002 / G4-002). 7,794 tris, raw bounds 1.903 x 0.854 x 0.418 m, static (no rig) |
| `models/props/bathroom_vanity_base_color.jpg` | 92 | T_BathroomVanity_BC | Base colour for SM_BathroomVanity. Loose copy; the same image is also embedded in the .glb. |
| `models/props/bathroom_vanity_emissive.jpg` | 3 | T_BathroomVanity_E | Emissive for SM_BathroomVanity. Loose copy; the same image is also embedded in the .glb. |
| `models/props/bathroom_vanity_metallic_roughness.jpg` | 72 | T_BathroomVanity_MR | Metallic/roughness (glTF packed) for SM_BathroomVanity. Loose copy; the same image is also embedded in the .glb. |
| `models/props/bathroom_vanity_normal.jpg` | 32 | T_BathroomVanity_N | Normal map for SM_BathroomVanity. Loose copy; the same image is also embedded in the .glb. |
| `models/props/broken_door.glb` | 313 | **SM_BrokenDoor** | Broken door on the ground (G2-002 / G4-002). 4,012 tris, raw bounds 1.902 x 0.107 x 0.986 m, static (no rig) |
| `models/props/broken_door_base_color.jpg` | 120 | T_BrokenDoor_BC | Base colour for SM_BrokenDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/broken_door_emissive.jpg` | 6 | T_BrokenDoor_E | Emissive for SM_BrokenDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/broken_door_metallic_roughness.jpg` | 55 | T_BrokenDoor_MR | Metallic/roughness (glTF packed) for SM_BrokenDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/broken_door_normal.jpg` | 44 | T_BrokenDoor_N | Normal map for SM_BrokenDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/ceo_couch_coffee_table.glb` | 411 | **SM_CeoCouchCoffeeTable** | Couch + coffee table set, CEO office (G2-002 / G4-002). 8,126 tris, raw bounds 1.901 x 0.543 x 1.721 m, static (no rig) |
| `models/props/ceo_couch_coffee_table_base_color.jpg` | 118 | T_CeoCouchCoffeeTable_BC | Base colour for SM_CeoCouchCoffeeTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/ceo_couch_coffee_table_emissive.jpg` | 6 | T_CeoCouchCoffeeTable_E | Emissive for SM_CeoCouchCoffeeTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/ceo_couch_coffee_table_metallic_roughness.jpg` | 70 | T_CeoCouchCoffeeTable_MR | Metallic/roughness (glTF packed) for SM_CeoCouchCoffeeTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/ceo_couch_coffee_table_normal.jpg` | 42 | T_CeoCouchCoffeeTable_N | Normal map for SM_CeoCouchCoffeeTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_door.glb` | 413 | **SM_ClosedDoor** | Closed / locked door leaf (G2-002 / G4-002). 3,806 tris, raw bounds 0.882 x 1.903 x 0.145 m, static (no rig) |
| `models/props/closed_door_base_color.jpg` | 91 | T_ClosedDoor_BC | Base colour for SM_ClosedDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_door_emissive.jpg` | 3 | T_ClosedDoor_E | Emissive for SM_ClosedDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_door_metallic_roughness.jpg` | 28 | T_ClosedDoor_MR | Metallic/roughness (glTF packed) for SM_ClosedDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_door_normal.jpg` | 19 | T_ClosedDoor_N | Normal map for SM_ClosedDoor. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_elevator.glb` | 392 | **SM_ClosedElevator** | Shut elevator doors, corridor dead end (G2-002 / G4-002). 3,790 tris, raw bounds 1.163 x 1.903 x 0.178 m, static (no rig) |
| `models/props/closed_elevator_base_color.jpg` | 101 | T_ClosedElevator_BC | Base colour for SM_ClosedElevator. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_elevator_metallic_roughness.jpg` | 44 | T_ClosedElevator_MR | Metallic/roughness (glTF packed) for SM_ClosedElevator. Loose copy; the same image is also embedded in the .glb. |
| `models/props/closed_elevator_normal.jpg` | 28 | T_ClosedElevator_N | Normal map for SM_ClosedElevator. Loose copy; the same image is also embedded in the .glb. |
| `models/props/kitchen_lunch_table.glb` | 614 | **SM_KitchenLunchTable** | Round lunch table + chairs, Break Room (G2-002 / G4-002). 7,806 tris, raw bounds 1.899 x 1.063 x 1.349 m, static (no rig) |
| `models/props/kitchen_lunch_table_base_color.jpg` | 125 | T_KitchenLunchTable_BC | Base colour for SM_KitchenLunchTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/kitchen_lunch_table_emissive.jpg` | 3 | T_KitchenLunchTable_E | Emissive for SM_KitchenLunchTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/kitchen_lunch_table_metallic_roughness.jpg` | 50 | T_KitchenLunchTable_MR | Metallic/roughness (glTF packed) for SM_KitchenLunchTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/kitchen_lunch_table_normal.jpg` | 32 | T_KitchenLunchTable_N | Normal map for SM_KitchenLunchTable. Loose copy; the same image is also embedded in the .glb. |
| `models/props/mop_and_bucket.glb` | 544 | **SM_MopAndBucket** | Mop and bucket, Supply Closet (G2-002 / G4-002). 3,791 tris, raw bounds 1.644 x 1.893 x 1.267 m, static (no rig) |
| `models/props/mop_and_bucket_base_color.jpg` | 168 | T_MopAndBucket_BC | Base colour for SM_MopAndBucket. Loose copy; the same image is also embedded in the .glb. |
| `models/props/mop_and_bucket_emissive.jpg` | 3 | T_MopAndBucket_E | Emissive for SM_MopAndBucket. Loose copy; the same image is also embedded in the .glb. |
| `models/props/mop_and_bucket_metallic_roughness.jpg` | 83 | T_MopAndBucket_MR | Metallic/roughness (glTF packed) for SM_MopAndBucket. Loose copy; the same image is also embedded in the .glb. |
| `models/props/mop_and_bucket_normal.jpg` | 46 | T_MopAndBucket_N | Normal map for SM_MopAndBucket. Loose copy; the same image is also embedded in the .glb. |
| `models/props/reception_desk.glb` | 665 | **SM_ReceptionDesk** | Reception desk; reused as CEO desk (G2-002 / G4-002). 7,798 tris, raw bounds 1.896 x 1.33 x 1.888 m, static (no rig) |
| `models/props/reception_desk_base_color.jpg` | 139 | T_ReceptionDesk_BC | Base colour for SM_ReceptionDesk. Loose copy; the same image is also embedded in the .glb. |
| `models/props/reception_desk_metallic_roughness.jpg` | 62 | T_ReceptionDesk_MR | Metallic/roughness (glTF packed) for SM_ReceptionDesk. Loose copy; the same image is also embedded in the .glb. |
| `models/props/reception_desk_normal.jpg` | 22 | T_ReceptionDesk_N | Normal map for SM_ReceptionDesk. Loose copy; the same image is also embedded in the .glb. |
| `models/props/refrigerator_open.glb` | 772 | **SM_RefrigeratorOpen** | Open fridge, Break Room, emissive interior (G2-002 / G4-002). 7,792 tris, raw bounds 0.919 x 1.902 x 1.303 m, static (no rig) |
| `models/props/refrigerator_open_base_color.jpg` | 139 | T_RefrigeratorOpen_BC | Base colour for SM_RefrigeratorOpen. Loose copy; the same image is also embedded in the .glb. |
| `models/props/refrigerator_open_emissive.jpg` | 5 | T_RefrigeratorOpen_E | Emissive for SM_RefrigeratorOpen. Loose copy; the same image is also embedded in the .glb. |
| `models/props/refrigerator_open_metallic_roughness.jpg` | 102 | T_RefrigeratorOpen_MR | Metallic/roughness (glTF packed) for SM_RefrigeratorOpen. Loose copy; the same image is also embedded in the .glb. |
| `models/props/refrigerator_open_normal.jpg` | 48 | T_RefrigeratorOpen_N | Normal map for SM_RefrigeratorOpen. Loose copy; the same image is also embedded in the .glb. |
| `models/props/toilet_bowl.glb` | 264 | **SM_ToiletBowl** | Toilet, Men's restroom stalls (G2-002 / G4-002). 3,798 tris, raw bounds 1.634 x 1.896 x 1.685 m, static (no rig) |
| `models/props/toilet_bowl_base_color.jpg` | 24 | T_ToiletBowl_BC | Base colour for SM_ToiletBowl. Loose copy; the same image is also embedded in the .glb. |
| `models/props/toilet_bowl_metallic_roughness.jpg` | 26 | T_ToiletBowl_MR | Metallic/roughness (glTF packed) for SM_ToiletBowl. Loose copy; the same image is also embedded in the .glb. |
| `models/props/toilet_bowl_normal.jpg` | 7 | T_ToiletBowl_N | Normal map for SM_ToiletBowl. Loose copy; the same image is also embedded in the .glb. |

### models/weapons

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `models/weapons/shotgun.glb` | 1103 | **SM_Shotgun** | Shotgun world model + viewmodel (G4-005 / G5-001..003). 23,818 tris, raw bounds 1.902 x 0.355 x 0.099 m, static (no rig) |
| `models/weapons/shotgun_base_color.jpg` | 99 | T_Shotgun_BC | Base colour for SM_Shotgun. Loose copy; the same image is also embedded in the .glb. |
| `models/weapons/shotgun_emissive.jpg` | 3 | T_Shotgun_E | Emissive for SM_Shotgun. Loose copy; the same image is also embedded in the .glb. |
| `models/weapons/shotgun_metallic_roughness.jpg` | 56 | T_Shotgun_MR | Metallic/roughness (glTF packed) for SM_Shotgun. Loose copy; the same image is also embedded in the .glb. |
| `models/weapons/shotgun_normal.jpg` | 31 | T_Shotgun_N | Normal map for SM_Shotgun. Loose copy; the same image is also embedded in the .glb. |

### audio

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `audio/music/under_broken_steel.mp3` | 727 | MUS_UnderBrokenSteel | Backing track, seamless loop (G3-004 / G6-002) - Sound Class Music |
| `audio/sfx/city_fire_truck.wav` | 1109 | SFX_CityFireTruck | Exterior ambience beyond the window wall (G3-004 / G6-002) - Ambient |
| `audio/sfx/city_riot.wav` | 12004 | SFX_CityRiot | Exterior ambience, burning city (G3-004 / G6-002) - Ambient; largest audio file |
| `audio/sfx/demon_attack.mp3` | 54 | SFX_DemonAttack | Demon melee attack (G5-004) - SFX, 3D |
| `audio/sfx/demon_attack_2.wav` | 2297 | SFX_DemonAttack2 | Demon melee attack variant; the spec calls it demon_attack2 (G5-004) - SFX, 3D |
| `audio/sfx/demon_growl.wav` | 1248 | SFX_DemonGrowl | Demon detection growl (G5-004) - SFX, 3D |
| `audio/sfx/demon_growl_distant.mp3` | 48 | SFX_DemonGrowlDistant | Distant vocalization, 20-60 s random interval (G3-004) - Ambient, 3D |
| `audio/sfx/monster_screech_distant.wav` | 1800 | SFX_MonsterScreechDistant | Distant vocalization, never overlapping the growl (G3-004) - Ambient, 3D |
| `audio/sfx/shotgun_blast.wav` | 472 | SFX_ShotgunBlast | Fire (G5-002) - SFX |
| `audio/sfx/shotgun_cocking.wav` | 563 | SFX_ShotgunCocking | Pump cycle, exactly once per shot (G5-002) - SFX |
| `audio/sfx/shotgun_reloading.wav` | 80 | SFX_ShotgunReloading | Reload; reload duration matches this clip (G5-002) - SFX |
| `audio/voices/demon_i_am_death.mp3` | 88 | VO_DemonIAmDeath | Optional voice line, used at most once (G5-004) - SFX, 3D |
| `audio/voices/demon_i_am_the_darkness.mp3` | 46 | VO_DemonIAmTheDarkness | Optional voice line, used at most once (G5-004) - SFX, 3D |
| `audio/voices/demon_i_will_kill_you.mp3` | 35 | VO_DemonIWillKillYou | Optional voice line, used at most once (G5-004) - SFX, 3D |

### textures

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `textures/decals/blood_pool.jpg` | 1544 | T_Decal_BloodPool | Blood pool decal under corpses (G3-003) - Decal Actor, never geometry |
| `textures/decals/blood_splatter_01.jpg` | 1041 | T_Decal_BloodSplatter01 | Wall spatter decal (G3-003) |
| `textures/decals/blood_splatter_02.jpg` | 2143 | T_Decal_BloodSplatter02 | Wall spatter decal (G3-003) |
| `textures/paintings/wall_painting_01.png` | 3113 | T_WallPainting01 | Office wall dressing (G3 / G4) |
| `textures/paintings/wall_painting_02.png` | 2937 | T_WallPainting02 | Office wall dressing (G3 / G4) |
| `textures/paintings/wall_painting_03.png` | 3166 | T_WallPainting03 | Office wall dressing (G3 / G4) |
| `textures/paintings/wall_painting_04.png` | 3377 | T_WallPainting04 | Office wall dressing (G3 / G4) |
| `textures/paintings/wall_painting_05.png` | 3057 | T_WallPainting05 | Office wall dressing (G3 / G4) |
| `textures/ui/hellfall_logo_reference.png` | 795 | T_UI_LogoReference | Title logo reference for the main menu (G6-001); may be redrawn |
| `textures/ui/main_menu_background.png` | 2322 | T_UI_MainMenuBackground | Main menu background image (G6-001) |

### video

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `video/intro.ogv` | 713 | MS_Intro (FileMediaSource) after re-encode to intro.mp4 | Intro cutscene (G6-003); .ogv is NOT playable by the UE Media Framework - re-encode to MP4/H.264 |
| `video/outro.ogv` | 734 | MS_Outro (FileMediaSource) after re-encode to outro.mp4 | Outro cutscene (G6-003); same re-encode rule |

### reference

| File | KB | Proposed Unreal name | Role / notes |
|---|---:|---|---|
| `reference/base_image_bathroom_vanity.png` | 1746 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_break_room_table.png` | 1050 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_broken_door_on_ground.png` | 1494 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_ceo.png` | 674 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_demon_v3.png` | 2071 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_elevator_door.png` | 1813 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_fridge.png` | 1680 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_hands.png` | 1256 | (none) | Hands reference for the viewmodel, cut at mid-forearm (G5-003). NOT imported. |
| `reference/base_image_locked_door.png` | 1836 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_mop_and_bucket.png` | 1158 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_office_couch_and_coffee_table.png` | 1794 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_image_security_guard.png` | 974 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_model_middle_manager.png` | 1629 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/base_model_young_intern.png` | 1484 | (none) | Meshy generation input / concept image. NOT imported. |
| `reference/game_layout.jpg` | 4009 | (none) | Rob's hand-drawn floor plan (portrait photo, 4284x5712). Source of Data/floorplan.json. NOT imported. |
| `reference/mood_after_1.png` | 2314 | (none) | Mood board "after" (Gate 3 target). The spec's After_4.png = mood_after_4.png. NOT imported. |
| `reference/mood_after_2.png` | 2411 | (none) | Mood board "after" (Gate 3 target). The spec's After_4.png = mood_after_4.png. NOT imported. |
| `reference/mood_after_3.png` | 2276 | (none) | Mood board "after" (Gate 3 target). The spec's After_4.png = mood_after_4.png. NOT imported. |
| `reference/mood_after_4.png` | 2343 | (none) | Mood board "after" (Gate 3 target). The spec's After_4.png = mood_after_4.png. NOT imported. |
| `reference/mood_before_1.png` | 1840 | (none) | Mood board "before" (intact office). The spec's Before_4.png = mood_before_4.png. NOT imported. |
| `reference/mood_before_2.png` | 1929 | (none) | Mood board "before" (intact office). The spec's Before_4.png = mood_before_4.png. NOT imported. |
| `reference/mood_before_3.png` | 1948 | (none) | Mood board "before" (intact office). The spec's Before_4.png = mood_before_4.png. NOT imported. |
| `reference/mood_before_4.png` | 2011 | (none) | Mood board "before" (intact office). The spec's Before_4.png = mood_before_4.png. NOT imported. |
| `reference/shotgun_reference.png` | 1449 | (none) | Weapon reference for the viewmodel (G5-003). NOT imported. |

Total: 126 files, 109.9 MiB (115,260,962 bytes = 115.3 MB). Sub-totals in MiB: reference 42.2, models 23.3, textures 22.9, audio 20.1, video 1.4.
