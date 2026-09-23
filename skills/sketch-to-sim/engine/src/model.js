// The 3D scene for any machine: desk, wall, paper, pencil and eraser, and a
// mesh per part. Every part carries a "paper" blend (1 = white cut-out with
// ink outlines, 0 = finished material) so LIFT can turn the drawing into a
// model group by group. Rigid bodies are posed by one matrix each: a pop-up
// rotation about the ground line for LIFT, or a physics pose while running.

import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { deskTexture, pineTexture, basswoodTexture, oakTexture, walnutTexture, wallTexture } from './textures.js';
import { poseAt } from './physics.js';

const PAPER_RGB = new THREE.Color(0.955, 0.95, 0.935);

function paperMix(params) {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.paper = { value: 1 };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uPaper = m.userData.paper;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uPaper;')
      .replace('#include <color_fragment>', `#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(${PAPER_RGB.r}, ${PAPER_RGB.g}, ${PAPER_RGB.b}), uPaper);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = mix(roughnessFactor, 0.93, uPaper);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n metalnessFactor = mix(metalnessFactor, 0.0, uPaper);');
  };
  m.customProgramCacheKey = () => 'paperMix';
  return m;
}

// The material library. A part may also name "color:#rrggbb".
function materialParams(name, tex) {
  const lib = {
    pine: { map: tex.pine, roughness: 0.62 },
    basswood: { map: tex.bass, roughness: 0.7 },
    oak: { map: tex.oak, roughness: 0.6 },
    walnut: { map: tex.walnut, roughness: 0.55 },
    steel: { color: 0xd0d3d8, metalness: 1, roughness: 0.16, envMapIntensity: 2.2 },
    iron: { color: 0x24262b, metalness: 0.35, roughness: 0.55 },
    brass: { color: 0xe6be66, metalness: 0.85, roughness: 0.32, envMapIntensity: 2.6 },
    copper: { color: 0xd08a5a, metalness: 0.85, roughness: 0.32, envMapIntensity: 2.4 },
    rubber: { color: 0x2c2c2e, roughness: 0.85 },
    felt: { color: 0x7a2e2a, roughness: 0.95 },
    cork: { color: 0xb8875a, roughness: 0.9 },
    paper: { color: 0xf2f0ea, roughness: 0.9 },
    glass: { color: 0xdde8ec, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.55 },
  };
  if (name.startsWith('color:')) return { color: new THREE.Color(name.slice(6)), roughness: 0.6 };
  return lib[name] || lib.pine;
}

function geometryOf(p) {
  if (p.shape === 'ball') return new THREE.SphereGeometry(p.r, 40, 24);
  if (p.shape === 'cyl') { const g = new THREE.CylinderGeometry(p.r, p.r, p.d, 40); g.rotateX(Math.PI / 2); return g; }
  if (p.shape === 'box') {
    const [w, h, d] = p.size, m = Math.min(w, h, d);
    return m > 0.005 ? new RoundedBoxGeometry(w, h, d, 2, Math.min(0.0016, m * 0.18)) : new THREE.BoxGeometry(w, h, d);
  }
  const s = new THREE.Shape(p.pts.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth: p.d, bevelEnabled: false, curveSegments: 12 });
  g.translate(0, 0, -p.d / 2);
  return g;
}

function outline(mesh) {
  const g = new LineSegmentsGeometry().fromEdgesGeometry(new THREE.EdgesGeometry(mesh.geometry, 30));
  const mat = new LineMaterial({ color: 0x1b1b1d, linewidth: 1.7, transparent: true, opacity: 1, depthWrite: false });
  const l = new LineSegments2(g, mat); l.renderOrder = 2; mesh.add(l); mesh.userData.outline = l;
}

export function buildScene(scene, machine, norm, paperTexture) {
  const P = machine.paper;
  const origin = [P.origin[0] - P.w / 2, 0, P.origin[1] - P.h / 2];   // world position of machine (0, 0)
  const tex = { pine: pineTexture(), bass: basswoodTexture(), oak: oakTexture(), walnut: walnutTexture() };

  // desk, wall, paper
  const deskW = Math.max(2.6, P.w * 3), deskD = Math.max(1.3, P.h * 2.2);
  const desk = new THREE.Mesh(new THREE.BoxGeometry(deskW, 0.04, deskD), new THREE.MeshStandardMaterial({ map: deskTexture(), roughness: 0.58 }));
  desk.position.set(0.1, -0.0205, P.h / 2 - deskD / 2 + 0.35); desk.receiveShadow = true; scene.add(desk);
  const wallZ = desk.position.z - deskD / 2;
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(deskW * 1.6, 2.4), new THREE.MeshStandardMaterial({ map: wallTexture(), roughness: 0.95 }));
  wall.position.set(0.1, 1.1, wallZ); wall.receiveShadow = true; scene.add(wall);
  const paper = new THREE.Mesh(new THREE.PlaneGeometry(P.w, P.h), new THREE.MeshStandardMaterial({ map: paperTexture, roughness: 0.9 }));
  paper.rotation.x = -Math.PI / 2; paper.position.y = 0.0003; paper.receiveShadow = true; scene.add(paper);

  // pencil and eraser, left near the sheet's top edge
  const pencil = new THREE.Group();
  const add = (g, m, f) => { const o = new THREE.Mesh(g, new THREE.MeshStandardMaterial(m)); f(o); o.castShadow = true; pencil.add(o); };
  add(new THREE.CylinderGeometry(0.0037, 0.0037, 0.160, 6), { color: 0xd8a868, roughness: 0.6 }, (o) => { o.rotation.z = Math.PI / 2; });
  add(new THREE.ConeGeometry(0.0037, 0.018, 6), { color: 0xe8c79a, roughness: 0.7 }, (o) => { o.rotation.z = Math.PI / 2; o.position.x = -0.089; });
  add(new THREE.ConeGeometry(0.0012, 0.006, 8), { color: 0x2a2a2e, roughness: 0.4, metalness: 0.3 }, (o) => { o.rotation.z = Math.PI / 2; o.position.x = -0.0995; });
  pencil.position.set(P.w * 0.03, 0.0037, -P.h / 2 + 0.055); pencil.rotation.y = 0.07; scene.add(pencil);
  const eraser = new THREE.Group();
  const eb = new THREE.Mesh(new RoundedBoxGeometry(0.050, 0.011, 0.020, 2, 0.002), new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.8 }));
  const sl = new THREE.Mesh(new THREE.BoxGeometry(0.022, 0.0125, 0.0215), new THREE.MeshStandardMaterial({ color: 0x1f47a8, roughness: 0.5 }));
  sl.position.x = 0.004; eraser.add(eb, sl); eraser.traverse((o) => (o.castShadow = true));
  eraser.position.set(P.w * 0.33, 0.0055, -P.h / 2 + 0.062); eraser.rotation.y = -0.35; scene.add(eraser);

  // the machine: one group per rigid body, one mesh per part
  const mats = new Map();       // group -> [materials]
  const matFor = (p) => {
    const key = `${p.group}|${p.material}`;
    if (!mats.has(key)) { const m = paperMix(materialParams(p.material, tex)); m.userData.group = p.group; mats.set(key, m); }
    return mats.get(key);
  };
  const bodies = new Map();
  for (const b of norm.bodies) {
    const g = new THREE.Group(); g.matrixAutoUpdate = false; scene.add(g);
    for (const p of b.parts) {
      const mesh = new THREE.Mesh(geometryOf(p), matFor(p));
      const c = Math.cos(-b.angle), s = Math.sin(-b.angle), dx = p.at[0] - b.at[0], dy = p.at[1] - b.at[1];
      mesh.position.set(dx * c - dy * s, dx * s + dy * c, p.z || 0);
      mesh.rotation.z = p.angle - b.angle;
      mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.part = p;
      outline(mesh); g.add(mesh);
    }
    bodies.set(b.id, { group: g, body: b });
  }
  const groupsInOrder = [...new Set(norm.parts.map((p) => p.group))];
  return { origin, bodies, mats, groupsInOrder, paper, pencil, eraser, desk, wall };
}

const _M = new THREE.Matrix4(), _R = new THREE.Matrix4(), _S = new THREE.Matrix4(), _T = new THREE.Matrix4(), _Z = new THREE.Matrix4();
const _p = new THREE.Vector3(), _q = new THREE.Quaternion(), _one = new THREE.Vector3(1, 1, 1);

// Pose every body. rest: a normalized machine (placement for fixed bodies and
// for dynamic bodies that are not being simulated). lift: {angle(bodyId), depth}
// or null for standing. bake + t: physics poses for dynamic bodies.
export function poseMachine(W, { rest, lift = null, bake = null, t = 0 }) {
  const [ox, oy, oz] = W.origin;
  const restById = new Map(rest.bodies.map((b) => [b.id, b]));
  for (const [id, e] of W.bodies) {
    const g = e.group, r = restById.get(id) || e.body;
    const f = bake && e.body.type === 'dynamic' ? poseAt(bake, id, t) : null;
    if (f && !lift) {
      _p.set(f[0], f[1], f[2]); _q.set(f[3], f[4], f[5], f[6]);
      g.matrix.compose(_p, _q, _one);
    } else {
      const a = lift ? lift.angle(id) : 0, depth = lift ? lift.depth : 1;
      _M.makeTranslation(ox, oy + (lift ? 0.0006 : 0), oz); _R.makeRotationX(a); _S.makeScale(1, 1, depth);
      _T.makeTranslation(r.at[0], r.at[1], 0); _Z.makeRotationZ(r.angle);
      g.matrix.copy(_M).multiply(_R).multiply(_S).multiply(_T).multiply(_Z);
    }
    g.matrixWorldNeedsUpdate = true;
  }
}

// Paper blend for a group, with its ink outlines following.
export function setPaper(W, group, v) {
  for (const m of W.mats.values()) if (group == null || m.userData.group === group) m.userData.paper.value = v;
}
export function syncOutlines(W, visible = true) {
  for (const e of W.bodies.values()) e.group.traverse((o) => {
    if (!o.userData.outline) return;
    const p = o.material.userData.paper.value;
    o.userData.outline.material.opacity = Math.min(1, p * 1.4);
    o.userData.outline.visible = visible && p > 0.02;
  });
}
export function showMachine(W, v) { for (const e of W.bodies.values()) e.group.visible = v; }
