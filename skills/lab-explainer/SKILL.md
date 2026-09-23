---
name: lab-explainer
description: Make a short 3D explainer film in which an apparatus on a dark lab bench demonstrates a formula live. Controls move on screen, the model responds, and every number, highlight and sentence is computed from the real equation. Glowing overlays (rays, beams, planes, angle arcs) show the mechanism, and it renders frame-exact to a 1080p60 MP4 with depth of field and bloom, in the style of the "plane of focus" camera-lens demo. Use this whenever someone wants an interactive-style 3D explainer, an explorable-explanation video, a physics, optics or engineering concept animated with real numbers (focus and aperture, depth of field, refraction, lenses, gears, levers, pendulums, springs, waves, circuits), a "how does X work" product explainer with an exploded view, or shares a video like that and says "make one like this", even if they never say "formula".
---

# Lab explainer

A film is a studio set: a dark room, a console with a steep control panel, and on it an apparatus the viewer learns from. A title card at the top left carries live stats and one sentence that is rewritten from the numbers every frame. A control panel at the top right shows buttons being pressed and sliders moving. Part labels float on the model. The film cuts between four or five camera setups while the controls change, and the scene answers each change the way the real equation says it should.

The formula decides everything the viewer reads. The one file you write, `film.js`, holds the parameters, a `derive()` function that turns them into every derived number, the timeline of control changes, the UI, and a `build(kit)` function that makes the set and poses it from those numbers each frame. `derive()` is plain JavaScript, so `scripts/check.mjs` can print the whole film's numbers and sentences in Node before a single frame is rendered.

Run every command from this skill's directory.

## Setup

```bash
node scripts/setup.mjs
```

Installs three and playwright-core here, finds or downloads Chromium, checks ffmpeg, then checks and renders a frame of an example. Rendering uses the GPU (`--use-angle=metal` on macOS).

## Workflow

**1. Pin down the model and the moment.** Write down the parameters the viewer controls, the numbers the film shows, and the one thing the formula does that people don't expect: a threshold (total internal reflection), a crossover, a limit, a non-linearity (sharp zone growing with distance squared). The story is built around that moment. If there is a reference video with numbers on screen, fit the model to them before anything else. The plane-of-focus reference's "1.5 cm at 54 cm, 3.9 cm at 86 cm, 12 cm at f/16" pinned it to a 50 mm lens with a 0.035 mm circle of confusion.

**2. Write `film.js`** in a project folder outside any repo. Copy the closer example: `examples/plane-of-focus/` has an instrument, a scene it looks at, a second camera and a field blur; `examples/refraction/` has a single mechanism with beams and no secondary view. `references/film.md` is the file format; `references/kit.md` lists the building blocks `build(kit)` receives.

**3. Check the numbers.**

```bash
node scripts/check.mjs <project>/film.js --every 0.5
```

This prints every parameter, stat and sentence through the film. Read it all. Wrong numbers and clumsy sentences are cheap to fix here and expensive after a render.

**4. Look at stills, then the blur.**

```bash
node scripts/capture.mjs <project>/film.js <project>/sheet.png --stills 2,10,16,22,28 --cols 3
node scripts/capture.mjs <project>/film.js <project>/frame.png --at 16
node scripts/capture.mjs <project>/film.js <project>/coc.png --at 16 --coc
```

The stills command prints each shot's start time. `--coc` shows the blur-size pass (white is more blur); use it when something should be soft and isn't. Check every shot against `references/look.md` before the full render.

**5. Render.**

```bash
caffeinate -dimsu node scripts/capture.mjs <project>/film.js <project>/film.mp4 --video --fps 60
```

On an M1 Pro a simple 20 second film takes about a minute at 30 fps, and a 30 second film with a secondary view about seven at 60 fps. `caffeinate` keeps a Mac awake; a sleeping machine stalls the render and the page times out. The film has no soundtrack; bring music if the brief wants one and mux it with ffmpeg. For sharing through chat or email, also make a copy under 30MB: `ffmpeg -i film.mp4 -c:v libx264 -crf 23 -preset slow film_share.mp4`.

**6. Hand over** the MP4, a stills sheet, and the live page from `node scripts/serve.mjs <project>/film.js`, where the film plays in real time and space pauses it.

## Rules

Every number comes from `derive()`. Never type a value into the story, a label or a sentence. If the film needs a number to land somewhere, move the control until the formula gives it. When the reference shows numbers the model can't reproduce, say so instead of faking them.

Draw what the formula means. Overlays come from the same model as the numbers. Blur discs on a screen are sized by the same blur formula that softens the picture, and a beam's brightness is the transmitted share. That consistency is what makes the film teach.

Every change in the film is a control being moved. Parameters only change through `story.tracks`, and the panel's buttons light up from those same tracks, so the scene, the numbers and the UI can never disagree. Anything that accumulates over time, like a gear's angle from its speed, comes from `kit.integrate`, because frames are rendered out of order.

When something moves too fast to read at the frame rate (a gear at 120 rpm strobes backwards at 30 fps), draw it slowed and say so on screen, and keep the numbers at real speed.

For a remake, take the structure and the look, not the author's identity. Write your own title and copy, and leave out their handle, logo, watermark and "follow" buttons.

## Reference files

- `references/film.md`: the `film.js` format: params, derive, story (tracks, shots, cursor), ui, blur, look, build, and the state object.
- `references/kit.md`: what `build(kit)` gets: materials, round parts along an axis, the bench and its panel pieces, room and lights, low-poly scenery, the slice glow, overlays, secondary views.
- `references/look.md`: the look to match, composition that works, blur and bloom tuning, and the checks to run on stills before rendering.
- `examples/plane-of-focus/film.js`: focus and depth of field on a lens, 32 s. `examples/refraction/film.js`: Snell's law and total internal reflection, 28 s.
