# Asset manifest

Every third-party file Teggle ships, with its source and license. Everything else on screen (frame, HUD, pegs, bricks, ball, cannon, buckets, buttons, panels, effects, the favicon) is drawn by Teggle's own code and contains no original game art.

| File | What it is | Source | License | Fetched | SHA-256 |
| --- | --- | --- | --- | --- | --- |
| `public/fonts/overload.woff2` | Overload by Ray Larabie (Typodermic, 1997), the display face. Web font build from the official public-domain webfont package, unmodified. | [typodermic-public-domain-webfonts-2024-12.zip](https://typodermicfonts.com/assets/downloads/typodermic-public-domain-webfonts-2024-12.zip), linked from [typodermicfonts.com/public-domain](https://typodermicfonts.com/public-domain/) | [CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/) | 2026-10-14 | `7cdbeb80dcf38be0bbe9c64e12b05c74068ded931430a323041933361c81ccf3` |
| `public/fonts/overload-LICENSE.txt` | `License.txt` from the same archive, re-encoded from Windows-1252 to UTF-8, text unchanged. | same archive | CC0 1.0 | 2026-10-14 | `f80a9cea4097bd31d7d9860f7040aeafbb128f5c12b8449f08f32cfd7c5b8205` |
| `public/fonts/overload-caps.woff2` | "Overload Caps", derived from `overload.woff2`: the character map sends A and E to the font's own `ss01` alternates (squared caps) and the family is renamed. Glyph outlines unchanged. Made with fontTools 4.67.0. Used for small HUD labels such as STAGE and TOTAL SCORE. | derived from the file above | CC0 1.0 (permits modification) | 2026-10-14 | `02d69c7687ff86f28b2564e9a4204ce96e196031f246dfda7d78aab0e5c8e163` |
| `public/fonts/exo2-latin.woff2` | Exo 2 by Natanael Gama, the sentence face. Variable font (weights 100 to 900), Latin subset, as served by Google Fonts (version v26). | [fonts.gstatic.com/s/exo2/v26/7cHmv4okm5zmbtYoK-4W4nIp.woff2](https://fonts.gstatic.com/s/exo2/v26/7cHmv4okm5zmbtYoK-4W4nIp.woff2), listed by [fonts.googleapis.com/css2?family=Exo+2](https://fonts.googleapis.com/css2?family=Exo+2:wght@500;700) | [SIL OFL 1.1](https://openfontlicense.org) | 2026-10-14 | `3dad6838887f694f0dbdaf521bf6241e4b1e4dabfd859eda6af27a77e4ba871a` |
| `public/fonts/exo2-OFL.txt` | The Exo 2 license text from the Google Fonts repository. | [google/fonts ofl/exo2/OFL.txt](https://raw.githubusercontent.com/google/fonts/main/ofl/exo2/OFL.txt) | SIL OFL 1.1 | 2026-10-14 | `7f95a8eeecc6904ffc81cd10cc8ebc7fcee72a67922924bf45f02dff03b88127` |

## Audio

Teggle ships no audio files. Every sound effect and the Fever music are synthesized in the browser at run time with the Web Audio API: oscillators, generated white noise, filters, envelopes, FM and a generated room impulse for the reverb. No recorded samples, sound libraries, MIDI files or recordings are used. A few heavy sounds and the music are rendered once into memory with an OfflineAudioContext after audio starts; that is still the same synthesis code.

| File | What it makes |
| --- | --- |
| `src/game/audio/synth.ts` | The instruments and building blocks: chimes, celesta, glockenspiel, timpani, drums, cymbals, brass, strings, bass, reed, noise hits, the room impulse and the master mix with its limiter. |
| `src/game/audio/sounds.ts` | Every sound effect (peg hits and pops, cannon, bucket, free balls, coin, style shots, warnings, HUD and UI sounds, the Fever sounds, every power and power moment). |
| `src/game/audio/score.ts` | "Ode to Joy", the finale theme of Beethoven's Symphony No. 9 (1824), public domain: the melody and harmony written out as note data in this file, and Teggle's arrangement of it. |
| `src/game/audio/music.ts` | Plays that arrangement on the instruments in `synth.ts`. |

The original game's sound files (in the owner's copy, outside the repository) were only measured, for length, pitch, envelope and brightness, so Teggle's sounds have a similar character (visual guide 14). None of their audio is copied, resampled, embedded or shipped. Review renders of every Teggle sound are made with `npm run audio:render` into `reference/teggle-audio/`, which is not committed.

## License notes

- **Overload.** The Typodermic public-domain page lists Overload under the heading "released under the official CC0 1.0 Universal public-domain dedication, with no rights reserved", and the font's JSON-LD record on that page names `https://creativecommons.org/publicdomain/zero/1.0/` as its license. The archive's `License.txt` says: "To the extent possible under law, Raymond Larabie has waived all copyright and related or neighboring rights to the fonts in this archive." Checked on 2026-10-14. CC0 allows modifying and renaming the font, which the Caps derivative does.
- **Exo 2.** Google Fonts metadata (`ofl/exo2/METADATA.pb`) lists the license as OFL and the upstream repository as `github.com/googlefonts/Exo-2.0`. The OFL allows bundling with software; the font is not sold on its own and keeps its name.
- A font is not a trademark of the original game. The original game used bitmap renderings of Overload; Teggle uses the font itself, never the original's bitmaps.
