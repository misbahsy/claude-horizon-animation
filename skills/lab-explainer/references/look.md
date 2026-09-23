# The look, and what to check

## What it looks like

A dark navy room, never black. A charcoal console with a warm key light raking across it and a warm LED line along its top edge. The apparatus is black anodised metal and brass, with glass whose rims glow cyan. Glowing things are HDR emissives between 1 and 6, and they bloom. The background is always soft: backlit panels on the wall, a cabinet with glowing rings, a plant. Cyan is the colour of explanation (the UI accent, rims, rays, the slice glow) and warm orange is the colour of the mechanism and of warnings (the iris, LEDs, blur discs, reflected light). Red laser beams are the one exception, when the subject is a laser.

The UI is quiet and small: Outfit for text, JetBrains Mono for numbers, dark translucent panels with hairline borders, tiny pill labels with a white dot. The title card is a small white kicker over a big accent-coloured title, then one or two lines of intro, three or four stat boxes, and the sentence box.

## Composition that works

The overview camera sits 9 to 14 degrees above the subject, at fov 34 and about 1.3 times as far away as the width of what must be in frame, with the apparatus at 40 to 60 percent of the frame width, the wall panels cut off by the top edge and the console's panel filling the bottom quarter. For the 180 cm lens bench that is 200 to 260 cm; for a small apparatus, bring the camera in and lay the panel pieces out within the apparatus's width so both still fit. Keep the panel either fully in frame or out of it; half a thumbnail at the edge looks like a mistake. The camera drifts about 10 cm over a shot, which is enough to feel alive.

Close shots put the part being explained across most of the frame, at an angle, with something blurred in front of or behind it for depth.

Motion must read at the frame rate. A repeating part (teeth, spokes, slots) that turns more than about a third of its repeat per frame strobes, and at a half it seems to run backwards. Slow the drawing down, label it ("shown at 1/6 speed"), and keep the numbers real.

Anything with a face (a backdrop, a screen, a ground glass) must face the camera by at least 30 degrees. The plane-of-focus backdrop had to be turned toward the room because the overview camera saw it edge-on.

Low shots can be blocked by walls you forgot about. The refraction film's ring screen became a half ring at the back, where the beams land, so the front is open.

## Blur and bloom

Camera blur (`camK`) of 16 to 26 px and field blur (`field`) of 26 to 44 px give the reference's depth. When something that should be soft looks sharp, render `--coc` at that moment and read the brightness: 40 px of blur is white. Transmissive glass should be `coc: false`, or everything behind it inherits the glass's blur. The overlays never blur, so sharp rays over a soft scene is the intended look.

Bloom threshold 1.0 means only HDR colours glow. When the set looks like a light show, lower the emissive values first and leave the bloom settings alone.

## Before the full render

Render a stills sheet at the middle of every shot and one frame at each control change, and check:

- Every number in the stats and the sentence agrees with `check.mjs` at that time.
- Each shot shows the thing its labels name, and no label overlaps the title card, the control panel or another label.
- The panel's highlighted button matches the control being moved.
- The effect the film is about (a plane moving through a scene, a beam dying past the critical angle) is visible in at least two shots.
- Nothing important is half out of frame, and no face is seen edge-on.
- Nothing flickers between frames. Render a one-second clip with `--from --to` around a fast move if unsure.
