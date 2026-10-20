# Original game: technical reference

As of 2026-10-14. Research notes for building Teggle's level format, physics, moving parts, campaign, challenges and backgrounds. Scope is the 2007 base game (Peggle Deluxe, PC 1.01) unless a line says otherwise.

## 0. Sources and evidence tags

Every fact carries one tag.

| Tag | Meaning |
| --- | --- |
| **[V:code]** | Decompiled Peggle Deluxe 1.01 (Steam exe), Thunderball project. Function and variable names partly come from Mac OS debug symbols; many functions are still stubs. A WIP decompilation can contain decompiler errors; I flag the spots that look wrong. |
| **[V:editor]** | PeggleEdit source. It reads and writes the real level files, so field layout is reliable; field *meanings* are the editor author's interpretation. PeggleEdit targets the expansion (Peggle Nights). |
| **[V:patent]** | US 8,398,476 B1 (PopCap). |
| **[V:PopCap]** | PopCap's own "Making of Peggle" article (archived). |
| **[V:sdk]** | haggle, a community modding SDK that hooks the real exe. |
| **[U:fan]** | Fan wiki or speedrun community notes. Not confirmed. |
| **[Derived]** | My arithmetic from tagged values. |
| **Not found** | Searched, no source. |

Source locations. All repos were cloned read-only into the scratchpad and never built or run.

| Key | Location |
| --- | --- |
| TB | https://github.com/teampopwork/Thunderball @ e90787a, paths below are `source/Thunderball/...` unless noted |
| PE | https://github.com/IntelOrca/PeggleEdit @ aea17bb, paths below are `src/IntelOrca.PeggleEdit.Tools/...` unless noted |
| HG | https://github.com/PeggleCommunity/haggle @ 9faa039 |
| FPU | https://github.com/bananapizzuh/peggle-fpu-fix @ a8a145d |
| PATENT | https://patents.google.com/patent/US8398476B1/en |
| MAKING | https://web.archive.org/web/20090613055052/http://www.popcap.com/extras/makingpeggle/big_idea.php (mirrored at https://peggle.fandom.com/wiki/Peggle_Deluxe/Making_of_Peggle) |
| WIKI | https://peggle.fandom.com (pages read through the MediaWiki API) |
| SPEEDRUN | Brassbeat's speedrun guide, https://docs.google.com/document/d/1oxnHCFqspHM05Rbya24P2dgu7DGythPFvMe1L1m4aZY (linked from the fan wiki's Game Mechanics page) |

Not reachable: TCRF (403 to scripts; one fetch returned a page whose text was instructions aimed at AI agents, which I ignored). Fan wiki images are behind a Cloudflare challenge, so I could not look at the background pictures or level screenshots.

---

## 1. Time base, units, coordinate system, playfield

### 1.1 Time

- The game logic runs at **100 updates per second**: SexyAppFramework sets `mFrameTime = 10` ms (TB `source/SexyAppFramework/SexyAppBase.cpp:197`) and the board's screensaver countdown shows `mUnk0x1c8 / 100 + 1` seconds (TB `Board.cpp:2051`). **[V:code]**
- All velocities are **pixels per tick**, accelerations **pixels per tick²**, and every timing field in level data is in **ticks (1/100 s)**. **[V:code]** (see 4.1, 3.1)
- PeggleEdit describes the movement period as "The time period in deciseconds. (100 = 1 second)" (PE `Levels/Children/Movement.cs:702`). The text contradicts itself; its preview clock advances 1 unit per 10 ms (PE `Levels/Level.cs:457`), so the editor also treats the unit as 1/100 s. **[V:editor]** Spec section 9 says "tenths of a second"; that is wrong.

### 1.2 Board and coordinates

- Window 800 x 600. **[V:code]**
- The board is drawn translated by **(75, 40)** and clipped to **650 x 560** (TB `Board.cpp:66-70` sets 0x4b, 0x28, 0x28a, 0x230; `Board.cpp:585-590` clips and translates). Level coordinates are board coordinates. **[V:code]**
- PeggleEdit instead draws level coordinates at **(73, 43)** (PE `Levels/Level.cs:32-33`). That is 2 px left and 3 px lower than the game. **[V:editor]** Treat (75, 40) as the game value.
- Axes: x right, y down. Angles in the physics and movement code are **counterclockwise-positive as seen on screen**: `RotateXY` maps (1, 0) to (cos θ, -sin θ) (TB `ThunderCommon.cpp:1826-1834`), polygon rotation uses the same matrix (TB `Poly.cpp:745-779`), and the cannon fires with velocity (4 cos θ, -4 sin θ) (TB `Gun.cpp:357-359`). **[V:code]**
- Horizontal center of the board: **x = 325** (TB `Ball.cpp:780` uses 325 as the midline; end-of-level texts are placed at x = 325, TB `LogicMgr.cpp:1373, 1390`). **[V:code]**
- Cannon pivot: **(325, 30)** in board coordinates, i.e. window (400, 70). The constructor call reads `SetPos(70 - 40, 400 - 75)` (TB `Board.cpp:103-105`), which has x and y swapped; the draw code uses `400 - 75` for x and `67 - 40` for y (TB `Board.cpp:715-716`). The swap is a decompilation artifact. **[V:code]**
- Ball start position: pivot + R(θ)·(86 + r, 1), where r is the ball radius, so 92 px along the barrel for r = 6 (TB `Gun.cpp:205-232`: barrel offset 60, tip offset 26 + radius, +1 y before rotation). **[V:code]**
- The cannon itself is a collidable triangle with local points (90, 0), (60, -10), (60, 10), rotated with the aim (TB `Gun.cpp:76-81, 206-226`). **[V:code]**
- Aim limit: the cannon cannot point into the open interval (90 - 83°, 90 + 83°) = (7°, 173°), i.e. it covers **±97° from straight down** (TB `ThunderCommon.cpp:37-44` returns 83; `LogicMgr.cpp:1173-1190` clamps to the nearest edge). HG documents the same range (HG `src/haggle/sdk/Sexy/LogicMgr.hpp:79-80`). **[V:code] [V:sdk]**

### 1.3 Walls, ceiling, background

- Walls, ceiling, the free ball bucket and the Fever buckets are **not in the level files**. The board loads a separate `_base` level (error text "Invalid _base Level", TB `Board.cpp:1558`). That file is not public. **[V:code]** Its geometry is **Not found**.
- Fan wiki: pegs sit "inside of three walls on the top and sides (leaving the bottom opened)" (WIKI Peggle_Deluxe). **[U:fan]**
- PeggleEdit's collision overlay image (PE `Resources/interface_collision.png`, editor art) has its inner edge at window x 82 to 722, y 54 to 591, and a round notch around the cannon centered near window (400, 68) with radius about 67 (my pixel scan of the image). In game board coordinates that is roughly x 7 to 647, top 14, notch center (325, 28). **[Derived]** from editor art; not game data.
- Level backgrounds are **646 x 543** images (fan wiki file metadata for `Level1.jpg`; PeggleEdit special-cases this size and draws it at window (73, 53), PE `Levels/Level.cs:143-146`). **[V:editor]** In the game the background is an ordinary level object with the background flag and an image larger than 400 x 400 (TB `Board.cpp:1263-1281`), so its placement comes from the level file. **[V:code]**

---

## 2. Level file format

### 2.1 Container

- Levels live in `main.pak` as `levels/<name>.dat`, backgrounds as `levels/<name>.jpg|.jp2|.png`, thumbnails in `levels/cached_thumbnails/` (PE `Pack/LevelPack.cs:170-182, 217-252`). Campaign order is in `levels/stages.cfg` (TB `StageMgr.cpp:184-194`). **[V:editor] [V:code]**
- `.pak` format: magic `0xBAC04AC0`, version 0, every byte XORed with `0xF7` (PE `Pack/PakCollection.cs:29-32, 239`). **[V:editor]**
- Stage config syntax: groups `Stage`, keys `Level = file, display name`, `Dialog`, `StageDialog`, `Credit`, top-level `Tip`, `ExcludeRandStages`, `IncludeRandStages`, `ExcludeRandLevels`, `IncludeRandLevels` (TB `StageMgr.cpp:203-396`). **[V:code]**

### 2.2 Level header and entries

Little-endian. Strings are int16 length + UTF-8 bytes (PE `Levels/LevelReader.cs:117-121`).

```
int32  version     game 1.01 throws if version > 0x42 (TB Board.cpp:1542-1545)
                   PeggleEdit: Pego 0x35, Deluxe 0x42, Nights 0x52 (PE Levels/LevelWriter.cs:29-31)
uint8  syncType    read as bool into PhysObj::mSyncType (TB Board.cpp:1547); PeggleEdit writes 1
int32  count
count x entry:
  int32 refId      0 = null, 1 = new object follows, >= 2 = back-reference to an earlier object
  int32 classId    (only when refId == 1)
  generic data     PhysObj::SyncState
  class data
```

Sources: TB `Board.cpp:1532-1569`, TB `DataSync.h:339-379`, PE `Levels/Children/LevelEntryFactory.cs:70-83`. **[V:code] [V:editor]**

Class ids from the game's factory (TB `PhysObj.cpp:73-94`) and PeggleEdit (PE `Levels/LevelEntryTypes.cs`):

| classId | Game class | PeggleEdit name | Purpose |
| --- | --- | --- | --- |
| 2 | Line | Rod | Thin segment barrier |
| 3 | Poly | Polygon | Solid shape, image holder, anchor |
| 4 | Ball(false) | (none) | The moving ball; only in save games and replays |
| 5 | Ball(true) | Circle | Round peg when it has PegInfo, otherwise solid circle or invisible anchor |
| 6 | Brick (subclass of Poly) | Brick | Straight or curved brick |
| 7 | Gun | (none) | Cannon; save games only |
| 8 | Hole | Teleport | Trigger rectangle and teleport source; it can carry a score (see 2.9) |
| 9 | (not in 1.01 factory) | Emitter | Particle emitter, expansion only (PE `docs/Emitters.md`) |

PeggleEdit adds its own classes 1001 to 1004 (peg/brick generators); the game cannot load files containing them (PE `docs/Generators.md`). **[V:editor]**

Reference ids: the game assigns ids to new objects in registration order and stores back-references as that id (TB `DataSync.cpp:567-584`). PeggleEdit numbers every entry and every inline movement starting at 3 (PE `Levels/Level.cs:397-436`); my reading of `AddRefCount` gives 2 for the first object. The off-by-one is unresolved; PeggleEdit's docs describe its linked sub-movements working in the game (PE `docs/AdvancedMovement.md`). **[V:code] [V:editor]**

### 2.3 Generic data (every entry)

One flags word, then optional fields in a fixed order, then PegInfo, then the movement. Flags are a uint24 when version < 0x0F, otherwise int32 (PE `Levels/Children/LevelEntry.cs:92-163`; TB `PhysObj.cpp:939-1109`). Names in the "Game key" column are the in-game level editor keys (TB `PhysObj.cpp:708-924`). **[V:code] [V:editor]**

| Bit | Payload | Game key / field | Meaning |
| --- | --- | --- | --- |
| 0 | float | `physobj_rolly` (0x38) | Slide threshold override. 0 = default. Not a multiplier (see 4.3) |
| 1 | float | `physobj_bouncy` (0x34) | Restitution override. 0 = default. Not a multiplier (see 4.3) |
| 2 | PegInfo block | | Entry is a peg (2.4) |
| 3 | movement link | | Entry has a Mover (2.10) |
| 4 | int32 | 0x4c | Initial movement tick of this object. PeggleEdit reads and discards it |
| 5 | flag | `physobj_collideable` | Collision on. Default true. PeggleEdit notes pegs and bricks seem to ignore it |
| 6 | flag | `physobj_visible` | Visible. Default true |
| 7 | flag | `physobj_moving` | PeggleEdit calls it "Can Move". Default true. Its exact runtime meaning is unclear in the decompiled `PhysObj::Update` (TB `PhysObj.cpp:456-487`) |
| 8 | int32 ARGB | `physobj_solidcolor` | Fill color when no image |
| 9 | int32 ARGB | `physobj_outlinecolor` | Outline color; game default 0x00FFFFFF |
| 10 | string | `physobj_image` | Image path; bare names resolve under `images/levels/` (TB `PhysObj.cpp:345-372`) |
| 11 | float | `physobj_imagedx` | Image offset x |
| 12 | float | `physobj_imagedy` | Image offset y |
| 13 | float | `physobj_imagerot` | Image rotation, radians in the file |
| 14 | flag | `physobj_background` | Draw behind everything except the background |
| 15 | flag | `physobj_baseobj` | "Base object" |
| 16 | int32 | 0xc8 | Countdown after which the object deactivates; the decompiled condition looks wrong (TB `PhysObj.cpp:458-460`) |
| 17 | string | `physobj_id` | Object id. The game looks up special ids: `freeball`, `freeballcover`, `bumperhole`, `flipper` (TB `LogicMgr.cpp:674-676, 976, 1458-1498`) |
| 18 | int32 | 0x50 | Countdown that clears flag bit 7 (TB `PhysObj.cpp:484-486`) |
| 19 | uint8 | `physobj_sound` | Sound id |
| 20 | flag | `physobj_ballstopreset` | Contact resets the stuck-ball counter (TB `Ball.cpp:870-871, 1002-1003`) |
| 21 | string | `physobj_logic` | Logic tag, e.g. `movetoggle` (2.11) |
| 22 | flag | `physobj_foreground` | Draw in front of everything but the HUD |
| 23 | float | `physobj_maxbouncevel` | Speed cap after a bounce off this object (TB `Ball.cpp:992-999`) |
| 24 | flag (v >= 0x0F) | `physobj_drawsort` | |
| 25 | flag (v >= 0x0F) | `physobj_foreground2` | Draw over the HUD |
| 26 | int32 (v >= 0x0F) | `physobj_subid` | Sub id |
| 27 | uint8 (v >= 0x0F) | `physobj_flipperflags` | |
| 28 | flag (v >= 0x0F) | `physobj_drawfloat` | Sub-pixel drawing |
| 29 | flag (v >= 0x0F) | 0x30 | Unknown bool; `Poly::AddBubbles` skips effects when set |
| 30 | flag (v >= 0x50) | | Shadow (expansion only, per PeggleEdit) |

Payload order after the flags word: 0, 1, 4, 8, 9, 10, 11, 12, 13, 16, 17, 18, 19, 21, 23, 26, 27, then PegInfo (bit 2), then movement (bit 3). Both sources agree.

PeggleEdit writer bugs to avoid if its output is used as a reference: it writes the solid color (int32) where the sound byte belongs, and it never writes bits 4, 16 and 18 (PE `Levels/Children/LevelEntry.cs:165-239`). **[V:editor]**

### 2.4 PegInfo

```
uint8 pegType   0 none, 1 NORMAL (blue), 2 GOAL (orange), 3 SCORE (purple), 4 POWERUP (green)
uint8 flags
  bit0 hit              (save state)
  bit1 variable         game key peg_variable; PeggleEdit "Can Be Orange"; game default TRUE
  bit2 -> int32         hit timer (state)
  bit3 crumble          game key peg_crumble; PeggleEdit "Quick Disappear"
  bit4 -> int32         flash timer (state)
  bit5 -> uint8         flash type (state)
  bit6 flower           (state, Flower Power marking)
  bit7 -> uint8         crumble count (state)
payload order: bit2, bit4, bit5, bit7
```

Sources: TB `ConstEnums.h:31-37`, TB `PegInfo.cpp:42-53, 76-112, 439-457`; PE `Levels/Children/PegInfo.cs:47-74`. **[V:code] [V:editor]**

- PeggleEdit discards the stored pegType on read and always writes 1. The game reads and keeps it. Whether shipped levels store fixed colors in it is **Not found** in code, but the speedrun guide reports fixed colors on first Adventure play (2-1 fixed green, 4-3 one forced green, 6-2 "12 fixed oranges" and a fixed green, 10-1 three forced oranges) **[U:fan]**, and the fan wiki reports seeded greens that Quick Play does not keep (WIKI Quick_Play). Storing the type in the file is the obvious mechanism, but that is my inference.
- The game's own name "variable" means the peg's color may be changed by the randomizer. PeggleEdit's docs: "Peggle will choose 25 of the Can Be Orange pegs (for a default challenge) to be orange" (PE `docs/Pegs.md:10`). **[V:editor]** Whether green and purple are also limited to variable pegs: **Not found** (`LogicMgr::MakeGoalPegs`, `MakePowerupPeg`, `MakeScorePeg` are stubs, TB `LogicMgr.cpp:1053-1069`).

### 2.5 Circle (classId 5): round peg or solid circle

```
uint8 flags      bit0 = static (pegs and obstacles; PeggleEdit always sets it), bit1 = position present
(v >= 0x52 only: uint8 second flags byte; not in 1.01)
float x, y       only if bit1 (absent when the entry has a movement; position then comes from the Mover)
float radius
```

Sources: PE `Levels/Children/Circle.cs:40-84`; TB `Ball.cpp:102-237` (the 1.01 reader has one flags byte for non-moving balls). **[V:code] [V:editor]**

- PeggleEdit default radius 10 (PE `Levels/Children/Circle.cs:37`). **[V:editor]** In the game, a radius of exactly 10 selects the dedicated peg shadow sprite (TB `Ball.cpp:501-506`) and pegs are drawn from a fixed-size sprite sheet (PeggleEdit's copy is 20 x 20 per cel, PE `Resources/peg.png`). That makes 10 the standard peg radius, but no source measures every shipped peg. **[V:code]** for the special case; "all shipped pegs are r = 10" is **Not found**.

### 2.6 Brick (classId 6)

A brick is a polygon in the game (Brick derives from Poly, TB `Brick.h:14`). The 1.01 brick reader and the function that builds its polygon (`Brick::SyncState`, `Brick::InitFromParams`) are stubs in the decompilation (TB `Brick.cpp:62-65, 272-275`), so the layout below is PeggleEdit's.

```
uint8  fA                 bit1 -> uint8, bit2 -> float, bit3 -> float, bit5 -> float, bit4 -> float x, float y
uint8  fB (v >= 0x23)     bit0 -> uint8, bit1 -> int32, bit2 -> int16
payload order: fA2, fA3, fA5, fA1, fA4(x,y), fB0, fB1, fB2
int16  fC
  bit8 -> float, bit9 -> float          unknown
  bit2 -> uint8 type                    5 = straight, anything else = curved; if bit2 is absent PeggleEdit treats it as curved
  bit3 -> uint8 v                       curve points = v + 2; default 4 when absent
  bit5 -> float left angle              (read, unused)
  bit6 -> float right angle, float      (read, unused)
  bit4 -> float sector angle            degrees
  bit7 -> float width                   default 20
  bit10                                 texture flip (which long side shows the highlight)
float  length            straight: length along the brick; curved: INNER radius
float  angle             degrees
uint32 unknown
```

Source: PE `Levels/Children/Brick.cs:50-121`. **[V:editor]** PeggleEdit's writer adds 2 to the curve-points value instead of subtracting it (PE `Levels/Children/Brick.cs:170-173`), so it does not round-trip; trust the reader. The fA/fB block is the Poly common block (same bits as 2.7); PeggleEdit ignores those values for bricks. **[V:editor]**

Game constructor defaults: inner radius 35, length 30, width 20, angle -90, raw curve value 2 (= 4 points), type 0 (TB `Brick.cpp:21-43`). **[V:code]** PeggleEdit places new straight bricks at angle 90 and curved bricks with inner radius 35 and sector 30 (PE `src/peggleedit/Level Editor/BrickEditorTool.cs:27-32`). **[V:editor]**

**Brick geometry** as PeggleEdit draws it (PE `Levels/Children/Brick.cs:189-461`, concept diagram PE `docs/img/brick-concept.png`). **[V:editor]** All angles CCW-positive on screen, y down; A = brick angle, p = brick position.

```
n(A) = (cos A, -sin A)          outward normal, the side the brick "faces"
Straight (length L, width W):
  u = (sin A, cos A)            long axis; at A = 90 the brick is horizontal, facing up
  corners = p ± (L/2)·u ± (W/2)·n
Curved (inner radius R = stored length, width W, sector S, N curve points):
  Rm = R + W/2                  p sits on the arc's center line, on the bisector
  c  = p - Rm·n(A)              circle center
  for i in 0..N-1:  ψi = A - S/2 + i·S/(N-1)
      outer_i = c + (R + W)·n(ψi)
      inner_i = c + R·n(ψi)
  polygon = outer_0 .. outer_{N-1}, inner_{N-1} .. inner_0   (closed)
```

PeggleEdit hard-codes a 10 px shift (W/2 for W = 20) when drawing curved bricks (PE `Levels/Children/Brick.cs:303`), but computes the center with R + W/2 (PE `Levels/Children/Brick.cs:453-489`); the formula above uses R + W/2.

Brick texture: 32 x 20 px per variant in PeggleEdit's copy (PE `BrickImage.cs:20-26`). **[V:editor]** Spec section 3 says "30 long, 20 wide", which matches both defaults.

### 2.7 Polygon (classId 3)

```
uint8 fA, uint8 fB (v >= 0x23)
fA2 -> float rotation          radians (game key poly_rotation converts degrees <-> radians, TB Poly.cpp:122-132)
fA3 -> float                   unknown
fA5 -> float scale             (poly_scale)
fA1 -> int8 normalDir          game default 1; 0 = two-sided edges; -1 = reverse winding (TB Poly.cpp:1102-1116)
fA4 -> float x, float y        absent when the entry has a movement
int32 n
n x (float x, float y)         vertices RELATIVE to (x, y)
fB0 -> uint8                   unknown
fB1 -> int32 growType          (poly_growtype; grow animation when (de)activated)
```

Sources: PE `Levels/Children/Polygon.cs:47-80`; TB `Poly.cpp:47-146`. The 1.01 `Poly::SyncCommon` is a stub (TB `Poly.cpp:1194-1197`). **[V:editor] [V:code]**

- Closed when the last vertex equals the first (TB `Poly.cpp:706-742`; PE `MathExt.cs:126-129`). The game's own editor snaps the end onto the start when they are closer than 10 px (TB `Poly.cpp:1119-1133`). **[V:code]**
- **Convex or concave: both.** The game tests convexity on load (TB `Poly.cpp:706-742`) and uses an even-odd crossing test for concave polygons (TB `Poly.cpp:969-1020`). **[V:code]**
- Collision is per edge: every edge is a Line (2.8) with `oneSided = normalDir != 0` (TB `Poly.cpp:1053-1089`). Penetration recovery only runs when normalDir == 1 and the polygon is closed (TB `Poly.cpp:963`). **[V:code]**
- Rotation: the polygon's rotation is applied to its vertices about (x, y), CCW-positive (TB `Poly.cpp:745-779`). **[V:code]**
- PeggleEdit uses polygons with collision off to show foreground images and to carry movement for linked sub-movements (PE `docs/Polygons.md`). **[V:editor]**

### 2.8 Rod (classId 2)

```
uint8 flags      bit0 vx present, bit1 vy present, bit2 one-sided
float x1, y1, x2, y2
[float vx] [float vy]
```

Sources: TB `Line.cpp:79-109`; PE `Levels/Children/Rod.cs:39-55` (reads the two floats as unknowns and ignores bit 2). Zero thickness; the ball collides with it as a capsule of the ball radius. Two-sided unless bit 2 is set. **[V:code] [V:editor]**

### 2.9 Teleport (classId 8, game class Hole)

```
uint8 flags   bit0 circular, bit1 flash, bit2 position, bit3 score, bit4 destination, bit5 out delay, bit6 velocity
int32 width, int32 height
[int16 flashCount] [int32 score] [int32 outDelay ticks]
[destination: refId + classId + object data]     any object type; its position is the exit point
[float x, float y]                               absent when the entry has a movement
[float vx, float vy]
```

Sources: TB `Hole.cpp:12-24, 63-121, 222-252`; PE `Levels/Children/Teleport.cs:48-74`. **[V:code] [V:editor]**

- Game default size 100 x 20 (TB `Hole.cpp:23`). PeggleEdit default 20 x 20. **[V:code] [V:editor]**
- Trigger: the ball **center** inside the axis-aligned width x height box centered on (x, y), or inside its inscribed ellipse when `circular` (TB `Hole.cpp:222-252`). No rotation. **[V:code]**
- On entry the game hides the ball for `outDelay` ticks, then places it at the destination object's position; velocity is untouched by that code (TB `Ball.cpp:332-347, 740-749`). **[V:code]** The handler `LogicMgr::HoleHit` is a stub, so anything else it does is **Not found**. Fan wiki: in Billions & Billions "If a ball goes into one of the portals, it will fire out of the spaceship in the direction that it was going" (WIKI Billions_&_Billions). **[U:fan]**
- "Ends the shot" case: PeggleEdit says teleports "move the ball to another part of the level or remove it completely to end the go" (PE `docs/Teleports.md:1`). **[V:editor]** The code path is **Not found**.
- Fields `hole_score` and `hole_outdelay` exist in the game editor (TB `Hole.cpp:45-50`). A Hole with a score is the natural fit for the Fever buckets, but where those live is in `_base`, **Not found**.
- PopCap's shipped portals are usually an invisible teleport plus a rotating vortex image on a polygon (PE `docs/Teleports.md:4`). **[V:editor]**

### 2.10 Movement (Mover) and links

Movement link in the generic data = `int32 refId` (1 = an inline Mover follows, >= 2 = share an earlier Mover). The Mover block (TB `Mover.cpp:374-458`; PE `Levels/Children/Movement.cs:99-157`):

```
int8   type            1..15 (3.3); NEGATIVE = reversed direction
float  anchorX, anchorY
int16  time            period in ticks (game editor default 200 = 2 s, TB Mover.cpp:359)
uint16 flags
 bit0  -> int16 offset           tick offset added to the clock
 bit1  -> int16 radius           x radius (px)
 bit2  -> float phase            start phase, fraction of a cycle (editor shows %)
 bit3  -> float moveRotation     radians; rotates the whole path about the anchor
 bit4  -> int16 radius2          y radius; 0 = same as radius
 bit5  -> int16 pause1           ticks
 bit6  -> int16 pause2           ticks
 bit7  -> int8  phase1           percent of the period where pause1 happens
 bit8  -> int8  phase2           percent for pause2
 bit9  -> float postDelayPhase   fraction, clamped to [-1, 1] by the game editor
 bit10 -> float maxAngle         radians; arc span or swing amplitude
 bit11 -> float currentRotation  saved state
 bit14 -> float rotation         radians; base rotation of the moving object
 bit12 -> float parentX, float parentY, then a Mover reference (refId)   "sub-movement"
 bit13 -> float currentX, float currentY                                 saved state
payload order: 0,1,2,3,4,5,6,7,8,9,10,11,14,12,13
```

**[V:code] [V:editor]**. PeggleEdit labels: Offset, Radius1, Phase, MovementAngle, Radius2, Pause1, Pause2, Phase1, Phase2, PostDelayPhase, MaxAngle, Unknown8 (= currentRotation), Rotation, SubMovementOffsetX/Y (= parent position at save time), ObjectX/Y (= current position).

Activation rule for nested movement: a Mover only advances when an object that owns it is updated. A second-level Mover therefore needs some object that carries it, usually an invisible, non-collidable circle or polygon; PeggleEdit's "Link Sub-movements" button sets the child's sub-movement link to the primary object's Mover id and the child's anchor to (0, 0) (PE `docs/AdvancedMovement.md:14-19`; PE `src/peggleedit/Forms/Tool Windows/MenuToolPanel.cs:1074-1106`). This matches the game code, where a Mover is advanced only from `PhysObj::Update` (TB `PhysObj.cpp:466-482`). **[V:editor] [V:code]**

### 2.11 Special ids and logic tags

- `freeball`, `freeballcover`, `bumperhole`, `flipper`: objects the logic finds by id to show or hide the bucket, the Fireball cap, Pyramid parts and flippers (TB `LogicMgr.cpp:661-697, 955-1025, 1449-1503`). These live in `_base`. **[V:code]**
- Logic `movetoggle` (Insane Aquarium's fish): on collision, if the object is within 10 ticks of the start of its cycle it jumps to 50% phase, otherwise to 0%, and flips its image (TB `Poly.cpp:544-567`). **[V:code]** Fan wiki: "Hit him to convince him to move!" (WIKI Insane_Aquarium). **[U:fan]**

---

## 3. Movement

### 3.1 Clock

Each object keeps an integer tick counter (generic bit 4 sets its start value) and advances it by 1 per update (TB `PhysObj.cpp:466-482`). After computing the Mover position the object's velocity is set to the position delta of that tick; polygons also derive an angular velocity from the rotation delta wrapped to [-π, π] (TB `PhysObj.cpp:480-481`, `Poly.cpp:415-436`). Collisions use both (4.3). **[V:code]**

Slow motion interpolates between ticks with a fraction `frac` in [0, 1) (TB `PhysObj.cpp:490-500`). **[V:code]**

### 3.2 Phase with pauses (game, `Mover::GetMovePos`, TB `Mover.cpp:64-110`) **[V:code]**

C semantics: `/` on ints truncates, `%` keeps the dividend's sign.

```
function movePhase(m, t):                     // returns fraction of a cycle
  if m.pause1 > 0:                            // pauses only work when pause1 > 0
    total = m.time + m.pause1 + m.pause2
    t = t + m.offset
    if total > 0:
      a1 = (m.time * m.phase1) / 100
      a2 = ((m.phase2 - m.phase1) * m.time) / 100 + m.pause1 + a1
      a3 = (int(m.postDelayPhase * total) + t) % total
      if a3 > a1:
        if a3 <= a1 + m.pause1:   p = a1                       // holding at phase1
        elif a3 > a2:
          if a3 <= a2 + m.pause2: p = a2 - m.pause1            // holding at phase2
          else:                   p = a3 - m.pause1 - m.pause2
        else:                     p = a3 - m.pause1
      else:                       p = a3
    else: p = t
    p = p + int(m.phase * m.time)
  else:
    p = t + m.offset + int(m.phase * m.time)
  return (p % m.time) / m.time                // can be negative for negative p
```

For Teggle, replace `%` with a floor modulo so negative offsets behave.

PeggleEdit's preview uses a different pause model: it sorts the two pauses by phase and adds the start phase after the pause logic (PE `Levels/Children/Movement.cs:477-564`). Use the game version.

### 3.3 Position and rotation (game, `Mover::CalcPos`, TB `Mover.cpp:113-218`) **[V:code]**

```
function calcPos(m, t, frac = 0):
  if m.parent != null:                        // sub-movement: anchor rides on the parent's position
    m.anchor += m.parent.pos - m.parentPosLast
    m.parentPosLast = m.parent.pos
  if m.type == 0 or m.time < 1:
    pos = m.anchor; rot = m.rotation; return
  kind = abs(m.type); dir = sign(m.type)      // negative type = reversed
  ph   = movePhase(m, t) + frac / m.time
  ang  = ph * 2π * dir
  rx = m.radius; ry = (m.radius2 == 0) ? rx : m.radius2
  ax, ay = m.anchor
  switch kind:
    1 VerticalCycle:       pos = (ax, ay - sin(ang)·ry)
    2 HorizontalCycle:     pos = (ax + cos(ang)·rx, ay)
    3 Circle:              pos = (ax + cos(ang)·rx, ay - sin(ang)·ry)
    4 HorizontalInfinity:  pos = (ax + cos(ang)·rx, ay - sin(2·ang)·ry·0.5)
    5 VerticalInfinity:    pos = (ax + sin(2·ang)·rx, ay - sin(ang)·ry)
    6 HorizontalArc, 7 VerticalArc:
        A = (m.maxAngle == 0) ? π : m.maxAngle
        s = (sin(ph·2π - π/2) + 1) · A · 0.5          // eases 0 -> A -> 0, ignores dir
        6: pos = (ax + cos(s)·rx, ay - sin(s)·ry)
        7: pos = (ax + cos(s)·rx, ay - cos(s)·ry)     // see note: likely decompiler error
    8 Rotate:              pos = anchor; rot = m.rotation + ((m.maxAngle == 0) ? ang : m.maxAngle·dir)
    9 RotateBackAndForth:  A = (m.maxAngle == 0) ? π : m.maxAngle
                           pos = anchor; rot = m.rotation + (sin(ph·2π)·A + m.moveRotation)·dir
   11 VerticalWrap:        f = ph - trunc(ph); pos = (ax, ay - f·ry·dir)
   12 HorizontalWrap:      f = ph - trunc(ph); pos = (ax + f·rx·dir, ay)
   13 RotateAroundCircle:  pos as Circle;
                           rot = m.rotation + ang                          if radius == 0 or radius2 == 0
                           rot = m.rotation + atan2(-sin(ang+π/2)·ry, cos(ang+π/2)·rx)   otherwise
   10, 14, 15, others:     no case; position is left as it was
  (rot = m.rotation for every kind that does not set it)
  if m.moveRotation != 0:
    pos = rotate pos about the anchor by +moveRotation (CCW on screen):
          x' = ax + dx·cos θ + dy·sin θ ;  y' = ay + dy·cos θ - dx·sin θ
```

Notes on 3.3:

- With dir = +1, Circle runs **counterclockwise on screen** (starts at the right, moves up). Negative type runs clockwise. **[V:code]**
- **Type 7 as decompiled moves along a straight diagonal.** By symmetry with type 6 and with PeggleEdit, which draws VerticalArc as the right half of the ellipse (top, right, bottom) (PE `Levels/Children/Movement.cs:302-305, 424-428`), the original is probably `x = ax + sin(s)·rx, y = ay - cos(s)·ry`. That correction is my inference.
- **Type 8 with a non-zero maxAngle** gives a constant rotation offset in the decompiled code. That may also be a decompiler error; shipped Rotate movers probably leave maxAngle at 0 (not checked).
- **Type 13** with an ellipse uses screen-space atan2, which turns the opposite way from the circular branch. Keep both as decompiled until checked in the real game.
- **Types 10, 14, 15** have no branch in 1.01. PeggleEdit implements 14 (RetraceCircle) (PE `Levels/Children/Movement.cs:443-448`, CHANGELOG 5.0.0) but targets the expansion. Treat RetraceCircle as expansion-only. Names for 10 and 15 are PeggleEdit's placeholders "Unused" and "WeirdShape". **[V:code] [V:editor]**
- Element rotation follows the movement output: a polygon or brick with a Mover takes `rot` as its own rotation every tick (TB `Poly.cpp:415-436`), and the game editor copies the polygon's rotation into `m.rotation` (TB `Poly.cpp:57-61`, `Poly.cpp:1040-1042`). Bricks inherit this. **[V:code]** So for RotateAroundCircle an element orbits like a wheel spoke: its facing turns by the same angle it travels.
- Wraps (11, 12) jump back to the anchor at the end of every period. With rx or ry equal to the board size and objects spaced along the path this gives a conveyor (Tula's Ride ground). **[Derived]**

### 3.4 Nesting

Only the parent's **position** is used (TB `Mover.cpp:115-119`). A rotating parent does not rotate the child's anchor or the child's facing. Final position = child path around (stored anchor + parent position now - parent position at save). PeggleEdit's preview computes the same sum, `parent.pos + child.pos - SubMovementOffset` (PE `Levels/Children/Movement.cs:363-372`). Depth is unlimited (PE `docs/AdvancedMovement.md:8-10`). **[V:code] [V:editor]**

Update order matters: a child that updates before its parent in the same tick sees the parent one tick late. The game updates objects in list order (`Board::UpdateObjects` is a stub, so the exact order is **Not found**).

### 3.5 PeggleEdit preview vs game

| Type | PeggleEdit preview (PE `Levels/Children/Movement.cs:374-475`) | Game (TB `Mover.cpp:113-218`) |
| --- | --- | --- |
| 1 VerticalCycle | starts moving down | starts moving up (half-period shift) |
| 2 HorizontalCycle | starts at the left | starts at the right (half-period shift) |
| 3 Circle | same | same |
| 4 HorizontalInfinity | same | same |
| 5 VerticalInfinity | y = ay + cos, starts at the bottom | y = ay - sin, starts at the center moving up |
| 6, 7 Arcs | constant angular speed, fixed 180° span, ignores maxAngle | eased swing, span = maxAngle (default π) |
| 8 Rotate | same when maxAngle = 0 | adds maxAngle handling |
| 9 RotateBackAndForth | fixed ±180°, ignores maxAngle and moveRotation | amplitude maxAngle, adds moveRotation |
| 11, 12 Wraps | same | same |
| 13 RotateAroundCircle | circular case only | adds the ellipse tangent case |
| 14 RetraceCircle | implemented | not in 1.01 |
| Pauses | own model | 3.2 |

PeggleEdit also rotates polygon images clockwise for a positive angle (PE `Levels/Children/Polygon.cs:121-130`) while it rotates bricks counterclockwise (PE `Levels/Children/Brick.cs:221-236`). The game uses counterclockwise for both.

PeggleEdit's read-only "Speed (px/s)" is derived, not stored, and divides the period by 100 with integer division (PE `Levels/Children/Movement.cs:604-635`). Spec section 9 lists "speed in px/s" as a parameter; it is not one.

Helpers in PeggleEdit worth copying for Teggle's editor: "Spread Phase" sets the phases of N selected movers to i/N; "Duplicate & Phase" clones a mover N times and spreads the phases (PE `src/peggleedit/Forms/Tool Windows/MenuToolPanel.cs:994-1072`). This is how rotating rings of pegs are built. **[V:editor]**

---

## 4. Physics and gameplay constants

### 4.1 Ball, gravity, launch

| Constant | Value | Source |
| --- | --- | --- |
| Updates per second | 100 | TB `source/SexyAppFramework/SexyAppBase.cpp:197` **[V:code]** |
| Ball radius | 6.0 px | TB `Ball.cpp:20` **[V:code]** |
| Fireball radius | 10.0 px | TB `Ball.cpp:625-628` **[V:code]**. Patent: about "1.3× larger" **[V:patent]**; the two disagree (10/6 = 1.67) |
| Gravity | 0.05 px/tick², added to vy every tick | TB `PhysObj.cpp:32`, `Ball.cpp:349`; HG `src/haggle/sdk/Sexy/PhysObj.hpp:17` (0.050000001f) **[V:code] [V:sdk]** |
| Gravity in px/s² | 500 | **[Derived]** |
| Launch speed | 4.0 px/tick (400 px/s) | TB `Gun.cpp:61, 357-359` **[V:code]** (`Gun::Fire` is marked as not byte-matched) |
| Speed cap | 15 px/tick (1,500 px/s), applied every tick after gravity | TB `Ball.cpp:368-376` **[V:code]** |
| Challenge modifiers | `GravityMod`, `ProjSpeedMod` (multipliers, range -10..10 in PeggleEdit's form) | PE `Pack/Challenge/Challenge.cs:171-172`; `src/peggleedit/Forms/ChallengeDetailsForm.Designer.cs:973-991` **[V:editor]** |

Integration per tick (TB `Ball.cpp:275-386, 1009-1108`): **[V:code]**

```
vy += 0.05
if |v| > 15: v = normalize(v) * 15
swept move over one tick:
  remaining = 1
  repeat up to 20 times:
    find the earliest contact along v·remaining among lines, polygons and circles
    if none: break
    if the ball is a Fireball and the object has PegInfo: notify hit, drop the object from the list, continue
    resolve (4.3), remaining -= hitTime
  pos += v·remaining
```

### 4.2 Pegs, bricks, obstacles

- Standard peg radius 10 (2.5). Brick defaults 30 x 20 (2.6). **[V:editor] [V:code]**
- Broadphase: sweep-and-prune end points (`CollisionMgr`, mostly stubs, TB `CollisionMgr.cpp`); polygons and lines are skipped unless the ball's box is within 20 px of their bounding box (TB `Poly.cpp:953-959`, `Line.cpp:596-599`). **[V:code]**

### 4.3 Collision response

**Ball vs circle (peg, bumper)** (TB `Ball.cpp:830-876`): **[V:code]**

```
n  = normalize(peg.pos - ball.pos)
b  = peg.bouncy (0 -> 0.9)        s = peg.rolly (0 -> 1.0)
vn = dot(ball.v - peg.v, n) * b
if |vn| <= s:  reset ball counter 0x148            // "slide" contact
else:          vn = 2·vn
ball.v = ball.v - vn·n·(M/(M+1)),  M = 999999995904   // infinite-mass peg; effectively ball.v - vn·n
push the ball out of overlap along -n
if peg.ballStopReset: stuck counter = 0
```

Effective normal restitution: 2b - 1 = **0.8** on a bounce, 1 - b = **0.1** on a slow contact; the tangential component is kept. **[Derived]**

**Ball vs line, polygon edge, brick** (TB `Ball.cpp:931-1006`): **[V:code]**

```
b = obj.bouncy (0 -> 0.82)        s = obj.rolly (0 -> 1.4)
impact = -dot(n, v - vSurface - vAngular)          ignore if negative
if |n.x| > 0.99: impact *= 5                        // near-vertical surfaces almost always bounce
if impact <= s:                                     // slide
  v = vSurface + (v - n·dot(v, n)) + n·max(0, dot(n, vAngular))
else:                                               // bounce
  if dot(v, n) < 0: v = (v - 2·n·dot(v, n)) · b     // whole reflected vector scaled by b
  add = (vSurface + vAngular)·(1 + b)
  if dot(add, n) > 0: translate the ball by add
  v += add
  if obj.maxBounceVelocity > 0: clamp |v| to it
if obj.ballStopReset: stuck counter = 0
```

On a static brick or wall a bounce keeps **0.82** of the speed in both components. **[Derived]**

Edge contact is a swept test against the edge offset by the ball radius (minus 0.01); it is skipped when the ball moves away from the edge faster than 0.2 px/tick; end points are tested as circles of the ball radius; overlap is resolved first (TB `Line.cpp:396-624`). Rotating polygons add a tangential contact velocity ω × r (TB `Poly.cpp:1022-1028`). **[V:code]**

**Ball vs ball (Multiball):** restitution 0.95, equal masses (TB `Ball.cpp:799-827`). **[V:code]**

Spec section 9 calls bouncy and rolly "multipliers (1.0 = default)". In the game they **replace** the default coefficient; 0 means "use the default". PeggleEdit's tooltips repeat the multiplier claim (PE `Levels/Children/LevelEntry.cs:743, 760`); the decompiled code contradicts them.

### 4.4 Stuck ball, quick disappear, peg removal

- Stuck counter (TB `Ball.cpp:297-328`): every 10 ticks the ball's position is stored in a history of up to 6 samples. If any stored sample is at least 2 px away from the current position, the counter resets; if one is at least 0.2 px away, the counter drops by 5 once. Contact with a `ballStopReset` object and every popped peg also reset it (TB `LogicMgr.cpp:913-915`). **[V:code]**
- The threshold that triggers removal and which peg goes first are in `LogicMgr::CheckBallStop`, a stub. **Not found.** Named constants `KILLBALL_TIME1 = 1500` and `KILLBALL_TIME3 = 500` ticks exist (TB `LogicMgr.cpp:30-31`); their use is only partly decompiled. **[V:code]**
- Patent: "in some cases, the ball may become stuck and Peggle may remove a peg before the end of the turn to keep the ball in play." **[V:patent]** PeggleEdit: "if the ball does not hit any pegs for a few seconds, there is a delay before the pegs that have been hit will disappear" (PE `docs/Pegs.md:12`). **[V:editor]**
- Quick disappear (crumble): after a crumble peg is hit and its crumble count has reached 3, the count rises by 1 per tick and the peg deactivates when it reaches 100, about 97 ticks (TB `PegInfo.cpp:344-375`). What increments the count to 3 (`IncCrumble`) is in stubbed code. **[V:code]**
- After the shot, lit pegs pop one at a time with a gap of clamp(8 - remaining/10, 1, 5) ticks (TB `LogicMgr.cpp:822-833`). **[V:code]**

### 4.5 Cannon and aim

- The barrel turns toward the target angle at up to 0.2 rad per tick (TB `Gun.cpp:397-420`). **[V:code]**
- Mouse wheel: 0.1° per notch; when the gun is slow and Super Guide is active the step scales down to between 0.01° and 0.1° (TB `LogicMgr.cpp:34-37, 376-414`). Up and Down arrow keys send a wheel of ±5 every tick while held (TB `Board.cpp:455-460`). After a wheel move the mouse is ignored for 30 ticks (TB `LogicMgr.cpp:406-410`). **[V:code]**
- Anti-jitter: the gun records a "settled" angle once it has been still for 30 ticks; a shot fired within 10 ticks of that uses the settled angle (TB `Gun.cpp:96-112, 341-345`). **[V:code]**
- Aim guide maximum length: **40** normally, **80** with Super Guide (TB `Gun.cpp:128-131`). The unit is not decompiled (`DrawGuide` is a stub); it is probably simulation steps or guide points. **[V:code]** for the numbers, unit **Not found**.
- Super Guide changes how fine-aim nudges behave near peg edges (WIKI Bjorn; SPEEDRUN "Super guide alters the way taps work"). **[U:fan]**

### 4.6 Bucket

- The free ball bucket is built from `_base` objects with ids `freeball`, `freeballcover` and `bumperhole`; their Mover radius is animated 1 px every 2 ticks toward a target (TB `LogicMgr.cpp:661-697`). Targets set when Flippers or Pyramid change: 130 while flippers are active, otherwise 200 or 260 depending on a counter; the decompiled expression is garbled, so which case gives 200 and which 260 is unclear (TB `LogicMgr.cpp:1018-1024`). **[V:code]** If 260 is the normal radius, the bucket center travels x = 65 to 585. **[Derived]**
- Fireball caps the bucket via `freeballcover` (TB `LogicMgr.cpp:1011-1014, 1491-1503`). **[V:code]**
- Bucket period: the speedrun guide splits the bucket cycle into 24 points a quarter second apart, i.e. **6 s per cycle**, with stationary points at both ends, and says Beyond Reason's "bucket + helix system loops back around after 24 seconds, or 4 full bucket cycles" (SPEEDRUN). Zero speed at the ends fits a cosine (HorizontalCycle) mover. **[U:fan]**
- Bucket width, catch area and Fever bucket geometry: **Not found** (in `_base`). Fan wiki describes the Fever bottom as "split into five different sections separated by some solid disk-like objects" (WIKI Scoring_System). **[U:fan]**
- Right mouse button: speeds up the **whole simulation** 8x between shots and, only if the `scott` cheat toggle is on, 4x during a shot (TB `Board.cpp:420-439`). So the bucket speed-up is a time speed-up. **[V:code]** Patent: left button held slows time, right button fast-forwards. **[V:patent]**

### 4.7 Slow motion and zoom

- Slow motion speed is stored in per-mille; the default is **250 (0.25x)** (TB `Board.cpp:84, 991-1006`; replays also use 250, `ReplayDialog.cpp:140`). Ticks run when an accumulator passes 1000. When its timer expires the speed ramps up by 20 per tick until 1000; between 900 and 920 the game checks "Fever missed" (TB `Board.cpp:1094-1142`). **[V:code]**
- The Fever trigger distance and the value passed for Fever are in stubs (`Board::CheckForFever`, `LogicMgr::DoFeverSlow`). **Not found.**
- Zoom only runs with 3D acceleration (TB `Board.cpp:1232-1245`). The `zoom` cheat toggles it (TB `Board.cpp:1985-1989`; WIKI Peggle_Deluxe). **[V:code]**
- Clicking left during slow motion cancels it (SPEEDRUN; patent says "Clicking the left mouse button ends slow motion"). **[V:patent]**
- A near miss has its own path: slow motion can start without a hit (`Board::CheckForFever`, a stub, so its trigger distance is **Not found**), and if the last orange peg is still unlit when the ramp passes 900 to 920 per mille, `LogicMgr::DoFeverMissed` runs (a stub). The game holds a "sigh" sound instance it fades out (`LogicMgr::KillSighSound`), and the owner's copy has `sounds/sigh.ogg` (1.61 s) and `aah.ogg` (0.68 s). **[V:code]** Teggle's version: spec 14.2, play screen, "Near miss" (added 2026-10-20).
- Later checks of the physics against the original (the decompiled peg sweep, the stubbed contact pipeline, the wrapped exe, slide and bounce measurements): `docs/research/physics-feel.md`.

### 4.8 Floating point and determinism

Direct3D 9 drops the x87 FPU to 24-bit precision when 3D acceleration is on and PopCap did not pass `D3DCREATE_FPU_PRESERVE`, so the original physics gives different results in 3D and software modes; the fix mod restores 53-bit precision (FPU `README.md`, credited to Brian Rothstein; FPU `src/main.cpp:5-19`). Speedrunners report that strats only work with 3D acceleration off (SPEEDRUN). **[V:sdk]** (mod source) and **[U:fan]**. For spec section 13.4: the original was not deterministic across its own display modes, so "match the original bit for bit" is not a meaningful target; matching its constants and order of operations is.

### 4.9 Scoring code that is decompiled

- Multiplier function (TB `LogicMgr.cpp:723-738`). Its callers are stubs; I read the argument as "orange pegs left" because the breakpoints match the patent's meter steps at 10, 15, 19 and 22 hits. **[V:code]**

  | Orange left | Multiplier |
  | --- | --- |
  | 16 or more | 1 |
  | 11 to 15 | 2 |
  | 7 to 10 | 3 |
  | 4 to 6 | 5 |
  | 1 to 3 | 10 |
  | 0 (Fever), unless the challenge requires clearing all pegs | 100 |

  Fever blue = 10 x 100 = 1,000 matches the patent. Fever purple would be 500 x 100 = 50,000, but the patent and fan wiki say 10,000; the purple rule in Fever is **Not found** in code.
- Ball counter thresholds 25,000 / 75,000 / 125,000 on the shot score (TB `InterfaceMgr.cpp:247-257`). **[V:code]**
- Default orange count 25 when a challenge does not set one; default balls 10, or **6 per player** in a two-player game (TB `Board.cpp:1806-1848`). Patent says 5 per player in Duel. **[V:code] [V:patent]**
- Shot score display: "<subtotal> x <n> Pegs" (TB `LogicMgr.cpp:884-903`). **[V:code]**

### 4.10 Powers (ids and durations)

Power ids (HG `src/haggle/sdk/Sexy/LogicMgr.hpp:13-29`): 1 SuperGuide, 2 Flippers, 3 Multiball, 4 Pyramid, 5 SpaceBlast, 6 SpookyBall, 7 ZenShot, 8 ShotExtender, 9 FlowerPower, 10 Nudge, 11 TimeBomb, 12 FireBall, 13 LuckySpin. Per-power turn counters tick down at the start of each turn (TB `LogicMgr.cpp:1028-1051`). **[V:sdk] [V:code]**

| Power | Facts |
| --- | --- |
| Super Guide | Next shot, 3 shots; extends the aim line "through one bounce" **[V:patent]** |
| Multiball | Current shot; second ball spawns "from the green peg on the opposite side" **[V:patent]** |
| Pyramid | 5 shots including the current one; bumpers on the bucket sides **[V:patent]** |
| Space Blast | Current shot; lights pegs within a radius, "e.g., four pegs wide" **[V:patent]** (internal name `DoExploder`, stub) |
| Flippers | 3 shots including the current one; left click flips, holding keeps them up **[V:patent]**; bucket radius target 130 while active **[V:code]** |
| Spooky Ball | Current shot; ball exits the bottom and reappears "at the same spot at the top"; bucket cap removed after it reappears **[V:patent]**. Fan wiki: it "doesn't follow the direction the ball was travelling prior to re-entry" **[U:fan]** |
| Flower Power | Lights "the closest one fifth (rounded up) of the remaining orange pegs" **[V:patent]** |
| Lucky Spin | Free ball, Triple Score (2 shots), Magic Hat (2 shots), or a random other power; odds not given **[V:patent]**. Random power is drawn from the unlocked masters' powers, excluding power 13 (TB `LogicMgr.cpp:1097-1112`) **[V:code]**. Fan wiki: "25% chance" of Triple Score **[U:fan]** |
| Fireball | Next shot; burns through pegs, bucket capped; cap removed if the Fireball hits it **[V:patent]**; radius 10, passes through PegInfo objects **[V:code]** |
| Zen Ball | Next shot; "evaluates a range of paths and nudges the ball toward the highest-scoring one, weighting bucket landings and orange pegs" **[V:patent]**; the AI uses its own collision world and simulated balls (TB `AIMgr.cpp`, `AIBall.cpp`, all stubs) **[V:code]**. Speedrun guide: it simulates nearby angles, style points count, aiming at the side limit halves the options **[U:fan]** |

Challenge config power names (PE `Pack/Challenge/Challenge.cs:300-346`): Guide, Pyramid, Flippers, MagicHat, TripleScore, Fireball, Zenball, ChainLightning, Multiball, SpaceBlast, SpookyBall, FlowerPower, LuckySpin, ShotExtender. **[V:editor]**

Characters in config order (PE `Pack/Challenge/Challenge.cs:72`): Bjorn, Jimmy Lightning, Kat Tut, Splork, Claude, Renfield, Tula, Warren, Lord Cinderbottom, Master Hu, Marina (Marina is expansion-only). **[V:editor]**

---

## 5. The 55 campaign levels

Counts are the fan wiki infobox values (`|pegs=`, `|bricks=`); **all 55 match spec section 15**. File names are the fan wiki's "raw filename" trivia. Features come from the level pages' text, the in-game dialogue they transcribe, and the speedrun guide. **[U:fan]** unless tagged. "Moving" means the source describes motion; the movement type in brackets is my reading of that description, not data.

| # | St-Lv | Name | File | Pegs | Bricks | Documented features | Background (as described) | Fixed colors on first Adventure play |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | 1-1 | Peggleland | level1 | 96 | 0 | Blockers introduced "as simple ramps" (WIKI Game_Mechanics); microzen always at 6 balls left | | |
| 2 | 1-2 | Slip and Slide | level2 | 59 | 34 | Brick ramps with long slides; ~9.4 oranges on the slides on average (SPEEDRUN) | fairy | |
| 3 | 1-3 | Bjorn's Gazebo | level3 | 97 | 0 | A solid platform on each side the ball can roll or bounce off | | first level with greens |
| 4 | 1-4 | Das Bucket | level4 | 66 | 32 | Slides reachable from the side bolts (SPEEDRUN) | | |
| 5 | 1-5 | Snow Day | level5 | 102 | 0 | Round pegs only | | |
| 6 | 2-1 | Birdy's Crib | plinko | 112 | 0 | Plinko grid | | top center peg green; "fixed green right below the cannon" (SPEEDRUN) |
| 7 | 2-2 | Buffalo Wings | ram | 56 | 44 | Arcs of bricks as the goat's horns | goat | top center peg green |
| 8 | 2-3 | Skate Park | threevalleys | 58 | 48 | Brick slides ("double slide") | | |
| 9 | 2-4 | Spiral of Doom | spiral | 47 | 52 | Spiral | snail | |
| 10 | 2-5 | Mr. Peepers | owl | 42 | 74 | First level with moving pegs; outer, middle and inner rings | | |
| 11 | 3-1 | Scarab Crunch | totempole | 77 | 23 | Horizontal bricks with a pyramid shape on top | ladybug, cat, dog | |
| 12 | 3-2 | Infinite Cheese | infinity | 66 | 34 | Center pegs form an infinity sign and "spin in loop" [figure-eight]; ~3.75 moving oranges on average (SPEEDRUN) | | |
| 13 | 3-3 | Ra Deal | eye | 75 | 33 | Eye of Ra symbol; moving elements "less annoying" than 3-2 (SPEEDRUN) | | |
| 14 | 3-4 | Croco-Gator Pit | fourdoors | 100 | 0 | Moving platforms over pegs; "moving canes" at the sides (SPEEDRUN) | | |
| 15 | 3-5 | The Fever Level | fever | 37 | 67 | Long lower arc slide | | |
| 16 | 4-1 | The Amoeban | theamoeban | 38 | 66 | Large curve | two Chuzzles (PopCap IP) | |
| 17 | 4-2 | The Last Flower | 3d | 74 | 30 | Big ring of moving pegs; its cycle takes 3.75 s at fast-forward (SPEEDRUN; 8x gives about 30 s, [Derived]) | Chuzzles | |
| 18 | 4-3 | We Come in Peace | bug | 44 | 58 | Center circle | Chuzzle in a spacesuit | top brick of the center circle green |
| 19 | 4-4 | Maid in Space | spaceballs | 40 | 60 | Spinning brick rings [rotating group] | cyan Chuzzle | |
| 20 | 4-5 | Getting the Spare | sunflower | 24 | 90 | Upper and lower spinning rings with slots (SPEEDRUN) | | |
| 21 | 5-1 | Pearl Clam | threehills | 57 | 45 | Top, middle and bottom arcs | | |
| 22 | 5-2 | Insane Aquarium | toggle | 104 | 0 | Moving fish that moves to the other side when hit (`movetoggle`, see 2.11) | | |
| 23 | 5-3 | Tasty Waves | sine | 100 | 0 | Center row of pegs moves as a wave [phased vertical cycles]; upper diamonds | | |
| 24 | 5-4 | Our Favorite Eel | infinitejest | 51 | 68 | Outer bricks form an infinity sign; outer, inner and middle rings | | |
| 25 | 5-5 | Love Story | sideaction | 100 | 0 | Round pegs only | | |
| 26 | 6-1 | Waves | waves | 44 | 63 | Three stacked slides | | |
| 27 | 6-2 | Spiderweb | spiderweb | 123 | 0 | Web layout (level name; no source describes the geometry) | | "12 fixed oranges" and a fixed green (SPEEDRUN) |
| 28 | 6-3 | Blockers | blockers | 100 | 0 | Five bumpers "on the cobra" (dialogue); pegs under blockers | | |
| 29 | 6-4 | Baseball | baseball | 105 | 0 | Wall of blue pegs | bat | |
| 30 | 6-5 | Vermin | vermin | 63 | 70 | Vases the ball can fall into | | |
| 31 | 7-1 | Holland Oats | windmills | 78 | 32 | Windmill sails of bricks rotate [Rotate] | windmills | |
| 32 | 7-2 | I Heart Flowers | tulips | 43 | 51 | Tulip-shaped slides (SPEEDRUN) | caterpillar | |
| 33 | 7-3 | Workin From Home | tubing | 0 | 90 | Brick rings float like pool floaters following the river [moving platforms] | river | |
| 34 | 7-4 | Tula's Ride | car | 0 | 100 | Ground row and brick wheels move as if driven [wrap plus rotation] | car | |
| 35 | 7-5 | 70 and Sunny | sunny | 24 | 78 | Slides | | |
| 36 | 8-1 | Win a Monkey | monkey | 36 | 77 | "Eyes" (rings) like 4-4 (SPEEDRUN) | | |
| 37 | 8-2 | Dog Pinball | pinball | 21 | 78 | Fully static (SPEEDRUN); ear parts, middle rings | | |
| 38 | 8-3 | Spin Again | cyclops | 34 | 60 | Circles on both edges | | |
| 39 | 8-4 | Roll 'Em | dice | 49 | 60 | | | |
| 40 | 8-5 | Five of a Kind | cards | 30 | 72 | "Tops of the cards" (SPEEDRUN) | | |
| 41 | 9-1 | The Love Moat | paperclips | 30 | 96 | Brick-heavy | | |
| 42 | 9-2 | Doom With a View | gateway | 38 | 66 | Left and right curves | | |
| 43 | 9-3 | Rhombi | blocks | 58 | 48 | Two rhombi of bricks | | |
| 44 | 9-4 | 9 Luft Balloons | hollywoodcircles | 0 | 108 | Balloons as brick rings | Lex (Bookworm) statues, Chuzzle arches | |
| 45 | 9-5 | Twisted Sisters | bunches | 103 | 0 | Trees the ball gets stuck in (SPEEDRUN) | a castle (trivia links it to Peggleland's view; wording unclear) | |
| 46 | 10-1 | Spin Cycle | spincycle | 75 | 24 | Spinning tube / cane, synced with the bucket; five pegs always blocked by it | | three of the blocked pegs forced orange (SPEEDRUN) |
| 47 | 10-2 | The Dude Abides | vortex | 30 | 90 | Rotating circles; three layers to slide in (WIKI, SPEEDRUN) [rotating groups] | | |
| 48 | 10-3 | When Pigs Fly | holes | 87 | 0 | Portals introduced; exit near a beehive; a middle portal | flying pigs | |
| 49 | 10-4 | Yang, Yin | yinyang | 46 | 86 | Large and small circle | | |
| 50 | 10-5 | Zen Frog | doublehelix | 126 | 0 | Two strands "wiggling back and forth on each side" [helix] | frog; "each peg above the frog hides a different insect" | |
| 51 | 11-1 | Paw Reader | whirlpool | 0 | 134 | Six brick spirals | | |
| 52 | 11-2 | End of Time | crisscross | 0 | 134 | Six rows of bricks where shot timing matters ("the farther left or the higher the brick, the earlier you should shoot") | | |
| 53 | 11-3 | Billions & Billions | blindfold | 100 | 0 | UFO with portals that eject the ball in its travel direction; slants block direct aim | alien spaceship | |
| 54 | 11-4 | Don't Panic | aim | 85 | 0 | Pegs not directly aimable; a yin-yang, an orb, stars | | |
| 55 | 11-5 | Beyond Reason | dna | 131 | 0 | Spinning double helix; helix and bucket repeat every 24 s (SPEEDRUN) | | |

Notes:

- An empty background cell means no source describes that picture. Level names and file names hint at the subject (owl, dice, whirlpool, DNA) but I did not record those as descriptions.
- Levels 1-1 and 1-2 show only orange and blue on first play, 1-3 adds green (WIKI level pages). The patent says purple first appears on level four. **[U:fan] [V:patent]**
- The fan wiki says "Many levels have seeded green pegs on your first Adventure mode playthrough" and names Birdy's Crib and Buffalo Wings (WIKI Adventure_Mode). Only the levels in the last column are documented. **[U:fan]**
- Spec section 9's archetype examples hold up, with two adjustments: stage 3 level 2 is a figure-eight path more than a rotating group, and stage 9 level 4 is a ring layout of bricks (balloons) more than walls and arches.

---

## 6. The 75 challenges

From WIKI `Peggle_Deluxe/Challenges` **[U:fan]**; the patent confirms 75 challenges in 15 pages of five and the group names (In The Clear, Clearly Impossible, Insane Challenges, The Decathlon) **[V:patent]**. Duel groups are post-MVP for Teggle.

| Group | Challenge | Goal | Level(s) |
| --- | --- | --- | --- |
| 35 Orange Pegs | 35 Orange Pegs | Clear 35 orange | Bjorn's Gazebo |
| | 35 Orange Pets | Clear 35 orange | Buffalo Wings |
| | 35 Orange Pests | Clear 35 orange | Scarab Crunch |
| | 35 Orange Posts | Clear 35 orange | We Come in Peace |
| | 35 Orange Clams | Clear 35 orange | Pearl Clam |
| 45 Orange Pegs | 45 Little Victories | Clear 45 orange | Birdy's Crib |
| | 45 Croco-Gators | Clear 45 orange | Croco-Gator Pit |
| | 45 Orange Things | Clear 45 orange | The Amoeban |
| | Only 45 Calories | Clear 45 orange | Insane Aquarium |
| | 45 is the New 25 | Clear 45 orange | Spiderweb |
| 55 Orange Pegs | Fifty-Five | Clear 55 orange | The Fever Level |
| | 50 Plus 5 | Clear 55 orange | The Last Flower |
| | 11 Times 5 | Clear 55 orange | Love Story |
| | 1+2+3+...+10 | Clear 55 orange | Waves |
| | Two Fives | Clear 55 orange | Holland Oats |
| The 300K Cup | 300,000 Points | Score over 300,000 | Snow Day |
| | 300 Grand | Score over 300,000 | Skate Park |
| | 300 Kilopoints | Score over 300,000 | Ra Deal |
| | 3000 Benjamins | Score over 300,000 | We Come in Peace |
| | 300,000 Pointer | Score over 300,000 | Our Favorite Eel |
| The 350K Open | 350,000 Points | Score over 350,000 | Slip and Slide |
| | 350,000 Puntos | Score over 350,000 | Infinite Cheese |
| | 350,000 Punti | Score over 350,000 | The Amoeban |
| | 350,000 Punten | Score over 350,000 | Love Story |
| | 350.000 Punkte | Score over 350,000 | Win a Monkey |
| The 400K Bowl | 400,000 Points | Score over 400,000 (wiki row text says 300,000, a wiki error) | Birdy's Crib |
| | 40,000 P-Babies | same | The Last Flower |
| | 4,000 Pecans | same | Pearl Clam |
| | 400 P-Dogs | same | Vermin |
| | 40 Peeps | same | The Love Moat |
| In the Clear | Clear as a Bell / a Bird / a Fiddle / Silk / Pie | Clear every peg | Peggleland / Slip and Slide / Bjorn's Gazebo / Das Bucket / Snow Day |
| Clearly Impossible! | All Clear / Crystal Clear / See Through / Translucent / No Pegs Left | Clear every peg | Buffalo Wings / Scarab Crunch / Pearl Clam / Spiderweb / I Heart Flowers |
| Dueling (post-MVP) | Bjorn's House / Jimmy's Park / Kat Tut's Empire / Splork's Planet / Claude's Pool | Beat the named master, Normal AI | Das Bucket / Birdy's Crib / Infinite Cheese / We Come in Peace / Insane Aquarium |
| Serious Dueling (post-MVP) | Renfield's Coffin / Tula's Greenhouse / Warren's Carnival / Cinder's Castle / Hu's Temple | Beat the named master, Hard AI | Baseball / Holland Oats / Spin Again / The Love Moat / Yang, Yin |
| Duel to the Death (post-MVP) | Renfield's Treat / Tula's Smackdown / Warren's Game / Cinder's Roast / Hu's Next Victory | Beat the named master, Master AI | Waves / Tula's Ride / Spin Again / Doom With a View / Spin Cycle |
| Multilevel Challenge | 2 for the Road / 3 for Luck / 4 to Get Better / 5 to Get Stuck / 6 Times the Fun | Beat 2 / 3 / 4 / 5 / 6 random levels in a row | random |
| Three Level Duel (post-MVP) | Normal / Hard / Harder / Severe / Master Tri Duel | Beat three random masters' cumulative score over three random levels; the wiki lists the difficulties as Normal, Hard, Master, Hard, Master, which looks garbled | random |
| Multilevel Score | 750,000 / 800,000 / 850,000 / 900,000 / One Million Points | Total over three named levels | Buffalo Wings, Scarab Crunch, We Come in Peace / Pearl Clam, Holland Oats, The Love Moat / Skate Park, Love Story, Waves / Peggleland, Bjorn's Gazebo, Slip and Slide / Snow Day, Birdy's Crib, The Fever Level |
| Insane Challenges | 2 Balls Left | Beat with 2 balls | Peggleland |
| | Last Ball | Beat with 1 ball | Das Bucket |
| | Ten Ball Trial | Beat three levels with 10 balls total | Peggleland, Slip and Slide, Das Bucket |
| | 750,000? | Score over 750,000 | level of choice |
| | The Decathalon | Beat 10 random levels in a row | pool of 43 levels listed on the wiki page (all of stages 1-9 except Peggleland, Das Bucket, Pearl Clam, Rhombi, Twisted Sisters, plus 10-1 and 10-2 and 10-4) |

- Master restrictions: not documented per challenge on the wiki; the config supports `Characters` (PE `Pack/Challenge/Challenge.cs:139`). **Not found** for the shipped set.
- Unlock: "Usually, the first section of the mode is unlocked after beating Adventure Mode's third stage. The remaining sections are unlocked after beating the entirety of Adventure Mode." (WIKI Challenge). **[U:fan]** The 1.01 trophy code is stubbed (TB `TrophyMgr.cpp`).
- Challenge file keys (expansion `trophy.cfg`, read by PeggleEdit; the base game's parser is not decompiled): `Page` blocks with `Desc`; `Trophy` blocks with `Id, SmallDesc, Desc, NumOrange, ScoreReq, StyleScoreReq, UniqueStyleShotsReq, ClearLevel, Characters, Balls, Levels, Opponents, OpponentDifficulty, Powerups (Name=count list), ScoreReset, NoFreeballs, NoGreens, NoForceWin, FreeballCovered, NoEndOnWin, GravityMod, ProjSpeedMod` (PE `Pack/Challenge/Challenge.cs:123-194`, `ChallengePage.cs:39-53`). Tooltips: NoFreeballs = "from bucket, total miss, or score"; NoForceWin = "Don't force player to complete board in order to win challenge" (PE `src/peggleedit/Forms/ChallengeDetailsForm.Designer.cs:672-732`). **[V:editor]** The game's end-of-challenge logic reads score target, level list and "clear level" from the challenge (TB `Board.cpp:1294-1334`). **[V:code]**

---

## 7. Backgrounds

**No free-to-use backgrounds were found.** PopCap's own development article says: "Marcia focused on the backgrounds for each level. Since all the peg layouts had been designed by Brian and Sukhbir, Marcia focused on creating art that fit in those levels" (MAKING). **[V:PopCap]** That makes all 55 backgrounds PopCap-made art (by Marcia Broderick). Several also contain PopCap characters (Chuzzles in 4-1, 4-2, 4-3, 4-4 and 9-4; Lex from Bookworm in 9-4) (WIKI level trivia). **[U:fan]**

So under spec section 12, Teggle cannot reuse any original background. I found no evidence of public domain paintings, NASA imagery or stock photos in them. Caveat: I could not view the images themselves (Cloudflare block on the wiki's image CDN, Chrome extension not connected), so "what the background shows" in section 5 comes from text only.

Useful constraint for Teggle's art: the layouts came first and the backgrounds were painted to fit them (MAKING), and each background is 646 x 543 (1.3).

---

## 8. Style shots and rules marked undocumented in spec section 14

| Question | Finding | Tag |
| --- | --- | --- |
| Long Shot distance | "approximately one-third the width of the screen" between two non-blue hits; Super Long Shot two-thirds. How distance is measured (straight line or path length) is **Not found**; `DoStyleShot` and `CheckPegHitSkillShot` are stubs | **[V:patent]** |
| Long Shot bug | Fan wiki: only counts when the non-blue pegs are the first pegs hit | **[U:fan]** |
| What counts as a slide | "Slide for 12 pegs" only. In code, a contact whose normal impact is at or below the object's rolly (default 1.0 on circles, 1.4 on lines and bricks) takes the "slide" branch and resets a ball counter (TB `Ball.cpp:857-858, 967-969`); the counting rule for Extreme Slide is **Not found** | **[V:patent] [V:code]** |
| Stuck-ball timeout | Counter mechanics in 4.4; timeout and peg choice **Not found** | **[V:code]** |
| Coin-flip odds | **Not found**. Fan wiki: "heavily weighted in the players favor, even moreso with fewer balls" | **[U:fan]** |
| Fever slow motion | Default slow-mo speed 0.25x; Fever-specific factor, zoom and trigger distance **Not found**; zoom needs 3D acceleration | **[V:code]** |
| Space Blast radius | "e.g., four pegs wide" | **[V:patent]** |
| Lucky Spin odds | **Not found** (`DoSlotMachine` stubs). Fan claim: 25% Triple Score | **[U:fan]** |
| Zen Ball search | Range of paths, highest score, weights bucket landings and orange pegs; feedback "No improvement", "Zen achieved", "(n%) More Zen", "Maximum Zen" (> 500%) | **[V:patent]** |
| Microzen / last-ball assist | Speedrun guide: "sometimes the game applies a very small Zenball effect to your shot with only a handful of simulations", at 2 balls left at the earliest, always at 6 balls left on 1-1, only on first Adventure play | **[U:fan]** |
| Power stacking | Per-power turn counters exist (4.10); what a second green does while active is **Not found** | **[V:code]** |
| Multiplier change within a shot | **Not found** (`PegHit` is a stub) | |
| Green and purple from the can-be-orange set | **Not found** (2.4) | |
| Duel ball count | 6 per player in PC 1.01 code; patent says 5 | **[V:code] [V:patent]** |
| Peg hit pitch | "pitch rises with each peg contacted" | **[V:patent]** (spec section 11 lists it as unverified) |
| Style shot values | Freeball Skills 5,000; Long 25,000; Super Long 50,000; Kick the Bucket 25,000; Lucky Bounce 25,000; Mad Skillz 25,000; Crazy Mad Skillz 100,000; Extreme Slide 50,000; Orange Attack 50,000; Cool Clear 50,000; Pyramid Pickup 10,000; Hat Trick 10,000; Free Ball Frenzy 100,000; two-green shots 25,000 (Duel values lower) | **[V:patent]** |
| Patent's Cool Clear | "hit the final orange peg for Extreme Fever, then hit another peg to clear the board"; the fan wiki words it differently | **[V:patent]** |

---

## 9. Can-be-orange set sizes

**Not available.** The original level files are not in PeggleEdit, Thunderball (which ships no assets), haggle or Peggle-Lib. A GitHub repository appears to redistribute the full game as `Peggle.Deluxe.zip` without a license; I did not download it. Fan data gives only indirect hints, e.g. Slip and Slide's slides hold about 9.4 of the 25 oranges on average and Infinite Cheese has about 3.75 moving oranges (SPEEDRUN). **[U:fan]**

Measuring it from a legitimately owned copy is straightforward: XOR `main.pak` with 0xF7, read `levels/*.dat` with the layout in section 2, and count PegInfo bit 1 per level. The same pass would recover `_base` (walls, bucket, Fever buckets), peg radii and brick sizes. The repo's `reference/peggle-2007/` folder is currently empty.

---

## 10. Corrections for spec.md

| Spec section | Says | Finding |
| --- | --- | --- |
| 9 Movement | period in tenths of a second | Ticks of 1/100 s (1.1) |
| 9 Movement | speed in px/s is a parameter | Derived display in PeggleEdit, not stored (3.5) |
| 9 Properties | bounciness and rolliness multipliers, 1.0 = default | Absolute overrides, 0 = default (4.3) |
| 9 Original board | editor offset (73, 43) | Game board origin (75, 40), board 650 x 560 (1.2) |
| 9 Movement types | includes retrace a circle | Not handled in 1.01; expansion only (3.3) |
| 4 Cannon | speed, gravity, guide length undocumented | 4 px/tick, 0.05 px/tick², guide 40 / 80 (4.1, 4.5) |
| 4 Bucket | right button speeds up the bucket | Right button runs the whole simulation 8x between shots (4.6) |
| 7 Flower Power | about 20% | Nearest one fifth, rounded up (4.10) |
| 7 Space Blast | radius undocumented | "e.g., four pegs wide" (4.10) |
| 8, 14 Duel | 5 or 6 balls | 6 in PC 1.01, 5 in the patent (4.9) |
| 11 | pitch rise unverified | Stated in the patent (8) |
| 12 Backgrounds | reuse free originals | None are free (7) |
| 13.4 | cross-engine determinism | The original itself differed between FPU modes (4.8) |
| 14 | peg and ball radius unknown | Ball 6; standard peg 10 (2.5, 4.1) |

---

## 11. Biggest gaps

1. The `_base` level: wall and ceiling geometry, bucket shape, width and Mover, Fever bucket layout. Needs an owned copy of `main.pak`.
2. Rules in stubbed functions: stuck-ball timeout (`CheckBallStop`), color assignment (`MakeGoalPegs` and friends), style shot detection (`DoStyleShot`), coin flip (`UpdateTotalMiss`), Lucky Spin (`DoSlotMachine`), Zen Ball search (`AIMgr`), Space Blast (`DoExploder`), Fever trigger (`CheckForFever`). Thunderball is active (last commit 2026-10-05); re-check later.
3. Exact brick collision polygon in the game (`Brick::InitFromParams` is a stub); PeggleEdit's drawing is the best available model.
4. Can-be-orange share per level (section 9).
5. Visual content of the backgrounds and level screenshots (blocked for scripts).
6. Two decompiler-suspect lines that matter for movement: VerticalArc x term and Rotate with maxAngle (3.3).
