# Campaign plan: stages 2 to 11

As of 2026-10-15. The plan for the 50 campaign levels after stage 1: ten worlds, every level's name, concept, archetypes, templates, counts, moving parts and difficulty target, and every picture's prompt. The sources are `campaign/stages.json` (worlds and picture styles) and `campaign/levels/<id>.json` (one per level); this page is their overview. Decisions are in spec 14.2, "Decided in the campaign plan".

## Status

Stage 1 (Cloud Isles) is built. Stages 2 to 11 are drafts: each level has its concept, its plan, its seed (stage times 100 plus the level) and its count, and its picture prompt is ready for `npm run campaign:art -- prompt <id>`. No lines and no pictures exist yet. Two things block them: image generation (no API credit) and the open difficulty question (spec 14.3), which may change how layouts are built.

A draft (`"draft": true`) is skipped by `npm run campaign:build`, never appears in the manifest and needs no lines file. `tools/campaign/plan.test.ts` checks every source against spec 15's counts, the original's level names and the reference bands.

## From draft to level

1. Picture: print the prompt (`npm run campaign:art -- prompt <id>`), generate it at 2400 x 1440, import it (`npm run campaign:art -- import <id> <file>`) and record the generation in `background.picture`. The prompts place every large shape in fractions of the picture, so the lines can be traced over it.
2. Lines: open `#/editor/<id>`. The draft opens with its seed and count; trace what `concept.layout` names, and add the solids, the one template part and the fill that `plan.templates` and `plan.fill` list.
3. Difficulty: measure the level with `npm run agents:report` and tune it toward `plan.difficulty.target`.
4. Remove `"draft": true` and run `npm run campaign:build -- <id>`. The manifest lists stages in order from 1, so a stage enters the game once every earlier stage has a built level.

## Rules every level follows

- Counts: spec 15's count times 1.409, rounded. Levels with bricks keep the original's split: bricks times 1.409 rounded, pegs the rest of the total (13 levels where rounding both halves would miss the total by one).
- Campaign composition, as spec 13.2 asks: 17 of 55 levels round pegs only, 5 bricks only, 42.3% of all objects bricks.
- Pictures: the stage style, the shared layout text, then the subject. Open sky at the top center (the cannon), plain lower corners (the flippers' swing), a calm bottom strip. No people, animals, characters or faces, so a world shows its master's habitat and power, never the master.
- Readability: light to medium values where pegs sit, never dark in the night and space worlds, and no large areas of saturated green, orange or magenta (or of the world's own risky color), so all four peg colors read. Stage 1's style test showed a saturated green crown hiding green pegs.
- Recipes: solids, the traced lines, at most one more template, a fill. Bricks never change in count fitting, so a template's bricks must come out at the planned number.
- Originals: no original scene, character, level picture or name (visual guide 15, research 5 and 7).

## Worlds

| Stage | Master (power, theme) | World | Palette and light | Why it fits |
| --- | --- | --- | --- | --- |
| 1 | Unicorn (Guide, blue) | Cloud Isles | powder-blue sky, cream clouds; even daylight | built |
| 2 | Gopher (Multiball, green) | Clover Burrows | light sand, pale clay, muted sage meadow; picture-book light | the gopher's burrows in cross-section under a strip of meadow; forks and twin spirals echo the second ball |
| 3 | Cat (Pyramid, gold) | Golden Rooftops | slate-blue roofs, honey stone, butter-yellow sky; low warm sun | rooftops at golden hour; gables and awnings echo the pyramid's slopes; nothing Egyptian |
| 4 | Alien (Space Blast, purple) | Lilac Orbit | lilac, periwinkle and lavender space, never black; starlight | the alien's pastel sky; rings and bursts echo the blast radius |
| 5 | Lobster (Flippers, aqua) | Lighthouse Cove | aqua water, pale sand, gray-blue wood; bright midday | a harbor of piers, buoys and lobster traps, above the water and without sea creatures |
| 6 | Pumpkin (Spooky Ball, maroon and silver) | Moonlit Hollow | plum and mauve dusk, burgundy pumpkins, silver moon and mist | a pumpkin patch by moonlight; the well and the web are its spooky side |
| 7 | Sunflower (Flower Power, pink) | Petal Terraces | dusty rose, blush, butter yellow, sage; spring morning | terraced gardens whose pinwheels, bubbles and mill carry stage 7's moving features |
| 8 | Rabbit (Lucky Spin, red) | Ribbon Fair | cream and muted brick-red stripes, turquoise sky; afternoon | a country fair around a prize wheel; no cards, dice or magic |
| 9 | Wyvern (Fireball, orange-gold) | Ember Highlands | blue-gray basalt, sandstone, steam, tiny embers, hazy gold sky | a volcanic highland without lava rivers; no castle or moat |
| 10 | Owl (Zen Ball, silver) | Silverwood | silver birches, pale blue mist, lemon dawn | an owl's forest at a still dawn; no temple and no yin-yang |
| 11 | any master | Starlit Summit | luminous teal twilight, gold and silver stars, ice and pearl | the summit above all the worlds, the finale |

## Levels

Templates are the recipe's parts (`outline` is the traced lines). Moving lists spec 9's movement types; "line movers" marks levels that need the generator extension below. The target is the intended clear rate of the reference agent (noisy greedy at σ 0.03, spec 13.5).

### Stage 2: Clover Burrows

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 2-1 | Potato Rows | plinko, outline | outline, plinko | 158 / 0 | | 32% |
| 2-2 | The Forked Burrow | outline | outline | 79 / 62 | | 31% |
| 2-3 | Mushroom Grotto | outline | solids, outline | 81 / 68 | | 30% |
| 2-4 | The Corkscrews | spiral, outline | outline, spiral | 66 / 73 | | 29% |
| 2-5 | The Great Burrow | architecture, outline | outline, architecture | 59 / 104 | | 27% |

Potatoes in a funnel-shaped plinko grid; a burrow that forks into two slides back to the middle; mushroom caps as brick domes on solid stems; twin spiral burrows; a domed hall with storerooms and stairs.

### Stage 3: Golden Rooftops

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 3-1 | Gable Row | outline | solids, outline | 109 / 32 | | 34% |
| 3-2 | Lantern Loop | outline, rotating | outline | 93 / 48 | horizontalInfinity (line movers) | 29% |
| 3-3 | The Bell Tower | outline | outline | 106 / 46 | | 30% |
| 3-4 | Laundry Day | outline | outline | 141 / 0 | | 26% |
| 3-5 | Market Awnings | outline | outline | 53 / 94 | | 27% |

Gables as brick chevrons; sixteen lanterns gliding around a figure-eight wire; a belfry and bridge arches; sagging washing lines of pegs; awnings stacked in a zigzag of slides.

### Stage 4: Lilac Orbit

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 4-1 | Ringed Giant | outline | outline | 54 / 93 | | 34% |
| 4-2 | Spinning Station | rotating, outline | outline, rotating | 105 / 42 | rotateAroundCircle | 28% |
| 4-3 | Comet Shower | outline | outline | 62 / 82 | | 30% |
| 4-4 | Moon Phases | outline | outline | 56 / 85 | | 26% |
| 4-5 | Supernova | rotating, web, outline | outline, rotating | 34 / 127 | rotateAroundCircle | 23% |

A planet's ring as a brick bowl; a wheel-shaped station turning; comet tails as slides; seven moons in phases along an arc; a turning shock ring inside static crescents.

### Stage 5: Lighthouse Cove

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 5-1 | Life Rings | platforms, outline | outline, platforms | 81 / 63 | circle | 31% |
| 5-2 | The Fish Boat | outline, platforms | outline | 147 / 0 | horizontalCycle (line movers) | 26% |
| 5-3 | The Drying Net | outline | outline, fill (lattice) | 141 / 0 | | 29% |
| 5-4 | The Ship's Wheel | rotating, outline | outline, rotating | 72 / 96 | rotateAroundCircle | 27% |
| 5-5 | Lighthouse Point | outline | outline | 141 / 0 | | 25% |

Life rings floating between two sloping piers; a fish-shaped boat crossing the cove; a net whose mesh is a lattice fill; a turning ship's wheel between two anchors; the stage's one asymmetric board, a lighthouse on its point.

### Stage 6: Moonlit Hollow

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 6-1 | Curling Vines | outline | outline | 62 / 89 | | 34% |
| 6-2 | Moonlit Web | web | web | 173 / 0 | | 28% |
| 6-3 | Pumpkin Patch | outline | solids, outline | 141 / 0 | | 30% |
| 6-4 | The Old Well | outline, spiral | outline | 148 / 0 | | 25% |
| 6-5 | The Glasshouse | architecture, outline | outline, architecture | 88 / 99 | | 21% |

Vines as long brick chains curling over the hollow; a dewy web in front of the moon; pumpkin rings on three hills with fence posts as blockers; mist spiraling up from a well; a domed glasshouse.

### Stage 7: Petal Terraces

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 7-1 | Pinwheel Garden | rotating, outline | outline, rotating | 110 / 45 | rotateAroundCircle | 30% |
| 7-2 | Rose Trellis | outline | outline | 60 / 72 | | 27% |
| 7-3 | Soap Bubbles | platforms, outline | outline | 0 / 127 | circle (line movers) | 28% |
| 7-4 | The Water Mill | rotating, platforms, outline | outline | 0 / 141 | rotateAroundCircle, horizontalWrap (line movers) | 26% |
| 7-5 | The Pergola | architecture, outline | outline, architecture | 34 / 110 | | 25% |

Two pinwheels turning; three nested trellis arches; eight brick bubbles floating; a mill's two wheels turning over a stream whose ripples flow and wrap; a two-tier pergola hung with wisteria.

### Stage 8: Ribbon Fair

| Level | Name | Archetypes | Templates | Pegs / bricks | Moving | Target |
| --- | --- | --- | --- | --- | --- | --- |
| 8-1 | Helter Skelter | outline | outline | 51 / 108 | | 28% |
| 8-2 | The Carousel | outline | outline | 29 / 110 | | 25% |
| 8-3 | Ring Toss | outline | outline | 47 / 85 | | 22% |
| 8-4 | Prize Rosettes | web, outline | outline | 69 / 85 | | 19% |
| 8-5 | The Prize Wheel | rotating, outline | outline, rotating | 43 / 101 | rotateAroundCircle | 16% |

A zigzag slide around a tower; a carousel canopy with an arched valance; hoops of bricks around peg posts; five rosettes of broken brick rings; a prize wheel spinning under a marquee arch.

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
| 7 | Rotating windmill bricks | 7-1 | garden pinwheels (rotating template, windmill pair) |
| 7 | Floating circles | 7-3 | soap bubbles |
| 7 | Moving ground and brick wheels | 7-4 | a mill stream that flows and wraps, two mill wheels |
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
| 1 | 18% to 54.5% | built; the original's stage 1 averages 39.3% | |
| 2 | 24% to 33.5% | 32, 31, 30, 29, 27 | 29.8% |
| 3 | 23.5% to 49.5% | 34, 29, 30, 26, 27 | 29.2% |
| 4 | 17.5% to 39% | 34, 28, 30, 26, 23 | 28.2% |
| 5 | 24% to 60% | 31, 26, 29, 27, 25 | 27.6% |
| 6 | 17% to 50.5% | 34, 28, 30, 25, 21 | 27.6% |
| 7 | 24% to 64% | 30, 27, 28, 26, 25 | 27.2% |
| 8 | 13% to 30.5% | 28, 25, 22, 19, 16 | 22.0% |
| 9 | 5% to 44.5% | 27, 20, 16, 23, 12 | 19.6% |
| 10 | 10.5% to 46% | 25, 18, 21, 15, 13 | 18.4% |
| 11 | 3.5% to 33.5% | 20, 16, 12, 9, 6 | 12.6% |

The targets are clear rates of the reference agent, so they keep their meaning whatever spec 14.3 settles (more balls, fewer orange pegs, side structures that turn balls back toward the middle). Today Teggle's stage 1 clears 0 to 2% per level at 10 balls and 25 orange, far below its band (`docs/research/agent-difficulty.md`); the later stages' targets assume 14.3 closes that gap.

## What the plan needs from the generator

Six levels need traced lines whose objects move: 3-2 (lanterns traveling around a figure eight), 5-2 (the fish boat sliding), 7-3 (bubbles floating on small circles), 7-4 (wheels turning, ripples wrapping), 9-5 (lantern columns rising and wrapping) and 11-2 (rings gliding around ellipses). Lines and the outline template have no movement today, and the bricks-only levels 7-3, 7-4 and 11-2 cannot use the rotating or platforms templates, which add pegs. One extension covers all six: a line, or a group of lines, given one of spec 9's movements, either as a rigid group (slide, wrap, orbit around a point, float on a circle) or as a train whose phases step along the path (a figure eight, an ellipse, a rising column). The plan marks these levels with `needs: ["line-movers"]`.

Where a level uses a template that places itself (rotating, spiral, web, platforms, portals, helix), the prompt puts the picture's shape where the template builds it: the single wheel centered at about 58% of the height and two thirds of it across, the twin spirals at a quarter and three quarters of the width, the web centered a little above half height, the floaters' row at 20, 40, 60 and 80% of the width, the portal vaults near the top corners and the wrap portals at the walls a little below half height.
