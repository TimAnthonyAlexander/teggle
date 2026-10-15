# Master portraits: sources

As of 2026-10-16. The shipped files, their URLs, hashes and processing are in `docs/assets.md`; `tools/master-art.ts` downloads the originals and builds the files. The masters and powers come from spec section 7, the theme colors from visual guide section 13, what to avoid from visual guide section 15.

## The set

Nine masters are **Google Emoji Kitchen** stickers (the Gboard feature that combines two emoji into one picture), each the master's emoji combined with a face emoji. The **Gopher** is from Maria Letta's **Free Gophers Pack** (CC0), her drawings of the Go gopher.

Why Emoji Kitchen: it is the one source found that has nine of the ten masters in one style, each with the same four moods Teggle uses, drawn as faces that read at 66 units. The stickers are mostly heads, which suits the round launcher window, and come on transparent backgrounds. Searched first and set aside: Microsoft Fluent Emoji 3D (glossy, but 256 px, expressions only for the cat, no gopher, a faceless sunflower), Irasutoya (one artist with nearly all ten, a prairie dog for the gopher, but flat full-body drawings, a faceless side-view lobster and a winged wyvern close in build to the original's), and Pixabay portfolios (the four accounts covering the most masters mix styles, and two of them are AI-generated). No emoji set has a gopher, so the Gopher comes from a free set that has a gopher character in the same four moods.

Faces used, the same for all nine stickers:

| Expression | Face emoji | Gopher, Free Gophers Pack `characters/png/` |
| --- | --- | --- |
| neutral | slightly smiling face (U+1F642) | `6.png`, calm smile |
| happy | grinning face (U+1F600) | `35.png`, laughing |
| power | star-struck (U+1F929) | `63.png`, starry eyes |
| sad | crying face (U+1F622) | `12.png`, crying |

## Which master is which

| Stage | Master | Power id | Source |
| --- | --- | --- | --- |
| 1 | Unicorn | `guide` | unicorn face (U+1F984), white with a pink mane |
| 2 | Gopher | `multiball` | Free Gophers Pack, the Go gopher, head and shoulders |
| 3 | Cat | `pyramid` | cat face (U+1F431), orange tabby |
| 4 | Alien | `spaceBlast` | alien (U+1F47D), gray |
| 5 | Lobster | `flippers` | lobster (U+1F99E), red, face on the body |
| 6 | Pumpkin | `spookyBall` | jack-o'-lantern (U+1F383) |
| 7 | Sunflower | `flowerPower` | sunflower (U+1F33B), face in the flower |
| 8 | Rabbit | `luckySpin` | rabbit face (U+1F430), gray |
| 9 | Wyvern | `fireball` | dragon (U+1F409), green, front view (there is no wyvern emoji) |
| 10 | Owl | `zenBall` | owl (U+1F989), brown |

## Distance from the original

None of these is one of the original's characters or close to one: the unicorn has a pink mane (the original's is blue), the cat is a plain tabby face (no pharaoh headdress), the alien is a gray two-eyed head (the original is green and one-eyed), the lobster has no beret, the rabbit has no top hat, the dragon is a front-facing horned head (the original is a green long-snouted wyvern in profile with a monocle), the owl wears no robe and there is no yin-yang anywhere. The pumpkin and the sunflower are the generic jack-o'-lantern and sunflower faces the masters' names call for. The Gopher is blue and bareheaded (the original is brown in a hard hat). No image contains text, a logo or a watermark.

## What does not match

The Gopher is drawn with a thick black outline and the stickers have none, so it stands out a little in the master row. Neither set is glossy; both are flat cartoon with soft shading. The stickers are 534 px and the shipped squares 640 px, so at the 3x device cap the stage intro portrait (172 units of picture inside its bevel, 774 px) draws them about 1.2 times enlarged.
