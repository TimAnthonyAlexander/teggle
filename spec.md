# Teggle: Product Spec

As of 2026-10-14.

## 1. Overview

Teggle is a pachinko-style shooter, played solo except in Duel. The player fires a ball from a cannon at the top of the screen into a board of about 100 pegs and must hit all 25 orange pegs within 10 balls. It is a private rebuild for personal play, not for publication.

**Reference product.** The rules follow the original 2007 PC game and its 2008 expansion as closely as the sources allow. Later sequels and mobile spin-offs changed several rules; where they differ, this spec follows the 2007/2008 version.

**Platform.** Web. The board is 16:9 (the original is 4:3). On mobile the game runs fullscreen in the browser; on desktop the board fills the viewport.

**Scope.** Everything is MVP unless marked post-MVP. Only Duel is post-MVP.

**Naming.** The original brand name and its branded terms are not used.

| Original concept | Teggle name |
| --- | --- |
| The game | Teggle |
| Ball counter on the left (glass tube device) | Ball counter |
| Moving catcher at the bottom | Free ball bucket |
| Score multiplier gauge on the right | Fever meter |
| End sequence after the last orange peg | Fever |
| Fever after every peg is cleared | Full Clear Fever |
| Ten character mentors with powers | Masters, named by animal and power |

**Evidence levels.**
- *Verified*: from the publisher's patent or from pages that were opened.
- *Unverified*: reported by fans, not confirmed.
- *Undocumented*: not found anywhere; listed in Open questions.

## 2. Core loop

The player wins by hitting all 25 orange pegs before the 10 balls (plus any free balls) run out. Otherwise the level restarts with a new random color assignment.

1. **Aim.** The cannon follows the pointer. The aim guide shows the first stretch of the path.
2. **Shoot.** The ball bounces through the board, and every peg it hits lights up. Hitting a green peg triggers the current master's power.
3. **Last orange hit?**
   - Yes: Fever starts immediately while the ball is still in play. The ball drops into one of 5 bonus buckets. Level won.
   - No: continue.
4. **Shot ends** when the ball leaves the bottom or lands in the bucket. All lit pegs are removed. Shot score and any free balls are added.
5. **Balls left?**
   - No: level lost. Retry with new random colors.
   - Yes: the purple peg moves to another blue peg. Back to step 1.

## 3. Pegs

Every level has the same color mix: 25 orange, 2 green, 1 purple per shot, and blue for everything else (*verified*, patent). The layout is fixed per level. The colors are assigned at random every time the level starts, including retries.

| Type | Count per level | Base value | Role |
| --- | --- | --- | --- |
| Orange | 25 | 100 | Win condition: all must be hit. Each hit advances the fever meter. |
| Blue | All remaining (57 to 106 in the campaign) | 10 | Filler and score. |
| Green | 2 (from campaign level 3) | 10 | Triggers the current master's power. |
| Purple | 1 per shot (from level 4) | 500 | Bonus peg. Moves to a different blue peg after every shot. |

**Shapes.** Each colored object is either a round peg or a brick.
- Bricks are straight or curved. Fan editor defaults: 30 long, 20 wide; curved bricks are defined by radius and sector angle. In the shipped levels straight bricks are mostly 35 long and all bricks are 20 wide (`docs/research/original-levels.md`).
- No source gives bricks a separate value, so they score like round pegs of the same color.
- Across the 55 base-game levels, 42% of colored objects are bricks. 17 levels use only round pegs and 5 use only bricks.

**Color assignment.**
- The designer flags which pegs may become orange ("can be orange"). Hard-to-reach pegs are excluded (*verified*, fan editor docs).
- The game picks the orange pegs at random from the flagged set. It then turns 2 of the remaining blue pegs green and 1 purple. Whether green and purple are also limited to flagged pegs is *undocumented*.
- On the first campaign play of some levels, the designer places the green pegs. In Quick Play they are random.
- Challenges can raise the orange count to 35, 45 or 55. A level used in a 55-orange challenge therefore needs at least 55 flagged pegs, plus at least 3 more for green and purple.
- The fever meter stays frozen until 25 orange pegs remain.

**Hit state.** A hit peg lights up and stays on the board until the ball leaves play. Then all lit pegs disappear together. The ball can bounce off a lit peg again during the same shot.

**Non-scoring objects.** Solid shapes that never break: blockers, rods (thin barriers), polygons, bumpers, and, from level 48, portals that move the ball elsewhere on the board.

## 4. Balls, cannon and bucket

The player starts each level with 10 balls. More come only from the bucket, high-scoring shots, or a coin flip after a shot that hits nothing (*verified*, patent).

**Cannon and aiming.**
- Fixed position at top center: pivot at (325, 30) on the 650 x 560 original board. The angle follows the pointer, up to 97° either side of straight down; the barrel turns at up to 0.2 rad per tick (*verified*, decompiled code).
- On desktop the original also uses the mouse wheel (0.1° per notch) or arrow keys for fine aim. Touch equivalents are in section 14.1.
- The aim guide shows the first stretch of the curved path. It shows no bounces unless the Guide power is active. Maximum length 40, or 80 with the Guide power; the unit is unknown (*verified*, decompiled code).
- Launch speed is constant and the path curves under gravity: 4 px/tick (400 px/s) launch, 0.05 px/tick² (500 px/s²) gravity, speed capped at 15 px/tick (*verified*, decompiled code). The simulation runs at 100 ticks per second.

**Ball counter.** Shows the balls left, with warnings at 3, 2 and 1. Its glass tubes fill with green light during a shot and reach the top at 25,000 shot points.

**Free balls.**

| Source | Rule | Gain |
| --- | --- | --- |
| Bucket catch | Ball lands in the moving bucket | +1 |
| Shot score 25,000 | First threshold in one shot | +1 |
| Shot score 75,000 | Second threshold | +1 |
| Shot score 125,000 | Third threshold | +1 |
| Coin flip | Shot hits zero pegs; a coin spins | +1 on a win; 50/50 (section 14.1) |

Style points do not count toward the thresholds. Multiball spawns and the bucket can stack with the thresholds; fans report up to 6 free balls from one shot (*unverified*).

**Free ball bucket.** Slides left and right along the bottom and slows to a stop at each end; fans time one full cycle at about 6 s (*unverified*). Holding the right mouse button between shots runs the whole game 8x faster, which is what speeds up the bucket (*verified*, decompiled code); the touch equivalent is in section 14.1. During Fever the five Fever buckets replace it. Bucket width and the Fever bucket layout live in a base level that is not public (*undocumented*).

## 5. Scoring

A shot's score is the sum of the hit pegs' values multiplied by the number of pegs hit (*verified*, patent).

```
shot score = (v1 + v2 + ... + vn) * n
```

- Patent example: 9 pegs whose values add up to 850 give 7,650 points.
- Style points are added on top and are not multiplied.
- Whether a multiplier step reached during a shot raises the value of pegs hit later in the same shot is *undocumented*.

**Fever meter.** Hitting orange pegs raises a multiplier that applies to every peg type.

| Orange hit | Orange left | Multiplier | Blue / green | Orange | Purple |
| --- | --- | --- | --- | --- | --- |
| 0 to 9 | 25 to 16 | x1 | 10 | 100 | 500 |
| 10 to 14 | 15 to 11 | x2 | 20 | 200 | 1,000 |
| 15 to 18 | 10 to 7 | x3 | 30 | 300 | 1,500 |
| 19 to 21 | 6 to 4 | x5 | 50 | 500 | 2,500 |
| 22 to 24 | 3 to 1 | x10 | 100 | 1,000 | 5,000 |
| Fever | 0 | fixed | 1,000 | none left | 10,000 |

**Level-end bonuses.**
- Each unused ball: 10,000.
- Fever bucket: 10,000 to 100,000 (section 6).
- Campaign clear bonus: 1st try 100,000; 2nd try 50,000; 3rd try 25,000; later tries 0.

**Style shots.** Values are for normal play; Duel values are lower.

| Style shot | Trigger | Points |
| --- | --- | --- |
| Bucket Bounce | Ball goes from exactly one peg straight into the bucket | 5,000 |
| Long Shot | Hits a non-blue peg, travels about 1/3 of the screen width, then hits another non-blue peg | 25,000 |
| Super Long Shot | Same, about 2/3 of the screen width | 50,000 |
| Double Long Shot | A third non-blue peg chained after a long shot | 25,000 |
| Off the Wall (expansion only) | Bounces off a wall, travels about 1/5 of the width, hits a non-blue peg | 25,000 |
| Bucket Kick | Bounces off the bucket rim, then hits the last orange peg | 25,000 |
| Lucky Bounce | Bounces off the bucket at least 1/4 of the screen height, then lands in the bucket | 25,000 |
| Bucket Streak | 5 shots in a row end in the bucket | 25,000 |
| Big Bucket Streak | 10 in a row | 100,000 |
| Long Slide | Ball slides along 12 pegs | 50,000 |
| Orange Rush | Many orange pegs in one shot (table below) | 50,000 |
| Clean Finish | Hits a peg, then the last orange peg, then the peg that clears the whole board | 50,000 |
| Double Power | Both green pegs in one shot | 25,000 |

Orange Rush threshold, by orange pegs left before the shot:

| Orange left | Must hit in one shot |
| --- | --- |
| 21 or more | 10 |
| 16 to 20 | 9 |
| 10 to 15 | 8 |
| 9 | 7 |
| 8 | 6 |
| 6 to 7 | 5 |
| 5 | 4 |

There are also master-specific style shots. These are fan wiki values; the exact triggers are undocumented.

| Master-specific shot | Points |
| --- | --- |
| Multiball extras | 25,000 |
| Three free balls in one shot | 100,000 |
| Bucket-power catch | 10,000 |
| Flipper tricks | 25,000 |
| Fireball tricks | 25,000 |
| Lucky-spin tricks | 10,000 |
| Lightning tricks | 25,000 |

## 6. Fever

Hitting the last orange peg starts Fever: the level is won, the shot continues, and the ball's final drop lands in one of five bonus buckets worth up to 100,000 (*verified*, patent).

1. As the ball approaches the last orange peg, the game goes into slow motion and zooms toward the ball. Slow-motion factor, zoom and trigger distance are *undocumented*.
2. On the hit, "Fever" appears and Beethoven's "Ode to Joy" plays (public domain). Fireworks and rainbow effects play over the board.
3. The ball keeps bouncing. Each remaining blue or green peg it hits is worth 1,000, purple 10,000.
4. Five fixed buckets replace the free ball bucket.
5. When the ball drops in, the bucket value is added and each remaining ball converts to 10,000.
6. If every peg on the board has been cleared, Full Clear Fever applies: all five buckets pay 100,000, and the level gets an "all pegs cleared" mark.

| Bucket | Left | Left-center | Center | Right-center | Right |
| --- | --- | --- | --- | --- | --- |
| Normal | 10,000 | 50,000 | 100,000 | 50,000 | 10,000 |
| Full Clear | 100,000 | 100,000 | 100,000 | 100,000 | 100,000 |
| Duel (post-MVP) | 5,000 | 25,000 | 50,000 | 25,000 | 5,000 |

The original designers made Fever random on purpose, after pachinko "fever" modes, and chose the last orange peg as its trigger (PC Gamer making-of).

## 7. Masters and powers

Each campaign stage belongs to one master, and that master's power is what the 2 green pegs trigger. The base game has 10 masters; the expansion adds 1.

| Stage | Master | Power | Effect | Duration |
| --- | --- | --- | --- | --- |
| 1 | Unicorn | Guide | Aim guide shows the full path through the first bounce. Nudging the aim near a peg edge changes the bounce angle. | 3 shots, starting with the next |
| 2 | Gopher | Multiball | A second ball spawns from the green peg that was hit. | Current shot |
| 3 | Cat | Pyramid | Bucket turns into a wider pyramid with long sloped edges. | 5 shots, starting now |
| 4 | Alien | Space Blast | Lights every peg within a large radius of the green peg, "e.g., four pegs wide" (patent). | Current shot |
| 5 | Lobster | Flippers | Two pinball flippers in the bottom corners, controlled by the player. | 3 shots, starting now |
| 6 | Pumpkin | Spooky Ball | When the ball falls out the bottom, it reappears at the top once. | Current shot |
| 7 | Sunflower | Flower Power | Lights the nearest one fifth (rounded up) of the remaining orange pegs (patent). | Current shot |
| 8 | Rabbit | Lucky Spin | A wheel picks one of: bigger ball hitbox, triple score, a random other power, an extra ball. Odds undocumented. | Hitbox and triple score: 2 shots |
| 9 | Wyvern | Fireball | Ball burns through pegs without bouncing; a metal dome covers the bucket. | Next shot |
| 10 | Owl | Zen Ball | The game replaces the player's shot with a better one found by testing nearby angles. Search method undocumented. | Next shot |
| expansion 11 | Squid | Lightning | A grounding rod appears above the bucket. Lightning runs from the first peg hit to the rod and lights the pegs along that line. | Next shot |

- Hitting both green pegs in one shot gives a 25,000 style bonus.
- What a green hit does while the same power is still running is *undocumented*.
- In the final stage (Master levels) the player picks any master before each level.
- The expansion's stage order: Unicorn, Gopher, Pumpkin, Cat, Alien, Lobster, Sunflower, Wyvern, Rabbit, Owl, Squid, Master levels.
- The Zen Ball shows the original already ran a shot search at runtime (relevant to section 13).

## 8. Campaign, challenges and modes

| | Base game | Expansion |
| --- | --- | --- |
| Campaign levels | 55 | 60 |
| Stages | 11 of 5 | 12 of 5 |
| Challenges | 75 | 65 per fan wiki; 60 per publisher |

Teggle follows the base game (section 14.1). The data below is for the base game.

**Campaign structure (base game).**
- Stages 1 to 10: one master each, 5 levels each.
- Stage 11: Master levels, any master selectable.
- Green pegs appear from level 3 and purple from level 4, so levels 1 and 2 have only blue and orange.
- Failing a level restarts it with a new random color assignment.

| Stage | Master | Avg objects | Range | Documented features |
| --- | --- | --- | --- | --- |
| 1 | Unicorn | 97 | 93 to 102 | First level introduces ramps and blockers; 3 of 5 levels are round pegs only |
| 2 | Gopher | 107 | 99 to 116 | Spiral layout; brick-heavy last level |
| 3 | Cat | 102 | 100 to 108 | Pegs in an infinity shape that spin in a loop |
| 4 | Alien | 105 | 100 to 114 | Mostly bricks; last level 24 pegs and 90 bricks |
| 5 | Lobster | 105 | 100 to 119 | Moving elements, a moving fish shape |
| 6 | Pumpkin | 114 | 100 to 133 | Spiderweb layout with 123 round pegs |
| 7 | Sunflower | 99 | 90 to 110 | Rotating windmill bricks; floating circles; moving ground and brick wheels; two levels bricks only |
| 8 | Rabbit | 103 | 94 to 113 | Brick-heavy throughout |
| 9 | Wyvern | 109 | 103 to 126 | One level bricks only (108); one round pegs only (103) |
| 10 | Owl | 113 | 87 to 132 | Portals introduced; wiggling double-helix strands |
| 11 | Master | 117 | 85 to 134 | Two levels of 134 bricks; spinning double helix |

Objects = round pegs plus bricks. Per-level counts are in section 15.

**Challenges (base game, 75 in 15 groups of 5).**

| Group type | Goal |
| --- | --- |
| More orange | Clear 35, 45 or 55 orange pegs on a named level |
| Score cup | Beat 300k, 350k or 400k on a named level |
| Full clear | Clear every peg on a named level (two groups) |
| Duel (post-MVP) | Beat a named master on a named level at Normal, Hard or Master AI |
| Multilevel | Beat 2 to 6 random levels in a row |
| Three-level duel (post-MVP) | Cumulative score over 3 levels, 5 difficulty steps |
| Multilevel score | 750k to 1M over three named levels |
| Insane | 2 balls left; 1 ball; 3 levels with 10 balls total; 750k on any level; 10 random levels in a row |

The expansion adds challenge types:
- fewer balls (7 down to 3)
- score in 7 shots (225k to 325k)
- power-restricted levels
- stay-under-a-score goals

In the original, challenges start unlocking after stage 3 and are fully unlocked after the campaign. Teggle opens each challenge once the player has beaten its levels in the Adventure (changed 2026-10-20; see "Decided in the challenges" in 14.2).

**Other modes.**
- **Quick Play:** replay any completed level, with green pegs always random. A marker shows levels that were fully cleared.
- **Duel (post-MVP):**
  - Two players alternate shots on one board, with 5 or 6 balls each depending on the original platform.
  - Only one green peg at a time, and no coin-flip free balls.
  - A shot that misses all orange pegs costs 25% of the shooter's score.
  - Fever buckets are lower.
  - The Normal, Hard and Master AI opponents can be the noisy greedy agent (section 13) at three error sizes. This makes Duel depend on the self-play agents.
- **Expansion extras:** a target "ace" score per level, and a trophy room with 4 main trophies: finish the campaign, finish the challenges, clear all pegs on all levels, ace all levels.

## 9. Level design

A campaign level is a hand-drawn background picture with 85 to 134 colored objects laid out to match it (median 103, mean 106), plus optional solid shapes and moving parts (*verified*, fan wiki infoboxes and fan editor).

**Original board.**
- Game window 800 x 600. The board is 650 x 560, drawn at (75, 40) in the window; x points right, y down (*verified*, decompiled code; the fan editor's (73, 43) is off by a few pixels). The ball counter sits left of the board, the fever meter right.
- Standard round peg radius 10 px, ball radius 6 px (*verified*, decompiled code). No source measures every shipped peg.
- Bricks default to 30 x 20 px. Curved bricks are arc segments built from 4 curve points by default, inner radius 35.
- Walls, ceiling, the free ball bucket and the Fever buckets are not in the level files; they live in a base level that is not public.
- Teggle's board is 16:9 (section 1).
- Full technical reference: `docs/research/original-tech.md`.

**Element catalog (from the fan editor's reading of the level files).**

| Element | Scores | Purpose |
| --- | --- | --- |
| Round peg | Yes | Main colored object |
| Brick (straight or curved) | Yes | Walls, arcs, letters, outlines |
| Circle (solid) | No | Round obstacle, bumper, or invisible anchor for movement |
| Polygon | No | Solid shapes, ramps, blockers |
| Rod | No | Thin line barrier between two points |
| Teleport | No | Moves the ball elsewhere, or ends the shot |
| Emitter | No | Particle effects |

Every element has these properties:
- collision on or off
- visibility
- draw layer
- a bounciness coefficient that replaces the default (0 = default: 0.9 on circles, 0.82 on lines, bricks and polygons)
- a "rolliness" threshold that replaces the default (0 = default: 1.0 on circles, 1.4 on lines and bricks); a contact at or below it slides instead of bouncing

The fan editor calls the last two multipliers; the decompiled code shows they are absolute overrides (*verified*).

Pegs carry two designer flags:
- **can be orange**: cleared on pegs that are hard to reach.
- **quick disappear**: the peg vanishes soon after being hit. Used where a ball would otherwise get stuck, for example at the bottom of an arc.

**Movement.** Any element can move.

Movement types:
- vertical or horizontal back-and-forth
- circle
- horizontal or vertical figure-eight
- horizontal or vertical arc
- rotate in place, rotate back and forth
- wrap around the screen vertically or horizontally
- rotate around a circle ("retrace a circle" is expansion-only)

Parameters:
- period in ticks of 1/100 s
- two radii, phase, angle
- two pause points with durations
- reverse, rotation offset

The fan editor shows a speed in px/s, but that is derived, not stored. Exact movement math: `docs/research/original-tech.md` section 3.

Movements can be nested: an element moves on an anchor that itself moves.

**Design principles stated by the original designers.**
- Static round pegs replaced an early prototype with 100 rotating crosses, because round pegs bounce predictably.
- The goal changed from "clear all pegs" to "hit 25 random orange pegs", so the last target is not one hard-to-reach peg.
- The board opens up as pegs disappear, so late shots reach areas that were blocked early.
- Luck is part of the design on purpose, mainly at the end of a level.

**Level archetypes (generator templates).**

| Archetype | Description | Example |
| --- | --- | --- |
| Picture outline | Pegs and bricks trace an object from the background | Most levels |
| Plinko grid | Staggered rows of round pegs | Stage 2, level 1 (112 pegs) |
| Spiral | Pegs along a spiral arm | Stage 2, level 4 |
| Rotating group | Pegs on a wheel or windmill that rotates | Stage 3 level 2, stage 7 level 1 |
| Brick architecture | Walls, arches, stairs of bricks | Stage 9 level 4 (108 bricks) |
| Moving platforms | Groups that slide or float | Stage 7 levels 3 and 4 |
| Portal level | Teleports link areas | Stage 10 level 3 |
| Helix | Two strands that wiggle or spin | Stage 10 level 5, stage 11 level 5 |
| Web / ring | Concentric rings and spokes | Stage 6 level 2 (123 pegs) |

## 10. Quirks and edge cases

Quirks backed by the patent, Wikipedia or the fan editor are requirements. Unverified quirks are open decisions.

| Quirk | Behavior in the original | Source | Status |
| --- | --- | --- | --- |
| Purple peg moves | After every shot the purple peg turns back to blue (if not hit) and a different blue peg turns purple | Patent, Wikipedia | Requirement |
| Colors reroll on retry | Orange, green and purple positions are random on every attempt | Patent | Requirement |
| Seeded greens | First campaign play of some levels has designer-placed green pegs; Quick Play randomizes them | Fan wiki | Requirement |
| Stuck ball | If the ball stops making progress on pegs, the game removes a lit peg it touches. Timeout undocumented | Patent, Wikipedia | Requirement |
| Quick disappear pegs | Some pegs vanish soon after the hit instead of at shot end | Fan editor docs | Requirement |
| Lit pegs persist | Hit pegs stay as obstacles until the shot ends | Patent | Requirement |
| Zero-hit coin flip | A shot that hits no peg spins a coin for a possible free ball | Patent | Requirement |
| Coin-flip weighting | Odds reportedly favor the player more when few balls are left | Fan wiki | Not implemented (14.1) |
| Bucket speed-up | Holding the right mouse button between shots speeds up the bucket | Patent | Requirement |
| Multiplier freeze | With more than 25 orange pegs, the fever meter does not move until 25 remain | Fan wiki | Requirement |
| Thresholds exclude style | The 25k / 75k / 125k free-ball thresholds use the shot score only | Patent | Requirement |
| Last-ball assist | On first campaign play with 2 or fewer balls left, the game reportedly nudges the shot toward a better result | Fan document | Not implemented (14.1) |
| Long Shot bug | Long Shot reportedly only counts when the non-blue pegs are the first pegs hit | Fan wiki | Not implemented (14.1) |
| Fever slow motion | Time slows and the camera zooms only when the ball is about to hit the last orange peg | Wikipedia | Requirement; parameters undocumented |
| Win is immediate | Hitting the last orange peg wins, even on the last ball in play | Patent | Requirement |
| Loss | Running out of balls with orange pegs left restarts the level | Patent, Wikipedia | Requirement |

## 11. Audio and visual feedback

Documented:
- Lit pegs glow until the shot ends, then pop one at a time, every clamp(8 - remaining/10, 1, 5) ticks (decompiled code).
- Peg hit sound rises in pitch with each further hit in one shot (patent).
- Ball counter tubes fill with green light as the shot score grows, reaching the top at 25,000.
- The fever meter fills with each orange hit and steps up at 10, 15, 19 and 22 orange hits.
- Style shot banners name the bonus.
- Fever: slow motion, zoom on the ball, "Fever" text, "Ode to Joy", then the five buckets.
- The coin flip shows a spinning coin.
- Low-ball warning at 3, 2 and 1 balls.

Unverified:
- Score popups at each hit peg, and a shot total when the ball leaves play.
- The master character beside the board reacts to shots and powers.

## 12. Art and audio sourcing

No paid service is ever used, including paid image generation (14.1). Pictures are never drawn in code: backgrounds and master characters are existing images found on the web. Teggle is private, so licenses do not matter; each image's source URL is recorded in the asset manifest. The original game's own art is never used.

- **Backgrounds:** found images (painted or cartoon illustrations preferred, photos where they fit), cropped and graded so pegs stay readable. The original's backgrounds are not used.
- **Master characters, sounds, music:** see section 14.1.

**Background line editor.** Picture-outline levels are built from lines drawn over a background.

1. **Input.** Tim draws lines and curves over the background. Claude Code can also derive lines from the background image. Both produce the same data: vector paths.
2. **Lines only guide the shape.** The generator decides spacing and placement along each line; objects do not have to sit exactly on it.
3. **Line to bricks.** Each line is smoothed, then turned into a chain of bricks: straight bricks where the smoothed line is straight, curved bricks where it bends.
4. **Rest of the level.** The generator builds the rest of the board around the lines and runs the validity, reachability and stuck checks.
5. **Manual edits.** Single pegs and bricks of a generated level can be edited afterwards in the same editor.
6. **Location (tentative).** A hidden part of the game web app. Export writes the level file that the web app downloads and reads at play time.

## 13. Requirement: level generation and self-play

Teggle must generate levels automatically that match the original campaign's composition.
- **Must-have:** the generator plus a headless physics simulation, because the reachability and stuck checks need simulated shots.
- **Stretch goal:** self-play agents, difficulty metrics and calibration, built on that simulation.

No prior generator or AI player for this genre was found, apart from a 40-peg random placer in the fan editor.

### 13.1 Output

A level built from the element catalog in section 9: round pegs, bricks, solid shapes, rods, teleports and movement definitions, plus the per-peg flags "can be orange" and "quick disappear". The generator does not assign colors. Colors are assigned at random at level start, as in the original.

### 13.2 Composition targets (from the 55 base-game levels)

| Property | Target | Source |
| --- | --- | --- |
| Colored objects per level | 85 to 134, median 103 on the 4:3 board; scaled by playfield area for 16:9 (14.1) | Fan wiki infoboxes |
| Difficulty ramp | Stage averages rise from about 97 (stage 1) to about 117 (stage 11) | Same data |
| Brick share across a set | About 42% | Same data |
| Round pegs only | About 1 level in 3 (17 of 55) | Same data |
| Bricks only | About 1 level in 11 (5 of 55) | Same data |
| Orange per level | 25, chosen at runtime from pegs flagged "can be orange" | Patent, fan editor |
| Green / purple | 2 / 1, chosen at runtime | Patent |
| Balls | 10 | Patent |

The flagged set must be larger than the orange count it serves: 25 normally, up to 55 in challenges. Otherwise every attempt has the same orange pegs. Measured in the original files: the median level flags every scoring object, the lowest flags 53%, and none flags fewer than 64 (`docs/research/original-levels.md`).

### 13.3 Generator requirements

1. **Templates.** Generate from the archetypes in section 9: picture outline (from editor lines, section 12), plinko grid, spiral, rings and spokes, brick architecture, rotating group, moving platform, helix, portal pairs. Two templates can be mixed in one level.
2. **Validity checks before simulation.**
   - No overlapping objects.
   - No object outside the board.
   - A minimum gap between objects, so the ball cannot wedge between two pegs. The gap value is set by testing.
3. **Reachability.** Every peg flagged "can be orange" must be hit at least once across simulated shots. One angle sweep on the full board is not enough:
   - Some pegs are shielded by other pegs and only become reachable after those disappear. The sweep therefore runs on a sequence of board states: simulate a shot, remove the pegs it hit, sweep again, repeated over many such playouts.
   - On levels with moving parts, the board differs at each launch time. The sweep therefore covers launch times across one full period of every movement on the level. Where the movements have no common period, launch times are sampled.
   - Pegs never hit under these conditions are either moved or have their "can be orange" flag removed.
4. **Stuck pockets.** Any spot where simulated balls come to rest is removed, or its pegs get "quick disappear", as the original designers did at arc bottoms.
5. **Seeded.** Every level can be reproduced from a seed and a generator version.
6. **Moving parts (optional).** Use the original's movement types and parameters (section 9).

### 13.4 Deterministic simulation

The live game runs in any browser engine (for example Safari's JavaScriptCore or Chrome's V8). Self-play runs headless (for example V8 in Node). A replay of a live shot must give the same result in both.

**Why this needs a requirement.** ECMA-262 leaves Math.sin, Math.cos, Math.atan2, Math.exp and similar functions implementation-approximated, so their results can differ between engines. Checked against the spec text and measured on 2026-10-14 (section 14.1).

**Requirement.** The physics step and anything feeding it must produce bit-identical results across engines. Ways to meet it:
- Fixed timestep, with no dependence on frame time.
- Store and replay a shot as its launch direction vector, not as an angle that each side converts with sin and cos.
- Keep engine-approximated Math functions out of the simulation step. Where trigonometry is needed (moving parts, curved bricks), use a deterministic implementation.
- Or run the physics as WebAssembly. Rapier publishes deterministic npm builds (for example `@dimforge/rapier3d-deterministic`). Whether a 2D deterministic build exists, and what it guarantees across browsers, was not checked.

**Acceptance.** The same level, seed and launch vector give identical hit sequences and scores in every target browser and in the headless runner.

### 13.5 Self-play (stretch)

1. **Agent tiers.**
   - **Random:** uniform random angle. Sets the floor of difficulty.
   - **Greedy search:** tries many angles, simulates each, and plays the one with the most orange hits, breaking ties by score. This is roughly what the Zen Ball does for one shot.
   - **Noisy greedy:** greedy search plus random error on the chosen angle. The error size is the skill setting; the same method is used in published difficulty research on Flappy Bird.
2. **Re-randomized runs.** Each level is played many times, each with a new random color assignment, because the original rerolls colors on every attempt.
3. **Full rules in simulation.** Bucket, free-ball thresholds, coin flip, stuck-ball removal, and powers on green pegs.

**Metrics per level.**

| Metric | Meaning |
| --- | --- |
| Clear rate per agent tier | Share of runs that hit all 25 orange within the available balls |
| Balls used | Distribution of balls needed when cleared |
| Free balls per run | Bucket, threshold and coin-flip balls earned |
| Orange coverage | Share of flagged pegs hit at least once across all runs |
| Stuck events | Count of stuck-ball removals per run |
| Score distribution | Final score, Fever bucket hit, full-clear rate |

**Calibration and acceptance.** No published clear rates exist for the original campaign, so calibration uses Tim's own play:
1. Play a set of levels by hand and record clears and balls used.
2. Set the noisy agent's error so its clear rate matches on those levels. Published work on Candy Crush reached a mean absolute error of 4% to 7% between agent and player success rates. That is a comparison point, not a promise for this genre.
3. Accept a generated level when all of these hold:
   - its noisy-agent clear rate falls in the band chosen for its stage
   - orange coverage is complete
   - stuck events are near zero

Self-play gives an estimate, not a proof. As the Angry Birds generator research noted, an agent can show that a level is clearable but cannot prove that it is impossible.

### 13.6 Phases

| Phase | Delivers | Done when |
| --- | --- | --- |
| 1. Generator (must-have) | Template-based levels with validity checks | Levels load, play, match the composition targets, and pass the reachability and stuck checks |
| 2. Simulation (must-have) | Headless deterministic physics with full rules | A replay of a live shot gives the same result in every target browser and headless |
| 3. Agents and metrics (stretch) | Random, greedy and noisy greedy agents; a metric report per level | The report runs on a batch of generated levels |
| 4. Calibration (stretch) | Agent error tuned to Tim's play | Agent and Tim's clear rates are close on the test set |
| 5. Search loop (stretch) | Generate, evaluate, mutate, keep the best | The generator produces levels inside the target bands without hand editing |

## 14. Decisions and open questions

### 14.1 Decisions

Decided 2026-10-14 unless dated otherwise. Where a decision conflicts with an earlier section, the decision wins.

| Topic | Decision |
| --- | --- |
| Campaign | Base game: 55 levels, 10 masters, 75 challenges (Duel ones post-MVP). Expansion content is out of scope: the Squid, Off the Wall, ace scores, the trophy room. |
| Look | The 2007 original's visual and UI language, with none of its trademarks, names, logos or character designs. The guide is `docs/design/visual-language.md`. |
| Language | English only. |
| Hidden assists | None. No coin-flip weighting, no last-ball assist, no Long Shot bug. |
| Coin flip | A shot that hits no peg flips a coin: 50/50, and on a win the ball returns to the stock. |
| 16:9 density | Object counts scale by the ratio of Teggle's playfield area to the original's. |
| 16:9 layout | World units are original pixels. The screen is 1066.67 x 600 world units (exactly 16:9), rendered at a logical 1600 x 900. The board is 916 x 560, versus the original's 650 x 560: ratio 1.409, so campaign object counts become about 120 to 189 (median 145). HUD columns keep their original size. Full layout: `docs/design/visual-language.md` section 16. |
| Stack | TypeScript, Vite, Canvas 2D, Vitest, Playwright. No backend. Progress is stored in the browser. |
| Physics | Teggle's own deterministic engine in TypeScript (section 13.4). It ports the original's constants and order of operations from the decompiled code: 100 ticks per second, swept movement per tick, the collision responses in `docs/research/original-tech.md` section 4. Bit-matching the original is not a goal; it differed between its own display modes. No WASM engine. |
| Determinism basis | Verified against the ECMA-262 text: `Math.sin`, `cos`, `atan2`, `exp`, `pow`, `hypot` and `**` are implementation-approximated; `Math.sqrt`, `round`, `abs`, `imul` and basic arithmetic are exact. Measured: native sin/cos/atan2 over 24,000 inputs give different bits in V8 (Node) and JavaScriptCore (Bun); Teggle's ports in `src/core/dmath.ts` give identical bits. On 2026-10-15 Chromium, WebKit and Firefox gave Node's physics, rules and power digests bit for bit and replayed attempts with every power recorded in Node identically (`npm run test:browsers`). |
| Target browsers | Chromium, WebKit (Safari) and Firefox, plus Node for headless runs. |
| Mobile orientation | Landscape. Portrait shows a prompt to rotate. |
| Touch controls | The cannon points at the finger and follows it while it is down; a tap fires (changed 2026-10-17 from a reduced-rate fine-aim drag). Bucket speed-up by holding an on-screen button between shots. |
| Lines in the editor | A line produces either bricks or round pegs, chosen per line. |
| Art and audio sources | No paid service is ever used, including paid image generation (decided 2026-10-15). Backgrounds and master characters are existing images found on the web, never drawn in code; Teggle is private, so licenses do not matter, but every source URL is recorded. Sound effects are synthesized. "Ode to Joy" is synthesized from the public-domain score. Every asset's source is recorded in an asset manifest. |
| Undocumented constants | Set by tuning and recorded in section 14.2 as they are chosen. |
| Orange pegs | Decided 2026-10-15 after play: the 16:9 board was far harder than the original. Balls stay at 10 and the levels stay as designed; a level has 20 orange pegs instead of 25, drawn closer to the shooter and closer together. The fever meter and Orange Rush scale to the orange count. Challenges with more orange (26, 27 or 30 for the original's 35, 45 or 55; changed 2026-10-17, see "Decided in the challenges") keep the original's rules. Details and measurements in 14.2. |
| The original's levels | Decided 2026-10-20 at the user's request, an exception to the naming and art rules (the Look row, section 12): the original's 55 campaign levels are playable in Quick Play's Original section with their original names and pictures, committed under `public/original/` (`npm run original:import` converts the owner's copy). Each plays on its own 650 x 560 board in the original's 800-wide 4:3 frame, centered on the 16:9 screen with plain bars at the screen's edges (the machine's sides move in with the board), with the original's 25 orange pegs drawn uniformly and the chosen master; every level is open, and its scores are kept apart from Teggle's levels. Teggle's own levels look and play as before. Details in 14.2. |

### 14.2 Rules not documented in any source

Each is decided during implementation and its value recorded here.

- Whether green and purple pegs must come from pegs flagged "can be orange"
- Whether a multiplier step during a shot raises the value of pegs hit later in that same shot
- Unit of the aim guide length (the length is 40, or 80 with Guide)
- Stuck-ball timeout, and which peg is removed first
- Fever zoom and trigger distance (slow motion defaults to 0.25x in the decompiled code)
- Exact style-shot detection rules (how Long Shot distance is measured, what counts as a slide), including the master-specific ones. Settled: the rules engine block and the power style shots block below.

Measured from the owner's copy of the original on 2026-10-14 (`docs/research/original-levels.md`), so no longer open: walls and ceiling (the top is closed at y ≈ 9.4), bucket size and travel (catch zone 130 wide, about 176 wide overall, 600-tick cycle), Fever bucket and bumper layout, flipper geometry, peg radius (10 everywhere), and the can-be-orange set (median 100% of scoring objects, minimum 53%, never fewer than 64 pegs).

Decided in the physics engine on 2026-10-14. Values live in `src/sim/tuning.ts`; the base geometry is a function of the board width.

- Walls and ceiling: the walls' inner edges sit at x = 0 and x = board width, the ceiling's bottom edge at y = 9.375 across the full width. Bounciness 0.75; the walls' slide threshold is 1e-5, so they always bounce. Both as in the original's base level.
- Free ball bucket: the original's rims, catch box (130 x 20), Pyramid slopes and Fireball cover, mirrored about the rims' axis (the original's parts sit up to 1.1 px off it). The center runs from 66 to width - 66 on a cosine, starting in the middle moving left. The cycle keeps the original's peak speed (260 px either way in 600 ticks): round(600 * (width/2 - 66) / 260) ticks, 905 on the 916 board. Travel changes from powers animate by 1 px every 2 ticks.
- Fever buckets: the original's x positions, box widths and divider radii scale by width / 650 (on the 916 board: boxes 112.7 wide, dividers radius 52.1), so each bucket keeps its share of the width. Dividers keep their tops at the original height (y = 554). They rise 30 px over 5 ticks when Fever starts.
- Flippers: the original's polygons on its rotate-back-and-forth mover (period 30, swing 0.5236 rad). Holding the button runs the mover clock up to 15 ticks (about 60 degrees), releasing runs it back. Pivots 2.5 px from the left wall and 3 px from the right wall.
- Launch: the ball starts 86 + its radius along the launch direction from the pivot (board width / 2, 30). The original's extra 1 px sideways offset is dropped, so a straight-down shot is symmetric. The cannon does not collide.
- Leaving play: a ball is out once its center is 50 px below the board's bottom edge, below the Fever buckets. A Spooky return puts it back at the same x with its center 0.5 px clear of the ceiling, velocity kept.
- Contact solver: surfaces sit 0.01 px inside the touching distance; an overlap is ignored while the ball already separates faster than 0.2 px/tick; a ball that is separating gets no velocity change; after 20 contacts in one tick the ball stays at the last contact point.
- Slide on moving surfaces: the decompiled slide line is read with the ball's velocity relative to the surface. Read literally, a ball resting on a moving platform would gain the platform's speed every tick.
- Movement readings: verticalArc swings over the right half of the ellipse (the decompiled line moves along a diagonal); rotate ignores maxAngle (the decompiled code then holds a constant angle); rotateAroundCircle on an ellipse faces along the ellipse's outward normal (the decompiled screen-space atan2 turns the other way than on a circle); clock arithmetic uses a floor modulo. Parents move before their children in the same tick, and a child's anchor is its position in the file plus its parent's displacement since tick 0.
- Stuck counter: +1 per tick. Every 10 ticks the ball compares its position with its last 6 samples: a 2 px move resets the counter, a 0.2 px move takes 5 off. Peg removals and contacts with ballStopReset objects reset it. The removal threshold and which peg goes stay with the rules layer (decided below).
- Quick disappear: the crumble count starts at 3 when the peg lights, by contact or by a power, and the peg goes at 100, 97 ticks later.
- Teleports fire on entry only: a ball placed inside a trigger has to leave it before it fires again.
- Lit pegs leave the simulation together when the shot ends; popping them one at a time is presentation.

Decided in the rules engine on 2026-10-15. Values live in `src/rules/tuning.ts`.

- Green and purple pegs come from the pegs flagged "can be orange", like the orange ones; unflagged pegs fill in only when the flagged set runs out. The game's own name for the flag is "variable" (the randomizer may change the peg), and section 3 already budgets three flagged pegs beyond the orange count.
- Designer-placed greens, when used, are placed before the orange pegs are drawn, so they never turn orange.
- A multiplier step applies at once: a peg is worth its base value times the multiplier for the orange pegs left before it lit, so pegs lit after a step in the same shot score more. The original's meter fills during the shot and its popups show each hit's multiplied value.
- The purple peg moves after every shot that does not end the level, a zero-hit shot included: to a random blue peg still on the board other than itself, flagged pegs first. With no other blue peg it stays; if it was hit and no blue peg is left, there is no purple. This is the patent's rule with no extra conditions.
- Aim guide length unit: simulation ticks. 40 ticks from the barrel tip cover about 200 px straight down, the path length measured on screen (visual guide 5.3).
- Long Shot: the straight line between the ball's centers at two contacts with non-blue pegs, the second one lighting its peg, is at least 1/3 of the board width (305 px on the 916 board); Super Long Shot from 2/3 (611 px). A contact with any other peg in between, a teleport or a Spooky return breaks the chain; walls, solids and the bucket do not. Touching the first peg again moves the start point. The spec states the distance as a share of the screen width, so it scales with the wider board.
- Double Long Shot: a Long or Super Long hop that starts at the peg where the previous hop ended, with no peg in between, also scores Double Long Shot; each hop still scores its own Long Shot. The table lists it as a bonus of its own.
- Bucket Bounce: the ball lands in the bucket having touched exactly one peg or brick (any number of times) and nothing at all after its last contact with it.
- Bucket Kick: the ball that lights the last orange peg touched a part of the free ball bucket (rim, Pyramid slope or cover) more recently than any peg; walls and solids in between are allowed.
- Lucky Bounce: after a contact with the bucket, the ball rises at least 1/4 of the board height (140 px) above that contact point, then lands in the bucket. Other contacts in between are allowed; a teleport or a Spooky return stops the measurement.
- Bucket Streak: a shot counts when at least one of its balls lands in the bucket. 5 in a row score Bucket Streak, 10 Big Bucket Streak, then the count starts over (shot 15 scores Bucket Streak again).
- Long Slide: 12 different pegs or bricks touched with slide contacts (at or below the rolliness threshold, section 9) in one run. A bounce off anything, a teleport or 25 ticks without a slide contact ends the run. Once per shot.
- Orange Rush: orange pegs lit in the shot by any cause, against the table for the orange pegs left before the shot; with fewer than 5 left there is none. Once per shot.
- Clean Finish: the shot lit at least one peg before the last orange, the last orange left exactly one unlit peg on the board, and the next peg lit is that one.
- Double Power: the second green peg lit in the same shot, by the ball or by a power.
- Style points show at once and join the score at shot end with the shot score. They never count toward the free ball thresholds.
- Free balls: one per ball the bucket catches. A threshold ball comes the moment the running shot score of all the shot's balls passes 25,000, 75,000 or 125,000, as the ball counter's tubes fill during the shot.
- Coin flip: only after a shot that lit no peg and put no ball in the bucket; a ball in the bucket already came back.
- Fever: the result is a win from the moment the last orange lights. Every ball that lands in a Fever bucket pays it (Multiball can land two); no source says otherwise. Full Clear is judged as the ball lands: every peg lit or gone. Unused balls convert after the last shot's free balls.
- Stuck ball: at a stuck count of 500 (the decompiled KILLBALL_TIME3) the rules remove the lit peg the ball touched most recently within the last 100 ticks, the nearest on a tie; the removal resets every ball's count. A ball that touches no lit peg leaves play at 1,500 (KILLBALL_TIME1). Removing the peg the ball rests on is what the patent describes; taking the ball is the last resort the constant's name suggests.
- A shot ends after 30,000 ticks (5 minutes) at the latest: every ball still in play is removed. A safety net for loops that never stall, long enough for any flipper rally.
- Pegs lit by a power score and count like pegs lit by the ball. Power effects stack by default: a second grant while the same effect runs or waits adds its shots; each power may choose otherwise.
- The campaign clear bonus needs a campaign try number; Quick Play and challenges get none.

Decided in the play screen on 2026-10-15. Values live in `src/game/play/timing.ts` and `src/game/play/aim.ts`; all of it is presentation and input, none of it changes the simulation.

- Fever slow motion starts when the rules predict that a ball lights the last orange peg within 25 ticks (about 1 s of real time at 0.25x). It holds 3 s of real time after the hit, or until the ball lands, then ramps back by 20 per mille per tick as in the decompiled code. A click ends it at once.
- Near miss (added 2026-10-20): slow motion and the zoom also start when the run ahead finds a ball passing the last orange peg with at most 4 px between the ball's edge and the peg's outline within those 25 ticks. The original has this path too, but its trigger distance sits in `Board::CheckForFever`, a stub in the decompilation. While slow motion waits for the hit, the run ahead is repeated every tick; once it finds neither a hit nor a pass that close, the ball has missed: the zoom goes back out, the speed ramps back, and the crowd sighs as the speed passes 0.9x, where the original calls `DoFeverMissed` (between 900 and 920 per mille). A predicted hit that never comes ends the same way.
- Fever zoom: toward the first ball, 1.5x over 0.55 s while closing in, then 2x over 0.5 s after the hit, back to 1x over 0.26 s. The machine fades out by 1.14x and a thin frame replaces it; the camera stays inside the playfield opening.
- Shot end: the tally's first line fades in over 170 ms; the first lit peg pops 12 ticks after the ball leaves, the rest clamp(8 - remaining/10, 1, 5) ticks apart; the finished tally holds 25 ticks before the purple peg moves and the next ball loads, then fades out over 170 ms, so nothing of it stays up while the next shot is aimed (changed 2026-10-20; it used to stay until the next shot). Pegs removed during the shot (quick disappear, stuck ball) pop as they go and count in the tally.
- Low-ball warnings: "3 BALLS LEFT" and "2 BALLS LEFT" shrink in over 450 ms, hold 3 s and fade over 400 ms, as the visual guide (7.5) measures. "LAST BALL!" flashes for 200 ms in all (60 ms in, 80 ms held, 60 ms out; changed 2026-10-20 at Tim's request, since a huge word held across the playfield got in the way of aiming the last shot). Values in `src/game/ui/motion.ts`.
- Coin flip: the coin spins 1.3 s (the length of the original's spin sound) and shows its face for 1.1 s; a won ball joins the counter when the face shows.
- Click jitter: a mouse click within 10 ticks of the barrel leaving an angle it held for 30 ticks fires at that angle only if the barrel moved less than 1 degree, so deliberate quick swings fire where they point.
- Touch: a finger points the cannon at itself and the cannon follows it while it is down (changed 2026-10-17 after play on an iPhone: the earlier reduced-rate drag felt like no aim at all); lifting does not fire; a tap (under 7 units of movement and 350 ms) fires as soon as the barrel points at it; a tap on the launcher fires without re-aiming, and a finger that starts there aims once it moves past the tap slop. Pointer ids are any numbers: iOS Safari's are negative. A pen press (added 2026-10-17) aims where it lands and fires once the barrel points there, as a tap does, and fires without re-aiming on the launcher: a pen can land without hovering first (an iPad's Pencil), and a click would fire wherever the barrel still pointed.
- Fast forward (8x) runs only between shots; the original's in-shot speed-up is a cheat toggle. Held, it speeds up the peg pops, the tally, the coin flip and the bucket while aiming, and the Fever finish once the winning ball has landed and slow motion has ended; it does nothing while a ball is in flight, during Fever slow motion or under a dialog (`src/game/screens/play.ts`).

Decided in the level generator on 2026-10-15. Values live in `src/gen/constants.ts` and `src/gen/check.ts`.

- Minimum gap between objects: 12.5 px. Found by testing in the simulation (`tools/gap-probe.ts`): two objects (peg/peg, peg/flat brick, peg/standing brick, two bricks in a V at 30 and 60 degrees, two flat bricks, two curved bricks, peg/wall) set a free gap apart along an axis tilted 0 to 45 degrees, balls dropped over the gap at 36 offsets, speeds and heights. A ball came to rest touching both objects in every configuration at every gap up to 11.9 px (the ball's diameter is 12, its contact surface 0.01 inside); from 12.0 px up no ball stayed in any configuration. Teggle keeps a 0.5 px margin. The original's 5th-percentile peg spacing, 31.8 (an 11.8 px gap), is just under this; Teggle's pegs are at least 32.5 apart.
- Bricks may instead join: neighbors at most 1.5 px apart (the generator leaves a 1 px seam) count as one surface. Any free distance between 1.5 and 12.5 px is rejected, between any two objects.
- Placement limits: nothing within 110 px of the cannon pivot (the ball leaves the barrel at 92 px, so its edge reaches 98; the original keeps peg centers at least 120 away); nothing below y 520 (the bucket's rims rise to about 532.7, minus the gap); nothing closer than the gap to the walls or the ceiling.
- Moving parts are checked at every tick of the level's full cycle (the least common multiple of all movement cycles) when that is at most 6,000 ticks, else at 3,000 evenly spread ticks; cycles longer than 200,000 ticks are not followed further.
- Brick chains along paths: straight bricks where the bulge over a brick's length is under 0.35 px, curved bricks (an arc through both ends and the middle of the stretch) elsewhere; target length 35, at most 30 degrees per curved brick, inner radius at least 25. Where a bend is too tight for that, the chain opens a full gap rather than leave a crack.
- Reachability: 14 playouts of 7 board states each (the full board, then after each of 6 seeded advancing shots that light something), every state swept with 120 shots over the cannon's whole range, at 6 launch times spread over the movement cycle on levels with moving parts (cycles longer than 24,000 ticks are sampled within that horizon). Can-be-orange objects that no sweep shot hits lose the flag.
- Stuck spots: a ball whose stuck counter reaches 150 ticks, or that stays inside a 40 px box for 600 ticks, or whose shot passes 4,000 ticks, records the objects it touches; the check frees it by removing a lit peg it touches, as the rules do at 500. Every scoring object at a spot gets quick disappear, then the check runs again (up to 3 rounds; the last round only verifies). A spot that touches no scoring object fails the level.
- Generated levels need at least 58 can-be-orange objects after the checks (a 55-orange challenge plus green and purple).

Decided in the audio on 2026-10-15. Values live in `src/game/audio/pitch.ts`, `src/game/audio/sounds.ts` and `src/game/audio/score.ts`; every sound and the music are synthesized in code (14.1, `docs/assets.md`).

- Peg hit pitch: the C major scale from C5 (the original's peg hit pitch, visual guide 14), one step higher for each further peg lit in the shot, up to C7 at the 15th hit; later hits stay on C7. Higher notes are trimmed in level by (C5 / f)^0.35 so a long run does not get shrill. Bricks and pegs sound alike; orange hits are a little brighter, green ones have a soft chorus, purple ones a high sparkle.
- Peg pops climb the same scale from G4 (the original's pop sits near 385 Hz) to G6.
- C major is the game's key: the jingles, stingers and the Fever music are in it, so hits and pops during the Fever stay in tune with the music.
- Voice limits per sound: peg hits 6 voices with onsets at least 35 ms apart, pops 8 voices 20 ms apart, title letters 6 voices 40 ms apart, count ticks 2 voices 35 ms apart, most others 1 to 4. A voice beyond the limit fades out the oldest one in about 12 ms. Hits that arrive together (a power lighting several pegs in one tick) play as a quick run, up to 350 ms late; past that they are dropped.
- Fever music: the "Ode to Joy" theme's two phrases (eight bars) in C major at 150 beats per minute, after a one-bar intro and before a closing chord: 15.2 s of notes and a 1.6 s ring-out. It starts on the hit with the cymbal and the gong, plays on under the level complete dialog, and fades out over 0.8 s at the next shot.
- Slow motion starts a timpani roll on C that swells for one second, the time the approach takes at 0.25x (25 ticks), and gives way to the cymbal and gong on the hit.
- A miss stops the roll and sighs: a small crowd's "awww", nine voices from B2 to F#4 buzzing through one bank of vowel formants that darkens from "aw" toward "oo" (660 to 460 Hz and 1,060 to 780 Hz), each voice lifting a semitone and a half and sinking about five over 1.25 s, over a breathy bed; about 1.6 s, the original's `sigh.ogg` length.
- The bucket fireworks sound bursts at 350, 800, 1300 and 1700 ms after the landing, with the presenter's bursts; the rainbow shimmer starts when the arch starts drawing.
- Pause stops the Fever music and resumes it at the same place; long effects (the timpani roll, cymbal, gong, fireworks, rainbow, applause, coin spin and Space Blast) duck to silence meanwhile. A hidden tab suspends all audio. Leaving the play screen fades everything out.
- Mixing: a limiter at -10 dBFS (ratio 20, 2 ms attack) and a soft clipper after it; single sounds peak about 1 to 14 dB under the limiter and only stacked moments reach it. Volume sliders map to gain squared. Defaults: effects 0.8, music 0.7, not muted; stored in localStorage under `teggle.audio.v1`. M toggles mute.

Decided in the powers on 2026-10-15. Rules values live in `src/rules/tuning.ts` and `src/rules/powers/`; presentation values in `src/game/play/powers.ts`. Masters and their stages, powers and themes are in `src/rules/masters.ts`.

- Stacking: a green hit while Guide, Pyramid or Flippers runs or waits adds its full length again (3, 5 or 3 shots); the original's own tips say so for Guide and Pyramid. Fireball and Zen Ball add one more such shot. Multiball adds another ball, Space Blast sets off another blast around that green peg, Flower Power lights another fifth of what is left, and Spooky Ball gives one more return to the ball that lit it. Lucky Spin spins again; landing on a Triple Score or Big Ball that still runs adds 2 shots to it. Each green hit is a whole new use of the power, which is what the instant powers do anyway.
- Space Blast lights every unlit peg and brick whose position is within 80 px of the green peg's, nearest first. "Four pegs wide" (patent) read as four peg spacings across: the original's median spacing is about 40 px, so a blast lights about a dozen pegs on a typical board.
- Lucky Spin: four equal segments, 25% each: Big Ball, Triple Score, an extra ball, a random power. The original's wheel art has four equal segments and fans report 25% for Triple Score. The random segment runs one of the nine other powers, each equally likely (the decompiled draw leaves Lucky Spin out; which masters are unlocked is not modeled yet). Triple Score triples every peg lit for the rest of this shot and the next, after the multiplier. Big Ball gives the next two shots a ball of radius 9 (the plain ball 6, the Fireball 10); it never grows mid-flight, where it would start inside a peg. "Big Ball" is Teggle's plain name for that segment.
- Zen Ball's search: the player's own direction, then angles 0.1 degree apart, nearest first and left before right, up to 4 degrees either side (81 candidates; past the cannon's 97-degree limit they are skipped, so aiming at the limit halves them, as the speedrun guide reports). Each candidate is launched at the same tick on a trial copy of the attempt, so moving parts, the bucket, powers and every rule play out exactly as the real shot would, and played to its end or 3,000 ticks with the flipper button released. Its value is the score gain (style points included) plus 10,000 per orange peg lit, 25,000 per free ball and 1,000,000 for a win; a ball the coin flip would return counts nothing, so the search cannot read the coin from the attempt's random numbers. The first candidate with the highest value is shot: the player's own unless another beats it. Patent: it weights orange pegs and bucket landings; speedrun guide: style points count.
- Zen Ball's cost, measured in Node on the example levels (six searches each, 28,000 to 48,000 simulated ticks per search on average): 13 to 25 ms per search on the static boards (at most 56 ms), 22 to 75 ms on the ones with moving parts (at most 127 ms, `helix`). The play screen holds the board, runs the search in slices of at most 6 ms per frame while the cannon drifts toward the best shot so far, then swings it there over 0.42 s and fires; the rules' launch hook finds the finished search for the same state and direction, and a replay runs it in one go.
- Multiball: the new ball appears beside the green peg on the side facing the board's middle, 1 px clear of it, moving 3 px/tick toward the middle and 2 px/tick up; it is the same kind of ball as the one that lit the peg (a Fireball spawns a Fireball). The patent and the original's tip both send it to the other side.
- Spooky Ball: the bucket is covered from the green hit until the ball is back at the top, so the first fall cannot end in the bucket ("bucket cap removed after it reappears", patent). A green lit by a power gives the return to every ball in play. Where and how the ball comes back is the physics decision above.
- Fireball: it burns through every peg and brick, lighting them without a bounce, and bounces off walls, solids, the bucket and the flippers like any ball; the decompiled code passes only through objects with peg info. The dome covers the bucket from the moment the Fireball shot is loaded until it ends; a Fireball that hits the dome bounces off it and burns it away, so a later bounce can still land in the bucket (patent).
- Flower Power: "nearest" is the straight distance between the green peg's position and each unlit orange peg's or brick's, ties going to the one earlier in the level file; it lights the nearest ceil(n / 5) of the n unlit orange pegs.
- Bucket travel: the Pyramid takes 60 px off it (the original sets 200 instead of 260 in one of its two bucket states); with the Flippers up the bucket's center stays 195 px from either wall (the original's 130-px travel on its 650 board).
- Guide: the aim guide runs 80 ticks through the first bounce to the second contact, drawn as a thin path with the yellow bounce marker; while it shows, the wheel and arrow keys aim four times finer (the decompiled wheel step shrinks with the Guide).
- Flipper controls: the left mouse button, Space, either Shift, Z or X, or a finger anywhere on the board during a shot; a touch during a shot neither aims nor fires. The button state goes into the attempt record per tick.
- Lucky Spin's wheel turns for 2.8 s in all over the playfield while the board waits; the rules events after the spin (a free ball, lit pegs) and the world changes they stand for (a Multiball's ball, a Spooky Ball's aura, the Pyramid, the dome, the flippers, the turns counter) show once it stops.
- Power labels: the name, then "NEXT 3 TURNS", "5 TURNS", "THIS TURN" or "+3 TURNS" for lasting powers, "N PEGS" or "N ORANGE" for Space Blast and Flower Power. The banner over the launcher lights and the portrait glows while an effect runs or waits, and for the rest of a shot in which a green peg lit; the turns counter shows the shots left of the master's effect.
- A Spooky Ball that comes back in at the top is drawn over the launcher housing, with a pale glow and an opening ring, until its top edge clears the housing's lowest point (at most 1.5 s of game time). It often comes back under the housing, where only its smoke would show. Where it comes back is the physics decision above.

Decided in the power style shots on 2026-10-15. Names and points live in `src/rules/style.ts` (`POWER_STYLE_SHOTS`), the Flipper Rally count in `src/rules/tuning.ts`; the powers award them (`src/rules/powers/`). The original's own tips in the owner's copy (`characters.cfg`) name the trigger of five of them, and Teggle follows those. The points are the fan wiki's (section 5). Every name is Teggle's own plain name, none is the original's. The expansion's Lightning shot is out of scope.

- Fever Multiball (Multiball extras, 25,000): a Multiball starts while Fever runs, so a green peg lit after the last orange peg in the same shot, Lucky Spin's random Multiball included. The original's tip names this trigger.
- Double Catch (three free balls in one shot, 100,000): a second ball of the same shot lands in the free ball bucket. The original's Multiball tip names two balls in the bucket in one shot; the fan wiki's "three free balls" reading is not used. The rules award it to any shot, as only Multiball balls can do it.
- Pyramid Catch (bucket-power catch, 10,000): a ball lands in the bucket after touching a Pyramid slope, with no peg or brick touched in between; walls, solids and the bucket's rims in between are allowed, a teleport or a Spooky return breaks it. No source gives this trigger; it is Teggle's reading of the shot's place in the table.
- Flipper Rally (Flipper tricks, 25,000): 10 pegs or bricks lit in one shot by balls that touched a flipper earlier in that shot. The original's tip says "using the Flippers to hit lots of pegs"; the count is Teggle's. Random aims with random flipper presses on the three fixture levels reached it 4 times in 2,321 shots.
- Fireball Catch (Fireball tricks, 25,000): a Fireball lands in the bucket. The dome covers the bucket for the whole Fireball shot, so the ball has to burn it away first (section 7). The original's tip names bouncing a Fireball into the bucket.
- Big Ball Catch (Lucky Spin tricks, 10,000): a Big Ball lands in the bucket after touching at least one peg or brick in that shot. The original's tip names this for the wheel outcome that Teggle calls Big Ball.
- Each master-specific style shot scores at most once per shot. Like the generic ones, their points show at once and join the score at shot end, unmultiplied and outside the free ball thresholds.
- Callouts as for the generic shots. A style shot at a green peg lit in the same tick (Double Power, Fever Multiball) shows below the peg, because the power's label sits above it.

Decided in the campaign pipeline on 2026-10-15. Sources live in `campaign/`; the code in `src/gen/lines.ts`, `src/gen/templates/solids.ts` and `fill.ts`, `src/level/campaign.ts`, `src/game/play/backdrop.ts` and `tools/campaign/`.

- Lines: a lines file (`public/levels/campaign/<id>.lines.json`, next to the level) names the picture it was traced on and the board size, and lists lines in board coordinates. A line has an id, a note on what it follows, a mode (bricks or round pegs, 14.1), open or closed, control points at least 1 px apart, the indices of sharp corners, and for pegs a spacing (34 to 80, default 41, the original's median).
- Line smoothing: a centripetal Catmull-Rom spline through every control point (knots step by the square root of each chord, so it never loops or cusps between two points). A corner ends the spline and starts a new one; a run of two points is a straight segment, and points in a straight row stay straight; the ends of an open run continue along their last chord. The curve is sampled at most 2 px apart, with square roots and arithmetic only, so it is the same in every engine. It replaces the outline template's Chaikin smoothing (generator 1.1.0).
- Straight or curved bricks: the brick chain rule above, applied to the smoothed line: a brick is straight where the line bulges less than 0.35 px over its length (a radius above about 440 for a 35-long brick), curved elsewhere. A traced straight stretch is exactly straight, so it always gets straight bricks.
- Solids traced from a picture (ramps, blockers, platforms) are explicit polygons, rods and circles in the recipe, placed before the lines; one that does not fit (gaps, cannon, board limits) stops the build.
- A fill can stay inside an area of the picture, a closed line smoothed like the others: lattice points whose mirror twin also lies inside. 1-3's crown of blossoms uses it.
- Object counts: every campaign level has exactly its spec 15 count times 1.409, rounded (stage 1: 135, 131, 137, 138, 144), and levels with bricks keep their original's split rounded the same way (1-2: 83 pegs and 48 bricks; 1-4: 93 and 45). The build writes no level that misses its count, has fewer than 58 can-be-orange objects or keeps a stuck spot.
- Background pictures are `public/backgrounds/<background id>.webp`; asset ids are lowercase words joined by hyphens. How they are found, cropped and processed: "Decided in the backgrounds" below, which replaces the generated pictures and their prompts.
- The play screen draws the picture into the opening over the plain field, once per resolution into a cached layer under the static pegs; a missing or broken picture leaves the plain field. The Fever zoom scales that layer like the rest of the static picture; the picture is not redrawn at the higher zoom.
- Stage 1's world is the Cloud Isles: a pale, softly painted sky above the clouds with calm light-to-mid values where pegs sit and no large areas of saturated green, orange or magenta, so all four peg colors stay readable (checked over a style test in the play screen; a saturated green crown hid green pegs).
- Level 1's ramps are rods lying on the side balloons near the walls (on cloud tops before its found picture), sloping toward the middle; its blocker is the balloon's basket, a polygon with a peaked top (a flat top held a resting ball).

Decided in the menus on 2026-10-15. The save lives in `src/game/progress/`, the modes in `src/game/modes/`, the screens and their copy in `src/game/menus/`, the master's expressions in `src/game/play/face.ts`.

- Progress is one localStorage record under `teggle.save.v1` (the version is in the key and the record): the campaign position (the next campaign level and the try number its next attempt gets), the master last picked for a Master level, and per level its tries, wins, best winning score, full clear mark, five best winning scores (with the master and the date) and the score of its campaign clear. Every field is validated on load and falls back on its own; a damaged level entry is dropped alone. Without storage the progress lasts the session.
- An attempt counts as a try once its first shot leaves the cannon. Quitting or restarting after a shot uses up the try for the clear bonus; restarting before one does not.
- Designer-placed greens apply on every campaign try until the level is first cleared.
- Total score (the right score window in the Adventure, the level complete and stage complete cards) is the sum of each level's campaign clear; lost attempts and Quick Play add nothing. The left window reads "Stage 1-3" with the level score. In Quick Play the right window shows the level's best score.
- Best scores and the top five count won attempts only, from either mode.
- Unlocked stages and masters follow from the campaign position: a stage's master is met when the campaign reaches the stage, all ten from the Master levels on. Quick Play offers every cleared level with any master met, starting on the level's stage master (on a Master level the last pick); the master picker is skipped while only one master is met.
- The Adventure shows the current stage's intro card each time it is entered. A won level's Continue goes to the next level, or after a stage's fifth level to the stage complete card and then the next stage's intro card. A Master level opens the master picker before it plays, starting on the last pick.
- The campaign manifest decides what is playable: the intro card counts its levels, the level select has one page per stage in it, and a campaign past its last level says the next levels are not in the game yet.
- Challenges: see "Decided in the challenges" below (changed 2026-10-17; until then the slab stayed disabled and no challenge list existed).
- Master expressions in the launcher window: power for 1.8 s on a green peg; happy for 2.2 s on a free ball, a style shot, a shot that lights 3 or more orange pegs and the last orange peg; sad for 1.8 s after a shot that lights no orange peg and earns nothing; a won or lost level holds happy or sad until the next attempt. They run on show time, so pause holds them. A missing expression shows the neutral portrait, a missing master an empty window.
- The intro speech types at 48 characters per second after 0.35 s; a click or Space shows all of it.
- No painted menu scene exists yet. `MENU_SCENE` in `src/game/menus/main.ts` names one under `public/art/menu/` once it does; until then the scene window shows a lit field, the current stage's master (or the latest master met with art) saying where the campaign stands, and the next campaign level's board.
- Options: music volume, effects volume, mute, full screen (disabled where the browser has no element full screen) and How to Play. No reduced-motion setting.
- The pause dialog: Resume, Options, Restart Level and the mode's way out (Main Menu in the Adventure, Level Select in Quick Play, Quit on `#/play/...`).
- A met master without a portrait shows its frame emblem in the menus; a locked one without a portrait shows an empty plate.

Decided in the editor on 2026-10-15. The line editor lives in `src/editor/` (route `#/editor/<level id>`); the generator side in `src/gen/flippers.ts`, `edits.ts`, `fit.ts`, `pipeline.ts`, `json.ts` and `campaign-source.ts`.

- Flippers keep-out: any level can get the Flippers power, so every level keeps the flippers' whole swing free: each flipper's polygon at every pose from rest to fully raised, sampled from the simulation's own movers at 4 poses per tick of the flipper clock (61 per side), plus the minimum gap. Placement leaves it out and the validity check reports anything in it (issue `flipper`). On the 916 x 560 board the swing reaches up to about y 423 and about 94 px in from each wall; a peg 15 to 90 px from a wall must sit above y 401 to 420. Generator 1.2.0.
- Exact counts: a count fitter runs before the generator in `npm run campaign:build` and in the editor. A recipe that hits its count is left alone. Otherwise a fill without a fixed spacing gets the exact number of pegs missing (fill `count`: the sparsest pattern with room for them, the surplus left out in mirror pairs, the pegs closest to other objects first); then peg lines gain or lose one peg at a time, the line whose new spacing stays nearest its written spacing first, kept only when the count moves toward the target and every manual edit still finds its object; failing that, one peg the other way or two pegs; last, a fill with a fixed spacing is trimmed. Brick lines never change, so a level keeps its split of pegs and bricks. A line marked `keepSpacing` in the lines file (one peg per pennant, a ring of eight) is never nudged. The fitted recipe is the one in the level's provenance; the lines file keeps the written spacing. One fit builds the level at most 200 times.
- Stage 1 under the keep-out: the pegs nearest the walls on the lower-corner cloud lines fall in the swing, three per corner on every level. 1-1 gets one more peg on each of its six small balloons and keeps its pennant, panel and ring spacing; 1-2's side cloud rings rise 66 px; 1-3's two cloud puffs get a middle peg; 1-5's two corner cloud banks move to the inner foot of the stems; 1-4 stays as drawn. The fitter then nudges 1-1 (cloud-mid-left one peg fewer), 1-3 (both petal streams and both puffs one peg more), 1-4 (deck two more, the upper and lower corner clouds one more each) and 1-5 (wind-middle and breeze-low). All five keep their counts and splits and pass the full checks.
- Manual edits: the recipe's `edits` list (in `campaign/levels/<id>.json`), applied after everything is placed. An entry without `add` changes one generated peg or brick, the one whose generated position lies nearest `at`, within 2 px; no object takes two entries. `to` moves it, `rotation` turns a brick, `delete: true` removes it, `canBeOrange` and `quickDisappear` set its flags. An entry with `add` (`peg` or `brick`) places a new object at `at` (a brick lies flat unless `rotation` says otherwise and is 35 long unless `length` does) with the next free id. `at` of a change is written to 0.01 px, every other position to 0.1 px. An entry that finds no object stops the build and is marked in the editor. The full checks still run afterward, so an edited peg can lose can-be-orange or gain quick disappear.
- Saving: no backend. With the File System Access API (Chromium) the user picks the repository folder once; the handle is kept in IndexedDB, so a reload only asks for the permission again. A save writes the lines file, the level source and, once the full checks of the current version pass, the level file and the manifest, each only when its bytes change. Without folder access each file is a download. The level file comes from the same pipeline as the build (`src/gen/pipeline.ts`), so the build writes the same bytes; Chromium's export matched it byte for byte on all five stage 1 levels.
- Text of saved files: the level source as Prettier writes it (the top level and its direct objects expanded, deeper objects on one line when they fit); the lines file in its hand-written style, keys in the order id, note, mode, closed, spacing, keepSpacing, corners, points, the points as [x, y] pairs packed into rows of at most 100 columns. Points the editor places or moves are rounded to 0.1 px.
- Live preview: the generator runs in the page on every change (1 to 4 ms for a stage 1 level) with the last fit's nudges; the fit runs on a web worker 250 ms after the last change; the full checks run on a pool of workers (one per core less one, at most 8) in the build's job order.

Decided in the self-play agents on 2026-10-15. Values live in `src/agents/tuning.ts`; the agents and metrics in `src/agents/`, the tools (`npm run agents:report`, `agents:bands`, `agents:calibrate`) in `tools/agents/`. Measurements: `docs/research/agent-difficulty.md`.

- Random aims uniformly over the cannon's whole range, 97 degrees either side of straight down. Greedy tries 40 angles per shot, spread evenly over that range with one random offset per shot, plays each to its end (at most 3,000 ticks, Zen Ball's limit) on a trial copy of the attempt launched at the same tick, and takes the best by, in order: a win, orange pegs lit, free balls won, score gain with style points; a tie keeps the first angle tried. Noisy greedy adds a normal aim error of standard deviation σ radians to that angle and clamps it to the range; the normal draw is Box-Muller on a port of fdlibm's log added to `src/core/dmath.ts`.
- The search counts a ball the coin flip would return as no free ball, as Zen Ball's does. Other random rules inside a shot (Lucky Spin's wheel) draw the same numbers in a trial and in the real shot, so the search sees their outcome; Zen Ball's search does too.
- Agents launch as soon as the previous shot ends. Zen Ball replaces the agent's shot by its own search, as the rules run it; trial copies skip it.
- Flipper policy: the button is held while a ball in play falls within 100 px of either side wall and 120 px of the board's bottom edge, and released otherwise, in trials and real shots alike.
- Runs: each run plays one attempt to its end with new colors. Run i's attempt seed comes from a base seed, the level's key and i; the agent's own random numbers come from the attempt seed. So a run gives the same result in any worker, and run i of every tier and aim error faces the same colors. On the Master levels each run draws one of the ten masters from its seed. An attempt still going after 300 shots stops and counts as not cleared.
- Rules: campaign levels and the original's play with their campaign slot's rules (greens from level 3, purple from level 4, the stage master's power), random greens, no clear bonus. Level files play with the Quick Play defaults and no power. `--balls`, `--orange` and `--power` override.
- Metrics: clear rate with its 95% Wilson interval; balls used is the shots taken in cleared runs; free balls per run by kind; orange coverage counts the can-be-orange pegs and bricks lit at least once over all runs, in any color and by any cause; stuck events are stuck-ball removals. Also reported: orange left on failure, dead shots (no orange lit), the shot that first lit an orange, mean orange left after each shot, the first Fever ball's bucket, full clears and simulated ticks.
- Reference bands: the noisy agent at σ = 0.03 rad, 200 runs on each of the original's 55 levels, converted at run time at their own 650 x 560 size (`tools/agents/original.ts`). A stage's band is the range its five levels' clear rates span; the numbers are in `src/agents/bands.json`, no geometry.
- Reading the original's level files for that conversion: a reference names an object's id plus one; a moving brick's shape is built at its own angle and turned by its mover's rotation, so its base rotation is the sum, while a moving polygon takes its mover's rotation; a mover whose parent mover no colliding element carries gets an invisible, non-colliding carrier; a polygon outline that is not simple becomes one rod per edge. The fish's `movetoggle` logic in 5-2 is not played; it moves as a plain mover.
- Calibration: `npm run agents:calibrate -- <save>` plays the noisy agent over a grid of aim errors on every campaign level with tries in an exported save, the same runs at every error, and picks the error with the highest binomial likelihood of the player's wins; it also reports the mean absolute error between the clear rates. The DEV ONLY route `#/dev/save` downloads the save; the save format is unchanged. The save does not record which master a try used, so the agent plays the stage master.

Decided in the campaign plan on 2026-10-15. Sources in `campaign/stages.json` and `campaign/levels/<id>.json`, the format in `src/gen/campaign-source.ts`, the overview in `docs/design/campaign-plan.md`, the checks in `tools/campaign/plan.test.ts`.

- Drafts: a level source marked `"draft": true` is planned (concept, plan, picture prompt, seed and count) without a final layout. `npm run campaign:build` skips it, the manifest leaves it out even when a level file exists, and its lines file may be missing. A draft needs a plan. Removing the flag is what puts a finished level into the campaign. Stages 6 to 11 are drafts (stage 2 left draft on 2026-10-17, stages 3 to 5 on 2026-10-20).
- Plan: per level the spec 9 archetypes, the generator templates (solids, the lines and at most one more template, as a campaign recipe allows), the fill, the pegs and bricks (together the recipe's count), the moving parts with their spec 9 movement types, the spec 8 features it carries, and a difficulty target.
- Splits: where the original's pegs and bricks, each times 1.409 and rounded, miss the rounded total by one, the bricks keep their rounding and the pegs take the rest, since count fitting never changes bricks. That settles 2-3, 3-1, 3-5, 4-2, 5-1, 6-5, 7-2, 8-2, 8-3, 8-5, 9-1, 9-3 and 10-1.
- Worlds: 2 Clover Burrows, 3 Golden Rooftops, 4 Lilac Orbit, 5 Lighthouse Cove, 6 Moonlit Hollow, 7 Petal Terraces, 8 Ribbon Fair, 9 Ember Highlands, 10 Silverwood, and 11 Starlit Summit, the Master levels' own finale world. Every stage style keeps stage 1's structure and readability rule (light to medium values where pegs sit, never dark in the night and space worlds, no large areas of saturated green, orange or magenta, nor of the world's own risky color) and its exclusions: no people, animals, characters or faces, so a world shows its master's habitat and power, never the master. None copies an original scene, character or level picture (visual guide 15, research 5 and 7): the Cat's world is not Egyptian, the Owl's has no temple and no yin-yang.
- Every picture keeps the shared layout: open sky at the top center, plain lower corners for the flippers' swing, a calm bottom strip. Stage 2's found pictures show the gopher's garden above ground: a planted field, a forked lane, mushrooms in moss, fern fiddleheads and a sod house dug into a hillside (changed 2026-10-17 from burrows in cross-section, which were planned for generated pictures).
- Names: Teggle's own. None repeats one of the original's 55 level names; names and picture ids are unique.
- Difficulty: every level has a target clear rate for the reference agent (spec 13.5, `src/agents/bands.json`) inside its stage's band. A stage's opener is its easiest level and its finale or the level before it its hardest. The stage means of the targets never rise: 29.8% for stage 2, then 29.2, 28.2, 27.6, 27.6, 27.2, 22.0, 19.6, 18.4 and 12.6% for stage 11; stages 5 to 7 level off because the bands of stages 5 and 7 start at 24%. The targets hold under whatever rules 14.3 settles; a level is tuned to its target once self-play measures it.

Decided in the mobile pass on 2026-10-15. Values live in `src/game/app/display.ts`, `input.ts`, `viewport.ts` and `quality.ts`; checks in `npm run shots:mobile` (Playwright device emulation with real touch input) and `npm run perf:mobile`.

- Safe area: the page uses `viewport-fit=cover`; the 16:9 world fits and centers inside the safe area (`env(safe-area-inset-*)`), and the letterbox color fills the notch and home indicator edges. An iPhone 13 in landscape (844 x 390 CSS px, insets 47 left and right, 21 at the bottom) shows the world at 656 x 369 instead of 693 x 390. Insets that would leave less than half the screen are ignored.
- No page gestures: `touch-action: none` on the page; Safari's pinch (gesture events), rubber band (touchmove) and double-tap zoom are refused; no tap highlight, callout, text selection or text size adjustment.
- Full screen: Android Chrome enters element full screen (and locks landscape where it can) on the first touch, unless the game runs installed. iPhone Safari has no element full screen, so the game installs to the home screen as a web app: `public/manifest.webmanifest` (display fullscreen, landscape, theme and background #1c3989, start URL `./`) and the Apple meta tags; the icons are the favicon's peg on that blue (`npm run icons`). Installed, the options' Full Screen toggle shows on and disabled; on a touch screen without element full screen, a line under the toggles says how to add the game to the home screen.
- Offline: production builds register a service worker (`tools/build-sw.ts`, part of `npm run build`) that precaches every built file except source maps and lines files, in one cache named after a hash of the files and the worker; the dev server never registers it. A newer build installs in the background and takes over, the page reloading into it, at the first moment a reload loses nothing: no route is loading and the screen on show holds nothing a reload would drop (changed 2026-10-17; until then only the main menu counted, so a deep link kept running the old build). Every menu is such a moment, and so is a level before its first shot: a fresh deep link or reload, or the next level after an end dialog's button. A level that has taken a shot keeps the running build through its pause and end dialogs until it is left, a challenge run past its first level until it ends (the run lives in memory), and the editor always. Switching on the end dialog itself would drop its tally and skip the stage complete moment, so the switch waits for its button. A build that another tab let take over reloads this page only at such a moment too. The page also looks for a newer build each time it is shown again, since a phone resumes a suspended tab or home screen app without loading it. Checked with real production builds in Chromium and WebKit.
- Rotation and hiding: a phone turned upright, or a hidden page, opens the pause dialog over a level in progress (a finished level keeps its end dialog) and stops the Fever music and long sounds at once; touches made on the rotate prompt are dropped. A hidden page also stops the loop and suspends audio until it shows again.
- Touch targets: 44 CSS px. A finger hits a button anywhere in a box grown to 44 CSS px around its center (a 22 CSS px radius for round buttons, the menu and fast forward buttons included); where grown boxes overlap the nearest button wins, and an exact hit always does. On a touch screen, stacked controls closer than 44 CSS px are spread: the options rows (the dialog grows to 520 units wide), and the pause dialog puts Resume above its three choices side by side. A mouse keeps the original's shapes and layouts.
- Hover on touch: the main menu's speech bubble describes the item under a finger while it is held down; sliding off before lifting opens nothing. No hover state stays behind after a finger lifts, nor after a pen lifts or leaves its hover range.
- Several fingers: fingers that land within 350 ms of each other are one gesture, so none of them taps, presses a button or fires; a finger resting longer (a thumb holding the phone) does not count. Only the finger that aims turns the cannon by dragging. A contact 110 CSS px or wider is a palm and is ignored, and a touch the browser cancels is no tap. Presses and releases are handled in the order they happened, so two quick taps within one slow frame stay two taps.
- Legibility: text keeps the original's sizes unless its cap height would be under 7 CSS px for sentences (the body face) or 6.5 CSS px for labels and numbers; then it grows to that floor. A desktop window of usual size sees no change; on a 667 x 375 phone the smallest sentence text grows about 1.5x and the smallest labels about 1.35x. This covers the score window labels, peg values, power and bonus labels, the second lines of callouts and notices, button labels, the slabs' second lines, the dialog stat block and tip, How to Play, the Quick Play info panel, the stage complete notes and the speech bubble; the turns counter grows at most 1.3x, as far as the banner leaves room. Where How to Play's text grows it takes a wider panel (920 x 572 units). On a touch screen How to Play's control lines and the Quick Play hint speak of fingers instead of the mouse and keys.
- Resolution: the backing store keeps the device pixel ratio up to 3. Measured with Chromium's 4x CPU throttling on a 780 x 360 phone at DPR 3: drawn on the GPU, as phone browsers draw canvases, the menu, a busy shot, Space Blast, the Lucky Spin wheel and the Fever all held 60 fps at about 1 ms of script per frame; with software raster they ran at 16 to 27 fps. So a phone lowers its backing store (times 0.75 per step, never below DPR 1.5) only when its average frame interval stays above 28 ms for 1.5 s after 3 s of settling, and keeps the lower one for the session; with software raster that brought the same scenes to 40 to 46 fps. A step that does not bring the average frame interval down to 90% of what it was or less is undone, and no further step follows that session (added 2026-10-17): the frames are then held back by the browser, not by drawing, as Safari on an iPhone in Low Power Mode runs at 30 frames per second however little is drawn. Desktops never change resolution.
- Memory: Safari counts every canvas against a fixed budget (about 224 MB on many iPhones; beyond it new canvases fail) until the garbage collector takes it, so a canvas the game lets go is shrunk to 0 x 0 at once (changed 2026-10-17): an evicted layer of a quarter of the world or more from the shared cache, every layer when the resolution changes, evicted thumbnails and portraits, and a level's static picture, Fever arch and lettering when the level is left; a changed resolution redraws the static picture and the arch in their own canvases. The shared layer cache holds at most 6 full-screen layers' worth of pixels at the screen's resolution as well as at most 160 layers (a level uses about 3.3, the menus 2.6), the brick cache 2 and 900, the thumbnail cache 2 and 40, the portrait cache 2 and 128; the oldest go first. The menus keep each level's picture only as wide as 300 world units are on the screen (585 px on an iPhone 13, never over 1,100 px), for the 16 levels they asked for last. Measured in WebKit as an iPhone 13 (844 x 390, DPR 3) through the menus, Quick Play, the challenges and four levels with their Fevers: canvases came to at most 244 MiB before (the 1,100 px pictures, evicted layers not yet collected and a cache budget raised by the wheel's finer layers) and 130 MiB after; as the largest iPhone (932 x 430) 135 MiB. The largest canvas is the screen's own, at most 2796 x 1290 on an iPhone, far under Safari's 16.7 Mpx limit for one canvas.
- Audio: the context is created on the first pointer or key input and resumed on that touch's touchend (where iPhone Safari unlocks audio) and on any later input while it is not running, which also wakes it from Safari's interrupted state after the app comes back.

Decided in the moving lines on 2026-10-15. The level format's addition lives in `src/level/schema.ts` and `src/sim/track.ts`, the lines format in `src/gen/lines.ts`, the generator side in `src/gen/movers.ts` and `src/gen/sweep.ts`, the editor side in `src/editor/motion.ts`; the examples are `eight`, `fish`, `bubbles` and `mill` in `src/gen/examples.ts`, their screenshots come from `tools/moving-shots.ts`.

- Groups: a line joins a named group (`group` in the lines file), and the file's `groups` list gives each group one movement, a pivot (by default the middle of its lines' box) and optionally a group it rides on. The movement is any of the original's twelve types with all of its parameters (period, radius, radius2, phase, offset, pathRotation, maxAngle, both pauses and postDelayPhase, reverse), or followPath along another line. A group without a movement only rides on its parent.
- A group's parts keep their offsets from the group, encoded in the original's own model (research 3.3, 3.4). The sliding, circling, figure-eight, arc and wrap types: every part carries the group's movement around its own place. rotate and rotateAroundCircle: the group turns rigidly about its pivot, every part orbiting the pivot on rotateAroundCircle at its own radius and start angle, as the original builds rotating groups (rotateAroundCircle's own orbit folds into the same rotating vector); on an ellipse a group would turn its parts at different rates, so a group's rotateAroundCircle takes a circle only. rotateBackAndForth: a peg off the pivot swings on a horizontalArc that spans twice the swing, a quarter cycle ahead (three quarters when reversed) and started one swing back, which puts it exactly where the swing does; a brick rides on an invisible, non-colliding carrier on that arc and swings its own facing with the group's movement; the period is a multiple of 4 so the quarter phases are whole ticks. Phases are written as whole ticks of the period, half a tick more where floating point would truncate one short, so every part of a group runs on the same tick.
- Nesting uses the original's position-only links. A child group's pivot is an invisible carrier that moves as a part of the parent group, and the child's parts ride on it, so a child on a turning parent stays upright, like a gondola. A traveling line inside a group rides the same way, on a carrier at its start. A followPath group's carrier travels along the line from the point nearest the pivot, and the parts ride on it, so the group glides without turning.
- Travel: the objects of a traveling line (`travel` on the line: period, reverse, phase, offset, pauses) are spread evenly in time over the line's whole length, each on followPath with its phase stepped: one lap of a closed line per period, or start to end of an open one and back to the start (a conveyor, like the original's board-wide wraps). Pegs: round(length / spacing), at least 3 on a closed line; pegs that travel may be spaced up to 200 px. Bricks: one per 35 px plus a 16 px gap (`TRAIN_BRICK_GAP`), since no seam stays closed where the curvature changes along the way; each brick turns with the line.
- Level format: followPath is the one movement type Teggle adds. The original's types and nesting cannot run objects along an arbitrary traced line; a figure eight or an ellipse traced over a picture is not the original's parametric curve. On its own curve, the original's stepped phases do what followPath does on any line. The level's `paths` list holds polylines relative to the anchor of what runs along them; a movement names one by index (`path`). An element walks its path at constant speed by arc length, a lap (or start to end, then a jump back) per cycle, backward with reverse; pathRotation turns the path about the anchor; the element turns by as much as the path has turned since its start (the tangent is the mean of both segments at each vertex and linear in between, wrapped into half a turn either way so drawing never spins). A traced line becomes a path as its smoothed curve simplified to within 0.1 px (Douglas-Peucker), its points rounded to 0.01 px. Only arithmetic, Math.sqrt and dmath's atan2: Node, Bun, Chromium, WebKit and Firefox give the same movers digest (`tests/fixtures/movers-golden.ts`), kept apart from the earlier digests, which do not change. The format version stays 1: every older file reads as before.
- Placement: everything that moves together is one unit (a top-level group with all that rides on it, or a traveling line on its own), placed whole or not at all and before every static line of its outline part, so static lines and the fill give way object by object, as at any zone, and a moving shape is never cut apart. The objects of a unit that does not fit go to the rejected list with the reason. Within a group, the objects of its lines keep the gap from each other as on the board.
- Sweep: a unit is sampled at every tick of its own cycle up to 6,000 ticks, else at 3,000 spread ticks, as the validity check samples, and a part's shape is kept whenever some point of it has moved 2 px (`SWEEP_STEP`). Every kept shape clears the board's limits, the cannon and the flippers' swing by 2 px more than a static object must; parts that move against each other (travelers, nested groups) keep the minimum gap, or join as bricks within 1.5 px, at every sampled tick; and the kept shapes keep the minimum gap plus 2 px from the static objects already placed. The kept shapes are then reserved as a zone, so static objects and other templates' zones stay clear, and claimed, so a fill keeps its 30 px clearance and the moving shape reads as one. Where the area overlaps another moving part's, the unit is checked against those parts at every tick of their joint cycle instead, so neighbors that circle opposite ways (7-3's bubbles) can share area. The full validity check still checks the finished level at every tick; it now bins the moving shapes per tick, with the same issues in the same order.
- Edits: a moving object is found where it is at tick 0; an edit may delete it or set its flags, never move or turn it (it keeps its line's motion; move the line).
- Count fitting: a traveling peg line is a knob counted like a closed line over its path. A unit is placed whole, so a nudge that makes it collide loses all its pegs and is not kept. Brick lines, moving or not, never change.
- Generator version: still 1.2.0. Every recipe that was valid before gives the same level (the ten older examples and stage 1 rebuild byte for byte); recipes with moving lines were not valid before.
- Crossings: objects spaced evenly along a figure eight with equal loops meet at the crossing when their count is even, since the two halves of the train pass it together, and with any count when the spacing is short for the crossing angle: on an eight 500 wide and 210 high, crossing at about 80 degrees, lanterns need about 100 px; the example's 13 run 112 apart. 3-2's sixteen lanterns therefore need loops of different lengths and a wire of about 1,700 px, or fifteen or seventeen lanterns.
- A flat moving row carries a resting ball along forever, as the stuck check finds. The mill's conveyor slopes 3 degrees and its horizontalWrap runs along the slope (pathRotation), so a ball slides off; its wheel rims are broken into four arcs with slots, so a ball that gets inside falls out again. The checks still give quick disappear to 18 of its 100 bricks, mostly where balls ride in the buckets between paddles once rim bricks are gone.
- Editor: the Motion rows of a line put it in a group (or a new one) or make its objects travel; the group's rows set its movement, its pivot (also by dragging its cross on the board) and the group it rides on. The Motion section plays (K) and pauses, steps (comma and period, Shift for 10) and scrubs the level's whole cycle (the least common multiple of its movements, at most 200,000 ticks) at 100 ticks per second; the board shows the level at that tick, the lines where they were traced. The selected line's unit shows its swept area (240 samples of the cycle), its pivots and the lines it glides along.
- The plan's `needs` field and its one value, line-movers, are gone: the six levels' movers exist. Their plans keep spec 9's types for what the features echo; 3-2's lanterns and 11-2's rings are built as traveling lines.
- Examples, built by `npm run gen:level` with the full checks: `eight` (13 lanterns around a figure eight between brick chimneys, 138 objects), `fish` (a fish of pegs sliding left and right, its tail a nested group swinging about the joint, 140 pegs), `bubbles` (nine rings of curved bricks floating on circles, neighbors turning opposite ways, 146 objects), `mill` (two brick wheels turning opposite ways over a sloped conveyor and a stream of bricks traveling a wavy line, bricks only, 100 bricks). Played in Chromium with the best-aim dev handle under the 20-orange rules: `eight` and `fish` won in 5 shots, `bubbles` in 10, `mill` in 6.

Decided in the orange draw on 2026-10-15 (14.1, "Orange pegs"). Values live in `src/rules/tuning.ts`, the draw in `src/rules/colors.ts`, the meter in `src/rules/scoring.ts`.

- Orange count: 20 per level (`DEFAULT_ORANGE_COUNT`). Challenges set their own.
- Draw: the orange pegs come from the can-be-orange set one at a time, without replacement, each with probability proportional to its weight. A peg's weight is 1 / (1 + (d / 200)^4) for its distance d in px from the cannon pivot, times 0.02 plus the sum of 1 / (1 + (e / 120)^4) over its distances e to the orange pegs already drawn. Every flagged peg can still be orange; far ones rarely are. Green and purple stay uniform.
- Fever meter: one segment per orange peg, 25 at most. With fewer than 25 orange pegs the original's bounds (x2 at 15 left, x3 at 10, x5 at 6, x10 at 3) scale by count / 25 and round up, so the last orange peg is always x10: with 20, x2 at 12 left, x3 at 8, x5 at 5, x10 at 3 (the 8th, 12th, 15th and 17th orange hit). With 25 or more orange pegs nothing changes.
- Orange Rush with fewer than 25 orange pegs: the orange left scales up to the spec 5 table (rounded down), and the target scales back down (rounded); a target under 2 means none. With 20: 8 orange in one shot at 17 to 20 left, 7 at 13 to 16, and so on down to 3 at 4 left.
- Measured on stage 1 with the noisy greedy agent at 0.03 rad and 0.015 rad, 100 runs per level, 10 balls (`npm run agents:report`): 25 orange drawn uniformly 0% and 2%; 20 orange uniformly 2% and 4%; 20 orange with only the pull toward each other 18% and 21%; 20 orange with the draw above 38% and 50%. The original's stage 1 with its own rules: 39% at 0.03 rad. The user's own play agreed: with 25 orange 4 to 7 were left at the end of a lost level; with this draw it played "much easier, in a good way".

Decided in the challenges on 2026-10-17. The challenges and their numbers live in `src/rules/challenges.ts`, the save in `src/game/progress/save.ts`, the routes, the run and its host in `src/game/modes/challenges.ts`, `challenge-run.ts` and `challenge-host.ts`, the list, its briefing card and its words in `src/game/menus/challenges.ts`, `challenge-card.ts` and `challenge-copy.ts`, the goal card in a level in `src/game/play/goal-card.ts`, the end dialog in `src/game/play/dialogs.ts`. Measured with `npm run agents:challenges` (`tools/agents/challenges.ts`: whole challenge runs put together from level runs) and `npm run agents:report`, the noisy agent at 0.03 rad unless noted. Screenshots: `npm run shots:challenges`.

- The 75: the original's 15 pages of 5 in its order, with the levels, goals, opponents and AI levels of its own challenge file (`levels/trophy.cfg` in the owner's copy). A level is named by its campaign slot, so Teggle's level in that slot plays. The four duel pages (three of single duels, one of three-level duels) are defined with their opponents and AI levels and never shown. Since 2026-10-20 a challenge has no name of its own: the words come from its definition (below, "The words"); the save keys results by id, so ids stay.
- Random levels come from the original's pool (`stages.cfg`: stages 2, 3, 4, 6, 7 and 8, plus 1-2, 1-3, 1-5, 5-2 to 5-5, 9-1, 9-2, 9-4, 10-1, 10-2 and 10-4; 43 levels), drawn only from those in the manifest the player has beaten in the Adventure, without repeats and without the levels the challenge names (changed 2026-10-20; until then from every pool level in the manifest).
- What shows (changed 2026-10-20): only challenges whose levels are all in the manifest. Duels never show, nor a challenge naming a level the manifest lacks, nor a random run that draws more levels than the manifest's pool levels (minus its named ones) hold. A group with nothing to show has no page, and the page count follows. With stages 1 to 5 built, 45 of the 75 show, in 11 groups; with stage 1 alone the random runs of 2 and 3 show, the longer ones not.
- What opens a shown challenge (changed 2026-10-20; replaces the groups opening in page order with the stages): the player has beaten in the Adventure every level it names. A random run opens once the player has beaten as many pool levels in the manifest (not named by it) as it draws; the pick opens with one beaten level. A level counts as beaten in the Adventure once the campaign has moved past it or it holds its campaign clear score (`beatenInAdventure` in the save). A locked challenge shows on the list with the LOCKED stamp, and its card says which levels open it, in campaign order: "Beat The Sky Tree in the Adventure to open this."; for a random run "It draws 6 random levels from the ones you've beaten. Beat 4 more levels in the Adventure, up to Mushroom Moss (2-3), to open this." The stage steps this replaces (after spec 8; the fan wiki has the first section after stage 3 and the rest after the campaign) kept the streaks, combined scores and Gauntlet shut until the whole campaign, which is not built yet, and opened a group whether or not its levels had been reached.
- A challenge level: the challenge's orange count and balls, greens and purple on every level with random greens, Teggle's weighted orange draw, the master picked before the run (any master met, one for the whole run; the first offered is the stage master of its first level), no clear bonus. With 20 orange and 10 balls it is exactly the Quick Play config. The level of choice (insane.4) is picked from the levels in the manifest the player has beaten in the Adventure (changed 2026-10-20; until then from every level in the manifest).
- A run plays its levels in order and fails on the first lost level; a full-clear challenge fails on a win that leaves a peg or brick; a score goal needs strictly more than the mark, over the level scores of the whole run. Balls carry over only where the original's `Balls` key spans several levels (insane.3, 10 balls for three levels): the balls left after a win, free balls included, start the next level, and none left ends the run. Every other level starts with 10. Unused balls still score 10,000 each.
- More orange: 26, 27 and 30 instead of 35, 45 and 55. The original's stage 1 under its own rules (uniform draw, 200 runs per level) clears 39% at 25 orange, 24% at 35, 21% at 45 and 16% at 55; its named levels fall alike (the first group's four from stages 2 to 5: 36% at 25, 26% at 35; the third group's five: 38% at 25, 15% at 55; 40 runs each). Teggle's stage 1 (weighted draw, 200 runs per level) clears 38% at 20, 26% at 25, 24% at 26, 21% at 27, 19% at 28, 16% at 30, 10% at 35, 9% at 36, 5% at 40, 4% at 44, 3% at 45 and 1% at 55. Scaling by 20 / 25 (28, 36, 44) would make the groups 19%, 9% and 4%; the original's counts would make them 10%, 3% and 1%. Stage 1 as rebuilt later that night (40 runs per level): 35% at 20, 22% at 26, 23% at 27, 16% at 30. Teggle's draw takes the pegs near the cannon first, so each added orange peg sits farther out and costs more than in the original. With 25 or more orange the fever meter and Orange Rush keep the original's rules (14.1).
- Score goals keep the original's numbers: 300,000, 350,000 and 400,000 on one level, 750,000 to 1,000,000 over three, 750,000 on the level of choice. The agent's winning scores on stage 1 are 5% higher in Teggle (medians 196,000 against 186,000, 90th percentiles 290,000 against 280,000; 200 runs per level). On the slots built, 40 challenge runs each, Teggle against the original: cup-1.1 (1-5, 300,000) 8% and 3% at 0.03 rad, 8% and 3% at 0.005; cup-2.1 (1-2, 350,000) 0% and 3%, 15% and 5%; totals.4 (1-1, 1-3, 1-2, 900,000) 3% and 0%, 0% and 3%. The marks at which Teggle would pass as often as the original (357,000, 384,000; 334,000, 457,000; 855,000) fall on both sides of the original's, inside the noise.
- The short stocks keep the original's numbers (2 balls, 1 ball, 10 balls for three levels): neither game's agent passes them, at 0.03 or 0.005 rad (0% to 3% of 40 runs). Teggle's stage 1 clears with fewer balls (median 10 to 11 shots against 12 to 13) and earns fewer free balls (1.8 to 2.4 per run against 2.3 to 3.9), so a short stock costs about the same. Full clears keep their goal; no run of either agent cleared every peg on stage 1.
- The main menu's Challenges slab opens the list once a challenge is open; until then it says which level opens the first ones ("Locked: beat level 1-1"). (Changed 2026-10-20; until then the groups opened in page order, one per stage complete from stage 3 to stage 10, the rest with the campaign.)
- DEV ONLY: `#/challenges?unlock=all` on the dev server counts every level in the manifest as beaten for the challenges, for the rest of the session, without touching the save; production builds ignore it. Challenges whose levels are not in the game stay hidden.
- The save (`teggle.save.v1`, still version 1) gains `challenges`: per challenge id its tries (a run counts once its first shot leaves), passes, most levels won in one run, the best total of a run that won every level, and the date of the first pass. A save without it reads as no challenge played, a bad field falls back alone, and an entry for an id the game does not have is dropped; no migration. A run given up (quit, restarted or left for another challenge) is recorded with the levels it won. Challenge levels do not count toward a level's tries, wins, best or top five.
- A run lives in memory only and draws its levels when it starts: a reload lands on the list, the try already counted.
- The words (changed 2026-10-20, after the user found the decorative names and the filler unreadable; all built from the definitions in `challenge-copy.ts`). A card's title is its level, "THE SKY TREE · 1-3"; a run of named levels is "THREE LEVELS", random levels "RANDOM LEVELS", the pick "ANY LEVEL". The band on its picture is the goal: "CLEAR 26 ORANGE PEGS", "OVER 300,000 POINTS", "CLEAR EVERY PEG", "START WITH 1 BALL", "10 BALLS FOR 3 LEVELS", "3 IN A ROW", "OVER 750,000 COMBINED". One goal sentence per kind: "The Sky Tree has 26 orange pegs this time instead of 20. Clear them all with 10 balls."; "Beat The Sky Tree and finish with more than 300,000 points."; "Beat The Sky Tree and clear every peg and brick, blue ones too."; "Beat Cloud Ship starting with 1 ball. Free balls you earn still count."; "Beat Balloon Morning, Kite Tails and Cloud Ship in a row. You get 10 balls for all three, and leftovers carry over."; "Beat 3 random levels in a row. Lose one and the streak is over."; "Beat The Forked Lane, Gable Row and Comet Shower in a row with more than 750,000 points combined."; "Choose any level you've beaten and score more than 750,000 on it." (once chosen, the score sentence on that level). Groups: "26 Orange Pegs", "27 Orange Pegs", "30 Orange Pegs" ("26 orange pegs instead of 20. Clear them all."), "Bronze Score Target", "Silver Score Target", "Gold Score Target" ("Beat each level with more than 300,000 points."), "Clean Board", "More Clean Boards", "Winning Streaks", "Combined Scores", "Gauntlet".
- The list: one page per group with something to show, its challenges in thumbnail windows titled by their level, with the first level's picture (face-down cards for random levels, the first levels in the game behind a question mark for the pick) and the goal in a band; Teggle's medal on a passed one; the LOCKED stamp on one not open yet. The info panel holds the group: its name, its number of the pages, how many are open and passed, its text, and what a click does. Nothing shows only on hover.
- The briefing card (since 2026-10-20; until then a click started the challenge and its goal showed only on hover, so never on a phone): a click or tap on a challenge opens a card over the list with its picture and band, the goal sentence, the balls, the target if any, the levels of a run of named levels, where random levels or the pick come from, and the player's record (passed or not, best, tries). Play (or Enter) goes on to the pick's level select or the master picker; Back (or Escape) closes it. A locked challenge's card says what opens it and has only Back. The master picker's and the pick level select's Back return to the card (`#/challenges?group=<id>&open=<challenge id>`).
- The goal card (since 2026-10-20): every challenge level starts behind a card over the board with the goal in its title, the goal sentence and, in a run, "Level 2 of 3: Kite Tails". The level waits (no tick runs) until one click, tap or key puts it away; that input does nothing else, so it never fires the cannon. It shows where the level would otherwise start: each level of a run, and every new run (Try Again, Restart Challenge, Play Again). It is the only thing allowed to wait on the board while aiming.
- In play the right window is the goal tracker for the whole level (since 2026-10-20; the window's value may be text): more orange and short stocks "Orange Left" with "14 / 26"; a full clear "Pegs Left" with the pegs and bricks not hit yet; a score goal on one level "To Beat" with the target; a run "Run Total" with the total so far, or "412,000 / 750,000" against a combined target. The left window holds the level score, "Level 2 of 3" in a run. When the score window counts past a score goal in a level still to be won, a TARGET REACHED callout ("Now beat the level", or "Now beat every level" before a run's last) stands near the top right for about a second (500 ms hold, gone 1.1 s after it starts); the winning shot's Fever and the end dialog cover the rest. Pause offers Restart Challenge, which starts a new run, and Challenges. A won level of a run goes on through the level complete dialog (Next Level, with the run's total). The end of a run has its own dialog: Challenge Complete! or Challenge Failed, the card's title and the goal sentence, result rows and why in plain words ("You scored 287,000. You needed more than 300,000."; "The balls ran out on Kite Tails, level 2 of 3, with 4 orange pegs left."; "You won with 93% of the board cleared. Every peg and brick has to go."); passed offers Challenges and Play Again, failed Try Again and Challenges.
- The stage intro card's squares, one per group shown (11 with stages 1 to 5): a group with an open challenge lit in its color with its number and a pip per shown challenge, gold once passed, and the medal when all are; a group with none open dimmed with a lock. Above them, the number passed of those shown, or which level opens the first ones ("Beat Balloon Morning to open them").
- Self-play tools: the original's levels play with its own 25 orange drawn uniformly by default. Since 2026-10-15 they had played with 20 and the weighted draw, which put its stage 1 at 68%; at 25 uniform they give `src/agents/bands.json`'s rates again (51%, 43%, 30%, 54.5%, 18%). `orangeDraw` ('weighted' or 'uniform') is an optional field at the end of the attempt config, absent unless set, so every earlier config, record and golden digest stays as it was; only the tools set it, and `npm run agents:report` takes `--draw`.

Decided in the backgrounds on 2026-10-17. A level's picture is recorded in its source (`background.picture`, `pictureSchema` in `src/gen/campaign-source.ts`), the stage looks in `campaign/stages.json`; the search, import and processing are `npm run campaign:art` (`tools/campaign/art.ts`, `sources.ts`, `look.ts`), the asset manifest's background tables come from `tools/campaign/manifest.ts`, and `tools/campaign/backgrounds.test.ts` checks the shipped files against the sources and the manifest. This replaces the generated pictures and their prompts (campaign pipeline above).

- Sources: found images only, from sites that need no account or a free key: Pexels (its API, with the key in `.env.local`, read only by Node tools and never printed; at most 190 requests an hour, each logged), Pixabay (its search pages read in Chromium; files up to 1280 px wide), wallhaven (keyless API, safe for work only), Openverse and Wikimedia Commons (keyless APIs). Searches and downloads are cached under `reference/teggle-art/`, so a rerun asks no source twice. The 55 shipped pictures: 44 Pexels photos, 6 Pixabay illustrations, 4 wallhaven paintings and 1 wallhaven photo.
- The record: the source's ref, painting or photo, the site, page and file URL, title, author and license where the source gives them, the fetch date, the downloaded file's SHA-256 and pixel size, the crop, the mirroring and the level's own changes to its stage's look. Processing always starts from the recorded bytes; a cached file with another hash stops the tool.
- Choosing: a picture shows the level's subject in its stage's world, has large shapes the lines can follow, a calm area under the cannon and plain lower corners, and no people, animals, characters, faces, logos or text; none copies a scene of the original. Where the free sources have no picture of the planned subject, the level follows the picture it gets: stage 2's burrows in cross-section became the gopher's garden above ground, renamed to what the pictures show. `background.prompt` is the brief of the shipped picture: what it shows and where, in fractions of the picture, for tracing and for finding a replacement.
- Readability: each picture is checked at the logical canvas size under a grid of pegs of all four colors and lit pegs (`npm run campaign:art -- sheet --pegs`). One whose pegs do not read is lightened through its adjustments, or replaced when that is not enough. On 2026-10-17: 2-2's road under a tree arch (dark greens under the pegs, no fork) was replaced by a forked lane; 2-1's dark treeline was lifted (floor 0.26); 2-4 was cropped to the middle three quarters of the photo, so the two curls fill the board's middle, and lightened (brightness 1.1, gamma 1.15, floor 0.24); 11-5's night sky was lifted to a medium gray-teal and its green aurora paled (brightness 1.25, gamma 1.25, floor 0.3).
- Crop: the largest crop at the shipped aspect (2732 / 1644), centered, unless the level places it; a crop is x, y and width in the file's pixels, the height following from the aspect. Mirroring is possible and unused.
- Processing (one ImageMagick pipeline): crop, mirror, Lanczos to half the shipped size, softening by kind (paint 1 for a painting, 2 for a photo: a selective blur of radius 2 x paint at 12% contrast, then Kuwahara at radius paint), Lanczos to 2732 x 1644, a Gaussian blur of 1.2 x paint, brightness and saturation, the stage palette's gradient map (shadow, middle, light) dissolved in at the tint, gamma, then the values squeezed into the floor-to-ceiling range. One thread (`MAGICK_THREAD_LIMIT`), which gives the same bytes as any other count and keeps a batch quiet.
- Looks: one per stage, its numbers in `docs/assets.md`; a level changes as few of them as possible.
- Size: WebP from cwebp (method 6, sharp YUV, no metadata) at the highest quality from 40 to 92 within 300,000 bytes. Every picture fits at 92. ImageMagick 7.1.2-33 and cwebp 1.6.0 made the shipped bytes; other versions may give other bytes, which the manifest's SHA-256 shows.
- Manifest: `docs/assets.md`'s two background tables are printed by `npm run campaign:art -- manifest`; the test fails when a shipped file, a source and the tables disagree, and when a file in `public/backgrounds/` belongs to no level.

Decided in stages 1 and 2 on 2026-10-17. Sources in `campaign/levels/1-*.json` and `2-*.json`, lines in `public/levels/campaign/<id>.lines.json`; measured with `npm run agents:report -- <stage> --tier noisy --runs 200 --workers 1` (the reference agent, noisy greedy at 0.03 rad, 20 orange with Teggle's draw).

- Stage 1 re-traced onto its found pictures with the same counts, splits and archetypes: 1-1's envelope grid, rings and the pennant strings follow the new balloons, its ramps lie on the side balloons and its basket blocker sits under the big balloon's basket; 1-2 follows one train of five kites whose tails loop to the left (one kite train in place of two kites, the tails still long brick slides); 1-3's crown, side trees and hill follow the blossoming tree on its hill, the side rocks becoming mounds of the hill; 1-4's sails, hull and jib follow the drawn ship, the stern sail getting a brick trailing edge; 1-5's rings follow the two big and three small seed heads. Clear rates at 40 runs: 45%, 23%, 33%, 43% and 33%, inside the stage 1 band (18% to 54.5%).
- Stage 2 is traced on its pictures with outline lines only: the plinko field of 2-1 is a lattice fill inside the field, 2-4's twin spirals are traced on the fiddleheads and 2-5's architecture is traced on the house, since the templates would build their shapes where the pictures have none.
- Shelters: a solid traced from the picture above objects near the cannon is the strongest difficulty lever found. Teggle's orange pegs gather near the cannon and each other (14.1), so open pegs and brick slides there are lit several at a time; a solid over them turns the ball away, and an object under it is reached only from below or the side. In trials, one sheltered peg on a cap took 2-3 from 40% to 25%, and solids over both of 2-4's halos took it to 0%. The stage 2 levels use them where the picture has a shape for one: 2-1 two short rails at the field's far edge, 2-2 the inner hedge tops, 2-3 a rim over each mushroom cap, 2-4 the right curl's rim where it faces the cannon, 2-5 the sod roof's ridge. A solid's top is peaked or sloped, never flat, since a ball rests on a flat top and touches nothing that scores.
- Brick rows a ball can ride or rattle between (stacked courses, a long ridge under the cannon) light many bricks per shot and earn free balls from the score thresholds; 2-5's lower courses are single stones with gaps.
- Measured clear rates (200 runs each, 95% intervals about 6 points either way): 2-1 33%, 2-2 32%, 2-3 32%, 2-4 32% and 2-5 28%, a stage mean of 31.4%, every level inside the band of 24% to 33.5%; the opener is the easiest and the finale the hardest. The targets were 32%, 31%, 30%, 29% and 27%; the three middle levels sit within the noise of each other.

Decided in stage 3 on 2026-10-20. Sources in `campaign/levels/3-*.json`, lines in `public/levels/campaign/<id>.lines.json`; measured with `npm run agents:report -- 3 --tier noisy --runs 200 --workers 2`.

- Stage 3 follows its found pictures with the planned names, counts, splits and feature: 3-1 an old town's rooftops around a clock tower (in place of a row of five gables), 3-2 three paper lanterns on a wire against the sky (in place of a wire between chimney stacks), 3-3 a white bell tower over a town square with a church and houses (no side towers, bridges or bell), 3-4 laundry on one washing line across a house front (one line in place of four), 3-5 a house's gable with two striped awnings side by side (in place of a zigzag of four awnings a side).
- 3-2's lanterns: sixteen pegs travel one lap per 4,000 ticks around a figure eight 530 px wide and 300 px high that crosses itself at the red paper lantern. Its loops run 913 and 810 px, 1,724 px in all, so lanterns 107.7 px apart pass the crossing at least 37.9 px apart, center to center.
- Shelters set the difficulty again: 3-1 the clock tower's narrow lantern (widened over both belfry pegs it took the level from 40% to 24%), 3-3 the spire's foot over the belfry, 3-4 the window lintels and the eave as solid ledges and the cable as a rod over the pegs nearest the cannon, 3-5 solid awning tops over the brick stripes. 3-2 needs none, since its lanterns sweep the board's middle.
- A dense peg row under the cannon carries a ball along it and lights many pegs per shot: 3-4 first cleared 53 to 56%; its washing line's pins spaced 44 px (kept by count fitting) and the ledges brought it to 32%.
- A solid band across the board under the cannon is too strong: on 3-5 a solid course under the gable's peak took the level to 4 to 12%, and a small solid at the peak to 15 to 24%. The course stays a brick row; the solid awning tops took 3-5 from 61 to 66% to 29%.
- Measured clear rates (200 runs each): 3-1 40%, 3-2 30%, 3-3 30%, 3-4 32% and 3-5 29%, a stage mean of 32.2%, every level inside the band of 23.5% to 49.5%; the opener is the easiest and the finale the hardest. The targets were 34%, 29%, 30%, 26% and 27%; 3-1 and 3-4 sit 6 points over, at the edge of the interval (with seeds 2 and 3, 3-1 gave 33% and 35%, 3-4 28% and 26%).

Decided in stage 4 on 2026-10-20. Sources in `campaign/levels/4-*.json`, lines in `public/levels/campaign/<id>.lines.json`; measured with `npm run agents:report -- 4 --tier noisy --runs 200`.

- Stage 4 is traced on its pictures. 4-3's picture, a single comet, had no shapes for 82 bricks and was replaced by a meteor shower of parallel streaks (wallhaven 0j1zym). The levels keep their names, counts and features.
- 4-2 builds its wheel from traced lines instead of the rotating template, because the station's docking disc sits at two thirds of the width. The wheel is a group on rotateAroundCircle (period 2400): four rim arcs of curved bricks and six spoke pegs around a still hub peg. Its slots are 31 px; with 17 px slots a ball inside waited for a slot and the stuck check found it touching nothing that scores. The big ring's deck lights travel around inside its static hull (period 3000).
- A train of bricks traveling around an ellipse as elongated as 4-2's ring fails the moving lines' gap check by hundredths of a px (12.49 against 12.5) at every size tried; only 108 by 134 and rounder pass, so 4-2's hull stays static and its deck travels as pegs.
- 4-5's wheel is the rotating template's single wheel in the region middle at radius 123, centered at (458, 283) on the nebula's bright shell, turning in 1200 ticks. At 2400 a ball inside waited up to 600 ticks for a slot at the bottom, and the stuck check found trapped balls.
- Closed brick rings turn into bowls once their lit bricks leave at shot end, and balls rest inside them. 4-3's comet heads and 4-4's moons are rings left open underneath by 40 degrees and need no quick disappear. A small ring needs a centerline radius of 40 (13 curved bricks); at 35 it breaks into pieces.
- Shelters set every level's difficulty, and their width is a fine lever: 4-1 a solid rim where the ring crosses in front of the planet (71% to 33%); 4-2 the cylinder's top (40% to 32%); 4-3 the high comet's tail (the whole tail 11%, its upper two fifths 51%, its upper three fifths 31%); 4-4 the top of the star-trail arch (35% to 22%); 4-5 a thin arc of the bright shell over the wheel (over 102 degrees 3%, over 40 degrees 38%, over 54 degrees 24%).
- The sparse pictures of 4-1 and 4-3 get faint stars, sparks and small meteors to reach their counts; 4-5 has one outer-edge brick at the lower left without a mirror, to land on 127 bricks.
- Measured clear rates (200 runs each): 33%, 29%, 31%, 22% and 24%, a stage mean of 27.8%, every level inside the band of 17.5% to 39%; the targets were 34%, 28%, 30%, 26% and 23%.

Decided in stage 5 on 2026-10-20. Sources in `campaign/levels/5-*.json`, lines in `public/levels/campaign/5-*.lines.json`; measured with `npm run agents:report -- 5 --tier noisy --runs 200 --workers 2` (the reference agent, noisy greedy at 0.03 rad, 20 orange with Teggle's draw).

- Pictures: 5-1's planned photo (one pier in steep perspective, swimmers, a beach bar with a sign) was replaced by an aerial photo of a harbor mouth between two stone breakwaters (Pexels 16156389, brightness 1.08, floor 0.22). 5-3 is cropped to its two net racks and their reflection (crop 570,747, width 4441). 5-4 is cropped so the wheel's hub sits at (458, 346), where the rotating template centers a single wheel of radius 160 (crop 136,413, width 2902). 5-2 and 5-5 are traced on their pictures as found.
- 5-1's rings are the platforms template's floaters in the bottom region with one row (float radius 16, period 1600): four rings at 20, 40, 60 and 80% of the width and three quarters of the height. The open sea above the breakwaters is a lattice fill inside a traced area.
- 5-2's boat lies diagonally, so its group's horizontalCycle is turned to the hull's heading (pathRotation 1, radius 60, period 1600) and the boat glides forward and back along itself. Its 21 pegs keep their spacing, so count fitting never changes the moving unit.
- 5-4's wheel has six spokes, not the photo's eight: with eight, the template's innermost spoke pegs come 6.4 px apart. The template's wheel is the rim's inner ring; the outer ring is three brick arcs on each side, with gaps, outside the turning ring's swept zone.
- Every part of a turning wheel has the hub's position in the level file, so the orange draw treats them as one point and puts most orange pegs on 5-4's wheel (11 to 13 of 20 in simulated draws). A peaked solid crown over the top of the turning ring, from 69 to 111 degrees around the hub, took 5-4 from 44% to 28%. A crown from 64 to 116 degrees gave 21%, one from 74 to 106 degrees 33%. Lowering the wheel to radius 160 is what made room for the crown outside the cannon's clearance.
- Open space under the cannon works like a shelter. 5-2 with wave rows from wall to wall cleared 46 to 57%; with the water under the cannon open (swell only in the top corners, wave rows from 44% of the height down) it cleared 26%. 5-5 cleared 33% as first traced; two short cloud rows at the far left, so that count fitting adds no pegs to the middle rows, and the blue cloud row starting at two thirds of the width brought it to 25%. 5-5's roof is a peaked solid over the gallery's middle peg.
- Nearly level brick rows trap balls: 5-4's right bulwark rows left four stuck spots that three rounds of the checks could not clear. Sloped 5 degrees toward the wall, they leave none.
- Measured clear rates (200 runs each, 95% intervals about 6 points either way): 5-1 32%, 5-2 26%, 5-3 28%, 5-4 28% and 5-5 25%, a stage mean of 27.8%, every level inside the band of 24% to 60%; the opener is the easiest and the finale the hardest. The targets were 31%, 26%, 29%, 27% and 25%.

Decided in the original's levels on 2026-10-20 (14.1, "The original's levels"). The import is `tools/original/` (`npm run original:import`), the converter `tools/agents/original.ts`, the manifest format `src/level/original.ts`, the section's routes and host `src/game/modes/routes.ts`, `original.ts` and `hosts.ts`, the narrow machine `machineLayout` in `src/game/layout.ts`.

- Picture: 646 x 543 at board (3, 12), the original's window (78, 52), the top left corner of its frame's opening. No level file places it; it was measured by matching the pictures and the static pegs against the original's own cached thumbnails (`levels/cached_thumbnails/`): over five 400-wide thumbnails the pegs map at scale 0.654 with offset (-14.1, -10.5) and the pictures at 0.655 with (-12.0, -2.75), which puts the picture at board (3.2, 11.9). The two pictures made for the whole 800 x 600 window (4-2 and 11-1) match at window (0, 0) and are cropped to the same rectangle. Shipped unprocessed, WebP at quality 92 (`docs/assets.md`).
- Frame: a board narrower than 916 brings the machine in by (1066.67 - width - 150) / 2 on each side, 133.33 for the original's board: its 800-wide frame with the board 75 in from the frame's edge and the opening on board x 3 to 647, as in the original. The ball counter, menu button and corner pieces move right, the Fever meter and hold button left, the score windows shorten toward the housing, and the bars beside the frame take the theme's dark color, the letterbox's. The Fever buckets and flippers span the board itself; the free ball callout and the callouts' screen limits move in with the frame. Teggle's 916 levels keep the full-width frame unchanged (same pixels apart from the moving bucket in a frame-by-frame comparison).
- Visibility: the converter keeps the original's hidden solids hidden, since its pictures show them (6-3's five bumpers, the side ramps of 1-1 and 1-5, 1-3's platforms, 10-3's divider); teleports stay drawn, since the images that mark them in the original are not carried over. Visibility does not touch the simulation.
- Names: from the original's `stages.cfg`; its stage 6 gives none, so those five show their file names.
- Play: Quick Play's flow with the player's masters (the stage's own master first, as in Quick Play), 25 orange drawn uniformly, greens and purple as in Quick Play. Records live in the save's `original` table, keyed like the campaign's ids; a save without it reads as having none. The service worker does not precache `public/original/` (2.5 MB of pictures, 0.7 MB of levels); the section loads it from the network.

### 14.3 Still open

- Duel ball count: 6 in the PC 1.01 code, 5 in the patent (Duel is post-MVP)

## 15. Level data (base game campaign)

Round pegs and bricks per level, from each level's fan wiki infobox. Stage 11 is the Master levels.

```csv
stage,level,master,round_pegs,bricks,total
1,1,Unicorn,96,0,96
1,2,Unicorn,59,34,93
1,3,Unicorn,97,0,97
1,4,Unicorn,66,32,98
1,5,Unicorn,102,0,102
2,1,Gopher,112,0,112
2,2,Gopher,56,44,100
2,3,Gopher,58,48,106
2,4,Gopher,47,52,99
2,5,Gopher,42,74,116
3,1,Cat,77,23,100
3,2,Cat,66,34,100
3,3,Cat,75,33,108
3,4,Cat,100,0,100
3,5,Cat,37,67,104
4,1,Alien,38,66,104
4,2,Alien,74,30,104
4,3,Alien,44,58,102
4,4,Alien,40,60,100
4,5,Alien,24,90,114
5,1,Lobster,57,45,102
5,2,Lobster,104,0,104
5,3,Lobster,100,0,100
5,4,Lobster,51,68,119
5,5,Lobster,100,0,100
6,1,Pumpkin,44,63,107
6,2,Pumpkin,123,0,123
6,3,Pumpkin,100,0,100
6,4,Pumpkin,105,0,105
6,5,Pumpkin,63,70,133
7,1,Sunflower,78,32,110
7,2,Sunflower,43,51,94
7,3,Sunflower,0,90,90
7,4,Sunflower,0,100,100
7,5,Sunflower,24,78,102
8,1,Rabbit,36,77,113
8,2,Rabbit,21,78,99
8,3,Rabbit,34,60,94
8,4,Rabbit,49,60,109
8,5,Rabbit,30,72,102
9,1,Wyvern,30,96,126
9,2,Wyvern,38,66,104
9,3,Wyvern,58,48,106
9,4,Wyvern,0,108,108
9,5,Wyvern,103,0,103
10,1,Owl,75,24,99
10,2,Owl,30,90,120
10,3,Owl,87,0,87
10,4,Owl,46,86,132
10,5,Owl,126,0,126
11,1,Master,0,134,134
11,2,Master,0,134,134
11,3,Master,100,0,100
11,4,Master,85,0,85
11,5,Master,131,0,131
```

## 16. Sources

**Game rules and level data**
- [US Patent 8,398,476 (Justia)](https://patents.justia.com/patent/8398476), [Google Patents](https://patents.google.com/patent/US8398476B1/en)
- [Wikipedia: Peggle](https://en.wikipedia.org/wiki/Peggle)
- Fan wiki: [Purple Peg](https://peggle.fandom.com/wiki/Purple_Peg), [Style Shots](https://peggle.fandom.com/wiki/Style_Shots), [Scoring System](https://peggle.fandom.com/wiki/Scoring_System), [Fever Meter](https://peggle.fandom.com/wiki/Fever_Meter), [Duel Mode](https://peggle.fandom.com/wiki/Duel_Mode), [Masters](https://peggle.fandom.com/wiki/Peggle_Masters), [Base game](https://peggle.fandom.com/wiki/Peggle_Deluxe), [Expansion](https://peggle.fandom.com/wiki/Peggle_Nights), [Base game challenges](https://peggle.fandom.com/wiki/Peggle_Deluxe/Challenges), [Expansion challenges](https://peggle.fandom.com/wiki/Peggle_Nights/Challenges)
- [PeggleEdit fan editor](https://github.com/IntelOrca/PeggleEdit)
- [TCRF: unused levels](https://tcrf.net/Peggle_Deluxe_(Windows,_Mac_OS_X)/Unused_levels)

**Design history**
- [PC Gamer: the making of, page 2](https://pcgamer.com/the-making-of-peggle/2)
- [Gamezebo: how a spark started a fever](https://www.gamezebo.com/news/peggle-how-a-spark-started-a-fever/)
- [Shacknews: expansion release](https://www.shacknews.com/article/54771/peggle-sequel-officially-released-conquers)

**Physics**
- [Rapier determinism docs (JavaScript)](https://rapier.rs/docs/user_guides/javascript/determinism) (listed, not read)

**Level generation and AI playtesting research**
- [Togelius et al., Search-based PCG survey (2011)](https://course.ccs.neu.edu/cs5150f13/readings/togelius_sbpcg.pdf)
- [Shaker et al., Cut the Rope level evolution (AIIDE 2013)](https://ojs.aaai.org/index.php/AIIDE/article/view/12690)
- [Stephenson and Renz, Angry Birds level generation (AIIDE 2016)](https://users.cecs.anu.edu.au/~jrenz/papers/stephenson-renz-aiide16.pdf)
- [Khalifa et al., PCGRL](https://arxiv.org/pdf/2001.09212v2)
- [Isaksen and Nealen, difficulty via simulated players](https://cdn.aaai.org/ojs/12846/12846-52-16362-1-2-20201228.pdf)
- [Gudmundsson et al., human-like playtesting (King)](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf)
- [Roohi et al., difficulty with AI players (Rovio)](https://arxiv.org/abs/2107.12061v1)
