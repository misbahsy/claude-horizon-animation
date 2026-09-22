---
name: horizon-reel
description: Make short launch videos (8-20s, 1920x1080 MP4 plus a GIF) in the collage "horizon" style of Anthropic's Claude model-launch films. The video cuts fast through dome-shaped horizons made from public-domain museum photos, microscope slides, NASA planet limbs and hand-drawn canvas shots (chalk, crayon, ink scribble, compass lines, paper cutouts), with film grain and a serif line of copy riding each curve. It signs off on a glowing planet-limb card with your brand lockup. Use this whenever someone wants a launch video, announcement reel, teaser, day 0 video, sizzle clip or animated social clip for a model, product or feature launch, especially when they share a reference video and say "make one like this", mention the Claude or Anthropic launch video, or want something more cinematic than a static card.
---

# Horizon reel

A reel is a dozen or more shots of about a third of a second each. Almost every shot is a horizon: the top of a very large circle across the lower half of the frame. It might be a museum plate cut from its backdrop, a lace veil turned upside down, a stem cross-section under a microscope, the Earth's limb from orbit, or a chalk drawing. Between cuts the material changes completely; the curve and the words stay. A short line of copy sits on the curve, a word or two at a time, growing slightly with each cut. The reel signs off on a planet limb that rises behind a brand lockup.

Everything is rendered in a deterministic canvas engine and captured frame by frame, so the same film renders identically every time and any shot can be changed and re-rendered in minutes. No image or video models are involved: photographs are real public-domain files with their sources logged, and drawn shots are procedural.

Run every command below from this skill's directory.

## Setup

Once per machine:

```bash
node scripts/setup.mjs
```

That installs `playwright-core` into this directory, finds or downloads Chromium, checks for `ffmpeg`, `curl` and the bundled fonts, and renders a two-second smoke test. Nothing touches the host project.

## Workflow

Work in a project folder outside any repo (a scratch or temp directory is ideal): `film.json` at its root and images in `media/`. The renderer serves that folder, so paths in the film are relative to it.

**1. Write the copy first.** Read the announcement (the blog post, release notes, PR) and take the line from it. The copy is three short runs and then the sign-off, for example "Day 0" / "support for" / "Claude Opus 5.5" and then the brand lockup. The last run is the payoff and gets the most shots. Keep each run to one to three words, because it has to read in a third of a second on a curve. Don't reuse the reference film's own tagline, and make sure every claim is true.

**2. Source the images.** Read `references/sources.md` for the queries that have produced good domes, then run a few at a time:

```bash
node scripts/source.mjs <project>/media --from met --q "plate" --medium Ceramics --n 6
node scripts/source.mjs <project>/media --from aic --q "porcelain plate" --n 6
node scripts/source.mjs <project>/media --from commons --q "Berkshire Community College Bioscience Image Library stem cross section" --n 6
node scripts/sheet.mjs <project>/media <project>/candidates.png --cols 8 --per 32
```

Open the contact sheet and pick. You are looking for one of two things. The first is an object with a round or arched top edge on a plain backdrop: a plate, a semicircular veil, a slide section. The second is a dense texture that reads well clipped into a dome: a carpet, a Haeckel plate, a lunar surface, a cell field. Roughly 60% photographs and 40% drawn shots matches the reference's mix. `source.mjs` keeps only public domain and CC0 files and records each one in `media/credits.json`.

**3. Write `film.json`.** Read `references/film-spec.md` for the full contract. `examples/opus-5-5/film.json` is a finished film to copy from. Its shape:

- Three or four wordless shots at 420 to 480ms. An opening orbital limb photograph (`fit: cover`, `dome: false`, about 1.2s) is optional; the reference has one, but it can feel slow in a short cut.
- The word runs, with cuts shortening from about 400ms to about 270ms. The acceleration is the film's heartbeat; see the timing table in `references/style.md`.
- Two cards: the lockup over a cool limb (about 1.3s), then the same lockup rising as a warm limb comes up behind it (about 1.9s). `lockup` takes a preset name or your own `{ "text", "mark" | "markSrc", "family" }`.

Alternate the sky colour hard between neighbouring shots (black, cream, teal, purple, pale blue, denim) and alternate photo with drawing. Two dark shots or two plates in a row flatten the cut.

**4. Look at stills before rendering the film.** A stills sheet renders one frame per shot in about fifteen seconds:

```bash
node scripts/render.mjs <project>/film.json <project>/stills.png --stills --cols 5
node scripts/render.mjs <project>/film.json <project>/frame.png --at 4200
```

Read the sheet image and check every shot against the quality bar in `references/style.md`. Object cut-outs are automatic and usually right, but look at each one: a museum backdrop with a strong gradient or a hard shadow can leave a grey band or specks at the rim. The fixes, in the order to try them, are `shape: "ellipse"` for round objects, a higher `edgeTol`, a manual `box`, or a different image.

**5. Render.** About five seconds of wall time per second of film:

```bash
node scripts/render.mjs <project>/film.json <project>/reel.mp4 --gif
```

This writes the MP4, a GIF sized for GitHub's 10MB limit, and `reel.credits.md` naming every photograph used, with its licence and source page. Then pull a few frames around a fast cut (`ffmpeg -ss 5.9 -i reel.mp4 -vf tile=4x2 -frames:v 1 strip.png`) and look at them: the cut should land between frames with no blank or half-drawn frame.

**6. Sound.** The reel is silent by default. The reference is cut to music, so when a track is supplied, mux it with `--audio track.m4a --audio-start <seconds>` and line the track's biggest hit up with the first card: `--audio-start` equals the hit's time in the track minus the time the first card starts. Use only music the requester has the right to publish. The soundtrack of someone else's launch film is almost always licensed to them alone.

**7. Hand over.** Send the MP4, the GIF and the credits file, and say which photographs were used, since a public-domain museum object can still be recognisable. To share or commit the film without its images, run `node scripts/lock.mjs <project>/film.json`. It writes a `source.sh` that re-downloads exactly those files with their credits.

## Rules

Photographs come only from `source.mjs` or files the requester supplies and has the rights to. Every photograph in a film needs a line in `media/credits.json`; the renderer flags any that don't. Never generate or retouch imagery with an image model, and never pull frames from someone else's video, including the reference film.

The reel echoes the reference's structure and texture; it does not copy its frames, its tagline, its soundtrack or its sign-off. The last card carries the requester's own mark, not the reference brand's.

Copy is plain and true. No marketing adjectives on the curve. If a word run would not survive being read aloud in one breath, cut it.

## Reference files

- `references/film-spec.md`: the film JSON contract, every shot kind, colour treatments, edge styles, the cut-out options, lockups.
- `references/style.md`: what makes the reference work (shot anatomy, timing, type, colour) and the quality bar to check before handing over.
- `references/sources.md`: the image sources, their licences, the queries that work, and crop recipes for common objects.
- `examples/opus-5-5/`: a finished 9.5s day 0 reel for Claude Opus 5.5 on LiteLLM. Run `bash source.sh` in a copy of that folder to fetch its media, then render.
