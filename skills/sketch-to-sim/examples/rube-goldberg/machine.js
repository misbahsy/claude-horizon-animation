// A small Rube Goldberg machine on a sheet of A1: a steel ball rolls down a
// ramp, knocks over a line of dominoes, the last domino nudges a second ball off
// the shelf into a cup on a seesaw, and the seesaw's long arm swings down onto
// a service bell.
//
// Machine coordinates: metres, x to the right, y up from the pencil ground line.

import { mm, deg, box, beam, ball, poly, hinge, place } from '/engine/src/spec.js';

const SHELF_Y = 0.200, SHELF_T = 0.010, SHELF_TOP = SHELF_Y + SHELF_T / 2;
const DOM = [0.009, 0.050, 0.025];            // domino: thick, tall, deep
const PIVOT = [0.700, 0.085];
const BELL_X = 0.566;

function dominoXs(gap) {
  const xs = [0.282, 0.314, 0.346];
  xs.push(xs[2] + gap);
  for (let i = 0; i < 3; i++) xs.push(xs[xs.length - 1] + 0.032);
  return xs;
}

export default {
  title: 'Paper Rube Goldberg',
  subtitle: 'A pencil sketch, measured, built and run.',
  kicker: ['Sketch to physics', 'Scale 1:1'],
  paper: { w: 0.841, h: 0.594, origin: [0.040, 0.455] },   // where machine (0, 0) sits on the sheet

  params: {
    gap: { label: 'GAP', unit: 'mm', min: mm(30), max: mm(80), step: mm(1), value: mm(70), show: (v) => Math.round(v * 1000) },
    push: { label: 'PUSH', unit: 'm/s', min: 0.1, max: 1.0, step: 0.01, value: 0.3, show: (v) => v.toFixed(2) },
  },

  build(p) {
    const parts = [];
    // the stand: ramp, shelf and the posts under them
    parts.push(beam({ id: 'ramp', group: 'ramp', from: [0.030, 0.330], to: [0.232, 0.214], t: 0.010, d: 0.050, friction: 0.6 }));
    parts.push(box({ id: 'post1', group: 'stand', at: [0.040, 0.1625], size: [0.014, 0.325, 0.040] }));
    parts.push(box({ id: 'post2', group: 'stand', at: [0.236, 0.0975], size: [0.014, 0.195, 0.040] }));
    parts.push(box({ id: 'post3', group: 'stand', at: [0.505, 0.0975], size: [0.014, 0.195, 0.040] }));
    parts.push(box({ id: 'shelf', group: 'shelf', at: [0.390, SHELF_Y], size: [0.340, SHELF_T, 0.050], friction: 0.55 }));
    // the first ball waits at the top of the ramp
    const a = Math.atan2(0.214 - 0.330, 0.232 - 0.030), n = [-Math.sin(a), Math.cos(a)];
    const r1 = 0.0125, s0 = [0.030 + 0.034 * Math.cos(a), 0.330 + 0.034 * Math.sin(a)];
    parts.push(ball({ id: 'ball', group: 'ball', body: 'dynamic', material: 'oak', at: [s0[0] + n[0] * (0.005 + r1), s0[1] + n[1] * (0.005 + r1)], r: r1, friction: 0.4, restitution: 0.3 }));
    // dominoes
    dominoXs(p.gap).forEach((x, i) => parts.push(box({ id: `d${i + 1}`, group: 'dominoes', body: 'dynamic', material: 'oak',
      at: [x, SHELF_TOP + DOM[1] / 2 + 0.0002], size: DOM, friction: 0.45, restitution: 0.05 })));
    // the second ball, at the shelf's edge
    parts.push(ball({ id: 'ball2', group: 'drop', body: 'dynamic', at: [0.535, SHELF_TOP + 0.011 + 0.0002], r: 0.011, friction: 0.3, restitution: 0.15, damping: [0.01, 0.03] }));
    // seesaw: the long arm reaches left under the shelf's edge, a small iron
    // counterweight on the short arm holds it up until the ball lands in its cup
    parts.push(box({ id: 'pivotpost', group: 'seesaw', at: [PIVOT[0], PIVOT[1] / 2 - 0.003], size: [0.012, PIVOT[1] - 0.006, 0.012], collide: false }));
    const tilt = deg(-15), LONG = 0.150, SHORT = 0.060, dir = [Math.cos(tilt), Math.sin(tilt)];
    const plank = box({ id: 'seesaw', group: 'seesaw', body: 'dynamic', material: 'basswood', size: [LONG + SHORT, 0.009, 0.030], angle: tilt,
      at: [PIVOT[0] - ((LONG - SHORT) / 2) * dir[0], PIVOT[1] - ((LONG - SHORT) / 2) * dir[1]], friction: 0.6, restitution: 0.1 });
    parts.push(plank);
    const half = (LONG + SHORT) / 2, on = (lx, h) => place(plank, [lx, 0.0045 + h / 2]);
    parts.push(box({ id: 'lip', group: 'seesaw', rigid: 'seesaw', body: 'dynamic', material: 'basswood', at: on(-half + 0.003, 0.010), angle: tilt, size: [0.006, 0.010, 0.030] }));
    parts.push(box({ id: 'stop', group: 'seesaw', rigid: 'seesaw', body: 'dynamic', material: 'basswood', at: on(-half + 0.056, 0.014), angle: tilt, size: [0.006, 0.014, 0.030] }));
    parts.push(box({ id: 'counter', group: 'seesaw', rigid: 'seesaw', body: 'dynamic', material: 'iron', mass: 0.045, shade: true, at: on(half - 0.013, 0.020), angle: tilt, size: [0.022, 0.020, 0.024] }));
    // a service bell on the desk, under the long arm's swing
    parts.push(box({ id: 'bellbase', group: 'bell', rigid: 'bell', at: [BELL_X, 0.004], size: [0.058, 0.008, 0.040], material: 'walnut' }));
    parts.push(poly({ id: 'bell', group: 'bell', rigid: 'bell', material: 'brass', sound: 'bell', at: [BELL_X, 0.008],
      pts: [[-0.023, 0], [0.023, 0], [0.018, 0.012], [0.008, 0.020], [-0.008, 0.020], [-0.018, 0.012]], d: 0.036, restitution: 0.4 }));
    parts.push(box({ id: 'plunger', group: 'bell', rigid: 'bell', at: [BELL_X, 0.032], size: [0.004, 0.008, 0.004], material: 'brass', sound: 'bell' }));
    return {
      parts,
      joints: [
        hinge({ a: 'seesaw', anchor: PIVOT, limits: [deg(-15), deg(32)] }),
      ],
    };
  },

  // --- what the READ chapter labels, in order, and where it writes each word
  read: [
    { group: 'ball', label: 'ball', at: [0.012, 0.372] },
    { group: 'ramp', label: 'ramp', at: [0.150, 0.315] },
    { group: 'stand', label: 'stand', at: [0.058, 0.110] },
    { group: 'shelf', label: 'shelf', at: [0.300, 0.170] },
    { group: 'dominoes', label: 'dominoes', at: [0.300, 0.300] },
    { group: 'drop', label: 'ball 2', at: [0.512, 0.262] },
    { group: 'seesaw', label: 'seesaw', at: [0.690, 0.152] },
    { group: 'bell', label: 'bell', at: [0.520, -0.040] },
    { group: 'path', label: 'drop', at: [0.605, 0.205] },
    { group: 'ground', label: 'ground', at: [0.260, -0.040] },
  ],
  // the sketcher's guess at where ball 2 goes, drawn in dashes
  paths: [{ pts: Array.from({ length: 13 }, (_, i) => { const t = i / 12; return [0.548 + 0.05 * t, 0.232 - 0.12 * t * t]; }) }],
  dims: [
    { text: '70 mm', from: [0.346, 0.285], to: [0.416, 0.285], side: 'above' },
    { text: '50 mm', from: [0.262, SHELF_TOP], to: [0.262, SHELF_TOP + 0.050] },
    { text: '200 mm', from: [0.196, 0], to: [0.196, SHELF_Y] },
    { text: '150 mm', from: [0.553, 0.170], to: [0.700, 0.132] },
  ],

  camera: { hero: { dist: 0.98, yaw: -12, pitch: 13 } },

  story: [
    { chapter: 'READ' },
    { chapter: 'LIFT' },
    { chapter: 'TRY', run: { gap: mm(70) }, trails: ['ball'], notes: [
      { kind: 'note', text: 'gap too wide', anchor: [0.381, SHELF_TOP + 0.012], offset: [0, -58], at: 1.9, until: 'end' },
      { kind: 'cross', anchor: [0.381, SHELF_TOP + 0.012], at: 1.8, until: 'end' },
    ] },
    { chapter: 'TWEAK', from: { gap: mm(70) }, to: { gap: mm(40) }, rewind: 'TRY', notes: [
      { kind: 'dim', at: 1.5, until: 'end',
        from: (n) => [n.parts.find((q) => q.id === 'd3').at[0], 0.292], to: (n) => [n.parts.find((q) => q.id === 'd4').at[0], 0.292],
        text: (n) => `${Math.round((n.parts.find((q) => q.id === 'd4').at[0] - n.parts.find((q) => q.id === 'd3').at[0]) * 1000)} mm` },
    ] },
    { chapter: 'RUN', run: { gap: mm(40) }, trails: ['ball', 'ball2'], notes: [
      { kind: 'note', text: '{speed:ball@dominoes-0.12} m/s', anchor: [0.235, 0.26], offset: [0, -30], at: 'trigger:dominoes', until: 'trigger:dominoes+1.3' },
      { kind: 'note', text: '{speed:ball2@seesaw} m/s', anchor: [0.585, 0.17], offset: [-70, -10], at: 'trigger:seesaw', until: 'end' },
      { kind: 'note', text: 'ding!', anchor: [BELL_X, 0.03], offset: [30, -80], at: 'trigger:bell', until: 'end' },
    ] },
    { chapter: 'REPLAY', of: 'RUN', from: 1.62, to: 2.42, speed: 0.25, camera: { target: [0.625, 0.105], dist: 0.44, yaw: -26, pitch: 5, fov: 36 }, notes: [
      { kind: 'note', text: '{speed:ball2@seesaw} m/s', anchor: 'body:ball2', offset: [-70, -40], at: 'trigger:seesaw', until: 'end' },
      { kind: 'arrow', anchor: [BELL_X - 0.012, 0.03], offset: [-160, -110], at: 'trigger:bell-0.25', until: 'end' },
      { kind: 'note', text: 'ding!', anchor: [BELL_X, 0.03], offset: [40, -90], at: 'trigger:bell', until: 'end' },
    ] },
    { chapter: 'DONE', camera: { target: [0.62, 0.08], dist: 0.55, yaw: 32, pitch: 26 } },
  ],

  sandbox: {
    params: { gap: mm(70) },
    trails: ['ball', 'ball2'],
    hintText: 'Press Run, then change the gap and try again',
    stats: [
      { label: 'STEPS', unit: '/6', value: (i) => i.steps, always: true },
      { label: 'DING', unit: 's', value: (i) => (i.fired.bell != null ? i.fired.bell.toFixed(2) : '—') },
      { label: 'DOWN', unit: '/7', value: (i) => [1, 2, 3, 4, 5, 6, 7].filter((k) => Math.abs(i.S.angle(`d${k}`)) > deg(40)).length, always: true },
      { label: 'GAP', unit: 'mm', value: (i) => Math.round(i.params.gap * 1000), always: true },
    ],
    script: [
      { t: 0.2, do: 'hint', text: 'Press Run', until: 1.4 },
      { t: 1.2, do: 'run' },
      { t: 4.4, do: 'hint', text: 'Stuck at the gap. Close it and try again', until: 7.6 },
      { t: 5.4, do: 'reset' },
      { t: 6.2, do: 'param', id: 'gap', to: mm(38), dur: 1.2 },
      { t: 8.0, do: 'run' },
      { t: 11.6, do: 'reset' },
      { t: 12.4, do: 'slowmo', on: true },
      { t: 13.2, do: 'run' },
      { t: 21.8, do: 'slowmo', on: false },
      { t: 22.4, do: 'sketch', from: 0, to: 1, dur: 1.0 },
      { t: 24.0, do: 'sketch', from: 1, to: 0, dur: 0.9 },
      { t: 25.4, do: 'view', view: 'side' },
      { t: 27.0, do: 'view', view: 'top' },
      { t: 28.6, do: 'view', view: 'hero' },
    ],
    length: 30.4,
  },

  start: (p) => ({ hold: ['ball'], velocity: { ball: [p.push * Math.cos(deg(-30)), p.push * Math.sin(deg(-30))] } }),

  // Stages the run passes through, in order. The first time each is true is its step time.
  triggers: [
    { id: 'roll', label: 'ball rolls', when: (S) => S.moved('ball') > 0.05 },
    { id: 'dominoes', label: 'dominoes', when: (S) => Math.abs(S.angle('d1')) > deg(20) },
    { id: 'gap', label: 'the gap', when: (S) => Math.abs(S.angle('d4')) > deg(20) },
    { id: 'drop', label: 'ball drops', when: (S) => S.pos('ball2')[1] < SHELF_TOP - 0.01 },
    { id: 'seesaw', label: 'seesaw', when: (S) => S.angle('seesaw') > 0 },
    { id: 'bell', label: 'ding', when: (S) => S.hit('seesaw', 'bell') > 1 },
  ],
};
