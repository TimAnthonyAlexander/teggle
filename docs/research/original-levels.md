# Original levels: measured statistics

Measured 2026-10-14 from the owner's copy of the 2007 base game (`main.pak`, unpacked locally to `reference/peggle-2007/`, which is gitignored). All 56 level files (55 campaign levels plus `_base`) parse with the layout in `original-tech.md` section 2, consuming every byte. This doc records numbers only. No original layout, art or file is copied into Teggle.

Units are original board px (board 650 x 560) and ticks of 1/100 s.

## Base level (`_base.dat`)

| Part | Geometry |
| --- | --- |
| Walls | Solid polygons, bouncy 0.75, rolly 1e-05. Inner edges at x = -0.5 and x = 649.5, from y = -759.5 to 1239.5 |
| Ceiling | Solid polygon, bouncy 0.75, x -0.75 to 649.25, bottom edge y = 9.375 |
| Free ball bucket | All parts ride one mover: type 2, anchor x 326, period 600 ticks, radius 260, phase 0.25, so the center runs x 66 to 586. Catch trigger: Hole 130 x 20 at (326, 556). Rims: two collideable polygons, bouncy 0.75, centered at x 255.9 and 393.9, y 546.5. Overall span about x 237 to 413 |
| Pyramid | Two sloped polygons on the bucket mover at (213, 548) and (437, 548), each about 118 wide; collision off until the power turns it on |
| Fireball cover | Curved brick on the bucket mover: inner radius 230, width 15, sector 30°, at (325.3, 539.7) |
| Fever buckets | 5 Holes 80 x 18 at y 592, rising 30 px when Fever starts. x = 65, 197, 325, 452, 578 with 10,000 / 50,000 / 100,000 / 50,000 / 10,000 |
| Fever bumpers | 6 solid circles, radius 37, at x = 0, 133, 262, 386.5, 512, 646.5, y 591 |
| Flippers | Polygons on rotate-back-and-forth movers (type 9), period 30 ticks, max angle 0.5236 rad (30°), pivots (2, 492) and (646.5, 493.25), maxBounceVel 7.0 |

Full vertex lists are in the local dump `reference/peggle-2007/levels-json/_base.json`.

## Campaign levels

| Measure | Value |
| --- | --- |
| Round peg radius | 10 in every one of the 3,392 round pegs |
| Brick width | 20 (±0.0002) |
| Straight brick length | 35 (529), 40 (46), 30 (45), 37 (29), 50 (1) |
| Curved brick inner radius | 35 most common (551), then 150, 100, 70, 120, 300, 250, 50 and others up to 400 |
| Curved brick sector | 30° most common (616), then 10°, 15°, 20°, 7°; range about 3° to 30° |
| Curved brick points | 4 (1,801), 6 (24) |
| Can-be-orange share of scoring objects | Median 100%, mean 96.6%, minimum 53.3% (stage 10 level 2). 44 of 55 levels flag at least 99% |
| Can-be-orange count | Minimum 64, median 102. Every level has at least 58, enough for a 55-orange challenge plus green and purple |
| Nearest-neighbor center distance, static round pegs | Median 40.7, 25th percentile 36.0, 5th percentile 31.8. Lowest per level: 13.6 (one level with overlapping decorative pegs), then 22.6, 24.0, 25.0, 26.9 |
| Static peg extent | x 9 to 641.5 (5th to 95th percentile 14 to 638); y 29 to 514 (95th percentile 509) |
| Quick disappear | Used in 28 of 55 levels, up to 19 objects per level |
| Moving scoring objects | 20 of 55 levels; up to 94 per level |
| Movement types used (by object) | 13: 380, 2: 195, 3: 195, 12: 62, 1: 54, 4: 15, 8: 5, 9: 2 (type numbers as in `original-tech.md` section 3) |
| Movement period | 200 to 3,000 ticks, median 800 |
| Stored peg types | Every file stores a color per peg: 25 orange (27 in one), 1 to 2 green and 1 purple in most. One level stores only blue; one stores no green or purple. Whether the game uses these on first play is not established |

Spec section 15 matches the files for 54 of 55 levels. Stage 5 level 5 has 110 round pegs in the file; the fan wiki says 100.

## Use in Teggle

- The generator's minimum spacing and peg radius come from this table, not from guesses.
- The can-be-orange share answers spec section 13.2: the original flagged nearly every peg, and excluded only hard-to-reach groups on a few levels.
- Teggle's base geometry derives from the base level, widened to Teggle's board.
