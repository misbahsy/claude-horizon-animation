# Film spec

A film is one JSON file. Paths inside it are relative to the file, which is also the folder the renderer serves. Durations are milliseconds.

## Top level

| Key | Default | What it does |
|---|---|---|
| `size` | `[1920, 1080]` | Artboard in pixels. The engine draws at this size; there is no upscaling. |
| `fps` | `30` | Capture rate. |
| `top` | `0.6` | Where the top of the dome sits, as a fraction of the height. The reference sits around `0.5`; `0.52` is a good default. |
| `curve` | `1.25` | Dome radius in frame widths. Smaller is rounder. `0.95` reads like the reference; below `0.7` it becomes a ball. |
| `push` | `0.04` | Slow push-in across each shot (4% scale over the shot), centred on the dome's top. Keeps hard cuts from feeling static. |
| `grain` | `0.16` | Film grain strength (overlay blend). `0` turns grain and flicker off. |
| `flicker` | `0.035` | Per-frame exposure wobble, as a fraction. |
| `vignette` | `0.32` | Corner darkening. |
| `type` | see below | The serif that rides the curve. |
| `shots` | | The film, in order. |

`type`: `{ "family": "Source Serif 4", "weight": 500, "size": 70, "step": 0.2, "grow": 0.22, "gap": 0.16, "tracking": -0.012 }`

- `family`: `Source Serif 4` or `Newsreader` (both bundled). Add others in `assets/reel.html`.
- `size`: px size of the first word run.
- `step`: each later run starts this much larger (0.28 means +28% per run).
- `grow`: how much a run grows from its first shot to its last.
- `gap`: space between the rim and the baseline, in ems.

## Every shot

| Key | What it does |
|---|---|
| `dur` | Length in ms. |
| `kind` | `photo`, `chalk`, `crayon`, `compass`, `scribble`, `cutout`, `cells`, `limb`, `flat`, `card`. |
| `sky` | Flat colour above the dome. For object shots it replaces the museum backdrop. |
| `word` | Copy on the curve. Consecutive shots with the same word form a run and share one growing size. |
| `ink` | Word colour. Default is chosen from the sky's luminance. |
| `inkAlpha` | Word opacity, for a pale word on a pale sky. |
| `wordSize`, `wordGap`, `wordLift` | Per-shot overrides for size, rim gap (ems) and an extra lift in px when the object's rim is taller than its bounding curve. |
| `top`, `curve`, `cx` | Per-shot dome geometry. `cx` shifts the dome sideways, as a fraction of width. |
| `push` | Per-shot push-in. |
| `edge`, `edgeAmp` | Dome edge style for cover photos and drawn shots: `clean`, `rough`, `torn`, `scallop`, `ridge`. `edgeAmp` is the amplitude in px. |
| `seed` | Fixes the randomness of drawn shots. Defaults to one per shot index. |
| `boil`, `hold` | Drawn shots redraw their lines at `boil` Hz (default 12, "on twos"). `hold: true` freezes them. |

## Photo shots

`{ "kind": "photo", "src": "media/x.jpg", "fit": "object" | "cover", ... }`

Shared keys: `flip` (`"h"`, `"v"`, `"hv"`), `rotate` (degrees), `treat` (colour treatment, below).

### `fit: "object"`

Cuts a museum object off its backdrop and sets its top edge on the horizon. Plates, bowls turned upside down, a semicircular veil or collar, a round slide section.

| Key | Default | What it does |
|---|---|---|
| `width` | `1.3` | Object width in frame widths. The dome radius (for the word) defaults to half of this. |
| `dx`, `dy` | `0` | Nudge, as fractions of width and height. |
| `shape` | pixel mask | `"ellipse"` replaces the mask with an ellipse fitted to the object's box. Cleanest for plates and dishes. |
| `edgeTol` | `6` | How big a colour step the backdrop fill may take per pixel. Raise it (8 to 12) when a shadow or gradient is left behind; lower it if the fill eats into a pale object. |
| `reach` | `200` | How far from the border's typical colour the fill may wander. |
| `threshold` | `36` | Seeding tolerance for the border. Rarely needs changing. |
| `despeckle` | `2` | Cleanup passes that remove isolated specks. |
| `box` | auto | `[left, top, right, bottom]` as fractions of the (oriented) image, when detection picks the wrong box. |
| `keepBackdrop` | `false` | Keep the photograph's own backdrop instead of `sky`. Right for images where the backdrop is part of the look (the inverted lace veil). |

### `fit: "cover"`

The image fills the frame and the dome clips it. Textures, planet surfaces, full-frame slides.

| Key | Default | What it does |
|---|---|---|
| `zoom` | `1` | Scale beyond cover. |
| `focus` | `[0.5, 0.5]` | Point of the image to centre, as fractions. |
| `dome` | `true` | `false` shows the whole frame with no clip. Used for photographs that are already a horizon, like the NASA limbs. |
| `rim` | none | `{ "color", "width" }` strokes the dome edge. |

### `treat`

Applied once at load, never per frame.

- Gradient map, the false colour of a risograph or a thermal print: `{ "map": ["#170629", "#c21f74", "#ff9d1c", "#3ce6a6"], "steps": 5, "contrast": 1.2 }`. Luminance picks a colour along `map`; `steps` posterises; `invert` flips luminance first; `gamma` and `brightness` shape it.
- Plain grading: `{ "contrast": 1.35, "sat": 0 }` (a black and white moon), `{ "sat": 1.3 }`, `{ "steps": 4 }` (posterised colour).

## Drawn shots

All take `sky`, `word`, `seed`, and the geometry keys. Colours are optional.

| Kind | What it draws | Colour keys |
|---|---|---|
| `chalk` | Blueprint: chalk arcs, radial ticks, loose construction lines on blue paper. | `sky`, `ink2` (chalk) |
| `crayon` | Three waxy crayon arcs on pale paper. | `sky`, `ink2` |
| `compass` | Geometry-set drawing: the rim, fanned rays and chords in black, red and blue ink on cream. | `sky`, `inks` (array) |
| `scribble` | Pen scribble in the dome, drawn over the word as the reference does. `density` (80) and `climb` (45px above the rim). | `sky`, `ink2` |
| `cutout` | Torn-paper dome in blue with cut-paper shapes. | `sky`, `fill`, `inks` |
| `cells` | A procedural stem cross-section, for when no slide photo fits. | `sky`, `fill`, `ink2` (walls), `ink3` (bundles) |
| `limb` | A planet limb: dark body, bright rim, halo. | `sky`, `halo` (3 colours), `body` (3), `line`, `warm` |
| `flat` | A flat dome on a flat sky, as a breather. | `sky`, `fill` |

## Cards

`{ "kind": "card", "dur": 1300, "lockup": "litellm", "size": 60, "limb": { "from": 0.95, "curve": 1.1 } }`

| Key | What it does |
|---|---|
| `lockup` | A brand mark beside a wordmark. A preset name (`"litellm"`: the train emoji and "LiteLLM" in Geist 500) or your own object: `{ "text": "Acme", "mark": "✨" }` for an emoji mark, or `"markSrc": "media/logo.png"` for an image (a transparent PNG or SVG in the project), plus optional `family`, `weight`, `tracking`, `markScale`. Omit `lockup` and use `text` for a serif line such as a model name. |
| `text`, `size`, `family`, `weight` | The line and its type. |
| `y` | Vertical position (fraction), or `[from, to]` to drift it. `ySpan` is the fraction of the shot the drift takes. |
| `bg`, `ink` | Card colours. |
| `limb` | A limb behind the card: `from` and `to` are dome tops as fractions of height (rise it from `0.97` to `0.66`), `span` is the fraction of the shot the rise takes, `curve` the radius, `warm: true` adds the orange sunrise line. |
| `fadeIn` | ms to fade the text in. The reference cuts cards in hard, so this is usually omitted. |
