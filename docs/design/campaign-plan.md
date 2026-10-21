# Campaign plan: stages 2 to 11

As of 2026-10-21. The plan for the 50 campaign levels after stage 1: ten worlds, every level's name, concept, archetypes, templates, counts, moving parts and difficulty target, and every picture's brief. The sources are `campaign/stages.json` (worlds and picture looks) and `campaign/levels/<id>.json` (one per level); this page is their overview. Decisions are in spec 14.2, "Decided in the campaign plan", "Decided in the backgrounds", "Decided in the slides" and one entry per built stage ("Decided in stages 1 and 2", "Decided in stage 3" and on).

## Status

Stages 1 (Cloud Isles), 2 (Clover Burrows), 3 (Golden Rooftops), 4 (Lilac Orbit), 5 (Lighthouse Cove), 6 (Moonlit Hollow), 7 (Petal Terraces) and 8 (Ribbon Fair) are built. Stages 9 to 11 are drafts: each level has its concept, its plan, its seed (stage times 100 plus the level), its count and its picture, a found image already processed into `public/backgrounds/`; no lines exist yet. Every level's picture is recorded in `docs/assets.md`.

A draft (`"draft": true`) is skipped by `npm run campaign:build`, never appears in the manifest and needs no lines file. `tools/campaign/plan.test.ts` checks every source against spec 15's counts, the original's level names and the reference bands; `tools/campaign/backgrounds.test.ts` checks the pictures against their sources and the asset manifest.

## From draft to level

1. Picture: every draft has one. To replace it, search (`npm run campaign:art -- search <id> "<query>" --source pexels`), look at a candidate (`show <ref>`), try it under pegs (`import <id> <ref> --dry`), then import it (`import <id> <ref> [--crop x,y,w] [--set key=value]`), rewrite `background.prompt` as the brief of what the picture shows and where, and update `docs/assets.md` from `npm run campaign:art -- manifest`.
2. Lines: `npm run campaign:grid -- <id>` draws the picture under a coordinate grid; trace what `concept.layout` names into `public/levels/campaign/<id>.lines.json` (or in `#/editor/<id>`), with the solids, the one template part and the fill that `plan.templates` and `plan.fill` list. Where the picture places a shape somewhere a template cannot build it, trace the shape and drop the template from the plan (stage 2 did so for its plinko field, spirals and house).
3. Remove `"draft": true`, check the counts with `npm run campaign:build -- <id> --no-check --lines`, then run the full build.
4. Difficulty: measure the stage with `npm run agents:report -- <stage> --tier noisy` and tune each level toward `plan.difficulty.target`. The manifest lists stages in order from 1 and a stage's levels in order from its first, so a level enters the game once every level before it in its stage is built and every earlier stage has a built level. The report reads the built level files, so a stage can be built and measured while an earlier one is still a draft.

## Rules every level follows

- Counts: spec 15's count times 1.409, rounded. Levels with bricks keep the original's split: bricks times 1.409 rounded, pegs the rest of the total (13 levels where rounding both halves would miss the total by one).
- Campaign composition, as spec 13.2 asks: 17 of 55 levels round pegs only, 5 bricks only, 42.3% of all objects bricks.
- Pictures: found images that show the level's subject in the stage's world, processed into the stage's look. A calm top center (the cannon), plain lower corners (the flippers' swing), a calm bottom strip. No people, animals, characters or faces, so a world shows its master's habitat and power, never the master.
- Readability: light to medium values where pegs sit, never dark in the night and space worlds, and no large areas of saturated green, orange or magenta (or of the world's own risky color), so all four peg colors read. Stage 1's style test showed a saturated green crown hiding green pegs.
- Recipes: solids, the traced lines, at most one more template, a fill. Bricks never change in count fitting, so a template's bricks must come out at the planned number.
- Slides: at least one instant slide from the cannon, two where the picture has the shapes, each verified in the simulation with the aim that rides it (spec 14.2, "Decided in the slides"; the original's levels drawn with `npm run campaign:grid -- original:<id>`).
- Big Ball gaps: where Lucky Spin is the stage's power (stage 8), no gap between separate objects under 18 px, since its Big Ball (radius 9) wedges in gaps the generator allows. The Stuck column of `agents:report` reads 0.00.
- Originals: no original scene, character, level picture or name (visual guide 15, research 5 and 7).

## Worlds

| Stage | Master (power, theme) | World | Palette and light | Why it fits |
| --- | --- | --- | --- | --- |
| 1 | Unicorn (Guide, blue) | Cloud Isles | powder-blue sky, cream clouds; even daylight | built |
| 2 | Gopher (Multiball, green) | Clover Burrows | light sand, pale clay, muted sage meadow; picture-book light | built: the gopher's garden above ground; a fork and twin spirals echo the second ball |
| 3 | Cat (Pyramid, gold) | Golden Rooftops | slate-blue roofs, honey stone, butter-yellow sky; low warm sun | rooftops at golden hour; gables and awnings echo the pyramid's slopes; nothing Egyptian |
| 4 | Alien (Space Blast, purple) | Lilac Orbit | lilac, periwinkle and lavender space, never black; starlight | the alien's pastel sky; rings and bursts echo the blast radius |
| 5 | Lobster (Flippers, aqua) | Lighthouse Cove | aqua water, pale sand, gray-blue wood; bright midday | a harbor of breakwaters, boats, nets and a lighthouse, above the water and without sea creatures |
| 6 | Pumpkin (Spooky Ball, maroon and silver) | Moonlit Hollow | plum and mauve dusk, burgundy pumpkins, silver moon and mist | a pumpkin patch by moonlight; the well and the web are its spooky side |
| 7 | Sunflower (Flower Power, pink) | Petal Terraces | dusty rose, blush, butter yellow, sage; spring morning | terraced gardens whose pinwheels, bubbles and mill carry stage 7's moving features |
| 8 | Rabbit (Lucky Spin, red) | Ribbon Fair | cream and muted brick-red stripes, turquoise sky; afternoon | a country fair around a prize wheel; no cards, dice or magic |
| 9 | Wyvern (Fireball, orange-gold) | Ember Highlands | blue-gray basalt, sandstone, steam, tiny embers, hazy gold sky | a volcanic highland without lava rivers; no castle or moat |
| 10 | Owl (Zen Ball, silver) | Silverwood | silver birches, pale blue mist, lemon dawn | an owl's forest at a still dawn; no temple and no yin-yang |
| 11 | any master | Starlit Summit | luminous teal twilight, gold and silver stars, ice and pearl | the summit above all the worlds, the finale |

## Levels

Templates are the recipe's parts (`outline` is the traced lines). Moving lists spec 9's movement types; "line movers" marks levels whose moving parts are traced lines (the generator's moving lines, below). The target is the intended clear rate of the reference agent (noisy greedy at σ 0.03, spec 13.5).

### Stage 2: Clover Burrows

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 2-1 | Peanut Rows | plinko, outline | outline, fill (lattice) | 158 / 0 | | 32% |
| 2-2 | The Forked Lane | outline | outline | 79 / 62 | | 31% |
| 2-3 | Mushroom Moss | outline | solids, outline | 81 / 68 | | 30% |
| 2-4 | The Fiddleheads | spiral, outline | outline | 66 / 73 | | 29% |
| 2-5 | The Sod House | architecture, outline | outline | 59 / 104 | | 27% |

Built on 2026-10-17. A planted field whose rows are a staggered lattice crossed by four furrows; a lane forking in two, its branches long slides under a roof over the grass wedge; two mushrooms whose caps are double brick domes on solid stems; two fiddleheads traced as brick spirals with pegs on their inner turns; a sod-roofed stone house whose gable, roof and stone courses are traced brick architecture. Measured clear rates: "Stage 2 measured" below.

### Stage 3: Golden Rooftops

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 3-1 | Gable Row | outline | solids, outline | 109 / 32 | | 34% |
| 3-2 | Lantern Loop | outline, rotating | outline | 93 / 48 | horizontalInfinity (line movers) | 29% |
| 3-3 | The Bell Tower | outline | solids, outline | 106 / 46 | | 30% |
| 3-4 | Laundry Day | outline | solids, outline | 141 / 0 | | 26% |
| 3-5 | Market Awnings | outline | solids, outline | 53 / 94 | | 27% |

Built on 2026-10-20. Every level follows its found picture where it differs from the concept: an old town's rooftops around a clock tower, its roof edges short brick slides between the houses, six rows of pegs along the cloud bands and the tower's narrow lantern a solid over the belfry; sixteen small lanterns traveling around a figure eight 530 px wide that crosses itself at a red paper lantern, its left loop the longer (913 and 810 px), between a gray and a yellow paper lantern traced as brick rings; a white bell tower whose spire foot is a solid over the belfry, with a brick arch under it, a church gable and house roofs as brick slides and two antenna masts as rods; laundry on one washing line across a house front, its clothespins 44 px apart so a ball drops through, the window lintels and the eave solid ledges and the cable a rod over the pegs nearest the cannon; a gable whose two slopes are long brick slides from beside the cannon to the walls, a brick band under its peak and two awnings with solid tops over their brick stripes. Measured clear rates (200 runs): 40%, 30%, 30%, 32% and 29%, a stage mean of 32.2%, every level inside the band of 23.5% to 49.5%; the opener is the easiest and the finale the hardest.

### Stage 4: Lilac Orbit

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 4-1 | Ringed Giant | outline | solids, outline | 54 / 93 | | 34% |
| 4-2 | Spinning Station | rotating, outline | solids, outline | 105 / 42 | rotateAroundCircle (line movers) | 28% |
| 4-3 | Comet Shower | outline | solids, outline | 62 / 82 | | 30% |
| 4-4 | Moon Phases | outline | solids, outline | 56 / 85 | | 26% |
| 4-5 | Supernova | rotating, web, outline | solids, outline, rotating | 34 / 127 | rotateAroundCircle | 23% |

Built on 2026-10-20. A pale planet whose steeply tilted ring is nested brick slides at both tips and, where it crosses the planet, a solid rim over its band and two cloud bands, the planet's limb a brick arc and faint stars single pegs; a station whose docking wheel turns as a group of traced lines over the dark disc where the picture puts it (four rim arcs with wide slots, six spoke pegs), whose big ring is four brick arcs with its deck lights gliding around inside, and whose cylinder top is a solid; a meteor shower of parallel brick tails, the three largest heads brick rings open underneath and the high tail ending in a solid (a new picture: the single comet first found had no shapes for 82 bricks); nine moons in a rainbow arch as brick rings with crater pegs, around nested arcs of star trails under a solid; a nebula whose turning core ring is the rotating template's wheel under a thin solid cap, inside four broken brick rings crossed by five rays of pegs. Traced as first drawn, the five cleared 71%, 40%, 67%, 35% and 53%; each solid is a shelter traced from the picture over objects near the cannon, and it brought its level into the band. Measured clear rates (200 runs each): 33%, 29%, 31%, 22% and 24%, a stage mean of 27.8%, every level inside the band of 17.5% to 39%.

### Stage 5: Lighthouse Cove

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 5-1 | Life Rings | platforms, outline | outline, platforms, fill (lattice) | 81 / 63 | circle | 31% |
| 5-2 | The Fish Boat | outline, platforms | outline | 147 / 0 | horizontalCycle (line movers) | 26% |
| 5-3 | The Drying Net | outline | outline, fill (lattice) | 141 / 0 | | 29% |
| 5-4 | The Ship's Wheel | rotating, outline | solids, outline, rotating | 72 / 96 | rotateAroundCircle | 27% |
| 5-5 | Lighthouse Point | outline | solids, outline | 141 / 0 | | 25% |

Built on 2026-10-20. A harbor mouth seen from above, its two stone breakwaters brick chains over rows of foam pegs, the four life rings floating in the harbor below them and the open sea outside a lattice of swell; a long, narrow boat whose hull, a closed peg line, glides forward and back along its own heading through rows of wave crests, the water under the cannon left open; two racks of drying nets on a sand bar, their mesh and its reflection in the shallows one lattice fill; a ship's wheel whose inner ring turns under a solid crown, inside three brick arcs on each side, between the bulwarks' brick rows; a lighthouse on a rocky point, its peaked roof a solid over the gallery, above rows of sea, rock and cloud that leave the sky under the cannon open. 5-1 got a new picture, since the planned one showed a single pier with swimmers and a signed beach bar; 5-3 and 5-4 were cropped closer, 5-4 so that the wheel's hub sits where the rotating template turns its wheel. Measured clear rates (200 runs): 32, 26, 28, 28 and 25%, a stage mean of 27.8%.

### Stage 6: Moonlit Hollow

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 6-1 | Curling Vines | outline | solids, outline | 62 / 89 | | 34% |
| 6-2 | Moonlit Web | web | outline | 173 / 0 | | 28% |
| 6-3 | Pumpkin Patch | outline | solids, outline | 141 / 0 | | 30% |
| 6-4 | The Old Well | outline | solids, outline | 148 / 0 | | 25% |
| 6-5 | The Glasshouse | architecture, outline | solids, outline | 88 / 99 | | 21% |

Built on 2026-10-21, each level on its found picture: bare trees around a full moon, the branches brick chains and the moon a brick ring open underneath under a solid twig, a gap in the main trunk where the left slide's ball flies through; a dewy web traced as twelve spokes and six turns of pegs, the two outer turns a channel that opens beside the cannon on both sides, the web's upper quarter never orange; three pumpkins in long grass drawn in pegs, their stems solids; an old well in a fenced meadow, its tiled roof slope a gutter of two peg lines from beside the cannon and its gable's beam a solid; a glasshouse seen close from below, the dome's ridge a solid open at both ends, a brick slide down its flank and one long brick chain from the railing along the wing to the wall. 6-3 got a new picture, since the planned one was a flat field of tiny pumpkins; 6-5 was cropped closer. Measured clear rates (200 runs): 35, 23, 26, 24 and 22%, a stage mean of 26.0%.

### Stage 7: Petal Terraces

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 7-1 | Pinwheel Garden | rotating, outline | solids, outline | 110 / 45 | rotateAroundCircle (line movers) | 30% |
| 7-2 | Rose Trellis | outline | solids, outline | 60 / 72 | | 27% |
| 7-3 | Soap Bubbles | platforms, outline | outline | 0 / 127 | circle (line movers) | 28% |
| 7-4 | The Water Mill | rotating, platforms, outline | solids, outline | 0 / 141 | rotateAroundCircle, horizontalWrap (line movers) | 26% |
| 7-5 | The Pergola | architecture, outline | solids, outline | 34 / 110 | | 25% |

Built on 2026-10-21, each level on its found picture: a striped wheel and a petal flower turning opposite ways against a gray sky, two long brick slides along the cloud edges and the dark cloud tip under the cannon a solid; a white wrought-iron pergola walk whose front arches are three nested brick arches, ridden on their inside, under a solid piece of the canopy; eight brick bubbles floating on small circles, never orange near the cannon, with two brick slides across the open left half; two bamboo water wheels turning on a shallow river under solid crowns, the ripples flowing and wrapping and a misty peak's flanks the slides; a wisteria pergola seen down its length, its two hanging limbs brick slides that drop the ball beside the near pillars, the second crossbeam's middle a solid. 7-4 got a new picture, since the planned painting was dark and showed one wheel. Measured clear rates (200 runs): 28, 31, 27, 28 and 23%, a stage mean of 27.4%.

### Stage 8: Ribbon Fair

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 8-1 | The Big Top | outline | solids, outline | 51 / 108 | | 28% |
| 8-2 | The Carousel | outline | solids, outline | 29 / 110 | | 25% |
| 8-3 | Ring Toss | outline | solids, outline | 47 / 85 | | 22% |
| 8-4 | Prize Rosettes | web, outline | outline | 69 / 85 | | 19% |
| 8-5 | The Ferris Wheel | rotating, outline | outline, rotating | 43 / 101 | rotateAroundCircle | 16% |

Built on 2026-10-21, each level on its found picture: a three-peaked big top whose outer roof edges are the slides, its fold under the cannon a solid, with a Ferris wheel and a balloon beside it; a carousel canopy seen from below, its arches solid on top and its rim two long brick slides from a solid crown to the walls; a garden bar cart set up as a ring toss, two long brick slides curving down under solid awning ends; six rosettes, the top middle one left to the cannon, the top two opened toward it so their lower pleats are slides; a Ferris wheel whose hub is the rotating template's wheel and whose double rim is a channel from beside the cannon to the flippers, with no solids since they made it near impossible in play. Every gap is at least 18 px, so Lucky Spin's Big Ball finds none to wedge in. 8-1 and 8-5 are renamed after their pictures; 8-2 got a new picture without horses' heads or people; 8-5 was cropped closer. Measured clear rates (200 runs): 32, 27, 22, 16 and 43%, a stage mean of 28.0%; 8-5 is easier than planned on purpose.

### Stage 9: Ember Highlands

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 9-1 | Stone Bridges | architecture, outline | outline, architecture | 43 / 135 | | 27% |
| 9-2 | Hot Springs | outline | outline | 54 / 93 | | 20% |
| 9-3 | Geysers | outline | outline | 81 / 68 | | 16% |
| 9-4 | Basalt Steps | architecture, outline | outline | 0 / 152 | | 23% |
| 9-5 | Sky Lanterns | outline, platforms | outline | 145 / 0 | verticalWrap (line movers) | 12% |

Arch bridges on two tiers; seven pools whose lips spill to the tier below; three geyser plumes on domed mounds; basalt columns stepping up in a V; columns of lanterns rising and wrapping.

### Stage 10: Silverwood

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 10-1 | Knothole Passage | portals, outline | outline, portals | 105 / 34 | | 25% |
| 10-2 | The Footbridge | outline, web | outline | 42 / 127 | | 18% |
| 10-3 | Mirror Pools | portals, outline | outline, portals | 123 / 0 | | 21% |
| 10-4 | Standing Stones | architecture, outline | outline | 65 / 121 | | 15% |
| 10-5 | Willow Strands | helix, outline | outline, helix | 178 / 0 | horizontalCycle, verticalCycle | 13% |

Knotholes that lead into the far birch's hollow (the portals template's vaults); a bridge and its reflection making a circle; hollow logs at the walls linked as a wrap pair; five stone gateways; willow strands and mist ribbons wiggling.

### Stage 11: Starlit Summit

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 11-1 | Ice Spires | outline, architecture | outline | 0 / 189 | | 20% |
| 11-2 | The Great Orrery | rotating, outline | outline | 0 / 189 | rotateAroundCircle (line movers) | 16% |
| 11-3 | Star Gates | portals, outline | outline, portals | 141 / 0 | | 12% |
| 11-4 | Frozen Lake | outline | solids, outline | 120 / 0 | | 9% |
| 11-5 | Aurora Twist | helix, outline | outline, helix | 185 / 0 | circle | 6% |

Ice spires and terraces; three tilted orrery rings whose bricks glide around their ellipses at different speeds; constellations between two linked ice gates; skate loops behind slanted ice blocks; aurora ribbons twisting and spinning.

## Spec 8's stage features

| Stage | Feature | Where | Teggle's subject |
| --- | --- | --- | --- |
| 2 | Spiral layout | 2-4 | twin corkscrew burrows (spiral template, twin) |
| 2 | Brick-heavy last level | 2-5 | The Great Burrow, 104 of 163 objects bricks |
| 3 | Pegs in an infinity shape that spin in a loop | 3-2 | lanterns gliding around a figure-eight wire |
| 4 | Mostly bricks | the stage | 429 of 740 objects bricks (58%) |
| 4 | Last level 24 pegs and 90 bricks | 4-5 | 34 pegs and 127 bricks |
| 5 | Moving elements | 5-1, 5-2, 5-4 | floating life rings, the fish boat, a turning ship's wheel |
| 5 | A moving fish shape | 5-2 | a boat shaped like a fish |
| 6 | Spiderweb with 123 round pegs | 6-2 | a dewy web, 173 pegs |
| 7 | Rotating windmill bricks | 7-1 | two garden pinwheels turning opposite ways (traced wheels) |
| 7 | Floating circles | 7-3 | soap bubbles |
| 7 | Moving ground and brick wheels | 7-4 | a river whose ripples flow and wrap, two water wheels |
| 7 | Two levels bricks only | 7-3, 7-4 | 127 and 141 bricks |
| 8 | Brick-heavy throughout | every level | 55% to 79% bricks |
| 9 | One level bricks only (108) | 9-4 | basalt steps, 152 bricks |
| 9 | One level round pegs only (103) | 9-5 | sky lanterns, 145 pegs |
| 10 | Portals introduced | 10-1, then 10-3 | knotholes into hollows (vaults); hollow logs at the walls (wrap) |
| 10 | Wiggling double-helix strands | 10-5 | willow strands at the walls, mist ribbons across the middle |
| 11 | Two levels of 134 bricks | 11-1, 11-2 | ice spires and the orrery, 189 bricks each |
| 11 | Spinning double helix | 11-5 | twisting aurora ribbons (helix template, spin) |

## Difficulty ramp

Every target lies inside its stage's reference band (`src/agents/bands.json`, the original's five levels per stage). Within a stage the opener is the easiest level and the finale, or the level before it, the hardest. The stage means never rise; they level off over stages 5 to 7 because the bands of stages 5 and 7 start at 24%.

| Stage | Band | Targets, levels 1 to 5 | Mean |
| --- | --- | --- | --- |
| 1 | 18% to 54.5% | built: 45, 23, 33, 43, 33 (40 runs); the original's stage 1 averages 39.3% | 35.4% |
| 2 | 24% to 33.5% | 32, 31, 30, 29, 27; built: 33, 32, 32, 32, 28 (200 runs) | 29.8%; built 31.4% |
| 3 | 23.5% to 49.5% | 34, 29, 30, 26, 27; built: 40, 30, 30, 32, 29 (200 runs) | 29.2%; built 32.2% |
| 4 | 17.5% to 39% | 34, 28, 30, 26, 23; built: 33, 29, 31, 22, 24 (200 runs) | 28.2%; built 27.8% |
| 5 | 24% to 60% | 31, 26, 29, 27, 25; built: 32, 26, 28, 28, 25 (200 runs) | 27.6%; built 27.8% |
| 6 | 17% to 50.5% | 34, 28, 30, 25, 21; built: 35, 23, 26, 24, 22 (200 runs) | 27.6%; built 26.0% |
| 7 | 24% to 64% | 30, 27, 28, 26, 25; built: 28, 31, 27, 28, 23 (200 runs) | 27.2%; built 27.4% |
| 8 | 13% to 30.5% | 28, 25, 22, 19, 16; built: 32, 27, 22, 16, 43 (200 runs; 8-5's solids removed) | 22.0%; built 28.0% |
| 9 | 5% to 44.5% | 27, 20, 16, 23, 12 | 19.6% |
| 10 | 10.5% to 46% | 25, 18, 21, 15, 13 | 18.4% |
| 11 | 3.5% to 33.5% | 20, 16, 12, 9, 6 | 12.6% |

The targets are clear rates of the reference agent, so they keep their meaning whatever the rules settle. Since the 20-orange draw (spec 14.1, "Orange pegs") the built stages land in their bands: stage 1 at 23 to 45% per level, stage 2 at 28 to 33% (measured 2026-10-17), stage 3 at 29 to 40%, stage 4 at 22 to 33% and stage 5 at 25 to 32% (measured 2026-10-20), stage 6 at 22 to 35%, stage 7 at 23 to 31% and stage 8 at 16 to 32% (measured 2026-10-21), all with `npm run agents:report -- <stage> --tier noisy`. 8-1's 32% is over its band with seed 1 and 27.2% over 1,000 runs; 7-2 above its opener is within the noise. 8-5 clears 43% since its solids were removed in play (spec 14.2, "Decided in stage 7" and "Decided in stage 8").

### Stage 2 measured

Traced as first drawn, stage 2 cleared 38, 55, 83, 40 and 75%: far too easy for its band. Teggle's orange pegs gather near the cannon and each other, so open pegs and brick slides under the cannon are lit several at a time. What brought each level into the band was a solid traced from the picture that turns balls away from that area, with an object or two sheltered under it (spec 14.2, "Decided in stages 1 and 2"):

| Level | Shelter | First | Built (200 runs) |
| --- | --- | --- | --- |
| 2-1 Peanut Rows | two short rails at the field's far edge and a stone where the near furrows meet | 38% | 33% |
| 2-2 The Forked Lane | the inner hedge tops beside the lane, the bushes under them | 55% | 32% |
| 2-3 Mushroom Moss | a rim over each cap, one spot sheltered on the right cap | 83% | 32% |
| 2-4 The Fiddleheads | the right curl's rim where it faces the cannon | 40% | 32% |
| 2-5 The Sod House | the sod roof's ridge, four tufts of grass under it; the lower wall courses as single stones | 75% | 28% |

A shelter is a strong lever: in trials one more sheltered peg on 2-5 took it from 26% to 17%, and rims over both of 2-4's curls took it to 0%. Tune one object at a time and measure with 200 runs, whose interval is about 6 points either way.

## Slides

Every level from stage 6 on has at least one instant slide from the cannon (spec 14.2, "Decided in the slides"). The aim is in degrees from straight down, negative to the left, and is one that rides the slide in the simulation; most windows are 1 to 5 degrees wide. The top end is in board coordinates; the cannon pivot is at (458, 30).

| Level | Slide | Top end | Aim | One shot lights |
| --- | --- | --- | --- | --- |
| 6-1 | thick branch to the main trunk | (388, 122) | -47 | all 6 bricks, then 3 or 4 vine pegs through the trunk's gap |
| 6-1 | long branch to the right trunk | (500, 140) | 33 | all 11 bricks |
| 6-2 | channel between the two outer turns, left | (329, 33) | -75.5 | 23 pegs |
| 6-2 | channel between the two outer turns, right | (590, 42) | 78.5 | 23 pegs |
| 6-3 | back crest onto the left pumpkin | (352, 174) | -46.9 | 10 of 11 pegs |
| 6-3 | back crest onto the right pumpkin | (420, 179) | 33.8 | all 9 pegs |
| 6-3 | right crest | (668, 212) | 81.5 | 9 of 10 pegs |
| 6-4 | roof gutter | (334, 112) | -36.5 | all 8 gutter pegs and 1 more |
| 6-5 | dome flank | (296, 168) | -58.5 | all 5 bricks, then sky pegs |
| 6-5 | railing, apse and parapet | (556, 212) | 48 | 10 of 12 bricks and a cresting brick |
| 7-1 | left cloud edge | (371, 112) | -55 | all 10 bricks, 13 objects |
| 7-1 | right cloud edge | (545, 112) | 55 | all 11 bricks, 12 objects |
| 7-2 | front arch's outer rail, inside | (300, 36) | -84 | 9 of 13 bricks |
| 7-2 | front arch's inner rail, inside | (590, 52) | 70.5 | 7 of 14 bricks |
| 7-3 | upper slide, onto the lower one | (350, 140) | -54 | all 10 bricks |
| 7-3 | lower slide | (352, 205) | -39 | all 11 bricks |
| 7-4 | misty peak's left flank | (412, 178) | -15 | all 7 bricks |
| 7-4 | misty peak's right flank | (506, 160) | 3 | all 3 bricks, then 8 more objects |
| 7-5 | left wisteria limb | (359, 112) | -58.75 | all 7 bricks, 15 objects |
| 7-5 | right wisteria limb | (557, 112) | 58.75 | all 7 bricks, 15 objects |
| 8-1 | left roof edge | (300, 151) | -62 | all 5 bricks, then the ground pegs at the left edge |
| 8-1 | right roof edge | (623, 152) | 63 | all 5 bricks |
| 8-2 | left rim, beside its crown | (384, 287) | -17 | 11 rim bricks, 14 objects |
| 8-2 | right rim, beside its crown | (560, 287) | 25 | 10 rim bricks, 14 to 15 objects |
| 8-3 | left slide under the awning | (392, 142) | -38.75 | all 11 bricks |
| 8-3 | right slide under the awning | (524, 145) | 38 | all 10 bricks |
| 8-4 | top left rosette's lower pleats | (259, 150) | -68.5 | 4 of 6 bricks and 3 ribbon bricks |
| 8-4 | top right rosette's lower pleats | (675, 149) | 74 | 4 of 6 bricks and 2 ribbon bricks |
| 8-5 | channel between the rims, left | (289, 65) | -70.5 | 10 of 23 bricks |
| 8-5 | channel between the rims, right | (578, 51) | 71.5 | 9 of 24 bricks |

## Moving lines

Eight levels have traced lines whose objects move: 3-2 (lanterns traveling around a figure eight), 4-2 (the docking wheel turning about its hub, the ring's deck lights gliding around inside it), 5-2 (the fish boat sliding), 7-1 (two pinwheels turning about their hubs), 7-3 (bubbles floating on small circles), 7-4 (wheels turning, ripples wrapping), 9-5 (lantern columns rising and wrapping) and 11-2 (rings gliding around ellipses). The generator's moving lines build them with no added pegs (spec 14.2, "Decided in the moving lines"; the examples `eight`, `fish`, `bubbles` and `mill` show each kind):

- a group of lines moves as one with any of spec 9's movements: the fish boat (horizontalCycle), each bubble (circle, neighbors turning opposite ways), each mill wheel (rotate about its hub), a row of ripples as a conveyor (horizontalWrap one brick per period), a column of lanterns as a conveyor (verticalWrap one lantern per period); a group can ride on another, as 11-2's planets would ride on their orbits (followPath along the orbit line);
- a traveling line runs its objects along itself: 3-2's lanterns around the figure-eight wire, 11-2's ring bricks around their traced ellipses, 7-4's stream and 9-5's columns as an alternative to the conveyors.

For sixteen evenly spaced lanterns to pass 3-2's crossing, its loops must differ in length (an even count on equal loops always meets there) and the wire must run about 1,700 px; fifteen or seventeen lanterns pass on equal loops. Spec 14.2 has the measure.

Where a level uses a template that places itself (rotating, spiral, web, platforms, portals, helix), the prompt puts the picture's shape where the template builds it: the single wheel centered at about 58% of the height and two thirds of it across, the twin spirals at a quarter and three quarters of the width, the web centered a little above half height, the floaters' row at 20, 40, 60 and 80% of the width, the portal vaults near the top corners and the wrap portals at the walls a little below half height.
