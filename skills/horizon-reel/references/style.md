# The look, and the bar to check against

## What the reference film does

The reference is Anthropic's twenty-second Claude Opus 5.5 launch film. Broken down shot by shot, it has a small number of rules, and the reel only works when all of them hold at once.

**One shape, many materials.** Every shot is the top of a dome crossing the lower half of the frame at about the same height. What fills the dome changes completely on every cut: a petri dish, bread crust, a leaf, a Greek-key pot, lace, agate, a stem section, a horse on a plate, crayon, a blueprint, cut paper, fur. The curve is the continuity, so the material can change as much as you like.

**Material types, in roughly these proportions.**
- Macro and museum photographs of real objects, cut on their own edge (about half).
- Microscopy and scientific imagery: cell sections, stained tissue (about a sixth).
- Drawn media on paper: chalk on blue, crayon, pen scribble, compass geometry, paper cutouts (about a quarter).
- Planet limbs from orbit, at the open and close.

**Colour.** Each sky is one flat, saturated or paper colour: black, cream, teal, violet, pale blue, denim, mustard. Neighbouring shots contrast hard. About a third of the photographs are pushed into false colour (posterised gradient maps: neon green against magenta, magenta against yellow). The rest stay natural but contrasty.

**Type.** A bookish serif at medium weight, lowercase where the words allow, set on the curve with the baseline a few pixels above the rim. The first phrase is small (about 14% of the frame width). Each new phrase starts larger, and the payoff word grows on every cut until it is roughly a third of the frame wide. White on dark skies, near-black on light ones, occasionally semi-transparent.

**Rhythm.** The cuts accelerate. Measured from the reference, by position in the film:

| Section | Shot length |
|---|---|
| Opening limb | 1.2s, a slow push |
| Wordless shots | 450 to 550ms |
| First phrase | about 450ms |
| Second phrase | 350 to 450ms |
| Payoff word | 300ms, falling to about 240ms by the end |
| Name card | 1s, cut in hard |
| Brand card | 1s, then a limb rises behind the mark for 2 to 3s |

A fifteen-shot reel at this pace runs about eleven seconds, which is the right length for a day 0 post.

**Surface.** Visible film grain, a faint exposure flicker, soft vignetting, and a slow push-in inside every shot. The drawn shots boil on twos, so their lines shimmer slightly the way redrawn cels do.

**Sign-off.** Dark ground, a thin bright limb low in frame with a blue halo, the product name small and centred, then the brand mark. It ends as the limb rises like a sunrise.

## Quality bar

Look at the stills sheet and at frames from the MP4, not at the JSON. Check each of these by name.

**Every shot is a horizon.** The top of the object or dome crosses the frame at roughly the same height as its neighbours (film `top` about 0.5), and the curve is visible at both frame edges. An object sitting low in the frame with empty sky above it reads as a product photo rather than a horizon.

**Cut-outs are clean.** No grey band of museum backdrop above the rim, no specks floating in the sky, no bite taken out of a pale object. If you can see the backdrop, fix it (ellipse, `edgeTol`, `box`) or drop the image.

**The word sits on the rim.** It rides the object's curve, clears the rim by a hair and is never swallowed by it. Where an object's ornament rises above its bounding curve (lace, crests, scallops), lift the word with `wordLift`. The scribble shot is the one that is meant to cross the word.

**Neighbours contrast.** No two neighbouring shots share a sky tone, and no two neighbouring shots are both plates, both microscopy or both drawings.

**The word reads in its shots.** Pause on the first shot of each run: it must be legible there, at the smallest size, against that sky.

**The payoff lands.** The last run has the most shots, the shortest cuts and the biggest type. If the film ends before the payoff has grown, add a shot there rather than slowing the cuts.

**The cards hold.** The lockup is on screen for at least a second before the limb starts to rise, and the last frame is the finished lockup over a risen limb, not a mid-motion frame.

**No borrowed pixels.** Every photograph has a line in the credits file, and none of it comes from the reference film or any other company's footage.

**Truthful copy.** The words on the curve are the announcement's own claim in fewer words. Check them against the blog post.
