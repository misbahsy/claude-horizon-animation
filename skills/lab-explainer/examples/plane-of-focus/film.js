// One sharp plane: a lens on an optical bench, a low-poly valley in front of it
// and a ground glass behind it. Turning the focus ring slides the plane of focus
// through the valley; what sits on it lands on the glass as a point, everything
// else as a disc. The numbers are a real 50 mm lens.

// ---- the model ------------------------------------------------------------------
// Real lens, in cm: 50 mm focal length, 0.035 mm circle of confusion.
const F = 5.0, COC = 0.0035, SHARP_MM = 0.14;
const OBJECTS = [
  { id: 'pine', name: 'the pine', s: 37 },
  { id: 'cabin', name: 'the cabin', s: 54 },
  { id: 'peak', name: 'the peak', s: 86 },
];
function sharpZone(sf, N) {
  const f2 = F * F, k = N * COC * (sf - F);
  const near = (sf * f2) / (f2 + k), far = k < f2 ? (sf * f2) / (f2 - k) : Infinity;
  return { near, far, zone: far - near };
}
// blur disc diameter on the sensor, mm
const discMM = (s, sf, N) => ((F * F) / (N * (sf - F))) * (Math.abs(s - sf) / s) * 10;
const fmtN = (N) => (N >= 9.95 ? String(Math.round(N)) : Math.abs(N - Math.round(N)) < 0.05 ? String(Math.round(N)) : N.toFixed(1));
const cm = (v) => `${v.toFixed(1)} cm`;
const cap = (t) => t[0].toUpperCase() + t.slice(1);

export const params = {
  sf: { value: 54 }, // focus distance, cm
  N: { value: 2, interp: 'log' }, // f-number
  exploded: { value: 1, ease: 'inOut' },
};

export function derive(p) {
  const discs = OBJECTS.map((o) => ({ ...o, d: discMM(o.s, p.sf, p.N) }));
  return { zone: sharpZone(p.sf, p.N).zone, discs, sharp: discs.filter((o) => o.d < SHARP_MM).sort((a, b) => a.d - b.d), soft: discs.filter((o) => o.d >= SHARP_MM) };
}

// ---- the drawn model: a scaled copy of the same thin-lens relation -----------
const A = 26; // optical axis height
const X_GLASS = 0, X_HR = 14, X_HF = 56, D = X_HR - X_GLASS; // glass, rear and front principal planes
const GLASS_W = 30, GLASS_H = 20, BLUR_K = 0.1;
const pupil = (sf, N) => (3.2 * (1 / (1 / sf + 1 / D))) / (2 * N);
const blurFrac = (s, sf, N) => BLUR_K * (2 / N) * 54 * Math.abs(1 / s - 1 / sf);
const scaleT = (sf) => 1 - 30 / sf;

// The valley blurs by its distance from the focus plane along the axis, the way the lens sees it.
export const blur = {
  field: {
    glsl: 'abs(1.0 / max(p.x - uHF, 1.0) - 1.0 / uSf) * 54.0 * (2.0 / uN)',
    uniforms: { uHF: X_HF, uSf: (s) => s.p.sf, uN: (s) => s.p.N },
  },
};

// ---- the film ----------------------------------------------------------------------
const OVERVIEW_LABELS = ['imagePlane', 'focusRing', 'planeFocus', 'sharpZone'];
export const story = {
  duration: 32,
  // [start, duration, target]: a drag on the ring, the aperture, the lens closing and opening
  tracks: {
    sf: [[1.05, 0.9, 37], [4.45, 1.27, 86], [7.2, 0.76, 54], [14.05, 0.45, 37], [16.03, 1.59, 54], [18.44, 1.02, 86], [21.6, 0.8, 37], [23.7, 1.2, 54]],
    N: [[9.955, 1.02, 16], [12.95, 1.1, 2], [30.12, 1.29, 16]],
    exploded: [[26.95, 0.75, 0], [29.4, 0.75, 1]],
  },
  // one short sentence at a time, timed to what is happening
  captions: [
    [0.3, 4.4, 'A lens is sharp at only one distance: <span class="c">the plane of focus</span>.'],
    [4.6, 8.7, 'Turn the focus ring and the plane slides through the valley.'],
    [9.2, 13.9, () => `Close down to ƒ/16 and the sharp zone grows from <b>${cm(sharpZone(54, 2).zone)}</b> to <b>${cm(sharpZone(54, 16).zone)}</b>.`],
    [14.5, 17.9, 'Where the plane cuts the valley, everything is sharp.'],
    [18.2, 20.7, () => `Farther away, it deepens to <b>${cm(sharpZone(86, 2).zone)}</b>.`],
    [21.1, 25.1, 'On the glass, sharp points stay points; the rest become <span class="o">discs</span>.'],
    [25.6, 30.0, 'Focus sets where the sharp slice is. Aperture sets how thick.'],
    [30.3, 31.95, () => `At ƒ/16: <b>${cm(sharpZone(54, 16).zone)}</b> of sharp valley.`],
  ],
  shots: [
    { id: 'A', t0: 0, t1: 8.75, from: { pos: [104, 58, 248], target: [80, 19, 0] }, to: { pos: [96, 57, 243], target: [77, 19, 0] }, fov: 34,
      field: 38, camK: 26, focus: [44, 26, 0], labels: OVERVIEW_LABELS,
      cursor: { at: [66, A - 7, 19], offset: (s) => [6, -(scaleT(s.p.sf) - scaleT(54)) * 150], grab: (s) => s.move.sf } },
    { id: 'B', t0: 8.75, t1: 14.25, from: { pos: [39, 37, 76], target: [43, 29, 0] }, to: { pos: [48, 36, 71], target: [48, 29, 0] }, fov: 44,
      field: 26, camK: 22, focus: [36, 26, 14], labels: ['helicoid', 'focusRing', 'focusGroup', 'frontElement', 'iris', 'rearGroup'] },
    { id: 'C', t0: 14.25, t1: 20.75, from: { pos: [66, 47, 66], target: [110, 23, -4] }, to: { pos: [75, 44, 70], target: [114, 24, -4] }, fov: 38,
      field: 32, camK: 24, focus: (s) => [X_HF + s.p.sf, 24, -2], labels: ['planeFocus', 'sharpZone', 'frontElement'] },
    { id: 'D', t0: 20.75, t1: 25.25, from: { pos: [-45, 31, 23], target: [3, 25.5, -2] }, to: { pos: [-39, 30, 20], target: [3, 25.5, -1.5] }, fov: 34,
      field: 30, camK: 26, focus: [0, 26, 0], labels: ['focusGroup', 'frontElement', 'iris', 'rearGroup'] },
    { id: 'E', t0: 25.25, t1: 32, from: { pos: [94, 57, 244], target: [76, 19, 0] }, to: { pos: [106, 58, 248], target: [79, 19, 0] }, fov: 34,
      field: 38, camK: 26, focus: [44, 26, 0], labels: OVERVIEW_LABELS,
      cursor: { at: [15, 12, 12], offset: (s) => [Math.sin(s.t * 0.7) * 18, Math.cos(s.t * 0.5) * 10] } },
  ],
};

export const ui = {
  title: ['EVERY PHOTO HAS', 'ONE SHARP PLANE'],
  intro: 'A photo is only truly sharp in one thin slice of the world. Drag the focus ring and watch that slice move through the valley.',
  stats: [
    { label: 'Focus', value: (s) => `${Math.round(s.p.sf)} cm`, accent: true },
    { label: 'Aperture', value: (s) => `ƒ/${fmtN(s.p.N)}` },
    { label: 'Sharp zone', value: (s) => cm(s.d.zone) },
  ],
  explain(s) {
    const { sharp, soft, zone } = s.d;
    if (!sharp.length) return `Focus sits on <b class="c">${Math.round(s.p.sf)} cm</b> of empty air. No part of the valley is on the plane, so every point reaches the glass as a <span class="o">disc</span>: <b>all soft</b>.`;
    let t = `<span class="c">${cap(sharp[0].name)}</span> is on the plane, so its rays meet at <b>one point</b> on the glass.`;
    if (soft.length) {
      const n = soft.map((o) => o.name), list = n.length === 1 ? n[0] : `${n.slice(0, -1).join(', ')} and ${n.at(-1)}`;
      t += soft.length === 1 ? ` ${cap(list)} arrives as a <span class="o">disc</span> and blurs.` : ` ${cap(list)} arrive as <span class="o">discs</span> and blur.`;
    }
    return `${t} Sharp zone: <b>${cm(zone)}</b>.`;
  },
  panel: [
    [{ label: 'FOCUS', hint: 'drag the ring · 1 2 3', width: 236, buttons: { param: 'sf', options: [['Foreground', 37], ['Middle', 54], ['Background', 86]] } },
      { label: 'DISTANCE', value: (s) => `${Math.round(s.p.sf)} cm`, slider: { at: (s) => scaleT(s.p.sf) } }],
    [{ label: 'APERTURE', hint: 'F', width: 150, buttons: { param: 'N', mono: true, options: [['ƒ/2', 2], ['ƒ/5.6', 5.6], ['ƒ/16', 16]] } },
      { label: 'LENS', hint: 'X', buttons: { param: 'exploded', options: [['Assembled', 0], ['Exploded', 1]] }, icons: true }],
  ],
};

// ---- the set -----------------------------------------------------------------------
export function build(kit) {
  const { THREE, M, V, mesh, ring, gear, box, scene } = kit;
  kit.axis(A);
  kit.lights();
  kit.room();
  const bench = kit.bench({ rail: [-16, 172], knobX: 40 });

  // the lens
  const L = new THREE.Group(); scene.add(L);
  mesh(gear(16.6, 17.6, 84, 12.2, 11.6, 14.4), M.brass, null, L);
  mesh(ring(12.2, 16.4, 14.2, 15.6, { bevel: 0.2 }), M.satin, null, L);
  mesh(gear(18.1, 19.1, 90, 13.0, 51.6, 55.8), M.brass, null, L);
  const focusRing = kit.spinnable(mesh(gear(17.6, 18.6, 72, 13.2, 56.2, 71.4, { tip: 0.5, bevel: 0.18 }), M.rubber, null, L));
  mesh(ring(13.2, 15.2, 71.2, 74.2, { bevel: 0.3 }), M.black, null, L);
  mesh(ring(12.8, 14.1, 74.0, 86.2, { bevel: 0.4 }), M.black, null, L);
  mesh(ring(11.4, 13.1, 85.6, 87.2, { bevel: 0.3 }), M.satin, null, L);
  kit.lensElement(L, 84.2, 11.2, 2.6, 26, -60, { glow: 0.8 });
  for (const y of [15.5, -15.5]) mesh(box(37.6, 1.5, 3.0, 0.3), M.black, V(33.2, A + y, 0), L);
  mesh(box(37.6, 1.5, 3.0, 0.3), M.black, V(33.2, A, -15.5), L);
  for (const [x, y] of [[13.1, 18.4], [13.1, -18.4], [53.6, 19.8], [53.6, -19.8]]) mesh(box(4.2, 3.0, 5.2, 0.35), M.brass, V(x, A + y, 0), L);
  [[17.6, 11.8, 3.4, 38, 55, 1], [23.8, 12.4, 2.4, 30, -44, 0.8], [36.2, 12.4, 3.0, -70, 34, 1.3], [44.4, 12.9, 4.2, 30, 90, 1.4]].forEach(([x, r, t, rf, rb, g]) => kit.lensElement(L, x, r, t, rf, rb, { glow: g }));
  // iris: a copper ring and blades whose opening is the ray bundle's radius
  mesh(ring(10.6, 12.9, 29.2, 30.8, { bevel: 0.2 }), M.copper, null, L);
  const irisU = { uR: { value: 4 } };
  const blades = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.5, metalness: 0.4, side: THREE.DoubleSide });
  blades.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, irisU);
    sh.vertexShader = 'varying vec2 vIp;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n vIp = position.zy;');
    sh.fragmentShader = 'uniform float uR;\nvarying vec2 vIp;\n' + sh.fragmentShader.replace('void main() {', `void main() {
      float an = atan(vIp.y, vIp.x) + 0.2; float seg = 6.2831853 / 7.0;
      if (length(vIp) < uR * cos(seg * 0.5) / cos(mod(an, seg) - seg * 0.5)) discard;`);
  };
  mesh(new THREE.CircleGeometry(10.8, 96).rotateY(Math.PI / 2), blades, V(30, A, 0), L, { data: { coc: false } });
  // barrel shells that close over the cage when assembled
  const stations = [15.6, 21.2, 27.4, 33.4, 40.0, 47.6, 51.6], shells = [];
  for (let i = 0; i < stations.length - 1; i++) { const a = stations[i], b = stations[i + 1]; shells.push(mesh(ring(14.1, 14.9, -(b - a) / 2, (b - a) / 2, { bevel: 0.25 }), M.black, V((a + b) / 2, 0, 0), L)); }
  const helicoid = kit.spinnable(mesh(gear(4.4, 5.4, 16, 0.9, -2.6, 2.6), M.brass, V(53.7, 24.5, 0), L));
  mesh(new THREE.CylinderGeometry(0.75, 0.75, 11, 24).rotateZ(Math.PI / 2), M.steel, V(53.7, A + 24.5, 0), L);
  mesh(box(2.2, 7, 2.2, 0.3), M.black, V(48.4, A + 21.2, 0), L);
  const stand = (x, top, w = 12) => { mesh(box(w, 3, 12, 0.5), M.rail, V(x, 4.5, 0), L); mesh(box(4.6, top - 6, 4.6, 0.4), M.black, V(x, 6 + (top - 6) / 2, 0), L); mesh(box(8, 1.4, 10, 0.4), M.black, V(x, top - 0.7, 0), L); };
  stand(13.0, A - 17.6); stand(62.0, A - 18.6); stand(80.5, A - 14.1, 9);
  mesh(box(8.8, 5.2, 4.2, 0.4), M.black, V(13.0, 8.6, 6.6), L);
  mesh(new THREE.PlaneGeometry(7.2, 3.6), new THREE.MeshStandardMaterial({ map: kit.tex.plateTexture(['50 mm', 'ƒ/2  ·  1:1']), metalness: 0.9, roughness: 0.35 }), V(13.0, 8.7, 8.75), L);

  // the valley, seen by the lens camera too (layer 1) and blurred by the field
  const Vy = new THREE.Group(); scene.add(Vy);
  const X0 = 88, X1 = 158, Z = 21, TOP = 13.2;
  const ground = kit.lowpoly.terrain(Vy, {
    x0: X0, x1: X1, z: Z, top: TOP,
    height: (x, z) => THREE.MathUtils.smoothstep(x, 128, 152) * 7.5 - Math.exp(-((z - 4) ** 2) / 20) * THREE.MathUtils.smoothstep(x, 96, 108) * (1 - THREE.MathUtils.smoothstep(x, 110, 114)) * 0.9,
    colorAt: (x, z, y) => (Math.abs(z - (4 + (x - 96) * -0.1)) < 1.8 && x > 95 && x < 110.5 ? new THREE.Color(0xa07a4e) : y > TOP + 6.5 ? new THREE.Color(0x8b8b9c).lerp(new THREE.Color(0x5fae45), 0.35) : null),
  });
  const pts = {};
  pts.pine = kit.lowpoly.pine(Vy, X_HF + 37, -5, 16, { ground, seed: 1 });
  [[90.5, 12, 11], [92.5, 17.5, 9], [96, -14, 13], [98.8, -9.5, 10], [100.5, 14, 12], [91, -17, 10], [104, -16.5, 14], [118, -14, 15], [122, 13, 13],
    [126.5, -6, 12], [127.5, 17, 11], [131, 8.5, 14], [120, -19, 10], [106, 17.5, 11], [136, -17, 13], [138.5, 14.5, 12], [134, 2, 10], [113, -18.5, 12],
    [95, -19, 9], [109.5, -11, 10], [115, 18.5, 9], [124, -17, 11], [129.5, -10, 10], [133, 12, 12], [141, 7, 11], [142.5, -9, 10], [102.5, 19, 9], [118.5, 7.5, 9], [123, 18.5, 12]]
    .forEach(([x, z, h], i) => kit.lowpoly.pine(Vy, x, z, h, { ground, seed: i + 2 }));
  [[95.5, 7.5, 2.1], [102, -5, 2.5], [108.5, 12.5, 2.7], [116, -9, 3.2], [124.5, 3.5, 2.6], [129, -13, 3.0], [112, 16.5, 2.2], [99, 1, 1.6], [133, -4, 2.4]]
    .forEach(([x, z, r], i) => kit.lowpoly.bush(Vy, x, z, r, { ground, seed: i }));
  pts.cabin = kit.lowpoly.cabin(Vy, X_HF + 54 + 4.5, 4, { ground }).front; // its lit front wall is exactly 54 cm away
  mesh(new THREE.CylinderGeometry(0.18, 0.22, 6.5, 8), kit.sliceMaterial({ color: 0x2b211c }), V(105.5, ground(105.5, -3) + 3.2, -3), Vy);
  mesh(new THREE.SphereGeometry(0.5, 12, 8), kit.glow(5.5, 3.3, 1.3), V(105.5, ground(105.5, -3) + 6.7, -3), Vy, { cast: false });
  pts.peak = kit.lowpoly.mountain(Vy, X_HF + 86, -2, 15, 28, { ground, seed: 21 });
  kit.lowpoly.mountain(Vy, 151, 12, 12, 21, { ground, seed: 22 }); kit.lowpoly.mountain(Vy, 150.5, -14, 11, 18, { ground, seed: 23 });
  kit.lowpoly.mountain(Vy, 136.5, 16.5, 7.5, 11, { ground, seed: 24 }); kit.lowpoly.mountain(Vy, 137, -15, 7, 10, { ground, seed: 25 });
  kit.lowpoly.backdrop(Vy, X1 + 5, { top: TOP });
  kit.lowpoly.tray(Vy, { x0: X0, x1: X1, z: Z, top: TOP });
  kit.tag(Vy, { field: true, layers: [1] });
  for (const x of [94, 152]) { mesh(box(5, TOP - 6.4, 5, 0.4), M.black, V(x, 3 + (TOP - 6.4) / 2 + 0.4, 0)); mesh(box(11, 3, 12, 0.5), M.rail, V(x, 4.5, 0)); }

  // the lens camera and the ground glass it paints, upside down
  const lensCam = new THREE.PerspectiveCamera(34, GLASS_W / GLASS_H, 3, 600);
  lensCam.position.set(X_HF, A, 0); lensCam.lookAt(X_HF + 100, A - 5, 0);
  const lensView = kit.view({ camera: lensCam, size: [768, 512], layer: 1, clear: 0x9cc6ee, fieldPx: BLUR_K * 768 });
  const G = new THREE.Group(); scene.add(G);
  const pane = new THREE.PlaneGeometry(GLASS_W, GLASS_H); pane.rotateY(Math.PI / 2);
  const pp = pane.attributes.position, uv = pane.attributes.uv;
  for (let i = 0; i < pp.count; i++) uv.setXY(i, 0.5 - pp.getZ(i) / GLASS_W, 0.5 - pp.getY(i) / GLASS_H);
  pane.translate(X_GLASS, A, 0);
  mesh(pane, new THREE.MeshBasicMaterial({ map: lensView.texture, side: THREE.DoubleSide, color: new THREE.Color(1.2, 1.22, 1.25) }), null, G, { cast: false });
  const edge = (w, h, d, y, z) => mesh(new THREE.BoxGeometry(w, h, d), M.glassEdge, V(X_GLASS, A + y, z), G, { cast: false });
  edge(0.5, 0.35, GLASS_W, GLASS_H / 2, 0); edge(0.5, 0.35, GLASS_W, -GLASS_H / 2, 0); edge(0.5, GLASS_H, 0.35, 0, GLASS_W / 2); edge(0.5, GLASS_H, 0.35, 0, -GLASS_W / 2);
  for (const z of [GLASS_W / 2 + 1.6, -GLASS_W / 2 - 1.6]) {
    mesh(box(2.8, A + GLASS_H / 2 - 2, 2.8, 0.35), M.black, V(0, 3 + (A + GLASS_H / 2 - 2) / 2, z), G);
    mesh(box(3.6, 2.6, 3.6, 0.5), M.black, V(0, A + GLASS_H / 2 + 2, z), G); mesh(box(3.6, 2.6, 3.6, 0.5), M.black, V(0, A - GLASS_H / 2 - 1.4, z), G);
  }
  mesh(box(1.8, 1.6, GLASS_W + 4, 0.3), M.black, V(0, A + GLASS_H / 2 + 0.6, 0), G); mesh(box(1.8, 1.6, GLASS_W + 4, 0.3), M.black, V(0, A - GLASS_H / 2 - 0.6, 0), G);
  mesh(box(10, 3, GLASS_W + 10, 0.5), M.rail, V(0, 4.5, 0), G); mesh(box(6, 2, 8, 0.4), M.black, V(-4.5, 7, 0), G);

  // the console: a dial, a film strip of real renders at five distances, a slider, aperture discs
  kit.panel.dial(bench, { x: -19 });
  const THUMB_S = [30, 37, 54, 86, 160];
  const strip = kit.panel.strip(bench, { textures: THUMB_S.map((sf) => lensView.snapshot(kit.stateAt(0, { sf, N: 2 }))), xs: [8, 32.5, 57, 81.5, 106] });
  const slider = kit.panel.slider(bench, { x0: 1, x1: 113 });
  const discs = kit.panel.discs(bench, { xs: [139, 159, 179] });

  // overlays: ray fans, the focus plane, where each object lands on the glass
  const rays = kit.lines(), inner = kit.lines({ width: 1.0, opacity: 0.45, color: [1.1, 1.25, 1.5] });
  const planeH = TOP + 38 - (TOP - 1.2);
  const plane = kit.gridPlane(2 * Z + 3, planeH); plane.position.set(110, TOP - 1.2 + planeH / 2, 0);
  const marks = OBJECTS.map(() => kit.mark());
  const tmp = new THREE.Vector3();
  const landing = (p) => { tmp.copy(p).project(lensCam); return V(X_GLASS - 0.15, A - tmp.y * GLASS_H / 2, -tmp.x * GLASS_W / 2); };
  const nearest = (sf) => THUMB_S.reduce((b, v, i) => (Math.abs(1 / v - 1 / sf) < Math.abs(1 / THUMB_S[b] - 1 / sf) ? i : b), 0);
  const sliderX = (sf) => { const xs = strip.thumbs.map((t) => t.x), inv = 1 / sf; for (let i = 0; i < 4; i++) { const a = 1 / THUMB_S[i], b = 1 / THUMB_S[i + 1]; if (inv <= a && inv >= b) return xs[i] + ((a - inv) / (a - b)) * (xs[i + 1] - xs[i]); } return inv > 1 / THUMB_S[0] ? xs[0] : xs[4]; };

  function update(s) {
    const { sf, N, exploded } = s.p, planeX = X_HF + sf;
    kit.slice.set({ normal: V(1, 0, 0), offset: planeX, width: 0.3, zone: Math.min(s.d.zone, 40), strength: 1 });
    plane.position.x = planeX;
    irisU.uR.value = Math.min(10.4, Math.max(0.35, pupil(sf, N)));
    focusRing.rotation.x = scaleT(sf) * 2.4; helicoid.rotation.x = -scaleT(sf) * 2.4 * (19.1 / 5.4);
    shells.forEach((m) => { m.scale.x = 0.07 + (1 - exploded) * 0.93; });
    // each object's rays: into the front principal plane, straight through, out to the glass
    const R = pupil(sf, N), out = [], mid = [];
    OBJECTS.forEach((o, k) => {
      const P = pts[o.id], Gp = landing(P), r = blurFrac(o.s, sf, N) * GLASS_W, sign = o.s < sf ? 1 : -1, ratio = Math.min(r / Math.max(R, 1e-3), 3);
      for (let j = 0; j < 12; j++) {
        const a = (j / 12) * Math.PI * 2 + 0.26 + k * 0.4, ey = Math.cos(a) * R, ez = Math.sin(a) * R;
        out.push(P.x, P.y, P.z, X_HF, A + ey, ez, X_HR, A + ey, ez, X_GLASS + 0.1, Gp.y + sign * ratio * ey, Gp.z + sign * ratio * ez);
        mid.push(X_HF, A + ey, ez, X_HR, A + ey, ez);
      }
      marks[k].set(Gp, r);
    });
    rays.set(out); inner.set(mid);
    strip.select(nearest(sf)); slider.set(sliderX(sf));
    discs.select([2, 5.6, 16].reduce((b, v, i, arr) => (Math.abs(Math.log(v / N)) < Math.abs(Math.log(arr[b] / N)) ? i : b), 0));
  }

  const Z2 = Z;
  return {
    update,
    labels: {
      imagePlane: { text: 'Image plane', sub: 'upside down', at: [0, A + GLASS_H / 2 + 3.8, -GLASS_W / 2 + 2] },
      focusRing: { text: 'Focus ring', sub: 'drag', at: [64, A + 18.8, 6] },
      planeFocus: { text: 'Plane of focus', sub: (s) => `${Math.round(s.p.sf)} cm`, at: (s) => [X_HF + s.p.sf, TOP + 38 + 1.2, -Z2] },
      sharpZone: { text: 'Sharp zone', sub: (s) => cm(s.d.zone), at: (s) => [X_HF + s.p.sf, TOP - 1.6, Z2 + 1] },
      helicoid: { text: 'Helicoid', at: [53.7, A + 30.8, 0] },
      focusGroup: { text: 'Focus group', at: [40, A + 15.6, 0] },
      frontElement: { text: 'Front element', at: [85.8, A + 14.2, 0] },
      iris: { text: 'Iris', sub: (s) => `ƒ/${fmtN(s.p.N)}`, at: [30, A - 14.6, 5] },
      rearGroup: { text: 'Rear group', at: [17.6, A - 14.8, 5] },
    },
  };
}
