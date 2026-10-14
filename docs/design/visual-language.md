# Teggle: Visual Language

As of 2026-10-14. Companion to `spec.md`. This guide describes how the 2007 PC original and its 2008 expansion look, measured from the shipped art and from screenshots, and translates that into Teggle's own tokens and 16:9 layout. Teggle copies the design grammar, never the names, logos, characters or baked-in text (section 15).

## 0. How to read this guide

**Evidence tags.** Every fact carries one tag.
- **[M]** measured: pixel-sampled or computed from a file listed in Appendix A. The file is named in the same line or table.
- **[S]** sourced: read from a file's text (font descriptors, resource manifest, level data, PeggleEdit source) or a web page.
- **[I]** inferred: my judgment from the evidence. Treat as a proposal.

**File keys.** All reference files live under `reference/peggle-2007/` (gitignored, never committed).
- `pak/...`: the owner's unpacked copy of the base game (images, fonts, sounds, levels, `properties/resources.xml`). Best source; pixel-exact.
- `steam/nights_55xx.jpg`: native 800x600 store screenshots of the expansion. `steam/deluxe_15xx.jpg`: 1024x768 store screenshots of the base game.
- `sc/<app>_<id>.jpg` (folder `steamcommunity/`): player screenshots from the two Steam app pages, app 3480 = base game, app 3540 = expansion. Most are native 800x600.
- `video/vivi_1780_90s.mp4`, `video/vivi_1870_300s.mp4`: base-game stream clips (Internet Archive), used for timing. Frame coordinates were rescaled from the 912x684 game area to 800x600, so expect about 1% scale error.
- `peggleedit/...`: files from the open-source fan editor.

**Units.** Unless stated otherwise, positions are pixels in the original 800x600 window, origin top left. One original pixel equals one Teggle world unit (section 16).

## 1. The look in eight rules

1. **A painted picture behind a glossy machine.** The playfield is a full-bleed painted illustration. Everything around it is a chunky, glossy, cartoon-industrial machine: brass and copper fittings, colored enamel pipes, round rivets, glass tubes, gel buttons. [M: `pak/images/ip/*`, `pak/images/dialog/DialogBox.jpg`]
2. **The machine takes the master's color.** The frame around the playfield exists in 10 color themes, one per master (section 13). HUD columns, score windows and dialogs stay the same in every theme. [M: `pak/images/ip/TLC.jp2` 10 rows, `pak/images/ip/BallOtron.jp2` single]
3. **Pegs are small, hard candy.** 20 px round pegs with a pale metal ring, a dark outline, a darker inner ring and one white specular dot. Lit pegs swap to a glowing white-hot core with a soft additive halo. [M: `pak/images/game/ballpeg.jpg`]
4. **Saturated pegs against undimmed paintings.** Peg and HUD colors are fully saturated (blue, orange, purple, green); the backgrounds are softer and are never dimmed, except a 20 px soft inner shadow cast by the frame. [M: `pak/images/interface/backshadow_.jp2`, background match section 3]
5. **One rounded techno display face everywhere.** All UI text, numbers and callouts use one heavy rounded-square display face with outline and vertical gradient layers. A plain humanist sans is used only for sentences. [S: `pak/properties/resources.xml`, `pak/fonts/*.txt`]
6. **Every number is an event.** Each peg hit shows its value, each shot ends with a sum x count = total tally, style shots pop in with overshoot, and big moments get a full-screen word. [M: `video/vivi_1780_90s.mp4`]
7. **Everything bounces.** Pop-ins overshoot (about 1.85x) and settle; dialogs drop in on a mechanical shaft; the free ball bucket glides on a cosine. [M: video, `pak/levels/_base.dat`]
8. **Fever is a show.** Slow motion and zoom on the final hit, a flying-letter title, rainbow ball trail, fireworks out of the bucket, a rainbow arch with the score. [M: `video/vivi_1870_300s.mp4`]

## 2. Play screen anatomy at 800x600

### 2.1 Two coordinate systems

| System | Origin | Relation to screen | Tag |
| --- | --- | --- | --- |
| Screen | window top left | identity | |
| Level (level files, physics) | playfield top left | screen = level + (75.5, 40) | [M: peg centers of `pak/levels/level1.dat` and `level4.dat` fitted to `sc/3480_3683943965.jpg` and `sc/3480_1147918137.jpg`, 79 pegs, mean offset (75.2 to 75.5, 39.9); x confirmed by the walls being centered on x = 400] |
| Background art | art top left | screen = art + (77, 52) | [M: `pak/levels/*.jp2` matched into 4 screenshots, all gave (77, 52)] |

PeggleEdit draws with offsets (73, 43) and (73, 53) [S: `peggleedit/Level.cs`]. Those are about 2 to 4 px off; use the measured values.

### 2.2 Layout boxes (x, y, w, h)

| Element | Box | Notes | Tag |
| --- | --- | --- | --- |
| Window | 0, 0, 800, 600 | fixed size | [S: `peggleedit/FrequentlyAskedQuestions.md`] |
| Physics walls (inner faces) | x = 75 and x = 725 | 650 wide, centered on x = 400. Wall polygons in level units at x -39.5..-0.5 and 649.5..688.5 | [S: `pak/levels/_base.dat`, parsed] |
| Physics ceiling | y = 49.4 | level y 9.375, full width | [S: `_base.dat`] |
| Bottom | open | ball exits below y = 600 | [M: screenshots] |
| Background art | 77, 52, 646, 543 | every level picture is 646x543 (54 of 56 files) | [M: `pak/levels/*.jp2`] |
| Visible playfield opening | x 78..721 at y 200..570 | frame overlaps art by 1 to 2 px; bottom corners rounded r ≈ 23; top edge 50..56 with the launcher housing cutting a half circle (center x 400, r ≈ 67) | [M: `peggleedit/interface.png`, `interface_collision.png`] |
| Ball counter column | 0, 62, 86, 538 | ends at y 600 | [M: `pak/images/ip/BallOtron.jp2` template-matched in `steam/nights_5571.jpg`] |
| Fever meter column | 714, 62, 86, 538 | | [M: `pak/images/ip/Fevermeter.jp2` matched in `sc/3480_1147918137.jpg`] |
| Top-left corner piece | 0, 0, 130, 78 | themed | [M: `pak/images/ip/TLC.jp2`] |
| Top-right corner piece | 673, 0, 127, 78 | themed | [M: `pak/images/ip/TRC.jp2`] |
| Left score window | 110, 0, 204, 46 | stage or challenge score | [M: `pak/images/ip/LWindow.jp2` matched] |
| Right score window | 488, 0, 204, 45 | total score | [M: `pak/images/ip/RWindow.jp2` matched] |
| Launcher housing | 312, 0, 176, 121 | brass ring around the master portrait | [M: `pak/images/ip/ShooterOrb.jp2` matched] |
| Power name banner | 343, 1, 114, 42 | arched label on top of the housing, themed | [M: `pak/images/ip/Banners.jp2` matched] |
| Portrait window | circle center (400, 78), r ≈ 42; gold ring to r ≈ 66 | | [M: `sc/3480_3602694044.jpg`] |
| Power turns counter | 378, 17, 44, 20 | white digit on dark oval at (400, 27) | [M: `pak/images/interface/Counter.gif`, screenshot] |
| Cannon pivot | (400, 78) | barrel hangs from the housing ring | [M: aim-dot back projection, `sc/3480_3553221662.jpg`, `sc/3480_3602694044.jpg`] |
| Bottom rim strip | about 96, 591, 608, 9 | themed | [M: `pak/images/ip/B.jp2`] |
| Bottom corners | 0, 499, 99, 101 and 707, 499, 93, 101 | themed | [M: `pak/images/ip/BLC.jp2`, `BRC.jp2`] |
| Thin side pipes | 5 to 12 px wide strips along the playfield edges | themed | [S: `resources.xml` L1, L2, R1, R2] |

### 2.3 Draw order (back to front)

Background art, frame inner shadow, peg and object shadows, pegs and bricks, ball and its shadow, effects, frame pieces, HUD columns, launcher housing and portrait, text callouts, dialogs. [I: from `resources.xml` grouping and screenshots; callouts overlap the frame in `sc/3480_1147918137.jpg`]

## 3. Playfield and backgrounds

- **Style.** Hand-painted digital illustrations, storybook to cartoon, with full value range and saturated skies (sunsets, night skies, underwater, space). Not photographic. [M: `pak/levels/*.jp2`]
- **No dimming.** The art is drawn at full brightness. Mean color 20 px or more inside the frame equals the source art (ratio 0.99 to 1.00 in three levels). [M: `pak/levels/level1.jp2`, `theamoeban.jp2`, `level4.jp2` vs `sc/3480_3683943965.jpg`, `sc/3480_3665728221.jpg`, `sc/3480_1147918137.jpg`]
- **Frame inner shadow.** A black overlay with this alpha (0..255), in art coordinates [M: `pak/images/interface/backshadow_.jp2`]:
  - sides: 255 at the edge, 137 at 5 px, 66 at 10 px, 1 at 20 px;
  - top: about 35 px deep band (158 at 5 px, 81 at 10 px, 3 at 20 px, 0 by 40 px);
  - a soft disc under the launcher housing, center x 323 of 646, radius about 60;
  - bottom: 48 (19%) across the last 13 px.
  On screen the outer 15 px of art read at 64% to 78% brightness. [M]
- **Pegs follow the picture.** Pegs and bricks trace shapes in the art (arches, outlines, letters). Peg positions span level x 9..641.5 and y 29..514; the middle 90% fall in x 50..601 and y 95..486. [M: all 55 `pak/levels/*.dat`]
- **Decorative props** (bumpers, pinwheels, frogs) are separate sprites over the art. [S: `pak/images/levels/`]

## 4. Pegs and bricks

### 4.1 Geometry

| Object | Value | Tag |
| --- | --- | --- |
| Round peg radius | 10 in all 3,392 round pegs of the 55 levels | [S: parsed `pak/levels/*.dat`] |
| Round peg sprite | 20x20, drawn 1:1 | [M: `pak/images/game/ballpeg.jpg`] |
| Brick thickness | 20 (2,466 bricks), 25 (9 bricks) | [S: parsed levels] |
| Straight brick length | 35 typical (529 of 650), also 30, 37, 40 | [S] |
| Curved brick | arc segment; median arc length 28 at mid-thickness (10th to 90th percentile 23.6 to 35.3); sector angles mostly 30, 10, 15, 20 degrees | [S] |
| Brick texture | 32x20, stretched along the brick; curved bricks map it across 3 quads | [M: `pak/images/game/brick.png`; S: `peggleedit/BrickImage.cs`] |
| Peg shadow | black disc of the peg's shape, offset (-4, +3), about 45% opacity | [M: `sc/3540_125513396.jpg` background #80a5d2 under shadow #445879; S: PeggleEdit uses (-4, 3) at 50%, `pak/images/game/pegshadow_.gif` 22x22] |

### 4.2 Round peg colors (from the 20x20 sprite, by radius)

Sprite rows: 0 blue, 1 orange, 2 purple, 3 green, 4..7 the same colors lit. [M: `pak/images/game/ballpeg.jpg` with alpha `ballpeg_.gif`]

| State | Body (r 0..4) | Inner ring (r 5..6) | Metal rim (r 7..8) | Outline (r 9) | Specular |
| --- | --- | --- | --- | --- | --- |
| Blue | #22409a → #2e448c | #162a68 / #0e2158 | #728abd / #677ba6 | #1b2646 | #e1fbff, small dot up-left of center |
| Orange | #d24429 → #aa422b | #7f2b10 / #682a0a | #be9056 / #af8a56 | #4a2d13 | #f9e7b9 |
| Purple | #cd17c2 → #a11898 | #7a0875 / #690c69 | #c063c5 / #af64b4 | #49194c | #ffdfff |
| Green | #0aaa02 → #188612 | #0b6908 / #085605 | #5bb351 / #5da554 | #174214 | #cafeb6 |
| Blue lit | #ceffff → #5cabdb | #448cca / #04388c | #326ed8 / #325dd1 | #0f2595 | core is the highlight |
| Orange lit | #fafabc → #f8a44d | #d0691d / #a03504 | #df7143 / #be4a2c | #89190e | |
| Purple lit | #fdf1fd → #df61d9 | #bc3bbe / #710b85 | #b351d2 / #a845ca | #751993 | |
| Green lit | #f7ffde → #b1e35a | #7fc239 / #1a7106 | #44ab44 / #40a444 | #126913 | |

Shading: the body is lighter at the top (blue top half #3b55a1, bottom half #1b307d), so pegs read as lit from above. [M]

Halo: lit pegs add a soft additive glow, sprite `Pegglow` 48x48 (radius 24, flat center #bbbbbb falling to #080808), tinted the peg color. [M: `pak/images/game/Pegglow.jp2`] In screenshots the lit orange halo reads about 36 to 40 px across. [M: `sc/3540_3541187657.jpg`]

Colorblind variant: purple carries a plus sign, green a triangle; orange and blue stay plain. [M: `pak/images/game/ballpegcb.jpg`, `brickcb.gif`] Teggle should keep a shape-coded mode. [I]

### 4.3 Brick look

A brick is a beveled frame around a recessed inner pill. Vertical profile through the middle of the blue unlit texture [M: `pak/images/game/brick.png`]:
- row 0 black outline; rows 1..3 light bevel #93c0ff, #e4f0ff, #bcdbff; row 4 black line;
- rows 5..14 inner pill #3052ad, #385dc0, highlight line #aac9fd, #3c5fc0, #2f51b7, #0d32a7, #092179, #092179, #0c2fa0, #283f87;
- row 15 black line; rows 16..18 lower bevel #6f9eef, #4f78d6, #537cd9.
- The side bevels are 4 px (#75a9ff..#afcffd).

Other colors follow the same structure: orange bevel #f7be60/#fbe9ad, inner #e73e20 → #772208; purple bevel #eb83ff/#fed2f7, inner #ce01cb → #780069; green bevel #6cf15c/#c0ffa2, inner #079d00 → #005c01. Lit bricks fill the inner pill with a white-hot gradient (blue lit center #d8feff, orange lit #fffbd7, purple lit #fddefd, green lit #f9ffe4) and turn the frame saturated. Lit bricks use a 62x54 additive glow. [M: `brick.png` rows 4..7, `Brickglow.jp2`]

### 4.4 Hit and removal

- **On hit:** the peg swaps to the lit sprite plus halo at once, and its value appears next to it as small yellow digits (#eee923 to #f0f135, about 9 px tall, dark outline). [M: `sc/3480_1147918137.jpg`, `video/vivi_1800.png`]
- **Purple hit:** magenta starburst `pulse_score` (162x162, 21 frames) and a pink label "POINT BOOST!" style callout (#dd83dc, about 9 px caps). [M: `pak/images/game/pulse_score.jp2`, video frames 1.2 to 2.0 s of `vivi_1780_90s.mp4`]
- **Green hit:** the power name plus duration in green text near the peg [M: same video 0.0 to 0.6 s], with the green starburst `pulse_powerup` (174x174, 19 frames) [S: `resources.xml`; M: sprite frames].
- **Shot end removal:** lit pegs disappear one at a time in hit order, about 42 ms apart (9 pegs in 0.375 s). Each disappearance plays an expanding, fading ring in the peg's color: `pulse_normal` (blue, 92x92, 13 frames) and `pulse_goal` (orange, 94x94, 26 frames). The shot tally counts up in step (section 9.2). [M: 48 fps frames 124..166 of `vivi_1780_90s.mp4` from 10.5 s; S: frame counts and `framedelay` 2 or 3 in `resources.xml`]
- Frame timing: `framedelay` counts engine updates. If the engine updates at 100 Hz (the PopCap framework default), `pulse_normal` lasts 0.26 s, `pulse_goal` 0.52 s, `pulse_score` 0.63 s, `pulse_powerup` 0.57 s. [I]
- **Quick disappear** pegs use the same removal, only earlier. No separate art exists. [S: `resources.xml` has no quick-disappear image]

## 5. Ball, cannon and aim guide

### 5.1 Ball

- Sprite 14x14; opaque disc about 12 px wide, soft edge to 13 px. [M: `pak/images/game/ball.gif` + `ball_.gif`]
- Material: polished steel that reflects a blue sky on the top half and warm ground on the bottom half. Column through the center: #6a7f83, #396d92, #6492b4, #a3c6d6 (sky), horizon, #7e4303, #926a0f, #987d24, #9d883e, #a29148 (gold). White specular #ffffff right of center at row 4. Dark rim #774721. [M]
- Ball shadow: 14x14 disc mask. [S: `ballshadow_.gif`]
- Large version `bigball` 100x100, same material, for close-ups. [S]
- Collision radius is not in any file read here. [gap]

### 5.2 Cannon

- Barrel sprite cells 63x64 (3 cells), plus a 78x57 variant set (3 cells): bronze barrel, teal collar ring, flared muzzle. [M: `pak/images/ip/Shooter.jp2`, `pak/images/interface/cannon.gif`]
- It rotates around the portrait center (400, 78). Pointing straight down, the collar sits at y 120..135, the barrel ends at y 158 and the loaded ball sits at (402, 163), so the ball sits 85 px from the pivot. An angled shot puts the first guide dot 88.6 px from the pivot. [M: `sc/3480_3602694044.jpg`, `sc/3480_3553221662.jpg`]

### 5.3 Aim guide

- **Dot shape:** a soft white square, 15x15 sprite with alpha falloff 0, 59, 145, 207, 248, 255 from the edge, tinted cyan. [M: `pak/images/game/guiderect.gif`]
- **Color on screen:** mean #6fcab7 to #75ccb9, brightest #8bfeff. The first two dots near the muzzle are paler and fainter. [M: `sc/3480_3553221662.jpg`, `sc/3540_3429393065.jpg`]
- **Spacing:** dots sit at equal time steps along the path, so spacing grows with speed. Straight down: 17.3, 18.2, 18.8, 19.9, 20.6, 21.0, 22.1 px between centers. Angled shots: 17 to 19 px. [M: `sc/3480_3602694044.jpg`]
- **Dot size:** grows along the path from 10 to 14 px visible. [M]
- **Count and length:** 8 dots, then an arrowhead (`guidearrow` 14x24); about 200 px of path when aiming straight down. [M; S: `guidearrow.gif`]
- **Guide power:** extra sprites for the full path and bounce: `guiderect2` (2x25 gradient line), `guidepoint` (4x4), `guidehit` (yellow arrow 13x15, #fdf000 with black outline), `superguidehit` (22x22 glow). [S: `resources.xml`; M: sprite pixels]

## 6. Free ball bucket and Fever buckets

### 6.1 Free ball bucket

| Property | Value | Tag |
| --- | --- | --- |
| Art | 169x25 copper bowl with a teal rim and black opening | [M: `pak/images/levels/CatcherA.jp2`] |
| Opening on screen | about 110 px wide black ellipse at y 577..584; art center y 580 | [M: `steam/nights_5576.jpg`, video tracking] |
| Catch trigger | 130x20 box centered on the bucket | [S: `_base.dat`, entry "freeball"] |
| Rim colliders | two small sloped polygons at ±69 px from center | [S: `_base.dat`] |
| Motion | horizontal cosine, amplitude 260, period 6.0 s (600 centiseconds), center level x 326 → screen center 401.5, range 141.5..661.5 | [S: `_base.dat`; M: video, positions at 0.27 s and 0.52 s before the turn match the cosine to within 1 px, `vivi_1780_90s.mp4`] |
| Peak speed | 2π·260 / 6 = 272 px/s at the center | [I from S] |
| Pyramid power | wider bowl `CatcherB` 169x19 with long sloped sides | [S: `_base.dat`, `CatcherB.jp2`] |
| Fireball dome | `catchercover` 120x19 tan dome over the bucket | [S] |
| Catch light | `CatcherGlow` 159x87 white cone rising from the bucket | [S] |

### 6.2 Fever buckets

| Property | Value | Tag |
| --- | --- | --- |
| Holes | 5, art 71x13 dark ellipse with teal rim, trigger 80x18 | [S: `_base.dat`, `bonushole.gif`] |
| Hole centers | screen x 140.5, 272.5, 400.5, 527.5, 653.5; art center y ≈ 585 | [S: level x 65, 197, 325, 452, 578; M: `sc/3480_3775984283.jpg`] |
| Separators | 6 gold discs (`bonusbumper` 77x31 half disc, collider circle r 37) at screen x 75.5, 208.5, 337.5, 462, 587.5, 722 | [S] |
| Entry | each carries a vertical move of radius 30 with period 0.2 s and a start point 30 px below, so they most likely pop up from below | [S: `_base.dat` movement; I: the visible motion was hidden by the Fever zoom in the video] |
| Labels | arched value art above each hole: "10,000" 67x24, "50,000" 70x25, "100,000" 79x27, dark brown-black with a light rim; a lit version with an orange glow appears when the ball lands | [M: `pak/images/game/bonus*.gif`, `bonus*light.gif`] |
| Landing glow | `bonusglow` 89x45, orange-yellow light rising from the hole | [M] |

## 7. HUD

### 7.1 Ball counter (left column)

| Part | Box or value | Tag |
| --- | --- | --- |
| Body | teal enamel tube in a brass frame; body color #006744 to #015146, brass #c7a055 / #d1bc7b / #ffefcd highlights, copper shadow #704727 | [M: `BallOtron.jp2`, `steam/nights_5571.jpg`] |
| Header plaque | arched brass label at y 62..100 (the original has its device name baked in; Teggle replaces it) | [M] |
| Count orb | circle center (41, 120), r ≈ 30, dark green glass | [M] |
| Count digits | lime gradient digits with a dark green glow, 20x31 px, #9bf633 to #a0f870 | [M: `sc/3540_3429393065.jpg`; S: font `Overload32`] |
| Ball column | window x 26..51, y 189..496 on a dark backing; balls 14 px across on a 20 px pitch, stacked from the bottom, center x 38 | [M: `BallOtron.jp2` alpha, `steam/nights_5571.jpg`] |
| Plunger | red cup on a coil spring at the bottom of the column (26x157) | [M: `pak/images/interface/Plunger.gif`] |
| Shot-score tubes | two glass tubes at x 6..17 and 60..71, fill area y 166..508 (342 px) | [M: `sc/3480_1147918137.jpg`] |
| Tube fill colors | stage 1 green (edge #35cd76, center #8fffc9), stage 2 purple (edge #a632cb, center #e995ff), stage 3 yellow (#ffef77); empty dark teal #015146 / #003b37; 14 px wide fill sprites | [M; S: `RightProgressBar.gif` 3 columns] |
| Fill behavior | the fill rises with the shot score; the next stage color rises from the bottom over the full previous color (green full, purple rising seen at 25k+) | [M: `sc/3480_1147918137.jpg`, `steam/deluxe_1535.jpg`] |
| Threshold display | the count orb lights in the stage color (`FBLightup` 65x65 green, purple, yellow) and shows "FREE BALL" text (`FBfreeball`, green, purple, orange) or the threshold value "25,000", "75,000", "125,000" (`FBPOINTS`) | [M: `sc/3480_3665728221.jpg`, `sc/3480_1147918137.jpg`; S] |
| Bottom button | round purple MENU button (51x51) centered at about (37, 566) | [M: `pak/images/dialog/menubutton.jpg`; position mirrored from the right button in `sc/3540_3541187657.jpg`] |

### 7.2 Fever meter (right column)

| Part | Box or value | Tag |
| --- | --- | --- |
| Body | copper and dark teal column in a brass frame | [M: `Fevermeter.jp2`] |
| Orb | center (760, 122), r ≈ 30; amber glass (#b47800 mid, #a93700 low); some captures show it glowing bright yellow (three glow sprites 38, 61 and 66 px exist), so it likely brightens with the multiplier | [M: `steam/nights_5571.jpg`, `sc/3480_3382329898.jpg`; S: `feverglow1..3`; I: the trigger] |
| Segment stack | 25 segments, x 737..783, y 164..519, pitch 14 px: 11 px band plus 3 px groove | [M: `steam/nights_5572.jpg`] |
| Segment unlit | dark maroon #41080e, edges #963f21 | [M: `steam/nights_5571.jpg`] |
| Segment lit | orange #ed9555 center, #e24d09 to #da4e10 edges, groove #3f142f | [M: `steam/nights_5572.jpg`] |
| Fill order | bottom up, one segment per orange hit | [M] |
| Step labels | "x2", "x3", "x5", "x10" plates (52x25) on the left of the stack at the tops of segments 10, 15, 19 and 22 (y ≈ 383, 313, 255, 213); a lit yellow version (30x20) replaces the plate once reached | [M: `sc/3540_3541187657.jpg`; S: `Feverbars.gif`, `Feverbarlites.gif`] |
| Multiplier display | the plates are the only multiplier readout; there is no separate number | [M: all gameplay screenshots] |
| Bottom button | round green INSTANT REPLAY button, visible disc 46 px, centered at (763, 566) | [M: `sc/3540_3541187657.jpg`] |

### 7.3 Score windows

- Glossy blue capsule: top #4154ba, middle #0716e1, bottom glow #095de3; dark teal rim. [M: `peggleedit/interface.png` column 200]
- Left side: a two-line label (for example the stage number) in 9 px caps, light blue #5cc5f8; lines at y 12..20 and 27..35, starting at x 124. [M: `sc/3480_3553221662.jpg`]
- Right side: score digits 21 to 22 px tall, 10 to 11 px wide, light-blue vertical gradient (#7decff top to #3f92fa bottom) with a 1 px blue outline #0040c0; right edge at x 298. [M; S: font `Overload18`]

### 7.4 Launcher housing and portrait

- Brass ring (`ShooterOrb`) with a themed inner ring (`Shooterbacks`, 10 themes) and the master portrait inside the 84 px window. [M]
- When a power is active, the portrait window glows in the theme color (`Orbglow`, 83x83, 10 themes) and the turns counter shows the remaining turns. [S: `resources.xml`; M: `Orbglow.jp2` colors section 13]
- The power banner arcs over the housing: an unlit and a lit version per theme (column 0 dark, column 1 bright). [M: `Banners.jp2`]

### 7.5 Low-ball warnings

- "3 BALLS LEFT", "2 BALLS LEFT": display font, yellow top #fff80c to orange bottom #ff5500 split at mid-height, black outline 3 px; about 20 px caps when settled, centered at x 400, y ≈ 152, just under the launcher. [M: `sc/3540_3429393065.jpg`]
- "LAST BALL!" uses the same treatment but huge: text spans x 71..741, letters about 95 px tall (y 117..213). [M: `sc/3540_3541187657.jpg`]
- Behavior: the warning appears big, shrinks toward its rest position under the launcher and holds there for about 3 s. [M: `video/vivi_1870_300s.mp4` 0 to 4 s at 1 fps]
- Vertical gradient in "LAST BALL!": #fcfe03 (top 40%), through #fee300, #fd9c00, to #fc4c00 (bottom 35%). [M]

## 8. Typography

### 8.1 What the original uses

| Role | Original font | Treatment | Tag |
| --- | --- | --- | --- |
| Score window digits | Overload 18 (digits only, pre-colored) | light-blue gradient, blue outline | [S: `resources.xml` FONT_SCORE_DISP; M: `pak/fonts/Overload18.gif`] |
| Score window labels | Overload 11 (caps only, lowercase maps to caps) | light blue | [S: FONT_SMALL_DISP, `Overload11.txt` SetCharMap] |
| Ball count | Overload 32 (digits only) | lime gradient, dark green glow | [S: FONT_BALLSLEFT] |
| Big score numbers (Fever score, shot total) | Bonk 60 (digits and comma only) | yellow → orange → red vertical gradient, thick black outline, slight bevel | [S: FONT_BONK; M: `Bonk60.gif`] |
| Callouts, dialog titles, warnings | Overload 10, 12, 16, 24 with outline layers | see 8.2 | [S] |
| Buttons | Button 12 (an Overload cut) | light fill with gradient layer #4dc4f7 and a dark green shadow layer at 50% | [S: `Button12.txt`] |
| Sentences (tips, intro text, stats) | Neo Sans Medium 12 and 14 | plain, optional black or #404040 outline | [S: FONT_PLAIN, FONT_STAGE] |
| Speech bubble, certificate | Italian Old Style MT 13 and 17 | dark indigo on cream | [S: FONT_PLAIN2; M: `sc/3540_3780932673.jpg`] |
| Fine print | Tahoma 8, Courier Final Draft 8 | | [S] |

Overload character: heavy, rounded-square techno caps; the lowercase slots hold alternate cap forms (rounded "e" and "a"), which is why words like "LeVEL" look mixed. [M: `pak/fonts/_overload24.gif`]

### 8.2 Text effects (from the font layer definitions)

| Effect | Layers | Use | Tag |
| --- | --- | --- | --- |
| Outline | black outline glyph layer behind, offset (-2, -2) at 16 px, (-3, -3) at 24 px | callouts | [S: `Overload16.txt`, `Overload24.txt`] |
| Green outline | outline tinted (0, 0.45, 0) | green callouts | [S] |
| "font1" (cool title) | blue outline (0.3, 0.3, 1, alpha 0.9) + gradient overlay tinted (0.3, 0.65, 0.8) on the lower part (offset 25 px) | dialog titles such as "LEVEL COMPLETE!", light cyan #6ee5ff top | [S; M: `sc/3540_3785992381.jpg`] |
| "font2" (hot warning) | black outline + gradient overlay recolored to solid (1, 0.3, 0) on the lower part | "LAST BALL!", "n BALLS LEFT" | [S; M] |

### 8.3 Sizes seen on screen (cap or digit height)

| Use | Height | Color | Tag |
| --- | --- | --- | --- |
| Peg value popup | 9 px | #eee923 yellow, dark outline | [M: `sc/3480_1147918137.jpg`] |
| Style shot name | 13 px settled | #7ce47c green, max #a0ff9e, dark outline | [M] |
| Shot total line 1 ("sum X n PEGS") | 13 px | #eff314 yellow, black outline | [M: video] |
| Shot total line 2 (product) | 19 to 21 px | same | [M: `sc/3480_2921694449.jpg`, video] |
| Score window digits | 21 to 22 px | light blue gradient | [M] |
| Dialog row labels | 13 px | #6ce1e2 cyan | [M: `sc/3480_3775984283.jpg`] |
| Dialog row values | 12 px | #f3e525 yellow | [M] |
| Dialog stats (sans) | 12 px | #d2c78d khaki | [M] |
| Button labels | 10 px | #f9d054 pale yellow on orange | [M] |
| Stage card subtitle | 18 px | #45bbd9 cyan | [M: `sc/3480_3762083037.jpg`] |

### 8.4 Teggle font picks

| Role | Pick | License | Why | Tag |
| --- | --- | --- | --- | --- |
| Display, numbers, buttons, callouts | **Overload** (Ray Larabie, Typodermic, 1998) | CC0 1.0 public domain | The game's own "Overload" bitmap fonts match this face: rounded-square techno caps with the alternate A and E in the lowercase slots. A font is not a trademark; CC0 allows any use. Self-host as WOFF2. | [S: `resources.xml` font names; [typodermicfonts.com/public-domain](https://typodermicfonts.com/public-domain/) lists Overload under CC0; [dafont.com/overload.font](https://www.dafont.com/overload.font) credits Typodermic. I: visual match judged from the atlas, not rendered side by side] |
| Display fallback if only SIL OFL is wanted | **Russo One** (Google Fonts) | SIL OFL 1.1 | Heavy rounded-square sans of the same family of shapes. | [I] |
| Sentences | **Exo 2** Medium (500) (Google Fonts) | SIL OFL 1.1 | Neo Sans is commercial. Exo 2 shares the squarish rounded techno-humanist forms and a tall x-height at small sizes. | [I] |
| Big score digits | Overload with the hot gradient and a 3 px black outline; optional **Lilita One** (OFL) for a chunkier cartoon look | CC0 / OFL | Bonk is a digits-only cartoon face; one family fewer keeps the system simple. | [I] |
| Speech bubbles only (optional) | **EB Garamond** Medium (OFL) | SIL OFL 1.1 | Old-style serif stand-in for Italian Old Style. Skip it and use Exo 2 if two families are enough. | [I] |

## 9. Text callouts and popups

### 9.1 Peg value popups

Small yellow digits (#eee923, about 9 px) centered on the hit object, slightly above it, showing the multiplied value ("20", "300"). [M: `sc/3480_1147918137.jpg`, `video/vivi_1800.png`] Lifetime not measured. [gap]

### 9.2 Shot total tally

- Position: centered at x ≈ 400, line 1 at y 196..208, line 2 at y 216..236 (upper third of the playfield). [M: frame `vf2/g_150` of `vivi_1780_90s.mp4`; `sc/3480_2921694449.jpg` shows the same block at y 188..250]
- Line 1: "2,390 X PEGS" fades in over about 170 ms after the ball leaves play, then becomes "2,390 X 1 PEG", "2,390 X 2 PEGS"... as each peg disappears, with line 2 showing the running product. [M: frames 100..142 at 48 fps]
- Line 3 (when earned): "+25,000 STYLE POINTS" in green (#92fc9a), 12 px, at y 244..255. [M: `sc/3480_2921694449.jpg`]
- The block stays until the next shot starts. [M: video]

### 9.3 Style shot callouts

- Two lines at the place where the event happened: the name (green, 13 px caps settled) and "+value" below. [M: `sc/3480_1147918137.jpg`]
- Animation: grows to about 1.85x its settled size within 80 ms of appearing, settles to 1.0x by 250 ms, holds about 0.6 s, then dissolves over about 0.35 s. Total about 1.25 s. The start scale is unknown (the first sampled frame already shows 1.1x). [M: 12 fps width track of "LONG SHOT!" in `vivi_1780_90s.mp4` 19.9 to 21.2 s: widths 106, 179, 140, then 97 px]

### 9.4 Power and bonus labels

- Green power label at the green peg: power name plus "NEXT 3 TURNS" style line, green, about 9 px caps. [M: `vivi_1780_90s.mp4` 10.5 to 11.2 s]
- Purple bonus label: pink #dd83dc (max #fd94fe), about 9 px caps. [M: `video/vivi_1800.png`]

## 10. Menus and screens

### 10.1 Shared materials

| Material | Look | Tag |
| --- | --- | --- |
| Brass and copper | warm metal with bright highlights: #ffefcd, #e9c98c, #d1bc7b, #c7a055, #af8646, shadow #704727 | [M: `steam/nights_5571.jpg` col 41; `BallOtron.jp2`] |
| Enamel pipe | theme-colored rounded tubes with a white specular stripe (section 13) | [M: `L2.jp2`, `B.jp2`] |
| Indigo panel | dialog body #25137f with a darker 1 px scanline every 3 to 4 px (#1d0f64), lighter top-left inner bevel #47319e → #312d81 | [M: `pak/images/dialog/DialogBox.jpg`] |
| Panel frame | brass outer edge (#bba45e, #dac97b, #935838) with a teal inner lip (#40808c, #74a4ae), round brass rivets at the corners | [M: `DialogBox.jpg`] |
| Title pill | glossy blue capsule: #4157bc top, #0716e1 middle, #095de3 bottom glow | [M: `DialogBox.jpg` col 123] |
| Thumbnail window | black rounded-rect opening in teal metal | [M: `pak/images/levelselect/LevelScreen.jp2`] |

### 10.2 Buttons (all have a black outer outline and a pale teal rim #79abb5)

| Button | Size | Normal | Hover | Down or selected | Tag |
| --- | --- | --- | --- | --- | --- |
| Wide pill (primary action, e.g. next level, retry) | 171x34 | orange, #b3360d top → #f67f37 bottom | #e8790d → #ffc937 | yellow #f3d716 → #fdff37 | [M: `Button3.gif` 3 rows; state order normal, hover, down is I] |
| Small pill (dialog choices) | 120x27 | blue #0207ea | lighter blue #006eea | green #1cba53 | [M: `Button2.gif`] |
| Brown pill (bottom bars) | 99x35 | dark orange #6e2400 → #9b4200 | #f1a034 | yellow #f0ca03 | [M: `brownbutton1.jpg`] |
| Round (MENU, REPLAY) | 51x51, brass bezel | purple #a900bc | #ec28ca | | [M: `menubutton.jpg`] |
| Main menu gel slab | 188x119 or 199x115 | dark green gel #0b5835 with lime rim #b9e728 | bright lime #a4ec29, highlight #e6fe86 | | [M: `pak/images/mainmenu/Adventure.jp2` 2 rows] |
| Arrow pill (level select paging) | 115x36 | green #006c0c with yellow-green arrow | lime #02d720, arrow #f2ff00 | | [M: `Backbutton.jp2`] |
| Toggle | 171x34 | blue pill with a round purple check socket; checked shows a red check | | | [M: `Button1.jp2`] |
| Slider | track 331x42 | blue track, teal-green fill, blue orb knob, yellow highlight | | | [M: `Slider.gif`, `Sliderorb.gif`, `Sliderhighlight.gif`] |

Labels: Button 12 face, pale yellow on orange (#f9d054), light cyan on blue. [M]

### 10.3 Main menu

[M: `sc/3480_3764877689.jpg` (base, 1600x1200 upscale of 800x600), `sc/3540_3780932673.jpg` (expansion); S: `pak/images/mainmenu/*`]
- Left 70%: a painted scene with the mascot character and a cream speech bubble (258x134, #fdf8ec fill, indigo outline, serif text).
- Right column (x ≈ 560..800): four large gel slabs stacked in brass rings (mode buttons), each about 200x115.
- Bottom bar (503x80 at about x 60..563, y 520..600): three pill buttons in a steel-blue rail with brass rivets; a round purple quit button in the bottom-left corner.
- Frame: steel-blue enamel pipes and brass joints around the whole screen.
- The expansion recolors the slabs blue-violet and the pills green; layout is identical.

### 10.4 Level select (Quick Play, challenge lists)

[M: `sc/3480_3472684678.jpg`, `sc/3480_3575301845.jpg`; S: `pak/images/levelselect/LevelScreen.jp2` 800x600]
- Full-screen frame art with a title pill at the top (x 75..725, y 5..45), title in display font, light cyan.
- 3x2 grid of thumbnail windows (about 236x200 each). The bottom-center cell is an indigo info panel: item name (yellow), a subheading (green) and a ranked list (orange numbers, white names).
- Thumbnail titles sit above each picture in lime green display text.
- Hover: an orange-gold rounded-square ring (238x221) around the thumbnail. [M: `LevelSelector.jp2`]
- Locked: purple overlay with a diagonal "LOCKED" stamp. Completed challenges: a medal overlay.
- Paging: two green arrow pills under the info panel. Round purple main-menu button bottom-left, round green random-level button bottom-right.

### 10.5 Stage intro card

[M: `sc/3480_3762083037.jpg`, `sc/3480_3793161026.jpg`, `video/vivi_1870_300s.mp4` 26..57 s]
- Full-screen indigo panel, title pill with the stage name.
- Two centered heading lines: the power's tagline (cyan #45bbd9, 18 px) and the master line (white).
- Portrait 190x190 in a teal bevel at left (x 50..240, y 135..325); dark speech panel at right (x 248..760) with sentence text that types out character by character.
- Progress rows: 11 master thumbnails (66x66, teal frame; current one gold; locked ones dark silhouettes) and a row of 15 colored challenge squares.
- Primary orange pill at the bottom center in a brass housing.

### 10.6 In-game dialogs (tip, level complete, level failed, options)

- Shape: the 9-slice panel of 10.1, about 425x305 for result dialogs, at (187, 147). [M: `sc/3480_3775984283.jpg`, `sc/3480_3747589358.jpg`]
- They hang from the launcher housing on a telescoping column of steel-blue segments (90x54 each) and drop in from the top in about 0.17 s. [M: `vivi_1870_300s.mp4` 21.0 to 21.17 s; S: `segment.jpg`, `Connector.jpg`, sound DIALOG_MOVE]
- **Level complete:** rows "TOTAL SCORE", "LEVEL SCORE", "WIN ON nTH TRY" (cyan labels left, yellow values right, 1 px cyan rule under each), then a two-column stat block in the sans (shots, free balls, % cleared; shot, Fever and style points), then a wide orange button. Totals count up over about 3 s. [M]
- **Level failed:** title "TRY AGAIN!", level score row, stat block, a tip line with a small badge icon, then a wide orange retry button. [M: `sc/3480_3747589358.jpg`]
- **Options:** title pill, three slider rows with blue label pills, two rows of toggles, two full-width green pills, and a large green done button in a recessed sub-panel. [M: `sc/3540_3729012195.jpg`]
- **Pause:** a "PAUSED" word, 249x71, white-cream letters with an orange-brown outline. [M: `pak/images/game/PAUSED.gif`]
- **Award screens:** after a level, rosette ribbons (red, blue) and a laurel medal center screen with "click to continue". Teggle may use rosettes; their text and emblems are trademarked content (section 15). [M: `sc/3480_3382329898.jpg`, thumbnails in `sc/`]
- **Stats screen:** four translucent dark-blue panels with cyan rims over the level picture; high-score ranks colored green, yellow, orange, red, magenta from top to bottom. [M: `sc/3480_3358174638.jpg`]

## 11. Shapes, radii and shadows

| Token | Value | Tag |
| --- | --- | --- |
| Pill radius | full height / 2 (all pills are true capsules) | [M: `Button2.gif`, `Button3.gif`] |
| Panel corner radius | about 20 px outer on the 246x249 panel (alpha edge starts at x 22 on row 4 and x 5 on row 18) | [M: `DialogBox.jpg` + `DialogBox_.gif`] |
| Indigo body and thumbnail window radius | about 10 to 12 px | [I: by eye from `DialogBox.jpg`, `LevelScreen.jp2`] |
| Outline weight | 1 px black around every button and panel; 2 to 3 px black around display text | [M; S] |
| Object shadow | (-4, +3), black 45% | [M] |
| Frame inner shadow | 20 px soft falloff (section 3) | [M] |
| Glow | additive, tinted, radius about 2.4x the object radius | [M: `Pegglow.jp2` 48 vs peg 20] |

## 12. Effects and timing

### 12.1 Free ball

The count orb lights (green, then purple, then yellow for the 25k, 75k and 125k steps) and shows "FREE BALL" or the threshold value; the tube color changes. [M: `sc/3480_3665728221.jpg`, `sc/3480_1147918137.jpg`] Sounds: `extraball`, `extraball2`, `extraball3`, `freeball2`, `ball_add`. [S: `resources.xml`] How the new ball enters the column was not seen. [gap]

### 12.2 Bucket catch

A white light cone (`CatcherGlow`, 159x87) rises from the bucket, `buckethit` plays, and the free ball display triggers. [S] Not seen in motion. [gap]

### 12.3 Coin flip

A 200x200 metal coin with a winged ball on the winning face and a horned ball on the losing face, plus banner text art for the win and loss results; sounds `coin_spin` (1.30 s) and `coin_freeball_denied`. [M: `coinheads.jp2`, `cointails.jp2`, `coinhilight.gif`; S] On-screen position and spin animation were not seen in any capture. [gap] The coin faces carry branded text; Teggle draws its own coin (section 15).

### 12.4 Master power activation

Green starburst at the peg (19 frames, about 0.57 s at 100 updates per second [I]) and the power label at the peg [M: video]. The banner over the housing has a dark and a lit version and the portrait window has a theme-colored glow, so the housing most likely lights up while the power runs [S: `Banners.jp2`, `Orbglow.jp2`; I]. The turns counter shows the remaining turns and the power's sound plays [S: `resources.xml` POWERUP_*, `characters.cfg` tips]. Power-specific art present in the files: Space Blast (`spaceburst`, `spacebubble`, `spacehalo`, `spacestar`), Spooky Ball (`spookypoof1/2`, `spookyghost`, eyes on the ball), Fireball (`fireballfire` 30-frame flame, `flametrail`, `ember`, `smoke`), Pyramid (`CatcherB`, `pyramidray`), Lucky Spin (a full wheel set in `pak/images/luckyspin/`), Zen (yin-yang ball), Flower Power (`flower`), Flippers (claw-shaped flipper art). [S] Only the Guide and the banners were seen in motion. [gap]

### 12.5 Fever sequence (measured timeline)

Measured from `video/vivi_1870_300s.mp4` at 6 fps (±0.17 s). Clip time t; last orange hit at t = 11.83.

| t (s) | Δ from hit | Event | Tag |
| --- | --- | --- | --- |
| 10.83 | -1.0 | shot fired | [M] |
| 11.00 to 11.17 | -0.8 | HUD disappears, view starts zooming toward the ball; a thin light-blue rounded frame replaces the HUD and a small "cam" tag sits top left | [M; the frame is probably the `screenframe*` art (I); tag art `FEVERCAM.jp2` (S)] |
| 11.5 | -0.3 | zoom about 1.5x, slow motion | [M: blue peg blobs 12 px → 18 px] |
| 11.83 | 0 | hit: spark burst at the peg; the two-word title starts flying in letter by letter from the left and right edges | [M] |
| 12.33 | +0.5 | title assembled across the top (letters about 70 px tall, fiery orange gradient with a magenta-pink outline glow); zoom about 1.55x to 2.0x | [M: `video/fever_12.5.png`; `sc/3480_3781367778.jpg` measured 2.0x] |
| 12.3 to 14.7 | +0.5..+2.9 | ball keeps bouncing in slow motion with a rainbow trail (red tail to violet head); each blue peg hit shows "1000" | [M: `video/fever_15.2.png`] |
| 14.83 | +3.0 | title letters fly out to the sides, zoom returns to normal | [M] |
| 15.0 | +3.2 | normal view with HUD; the five Fever buckets are already in place | [M] |
| 16.2 to 16.3 | +4.4 | ball drops into a bucket; a fountain of stars and sparks shoots up from it in the bucket's color (green in this sample) for about 1 s | [M] |
| 17.33 to 18.0 | +5.5..+6.2 | a rainbow arch draws in from right to left; "FEVER SCORE" style lettering arcs along it | [M] |
| 18.33 to 19.33 | +6.5..+7.5 | the Fever score counts up under the arch (9,000 → 54,000), then the bucket value is added (64,000 at 19.67) | [M] |
| 20.17 to 20.5 | +8.3..+8.7 | rainbow fades; the number rises and fades by 20.83 | [M] |
| 21.0 to 21.17 | +9.2 | level complete dialog drops in on its shaft | [M] |
| 21.5 to 24.3 | +9.7..+12.5 | totals count up | [M] |

Rainbow arch geometry: outer red edge is a circle centered at about (403, 583) with radius about 420; band thickness about 73 px (red #e5280b, orange #fb9326, yellow #ffed42, green #98fe37, cyan #28d8fc, blue #284bff, violet #6714ff); the number sits at y ≈ 265..315 in the warm digit style. [M: `video/fever_19.0.png`]

Sounds in the sequence: `timpaniroll` (2.25 s, named SLOWMO, plays during the approach), `cymbal`, `gong`, `extremefever2` (whoosh), `missile` (per flying letter, named TEXT_WOOSH), `feverhit`, `fireworks1/2` (about 3.5 s), `rainbow` (3.2 s), `applause`. [S: `resources.xml`; M: durations] The Fever music file is not in the unpacked set. [gap]

Full clear variant: a three-word title stacked in three lines over the whole playfield and all five buckets labeled 100,000. [M: `sc/3480_3779608488.jpg`]

## 13. Themes per master

The frame (corners, top rail, bottom rail, side pipes, housing ring, power banner, portrait glow) is drawn in the stage master's theme. The ball counter, Fever meter, score windows and dialogs do not change. [M: `pak/images/ip/*` 10 rows or columns; `steam/nights_55xx.jpg`]

| # | Spec master (section 7) | Theme | Base | Light | Dark | Portrait glow | Corner emblem in the original (do not copy) | Tag |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 0 | Unicorn (Guide) | blue | #3f81e2 | #79a6eb | #1c3989 | #52dbff | knotwork | [M] |
| 1 | Gopher (Multiball) | green | #75b638 | #81c03c | #364e1a | #49f300 | leaves | [M] |
| 2 | Cat (Pyramid) | gold | #e89e19 | #dec32c | #7c400c | #ff8a00 | eye glyph | [M] |
| 3 | Alien (Space Blast) | purple | #a826eb | #d287f4 | #440d9c | #b516ff | planet and stars | [M] |
| 4 | Lobster (Flippers) | aqua | #11d8ef | #8ceafd | #0362a4 | #007eff | waves and fish | [M] |
| 5 | Pumpkin (Spooky Ball) | maroon with silver | #571023 | #8a4356 | #240513 | #aba6e6 | ghosts | [M] |
| 6 | Sunflower (Flower Power) | pink | #e26db6 | #fd9bd5 | #ba569d | #ff62fd | suns | [M] |
| 7 | Rabbit (Lucky Spin) | red | #d80801 | #d7817b | #770403 | #ff0005 | card suits | [M] |
| 8 | Wyvern (Fireball) | orange-gold | #f1bc00 | #f6c803 | #a85600 | #ffb400 | flames | [M] |
| 9 | Owl (Zen Ball) | silver | #dae7eb | #e0f2f6 | #627484 | #c5ddff | yin-yang | [M] |
| 10 | Squid (Lightning, expansion) | violet | #8550f8 | #9b66fc | #3d03b0 | not in files | | [M: `steam/nights_5572.jpg` edge samples] |

Base = bottom rail center (`B.jp2` row 5), light = rail highlight, dark = side pipe shadow (`L2.jp2`), glow = `Orbglow.jp2` center. Teggle draws its own emblems per master (an icon for the animal or power). [I]

## 14. Audio character

Measured from `pak/sounds/*.ogg` (durations by ffprobe, pitch by DFT) and named by `resources.xml`.

| Sound | Character | Tag |
| --- | --- | --- |
| Peg hit (`peghit`) | short bright bell or chime, 0.39 s, fundamental ≈ 523 Hz (C5) | [M] |
| Low peg hit (`peghit_low`) | same timbre one octave lower, ≈ 262 Hz (C4), 0.77 s | [M] |
| Long peg hits (`peghit_plus4b`, `peghit_plus_mega9`) | C5, 1.14 s, longer ring | [M] |
| Pitch rise per hit | fans report each further hit in a shot is higher; only one base pitch per file exists, so the engine would pitch-shift. Not verified (stream audio was mixed with voice) | [I; spec section 11 lists it as unverified] |
| Peg pop at shot end (`pegpop`) | 0.52 s, ≈ 385 Hz | [M] |
| UI tones (`tonelo`, `tone`, `tonehi`, `tonesuperhi`) | pure tones at 125, 250, 495, 985 Hz (octaves) | [M] |
| Cannon | `guncock` on aim, `cannonshot` (1.09 s) on fire | [S; M] |
| Free ball | `extraball` 1.9 s, `freeball2` 2.2 s jingles | [M] |
| Bucket | `buckethit` 0.94 s | [M] |
| Coin | `coin_spin` 1.30 s, `coin_freeball_denied` | [M] |
| UI | `button` 0.34 s click, `mouseoverV1` soft hover at 30% volume, `flip2` dialog move, `typing2` text typing, `scorecounter` count-up tick | [S: `resources.xml` volumes] |
| Fever | timpani roll into the hit, cymbal and gong, whooshes per letter, fireworks pops, rainbow shimmer, applause, then the music (classical, public domain composition per spec section 6) | [S] |
| Music | not in the unpacked set | [gap] |

## 15. Trademark exclusion list

Teggle must not use or closely imitate any of these. The binding Teggle names come from spec section 1 (naming table) and section 7 (masters).

| Original item | Kind | Teggle uses | Tag |
| --- | --- | --- | --- |
| "Peggle", "Peggle Deluxe", "Peggle Nights", "Peggle Extreme" and their logos (orange bubble wordmark, purple sub-label) | product names, wordmarks | "Teggle" in its own wordmark (spec section 1) | [M: `sc/3480_3748680859.jpg`] |
| PopCap, PopCap Games logo; EA | company marks | none | [S: `resources.xml` IMAGE_LOAD_POPCAP] |
| "Ball-O-Tron" label on the left column | device name baked into art | "Ball counter" (spec) with no plaque text or a Teggle icon | [M: `BallOtron.jp2`] |
| "FEVERMETER" plaque | baked label | "Fever meter" (spec), own plaque | [M] |
| "Extreme Fever", "Ultra Extreme Fever" titles and the flame-letter sprites | branded phrases and art | "Fever", "Full Clear Fever" (spec), own lettering | [M: `pak/images/game/UEF.jp2`] |
| "Fever Score" arched lettering art | branded art | own arch lettering | [M: `feverscore.gif`] |
| "Fever cam" tag | branded label | none, or a plain icon | [M: `FEVERCAM.jp2`] |
| "Instant Replay" button | branded UI | no replay button in MVP | [I] |
| Master names (unicorn Bjorn, the gopher, Kat Tut, Splork, Claude, Renfield, Tula, Warren, Lord Cinderbottom, Master Hu, the expansion's squid) and their character designs | names, characters | animal plus power names (spec section 7); new character art that does not resemble the originals (no blue-maned grinning unicorn, no pharaoh cat, etc.) | [S: `pak/characters/characters.cfg`] |
| The yin-yang trophy, laurel "MASTER" star badge, "ALL PEGS CLEARED" blue ribbon text, "ACED!" ribbon, "Peggle Institute" sign and certificate | emblems with branded text | own medals without the original text or emblems | [M: `pak/images/game/Masterbadge.jp2`, `blueribbon.jp2`, `pak/images/mainmenu/*`] |
| Coin faces ("First Bank of Pegopolis", winged and horned balls) | branded art | own coin design | [M: `coinheads.jp2`] |
| Smiling sun, rainbow-and-hill title scene, mascot on the main menu | branded scenes | own scenes | [M] |
| Baked power banner text | branded art | own banner text in Overload | [M: `Banners.jp2`] |
| The original background paintings and all other art, sounds, music recordings | copyrighted assets | Teggle's own (spec section 12 governs reuse) | |

Names to flag for the owner (spec section 7 and the style shot table are binding, so they are not changed here): the on-screen original also says "Multiball", "Space Blast", "Flippers", "Spooky Ball", "Flower Power", "Lucky Spin", "Fire Ball", "Long Shot", "Super Long Shot", "Off the Wall" and "Lucky Bounce". These are the same words the spec uses. [S: `Banners.jp2` text, fan wiki [Game Mechanics](https://peggle.fandom.com/wiki/Game_Mechanics)]

## 16. Teggle 16:9: layout and tokens

### 16.1 World, logical resolution, scaling

- **World units = original pixels.** Physics and level data keep the original numbers (peg radius 10, brick 20 thick).
- **World size:** 1066.67 x 600 (= 3200/3 x 600, exactly 16:9). Height stays 600, so every HUD element keeps its original size.
- **Logical render size:** 1600 x 900 (world x 1.5). Author sprites at 2x logical (3x world) for high-DPI screens: a 20-unit peg is 60 px in the source art.
- **Fit:** scale s = min(viewportW / 1066.67, viewportH / 600). Desktop fills the viewport; mobile runs fullscreen. Extra space on non-16:9 screens is filled with the theme's dark color, never black. [I]

### 16.2 Play screen boxes (world units, x, y, w, h)

Rule used: elements centered on the original x = 400 move to x = 533.33; elements anchored to the right edge move right by 266.67. [I]

| Element | Original (800x600) | Teggle (1066.67x600) |
| --- | --- | --- |
| Ball counter column | 0, 62, 86, 538 | 0, 62, 86, 538 |
| Fever meter column | 714, 62, 86, 538 | 980.67, 62, 86, 538 |
| Top-left corner | 0, 0, 130, 78 | 0, 0, 130, 78 |
| Top-right corner | 673, 0, 127, 78 | 939.67, 0, 127, 78 |
| Launcher housing | 312, 0, 176, 121 | 445.33, 0, 176, 121 |
| Portrait window center, radius | (400, 78), 42 | (533.33, 78), 42 |
| Cannon pivot, muzzle distance | (400, 78), 85 | (533.33, 78), 85 |
| Power banner | 343, 1, 114, 42 | 476.33, 1, 114, 42 |
| Left score window | 110, 0, 204, 46 | 110, 0, 335.33, 46 (stretched 9-slice up to the housing) |
| Right score window | 488, 0, 204, 45 | 621.33, 0, 335.33, 45 |
| Physics walls (inner faces) | x 75 and 725 | x 75 and 991.67 |
| Physics ceiling | y 49.4 | y 49.4 |
| Visible playfield opening | x 78..721 | x 78..988.67 |
| Background art box | 77, 52, 646, 543 | 77, 52, 912.67, 543 |
| Bucket travel (center x) | 141.5..661.5, cosine, amplitude 260, period 6.0 s | 141.5..925.17, amplitude 391.83; keep the peak speed of 272 units/s, so period = 2π·391.83/272 ≈ 9.05 s [I] |
| Bucket art center y | 580 | 580 |
| Fever hole centers x | 140.5, 272.5, 400.5, 527.5, 653.5 | 75 + 1.4103·(x − 75): 167.4, 353.6, 534.0, 713.2, 890.9 [I] |
| Fever hole and separator widths | hole 80, disc r 37 | scale widths by 1.4103 so the odds per bucket stay the same: hole 112.8, disc r 52.2 [I] |
| Shot total block center | (400, 216) | (533.33, 216) |
| Warnings center | (400, 152) | (533.33, 152) |
| Result dialog | 187, 147, 425, 305 | 320.33, 147, 425, 305 |

### 16.3 Playfield areas (for peg-count scaling)

| Measure | Original | Teggle | Ratio |
| --- | --- | --- | --- |
| Physics box (walls x ceiling to screen bottom) | 650 x 550.6 = 357,890 | 916.67 x 550.6 = 504,720 | 1.410 |
| Background art | 646 x 543 = 350,778 | 912.67 x 543 = 495,580 | 1.413 |

Use 1.41 when scaling the original object counts (85 to 134, median 103) to the wider board. [I from M]

Reused original backgrounds are 646 units wide and do not fill 912.67; they need side extensions or a new painting. [I]

### 16.4 Color tokens

```css
:root {
  /* pegs: body / rim / outline / highlight; lit core gradient */
  --peg-blue: #22409a;      --peg-blue-rim: #728abd;   --peg-blue-outline: #1b2646;
  --peg-orange: #d24429;    --peg-orange-rim: #be9056; --peg-orange-outline: #4a2d13;
  --peg-purple: #cd17c2;    --peg-purple-rim: #c063c5; --peg-purple-outline: #49194c;
  --peg-green: #0aaa02;     --peg-green-rim: #5bb351;  --peg-green-outline: #174214;
  --peg-highlight: #e1fbff;
  --peg-blue-lit: #ceffff;   --peg-blue-lit-edge: #326ed8;
  --peg-orange-lit: #fafabc; --peg-orange-lit-edge: #df7143;
  --peg-purple-lit: #fdf1fd; --peg-purple-lit-edge: #b351d2;
  --peg-green-lit: #f7ffde;  --peg-green-lit-edge: #44ab44;

  /* ball */
  --ball-sky: #6492b4; --ball-sky-light: #a3c6d6; --ball-gold: #987d24; --ball-rim: #774721;

  /* aim guide */
  --guide-dot: #6fcab7; --guide-dot-hot: #8bfeff;

  /* machine materials */
  --brass-hi: #ffefcd; --brass: #d1bc7b; --brass-mid: #c7a055; --brass-lo: #704727;
  --teal-lip: #74a4ae; --teal-lip-dark: #40808c;
  --counter-body: #006744; --counter-empty: #015146;
  --meter-off: #41080e; --meter-on: #ed9555; --meter-on-edge: #e24d09; --meter-groove: #3f142f;
  --tube-green: #8fffc9; --tube-green-edge: #35cd76;
  --tube-purple: #e995ff; --tube-purple-edge: #a632cb;
  --tube-yellow: #ffef77;

  /* panels */
  --panel: #25137f; --panel-scanline: #1d0f64; --panel-bevel: #47319e;
  --title-pill-top: #4157bc; --title-pill-mid: #0716e1; --title-pill-bottom: #095de3;
  --score-window-top: #4154ba; --score-window-mid: #0716e1; --score-window-bottom: #095de3;

  /* text */
  --text-score: #7decff; --text-score-low: #3f92fa; --text-score-outline: #0040c0;
  --text-label: #5cc5f8;
  --text-ball-count: #9bf633;
  --text-value: #f3e525;   /* dialog values, shot totals (#eff314) */
  --text-row-label: #6ce1e2;
  --text-stats: #d2c78d;
  --text-style-shot: #7ce47c;
  --text-bonus-pink: #dd83dc;
  --text-peg-value: #eee923;
  --text-warn-top: #fcfe03; --text-warn-bottom: #fc4c00;
  --text-button: #f9d054;
  --outline: #000000;

  /* buttons: normal, hover, down */
  --btn-orange: #b3360d; --btn-orange-lo: #f67f37;
  --btn-orange-hover: #e8790d; --btn-orange-hover-lo: #ffc937;
  --btn-orange-down: #f3d716; --btn-orange-down-lo: #fdff37;
  --btn-blue: #0207ea; --btn-blue-hover: #006eea; --btn-selected: #1cba53;
  --btn-rim: #79abb5;
  --gel-green: #0b5835; --gel-green-rim: #b9e728; --gel-green-hover: #a4ec29;
  --round-purple: #a900bc; --round-purple-hover: #ec28ca;

  /* rainbow (Fever arch and trail) */
  --rb-1: #e5280b; --rb-2: #fb9326; --rb-3: #ffed42; --rb-4: #98fe37;
  --rb-5: #28d8fc; --rb-6: #284bff; --rb-7: #6714ff;
}
```

Theme tokens: `--theme-base`, `--theme-light`, `--theme-dark`, `--theme-glow`, one set per master from section 13.

### 16.5 Type tokens (world units; multiply by s for screen)

| Token | Family | Weight | Size (cap height) | Effects |
| --- | --- | --- | --- | --- |
| `type.score` | Overload | regular (the face is single weight) | 22 | vertical gradient --text-score → --text-score-low, 1 unit outline --text-score-outline |
| `type.label` | Overload | | 9 | flat --text-label |
| `type.ballCount` | Overload | | 31 | gradient lime, 2 unit dark green glow |
| `type.pegValue` | Overload | | 9 | flat --text-peg-value, 1 unit black outline |
| `type.callout` | Overload | | 13 | flat color by event, 2 unit black outline, pop animation (9.3) |
| `type.shotTotal` | Overload | | 13 and 20 | --text-value, 2 unit black outline |
| `type.warning` | Overload | | 20 (settled), up to 95 | two-stop gradient --text-warn-top / --text-warn-bottom split at 55%, 3 unit black outline |
| `type.title` | Overload | | 18 | cyan gradient, blue outline (font1) |
| `type.rowLabel` / `type.rowValue` | Overload | | 13 / 12 | flat |
| `type.button` | Overload | | 10 | --text-button, dark shadow 50% |
| `type.body` | Exo 2 | 500 | 12 (x-height ≈ 7) | flat; optional 1 unit black outline over pictures |
| `type.bigNumber` | Overload (or Lilita One) | | 45 to 50 | hot gradient yellow → orange → red, 3 unit black outline |

### 16.6 Shape and motion tokens

| Token | Value |
| --- | --- |
| `radius.pill` | height / 2 |
| `radius.panel` | 20 (outer), 10 (inner body) |
| `radius.thumb` | 12 |
| `stroke.ui` | 1 unit black |
| `shadow.object` | offset (-4, 3), black 45%, no blur |
| `shadow.frameInner` | 20 unit soft falloff, alpha curve 1.0, 0.54, 0.26, 0 at 0, 5, 10, 20 units |
| `glow.peg` | additive radius 24, color = peg lit edge |
| `motion.popIn` | scale up to 1.85 (at 80 ms) → 1.0 (by 250 ms), hold 600 ms, fade 350 ms; start scale 1.0 [I] |
| `motion.dialogDrop` | from above the screen to rest in about 170 ms, slight bounce [I] |
| `motion.pegRemoveStep` | 42 ms between pegs |
| `motion.bucket` | cosine, 272 units/s peak |
| `motion.feverZoom` | 1.5x to 2.0x toward the ball, starting about 0.8 s before the final hit |

## 17. Gaps (not found or not verifiable)

- Ball collision radius, launch speed, gravity: not in any file read (the executable was not analyzed). Aim dots give v·Δt ≈ 17 px and g·Δt² ≈ 0.65 px per dot step, but Δt is unknown.
- Coin flip on-screen position and spin animation: not seen in any capture.
- Bucket catch, free ball arrival and peg value popup lifetimes: not measured in motion.
- Pitch rise per peg hit: asset pitches measured, the per-hit rise not verified.
- Fever music and menu music: not in the unpacked set.
- Exact slow-motion factor and zoom curve: video only at 6 fps; zoom measured at 1.5x to 2.0x in three frames.
- Master power effects in motion: only the Guide label, banners and portrait glow seen; others known from file names only.
- Font matches (Overload, Exo 2, Russo One, EB Garamond) were judged visually, not rendered side by side.
- Squid theme and Lightning power art: expansion only, not in the unpacked base-game files; one color sample from a screenshot.
- Blocked sources: MobyGames, Giant Bomb and the fan wiki image host returned bot challenges; YouTube downloads returned 403. Steam, the Internet Archive and the owner's files covered the need.

## Appendix A. Sources

### A.1 Owner's game files (`reference/peggle-2007/pak/`)

| Path | Used for |
| --- | --- |
| `properties/resources.xml` | resource names, font roles, sound names and volumes, animation frame counts |
| `fonts/*.txt`, `fonts/*.gif`, `fonts/*.png` | font identification, sizes, layer effects |
| `images/ip/*` | frame, HUD columns, score windows, housing, banners, themes |
| `images/interface/*` | tubes, meter segments, plunger, glows, frame shadow mask `backshadow_.jp2` |
| `images/game/*` | pegs, bricks, ball, guide, pulses, Fever art, coin, ribbons |
| `images/levels/*` | buckets, Fever holes and discs |
| `images/dialog/*`, `images/mainmenu/*`, `images/levelselect/*` | panels, buttons, menu and level select art |
| `levels/*.jp2`, `levels/*.dat`, `levels/_base.dat` | backgrounds, peg geometry statistics, walls, bucket and Fever bucket layout and motion |
| `characters/characters.cfg` | master names and power names (exclusion list) |
| `sounds/*.ogg` | durations and pitch |

### A.2 Screenshots (`reference/peggle-2007/steam/` and `steamcommunity/`)

All are the 2007 base game (Steam app 3480) or the 2008 expansion (Steam app 3540) on PC. Player screenshot pages are `https://steamcommunity.com/sharedfiles/filedetails/?id=<id>`; image files were taken from the app screenshot listings `https://steamcommunity.com/app/3480/screenshots/` and `https://steamcommunity.com/app/3540/screenshots/`.

| File | Shows | Source URL |
| --- | --- | --- |
| `steam/nights_5570.jpg` .. `nights_5581.jpg` | expansion gameplay, native 800x600, several themes | `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3540/0000005570.jpg` .. `0000005581.jpg` (via `https://store.steampowered.com/api/appdetails?appids=3540`) |
| `steam/deluxe_1531.jpg` .. `deluxe_1539.jpg` | base game gameplay, 1024x768 | `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3480/0000001531.jpg` .. `0000001539.jpg` |
| `steamcommunity/3480_1147918137.jpg` | gameplay, blue theme, lit pegs and bricks, style callouts, tubes, guide power | id 1147918137 |
| `steamcommunity/3480_3553221662.jpg` | gameplay, gold theme, angled aim guide, score windows | id 3553221662 |
| `steamcommunity/3480_3602694044.jpg` | straight-down aim, cannon, portrait | id 3602694044 |
| `steamcommunity/3480_3665728221.jpg` | purple theme, free ball orb, ball close-up, yellow tube | id 3665728221 |
| `steamcommunity/3480_3683943965.jpg` | level 1 for coordinate fitting | id 3683943965 |
| `steamcommunity/3480_2921694449.jpg` | shot total block with style points | id 2921694449 |
| `steamcommunity/3540_3541187657.jpg` | last-ball warning, lit pegs, meter labels | id 3541187657 |
| `steamcommunity/3540_3429393065.jpg` | 3-balls warning, pink theme, aim guide, ball count digit | id 3429393065 |
| `steamcommunity/3540_3785992381.jpg` | in-level tip dialog | id 3785992381 |
| `steamcommunity/3480_3775984283.jpg`, `3480_3775984119.jpg` | level complete dialog, Fever buckets, Fever score arch | ids 3775984283, 3775984119 |
| `steamcommunity/3480_3747589358.jpg` | level failed dialog | id 3747589358 |
| `steamcommunity/3480_3382329898.jpg` | stage complete dialog | id 3382329898 |
| `steamcommunity/3540_3796172572.jpg` | expansion level complete with portrait | id 3796172572 |
| `steamcommunity/3480_3780011104.jpg`, `3480_3779608488.jpg` | Fever title, full clear title | ids 3780011104, 3779608488 |
| `steamcommunity/3480_3781367685.jpg` .. `3480_3781367880.jpg` (13 files, 1280x800) | Fever burst sequence, zoom 2.0x | ids 3781367636 .. 3781367880 |
| `steamcommunity/3480_3764877689.jpg` | base game main menu (1600x1200 upscale) | id 3764877689 |
| `steamcommunity/3540_3780932673.jpg` | expansion main menu | id 3780932673 |
| `steamcommunity/3540_3729012195.jpg` | options dialog | id 3729012195 |
| `steamcommunity/3480_3472684678.jpg` | level select | id 3472684678 |
| `steamcommunity/3480_3575301845.jpg` | challenge list | id 3575301845 |
| `steamcommunity/3480_3762083037.jpg`, `3480_3793161026.jpg` | stage intro cards | ids 3762083037, 3793161026 |
| `steamcommunity/3480_3358174638.jpg` | stats screen | id 3358174638 |
| `steamcommunity/3480_3748680859.jpg` | title screen and wordmark | id 3748680859 |
| `steamcommunity/3540_125513396.jpg` | peg shadow measurement (player-made level, same renderer) | id 125513396 |

The folder holds 618 player screenshots in total; the ones above are those relied on.

### A.3 Video (`reference/peggle-2007/video/`)

| File | Content | Source |
| --- | --- | --- |
| `vivi_1780_90s.mp4`, `vivi_1800.png` | base game, level 1-5, 29:40 to 31:10 of the stream; aim, hits, removal, callouts, bucket motion | [archive.org item](https://archive.org/details/vividly-vivi-2024-07-16-first-time-peggle-so-like-ballss-gg-hoodie-peggle-deluxe-720p-50) |
| `vivi_1870_300s.mp4`, `fever_*.png` | 31:10 to 36:10: full Fever sequence, stage complete, stage intro card | same |

### A.4 Other

| Source | Used for |
| --- | --- |
| [PeggleEdit](https://github.com/IntelOrca/PeggleEdit): `interface.png`, `interface_collision.png`, `peg.png`, `brick.png`, `Level.cs`, `LevelReader.cs` and entry classes | playfield opening, level file format (ported to Python for parsing), draw offsets |
| [Typodermic public domain fonts](https://typodermicfonts.com/public-domain/), [DaFont: Overload](https://www.dafont.com/overload.font) | Overload license (CC0) |
| [Peggle fan wiki: Game Mechanics](https://peggle.fandom.com/wiki/Game_Mechanics) | names of meters and bonuses for the exclusion list |
