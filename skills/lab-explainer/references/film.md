# The film.js format

`film.js` is an ES module with no imports. The engine loads it in the browser and `scripts/check.mjs` loads it in Node, so anything outside `build()` must be plain JavaScript: no DOM and no three.js. It exports up to seven things.

## params

The values the viewer controls. Each has a starting `value`, and optionally `interp: 'log'` for quantities people feel in ratios (f-numbers, frequencies, gear ratios) and `ease` for the default easing of its moves (`'out'`, `'inOut'`, `'in'`, `'linear'`; default `'out'`, which feels like a hand moving a control).

```js
export const params = {
  sf: { value: 54 },                    // focus distance, cm
  N: { value: 2, interp: 'log' },       // f-number
  exploded: { value: 1, ease: 'inOut' },
};
```

A parameter can be a mode switch as well as a quantity: `exploded` is 0 or 1 and the build fades the barrel between them. A parameter with no track keeps its `value`, and a button whose value equals it stays lit, which is how a fixed setting like a playback speed shows on the panel.

For a discrete quantity (a tooth count, a number of slits), animate it continuously, on a log scale if it is a ratio, and round it in `derive` so every number on screen belongs to a real configuration. The drawing can use the continuous value so the change looks smooth.

## derive(p, s)

Turns parameter values into every number the film shows, and returns an object that becomes `s.d`. Put the real equation here, in real units, and keep it separate from whatever scale the drawing uses. The second argument is the full state, for the rare derived value that depends on which button was pressed rather than on the animated value (the refraction film names the material from `s.press.n.cur` so the sentence doesn't say "glass" while the index is sliding to water).

## story

```js
export const story = {
  duration: 32,
  tracks: { sf: [[1.05, 0.9, 37], [4.45, 1.27, 86]], N: [[9.955, 1.02, 16, 'out']] },
  shots: [{ id: 'A', t0: 0, t1: 8.75, from: { pos, target }, to: { pos, target }, fov: 34, focus: [44, 26, 0], camK: 26, field: 38, labels: ['focusRing'], cursor: {...} }],
};
```

A track is a list of `[start, duration, target, ease?]` moves. Each move starts from where the previous one ended, so a track reads as the story of one control. The panel's buttons for that parameter light up at each move's start with a short press animation, so a button's `value` must equal a track target exactly for it to light.

A shot runs from `t0` to `t1`; shots are joined by hard cuts. The camera eases from `from` to `to` over the shot (`ease`, default `'inOut'`), or `camera(s)` can return `{ pos, target, fov }` for anything more complex. Positions are `[x, y, z]` in centimetres.

Blur per shot: `focus` is the world point the camera is focused on (a point or a function of state; default the target), and `camK` is how strongly everything off that distance blurs, in pixels at 1080p (16 to 26 works). `field` scales the film's field blur for this shot, also in pixels (see `blur`).

`labels` lists which part labels (from `build`'s return) show in this shot. `cursor` draws the macOS pointer: `at` is a world point (or function), `offset` a pixel offset `[dx, dy]` (or function, which is how a cursor drags a ring), and `grab` a function whose truthy value draws the grab ring, typically `(s) => s.move.sf`.

Pacing that matches the reference: four or five shots of 4.5 to 9 seconds; control moves of 0.5 to 1.6 seconds; a hold of 1.5 to 3 seconds after each change so the sentence can be read; open wide, go close on the mechanism, go to where the effect shows, and end wide on one last change.

## ui

```js
export const ui = {
  title: ['EVERY PHOTO HAS', 'ONE SHARP PLANE'],       // small white kicker, big accent title
  intro: 'One or two sentences on what to watch for.',
  stats: [{ label: 'Focus', value: (s) => `${Math.round(s.p.sf)} cm`, accent: true }],
  explain: (s) => 'HTML rebuilt every frame from s.d',
  panel: [[{ label: 'FOCUS', hint: 'drag the ring · 1 2 3', width: 236, buttons: { param: 'sf', options: [['Foreground', 37], ['Middle', 54]] } },
           { label: 'DISTANCE', value: (s) => `${Math.round(s.p.sf)} cm`, slider: { at: (s) => 1 - 30 / s.p.sf } }]],
  theme: { accent: '#52d2f4', warm: '#f2a24e' },
};
```

`intro` and `explain` are HTML. The engine joins every number to the unit after it with a non-breaking space, so "6.3 W" never wraps apart. In `explain`, `<span class="c">` is the accent colour (use it for the thing on the plane, the named effect), `<span class="o">` the warm colour (what goes wrong, the soft discs, the reflected share), and `<b>` white bold for numbers. Write it as two or three short sentences that change with the state; the reader sees it rewrite itself as the controls move, and that is half the lesson. Keep stats to three or four, each with a unit.

The panel is rows of groups. A group has a `label`, an optional `hint` (a key or gesture, shown at the right of its header) or `value` (a live readout shown in the same place), and either `buttons` (`param`, `options` as `[label, value]`, `mono` for code-style labels) or a `slider` whose `at(s)` returns 0 to 1. `width` fixes a group's width in pixels; otherwise groups share the row. `icons: true` adds two small icon buttons after a group's buttons.

## blur (optional)

```js
export const blur = {
  field: {
    glsl: 'abs(1.0 / max(p.x - uHF, 1.0) - 1.0 / uSf) * 54.0 * (2.0 / uN)',
    uniforms: { uHF: 56, uSf: (s) => s.p.sf, uN: (s) => s.p.N },
  },
};
```

Surfaces tagged `userData.field = true` (see `kit.tag`) blur by this GLSL expression of their world position `p`, multiplied by the shot's `field` pixels, on top of ordinary camera blur. It exists so a scene can blur the way an instrument inside it sees rather than the way the film's camera does: in the plane-of-focus film the valley blurs by its distance from the focus plane along the lens axis, which no real camera would do. Uniforms are floats, given as numbers or functions of state. Secondary views use the same field with their own pixel scale.

## look (optional)

`{ exposure, bloom, bloomRadius, bloomThreshold, vignette, grain, environment, clear }`. The defaults (1.0, 0.42, 0.5, 1.0, 0.32, 0.018, 0.42, a near-black blue) are the reference's look; change them only with a reason.

## build(kit)

Called once in the browser. It builds the set with `kit` (see `kit.md`) and returns:

- `update(s)`: called every frame before rendering. Pose everything from `s.p` and `s.d`: rotate parts, move planes, rebuild overlay lines, set the slice glow, select panel items. Frames are seeked in any order, so `update` must depend only on `s`, never on the previous frame. For anything that accumulates, like a wheel's angle from its speed, make the integral once in `build` with `const angle = kit.integrate((s) => s.d.rpm / 60 * 2 * Math.PI)` and read `angle(s.t)` in `update`.
- `labels`: `{ id: { text, sub, at } }` where `sub` and `at` may be functions of state. A label shows only in shots that list its id, and only when its anchor is on screen.

## The state object

`s.t` time in seconds, `s.p` parameter values, `s.d` what `derive` returned, `s.press[name]` `{ cur, prev, k }` for the last button press on a track (k fades 0 to 1 over 0.18 s), `s.move[name]` true while a control is moving, `s.shot` the current shot, `s.u` progress through the shot, `s.cam` the interpolated camera. `kit.stateAt(t, overrides)` returns the same object at another time or with parameters overridden, for rendering thumbnails in `build`.
