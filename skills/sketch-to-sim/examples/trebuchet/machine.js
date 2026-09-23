// The paper trebuchet, as a generic machine: the arm is a hinged body with an
// iron counterweight on its short end and a cup on its long end, held cocked
// until the start. The hinge's limit is the stop: when the arm hits it, the
// ball leaves the cup at 32 degrees, exactly as a real cup catapult releases.
//
// Machine coordinates: metres, x from the rear axle, y up from the ground line.

import { mm, deg, box, beam, ball, wheel, hinge, place } from '/engine/src/spec.js';

const PIVOT = [0.105, 0.160], L1 = 0.170, L2 = 0.070;
const GAP = 0.455, BLOCK = [0.040, 0.061, 0.040], ROWS = [4, 3, 2, 1];
const ZS = 0.030;                         // the two side frames sit at z = +/-ZS

export default {
  title: 'Paper Trebuchet',
  subtitle: 'A pencil sketch, measured, built and thrown.',
  kicker: ['Sketch to physics', 'Scale 1:1'],
  paper: { w: 0.841, h: 0.594, origin: [0.100, 0.380] },

  params: {
    weight: { label: 'WEIGHT', unit: 'kg', min: 0.3, max: 1.2, step: 0.01, value: 0.68, show: (v) => v.toFixed(2), ends: ['LIGHT', 'HEAVY'] },
    pull: { label: 'PULL', unit: '°', min: 0, max: 80, step: 1, value: 66, show: (v) => Math.round(v) },
  },

  build(p) {
    const parts = [];
    // frame: two side frames, cross beams, wheels, axles (all fixed)
    for (const [s, side] of [[-1, 'L'], [1, 'R']]) {
      const z = s * ZS;
      parts.push(box({ id: `base${side}`, group: 'frame', at: [0.080, 0.043], size: [0.200, 0.022, 0.015], z }));
      parts.push(beam({ id: `legA${side}`, group: 'frame', from: [0.008, 0.054], to: [0.099, 0.164], t: 0.016, d: 0.015, z }));
      parts.push(beam({ id: `legB${side}`, group: 'frame', from: [0.172, 0.054], to: [0.111, 0.164], t: 0.016, d: 0.015, z }));
      parts.push(box({ id: `post${side}`, group: 'frame', at: [0.105, 0.112], size: [0.015, 0.116, 0.015], z }));
      parts.push(box({ id: `cap${side}`, group: 'frame', at: [0.105, 0.162], size: [0.026, 0.026, 0.017], z, sketch: s > 0 }));
      for (const [k, wx] of [[0, 0], [1, 0.155]]) {
        parts.push(wheel({ id: `wheel${k}${side}`, group: 'wheels', at: [wx, 0.023], r: 0.023, d: 0.013, z: s * (ZS + 0.0145), sketch: s > 0 }));
        parts.push(wheel({ id: `hub${k}${side}`, group: 'wheels', material: 'steel', at: [wx, 0.023], r: 0.0065, d: 0.003, z: s * (ZS + 0.0225), sketch: s > 0, shade: false }));
      }
    }
    for (const [k, cx] of [[0, -0.012], [1, 0.172]]) parts.push(box({ id: `cross${k}`, group: 'frame', at: [cx, 0.043], size: [0.016, 0.022, 2 * ZS + 0.015], sketch: false }));
    for (const [k, wx] of [[0, 0], [1, 0.155]]) parts.push(wheel({ id: `axle${k}`, group: 'wheels', material: 'steel', at: [wx, 0.023], r: 0.0035, d: 2 * ZS + 0.04, sketch: false, shade: false }));
    parts.push(wheel({ id: 'pin', group: 'pivot', material: 'steel', at: PIVOT, r: 0.0042, d: 2 * ZS + 0.026, collide: false, shade: false }));

    // the arm, cocked back by `pull` degrees from rest: its body angle points
    // along the short (counterweight) end, so the swing never wraps past 180
    const a = deg(-34 + p.pull), d = [Math.cos(a), Math.sin(a)];
    const arm = box({ id: 'arm', group: 'arm', body: 'dynamic', material: 'pine', size: [L1 + L2 - 0.012, 0.016, 0.016], angle: a,
      at: [PIVOT[0] + d[0] * (L2 - (L1 - 0.012)) / 2, PIVOT[1] + d[1] * (L2 - (L1 - 0.012)) / 2], mass: 0.020 });
    parts.push(arm);
    const pv = (L1 - 0.012 - L2) / 2;                 // pivot's offset from the arm's centre, along the arm
    const tip = -L1 + pv;                             // the cup's centre, in the arm's frame
    const on = (lx, ly) => place(arm, [lx, ly]);
    parts.push(box({ id: 'cupfloor', group: 'cup', rigid: 'arm', body: 'dynamic', material: 'oak', at: on(tip, 0.010), angle: a, size: [0.040, 0.004, 0.026], mass: 0.006 }));
    parts.push(box({ id: 'cupback', group: 'cup', rigid: 'arm', body: 'dynamic', material: 'oak', at: on(tip - 0.021, 0.021), angle: a, size: [0.004, 0.022, 0.026], mass: 0.003 }));
    parts.push(box({ id: 'cupfront', group: 'cup', rigid: 'arm', body: 'dynamic', material: 'oak', at: on(tip + 0.021, 0.017), angle: a, size: [0.004, 0.014, 0.026], mass: 0.003 }));
    parts.push(box({ id: 'weight', group: 'weight', rigid: 'arm', body: 'dynamic', material: 'iron', shade: true, at: on(pv + L2 - 0.006, -0.012), angle: a, size: [0.036, 0.040, 0.034], mass: p.weight }));
    parts.push(ball({ id: 'ball', group: 'ball', body: 'dynamic', at: on(tip, 0.012 + 0.0165), r: 0.0165, mass: 0.097, friction: 0.4, restitution: 0.25, damping: [0.02, 1.2] }));

    // the tower: 4, 3, 2, 1 basswood blocks
    let k = 0;
    ROWS.forEach((n, row) => {
      const x0 = GAP + ((ROWS[0] - n) * BLOCK[0]) / 2;
      for (let i = 0; i < n; i++) parts.push(box({ id: `b${++k}`, group: 'tower', body: 'dynamic', material: 'basswood', mass: 0.026, friction: 0.45,
        at: [x0 + BLOCK[0] * (i + 0.5), BLOCK[1] * (row + 0.5) + 0.0002 * (row + 1)], size: BLOCK }));
    });
    return { parts, joints: [hinge({ a: 'arm', anchor: PIVOT, limits: [deg(-58), a] })] };
  },

  read: [
    { group: 'wheels', label: 'wheels', at: [0.062, -0.036] },
    { group: 'frame', label: 'frame', at: [-0.090, 0.085] },
    { group: 'arm', label: 'arm', at: [0.030, 0.238] },
    { group: 'pivot', label: 'pivot', at: [0.124, 0.180] },
    { group: 'weight', label: 'weight', at: [0.200, 0.100] },
    { group: 'ball', label: 'ball', at: [-0.080, 0.312] },
    { group: 'cup', label: 'cup', at: [-0.105, 0.250] },
    { group: 'tower', label: 'tower', at: [0.388, 0.170] },
    { group: 'ground', label: 'ground', at: [0.300, -0.036] },
    { group: 'path', label: 'path', at: [0.300, 0.352] },
  ],
  paths: [{ pts: Array.from({ length: 41 }, (_, i) => { const t = i / 40, u = 1 - t; return [u * u * -0.02 + 2 * u * t * 0.27 + t * t * 0.545, u * u * 0.272 + 2 * u * t * 0.40 + t * t * 0.262]; }) }],
  dims: [
    { text: '155 mm', from: [0, -0.042], to: [0.155, -0.042] },
    { text: '46 mm', from: [0.196, 0], to: [0.196, 0.046] },
    { text: '170 mm', from: [0.118, 0.180], to: [-0.023, 0.275], side: 'above' },
    { text: '61 mm', from: [GAP - 0.014, 0], to: [GAP - 0.014, BLOCK[1]] },
    { text: '40 mm', from: [GAP, -0.022], to: [GAP + BLOCK[0], -0.022] },
    { text: '243 mm', from: [GAP + 0.182, 0], to: [GAP + 0.182, 0.244] },
  ],

  camera: { hero: { target: [0.27, 0.12], dist: 0.95, yaw: -12, pitch: 11 } },

  story: [
    { chapter: 'READ', params: { pull: 0 } },
    { chapter: 'LIFT' },
    { chapter: 'TWEAK', name: 'LOAD', label: 'LOAD', from: { pull: 0, weight: 0.48 }, to: { pull: 66, weight: 0.48 }, dur: 3.4, notes: [
      { kind: 'tag', text: '97 g', anchor: 'body:ball', offset: [-50, -44], at: 2.2 },
      { kind: 'tag', text: '0.48 kg', anchor: 'part:weight', offset: [74, 6], at: 2.5 },
    ] },
    { chapter: 'MISS', run: { weight: 0.48, pull: 66 }, trails: ['ball'], seconds: 3.4, notes: [
      { kind: 'tag', text: '0.48 kg', anchor: 'part:weight', offset: [74, 6], until: 'trigger:launch' },
      { kind: 'cross', anchor: [0.371, 0.004], at: 'trigger:land+0.2' },
      { kind: 'note', text: 'short', anchor: [0.371, 0.004], offset: [0, 36], at: 'trigger:land+0.3' },
    ] },
    { chapter: 'TWEAK', from: { weight: 0.48, pull: 66 }, to: { weight: 0.68, pull: 66 }, rewind: 'MISS', notes: [
      { kind: 'tag', text: (n) => `${n.parts.find((q) => q.id === 'weight').mass.toFixed(2)} kg`, anchor: 'part:weight', offset: [74, 6], at: 1.5 },
    ] },
    { chapter: 'HIT', run: { weight: 0.68, pull: 66 }, trails: ['ball'], seconds: 4, notes: [
      { kind: 'tag', text: '0.68 kg', anchor: 'part:weight', offset: [74, 6], until: 'trigger:launch' },
      { kind: 'note', text: '{speed:ball@launch} m/s', anchor: [0.02, 0.29], offset: [0, -40], at: 'trigger:launch', until: 'trigger:tower+1' },
    ] },
    { chapter: 'REPLAY', of: 'HIT', from: 0.2, to: 1.3, speed: 0.25, camera: { target: [0.30, 0.16], dist: 0.62, yaw: -22, pitch: 3, fov: 38 }, notes: [
      { kind: 'note', text: 'release {speed:ball@launch} m/s', anchor: [0.17, 0.25], offset: [40, -10], at: 'trigger:launch', until: 'end' },
      { kind: 'note', text: 'at 32°', anchor: [0.17, 0.25], offset: [40, 28], at: 'trigger:launch+0.05', until: 'end' },
      { kind: 'arrow', anchor: 'body:ball', offset: [-150, -110], at: 'trigger:tower-0.05', until: 'trigger:tower+0.4' },
      { kind: 'note', text: '{speed:ball@tower} m/s', anchor: [GAP, 0.19], offset: [-140, -140], at: 'trigger:tower-0.05', until: 'end' },
    ] },
    { chapter: 'DONE', camera: { target: [0.09, 0.08], dist: 0.42, yaw: 34, pitch: 24 } },
  ],

  sandbox: {
    params: { weight: 0.48, pull: 66 },
    trails: ['ball'],
    stats: [
      { label: 'SPEED', unit: 'm/s', value: (i) => (i.at.launch ? i.at.launch.ball.toFixed(2) : '—') },
      { label: 'ANGLE', unit: '°', value: (i) => (i.fired.launch != null ? 32 : '—') },
      { label: 'DOWN', unit: '/10', value: (i) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].filter((k) => i.S.moved(`b${k}`) > 0.012).length, always: true },
      { label: 'WEIGHT', unit: 'kg', value: (i) => i.params.weight.toFixed(2), always: true },
    ],
    script: [
      { t: 0.2, do: 'hint', text: 'Press Run to throw', until: 1.4 },
      { t: 1.2, do: 'run' },
      { t: 4.6, do: 'reset', clear: false },
      { t: 5.4, do: 'param', id: 'weight', to: 0.68, dur: 1.0 },
      { t: 7.0, do: 'run' },
      { t: 10.8, do: 'reset', clear: false },
      { t: 11.6, do: 'param', id: 'weight', to: 0.9, dur: 0.9 },
      { t: 12.8, do: 'slowmo', on: true },
      { t: 13.6, do: 'run' },
      { t: 19.4, do: 'slowmo', on: false },
      { t: 20.0, do: 'sketch', from: 0, to: 1, dur: 1.0 },
      { t: 21.6, do: 'sketch', from: 1, to: 0, dur: 0.9 },
      { t: 23.0, do: 'view', view: 'side' },
      { t: 24.6, do: 'view', view: 'top' },
      { t: 26.2, do: 'view', view: 'hero' },
    ],
    length: 28,
  },

  start: { hold: ['arm'] },
  settle: 0.4,

  triggers: [
    { id: 'launch', label: 'launch', when: (S) => S.speed('ball') > 0.5 && S.angle('arm') < deg(-56) },
    { id: 'land', label: 'lands', when: (S) => S.pos('ball')[1] < 0.0185 && S.pos('ball')[0] > 0.2 },
    { id: 'tower', label: 'tower', when: (S) => [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].some((i) => S.moved(`b${i}`) > 0.012) },
  ],
};
