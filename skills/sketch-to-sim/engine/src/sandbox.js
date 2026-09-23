// "Build it yourself" for any machine: a live sandbox with the machine's own
// parameters as sliders, and a scripted session of the same sandbox baked
// frame by frame for the film.

import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { Run, HZ, poseAt } from './physics.js';
import { paramValues, normalize } from './spec.js';
import { poseMachine, setPaper, syncOutlines, showMachine } from './model.js';
import { shotFor } from './story.js';

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const smooth = (x) => x * x * (3 - 2 * x);
const lerp = (a, b, t) => a + (b - a) * t;

// A sandbox run: the physics Run plus trails and the machine's stats.
export class Live {
  constructor(RAPIER, machine, params, origin) {
    this.R = RAPIER; this.m = machine; this.origin = origin; this.trails = [];
    this.reset(params);
  }
  reset(params = this.params) {
    if (this.run) this.run.free();
    this.params = paramValues(this.m, params);
    this.run = new Run(this.R, this.m, this.params, this.origin);
    this.running = false; this.k = 0;
  }
  clearTrails() { this.trails = []; }
  setParams(params) { this.reset({ ...this.params, ...params }); }
  start() {
    if (this.running) this.reset(this.params);
    this.run.start(); this.running = true;
    this.cur = (this.m.sandbox?.trails || []).map((id) => ({ id, pts: [] })); this.trails.push(...this.cur);
  }
  step(dt) {
    if (!this.running) return;
    const n = Math.max(1, Math.round(dt * HZ));
    for (let i = 0; i < n; i++) {
      this.run.step(); this.k++;
      if (this.k % 3 === 0) for (const tr of this.cur) if (tr.pts.length < 900) { const p = this.run.pose(tr.id); tr.pts.push([p[0], p[1], p[2]]); }
    }
  }
  stats() {
    const S = this.run.S, fired = this.run.fired, order = (this.m.triggers || []).map((t) => t.id);
    const info = { S, fired, at: this.run.snaps, t: this.run.t, running: this.running, params: this.params, steps: order.filter((id) => fired[id] != null).length, total: order.length };
    return (this.m.sandbox?.stats || []).map((s) => ({ label: s.label, unit: s.unit || '', value: this.running || s.always ? s.value(info) : '—' }));
  }
  poses() { return this.run.W.dynamic.map((id) => this.run.pose(id)); }
}

// ------------------------------------------------------------ baked session

// Run the machine's sandbox script and record one snapshot per frame.
// Script steps: { t, do: 'run' | 'reset' | 'param' | 'slowmo' | 'trails' | 'sketch' | 'view' | 'hint', ... }
export function bakeSession(RAPIER, machine, origin, fps = 60) {
  const sb = machine.sandbox || {}, script = sb.script || [], len = sb.length ?? (script.length ? script[script.length - 1].t + 1.5 : 0);
  const live = new Live(RAPIER, machine, sb.params || {}, origin);
  const frames = [], events = [];
  let slow = false, trailsOn = true, sketch = 0, view = 'hero', prevView = 'hero', viewAt = -9, hint = null;
  const done = new Set(), n = Math.round(len * fps);
  let drag = null;
  for (let i = 0; i <= n; i++) {
    const t = i / fps;
    script.forEach((s, k) => {
      const active = t >= s.t && (s.dur ? t <= s.t + s.dur + 1 / fps : !done.has(k));
      if (!active) return;
      const u = s.dur ? clamp((t - s.t) / s.dur) : 1, e = smooth(u);
      if (s.do === 'param') {
        const from = s.from ?? live.params[s.id], v = +lerp(from, s.to, e).toFixed(6);
        drag = { ...(drag || {}), [s.id]: v };
        if (u >= 1) { live.setParams(drag); drag = null; }
      } else if (s.do === 'sketch') sketch = lerp(s.from ?? sketch, s.to, e);
      else if (s.do === 'run') { const before = live.run.events.length; live.start(); void before; }
      else if (s.do === 'reset') { live.reset(live.params); if (s.clear !== false) live.clearTrails(); }
      else if (s.do === 'slowmo') slow = s.on;
      else if (s.do === 'trails') trailsOn = s.on;
      else if (s.do === 'view') { prevView = view; view = s.view; viewAt = t; }
      else if (s.do === 'hint') hint = s.text ? { text: s.text, from: t, until: s.until ?? t + 3 } : null;
      if (!s.dur) done.add(k);
    });
    const shownParams = drag ? { ...live.params, ...drag } : live.params;
    frames.push({
      t, params: shownParams, dragging: !!drag, running: live.running,
      poses: drag ? null : live.poses(), ids: live.run.W.dynamic.slice(),
      trails: live.trails.map((tr) => tr.pts.length), stats: live.stats(), slow, trailsOn, sketch, view, prevView, viewAt, hint,
    });
    const before = live.run.events.length;
    live.step((slow ? 0.25 : 1) / fps);
    for (const e of live.run.events.slice(before)) events.push({ ...e, t, slow });
  }
  const trails = live.trails.map((tr) => tr.pts.slice());
  live.run.free();
  return { frames, trails, fps, events, length: len, script };
}

// ------------------------------------------------------------------- view

export function createSandboxView({ machine, scene, camera, W, lineRes, ui, normAt }) {
  const $ = (id) => document.getElementById(id);
  const panel = $('panel'), hint = $('hint'), params = machine.params || {};
  const statsEl = $('stats'), paramsEl = $('params');
  const statCells = (machine.sandbox?.stats || []).map((s) => {
    const d = document.createElement('div'); d.innerHTML = `<b>—</b><i>${s.unit || ''}</i><label>${s.label}</label>`; statsEl.appendChild(d); return d.querySelector('b');
  });
  statsEl.style.gridTemplateColumns = `repeat(${Math.max(1, statCells.length)}, 1fr)`;
  const sliders = {};
  for (const [id, p] of Object.entries(params)) {
    const sec = document.createElement('div'); sec.className = 'sec';
    sec.innerHTML = `<div class="row">${p.label || id.toUpperCase()} <span></span></div><div class="slider" data-param="${id}"><div class="tr"></div><div class="fl"></div><div class="th"></div></div>${p.ends ? `<div class="ends"><span>${p.ends[0]}</span><span>${p.ends[1]}</span></div>` : ''}`;
    paramsEl.appendChild(sec);
    sliders[id] = { el: sec.querySelector('.slider'), val: sec.querySelector('.row span'), p };
  }
  const setSlider = (el, f) => { el.querySelector('.fl').style.width = `${f * 100}%`; el.querySelector('.th').style.left = `${f * 100}%`; };

  const lines = [];
  function trailLine(k, pts) {
    let l = lines[k];
    if (!l || l.userData.src !== pts) {
      if (l) { scene.remove(l); l.geometry.dispose(); }
      const g = new LineGeometry(); g.setPositions(pts.length >= 2 ? pts.flat() : [0, 0, 0, 0, 0, 0]);
      const m = new LineMaterial({ color: 0x3b3e52, linewidth: 1.5, dashed: true, dashSize: 0.009, gapSize: 0.007, transparent: true, opacity: 0.85, depthWrite: false });
      m.resolution.copy(lineRes);
      l = new Line2(g, m); l.computeLineDistances(); l.renderOrder = 3; l.userData.src = pts; l.userData.n = Math.max(1, pts.length - 1);
      scene.add(l); lines[k] = l;
    }
    return l;
  }

  // the panel covers the right of the frame, so the sandbox's hero view sits
  // a little further back and to the right, leaving the machine left of centre
  const base = machine.camera?.hero || {};
  const views = {
    hero: machine.camera?.sandbox || { ...base, dist: (base.dist ?? 1) * 1.1, targetShift: 0.14 },
    side: machine.camera?.side || { yaw: 0, pitch: 3, targetShift: 0.14, dist: (base.dist ?? 1) * 1.15 },
    top: machine.camera?.top || { yaw: 0, pitch: 70, targetShift: 0.14, dist: (base.dist ?? 1) * 1.1 },
  };
  const spec = (v, norm) => {
    const s = views[v]; if (!s.targetShift) return s;
    const b = norm.bounds; return { ...s, target: [(b.x0 + b.x1) / 2 + (b.x1 - b.x0) * s.targetShift, b.y1 * 0.42] };
  };
  function viewCamera(norm, from, to, u) {
    const a = shotFor(machine, norm, W, spec(from, norm)), b = shotFor(machine, norm, W, spec(to, norm)), e = smooth(clamp(u));
    camera.position.lerpVectors(a.p, b.p, e); camera.lookAt(new THREE.Vector3().lerpVectors(a.q, b.q, e));
    camera.fov = lerp(a.fov, b.fov, e); camera.updateProjectionMatrix(); camera.updateMatrixWorld();
  }

  // state: { params, poses, ids, trails (points), counts, stats, slow, trailsOn, sketch, view, prevView, viewU, panel, hint: {text,a,pressed}, pressed: Set }
  function apply(s) {
    const norm = normAt(s.params);
    viewCamera(norm, s.prevView, s.view, s.viewU);
    showMachine(W, true);
    const fake = s.poses ? { ids: s.ids, frames: [s.poses], hz: 1 } : null;
    poseMachine(W, { rest: norm, lift: null, bake: fake, t: 0 });
    setPaper(W, null, s.sketch); syncOutlines(W, true);
    lines.forEach((l) => (l.visible = false));
    if (s.trailsOn) s.trails.forEach((pts, k) => { const c = s.counts[k] || 0; if (c < 2) return; const l = trailLine(k, pts); l.visible = true; l.geometry.instanceCount = Math.min(l.userData.n, c - 1); });
    panel.style.opacity = s.panel; panel.style.transform = `translateX(${(1 - s.panel) * 24}px)`;
    s.stats.forEach((st, i) => { if (statCells[i]) statCells[i].textContent = st.value; });
    for (const [id, sl] of Object.entries(sliders)) {
      const v = s.params[id]; sl.val.textContent = `${sl.p.show ? sl.p.show(v) : v} ${sl.p.unit || ''}`.trim();
      setSlider(sl.el, (v - sl.p.min) / (sl.p.max - sl.p.min)); sl.el.classList.toggle('active', !!s.pressed?.has('param:' + id));
    }
    setSlider($('slSketch'), 1 - s.sketch);
    $('tSlow').classList.toggle('on', !!s.slow); $('tPath').classList.toggle('on', !!s.trailsOn);
    document.querySelectorAll('#views button').forEach((b) => { b.classList.toggle('on', b.dataset.v === s.view); b.classList.toggle('pressed', !!s.pressed?.has('view:' + b.dataset.v)); });
    for (const id of ['fire', 'tSlow', 'tPath', 'reset', 'replay']) $(id).classList.toggle('pressed', !!s.pressed?.has(id));
    hint.style.opacity = s.hint?.a || 0; hint.textContent = s.hint?.text || ''; hint.classList.toggle('pressed', !!s.hint?.pressed);
  }
  function hideAll() { panel.style.opacity = 0; hint.style.opacity = 0; lines.forEach((l) => (l.visible = false)); }

  const centre = (el, fx = 0.5, fy = 0.5) => { const r = el.getBoundingClientRect(); return [r.left + r.width * fx, r.top + r.height * fy]; };
  const targets = {
    run: () => centre($('fire')), reset: () => centre($('reset')), slowmo: () => centre($('tSlow'), 0.3), trails: () => centre($('tPath'), 0.3),
    view: (v) => centre(document.querySelector(`#views button[data-v="${v}"]`)),
    thumb: (el) => centre(el.querySelector('.th')), sketch: () => centre($('slSketch').querySelector('.th')),
    param: (id) => centre(sliders[id].el.querySelector('.th')),
  };
  return { apply, hideAll, targets, sliders, viewCamera };
}

// The cursor for a baked session, derived from the script: it travels to each
// control shortly before the action and follows slider thumbs while dragging.
export function sessionCursor(script, T) {
  const keys = [[-0.4, () => T.build()], [0, () => T.build()]];
  for (const s of script) {
    const where = s.do === 'run' ? T.run : s.do === 'reset' ? T.reset : s.do === 'slowmo' ? T.slowmo : s.do === 'trails' ? T.trails
      : s.do === 'view' ? () => T.view(s.view) : s.do === 'param' ? () => T.param(s.id) : s.do === 'sketch' ? T.sketch : null;
    if (!where) continue;
    keys.push([s.t - 0.7, where], [s.t, where]);
    if (s.dur) keys.push([s.t + s.dur, where]);
  }
  keys.sort((a, b) => a[0] - b[0]);
  return (b) => {
    let i = 0; while (i < keys.length - 1 && keys[i + 1][0] <= b) i++;
    const [t1, w1] = keys[i], [t2, w2] = keys[Math.min(i + 1, keys.length - 1)];
    const u = t2 > t1 ? smooth(clamp((b - t1) / (t2 - t1))) : 0, p1 = w1(), p2 = w2();
    return [lerp(p1[0], p2[0], u), lerp(p1[1], p2[1], u)];
  };
}
