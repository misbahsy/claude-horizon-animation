---
name: sketch-to-sim
description: Turn a pencil sketch of a simple machine into a short film where the drawing is read, measured, lifts off the paper into a 3D wooden model, and runs under real physics, then an interactive "Build it yourself" sandbox, in the style of the paper trebuchet demo. The machine is described once as a small JS file of parts, hinges, parameters and a story; the engine draws the sketch, builds the model, bakes the physics with Rapier, renders a 1080p60 MP4 frame by frame, and synthesises a soundtrack from the actual collisions. Use this whenever someone wants a sketch-to-simulation or "sketch comes to life" video, a Rube Goldberg machine, trebuchet, catapult, domino run, marble run, seesaw, pendulum or lever animation, a physics explainer that starts from a drawing, or shares a photo of a machine sketch and asks to animate it, even if they only say "make it like the trebuchet video".
---

# Sketch to sim

A film has one shape: a pencil sketch on a desk is read (parts labelled in orange handwriting, cleaned up into ink, measured), then lifts off the paper as white cut-outs that fill in as wood, then runs. The first run usually fails in an instructive way, a tweak rewinds it and changes one parameter, the second run works, a slow replay shows the key moment with measured speeds, and a "Build it yourself" panel lets you play with the parameters. Everything is physically simulated; nothing is keyframed except the camera.

Run every command from this skill's directory.

## Setup

```bash
node scripts/setup.mjs
```

Installs three, Rapier and playwright-core into this directory, finds or downloads Chromium, checks ffmpeg, and renders a smoke frame of the example. Rendering uses the GPU (`--use-angle=metal` on macOS); on a machine without one it still works, slowly.

## Workflow

**1. Get the machine.** If there is a sketch or photo, read it: list the parts, how they connect, what moves, and every dimension written on it. If there is no sketch, design the machine from the request. Either way, write down the chain of cause and effect in one line per stage ("ball rolls down ramp; hits first domino; ...") before any code. Each stage becomes a trigger.

**2. Write `machine.js`** in a project folder outside any repo. Copy the closer of the two examples (`examples/rube-goldberg/` for chains of triggers, `examples/trebuchet/` for a held lever that is released) and read `references/spec.md`. Parts are boxes, beams, balls, wheels and convex polygons in side view (x right, y up from the pencil ground line, metres); `hinge()` joins bodies; parameters may move parts but not resize them.

**3. Make the physics true before drawing anything.** This is where the time goes, and it is fast:

```bash
node scripts/tune.mjs <project>/machine.js                          # one run with default parameters
node scripts/tune.mjs <project>/machine.js --scan gap=0.03:0.08:0.005
node scripts/tune.mjs <project>/machine.js gap=0.04 --speed ball2@seesaw
```

Each run reports which triggers fired and when. Tune until the story's failure and success both happen for real, with a margin either side. `references/physics.md` lists the failure modes met so far and their fixes (a hinged body frozen by a plane lock, a ball that bulldozes light dominoes, a lever that needs a cup, a bell struck from the wrong side). Never fake an outcome in the story; change the machine until the physics does it.

**4. Write the story and the sandbox** in the same file: what READ labels and where, dimension lines, the chapters (READ, LIFT, a failing run, TWEAK, the working run, REPLAY, DONE), notes tied to triggers, and the sandbox's stats and scripted session. `references/story.md` has the format and timing rules.

**5. Look at stills, then render.**

```bash
node scripts/capture.mjs <project>/machine.js <project>/sheet.png --stills 1,8,15,22,30,40,50,60 --dpr 1
node scripts/capture.mjs <project>/machine.js <project>/film.mp4 --video --fps 60 --dpr 2
node scripts/sound.mjs <project>/machine.js <project>/film.wav
ffmpeg -i <project>/film.mp4 -i <project>/film.wav -af loudnorm=I=-19:TP=-1.5 -c:v copy -c:a aac -b:a 192k -shortest <project>/final.mp4
```

The stills command prints each chapter's start time, which is what to pass to `--stills` and `--at`. Check every chapter against `references/style.md` before the full render; a full 80 second film at 60fps takes about four minutes on an M1 Pro.

**6. Hand over** the MP4, a stills sheet, and the live page: `node scripts/serve.mjs <project>/machine.js` prints a local URL where the tour plays in real time and the sandbox's sliders, Run and Reset work.

## Rules

The physics decides what happens. If the story needs a miss, find the parameter value that really misses; if a displayed number (a speed, a time) is not what the simulation measured, the number changes, not the simulation. Say so to the requester when their reference shows numbers the physics cannot reproduce.

Keep the machine in the plane of the drawing: every part is a side-view profile extruded to a depth, and motion is planar. It is what makes a pencil sketch a faithful blueprint, and it keeps Rapier stable.

Parameters move parts, never resize them, so the model and the sketch stay one object.

## Reference files

- `references/spec.md`: parts, bodies, hinges, materials, parameters, triggers, start and holds.
- `references/story.md`: READ labels and dims, chapters, notes and their timing, cameras, the sandbox and its script.
- `references/physics.md`: how the engine simulates, the tuning loop, and the failure modes with fixes.
- `references/style.md`: the look to match and the quality bar to check before handing over.
- `examples/rube-goldberg/machine.js`: a finished machine: ramp, dominoes, a dropped ball, a seesaw with a cup, a service bell.
- `examples/trebuchet/machine.js`: a counterweight trebuchet against a block tower, with a LOAD chapter that cocks the arm, a short throw at 0.48 kg and a hit at 0.68 kg. Copy it for any machine with a held, released lever.
