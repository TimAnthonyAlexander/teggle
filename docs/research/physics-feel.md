# Physics feel: slides and bounces against the original

Analyzed 2026-10-20 after Tim's report that balls bounce too high and slide far less often than in the original, where a well-aimed shot can slide along a whole brick wave. No code changed as a result; this records what was checked and measured. The original's levels come from the owner's copy (`reference/`, gitignored), converted at run time by `tools/agents/original.ts`.

## What Teggle runs

Teggle's contact responses (`src/sim/response.ts`) match the decompiled `Ball::DoBallPegCollision` and `Ball::DoLineCollision` (Thunderball `Ball.cpp:830-876, 931-1006`) line for line, constants included:

- **Pegs:** with bounciness 0.9 and slide threshold 1.0, a contact slides when 0.9 times the approach speed is at most 1.0, that is at 1.11 px/tick or less; otherwise the normal speed comes back at 0.8.
- **Bricks and lines:** a contact slides when the speed into the surface is at most 1.4 px/tick; otherwise the reflected velocity keeps 0.82.

With gravity at 0.05 px/tick², 1.11 px/tick is what a ball gains falling 12 px from rest and 1.4 px/tick a 20 px fall. A slide needs a nearly tangential or nearly spent ball.

## What could not be checked

- **The contact pipeline:** `CollisionMgr::Update`, `UpdateOneBall`, `NotifyCollision` and `Board::UpdateObjects` are stubs in the decompilation, so the order and conditions under which contacts are found are Teggle's reconstruction.
- **The peg sweep:** the decompiled `Ball::CheckCollision` (`Ball.cpp:697`) uses the velocity's magnitude where the quadratic formula needs the square root of the discriminant. Either a decompiler error or a real quirk; if the game runs it, peg contacts are found late and resolved by a radial push, unlike Teggle's exact sweep.
- **The owner's `Peggle.exe`** is DRM-wrapped: none of the physics constants (0.05, 0.9, 0.82 as float32) occur in its bytes, so the code cannot be read from it without unwrapping. Running the game needs Windows or Wine, neither on this machine.

## Ruled out by measurement

- **Time base:** the reference stream video (`reference/peggle-2007/video/`, 48 fps, about 1.15 video px per board px) shows free-flight arcs falling at 0.23 video px/frame²; Teggle's gravity predicts 0.25.
- **The direction check:** the original's peg response has no direction check, and its peg overlap test registers a contact whatever the motion, so a slowly separating ball is pulled back by 90%. Teggle ignores separating peg contacts. A scratch copy of the physics with the original's behavior gave identical numbers on all of Teggle's levels and almost the same on the original's.
- **Per-object overrides:** only 16 of the original's 5,943 objects set their own bounciness or slide threshold (14 and 2); the levels run on the defaults Teggle uses.
- **Brick chains:** once a ball slides, it carries onto the next brick 98.6 to 99.7% of the time on Teggle's chains and 99.1 to 100% on the original's (one original level, 33, at 91.6%).
- **Bounce height from the video:** inconclusive. Overlays and a 10 px ball left only 10 clean bounces in 6.5 minutes of stream.

## Map design, same physics on both

First shots swept over the cannon's whole range at 0.05° steps (3,881 angles a level) with Teggle's physics, on the original's 55 levels and Teggle's stages 1 and 2. "Slide time" is the share of ticks with a slide contact; a run counts different pegs and bricks touched in consecutive slide contacts (ended by a bounce or 25 ticks without a slide).

- **The original's Waves (6-1)** gives the slides Tim remembers: 20 bricks or more from some angles (best 21 at -20.45°), 12 or more from 7.3% of all angles.
- **Stage 1:** 13.8% slide time on the original's five levels against 6.1% on Teggle's; runs of 8 or more from 59% and 67% of angles on the original's 1-2 and 1-4, on Teggle's stage 1 only on 1-4 (9%).
- **Stage 2:** 15.5% on Teggle's against 10% on the original's; on par.

So the measurable gap is in map design: Teggle's stage 1 offers fewer slide setups than the original's.

## Open

- On some of the original's levels Teggle's physics leaves the first shot's ball still in play after 40 s from most angles (3-5 from 3,126 of 3,881 angles, 7-4 from all, 11-1 from 3,770), with no stuck-ball removal in the sweep. Not looked into; it may be the conversion or a physics difference. The original's levels are playable in Quick Play's Original section (spec 14.2, "Decided in the original's levels"), so Tim can compare by hand.
