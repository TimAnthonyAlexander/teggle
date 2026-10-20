# Teggle

A web rebuild of the 2007 PC pachinko shooter, for personal play. `spec.md` is the source of truth for scope and rules. Decisions live in spec section 14.1; every undocumented rule or constant chosen during implementation gets a line in section 14.2. Production grade throughout, even though it is never published.

## Commands

- `npm run dev`: Vite dev server
- `npm run check`: typecheck, lint, format check, unit tests. Must pass before a wave is done.
- `npm test`: Vitest unit tests (`src/**/*.test.ts`, `tools/**/*.test.ts`)
- `npm run test:engines` / `npm run test:browsers`: the determinism digests in Node and Bun / in Chromium, WebKit and Firefox through Playwright (spec 13.4), plus Node-recorded attempts replayed in each browser
- `npm run format`: Prettier (Markdown is excluded on purpose; never reformat `spec.md`)
- `npm run campaign:build [-- 1-3]`: campaign levels from `campaign/` and their lines through the generator's full checks, plus the manifest (`--no-check` writes a draft for review only)
- `npm run campaign:grid -- 1-3 [--lines --level --crop x0,y0,x1,y1 --sketch]`: a level's picture with a board-coordinate grid, for tracing lines; `--sketch` renders the lines as a layout guide for painting the picture; `original:<id>` draws one of the original's levels on its 650 board with the cannon pivot marked
- `npm run campaign:art -- search 1-3 "<query>"` / `show <ref>` / `import 1-3 <ref|url>` / `process` / `manifest`: found background pictures: search a source, preview a candidate, crop and process it into `public/backgrounds/` and record it in the level source, re-render after a look change, print the `docs/assets.md` tables
- `npm run campaign:shots [-- 1-3]`: plays campaign levels in Chromium and captures start, mid-level and Fever screenshots
- `npm run agents:report -- <stage|id|original:n> --tier noisy --runs 200`: self-play clear rates and metrics per level (the reference agent for difficulty tuning; stages are read from their built level files, so a stage can be measured before earlier stages are built)
- `npm run original:import`: converts the original's 55 levels and pictures from `reference/` into `public/original/` (needs the owner's copy unpacked locally)
- `npm run shots:challenges` / `shots:menus` / `shots:mobile`: Playwright screenshots of the challenge flow, the menus, and phones and tablets (each runs its own server)
- `npm run audio:render [-- name]`: renders synthesized sounds to WAV in `reference/teggle-audio/` with peak and RMS levels

## Layout

| Path | Contents | Deterministic |
| --- | --- | --- |
| `src/core/` | `dmath` (deterministic trig), `rng` (seeded sfc32), `digest` (bit-exact hashes) | yes |
| `src/sim/` | Physics: shapes, collision, movement, fixed-step world, events | yes |
| `src/rules/` | Game rules: colors, scoring, fever meter, free balls, style shots, powers, shot and level state | yes |
| `src/level/` | Level file format, Zod schema, loader | yes |
| `src/gen/` | Level generator and its validity, reachability and stuck checks | yes |
| `src/agents/` | Self-play agents and metrics (stretch) | yes |
| `src/game/` | Browser runtime: screens, Canvas 2D renderer, input, audio, saves | no |
| `src/editor/` | Hidden background line editor | no |
| `tools/` | Node CLIs (level generation, campaign pipeline, replay checks) | no |
| `campaign/` | Campaign sources: stages (world, master, picture style) and per level the concept, background prompt and generator recipe. Lines sit next to the level files in `public/levels/campaign/`. | |
| `public/` | Static assets the game loads (levels, backgrounds, audio); `public/original/` holds the original's 55 levels and pictures for Quick Play | |
| `docs/` | Design guide and research notes | |
| `reference/` | Screenshots and files of the original game. Gitignored, never committed, never shipped. | |

## Determinism (spec 13.4)

Everything in the deterministic directories must give bit-identical results in V8, JavaScriptCore and SpiderMonkey. ESLint enforces the mechanical part.

- No `Math.sin/cos/tan/atan2/exp/log/pow/hypot/random`, no `**`. Use `src/core/dmath.ts`. `Math.sqrt`, `Math.round`, `Math.abs`, `Math.min/max`, `Math.imul` and `+ - * /` are exact and allowed.
- No `Date`, `performance`, `window`, `document`, timers or ambient randomness. Time is a tick counter. Randomness comes from an `Rng` passed in.
- Fixed timestep. Rendering speed, slow motion and frame drops never change the simulation.
- A shot is stored and replayed as its launch direction vector plus its launch tick and inputs, never as an angle.
- Any change to sim output must be deliberate: golden digests in tests pin the bits.

## Code

- TypeScript strict. No `any`, no non-null assertions to silence the checker, no `console` in `src/`.
- Validate untrusted data (level files, saves) with Zod at the boundary.
- The simulation hot path mutates in place and avoids per-step allocation; that is deliberate. Elsewhere prefer immutable updates.
- Unit tests sit next to the code (`foo.ts`, `foo.test.ts`).
- American English in code, comments, docs and every UI string (color, gray, center, behavior, canceled).

## Content

- No placeholder content, fake data, lorem ipsum or stub screens presented as finished.
- Never use the original's trademarks: its name, its publisher's marks, its master names or character designs, or branded phrases. The spec's naming table (section 1) and master names (section 7) are binding. `docs/design/visual-language.md` lists the exclusions.
- Original game art is never committed or shipped.
- Exception, at Tim's request on 2026-10-20: the original's 55 campaign levels and their pictures, with their original names, are committed under `public/original/` (`npm run original:import`) and playable from Quick Play's Original section.
- **Never use a paid service.** No paid image generation (OpenAI, gpt-image, DALL-E or any other), no paid API of any kind, not for a single call. Every subagent prompt repeats this rule.
- **Art is found, never drawn in code.** Backgrounds and master characters are existing images found on the web (Pexels with the key in `.env.local`, Openverse, Wikimedia Commons, game asset sites, artists' pages). Teggle is private, so licenses do not matter; every image's source URL is still recorded in `docs/assets.md`.
