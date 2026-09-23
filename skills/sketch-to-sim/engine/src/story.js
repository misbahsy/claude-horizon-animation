// The film for any machine: the story's chapters laid out on a timeline, and
// every visible thing as a pure function of time so any frame renders exactly.
//
// Chapters (see references/story.md): READ and LIFT are automatic; a chapter
// with `run` plays a baked physics run; TWEAK rewinds a run and slides parts to
// new parameter values; REPLAY plays part of a run slowly from another camera;
// DONE brings the card back. Times inside chapters are seconds from its start.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { normalize, paramValues } from './spec.js';
import { poseAt, speedAt } from './physics.js';
import { poseMachine, setPaper, syncOutlines, showMachine } from './model.js';

export const T0 = 3.2;          // the intro before "Play the tour"
const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ramp = (t, a, b) => clamp((t - a) / (b - a));
const ease = (x) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;
const LEAD = 0.6;               // a beat of stillness before each run starts

// ---------------------------------------------------------------- timeline

export function layout(machine, bakes) {
  const read = machine.read || [], dims = machine.dims || [];
  const out = []; let t = 0;
  for (const ch of machine.story) {
    let dur = ch.dur;
    const name = ch.name || ch.chapter;
    if (ch.chapter === 'READ') dur ??= 1.2 + read.length * 0.72 + 1.6 + dims.length * 0.35 + 1.4;
    else if (ch.chapter === 'LIFT') dur ??= 8.5;
    else if (ch.run) dur ??= Math.min(bakes[name].duration + LEAD + 1.6, 10);
    else if (ch.chapter === 'TWEAK') dur ??= 4.8;
    else if (ch.chapter === 'REPLAY') dur ??= (ch.to - ch.from) / (ch.speed ?? 0.25) + 0.8;
    else if (ch.chapter === 'DONE') dur ??= 1.6;
    out.push({ ...ch, name, start: t, dur });
    t += dur;
  }
  return { chapters: out, length: t };
}

// Where the READ chapter writes each label, highlights, inks and dims.
function readSchedule(machine) {
  const items = (machine.read || []).map((it, i) => ({ ...it, s: 1.0 + i * 0.72 }));
  const inkEnd = items.length ? items[items.length - 1].s + 1.6 : 1;
  return { items, dimsAt: inkEnd + 0.2, pencilFade: [inkEnd - 0.8, inkEnd + 0.8] };
}

// ------------------------------------------------------------------ camera

export function shotFor(machine, norm, W, spec = {}, S = null) {
  const b = norm.bounds, width = b.x1 - b.x0, [ox, oy, oz] = W.origin;
  let tx, ty;
  if (typeof spec.target === 'string' && S) { const p = S(spec.target.replace('body:', '')); tx = p[0]; ty = p[1]; }
  else if (Array.isArray(spec.target)) [tx, ty] = spec.target;
  else { tx = (b.x0 + b.x1) / 2; ty = b.y1 * 0.42; }
  const dist = spec.dist ?? width * 1.3, yaw = ((spec.yaw ?? -12) * Math.PI) / 180, pitch = ((spec.pitch ?? 13) * Math.PI) / 180;
  const q = new THREE.Vector3(ox + tx, oy + ty, oz);
  const p = q.clone().add(new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)).multiplyScalar(dist));
  return { p, q, fov: spec.fov ?? 32 };
}

function topShot(machine, zoom = 1) {
  const P = machine.paper;
  return { p: new THREE.Vector3(0, 1.3 * P.w * zoom, 0.075 * P.h / 0.594), q: new THREE.Vector3(0, 0, -0.012 * P.h / 0.594 * zoom), fov: 35 };
}

function cameraPath(keys) {
  return (T) => {
    let a = 0; for (let i = 0; i < keys.length; i++) if (keys[i].T <= T) a = i;
    let s = a; while (s > 0 && !keys[s].cut) s--;
    let e = a; while (e < keys.length - 1 && !keys[e + 1].cut) e++;
    const shot = keys.slice(s, e + 1);
    let i = shot.findIndex((k, j) => j === shot.length - 1 || (shot[j + 1].T > T && k.T <= T)); if (i < 0) i = 0;
    const k1 = shot[i], k2 = shot[Math.min(i + 1, shot.length - 1)], k0 = shot[Math.max(i - 1, 0)], k3 = shot[Math.min(i + 2, shot.length - 1)];
    const u = k2.T > k1.T ? smooth(clamp((T - k1.T) / (k2.T - k1.T))) : 0;
    const cr = (p0, p1, p2, p3) => { const t2 = u * u, t3 = t2 * u; return new THREE.Vector3().addScaledVector(p0, -0.5 * t3 + t2 - 0.5 * u).addScaledVector(p1, 1.5 * t3 - 2.5 * t2 + 1).addScaledVector(p2, -1.5 * t3 + 2 * t2 + 0.5 * u).addScaledVector(p3, 0.5 * t3 - 0.5 * t2); };
    return { p: cr(k0.s.p, k1.s.p, k2.s.p, k3.s.p), q: cr(k0.s.q, k1.s.q, k2.s.q, k3.s.q), fov: lerp(k1.s.fov, k2.s.fov, u) };
  };
}

// ------------------------------------------------------------------- story

export function createStory(ctx) {
  const { machine, scene, camera, W, paper, bakes, ui, lineRes, RAPIER } = ctx;
  const { chapters, length } = layout(machine, bakes);
  const TOUR_LEN = length;
  const byName = Object.fromEntries(chapters.map((c) => [c.name, c]));
  const runs = chapters.filter((c) => c.run);
  // the drawing (and the model as it lifts) shows READ's parameters if it has
  // any, else the first run's
  const firstParams = paramValues(machine, chapters.find((c) => c.chapter === 'READ')?.params || runs[0]?.run || {});
  const normCache = new Map();
  const normAt = (params) => { const k = JSON.stringify(params); if (!normCache.has(k)) normCache.set(k, normalize(machine, params)); return normCache.get(k); };
  const norm0 = normAt(firstParams);
  const R = readSchedule(machine);
  const groupOrder = [...new Set([...(machine.read || []).map((r) => r.group), ...W.groupsInOrder])].filter((g) => W.groupsInOrder.includes(g));

  // world position of a body at a time in a bake (or at rest)
  const toWorld = ([x, y]) => new THREE.Vector3(W.origin[0] + x, W.origin[1] + y, W.origin[2]);
  // 'body:id' follows a body's origin; 'part:id' follows one part of a rigid body
  const bodyPos = (bake, ref, t, norm) => {
    const n = norm || norm0, isPart = ref.startsWith('part:'), key = ref.replace(/^(body|part):/, '');
    const part = isPart ? n.parts.find((q) => q.id === key) : null, id = part ? part.rigid : key;
    const b = n.bodies.find((q) => q.id === id);
    const f = bake ? poseAt(bake, id, t) : null;
    const pos = f ? [f[0] - W.origin[0], f[1] - W.origin[1]] : b ? b.at : [0, 0];
    const ang = f ? 2 * Math.atan2(f[5], f[6]) : b ? b.angle : 0;
    if (!part || !b) return toWorld(pos);
    const dx = part.at[0] - b.at[0], dy = part.at[1] - b.at[1], c0 = Math.cos(-b.angle), s0 = Math.sin(-b.angle);
    const lx = dx * c0 - dy * s0, ly = dx * s0 + dy * c0, c1 = Math.cos(ang), s1 = Math.sin(ang);
    return toWorld([pos[0] + lx * c1 - ly * s1, pos[1] + lx * s1 + ly * c1]);
  };

  // camera keys
  const hero = shotFor(machine, norm0, W, machine.camera?.hero);
  const K = [];
  const key = (T, s, cut = false) => K.push({ T, s, cut });
  key(-T0, topShot(machine, 1.0)); key(0, topShot(machine, 0.99));
  for (const c of chapters) {
    const at = (spec) => (spec ? shotFor(machine, c.run ? normAt(paramValues(machine, c.run)) : norm0, W, spec) : null);
    if (c.chapter === 'READ') { key(c.start + c.dur * 0.45, topShot(machine, 0.9)); key(c.start + c.dur, topShot(machine, 0.87)); }
    else if (c.chapter === 'LIFT') {
      const mid = { p: new THREE.Vector3(0, 0.62 * machine.paper.w, 0.75 * machine.paper.w), q: new THREE.Vector3(0, 0.03, -0.03), fov: 34 };
      key(c.start + 2.6, mid); key(c.start + 5.4, at(c.camera) || shotFor(machine, norm0, W, { ...machine.camera?.hero, dist: (machine.camera?.hero?.dist ?? (norm0.bounds.x1 - norm0.bounds.x0) * 1.3) * 1.12 }));
      key(c.start + c.dur, hero);
    } else if (c.run) { key(c.start + 0.3, at(c.camera) || hero); key(c.start + c.dur, at(c.cameraEnd) || at(c.camera) || hero); }
    else if (c.chapter === 'TWEAK') { const s = at(c.camera) || shotFor(machine, norm0, W, { ...machine.camera?.hero, pitch: 20 }); key(c.start + 1.2, s); key(c.start + c.dur, s); }
    else if (c.chapter === 'REPLAY') { const s = at(c.camera) || shotFor(machine, norm0, W, { dist: (norm0.bounds.x1 - norm0.bounds.x0) * 0.9, yaw: -24, pitch: 4, fov: 36 }); key(c.start, s, true); const e = at(c.cameraEnd) || { ...s, p: s.p.clone().add(new THREE.Vector3(0.05, 0, 0.02)) }; key(c.start + c.dur, e); }
    else if (c.chapter === 'DONE') { const s = at(c.camera) || shotFor(machine, norm0, W, { ...machine.camera?.hero, dist: (norm0.bounds.x1 - norm0.bounds.x0) * 0.75, yaw: 28, pitch: 24 }); key(c.start, s, true); key(c.start + c.dur + 4, { ...s, p: s.p.clone().add(new THREE.Vector3(-0.03, -0.01, 0.02)) }); }
  }
  const cam = cameraPath(K);

  // trails (dashed paths of chosen bodies during runs)
  const trails = [];
  for (const c of chapters.filter((x) => x.run && x.trails)) for (const id of c.trails) {
    const b = bakes[c.name], pts = [];
    for (let i = 0; i < b.frames.length; i += 3) { const f = poseAt(b, id, i / b.hz); pts.push(new THREE.Vector3(f[0], f[1], f[2])); }
    const g = new LineGeometry(); g.setPositions(pts.flatMap((v) => [v.x, v.y, v.z]));
    const m = new LineMaterial({ color: 0x3b3e52, linewidth: 1.5, dashed: true, dashSize: 0.009, gapSize: 0.007, transparent: true, depthWrite: false });
    m.resolution.copy(lineRes);
    const l = new Line2(g, m); l.computeLineDistances(); l.visible = false; l.renderOrder = 3; scene.add(l);
    trails.push({ c, id, l, n: pts.length - 1, step: 3 / b.hz });
  }

  // a chapter-relative time spec: number, 'start', 'end' or 'trigger:id[+delay]'
  const timeOf = (c, at, bake) => {
    if (typeof at === 'number') return at;
    if (at === 'start') return 0; if (at === 'end') return c.dur;
    const m = /^trigger:([\w-]+)([+-][\d.]+)?$/.exec(at || '');
    if (m && bake) { const tt = bake.triggers[m[1]]; return tt == null ? Infinity : (c.chapter === 'REPLAY' ? (tt - c.from) / (c.speed ?? 0.25) : tt + LEAD) + Number(m[2] || 0); }
    return 0;
  };
  // {speed:body@trigger} or {speed:body@trigger-0.12}: a body's speed at (or near) a trigger
  const fill = (text, bake) => String(text).replace(/\{speed:([\w-]+)@([\w-]+?)([+-][\d.]+)?\}/g, (_, id, tr, off) => (bake && bake.triggers[tr] != null ? speedAt(bake, id, bake.triggers[tr] + Number(off || -0.01)).toFixed(2) : '?'));

  function frameAt(t) {
    const T = t - T0;
    ui.begin();
    const c = chapters.find((x) => T >= x.start && T < x.start + x.dur) || (T < 0 ? null : chapters[chapters.length - 1]);
    const u = c ? T - c.start : 0;

    // camera
    const s = cam(T);
    camera.position.copy(s.p); camera.lookAt(s.q); camera.fov = s.fov; camera.updateProjectionMatrix(); camera.updateMatrixWorld();

    // paper
    const read = byName.READ, lift = byName.LIFT;
    const Tr = read ? T - read.start : -1, lifted = lift ? T >= lift.start : true;
    const hl = {}, ink = {};
    for (const it of R.items) {
      const st = ramp(Tr, it.s, it.s + 0.25) * (1 - ramp(Tr, it.s + 1.3, it.s + 1.9));
      const lb = ramp(Tr, it.s + 0.1, it.s + 0.6), la = 1 - ramp(Tr, it.s + 1.6, it.s + 2.3);
      if (st > 0 || (lb > 0 && la > 0)) hl[it.group] = { stroke: +st.toFixed(3), label: +lb.toFixed(3), labelAlpha: +la.toFixed(3) };
      if (it.group !== 'path') { const p = ramp(Tr, it.s + 0.9, it.s + 1.6); if (p > 0) ink[it.group] = +p.toFixed(3); }
    }
    if (!lifted && Tr > R.dimsAt) for (const g of Object.keys(paper.groups)) if (g !== 'ground' && !ink[g]) ink[g] = +ramp(Tr, R.dimsAt - 0.8, R.dimsAt).toFixed(3);
    const dimsP = (machine.dims || []).map((_, i) => +(ramp(Tr, R.dimsAt + i * 0.35, R.dimsAt + 0.8 + i * 0.35) * (1 - ramp(T, lift ? lift.start - 0.3 : 1e9, lift ? lift.start + 0.1 : 1e9))).toFixed(3));
    paper.draw({ pencil: +lerp(1, 0.5, ramp(Tr, R.pencilFade[0], R.pencilFade[1])).toFixed(3), ink: lifted ? {} : ink, hl: lifted ? {} : hl, dims: dimsP });

    // machine
    showMachine(W, lifted);
    const Tl = lift ? T - lift.start : 99;
    const depth = lerp(0.03, 1, ease(ramp(Tl, 2.6, 4.2)));
    groupOrder.forEach((g, k) => setPaper(W, g, 1 - smooth(ramp(Tl, 4.6 + k * 0.32, 5.2 + k * 0.32))));
    let rest = norm0, bake = null, tb = 0, liftSpec = null;
    if (Tl < 4.3) {
      const ids = [...W.bodies.keys()], order = (id) => { const b = W.bodies.get(id).body; return groupOrder.indexOf(b.parts[0].group) * 1000 + b.at[0] * 100; };
      const sorted = ids.slice().sort((a, b) => order(a) - order(b));
      liftSpec = { depth, angle: (id) => { const k = sorted.indexOf(id), s0 = 0.3 + (k / Math.max(1, sorted.length - 1)) * 1.9; return -Math.PI / 2 * (1 - ease(ramp(Tl, s0, s0 + 0.9))); } };
      if (Tl >= 2.6) liftSpec = { depth, angle: () => 0 };
    }
    let rewind = 0;
    if (c && c.run) { bake = bakes[c.name]; rest = normAt(bake.params); tb = Math.max(0, u - LEAD); }
    else if (c && c.chapter === 'TWEAK') {
      const from = paramValues(machine, c.from), to = paramValues(machine, c.to), prev = bakes[c.rewind || runs.filter((r) => r.start < c.start).pop()?.name];
      if (prev && u < 1.5) { bake = prev; rest = normAt(prev.params); tb = lerp(prev.duration, 0, ease(ramp(u, 0.1, 1.4))); rewind = 1 - ramp(u, 1.3, 1.5); }
      else { const e = ease(ramp(u, 1.7, 3.1)); const p = {}; for (const k of Object.keys(from)) p[k] = +lerp(from[k], to[k], e).toFixed(5); rest = normalize(machine, p); }
    } else if (c && c.chapter === 'REPLAY') { bake = bakes[c.of]; rest = normAt(bake.params); tb = c.from + u * (c.speed ?? 0.25); }
    else if (c && c.chapter === 'DONE') { const last = runs[runs.length - 1]; bake = bakes[last.name]; rest = normAt(bake.params); tb = bake.duration; }
    else if (c && T >= (runs[0]?.start ?? 1e9)) { const prevRun = runs.filter((r) => r.start <= T).pop(); if (prevRun) { bake = bakes[prevRun.name]; rest = normAt(bake.params); tb = bake.duration; } }
    poseMachine(W, { rest, lift: liftSpec, bake, t: tb });
    syncOutlines(W, true);
    scene.updateMatrixWorld();

    // trails
    for (const tr of trails) {
      let vis = 0, p = 0;
      if (c === tr.c) { vis = 1; p = tb / (tr.n * tr.step); }
      else if (c && c.chapter === 'REPLAY' && c.of === tr.c.name) { vis = 1; p = tb / (tr.n * tr.step); }
      tr.l.visible = vis > 0 && p > 0; tr.l.geometry.instanceCount = Math.max(1, Math.round(tr.n * clamp(p)));
    }

    // notes
    for (const ch of chapters) {
      if (!ch.notes || ch !== c) continue;
      const b = ch.run ? bakes[ch.name] : ch.chapter === 'REPLAY' ? bakes[ch.of] : null;
      ch.notes.forEach((n, i) => {
        const t0 = timeOf(ch, n.at ?? 0, b), t1 = n.until != null ? timeOf(ch, n.until, b) : ch.dur - 0.3;
        if (u < t0 || u > t1 + 0.3) return;
        const a = ramp(u, t0, t0 + 0.2) * (1 - ramp(u, t1, t1 + 0.3)), write = ramp(u, t0, t0 + 0.5);
        const pos = typeof n.anchor === 'string' ? bodyPos(b, n.anchor.includes(':') ? n.anchor : `body:${n.anchor}`, ch.chapter === 'REPLAY' ? tb : b ? Math.max(0, u - LEAD) : 0, rest) : toWorld(n.anchor || [0, 0]);
        const id = `${ch.name}:${i}`, text = typeof n.text === 'function' ? fill(n.text(rest, u, b), b) : fill(n.text ?? '', b);
        if (n.kind === 'tag') ui.tag(id, text, pos, n.offset || [60, -30], a);
        else if (n.kind === 'cross') ui.cross(id, pos, a);
        else if (n.kind === 'ring') ui.ring(id, pos, a, n.blue);
        else if (n.kind === 'arrow') { ui.arrow(id, pos, n.offset || [-150, -100], a); if (text) ui.note(id + ':t', text, pos, [(n.offset || [-150, -100])[0], (n.offset || [-150, -100])[1] - 20], write, a); }
        else if (n.kind === 'dim') {
          const from = typeof n.from === 'function' ? n.from(rest) : n.from, to = typeof n.to === 'function' ? n.to(rest) : n.to;
          ui.dim(id, toWorld(from), toWorld(to), typeof n.text === 'function' ? n.text(rest, u) : text, a);
        } else ui.note(id, text, pos, n.offset || [0, -40], write, a, n.blue);
      });
    }

    // interface
    const cardEnd = byName.DONE ? ramp(T, byName.DONE.start + 0.3, byName.DONE.start + 0.7) * (1 - ramp(T, TOUR_LEN + 0.8, TOUR_LEN + 1.0)) : 0;
    ui.card(Math.max(1 - ramp(t, T0 - 0.05, T0 + 0.25), cardEnd), byName.DONE && T >= byName.DONE.start + 0.3 ? 'Play again' : 'Play the tour', t > 2.75 && t < 2.95, T > TOUR_LEN + 0.55 && T < TOUR_LEN + 0.8);
    ui.bar(ramp(t, T0 + 0.1, T0 + 0.5) * (1 - ramp(T, (byName.DONE?.start ?? TOUR_LEN), (byName.DONE?.start ?? TOUR_LEN) + 0.3)), T, c ? c.label || c.chapter : 'SKETCH');
    const isReplay = c && c.chapter === 'REPLAY';
    ui.grade(isReplay ? ramp(u, 0, 0.3) * (1 - ramp(u, c.dur - 0.3, c.dur)) : 0);
    ui.badge(isReplay ? 1 : rewind > 0 ? rewind : 0, isReplay ? `${c.speed ?? 0.25}×` : 'rewind');
    ui.cursor(t, T, TOUR_LEN);
    ui.end();
  }

  return { frameAt, chapters, TOUR_LEN, bakes, normAt, readSchedule: R, groupOrder };
}
