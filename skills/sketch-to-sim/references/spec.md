# Machine spec

A machine is an ES module whose default export describes parts, how they move, and the film. It imports helpers from `/engine/src/spec.js` (the path the page sees; `scripts/lib/load.mjs` maps it in Node).

```js
import { mm, deg, box, beam, ball, wheel, poly, hinge, weld, place } from '/engine/src/spec.js';
export default { title, subtitle, kicker, paper, params, build(p), start, triggers, read, paths, dims, camera, story, sandbox };
```

## Coordinates

Side view, like the sketch. x runs right, y runs up from the pencil ground line, z is depth towards the viewer. Metres and kilograms; `mm(40)` is 0.040 and `deg(30)` is radians. The ground (the paper on the desk) is y = 0 and is always solid.

`paper: { w, h, origin: [u, v] }` is the sheet in metres (A1 is 0.841 by 0.594) and where machine (0, 0) sits on it, measured from the sheet's left edge and top edge. Keep every part inside the sheet with 30 mm to spare; the stills will show it if not.

## Parts

Every helper takes `id` (unique), `group` (what READ highlights together, default the id) and these options:

| Option | Default | Meaning |
|---|---|---|
| `body` | `'fixed'` | `'dynamic'` to simulate it |
| `rigid` | the id | parts sharing a rigid id are one body (a plank and the stops glued to it); the first part is the body's origin |
| `material` | `'pine'` | `pine`, `basswood`, `oak`, `walnut`, `steel`, `iron`, `brass`, `copper`, `rubber`, `felt`, `cork`, `paper`, `glass`, or `'color:#rrggbb'`; sets density, look and sound |
| `mass` | from density | override in kg (a hollow bell, a light cup) |
| `friction`, `restitution` | 0.5, 0.1 | contact behaviour |
| `damping` | [0.02, 0.15] | linear and angular damping for dynamic bodies; raise angular damping to stop a ball rolling for ever |
| `z` | 0 | depth offset |
| `shade` | false (true for balls) | pencil hatching in the sketch |
| `collide` | true | false for scenery the physics should ignore (a post under a hinge) |
| `sketch` | true | false to leave it out of the drawing |
| `sound` | from material | `'bell'` makes contacts ring |

Shapes:

- `box({ at: [x, y], size: [w, h, d], angle })`: centred on `at`.
- `beam({ from: [x, y], to: [x, y], t, d })`: a plank along a line, `t` thick and `d` deep.
- `ball({ at, r })`: a sphere; steel and shaded by default.
- `wheel({ at, r, d })`: a disc whose axis runs along z.
- `poly({ at, pts, d, angle })`: a convex polygon in local coordinates, extruded to depth `d`. Split concave shapes into several convex parts in one rigid body.
- `place(part, [lx, ly])`: a point in a part's local frame, in machine coordinates. Use it to put stops or a counterweight on a tilted plank.

## Joints

`hinge({ a, b, anchor, limits })` joins rigid body `a` to `b` (or to the world when `b` is omitted) about the z axis at `anchor` (machine coordinates). `limits: [lo, hi]` are the body's absolute angle in radians, drawing convention (counter-clockwise positive, measured like `angle`). `weld({ a, b, anchor })` fixes two bodies together.

## Parameters

`params: { gap: { label, unit, min, max, step, value, show, ends } }`. `build(p)` receives the values and returns `{ parts, joints }`. Parameters may change where parts are and their angles, never their sizes or which parts exist; the normaliser refuses otherwise. `show(v)` formats the value for the sandbox (`(v) => Math.round(v * 1000)` for mm); `ends: ['LIGHT', 'HEAVY']` labels the slider.

## Start, holds and triggers

`start: (p) => ({ hold: ['ball'], velocity: { ball: [vx, vy] }, spin: { wheel: w } })`, or a plain object. Held bodies stay put while the machine settles (half a second) and are released at the start; velocities and spins apply at the same moment.

`triggers: [{ id, label, when: (S, p) => boolean }]` are the stages of the chain, in order. The first time `when` is true is that stage's time; the sandbox counts them as steps, and notes can hang off them. `S` reads the world:

| Call | Returns |
|---|---|
| `S.pos(id)` | body position `[x, y]` in machine coordinates |
| `S.angle(id)` | body angle in radians |
| `S.speed(id)`, `S.vel(id)` | speed in m/s, velocity `[vx, vy]` |
| `S.moved(id)` | distance from where it settled |
| `S.hit(a, b)` | the largest contact force so far between rigid bodies a and b, in newtons |
