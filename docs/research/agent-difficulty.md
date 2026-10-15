# Self-play difficulty: the original's campaign and Teggle's stage 1

Measured 2026-10-15 with the self-play agents (`src/agents/`; spec 13.5, decisions in spec 14.2). The original's levels come from the owner's copy (`reference/`, gitignored), converted at run time at their own 650 x 560 size by `tools/agents/original.ts`. Nothing of them is stored in the repo except the clear rates below and in `src/agents/bands.json`. Teggle's stage 1 is the campaign as of commit 67969bb.

## Method

- **Agents.** Random aims uniformly over the cannon's range. Greedy plays 40 angles per shot on trial copies of the attempt and takes the best by win, orange pegs lit, free balls, score. Noisy greedy adds a normal aim error with standard deviation σ (radians) to the greedy angle. For scale: at σ = 0.03 a shot is about 13 px off its line 450 px from the cannon, a bit more than a peg's radius.
- **Rules.** Full rules: bucket, free ball thresholds, coin flip, stuck-ball removal, the stage master's power on green pegs (with a fixed flipper policy for the Flippers), greens from campaign level 3 and purple from level 4. Every run is a new attempt with new random colors. On the Master levels each run draws one of the ten masters.
- **Runs.** 200 per level and agent, base seed 1. Intervals are 95% Wilson intervals; at 200 runs a 30% clear rate is known to within about 6 points either way. Run i of every agent and aim error faces the same colors.
- **Reproduce.** `npm run agents:bands` for the original's campaign. For stage 1: `npm run agents:report -- 1 original:1 --tier random,greedy,noisy --noise 0.015,0.03,0.06 --runs 200`, the same for `1` with `--balls 15 --orange 20`, `--balls 14 --orange 18` and `--balls 16 --orange 25`, and `--tier noisy --noise 0.0005,0.001,0.002,0.005` for the small errors. JSON lands in `reference/teggle-metrics/`.

## The original's campaign at σ = 0.03 (the reference bands)

| Level | Clear | 95% interval | Balls used when cleared | Free balls per run | Orange left on failure | Stuck per run |
| --- | --- | --- | --- | --- | --- | --- |
| 1-1 | 51% | 44% to 58% | 12 | 3.1 | 2.3 | 0.00 |
| 1-2 | 43% | 36% to 50% | 12 | 2.9 | 2.5 | 0.00 |
| 1-3 | 30% | 24% to 37% | 12 | 2.3 | 2.8 | 0.00 |
| 1-4 | 55% | 48% to 61% | 13 | 3.9 | 2.8 | 0.00 |
| 1-5 | 18% | 13% to 24% | 13 | 3.0 | 3.8 | 0.01 |
| 2-1 | 24% | 19% to 30% | 14 | 4.1 | 3.3 | 0.00 |
| 2-2 | 34% | 27% to 40% | 14 | 3.9 | 3.1 | 0.00 |
| 2-3 | 31% | 25% to 37% | 13 | 3.6 | 3.8 | 0.00 |
| 2-4 | 33% | 26% to 39% | 13 | 3.6 | 3.3 | 0.01 |
| 2-5 | 30% | 24% to 36% | 14 | 3.8 | 3.6 | 0.12 |
| 3-1 | 38% | 32% to 45% | 14 | 4.4 | 3.1 | 0.29 |
| 3-2 | 39% | 32% to 45% | 14 | 4.5 | 2.9 | 0.00 |
| 3-3 | 36% | 30% to 43% | 13 | 4.3 | 2.7 | 0.19 |
| 3-4 | 24% | 18% to 30% | 14 | 3.8 | 3.2 | 0.04 |
| 3-5 | 50% | 43% to 56% | 14 | 5.1 | 2.8 | 1.62 |
| 4-1 | 25% | 20% to 31% | 14 | 3.6 | 3.7 | 0.12 |
| 4-2 | 18% | 13% to 23% | 14 | 3.2 | 3.9 | 0.16 |
| 4-3 | 26% | 20% to 32% | 13 | 3.6 | 3.5 | 0.00 |
| 4-4 | 22% | 16% to 28% | 14 | 3.4 | 3.6 | 0.21 |
| 4-5 | 39% | 33% to 46% | 13 | 3.5 | 2.9 | 0.63 |
| 5-1 | 60% | 53% to 67% | 12 | 4.5 | 2.9 | 0.12 |
| 5-2 | 27% | 21% to 34% | 14 | 3.8 | 3.2 | 0.06 |
| 5-3 | 25% | 19% to 31% | 14 | 3.5 | 3.6 | 0.04 |
| 5-4 | 36% | 29% to 42% | 14 | 4.2 | 3.5 | 0.01 |
| 5-5 | 24% | 19% to 30% | 13 | 3.9 | 4.0 | 0.54 |
| 6-1 | 51% | 44% to 57% | 13 | 4.5 | 2.2 | 0.04 |
| 6-2 | 28% | 22% to 34% | 14 | 4.0 | 3.2 | 0.05 |
| 6-3 | 23% | 17% to 29% | 13 | 3.7 | 3.3 | 0.07 |
| 6-4 | 17% | 12% to 23% | 14 | 3.5 | 4.1 | 0.86 |
| 6-5 | 36% | 30% to 43% | 14 | 4.3 | 2.9 | 0.12 |
| 7-1 | 44% | 37% to 51% | 12 | 3.5 | 2.4 | 0.30 |
| 7-2 | 36% | 30% to 43% | 12 | 3.1 | 2.8 | 1.42 |
| 7-3 | 64% | 57% to 70% | 12 | 4.1 | 2.1 | 0.47 |
| 7-4 | 56% | 50% to 63% | 12 | 3.6 | 2.7 | 2.02 |
| 7-5 | 24% | 19% to 30% | 13 | 3.2 | 3.3 | 0.59 |
| 8-1 | 27% | 21% to 33% | 14 | 3.8 | 3.4 | 0.01 |
| 8-2 | 31% | 25% to 37% | 14 | 3.9 | 3.7 | 0.38 |
| 8-3 | 17% | 12% to 22% | 15 | 3.6 | 4.4 | 0.10 |
| 8-4 | 13% | 9% to 18% | 14 | 3.9 | 4.5 | 1.30 |
| 8-5 | 19% | 14% to 24% | 14 | 3.7 | 4.0 | 0.91 |
| 9-1 | 38% | 31% to 44% | 14 | 4.0 | 3.3 | 0.03 |
| 9-2 | 45% | 38% to 51% | 13 | 3.4 | 2.9 | 0.31 |
| 9-3 | 28% | 22% to 34% | 13 | 3.3 | 4.3 | 0.46 |
| 9-4 | 40% | 33% to 47% | 13 | 4.0 | 3.3 | 0.02 |
| 9-5 | 5% | 3% to 9% | 15 | 2.8 | 6.7 | 0.04 |
| 10-1 | 46% | 39% to 53% | 13 | 4.5 | 3.2 | 0.08 |
| 10-2 | 21% | 15% to 27% | 16 | 4.8 | 8.3 | 0.00 |
| 10-3 | 40% | 33% to 47% | 14 | 4.2 | 2.6 | 0.00 |
| 10-4 | 21% | 16% to 27% | 14 | 4.3 | 3.7 | 1.79 |
| 10-5 | 11% | 7% to 16% | 13 | 3.7 | 4.4 | 0.79 |
| 11-1 | 34% | 27% to 40% | 14 | 4.6 | 3.1 | 5.00 |
| 11-2 | 11% | 7% to 16% | 16 | 4.8 | 3.9 | 0.03 |
| 11-3 | 14% | 10% to 19% | 15 | 3.7 | 4.7 | 0.01 |
| 11-4 | 4% | 2% to 7% | 13 | 4.5 | 4.7 | 0.08 |
| 11-5 | 7% | 4% to 11% | 15 | 3.4 | 10.1 | 0.00 |

Every level's orange coverage was complete: each can-be-orange peg and brick was lit in at least one run.

| Stage | Master | Mean | Band (lowest to highest level) |
| --- | --- | --- | --- |
| 1 | Unicorn (Guide) | 39% | 18% to 55% |
| 2 | Gopher (Multiball) | 30% | 24% to 34% |
| 3 | Cat (Pyramid) | 37% | 24% to 50% |
| 4 | Alien (Space Blast) | 26% | 18% to 39% |
| 5 | Lobster (Flippers) | 34% | 24% to 60% |
| 6 | Pumpkin (Spooky Ball) | 31% | 17% to 51% |
| 7 | Sunflower (Flower Power) | 45% | 24% to 64% |
| 8 | Rabbit (Lucky Spin) | 21% | 13% to 31% |
| 9 | Wyvern (Fireball) | 31% | 5% to 45% |
| 10 | Owl (Zen Ball) | 28% | 11% to 46% |
| 11 | Any, one per run | 14% | 4% to 34% |

The band is the acceptance target per stage (spec 13.5): a Teggle level fits its stage when this agent's clear rate on it lies within the range of the original's five levels. The bands are wide and the stage means do not rise from stage to stage; only the Master levels stand clearly lower.

## Teggle's stage 1 against the original's

Stage 1 mean clear rate, with the lowest and highest of the five levels, by agent:

| Stage 1 | Random | σ 0.06 | σ 0.03 | σ 0.015 | σ 0.005 | Greedy (σ 0) |
| --- | --- | --- | --- | --- | --- | --- |
| Teggle, 10 balls, 25 orange | 0% (0% to 0%) | 1% (0% to 2%) | 0% (0% to 2%) | 2% (1% to 3%) | 4% (2% to 7%) | 99% (98% to 100%) |
| Teggle, 15 balls, 20 orange | 1% (0% to 2%) | 14% (4% to 22%) | 21% (11% to 34%) | 28% (10% to 50%) | 43% (20% to 69%) | 100% (99% to 100%) |
| Teggle, 14 balls, 18 orange | 1% (1% to 2%) | 14% (5% to 23%) | 20% (7% to 32%) | 29% (16% to 46%) | 38% (21% to 56%) | 100% (100% to 100%) |
| Teggle, 16 balls, 25 orange | 0% (0% to 1%) | 13% (6% to 30%) | 17% (6% to 31%) | 26% (10% to 49%) | 42% (23% to 63%) | 99% (98% to 100%) |
| Original, 10 balls, 25 orange | 3% (2% to 7%) | 29% (14% to 38%) | 39% (18% to 55%) | 47% (25% to 62%) | 61% (30% to 75%) | 100% (100% to 100%) |

Per level at σ = 0.03:

| Stage 1 | 1-1 | 1-2 | 1-3 | 1-4 | 1-5 |
| --- | --- | --- | --- | --- | --- |
| Teggle, 10 balls, 25 orange | 0% (0% to 2%) | 2% (1% to 4%) | 0% (0% to 2%) | 1% (0% to 3%) | 0% (0% to 2%) |
| Teggle, 15 balls, 20 orange | 14% (10% to 20%) | 34% (28% to 41%) | 20% (15% to 26%) | 27% (21% to 33%) | 11% (7% to 16%) |
| Teggle, 14 balls, 18 orange | 14% (9% to 19%) | 32% (26% to 39%) | 25% (20% to 31%) | 23% (17% to 29%) | 7% (4% to 11%) |
| Teggle, 16 balls, 25 orange | 11% (7% to 16%) | 31% (25% to 38%) | 17% (12% to 23%) | 19% (14% to 24%) | 6% (3% to 10%) |
| Original, 10 balls, 25 orange | 51% (44% to 58%) | 43% (36% to 50%) | 30% (24% to 37%) | 55% (48% to 61%) | 18% (13% to 24%) |

Per level at σ = 0.005:

| Stage 1 | 1-1 | 1-2 | 1-3 | 1-4 | 1-5 |
| --- | --- | --- | --- | --- | --- |
| Teggle, 10 balls, 25 orange | 2% (1% to 5%) | 5% (2% to 8%) | 4% (2% to 8%) | 7% (4% to 11%) | 3% (1% to 6%) |
| Teggle, 15 balls, 20 orange | 36% (30% to 43%) | 69% (62% to 75%) | 37% (31% to 44%) | 56% (49% to 62%) | 20% (15% to 26%) |
| Teggle, 14 balls, 18 orange | 30% (24% to 37%) | 56% (49% to 62%) | 37% (30% to 43%) | 49% (42% to 56%) | 21% (16% to 27%) |
| Teggle, 16 balls, 25 orange | 35% (28% to 41%) | 63% (56% to 69%) | 41% (34% to 47%) | 49% (42% to 56%) | 23% (17% to 29%) |
| Original, 10 balls, 25 orange | 72% (65% to 78%) | 73% (66% to 78%) | 55% (48% to 61%) | 75% (69% to 80%) | 30% (24% to 37%) |

Very small errors, 10 balls and 25 orange (stage mean, lowest to highest level):

| Stage 1 | σ 0 | σ 0.0005 | σ 0.001 | σ 0.002 |
| --- | --- | --- | --- | --- |
| Teggle | 99% (98% to 100%) | 10% (4% to 18%) | 7% (2% to 12%) | 4% (1% to 11%) |
| Original | 100% (100% to 100%) | 82% (53% to 96%) | 76% (48% to 89%) | 69% (41% to 83%) |

Other numbers at σ = 0.03, means over the five levels:

| Stage 1 | Orange lit per shot, shots 1 to 10 | Free balls per run (from the bucket) | Orange left on failure | Shots that lit no orange | Balls used when cleared |
| --- | --- | --- | --- | --- | --- |
| Teggle, 10 balls, 25 orange | 1.67 | 1.69 (1.54) | 6.9 | 26% | 13.5 |
| Teggle, 15 balls, 20 orange | 1.37 | 2.85 (2.38) | 2.9 | 40% | 16.5 |
| Teggle, 14 balls, 18 orange | 1.23 | 2.58 (2.16) | 3.0 | 41% | 16.0 |
| Teggle, 16 balls, 25 orange | 1.67 | 2.92 (2.53) | 3.2 | 36% | 18.4 |
| Original, 10 balls, 25 orange | 2.16 | 3.07 (2.37) | 2.8 | 25% | 12.4 |

What the numbers show:

- With the original's 10 balls and 25 orange, at aim errors from 0.005 to 0.06 rad, Teggle's stage 1 clears 0 to 7% per level and the original's 14 to 75%.
- Per shot, Teggle's stage 1 lights about a quarter fewer orange pegs (1.67 against 2.16 over the first ten shots) and gives about half the free balls (1.69 against 3.07 per run, 1.54 against 2.37 from the bucket). The free ball bucket keeps its original 130 px catch on the 916 px board (spec 14.2).
- None of the three easier variants reaches the original's stage 1 at the same aim error: their stage means sit 18 to 23 points below it at σ = 0.03 and at σ = 0.005. At σ = 0.03 their stage means (17 to 21%) fall inside the stage 1 band (18% to 55%) or just under it, with 1-1 and 1-5 below the band in every variant.
- Without aim error the greedy agent clears both games' stage 1 (99 to 100%), so every level has shots that clear it. An error of 0.0005 rad, about a quarter pixel 450 px from the cannon, takes Teggle's stage 1 from 99% to 10% and the original's from 100% to 82%.

## Speed

On 9 worker threads with the machine otherwise quiet: 18 to 21 million simulated ticks per second, 2.0 to 2.3 million per worker, about 5,300 noisy-agent runs per minute (2,000 runs in 22.8 s). A noisy run simulates 190,000 to 280,000 ticks, 97% of them trial shots; a random run 5,000 to 7,500. The reference bands (11,000 noisy runs) took 297 s on 10 workers while other jobs loaded the machine: 8.75 million ticks per second, 0.88 per worker, 2,225 runs per minute.

The agents' inner loop (one trial tick: the flipper policy and a step of the attempt) allocates nothing of its own: measured over 100-tick windows inside shots after warm-up, with the young generation large enough that no collection runs inside a window, a tick averaged 0 to 10 bytes on stage 1 levels with and without the Flippers, against 1.6 bytes for the measurement itself.

## Limits

- The agents look one shot ahead and have no plan for the level: they do not save hard pegs for later, aim for the bucket on purpose or play for the multiplier. The rates rank levels against each other; how they relate to a person's rates is what the calibration (`npm run agents:calibrate`) measures.
- The conversion of the original's levels makes the readings listed in spec 14.2. The fish in 5-2 moves without its `movetoggle` logic.
- On stage 8 the greedy search sees the Lucky Spin wheel's outcome in its trials (spec 14.2), which helps it a little there.
