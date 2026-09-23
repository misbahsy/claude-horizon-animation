// Trapped light: a laser on a swinging arm fires into a half-round block through
// its curved side, straight at the centre of the flat face. There the beam bends
// out into the air, and past the critical angle it cannot leave at all.
// Snell's law for the angles, Fresnel's equations for how much reflects.

const DEG = Math.PI / 180;
const MATERIALS = [['Water', 1.333], ['Glass', 1.5], ['Diamond', 2.417]];
const nameOf = (n) => MATERIALS.reduce((b, m) => (Math.abs(m[1] - n) < Math.abs(b[1] - n) ? m : b))[0].toLowerCase();

export const params = {
  theta: { value: 20 }, // angle of incidence inside the block, degrees from the normal
  n: { value: 1.5, ease: 'inOut' }, // refractive index of the block
};

export function derive(p, s) {
  const th = p.theta * DEG, n = p.n, sOut = n * Math.sin(th), tir = sOut >= 1;
  let R = 1, out = null;
  if (!tir) {
    const ci = Math.cos(th), ct = Math.sqrt(1 - sOut * sOut);
    const rs = ((n * ci - ct) / (n * ci + ct)) ** 2, rp = ((n * ct - ci) / (n * ct + ci)) ** 2;
    R = (rs + rp) / 2; out = Math.asin(sOut) / DEG;
  }
  return { crit: Math.asin(1 / n) / DEG, out, tir, R, T: 1 - R, sOut, name: nameOf(s?.press?.n?.cur ?? n) };
}

const deg = (v) => `${v.toFixed(1)}°`;
const pct = (v) => `${Math.round(v * 100)}%`;

// ---- the film -----------------------------------------------------------------------
const C = [80, 7.5, -12]; // where the beam meets the flat face
export const story = {
  duration: 28,
  tracks: {
    theta: [[1.2, 2.2, 32], [7.6, 3.4, 40.5], [11.3, 1.1, 45], [13.9, 1.2, 38], [16.6, 1.4, 46], [21.2, 1.8, 18], [25.2, 1.4, 30]],
    n: [[15.2, 0.6, 1.333], [19.6, 0.6, 2.417], [24.6, 0.6, 1.5]],
  },
  shots: [
    { id: 'A', t0: 0, t1: 7, from: { pos: [92, 92, 128], target: [80, -1, -8] }, to: { pos: [84, 90, 124], target: [79, -1, -8] }, fov: 36, camK: 20, focus: C,
      labels: ['laser', 'normal', 'theta1', 'theta2', 'screen'],
      cursor: { at: (s) => armEnd(s.p.theta), offset: [4, 2], grab: (s) => s.move.theta } },
    { id: 'B', t0: 7, t1: 13, from: { pos: [80, 78, 28], target: [80, 6, -15] }, to: { pos: [84, 74, 24], target: [81, 6, -14] }, fov: 38, camK: 16, focus: C,
      labels: ['normal', 'theta1', 'theta2', 'crit'] },
    { id: 'C', t0: 13, t1: 19, from: { pos: [128, 21, 28], target: [86, 8, -14] }, to: { pos: [121, 19, 24], target: [85, 8, -14] }, fov: 36, camK: 22, focus: [96, 7, -16],
      labels: ['theta2', 'screen', 'flat'] },
    { id: 'D', t0: 19, t1: 24, from: { pos: [44, 32, 32], target: [76, 8, -12] }, to: { pos: [50, 30, 30], target: [78, 8, -12] }, fov: 38, camK: 22, focus: C,
      labels: ['laser', 'theta1', 'crit', 'flat'] },
    { id: 'E', t0: 24, t1: 28, from: { pos: [72, 92, 126], target: [78, -1, -8] }, to: { pos: [90, 90, 128], target: [81, -1, -8] }, fov: 36, camK: 20, focus: C,
      labels: ['laser', 'normal', 'theta1', 'theta2', 'screen'],
      cursor: { at: (s) => armEnd(s.p.theta), offset: [4, 2], grab: (s) => s.move.theta } },
  ],
};
const ARM = 25;
function armEnd(th) { return [C[0] - Math.cos(th * DEG) * ARM, 4.5, C[2] + Math.sin(th * DEG) * ARM]; }

export const ui = {
  title: ['WHY LIGHT GETS', 'TRAPPED IN GLASS'],
  intro: 'Light bends as it leaves glass, and the steeper it arrives the harder it bends. Swing the laser far enough and there is no angle left to leave at.',
  stats: [
    { label: 'Angle in', value: (s) => deg(s.p.theta), accent: true },
    { label: 'Angle out', value: (s) => (s.d.tir ? 'none' : deg(s.d.out)) },
    { label: 'Critical', value: (s) => deg(s.d.crit) },
    { label: 'Reflected', value: (s) => pct(s.d.R) },
  ],
  explain(s) {
    const { name, tir, out, R, crit, sOut } = s.d, th = s.p.theta;
    if (tir) return `At <b>${deg(th)}</b> there is no angle left to leave at: n·sin θ is <b>${sOut.toFixed(2)}</b>, more than 1. Every photon reflects back into the ${name}. That is <span class="c">total internal reflection</span>, and in ${name} it starts at <b>${deg(crit)}</b>.`;
    let t = `Inside <span class="c">${name}</span> the beam meets the flat face at <b>${deg(th)}</b> and leaves at <b>${deg(out)}</b>, bent away from the normal as it speeds up in air. <span class="o">${pct(R)}</span> reflects back inside.`;
    if (crit - th < 4) t += ` Only <b>${deg(crit - th)}</b> short of the critical angle.`;
    return t;
  },
  panel: [
    [{ label: 'MATERIAL', hint: 'M', width: 212, buttons: { param: 'n', options: MATERIALS } },
      { label: 'ANGLE', value: (s) => deg(s.p.theta), slider: { at: (s) => s.p.theta / 90 } }],
  ],
};

// ---- the set -----------------------------------------------------------------------
export function build(kit) {
  const { THREE, M, V, mesh, box, scene, hdr } = kit;
  const c = V(...C), y0 = 3;
  kit.lights({ key: { target: [80, 4, -12] }, sun: { target: [80, 4, -12], box: 45 } });
  kit.room();
  const bench = kit.bench({ rail: [0, 0], knobX: null });

  // a round stage with a protractor face
  mesh(new THREE.CylinderGeometry(33, 33.5, 3, 96), M.console, V(c.x, 1.5, c.z));
  mesh(new THREE.TorusGeometry(33.2, 0.25, 8, 160).rotateX(Math.PI / 2), M.ledCyan, V(c.x, 1.6, c.z), scene, { cast: false });
  const cv = document.createElement('canvas'); cv.width = cv.height = 2048; const g = cv.getContext('2d');
  g.fillStyle = '#10141c'; g.beginPath(); g.arc(1024, 1024, 1020, 0, 7); g.fill();
  g.strokeStyle = '#dfe7f2'; g.fillStyle = '#c9d3e0'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = '600 38px "JetBrains Mono", monospace';
  for (let a = 0; a < 360; a++) {
    const t = a * DEG, long = a % 10 === 0, r0 = long ? 880 : a % 5 === 0 ? 925 : 950;
    g.globalAlpha = long ? 0.9 : 0.55; g.lineWidth = long ? 5 : 3;
    g.beginPath(); g.moveTo(1024 + Math.cos(t) * r0, 1024 - Math.sin(t) * r0); g.lineTo(1024 + Math.cos(t) * 1000, 1024 - Math.sin(t) * 1000); g.stroke();
    if (long) { const lbl = Math.abs(((a + 90) % 180) - 90); g.globalAlpha = 0.7; g.fillText(String(lbl), 1024 + Math.cos(t) * 820, 1024 - Math.sin(t) * 820); }
  }
  g.globalAlpha = 0.35; g.lineWidth = 3; g.setLineDash([18, 14]);
  g.beginPath(); g.moveTo(40, 1024); g.lineTo(2008, 1024); g.stroke();
  const faceT = new THREE.CanvasTexture(cv); faceT.colorSpace = THREE.SRGBColorSpace; faceT.anisotropy = 8;
  mesh(new THREE.CircleGeometry(32.5, 128).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: faceT, roughness: 0.6, metalness: 0.2 }), V(c.x, y0 + 0.02, c.z), scene, { cast: false });

  // the half-round block: flat face through c, curved side toward -x
  const RB = 10, HB = 9;
  const shape = new THREE.Shape(); shape.moveTo(0, -RB); shape.absarc(0, 0, RB, -Math.PI / 2, -Math.PI * 1.5, true); shape.lineTo(0, -RB);
  const blockGeo = new THREE.ExtrudeGeometry(shape, { depth: HB, bevelEnabled: true, bevelThickness: 0.25, bevelSize: 0.25, bevelSegments: 3, curveSegments: 96 });
  blockGeo.rotateX(-Math.PI / 2); blockGeo.translate(c.x, y0 + 0.25, c.z);
  const glass = new THREE.MeshPhysicalMaterial({ color: 0xf4fbff, roughness: 0.03, transmission: 1, thickness: 10, ior: 1.5, envMapIntensity: 1.8, specularIntensity: 1, attenuationColor: new THREE.Color(0xcdeeff), attenuationDistance: 40, side: THREE.DoubleSide });
  mesh(blockGeo, glass, null, scene, { cast: false, data: { coc: false } });
  const edgeM = new THREE.MeshBasicMaterial({ color: hdr(0.5, 1.2, 1.6), transparent: true });
  for (const y of [y0 + 0.2, y0 + HB + 0.3]) mesh(new THREE.BoxGeometry(0.25, 0.2, 2 * RB), edgeM, V(c.x, y, c.z), scene, { cast: false });
  const TINT = { water: [0x9fd6ff, 18, 0], glass: [0xcdeeff, 40, 0], diamond: [0xffffff, 200, 6] };

  // a white half-ring screen behind the block, where both beams land
  const RS = 28;
  const screen = new THREE.CylinderGeometry(RS, RS, 7, 160, 1, true, Math.PI / 2, Math.PI);
  mesh(screen, new THREE.MeshStandardMaterial({ color: 0xe8ecf2, roughness: 0.85, side: THREE.DoubleSide, transparent: true, opacity: 0.92 }), V(c.x, y0 + 3.5, c.z), scene, { cast: false });

  // the laser on its arm, pivoting about c
  const arm = new THREE.Group(); arm.position.set(c.x, y0, c.z); scene.add(arm);
  mesh(box(ARM - 11, 1.2, 3, 0.3), M.black, V(-(11 + ARM) / 2, 0.6, 0), arm);
  const laser = new THREE.Group(); laser.position.set(-19.5, C[1] - y0, 0); arm.add(laser);
  mesh(new THREE.CylinderGeometry(1.7, 1.7, 9, 40).rotateZ(Math.PI / 2), M.black, V(-2.5, 0, 0), laser);
  mesh(new THREE.CylinderGeometry(1.85, 1.85, 1.2, 40).rotateZ(Math.PI / 2), M.brass, V(1.2, 0, 0), laser);
  mesh(new THREE.CircleGeometry(0.55, 24).rotateY(Math.PI / 2), kit.glow(6, 0.35, 0.2), V(2.0, 0, 0), laser, { cast: false });
  mesh(box(3, C[1] - y0 - 1.7, 2.4, 0.3), M.black, V(-3, -(C[1] - y0) / 2 - 0.4, 0), laser);
  mesh(new THREE.BoxGeometry(0.3, 0.15, 2.6), kit.glow(3.2, 1.5, 0.45), V(-ARM + 1, 1.25, 0), arm, { cast: false });

  // the console: a dial, material swatches, the angle slider
  kit.panel.dial(bench, { x: 12 });
  kit.panel.discs(bench, { xs: [150], opens: [0.5] });
  const swatch = (label, n, tint) => {
    const s = document.createElement('canvas'); s.width = 384; s.height = 256; const q = s.getContext('2d');
    const gr = q.createLinearGradient(0, 0, 384, 256); gr.addColorStop(0, tint); gr.addColorStop(1, '#0d1420'); q.fillStyle = gr; q.fillRect(0, 0, 384, 256);
    q.fillStyle = '#f1f6fb'; q.font = '800 54px Outfit, sans-serif'; q.fillText(label, 26, 150); q.font = '500 30px "JetBrains Mono", monospace'; q.fillStyle = '#b8c6d6'; q.fillText(`n = ${n}`, 26, 205);
    const t = new THREE.CanvasTexture(s); t.colorSpace = THREE.SRGBColorSpace; return t;
  };
  const strip = kit.panel.strip(bench, { textures: [swatch('Water', 1.333, '#2b6fa8'), swatch('Glass', 1.5, '#3f8fa0'), swatch('Diamond', 2.417, '#8a93b8')], xs: [53, 80, 107] });
  const slider = kit.panel.slider(bench, { x0: 35, x1: 125 });

  // overlays: the beams, the normal, the two angles, the critical angle
  const beamIn = kit.lines({ color: [5, 0.35, 0.22], width: 2.6, opacity: 1 });
  const beamOut = kit.lines({ color: [5, 0.35, 0.22], width: 2.6, opacity: 1 });
  const beamBack = kit.lines({ color: [5, 0.35, 0.22], width: 2.2, opacity: 1 });
  const guides = kit.lines({ color: [1.1, 1.25, 1.5], width: 1.1, opacity: 0.55 });
  const arcs = kit.lines({ color: [0.6, 1.8, 2.4], width: 1.6, opacity: 0.9 });
  const critLine = kit.lines({ color: [3.0, 1.4, 0.4], width: 1.8, opacity: 0.9 });
  const spotMat = (k) => new THREE.MeshBasicMaterial({ color: hdr(6, 0.5, 0.3, k), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const spotOut = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), spotMat(1)), spotBack = new THREE.Mesh(new THREE.CircleGeometry(0.9, 32), spotMat(1));
  kit.overlay.add(spotOut, spotBack);
  const dir = (a, side) => V(side * Math.cos(a), 0, -Math.sin(a)); // side -1: toward the laser, +1: out through the flat face
  const at = (a, side, r) => c.clone().addScaledVector(dir(a, side), r);
  const arc = (from, to, side, r, zSign = 1) => { const pts = []; const n = 24; for (let i = 0; i < n; i++) { const a0 = from + ((to - from) * i) / n, a1 = from + ((to - from) * (i + 1)) / n; const p0 = c.clone().add(V(side * Math.cos(a0) * r, 0, zSign * Math.sin(a0) * r)), p1 = c.clone().add(V(side * Math.cos(a1) * r, 0, zSign * Math.sin(a1) * r)); pts.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z); } return pts; };
  const spot = (m, a, side, k) => { const p = at(a, side, RS - 0.2); m.position.copy(p); m.lookAt(c.x, p.y, c.z); m.material.color.setRGB(6 * k, 0.5 * k, 0.3 * k); m.visible = k > 0.01; };

  function update(s) {
    const th = s.p.theta * DEG, { T, R, tir, out, crit } = s.d;
    arm.rotation.y = th;
    const [tint, dist, disp] = TINT[s.d.name];
    glass.ior = s.p.n; glass.attenuationColor.set(tint); glass.attenuationDistance = dist; glass.dispersion = disp;
    // incoming beam: from the laser, straight through the curved side, to c
    const inDir = V(Math.cos(th), 0, -Math.sin(th)), src = c.clone().addScaledVector(inDir, -17.4);
    beamIn.set([src.x, src.y, src.z, c.x, c.y, c.z]);
    // leaving beam, dimming as the reflected share grows; none past the critical angle
    if (!tir) { const a = out * DEG, e = at(a, 1, RS - 0.2); beamOut.set([c.x, c.y, c.z, e.x, e.y, e.z]); beamOut.material.opacity = Math.max(0.05, T); spot(spotOut, a, 1, T); }
    else { beamOut.set([]); spotOut.visible = false; }
    // reflected beam: mirror of the incoming one, back through the curved side
    const bEnd = c.clone().add(V(-Math.cos(th) * (RS - 0.2), 0, -Math.sin(th) * (RS - 0.2)));
    beamBack.set([c.x, c.y, c.z, bEnd.x, bEnd.y, bEnd.z]); beamBack.material.opacity = Math.max(0.08, R);
    spotBack.position.copy(bEnd); spotBack.lookAt(c.x, bEnd.y, c.z); spotBack.material.color.setRGB(6 * R, 0.5 * R, 0.3 * R);
    // the normal (dashed) and the angle arcs
    const g2 = []; for (let x = -16; x < 16; x += 2) g2.push(c.x + x, c.y, c.z, c.x + x + 1.1, c.y, c.z);
    guides.set(g2);
    arcs.set([...arc(0, th, -1, 6, 1), ...(tir ? [] : arc(0, out * DEG, 1, 8, -1))]);
    const k0 = c.clone().add(V(-Math.cos(crit * DEG) * 10.8, -c.y + y0 + 0.1, Math.sin(crit * DEG) * 10.8)), k1 = c.clone().add(V(-Math.cos(crit * DEG) * 31, -c.y + y0 + 0.1, Math.sin(crit * DEG) * 31));
    critLine.set([k0.x, k0.y, k0.z, k1.x, k1.y, k1.z]);
    strip.select(MATERIALS.findIndex(([, n]) => n === s.press.n.cur));
    slider.set(35 + (s.p.theta / 90) * 90);
  }

  return {
    update,
    labels: {
      laser: { text: 'Laser', at: (s) => armEnd(s.p.theta).map((v, i) => (i === 1 ? v + 6 : v)) },
      normal: { text: 'Normal', at: [c.x - 17, c.y + 0.6, c.z] },
      theta1: { text: 'θ in', sub: (s) => deg(s.p.theta), at: (s) => [c.x - Math.cos((s.p.theta / 2) * DEG) * 7.5, c.y + 0.5, c.z + Math.sin((s.p.theta / 2) * DEG) * 7.5] },
      theta2: { text: 'θ out', sub: (s) => (s.d.tir ? 'none' : deg(s.d.out)), at: (s) => [c.x + Math.cos(((s.d.out ?? 90) / 2) * DEG) * 10, c.y + 0.5, c.z - Math.sin(((s.d.out ?? 90) / 2) * DEG) * 10] },
      crit: { text: 'Critical', sub: (s) => deg(s.d.crit), at: (s) => [c.x - Math.cos(s.d.crit * DEG) * 31.5, y0 + 1, c.z + Math.sin(s.d.crit * DEG) * 31.5] },
      screen: { text: 'Screen', at: [c.x + RS * 0.72, y0 + 8, c.z - RS * 0.69] },
      flat: { text: 'Flat face', at: [c.x, y0 + HB + 1.5, c.z - 7] },
    },
  };
}
