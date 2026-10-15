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

Challenges start unlocking after stage 3 and are fully unlocked after the campaign.

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

Most art is generated with Claude Code's help. Level backgrounds may reuse the original's backgrounds where they are free to use, never art made by the original developer.

- **Backgrounds:** none of the original's are free to use. The publisher's making-of credits every level background to its own artist (`docs/research/original-tech.md` section 7). All Teggle backgrounds are therefore generated.
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
| Determinism basis | Verified against the ECMA-262 text: `Math.sin`, `cos`, `atan2`, `exp`, `pow`, `hypot` and `**` are implementation-approximated; `Math.sqrt`, `round`, `abs`, `imul` and basic arithmetic are exact. Measured: native sin/cos/atan2 over 24,000 inputs give different bits in V8 (Node) and JavaScriptCore (Bun); Teggle's ports in `src/core/dmath.ts` give identical bits. |
| Target browsers | Chromium, WebKit (Safari) and Firefox, plus Node for headless runs. |
| Mobile orientation | Landscape. Portrait shows a prompt to rotate. |
| Touch controls | Fine aim by dragging at reduced sensitivity. Bucket speed-up by holding an on-screen button between shots. |
| Lines in the editor | A line produces either bricks or round pegs, chosen per line. |
| Art and audio sources | Master characters, backgrounds without a free original and other art are generated. Sound effects are synthesized. "Ode to Joy" is synthesized from the public-domain score. Every asset's source is recorded in an asset manifest. |
| Undocumented constants | Set by tuning and recorded in section 14.2 as they are chosen. |

### 14.2 Rules not documented in any source

Each is decided during implementation and its value recorded here.

- Whether green and purple pegs must come from pegs flagged "can be orange"
- Whether a multiplier step during a shot raises the value of pegs hit later in that same shot
- Unit of the aim guide length (the length is 40, or 80 with Guide)
- Stuck-ball timeout, and which peg is removed first
- Fever zoom and trigger distance (slow motion defaults to 0.25x in the decompiled code)
- Exact style-shot detection rules (how Long Shot distance is measured, what counts as a slide)

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
- Fever zoom: toward the first ball, 1.5x over 0.55 s while closing in, then 2x over 0.5 s after the hit, back to 1x over 0.26 s. The machine fades out by 1.14x and a thin frame replaces it; the camera stays inside the playfield opening.
- Shot end: the tally's first line fades in over 170 ms; the first lit peg pops 12 ticks after the ball leaves, the rest clamp(8 - remaining/10, 1, 5) ticks apart; the finished tally holds 25 ticks before the purple peg moves and the next ball loads. Pegs removed during the shot (quick disappear, stuck ball) pop as they go and count in the tally.
- Coin flip: the coin spins 1.3 s (the length of the original's spin sound) and shows its face for 1.1 s; a won ball joins the counter when the face shows.
- Click jitter: a mouse click within 10 ticks of the barrel leaving an angle it held for 30 ticks fires at that angle only if the barrel moved less than 1 degree, so deliberate quick swings fire where they point.
- Touch: a finger points the cannon at itself; dragging turns the aim by 0.001 rad per world unit of drag across the aim line; a tap (under 7 units of movement and 350 ms) fires as soon as the barrel points at it; a tap on the launcher fires without re-aiming.
- Fast forward (8x) runs only between shots; the original's in-shot speed-up is a cheat toggle.

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
- Lucky Spin's wheel turns for 2.8 s in all over the playfield while the board waits; the rules events after the spin (a free ball, lit pegs) show once it stops.
- Power labels: the name, then "NEXT 3 TURNS", "5 TURNS", "THIS TURN" or "+3 TURNS" for lasting powers, "N PEGS" or "N ORANGE" for Space Blast and Flower Power. The banner over the launcher lights and the portrait glows while an effect runs or waits, and for the rest of a shot in which a green peg lit; the turns counter shows the shots left of the master's effect.

Decided in the campaign pipeline on 2026-10-15. Sources live in `campaign/`; the code in `src/gen/lines.ts`, `src/gen/templates/solids.ts` and `fill.ts`, `src/level/campaign.ts`, `src/game/play/backdrop.ts` and `tools/campaign/`.

- Lines: a lines file (`public/levels/campaign/<id>.lines.json`, next to the level) names the picture it was traced on and the board size, and lists lines in board coordinates. A line has an id, a note on what it follows, a mode (bricks or round pegs, 14.1), open or closed, control points at least 1 px apart, the indices of sharp corners, and for pegs a spacing (34 to 80, default 41, the original's median).
- Line smoothing: a centripetal Catmull-Rom spline through every control point (knots step by the square root of each chord, so it never loops or cusps between two points). A corner ends the spline and starts a new one; a run of two points is a straight segment, and points in a straight row stay straight; the ends of an open run continue along their last chord. The curve is sampled at most 2 px apart, with square roots and arithmetic only, so it is the same in every engine. It replaces the outline template's Chaikin smoothing (generator 1.1.0).
- Straight or curved bricks: the brick chain rule above, applied to the smoothed line: a brick is straight where the line bulges less than 0.35 px over its length (a radius above about 440 for a 35-long brick), curved elsewhere. A traced straight stretch is exactly straight, so it always gets straight bricks.
- Solids traced from a picture (ramps, blockers, platforms) are explicit polygons, rods and circles in the recipe, placed before the lines; one that does not fit (gaps, cannon, board limits) stops the build.
- A fill can stay inside an area of the picture, a closed line smoothed like the others: lattice points whose mirror twin also lies inside. 1-3's crown of blossoms uses it.
- Object counts: every campaign level has exactly its spec 15 count times 1.409, rounded (stage 1: 135, 131, 137, 138, 144), and levels with bricks keep their original's split rounded the same way (1-2: 83 pegs and 48 bricks; 1-4: 93 and 45). The build writes no level that misses its count, has fewer than 58 can-be-orange objects or keeps a stuck spot.
- Background pictures cover the playfield opening (910.67 x 548 world units) at 3 px per unit, twice the logical canvas: 2732 x 1644. They are generated with gpt-image-2 at 2400 x 1440 (inside its non-experimental sizes), scaled with Lanczos to cover and center-cropped, then saved as WebP at the highest quality within 300,000 bytes (cwebp, method 6, sharp YUV), as `public/backgrounds/<background id>.webp`. Asset ids are lowercase words joined by hyphens.
- Prompts: the stage's style text, the layout text every picture shares (open sky at the top center, a calm bottom strip, large smooth contours), then the level's subject, which places the large shapes in fractions of the picture so a picture made after the lines follows them.
- The play screen draws the picture into the opening over the plain field, once per resolution into a cached layer under the static pegs; a missing or broken picture leaves the plain field. The Fever zoom scales that layer like the rest of the static picture; the picture is not redrawn at the higher zoom.
- Stage 1's world is the Cloud Isles: a pale, softly painted sky above the clouds with calm light-to-mid values where pegs sit and no large areas of saturated green, orange or magenta, so all four peg colors stay readable (checked over a style test in the play screen; a saturated green crown hid green pegs).
- Level 1's ramps are rods lying on cloud tops near the walls, sloping toward the middle; its blocker is the balloon's basket, a polygon with a peaked top (a flat top held a resting ball).

### 14.3 Still open

- Duel ball count: 6 in the PC 1.01 code, 5 in the patent (Duel is post-MVP)
- Difficulty on the 16:9 board. With 25 orange pegs and 10 balls, a noisy greedy agent (best of 40 angles, 0.03 rad aim error, 30 runs per level) clears the original stage 1 round-peg levels 20 to 53% of the time on their 650 board, and Teggle's stage 1 0 to 3%. The original 1-1 alone drops from 40% to 10% when its pegs are only centered on the 916 board. Whether to compensate (balls, orange count, side structures that turn balls back toward the middle) is open.

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
