# Story and sandbox

## READ, dims and paths

`read: [{ group, label, at: [x, y] }]` is the order READ highlights groups in orange and where it writes each word (machine coordinates, the word's baseline start). Include `ground` and, when there are `paths`, `path`. After each highlight the group's lines turn to ink; after the last, any remaining groups ink together and the dimension lines draw.

`dims: [{ text, from, to, side }]` are pencil dimension lines with handwritten values; `side: 'above'` puts the text above the line. Measure what the sketch would measure: the important gap, a height, a lever arm.

`paths: [{ pts }]` are the sketcher's dashed guesses (where a ball will go).

## Chapters

`story` is a list, played in order. Durations default sensibly; set `dur` to override.

| Chapter | Fields | What happens |
|---|---|---|
| `READ` | `params` | labels, ink, dims (about 0.7 s per label); `params` sets the pose the sketch shows, such as an uncocked arm, when it differs from the first run |
| `LIFT` | `camera` | cut-outs pop up group by group, gain depth, fill with material; the camera tilts from top-down to the hero view |
| any name with `run` | `run: { param values }`, `trails: [ids]`, `notes`, `camera`, `cameraEnd`, `seconds` | a baked run; starts after a 0.6 s beat; lasts the run plus a hold, at most 10 s |
| `TWEAK` | `from`, `to` (param values), `rewind` (a run's name), `notes` | the named run plays backwards with a "rewind" badge, then parts slide to the new values |
| `REPLAY` | `of` (a run's name), `from`, `to` (seconds in that run), `speed` (0.25), `camera`, `notes` | a hard cut to a low close camera, darker grade, a speed badge |
| `DONE` | `camera` | the card returns with "Play again" |

Give a chapter `name` when two chapters share a type; runs are referred to by name (default: the chapter word). `label` changes what the chapter bar shows.

## Notes

Each chapter's `notes` are overlays drawn at a time, anchored to a body or a point.

```js
{ kind: 'note', text: '{speed:ball2@seesaw} m/s', anchor: 'body:ball2', offset: [-70, -40], at: 'trigger:seesaw', until: 'end' }
```

| Field | Meaning |
|---|---|
| `kind` | `note` (handwriting), `tag` (mono label with a leader), `cross`, `ring`, `arrow` (dashed, with optional text), `dim` (a blue handwritten dimension between `from` and `to`, which may be functions of the current parts) |
| `anchor` | `'body:id'` follows a body's origin; `'part:id'` follows one part of a rigid group, such as the weight on an arm; `[x, y]` is fixed |
| `offset` | pixels from the anchor on screen |
| `at`, `until` | seconds into the chapter, `'start'`, `'end'`, or `'trigger:id'` with an optional `+0.5` or `-0.2`. In REPLAY, trigger times are mapped through the slow motion |
| `text` | a string, with `{speed:body@trigger}` or `{speed:body@trigger-0.12}` replaced by the measured speed; or a function `(norm, u, bake)` of the geometry at the current parameters, for values that change during a TWEAK (`norm.parts.find((q) => q.id === 'weight').mass`) |

Speeds in notes are always measured. Put a speed note where the number means something: just before an impact, at a launch.

## Cameras

A camera is `{ target, dist, yaw, pitch, fov }`: `target` is `[x, y]` or `'body:id'`, `dist` in metres, `yaw` in degrees (0 is straight on, negative looks from the left), `pitch` in degrees above the plane. `camera.hero` sets the default for runs; the sandbox uses a slightly wider hero shifted right to clear its panel, plus side and top views (override with `camera.sandbox`, `camera.side`, `camera.top`).

## Sandbox

```js
sandbox: {
  params: { gap: mm(70) },                       // where the sandbox starts
  trails: ['ball', 'ball2'],                      // bodies whose paths are kept
  stats: [{ label: 'STEPS', unit: '/6', value: (i) => i.steps, always: true }, ...],
  script: [{ t: 1.2, do: 'run' }, { t: 6.2, do: 'param', id: 'gap', to: mm(38), dur: 1.2 }, ...],
  length: 30,
}
```

`stats[].value(info)` receives `{ S, fired, at, t, running, params, steps, total }`, where `at[trigger][body]` is each body's speed at the moment that trigger fired; `always: true` shows it before a run starts. Script steps: `run`, `reset`, `param` (drags a slider over `dur`), `slowmo` and `trails` (`on`), `sketch` (`from`, `to`, `dur` between model and cut-out), `view` (`hero`, `side`, `top`), `hint` (`text`, `until`). The film's cursor is derived from the script: it arrives at each control 0.7 s early and follows slider thumbs. Leave a second or two between a run and the next action so each result can be read. A run in slow motion takes four times as long.
