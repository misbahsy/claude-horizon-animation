# The kit

`build(kit)` receives everything needed to make a set. Units are centimetres, y is up, the bench top is y = 0 and the console's control panel faces +z, where the cameras usually are. Round parts are built with their axis along +x at the height set by `kit.axis(y)` (default 26), which suits anything on an optical rail or a shaft.

## Raw access

`kit.THREE` (three r180), `kit.scene`, `kit.overlay` (a second scene drawn over the blurred picture, never blurred itself), `kit.V(x, y, z)`, `kit.hdr(r, g, b, k)` for colours above 1 that bloom, `kit.tex` (the canvas textures below), `kit.stateAt(t, overrides)`.

## Materials: kit.M

`black` (glossy anodised, clearcoat), `satin`, `rubber`, `brass`, `copper` (faint orange glow), `steel`, `glass` (transmissive, for lens elements), `rim` and `rimDim` (the cyan glowing edge of a glass element), `console`, `consoleDark`, `rail`, `ledWarm`, `ledCyan`, `glassEdge`, `wall`. `kit.glow(r, g, b)` makes an unlit emissive material; values of 1 to 6 bloom. Keep brass and other metals below the bloom threshold except their highlights, or the set turns into a light show.

## Parts

- `kit.mesh(geo, mat, pos, parent = scene, { cast, receive, data })` adds a mesh; `data` merges into `userData`.
- `kit.box(w, h, d, radius)` is a rounded box geometry.
- `kit.ring(rIn, rOut, x0, x1, { bevel, y, z })` is a tube along the axis from x0 to x1.
- `kit.gear(rRoot, rTip, teeth, rHole, x0, x1, { tip, bevel, y, z, dir })` is a gear or knurled ring along the axis; `kit.gearShape(...)` returns the 2D shape. Many teeth with `tip: 0.5` make a ribbed focus ring. `tip` is each tooth's width at the tip as a fraction of the tooth pitch, and tooth 0 is centred at `(0.1 + tip / 2)` pitches from +x.
- `dir: 'z'` on `ring` and `gear` builds the part facing the camera instead: centred on the origin in x and y, running from x0 to x1 along z. Place it with `mesh.position` and spin it with `rotation.z`.
- `kit.spurGear(teeth, m, z0, z1, { rHole, dir })` is a gear that meshes with any other of the same module `m`, in cm of pitch diameter per tooth. Its pitch radius is `m * teeth / 2`, stored in `geometry.userData.rp`, and two gears' centres go `rp1 + rp2` apart. It faces the camera by default. `kit.meshAngle(t1, a1, t2, { at })` gives the rotation gear 2 needs to mesh with gear 1 turned to `a1`, when gear 2's centre lies in direction `at` (radians, 0 is +x) from gear 1's. It turns the other way at t1/t2 the speed.
- `kit.lensElement(parent, x, r, t, RF, RB, { glow })` is a glass element with spherical faces of radii RF and RB (negative is concave), in a black cell with a lit rim. It returns `{ rim, front, back }`.
- `kit.spinnable(mesh)` recentres an axis-built mesh so `rotation.x` spins it about the axis. Give the mesh its position as an offset from the axis before calling.
- `kit.alongX(geo, x0, y, z)` turns any geometry built along +z to run along +x.
- `kit.integrate(rate)` returns `f(t)`, the integral of `rate(s)` from 0 to t, tabulated once at 240 Hz. Use it for every angle or distance that builds up from a speed.
- `kit.tag(group, { field, layers, coc })` tags every mesh under a group: `field: true` for field blur, `layers: [1]` to be seen by a secondary view, and `coc: false` to leave the blur pass entirely. Do this for transmissive glass, so what is behind it keeps its own blur and overlays aren't hidden behind it.

## The studio

- `kit.lights({ key, sun, hemi, rim, fill })`: a warm key spot from the front left, a sun for the subject with a shadow box, and a cool rim and fill. `key.target` and `sun.target` should point at the subject.
- `kit.room({ panels, panelX, panelY, rings, plant, pedestal })`: back wall with three backlit panels, a cabinet with glowing rings, a white pedestal and a plant. It is mostly blurred and gives depth.
- `kit.bench({ x0, x1, rail, knobX })`: the console. `rail: [x0, x1]` adds an optical rail with a ruler; `[0, 0]` leaves it out. It returns `{ slope, len, add(geo, mat, x, v, lift, opts) }`, where `add` places a mesh on the steep front panel at `x` and `v` cm down from its top edge and returns it. The panel is about 43 cm tall. In the slope's frame x runs along the bench, y is the panel's outward normal (so flat things are built lying in xz, like `CircleGeometry(...).rotateX(-Math.PI / 2)`) and z runs down the slope; `rotation.y` turns something within the panel. Lay panel pieces out within the x range of the apparatus above them, so a small apparatus gets a compact panel.
- Panel pieces: `kit.panel.dial(bench, { x, v, r })` is a dial with a warm bezel. `kit.panel.strip(bench, { textures, xs, v, w, h })` is a row of thumbnails; `.select(i)` lifts and outlines one. `kit.panel.slider(bench, { x0, x1, v })` returns `.set(x)`. `kit.panel.discs(bench, { xs, v, r, opens })` makes iris discs; `.select(i)` lights one. `kit.panel.gauge(bench, { x, v, r, label })` is a round gauge with a warm bezel; `.set(f)` points its needle at f from 0 to 1 across 270 degrees.

## Scenery

`kit.lowpoly` builds a low-poly subject (flat-shaded, made with `sliceMaterial` so the slice glow shows on it):

- `terrain(parent, { x0, x1, z, top, height(x, z), colorAt(x, z, y) })` returns `ground(x, z)` for placing things on it.
- `pine(parent, x, z, h, { ground, seed })` returns a point two thirds up the tree. `bush(...)` is a round bush.
- `cabin(parent, x, z, { ground })` has lit windows on its -x wall and returns `{ front }`, the centre of that wall.
- `mountain(parent, x, z, r, h, { ground, seed })` returns its summit.
- `backdrop(parent, x, { top, w, h, turn })` is a painted sky in a frame, turned toward the room by `turn` radians so the camera sees its face.
- `tray(parent, { x0, x1, z, top })` is a dark tray with a wood rim.

Place the objects the formula talks about at exactly the distances the model uses, and return their points for rays and labels.

## The slice glow

`kit.slice.set({ normal, offset, width, zone, strength, color })` lights the band where the plane `normal · p = offset` cuts through every surface made with `kit.sliceMaterial(params)`: a bright core `width` wide and a faint band `zone` wide. The plane-of-focus film uses it for the line where the focus plane meets the valley, with `zone` set to the sharp zone. Secondary views switch it off unless told otherwise.

## Overlays

- `kit.lines({ color, width, opacity })` returns `{ set(positions), material }`: fat anti-aliased line segments, `positions` a flat array of segment endpoints, rebuilt in `update`. Use colour values of 1 to 5 so they bloom.
- `kit.gridPlane(w, h)` is a glass sheet with a grid facing +x; move and rotate the returned mesh.
- `kit.mark()` returns `{ set(pos, r) }`, a circle of radius r facing +x, or a dot when r is small: a blur disc or a sharp point on a screen.

Overlays are depth-tested against the solid scene, so a ray passing behind a lens barrel disappears into it.

## Secondary views

`kit.view({ camera, size, layer, clear, fieldPx, camK, camF, slice })` renders another camera every frame into `.texture`, with the same blur pipeline. Map that texture onto a ground glass, a monitor or a viewfinder. `fieldPx` sets its field blur in pixels at its own resolution. Only meshes on `layer` (default 1) are drawn, so tag what it should see.

`view.snapshot(kit.stateAt(0, { sf: 37 }))` renders once at another state and returns a texture. The plane-of-focus film's film strip is five snapshots at five focus distances.

## Textures: kit.tex

`skyTexture()`, `gridTexture()`, `rulerTexture(lengthCm)`, `wallArt(stage)`, `irisTexture(open, { disc, hole })`, `plateTexture([line1, line2])`, `woodTexture()`, `tileTexture()`, `rng(seed)`. For anything else draw a canvas in `build` and wrap it in `new kit.THREE.CanvasTexture(canvas)` with `colorSpace = SRGBColorSpace`.
