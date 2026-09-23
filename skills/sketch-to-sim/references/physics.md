# Physics

The engine builds one Rapier world per run from the parts: a fixed body per fixed rigid group, a dynamic body per dynamic one, a collider per part (cuboid, ball, cylinder or convex hull), and an impulse joint per hinge or weld. It steps at 240 Hz, records every dynamic body each step, and records contact force events for sound. The world is built the same way in the browser and in Node, so `tune.mjs` predicts exactly what the film will show.

## Planar motion

Dynamic bodies are locked to x/y translation and z rotation, so the machine behaves like its drawing. Bodies in a hinge or weld are not locked: a hinge about z already keeps them in the plane, and Rapier freezes a body that is both locked and jointed (it will not rotate at all). Anchor jointed chains to the world or to a fixed body.

## The tuning loop

Write the triggers first, then scan the parameter the story turns on:

```bash
node scripts/tune.mjs machine.js --scan gap=0.03:0.08:0.005 --speed ball2@seesaw
```

Look for a wide success band and a clear failure well outside it. A chain that succeeds at one value and fails 5 mm either side is not a machine, it is luck, and the sandbox will expose it. Fix the mechanism until the band is wide, then pick story values in the middle of each outcome.

## Failure modes met so far

**A body will not move, or swings at a fraction of the expected rate.** It is hinged and plane-locked (fixed in the engine), or its underside rests on the post that holds its hinge: mark that post `collide: false`.

**A hinge's limits behave mirrored.** Limits are the body's absolute angle in drawing convention; the engine converts to Rapier's. If a lever rests at the wrong end, check which side is heavier, not the limits.

**A heavy ball bulldozes through dominoes.** Momentum wins. Use a light ball (oak or cork) against heavier dominoes (oak), so the ball tips the first and bounces back, and the chain carries itself.

**The last domino leans on the next object instead of pushing it.** Its tip swings on a radius equal to its height from its far edge: place the next object inside that reach, give balls low angular damping so they roll, and put them close to any edge they must go over.

**A falling ball lands on a lever and rolls off.** Real Rube Goldberg levers have a cup. Add two stops to the plank (same `rigid` id) so the ball stays at the lever arm.

**A struck hanging object barely moves.** Pushing a pendulum along its rope lifts it; it swings only when struck across. Strike sideways, or use a fixed target (a service bell) and let the impact be the event.

**Something flies off into the distance.** The engine adds low walls round the desk; if it still escapes, check its speed at release before raising damping.

**A settled stack creeps or explodes.** Parts overlap at build time. Lift dynamic parts 0.2 mm above what they rest on, and let `settle` (default 0.5 s) run before the start.

## Determinism

A run is baked once per page load and replayed from the recording, so every frame of the film is exact and the sandbox session is identical on every render. Change the machine and the bake changes with it; re-run `tune.mjs` after any edit to parts, masses or friction.
