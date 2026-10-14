# Teggle: Product Spec

Oct 14, 2026 · @Tim Anthony Alexander

## Overview

Teggle is a pachinko-style shooter, played solo except in Duel: the player fires a ball from a cannon at the top of the screen into a board of about 100 pegs and must hit all 25 orange pegs within 10 balls. It is a private rebuild for personal play, not for publication.

**Reference product.** The rules below follow the original 2007 PC game and its 2008 expansion as closely as the sources allow. Later sequels and mobile spin-offs changed several rules; where they differ, this spec follows the 2007/2008 version and says so.

**Platform.** Web. The board is 16:9 (the original is 4:3). On mobile the game runs fullscreen in the browser; on desktop the board fills the viewport.

**Naming.** The original brand name and its branded terms are not used. Original term mapping:

| Original concept | Teggle name |
| --- | --- |
| The game | Teggle |
| Ball counter on the left (glass tube device) | Ball counter |
| Moving catcher at the bottom | Free ball bucket |
| Score multiplier gauge on the right | Fever meter |
| End sequence after the last orange peg | Fever |
| Fever after every peg is cleared | Full Clear Fever |
| Ten character mentors with powers | Masters (renamed below) |

**Evidence levels.** Numbers marked *verified* come from the publisher's patent or from pages that were opened. Numbers marked *estimate* are not documented anywhere that was found and need tuning by feel.

## Core loop

The player wins by hitting all 25 orange pegs before the 10 balls (plus any free balls) run out; otherwise the level restarts with a new random color assignment.

&#91;embedded content: Core loop · one shot per ball\]

A green peg hit during the bounce phase triggers the current master's power. Fever starts the moment the last orange peg is hit, while the ball is still in play.

## Pegs

Every level has the same color mix: 25 orange, 2 green, 1 purple per shot, and blue for everything else (*verified*, patent). The layout is fixed per level; the colors are assigned at random every time the level starts, including retries.

| Type | Color | Count per level | Base value | Role |
| --- | --- | --- | --- | --- |
| Orange | Orange | 25 | 100 | Win condition: all must be hit. Each hit advances the fever meter. |
| Blue | Blue | All remaining (57 to 106 in the campaign) | 10 | Filler and score. |
| Green | Green | 2 (from level 3 of the campaign) | 10 | Triggers the current master's power when hit. |
| Purple | Purple | 1 per shot (from level 4) | 500 | Bonus peg. Moves to a different blue peg after every shot. |

**Shapes.** Each colored object is either a round peg or a brick. Bricks are straight or curved rectangles (fan editor defaults: 30 long, 20 wide, curved bricks defined by radius and sector angle). Bricks score like round pegs of the same color (*estimate*: no source gives a separate value). Across the 55 campaign levels, 42% of colored objects are bricks; 17 levels use only round pegs and 5 use only bricks.

**Color assignment rules.**

- The designer marks which pegs may become orange. Pegs that are hard to reach are excluded (*verified*, fan editor docs).
- The game picks the orange pegs at random from the eligible set, then turns 2 of the remaining blue pegs green and 1 purple. Whether green and purple are also limited to eligible pegs is not documented.
- On the first campaign play of some levels, the green pegs are placed by the designer. In Quick Play they are random again.
- Challenges can raise the orange count (35, 45, 55), so a level used in a 55-orange challenge needs at least 55 eligible pegs plus at least 3 more pegs for green and purple. The fever meter stays frozen until 25 orange remain.

**Hit state.** A hit peg lights up (brighter version of its color) and stays on the board until the ball leaves play. Then all lit pegs disappear together. A ball can hit the same lit peg again during the shot, but it scores only once (*estimate*: consistent with the scoring formula, not stated explicitly).

**Non-scoring objects.** Levels also contain solid shapes that never break: blockers, rods (thin barriers), polygons, bumpers, and from level 48 portals that move the ball elsewhere on the board.

## Balls, cannon and bucket

The player starts each level with 10 balls and gets more only through the bucket, high-scoring shots, or a coin flip after a shot that hits nothing (*verified*, patent).

**Cannon and aiming.**

- Fixed position at top center. The angle follows the mouse; mouse wheel or arrow keys fine-tune it.
- An aim guide shows the first stretch of the curved path. It does not show bounces unless the guide power is active.
- Launch speed is constant; the path curves under gravity. No source gives speed, gravity or the guide length (*estimate*, tune by feel).

**Ball counter.** Shows balls left on the left side. Warnings appear at 3, 2 and 1 balls left. Its glass tubes fill with green light during a shot and reach the top at 25,000 shot points.

**Free balls.**

| Source | Rule | Value |
| --- | --- | --- |
| Bucket catch | Ball lands in the moving bucket | +1 ball |
| Shot score 25,000 | First threshold in one shot | +1 ball |
| Shot score 75,000 | Second threshold | +1 ball |
| Shot score 125,000 | Third threshold | +1 ball |
| Coin flip | Shot hits zero pegs; a coin spins | +1 ball on a win (odds unpublished) |

Style points do not count toward the shot-score thresholds. Multiball spawns and the bucket can stack with the thresholds; fans report up to 6 free balls from one shot (*unverified*).

**Free ball bucket.** Slides left and right along the bottom at a steady pace and reverses at the walls. Holding the right mouse button between shots speeds it up. During Fever the bucket is replaced by the Fever buckets.

## Scoring

A shot's score is the sum of the hit pegs' current values multiplied by the number of pegs hit, so long multi-peg shots grow much faster than linearly (*verified*, patent).

```latex
\text{shot score} = \left(\sum_{i=1}^{n} v_i\right) \times n
```

Patent example: 9 pegs whose values add up to 850 give 7,650 points. Style points are added on top and are not multiplied. Not documented: whether a multiplier step reached during a shot raises the value of pegs hit later in that same shot, or whether values are fixed at launch.

**Fever meter.** Hitting orange pegs raises a multiplier that applies to every peg type.

| Orange pegs hit | Orange left | Multiplier | Blue / green | Orange | Purple |
| --- | --- | --- | --- | --- | --- |
| 0 to 9 | 25 to 16 | x1 | 10 | 100 | 500 |
| 10 to 14 | 15 to 11 | x2 | 20 | 200 | 1,000 |
| 15 to 18 | 10 to 7 | x3 | 30 | 300 | 1,500 |
| 19 to 21 | 6 to 4 | x5 | 50 | 500 | 2,500 |
| 22 to 24 | 3 to 1 | x10 | 100 | 1,000 | 5,000 |
| Fever | 0 | fixed | 1,000 | none left | 10,000 |

**Level-end bonuses.**

- Each unused ball: 10,000.
- Fever bucket: 10,000 to 100,000 (next section).
- Campaign clear on the 1st try: 100,000; 2nd try: 50,000; 3rd try: 25,000; later: 0.

**Style shots.** Fixed bonuses for specific feats (values for normal play; Duel values are lower).

| Style shot (Teggle name) | Trigger | Points |
| --- | --- | --- |
| Bucket Bounce | Ball goes from exactly one peg straight into the bucket | 5,000 |
| Long Shot | Hits a non-blue peg, travels about 1/3 of the screen width, then hits another non-blue peg | 25,000 |
| Super Long Shot | Same, about 2/3 of the screen width | 50,000 |
| Double Long Shot | A third non-blue peg chained after a long shot | 25,000 |
| Off the Wall (expansion only) | Bounces off a wall, travels about 1/5 of the width, hits a non-blue peg | 25,000 |
| Bucket Kick | Bounces off the bucket rim and then hits the last orange peg | 25,000 |
| Lucky Bounce | Bounces off the bucket at least 1/4 of the screen height, then lands in the bucket | 25,000 |
| Bucket Streak | 5 shots in a row end in the bucket | 25,000 |
| Big Bucket Streak | 10 in a row | 100,000 |
| Long Slide | Ball slides along 12 pegs | 50,000 |
| Orange Rush | Many orange pegs in one shot (table below) | 50,000 |
| Clean Finish | Hits a peg, then the last orange peg, then the peg that clears the whole board | 50,000 |
| Double Power | Both green pegs in one shot | 25,000 |

Orange Rush threshold depends on how many orange pegs remain before the shot:

| Orange left | Must hit in one shot |
| --- | --- |
| 21 or more | 10 |
| 16 to 20 | 9 |
| 10 to 15 | 8 |
| 9 | 7 |
| 8 | 6 |
| 6 to 7 | 5 |
| 5 | 4 |

Master-specific style shots exist too: multiball extras 25,000, three free balls in one shot 100,000, bucket-power catch 10,000, flipper tricks 25,000, fireball tricks 25,000, lucky-spin tricks 10,000, lightning tricks 25,000 (fan wiki values, exact triggers not documented).

## Fever

Hitting the last orange peg starts Fever: the level is won, the shot continues, and the ball's final drop lands in one of five bonus buckets worth up to 100,000 (*verified*, patent).

**Sequence.**

1. As the ball approaches the last orange peg, the game slows to slow motion and the camera zooms toward the ball. The slow-motion factor, zoom amount and how early it triggers are not documented (*estimate*).
2. On the hit, the text "Fever" appears and Beethoven's "Ode to Joy" plays (public domain music). Fireworks and rainbow effects play over the board.
3. The ball keeps bouncing. Every remaining blue or green peg it hits is worth 1,000, purple 10,000.
4. The free ball bucket is replaced by five fixed buckets across the bottom.
5. When the ball drops in, the bucket value is added and remaining balls are converted at 10,000 each.
6. If that shot (or an earlier one) cleared every peg on the board, Full Clear Fever applies: all five buckets pay 100,000 and the level gets an "all pegs cleared" mark.

| Bucket | Left | Left-center | Center | Right-center | Right |
| --- | --- | --- | --- | --- | --- |
| Normal | 10,000 | 50,000 | 100,000 | 50,000 | 10,000 |
| Full Clear | 100,000 | 100,000 | 100,000 | 100,000 | 100,000 |
| Duel | 5,000 | 25,000 | 50,000 | 25,000 | 5,000 |

The designers deliberately made Fever random: it comes from pachinko "fever" modes, and the last peg was chosen as the climax to remove the frustration of hunting a single last peg (PC Gamer making-of).

## Masters and powers

Each campaign stage belongs to one master, and that master's power is what the 2 green pegs trigger; 10 masters in the base game, 1 more in the expansion. Original character names are replaced by the animal and the power.

| Stage | Master (animal) | Power | Effect | Duration |
| --- | --- | --- | --- | --- |
| 1 | Unicorn | Guide | Aim guide shows the full path through the first bounce. Nudging the aim near a peg edge changes the bounce angle. | 3 shots, starting with the next |
| 2 | Gopher | Multiball | A second ball spawns from the green peg that was hit. | Current shot |
| 3 | Cat | Pyramid | Bucket turns into a wider pyramid with long sloped edges, so balls are caught or deflected more often. | 5 shots, starting now |
| 4 | Alien | Space Blast | Lights every peg within a large radius around the green peg (radius undocumented, *estimate*). | Current shot |
| 5 | Lobster | Flippers | Two pinball flippers appear in the bottom corners, controlled with the mouse. | 3 shots, starting now |
| 6 | Pumpkin | Spooky Ball | When the ball falls out the bottom, it reappears at the top and keeps playing once. | Current shot |
| 7 | Sunflower | Flower Power | Lights about 20% of the remaining orange pegs, the ones nearest the green peg (fan wiki). | Current shot |
| 8 | Rabbit | Lucky Spin | A wheel spins and picks one of: bigger ball hitbox, triple score, a random other power, or an extra ball. Odds undocumented. | Hitbox and triple score: 2 shots |
| 9 | Wyvern | Fireball | Ball burns through pegs without bouncing off them. A metal dome covers the bucket. | Next shot |
| 10 | Owl | Zen Ball | The game replaces the player's shot with a better one it found by testing nearby angles. Search method undocumented. | Next shot |
| expansion 11 | Squid | Lightning | A grounding rod appears above the bucket; lightning runs from the first peg hit to the rod and lights the pegs along the line. | Next shot |

**Rules shared by all powers.**

- Hitting both green pegs in one shot gives a 25,000 style bonus. Not documented: what a green hit does while the same power is still running (extend Guide, Pyramid or Flippers; a second extra ball; a second Spooky return).
- In the final stage (Master levels) the player picks any unlocked master before each level.
- The expansion reorders the stages: Unicorn, Gopher, Pumpkin, Cat, Alien, Lobster, Sunflower, Wyvern, Rabbit, Owl, Squid, then Master levels.

Note for the generator requirement: the Zen Ball shows the original game already ran a shot search inside the game at runtime, so a self-play shot search is feasible at this scale.

## Campaign, challenges and modes

The base game has 55 campaign levels in 11 stages of 5, plus 75 challenges; the expansion has 60 levels in 12 stages and 60 to 65 challenges (*verified*, fan wiki; publisher materials say 60 expansion challenges).

**Campaign structure.**

- Stages 1 to 10: one master each, 5 levels each.
- Stage 11: Master levels, any master selectable.
- Green pegs appear from level 3, the purple peg from level 4, so levels 1 and 2 have blue and orange only.
- Failing a level restarts it with a fresh random color assignment.

| Stage | Master | Avg objects | Range | Features documented in that stage |
| --- | --- | --- | --- | --- |
| 1 | Unicorn | 97 | 93 to 102 | First level introduces ramps and blockers; 3 of 5 levels are round pegs only |
| 2 | Gopher | 107 | 99 to 116 | Spiral layout; brick-heavy last level |
| 3 | Cat | 102 | 100 to 108 | Pegs in an infinity shape that spin in a loop |
| 4 | Alien | 105 | 100 to 114 | Mostly bricks; last level 24 pegs and 90 bricks |
| 5 | Lobster | 105 | 100 to 119 | Moving elements, a moving fish shape |
| 6 | Pumpkin | 114 | 100 to 133 | Spiderweb layout with 123 round pegs |
| 7 | Sunflower | 99 | 90 to 110 | Rotating windmill bricks; floating circles; moving ground and brick wheels; two levels are bricks only |
| 8 | Rabbit | 103 | 94 to 113 | Brick-heavy throughout |
| 9 | Wyvern | 109 | 103 to 126 | One level bricks only (108); one round pegs only (103) |
| 10 | Owl | 113 | 87 to 132 | Portals introduced; wiggling double-helix strands |
| 11 | Master | 117 | 85 to 134 | Two levels of 134 bricks; spinning double helix |

Objects = round pegs plus bricks, from each level's fan wiki infobox. Per-level counts are charted in Level design and listed as CSV in the Level data tab.

**Challenges (base game, 75 in 15 groups of 5).**

| Group type | Goal |
| --- | --- |
| More orange | Clear 35, 45 or 55 orange pegs on a named level |
| Score cup | Beat 300k, 350k or 400k on a named level |
| Full clear | Clear every peg on a named level (two groups) |
| Duel | Beat a named master on a named level at Normal, Hard or Master AI |
| Multilevel | Beat 2 to 6 random levels in a row |
| Three-level duel | Cumulative score over 3 levels, 5 difficulty steps |
| Multilevel score | 750k to 1M over three named levels |
| Insane | 2 balls left; 1 ball; 3 levels with 10 balls total; 750k on any level; 10 random levels in a row |

The expansion adds challenge types with fewer balls (7 down to 3), score in 7 shots (225k to 325k), power-restricted levels, and stay-under-a-score goals. Challenges unlock after stage 3 and fully after the campaign.

**Other modes.**

- **Quick Play:** replay any completed level; green pegs are always random. A marker shows levels that were fully cleared.
- **Duel (post-MVP):** two players alternate shots on one board, 5 or 6 balls each depending on platform. Only one green peg at a time; no coin-flip free balls; a shot that misses all orange pegs costs 25% of the shooter's score; lower Fever buckets. If Duel is in scope, its Normal, Hard and Master AI opponents can be the noisy greedy agent at three error sizes, which makes Duel depend on the self-play stretch goal.
- **Expansion extras:** a target "ace" score per level and a trophy room (4 main trophies: finish campaign, finish challenges, clear all pegs on all levels, ace all levels).

## Level design

A campaign level is a hand-drawn background picture with 85 to 134 colored objects laid out to match it (median 103, mean 106), plus optional solid shapes and moving parts (*verified*, fan wiki infoboxes and fan editor).

&#91;embedded content: Fan wiki level infoboxes (round pegs and bricks), all 55 base-game campaign levels\]

**Board.**

- Game window 800 x 600. The fan editor draws level coordinates with an offset of (73, 43) inside that window; the area left of the board holds the ball counter and the right side holds the fever meter.
- Default round peg radius in the fan editor is 10 px; shipped levels are not confirmed to use it (*estimate*).
- Bricks default to 30 x 20 px; curved bricks are arc segments built from 4 curve points by default.

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

Every element has flags for collision on or off, visibility, draw layer, a bounciness multiplier and a "rolliness" multiplier (1.0 = default). Pegs carry two designer flags: **can be orange** (excluded on hard-to-reach pegs) and **quick disappear** (vanishes soon after being hit, used where a ball would otherwise get stuck, for example at the bottom of an arc).

**Movement.** Any element can move. Types: vertical or horizontal back-and-forth, circle, horizontal or vertical figure-eight, horizontal or vertical arc, rotate in place, rotate back and forth, wrap around the screen vertically or horizontally, rotate around a circle, retrace a circle. Parameters: period (in tenths of a second), two radii, phase, angle, speed in px/s, two pause points with durations, reverse, rotation offset. Movements can be nested: an element moves on an anchor that itself moves.

**Design principles stated by the original designers.**

- Static round pegs replaced an early prototype with 100 rotating crosses, because round pegs bounce predictably.
- The goal changed from "clear all pegs" to "hit 25 random orange pegs" so the last target is not one hard-to-reach peg.
- The board opens up as pegs disappear, so late shots reach areas that were blocked early.
- Luck is part of the design on purpose, mainly at the end of a level.

**Level archetypes seen in the campaign** (from layouts and level trivia; useful as generator templates):

| Archetype | Description | Example from the campaign |
| --- | --- | --- |
| Plinko grid | Staggered rows of round pegs | Stage 2, level 1 (112 pegs) |
| Picture outline | Pegs and bricks trace an object from the background | Most levels |
| Spiral | Pegs along a spiral arm | Stage 2, level 4 |
| Rotating group | Pegs on a wheel or windmill that rotates | Stage 3 level 2, stage 7 level 1 |
| Brick architecture | Walls, arches, stairs of bricks | Stage 9 level 4 (108 bricks) |
| Moving platforms | Groups that slide or float | Stage 7 levels 3 and 4 |
| Portal level | Teleports link areas | Stage 10 level 3 |
| Helix | Two strands that wiggle or spin | Stage 10 level 5, stage 11 level 5 |
| Web / ring | Concentric rings and spokes | Stage 6 level 2 (123 pegs) |

## Quirks and edge cases

Rows backed by the patent, Wikipedia or the fan editor are requirements for Teggle. Rows marked unverified (coin-flip weighting, last-ball assist, Long Shot bug) are open decisions, not requirements.

| Quirk | Behavior in the original | Source |
| --- | --- | --- |
| Purple peg moves | After every shot the purple peg turns back to blue (if not hit) and a different blue peg turns purple | Patent, Wikipedia |
| Colors reroll on retry | Orange, green and purple positions are random on every attempt, so a failed level plays differently next time | Patent |
| Seeded greens | On the first campaign play, some levels have designer-placed green pegs; Quick Play randomizes them | Fan wiki |
| Stuck ball | If the ball rests on pegs and stops making progress, the game removes a lit peg it touches so the ball keeps falling. Timeout not documented | Patent, Wikipedia |
| Quick disappear pegs | Some pegs vanish soon after the hit instead of at shot end, to prevent stuck balls at the bottom of arcs | Fan editor docs |
| Lit pegs persist | Hit pegs stay as obstacles until the shot ends, so a ball can bounce off them again | Patent |
| Zero-hit coin flip | A shot that hits no peg spins a coin for a possible free ball. Fan reports say the odds favor the player more when few balls are left (*unverified*) | Patent, fan wiki |
| Bucket speed-up | Holding the right mouse button between shots makes the bucket move faster | Patent |
| Multiplier freeze | In challenges with more than 25 orange pegs, the fever meter does not move until 25 remain | Fan wiki |
| Score thresholds exclude style | 25k / 75k / 125k free-ball thresholds use the shot score only | Patent |
| Last-ball assist | On the first campaign play, with 2 or fewer balls left, the game reportedly nudges the shot toward a better result | Fan document (*unverified*) |
| Long Shot bug | Reported: the Long Shot bonus only counts when the non-blue pegs are the first pegs hit | Fan wiki (*unverified*) |
| Fever slow motion | Time slows and the camera zooms only when the ball is about to hit the last orange peg | Wikipedia; parameters undocumented |
| Win is immediate | Hitting the last orange peg wins even with zero balls left in the counter | Patent (win = all orange hit) |
| Loss | Running out of balls with orange pegs left restarts the level | Patent, Wikipedia |

**Open question for Teggle:** whether to implement the three unverified behaviors (coin-flip weighting, last-ball nudge, Long Shot bug). Their strength is undocumented, so including them means choosing values by playtest.

## Audio and visual feedback

The original rewards every hit with sound and light. Items are documented in the sources unless marked *unverified*.

- **Lit pegs** glow until the shot ends, then disappear together.
- **Ball counter tubes** fill with green light as the shot score grows, topping out at 25,000.
- **Fever meter** on the right fills with each orange hit and steps up at 10, 15, 19 and 22 orange hits.
- **Style shot banners** name the bonus.
- **Fever:** slow motion, zoom on the ball, "Fever" text, "Ode to Joy", then the five buckets.
- **Free ball:** the coin flip shows a spinning coin.
- **Low-ball warning** at 3, 2 and 1 balls.
- **Peg hit sound rises in pitch** with each further hit in one shot (*unverified*).
- **Score popups** at each hit peg and a shot total when the ball leaves play (*unverified*).
- **Master character** beside the board reacting to shots and powers (*unverified*).

## Art and audio sourcing

Most art is generated with Claude Code's help; level backgrounds may reuse the original's backgrounds where they are free to use, never art made by the original developer.

- **Backgrounds:** Claude Code downloads and analyzes the reusable originals. Each reused background keeps a record of its source.
- **Master characters, sounds, music:** source not decided.

**Background line editor.** Picture-outline levels are built from lines drawn over a background.

1. **Input.** You draw lines and curves over the background. Claude Code can also derive lines from the background image; both produce the same data (vector paths).
2. **Lines guide the shape only.** The generator decides spacing and placement along each line; objects do not have to sit exactly on it.
3. **Line to bricks.** Each line is smoothed, then turned into a chain of bricks: straight bricks where the smoothed line is straight, curved bricks where it bends.
4. **Rest of the level.** The generator builds the rest of the board around the lines and runs the validity, reachability and stuck checks.
5. **Manual edits.** Single pegs and bricks of a generated level can be edited in the same editor afterwards.
6. **Location (tentative).** A hidden part of the game web app. Export writes the level file that the web app downloads and reads at play time.

## Requirement: level generation and self-play

Teggle must generate levels automatically that match the original campaign's composition. The must-have includes a headless physics simulation, because reachability and stuck-pocket checks (requirements 3 and 4) cannot be done without simulated shots. The stretch goal is the self-play agents, difficulty metrics and calibration built on that simulation. No prior generator or AI player for this genre was found beyond a 40-peg random placer in the fan editor, so this part has no reference implementation.

**Why it is feasible.** The original game already ran a shot search at runtime (the Owl's Zen Ball tests alternative shots and plays the better one). A board is about 100 static colliders and one ball, so simulating many shots per level is a small workload; the actual cost has to be measured.

### What the generator outputs

A level in the same element catalog as the original: round pegs, bricks, solid shapes, rods, teleports, movement definitions, plus the per-peg flags **can be orange** and **quick disappear**. The generator does not assign colors. Colors are assigned at level start, at random, exactly like the original.

### Composition targets (taken from the 55 campaign levels)

| Property | Target | Source |
| --- | --- | --- |
| Colored objects per level | 85 to 134, median 103 | Fan wiki infoboxes |
| Difficulty ramp | Stage averages rise from about 97 (stage 1) to about 117 (stage 11) | Same data |
| Bricks share, across a set | About 42% | Same data |
| Round pegs only | About 1 level in 3 (17 of 55) | Same data |
| Bricks only | About 1 level in 11 (5 of 55) | Same data |
| Orange per level | 25, chosen at runtime from pegs flagged can be orange | Patent, fan editor |
| Green / purple | 2 / 1, chosen at runtime | Patent |
| Balls | 10 | Patent |

The eligible set must be larger than the orange count it serves (25 normally, up to 55 in challenges), otherwise every attempt has the same orange pegs. How much larger the original levels made it is unknown; measuring it requires parsing the original level files with the fan editor's reader.

### Generator requirements

1. **Templates.** Generate from the archetypes in Level design: picture outline (pegs and bricks placed along a supplied silhouette or vector path, the most common original archetype), plinko grid, spiral, rings and spokes, brick architecture, rotating group, moving platform, helix, portal pairs. Mixing two templates in one level must be possible.
2. **Validity checks before any simulation.** No overlapping objects; no object outside the board; a minimum gap between objects so the ball cannot wedge between two pegs (gap value set by testing).
3. **Reachability.** Every peg flagged can be orange must be hit at least once across simulated shots covering the full aim range (no agent needed, an angle sweep is enough). Pegs never hit are reflagged as not eligible or moved.
4. **Stuck pockets.** Any spot where simulated balls come to rest is either removed or its pegs get quick disappear, as the original designers did at arc bottoms.
5. **Seeded.** Every level is reproducible from a seed and a generator version.
6. **Moving parts optional.** Use the original's movement types (back-and-forth, circle, figure-eight, arc, rotate, rotate back and forth, wrap) with the same parameters.

### Self-play requirements

1. **Deterministic physics.** Fixed timestep, same code for the live game and the simulation, so a simulated shot equals the real shot from the same angle. Moving parts are a function of time, so the simulation must start at the real launch time.
2. **Agent tiers.**
   - Random: uniform random angle. Floor of difficulty.
   - Greedy search: tries many angles, simulates each, plays the one with the most orange hits (ties broken by score). This is roughly what the Zen Ball does for one shot.
   - Noisy greedy: greedy search, then adds random error to the chosen angle. The error size is the skill setting. This method (Gaussian error as the skill parameter) is used in published difficulty research on Flappy Bird.
3. **Re-randomized runs.** Each level is played many times, each with a new random color assignment, because the original rerolls colors on every attempt.
4. **Full rules in simulation.** Bucket, free-ball thresholds, coin flip, stuck-ball removal, powers on green pegs.

### Metrics per level

| Metric | Meaning |
| --- | --- |
| Clear rate per agent tier | Share of runs that hit all 25 orange within the available balls |
| Balls used | Distribution of balls needed when cleared (how close runs come to losing) |
| Free balls per run | Bucket, threshold and coin-flip balls earned |
| Orange coverage | Share of eligible pegs hit at least once across all runs |
| Stuck events | Count of stuck-ball removals per run |
| Score distribution | Final score, Fever bucket hit, full-clear rate |

### Calibration and acceptance

No published clear rates exist for the original campaign, so difficulty targets cannot be copied. The plan is to calibrate against your own play:

1. Play a set of levels by hand and record clears and balls used.
2. Set the noisy agent's error so its clear rate matches yours on those levels. Published work on Candy Crush did the same and reached a mean absolute error of 4% to 7% between agent and player success rates; that is the comparison point, not a promise for this genre.
3. Accept a generated level when its noisy-agent clear rate falls in the band chosen for its stage, coverage is complete, and stuck events are near zero.

Self-play gives an estimate, not a proof. The Angry Birds generator research hit the same limit: an agent can show a level is clearable, but cannot prove a level is impossible.

### Phases

| Phase | Delivers | Done when |
| --- | --- | --- |
| 1. Generator (must-have) | Template-based levels with validity checks | Levels load, play, match the composition table, and pass the reachability and stuck checks from phase 2 |
| 2. Simulation (must-have) | Headless physics with full rules | A replay of a live shot gives the same result |
| 3. Agents and metrics (stretch) | Random, greedy, noisy greedy; metric report per level | Report runs on a batch of generated levels |
| 4. Calibration (stretch) | Agent error tuned to your play | Agent and your clear rates are close on the test set |
| 5. Search loop (stretch) | Generate, evaluate, mutate, keep the best | Generator produces levels inside the target bands without hand editing |

## Open questions

None of these values were found in any source; each has to be set by playtesting or by measuring the original game.

- [ ] Launch speed, gravity, restitution and friction
- [ ] Peg radius and ball radius in shipped levels
- [ ] Aim guide length
- [ ] Bucket width and speed, and the speed-up factor
- [ ] Stuck-ball timeout and which peg gets removed first
- [ ] Coin-flip odds and whether they depend on balls left
- [ ] Fever slow-motion factor, zoom, and trigger distance
- [ ] Space Blast radius, Lucky Spin odds, Zen Ball search method
- [ ] Size of the can-be-orange set per original level
- [ ] Exact style-shot detection rules (distance measurement for Long Shot, what counts as a slide)
- [ ] Scope decision: base game (11 stages, 10 masters) or expansion (12 stages, adds the Squid, different stage order)
- [ ] Duel ball count, 5 or 6 (Duel is post-MVP)
- [ ] Touch equivalents for fine aim (mouse wheel, arrow keys) and bucket speed-up (right mouse button); mobile orientation for a 16:9 board; whether object counts scale up from the original 4:3 levels to the wider 16:9 board
- [ ] Source of master characters, sound effects and music
- [ ] Editor: can a line also produce round pegs, or do round pegs only come from the generator's fill?
- [ ] Editor: smoothing method and the curvature threshold between straight and curved bricks

## Sources

- [US Patent 8,398,476 (full text, Justia)](https://patents.justia.com/patent/8398476) and [Google Patents entry](https://patents.google.com/patent/US8398476B1/en): rules, values, randomization, Fever
- [Wikipedia: Peggle](https://en.wikipedia.org/wiki/Peggle): balls, peg counts, modes, platforms
- [Fan wiki: Purple Peg](https://peggle.fandom.com/wiki/Purple_Peg): values, free ball thresholds, Fever holes
- [Fan wiki: Style Shots](https://peggle.fandom.com/wiki/Style_Shots), [Scoring System](https://peggle.fandom.com/wiki/Scoring_System), [Fever Meter](https://peggle.fandom.com/wiki/Fever_Meter), [Duel Mode](https://peggle.fandom.com/wiki/Duel_Mode)
- [Fan wiki: Peggle Masters](https://peggle.fandom.com/wiki/Peggle_Masters), [Base game](https://peggle.fandom.com/wiki/Peggle_Deluxe), [Expansion](https://peggle.fandom.com/wiki/Peggle_Nights), [Base game challenges](https://peggle.fandom.com/wiki/Peggle_Deluxe/Challenges), [Expansion challenges](https://peggle.fandom.com/wiki/Peggle_Nights/Challenges)
- [PeggleEdit fan editor (source and level format docs)](https://github.com/IntelOrca/PeggleEdit)
- [TCRF: unused levels](<https://tcrf.net/Peggle_Deluxe_(Windows,_Mac_OS_X)/Unused_levels>)
- [PC Gamer: the making of (page 2)](https://pcgamer.com/the-making-of-peggle/2), [Gamezebo: how a spark started a fever](https://www.gamezebo.com/news/peggle-how-a-spark-started-a-fever/)
- [Shacknews: expansion release](https://www.shacknews.com/article/54771/peggle-sequel-officially-released-conquers)
- [Togelius et al., Search-based PCG survey (2011)](https://course.ccs.neu.edu/cs5150f13/readings/togelius_sbpcg.pdf)
- [Shaker et al., Cut the Rope level evolution (AIIDE 2013)](https://ojs.aaai.org/index.php/AIIDE/article/view/12690)
- [Stephenson and Renz, Angry Birds level generation (AIIDE 2016)](https://users.cecs.anu.edu.au/~jrenz/papers/stephenson-renz-aiide16.pdf)
- [Khalifa et al., PCGRL](https://arxiv.org/pdf/2001.09212v2)
- [Isaksen and Nealen, difficulty via simulated players](https://cdn.aaai.org/ojs/12846/12846-52-16362-1-2-20201228.pdf)
- [Gudmundsson et al., human-like playtesting (King)](https://www.Gwern.net/doc/reinforcement-learning/imitation-learning/2018-gudmundsson.pdf)
- [Roohi et al., difficulty with AI players (Rovio)](https://arxiv.org/abs/2107.12061v1)
