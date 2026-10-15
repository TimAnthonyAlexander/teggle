# Master portraits: prompts and process

As of 2026-10-15. Companion to `docs/assets.md`, which lists every shipped portrait file. The ten masters and their powers come from spec section 7; their theme colors from visual guide section 13; what they must not resemble from visual guide section 15.

## Status

Five of the ten neutral portraits exist. Generation stopped on 2026-10-15 when the OpenAI API account ran out of credit (`429 credit_balance_exhausted`, on both image servers configured here, which share one API key). No expression edits have been made yet.

| Stage | Master | Power id | neutral | happy | power | sad |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | Unicorn | `guide` | shipped | | | |
| 2 | Gopher | `multiball` | | | | |
| 3 | Cat | `pyramid` | shipped | | | |
| 4 | Alien | `spaceBlast` | shipped | | | |
| 5 | Lobster | `flippers` | shipped | | | |
| 6 | Pumpkin | `spookyBall` | shipped | | | |
| 7 | Sunflower | `flowerPower` | | | | |
| 8 | Rabbit | `luckySpin` | | | | |
| 9 | Wyvern | `fireball` | | | | |
| 10 | Owl | `zenBall` | | | | |

The game copes with the gaps: `MasterPortraits.best()` falls back to the neutral portrait when an expression is missing, and draws nothing when the neutral is missing too. `#/dev/masters` marks every missing file.

## Process

- **Model.** gpt-image-2 through the `gpt-image-2` MCP server, size 1024x1024, quality high for finals, medium for style tests.
- **No transparent output.** The API refused `background: "transparent"` for this account ("Transparent background is not supported for this model"). Every portrait is generated on a flat chroma-key background and cut out by `tools/master-art.ts` (keying, framing, 896 px WebP; details in its header). Pure green `#00FF00` for most masters; magenta for the green Gopher and blue for the pink Sunflower and the orange Wyvern, so the key color never appears in the character.
- **Inputs.** Only Teggle's own generated images were passed to the model as references: style tests 2 and 3 for design and rendering, and the Unicorn neutral for framing and scale. No file from `reference/peggle-2007/` or `Peggle.Deluxe/` was ever passed to the model, traced or copied. The original's character sheet (`pak/characters/Characterset.jp2`, `Feature_*.jp2`) was looked at once, only to know what to avoid.
- **Identity across expressions (planned).** Each expression is derived from its master's neutral portrait with its own edit session (`start_edit_session` on the neutral, then `continue_edit_session` only to fix that same expression), never chained from another expression.
- **Files.** Raw outputs, keyed PNGs, framed PNGs and `framing.json` (the per-master scale the neutral sets and the expressions reuse) live in `reference/teggle-art/masters/` (gitignored). Only the WebP finals are in `public/art/masters/<powerId>/<expression>.webp`.
- **Review.** `#/dev/masters` (overview, true sizes) and `#/dev/masters/<powerId>` (intro portraits, real launcher housing, thumbnails). `npm run shots masters` captures them into `reference/teggle-shots/masters/`.

## The cast look

Settled by three style tests. Friendly 2007-era casual-game mascots: chunky toy-like proportions with an oversized head, smooth vinyl-toy shading with little texture, soft airbrushed gradients, glossy highlights, a thick clean dark brown-black outline, huge eyes with big catchlights, key light from the top left, a cool rim light on the right. Head-and-shoulders, almost frontal, a slight three-quarter turn, the bust running off the bottom edge.

## Designs and distance from the original

| Master | Teggle design | Power hint | Not like the original's character |
| --- | --- | --- | --- |
| Unicorn | young unicorn, dappled steel-blue coat, silver-white braided mane, brass navigator goggles, navy neckerchief | glowing aqua crystal horn (a guiding light) | the original is a white unicorn with a blue mane and a toothy grin |
| Gopher | chubby sandy-gray gopher, round cheeks, leaf-green neckerchief, clover sprig behind one ear | two shiny steel balls held up in its paws | the original is brown and wears a yellow miner's hard hat |
| Cat | plump amber-gold short-haired cat, soft stripes, lynx ear tufts, sapphire eyes, brown leather collar | small gold triangle pendant | the original wears a pharaoh headdress and carries a crook |
| Alien | lilac-purple, bulb head, three eyes in a row, small round ears | antennae tipped with glowing pink stars, a gold planet-ring collar | the original is a green one-eyed creature |
| Lobster | bright aqua-blue lobster, eyes on short stalks, coral-orange neckerchief | both claws raised beside the face like flippers | the original is red and wears a beret |
| Pumpkin | deep burgundy pumpkin head with a painted face, curly silver stem and tendril, silver hooded cloak | silver ghostly colors of the Spooky Ball | the original is an orange carved jack-o'-lantern |
| Sunflower | rose-pink petals with golden tips, cream face ringed with seeds, leaves raised like hands, pink bow | the flower itself | the original has yellow petals and a brown face |
| Rabbit | young cream-and-tan lop-eared rabbit, freckles, red quilted vest with gold buttons | small gold prize-wheel pin | the original is an old white rabbit in a purple top hat |
| Wyvern | young orange-amber wyvern, golden belly plates, small cream horns, wings folded behind the shoulders | a few embers, a wisp of flame at one nostril | the original is a green dragon with a mustache and monocle |
| Owl | young silver-white barn owl, heart-shaped face, silver-blue scarf | smooth gray river-stone pendant | the original is an old owl with bushy brows in a robe; no yin-yang anywhere |

## Style tests (2026-10-15)

**Test 1**, `generate_image`, 1536x1024, medium. Rejected: read as a detailed modern illustration (fur strands, whiskers, fine texture), and the pumpkin came out red-orange. The API refused a first attempt with `background: "transparent"` (and a transparent background instead of the green one in the text) before generating; the run below is the green-background version.

```text
A style test lineup of three original cartoon mascot characters for a cheerful 2000s casual PC puzzle game, side by side, evenly spaced, each one a head-and-shoulders bust facing the viewer in a slight three-quarter turn, all at the same scale, each with its whole head (ears, horn, stem) fully inside the frame with headroom above, busts cut off softly at the chest.

Rendering, identical for all three: polished cartoon illustration with soft painted volume and smooth airbrushed shading, glossy specular highlights on eyes and shiny surfaces, a clean dark brown-black outline of even medium weight around each silhouette and its main shapes, saturated but not neon colors, big expressive friendly eyes with bright catchlights, simple bold shapes that still read when shrunk to 64 pixels. One key light from the top left, a soft cool rim light on the right edge.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no ground shadow, no glow, no scenery. No text, no letters, no logo, no watermark, no frame.

Left: a young unicorn with a dappled steel-blue coat, a tidy silver-white mane in a short braid, a slim spiral horn of pale glowing aqua crystal, small round brass navigator goggles pushed up on its forehead, a navy neckerchief, gentle closed-mouth smile.

Middle: a sleek amber-gold short-haired cat with faint darker stripes, tufted lynx-like ear tips, sapphire-blue eyes, a slim brown leather collar with a small polished gold triangular pendant, calm confident half-smile.

Right: a friendly pumpkin character, the pumpkin itself is the head, deep maroon-red ribs with a curly silver-gray stem and a silvery vine tendril, real cartoon eyes and a small smiling mouth painted on (not carved), a soft warm glow on its cheeks, wearing a pale silver hooded cloak collar around its shoulders.
```

**Test 2**, `generate_image`, 1536x1024, medium. Accepted; it is the style reference `style-test-2`.

```text
A style test lineup of three original cartoon mascot characters for a cheerful 2000s casual PC puzzle game, side by side, evenly spaced, each one a head-and-shoulders bust facing the viewer in a slight three-quarter turn, all at the same scale, each with its whole head (ears, horn, stem) fully inside the frame with headroom above, busts cut off softly at the chest.

Rendering, identical for all three: chunky rounded toy-like proportions with an oversized head, smooth soft-shaded surfaces like polished vinyl toys, very little texture (no fur strands, no fine hair lines, no whisker clutter), soft airbrushed gradients, bright glossy specular highlights on the eyes, nose and shiny surfaces, a thick clean dark brown-black outline of even weight around each silhouette, thinner inner lines, saturated but not neon colors, huge expressive friendly eyes with big catchlights, simple bold shapes that still read when shrunk to 64 pixels. Painted with one key light from the top left, a soft cool rim light on the right edge.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no ground shadow, no glow, no scenery. No text, no letters, no logo, no watermark, no frame.

Left: a young unicorn with a dappled steel-blue coat, a tidy silver-white mane in a short braid, a slim spiral horn of pale glowing aqua crystal, small round brass navigator goggles pushed up on its forehead, a navy neckerchief, gentle closed-mouth smile.

Middle: a plump amber-gold short-haired cat with a few soft darker stripes, tufted lynx-like ear tips, sapphire-blue eyes, a slim brown leather collar with a small polished gold triangular pendant, calm confident half-smile.

Right: a friendly pumpkin character, the pumpkin itself is the head, a deep burgundy-maroon pumpkin the color of dark red wine (not orange), with a curly silver-gray stem and a silvery vine tendril, real cartoon eyes and a small smiling mouth painted on (not carved), wearing a pale silver hooded cloak collar around its shoulders.
```

**Test 3**, `edit_image` with test 2 as the only input, 1536x1024, medium. Accepted; it is the style reference `style-test-3` and checked that a reference carries the rendering without copying its characters.

```text
Use the attached image only as the style reference: match its rendering exactly (chunky rounded toy-like proportions, oversized heads, smooth vinyl-toy shading with very little texture, soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes, key light from the top left, cool rim light on the right), its scale, spacing and head-and-shoulders bust framing, and its perfectly flat pure chroma-key green (#00FF00) background. Do not reuse the unicorn, cat or pumpkin; replace them with three new original characters:

Left: a friendly alien with smooth lilac-purple skin, three big round eyes in a row, two thin antennae each tipped with a small glowing pink star, a rounded head, a collar shaped like a tilted planet ring in pale gold around its neck, a cheerful little smile.

Middle: a bright aqua-blue lobster standing upright, a rounded friendly face with big eyes on short stalks, two long sweeping antennae, both big claws raised at shoulder height beside its face, a coral-orange neckerchief, a happy open smile.

Right: a young barn owl with silver-white feathers and a heart-shaped pale face, big calm dark eyes, a small neat beak, a thin silver-blue scarf, and a smooth round gray river-stone pendant on a cord.

No text, no letters, no logo, no watermark, no frame, no ground shadow.
```

## Neutral portraits (shipped)

All five: `edit_image`, 1024x1024, quality high, green key, generated 2026-10-15. Inputs are named in each heading; no edits after generation other than `tools/master-art.ts`.

### Unicorn (`guide`), inputs: style test 2, style test 3

```text
Redraw the unicorn on the left of the first attached image as a single character portrait, alone, keeping its exact design: dappled steel-blue coat, silver-white mane in a short braid, slim spiral horn of pale glowing aqua crystal, small round brass navigator goggles pushed up on its forehead, navy neckerchief. Keep the exact rendering of both attached images: chunky rounded toy-like proportions, oversized head, smooth vinyl-toy shading with very little texture, soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing: head-and-shoulders portrait, the head centered horizontally and facing the viewer almost frontally with a slight three-quarter turn, eyes looking at the viewer. The tip of the horn and the ears sit fully inside the image with a clear margin above them (about 6 percent of the height). The face sits in the upper middle of the image. The neck, shoulders and chest continue down and run off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm friendly resting face, mouth closed in a gentle smile.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

### Cat (`pyramid`), inputs: style test 2, Unicorn neutral

```text
Redraw the cat in the middle of the first attached image as a single character portrait, alone, keeping its exact design: plump amber-gold short-haired cat with a few soft darker stripes, tufted lynx-like ear tips, sapphire-blue eyes, slim brown leather collar with a small polished gold triangular pendant. Use the second attached image (the unicorn) only as the reference for framing, scale and rendering, do not copy anything of the unicorn itself. Keep the exact rendering of both images: chunky rounded toy-like proportions, oversized head, smooth vinyl-toy shading with very little texture (no fur strands, only a few short whiskers), soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing exactly like the unicorn image: head-and-shoulders portrait, the head centered horizontally, facing the viewer almost frontally with a slight three-quarter turn, eyes looking at the viewer, the face in the upper middle of the image, the ear tufts fully inside the image with a clear margin above them, the neck, shoulders and chest continuing down and running off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm friendly resting face, mouth closed in a gentle confident smile.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

### Pumpkin (`spookyBall`), inputs: style test 2, Unicorn neutral

```text
Redraw the pumpkin character on the right of the first attached image as a single character portrait, alone, keeping its exact design: the pumpkin itself is the head, a deep burgundy-maroon pumpkin the color of dark red wine (not orange, not bright red), a curly silver-gray stem with a silvery vine tendril, real cartoon eyes and a small smiling mouth painted on (not carved, no glowing cut-outs), a pale silver hooded cloak collar around its shoulders closed with a round silver clasp. Use the second attached image (the unicorn) only as the reference for framing, scale and rendering, do not copy anything of the unicorn itself. Keep the exact rendering of both images: chunky rounded toy-like proportions, smooth vinyl-toy shading with very little texture, soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing exactly like the unicorn image: head-and-shoulders portrait, the pumpkin head centered horizontally, facing the viewer almost frontally with a slight three-quarter turn, eyes looking at the viewer, the face in the upper middle of the image, the stem and tendril fully inside the image with a clear margin above them, the cloak, shoulders and chest continuing down and running off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm friendly resting face, mouth closed in a gentle smile.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

### Alien (`spaceBlast`), inputs: style test 3, Unicorn neutral

```text
Redraw the alien on the left of the first attached image as a single character portrait, alone, keeping its design and making it a little more charming: smooth lilac-purple skin with a soft violet sheen, a rounded bulb-shaped head, three big round eyes in a row with violet irises, two thin antennae each tipped with a small glowing pink star, small rounded ears, a pale gold collar shaped like a tilted planet ring around its neck, a few tiny lighter freckle spots on its cheeks. Use the second attached image (the unicorn) only as the reference for framing, scale and rendering, do not copy anything of the unicorn itself. Keep the exact rendering of both images: chunky rounded toy-like proportions, oversized head, smooth vinyl-toy shading with very little texture, soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing exactly like the unicorn image: head-and-shoulders portrait, the head centered horizontally, facing the viewer almost frontally with a slight three-quarter turn, eyes looking at the viewer, the face in the upper middle of the image, the antenna stars fully inside the image with a clear margin above them, the neck, shoulders and chest (a simple purple body) continuing down and running off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm friendly resting face, mouth closed in a gentle smile.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

### Lobster (`flippers`), inputs: style test 3, Unicorn neutral

```text
Redraw the lobster in the middle of the first attached image as a single character portrait, alone, keeping its exact design: a bright aqua-blue lobster standing upright, a rounded friendly face with big eyes on short stalks, two long sweeping antennae, both big claws raised at shoulder height beside its face, a coral-orange neckerchief, segmented shell on its chest. Use the second attached image (the unicorn) only as the reference for framing, scale and rendering, do not copy anything of the unicorn itself. Keep the exact rendering of both images: chunky rounded toy-like proportions, smooth vinyl-toy shading with very little texture, soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing like the unicorn image: head-and-shoulders portrait, the head centered horizontally, facing the viewer almost frontally, eyes looking at the viewer, the face in the upper middle of the image, both raised claws close beside the face and fully inside the image left and right, the antennae curving and fully inside the image with a clear margin above them (let them sweep sideways rather than straight up), the chest continuing down and running off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm friendly resting face, mouth closed in a gentle smile.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

## Next pass: prompts ready, not generated yet

Same call as the shipped neutrals: `edit_image`, 1024x1024, quality high. The Owl was sent once and refused for lack of credit; the other four have not been sent.

**Owl (`zenBall`)**, inputs: style test 3, Unicorn neutral; green key.

```text
Redraw the barn owl on the right of the first attached image as a single character portrait, alone, keeping its design: a young barn owl with silver-white and pale silver-gray feathers, a heart-shaped pale face with a thin warm-gray rim, big calm dark eyes, a small neat lilac-gray beak, a thin silver-blue scarf wrapped around its neck, a smooth round gray river-stone pendant on a cord, folded wings at its sides. Use the second attached image (the unicorn) only as the reference for framing, scale and rendering, do not copy anything of the unicorn itself. Keep the exact rendering of both images: chunky rounded toy-like proportions, oversized head, smooth vinyl-toy shading with very little texture (soft feather shapes, no fine feather lines), soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing exactly like the unicorn image: head-and-shoulders portrait, the head centered horizontally, facing the viewer almost frontally with a slight three-quarter turn, eyes looking at the viewer, the face in the upper middle of the image, the top of the head fully inside the image with a clear margin above it, the shoulders, wings and chest continuing down and running off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm, serene, friendly resting face, eyes fully open.

Background: one perfectly flat, uniform pure chroma-key green (#00FF00) fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

**Gopher, Sunflower, Rabbit, Wyvern**, inputs: style test 2, Unicorn neutral. One template; `{DESIGN}`, `{TOP}` and `{KEY}` per master below.

```text
Draw one new original character as a single character portrait, alone: {DESIGN}. Use the attached images only as the reference for rendering, framing and scale, do not copy any of their characters. Keep the exact rendering of both images: chunky rounded toy-like proportions, oversized head, smooth vinyl-toy shading with very little texture, soft airbrushed gradients, glossy highlights, thick clean dark brown-black outline, huge friendly eyes with big catchlights, key light from the top left, cool rim light on the right edge.

Framing exactly like the unicorn image: head-and-shoulders portrait, the head centered horizontally, facing the viewer almost frontally with a slight three-quarter turn, eyes looking at the viewer, the face in the upper middle of the image, {TOP} fully inside the image with a clear margin above, the shoulders and chest continuing down and running off the bottom edge of the image (no rounded bust cut, no base).

Expression: neutral, a calm friendly resting face, mouth closed in a gentle smile.

Background: one perfectly flat, uniform pure chroma-key {KEY} fill edge to edge, no gradient, no vignette, no shadow, no glow on the background, no scenery. No text, no letters, no logo, no watermark, no frame.
```

| Master | `{DESIGN}` | `{TOP}` | `{KEY}` |
| --- | --- | --- | --- |
| Gopher (`multiball`) | a chubby sandy-gray gopher with round cheeks and two big front teeth, a leaf-green neckerchief, a small clover sprig tucked behind one ear, holding up two small shiny steel balls, one in each paw, at shoulder height beside its face, no hat | the ears and both steel balls | magenta (#FF00FF) |
| Sunflower (`flowerPower`) | a sunflower character whose flower is the head: rose-pink petals with golden tips around a creamy golden face ringed by a band of dark brown seeds, rosy cheeks, two broad green leaves raised like hands, a short green stem neck with a pink ribbon bow | every petal | blue (#0000FF) |
| Rabbit (`luckySpin`) | a young cream-and-tan lop-eared rabbit with a few freckles, a red quilted vest with gold buttons over a white shirt collar, a small round gold pin shaped like a prize wheel on the vest, no hat, no playing cards | the top of the head and the ears | green (#00FF00) |
| Wyvern (`fireball`) | a young orange-amber wyvern with golden belly plates, small curled cream horns, leathery orange wings folded up behind its shoulders, a tiny wisp of flame at one nostril and two or three small glowing embers close to its shoulders, no mustache, no monocle | the horns and wing tips | blue (#0000FF) |

## Expression edits (planned)

For each master, three edit sessions, each started from that master's neutral raw image (not the keyed file, so the background stays the flat key color). Processing: `npx tsx tools/master-art.ts <powerId> <expression> <raw.png> <key>`.

```text
happy: Keep this exact character, its design, colors, outfit, rendering, framing, size and position, and the flat chroma-key background unchanged. Change only the expression to happy, as after a good shot: a big delighted open-mouth smile, eyes bright and slightly squeezed with joy, cheeks raised, ears or antennae perked up. No text.

power: Keep this exact character, its design, colors, outfit, rendering, framing, size and position, and the flat chroma-key background unchanged. Change only the expression to excited and amazed, as when its power has just triggered: eyes wide and sparkling, mouth open in an excited grin, eyebrows high, and {POWER HINT} glowing a little brighter on the character itself (no glow, sparkles or particles on the background). No text.

sad: Keep this exact character, its design, colors, outfit, rendering, framing, size and position, and the flat chroma-key background unchanged. Change only the expression to disappointed, as after a miss: brows drawn together and raised in the middle, eyes looking a little down, a small frown, ears or antennae drooping. Not crying. No text.
```

## Generation count

2026-10-15: 8 billed calls (2 generations and 1 edit for the style tests, 5 neutral edits). 3 further calls were refused without output: the first style test with a transparent background, and two neutral attempts after the credit ran out.
